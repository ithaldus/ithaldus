import { Hono } from 'hono'
import { db } from '../db/client'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

export const usersRoutes = new Hono()

// List all users
usersRoutes.get('/', async (c) => {
  const allUsers = await db.select().from(users).orderBy(users.name)
  return c.json(allUsers)
})

// Get current user
usersRoutes.get('/me', async (c) => {
  const user = c.get('user')
  return c.json(user)
})

// Create user (admin only)
usersRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { email, name, role } = body

  if (!email || !name) {
    return c.json({ error: 'Email and name are required' }, 400)
  }

  // Check if email already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  })

  if (existing) {
    return c.json({ error: 'Email already exists' }, 400)
  }

  const newUser = {
    id: nanoid(),
    email: email.toLowerCase(),
    name,
    role: role || 'user',
    createdAt: new Date().toISOString(),
  }

  await db.insert(users).values(newUser)

  return c.json(newUser, 201)
})

// Update user (admin only)
usersRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { email, name, role } = body

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
  })

  if (!existing) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Check if email is being changed and already exists
  if (email && email.toLowerCase() !== existing.email) {
    const emailExists = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    })

    if (emailExists) {
      return c.json({ error: 'Email already exists' }, 400)
    }
  }

  await db.update(users)
    .set({
      email: email ? email.toLowerCase() : existing.email,
      name: name || existing.name,
      role: role || existing.role,
    })
    .where(eq(users.id, id))

  const updated = await db.query.users.findFirst({
    where: eq(users.id, id),
  })

  return c.json(updated)
})

// Delete user (admin only)
usersRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const currentUser = c.get('user')

  // Prevent self-deletion
  if (id === currentUser.id) {
    return c.json({ error: 'Cannot delete your own account' }, 400)
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
  })

  if (!existing) {
    return c.json({ error: 'User not found' }, 404)
  }

  await db.delete(users).where(eq(users.id, id))

  return c.json({ success: true })
})
