import { createClient } from '@libsql/client';

const db = createClient({
  url: 'libsql://money-manager-tanmaykadu08.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODQzMTQ4ODMsImlkIjoiMDE5ZjcxNmUtNGMwMS03ZDMzLTg5MjUtN2M3NWQxNjc3ZmY4Iiwia2lkIjoienRBNldWYkJZS0FVMlMybllpMXlNM1NQMWtWbnJsMkVjUnd0b1RXNDJCVSIsInJpZCI6IjA1OTk4MjRiLWQxYTgtNDNjOC05YTBlLTFjOGZiOTM0YmRiYiJ9.T7jHPbRhu6q9EbucrKNT1_K6LK808h7jfhgvJtL0xh33PWrBVIrsXmVxHIE33n4IWWKWUeb3IzBBIjXRet_XAg'
});

async function run() {
  try {
    const res = await db.execute("SELECT * FROM expenses WHERE month_key = 'NaN-NaN'");
    console.log("NaN-NaN expenses:", res.rows.length);
    console.log(res.rows.slice(0, 5));
    
    const res2 = await db.execute("SELECT * FROM expenses ORDER BY id DESC LIMIT 5");
    console.log("Recent expenses:");
    console.log(res2.rows);
  } catch (e) {
    console.error(e);
  }
}
run();
