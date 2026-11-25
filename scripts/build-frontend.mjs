// The server's local .env can set NODE_ENV=development.
process.env.NODE_ENV = 'production'
const { build } = await import('vite')

await build(process.argv.includes('--deploy') ? {
  build: { outDir: 'deploy/frontend', emptyOutDir: true },
} : {})
