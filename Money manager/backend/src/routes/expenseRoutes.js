import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

const VALID_CATS = ['food','transport','bills','shopping','health','entertainment','education','rent','subscription','transfer','other'];
const VALID_PAY  = ['UPI','Cash','Card','Net Banking','Auto debit'];

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

// POST /api/expenses — single insert
router.post('/', async (c) => {
  const body = await c.req.json();
  const { month_key, desc, amount, date, category, payment, source, import_id, original_description, external_reference } = body;
  if (!month_key || !desc || !amount || !date)
    return c.json({ error: 'month_key, desc, amount, date are required' }, 400);
  
  const cat = VALID_CATS.includes(category) ? category : 'other';
  const pay = VALID_PAY.includes(payment) ? payment : 'UPI';
  
  const db = getDb(c);
  const userId = c.get('userId');

  const result = await db.execute({
    sql: `INSERT INTO expenses (user_id, month_key, desc, amount, date, category, payment, source, import_id, original_description, external_reference)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, month_key, desc, parseFloat(amount), date, cat, pay,
           source || 'manual', import_id || null, original_description || null, external_reference || null]
  });
  
  const row = await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [result.lastInsertRowid] });
  return c.json(row.rows[0], 201);
});

// POST /api/expenses/bulk — batch insert for statement imports
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
      const { month_key, desc, amount, date, category, payment, source, original_description, external_reference } = r;
      if (!month_key || !desc || !amount || !date) { errors.push({ row: r, reason: 'missing fields' }); continue; }
      const cat = VALID_CATS.includes(category) ? category : 'other';
      const pay = VALID_PAY.includes(payment) ? payment : 'UPI';
      const res = await db.execute({
        sql: `INSERT INTO expenses (user_id, month_key, desc, amount, date, category, payment, source, import_id, original_description, external_reference)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, month_key, desc, parseFloat(amount), date, cat, pay,
               source || 'bank_statement', import_id || null, original_description || null, external_reference || null]
      });
      const row = await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [res.lastInsertRowid] });
      inserted.push(row.rows[0]);
    } catch (e) {
      errors.push({ row: r, reason: e.message });
    }
  }

  return c.json({ inserted, errors, count: inserted.length }, 201);
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
