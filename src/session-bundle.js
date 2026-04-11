const fs = require('fs')
const path = require('path')

function listFiles(rootDir) {
  const results = []

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (entry.isFile()) {
        results.push(fullPath)
      }
    }
  }

  if (fs.existsSync(rootDir)) {
    walk(rootDir)
  }

  return results
}

function exportSessionBundle(sessionDir) {
  const resolvedRoot = path.resolve(sessionDir)
  const files = {}

  for (const filePath of listFiles(resolvedRoot)) {
    const relativePath = path.relative(resolvedRoot, filePath).replace(/\\/g, '/')
    files[relativePath] = fs.readFileSync(filePath).toString('base64')
  }

  return Buffer.from(JSON.stringify({ files }), 'utf8').toString('base64')
}

function hydrateSessionBundle(sessionDir, bundleB64) {
  if (!bundleB64) {
    return { imported: false, fileCount: 0 }
  }

  const resolvedRoot = path.resolve(sessionDir)
  const credsPath = path.join(resolvedRoot, 'creds.json')
  const hasExistingSessionData =
    (fs.existsSync(resolvedRoot) && listFiles(resolvedRoot).length > 0) ||
    fs.existsSync(credsPath)

  if (hasExistingSessionData) {
    return { imported: false, fileCount: 0 }
  }

  const decoded = Buffer.from(bundleB64, 'base64').toString('utf8')
  const payload = JSON.parse(decoded)
  const files = payload?.files && typeof payload.files === 'object' ? payload.files : {}
  const entries = Object.entries(files)

  fs.mkdirSync(resolvedRoot, { recursive: true })

  for (const [relativePath, contentB64] of entries) {
    const normalizedRelativePath = String(relativePath || '').replace(/\\/g, '/')
    if (!normalizedRelativePath || normalizedRelativePath.startsWith('/') || normalizedRelativePath.includes('..')) {
      continue
    }

    const outputPath = path.resolve(resolvedRoot, normalizedRelativePath)
    if (!outputPath.startsWith(resolvedRoot)) {
      continue
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, Buffer.from(String(contentB64 || ''), 'base64'))
  }

  return { imported: entries.length > 0, fileCount: entries.length }
}

module.exports = { exportSessionBundle, hydrateSessionBundle }
