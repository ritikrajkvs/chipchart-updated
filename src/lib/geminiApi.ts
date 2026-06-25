import { GoogleGenerativeAI } from "@google/generative-ai";
import { QuestionnaireAnswers } from "@/store/questionnaireStore";
import { PCBuild, LaptopRecommendation } from "./recommendationEngine";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

if (!apiKey) {
  console.error("VITE_GEMINI_API_KEY is missing in .env");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

/*
-------------------------------------
Dual-Provider Fallback: Gemini → Groq
Gemini 2.5 Flash used for grounded (Google Search) calls.
Gemini 3.1 Flash Lite used for non-grounded fallback.
-------------------------------------
*/

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_GROUNDED_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Call Groq API via fetch (no SDK needed)
async function callGroq(prompt: string): Promise<string> {
  if (!groqApiKey) {
    throw new Error("VITE_GROQ_API_KEY is missing in .env");
  }

  console.log(`[Groq API] Falling back to Groq (${GROQ_MODEL})...`);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert product recommender. Always respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation — just the raw JSON array."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Groq returned empty response");
  }

  console.log(`[Groq API] Success with model: ${GROQ_MODEL}`);
  return text;
}

// Google Search grounded generation — Gemini searches the web before answering
async function generateWithGrounding(prompt: string): Promise<string> {
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY required for grounded search');

  console.log(`[Gemini Grounded] Searching web with ${GEMINI_GROUNDED_MODEL}...`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GROUNDED_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini grounded API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || '')
    .join('') || '';

  if (!text) throw new Error('Gemini grounded returned empty response');

  console.log(`[Gemini Grounded] Success — received ${text.length} chars`);
  return text;
}

// Main fallback wrapper — returns raw text from whichever provider succeeds
async function generateWithFallback(prompt: string): Promise<string> {
  let geminiError: any = null;

  // --- ATTEMPT 1: Gemini 3.1 ---
  {
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const model = genAI.getGenerativeModel({
          model: GEMINI_MODEL,
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          }
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        console.log(`[Gemini API] Success with model: ${GEMINI_MODEL} after ${retries} retries`);
        return text;

      } catch (err: any) {
        geminiError = err;

        const is429 = err.message?.includes("429") || err.message?.includes("Too Many Requests");
        const isDailyLimit = err.message?.includes("Quota exceeded") || err.message?.includes("PerDay") || err.message?.includes("daily");

        if (is429 && isDailyLimit) {
          console.warn(`[Gemini API] ${GEMINI_MODEL} hit DAILY quota. Falling back to Groq.`);
          break;
        }

        if (is429) {
          retries++;
          if (retries >= maxRetries) {
            console.warn(`[Gemini API] ${GEMINI_MODEL} rate limited after ${retries} retries. Falling back to Groq.`);
            break;
          }
          const delays = [3000, 7000, 15000];
          const delay = delays[retries - 1] || 15000;
          console.warn(`[Gemini API] Rate limited. Waiting ${delay}ms before retry ${retries}/${maxRetries}...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // Non-429 error — fall through to Groq
        console.warn(`[Gemini API] Failed with ${GEMINI_MODEL}:`, err.message?.substring(0, 120));
        break;
      }
    }
  }

  // --- ATTEMPT 2: Groq fallback ---
  try {
    return await callGroq(prompt);
  } catch (groqErr: any) {
    console.error("[Groq API] Also failed:", groqErr.message?.substring(0, 200));
    throw new Error(
      `Both AI providers failed.\nGemini: ${geminiError?.message?.substring(0, 100)}\nGroq: ${groqErr.message?.substring(0, 100)}`
    );
  }
}


/*
-------------------------------------
Safe JSON extraction from AI output
-------------------------------------
*/

function extractJSON(text: string) {
  // Try to find a markdown JSON block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    let jsonStr = codeBlockMatch[1].trim();
    // Fix common formatting errors: trailing commas
    return jsonStr.replace(/,\s*([\]}])/g, '$1');
  }

  const start = text.indexOf("[");
  if (start === -1) {
    console.error("AI Output Error - No JSON start bracket:", text);
    throw new Error("No JSON array returned by the AI.");
  }

  // Count brackets to find the exact end of the JSON array
  let depth = 0;
  let end = -1;
  let inString = false;
  let isEscaping = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (isEscaping) {
      isEscaping = false;
      continue;
    }
    if (char === '\\') {
      isEscaping = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '[') depth++;
      else if (char === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
  }

  // Fallback to last bracket if parsing failed
  if (end === -1) {
    console.warn('[JSON Extract] Bracket matching failed, using lastIndexOf fallback');
    end = text.lastIndexOf("]");
  }

  if (start === -1 || end === -1 || start >= end) {
    console.error("AI Output Error - Bad boundaries:", text);
    throw new Error("Invalid JSON array boundaries returned from AI.");
  }

  let jsonStr = text.slice(start, end + 1);
  return jsonStr.replace(/,\s*([\]}])/g, '$1'); // Fix trailing commas
}

// ── Response validation ─────────────────────────────────────────────────────

function validatePCBuild(build: any, budget: number): boolean {
  if (!build || typeof build !== 'object') return false;
  if (!build.components || typeof build.components !== 'object') return false;
  if (!build.totalPrice || typeof build.totalPrice !== 'number') return false;
  if (!build.type || !['performance', 'value', 'budget', 'prebuilt'].includes(build.type)) return false;
  const requiredComponents = ['cpu', 'gpu', 'ram', 'ssd', 'psu', 'case', 'motherboard', 'cooler'];
  for (const key of requiredComponents) {
    const c = build.components[key];
    if (!c || !c.brand || !c.name || typeof c.price !== 'number') return false;
  }
  // Clamp scores
  build.performanceScore = Math.max(0, Math.min(100, build.performanceScore || 0));
  if (build.bottleneck) build.bottleneck.percentage = Math.max(0, Math.min(100, build.bottleneck.percentage || 0));
  return true;
}

function validateLaptopRec(rec: any): boolean {
  if (!rec || typeof rec !== 'object') return false;
  const l = rec.laptop;
  if (!l || !l.model || !l.brand || !l.cpu || typeof l.price !== 'number') return false;
  // Ensure IDs
  if (!l.id) l.id = `laptop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  // Clamp scores
  rec.matchScore = Math.max(0, Math.min(100, rec.matchScore || 0));
  l.performanceScore = Math.max(0, Math.min(100, l.performanceScore || 0));
  // Ensure storePrices array
  if (!Array.isArray(l.storePrices)) l.storePrices = [];
  // Ensure lowestPrice
  if (!l.lowestPrice) l.lowestPrice = l.price;
  // Ensure searchQuery
  if (!l.searchQuery) l.searchQuery = `${l.brand} ${l.model} ${l.cpu} laptop`;
  return true;
}

/*
=====================================
PC BUILD RECOMMENDER
=====================================
*/

export async function fetchGeminiPCBuilds(
  answers: QuestionnaireAnswers
): Promise<PCBuild[]> {
  if (!apiKey && !groqApiKey) {
    throw new Error("No API keys configured (need VITE_GEMINI_API_KEY or VITE_GROQ_API_KEY)");
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
${answers._excludeNames ? `- EXCLUDE these builds: ${answers._excludeNames}` : ''}

Rules:
- Builds must be: type 1 = performance, type 2 = value, type 3 = prebuilt
- component "name" field must NOT include the brand name
- component "sku" MUST be the precise Manufacturer Part Number (MPN) or global product code.
- All components must be real products currently available in India
- PRICING ACCURACY: Make an educated estimate of typical retail pricing in India context (Amazon/Flipkart). Overestimate rather than underestimate.
- ABSOLUTE BUDGET ENFORCEMENT: The "totalPrice" of the build MUST be LESS THAN OR EQUAL TO Rs.${budget}. If a build exceeds the budget by even ₹1, DO NOT include it. Choose cheaper components instead.
- GPU must be appropriate for ${resolution} gaming at the given budget
- Strictly obey the CPU brand constraint stated above
- CRITICAL JSON ESCAPING: Do NOT use raw double quotes (") inside any string values. For example, use '15-inch', NEVER '15"'. An unescaped quote will crash the JSON parser.

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
    "fpsEstimates": [
      { "game": "GTA V", "fps": { "low": 160, "medium": 130, "high": 100, "ultra": 70 } },
      { "game": "Red Dead Redemption 2", "fps": { "low": 90, "medium": 70, "high": 50, "ultra": 35 } },
      { "game": "Valorant", "fps": { "low": 300, "medium": 250, "high": 200, "ultra": 150 } },
      { "game": "Fortnite", "fps": { "low": 180, "medium": 140, "high": 100, "ultra": 70 } },
      { "game": "Cyberpunk 2077", "fps": { "low": 80, "medium": 60, "high": 45, "ultra": 30 } },
      { "game": "Elden Ring", "fps": { "low": 100, "medium": 80, "high": 60, "ultra": 45 } }
    ],
    "alternatives": {}
  }
]

Replace the example above with 3 real builds (performance, value, prebuilt) matching the user requirements. Ensure totalPrice roughly equals sum of component prices and stays within the ${budget} INR budget.

IMPORTANT: "fpsEstimates" MUST contain exactly 6 games: GTA V, Red Dead Redemption 2, Valorant, Fortnite, Cyberpunk 2077, and Elden Ring. Provide realistic FPS values based on the GPU and CPU.

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

FINAL CHECK before returning: Verify that EVERY build in your JSON array has a "totalPrice" that is <= Rs.${budget}. If any build exceeds the budget, recalculate with cheaper parts.

Return ONLY the JSON array.`;


  try {
    const text = await generateWithFallback(prompt);

    const jsonText = extractJSON(text);

    const rawBuilds: any[] = JSON.parse(jsonText);
    const budget = answers.budget || 100000;
    const budgetCeiling = Math.round(budget * 1.15);
    const builds: PCBuild[] = rawBuilds.filter(b => {
      if (!validatePCBuild(b, budget)) {
        console.warn('[PC Validation] Dropping invalid build:', b?.name || 'unknown');
        return false;
      }
      if (b.totalPrice > budgetCeiling) {
        console.warn(`[PC Budget] Dropping "${b.name}" — ₹${b.totalPrice} > ₹${budgetCeiling}`);
        return false;
      }
      return true;
    });
    if (builds.length === 0) throw new Error('AI returned no valid builds within budget.');
    return builds;
  } catch (error) {
    console.error("PC Build Error:", error);
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
  if (!apiKey && !groqApiKey) {
    throw new Error("No API keys configured (need VITE_GEMINI_API_KEY or VITE_GROQ_API_KEY)");
  }

  const isGaming = ['gaming', 'streaming', 'content-creation', 'video-editing'].includes(answers.purpose || '');

  const brandConstraint = (() => {
    const brands = answers.laptopBrandPreference ?? [];
    const filtered = brands.filter(b => b !== 'no-preference');
    if (filtered.length === 0) return 'Any brand';
    return `ONLY: ${filtered.map(b => b.toUpperCase()).join(', ')}`;
  })();

  const budgetMax = answers.budget || 100000;
  const budgetCeiling = Math.round(budgetMax * 1.05);
  const purpose = answers.purpose?.replace(/-/g, ' ') || 'general';

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: GROUNDED SEARCH — Find real laptops on Amazon.in / Flipkart
  // This step MUST use Google Search. No JSON, just plain text with real data.
  // ═══════════════════════════════════════════════════════════════════

  const searchPrompt = `You are a laptop shopping assistant. Use Google Search to find REAL laptops currently for sale in India.

TASK: Search Amazon.in and Flipkart.com RIGHT NOW for "${purpose} laptop" priced between ₹${Math.round(budgetMax * 0.6)} and ₹${budgetCeiling}.

Search queries to use:
- "${purpose} laptop under ${budgetMax}" site:amazon.in
- "${purpose} laptop under ${budgetMax}" site:flipkart.com
- "best ${purpose} laptop ${new Date().getFullYear()}" India price

${answers._excludeModels ? `SKIP these models: ${answers._excludeModels}` : ''}
Brand preference: ${brandConstraint}

For EACH laptop you find (find at least 6), provide:
1. Exact product name as listed on the store
2. Brand
3. Price as shown on the store page (in ₹)
4. Which store(s) list it (Amazon, Flipkart, or both)
5. Key specs: CPU, GPU, RAM, Storage, Display size, Battery life, Weight
6. Whether it's currently in stock

CRITICAL RULES:
- ONLY include laptops you found via search that are CURRENTLY LISTED on Amazon.in or Flipkart.com
- Use the EXACT price shown on the store page
- Do NOT make up or estimate prices
- Do NOT include laptops you cannot verify are currently available
- If a search result shows "Currently unavailable", skip that laptop

Provide your findings as a simple numbered list. Be specific with prices — use the exact ₹ amount from the store listing.`;

  let searchResults = '';
  try {
    searchResults = await generateWithGrounding(searchPrompt);
    console.log('[Step 1] Grounded search returned', searchResults.length, 'chars');
  } catch (err: any) {
    console.warn('[Step 1] Grounding failed:', err.message?.substring(0, 100));
    // If grounding fails completely, fall back to the old single-call approach
    return await fetchLaptopsFallback(answers, isGaming, budgetMax, budgetCeiling);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: FORMAT — Convert the search results into our JSON schema
  // No grounding needed here, just structured output from the text data.
  // ═══════════════════════════════════════════════════════════════════

  const displayHint = (() => {
    switch (answers.displayType) {
      case 'vibrant-oled': return 'Prefer OLED displays';
      case 'high-hertz': return 'Prefer 120Hz+ displays';
      case 'touchscreen': return 'Prefer touchscreen';
      case 'standard-ips': return 'Prefer IPS/LCD (not OLED)';
      default: return 'Any display';
    }
  })();

  const screenSizeHint = (() => {
    switch (answers.screenSize) {
      case 'compact': return '13-14 inch only';
      case 'large': return '16+ inch only';
      default: return '15-16 inch preferred';
    }
  })();

  const mobilityHint = (() => {
    switch (answers.mobility) {
      case 'on-the-go': return 'Under 1.6kg, long battery';
      case 'stationary': return 'Weight doesn\'t matter, max performance';
      default: return 'Under 2.3kg, 4-6hr battery';
    }
  })();

  const formatPrompt = `You are formatting laptop search results into JSON.

Here are REAL laptops found on Amazon.in and Flipkart.com with their ACTUAL prices:

--- SEARCH RESULTS ---
${searchResults}
--- END SEARCH RESULTS ---

USER REQUIREMENTS:
- Purpose: ${purpose}
- Budget: ₹${budgetMax} (max ₹${budgetCeiling})
- Display: ${displayHint}
- Screen size: ${screenSizeHint}
- Portability: ${mobilityHint}
- Brand: ${brandConstraint}

From the search results above, pick the 6 BEST matches for the user's requirements.

CRITICAL PRICING RULES:
- Use the EXACT prices from the search results above. Do NOT change or estimate prices.
- storePrices array: include each store where the laptop was found with its EXACT listed price.
- Set inStock: true ONLY if the search results confirm it's available.
- lowestPrice = the cheapest price found across stores.

Return ONLY a JSON array (no markdown, no code blocks):
[
{
  "laptop": {
    "id": "laptop-1",
    "model": "exact model name from search results",
    "brand": "Brand",
    "searchQuery": "Brand Model CPU GPU laptop",
    "cpu": "exact CPU",
    "gpu": "exact GPU or Integrated",
    "ram": "RAM amount",
    "storage": "Storage",
    "display": "display details",
    "battery": "battery info",
    "weight": "weight",
    "performanceScore": 85,
    "price": 74990,
    "lowestPrice": 73990,
    "storePrices": [
      { "store": "Amazon", "price": 74990, "inStock": true },
      { "store": "Flipkart", "price": 73990, "inStock": true }
    ]
  },
  "matchScore": 92,
  "pros": ["real pro 1", "real pro 2"],
  "cons": ["real con 1"]${isGaming ? `,
  "fpsEstimates": [
    { "game": "GTA V", "fps": { "low": 120, "medium": 90, "high": 70, "ultra": 50 } },
    { "game": "Red Dead Redemption 2", "fps": { "low": 70, "medium": 55, "high": 40, "ultra": 25 } },
    { "game": "Valorant", "fps": { "low": 300, "medium": 240, "high": 180, "ultra": 120 } },
    { "game": "Fortnite", "fps": { "low": 150, "medium": 110, "high": 80, "ultra": 55 } },
    { "game": "Cyberpunk 2077", "fps": { "low": 60, "medium": 45, "high": 30, "ultra": 20 } },
    { "game": "Elden Ring", "fps": { "low": 90, "medium": 65, "high": 50, "ultra": 35 } }
  ]` : ''}
}
]

IMPORTANT: Every price in your output MUST come directly from the search results above. Do NOT invent prices.
Return ONLY the JSON array.`;

  try {
    const text = await generateWithFallback(formatPrompt);
    const jsonText = extractJSON(text);
    const rawRecs: any[] = JSON.parse(jsonText);
    
    const recommendations: LaptopRecommendation[] = rawRecs.filter(r => {
      if (!validateLaptopRec(r)) {
        console.warn('[Laptop Validation] Dropping invalid rec:', r?.laptop?.model || 'unknown');
        return false;
      }
      return true;
    });
    
    if (recommendations.length === 0) throw new Error('No valid laptops found in search results.');
    return recommendations;
  } catch (error) {
    console.error("Step 2 (format) failed:", error);
    // If formatting fails, try the old single-call approach
    return await fetchLaptopsFallback(answers, isGaming, budgetMax, budgetCeiling);
  }
}

// ── Fallback: single non-grounded call (old approach) ──────────────────────
async function fetchLaptopsFallback(
  answers: QuestionnaireAnswers,
  isGaming: boolean,
  budgetMax: number,
  budgetCeiling: number
): Promise<LaptopRecommendation[]> {
  console.log('[Fallback] Using non-grounded single-call approach');

  const purpose = answers.purpose?.replace(/-/g, ' ') || 'general';
  const brandConstraint = (() => {
    const brands = answers.laptopBrandPreference ?? [];
    const filtered = brands.filter(b => b !== 'no-preference');
    if (filtered.length === 0) return 'Any brand';
    return `ONLY: ${filtered.map(b => b.toUpperCase()).join(', ')}`;
  })();

  const prompt = `You are an expert laptop recommender for India in ${new Date().getFullYear()}.
Generate exactly 6 laptop recommendations as a JSON array.

${answers._excludeModels ? `DO NOT recommend: ${answers._excludeModels}` : ''}

Requirements:
- Purpose: ${purpose}
- Budget: ₹${budgetMax} (max ₹${budgetCeiling})
- Brand: ${brandConstraint}
- Only recommend laptops currently sold on Amazon.in or Flipkart.com
- Use realistic current Indian retail prices

Return ONLY a JSON array with this structure per item:
{ "laptop": { "id": "laptop-1", "model": "Model Name", "brand": "Brand", "searchQuery": "Brand Model CPU GPU", "cpu": "CPU", "gpu": "GPU", "ram": "RAM", "storage": "Storage", "display": "Display", "battery": "Battery", "weight": "Weight", "performanceScore": 85, "price": 74990, "lowestPrice": 74990, "storePrices": [{"store": "Amazon", "price": 74990, "inStock": true}] }, "matchScore": 90, "pros": ["pro1", "pro2"], "cons": ["con1"] ${isGaming ? ', "fpsEstimates": [{"game": "GTA V", "fps": {"low": 120, "medium": 90, "high": 70, "ultra": 50}}, {"game": "Red Dead Redemption 2", "fps": {"low": 70, "medium": 55, "high": 40, "ultra": 25}}, {"game": "Valorant", "fps": {"low": 300, "medium": 240, "high": 180, "ultra": 120}}, {"game": "Fortnite", "fps": {"low": 150, "medium": 110, "high": 80, "ultra": 55}}, {"game": "Cyberpunk 2077", "fps": {"low": 60, "medium": 45, "high": 30, "ultra": 20}}, {"game": "Elden Ring", "fps": {"low": 90, "medium": 65, "high": 50, "ultra": 35}}]' : ''}  }

CRITICAL: Do NOT use unescaped double quotes inside strings. Return ONLY the JSON array.`;

  const text = await generateWithFallback(prompt);
  const jsonText = extractJSON(text);
  const rawRecs: any[] = JSON.parse(jsonText);
  
  const recommendations: LaptopRecommendation[] = rawRecs.filter(r => {
    if (!validateLaptopRec(r)) {
      console.warn('[Fallback Validation] Dropping:', r?.laptop?.model || 'unknown');
      return false;
    }
    return true;
  });
  
  if (recommendations.length === 0) throw new Error('AI returned no valid laptop recommendations.');
  return recommendations;
}


