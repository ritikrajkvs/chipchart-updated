import { QuestionnaireAnswers } from '@/store/questionnaireStore';

export interface PCComponent {
  id: string;
  sku: string;
  category: 'CPU' | 'GPU' | 'RAM' | 'SSD' | 'PSU' | 'CASE' | 'MOBO' | 'COOLER';
  brand: string;
  name: string;
  specs: Record<string, string | number>;
  performanceScore: number;
  price: number;
  buyLinks: {
    amazon?: string;
    flipkart?: string;
    mdcomputers?: string;
    primeabgb?: string;
  };
  image?: string;
}

export interface LaptopStorePrice {
  store: 'Amazon' | 'Flipkart' | 'Croma' | 'Reliance Digital' | 'Vijay Sales';
  price: number;
  url: string;
  inStock: boolean;
}

export interface Laptop {
  id: string;
  model: string;
  brand: string;
  searchQuery: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  display: string;
  battery: string;
  weight: string;
  performanceScore: number;
  price: number;
  lowestPrice?: number;
  storePrices?: LaptopStorePrice[];
  buyLinks: {
    amazon?: string;
    flipkart?: string;
    croma?: string;
    relianceDigital?: string;
    vijaySales?: string;
  };
  image?: string;
}

export interface PCBuild {
  type: 'performance' | 'value' | 'budget' | 'prebuilt';
  name: string;
  components: {
    cpu: PCComponent;
    gpu: PCComponent;
    ram: PCComponent;
    ssd: PCComponent;
    psu: PCComponent;
    case: PCComponent;
    motherboard: PCComponent;
    cooler: PCComponent;
  };
  totalPrice: number;
  performanceScore: number;
  compatibility: CompatibilityReport;
  bottleneck: BottleneckAnalysis;
  fpsEstimates: FPSEstimate[];
  alternatives: Partial<Record<keyof PCBuild['components'], PCComponent[]>>;
}

export interface CompatibilityReport {
  isCompatible: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

export interface BottleneckAnalysis {
  percentage: number;
  bottleneckComponent: 'CPU' | 'GPU' | 'Balanced';
  explanation: string;
}

export interface FPSEstimate {
  game: string;
  fps: { low: number; medium: number; high: number; ultra: number };
}

export interface LaptopRecommendation {
  laptop: Laptop;
  matchScore: number;
  pros: string[];
  cons: string[];
  fpsEstimates?: FPSEstimate[];
}

// ─── Legacy stubs (kept for import compatibility) ─────────────────────────────
export function generateAIExplanation(_builds: PCBuild[], _answers: QuestionnaireAnswers): string { return ''; }
export function generateLaptopAIExplanation(_recommendations: LaptopRecommendation[], _answers: QuestionnaireAnswers): string { return ''; }

// ─── Helpers ────────────────────────────────────────────────────────────────

// Strip HTML entities like &#x27; and decode common ones
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '') // strip remaining numeric entities
    .replace(/&[a-zA-Z]+;/g, ''); // strip remaining named entities
}

export function formatFullName(brand: string, name: string): string {
  if (!name || !brand) return name || brand || '';
  let cleanName = decodeHtmlEntities(name).replace(/\([^)]+\)/g, '').trim();
  // If it's a verbose Amazon title, take only before the first comma
  if (cleanName.length > 80) {
    cleanName = cleanName.split(/[,|]/, 1)[0].trim();
  }
  const brandRegex = new RegExp(`^${brand}\\s+`, 'i');
  if (brandRegex.test(cleanName)) return cleanName;
  return `${brand} ${cleanName}`;
}

export function formatDisplayName(brand: string, name: string): string {
  if (!name || !brand) return name || '';
  let cleanName = decodeHtmlEntities(name).replace(/\([^)]+\)/g, '').trim();
  // If it's a verbose Amazon title, take only before the first comma
  if (cleanName.length > 80) {
    cleanName = cleanName.split(/[,|]/, 1)[0].trim();
  }
  const brandRegex = new RegExp(`^${brand}\\s+`, 'i');
  if (brandRegex.test(cleanName)) return cleanName.replace(brandRegex, '').trim();
  return cleanName;
}

// ─── Structured insight system ────────────────────────────────────────────────

export interface AnalysisInsight {
  type: 'winner' | 'tip' | 'stat' | 'warning' | 'deal';
  label: string;
  value: string;
  detail?: string;
}

// PC build insights — recomputed whenever builds array changes
export function generatePCInsights(builds: PCBuild[], answers: QuestionnaireAnswers): AnalysisInsight[] {
  if (!builds || builds.length === 0) return [];
  const insights: AnalysisInsight[] = [];
  const budget = answers.budget || 100000;

  const top = [...builds].sort((a, b) => b.performanceScore - a.performanceScore)[0];
  const valueBuild = [...builds].sort((a, b) => (b.performanceScore / b.totalPrice) - (a.performanceScore / a.totalPrice))[0];
  const cheapest = [...builds].sort((a, b) => a.totalPrice - b.totalPrice)[0];

  // Best overall
  insights.push({
    type: 'winner',
    label: '🏆 Best Build Overall',
    value: top.name,
    detail: `Score ${top.performanceScore}/100 · ${top.components.cpu.name} + ${top.components.gpu.name}`,
  });

  // Best value (if different from top)
  if (valueBuild.name !== top.name) {
    insights.push({
      type: 'deal',
      label: '💰 Best Value Pick',
      value: valueBuild.name,
      detail: `${valueBuild.performanceScore} score for ₹${valueBuild.totalPrice.toLocaleString()} — most performance per rupee`,
    });
  }

  // Budget utilisation
  const savings = budget - cheapest.totalPrice;
  if (savings > 0) {
    insights.push({
      type: 'stat',
      label: '📊 Budget Fit',
      value: `₹${cheapest.totalPrice.toLocaleString()} of ₹${budget.toLocaleString()}`,
      detail: `Save ₹${savings.toLocaleString()} with the most affordable option`,
    });
  }

  // Bottleneck warning on best build
  if (top.bottleneck && top.bottleneck.percentage > 15) {
    insights.push({
      type: 'warning',
      label: '⚠️ Bottleneck Alert',
      value: `${top.bottleneck.bottleneckComponent} — ${top.bottleneck.percentage}%`,
      detail: top.bottleneck.explanation,
    });
  }

  // Strongest GPU across all builds
  const gpus = builds.map(b => ({ name: b.components.gpu.name, score: b.components.gpu.performanceScore, build: b.name }));
  const bestGpu = [...gpus].sort((a, b) => b.score - a.score)[0];
  insights.push({
    type: 'stat',
    label: '🎮 Strongest GPU in Results',
    value: bestGpu.name,
    detail: `Found in "${bestGpu.build}" · Score ${bestGpu.score}/100`,
  });

  // FPS highlight from top build
  const topFps = top.fpsEstimates?.[0];
  if (topFps) {
    insights.push({
      type: 'tip',
      label: `🎯 FPS Estimate — ${topFps.game}`,
      value: `${topFps.fps.high} FPS on High`,
      detail: `Top build · ${top.components.gpu.name} · ${answers.targetResolution || '1080p'} target`,
    });
  }

  // Compatibility status
  const allCompatible = builds.every(b => b.compatibility?.isCompatible !== false);
  insights.push({
    type: allCompatible ? 'tip' : 'warning',
    label: allCompatible ? '✅ All Builds Compatible' : '⚠️ Compatibility Issue',
    value: allCompatible ? `${builds.length} builds verified` : 'Check individual build details',
    detail: allCompatible
      ? 'CPU socket, RAM type, PSU wattage and GPU slot checked across all results'
      : 'One or more builds may have compatibility issues — review below',
  });

  return insights;
}

// Laptop insights — recomputed whenever recommendations array changes
export function generateLaptopInsights(recommendations: LaptopRecommendation[], answers: QuestionnaireAnswers): AnalysisInsight[] {
  if (!recommendations || recommendations.length === 0) return [];
  const insights: AnalysisInsight[] = [];
  const budget = answers.budget || 100000;

  // Helper: ensure names shown in insights are short and clean
  const cleanName = (brand: string, model: string) => {
    const full = formatFullName(brand, model);
    // If model is a verbose Amazon title, take only the first meaningful chunk
    const cleaned = full.split(/[,|–—]/, 1)[0].trim(); // take before first comma/dash
    return cleaned.length > 50 ? cleaned.substring(0, 47) + '...' : cleaned;
  };

  const sorted = [...recommendations].sort((a, b) => b.matchScore - a.matchScore);
  const top = sorted[0];
  const cheapest = [...recommendations].sort((a, b) =>
    (b.laptop.lowestPrice ?? b.laptop.price) - (a.laptop.lowestPrice ?? a.laptop.price)
  )[0];
  const bestPerf = [...recommendations].sort((a, b) => b.laptop.performanceScore - a.laptop.performanceScore)[0];
  const targetPrice = cheapest.laptop.lowestPrice ?? cheapest.laptop.price;

  // Top match
  insights.push({
    type: 'winner',
    label: '🏆 Best Match For You',
    value: cleanName(top.laptop.brand, top.laptop.model),
    detail: `${top.matchScore}% match · ${top.laptop.cpu}`,
  });

  // Estimated max price
  insights.push({
    type: 'deal',
    label: '💰 Expected Max Cost',
    value: `₹${targetPrice.toLocaleString()} — ${cleanName(cheapest.laptop.brand, cheapest.laptop.model)}`,
    detail: budget - targetPrice > 0
      ? `₹${(budget - targetPrice).toLocaleString()} under your budget based on max retail price`
      : 'Fits exactly within your budget',
  });

  // Performance leader (if different from match winner)
  if (bestPerf.laptop.id !== top.laptop.id) {
    insights.push({
      type: 'stat',
      label: '⚡ Raw Performance Leader',
      value: cleanName(bestPerf.laptop.brand, bestPerf.laptop.model),
      detail: `Score ${bestPerf.laptop.performanceScore}/100 — strongest CPU/GPU combo in these results`,
    });
  }

  // Match score spread
  if (sorted.length > 1) {
    const gap = sorted[0].matchScore - sorted[sorted.length - 1].matchScore;
    insights.push({
      type: 'stat',
      label: '📊 Match Score Spread',
      value: `${sorted[0].matchScore}% → ${sorted[sorted.length - 1].matchScore}%`,
      detail: gap <= 5
        ? 'Very close results — all options suit your profile well'
        : `${gap}pt gap — top pick is noticeably better matched to your needs`,
    });
  }

  // Store comparison coverage
  const allStorePrices = recommendations.flatMap(r => r.laptop.storePrices ?? []);
  if (allStorePrices.length > 0) {
    const stores = [...new Set(allStorePrices.map(s => s.store))];
    insights.push({
      type: 'tip',
      label: '🛍️ Prices Compared Across',
      value: `${stores.length} stores`,
      detail: `${stores.join(' · ')} — tap Deals on each card for live lowest price`,
    });
  }

  // Gaming FPS tip
  const topFps = top.fpsEstimates?.[0];
  if (topFps) {
    insights.push({
      type: 'tip',
      label: `🎯 Gaming — ${topFps.game}`,
      value: `~${topFps.fps.high} FPS on High`,
      detail: `Top pick · High preset. Ultra drops to ~${topFps.fps.ultra} FPS`,
    });
  }

  // Lightest laptop
  const weights = recommendations
    .map(r => ({
      label: formatFullName(r.laptop.brand, r.laptop.model),
      w: parseFloat((r.laptop.weight || '9').replace(/[^0-9.]/g, '')),
    }))
    .filter(w => !isNaN(w.w) && w.w > 0);
  if (weights.length > 1) {
    const lightest = [...weights].sort((a, b) => a.w - b.w)[0];
    insights.push({
      type: 'tip',
      label: '🪶 Most Portable',
      value: `${lightest.label.length > 40 ? lightest.label.substring(0, 37) + '...' : lightest.label} — ${lightest.w} kg`,
      detail: 'Best choice if you carry your laptop daily',
    });
  }

  return insights;
}
