// Live pricing via ScraperAPI.
// Flow: strict → relaxed → simplified → AI fallback.
// Hardened: availability check covers structured fields, price sanity tightened,
// and a laptop-filter prevents matching accessories/desktops.
import { livePriceCache } from './apiCache';

export interface LivePriceResult {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
  name?: string;
}

// ── HELPERS ──────────────────────────────────

function brandOk(title: string, brand: string, model: string = ''): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (brand && t.includes(brand.toLowerCase())) return true;
  if (model) {
    const words = model.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    // Require at least 2 matching words for model-based match, or 1 if only 1 word
    const matchCount = words.filter(w => t.includes(w)).length;
    if (words.length === 1 && matchCount === 1) return true;
    if (words.length > 1 && matchCount >= 2) return true;
  }
  return false;
}

function extractKw(q: string, pats: RegExp[]): string | null {
  const lq = q.toLowerCase();
  for (const p of pats) { const m = lq.match(p); if (m) return m[1].replace(/\s+/g, ' '); }
  return null;
}

function hasKw(t: string, kw: string): boolean {
  const lt = t.toLowerCase();
  return lt.includes(kw) || lt.includes(kw.replace(/\s+/g, '')) || lt.includes(kw.replace(/(\d)([a-z])/g, '$1 $2'));
}

const CPU_PAT = [/\b(i[3579])\b/, /\b(ryzen\s*[3579])\b/, /\b(ryzen\s*ai\s*[3579])\b/, /\b(ultra\s*[579])\b/, /\b(m[1234]\s*(?:pro|max|ultra)?)\b/];
const GPU_PAT = [/\b(rtx\s*\d{4})\b/, /\b(gtx\s*\d{4})\b/, /\b(radeon\s*\w+)\b/, /\b(arc\s*\w+)\b/];

type Level = 'strict' | 'relaxed';

/** strict = CPU+GPU+RAM, relaxed = GPU only */
function specsOk(title: string, query: string, level: Level): boolean {
  if (!title || !query) return true;
  const t = title.toLowerCase();
  const gpu = extractKw(query, GPU_PAT);
  if (gpu && !hasKw(t, gpu)) return false;
  if (level === 'relaxed') return true;
  const cpu = extractKw(query, CPU_PAT);
  if (cpu && !hasKw(t, cpu)) return false;
  const ram = query.toLowerCase().match(/\b(\d+)\s*gb\b/);
  if (ram && !t.includes(ram[1] + 'gb') && !t.includes(ram[1] + ' gb')) return false;
  return true;
}

/** Comprehensive unavailability check — covers text AND structured data */
function isUnavailable(item: any): boolean {
  const title = (item.name || '').toLowerCase();
  const avail = (item.availability || '').toLowerCase();

  // Text checks
  const badPhrases = ['currently unavailable', 'out of stock', 'not available', 'temporarily out', 'no longer available'];
  for (const phrase of badPhrases) {
    if (title.includes(phrase) || avail.includes(phrase)) return true;
  }

  // Structured checks from ScraperAPI
  if (item.in_stock === false) return true;
  if (item.is_available === false) return true;

  // No price at all usually means unavailable
  if (!item.price && !item.price_raw) return true;
  // Price of exactly 0 is also invalid
  if (item.price === 0 && !item.price_raw) return true;

  return false;
}

/** Verify this is actually a laptop product, not accessories/cases/desktops */
function isActualLaptop(title: string): boolean {
  const t = title.toLowerCase();
  // Reject common non-laptop items
  const rejectPatterns = [
    'laptop bag', 'laptop stand', 'laptop sleeve', 'laptop skin',
    'laptop charger', 'laptop adapter', 'laptop battery', 'screen guard',
    'keyboard cover', 'cooling pad', 'laptop table', 'hard disk',
    'desktop', 'tower pc', 'assembled pc', 'mini pc',
    'only gpu', 'graphics card', 'processor only',
  ];
  for (const rp of rejectPatterns) {
    if (t.includes(rp)) return false;
  }
  // Must contain "laptop" or "notebook" or a known laptop family name
  const laptopSignals = ['laptop', 'notebook', 'ultrabook', 'chromebook',
    'victus', 'pavilion', 'inspiron', 'vostro', 'latitude',
    'thinkpad', 'ideapad', 'yoga', 'legion', 'vivobook', 'zenbook',
    'rog', 'tuf', 'predator', 'aspire', 'swift', 'nitro',
    'macbook', 'bravo', 'katana', 'pulse', 'thin', 'creator',
    'modern', 'prestige', 'raider', 'stealth', 'titan',
    'elitebook', 'probook', 'envy', 'spectre', 'omen',
    'gram', 'xps', 'alienware', 'g14', 'g15', 'g16',
  ];
  for (const sig of laptopSignals) {
    if (t.includes(sig)) return true;
  }
  return false; // If none of the signals match, skip it
}

/** Price sanity: 50%–140% of Gemini estimate */
function priceSane(live: number, est: number): boolean {
  if (!est || est <= 0) return true;
  return live >= est * 0.4 && live <= est * 1.6;
}

// ── ScraperAPI core ──────────────────────────
async function scrape(
  query: string, brand: string, model: string, est: number, level: Level, checkBrand: boolean, productType: 'laptop' | 'pc' = 'laptop'
): Promise<LivePriceResult | null> {
  const key = import.meta.env.VITE_SCRAPERAPI_KEY;
  if (!key) { console.warn('[ScraperAPI] No API key configured (VITE_SCRAPERAPI_KEY)'); return null; }
  const url = `https://api.scraperapi.com/structured/amazon/search?api_key=${key}&query=${encodeURIComponent(query)}&country=in`;
  try {
    console.log(`[ScraperAPI] ${level}${checkBrand ? '' : ' no-brand'} [${productType}]: ${query}`);
    const res = await fetch(url);
    if (!res.ok) { console.warn(`[ScraperAPI] HTTP ${res.status}`); return null; }
    const json = await res.json();
    const items = json.results;
    if (!Array.isArray(items) || !items.length) { console.log('[ScraperAPI] No results.'); return null; }

    let skipped = { unavail: 0, notLaptop: 0, brand: 0, specs: 0, price: 0, sane: 0 };

    for (const it of items) {
      const title = it.name || '';

      // 1. Availability — comprehensive check
      if (isUnavailable(it)) { skipped.unavail++; continue; }

      // 2. Product type filter (only for laptops — skip for PC prebuilts)
      if (productType === 'laptop' && !isActualLaptop(title)) { skipped.notLaptop++; continue; }

      // 3. Brand check
      if (checkBrand && !brandOk(title, brand, model)) { skipped.brand++; continue; }

      // 4. Spec check
      if (!specsOk(title, query, level)) { skipped.specs++; continue; }

      // 5. Parse price
      const raw = it.price;
      const p = typeof raw === 'number' ? Math.round(raw)
        : (raw ? parseInt(String(raw).replace(/[^0-9]/g, ''), 10) : null);
      if (!p || p <= 0) { skipped.price++; continue; }

      // 6. Price sanity
      if (!priceSane(p, est)) { skipped.sane++; continue; }

      console.log(`[ScraperAPI] ✓ ${level}: "${title.substring(0, 60)}" → ₹${p}`);
      return { store: 'Amazon', price: p, inStock: true, url: it.url || `https://www.amazon.in/s?k=${encodeURIComponent(query)}`, name: title };
    }

    console.log(`[ScraperAPI] 0/${items.length} passed (${level}). Rejected: unavail=${skipped.unavail} notLaptop=${skipped.notLaptop} brand=${skipped.brand} specs=${skipped.specs} noPrice=${skipped.price} sane=${skipped.sane}`);
    return null;
  } catch (e) { console.warn('[ScraperAPI] Error:', e); return null; }
}

// ── PUBLIC: Laptop ───────────────────────────
// 1. Strict → 2. Relaxed → 3. Simplified query relaxed → null
export async function fetchLiveAmazonPrice(
  searchQuery: string, brand = '', model = '', aiPrice = 0
): Promise<LivePriceResult | null> {
  const c = livePriceCache.get(searchQuery);
  if (c) { if (!c.inStock) return null; return c; }

  // Step 1 — strict (brand + CPU + GPU + RAM)
  let r = await scrape(searchQuery, brand, model, aiPrice, 'strict', true);
  if (r?.price) { livePriceCache.set(searchQuery, r); return r; }

  // Step 2 — relaxed (brand + GPU only)
  await new Promise(ok => setTimeout(ok, 600));
  r = await scrape(searchQuery, brand, model, aiPrice, 'relaxed', true);
  if (r?.price) { livePriceCache.set(searchQuery, r); return r; }

  // Step 3 — simplified query (brand + model + GPU), no brand check
  const gpu = extractKw(searchQuery, GPU_PAT);
  const simple = `${brand} ${model} laptop${gpu ? ' ' + gpu : ''}`.trim();
  if (simple !== searchQuery && simple.length > 8) {
    r = await scrape(simple, brand, model, aiPrice, 'relaxed', false);
    if (r?.price) { livePriceCache.set(searchQuery, r); return r; }
  }

  console.warn(`[LivePrice] All failed for "${searchQuery}". AI fallback.`);
  return null;
}

// ── PUBLIC: Prebuilt PC ──────────────────────
export async function fetchPrebuiltPCPrice(
  searchQuery: string, aiPrice = 0
): Promise<LivePriceResult | null> {
  const c = livePriceCache.get(`pc_${searchQuery}`);
  if (c) { if (!c.inStock) return null; return c; }
  const brand = searchQuery.split(' ')[0] || '';
  // Pass 'pc' productType to skip laptop filter
  let r = await scrape(searchQuery, brand, '', aiPrice, 'relaxed', false, 'pc');
  if (r?.price) { livePriceCache.set(`pc_${searchQuery}`, r); return r; }
  await new Promise(ok => setTimeout(ok, 800));
  // Use simplified query on retry instead of identical query
  const simplified = searchQuery.split(' ').slice(0, 3).join(' ') + ' desktop pc';
  r = await scrape(simplified, brand, '', aiPrice, 'relaxed', false, 'pc');
  if (r?.price) { livePriceCache.set(`pc_${searchQuery}`, r); return r; }
  return null;
}
