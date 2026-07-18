import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db.js';

import authRoutes from './routes/authRoutes.js';
import incomeRoutes from './routes/incomeRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import autopayRoutes from './routes/autopayRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { authMiddleware } from './auth.js';


const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE', 'PUT', 'PATCH'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── DB Init (idempotent — safe to call multiple times) ──
app.post('/api/init-db', async (c) => {
  // Protect the init-db endpoint
  const authHeader = c.req.header('x-init-secret');
  if (authHeader !== 'mypocket-init-secret-2026') {
    return c.json({ error: 'Unauthorized database initialization' }, 401);
  }

  try {
    const db = getDb(c);
    
    // Core tables
    await db.execute(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      import_id INTEGER,
      original_description TEXT,
      external_reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      desc TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      payment TEXT NOT NULL DEFAULT 'UPI',
      source TEXT NOT NULL DEFAULT 'manual',
      import_id INTEGER,
      original_description TEXT,
      external_reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS auto_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER NOT NULL,
      payment TEXT NOT NULL DEFAULT 'Auto debit',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER PRIMARY KEY,
      bank_balance REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // Statement imports tracking table
    await db.execute(`CREATE TABLE IF NOT EXISTS statement_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      income_count INTEGER NOT NULL DEFAULT 0,
      expense_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // Attempt to add new columns to existing tables (safe — each wrapped individually)
    const alterStatements = [
      `ALTER TABLE income ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`,
      `ALTER TABLE income ADD COLUMN import_id INTEGER`,
      `ALTER TABLE income ADD COLUMN original_description TEXT`,
      `ALTER TABLE income ADD COLUMN external_reference TEXT`,
      `ALTER TABLE expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`,
      `ALTER TABLE expenses ADD COLUMN import_id INTEGER`,
      `ALTER TABLE expenses ADD COLUMN original_description TEXT`,
      `ALTER TABLE expenses ADD COLUMN external_reference TEXT`,
    ];
    for (const sql of alterStatements) {
      try { await db.execute(sql); } catch (_) { /* column already exists — ignore */ }
    }

    // Savings Goals schema
    await db.execute(`CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      icon TEXT NOT NULL DEFAULT '🎯',
      description TEXT DEFAULT '',
      target_amount REAL NOT NULL,
      initial_saved_amount REAL NOT NULL DEFAULT 0,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS goal_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      contribution_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Indexes for efficient querying
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_contributions_goal_id ON goal_contributions(goal_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_contributions_user_id ON goal_contributions(user_id)`);

    return c.json({ success: true, message: 'Database initialized successfully' });
  } catch (err) {
    console.error('Init DB error:', err);
    return c.json({ error: 'Failed to init db', detail: err.message }, 500);
  }
});

// ── Statement Imports API ──
app.use('/api/statement-imports/*', authMiddleware);

// POST /api/statement-imports — create import record
app.post('/api/statement-imports', async (c) => {
  try {
    const { filename, file_type, record_count, income_count, expense_count } = await c.req.json();
    const db = getDb(c);
    const userId = c.get('userId');
    const result = await db.execute({
      sql: `INSERT INTO statement_imports (user_id, filename, file_type, record_count, income_count, expense_count, status)
            VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
      args: [userId, filename || 'unknown', file_type || 'csv',
             record_count || 0, income_count || 0, expense_count || 0]
    });
    const row = await db.execute({ sql: 'SELECT * FROM statement_imports WHERE id = ?', args: [result.lastInsertRowid] });
    return c.json(row.rows[0], 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/statement-imports — list imports for user
app.get('/api/statement-imports', async (c) => {
  const db = getDb(c);
  const userId = c.get('userId');
  const result = await db.execute({
    sql: 'SELECT * FROM statement_imports WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    args: [userId]
  });
  return c.json(result.rows);
});

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/income', incomeRoutes);
app.route('/api/expenses', expenseRoutes);
app.route('/api/autopay', autopayRoutes);
app.route('/api/settings', settingsRoutes);

import goalRoutes from './routes/goalRoutes.js';
app.route('/api/goals', goalRoutes);

export default app;
