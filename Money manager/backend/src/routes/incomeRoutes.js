import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

// GET /api/income?month=2025-03
router.get('/', async (c) => {
  const month = c.req.query('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return c.json({ error: 'month query param required (YYYY-MM)' }, 400);
  
  const db = getDb(c);
  const userId = c.get('userId');
  
  const result = await db.execute({
    sql: 'SELECT * FROM income WHERE user_id = ? AND month_key = ? ORDER BY date DESC',
    args: [userId, month]
  });
  return c.json(result.rows);
});

// POST /api/income
router.post('/', async (c) => {
  const { month_key, label, amount, date, notes } = await c.req.json();
  if (!month_key || !label || !amount || !date)
    return c.json({ error: 'month_key, label, amount, date are required' }, 400);
  
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: 'INSERT INTO income (user_id, month_key, label, amount, date, notes) VALUES (?, ?, ?, ?, ?, ?)',
    args: [userId, month_key, label, parseFloat(amount), date, notes || '']
  });
  
  const row = await db.execute({ sql: 'SELECT * FROM income WHERE id = ?', args: [result.lastInsertRowid] });
  return c.json(row.rows[0], 201);
});

// DELETE /api/income/:id
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const userId = c.get('userId');

  const row = await db.execute({ sql: 'SELECT id FROM income WHERE id = ? AND user_id = ?', args: [id, userId] });
  if (row.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  
  await db.execute({ sql: 'DELETE FROM income WHERE id = ?', args: [id] });
  return c.json({ success: true });
});

export default router;
