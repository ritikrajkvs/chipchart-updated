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
  "gemini-2.0-flash-exp",          //    untouched daily quota
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
  } catch {};
  return 2000; // Default 2s fallback delay
}

async function generateWithFallback(prompt: string) {
  let lastError = null;

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const modelName = FALLBACK_MODELS[i];
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 8192
        }
      });
      
      const result = await model.generateContent(prompt);
      console.log(`[Gemini API] Success with model: ${modelName}`);
      return result;

    } catch (err: any) {
      console.warn(`[Gemini API] Failed with ${modelName}:`, err.message?.substring(0, 120));
      lastError = err;
      
      const is429 = err.message?.includes("429");
      const isDailyLimit = err.message?.includes("PerDay");

      // If the model hit a daily limit (limit: 0), skip it immediately — no point waiting
      if (is429 && isDailyLimit) {
        console.warn(`[Gemini API] ${modelName} hit daily quota. Skipping to next model.`);
        continue;
      }

      // If it's a per-minute limit, wait the suggested delay before retrying with next model
      if (is429) {
        const delay = getRetryDelay(err);
        console.warn(`[Gemini API] Rate limited. Waiting ${delay}ms before trying next model...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // For non-quota errors (404, 500, etc.) try the next model after a short delay
      if (i < FALLBACK_MODELS.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
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

  return text.slice(start, end + 1);
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
    ? 'STRICTLY use Intel CPUs (Core i5/i7/i9 series only)'
    : answers.cpuBrandPreference === 'amd'
    ? 'STRICTLY use AMD CPUs (Ryzen 5/7/9 series only)'
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
- All components must be real products available in India
- Prices must be realistic INR values
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
- Choose a REAL, well-known pre-built gaming PC (e.g., HP Omen, Dell Alienware, Asus ROG, MSI Trident, Lenovo Legion Tower) available on Amazon India.
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

  const prompt = `
You are an expert laptop recommender for the Indian market. You help users find the best deals like BuyHatke.

Generate 3 laptop recommendations.

${(answers as any)._excludeModels
      ? `DO NOT recommend these laptops again: ${(answers as any)._excludeModels}`
      : ""
    }

Budget: ${answers.budget || 100000} INR

User Preferences:
Display: ${answers.displayType || "Standard IPS"}
Portability: ${answers.portabilityLevel || "Balanced"}
Build Quality: ${answers.buildMaterial === 'premium-metal' ? 'Prioritize premium metal/magnesium chassis' : 'Standard build is fine'}
Battery: ${answers.batteryLife === 'all-day' ? 'Must have 8+ hours of real-world battery life.' : 'Standard battery is acceptable.'}
Storage: ${answers.storageSize === 'massive' ? 'Must have at least 2TB of storage.' : answers.storageSize === 'ample' ? 'Must have at least 1TB of storage.' : 'Standard 512GB is fine.'}
Brand: ${answers.laptopBrandPreference && answers.laptopBrandPreference !== 'no-preference' ? `STRICTLY recommend only ${answers.laptopBrandPreference.toUpperCase()} brand laptops.` : 'Any brand is fine.'}
Purpose: ${answers.purpose || 'general'}

RULES:
- model field must NOT include brand name
- All laptops must be real models available in India
- storePrices must have realistic, slightly varying prices across stores (within ±5% of base price)
- lowestPrice = minimum price across all stores
- buyLinks and storePrices urls must be proper Amazon India / Flipkart / Croma / Reliance Digital search URLs

Return ONLY JSON:

[
{
  "laptop": {
    "id": "laptop-1",
    "model": "ROG Zephyrus G14",
    "brand": "ASUS",
    "cpu": "AMD Ryzen 9 7940HS",
    "gpu": "NVIDIA RTX 4060 8GB",
    "ram": "16GB DDR5",
    "storage": "1TB NVMe SSD",
    "display": "14-inch 2560x1600 165Hz",
    "battery": "~8 hours",
    "weight": "1.65 kg",
    "performanceScore": 92,
    "price": 119990,
    "lowestPrice": 109990,
    "storePrices": [
      { "store": "Amazon", "price": 119990, "url": "https://www.amazon.in/s?k=ASUS+ROG+Zephyrus+G14", "inStock": true },
      { "store": "Flipkart", "price": 109990, "url": "https://www.flipkart.com/search?q=ASUS+ROG+Zephyrus+G14", "inStock": true },
      { "store": "Croma", "price": 114990, "url": "https://www.croma.com/searchB?q=ASUS+ROG+Zephyrus+G14", "inStock": true },
      { "store": "Reliance Digital", "price": 116990, "url": "https://www.reliancedigital.in/search?q=ASUS+ROG+Zephyrus+G14", "inStock": false },
      { "store": "Vijay Sales", "price": 112990, "url": "https://www.vijaysales.com/search?text=ASUS+ROG+Zephyrus+G14", "inStock": true }
    ],
    "buyLinks": {
      "amazon": "https://www.amazon.in/s?k=ASUS+ROG+Zephyrus+G14",
      "flipkart": "https://www.flipkart.com/search?q=ASUS+ROG+Zephyrus+G14",
      "croma": "https://www.croma.com/searchB?q=ASUS+ROG+Zephyrus+G14",
      "relianceDigital": "https://www.reliancedigital.in/search?q=ASUS+ROG+Zephyrus+G14",
      "vijaySales": "https://www.vijaysales.com/search?text=ASUS+ROG+Zephyrus+G14"
    }
  },
  "matchScore": 94,
  "pros": ["Best-in-class performance", "Premium build quality", "Excellent display"],
  "cons": ["Premium priced", "Gets warm under load"]
}
]

Replace with 3 REAL laptops matching user requirements. Use realistic INR prices. Return ONLY the JSON array.
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