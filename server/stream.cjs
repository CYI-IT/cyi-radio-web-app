const cacheDuration = 15_000
const requestTimeout = 3_000

function mountStatus(stats, mountPath) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return 'unknown'

  const sources = Array.isArray(stats.source) ? stats.source : [stats.source].filter(source => source != null)
  let hasUnrecognizedSource = false
  for (const source of sources) {
    const listenUrl = source?.listenurl
    if (typeof listenUrl !== 'string' || !URL.canParse(listenUrl)) {
      hasUnrecognizedSource = true
      continue
    }
    // Icecast can advertise its internal hostname or HTTP scheme behind the public proxy.
    if (new URL(listenUrl).pathname === mountPath) return 'online'
  }
  return hasUnrecognizedSource ? 'unknown' : 'offline'
}

function createStreamStatus({ icecastStreamUrl, icecastStatusUrl }) {
  const statsUrl = new URL(icecastStatusUrl)
  statsUrl.pathname = statsUrl.pathname.replace(/\/status\.xsl$/, '/status-json.xsl')
  const mountPath = new URL(icecastStreamUrl).pathname
  let cached
  let pending

  async function refresh() {
    let status = 'unknown'
    try {
      const response = await fetch(statsUrl, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(requestTimeout),
      })
      if (response.ok) {
        const { icestats } = await response.json()
        status = mountStatus(icestats, mountPath)
      } else {
        await response.body?.cancel()
        console.warn('Icecast statistics returned HTTP', response.status)
      }
    } catch (error) {
      console.warn('Icecast status check failed', error.name)
    }
    return { status, streamUrl: icecastStreamUrl }
  }

  return function getStatus() {
    if (cached && Date.now() < cached.expiresAt) return cached.result
    pending ??= refresh().then(result => {
      cached = { result, expiresAt: Date.now() + cacheDuration }
      return result
    }).finally(() => {
      pending = undefined
    })
    return pending
  }
}

module.exports = { createStreamStatus }
