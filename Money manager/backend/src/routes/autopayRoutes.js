import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

// GET /api/autopay
router.get('/', async (c) => {
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: 'SELECT * FROM auto_payments WHERE user_id = ? ORDER BY due_day ASC',
    args: [userId]
  });
  return c.json(result.rows.map(r => ({ ...r, active: r.active === 1 || r.active === true })));
});

// POST /api/autopay
router.post('/', async (c) => {
  const { name, amount, due_day, payment } = await c.req.json();
  if (!name || !amount || !due_day)
    return c.json({ error: 'name, amount, due_day are required' }, 400);
  
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: 'INSERT INTO auto_payments (user_id, name, amount, due_day, payment, active) VALUES (?, ?, ?, ?, ?, 1)',
    args: [userId, name, parseFloat(amount), parseInt(due_day), payment || 'Auto debit']
  });
  const row = await db.execute({ sql: 'SELECT * FROM auto_payments WHERE id = ?', args: [result.lastInsertRowid] });
  const r = row.rows[0];
  return c.json({ ...r, active: r.active === 1 || r.active === true }, 201);
});

// PATCH /api/autopay/:id/toggle
router.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const userId = c.get('userId');

  const row = await db.execute({ sql: 'SELECT * FROM auto_payments WHERE id = ? AND user_id = ?', args: [id, userId] });
  if (row.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  
  const current = row.rows[0];
  const newActive = (current.active === 1 || current.active === true) ? 0 : 1;
  await db.execute({ sql: 'UPDATE auto_payments SET active = ? WHERE id = ?', args: [newActive, id] });
  return c.json({ ...current, active: newActive === 1 });
});

// DELETE /api/autopay/:id
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const userId = c.get('userId');

  const row = await db.execute({ sql: 'SELECT id FROM auto_payments WHERE id = ? AND user_id = ?', args: [id, userId] });
  if (row.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  
  await db.execute({ sql: 'DELETE FROM auto_payments WHERE id = ?', args: [id] });
  return c.json({ success: true });
});

export default router;
