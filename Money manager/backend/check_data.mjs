import { createClient } from '@libsql/client';
const db = createClient({
  url: 'libsql://money-manager-tanmaykadu08.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODQzMTQ4ODMsImlkIjoiMDE5ZjcxNmUtNGMwMS03ZDMzLTg5MjUtN2M3NWQxNjc3ZmY4Iiwia2lkIjoienRBNldWYkJZS0FVMlMybllpMXlNM1NQMWtWbnJsMkVjUnd0b1RXNDJCVSIsInJpZCI6IjA1OTk4MjRiLWQxYTgtNDNjOC05YTBlLTFjOGZiOTM0YmRiYiJ9.T7jHPbRhu6q9EbucrKNT1_K6LK808h7jfhgvJtL0xh33PWrBVIrsXmVxHIE33n4IWWKWUeb3IzBBIjXRet_XAg'
});

async function run() {
  try {
    const expenses = await db.execute('SELECT * FROM expenses ORDER BY id DESC LIMIT 5');
    console.log('\nLatest 5 expenses:');
    console.log(expenses.rows);
    
    const errors = await db.execute('SELECT * FROM statement_imports ORDER BY id DESC LIMIT 5');
    console.log('\nLatest 5 statement_imports:');
    console.log(errors.rows);
  } catch (e) {
    console.error(e);
  }
}
run();
