import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Check, X, Cpu, MonitorSmartphone, HardDrive,
  Zap, Box, CircuitBoard, Fan, ShoppingCart, ExternalLink,
  Gauge, BarChart3, ArrowLeft, RefreshCw, Plus,
  Flame, Coins, Package
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { useQuestionnaireStore } from '@/store/questionnaireStore';
import {
  generatePCInsights,
  AnalysisInsight,
  PCBuild,
} from '@/lib/recommendationEngine';
import { fetchGeminiPCBuilds } from '@/lib/geminiApi';
import { useBucketStore, BucketItemType } from '@/store/bucketStore';
import { cn } from '@/lib/utils';
import { pcCache } from '@/lib/apiCache';
import { fetchPrebuiltPCPrice } from '@/lib/livePricingApi';



const categoryIcons: Record<string, typeof Cpu> = {
  CPU: Cpu, GPU: MonitorSmartphone, RAM: CircuitBoard, SSD: HardDrive,
  PSU: Zap, CASE: Box, MOBO: CircuitBoard, COOLER: Fan,
};

// Build reliable store URLs — never trust AI-generated URLs
function buildStoreUrl(store: string, productName: string): string {
  const q = encodeURIComponent(productName);
  switch (store) {
    case 'Amazon':           return `https://www.amazon.in/s?k=${q}`;
    case 'Flipkart':         return `https://www.flipkart.com/search?q=${q}&otracker=search`;
    case 'Croma':            return `https://www.croma.com/search/?q=${q}%3Arelevance`;
    case 'Reliance Digital': return `https://www.reliancedigital.in/search?q=${q}`;
    case 'MD Computers':     return `https://www.mdcomputers.in/index.php?route=product/search&search=${q}`;
    case 'PrimeABGB':        return `https://www.primeabgb.com/search/?q=${q}`;
    default:                 return `https://www.amazon.in/s?k=${q}`;
  }
}

const PCResults = () => {
  const { answers, reset } = useQuestionnaireStore();
  const [builds, setBuilds] = useState<PCBuild[]>([]);
  const [insights, setInsights] = useState<AnalysisInsight[]>([]);
  const [selectedBuild, setSelectedBuild] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { addItem } = useBucketStore();

  const hasFetched = useRef(false);

  // EARLY GUARD: prevent crashes on refresh before Zustand hydrates
  const hasValidAnswers = !!answers.budget;

  useEffect(() => {
    if (hasFetched.current) return;
    if (!hasValidAnswers) return;
    hasFetched.current = true;

    async function fetchBuilds() {
      setLoading(true);
      setError(null);
      try {
        // 1. Check 7-day cache
        const cachedRecs = pcCache.get(answers);
        if (cachedRecs) {
          console.log("Serving PC builds from 7-day cache!");
          setBuilds(cachedRecs);
          setInsights(generatePCInsights(cachedRecs, answers));
          setLoading(false);
          return;
        }

        // 2. Fetch from Gemini
        let recommendations = await fetchGeminiPCBuilds(answers);

        // 3. Fetch live prebuilt prices
        for (const build of recommendations) {
          if (build.type === 'prebuilt') {
            const prebuiltName = (build as any).prebuiltModel || build.name;
            const livePrice = await fetchPrebuiltPCPrice(prebuiltName, build.totalPrice);
            if (livePrice && livePrice.price) {
              (build as any).livePrebuiltPrice = livePrice.price;
              (build as any).livePrebuiltUrl = livePrice.url;
              (build as any).livePrebuiltInStock = livePrice.inStock;
            }
          }
        }

        // 4. Budget filter: drop builds exceeding 115% of budget
        const budgetCeiling = Math.round((answers.budget || 100000) * 1.15);
        recommendations = recommendations.filter(b => {
          const price = (b as any).livePrebuiltPrice ?? b.totalPrice;
          if (price > budgetCeiling) {
            console.warn(`[PC Budget Filter] Dropping "${b.name}" — ₹${price} exceeds ₹${budgetCeiling}`);
            return false;
          }
          return true;
        });

        // 5. GUARANTEE ONE PREBUILT
        let hasPrebuilt = recommendations.some(b => b.type === 'prebuilt');
        let prebuiltAttempts = 0;

        while (!hasPrebuilt && prebuiltAttempts < 3) {
          prebuiltAttempts++;
          console.log(`[PC] Missing valid prebuilt. Fetching replacement (Attempt ${prebuiltAttempts})...`);
          const excludeNames = recommendations.map(b => b.name).join(', ');
          const retry = await fetchGeminiPCBuilds({ ...answers, _excludeNames: excludeNames } as any);
          
          for (const build of retry) {
            if (build.type === 'prebuilt' && !hasPrebuilt) {
              const prebuiltName = (build as any).prebuiltModel || build.name;
              const livePrice = await fetchPrebuiltPCPrice(prebuiltName, build.totalPrice);
              if (livePrice?.price) {
                (build as any).livePrebuiltPrice = livePrice.price;
                (build as any).livePrebuiltUrl = livePrice.url;
              }
              const price = (build as any).livePrebuiltPrice ?? build.totalPrice;
              if (price <= budgetCeiling) {
                recommendations.push(build);
                hasPrebuilt = true; // Secured a prebuilt!
              }
            } else if (recommendations.length < 3) {
                // If we also need custom builds to fill exactly 3 spots
                const price = build.totalPrice;
                if(price <= budgetCeiling) recommendations.push(build);
            }
          }
        }

        // 6. If we still need custom builds to reach 3 total (rare)
        if (recommendations.length < 3) {
           let attempts = 0;
           while(recommendations.length < 3 && attempts < 2) {
              attempts++;
              const excludeNames = recommendations.map(b => b.name).join(', ');
              const retry = await fetchGeminiPCBuilds({ ...answers, _excludeNames: excludeNames } as any);
              for (const build of retry) {
                  if (build.type !== 'prebuilt') {
                      const price = build.totalPrice;
                      if (price <= budgetCeiling && recommendations.length < 3) {
                          recommendations.push(build);
                      }
                  }
              }
           }
        }

        // 7. Save to 7-day cache
        pcCache.set(answers, recommendations);

        setBuilds(recommendations);
        setInsights(generatePCInsights(recommendations, answers));
      } catch (err) {
        console.error("Failed to execute Gemini API", err);
        setError("Failed to generate PC recommendations. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    fetchBuilds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidAnswers]);

  // Session guard — render BEFORE loading check
  if (!hasValidAnswers) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
            <Cpu className="absolute inset-0 m-auto h-6 w-6 text-accent animate-pulse" />
          </div>
          <div>
            <p className="text-lg font-heading font-semibold text-foreground">Building your perfect PC</p>
            <p className="text-sm text-muted-foreground mt-1">AI is selecting optimal components...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (error || builds.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-5 max-w-md px-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <X className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold font-heading">Something went wrong</h2>
          <p className="text-muted-foreground">{error || "No recommendations found."}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => { hasFetched.current = false; setError(null); setLoading(true); window.location.reload(); }}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
            <Button variant="outline" onClick={reset} asChild>
              <Link to="/questionnaire">Start Over</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }


  // Helper to fix LLM occasionally prefixing the name with the brand when we already display the brand
  const formatDisplayName = (brand: string, name: string) => {
    if (!name || !brand) return name;
    // Check if the name starts with the brand name (case-insensitive)
    const brandRegex = new RegExp(`^${brand}\\s+`, 'i');
    if (brandRegex.test(name)) {
      return name.replace(brandRegex, '').trim();
    }
    return name;
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const budgetCeiling = Math.round((answers.budget || 100000) * 1.15);
      const existingNames = builds.map(b => b.name).join(', ');
      const answersWithExcludes = { ...answers, _excludeNames: existingNames } as any;
      let newBuilds = await fetchGeminiPCBuilds(answersWithExcludes);

      // Fetch live prebuilt prices
      for (const build of newBuilds) {
        if (build.type === 'prebuilt') {
          const prebuiltName = (build as any).prebuiltModel || build.name;
          const livePrice = await fetchPrebuiltPCPrice(prebuiltName, build.totalPrice);
          if (livePrice?.price) {
            (build as any).livePrebuiltPrice = livePrice.price;
            (build as any).livePrebuiltUrl = livePrice.url;
          }
        }
      }

      // Budget filter
      newBuilds = newBuilds.filter(b => {
        const price = (b as any).livePrebuiltPrice ?? b.totalPrice;
        if (price > budgetCeiling) {
          console.warn(`[PC Budget Filter - Load More] Dropping "${b.name}" — ₹${price}`);
          return false;
        }
        return true;
      });

      // GUARANTEE ONE PREBUILT IN LOAD MORE
      let hasPrebuilt = newBuilds.some(b => b.type === 'prebuilt');
      let prebuiltAttempts = 0;

      while (!hasPrebuilt && prebuiltAttempts < 3) {
        prebuiltAttempts++;
        console.log(`[PC] Load More missing valid prebuilt. Fetching replacement (Attempt ${prebuiltAttempts})...`);
        const excludeNames = [...builds, ...newBuilds].map(b => b.name).join(', ');
        const retry = await fetchGeminiPCBuilds({ ...answers, _excludeNames: excludeNames } as any);
        
        for (const build of retry) {
          if (build.type === 'prebuilt' && !hasPrebuilt) {
            const prebuiltName = (build as any).prebuiltModel || build.name;
            const livePrice = await fetchPrebuiltPCPrice(prebuiltName, build.totalPrice);
            if (livePrice?.price) {
              (build as any).livePrebuiltPrice = livePrice.price;
              (build as any).livePrebuiltUrl = livePrice.url;
            }
            const price = (build as any).livePrebuiltPrice ?? build.totalPrice;
            if (price <= budgetCeiling) {
              newBuilds.push(build);
              hasPrebuilt = true;
            }
          } else if (newBuilds.length < 3) {
             const price = build.totalPrice;
             if(price <= budgetCeiling) newBuilds.push(build);
          }
        }
      }

      const merged = [...builds, ...newBuilds];
      pcCache.set(answers, merged);
      setBuilds(merged);
      setInsights(generatePCInsights(merged, answers));
    } catch (err) {
      console.error("Failed to load more builds", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Clamp selectedBuild to valid range (important after Load More)
  const safeBuildIndex = Math.min(selectedBuild, builds.length - 1);
  const currentBuild = builds[safeBuildIndex];
  if (!currentBuild) return null;

  const getAmazonSearchUrl = (productName: string) => {
    return `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`;
  };

  const handleAddComponent = (component: any) => {
    const cleanName = formatDisplayName(component.brand, component.name);
    addItem({
      type: 'component',
      name: `${component.brand} ${cleanName}`,
      price: component.price,
      productData: component
    });
  };

  const handleAddBuildToBucket = () => {
    if (!currentBuild) return;
    
    if (currentBuild.type === 'prebuilt') {
      addItem({
        type: 'prebuilt',
        name: (currentBuild as any).prebuiltModel || currentBuild.name,
        price: (currentBuild as any).livePrebuiltPrice || currentBuild.totalPrice,
        productData: currentBuild.components
      });
    } else {
      // Add all individual components of the custom build
      Object.values(currentBuild.components).forEach(comp => handleAddComponent(comp));
      useBucketStore.getState().setIsOpen(true);
    }
  };

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
              <h1 className="font-heading text-3xl font-bold">Your PC Builds</h1>
              <p className="text-muted-foreground mt-1">
                ₹{answers.budget?.toLocaleString()} budget · {answers.purpose}
              </p>
            </div>
            <Button variant="outline" onClick={reset} asChild>
              <Link to="/questionnaire"><RefreshCw className="h-4 w-4 mr-2" /> Start Over</Link>
            </Button>
          </div>
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
                    deal: 'bg-emerald-400',
                    stat: 'bg-blue-400',
                    tip: 'bg-violet-400',
                    warning: 'bg-red-400',
                  };
                  const labelColors: Record<typeof ins.type, string> = {
                    winner: 'text-amber-400',
                    deal: 'text-emerald-400',
                    stat: 'text-blue-400',
                    tip: 'text-violet-400',
                    warning: 'text-red-400',
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

        {/* Build Selector */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          {builds.map((build, index) => {
            const isSelected = selectedBuild === index;

            const typeConfig = {
              performance: {
                label: 'Top Performance',
                icon: <Flame className="h-5 w-5" />,
                gradient: 'from-blue-600 via-violet-600 to-blue-700',
                glow: 'shadow-blue-500/40',
                badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
                bar: 'bg-gradient-to-r from-blue-500 to-violet-500',
                ring: 'ring-blue-500/60',
                dot: 'bg-blue-400',
                selectedBg: 'bg-gradient-to-br from-blue-600/10 via-violet-600/5 to-transparent',
                border: 'border-blue-500/60',
              },
              value: {
                label: 'Best Value',
                icon: <Coins className="h-5 w-5" />,
                gradient: 'from-emerald-600 via-teal-500 to-emerald-700',
                glow: 'shadow-emerald-500/40',
                badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
                ring: 'ring-emerald-500/60',
                dot: 'bg-emerald-400',
                selectedBg: 'bg-gradient-to-br from-emerald-600/10 via-teal-500/5 to-transparent',
                border: 'border-emerald-500/60',
              },
              prebuilt: {
                label: 'Pre-Built PC',
                icon: <Package className="h-5 w-5" />,
                gradient: 'from-purple-600 via-pink-600 to-purple-700',
                glow: 'shadow-purple-500/40',
                badge: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
                bar: 'bg-gradient-to-r from-purple-500 to-pink-500',
                ring: 'ring-purple-500/60',
                dot: 'bg-purple-400',
                selectedBg: 'bg-gradient-to-br from-purple-600/10 via-pink-600/5 to-transparent',
                border: 'border-purple-500/60',
              },
            } as const;

            const cfg = typeConfig[build.type as keyof typeof typeConfig] ?? typeConfig.performance;

            return (
              <button
                key={`${build.type}-${index}`}
                onClick={() => setSelectedBuild(index)}
                className={cn(
                  "relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden group",
                  isSelected
                    ? `${cfg.selectedBg} ${cfg.border} shadow-xl ${cfg.glow} ring-2 ${cfg.ring}`
                    : "border-border bg-card hover:border-border/60 hover:shadow-lg"
                )}
              >
                {/* Top gradient strip */}
                <div className={cn(
                  "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r transition-opacity duration-300",
                  cfg.gradient,
                  isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                )} />

                {/* Selected pulse dot */}
                {isSelected && (
                  <span className={cn(
                    "absolute top-4 right-4 h-2.5 w-2.5 rounded-full animate-pulse",
                    cfg.dot
                  )} />
                )}

                {/* Icon + badge */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn(
                    "p-1.5 rounded-lg bg-gradient-to-br text-white",
                    cfg.gradient
                  )}>
                    {cfg.icon}
                  </div>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", cfg.badge)}>
                    {cfg.label}
                  </span>
                </div>

                {/* Build name */}
                <h3 className="font-heading font-bold text-sm leading-tight mb-0.5 pr-4">{build.name}</h3>

                {/* Price */}
                <p className="text-2xl font-extrabold mb-2">₹{build.totalPrice.toLocaleString()}</p>

                {/* Performance bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Performance Score</span>
                    <span className="font-semibold">{build.performanceScore}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", cfg.bar)}
                      initial={{ width: 0 }}
                      animate={{ width: `${build.performanceScore}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + index * 0.1 }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* Build Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Components List or Prebuilt Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="lg:col-span-2"
          >
            {currentBuild.type === 'prebuilt' ? (
              /* ---- PREBUILT CARD ---- */
              <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-500/5 to-card overflow-hidden">
                <div className="p-5 border-b border-purple-500/20 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Box className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-lg">{(currentBuild as any).prebuiltModel || currentBuild.name}</h3>
                    <p className="text-sm text-muted-foreground">{(currentBuild as any).prebuiltBrand || ''}</p>
                  </div>
                  <span className="ml-auto px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500">Pre-assembled</span>
                </div>
                {(currentBuild as any).prebuiltShortDescription && (
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-sm text-muted-foreground italic">"{(currentBuild as any).prebuiltShortDescription}"</p>
                  </div>
                )}
                {/* What's inside */}
                <div className="p-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-medium">What's Inside</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(currentBuild.components).map(([key, component]) => {
                      const Icon = categoryIcons[component.category] || Cpu;
                      return (
                        <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                          <Icon className="h-3.5 w-3.5 text-accent shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground uppercase">{key}</p>
                            <p className="text-xs font-medium truncate">{component.brand} {formatDisplayName(component.brand, component.name)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Price + Buy CTA */}
                <div className="p-5 border-t border-purple-500/20 bg-purple-500/5 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Price</p>
                    <p className="text-2xl font-bold text-purple-400">₹{currentBuild.totalPrice.toLocaleString()}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="border-purple-500/40 hover:border-purple-500"
                      onClick={() => addItem({ type: 'prebuilt', name: (currentBuild as any).prebuiltModel || currentBuild.name, price: currentBuild.totalPrice, productData: currentBuild.components.cpu })}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" /> Save
                    </Button>
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                      asChild
                    >
                      <a
                        href={buildStoreUrl('Amazon', (currentBuild as any).prebuiltModel || currentBuild.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" /> Buy on Amazon
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* ---- CUSTOM BUILD COMPONENT LIST ---- */
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="font-heading font-bold">Components</h3>
                </div>
                <div className="divide-y divide-border">
                  {Object.entries(currentBuild.components).map(([key, component]) => {
                    const Icon = categoryIcons[component.category] || Cpu;
                    return (
                      <div key={key} className="p-4 hover:bg-secondary/50 transition-colors relative group">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-secondary shrink-0">
                            <Icon className="h-4 w-4 text-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">{key}</p>
                            <p className="font-medium text-sm truncate">{component.brand} {formatDisplayName(component.brand, component.name)}</p>
                          </div>
                          <p className="font-bold text-sm text-accent shrink-0 mr-2">₹{component.price.toLocaleString()}</p>
                          {/* Action buttons — visible on hover */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <a
                              href={buildStoreUrl('Amazon', `${component.brand} ${formatDisplayName(component.brand, component.name)}`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Buy on Amazon"
                              className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={buildStoreUrl('Flipkart', `${component.brand} ${formatDisplayName(component.brand, component.name)}`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Buy on Flipkart"
                              className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-blue-500/10 text-muted-foreground hover:text-blue-500 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Add to bucket"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddComponent(component);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 border-t border-border bg-secondary/30">
                  <div className="flex justify-between items-center">
                    <span className="font-heading font-bold">Total</span>
                    <span className="text-xl font-bold text-accent">₹{currentBuild.totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Analysis Sidebar */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            {/* Compatibility */}
            {currentBuild.compatibility?.checks && currentBuild.compatibility.checks.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" /> Compatibility
              </h3>
              <div className="space-y-2">
                {currentBuild.compatibility.checks.map((check) => (
                  <div key={check.name} className="flex items-center gap-2 text-xs">
                    {check.passed ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-destructive" />}
                    <span className={check.passed ? 'text-muted-foreground' : 'text-destructive'}>{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Bottleneck */}
            {currentBuild.bottleneck && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-accent" /> Bottleneck
              </h3>
              <div className="text-center mb-3">
                <div className={cn(
                  "text-3xl font-bold",
                  currentBuild.bottleneck.percentage < 10 ? "text-green-500" :
                  currentBuild.bottleneck.percentage < 25 ? "text-orange-500" : "text-destructive"
                )}>
                  {currentBuild.bottleneck.percentage}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {currentBuild.bottleneck.bottleneckComponent === 'Balanced' ? 'Well Balanced' : `${currentBuild.bottleneck.bottleneckComponent} Limited`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{currentBuild.bottleneck.explanation}</p>
            </div>
            )}

            {/* FPS Estimates */}
            {currentBuild.fpsEstimates && currentBuild.fpsEstimates.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-accent" /> FPS Estimates (1080p)
                </h3>
                <div className="space-y-2.5">
                  {currentBuild.fpsEstimates.slice(0, 4).map((estimate) => (
                    <div key={estimate.game}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{estimate.game}</span>
                        <span className="font-semibold text-accent">{estimate.fps.high} FPS</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${Math.min(100, (estimate.fps.high / 200) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="accent" size="lg" className="w-full" onClick={handleAddBuildToBucket}>
              <ShoppingCart className="h-4 w-4 mr-2" /> Add {currentBuild.type === 'prebuilt' ? 'Prebuilt PC' : 'All Components'} to Bucket
            </Button>
          </motion.div>
        </div>

        {/* Load More Button */}
        <div className="mt-8 flex justify-center">
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

export default PCResults;
