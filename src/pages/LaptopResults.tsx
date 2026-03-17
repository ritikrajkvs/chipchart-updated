import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Monitor, HardDrive, Battery, Scale, Check, X,
  ExternalLink, ArrowLeft, RefreshCw, Zap, Star, ShoppingCart,
  Plus, TrendingDown, ChevronDown, ChevronUp, Tag, AlertCircle, BarChart3, Brain
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
} from '@/lib/recommendationEngine';
import { fetchGeminiLaptops } from '@/lib/geminiApi';
import { useBucketStore } from '@/store/bucketStore';
import { cn } from '@/lib/utils';

// Store brand colors / logos (text fallback)
const STORE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  'Amazon':          { color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  'Flipkart':        { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'   },
  'Croma':           { color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30'  },
  'Reliance Digital':{ color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30'    },
};

interface DealPanelProps {
  storePrices: LaptopStorePrice[];
  lowestPrice?: number;
  basePrice: number;
  storeSearchQuery: string;
}

// Build reliable store search URLs with the AI generated optimal query
function buildStoreUrl(store: string, searchQuery: string): string {
  const q = encodeURIComponent(searchQuery || '');
  switch (store) {
    case 'Amazon':          return `https://www.amazon.in/s?k=${q}&rh=n%3A1375424031`; // laptops category
    case 'Flipkart':        return `https://www.flipkart.com/search?q=${q}&otracker=search`;
    case 'Croma':           return `https://www.croma.com/search/?q=${q}%3Arelevance`;
    case 'Reliance Digital':return `https://www.reliancedigital.in/search?q=${q}`;
    default:                return `https://www.amazon.in/s?k=${q}&rh=n%3A1375424031`;
  }
}

const DealPanel = ({ storePrices, lowestPrice, basePrice, storeSearchQuery }: DealPanelProps) => {
  const targetPrice = lowestPrice ?? Math.max(...storePrices.map(s => s.price));
  
  // Prioritize Amazon and Flipkart, then sort the rest by price
  const sorted = [...storePrices]
    .filter(s => s.store !== 'Vijay Sales')
    .sort((a, b) => {
      const aPRIO = a.store === 'Amazon' || a.store === 'Flipkart' ? 1 : 0;
      const bPRIO = b.store === 'Amazon' || b.store === 'Flipkart' ? 1 : 0;
      if (aPRIO !== bPRIO) return bPRIO - aPRIO; // Higher priority first
      return b.price - a.price;
    });

  return (
    <div className="mt-3 rounded-xl border border-border bg-secondary/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400">Best Deal</span>
          <span className="text-xs font-bold text-emerald-300">₹{targetPrice.toLocaleString()}</span>
        </div>
        {targetPrice < basePrice && (
          <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 font-semibold">
            Save ₹{(basePrice - targetPrice).toLocaleString()}
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {sorted.map((store) => {
          const style = STORE_STYLES[store.store] ?? STORE_STYLES['Amazon'];
          const isTarget = store.price === targetPrice;
          // Use the optimized search query to guarantee results
          const href = buildStoreUrl(store.store, storeSearchQuery);
          return (
            <a
              key={store.store}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center justify-between px-3 py-2.5 transition-colors group',
                store.inStock
                  ? 'hover:bg-secondary/60 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed pointer-events-none'
              )}
              onClick={(e) => !store.inStock && e.preventDefault()}
            >
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border', style.bg, style.color, style.border)}>
                  {store.store}
                </span>
                {!store.inStock && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3" /> Out of stock
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-bold', isTarget ? 'text-emerald-400' : '')}>
                  ₹{store.price.toLocaleString()}
                </span>
                {isTarget && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 rounded px-1 py-0.5 font-semibold">Lowest</span>
                )}
                {store.inStock && (
                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

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

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    async function fetchLaptops() {
      setLoading(true);
      setError(null);
      try {
        const recs = await fetchGeminiLaptops(answers);
        setRecommendations(recs);
        setInsights(generateLaptopInsights(recs, answers));
        // Auto-expand deals panel for the top pick
        if (recs[0]) setExpandedDeals(new Set([recs[0].laptop.id]));
      } catch (err) {
        console.error("Failed to execute Gemini API", err);
        setError("Failed to generate Laptop recommendations. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    fetchLaptops();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extractMpn = (name: string) => {
    const match = name.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  };

  const formatDisplayName = (brand: string, name: string) => {
    if (!name || !brand) return name;
    // Remove MPN in parentheses for clean display
    let cleanName = name.replace(/\([^)]+\)/g, '').trim();
    const brandRegex = new RegExp(`^${brand}\\s+`, 'i');
    if (brandRegex.test(cleanName)) return cleanName.replace(brandRegex, '').trim();
    return cleanName;
  };

  const toggleDeals = (id: string) => {
    setExpandedDeals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFps = (id: string) => {
    setExpandedFps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const existingModels = recommendations.map(r => r.laptop.model).join(', ');
      const answersWithExcludes = { ...answers, _excludeModels: existingModels } as any;
      const newRecs = await fetchGeminiLaptops(answersWithExcludes);
      const merged = [...recommendations, ...newRecs];
      setRecommendations(merged);
      setInsights(generateLaptopInsights(merged, answers));
    } catch (err) {
      console.error("Failed to load more laptops", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const getAmazonSearchUrl = (productName: string) =>
    `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`;

  const handleAddLaptopToBucket = (laptop: any) => {
    const cleanModel = formatDisplayName(laptop.brand, laptop.model);
    addItem({
      type: 'laptop',
      name: `${laptop.brand} ${cleanModel}`,
      price: laptop.lowestPrice ?? laptop.price,
      productData: laptop
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent mx-auto" />
          <p className="text-muted-foreground">Hunting the best deals for you...</p>
          <p className="text-xs text-muted-foreground/60">Checking Amazon · Flipkart · Croma · Reliance Digital · Vijay Sales</p>
        </div>
      </div>
    );
  }

  if (error || recommendations.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <X className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold font-heading">Something went wrong</h2>
          <p className="text-muted-foreground max-w-md">{error || "No recommendations found."}</p>
          <Button variant="outline" onClick={reset} asChild>
            <Link to="/questionnaire"><RefreshCw className="h-4 w-4 mr-2" /> Try Again</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Guard: if answers got wiped (e.g. hard refresh before persist loads) send back to questionnaire
  if (!answers.budget) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="h-10 w-10 text-accent mx-auto mb-4" />
          <h2 className="text-2xl font-bold font-heading">Session Expired</h2>
          <p className="text-muted-foreground max-w-md">Please complete the questionnaire again to get recommendations.</p>
          <Button variant="accent" asChild>
            <Link to="/questionnaire">Start Questionnaire</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-16">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <Link to="/questionnaire" className="inline-flex items-center text-sm text-muted-foreground hover:text-accent mb-2">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to questionnaire
              </Link>
              <h1 className="font-heading text-3xl font-bold">Top Laptop Deals</h1>
              <p className="text-muted-foreground mt-1">
                ₹{answers.budget?.toLocaleString()} budget · {answers.purpose} · Prices from 5 stores
              </p>
            </div>
            <Button variant="outline" onClick={reset} asChild>
              <Link to="/questionnaire"><RefreshCw className="h-4 w-4 mr-2" /> Start Over</Link>
            </Button>
          </div>
        </motion.div>

        {/* Store legend */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex flex-wrap gap-2 mb-6"
        >
          {Object.entries(STORE_STYLES).map(([store, style]) => (
            <span key={store} className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', style.bg, style.color, style.border)}>
              {store}
            </span>
          ))}
          <span className="text-xs text-muted-foreground self-center ml-1">— compare prices across all stores</span>
        </motion.div>

        {/* AI Analysis — single card with bullet points, updates on Load More */}
        {insights.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 via-violet-500/5 to-card mb-8 overflow-hidden"
          >
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-accent/15">
                  <Zap className="h-4 w-4 text-accent" />
                </div>
                <h3 className="font-heading font-semibold text-sm text-accent">AI Analysis</h3>
                <span className="text-xs text-muted-foreground ml-1">— refreshes as you load more options</span>
              </div>
            <ul className="space-y-2.5">
              {insights.map((ins, i) => {
                const dotColors: Record<typeof ins.type, string> = {
                  winner: 'bg-amber-400',
                  deal:   'bg-emerald-400',
                  stat:   'bg-blue-400',
                  tip:    'bg-violet-400',
                  warning:'bg-red-400',
                };
                const labelColors: Record<typeof ins.type, string> = {
                  winner: 'text-amber-400',
                  deal:   'text-emerald-400',
                  stat:   'text-blue-400',
                  tip:    'text-violet-400',
                  warning:'text-red-400',
                };
                return (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColors[ins.type]}`} />
                    <div>
                      <span className={`text-xs font-semibold ${labelColors[ins.type]}`}>{ins.label}: </span>
                      <span className="text-sm font-medium text-foreground">{ins.value}</span>
                      {ins.detail && <span className="text-xs text-muted-foreground"> — {ins.detail}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            </div>
          </motion.div>
        )}

        {/* Laptop Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10 items-start">
          {recommendations.map((rec, index) => {
            const laptop = rec.laptop;
            const mpn = extractMpn(laptop.model);
            const displayName = formatDisplayName(laptop.brand, laptop.model);
            const hasDeals = laptop.storePrices && laptop.storePrices.length > 0;
            const targetPrice = laptop.lowestPrice ?? (hasDeals ? Math.max(...laptop.storePrices!.map(s => s.price)) : laptop.price);
            const savings = laptop.price - targetPrice;
            const isExpanded = expandedDeals.has(laptop.id);
            const isFpsOpen = expandedFps.has(laptop.id);
            const isBestMatch = index === 0;

            return (
              <motion.div
                key={laptop.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className={cn(
                  "rounded-2xl border bg-card overflow-hidden relative flex flex-col",
                  isBestMatch ? "border-accent shadow-lg shadow-accent/10" : "border-border"
                )}
              >
                {/* Best match badge */}
                {isBestMatch && (
                  <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold flex items-center gap-1">
                    <Star className="h-3 w-3" /> Best Match
                  </div>
                )}

                {/* Image area */}
                <div className={cn(
                  "h-36 flex items-center justify-center relative",
                  isBestMatch ? "bg-accent/5" : "bg-secondary/50"
                )}>
                  <Monitor className="h-14 w-14 text-muted-foreground/20" />
                  {savings > 0 && (
                    <div className="absolute bottom-2 left-3 flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">
                      <Tag className="h-3 w-3 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400">Save ₹{savings.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <p className="text-xs text-accent font-medium">{laptop.brand}</p>
                  <h3 className="font-heading text-base font-bold mb-2 pr-2">{displayName}</h3>

                  {/* Specs grid */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs mb-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Cpu className="h-3 w-3 shrink-0" /><span className="truncate">{laptop.cpu}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Monitor className="h-3 w-3 shrink-0" /><span className="truncate">{laptop.gpu}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <HardDrive className="h-3 w-3 shrink-0" /><span>{laptop.ram} / {laptop.storage}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Battery className="h-3 w-3 shrink-0" /><span>{laptop.battery}</span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-1">{laptop.display}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                    <Scale className="h-3 w-3" /> {laptop.weight}
                  </p>

                  {/* Pros & Cons */}
                  <div className="space-y-1 mb-3">
                    {rec.pros.slice(0, 2).map((pro, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-green-500">
                        <Check className="h-3.5 w-3.5 shrink-0" /> {pro}
                      </div>
                    ))}
                    {rec.cons.slice(0, 1).map((con, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <X className="h-3.5 w-3.5 shrink-0" /> {con}
                      </div>
                    ))}
                  </div>

                  {/* Price section */}
                  <div className="mt-auto pt-3 border-t border-border">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xl font-extrabold text-emerald-400">₹{targetPrice.toLocaleString()}</span>
                      {savings > 0 && (
                        <span className="text-sm text-muted-foreground line-through">₹{laptop.price.toLocaleString()}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 font-medium">
                      {hasDeals ? `Best price across ${laptop.storePrices!.filter(s => s.inStock).length} stores` : 'AI Estimated Price (Verify on store)'}
                    </p>

                    {/* Action row */}
                    <div className="flex gap-2 mb-2 relative">
                      <Button variant="accent" size="sm" className="flex-1" onClick={() => handleAddLaptopToBucket(laptop)}>
                        <ShoppingCart className="h-4 w-4 mr-1" /> Add to Bucket
                      </Button>
                      {rec.fpsEstimates && rec.fpsEstimates.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "gap-1 transition-colors px-2.5",
                            isFpsOpen && "bg-accent/10 border-accent/40 text-accent"
                          )}
                          onClick={() => toggleFps(laptop.id)}
                          title="FPS Estimates"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "gap-1 transition-colors",
                          isExpanded && "bg-accent/10 border-accent/40"
                        )}
                        onClick={() => toggleDeals(laptop.id)}
                        disabled={!hasDeals}
                      >
                        <TrendingDown className="h-4 w-4" />
                        Deals
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>

                      {/* FPS Floating Popup */}
                      <AnimatePresence>
                        {isFpsOpen && rec.fpsEstimates && rec.fpsEstimates.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.18 }}
                            className="absolute bottom-full right-0 mb-2 w-56 z-30 rounded-xl border border-accent/30 bg-card shadow-xl shadow-black/40 p-3"
                          >
                            <div className="flex items-center gap-1.5 mb-2.5">
                              <BarChart3 className="h-3.5 w-3.5 text-accent" />
                              <span className="text-xs font-bold text-accent">FPS Estimates</span>
                              <span className="ml-auto text-xs text-muted-foreground">High preset</span>
                            </div>
                            <div className="space-y-2">
                              {rec.fpsEstimates.slice(0, 4).map((est) => (
                                <div key={est.game}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">{est.game}</span>
                                    <span className="font-semibold text-accent">{est.fps.high} FPS</span>
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
                            {/* Tail arrow */}
                            <div className="absolute bottom-[-6px] right-5 w-3 h-3 rotate-45 bg-card border-r border-b border-accent/30" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Deal comparison panel */}
                    <AnimatePresence>
                      {isExpanded && hasDeals && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                        >
                          <DealPanel
                            storePrices={laptop.storePrices!}
                            lowestPrice={laptop.lowestPrice}
                            basePrice={laptop.price}
                            storeSearchQuery={laptop.searchQuery || `${laptop.brand} ${displayName} ${laptop.cpu}`}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Quick Comparison Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="rounded-2xl border border-border bg-card overflow-hidden mb-8"
        >
          <div className="p-4 border-b border-border flex items-center gap-2">
            <h3 className="font-heading font-bold">Quick Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Feature</th>
                  {recommendations.map((rec) => (
                    <th key={rec.laptop.id} className="p-3 text-left text-xs font-semibold">
                      {rec.laptop.brand} {formatDisplayName(rec.laptop.brand, rec.laptop.model)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: 'CPU', key: 'cpu' },
                  { label: 'GPU', key: 'gpu' },
                  { label: 'RAM', key: 'ram' },
                  { label: 'Storage', key: 'storage' },
                  { label: 'Display', key: 'display' },
                  { label: 'Battery', key: 'battery' },
                  { label: 'Weight', key: 'weight' },
                ].map((row) => (
                  <tr key={row.key} className="hover:bg-secondary/50 transition-colors">
                    <td className="p-3 text-xs font-medium text-muted-foreground">{row.label}</td>
                    {recommendations.map((rec) => (
                      <td key={rec.laptop.id} className="p-3 text-xs">
                        {String(rec.laptop[row.key as keyof typeof rec.laptop] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* AI Review Summary row */}
                <tr className="bg-accent/5">
                  <td className="p-3 text-xs font-medium text-accent flex items-center gap-1">
                    <Brain className="h-3 w-3" /> AI Summary
                  </td>
                  {recommendations.map((rec) => (
                    <td key={rec.laptop.id} className="p-3 text-xs text-muted-foreground leading-relaxed italic border-l border-border/50">
                      "{rec.pros.slice(0, 2).join(" & ")}"
                    </td>
                  ))}
                </tr>
                {/* Best price row */}
                <tr className="bg-emerald-500/5">
                  <td className="p-3 text-xs font-medium text-emerald-400 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> Best Price
                  </td>
                  {recommendations.map((rec) => {
                    const targetPrice = rec.laptop.lowestPrice ??
                      (rec.laptop.storePrices ? Math.max(...rec.laptop.storePrices.map(s => s.price)) : rec.laptop.price);
                    const targetStore = rec.laptop.storePrices?.find(s => s.price === targetPrice);
                    return (
                      <td key={rec.laptop.id} className="p-3">
                        <p className="text-sm font-bold text-emerald-400">₹{targetPrice.toLocaleString()}</p>
                        {targetStore && (
                          <p className="text-xs text-muted-foreground mt-0.5">{targetStore.store}</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-secondary/30">
                  <td className="p-3 text-xs font-medium text-muted-foreground">Match Score</td>
                  {recommendations.map((rec) => (
                    <td key={rec.laptop.id} className="p-3">
                      <span className="text-base font-bold text-accent">{rec.matchScore}%</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Load More */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full max-w-sm"
          >
            {loadingMore ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current mr-2" /> Loading...</>
            ) : (
              <><Plus className="h-4 w-4 mr-2" /> Load More Options</>
            )}
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default LaptopResults;
