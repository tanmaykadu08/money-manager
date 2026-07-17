import { sign, verify } from 'hono/jwt';

export async function authMiddleware(c, next) {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }
  const token = header.slice(7);
  try {
    const secret = c.env.JWT_SECRET || 'change-this-secret-in-production';
    const payload = await verify(token, secret, 'HS256');
    c.set('userId', payload.userId);
    c.set('userEmail', payload.email);
    await next();
  } catch (err) {
    return c.json({ error: 'Token verification failed: ' + err.message }, 401);
  }
}

export async function signToken(userId, email, secret) {
  const payload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
  };
  return await sign(payload, secret, 'HS256');
}
