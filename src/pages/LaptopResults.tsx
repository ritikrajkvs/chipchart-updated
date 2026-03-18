import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Monitor, HardDrive, Battery, Scale, Check, X,
  ExternalLink, ArrowLeft, RefreshCw, Zap, Star, ShoppingCart,
  Plus, TrendingDown, ChevronDown, ChevronUp, Tag, BarChart3, Brain, Search, Sparkles, Award
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { useQuestionnaireStore } from '@/store/questionnaireStore';
import {
  generateLaptopInsights,
  AnalysisInsight,
  LaptopRecommendation,
  LaptopStorePrice,
  formatFullName,
  formatDisplayName,
} from '@/lib/recommendationEngine';
import { fetchGeminiLaptops } from '@/lib/geminiApi';
import { useBucketStore } from '@/store/bucketStore';
import { cn } from '@/lib/utils';
import { apiCache } from '@/lib/apiCache';
import { fetchLiveAmazonPrice } from '@/lib/livePricingApi';

// ─── Store config ──────────────────────────────────────────
const STORE_STYLES: Record<string, { color: string; bg: string; border: string; hoverBg: string }> = {
  'Amazon':   { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/20', hoverBg: 'hover:bg-orange-50 dark:hover:bg-orange-500/10' },
  'Flipkart': { color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-500/10',     border: 'border-blue-200 dark:border-blue-500/20',     hoverBg: 'hover:bg-blue-50 dark:hover:bg-blue-500/10' },
};

// ─── Helpers ───────────────────────────────────────────────
function buildStoreUrl(store: string, searchQuery: string): string {
  const q = encodeURIComponent(searchQuery || '');
  switch (store) {
    case 'Amazon':   return `https://www.amazon.in/s?k=${q}&rh=n%3A1375424031`;
    case 'Flipkart': return `https://www.flipkart.com/search?q=${q}&otracker=search`;
    default:         return `https://www.amazon.in/s?k=${q}&rh=n%3A1375424031`;
  }
}

// ─── DealPanel (Flipkart inside here) ──────────────────────
interface DealPanelProps {
  storePrices: LaptopStorePrice[];
  lowestPrice?: number;
  basePrice: number;
  storeSearchQuery: string;
}

const DealPanel = ({ storePrices, lowestPrice, basePrice, storeSearchQuery }: DealPanelProps) => {
  const targetPrice = lowestPrice ?? Math.max(...storePrices.map(s => s.price), basePrice);

  const allStores = [...storePrices];
  if (!allStores.find(s => s.store === 'Flipkart')) {
    allStores.push({ store: 'Flipkart' as any, price: basePrice, inStock: true, url: buildStoreUrl('Flipkart', storeSearchQuery) });
  }

  const sorted = allStores
    .filter(s => s.store !== 'Vijay Sales')
    .sort((a, b) => {
      const aPRIO = a.store === 'Amazon' ? 2 : (a.store === 'Flipkart' ? 1 : 0);
      const bPRIO = b.store === 'Amazon' ? 2 : (b.store === 'Flipkart' ? 1 : 0);
      if (aPRIO !== bPRIO) return bPRIO - aPRIO;
      return a.price - b.price;
    });

  return (
    <div className="mt-3 rounded-xl border border-border bg-secondary/30 dark:bg-secondary/20 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-foreground/80">Price Comparison</span>
        </div>
        {targetPrice > 0 && (
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">from ₹{targetPrice.toLocaleString()}</span>
        )}
      </div>
      <div className="divide-y divide-border">
        {sorted.map((store) => {
          const style = STORE_STYLES[store.store] ?? STORE_STYLES['Amazon'];
          const href = buildStoreUrl(store.store, storeSearchQuery);
          const isFlipkart = store.store === 'Flipkart';
          return (
            <a
              key={store.store}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("flex items-center justify-between px-4 py-3 transition-all group cursor-pointer", style.hoverBg)}
            >
              <div className="flex items-center gap-2.5">
                <span className={cn('text-xs font-bold px-2.5 py-1 rounded-lg border', style.bg, style.color, style.border)}>
                  {store.store}
                </span>
                {!isFlipkart && store.price > 0 && (
                  <span className="text-sm font-semibold text-foreground">₹{store.price.toLocaleString()}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-semibold", isFlipkart ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {isFlipkart ? 'Check Live Price' : 'View on Amazon'}
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────
const LaptopResults = () => {
  const { answers, reset } = useQuestionnaireStore();
  const [recommendations, setRecommendations] = useState<LaptopRecommendation[]>([]);
  const [insights, setInsights] = useState<AnalysisInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDeals, setExpandedDeals] = useState<Set<string>>(new Set());
  const [expandedFps, setExpandedFps] = useState<Set<string>>(new Set());

  const { addItem } = useBucketStore();
  const hasFetched = useRef(false);

  // EARLY GUARD: if answers got wiped (refresh before persist hydrates), go back
  // This MUST be before the useEffect to prevent crashes
  const hasValidAnswers = !!answers.budget;

  useEffect(() => {
    if (hasFetched.current) return;
    if (!hasValidAnswers) return; // don't fetch if no answers
    hasFetched.current = true;

    async function fetchLaptops() {
      setLoading(true);
      setError(null);
      try {
        const cachedRecs = apiCache.get(answers);
        if (cachedRecs && cachedRecs.length > 0) {
          setRecommendations(cachedRecs);
          setInsights(generateLaptopInsights(cachedRecs, answers));
          if (cachedRecs[0]) setExpandedDeals(new Set([cachedRecs[0].laptop.id]));
          setLoading(false);
          return;
        }

        const budgetCeiling = Math.round((answers.budget || 100000) * 1.15);
        let validRecs: LaptopRecommendation[] = [];
        let attempts = 0;
        const maxAttempts = 3;

        while (validRecs.length < 3 && attempts < maxAttempts) {
          attempts++;
          const excluded = validRecs.map(r => r.laptop.model).join(', ');
          const answersForAI = attempts === 1 ? answers : { ...answers, _excludeModels: excluded } as any;
          let batch = await fetchGeminiLaptops(answersForAI);

          // Fetch live prices
          for (let i = 0; i < batch.length; i++) {
            const rec = batch[i];
            const liveData = await fetchLiveAmazonPrice(rec.laptop.searchQuery, rec.laptop.brand, rec.laptop.model, rec.laptop.price);
            if (liveData && liveData.price) {
              rec.laptop.lowestPrice = liveData.price;
              rec.laptop.storePrices = [{ store: 'Amazon', price: liveData.price, inStock: liveData.inStock, url: liveData.url }];
            } else {
              rec.laptop.storePrices = [];
              rec.laptop.lowestPrice = rec.laptop.price;
            }
            if (i < batch.length - 1) await new Promise(r => setTimeout(r, 1500));
          }

          // Budget filter
          const passed = batch.filter(rec => {
            const price = rec.laptop.lowestPrice ?? rec.laptop.price;
            if (price > budgetCeiling) {
              console.warn(`[Budget] Dropping "${rec.laptop.model}" — ₹${price} > ₹${budgetCeiling}`);
              return false;
            }
            return true;
          });

          validRecs.push(...passed);
          if (passed.length === batch.length) break; // no drops — done
        }

        // Take exactly 3 (or fewer if we exhausted attempts)
        const finalRecs = validRecs.slice(0, 3);
        apiCache.set(answers, finalRecs);

        setRecommendations(finalRecs);
        setInsights(generateLaptopInsights(finalRecs, answers));
        if (finalRecs[0]) setExpandedDeals(new Set([finalRecs[0].laptop.id]));
      } catch (err) {
        console.error("Failed to execute Gemini API", err);
        setError("Failed to generate Laptop recommendations. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    fetchLaptops();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidAnswers]);

  const toggleDeals = (id: string) => {
    setExpandedDeals(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleFps = (id: string) => {
    setExpandedFps(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const budgetCeiling = Math.round((answers.budget || 100000) * 1.15);
      let validNew: LaptopRecommendation[] = [];
      let attempts = 0;

      while (validNew.length < 3 && attempts < 3) {
        attempts++;
        const allExcluded = [...recommendations, ...validNew].map(r => r.laptop.model).join(', ');
        const answersWithExcludes = { ...answers, _excludeModels: allExcluded } as any;
        let batch = await fetchGeminiLaptops(answersWithExcludes);

        for (let i = 0; i < batch.length; i++) {
          const rec = batch[i];
          const liveData = await fetchLiveAmazonPrice(rec.laptop.searchQuery, rec.laptop.brand, rec.laptop.model, rec.laptop.price);
          if (liveData && liveData.price) {
            rec.laptop.lowestPrice = liveData.price;
            rec.laptop.storePrices = [{ store: 'Amazon', price: liveData.price, inStock: liveData.inStock, url: liveData.url }];
          } else {
            rec.laptop.storePrices = [];
            rec.laptop.lowestPrice = rec.laptop.price;
          }
          if (i < batch.length - 1) await new Promise(r => setTimeout(r, 1500));
        }

        const passed = batch.filter(rec => {
          const price = rec.laptop.lowestPrice ?? rec.laptop.price;
          if (price > budgetCeiling) return false;
          return true;
        });

        validNew.push(...passed);
        if (passed.length === batch.length) break;
      }

      const finalNew = validNew.slice(0, 3).map((rec, i) => ({
        ...rec,
        laptop: { ...rec.laptop, id: `laptop-${Date.now()}-${i}` }
      }));

      const merged = [...recommendations, ...finalNew];
      apiCache.set(answers, merged);
      setRecommendations(merged);
      setInsights(generateLaptopInsights(merged, answers));
    } catch (err) {
      console.error("Failed to load more laptops", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddLaptopToBucket = (laptop: any) => {
    addItem({ type: 'laptop', name: formatFullName(laptop.brand, laptop.model), price: laptop.lowestPrice ?? laptop.price, productData: laptop });
  };

  // ─── Loading ───────────────────────────────────────────
  if (!hasValidAnswers) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-5 max-w-md px-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
            <RefreshCw className="h-7 w-7 text-accent" />
          </div>
          <h2 className="text-2xl font-bold font-heading">Session Expired</h2>
          <p className="text-muted-foreground">Please complete the questionnaire again.</p>
          <Button variant="accent" asChild><Link to="/questionnaire">Start Questionnaire</Link></Button>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
            <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-accent animate-pulse" />
          </div>
          <div>
            <p className="text-lg font-heading font-semibold text-foreground">Finding your perfect laptop</p>
            <p className="text-sm text-muted-foreground mt-1">Comparing prices across Amazon & Flipkart...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (error || recommendations.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-5 max-w-md px-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <X className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold font-heading">Something went wrong</h2>
          <p className="text-muted-foreground">{error || "No recommendations found."}</p>
          <Button variant="outline" onClick={reset} asChild><Link to="/questionnaire"><RefreshCw className="h-4 w-4 mr-2" /> Try Again</Link></Button>
        </motion.div>
      </div>
    );
  }


  // ─── Main Render ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-20">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <Link to="/questionnaire" className="inline-flex items-center text-sm text-muted-foreground hover:text-accent transition-colors mb-4 group">
            <ArrowLeft className="h-4 w-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" /> Back to questionnaire
          </Link>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1 w-8 rounded-full bg-gradient-to-r from-accent to-violet-500" />
                <span className="text-xs font-semibold text-accent uppercase tracking-wider">AI-Powered Results</span>
              </div>
              <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Top Laptop Picks</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                ₹{answers.budget?.toLocaleString()} budget · {answers.purpose?.replace(/-/g, ' ')} · {recommendations.length} options
              </p>
            </div>
            <Button variant="outline" onClick={reset} asChild size="sm">
              <Link to="/questionnaire"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Start Over</Link>
            </Button>
          </div>
        </motion.div>

        {/* AI Analysis */}
        {insights.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border border-accent/20 dark:border-accent/15 bg-accent/3 dark:bg-accent/[0.04] mb-10 overflow-hidden"
          >
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 rounded-xl bg-accent/10 dark:bg-accent/15">
                  <Sparkles className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm">AI Analysis</h3>
                  <p className="text-xs text-muted-foreground">Updates as you load more options</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {insights.map((ins, i) => {
                  const colors: Record<typeof ins.type, { dot: string; label: string; bg: string }> = {
                    winner:  { dot: 'bg-amber-500 dark:bg-amber-400', label: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-400/5' },
                    deal:    { dot: 'bg-emerald-500 dark:bg-emerald-400', label: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-400/5' },
                    stat:    { dot: 'bg-blue-500 dark:bg-blue-400', label: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-400/5' },
                    tip:     { dot: 'bg-violet-500 dark:bg-violet-400', label: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-400/5' },
                    warning: { dot: 'bg-red-500 dark:bg-red-400', label: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-400/5' },
                  };
                  const c = colors[ins.type];
                  return (
                    <div key={i} className={cn("flex items-start gap-2.5 p-3 rounded-xl border border-border/50 dark:border-border", c.bg)}>
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${c.dot}`} />
                      <div className="min-w-0">
                        <span className={`text-xs font-bold ${c.label}`}>{ins.label}</span>
                        <p className="text-sm font-medium text-foreground mt-0.5 leading-snug">{ins.value}</p>
                        {ins.detail && <p className="text-xs text-muted-foreground mt-0.5">{ins.detail}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Laptop Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12 items-start">
          {recommendations.map((rec, index) => {
            const laptop = rec.laptop;
            const displayName = formatDisplayName(laptop.brand, laptop.model);
            const hasDeals = laptop.storePrices && laptop.storePrices.length > 0;
            const hasLivePrice = hasDeals && laptop.storePrices!.some(s => s.store === 'Amazon');
            const targetPrice = laptop.lowestPrice ?? (hasDeals ? Math.max(...laptop.storePrices!.map(s => s.price)) : laptop.price);
            const savings = laptop.price - targetPrice;
            const isExpanded = expandedDeals.has(laptop.id);
            const isFpsOpen = expandedFps.has(laptop.id);
            const isBestMatch = index === 0;

            return (
              <motion.div
                key={laptop.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.08, duration: 0.5 }}
                className={cn(
                  "group rounded-2xl border overflow-hidden relative flex flex-col transition-all duration-300",
                  isBestMatch
                    ? "border-accent/30 dark:border-accent/40 bg-card shadow-lg shadow-accent/5 dark:shadow-accent/10 hover:shadow-xl hover:shadow-accent/10"
                    : "border-border bg-card shadow-sm hover:shadow-md hover:border-accent/20 dark:hover:border-accent/30"
                )}
              >
                {/* Badge row */}
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                  {isBestMatch && (
                    <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-accent to-violet-500 text-white text-xs font-bold flex items-center gap-1 shadow-lg shadow-accent/20">
                      <Award className="h-3 w-3" /> Best Match
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-full bg-secondary/80 dark:bg-secondary/60 text-xs font-bold text-accent border border-border">
                    {rec.matchScore}%
                  </span>
                </div>

                {/* Visual header */}
                <div className={cn(
                  "h-32 flex items-center justify-center relative overflow-hidden",
                  isBestMatch
                    ? "bg-gradient-to-br from-accent/5 dark:from-accent/8 via-violet-500/3 dark:via-violet-500/4 to-transparent"
                    : "bg-secondary/30 dark:bg-secondary/20"
                )}>
                  <Monitor className="h-12 w-12 text-muted-foreground/15" />
                  {savings > 0 && (
                    <div className="absolute bottom-2.5 left-3 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/25 rounded-full px-2.5 py-1">
                      <Tag className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Save ₹{savings.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-5 flex-1 flex flex-col">
                  <span className="text-xs font-bold text-accent uppercase tracking-wider mb-1">{laptop.brand}</span>
                  <h3 className="font-heading text-base font-bold mb-3 pr-2 leading-snug">{displayName}</h3>

                  {/* Spec pills */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {[
                      { icon: <Cpu className="h-3 w-3" />, text: laptop.cpu },
                      { icon: <Monitor className="h-3 w-3" />, text: laptop.gpu },
                      { icon: <HardDrive className="h-3 w-3" />, text: `${laptop.ram} · ${laptop.storage}` },
                      { icon: <Battery className="h-3 w-3" />, text: laptop.battery },
                      { icon: <Scale className="h-3 w-3" />, text: laptop.weight },
                    ].map((spec, si) => (
                      <span key={si} className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/60 dark:bg-secondary/40 border border-border rounded-lg px-2 py-1">
                        {spec.icon}
                        <span className="truncate max-w-[140px]">{spec.text}</span>
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground/80 mb-3">{laptop.display}</p>

                  {/* Pros & Cons */}
                  <div className="space-y-1.5 mb-4">
                    {rec.pros.slice(0, 2).map((pro, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400 mt-0.5" />
                        <span className="text-foreground/80">{pro}</span>
                      </div>
                    ))}
                    {rec.cons.slice(0, 1).map((con, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                        <span className="text-muted-foreground">{con}</span>
                      </div>
                    ))}
                  </div>

                  {/* Price section */}
                  <div className="mt-auto pt-4 border-t border-border">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-2xl font-extrabold text-gradient">₹{targetPrice.toLocaleString()}</span>
                      {savings > 0 && (
                        <span className="text-xs text-muted-foreground line-through">₹{laptop.price.toLocaleString()}</span>
                      )}
                    </div>
                    <p className="text-xs mb-4 font-medium">
                      {hasLivePrice ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                          Live Amazon Price
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400/80">⚡ AI Estimated · Verify on store</span>
                      )}
                    </p>

                    {/* Action buttons */}
                    <div className="flex gap-2 mb-2 relative">
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-to-r from-accent to-violet-500 hover:from-accent/90 hover:to-violet-500/90 text-white border-0 shadow-lg shadow-accent/15 font-semibold"
                        onClick={() => handleAddLaptopToBucket(laptop)}
                      >
                        <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Add to Bucket
                      </Button>
                      {rec.fpsEstimates && rec.fpsEstimates.length > 0 && (
                        <Button variant="outline" size="sm"
                          className={cn("gap-1 transition-all px-2.5", isFpsOpen && "bg-accent/10 border-accent/30 text-accent")}
                          onClick={() => toggleFps(laptop.id)} title="FPS Estimates"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm"
                        className={cn("gap-1 transition-all", isExpanded && "bg-accent/10 border-accent/30 text-accent")}
                        onClick={() => toggleDeals(laptop.id)}
                      >
                        <TrendingDown className="h-3.5 w-3.5" /> Deals
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>

                      {/* FPS Popup */}
                      <AnimatePresence>
                        {isFpsOpen && rec.fpsEstimates && rec.fpsEstimates.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.18 }}
                            className="absolute bottom-full right-0 mb-2 w-60 z-30 rounded-xl border border-accent/20 bg-card shadow-2xl shadow-black/10 dark:shadow-black/40 p-4"
                          >
                            <div className="flex items-center gap-1.5 mb-3">
                              <BarChart3 className="h-3.5 w-3.5 text-accent" />
                              <span className="text-xs font-bold text-accent">FPS Estimates</span>
                              <span className="ml-auto text-xs text-muted-foreground">High preset</span>
                            </div>
                            <div className="space-y-2.5">
                              {rec.fpsEstimates.slice(0, 4).map((est) => (
                                <div key={est.game}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">{est.game}</span>
                                    <span className="font-bold text-accent">{est.fps.high} FPS</span>
                                  </div>
                                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full bg-gradient-to-r from-accent to-violet-500 rounded-full"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${Math.min(100, (est.fps.high / 300) * 100)}%` }}
                                      transition={{ duration: 0.6, delay: 0.1 }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="absolute bottom-[-6px] right-5 w-3 h-3 rotate-45 bg-card border-r border-b border-accent/20" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Deal panel */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                          <DealPanel storePrices={laptop.storePrices || []} lowestPrice={laptop.lowestPrice} basePrice={laptop.price}
                            storeSearchQuery={laptop.searchQuery || `${laptop.brand} ${displayName} ${laptop.cpu}`} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Comparison Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl border border-border bg-card overflow-hidden mb-10 shadow-sm"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-accent/10"><Brain className="h-4 w-4 text-accent" /></div>
            <h3 className="font-heading font-bold text-sm">Quick Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Spec</th>
                  {recommendations.map(rec => (
                    <th key={rec.laptop.id} className="p-4 text-left text-xs font-bold">
                      <span className="text-accent">{rec.laptop.brand}</span>{' '}
                      <span className="text-foreground">{formatDisplayName(rec.laptop.brand, rec.laptop.model)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: 'CPU', key: 'cpu', icon: <Cpu className="h-3 w-3" /> },
                  { label: 'GPU', key: 'gpu', icon: <Monitor className="h-3 w-3" /> },
                  { label: 'RAM', key: 'ram', icon: <HardDrive className="h-3 w-3" /> },
                  { label: 'Storage', key: 'storage', icon: <HardDrive className="h-3 w-3" /> },
                  { label: 'Display', key: 'display', icon: <Monitor className="h-3 w-3" /> },
                  { label: 'Battery', key: 'battery', icon: <Battery className="h-3 w-3" /> },
                  { label: 'Weight', key: 'weight', icon: <Scale className="h-3 w-3" /> },
                ].map(row => (
                  <tr key={row.key} className="hover:bg-secondary/30 dark:hover:bg-secondary/20 transition-colors">
                    <td className="p-4 text-xs font-medium text-muted-foreground flex items-center gap-1.5">{row.icon} {row.label}</td>
                    {recommendations.map(rec => (
                      <td key={rec.laptop.id} className="p-4 text-xs text-foreground/80">{String(rec.laptop[row.key as keyof typeof rec.laptop] ?? '-')}</td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-accent/3 dark:bg-accent/5">
                  <td className="p-4 text-xs font-bold text-accent flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> AI Summary</td>
                  {recommendations.map(rec => (
                    <td key={rec.laptop.id} className="p-4 text-xs text-muted-foreground leading-relaxed italic border-l border-border/50">
                      &ldquo;{rec.pros.slice(0, 2).join(" & ")}&rdquo;
                    </td>
                  ))}
                </tr>
                <tr className="bg-emerald-50/50 dark:bg-emerald-500/[0.03]">
                  <td className="p-4 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><TrendingDown className="h-3 w-3" /> Best Price</td>
                  {recommendations.map(rec => {
                    const tp = rec.laptop.lowestPrice ?? (rec.laptop.storePrices ? Math.max(...rec.laptop.storePrices.map(s => s.price)) : rec.laptop.price);
                    return <td key={rec.laptop.id} className="p-4"><p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{tp.toLocaleString()}</p></td>;
                  })}
                </tr>
                <tr className="bg-accent/3 dark:bg-accent/[0.02]">
                  <td className="p-4 text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Star className="h-3 w-3 text-accent" /> Match</td>
                  {recommendations.map(rec => (
                    <td key={rec.laptop.id} className="p-4"><span className="text-base font-extrabold text-gradient">{rec.matchScore}%</span></td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Load More */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex justify-center">
          <Button variant="outline" size="lg" onClick={handleLoadMore} disabled={loadingMore} className="w-full max-w-sm hover:border-accent/30 hover:bg-accent/5 transition-all">
            {loadingMore ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-transparent border-t-current mr-2" /> Finding more...</>) : (<><Plus className="h-4 w-4 mr-2" /> Load More Options</>)}
          </Button>
        </motion.div>

      </main>
      <Footer />
    </div>
  );
};

export default LaptopResults;
