const fs = require('fs')
const path = require('path')
const { config } = require('../src/config')
const { exportSessionBundle } = require('../src/session-bundle')

const bundle = exportSessionBundle(config.sessionDir)
const outputPath = path.join(config.dataDir, 'session-bundle.b64.txt')

fs.mkdirSync(config.dataDir, { recursive: true })
fs.writeFileSync(outputPath, bundle, 'utf8')

console.log(`Session bundle exported to ${outputPath}`)
console.log(bundle)
