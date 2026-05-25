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
Dual-Provider Fallback: Gemini 3.1 → Groq
Only these two providers are used. No other models.
-------------------------------------
*/

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
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
    if (filtered.length === 0) return 'Any brand — pick the absolute best value for the budget.';
    return `ONLY recommend laptops from: ${filtered.map(b => b.toUpperCase()).join(', ')}. STRICTLY FORBIDDEN: Any brand not in this list. A laptop from a forbidden brand is an AUTOMATIC DISQUALIFICATION.`;
  })();

  // ── STRICT display enforcement ──
  const displayHint = (() => {
    switch (answers.displayType) {
      case 'vibrant-oled':
        return 'MANDATORY: OLED display ONLY. FORBIDDEN: IPS, TN, VA panels. If the laptop does not have an OLED panel, it is DISQUALIFIED.';
      case 'high-hertz':
        return 'MANDATORY: High refresh rate display (120Hz or above). FORBIDDEN: 60Hz displays. If the laptop has a 60Hz panel, it is DISQUALIFIED.';
      case 'touchscreen':
        return 'MANDATORY: Touchscreen display. FORBIDDEN: Non-touch displays. If the laptop does not have a touchscreen, it is DISQUALIFIED.';
      case 'standard-ips':
        return 'MANDATORY: Standard IPS or anti-glare LCD display. FORBIDDEN: OLED displays. If the laptop has an OLED panel, it is DISQUALIFIED. Stick to IPS/LCD only.';
      default:
        return 'Any display type is acceptable. Choose the best display for the budget and purpose — IPS, OLED, or other.';
    }
  })();

  // ── STRICT screen size enforcement ──
  const screenSizeHint = (() => {
    switch (answers.screenSize) {
      case 'compact':
        return 'MANDATORY: 13-inch or 14-inch screen ONLY. FORBIDDEN: 15-inch, 15.6-inch, 16-inch, or larger. Any laptop with screen >= 15 inches is DISQUALIFIED.';
      case 'large':
        return 'MANDATORY: 16-inch or larger screen ONLY. FORBIDDEN: 13-inch, 14-inch, 15-inch screens. Any laptop with screen < 16 inches is DISQUALIFIED.';
      case 'standard':
      default:
        return 'MANDATORY: 15-inch, 15.6-inch, or 16-inch screen. FORBIDDEN: 13-inch, 14-inch (too small) and 17-inch+ (too large). Stay in the 15-16 inch range.';
    }
  })();

  // ── STRICT portability enforcement ──
  const mobilityHint = (() => {
    switch (answers.mobility) {
      case 'on-the-go':
        return 'MANDATORY: Ultra-portable, under 1.6kg weight. MUST have long battery life (6+ hours). FORBIDDEN: Bulky gaming laptops over 2kg. If the laptop weighs more than 1.8kg, it is DISQUALIFIED.';
      case 'stationary':
        return 'Weight and battery are NOT constraints. Heavy desktop-replacement laptops (2.5kg+) are perfectly fine. Prioritize raw performance over portability.';
      case 'balanced':
      default:
        return 'MANDATORY: Moderate weight between 1.5kg and 2.3kg. Should have 4-6 hours battery. FORBIDDEN: Ultra-heavy laptops over 2.5kg.';
    }
  })();

  // ── STRICT build material enforcement ──
  const buildHint = (() => {
    switch (answers.buildMaterial) {
      case 'premium-metal':
        return 'MANDATORY: Aluminum or Magnesium alloy body. FORBIDDEN: Primarily plastic-bodied laptops. If the laptop has a mostly plastic chassis, it is DISQUALIFIED.';
      case 'budget-plastic':
        return 'Plastic body is perfectly acceptable. Focus on value — do not add premium for metal builds.';
      case 'no-preference':
      default:
        return 'Any build material is acceptable. Choose based on best value.';
    }
  })();

  // ── STRICT storage enforcement ──
  const storageHint = (() => {
    switch (answers.storageSize) {
      case 'massive':
        return 'MANDATORY: At least 2TB SSD storage. FORBIDDEN: Laptops with less than 2TB SSD. If the laptop has < 2TB SSD, it is DISQUALIFIED.';
      case 'ample':
        return 'MANDATORY: At least 1TB SSD storage. FORBIDDEN: Laptops with 512GB or less SSD. If the laptop has < 1TB SSD, it is DISQUALIFIED.';
      case 'basic':
      default:
        return 'At least 256GB SSD. 512GB preferred.';
    }
  })();

  // ── STRICT RAM enforcement ──
  const ramHint = (() => {
    const purpose = answers.purpose || 'general';
    if (['gaming', 'ml-ai', 'content-creation', 'streaming'].includes(purpose)) {
      return 'MANDATORY: At least 16GB RAM. FORBIDDEN: 8GB RAM laptops for this use case. If the laptop has only 8GB RAM, it is DISQUALIFIED.';
    }
    if (['coding', 'student'].includes(purpose)) {
      return 'At least 8GB RAM required. 16GB preferred for multitasking.';
    }
    return 'At least 8GB RAM.';
  })();

  const budgetMax = answers.budget || 100000;
  const budgetCeiling = Math.round(budgetMax * 1.05); // only 5% relaxation

  const prompt = `You are an expert laptop recommender for the Indian market in ${new Date().getFullYear()}.

Generate exactly 3 laptop recommendations as a JSON array.

${answers._excludeModels ? `DO NOT recommend these models again: ${answers._excludeModels}` : ''}

═══════════════════════════════════════════════════════════
STRICT REQUIREMENTS — ZERO TOLERANCE (except budget has 5% relaxation)
Each requirement below is MANDATORY. Violating ANY non-budget requirement means that laptop is AUTOMATICALLY DISQUALIFIED and must be replaced.
═══════════════════════════════════════════════════════════

Step 1 - Device Type: Laptop (NOT a desktop, tablet, or 2-in-1 unless touchscreen is requested).

Step 2 - Primary Purpose: ${answers.purpose?.replace(/-/g, ' ').toUpperCase() || 'GENERAL'}.
  The laptop MUST be suitable for this purpose. For gaming/streaming: dedicated GPU required. For ML/AI: CUDA-capable GPU required. For coding/student/office: integrated GPU is acceptable.

Step 3 - Budget: Rs.${budgetMax} INR.
  SOFT LIMIT with 5% relaxation: Maximum allowed price is Rs.${budgetCeiling}. All laptops MUST be priced AT or BELOW Rs.${budgetCeiling}.
  HARD CEILING: Rs.${budgetCeiling}. Any laptop priced above Rs.${budgetCeiling} is IMMEDIATELY DISQUALIFIED — no exceptions, no matter how good it is.
  IMPORTANT: Do NOT recommend expensive flagship laptops that cost 2x the budget. Stay within the price range.

Step 4 - Display Type: ${displayHint}

Step 5 - Screen Size: ${screenSizeHint}

Step 6 - Portability & Weight: ${mobilityHint}

Step 7 - Build Material: ${buildHint}

Step 8 - Storage: ${storageHint}

Step 9 - Brand Preference: ${brandConstraint}

Step 10 - RAM: ${ramHint}

═══════════════════════════════════════════════════════════
DISQUALIFICATION CHECKLIST (you MUST run this for EACH laptop before including it):
═══════════════════════════════════════════════════════════
For each of your 3 picks, verify ALL of these. If ANY check fails, REPLACE that laptop:
 □ Display type matches Step 4 exactly (e.g., if IPS required, it MUST NOT be OLED)
 □ Screen size matches Step 5 exactly (e.g., if compact, screen MUST be 13-14 inches)
 □ Weight matches Step 6 (e.g., if ultraportable, weight MUST be under 1.8kg)
 □ Build material matches Step 7 (e.g., if metal required, body MUST be aluminum/magnesium)
 □ Storage matches Step 8 (e.g., if 1TB+ required, SSD MUST be >= 1TB)
 □ Brand matches Step 9 (e.g., if ASUS only, brand MUST be ASUS)
 □ RAM matches Step 10
 □ Price is <= Rs.${budgetCeiling}

GENERATION PREFERENCE (apply intelligently based on budget):

TIER 1 — ALWAYS PREFER these CPUs (latest gen, best value):
  - AMD: Ryzen 7000 (7xxxH/HS/U), Ryzen 8000 (8xxxH/HS/U), Ryzen AI 300
  - Intel: 12th Gen, 13th Gen, 14th Gen Core i-series, Intel Core Ultra 100/200
  - Apple: M2, M3, M4 (any variant)

TIER 2 — USE ONLY IF budget makes Tier 1 unavailable:
  - AMD Ryzen 5000 series, Intel 11th Gen, NVIDIA RTX 30-series

TIER 3 — LAST RESORT:
  - Intel 10th Gen, AMD Ryzen 4000/3000, GTX 1650/1660

PREFERRED GPU tiers for gaming/content (in order of preference):
  1st: NVIDIA RTX 4050 / 4060 / 4070 / 4080 / 4090, AMD RX 7000-series
  2nd: RTX 3060 / 3070 / 3080 (if budget forces)
  3rd: RTX 3050, GTX 1650 (only if truly no better option)

VALUE RULES:
- Pick the best specs-to-price ratio — not just popular brands
- Every pick must be a real model currently sold in India
- Justify in the "pros" why you chose this over alternatives

RULES:
- "model" MUST NOT include the MPN. Keep it to the clean consumer name.
- "searchQuery" MUST contain Brand, Model Family, CPU, and GPU for e-commerce search.
- "price" = your best estimate of typical retail pricing in India. Overestimate rather than underestimate.
- "inStock" = set to true as placeholder.
- Do NOT generate URLs. Omit "url" and "buyLinks" fields entirely.
- storePrices MUST include exactly two placeholder entries: "Amazon" and "Flipkart".
- "lowestPrice" = set EQUAL to "price".
${isGaming ? `- Include "fpsEstimates" array with exactly 6 games: GTA V, Red Dead Redemption 2, Valorant, Fortnite, Cyberpunk 2077, and Elden Ring. Provide realistic FPS values for the laptop GPU. Each: { "game": "...", "fps": { "low": N, "medium": N, "high": N, "ultra": N } }` : '- Do NOT include fpsEstimates.'}

CRITICAL JSON RULE: NEVER use unescaped double-quotes inside string values. Use single quotes or describe dimensions textually (e.g., "15.6-inch" not "15.6\\"").

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
    "display": "14-inch 2560x1600 165Hz IPS",
    "battery": "~8 hours",
    "weight": "1.65 kg",
    "performanceScore": 92,
    "price": 94990,
    "lowestPrice": 94990,
    "storePrices": [
      { "store": "Amazon", "price": 94990, "inStock": true },
      { "store": "Flipkart", "price": 94990, "inStock": true }
    ]
  },
  "matchScore": 94,
  "pros": ["Latest Ryzen 8000 CPU", "IPS display matches user preference"],
  "cons": ["Gets warm under sustained GPU load"]${isGaming ? `,
  "fpsEstimates": [
    { "game": "Valorant", "fps": { "low": 300, "medium": 240, "high": 180, "ultra": 120 } },
    { "game": "GTA V", "fps": { "low": 120, "medium": 90, "high": 70, "ultra": 50 } },
    { "game": "Fortnite", "fps": { "low": 200, "medium": 150, "high": 100, "ultra": 70 } },
    { "game": "Cyberpunk 2077", "fps": { "low": 80, "medium": 60, "high": 45, "ultra": 30 } }
  ]` : ''}
}
]

FINAL MANDATORY CHECK: Before returning, re-run the DISQUALIFICATION CHECKLIST above for EACH laptop. If any laptop fails any check, REPLACE IT with a compliant alternative. ESPECIALLY verify that EVERY laptop price is <= Rs.${budgetCeiling}. This is non-negotiable.

Replace the example with 3 REAL, CURRENT (${new Date().getFullYear()}) laptops. Return ONLY the JSON array.
`;


  try {
    const text = await generateWithFallback(prompt);

    const jsonText = extractJSON(text);

    const rawRecs: any[] = JSON.parse(jsonText);
    const recommendations: LaptopRecommendation[] = rawRecs.filter(r => {
      if (!validateLaptopRec(r)) {
        console.warn('[Laptop Validation] Dropping invalid rec:', r?.laptop?.model || 'unknown');
        return false;
      }
      return true;
    });
    if (recommendations.length === 0) throw new Error('AI returned no valid laptop recommendations.');
    return recommendations;
  } catch (error) {
    console.error("Laptop Error:", error);
    throw error;
  }
}
