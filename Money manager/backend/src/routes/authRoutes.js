import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';
import { signToken } from '../auth.js';

const router = new Hono();

// POST /api/auth/register
router.post('/register', async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);
    if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);

    const db = getDb(c);
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase().trim()] });
    if (existing.rows.length > 0) return c.json({ error: 'An account with this email already exists' }, 409);

    const hash = await bcrypt.hash(password, 12);
    const result = await db.execute({
      sql: 'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      args: [email.toLowerCase().trim(), hash, name || '']
    });

    const userId = Number(result.lastInsertRowid);
    await db.execute({ sql: 'INSERT INTO settings (user_id, bank_balance) VALUES (?, 0)', args: [userId] });

    const secret = c.env.JWT_SECRET || 'change-this-secret-in-production';
    const token = await signToken(userId, email, secret);
    
    return c.json({ token, user: { id: userId, email, name: name || '' } }, 201);
  } catch (err) {
    console.error('Register error:', err);
    return c.json({ error: 'Server error during registration' }, 500);
  }
});

// POST /api/auth/login
router.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

    const db = getDb(c);
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase().trim()] });
    if (result.rows.length === 0) return c.json({ error: 'Invalid email or password' }, 401);

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return c.json({ error: 'Invalid email or password' }, 401);

    const secret = c.env.JWT_SECRET || 'change-this-secret-in-production';
    const token = await signToken(Number(user.id), user.email, secret);
    
    return c.json({ token, user: { id: Number(user.id), email: user.email, name: user.name } });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Server error during login' }, 500);
  }
});

export default router;
