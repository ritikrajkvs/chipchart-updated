// Live pricing via ScraperAPI ONLY.
// Retry: strict (1x) → relaxed (1x) → AI estimate fallback.
// No substitution — laptop card always shows Gemini specs.
import { livePriceCache } from './apiCache';

export interface LivePriceResult {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
  name?: string;
}

// ── HELPERS ──────────────────────────────────

function titleMatchesBrand(title: string, brand: string, model: string = ''): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (brand && t.includes(brand.toLowerCase())) return true;
  if (model) {
    for (const w of model.toLowerCase().split(/\s+/).filter(w => w.length > 3)) {
      if (t.includes(w)) return true;
    }
  }
  return false;
}

function extractKw(query: string, patterns: RegExp[]): string | null {
  const q = query.toLowerCase();
  for (const p of patterns) {
    const m = q.match(p);
    if (m) return m[1].replace(/\s+/g, ' ');
  }
  return null;
}

function hasKw(title: string, kw: string): boolean {
  const t = title.toLowerCase();
  return t.includes(kw) || t.includes(kw.replace(/\s+/g, '')) || t.includes(kw.replace(/(\d)([a-z])/g, '$1 $2'));
}

const CPU_PAT = [/\b(i[3579])\b/, /\b(ryzen\s*[3579])\b/, /\b(ryzen\s*ai\s*[3579])\b/, /\b(ultra\s*[579])\b/, /\b(m[1234]\s*(?:pro|max|ultra)?)\b/];
const GPU_PAT = [/\b(rtx\s*\d{4})\b/, /\b(gtx\s*\d{4})\b/, /\b(radeon\s*\w+)\b/, /\b(arc\s*\w+)\b/];

type Level = 'strict' | 'relaxed';

/** strict = brand+CPU+GPU+RAM, relaxed = brand+GPU only */
function matchesSpecs(title: string, query: string, level: Level): boolean {
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

function isUnavailable(title: string, avail?: string): boolean {
  const chk = (s: string) => { const l = s.toLowerCase(); return l.includes('currently unavailable') || l.includes('out of stock') || l.includes('not available'); };
  return !!(avail && chk(avail)) || !!(title && chk(title));
}

function priceSane(live: number, est: number): boolean {
  if (!est || est <= 0) return true;
  return live >= est * 0.4 && live <= est * 1.6;
}

// ── ScraperAPI ───────────────────────────────
async function scrape(
  query: string, brand: string, model: string, est: number, level: Level, checkBrand: boolean
): Promise<LivePriceResult | null> {
  const key = import.meta.env.VITE_SCRAPERAPI_KEY || '2dda48aa467fa879a9910a01baafddc4';
  if (!key) return null;
  const url = `https://api.scraperapi.com/structured/amazon/search?api_key=${key}&query=${encodeURIComponent(query)}&country=in`;
  try {
    console.log(`[ScraperAPI] ${level}${checkBrand ? '' : ' no-brand'}: ${query}`);
    const res = await fetch(url);
    if (!res.ok) { console.warn(`[ScraperAPI] ${res.status}`); return null; }
    const items = (await res.json()).results;
    if (!Array.isArray(items) || !items.length) return null;
    for (const it of items) {
      const t = it.name || '';
      if (isUnavailable(t, it.availability)) continue;
      if (checkBrand && !titleMatchesBrand(t, brand, model)) continue;
      if (!matchesSpecs(t, query, level)) continue;
      const raw = it.price;
      const p = typeof raw === 'number' ? Math.round(raw) : (raw ? parseInt(String(raw).replace(/[^0-9]/g, ''), 10) : null);
      if (!p || p <= 0 || !priceSane(p, est)) continue;
      console.log(`[ScraperAPI] ✓ ${level}: "${t.substring(0, 60)}" → ₹${p}`);
      return { store: 'Amazon', price: p, inStock: true, url: it.url || `https://www.amazon.in/s?k=${encodeURIComponent(query)}`, name: t };
    }
    console.log(`[ScraperAPI] 0/${items.length} matched (${level}).`);
    return null;
  } catch (e) { console.warn('[ScraperAPI]', e); return null; }
}

// ── PUBLIC: Laptop ───────────────────────────
// 1. Strict (brand+CPU+GPU+RAM) → 2. Relaxed (brand+GPU only) → null
export async function fetchLiveAmazonPrice(
  searchQuery: string, brand = '', model = '', aiPrice = 0
): Promise<LivePriceResult | null> {
  const c = livePriceCache.get(searchQuery);
  if (c) { if (!c.inStock) return null; return c; }

  // Step 1 — strict
  let r = await scrape(searchQuery, brand, model, aiPrice, 'strict', true);
  if (r?.price) { livePriceCache.set(searchQuery, r); return r; }

  // Step 2 — relaxed (brand+GPU only, skips CPU+RAM check)
  await new Promise(ok => setTimeout(ok, 800));
  r = await scrape(searchQuery, brand, model, aiPrice, 'relaxed', true);
  if (r?.price) { livePriceCache.set(searchQuery, r); return r; }

  // Step 3 — simplified query (brand + model + GPU), relaxed
  const gpu = extractKw(searchQuery, GPU_PAT);
  const simple = `${brand} ${model}${gpu ? ' ' + gpu : ''}`.trim();
  if (simple !== searchQuery && simple.length > 5) {
    r = await scrape(simple, brand, model, aiPrice, 'relaxed', false);
    if (r?.price) { livePriceCache.set(searchQuery, r); return r; }
  }

  console.warn(`[LivePrice] Failed for "${searchQuery}". AI fallback.`);
  return null;
}

// ── PUBLIC: Prebuilt PC ──────────────────────
export async function fetchPrebuiltPCPrice(
  searchQuery: string, aiPrice = 0
): Promise<LivePriceResult | null> {
  const c = livePriceCache.get(`pc_${searchQuery}`);
  if (c) { if (!c.inStock) return null; return c; }
  const brand = searchQuery.split(' ')[0] || '';
  let r = await scrape(searchQuery, brand, '', aiPrice, 'relaxed', false);
  if (r?.price) { livePriceCache.set(`pc_${searchQuery}`, r); return r; }
  await new Promise(ok => setTimeout(ok, 800));
  r = await scrape(searchQuery, brand, '', aiPrice, 'relaxed', false);
  if (r?.price) { livePriceCache.set(`pc_${searchQuery}`, r); return r; }
  return null;
}
