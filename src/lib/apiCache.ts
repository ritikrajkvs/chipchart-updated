// src/lib/apiCache.ts

export const apiCache = {
  get: (keyObj: Record<string, any>) => {
    // Convert the user's answers into a string to use as a storage key
    const key = JSON.stringify(keyObj);
    const cached = localStorage.getItem(`gemini_cache_${key}`);
    
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Cache expires after 2 hours (2 * 60 * 60 * 1000 milliseconds)
      if (Date.now() - timestamp < 7200000) {
        return data;
      }
    }
    return null;
  },
  
  set: (keyObj: Record<string, any>, data: any) => {
    const key = JSON.stringify(keyObj);
    localStorage.setItem(
      `gemini_cache_${key}`, 
      JSON.stringify({ data, timestamp: Date.now() })
    );
  }
};
