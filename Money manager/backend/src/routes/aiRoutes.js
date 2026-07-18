import { Hono } from 'hono';

const aiRoutes = new Hono();

// Local mapping for fast, reliable categorization
const localMappings = [
  { keywords: ['zudio', 'h&m', 'myntra', 'amazon', 'flipkart', 'ajio', 'meesho', 'maxx', 'max fashion'], category: 'shopping' },
  { keywords: ['swiggy', 'zomato', 'blinkit', 'zepto', 'instamart', 'mcdonalds', 'kfc', 'dominos', 'starbucks', 'cafe'], category: 'food' },
  { keywords: ['uber', 'ola', 'rapido', 'metro', 'irctc', 'petrol', 'fuel', 'hpcl', 'bpcl', 'indian oil'], category: 'transport' },
  { keywords: ['netflix', 'spotify', 'prime', 'hotstar', 'youtube', 'bookmyshow', 'pvr', 'cinema'], category: 'entertainment' },
  { keywords: ['apollo', 'pharmacy', 'hospital', 'clinic', 'medplus', 'netmeds', '1mg', 'doctor'], category: 'health' },
  { keywords: ['electricity', 'water', 'bill', 'recharge', 'jio', 'airtel', 'vi', 'broadband', 'wifi'], category: 'bills' },
  { keywords: ['salary', 'bonus', 'freelance', 'dividend', 'interest', 'refund'], category: 'income' },
];

function normalizeDescription(description) {
  if (!description) return '';
  return description
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ') // remove special chars
    .replace(/\s+/g, ' '); // normalize spaces
}

function getLocalCategory(normalizedDesc) {
  if (!normalizedDesc) return null;
  
  for (const mapping of localMappings) {
    for (const keyword of mapping.keywords) {
      if (normalizedDesc.includes(keyword)) {
        return mapping.category;
      }
    }
  }
  return null;
}

aiRoutes.post('/categorize', async (c) => {
  try {
    const { description } = await c.req.json();
    if (!description) {
      return c.json({ category: 'other', confidence: 1.0 });
    }

    const normalizedDesc = normalizeDescription(description);

    // 1. Try local mapping first
    const localCat = getLocalCategory(normalizedDesc);
    if (localCat) {
      console.log(`[AI Categorize] Local match: ${localCat}`);
      return c.json({ category: localCat, confidence: 1.0 });
    }

    console.log("[AI Categorize] No local match, calling Gemini");

    // 2. Try Gemini API
    const geminiKey = c.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.warn("GEMINI_API_KEY is not configured.");
      return c.json({ category: 'other', confidence: 0.5 });
    }

    const prompt = `You are a financial transaction classification agent.

Analyze the merchant name and bank transaction narration.

Classify it into exactly one supported category.

Examples:
Zudio → shopping
Max Fashion → shopping
H&M → shopping
Swiggy → food
Uber → transport
Apollo Pharmacy → health

If the merchant is unfamiliar, infer the likely business type from the merchant name and transaction narration.

Return JSON only. Supported categories are: food, transport, bills, shopping, health, entertainment, income, other.
Description: "${description}"`;

    // Add a timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (textResponse) {
        try {
          const parsed = JSON.parse(textResponse.trim());
          const validCategories = ['food', 'transport', 'bills', 'shopping', 'health', 'entertainment', 'income', 'other'];
          let cat = (parsed.category || 'other').toLowerCase();
          
          if (!validCategories.includes(cat)) {
            cat = 'other';
          }
          
          return c.json({ category: cat, confidence: parsed.confidence || 0.8 });
        } catch (e) {
          console.error("Failed to parse Gemini response as JSON:", textResponse);
          return c.json({ category: 'other', confidence: 0.5 });
        }
      }
      
      return c.json({ category: 'other', confidence: 0.5 });

    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Gemini API call failed:", err);
      // Fallback
      return c.json({ category: 'other', confidence: 0.0 });
    }

  } catch (err) {
    console.error("AI categorization error:", err);
    return c.json({ category: 'other', confidence: 0.0 });
  }
});

export default aiRoutes;
