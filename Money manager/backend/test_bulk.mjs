import { createClient } from '@libsql/client';
import { sign } from 'hono/jwt';

const db = createClient({
  url: 'libsql://money-manager-tanmaykadu08.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODQzMTQ4ODMsImlkIjoiMDE5ZjcxNmUtNGMwMS03ZDMzLTg5MjUtN2M3NWQxNjc3ZmY4Iiwia2lkIjoienRBNldWYkJZS0FVMlMybllpMXlNM1NQMWtWbnJsMkVjUnd0b1RXNDJCVSIsInJpZCI6IjA1OTk4MjRiLWQxYTgtNDNjOC05YTBlLTFjOGZiOTM0YmRiYiJ9.T7jHPbRhu6q9EbucrKNT1_K6LK808h7jfhgvJtL0xh33PWrBVIrsXmVxHIE33n4IWWKWUeb3IzBBIjXRet_XAg'
});

async function run() {
  try {
    // 1. Get or create a test user
    const res = await db.execute("SELECT id FROM users LIMIT 1");
    let userId;
    if (res.rows.length > 0) {
      userId = res.rows[0].id;
    } else {
      const ins = await db.execute("INSERT INTO users (email, password, name) VALUES ('test@example.com', 'pwd', 'test')");
      userId = Number(ins.lastInsertRowid);
    }
    console.log("Using userId:", userId);

    // 2. Generate JWT token
    const JWT_SECRET = 'change-this-secret-in-production';
    const token = await sign({ userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 }, JWT_SECRET);

    // 3. Make the bulk request to the LIVE worker
    const fetchRes = await fetch('https://money-manager.tanmaykadu08.workers.dev/api/expenses/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        rows: [
          {
            month_key: "2026-07",
            desc: "Starbucks",
            amount: 5.50,
            date: "2026-07-01",
            category: "food",
            payment: "UPI",
            source: "bank_statement",
            original_description: "Starbucks Store 123",
            external_reference: "TXN123"
          }
        ]
      })
    });

    const body = await fetchRes.text();
    console.log("Status:", fetchRes.status);
    console.log("Response:", body);
  } catch (e) {
    console.error(e);
  }
}
run();
