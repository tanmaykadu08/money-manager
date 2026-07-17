import { createClient } from '@libsql/client/web';

export function getDb(c) {
  return createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  });
}
