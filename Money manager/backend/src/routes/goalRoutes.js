import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = new Hono();
router.use('/*', authMiddleware);

// GET /api/goals
router.get('/', async (c) => {
  const db = getDb(c);
  const userId = c.get('userId');
  
  // Get current month YYYY-MM
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  const result = await db.execute({
    sql: `SELECT g.*, 
          COALESCE(SUM(c.amount), 0) as contributed_amount,
          COALESCE(SUM(CASE WHEN strftime('%Y-%m', c.contribution_date) = ? THEN c.amount ELSE 0 END), 0) as month_contributed
          FROM goals g
          LEFT JOIN goal_contributions c ON g.id = c.goal_id
          WHERE g.user_id = ?
          GROUP BY g.id
          ORDER BY g.created_at DESC`,
    args: [currentMonth, userId]
  });
  
  // Format response to include total_saved
  const goals = result.rows.map(row => {
    return {
      ...row,
      total_saved: (row.initial_saved_amount || 0) + (row.contributed_amount || 0),
      month_contributed: row.month_contributed || 0
    };
  });
  
  return c.json(goals);
});

// POST /api/goals
router.post('/', async (c) => {
  const body = await c.req.json();
  const { name, category, icon, description, target_amount, initial_saved_amount, target_date } = body;
  
  if (!name || typeof name !== 'string') return c.json({ error: 'Name is required' }, 400);
  if (target_amount === undefined || target_amount <= 0) return c.json({ error: 'Target amount must be > 0' }, 400);
  
  const initial = initial_saved_amount ? Math.max(0, parseFloat(initial_saved_amount)) : 0;
  let parsedDate = null;
  if (target_date) {
    if (isNaN(new Date(target_date).getTime())) return c.json({ error: 'Invalid target date' }, 400);
    parsedDate = target_date;
  }
  
  const db = getDb(c);
  const userId = c.get('userId');
  
  const result = await db.execute({
    sql: `INSERT INTO goals (user_id, name, category, icon, description, target_amount, initial_saved_amount, target_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    args: [
      userId, 
      name, 
      category || 'Other', 
      icon || '🎯', 
      description || '', 
      parseFloat(target_amount), 
      initial, 
      parsedDate
    ]
  });
  
  const row = await db.execute({ sql: 'SELECT * FROM goals WHERE id = ?', args: [result.lastInsertRowid] });
  return c.json(row.rows[0], 201);
});

// PUT /api/goals/:id
router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c);
  const userId = c.get('userId');
  
  // Verify ownership
  const goal = await db.execute({ sql: 'SELECT user_id FROM goals WHERE id = ?', args: [id] });
  if (goal.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  if (goal.rows[0].user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  
  const { name, category, icon, description, target_amount, target_date, status } = body;
  
  if (target_amount !== undefined && target_amount <= 0) return c.json({ error: 'Target amount must be > 0' }, 400);
  let parsedDate = target_date === null ? null : (target_date || undefined);
  if (parsedDate) {
     if (isNaN(new Date(parsedDate).getTime())) return c.json({ error: 'Invalid target date' }, 400);
  }
  
  await db.execute({
    sql: `UPDATE goals 
          SET name = COALESCE(?, name),
              category = COALESCE(?, category),
              icon = COALESCE(?, icon),
              description = COALESCE(?, description),
              target_amount = COALESCE(?, target_amount),
              target_date = ?,
              status = COALESCE(?, status),
              updated_at = datetime('now')
          WHERE id = ? AND user_id = ?`,
    args: [name, category, icon, description, target_amount, parsedDate, status, id, userId]
  });
  
  return c.json({ success: true });
});

// DELETE /api/goals/:id
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c);
  const userId = c.get('userId');
  
  // Verify ownership
  const goal = await db.execute({ sql: 'SELECT user_id FROM goals WHERE id = ?', args: [id] });
  if (goal.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  if (goal.rows[0].user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  
  // Cascade delete handles contributions
  await db.execute({ sql: 'DELETE FROM goals WHERE id = ? AND user_id = ?', args: [id, userId] });
  return c.json({ success: true });
});

// GET /api/goals/:id/contributions
router.get('/:id/contributions', async (c) => {
  const goalId = c.req.param('id');
  const db = getDb(c);
  const userId = c.get('userId');
  
  // Verify goal ownership
  const goal = await db.execute({ sql: 'SELECT user_id FROM goals WHERE id = ?', args: [goalId] });
  if (goal.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  if (goal.rows[0].user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  
  const result = await db.execute({
    sql: 'SELECT * FROM goal_contributions WHERE goal_id = ? AND user_id = ? ORDER BY contribution_date DESC, created_at DESC',
    args: [goalId, userId]
  });
  
  return c.json(result.rows);
});

// POST /api/goals/:id/contributions
router.post('/:id/contributions', async (c) => {
  const goalId = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c);
  const userId = c.get('userId');
  
  // Verify goal ownership
  const goal = await db.execute({ sql: 'SELECT user_id FROM goals WHERE id = ?', args: [goalId] });
  if (goal.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  if (goal.rows[0].user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  
  const { amount, contribution_date, note } = body;
  
  if (!amount || amount <= 0) return c.json({ error: 'Contribution amount must be positive' }, 400);
  
  const dateStr = contribution_date || new Date().toISOString().split('T')[0];
  if (isNaN(new Date(dateStr).getTime())) return c.json({ error: 'Invalid contribution date' }, 400);
  
  const result = await db.execute({
    sql: `INSERT INTO goal_contributions (goal_id, user_id, amount, contribution_date, note)
          VALUES (?, ?, ?, ?, ?)`,
    args: [goalId, userId, parseFloat(amount), dateStr, note || '']
  });
  
  const row = await db.execute({ sql: 'SELECT * FROM goal_contributions WHERE id = ?', args: [result.lastInsertRowid] });
  return c.json(row.rows[0], 201);
});

// DELETE /api/goals/:id/contributions/:cid
router.delete('/:id/contributions/:cid', async (c) => {
  const goalId = c.req.param('id');
  const cid = c.req.param('cid');
  const db = getDb(c);
  const userId = c.get('userId');
  
  // Verify goal ownership
  const goal = await db.execute({ sql: 'SELECT user_id FROM goals WHERE id = ?', args: [goalId] });
  if (goal.rows.length === 0) return c.json({ error: 'Not found' }, 404);
  if (goal.rows[0].user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  
  // Verify contribution ownership just to be safe
  const contrib = await db.execute({ sql: 'SELECT user_id FROM goal_contributions WHERE id = ?', args: [cid] });
  if (contrib.rows.length === 0) return c.json({ error: 'Contribution not found' }, 404);
  if (contrib.rows[0].user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  
  await db.execute({ sql: 'DELETE FROM goal_contributions WHERE id = ? AND user_id = ?', args: [cid, userId] });
  return c.json({ success: true });
});

export default router;
