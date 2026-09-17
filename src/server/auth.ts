import { createServerFn } from '@tanstack/solid-start'
import { getCookie, setCookie, deleteCookie } from '@tanstack/solid-start/server'
import { eq } from 'drizzle-orm'
import { compare, hash } from 'bcryptjs'
import { db } from './db'
import { sessions, users } from './db/schema'
import { SigninSchema, SignupSchema } from '../types/auth-schemas'

const SESSION_COOKIE = 'gc_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const signupEnabled = () => process.env.ENABLE_SIGNUP === 'true'

const randomToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const normalizeEmail = (email: string) => email.trim().toLowerCase()

async function issueSession(userId: string) {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({ id: token, userId, expiresAt })
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export const getSignupEnabled = createServerFn({ method: 'GET' }).handler(() => ({
  signupEnabled: signupEnabled(),
}))

// The valibot schema runs on the client (before the request) and on the
// server (before the handler) — one contract, both ends.
export const signup = createServerFn({ method: 'POST' })
  .validator(SignupSchema)
  .handler(async ({ data }) => {
    if (!signupEnabled()) throw new Error('Account creation is disabled on this instance')
    const email = normalizeEmail(data.email)

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    if (existing.length > 0) throw new Error('An account with that email already exists')

    const passwordHash = await hash(data.password, 10)
    const [user] = await db.insert(users).values({ email, passwordHash }).returning()
    await issueSession(user.id)
    return { id: user.id, email: user.email }
  })

export const login = createServerFn({ method: 'POST' })
  .validator(SigninSchema)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email)
    const [user] = await db.select().from(users).where(eq(users.email, email))
    if (!user || !(await compare(data.password, user.passwordHash))) {
      throw new Error('Invalid email or password')
    }
    await issueSession(user.id)
    return { id: user.id, email: user.email }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const token = getCookie(SESSION_COOKIE)
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token))
    deleteCookie(SESSION_COOKIE)
  }
})

// Session check for route guards. Returns null when signed out.
export const getSessionUser = createServerFn({ method: 'GET' }).handler(async () => {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const [row] = await db
    .select({ id: users.id, email: users.email, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
  if (!row) return null
  if (row.expiresAt < new Date()) {
    // Expired sessions are dead weight — sweep them on sight.
    await db.delete(sessions).where(eq(sessions.id, token))
    return null
  }
  return { id: row.id, email: row.email }
})
