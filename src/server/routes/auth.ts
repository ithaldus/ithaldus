import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from '../db/client'
import { users, sessions } from '../db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const authRoutes = new Hono()

// Get current user
authRoutes.get('/me', async (c) => {
  // Check for auth bypass mode
  if (process.env.AUTH_BYPASS === 'true') {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
    })

    if (adminUser) {
      return c.json({
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      })
    }

    return c.json({ error: 'No admin user found' }, 401)
  }

  const sessionId = getCookie(c, 'session')

  if (!sessionId) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const now = new Date().toISOString()

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      gt(sessions.expiresAt, now)
    ),
  })

  if (!session) {
    deleteCookie(c, 'session')
    return c.json({ error: 'Session expired' }, 401)
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
})

// Logout
authRoutes.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session')

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
    deleteCookie(c, 'session')
  }

  return c.json({ success: true })
})

// MS365 OAuth login - redirect to Microsoft
authRoutes.get('/login', async (c) => {
  if (process.env.AUTH_BYPASS === 'true') {
    return c.redirect('/networks')
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback`

  if (!clientId || !tenantId) {
    return c.json({ error: 'Microsoft OAuth not configured' }, 500)
  }

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'openid profile email')
  authUrl.searchParams.set('response_mode', 'query')

  return c.redirect(authUrl.toString())
})

// MS365 OAuth callback
authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')

  if (error) {
    return c.redirect('/login?error=oauth_error')
  }

  if (!code) {
    return c.redirect('/login?error=no_code')
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback`

  if (!clientId || !clientSecret || !tenantId) {
    return c.redirect('/login?error=config_error')
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      }
    )

    if (!tokenResponse.ok) {
      return c.redirect('/login?error=token_error')
    }

    const tokens = await tokenResponse.json()

    // Get user info from Microsoft Graph
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userResponse.ok) {
      return c.redirect('/login?error=user_error')
    }

    const msUser = await userResponse.json()
    const email = msUser.mail || msUser.userPrincipalName

    // Check if user is in whitelist
    const whitelistedUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    })

    if (!whitelistedUser) {
      return c.redirect('/login?error=access_denied')
    }

    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, whitelistedUser.id))

    // Create session
    const sessionId = nanoid(32)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

    await db.insert(sessions).values({
      id: sessionId,
      userId: whitelistedUser.id,
      createdAt: new Date().toISOString(),
      expiresAt,
    })

    setCookie(c, 'session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return c.redirect('/networks')
  } catch (err) {
    console.error('OAuth callback error:', err)
    return c.redirect('/login?error=callback_error')
  }
})
