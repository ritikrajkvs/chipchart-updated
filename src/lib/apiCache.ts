// src/lib/apiCache.ts

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // localStorage full — clear oldest cache entries and retry
    console.warn('[Cache] Storage full, clearing old entries');
    const keys = Object.keys(localStorage).filter(
      k => k.startsWith('gemini_cache_') || k.startsWith('live_price_') || k.startsWith('pc_cache_')
    );
    keys.sort().slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    try { localStorage.setItem(key, value); } catch { /* give up */ }
  }
}

export const apiCache = {
  get: (keyObj: Record<string, any>) => {
    // Sort keys to ensure consistent cache lookups
    const sortedKey = Object.keys(keyObj).sort().reduce((acc, k) => {
      acc[k] = keyObj[k];
      return acc;
    }, {} as any);
    const key = JSON.stringify(sortedKey);
    const cached = localStorage.getItem(`gemini_cache_${key}`);
    
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Cache expires after 3 days (3 * 24 * 60 * 60 * 1000 = 259200000 ms)
      if (Date.now() - timestamp < 259200000) {
        return data;
      }
      // Expired — clean up
      localStorage.removeItem(`gemini_cache_${key}`);
    }
    return null;
  },
  
  set: (keyObj: Record<string, any>, data: any) => {
    // Sort keys to ensure consistent cache lookups
    const sortedKey = Object.keys(keyObj).sort().reduce((acc, k) => {
      acc[k] = keyObj[k];
      return acc;
    }, {} as any);
    const key = JSON.stringify(sortedKey);
    safeSetItem(
      `gemini_cache_${key}`, 
      JSON.stringify({ data, timestamp: Date.now() })
    );
  }
};

export const livePriceCache = {
  get: (searchQuery: string) => {
    const cached = localStorage.getItem(`live_price_${searchQuery}`);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 86400000) {
        return data;
      }
      localStorage.removeItem(`live_price_${searchQuery}`);
    }
    return null;
  },
  
  set: (searchQuery: string, data: any) => {
    safeSetItem(
      `live_price_${searchQuery}`, 
      JSON.stringify({ data, timestamp: Date.now() })
    );
  }
};

// PC-specific cache — 3 days (259200000 ms)
export const pcCache = {
  get: (keyObj: Record<string, any>) => {
    const sortedKey = Object.keys(keyObj).sort().reduce((acc, k) => {
      acc[k] = keyObj[k];
      return acc;
    }, {} as any);
    const key = JSON.stringify(sortedKey);
    const cached = localStorage.getItem(`pc_cache_${key}`);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // 3 days
      if (Date.now() - timestamp < 259200000) {
        return data;
      }
      localStorage.removeItem(`pc_cache_${key}`);
    }
    return null;
  },
  set: (keyObj: Record<string, any>, data: any) => {
    const sortedKey = Object.keys(keyObj).sort().reduce((acc, k) => {
      acc[k] = keyObj[k];
      return acc;
    }, {} as any);
    const key = JSON.stringify(sortedKey);
    safeSetItem(
      `pc_cache_${key}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  }
};
