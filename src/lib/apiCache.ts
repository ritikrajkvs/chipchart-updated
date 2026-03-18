// src/lib/apiCache.ts

// Clear old laptop cache entries on load (ensures fresh data for all users)
(function clearOldLaptopCache() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('gemini_cache_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const { timestamp } = JSON.parse(raw);
          // Remove if older than 3 days
          if (Date.now() - timestamp > 259200000) {
            localStorage.removeItem(key);
            console.log(`[Cache] Cleared old laptop cache: ${key.substring(0, 40)}...`);
          }
        }
      }
    }
  } catch (e) { /* ignore */ }
})();
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
    localStorage.setItem(
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
    }
    return null;
  },
  
  set: (searchQuery: string, data: any) => {
    localStorage.setItem(
      `live_price_${searchQuery}`, 
      JSON.stringify({ data, timestamp: Date.now() })
    );
  }
};

// PC-specific cache — 7 days (604800000 ms)
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
      // 7 days
      if (Date.now() - timestamp < 604800000) {
        return data;
      }
    }
    return null;
  },
  set: (keyObj: Record<string, any>, data: any) => {
    const sortedKey = Object.keys(keyObj).sort().reduce((acc, k) => {
      acc[k] = keyObj[k];
      return acc;
    }, {} as any);
    const key = JSON.stringify(sortedKey);
    localStorage.setItem(
      `pc_cache_${key}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  }
};
