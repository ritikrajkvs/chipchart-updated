// Dual-provider live pricing: Apify (primary) → RapidAPI (fallback)
// Now with brand-matching and price sanity checks to avoid wrong-product prices.
import { livePriceCache } from './apiCache';

interface LivePriceResult {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
}

// ──────────────────────────────────────────────
// HELPER — does the product title look like the laptop we want?
// ──────────────────────────────────────────────
function titleMatchesBrand(title: string, brand: string): boolean {
  if (!title || !brand) return false;
  return title.toLowerCase().includes(brand.toLowerCase());
}

function isPriceSane(livePrice: number, aiEstimate: number): boolean {
  if (!aiEstimate || aiEstimate <= 0) return true; // can't validate, accept
  // Accept if live price is between 30% and 200% of AI estimate
  return livePrice >= aiEstimate * 0.3 && livePrice <= aiEstimate * 2;
}

// ──────────────────────────────────────────────
// PROVIDER 1 — Apify REST API (junglee/amazon-crawler)
// ──────────────────────────────────────────────
async function fetchViaApify(
  searchQuery: string,
  brand: string,
  aiEstimatedPrice: number
): Promise<LivePriceResult | null> {
  const token = import.meta.env.VITE_APIFY_API_TOKEN;
  if (!token) return null;

  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;

  const input = {
    categoryOrProductUrls: [{ url: searchUrl }],
    maxItems: 5, // fetch more results so we can pick the best match
    proxyConfiguration: { useApifyProxy: true }
  };

  try {
    console.log(`[Apify] Searching: ${searchQuery}`);
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/junglee~amazon-crawler/runs?token=${token}&waitForFinish=120`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      }
    );

    if (!runRes.ok) {
      const errBody = await runRes.text();
      console.warn(`[Apify] Actor error (${runRes.status}):`, errBody);
      return null;
    }

    const runData = await runRes.json();
    const datasetId = runData?.data?.defaultDatasetId;
    if (!datasetId) return null;

    const dsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
    if (!dsRes.ok) return null;

    const items: any[] = await dsRes.json();
    if (!items || items.length === 0) return null;

    // Pick the FIRST item whose title contains the brand name
    for (const item of items) {
      const title = item.title || item.name || '';
      if (!titleMatchesBrand(title, brand)) {
        console.log(`[Apify] Skipping non-matching result: "${title.substring(0, 60)}..."`);
        continue;
      }

      let cleanPrice: number | null = null;
      if (typeof item.price === 'number') cleanPrice = item.price;
      else if (typeof item.price === 'string') cleanPrice = parseInt(item.price.replace(/[^0-9]/g, ''), 10);

      if (!cleanPrice || cleanPrice <= 0) continue;

      // Sanity check: is this price in the right ballpark?
      if (!isPriceSane(cleanPrice, aiEstimatedPrice)) {
        console.log(`[Apify] Price ₹${cleanPrice} is too far from AI estimate ₹${aiEstimatedPrice}. Skipping.`);
        continue;
      }

      console.log(`[Apify] ✓ Matched: "${title.substring(0, 60)}" → ₹${cleanPrice}`);
      return {
        store: 'Amazon',
        price: cleanPrice,
        inStock: item.isAvailable !== false,
        url: item.url || searchUrl
      };
    }

    console.log(`[Apify] No brand-matched result found for "${brand}" in ${items.length} results.`);
    return null;
  } catch (err) {
    console.warn('[Apify] Fetch failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
// PROVIDER 2 — RapidAPI Real-Time Amazon Data (fallback)
// ──────────────────────────────────────────────
async function fetchViaRapidAPI(
  searchQuery: string,
  brand: string,
  aiEstimatedPrice: number
): Promise<LivePriceResult | null> {
  const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  if (!rapidApiKey) return null;

  const url = `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&country=IN&sort_by=RELEVANCE`;

  try {
    console.log(`[RapidAPI] Searching: ${searchQuery}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
      }
    });

    if (!res.ok) {
      console.warn(`[RapidAPI] Failed with status ${res.status}`);
      return null;
    }

    const result = await res.json();
    const products = result.data?.products;
    if (!products || products.length === 0) return null;

    // Scan products for brand match + sane price
    for (const product of products) {
      const title = product.product_title || '';
      if (!titleMatchesBrand(title, brand)) {
        console.log(`[RapidAPI] Skipping non-matching: "${title.substring(0, 60)}..."`);
        continue;
      }

      const cleanPrice = product.product_price
        ? parseInt(product.product_price.replace(/[^0-9]/g, ''), 10)
        : null;

      if (!cleanPrice || cleanPrice <= 0) continue;

      if (!isPriceSane(cleanPrice, aiEstimatedPrice)) {
        console.log(`[RapidAPI] Price ₹${cleanPrice} too far from AI estimate ₹${aiEstimatedPrice}. Skipping.`);
        continue;
      }

      console.log(`[RapidAPI] ✓ Matched: "${title.substring(0, 60)}" → ₹${cleanPrice}`);
      return {
        store: 'Amazon',
        price: cleanPrice,
        inStock: product.is_prime || product.product_price != null,
        url: product.product_url
      };
    }

    console.log(`[RapidAPI] No brand-matched result found for "${brand}" in ${products.length} results.`);
    return null;
  } catch (err) {
    console.warn('[RapidAPI] Fetch failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
// PUBLIC API — try Apify first, then fall back to RapidAPI
// Now accepts brand + aiEstimatedPrice for validation
// ──────────────────────────────────────────────
export async function fetchLiveAmazonPrice(
  searchQuery: string,
  brand: string = '',
  aiEstimatedPrice: number = 0
): Promise<LivePriceResult | null> {
  const cachedPrice = livePriceCache.get(searchQuery);
  if (cachedPrice) {
    console.log(`[LivePrice] Got price from Cache: ₹${cachedPrice.price}`);
    return cachedPrice;
  }

  // 1. Try Apify first
  const apifyResult = await fetchViaApify(searchQuery, brand, aiEstimatedPrice);
  if (apifyResult && apifyResult.price) {
    console.log(`[LivePrice] Got price from Apify: ₹${apifyResult.price}`);
    livePriceCache.set(searchQuery, apifyResult);
    return apifyResult;
  }

  // 2. Apify failed or returned no price — fall back to RapidAPI
  console.log('[LivePrice] Apify failed or returned no data. Falling back to RapidAPI...');
  const rapidResult = await fetchViaRapidAPI(searchQuery, brand, aiEstimatedPrice);
  if (rapidResult && rapidResult.price) {
    console.log(`[LivePrice] Got price from RapidAPI: ₹${rapidResult.price}`);
    livePriceCache.set(searchQuery, rapidResult);
    return rapidResult;
  }

  // 3. Both failed — return null (AI estimate will be used)
  console.warn('[LivePrice] Both providers failed. Using AI estimated price.');
  return null;
}
