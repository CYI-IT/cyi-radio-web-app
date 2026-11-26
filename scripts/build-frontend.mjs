// The server's local .env can set NODE_ENV=development.
process.env.NODE_ENV = 'production'
const { build } = await import('vite')

await build({
  build: {
    outDir: process.argv.includes('--deploy') ? 'deploy/frontend' : 'dist',
    emptyOutDir: true,
    rollupOptions: { input: ['index.html', 'admin.html'] },
  },
})
