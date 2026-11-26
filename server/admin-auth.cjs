const { createHmac, randomBytes, scrypt, timingSafeEqual } = require('node:crypto')
const { promisify } = require('node:util')
const { and, eq, gt, isNull, lte, sql } = require('drizzle-orm')
const { admins, adminRoles, adminSessions, adminPasswordLinks, adminAuthLimits } = require('./schema.cjs')
const { AdminError, recordAdminAction } = require('./admin-actor.cjs')
const { emailAddress, ScheduleError, text } = require('./schedule-input.cjs')

const derive = promisify(scrypt)
const options = { N: 32768, r: 8, p: 3, maxmem: 40 * 1024 * 1024 }
const format = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{64})$/
const opaqueToken = /^[A-Za-z0-9_-]{43}$/
const sessionLifetime = 8 * 60 * 60_000
const passwordLinkLifetime = 30 * 60_000
let hashing = false

async function derivePassword(password, salt) {
  if (hashing) throw new AdminError(429, 'Sign-in is busy. Try again shortly.', 1)
  hashing = true
  try {
    return await derive(password, salt, 32, options)
  } finally {
    hashing = false
  }
}

function passwordFits(password) {
  return typeof password === 'string' && password.length <= 256 && password.isWellFormed() && !password.includes('\0')
}

async function hashPassword(password) {
  if (!passwordFits(password) || [...password].length < 15) {
    throw new AdminError(400, 'Use a password between 15 and 256 characters.')
  }
  const salt = randomBytes(16)
  const hash = await derivePassword(password, salt)
  return `scrypt-v1:${salt.toString('hex')}:${hash.toString('hex')}`
}

async function verifyPassword(password, stored) {
  const match = format.exec(stored ?? '')
  const salt = match ? Buffer.from(match[1], 'hex') : Buffer.alloc(16)
  const expected = match ? Buffer.from(match[2], 'hex') : Buffer.alloc(32)
  const computed = await derivePassword(password, salt)
  return timingSafeEqual(computed, expected) && Boolean(match)
}

const newToken = () => randomBytes(32).toString('base64url')

function digest(secret, purpose, token) {
  return createHmac('sha256', secret).update(purpose).update('\0').update(token).digest('hex')
}

function sessionHash(secret, token) {
  return typeof token === 'string' && opaqueToken.test(token) ? digest(secret, 'session', token) : null
}

function accountTransaction(db, work) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(434721, 4)`)
    return work(tx)
  })
}

async function rateLimit(db, secret, scope, maximum, windowMs) {
  const now = Date.now()
  const expiresAt = new Date(Math.floor(now / windowMs) * windowMs + windowMs)
  const key = digest(secret, 'rate', `${scope}/${expiresAt.toISOString()}`)
  const [bucket] = await db.insert(adminAuthLimits).values({ key, attempts: 1, expiresAt })
    .onConflictDoUpdate({
      target: adminAuthLimits.key,
      set: { attempts: sql`${adminAuthLimits.attempts} + 1` },
      setWhere: sql`${adminAuthLimits.attempts} < ${maximum}`,
    }).returning({ attempts: adminAuthLimits.attempts })
  if (!bucket) {
    throw new AdminError(429, 'Too many attempts. Try again later.', Math.max(1, Math.ceil((expiresAt - now) / 1000)))
  }
  await db.delete(adminAuthLimits).where(lte(adminAuthLimits.expiresAt, new Date(now)))
}

async function signIn(db, secret, input, previousSession) {
  await rateLimit(db, secret, 'login', 75, 5 * 60_000)
  let email
  try {
    email = emailAddress(input?.email)
  } catch {
    throw new AdminError(401, 'The email or password is incorrect.')
  }
  await rateLimit(db, secret, `login/${email}`, 8, 15 * 60_000)
  const incorrect = new AdminError(401, 'The email or password is incorrect.')
  if (!passwordFits(input?.password)) throw incorrect
  const [admin] = await db.select({ id: admins.id, passwordHash: admins.passwordHash }).from(admins)
    .where(and(eq(admins.email, email), isNull(admins.deactivatedAt)))
  if (!await verifyPassword(input.password, admin?.passwordHash)) throw incorrect

  return accountTransaction(db, async tx => {
    const [current] = await tx.select({ id: admins.id }).from(admins).where(and(
      eq(admins.id, admin.id), eq(admins.passwordHash, admin.passwordHash), isNull(admins.deactivatedAt),
    ))
    if (!current) throw incorrect
    const token = newToken()
    const expiresAt = new Date(Date.now() + sessionLifetime)
    await tx.delete(adminSessions).where(lte(adminSessions.expiresAt, sql`clock_timestamp()`))
    if (previousSession) await tx.delete(adminSessions).where(eq(adminSessions.tokenHash, previousSession))
    await tx.insert(adminSessions).values({ tokenHash: sessionHash(secret, token), adminId: current.id, expiresAt })
    return token
  })
}

async function issuePasswordLink(db, config, admin, actor = admin) {
  if (!config.sessionSecret) throw new AdminError(503, 'Set SESSION_SECRET before issuing password links.')
  const token = newToken()
  const tokenHash = digest(config.sessionSecret, 'password', token)
  const expiresAt = new Date(Date.now() + passwordLinkLifetime)
  await db.insert(adminPasswordLinks).values({ adminId: admin.id, tokenHash, expiresAt })
    .onConflictDoUpdate({ target: adminPasswordLinks.adminId, set: { tokenHash, expiresAt } })
  await recordAdminAction(db, actor, 'issue-password-link', 'admin', admin.id, { expiresAt })
  return { url: new URL(`/admin#reset=${token}`, config.publicAppUrl).href, expiresAt }
}

async function setPassword(db, secret, input, previousSession) {
  await rateLimit(db, secret, 'reset', 40, 5 * 60_000)
  const invalid = new AdminError(400, 'This password link has expired or is invalid. Request a new link.')
  if (typeof input?.token !== 'string' || !opaqueToken.test(input.token)) throw invalid
  const tokenHash = digest(secret, 'password', input.token)
  const validLink = and(eq(adminPasswordLinks.tokenHash, tokenHash), gt(adminPasswordLinks.expiresAt, sql`clock_timestamp()`))
  const [link] = await db.select({ adminId: adminPasswordLinks.adminId }).from(adminPasswordLinks)
    .innerJoin(admins, eq(admins.id, adminPasswordLinks.adminId)).where(and(validLink, isNull(admins.deactivatedAt)))
  if (!link) throw invalid
  const passwordHash = await hashPassword(input.password)
  await accountTransaction(db, async tx => {
    const [consumed] = await tx.delete(adminPasswordLinks).where(validLink).returning({ adminId: adminPasswordLinks.adminId })
    if (!consumed) throw invalid
    const [admin] = await tx.update(admins).set({ passwordHash }).where(and(
      eq(admins.id, consumed.adminId), isNull(admins.deactivatedAt),
    )).returning({ id: admins.id })
    if (!admin) throw invalid
    await tx.delete(adminSessions).where(eq(adminSessions.adminId, admin.id))
    if (previousSession) await tx.delete(adminSessions).where(eq(adminSessions.tokenHash, previousSession))
    await recordAdminAction(tx, admin, 'set-password', 'admin', admin.id, {})
  })
}

async function bootstrapAdmin(db, email, name, config) {
  const normalized = emailAddress(email)
  const displayName = text(name, 'Display name', 200)
  return accountTransaction(db, async tx => {
    const [existing] = await tx.select({ id: admins.id }).from(admins).limit(1)
    if (existing) throw new ScheduleError('The initial administrator can only be created on a database with no administrators.')
    const [admin] = await tx.insert(admins).values({
      email: normalized, displayName, passwordHash: 'pending',
    }).returning({ id: admins.id, email: admins.email, displayName: admins.displayName })
    await tx.insert(adminRoles).values({ adminId: admin.id, roleKey: 'super-admin' })
    await recordAdminAction(tx, admin, 'bootstrap', 'admin', admin.id, { role: 'super-admin' })
    return config ? { ...admin, passwordLink: await issuePasswordLink(tx, config, admin) } : admin
  })
}

function recoverAdmin(db, config, email) {
  return accountTransaction(db, async tx => {
    const [admin] = await tx.select({ id: admins.id }).from(admins)
      .where(and(eq(admins.email, emailAddress(email)), isNull(admins.deactivatedAt)))
    if (!admin) throw new AdminError(404, 'Use the email of an active administrator.')
    return issuePasswordLink(tx, config, admin)
  })
}

module.exports = {
  accountTransaction, bootstrapAdmin, issuePasswordLink, recoverAdmin, sessionHash, sessionLifetime, setPassword, signIn,
}
