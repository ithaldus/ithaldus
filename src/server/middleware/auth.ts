import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { eq, and, gt } from 'drizzle-orm'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

export async function authMiddleware(c: Context, next: Next) {
  // Check for auth bypass mode
  if (process.env.AUTH_BYPASS === 'true') {
    // Get first admin user or create default
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
    })

    if (adminUser) {
      c.set('user', {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role as 'admin' | 'user',
      })
      return next()
    }

    // No admin exists - this shouldn't happen if db is seeded
    return c.json({ error: 'No admin user found. Run db:seed first.' }, 401)
  }

  // Normal session-based auth
  const sessionId = getCookie(c, 'session')

  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const now = new Date().toISOString()

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      gt(sessions.expiresAt, now)
    ),
    with: {
      // This requires relations to be set up
    },
  })

  if (!session) {
    return c.json({ error: 'Session expired' }, 401)
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'admin' | 'user',
  })

  return next()
}

export function requireAdmin(c: Context, next: Next) {
  const user = c.get('user')
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  return next()
}
