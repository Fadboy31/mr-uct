const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const fs = require('fs')
const http = require('http')
const { config } = require('./config')
const { createStore } = require('./store')
const { getWelcomeMessage, getOrderGuideMessage, formatOrderSummary } = require('./copy')
const { hydrateSessionBundle } = require('./session-bundle')

const store = createStore(config)

const runtime = {
  client: null,
  reconnectTimer: null,
  initializing: false,
  latestQrDataUrl: null,
  latestQrSvg: null,
  latestQrIssuedAt: null,
  latestPairingCode: null,
  latestPairingCodeIssuedAt: null,
  connectionState: {
    status: 'starting',
    lastError: null,
    lastDisconnectCode: null,
    connectedAt: null
  }
}

function jidToPhone(jid) {
  return String(jid || '').split('@')[0].replace(/[^\d]/g, '')
}

function toUserJid(phone) {
  return phone ? `${phone}@c.us` : null
}

function simplifyText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function isAdmin(jid) {
  return jidToPhone(jid) === config.adminNumber
}

function isGroupJid(jid) {
  return String(jid || '').endsWith('@g.us')
}

function isStatusJid(jid) {
  return jid === 'status@broadcast'
}

function isStatusMessage(message) {
  return Boolean(message?.isStatus) || isStatusJid(message?.from)
}

function getTextFromMessage(message) {
  return String(message?.body || '').trim()
}

function getStatusFingerprint(message) {
  return `${message?.author || message?.from || 'unknown'}:${message?.id?._serialized || 'no-id'}`
}

function getServiceByText(text) {
  return config.serviceMap[simplifyText(text)] || null
}

function isBusinessIntent(text) {
  const normalized = simplifyText(text)
  if (!normalized || config.silentKeywords.has(normalized)) {
    return false
  }

  if (['order', 'menu', 'services', 'help', 'hours', 'price'].includes(normalized)) {
    return true
  }

  return Boolean(getServiceByText(normalized))
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}`
  try {
    console.log(entry)
  } catch (error) {
    if (error?.code !== 'EPIPE') {
      throw error
    }
  }
  fs.appendFileSync(config.logFile, `${entry}\n`)
}

function rememberContact(jid) {
  const phone = jidToPhone(jid)
  if (!phone) {
    return false
  }
  if (!store.state.knownContacts.includes(phone)) {
    store.state.knownContacts.push(phone)
    store.state.repliedContacts[phone] = Date.now()
    store.save()
    return true
  }
  return false
}

function markStatusSeen(fingerprint) {
  if (store.state.viewedStatuses.includes(fingerprint)) {
    return false
  }
  store.state.viewedStatuses.push(fingerprint)
  store.state.viewedStatuses = store.state.viewedStatuses.slice(-500)
  store.save()
  return true
}

function getOrderSession(jid) {
  return store.state.orderSessions[jidToPhone(jid)] || null
}

function setOrderSession(jid, session) {
  store.state.orderSessions[jidToPhone(jid)] = {
    ...session,
    updatedAt: new Date().toISOString()
  }
  store.save()
}

function clearOrderSession(jid) {
  delete store.state.orderSessions[jidToPhone(jid)]
  store.save()
}

function createOrderDraft(jid) {
  return {
    customerPhone: jidToPhone(jid),
    serviceKey: null,
    serviceLabel: null,
    fullName: null,
    details: null,
    urgency: null,
    createdAt: new Date().toISOString()
  }
}

function startOrderFlow(jid, initialService) {
  const order = createOrderDraft(jid)
  if (initialService) {
    order.serviceKey = initialService.key
    order.serviceLabel = initialService.label
  }
  setOrderSession(jid, { step: initialService ? 'full_name' : 'service', order })
}

async function sendText(jid, text) {
  if (!runtime.client) {
    return false
  }

  try {
    await runtime.client.sendMessage(jid, text)
    return true
  } catch (error) {
    log(`Send error to ${jid}: ${error.message}`)
    return false
  }
}

async function notifyAdmin(text) {
  return sendText(toUserJid(config.adminNumber), text)
}

async function sendOrderPrompt(jid, step, session) {
  if (step === 'service') {
    await sendText(jid, getOrderGuideMessage(config))
    return
  }
  if (step === 'full_name') {
    await sendText(jid, `Sawa 👌 Tumekuweka kwenye *${session.order.serviceLabel}*.\n\nTuma *majina yako kamili* kama yatatumika kwenye order.`)
    return
  }
  if (step === 'details') {
    await sendText(
      jid,
      [
        `Poa *${session.order.fullName}*.`,
        '',
        'Sasa eleza order yako vizuri kidogo.',
        'Andika details muhimu: unahitaji nini exactly, documents ulizonazo, na chochote kinachotakiwa tujue.'
      ].join('\n')
    )
    return
  }
  if (step === 'urgency') {
    await sendText(jid, 'Order details zimepokelewa.\n\nTuambie *timeline* yako: unaitaka lini au ni urgent kiasi gani?')
    return
  }
  await sendText(
    jid,
    [
      '📋 *Order review*',
      '',
      formatOrderSummary({ ...session.order, status: 'Pending confirmation' }),
      '',
      'Reply *confirm* ku-submit order.',
      'Reply *edit* kuanza upya.',
      'Reply *cancel* kufuta order.'
    ].join('\n')
  )
}

async function handleOrderFlow(jid, text, session) {
  const normalized = simplifyText(text)

  if (normalized === 'cancel') {
    clearOrderSession(jid)
    await sendText(jid, 'Order ime-cancelled. Ukiwa ready tena, reply *order*.')
    return true
  }

  if (normalized === 'edit' && session.step === 'confirm') {
    startOrderFlow(jid, null)
    await sendOrderPrompt(jid, 'service', getOrderSession(jid))
    return true
  }

  if (session.step === 'service') {
    const service = getServiceByText(text)
    if (!service) {
      await sendText(jid, `Please chagua service sahihi: ${config.services.map((item) => item.key).join(', ')}.`)
      return true
    }
    session.order.serviceKey = service.key
    session.order.serviceLabel = service.label
    session.step = 'full_name'
    setOrderSession(jid, session)
    await sendOrderPrompt(jid, 'full_name', session)
    return true
  }

  if (session.step === 'full_name') {
    if (text.trim().length < 5 || text.trim().split(/\s+/).length < 2) {
      await sendText(jid, 'Tafadhali tuma *majina mawili au zaidi* ili tuweke order vizuri.')
      return true
    }
    session.order.fullName = text.trim()
    session.step = 'details'
    setOrderSession(jid, session)
    await sendOrderPrompt(jid, 'details', session)
    return true
  }

  if (session.step === 'details') {
    if (text.trim().length < 10) {
      await sendText(jid, 'Details bado ni short sana. Tafadhali eleza order vizuri kidogo.')
      return true
    }
    session.order.details = text.trim()
    session.step = 'urgency'
    setOrderSession(jid, session)
    await sendOrderPrompt(jid, 'urgency', session)
    return true
  }

  if (session.step === 'urgency') {
    if (text.trim().length < 3) {
      await sendText(jid, 'Tafadhali tuma timeline au urgency yako kwa kifupi.')
      return true
    }
    session.order.urgency = text.trim()
    session.step = 'confirm'
    setOrderSession(jid, session)
    await sendOrderPrompt(jid, 'confirm', session)
    return true
  }

  if (normalized !== 'confirm') {
    await sendText(jid, 'Reply *confirm*, *edit*, au *cancel* kwenye order review.')
    return true
  }

  const order = {
    ...session.order,
    id: store.createOrderId(),
    status: 'New',
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  store.state.orders.push(order)
  store.state.orders = store.state.orders.slice(-config.orderRetentionLimit)
  clearOrderSession(jid)
  store.save()

  await sendText(
    jid,
    [
      '✅ *Order yako imepokelewa*',
      '',
      `Order ID yako ni *${order.id}*.`,
      'Team yetu ita-review na kukurudia soon.',
      `Kwa follow-up ya haraka unaweza pia kutumia *${config.contactNumber}*.`
    ].join('\n')
  )
  await notifyAdmin(['🚨 *New Order Received*', '', formatOrderSummary(order)].join('\n'))
  return true
}

async function handleAdminCommand(from, command) {
  const trimmed = command.trim()
  const normalized = simplifyText(trimmed)

  if (['status', '!status', 'bot status'].includes(normalized)) {
    const storage = store.getStorageSnapshot()
    await sendText(
      from,
      [
        `*${config.botName} Status*`,
        '',
        `Bot: ${store.state.botActive ? 'ON' : 'OFF'}`,
        `Connection: ${runtime.connectionState.status}`,
        `Auto welcome: ${store.state.autoWelcomeActive ? 'ON' : 'OFF'}`,
        `Auto view status: ${store.state.autoViewActive ? 'ON' : 'OFF'}`,
        `Auto react status: ${store.state.autoLikeActive ? `ON (${config.statusReaction})` : 'OFF'}`,
        `Known contacts: ${store.state.knownContacts.length}`,
        `Active order sessions: ${Object.keys(store.state.orderSessions).length}`,
        `Stored orders: ${store.state.orders.length}`,
        `Session files: ${storage.sessionFileCount}`,
        `Has session data: ${storage.hasSessionData ? 'YES' : 'NO'}`
      ].join('\n')
    )
    return true
  }

  if (['on', '!on'].includes(normalized)) {
    store.state.botActive = true
    store.save()
    await sendText(from, 'Bot iko ON sasa.')
    return true
  }

  if (['off', '!off'].includes(normalized)) {
    store.state.botActive = false
    store.save()
    await sendText(from, 'Bot iko OFF sasa.')
    return true
  }

  if (['welcome on', '!reply on'].includes(normalized)) {
    store.state.autoWelcomeActive = true
    store.save()
    await sendText(from, 'First-time welcome iko ON.')
    return true
  }

  if (['welcome off', '!reply off'].includes(normalized)) {
    store.state.autoWelcomeActive = false
    store.save()
    await sendText(from, 'First-time welcome iko OFF.')
    return true
  }

  if (['view on', '!view on'].includes(normalized)) {
    store.state.autoViewActive = true
    store.save()
    await sendText(from, 'Auto-view status iko ON.')
    return true
  }

  if (['view off', '!view off'].includes(normalized)) {
    store.state.autoViewActive = false
    store.save()
    await sendText(from, 'Auto-view status iko OFF.')
    return true
  }

  if (['like on', '!like on'].includes(normalized)) {
    store.state.autoLikeActive = true
    store.save()
    await sendText(from, `Auto-react status iko ON (${config.statusReaction}).`)
    return true
  }

  if (['like off', '!like off'].includes(normalized)) {
    store.state.autoLikeActive = false
    store.save()
    await sendText(from, 'Auto-react status iko OFF.')
    return true
  }

  if (['orders', '!orders'].includes(normalized)) {
    const orders = store.state.orders.slice(-5).reverse()
    await sendText(
      from,
      orders.length
        ? ['*Recent Orders*', '', ...orders.map((order) => `${order.id} | ${order.fullName} | ${order.serviceKey} | ${order.status} | ${order.customerPhone}`)].join('\n')
        : 'Hakuna order bado.'
    )
    return true
  }

  if (['storage', '!storage'].includes(normalized)) {
    const storage = store.getStorageSnapshot()
    await sendText(
      from,
      [
        '*Storage Snapshot*',
        '',
        `Session dir: ${storage.sessionDir}`,
        `Data dir: ${storage.dataDir}`,
        `Session files: ${storage.sessionFileCount}`,
        `Has session data: ${storage.hasSessionData ? 'YES' : 'NO'}`,
        `Has state file: ${storage.hasStateFile ? 'YES' : 'NO'}`
      ].join('\n')
    )
    return true
  }

  if (['help', '!help'].includes(normalized)) {
    await sendText(
      from,
      [
        `*Admin Commands - ${config.botName}*`,
        '',
        '!status',
        '!on / !off',
        '!reply on / !reply off',
        '!view on / !view off',
        '!like on / !like off',
        '!orders',
        '!storage'
      ].join('\n')
    )
    return true
  }

  return false
}

async function handleStatusMessage(message) {
  if (!markStatusSeen(getStatusFingerprint(message))) {
    return
  }

  try {
    if (store.state.autoViewActive && message.from) {
      await runtime.client.sendSeen(message.from)
    }
    if (store.state.autoLikeActive && typeof message.react === 'function') {
      await message.react(config.statusReaction)
    }
  } catch (error) {
    log(`Status handling error: ${error.message}`)
  }
}

async function handleDirectMessage(message) {
  const from = message.from
  const text = getTextFromMessage(message)
  if (!text) {
    return
  }

  if (isAdmin(from) && text.trim().startsWith('!')) {
    const handled = await handleAdminCommand(from, text)
    if (handled) {
      return
    }
  }

  if (!store.state.botActive) {
    return
  }

  const session = getOrderSession(from)
  if (session) {
    await handleOrderFlow(from, text, session)
    return
  }

  const normalized = simplifyText(text)
  const service = getServiceByText(text)
  const isNewContact = rememberContact(from)

  if (isNewContact && store.state.autoWelcomeActive) {
    await sendText(from, getWelcomeMessage(config))
    return
  }

  if (normalized === 'order') {
    startOrderFlow(from, null)
    await sendOrderPrompt(from, 'service', getOrderSession(from))
    return
  }

  if (service) {
    startOrderFlow(from, service)
    await sendOrderPrompt(from, 'full_name', getOrderSession(from))
    return
  }

  if (['services', 'menu', 'help'].includes(normalized)) {
    await sendText(from, getOrderGuideMessage(config))
    return
  }

  if (normalized === 'hours') {
    await sendText(from, `🕐 *Working Hours*\n\n${config.workingHours}`)
    return
  }

  if (normalized === 'price') {
    await sendText(
      from,
      [
        '💰 *Pricing info*',
        '',
        'Bei inategemea service na ugumu wa kazi.',
        `Kwa exact quotation, text *order* au reach us direct kupitia *${config.contactNumber}*.`
      ].join('\n')
    )
    return
  }

  if (!isBusinessIntent(text)) {
    log(`Silenced non-business message from ${from}`)
  }
}

function scheduleReconnect() {
  if (runtime.reconnectTimer || runtime.initializing) {
    return
  }

  log('Scheduling reconnect in 5 seconds...')
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = null
    connectClient({ forceNew: true }).catch((error) => {
      log(`Reconnect failed: ${error.message}`)
      scheduleReconnect()
    })
  }, 5000)
}

async function saveQrArtifacts(qr) {
  await QRCode.toFile(config.qrPngFile, qr, {
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 18
  })

  const qrText = await QRCode.toString(qr, { type: 'terminal', small: true })
  fs.writeFileSync(config.qrTextFile, qrText, 'utf8')

  runtime.latestQrSvg = await QRCode.toString(qr, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 1600
  })
  fs.writeFileSync(config.qrSvgFile, runtime.latestQrSvg, 'utf8')

  runtime.latestQrDataUrl = await QRCode.toDataURL(qr, {
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 16
  })
  runtime.latestQrIssuedAt = new Date().toISOString()
}

function clearQrArtifacts() {
  runtime.latestQrDataUrl = null
  runtime.latestQrSvg = null
  runtime.latestQrIssuedAt = null
  runtime.latestPairingCode = null
  runtime.latestPairingCodeIssuedAt = null

  for (const filePath of [config.qrPngFile, config.qrSvgFile, config.qrTextFile]) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
    }
  }
}

function getConnectionSnapshot() {
  return {
    status: runtime.connectionState.status,
    lastError: runtime.connectionState.lastError,
    lastDisconnectCode: runtime.connectionState.lastDisconnectCode,
    connectedAt: runtime.connectionState.connectedAt,
    latestQrIssuedAt: runtime.latestQrIssuedAt,
    latestPairingCodeIssuedAt: runtime.latestPairingCodeIssuedAt,
    hasQr: Boolean(runtime.latestQrDataUrl),
    hasPairingCode: Boolean(runtime.latestPairingCode),
    pairingNumber: config.pairingNumber || null,
    knownContacts: store.state.knownContacts.length,
    activeOrderSessions: Object.keys(store.state.orderSessions).length,
    ordersStored: store.state.orders.length,
    uptimeSeconds: Math.round(process.uptime()),
    storage: store.getStorageSnapshot()
  }
}

async function generatePairingCode() {
  if (!runtime.client || typeof runtime.client.requestPairingCode !== 'function') {
    throw new Error('Pairing code is not available on this client.')
  }
  if (!config.pairingNumber) {
    throw new Error('PAIRING_NUMBER is not configured.')
  }

  const code = await runtime.client.requestPairingCode(config.pairingNumber, true)
  runtime.latestPairingCode = code
  runtime.latestPairingCodeIssuedAt = new Date().toISOString()
  runtime.connectionState.status = 'awaiting_pairing_code'
  return code
}

function buildClient() {
  const linuxArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process'
  ]

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: config.webClientId,
      dataPath: config.sessionDir
    }),
    puppeteer: {
      headless: true,
      executablePath: config.chromeExecutablePath || undefined,
      args: process.platform === 'linux' ? linuxArgs : []
    }
  })

  client.on('qr', async (qr) => {
    runtime.connectionState.status = 'awaiting_qr_scan'
    runtime.connectionState.lastError = null
    runtime.connectionState.lastDisconnectCode = null
    qrcode.generate(qr, { small: true })
    await saveQrArtifacts(qr)
    log('QR code generated.')
  })

  client.on('authenticated', () => {
    runtime.connectionState.status = 'authenticated'
    runtime.connectionState.lastError = null
    runtime.connectionState.lastDisconnectCode = null
    log('WhatsApp session authenticated.')
  })

  client.on('ready', () => {
    runtime.connectionState.status = 'connected'
    runtime.connectionState.connectedAt = new Date().toISOString()
    runtime.connectionState.lastError = null
    runtime.connectionState.lastDisconnectCode = null
    clearQrArtifacts()
    log('WhatsApp client is ready.')
  })

  client.on('auth_failure', (message) => {
    runtime.connectionState.status = 'auth_failure'
    runtime.connectionState.lastError = message || 'Authentication failure'
    runtime.connectionState.lastDisconnectCode = 401
    log(`Auth failure: ${message || 'Authentication failure'}`)
  })

  client.on('loading_screen', (percent, message) => {
    log(`Loading WhatsApp Web: ${percent}% ${message || ''}`.trim())
  })

  client.on('disconnected', async (reason) => {
    const reasonText = String(reason || 'unknown')
    const loggedOut = /logout/i.test(reasonText)

    runtime.connectionState.status = loggedOut ? 'logged_out' : 'reconnecting'
    runtime.connectionState.lastError = reasonText
    runtime.connectionState.lastDisconnectCode = loggedOut ? 401 : 499
    runtime.connectionState.connectedAt = null
    log(`Client disconnected: ${reasonText}`)

    if (loggedOut) {
      return
    }

    scheduleReconnect()
  })

  client.on('message', async (message) => {
    if (message.fromMe) {
      return
    }

    if (isStatusMessage(message)) {
      await handleStatusMessage(message)
      return
    }

    if (isGroupJid(message.from)) {
      return
    }

    await handleDirectMessage(message)
  })

  client.on('message_create', async (message) => {
    if (message.fromMe || !isStatusMessage(message)) {
      return
    }
    await handleStatusMessage(message)
  })

  return client
}

async function destroyClient() {
  if (!runtime.client) {
    return
  }

  try {
    await runtime.client.destroy()
  } catch (error) {
    log(`Client destroy warning: ${error.message}`)
  } finally {
    runtime.client = null
  }
}

async function connectClient({ forceNew = false } = {}) {
  if (runtime.initializing) {
    return
  }

  runtime.initializing = true
  runtime.connectionState.status = 'starting'
  runtime.connectionState.lastError = null
  runtime.connectionState.lastDisconnectCode = null
  log(`Starting ${config.botName} with whatsapp-web.js...`)

  try {
    if (forceNew) {
      await destroyClient()
    }

    runtime.client = buildClient()
    await runtime.client.initialize()
  } catch (error) {
    runtime.connectionState.status = 'reconnecting'
    runtime.connectionState.lastError = error.message
    runtime.connectionState.lastDisconnectCode = null
    log(`Client initialize failed: ${error.message}`)
    scheduleReconnect()
  } finally {
    runtime.initializing = false
  }
}

function renderHomePage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${config.botName}</title>
  </head>
  <body>
    <h1>${config.botName}</h1>
    <p>Status: ${runtime.connectionState.status}</p>
    <p>Use /connection-status, /storage-status, /reset-session, /qr.svg, and /pairing-code.</p>
    ${runtime.latestQrDataUrl ? `<img src="${runtime.latestQrDataUrl}" alt="WhatsApp QR" style="max-width:360px;width:100%" />` : '<p>No active QR right now.</p>'}
    ${runtime.latestPairingCode ? `<p>Latest pairing code: <strong>${runtime.latestPairingCode}</strong></p>` : ''}
  </body>
</html>`
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/connection-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getConnectionSnapshot()))
      return
    }
    if (req.url === '/storage-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(store.getStorageSnapshot()))
      return
    }
    if (req.url === '/reset-session') {
      await destroyClient()
      store.clearSessionDirectory()
      clearQrArtifacts()
      runtime.connectionState.status = 'resetting_session'
      runtime.connectionState.lastError = null
      runtime.connectionState.lastDisconnectCode = null
      scheduleReconnect()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ...getConnectionSnapshot() }))
      return
    }
    if (req.url === '/qr') {
      if (!runtime.latestQrDataUrl) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, ...getConnectionSnapshot() }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
      res.end(Buffer.from(runtime.latestQrDataUrl.split(',')[1], 'base64'))
      return
    }
    if (req.url === '/qr.svg') {
      if (!runtime.latestQrSvg) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, ...getConnectionSnapshot() }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' })
      res.end(runtime.latestQrSvg)
      return
    }
    if (req.url === '/pairing-code') {
      try {
        const code = await generatePairingCode()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, pairingCode: code, ...getConnectionSnapshot() }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, message: error.message, ...getConnectionSnapshot() }))
      }
      return
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, botName: config.botName, ...getConnectionSnapshot() }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderHomePage())
  })

  server.listen(config.port, config.host, () => {
    log(`HTTP server listening on ${config.host}:${config.port}`)
  })
}

function registerProcessHandlers() {
  process.on('uncaughtException', (error) => {
    if (error?.code !== 'EPIPE') {
      runtime.connectionState.lastError = error.message
      log(`Uncaught exception: ${error.message}`)
    }
  })
  process.on('unhandledRejection', (error) => {
    runtime.connectionState.lastError = error?.message || String(error)
    log(`Unhandled rejection: ${error?.message || error}`)
  })
}

async function start() {
  store.ensureFilesystem()
  store.load()
  const bundleResult = hydrateSessionBundle(config.sessionDir, config.sessionBundleB64)
  if (bundleResult.imported) {
    log(`Imported ${bundleResult.fileCount} session file(s) from SESSION_BUNDLE_B64.`)
  }
  registerProcessHandlers()
  startHttpServer()
  await connectClient()
}

module.exports = { start }
