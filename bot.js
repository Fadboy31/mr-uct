const { start } = require('./src/app')

start().catch((error) => {
  console.error('[fatal]', error)
  process.exit(1)
})
