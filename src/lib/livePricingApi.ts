// Live pricing via ScraperAPI ONLY.
// Progressive retry: strict → retry → relaxed specs → simplified query → AI fallback
// Unavailable products are skipped but NOT cached.
import { livePriceCache } from './apiCache';

export interface LivePriceResult {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
  name?: string;
}

// ──────────────────────────────────────────────
// MATCHING HELPERS
// ──────────────────────────────────────────────

/** Relaxed brand/model — partial match is OK */
function titleMatchesBrand(title: string, brand: string, model: string = ''): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (brand && t.includes(brand.toLowerCase())) return true;
  if (model) {
    const words = model.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const w of words) { if (t.includes(w)) return true; }
  }
  return false;
}

/** Extract a keyword from a search query using a set of patterns */
function extractKeyword(query: string, patterns: RegExp[]): string | null {
  const q = query.toLowerCase();
  for (const pat of patterns) {
    const m = q.match(pat);
    if (m) return m[1].replace(/\s+/g, ' ');
  }
  return null;
}

/** Check if title contains the keyword (case-insensitive, with/without spaces) */
function titleHasKeyword(title: string, keyword: string): boolean {
  const t = title.toLowerCase();
  // Try exact
  if (t.includes(keyword)) return true;
  // Try without spaces (e.g. "16gb" vs "16 gb")
  const noSpace = keyword.replace(/\s+/g, '');
  if (t.includes(noSpace)) return true;
  // Try with spaces between digits and letters (e.g. "16gb" → "16 gb")
  const withSpace = keyword.replace(/(\d)([a-z])/g, '$1 $2');
  if (t.includes(withSpace)) return true;
  return false;
}

const CPU_PATTERNS = [
  /\b(i[3579])\b/,
  /\b(ryzen\s*[3579])\b/,
  /\b(ryzen\s*ai\s*[3579])\b/,
  /\b(ultra\s*[579])\b/,
  /\b(m[1234]\s*(?:pro|max|ultra)?)\b/,
];

const GPU_PATTERNS = [
  /\b(rtx\s*\d{4})\b/,
  /\b(gtx\s*\d{4})\b/,
  /\b(radeon\s*\w+)\b/,
  /\b(arc\s*\w+)\b/,
];

type MatchLevel = 'strict' | 'relaxed' | 'gpu-only';

/**
 * Match title against search query specs.
 * - strict: CPU + GPU + RAM all must match
 * - relaxed: CPU + GPU must match (RAM skipped)
 * - gpu-only: Only GPU must match (most lenient)
 */
function titleMatchesSpecs(title: string, searchQuery: string, level: MatchLevel): boolean {
  if (!title || !searchQuery) return true;
  const t = title.toLowerCase();

  const cpuKey = extractKeyword(searchQuery, CPU_PATTERNS);
  const gpuKey = extractKeyword(searchQuery, GPU_PATTERNS);

  // GPU check — always required (except if no GPU in query)
  if (gpuKey && !titleHasKeyword(t, gpuKey)) {
    return false;
  }

  if (level === 'gpu-only') return true;

  // CPU check — required for strict and relaxed
  if (cpuKey && !titleHasKeyword(t, cpuKey)) {
    return false;
  }

  if (level === 'relaxed') return true;

  // RAM check — only for strict
  const ramMatch = searchQuery.toLowerCase().match(/\b(\d+)\s*gb\b/);
  if (ramMatch) {
    const ramVal = ramMatch[1];
    if (!t.includes(ramVal + 'gb') && !t.includes(ramVal + ' gb')) {
      return false;
    }
  }

  return true;
}

/** Check if product is unavailable */
function isUnavailable(title: string, availability?: string): boolean {
  const check = (s: string) => {
    const l = s.toLowerCase();
    return l.includes('currently unavailable') || l.includes('out of stock') || l.includes('not available');
  };
  return (availability && check(availability)) || (title && check(title)) || false;
}

/** Price sanity: 50%–150% of AI estimate */
function isPriceSane(livePrice: number, aiEstimate: number): boolean {
  if (!aiEstimate || aiEstimate <= 0) return true;
  return livePrice >= aiEstimate * 0.5 && livePrice <= aiEstimate * 1.5;
}

// ──────────────────────────────────────────────
// ScraperAPI fetch with configurable matching
// ──────────────────────────────────────────────
async function fetchViaScraperAPI(
  searchQuery: string,
  brand: string,
  model: string,
  aiEstimatedPrice: number,
  matchLevel: MatchLevel,
  checkBrand: boolean = true
): Promise<LivePriceResult | null> {
  const token = import.meta.env.VITE_SCRAPERAPI_KEY || '2dda48aa467fa879a9910a01baafddc4';
  if (!token) return null;

  const apiUrl = `https://api.scraperapi.com/structured/amazon/search?api_key=${token}&query=${encodeURIComponent(searchQuery)}&country=in`;

  try {
    console.log(`[ScraperAPI] Searching (${matchLevel}${!checkBrand ? ', no-brand' : ''}): ${searchQuery}`);
    const res = await fetch(apiUrl, { method: 'GET' });
    if (!res.ok) { console.warn(`[ScraperAPI] Error ${res.status}`); return null; }

    const json = await res.json();
    const items = json.results;
    if (!items || !Array.isArray(items) || items.length === 0) return null;

    for (const item of items) {
      const title = item.name || '';

      // Skip unavailable
      if (isUnavailable(title, item.availability)) continue;

      // Brand check (skippable)
      if (checkBrand && !titleMatchesBrand(title, brand, model)) continue;

      // Spec check at requested level
      if (!titleMatchesSpecs(title, searchQuery, matchLevel)) continue;

      const rawPrice = item.price;
      const cleanPrice = typeof rawPrice === 'number'
        ? Math.round(rawPrice)
        : (rawPrice ? parseInt(String(rawPrice).replace(/[^0-9]/g, ''), 10) : null);

      if (!cleanPrice || cleanPrice <= 0) continue;
      if (!isPriceSane(cleanPrice, aiEstimatedPrice)) continue;

      console.log(`[ScraperAPI] ✓ Matched (${matchLevel}): "${title.substring(0, 60)}" → ₹${cleanPrice}`);
      return {
        store: 'Amazon',
        price: cleanPrice,
        inStock: true,
        url: item.url || `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`,
        name: title,
      };
    }

    console.log(`[ScraperAPI] No match (${matchLevel}) in ${items.length} results.`);
    return null;
  } catch (err) {
    console.warn('[ScraperAPI] Fetch failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
// PUBLIC: Laptop live price — progressive relaxation
// ──────────────────────────────────────────────
export async function fetchLiveAmazonPrice(
  searchQuery: string,
  brand: string = '',
  model: string = '',
  aiEstimatedPrice: number = 0
): Promise<LivePriceResult | null> {
  // Cache check
  const cached = livePriceCache.get(searchQuery);
  if (cached) {
    if (cached.inStock === false) return null;
    console.log(`[LivePrice] Cache hit: ₹${cached.price}`);
    return cached;
  }

  let result: LivePriceResult | null = null;

  // Step 1: ScraperAPI strict (brand + CPU + GPU + RAM)
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'strict', true);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 2: ScraperAPI strict retry
  await new Promise(r => setTimeout(r, 800));
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'strict', true);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 3: Relaxed specs (brand + CPU + GPU, skip RAM check)
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'relaxed', true);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 4: GPU-only matching, no brand check (catches renamed variants)
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'gpu-only', false);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 5: Simplified search query (just brand + model name + GPU)
  const gpuKey = extractKeyword(searchQuery, GPU_PATTERNS);
  const simplifiedQuery = `${brand} ${model}${gpuKey ? ' ' + gpuKey : ''}`.trim();
  if (simplifiedQuery !== searchQuery && simplifiedQuery.length > 5) {
    console.log(`[LivePrice] Trying simplified query: "${simplifiedQuery}"`);
    result = await fetchViaScraperAPI(simplifiedQuery, brand, model, aiEstimatedPrice, 'gpu-only', false);
    if (result?.price) { livePriceCache.set(searchQuery, result); return result; }
  }

  console.warn(`[LivePrice] All attempts failed for "${searchQuery}". AI fallback.`);
  return null;
}

// ──────────────────────────────────────────────
// PUBLIC: Prebuilt PC live price (same ScraperAPI)
// ──────────────────────────────────────────────
export async function fetchPrebuiltPCPrice(
  searchQuery: string,
  aiEstimatedPrice: number = 0
): Promise<LivePriceResult | null> {
  const cached = livePriceCache.get(`pc_${searchQuery}`);
  if (cached) {
    if (cached.inStock === false) return null;
    console.log(`[PC LivePrice] Cache hit: ₹${cached.price}`);
    return cached;
  }

  const brand = searchQuery.split(' ')[0] || '';

  // Try relaxed (prebuilt names vary hugely)
  let result = await fetchViaScraperAPI(searchQuery, brand, '', aiEstimatedPrice, 'gpu-only', false);
  if (result?.price) { livePriceCache.set(`pc_${searchQuery}`, result); return result; }

  // Retry
  await new Promise(r => setTimeout(r, 800));
  result = await fetchViaScraperAPI(searchQuery, brand, '', aiEstimatedPrice, 'gpu-only', false);
  if (result?.price) { livePriceCache.set(`pc_${searchQuery}`, result); return result; }

  console.warn(`[PC LivePrice] Failed for "${searchQuery}". AI estimate.`);
  return null;
}
