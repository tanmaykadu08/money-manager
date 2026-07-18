import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

router.post('/insights', async (c) => {
  try {
    const { d, monthLabel, feature = 'overview' } = await c.req.json();
    const GEMINI_API_KEY = c.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return c.json({ error: 'Gemini API key not configured on server.' }, 500);
    }

    let prompt = '';
    
    if (feature === 'overview') {
      prompt = `Analyze this financial data for ${monthLabel}.
Total Income: ${d.totalIncome}, Total Expenses: ${d.totalExpenses}, Total Auto (Recurring): ${d.totalAuto}, Savings: ${d.savings}.
Categories: ${JSON.stringify(d.catTotals)}.
Provide a JSON response with exactly this format:
{
  "grade": "A single letter grade (S, A, B, C, or D) for the financial health",
  "summary": "A 2-3 sentence summary of the performance",
  "insights": ["Insight 1", "Insight 2", "Insight 3"]
}`;
    } else if (feature === 'coach') {
      prompt = `Act as a financial coach for ${monthLabel}.
Total Income: ${d.totalIncome}, Total Expenses: ${d.totalExpenses}, Total Auto (Recurring): ${d.totalAuto}, Savings: ${d.savings}.
Categories: ${JSON.stringify(d.catTotals)}. Savings Percentage: ${d.savePct}%.
Provide a JSON response containing an array of actionable tips. Each tip must be in this format:
{
  "tips": [
    {
      "icon": "A single emoji representing the tip (e.g. 🍔, ⚠️, 🚨, 🏆)",
      "type": "danger, warn, or good",
      "title": "Short title",
      "body": "1-2 sentence actionable advice"
    }
  ]
}
Provide exactly 3 or 4 tips.`;
    } else if (feature === 'forecast') {
      prompt = `Act as a financial forecaster.
Total Income: ${d.totalIncome}, Total Expenses so far: ${d.totalExpenses + d.totalAuto}.
Days in month: ${d.daysInMonth}, Days elapsed: ${d.dayOfMonth}.
Based on the daily burn rate, forecast the end-of-month projected total spend and projected savings.
Provide a JSON response with exactly this format:
{
  "projectedSav": number (projected savings),
  "projectedExp": number (projected total spend),
  "statusLabel": "Short string (e.g., 'On Track ✅' or 'Over Budget Risk ⚠️')"
}`;
    } else if (feature === 'anomalies') {
      prompt = `Act as an anomaly detector for financial data.
Total Expenses: ${d.totalExpenses}, Total Auto (Recurring): ${d.totalAuto}.
Categories: ${JSON.stringify(d.catTotals)}.
Number of transactions: ${d.expenses ? d.expenses.length : 0}.
Find potential leaks, unusually large expenses, or category dominance.
Provide a JSON response containing an array of anomalies. If none, return an empty array.
{
  "anomalies": [
    {
      "icon": "Single emoji (e.g. 💸, 📦, ⚡, 📈)",
      "title": "Short title",
      "body": "1-2 sentence description"
    }
  ]
}`;
    } else if (feature === 'dna') {
      prompt = `Act as a spending personality profiler.
Categories: ${JSON.stringify(d.catTotals)}. Total Auto (Recurring): ${d.totalAuto}.
Determine the user's spending "DNA" personality based on where they spend the most.
Provide a JSON response with exactly this format:
{
  "personality": "A catchy title with an emoji (e.g., 'The Foodie 🍔', 'The Saver 🏦')"
}`;
    }

    prompt += `\nCRITICAL RULE: Always format monetary values in Indian Rupees (₹) instead of US Dollars ($).`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    const cleanText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const aiData = JSON.parse(cleanText);

    return c.json(aiData);
  }catch (err) {
  console.error("AI Insights Error:", err);

  return c.json({
    success: false,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null
  }, 500);
}
});

router.post('/chat', async (c) => {
  try {
    const { message, context } = await c.req.json();
    const GEMINI_API_KEY = c.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return c.json({ error: 'Gemini API key not configured on server.' }, 500);
    }

    const systemPrompt = `You are the MyPocket AI Financial Assistant. You are a helpful, encouraging, and expert financial advisor.
Your goal is to answer the user's questions about their finances based on their current financial context.
Here is the user's current financial context:
- Total Income: ${context.totalIncome}
- Total Expenses: ${context.totalExpenses}
- Savings: ${context.savings} (Savings Rate: ${context.savePct.toFixed(1)}%)
- Expense Categories: ${JSON.stringify(context.catTotals)}

Keep your answers concise, practical, and directly addressing the user's query. Use markdown for formatting (e.g. **bold**, bullet points). Do NOT output raw JSON, output a conversational response.
CRITICAL RULE: Always format monetary values in Indian Rupees (₹) instead of US Dollars ($).`;

    const prompt = `${systemPrompt}\n\nUser Question: ${message}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;

    return c.json({ text: resultText });
  } catch (err) {
    console.error('AI Chat Error:', err);
    return c.json({ error: 'Failed to get a response from AI.' }, 500);
  }
});

router.post('/parse-statement', async (c) => {
  try {
    const GEMINI_API_KEY = c.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return c.json({ error: 'Gemini API key not configured on server.' }, 500);
    }

    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No valid file uploaded.' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const prompt = `Extract all financial transactions from this document/image.
Return ONLY a valid JSON array of arrays. No markdown formatting.
Each inner array must have exactly 4 elements in this exact order:
1. date (string, YYYY-MM-DD format if possible)
2. description (string)
3. amount (number, positive absolute value)
4. type (string, "income" or "expense")

Example output:
[
  ["2026-07-01", "Starbucks Coffee", 5.50, "expense"],
  ["2026-07-05", "Salary", 2500.00, "income"]
]`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: file.name && file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : (file.type || 'image/jpeg'),
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    
    // Strip markdown if necessary and extract the JSON array part
    let cleanText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleanText.match(/\[.*\]/s);
    if (match) {
      cleanText = match[0];
    }
    
    const rawArrays = JSON.parse(cleanText);
    
    const transactions = rawArrays.map(row => ({
      date: row[0],
      description: row[1],
      amount: row[2],
      type: row[3]
    }));

    return c.json({ transactions });
  } catch (err) {
    console.error('AI Parse Statement Error:', err);
    return c.json({ error: 'Failed to parse statement with AI.', detail: err.message }, 500);
  }
});

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

router.post('/categorize', async (c) => {
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

export default router;
