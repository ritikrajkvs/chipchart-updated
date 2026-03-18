// Dual-provider live pricing: Apify (primary) → RapidAPI (fallback)
import { livePriceCache } from './apiCache';

interface LivePriceResult {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
}

// ──────────────────────────────────────────────
// PROVIDER 1 — Apify REST API (junglee/amazon-crawler)
// ──────────────────────────────────────────────
async function fetchViaApify(searchQuery: string): Promise<LivePriceResult | null> {
  const token = import.meta.env.VITE_APIFY_API_TOKEN;
  if (!token) return null;

  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;

  const input = {
    categoryOrProductUrls: [{ url: searchUrl }],
    maxItems: 1,
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

    const top = items[0];
    let cleanPrice: number | null = null;
    if (typeof top.price === 'number') cleanPrice = top.price;
    else if (typeof top.price === 'string') cleanPrice = parseInt(top.price.replace(/[^0-9]/g, ''), 10);

    return {
      store: 'Amazon',
      price: cleanPrice,
      inStock: top.isAvailable !== false,
      url: top.url || searchUrl
    };
  } catch (err) {
    console.warn('[Apify] Fetch failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
// PROVIDER 2 — RapidAPI Real-Time Amazon Data (fallback)
// ──────────────────────────────────────────────
async function fetchViaRapidAPI(searchQuery: string): Promise<LivePriceResult | null> {
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
    if (result.data?.products?.length > 0) {
      const top = result.data.products[0];
      const cleanPrice = top.product_price
        ? parseInt(top.product_price.replace(/[^0-9]/g, ''), 10)
        : null;

      return {
        store: 'Amazon',
        price: cleanPrice,
        inStock: top.is_prime || top.product_price != null,
        url: top.product_url
      };
    }
    return null;
  } catch (err) {
    console.warn('[RapidAPI] Fetch failed:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
// PUBLIC API — try Apify first, then fall back to RapidAPI
// ──────────────────────────────────────────────
export async function fetchLiveAmazonPrice(searchQuery: string): Promise<LivePriceResult | null> {
  const cachedPrice = livePriceCache.get(searchQuery);
  if (cachedPrice) {
    console.log(`[LivePrice] Got price from Cache: ₹${cachedPrice.price}`);
    return cachedPrice;
  }

  // 1. Try Apify first
  const apifyResult = await fetchViaApify(searchQuery);
  if (apifyResult && apifyResult.price) {
    console.log(`[LivePrice] Got price from Apify: ₹${apifyResult.price}`);
    livePriceCache.set(searchQuery, apifyResult);
    return apifyResult;
  }

  // 2. Apify failed or returned no price — fall back to RapidAPI
  console.log('[LivePrice] Apify failed or returned no data. Falling back to RapidAPI...');
  const rapidResult = await fetchViaRapidAPI(searchQuery);
  if (rapidResult && rapidResult.price) {
    console.log(`[LivePrice] Got price from RapidAPI: ₹${rapidResult.price}`);
    livePriceCache.set(searchQuery, rapidResult);
    return rapidResult;
  }

  // 3. Both failed — return null (AI estimate will be used)
  console.warn('[LivePrice] Both providers failed. Using AI estimated price.');
  return null;
}
