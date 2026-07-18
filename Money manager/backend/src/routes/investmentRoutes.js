import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';
import { getDb } from '../db.js';

const investmentRoutes = new Hono();
investmentRoutes.use('/*', authMiddleware);

investmentRoutes.get('/', async (c) => {
  try {
    const db = getDb(c);
    const userId = c.get('userId');
    const result = await db.execute({
      sql: 'SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId]
    });
    return c.json(result.rows);
  } catch (err) {
    console.error("[DEBUG] GET /investments error:", err);
    if (err.message && err.message.includes("no such table")) {
        return c.json({ error: 'Investment database is not initialized.' }, 500);
    }
    return c.json({ error: err.message || 'Failed to fetch investments' }, 500);
  }
});

investmentRoutes.post('/', async (c) => {
  try {
    const db = getDb(c);
    const userId = c.get('userId');
    const { symbol, company_name, quantity, average_buy_price, purchase_date } = await c.req.json();
    
    if (!symbol || !company_name || !quantity || !average_buy_price || !purchase_date) {
        return c.json({ error: 'All fields are required' }, 400);
    }
    
    const result = await db.execute({
      sql: `INSERT INTO investments (user_id, symbol, company_name, quantity, average_buy_price, purchase_date)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [userId, symbol.toUpperCase(), company_name, Number(quantity), Number(average_buy_price), purchase_date]
    });
    const row = await db.execute({ sql: 'SELECT * FROM investments WHERE id = ?', args: [result.lastInsertRowid] });
    return c.json(row.rows[0], 201);
  } catch (err) {
    console.error("[DEBUG] POST /investments error:", err);
    if (err.message && err.message.includes("no such table")) {
        return c.json({ error: 'Investment database is not initialized.' }, 500);
    }
    return c.json({ error: err.message || 'Failed to add investment' }, 500);
  }
});

investmentRoutes.get('/search', async (c) => {
  try {
    const q = c.req.query('q');
    if (!q || q.length < 2) return c.json({ results: [], source: 'yahoo' });

    let results = [];
    let source = 'yahoo';
    let yfSuccess = false;

    // 1. Try Yahoo Finance
    try {
        const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10`;
        const yfResponse = await fetch(searchUrl);
        if (yfResponse.ok) {
            const yfData = await yfResponse.json();
            const quotes = yfData.quotes || [];
            results = quotes
              .filter(quote => quote.quoteType === 'EQUITY' || quote.quoteType === 'ETF')
              .map(quote => ({
                  symbol: quote.symbol,
                  name: quote.longname || quote.shortname || quote.symbol,
                  exchange: quote.exchDisp || quote.exchange || ''
              }));
              
            results.sort((a, b) => {
                const aIsIndian = a.symbol.endsWith('.NS') || a.symbol.endsWith('.BO');
                const bIsIndian = b.symbol.endsWith('.NS') || b.symbol.endsWith('.BO');
                if (aIsIndian && !bIsIndian) return -1;
                if (!aIsIndian && bIsIndian) return 1;
                return 0;
            });
            yfSuccess = true;
        } else {
            console.error(`[DEBUG] Yahoo search HTTP error: ${yfResponse.status}`);
        }
    } catch (e) {
        console.error("[DEBUG] Yahoo search fetch error:", e.message);
    }

    // 2. Gemini Fallback
    if (!yfSuccess) {
        console.warn("[DEBUG] Yahoo search failed. Falling back to Gemini...");
        const geminiKey = c.env.GEMINI_API_KEY;
        if (!geminiKey) {
            console.warn("[DEBUG] No GEMINI_API_KEY available for fallback.");
            return c.json({ error: 'Stock search service is temporarily unavailable.' }, 503);
        }

        const prompt = `Identify 5 to 8 real stock tickers matching the search query: "${q}".
Respond ONLY with a JSON array in exactly this structure:
[
  { "symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ" }
]
Focus heavily on identifying accurate tickers. If the search looks Indian, provide .NS (NSE) or .BO (BSE) suffixes. Output nothing but valid JSON.`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textResponse) {
                    try {
                        let cleaned = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
                        const parsed = JSON.parse(cleaned);
                        if (Array.isArray(parsed)) {
                            results = parsed;
                            source = 'gemini';
                        }
                    } catch (e) {
                        console.error("[DEBUG] Gemini JSON parse failed:", textResponse.substring(0, 100));
                    }
                }
            } else {
                console.error("[DEBUG] Gemini fallback non-ok:", response.status);
            }
        } catch (e) {
            clearTimeout(timeoutId);
            console.error("[DEBUG] Gemini fallback fetch failed:", e.message);
        }
    }

    if (results.length === 0 && !yfSuccess) {
        return c.json({ error: 'Stock search service is temporarily unavailable.' }, 503);
    }

    return c.json({ results: results.slice(0, 8), source });
  } catch (err) {
    console.error("[DEBUG] GET /search error:", err);
    return c.json({ error: 'Stock search service is temporarily unavailable.' }, 500);
  }
});

investmentRoutes.put('/:id', async (c) => {
  try {
    const db = getDb(c);
    const userId = c.get('userId');
    const id = c.req.param('id');
    const { quantity, average_buy_price, purchase_date } = await c.req.json();
    
    await db.execute({
      sql: `UPDATE investments SET quantity = ?, average_buy_price = ?, purchase_date = ? WHERE id = ? AND user_id = ?`,
      args: [Number(quantity), Number(average_buy_price), purchase_date, id, userId]
    });
    return c.json({ success: true });
  } catch (err) {
    console.error("[DEBUG] PUT /investments error:", err);
    return c.json({ error: 'Failed to update investment' }, 500);
  }
});

investmentRoutes.delete('/:id', async (c) => {
  try {
    const db = getDb(c);
    const userId = c.get('userId');
    const id = c.req.param('id');
    await db.execute({
      sql: `DELETE FROM investments WHERE id = ? AND user_id = ?`,
      args: [id, userId]
    });
    return c.json({ success: true });
  } catch (err) {
    console.error("[DEBUG] DELETE /investments error:", err);
    return c.json({ error: 'Failed to delete investment' }, 500);
  }
});
investmentRoutes.get('/prices', async (c) => {
  try {
    const symbols = c.req.query('symbols');
    if (!symbols) return c.json({});
    
    const symList = symbols.split(',').map(s => s.trim().toUpperCase());
    const yfQueries = symList.map(s => s.includes('.') ? s : `${s}.NS`);
    // Also request the raw symbols as fallback
    const allQueries = [...new Set([...yfQueries, ...symList])].join(',');
    
    const yfResponse = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${allQueries}`);
    if (!yfResponse.ok) return c.json({});
    
    const yfData = await yfResponse.json();
    const results = yfData?.quoteResponse?.result || [];
    
    const prices = {};
    for (const sym of symList) {
        // Find best match (prefer exact or .NS)
        const match = results.find(r => r.symbol === sym || r.symbol === `${sym}.NS`);
        if (match && match.regularMarketPrice) {
            prices[sym] = {
                price: match.regularMarketPrice,
                change: match.regularMarketChange || 0,
                changePct: match.regularMarketChangePercent || 0
            };
        }
    }
    return c.json(prices);
  } catch (err) {
    console.error("[DEBUG] GET /prices error:", err);
    return c.json({}, 500);
  }
});

investmentRoutes.post('/analyze', async (c) => {
  try {
    const { symbol } = await c.req.json();
    if (!symbol) {
      return c.json({ error: 'Symbol is required' }, 400);
    }

    let marketData = null;
    let price = 0;
    let change = 0;
    let changePct = 0;
    let name = symbol.toUpperCase();

    // Try Yahoo Finance Quote API for current price
    try {
      // For Indian stocks often searched like RELIANCE, try with .NS if no suffix
      const querySymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const yfResponse = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${querySymbol},${symbol}`);
      if (yfResponse.ok) {
        const yfData = await yfResponse.json();
        const result = yfData?.quoteResponse?.result?.[0];
        if (result && result.regularMarketPrice) {
          marketData = true;
          price = result.regularMarketPrice;
          change = result.regularMarketChange;
          changePct = result.regularMarketChangePercent;
          name = result.longName || result.shortName || symbol.toUpperCase();
        }
      }
    } catch (e) {
      console.error("Market data fetch error:", e);
    }

    // Now call Gemini to analyze the stock
    const geminiKey = c.env.GEMINI_API_KEY;
    let aiAnalysis = {
        summary: "Live market data unavailable. AI analysis based on general market knowledge.",
        trend: "Unable to analyze trend without live data.",
        positive: ["Long-term growth potential"],
        negative: ["Market volatility"],
        risks: ["Economic downturns"],
        outlook: "NEUTRAL",
        confidence: 50,
        recommendation: "HOLD",
        recReason: "Insufficient data to provide a recommendation.",
        riskLevel: "Medium"
    };

    if (geminiKey) {
        const prompt = `You are an AI financial analyst. Analyze the stock symbol: ${symbol.toUpperCase()} (${name}).
${marketData ? `Current Price: ₹${price}, Change: ${change} (${changePct}%)` : `Live market data is currently unavailable for this stock.`}

Provide a JSON response strictly matching this schema:
{
  "summary": "Brief 2-3 sentence market summary of the company.",
  "trend": "Brief trend analysis.",
  "positive": ["signal 1", "signal 2", "signal 3"],
  "negative": ["signal 1", "signal 2"],
  "risks": ["risk 1", "risk 2"],
  "outlook": "BULLISH" | "NEUTRAL" | "BEARISH",
  "confidence": <number 1-100>,
  "recommendation": "BUY" | "HOLD" | "SELL",
  "recReason": "Brief reasoning for recommendation",
  "riskLevel": "Low" | "Medium" | "High"
}
Output only valid JSON. Do not include markdown formatting or json backticks.`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
                console.log("[DEBUG AI] Gemini returned text:", !!textResponse);
                if (textResponse) {
                    try {
                        let cleaned = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
                        aiAnalysis = JSON.parse(cleaned);
                        console.log("[DEBUG AI] JSON parse success.");
                    } catch (e) {
                        console.error("[DEBUG AI] JSON parse failed on Gemini response.");
                        console.error("[DEBUG AI] Response preview:", textResponse.substring(0, 150));
                    }
                } else {
                   console.error("[DEBUG AI] No text content found in Gemini response.");
                   console.error("[DEBUG AI] Response snippet:", JSON.stringify(data).substring(0, 150));
                }
            } else {
                const errorText = await response.text();
                console.error("[DEBUG AI] Gemini API returned error status:", response.status);
                console.error("[DEBUG AI] Error body preview:", errorText.substring(0, 150));
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.error("[DEBUG AI] Gemini fetch call failed entirely:", err.message);
        }
    } else {
        console.warn("No GEMINI_API_KEY found.");
    }

    return c.json({
        symbol: symbol.toUpperCase(),
        name,
        marketDataAvailable: !!marketData,
        price,
        change,
        changePct,
        analysis: aiAnalysis
    });

  } catch (err) {
    console.error("Investment analyze error:", err);
    return c.json({ error: 'Failed to analyze stock' }, 500);
  }
});

export default investmentRoutes;
