import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

const VALID_CATS = ['food','transport','bills','shopping','health','other'];
const VALID_PAY  = ['UPI','Cash','Card','Net Banking'];

// GET /api/expenses?month=2025-03
router.get('/', async (c) => {
  const month = c.req.query('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return c.json({ error: 'month query param required (YYYY-MM)' }, 400);
  
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: 'SELECT * FROM expenses WHERE user_id = ? AND month_key = ? ORDER BY date DESC',
    args: [userId, month]
  });
  return c.json(result.rows);
});

// POST /api/expenses
router.post('/', async (c) => {
  const { month_key, desc, amount, date, category, payment } = await c.req.json();
  if (!month_key || !desc || !amount || !date)
    return c.json({ error: 'month_key, desc, amount, date are required' }, 400);
  
  const cat = VALID_CATS.includes(category) ? category : 'other';
  const pay = VALID_PAY.includes(payment)   ? payment  : 'UPI';
  
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: 'INSERT INTO expenses (user_id, month_key, desc, amount, date, category, payment) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [userId, month_key, desc, parseFloat(amount), date, cat, pay]
  });
  
  const row = await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [result.lastInsertRowid] });
  return c.json(row.rows[0], 201);
});

// DELETE /api/expenses/:id
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const userId = c.get('userId');

  const row = await db.execute({ sql: 'SELECT id FROM expenses WHERE id = ? AND user_id = ?', args: [id, userId] });
  if (row.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  
  await db.execute({ sql: 'DELETE FROM expenses WHERE id = ?', args: [id] });
  return c.json({ success: true });
});

export default router;
