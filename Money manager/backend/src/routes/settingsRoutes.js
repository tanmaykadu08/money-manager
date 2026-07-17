import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

// GET /api/settings
router.get('/', async (c) => {
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({ sql: 'SELECT * FROM settings WHERE user_id = ?', args: [userId] });
  if (result.rows.length === 0) {
    await db.execute({ sql: 'INSERT INTO settings (user_id, bank_balance) VALUES (?, 0)', args: [userId] });
    return c.json({ user_id: userId, bank_balance: 0 });
  }
  return c.json(result.rows[0]);
});

// PUT /api/settings
router.put('/', async (c) => {
  const { bank_balance } = await c.req.json();
  if (bank_balance === undefined) return c.json({ error: 'bank_balance is required' }, 400);
  
  const db = getDb(c);
  const userId = c.get('userId');

  await db.execute({
    sql: `INSERT INTO settings (user_id, bank_balance, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET bank_balance = excluded.bank_balance, updated_at = excluded.updated_at`,
    args: [userId, parseFloat(bank_balance)]
  });
  return c.json({ user_id: userId, bank_balance: parseFloat(bank_balance) });
});

// GET /api/settings/summary
router.get('/summary', async (c) => {
  const db = getDb(c);
  const userId = c.get('userId');

  const inc = await db.execute({ sql: 'SELECT SUM(amount) as total FROM income WHERE user_id = ?', args: [userId] });
  const exp = await db.execute({ sql: 'SELECT SUM(amount) as total FROM expenses WHERE user_id = ?', args: [userId] });
  
  const months = await db.execute({ 
    sql: 'SELECT count(DISTINCT month_key) as c FROM (SELECT month_key FROM income WHERE user_id = ? UNION SELECT month_key FROM expenses WHERE user_id = ?)', 
    args: [userId, userId] 
  });
  
  const auto = await db.execute({ sql: 'SELECT SUM(amount) as total FROM auto_payments WHERE user_id = ? AND active = 1', args: [userId] });
  
  const totalInc = inc.rows[0].total || 0;
  const totalExp = exp.rows[0].total || 0;
  const mCount = months.rows[0].c || 1; // At least 1 month
  const totalAuto = (auto.rows[0].total || 0) * mCount;

  return c.json({ total_savings: totalInc - totalExp - totalAuto });
});

export default router;
