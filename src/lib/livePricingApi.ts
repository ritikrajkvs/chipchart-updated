// src/lib/livePricingApi.ts

export async function fetchLiveAmazonPrice(searchQuery: string) {
  const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY; // Requires adding to .env
  
  // If the key is not set, we degrade gracefully by returning null, which uses the AI's estimate.
  if (!rapidApiKey) {
    console.warn("Missing VITE_RAPIDAPI_KEY. Live pricing is disabled.");
    return null;
  }
  
  const url = `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&country=IN&sort_by=RELEVANCE`;
  
  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    
    // Handle RapidAPI rate limits / missing subscription errors gracefully
    if (!response.ok) {
        console.warn(`RapidAPI Amazon search failed with status ${response.status}`);
        return null;
    }
    
    const result = await response.json();
    
    // Check if we got valid products back
    if (result.data && result.data.products && result.data.products.length > 0) {
      // Get the first, most relevant sponsored/organic result
      const topProduct = result.data.products[0]; 
      
      // Remove symbols like '₹' or ',' to convert price to a clean number
      const cleanPrice = topProduct.product_price 
        ? parseInt(topProduct.product_price.replace(/[^0-9]/g, ''), 10) 
        : null;

      return {
        store: 'Amazon',
        price: cleanPrice,
        inStock: topProduct.is_prime || topProduct.product_price != null,
        url: topProduct.product_url
      };
    }
    
    return null; // No results found
  } catch (error) {
    console.error("Failed to fetch live Amazon price:", error);
    return null;
  }
}
