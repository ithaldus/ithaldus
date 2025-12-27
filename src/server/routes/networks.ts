import { Hono } from 'hono'
import { db } from '../db/client'
import { networks, credentials, failedCredentials, matchedDevices } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { requireAdmin } from '../middleware/auth'

// Helper: Delete any duplicate credentials that match the given username/password
// Keeps only one root credential, removes global and network-specific duplicates
async function deleteMatchingCredentials(username: string, password: string, keepCredentialId?: string) {
  const dupes = await db.query.credentials.findMany({
    where: and(
      eq(credentials.username, username),
      eq(credentials.password, password)
    ),
  })

  for (const dupe of dupes) {
    // Keep the specified credential (the one we just created/found)
    if (dupe.id === keepCredentialId) continue
    // Keep root credentials (they track failed/matched devices per network)
    if (dupe.isRoot) continue
    // Delete global and network-specific non-root duplicates
    await db.delete(credentials).where(eq(credentials.id, dupe.id))
  }
}

// Helper: Find or create a root credential with the given username/password
async function findOrCreateRootCredential(username: string, password: string, networkId: string): Promise<string> {
  // Check if a root credential with same username/password already exists
  const existingRoot = await db.query.credentials.findFirst({
    where: and(
      eq(credentials.username, username),
      eq(credentials.password, password),
      eq(credentials.isRoot, true)
    ),
  })

  if (existingRoot) {
    return existingRoot.id
  }

  // Create new root credential
  const newId = nanoid()
  await db.insert(credentials).values({
    id: newId,
    username,
    password,
    networkId,
    isRoot: true,
  })

  return newId
}

export const networksRoutes = new Hono()

// List all networks
networksRoutes.get('/', async (c) => {
  const allNetworks = await db.select().from(networks).orderBy(networks.name)
  return c.json(allNetworks)
})

// Get single network
networksRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const network = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!network) {
    return c.json({ error: 'Network not found' }, 404)
  }

  return c.json(network)
})

// Create network (admin only)
networksRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { name, rootIp, rootUsername, rootPassword } = body

  if (!name || !rootIp || !rootUsername || !rootPassword) {
    return c.json({ error: 'All fields are required' }, 400)
  }

  const newNetwork = {
    id: nanoid(),
    name,
    rootIp,
    rootUsername,
    rootPassword,
    createdAt: new Date().toISOString(),
  }

  await db.insert(networks).values(newNetwork)

  // Find or create root credential (reuses existing if same username/password)
  const rootCredId = await findOrCreateRootCredential(rootUsername, rootPassword, newNetwork.id)

  // Remove any matching non-root credentials (now redundant)
  await deleteMatchingCredentials(rootUsername, rootPassword, rootCredId)

  return c.json(newNetwork, 201)
})

// Update network (admin only)
networksRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, rootIp, rootUsername, rootPassword } = body

  const existing = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Network not found' }, 404)
  }

  const newUsername = rootUsername || existing.rootUsername
  const newPassword = rootPassword || existing.rootPassword
  const credentialChanging = newUsername !== existing.rootUsername || newPassword !== existing.rootPassword

  await db.update(networks)
    .set({
      name: name || existing.name,
      rootIp: rootIp || existing.rootIp,
      rootUsername: newUsername,
      rootPassword: newPassword,
    })
    .where(eq(networks.id, id))

  // Find or create root credential (reuses existing if same username/password)
  const rootCredId = await findOrCreateRootCredential(newUsername, newPassword, id)

  // If credentials changed, clear failed/matched associations for this network's old root cred
  if (credentialChanging) {
    const oldRootCred = await db.query.credentials.findFirst({
      where: and(
        eq(credentials.networkId, id),
        eq(credentials.isRoot, true)
      ),
    })
    if (oldRootCred && oldRootCred.id !== rootCredId) {
      await db.delete(failedCredentials).where(eq(failedCredentials.credentialId, oldRootCred.id))
      await db.delete(matchedDevices).where(eq(matchedDevices.credentialId, oldRootCred.id))
      // Delete old root credential if it's now orphaned (only belonged to this network)
      await db.delete(credentials).where(eq(credentials.id, oldRootCred.id))
    }
  }

  // Remove any matching non-root credentials (now redundant)
  await deleteMatchingCredentials(newUsername, newPassword, rootCredId)

  const updated = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  return c.json(updated)
})

// Delete network (admin only)
networksRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!existing) {
    return c.json({ error: 'Network not found' }, 404)
  }

  await db.delete(networks).where(eq(networks.id, id))

  return c.json({ success: true })
})

// Ping network to check online status
networksRoutes.post('/:id/ping', async (c) => {
  const id = c.req.param('id')

  const network = await db.query.networks.findFirst({
    where: eq(networks.id, id),
  })

  if (!network) {
    return c.json({ error: 'Network not found' }, 404)
  }

  // Simple TCP ping to check if device is reachable (SSH port 22)
  const isOnline = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000)

    Bun.connect({
      hostname: network.rootIp,
      port: 22,
      socket: {
        open(socket) {
          clearTimeout(timeout)
          socket.end()
          resolve(true)
        },
        data() {},
        close() {},
        error() {
          clearTimeout(timeout)
          resolve(false)
        },
      },
    }).catch(() => {
      clearTimeout(timeout)
      resolve(false)
    })
  })

  await db.update(networks)
    .set({ isOnline })
    .where(eq(networks.id, id))

  return c.json({ isOnline })
})
