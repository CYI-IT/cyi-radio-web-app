const { defineConfig } = require('drizzle-kit')

module.exports = defineConfig({
  dialect: 'postgresql',
  schema: './server/schema.cjs',
  out: './migrations',
})
