// Live stock verification via Netlify serverless function (free).
// Checks both Amazon India and Flipkart in parallel.
// No paid APIs — uses the /api/verify-stock endpoint.

import { livePriceCache } from './apiCache';

export interface StoreResult {
  store: 'Amazon' | 'Flipkart';
  price: number;
  inStock: boolean;
  url: string;
}

export interface StockCheckResult {
  amazon: StoreResult;
  flipkart: StoreResult;
  inStockAnywhere: boolean;
  lowestPrice: number | null;
}

// ── Netlify verify-stock function (free, both stores) ──────────────────────
async function checkViaNetlify(query: string): Promise<StockCheckResult | null> {
  try {
    const res = await fetch('/api/verify-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const amazon: StoreResult = {
      store: 'Amazon',
      price: data.amazon?.price ?? 0,
      inStock: data.amazon?.available === true,
      url: `https://www.amazon.in/s?k=${encodeURIComponent(query)}&rh=n%3A1375424031`,
    };
    const flipkart: StoreResult = {
      store: 'Flipkart',
      price: data.flipkart?.price ?? 0,
      inStock: data.flipkart?.available === true,
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&otracker=search`,
    };

    const inStockAnywhere = amazon.inStock || flipkart.inStock;
    const prices = [amazon, flipkart].filter(s => s.inStock && s.price > 0).map(s => s.price);

    return {
      amazon,
      flipkart,
      inStockAnywhere,
      lowestPrice: prices.length ? Math.min(...prices) : null,
    };
  } catch (err) {
    console.warn('[Stock Check] Netlify function failed:', err);
    return null;
  }
}

// ── PUBLIC: Verify laptop stock on Amazon + Flipkart ───────────────────────
export async function verifyLaptopStock(
  searchQuery: string,
  _aiPrice: number = 0
): Promise<StockCheckResult> {
  // Check cache first
  const cached = livePriceCache.get(searchQuery);
  if (cached) return cached;

  // Call Netlify function (checks both stores, free)
  const result = await checkViaNetlify(searchQuery);
  if (result) {
    livePriceCache.set(searchQuery, result);
    return result;
  }

  // If Netlify function fails entirely, assume available (graceful degradation)
  // The user can still click through to check manually
  const fallback: StockCheckResult = {
    amazon: {
      store: 'Amazon',
      price: 0,
      inStock: false,
      url: `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}&rh=n%3A1375424031`,
    },
    flipkart: {
      store: 'Flipkart',
      price: 0,
      inStock: false,
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}&otracker=search`,
    },
    inStockAnywhere: true,  // Don't drop laptops just because the API is down
    lowestPrice: null,
  };
  return fallback;
}

// ── PUBLIC: Verify prebuilt PC stock (reuses same function) ─────────────────
export async function verifyPrebuiltStock(
  searchQuery: string,
  _aiPrice: number = 0
): Promise<StockCheckResult> {
  const cacheKey = `pc_${searchQuery}`;
  const cached = livePriceCache.get(cacheKey);
  if (cached) return cached;

  const result = await checkViaNetlify(searchQuery);
  if (result) {
    livePriceCache.set(cacheKey, result);
    return result;
  }

  return {
    amazon: { store: 'Amazon', price: 0, inStock: false, url: `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}` },
    flipkart: { store: 'Flipkart', price: 0, inStock: false, url: `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}` },
    inStockAnywhere: true,
    lowestPrice: null,
  };
}

// ── Legacy exports (for PCResults.tsx backward compat) ──────────────────────
export type LivePriceResult = {
  store: string;
  price: number | null;
  inStock: boolean;
  url: string;
  name?: string;
};

export async function fetchLiveAmazonPrice(
  searchQuery: string, _brand = '', _model = '', aiPrice = 0
): Promise<LivePriceResult | null> {
  const result = await verifyLaptopStock(searchQuery, aiPrice);
  if (result.amazon.inStock && result.amazon.price > 0) {
    return { store: 'Amazon', price: result.amazon.price, inStock: true, url: result.amazon.url };
  }
  if (result.flipkart.inStock && result.flipkart.price > 0) {
    return { store: 'Flipkart', price: result.flipkart.price, inStock: true, url: result.flipkart.url };
  }
  return null;
}

export async function fetchPrebuiltPCPrice(
  searchQuery: string, aiPrice = 0
): Promise<LivePriceResult | null> {
  const result = await verifyPrebuiltStock(searchQuery, aiPrice);
  if (result.inStockAnywhere && result.lowestPrice) {
    const best = result.amazon.inStock ? result.amazon : result.flipkart;
    return { store: best.store, price: best.price, inStock: true, url: best.url };
  }
  return null;
}
