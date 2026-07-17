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

// POST /api/income — single insert
router.post('/', async (c) => {
  const body = await c.req.json();
  const { month_key, label, amount, date, notes, source, import_id, original_description, external_reference } = body;
  if (!month_key || !label || !amount || !date)
    return c.json({ error: 'month_key, label, amount, date are required' }, 400);
  
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: `INSERT INTO income (user_id, month_key, label, amount, date, notes, source, import_id, original_description, external_reference)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, month_key, label, parseFloat(amount), date, notes || '',
           source || 'manual', import_id || null, original_description || null, external_reference || null]
  });
  
  const row = await db.execute({ sql: 'SELECT * FROM income WHERE id = ?', args: [result.lastInsertRowid] });
  return c.json(row.rows[0], 201);
});

// POST /api/income/bulk — batch insert for statement imports
// Returns { inserted: N, errors: [] }
router.post('/bulk', async (c) => {
  const body = await c.req.json();
  const { rows, import_id } = body;
  if (!Array.isArray(rows) || rows.length === 0)
    return c.json({ error: 'rows array is required' }, 400);

  const db = getDb(c);
  const userId = c.get('userId');

  const inserted = [];
  const errors = [];

  for (const r of rows) {
    try {
      const { month_key, label, amount, date, notes, source, original_description, external_reference } = r;
      if (!month_key || !label || !amount || !date) { errors.push({ row: r, reason: 'missing fields' }); continue; }
      const res = await db.execute({
        sql: `INSERT INTO income (user_id, month_key, label, amount, date, notes, source, import_id, original_description, external_reference)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, month_key, label, parseFloat(amount), date, notes || '',
               source || 'bank_statement', import_id || null, original_description || null, external_reference || null]
      });
      const row = await db.execute({ sql: 'SELECT * FROM income WHERE id = ?', args: [res.lastInsertRowid] });
      inserted.push(row.rows[0]);
    } catch (e) {
      errors.push({ row: r, reason: e.message });
    }
  }

  return c.json({ inserted, errors, count: inserted.length }, 201);
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
