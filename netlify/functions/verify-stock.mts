import type { Context } from "@netlify/functions";
import * as cheerio from "cheerio";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Amazon India ──────────────────────────────────────────────────────────────
async function checkAmazon(query: string) {
  try {
    const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}&ref=nb_sb_noss`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-IN,en;q=0.9",
        Accept: "text/html",
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const brandMatch = query.split(' ')[0].toLowerCase();

    let bestPrice: number | null = null;
    let isAvailable = false;

    $('[data-component-type="s-search-result"]').each((_, el) => {
      const text = $(el).text().toLowerCase();
      
      if (!text.includes(brandMatch)) return;

      const priceEl = $(el).find('.a-price-whole').first();
      if (!priceEl.length) return;

      const priceText = priceEl.text().replace(/[,.]/g, '');
      const price = parseInt(priceText, 10);
      
      if (isNaN(price) || price < 15000) return;

      const unavailable = text.includes("currently unavailable");
      
      if (!unavailable && (bestPrice === null || price < bestPrice)) {
        bestPrice = price;
        isAvailable = true;
      }
    });

    return {
      available: isAvailable,
      price: bestPrice,
      source: "Amazon",
    };
  } catch (err) {
    console.error("[verify-stock] Amazon check failed:", err);
    return { available: false, price: null, source: "Amazon", error: true };
  }
}

// ── Flipkart ──────────────────────────────────────────────────────────────────
async function checkFlipkart(query: string) {
  try {
    const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&otracker=search&as-show=on`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-IN,en;q=0.9",
        Accept: "text/html",
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const brandMatch = query.split(' ')[0].toLowerCase();

    let bestPrice: number | null = null;
    let isAvailable = false;

    $('[data-id], ._1AtVbE').each((_, el) => {
      const text = $(el).text().toLowerCase();
      
      if (!text.includes(brandMatch)) return;

      const priceMatch = text.match(/₹([\d,]+)/);
      if (!priceMatch) return;

      const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
      if (isNaN(price) || price < 15000) return;

      const unavailable = text.includes("currently unavailable") || text.includes("out of stock") || text.includes("coming soon");
      
      if (!unavailable && (bestPrice === null || price < bestPrice)) {
        bestPrice = price;
        isAvailable = true;
      }
    });

    return {
      available: isAvailable,
      price: bestPrice,
      source: "Flipkart",
    };
  } catch (err) {
    console.error("[verify-stock] Flipkart check failed:", err);
    return { available: false, price: null, source: "Flipkart", error: true };
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async (req: Request, _context: Context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'query' in request body" }),
        { status: 400, headers }
      );
    }

    // Check both stores in parallel
    const [amazon, flipkart] = await Promise.all([
      checkAmazon(query),
      checkFlipkart(query),
    ]);

    return new Response(
      JSON.stringify({ amazon, flipkart, query }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("[verify-stock] Handler error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/verify-stock",
};
