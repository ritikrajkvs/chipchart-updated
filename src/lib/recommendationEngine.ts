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
}

export function generateAIExplanation(builds: PCBuild[], answers: QuestionnaireAnswers): string {
  const purpose = answers.purpose || 'gaming';
  const budget = answers.budget || 100000;

  if (!builds || builds.length === 0) return '';
  const bestBuild = builds[0];
  
  return `Based on your ${purpose} requirements and ₹${budget.toLocaleString()} budget, I've curated optimized builds for you alongside live market data.

**${bestBuild.name}** features a ${bestBuild.components.cpu.name} and ${bestBuild.components.gpu.name} combination, delivering exceptional performance. ${bestBuild.bottleneck?.explanation || ''}

Explore the custom builds or a pre-built option to see what best fits your needs. All components are selected based on real-time availability and compatibility.`;
}

export function generateLaptopAIExplanation(recommendations: LaptopRecommendation[], answers: QuestionnaireAnswers): string {
  const purpose = answers.purpose || 'gaming';
  if (!recommendations || recommendations.length === 0) return '';
  const top = recommendations[0];

  return `For your ${purpose} needs, the **${top.laptop.brand} ${top.laptop.model}** emerges as the top recommendation with a ${top.matchScore}% match score based on current market data.

Powered by the ${top.laptop.cpu} and ${top.laptop.gpu}, this laptop delivers exceptional performance while its display ensures stunning visuals. At ${top.laptop.weight}, it strikes a great balance.

The subsequent options provide alternatives based on live data if you prioritize different features.`;
}
