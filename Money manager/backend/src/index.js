import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db.js';

import authRoutes from './routes/authRoutes.js';
import incomeRoutes from './routes/incomeRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import autopayRoutes from './routes/autopayRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE', 'PUT', 'PATCH'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600
}));

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Initial DB setup endpoint (optional, you can trigger this via a specific route or script)
app.get('/api/init-db', async (c) => {
  try {
    const db = getDb(c);
    
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

    return c.json({ success: true, message: 'Database initialized successfully' });
  } catch (err) {
    console.error('Init DB error:', err);
    return c.json({ error: 'Failed to init db' }, 500);
  }
});

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/income', incomeRoutes);
app.route('/api/expenses', expenseRoutes);
app.route('/api/autopay', autopayRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/ai', aiRoutes);

export default app;
