export async function fetchLiveAmazonPrice(searchQuery: string) {
  const token = import.meta.env.VITE_APIFY_API_TOKEN;
  
  if (!token) {
    console.warn("Missing VITE_APIFY_API_TOKEN. Live pricing via Apify is disabled.");
    return null;
  }

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
    
    // 1. Kick off the Apify actor and wait for it to finish (using waitForFinish parameter)
    // Junglee's crawler can take 15-40 seconds, so we wait up to 60 seconds
    const runResponse = await fetch(`https://api.apify.com/v2/acts/junglee~amazon-crawler/runs?token=${token}&waitForFinish=60`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!runResponse.ok) {
      let errorDetails = "";
      try {
        const errJson = await runResponse.json();
        errorDetails = JSON.stringify(errJson);
      } catch(e) { /* ignore */ }
      console.error(`Apify Actor failed to run (Status ${runResponse.status}):`, errorDetails || runResponse.statusText);
      return null;
    }

    const runData = await runResponse.json();
    const defaultDatasetId = runData.data.defaultDatasetId;

    // 2. Fetch the actor results from the default dataset
    const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${token}`);
    
    if (!datasetResponse.ok) {
        console.error(`Failed to fetch dataset items: ${datasetResponse.statusText}`);
        return null;
    }

    const items = await datasetResponse.json();
    
    // 3. Process the scraped items
    if (items && items.length > 0) {
      const topProduct = items[0] as any;
      
      // Apify normally returns price, title, url, etc.
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
    console.error("Failed to fetch live Amazon price via Apify REST API:", error);
    return null;
  }
}
