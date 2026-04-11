const fs = require('fs')
const { start } = require('../src/app')
const { config } = require('../src/config')
const { createStore } = require('../src/store')

const store = createStore(config)

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true })
  }
}

store.ensureFilesystem()
store.clearSessionDirectory()
removeIfExists(config.qrPngFile)
removeIfExists(config.qrSvgFile)
removeIfExists(config.qrTextFile)

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
