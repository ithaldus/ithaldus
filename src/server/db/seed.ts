import { db } from './client'
import { users } from './schema'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('Seeding database...')

  // Users to seed - uses generic example data for development
  const usersToSeed = [
    {
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin' as const,
    },
  ]

  for (const userData of usersToSeed) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, userData.email),
    })

    if (existing) {
      console.log('User already exists:', userData.email)
      continue
    }

    await db.insert(users).values({
      id: nanoid(),
      ...userData,
      createdAt: new Date().toISOString(),
    })

    console.log('Created user:', userData.email)
  }

  console.log('Database seeding complete!')
}

seed().catch(console.error)
