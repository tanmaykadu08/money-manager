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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
    const aiData = JSON.parse(resultText);

    return c.json(aiData);
  } catch (err) {
    console.error('AI Insights Error:', err);
    return c.json({ error: 'Failed to generate insights.' }, 500);
  }
});

export default router;
