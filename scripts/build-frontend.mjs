import { createHash } from 'node:crypto'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// The server's local .env can set NODE_ENV=development.
process.env.NODE_ENV = 'production'
const { build } = await import('vite')
const outDir = process.argv.includes('--deploy') ? 'deploy/frontend' : 'dist'

await build({
  build: {
    outDir,
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: ['index.html', 'admin.html'] },
  },
})

const viteManifestPath = join(outDir, '.vite/manifest.json')
const bundles = JSON.parse(await readFile(viteManifestPath, 'utf8'))
const webManifest = JSON.parse(await readFile(join(outDir, 'manifest.webmanifest'), 'utf8'))
const files = new Set(['manifest.webmanifest', 'assets/CYI-radio-original-2.png',
  ...webManifest.icons.map(icon => icon.src.slice(1))])
const visited = new Set()

function includeBundle(key) {
  if (visited.has(key)) return
  visited.add(key)
  const { file, css = [], assets = [], imports = [] } = bundles[key]
  for (const path of [file, ...css, ...assets]) files.add(path)
  for (const dependency of imports) includeBundle(dependency)
}

includeBundle('index.html')
const page = await readFile(join(outDir, 'index.html'), 'utf8')
const shell = page.replace('<html ', '<html data-offline-shell ')
const worker = await readFile(new URL('../frontend/service-worker.js', import.meta.url), 'utf8')
const paths = [...files].sort()
const hash = createHash('sha256').update(shell).update(worker).update(JSON.stringify(paths))
for (const path of paths) hash.update(await readFile(join(outDir, path)))
const version = hash.digest('hex').slice(0, 16)
const shellPath = `/assets/listener-shell-${version}.html`

await Promise.all([
  writeFile(join(outDir, shellPath.slice(1)), shell),
  writeFile(join(outDir, 'sw.js'), [
    `const cachePrefix = 'cyi-radio-listener-'`,
    `const version = ${JSON.stringify(version)}`,
    `const shellPath = ${JSON.stringify(shellPath)}`,
    `const assets = ${JSON.stringify(paths.map(path => `/${path}`))}`,
    '', worker,
  ].join('\n')),
  unlink(viteManifestPath),
])
