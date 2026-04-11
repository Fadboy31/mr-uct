const fs = require('fs')
const path = require('path')

function ensureDir(dirPath) {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true })
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return []
  }

  const files = []

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return files
}

function createStore(config) {
  const state = {
    botActive: true,
    autoWelcomeActive: true,
    autoViewActive: true,
    autoLikeActive: true,
    knownContacts: [],
    viewedStatuses: [],
    repliedContacts: {},
    orders: [],
    orderSessions: {},
    nextOrderNumber: 1
  }

  function ensureFilesystem() {
    ensureDir(config.sessionDir)
    ensureDir(config.dataDir)
    ensureDir(path.dirname(config.logFile))
  }

  function load() {
    if (!fs.existsSync(config.stateFile)) {
      save()
      return
    }

    try {
      const raw = JSON.parse(fs.readFileSync(config.stateFile, 'utf8'))
      state.botActive = raw.botActive ?? true
      state.autoWelcomeActive = raw.autoWelcomeActive ?? true
      state.autoViewActive = raw.autoViewActive ?? true
      state.autoLikeActive = raw.autoLikeActive ?? true
      state.knownContacts = Array.isArray(raw.knownContacts) ? raw.knownContacts : []
      state.viewedStatuses = Array.isArray(raw.viewedStatuses) ? raw.viewedStatuses.slice(-500) : []
      state.repliedContacts = raw.repliedContacts && typeof raw.repliedContacts === 'object' ? raw.repliedContacts : {}
      state.orders = Array.isArray(raw.orders) ? raw.orders.slice(-config.orderRetentionLimit) : []
      state.orderSessions = raw.orderSessions && typeof raw.orderSessions === 'object' ? raw.orderSessions : {}
      state.nextOrderNumber = Number(raw.nextOrderNumber || state.orders.length + 1)
    } catch {
      save()
    }
  }

  function save() {
    fs.writeFileSync(
      config.stateFile,
      JSON.stringify(
        {
          ...state,
          knownContacts: state.knownContacts.slice(-5000),
          viewedStatuses: state.viewedStatuses.slice(-500),
          orders: state.orders.slice(-config.orderRetentionLimit)
        },
        null,
        2
      )
    )
  }

  function getStorageSnapshot() {
    const sessionFiles = listFilesRecursive(config.sessionDir)
    const hasSessionData =
      sessionFiles.length > 0 ||
      fs.existsSync(path.join(config.sessionDir, 'creds.json')) ||
      fs.existsSync(path.join(config.sessionDir, `session-${config.webClientId}`))

    return {
      sessionDir: path.resolve(config.sessionDir),
      dataDir: path.resolve(config.dataDir),
      sessionDirExists: fs.existsSync(config.sessionDir),
      dataDirExists: fs.existsSync(config.dataDir),
      sessionFileCount: sessionFiles.length,
      hasCredsFile: hasSessionData,
      hasSessionData,
      hasStateFile: fs.existsSync(config.stateFile)
    }
  }

  function clearSessionDirectory() {
    ensureDir(config.sessionDir)
    for (const entry of fs.readdirSync(config.sessionDir)) {
      fs.rmSync(path.join(config.sessionDir, entry), { recursive: true, force: true })
    }
  }

  function createOrderId() {
    const id = `MRUTC-${String(state.nextOrderNumber).padStart(4, '0')}`
    state.nextOrderNumber += 1
    return id
  }

  return {
    state,
    ensureFilesystem,
    load,
    save,
    getStorageSnapshot,
    clearSessionDirectory,
    createOrderId
  }
}

module.exports = { createStore }
