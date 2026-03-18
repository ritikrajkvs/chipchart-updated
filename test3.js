import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const tokenMatch = env.match(/VITE_APIFY_API_TOKEN=(.+)/);
const token = tokenMatch ? tokenMatch[1].trim() : '';

const input = {
  startUrls: [
    { url: 'https://www.amazon.in/s?k=ASUS+ROG+Zephyrus+G16&domain=amazon.com' }
  ],
  maxItems: 5
};

async function run() {
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/happitap~amazon-product-scrapper/runs?token=${token}&waitForFinish=60`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    const runData = await res.json();
    let resultLog = `Run Status: ${runData.data.status}\n`;
    
    if (runData.data.status === 'FAILED') {
        const logRes = await fetch(`https://api.apify.com/v2/logs/${runData.data.id}?token=${token}`);
        resultLog += `Log:\n${await logRes.text()}`;
    } else if (runData.data.defaultDatasetId) {
        const dsRes = await fetch(`https://api.apify.com/v2/datasets/${runData.data.defaultDatasetId}/items?token=${token}`);
        const items = await dsRes.json();
        resultLog += `Items: ${items.length}\n`;
        if (items.length > 0) {
            resultLog += `First item title: ${items[0].title}\n`;
            resultLog += `First item price: ${items[0].price}\n`;
            resultLog += `First item URL: ${items[0].url}\n`;
        }
    }
    fs.writeFileSync('apify_hack_result.txt', resultLog);
  } catch (err) {
    fs.writeFileSync('apify_hack_result.txt', `Catch error: ${err.message}`);
  }
}

run();
