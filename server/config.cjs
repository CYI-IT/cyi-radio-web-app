function publicUrl(env, key, fallback, production) {
  try {
    const url = new URL(env[key] ?? fallback)
    const protocols = production ? ['https:'] : ['http:', 'https:']
    if (protocols.includes(url.protocol) && !url.username && !url.password) return url
  } catch {
    // Report the variable name without echoing its value.
  }
  throw new Error(`${key} must be a valid ${production ? 'HTTPS' : 'HTTP or HTTPS'} URL without credentials`)
}

function readConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production')
  }
  const production = nodeEnv === 'production'
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a TCP port number')

  const databaseUrl = env.DATABASE_URL || null
  if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production')
  if (databaseUrl) {
    const protocol = URL.canParse(databaseUrl) ? new URL(databaseUrl).protocol : null
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL')
    }
  }

  const sessionSecret = env.SESSION_SECRET || null
  if ((production || sessionSecret) && (!sessionSecret || Buffer.byteLength(sessionSecret) < 32)) {
    throw new Error('SESSION_SECRET must be at least 32 bytes')
  }

  const defaultOrigin = production ? 'https://live.cyiradio.com' : `http://localhost:${port}`
  const appUrl = publicUrl(env, 'PUBLIC_APP_URL', defaultOrigin, production)
  if (appUrl.href !== `${appUrl.origin}/`) throw new Error('PUBLIC_APP_URL must be an origin')

  const stationTimezone = env.STATION_TIMEZONE ?? 'Africa/Accra'
  try {
    new Intl.DateTimeFormat('en', { timeZone: stationTimezone })
  } catch {
    throw new Error('STATION_TIMEZONE must be an IANA timezone')
  }

  return {
    production,
    port,
    databaseUrl,
    sessionSecret,
    publicAppUrl: appUrl.origin,
    icecastStreamUrl: publicUrl(env, 'ICECAST_STREAM_URL', 'https://radio.cyiradio.com/live', production).href,
    icecastStatusUrl: publicUrl(env, 'ICECAST_STATUS_URL', 'https://radio.cyiradio.com/status.xsl', production).href,
    stationTimezone,
  }
}

module.exports = { readConfig }
