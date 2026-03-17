import { GoogleGenerativeAI } from "@google/generative-ai";
import { QuestionnaireAnswers } from "@/store/questionnaireStore";
import { PCBuild, LaptopRecommendation } from "./recommendationEngine";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.error("VITE_GEMINI_API_KEY is missing in .env");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

/*
-------------------------------------
Robust Model Fallback Wrapper
-------------------------------------
*/

const FALLBACK_MODELS = [
  // ------ HIGHEST RPD FIRST ------
  "gemini-3.1-flash-lite-preview",  // 🥇 500 RPD — best daily budget
  "gemini-2.5-flash-lite",          // 🥈 20 RPD — untouched, fast
  "gemini-2.0-flash",               // 🥉 untouched daily quota
  "gemini-2.0-flash-lite",          //    untouched daily quota
  // "gemini-2.0-flash-exp",        //    (Removed, returning 404)
  "gemini-flash-latest",            //    alias — varies
  // ------ NEARLY EXHAUSTED ------
  "gemini-3-flash-preview",         // ⚠️  18/20 RPD used (~2 left)
  // ------ EXCEEDED — last resort --
  "gemini-2.5-flash",               // 🔴 21/20 RPD exceeded
];

// Extract suggested retry delay (in ms) from the API error message
function getRetryDelay(err: any): number {
  try {
    const match = err.message?.match(/retryDelay["\s:]+(\d+)s/);
    if (match) return parseInt(match[1]) * 1000 + 500; // Add 500ms buffer
  } catch { };
  return 2000; // Default 2s fallback delay
}

async function generateWithFallback(prompt: string) {
  let lastError = null;

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const modelName = FALLBACK_MODELS[i];
    let retries = 0;
    const maxRetriesPerModel = 3;

    while (retries < maxRetriesPerModel) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          tools: [
            {
              googleSearch: {}
            } as any,
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 8192
          }
        });

        const result = await model.generateContent(prompt);
        console.log(`[Gemini API] Success with model: ${modelName} after ${retries} retries`);
        return result;

      } catch (err: any) {
        lastError = err;

        const is429 = err.message?.includes("429") || err.message?.includes("Too Many Requests");
        const isDailyLimit = err.message?.includes("Quota exceeded") || err.message?.includes("PerDay") || err.message?.includes("daily");

        // If the model hit a daily limit (limit: 0), skip it immediately — no point waiting
        if (is429 && isDailyLimit) {
          console.warn(`[Gemini API] ${modelName} hit DAILY quota. Skipping to next model.`);
          break; // Break the while loop to move to the next model in the for loop
        }

        // If it's a per-minute limit (RPM), wait and retry the SAME model
        if (is429) {
          retries++;
          if (retries >= maxRetriesPerModel) {
            console.warn(`[Gemini API] ${modelName} RPM rate limit exhausted after ${retries} retries. Skipping to next model.`);
            break; // Move to the next model
          }
          const baseDelay = getRetryDelay(err);
          // Exponential backoff: 2s, 4s, 8s...
          const exponentialDelay = baseDelay * Math.pow(2, retries - 1);
          console.warn(`[Gemini API] Rate limited on ${modelName}. Waiting ${exponentialDelay}ms before retry ${retries}/${maxRetriesPerModel}...`);
          await new Promise(r => setTimeout(r, exponentialDelay));
          continue; // Retry the same model
        }

        // For non-quota errors (404, 500, etc.) try the next model after a short delay
        console.warn(`[Gemini API] Failed with ${modelName}:`, err.message?.substring(0, 120));
        if (i < FALLBACK_MODELS.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
        break; // Break the retry loop to move to the next model
      }
    }
  }

  // All models exhausted
  const is429 = (lastError as any)?.message?.includes("429");
  if (is429) {
    throw new Error("All Gemini models are currently rate-limited. Please wait a minute and try again.");
  }
  throw lastError;
}


/*
-------------------------------------
Safe JSON extraction from AI output
-------------------------------------
*/

function extractJSON(text: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1) {
    throw new Error("Invalid JSON returned from Gemini");
  }

  let jsonStr = text.slice(start, end + 1);
  // Fix common JSON errors: remove trailing commas
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
  return jsonStr;
}

/*
=====================================
PC BUILD RECOMMENDER
=====================================
*/

export async function fetchGeminiPCBuilds(
  answers: QuestionnaireAnswers
): Promise<PCBuild[]> {
  if (!apiKey) {
    throw new Error("Gemini API key missing");
  }

  const purpose = answers.purpose || 'general';
  const budget = answers.budget || 100000;
  const resolution = answers.targetResolution || '1080p';
  const cpuBrand = answers.cpuBrandPreference === 'intel'
    ? 'STRICTLY use Intel CPUs (Core i3/i5/i7/i9 series only)'
    : answers.cpuBrandPreference === 'amd'
      ? 'STRICTLY use AMD CPUs (Ryzen 3/5/7/9 series only)'
      : 'Choose the best CPU brand (Intel or AMD) for performance and value';
  const upgradability = answers.upgradabilityPriority === 'future-proof'
    ? 'Use a high-quality upgradeable platform: Z-series (Intel) or X570/B650E (AMD) motherboard, DDR5, PCIe 5.0'
    : answers.upgradabilityPriority === 'budget-tight'
      ? 'Maximise raw performance, do not overspend on the motherboard or extras'
      : 'Balanced mid-range motherboard (B760/B650) with some future headroom';
  const ram = answers.ramRequirement === '32gb-plus' ? '32 GB minimum RAM'
    : answers.ramRequirement === '8gb' ? '8 GB RAM'
      : '16 GB RAM';
  const formFactor = answers.pcFormFactor === 'compact' ? 'Mini-ITX form factor (small build)'
    : answers.pcFormFactor === 'full-tower' ? 'Full-Tower E-ATX (workstation-class)'
      : 'Mid-Tower ATX (standard, most common)';
  const style = answers.pcVisualStyle === 'rgb' ? 'RGB case with tempered glass panel'
    : answers.pcVisualStyle === 'white' ? 'White/clean aesthetic case'
      : 'Stealth/Minimal all-black case';

  const prompt = `You are an expert PC builder in India. Generate exactly 3 PC build recommendations as a JSON array. Do not include any text before or after the JSON array.

User Requirements:
- Purpose: ${purpose}
- Budget: ${budget} INR (total for ALL parts combined)
- Target Resolution: ${resolution} — choose GPU power accordingly (1080p = mid GPU, 1440p = high GPU, 4K = flagship GPU)
- CPU Brand: ${cpuBrand}
- Upgradability Priority: ${upgradability}
- RAM: ${ram}
- Case Form Factor: ${formFactor}
- Aesthetic: ${style}
${(answers as any)._excludeNames ? `- EXCLUDE these builds: ${(answers as any)._excludeNames}` : ''}

Rules:
- Builds must be: type 1 = performance, type 2 = value, type 3 = prebuilt
- component "name" field must NOT include the brand name
- component "sku" MUST be the precise Manufacturer Part Number (MPN) or global product code.
- All components must be real products available in India
- Prices must be ACCURATE to the CURRENT INDIAN MARKET (MSRP or typical retail price) in INR. Do not use outdated prices.
- GPU must be appropriate for ${resolution} gaming at the given budget
- Strictly obey the CPU brand constraint stated above

Return ONLY this JSON array:
[
  {
    "type": "performance",
    "name": "Build name",
    "components": {
      "cpu": { "id": "cpu-1", "sku": "AMD-R5-7600", "category": "CPU", "brand": "AMD", "name": "Ryzen 5 7600", "specs": { "cores": 6, "speed": "3.8GHz" }, "performanceScore": 80, "price": 20000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=AMD+Ryzen+5+7600" } },
      "gpu": { "id": "gpu-1", "sku": "NVIDIA-RTX4060", "category": "GPU", "brand": "Nvidia", "name": "RTX 4060", "specs": { "vram": "8GB" }, "performanceScore": 82, "price": 30000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=RTX+4060" } },
      "ram": { "id": "ram-1", "sku": "RAM-16GB", "category": "RAM", "brand": "Corsair", "name": "Vengeance 16GB DDR5", "specs": { "size": "16GB", "speed": "5200MHz" }, "performanceScore": 75, "price": 6000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=Corsair+Vengeance+16GB+DDR5" } },
      "ssd": { "id": "ssd-1", "sku": "SSD-1TB", "category": "SSD", "brand": "Samsung", "name": "970 Evo Plus 1TB", "specs": { "capacity": "1TB", "speed": "3500MB/s" }, "performanceScore": 85, "price": 7000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=Samsung+970+Evo+Plus+1TB" } },
      "psu": { "id": "psu-1", "sku": "PSU-650W", "category": "PSU", "brand": "EVGA", "name": "SuperNOVA 650W Gold", "specs": { "wattage": "650W", "rating": "80+ Gold" }, "performanceScore": 80, "price": 6000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=EVGA+650W+Gold" } },
      "case": { "id": "case-1", "sku": "CASE-MID", "category": "CASE", "brand": "NZXT", "name": "H510", "specs": { "formFactor": "Mid-Tower" }, "performanceScore": 78, "price": 7000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=NZXT+H510" } },
      "motherboard": { "id": "mobo-1", "sku": "MOBO-B650", "category": "MOBO", "brand": "MSI", "name": "B650 Tomahawk", "specs": { "socket": "AM5", "chipset": "B650" }, "performanceScore": 78, "price": 15000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=MSI+B650+Tomahawk" } },
      "cooler": { "id": "cooler-1", "sku": "COOLER-AIR", "category": "COOLER", "brand": "be quiet!", "name": "Pure Rock 2", "specs": { "type": "Air", "tdp": "150W" }, "performanceScore": 76, "price": 3000, "buyLinks": { "amazon": "https://www.amazon.in/s?k=be+quiet+Pure+Rock+2" } }
    },
    "totalPrice": 94000,
    "performanceScore": 82,
    "compatibility": { "isCompatible": true, "checks": [{ "name": "CPU-Motherboard Socket", "passed": true, "message": "AM5 compatible" }] },
    "bottleneck": { "percentage": 5, "bottleneckComponent": "Balanced", "explanation": "Well-balanced build" },
    "fpsEstimates": [{ "game": "Valorant", "fps": { "low": 200, "medium": 180, "high": 150, "ultra": 100 } }],
    "alternatives": {}
  }
]

Replace the example above with 3 real builds (performance, value, prebuilt) matching the user requirements. Ensure totalPrice roughly equals sum of component prices and stays within the ${budget} INR budget.

SPECIAL RULES FOR THE "prebuilt" TYPE:
- This CANNOT be static. You MUST choose a real pre-built PC available in India that EXACTLY fits the user's Rs.${budget} budget and ${purpose} purpose.
- Do NOT just default to an HP Omen if it is over/under budget. Pick the BEST prebuilt for Rs.${budget}.
- STRICT RESTRICTION: The prebuilt MUST be a fully assembled Desktop Tower PC. You are FORBIDDEN from suggesting a Laptop, a barebone Mini-PC, or an empty PC Cabinet/Case. It must be a complete, running desktop system with CPU, GPU, RAM, Motherboard, PSU, and Case included in the prebuilt package.
- Add these EXTRA fields ONLY on the prebuilt object (not on performance/value builds):
  "prebuiltBrand": "HP",
  "prebuiltModel": "HP Omen 45L GT22",
  "prebuiltShortDescription": "Ready to game. Plug in and play—no assembly needed.",
  "prebuiltBuyLink": "https://www.amazon.in/s?k=HP+Omen+45L+GT22"
- The prebuiltBuyLink should be a precise Amazon India product search URL for that exact model.
- The components for the prebuilt should list what comes inside the chassis (CPU, GPU, RAM, SSD etc.) so users know exactly what they're getting.

Return ONLY the JSON array.`;


  try {
    const result = await generateWithFallback(prompt);

    const response = await result.response;

    let text = response.text();

    text = extractJSON(text);

    const builds: PCBuild[] = JSON.parse(text);

    return builds;
  } catch (error) {
    console.error("Gemini PC Build Error:", error);
    throw error;
  }
}

/*
=====================================
LAPTOP RECOMMENDER
=====================================
*/

export async function fetchGeminiLaptops(
  answers: QuestionnaireAnswers
): Promise<LaptopRecommendation[]> {
  if (!apiKey) {
    throw new Error("Gemini API key missing");
  }

  const isGaming = ['gaming', 'streamer', 'content-creator', 'video-editing'].includes(answers.purpose || '');

  const brandConstraint = (() => {
    const brands = answers.laptopBrandPreference ?? [];
    const filtered = brands.filter(b => b !== 'no-preference');
    if (filtered.length === 0) return 'Any brand — pick the absolute best value for the budget.';
    return `ONLY recommend laptops from: ${filtered.map(b => b.toUpperCase()).join(', ')}. Do not suggest any other brand.`;
  })();

  const screenSizeHint = answers.screenSize === 'compact' ? 'CRITICAL: MUST be 13-inch or 14-inch screen (DO NOT suggest 15-inch or larger).' : answers.screenSize === 'large' ? 'CRITICAL: MUST be 16-inch or 17-inch+ screen.' : 'Standard 15-inch or 16-inch screen.';
  const mobilityHint = answers.mobility === 'on-the-go' ? 'CRITICAL: MUST be highly portable, ultra-lightweight (under 1.6kg). DO NOT suggest heavy or bulky laptops (like gaming bricks) if this is selected. MUST have long battery life.' : answers.mobility === 'stationary' ? 'Weight & battery life are not critical. Can be a thick, heavy desktop replacement or high-performance gaming laptop.' : 'Moderate weight (1.7kg - 2.2kg) and average battery.';
  const buildHint = answers.buildMaterial === 'premium-metal' ? 'MUST have a premium Aluminum or Magnesium chassis. Avoid mostly plastic bodies.' : 'Any build material is acceptable.';
  const storageHint = answers.storageSize === 'massive' ? 'MUST have at least 2TB SSD.' : answers.storageSize === 'ample' ? 'MUST have at least 1TB SSD.' : 'At least 512GB SSD.';
  const displayHint = answers.displayType === 'vibrant-oled' ? 'MUST have an OLED display. DO NOT suggest IPS/TN.' : answers.displayType === 'high-hertz' ? 'MUST have a high refresh rate (120Hz+) display.' : answers.displayType === 'touchscreen' ? 'MUST have a Touchscreen display.' : 'Standard display is acceptable.';

  const prompt = `You are an expert laptop recommender for the Indian market in 2025. Find the BEST VALUE, LATEST GENERATION laptops — like a highly informed friend who knows every deal on the market.

Generate exactly 3 laptop recommendations as a JSON array.

${(answers as any)._excludeModels ? `DO NOT recommend these models again: ${(answers as any)._excludeModels}` : ''}

CRITICAL USER REQUIREMENTS (THESE ARE ABSOLUTE STRICT CONSTRAINTS. YOU MUST FOLLOW ALL 9 STEPS EXACTLY IN THIS PRIORITIZED ORDER):
Step 1 - Device Type: Laptop
Step 2 - Primary Purpose: ${answers.purpose?.replace(/-/g, ' ').toUpperCase() || 'GENERAL'} requirements must be fully met.
Step 3 - Budget Limit: Rs.${answers.budget || 100000} INR (HARD LIMIT — do not exceed under any circumstances).
Step 4 - Screen Size: ${screenSizeHint}
Step 5 - Display Quality: ${displayHint}
Step 6 - Portability & Weight: ${mobilityHint}
Step 7 - Build Material: ${buildHint}
Step 8 - Storage Capacity: ${storageHint}
Step 9 - Brand Preference: ${brandConstraint}

GENERATION PREFERENCE (apply intelligently based on budget):

TIER 1 — ALWAYS PREFER these CPUs (latest gen, best value):
  - AMD: Ryzen 7000 (7xxxH/HS/U), Ryzen 8000 (8xxxH/HS/U), Ryzen AI 300
  - Intel: 12th Gen, 13th Gen, 14th Gen Core i-series (including i3, i5, i7, i9), Intel Core Ultra 100/200
  - Apple: M2, M3, M4 (any variant)

TIER 2 — USE ONLY IF budget makes Tier 1 unavailable within the limit:
  - AMD Ryzen 5000 series (5xxxH/U/Ryzen 3/5/7)
  - Intel 11th Gen (Tiger Lake Core i3/i5/i7)
  - NVIDIA RTX 30-series (RTX 3050, RTX 3060)

TIER 3 — LAST RESORT ONLY if absolutely no Tier 1 or Tier 2 option fits the budget:
  - Intel 10th Gen, AMD Ryzen 4000, AMD Ryzen 3000 (Including Ryzen 3 / Intel i3)
  - GTX 1650, GTX 1660, RTX 2060
  - Only use these if no better laptop exists within the Rs.${answers.budget || 100000} hard limit

PREFERRED GPU tiers for gaming/content (in order of preference):
  1st: NVIDIA RTX 4050 / 4060 / 4070 / 4080 / 4090, AMD RX 7000-series
  2nd: RTX 3060 / 3070 / 3080 (if budget forces)
  3rd: RTX 3050, GTX 1650 (only if truly no better option at the budget)

VALUE & PRICING RULES:
- ALWAYS pick the best specs-to-price ratio — not just popular brands
- Prices must reflect the ACCURATE CURRENT MARKET PRICE in India in 2025. Do not use outdated MSRPs.
- If a cheaper brand offers equivalent or better specs, pick the cheaper one
- Every pick must be a real model available in India in 2025
- Justify in the "pros" why you chose this over alternatives at the same price
- Do NOT recommend a model that is overpriced relative to its generation

RULES:
- "model" MUST NOT include the Manufacturer Part Number (MPN). Keep it to the clean consumer name (e.g., "ROG Zephyrus G14").
- "searchQuery" MUST be an optimized search string combining ONLY the full name of the laptop, processor, graphics card, and RAM (e.g., "ASUS ROG Zephyrus G14 Ryzen 9 RTX 4060 16GB"). Do NOT include the specific model number or MPN in the searchQuery.
- Use your Google Search capabilities to verify the laptop is actually available in India right now at the quoted price.
- Do NOT generate URLs. Omit the "url" and "buyLinks" fields entirely in your response.
- storePrices must have realistic prices across stores (within plus/minus 5% of base price)
- lowestPrice = maximum price across all stores (to simulate the highest expected retail cost)
${isGaming ? `- Include "fpsEstimates" array with 4 games. Each: { "game": "...", "fps": { "low": N, "medium": N, "high": N, "ultra": N } }` : '- Do NOT include fpsEstimates.'}

CRITICAL JSON RULE: You MUST ensure the JSON is valid. NEVER use unescaped double-quotes (") inside string values. For example, use "15-inch display", NEVER "15" display".

Return ONLY this JSON array (no markdown, no code blocks):

[
{
  "laptop": {
    "id": "laptop-1",
    "model": "ROG Zephyrus G14 2024",
    "brand": "ASUS",
    "searchQuery": "ASUS ROG Zephyrus G14 2024 Ryzen 9 RTX 4060 16GB",
    "cpu": "AMD Ryzen 9 8945HS",
    "gpu": "NVIDIA RTX 4060 8GB",
    "ram": "16GB LPDDR5X",
    "storage": "1TB PCIe 4.0 NVMe SSD",
    "display": "14-inch 2560x1600 165Hz OLED",
    "battery": "~8 hours",
    "weight": "1.65 kg",
    "performanceScore": 92,
    "price": 119990,
    "lowestPrice": 119990,
    "storePrices": [
      { "store": "Amazon", "price": 119990, "inStock": true },
      { "store": "Flipkart", "price": 109990, "inStock": true },
      { "store": "Croma", "price": 114990, "inStock": true },
      { "store": "Reliance Digital", "price": 116990, "inStock": false },
      { "store": "Vijay Sales", "price": 112990, "inStock": true }
    ]
  },
  "matchScore": 94,
  "pros": ["Latest Ryzen 8000 CPU — no compromises", "OLED display at this price is exceptional value"],
  "cons": ["Gets warm under sustained GPU load"]${isGaming ? `,
  "fpsEstimates": [
    { "game": "Valorant", "fps": { "low": 300, "medium": 240, "high": 180, "ultra": 120 } },
    { "game": "GTA V", "fps": { "low": 120, "medium": 90, "high": 70, "ultra": 50 } },
    { "game": "Fortnite", "fps": { "low": 200, "medium": 150, "high": 100, "ultra": 70 } },
    { "game": "Cyberpunk 2077", "fps": { "low": 80, "medium": 60, "high": 45, "ultra": 30 } }
  ]` : ''}
}
]

Replace this example with 3 REAL, CURRENT (2025) laptops matching the user requirements. Return ONLY the JSON array.
`;


  try {
    const result = await generateWithFallback(prompt);

    const response = await result.response;

    let text = response.text();

    text = extractJSON(text);

    const recommendations: LaptopRecommendation[] = JSON.parse(text);

    return recommendations;
  } catch (error) {
    console.error("Gemini Laptop Error:", error);
    throw error;
  }
}