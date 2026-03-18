// src/lib/apiCache.ts

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
      // Cache expires after 48 hours (48 * 60 * 60 * 1000 milliseconds)
      if (Date.now() - timestamp < 172800000) {
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
