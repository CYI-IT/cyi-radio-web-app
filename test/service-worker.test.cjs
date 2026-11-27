const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')
const { runInNewContext } = require('node:vm')

const origin = 'https://live.cyiradio.com'
const shellPath = '/assets/listener-shell-test.html'
const assetPath = '/assets/listener-test.css'
const source = readFileSync(join(__dirname, '../frontend/service-worker.js'), 'utf8')

function worker(fetch) {
  const handlers = new Map()
  const cached = new Map([[shellPath, 'cached listener page'], [assetPath, 'cached stylesheet']])
  runInNewContext(source, {
    URL, Response, fetch, shellPath, assets: [assetPath], cachePrefix: 'cyi-radio-listener-', version: 'test',
    self: { location: { origin }, addEventListener: (event, handler) => handlers.set(event, handler) },
    caches: { open: async () => ({ match: entry => cached.get(entry.url ? new URL(entry.url).pathname : entry) }) },
  })
  return (path, mode = 'cors', method = 'GET') => {
    let response
    const request = { url: new URL(path, origin).href, mode, method }
    handlers.get('fetch')({ request, respondWith: result => { response = result } })
    return response
  }
}

test('listener navigation fetches the network page and falls back to the versioned shell', async () => {
  const online = worker(async () => 'network page')
  const offline = worker(async () => { throw new Error('network unavailable') })
  assert.equal(await online('/', 'navigate'), 'network page')
  assert.equal(await offline('/?source=app', 'navigate'), 'cached listener page')
  assert.equal(await offline('/index.html', 'navigate'), 'cached listener page')
  assert.equal(await offline('/schedule', 'navigate'), 'cached listener page')
  assert.equal(await offline('/schedule/', 'navigate'), 'cached listener page')
  assert.equal(await offline(assetPath), 'cached stylesheet')
})

test('live data, admin pages, and unrelated assets bypass the listener cache', () => {
  const handle = worker(() => assert.fail('The service worker should bypass this request'))
  assert.equal(handle('/admin', 'navigate'), undefined)
  assert.equal(handle('/api/v1/admin/session'), undefined)
  assert.equal(handle('/api/v1/schedule?day=today'), undefined)
  assert.equal(handle('/api/v1/schedule?from=2026-11-01&to=2026-12-01'), undefined)
  assert.equal(handle('/api/v1/chat/messages', 'cors', 'POST'), undefined)
  assert.equal(handle('/api/v1/stream'), undefined)
  assert.equal(handle('/assets/admin-test.js'), undefined)
  assert.equal(handle(`${assetPath}?revision=2`), undefined)
  assert.equal(handle('https://radio.cyiradio.com/live'), undefined)
})
