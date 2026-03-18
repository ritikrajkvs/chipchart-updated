import { ApifyClient } from 'apify-client';

export async function fetchLiveAmazonPrice(searchQuery: string) {
  const token = import.meta.env.VITE_APIFY_API_TOKEN;
  
  if (!token) {
    console.warn("Missing VITE_APIFY_API_TOKEN. Live pricing via Apify is disabled.");
    return null;
  }

  const client = new ApifyClient({ token });

  // Use the Amazon India search URL format with the product query
  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
  
  const input = {
    categoryOrProductUrls: [
        { url: searchUrl }
    ],
    maxItems: 1, // Only need the top result to get the price
    proxyConfiguration: {
        useApifyProxy: true
    }
  };

  try {
    console.log(`Starting Apify run for ${searchQuery}...`);
    // Run the junglee actor and wait for it to finish (WARNING: THIS WILL TAKE TIME IN THE UI)
    const run = await client.actor("junglee/amazon-crawler").call(input);

    // Fetch actor results
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (items && items.length > 0) {
      const topProduct = items[0] as any;
      
      // Apify normally returns price, title, url, etc. Convert price to number.
      let cleanPrice = null;
      if (typeof topProduct.price === 'number') {
        cleanPrice = topProduct.price;
      } else if (typeof topProduct.price === 'string') {
        cleanPrice = parseInt(topProduct.price.replace(/[^0-9]/g, ''), 10);
      }
      
      return {
        store: 'Amazon',
        price: cleanPrice,
        inStock: topProduct.isAvailable !== false, // Fallback to true if unknown
        url: topProduct.url || searchUrl
      };
    }
    
    return null;
  } catch (error) {
    console.error("Failed to fetch live Amazon price via Apify:", error);
    return null;
  }
}
