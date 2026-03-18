import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const tokenMatch = env.match(/VITE_APIFY_API_TOKEN=(.+)/);
const token = tokenMatch ? tokenMatch[1].trim() : '';

// 1. Try with startUrls and maxItems (as maxItems is another common Apify param name)
const input1 = {
  startUrls: [{ url: 'https://www.amazon.in/s?k=' + encodeURIComponent('ASUS ROG Zephyrus G16') }],
  maxItems: 5,
  useApifyProxy: true
};

// 2. Try with searchTerms and maxResults
const input2 = {
  searchTerms: ['ASUS ROG Zephyrus G16'],
  maxResults: 5
};

// 3. Try exactly as we have it now (which failed for the user)
const input3 = {
  startUrls: [{ url: 'https://www.amazon.in/s?k=' + encodeURIComponent('ASUS ROG Zephyrus G16') }],
  maxResults: 5,
  useApifyProxy: true
};

async function testActor(input, name) {
  console.log(`\nTesting ${name}...`);
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/happitap~amazon-product-scrapper/runs?token=${token}&waitForFinish=60`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    if (!res.ok) {
        console.log(`[${name}] Error starting run:`, await res.text());
        return;
    }
    
    const runData = await res.json();
    console.log(`[${name}] Run Status:`, runData.data.status);
    
    if (runData.data.status === 'FAILED') {
        const logRes = await fetch(`https://api.apify.com/v2/logs/${runData.data.id}?token=${token}`);
        const text = await logRes.text();
        console.log(`[${name}] Log excerpt:\\n`, text.substring(0, 500) + '...');
        return;
    }
    
    const datasetId = runData.data.defaultDatasetId;
    if (datasetId) {
        const dsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
        const items = await dsRes.json();
        console.log(`[${name}] Items found:`, items.length);
        if (items.length > 0) {
            console.log(`[${name}] First item title:`, items[0].title);
        }
    }
  } catch (err) {
    console.error(`[${name}] Catch error:`, err.message);
  }
}

async function run() {
  await testActor(input1, 'input1_startUrls_maxItems');
  await testActor(input2, 'input2_searchTerms');
  await testActor(input3, 'input3_startUrls_maxResults');
}

run();
