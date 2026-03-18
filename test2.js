import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const tokenMatch = env.match(/VITE_APIFY_API_TOKEN=(.+)/);
const token = tokenMatch ? tokenMatch[1].trim() : '';

const input = {
  searchTerms: ['ASUS ROG Zephyrus G16'],
  maxResults: 5
};

async function run() {
  const res = await fetch(`https://api.apify.com/v2/acts/happitap~amazon-product-scrapper/runs?token=${token}&waitForFinish=60`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  
  const text = await res.text();
  fs.writeFileSync('apify_searchTerms_result.txt', text);
}

run();
