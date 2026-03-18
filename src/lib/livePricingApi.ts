export async function fetchLiveAmazonPrice(searchQuery: string) {
  const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY; 
  
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
    
    if (!response.ok) {
        console.warn(`RapidAPI Amazon search failed with status ${response.status}`);
        return null;
    }
    
    const result = await response.json();
    
    if (result.data && result.data.products && result.data.products.length > 0) {
      const topProduct = result.data.products[0]; 
      
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
    
    return null;
  } catch (error) {
    console.error("Failed to fetch live Amazon price via RapidAPI:", error);
    return null;
  }
}
