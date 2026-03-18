// Live pricing via ScraperAPI ONLY.
// Progressive retry: strict → retry → relaxed specs → gpu-only → simplified query → AI fallback
// When a substitute (relaxed match) is found, extract real specs from the Amazon title.
import { livePriceCache } from './apiCache';

export interface AmazonParsedSpecs {
  cpu?: string;
  gpu?: string;
  ram?: string;
  storage?: string;
  displayName?: string;  // cleaned Amazon title for display
}

export interface LivePriceResult {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
  name?: string;
  isSubstitute?: boolean;         // true if this is NOT the exact model Gemini asked for
  amazonSpecs?: AmazonParsedSpecs; // parsed real specs from Amazon title
}

// ──────────────────────────────────────────────
// SPEC PARSING FROM AMAZON TITLES
// ──────────────────────────────────────────────

/** Parse CPU from title like "Intel Core i5-13450HX" or "AMD Ryzen 5 7640HS" */
function parseCPU(title: string): string | undefined {
  const t = title;
  // Intel patterns
  const intel = t.match(/(?:Intel\s+)?Core\s+(i[3579][\s-]?\d{4,5}\w*)/i);
  if (intel) return `Intel Core ${intel[1].replace(/\s+/g, '-')}`;
  const ultra = t.match(/(?:Intel\s+)?Core\s+(Ultra\s*[579]\s*\d*\w*)/i);
  if (ultra) return `Intel Core ${ultra[1]}`;
  // AMD patterns
  const amd = t.match(/(?:AMD\s+)?Ryzen\s+(\w+\s+\d+\w*)/i);
  if (amd) return `AMD Ryzen ${amd[1]}`;
  // Apple
  const apple = t.match(/Apple\s+(M[1234]\s*(?:Pro|Max|Ultra)?)/i);
  if (apple) return `Apple ${apple[1]}`;
  return undefined;
}

/** Parse GPU from title like "RTX 4050" or "NVIDIA GeForce RTX 3050" */
function parseGPU(title: string): string | undefined {
  const rtx = title.match(/(?:NVIDIA\s+)?(?:GeForce\s+)?(RTX\s*\d{4}\s*(?:Ti)?)/i);
  if (rtx) return `NVIDIA ${rtx[1].replace(/\s+/g, ' ').toUpperCase()}`;
  const gtx = title.match(/(?:NVIDIA\s+)?(?:GeForce\s+)?(GTX\s*\d{4}\s*(?:Ti)?)/i);
  if (gtx) return `NVIDIA ${gtx[1].replace(/\s+/g, ' ').toUpperCase()}`;
  const radeon = title.match(/(?:AMD\s+)?Radeon\s+(\w+\s*\d*\w*)/i);
  if (radeon) return `AMD Radeon ${radeon[1]}`;
  const arc = title.match(/Intel\s+Arc\s+(\w+)/i);
  if (arc) return `Intel Arc ${arc[1]}`;
  return undefined;
}

/** Parse RAM like "16GB" or "16 GB" or "32GB DDR5" */
function parseRAM(title: string): string | undefined {
  const ram = title.match(/(\d+)\s*GB\s*(?:DDR[45])?/i);
  if (ram) return `${ram[0].replace(/\s+/g, ' ').toUpperCase().trim()}`;
  return undefined;
}

/** Parse storage like "512GB SSD" or "1TB SSD" */
function parseStorage(title: string): string | undefined {
  const ssd = title.match(/(\d+\s*(?:GB|TB))\s*SSD/i);
  if (ssd) return `${ssd[1].replace(/\s+/g, '')} SSD`;
  const hdd = title.match(/(\d+\s*(?:GB|TB))\s*HDD/i);
  if (hdd) return `${hdd[1].replace(/\s+/g, '')} HDD`;
  return undefined;
}

/** Clean Amazon title into a displayable model name */
function cleanDisplayName(title: string, brand: string): string {
  // Remove common Amazon noise
  let clean = title
    .replace(/\(Renewed\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/,\s*$/g, '')
    .trim();
  // Take first part before first major separator (comma, pipe, bracket)
  const firstPart = clean.split(/[,|(\[]/)[0].trim();
  // Limit length
  if (firstPart.length > 60) return firstPart.substring(0, 57) + '…';
  return firstPart || clean.substring(0, 60);
}

/** Parse all specs from an Amazon title */
function parseAmazonSpecs(title: string, brand: string): AmazonParsedSpecs {
  return {
    cpu: parseCPU(title),
    gpu: parseGPU(title),
    ram: parseRAM(title),
    storage: parseStorage(title),
    displayName: cleanDisplayName(title, brand),
  };
}

// ──────────────────────────────────────────────
// MATCHING HELPERS
// ──────────────────────────────────────────────

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

function extractKeyword(query: string, patterns: RegExp[]): string | null {
  const q = query.toLowerCase();
  for (const pat of patterns) {
    const m = q.match(pat);
    if (m) return m[1].replace(/\s+/g, ' ');
  }
  return null;
}

function titleHasKeyword(title: string, keyword: string): boolean {
  const t = title.toLowerCase();
  if (t.includes(keyword)) return true;
  const noSpace = keyword.replace(/\s+/g, '');
  if (t.includes(noSpace)) return true;
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

function titleMatchesSpecs(title: string, searchQuery: string, level: MatchLevel): boolean {
  if (!title || !searchQuery) return true;
  const t = title.toLowerCase();

  const cpuKey = extractKeyword(searchQuery, CPU_PATTERNS);
  const gpuKey = extractKeyword(searchQuery, GPU_PATTERNS);

  if (gpuKey && !titleHasKeyword(t, gpuKey)) return false;
  if (level === 'gpu-only') return true;

  if (cpuKey && !titleHasKeyword(t, cpuKey)) return false;
  if (level === 'relaxed') return true;

  const ramMatch = searchQuery.toLowerCase().match(/\b(\d+)\s*gb\b/);
  if (ramMatch) {
    const ramVal = ramMatch[1];
    if (!t.includes(ramVal + 'gb') && !t.includes(ramVal + ' gb')) return false;
  }

  return true;
}

function isUnavailable(title: string, availability?: string): boolean {
  const check = (s: string) => {
    const l = s.toLowerCase();
    return l.includes('currently unavailable') || l.includes('out of stock') || l.includes('not available');
  };
  return (availability && check(availability)) || (title && check(title)) || false;
}

function isPriceSane(livePrice: number, aiEstimate: number): boolean {
  if (!aiEstimate || aiEstimate <= 0) return true;
  return livePrice >= aiEstimate * 0.4 && livePrice <= aiEstimate * 1.6;
}

// ──────────────────────────────────────────────
// ScraperAPI with configurable matching
// ──────────────────────────────────────────────
async function fetchViaScraperAPI(
  searchQuery: string,
  brand: string,
  model: string,
  aiEstimatedPrice: number,
  matchLevel: MatchLevel,
  checkBrand: boolean = true,
  markAsSubstitute: boolean = false
): Promise<LivePriceResult | null> {
  const token = import.meta.env.VITE_SCRAPERAPI_KEY || '2dda48aa467fa879a9910a01baafddc4';
  if (!token) return null;

  const apiUrl = `https://api.scraperapi.com/structured/amazon/search?api_key=${token}&query=${encodeURIComponent(searchQuery)}&country=in`;

  try {
    console.log(`[ScraperAPI] Searching (${matchLevel}${!checkBrand ? ', no-brand' : ''}${markAsSubstitute ? ', sub' : ''}): ${searchQuery}`);
    const res = await fetch(apiUrl, { method: 'GET' });
    if (!res.ok) { console.warn(`[ScraperAPI] Error ${res.status}`); return null; }

    const json = await res.json();
    const items = json.results;
    if (!items || !Array.isArray(items) || items.length === 0) return null;

    for (const item of items) {
      const title = item.name || '';

      if (isUnavailable(title, item.availability)) continue;
      if (checkBrand && !titleMatchesBrand(title, brand, model)) continue;
      if (!titleMatchesSpecs(title, searchQuery, matchLevel)) continue;

      const rawPrice = item.price;
      const cleanPrice = typeof rawPrice === 'number'
        ? Math.round(rawPrice)
        : (rawPrice ? parseInt(String(rawPrice).replace(/[^0-9]/g, ''), 10) : null);

      if (!cleanPrice || cleanPrice <= 0) continue;
      if (!isPriceSane(cleanPrice, aiEstimatedPrice)) continue;

      const result: LivePriceResult = {
        store: 'Amazon',
        price: cleanPrice,
        inStock: true,
        url: item.url || `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`,
        name: title,
        isSubstitute: markAsSubstitute,
      };

      // If substitute, parse real specs from Amazon title
      if (markAsSubstitute) {
        result.amazonSpecs = parseAmazonSpecs(title, brand);
        console.log(`[ScraperAPI] ✓ SUBSTITUTE: "${title.substring(0, 60)}" → ₹${cleanPrice}`, result.amazonSpecs);
      } else {
        console.log(`[ScraperAPI] ✓ Matched (${matchLevel}): "${title.substring(0, 60)}" → ₹${cleanPrice}`);
      }

      return result;
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
// Steps 1-3: exact model. Steps 4-5: substitute with spec overwrite.
// ──────────────────────────────────────────────
export async function fetchLiveAmazonPrice(
  searchQuery: string,
  brand: string = '',
  model: string = '',
  aiEstimatedPrice: number = 0
): Promise<LivePriceResult | null> {
  const cached = livePriceCache.get(searchQuery);
  if (cached) {
    if (cached.inStock === false) return null;
    console.log(`[LivePrice] Cache hit: ₹${cached.price}${cached.isSubstitute ? ' (substitute)' : ''}`);
    return cached;
  }

  let result: LivePriceResult | null = null;

  // ── EXACT MODEL ATTEMPTS (isSubstitute = false) ──

  // Step 1: strict (brand + CPU + GPU + RAM)
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'strict', true, false);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 2: strict retry
  await new Promise(r => setTimeout(r, 800));
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'strict', true, false);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 3: relaxed (brand + CPU + GPU, skip RAM)
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'relaxed', true, false);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // ── SUBSTITUTE ATTEMPTS (isSubstitute = true, specs overwritten) ──

  // Step 4: GPU-only, no brand check → substitute
  result = await fetchViaScraperAPI(searchQuery, brand, model, aiEstimatedPrice, 'gpu-only', false, true);
  if (result?.price) { livePriceCache.set(searchQuery, result); return result; }

  // Step 5: simplified query (brand + model + GPU) → substitute
  const gpuKey = extractKeyword(searchQuery, GPU_PATTERNS);
  const simplifiedQuery = `${brand} ${model}${gpuKey ? ' ' + gpuKey : ''}`.trim();
  if (simplifiedQuery !== searchQuery && simplifiedQuery.length > 5) {
    console.log(`[LivePrice] Trying simplified query: "${simplifiedQuery}"`);
    result = await fetchViaScraperAPI(simplifiedQuery, brand, model, aiEstimatedPrice, 'gpu-only', false, true);
    if (result?.price) { livePriceCache.set(searchQuery, result); return result; }
  }

  console.warn(`[LivePrice] All attempts failed for "${searchQuery}". AI fallback.`);
  return null;
}

// ──────────────────────────────────────────────
// PUBLIC: Prebuilt PC live price
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

  let result = await fetchViaScraperAPI(searchQuery, brand, '', aiEstimatedPrice, 'gpu-only', false, true);
  if (result?.price) { livePriceCache.set(`pc_${searchQuery}`, result); return result; }

  await new Promise(r => setTimeout(r, 800));
  result = await fetchViaScraperAPI(searchQuery, brand, '', aiEstimatedPrice, 'gpu-only', false, true);
  if (result?.price) { livePriceCache.set(`pc_${searchQuery}`, result); return result; }

  console.warn(`[PC LivePrice] Failed for "${searchQuery}". AI estimate.`);
  return null;
}
