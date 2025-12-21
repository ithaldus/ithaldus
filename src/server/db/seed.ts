import { db } from './client'
import { users } from './schema'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('Seeding database...')

  // Check if admin user already exists
  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
  })

  if (existingAdmin) {
    console.log('Admin user already exists:', existingAdmin.email)
    return
  }

  // Create default admin user
  const adminUser = {
    id: nanoid(),
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin' as const,
    createdAt: new Date().toISOString(),
  }

  await db.insert(users).values(adminUser)

  console.log('Created admin user:', adminUser.email)
  console.log('Database seeding complete!')
}

seed().catch(console.error)
