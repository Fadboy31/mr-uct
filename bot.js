const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const P = require('pino')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const fs = require('fs')
const path = require('path')
const http = require('http')

const BOT_NAME = process.env.BOT_NAME || 'Mr. UTC | Uni-Connect TZ Bot'
const ADMIN_NUMBER = normalizePhone(process.env.ADMIN_NUMBER || '255710852376')
const PAIRING_NUMBER = normalizePhone(process.env.PAIRING_NUMBER || ADMIN_NUMBER)
const CONTACT_NUMBER = process.env.CONTACT_NUMBER || '+255710852376'
const AUTH_DIR = process.env.AUTH_DIR || 'auth_mrutc'
const DATA_DIR = process.env.DATA_DIR || 'data'
const LOG_FILE = process.env.LOG_FILE || 'mrutc_log.txt'
const STATE_FILE = path.join(DATA_DIR, 'bot-state.json')
const QR_IMAGE_FILE = path.join(DATA_DIR, 'latest-qr.png')
const QR_TEXT_FILE = path.join(DATA_DIR, 'latest-qr.txt')
const QR_SVG_FILE = path.join(DATA_DIR, 'latest-qr.svg')
const PORT = Number(process.env.PORT || 3000)
const WORKING_HOURS =
  process.env.WORKING_HOURS ||
  'Mon-Fri: 10:00am - 11:00pm\nSat & Sun: 9:30am - 11:00pm'
const STATUS_REACTION = '\ud83d\udd25'
const ORDER_RETENTION_LIMIT = 300

const SERVICE_CATALOG = [
  { key: 'heslb', label: 'HESLB Loan Application' },
  { key: 'rita', label: 'RITA Birth & Death Certificate' },
  { key: 'ajira', label: 'Ajira Portal & Job Application' },
  { key: 'research', label: 'Research Proposal & Field Report' },
  { key: 'visa', label: 'Visa Application' },
  { key: 'passport', label: 'Passport Application' },
  { key: 'university', label: 'University Application' }
]

const SERVICE_MAP = Object.fromEntries(SERVICE_CATALOG.map((service) => [service.key, service]))
const SERVICE_MENU = SERVICE_CATALOG.map((service) => `- *${service.key}* : ${service.label}`).join('\n')

const FIRST_CONTACT_MESSAGE = [
  '\ud83d\udc4b *Karibu Mr. UTC | Uni-Connect TZ*',
  '',
  'Asante kwa kutufikia. Tunahandle online services kwa style ya haraka, clean, na professional.',
  'Thanks for reaching out. We handle online services fast and professionally.',
  '',
  '*Services zetu:*',
  SERVICE_MENU,
  '',
  'Kama uko ready ku-place order, reply *order* au type service moja kwa moja, mfano *heslb*.',
  `\ud83d\udcf1 Direct support: *${CONTACT_NUMBER}*`,
  `\ud83d\udd50 Working hours: ${WORKING_HOURS}`
].join('\n')

const ORDER_GUIDE_MESSAGE = [
  '\ud83d\udce6 *Order Flow imeanza*',
  '',
  'Chagua service unayotaka kwa ku-reply keyword moja hapa chini:',
  SERVICE_MENU,
  '',
  'Mfano: *visa*'
].join('\n')

const SILENT_KEYWORDS = new Set(['hey', 'hi', 'hello', 'mambo', 'niaje', 'habari', 'sasa', 'yo', 'bro'])

let sock
let messageLog = []
let reconnectTimer = null
let latestQrDataUrl = null
let latestQrIssuedAt = null
let latestQrSvg = null
let latestPairingCode = null
let latestPairingCodeIssuedAt = null

const connectionState = {
  status: 'starting',
  lastError: null,
  lastDisconnectCode: null,
  connectedAt: null
}

const runtimeState = {
  botActive: true,
  autoReplyActive: true,
  autoViewActive: true,
  autoLikeActive: true,
  knownContacts: [],
  viewedStatuses: [],
  repliedContacts: {},
  orders: [],
  orderSessions: {},
  nextOrderNumber: 1
}

ensureDir(DATA_DIR)
ensureDir(AUTH_DIR)
loadState()
startHealthServer()

function ensureDir(dirPath) {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true })
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '')
}

function jidToPhone(jid) {
  return String(jid || '').split('@')[0].replace(/[^\d]/g, '')
}

function toUserJid(phone) {
  const normalized = normalizePhone(phone)
  return normalized ? `${normalized}@s.whatsapp.net` : null
}

function isAdmin(jid) {
  return jidToPhone(jid) === ADMIN_NUMBER
}

function isGroupJid(jid) {
  return String(jid || '').endsWith('@g.us')
}

function isStatusJid(jid) {
  return jid === 'status@broadcast'
}

function getTextFromMessage(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.documentMessage?.caption ||
    ''
  ).trim()
}

function normalizeInput(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function simplifyText(text) {
  return normalizeInput(text).replace(/[^a-z0-9 ]/g, '').trim()
}

function formatServiceListInline() {
  return SERVICE_CATALOG.map((service) => service.key).join(', ')
}

function getServiceByText(text) {
  const normalized = simplifyText(text)
  return SERVICE_MAP[normalized] || null
}

function isBusinessIntent(text) {
  const normalized = simplifyText(text)
  if (!normalized || SILENT_KEYWORDS.has(normalized)) {
    return false
  }

  if (['order', 'menu', 'services', 'help', 'price', 'hours'].includes(normalized)) {
    return true
  }

  return Boolean(getServiceByText(normalized))
}

function getStatusFingerprint(msg) {
  const participant = msg?.key?.participant || 'unknown'
  const statusId = msg?.key?.id || 'no-id'
  return `${participant}:${statusId}`
}

function getStorageSnapshot() {
  return {
    authDir: path.resolve(AUTH_DIR),
    dataDir: path.resolve(DATA_DIR),
    authDirExists: fs.existsSync(AUTH_DIR),
    dataDirExists: fs.existsSync(DATA_DIR),
    authFileCount: fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR).length : 0,
    hasCredsFile: fs.existsSync(path.join(AUTH_DIR, 'creds.json')),
    hasStateFile: fs.existsSync(STATE_FILE)
  }
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    saveState()
    return
  }

  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    runtimeState.botActive = raw.botActive ?? true
    runtimeState.autoReplyActive = raw.autoReplyActive ?? true
    runtimeState.autoViewActive = raw.autoViewActive ?? true
    runtimeState.autoLikeActive = raw.autoLikeActive ?? true
    runtimeState.knownContacts = Array.isArray(raw.knownContacts) ? raw.knownContacts : []
    runtimeState.viewedStatuses = Array.isArray(raw.viewedStatuses) ? raw.viewedStatuses.slice(-500) : []
    runtimeState.repliedContacts = raw.repliedContacts && typeof raw.repliedContacts === 'object'
      ? raw.repliedContacts
      : {}
    runtimeState.orders = Array.isArray(raw.orders) ? raw.orders.slice(-ORDER_RETENTION_LIMIT) : []
    runtimeState.orderSessions = raw.orderSessions && typeof raw.orderSessions === 'object'
      ? raw.orderSessions
      : {}
    runtimeState.nextOrderNumber = Number(raw.nextOrderNumber || runtimeState.orders.length + 1)
  } catch (error) {
    log(`State load warning: ${error.message}`)
    saveState()
  }
}

function saveState() {
  const stateToSave = {
    botActive: runtimeState.botActive,
    autoReplyActive: runtimeState.autoReplyActive,
    autoViewActive: runtimeState.autoViewActive,
    autoLikeActive: runtimeState.autoLikeActive,
    knownContacts: runtimeState.knownContacts.slice(-5000),
    viewedStatuses: runtimeState.viewedStatuses.slice(-500),
    repliedContacts: runtimeState.repliedContacts,
    orders: runtimeState.orders.slice(-ORDER_RETENTION_LIMIT),
    orderSessions: runtimeState.orderSessions,
    nextOrderNumber: runtimeState.nextOrderNumber
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2))
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}`
  safeConsoleLog(entry)
  messageLog.push(entry)
  if (messageLog.length > 200) {
    messageLog = messageLog.slice(-200)
  }
  fs.appendFileSync(LOG_FILE, `${entry}\n`)
}

function safeConsoleLog(message) {
  try {
    console.log(message)
  } catch (error) {
    if (error?.code !== 'EPIPE') {
      throw error
    }
  }
}

async function saveQrArtifacts(qr) {
  await QRCode.toFile(QR_IMAGE_FILE, qr, {
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 18
  })

  const qrText = await QRCode.toString(qr, {
    type: 'terminal',
    small: true
  })
  fs.writeFileSync(QR_TEXT_FILE, qrText, 'utf8')
  latestQrSvg = await QRCode.toString(qr, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 1600
  })
  fs.writeFileSync(QR_SVG_FILE, latestQrSvg, 'utf8')
  latestQrDataUrl = await QRCode.toDataURL(qr, {
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 16
  })
  latestQrIssuedAt = new Date().toISOString()
  log(`QR artifacts saved to ${QR_IMAGE_FILE}, ${QR_SVG_FILE}, and ${QR_TEXT_FILE}`)
}

function clearQrArtifacts() {
  latestQrDataUrl = null
  latestQrIssuedAt = null
  latestQrSvg = null
  latestPairingCode = null
  latestPairingCodeIssuedAt = null

  for (const filePath of [QR_IMAGE_FILE, QR_SVG_FILE, QR_TEXT_FILE]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

function clearAuthDirectory() {
  if (!fs.existsSync(AUTH_DIR)) {
    ensureDir(AUTH_DIR)
    return
  }

  for (const entry of fs.readdirSync(AUTH_DIR)) {
    const fullPath = path.join(AUTH_DIR, entry)
    fs.rmSync(fullPath, { recursive: true, force: true })
  }

  ensureDir(AUTH_DIR)
  log(`Auth directory cleared: ${path.resolve(AUTH_DIR)}`)
}

function getConnectionSnapshot() {
  return {
    status: connectionState.status,
    lastError: connectionState.lastError,
    lastDisconnectCode: connectionState.lastDisconnectCode,
    connectedAt: connectionState.connectedAt,
    latestQrIssuedAt,
    latestPairingCodeIssuedAt,
    hasQr: Boolean(latestQrDataUrl),
    hasPairingCode: Boolean(latestPairingCode),
    pairingNumber: PAIRING_NUMBER || null,
    knownContacts: runtimeState.knownContacts.length,
    activeOrderSessions: Object.keys(runtimeState.orderSessions).length,
    ordersStored: runtimeState.orders.length,
    uptimeSeconds: Math.round(process.uptime()),
    storage: getStorageSnapshot()
  }
}

async function generatePairingCode() {
  if (!sock || typeof sock.requestPairingCode !== 'function') {
    throw new Error('Pairing code is not available on this socket.')
  }

  if (connectionState.status === 'logged_out') {
    throw new Error('Session is logged out. Reset auth first, then request a fresh pairing code.')
  }

  const pairingNumber = PAIRING_NUMBER
  if (!pairingNumber) {
    throw new Error('PAIRING_NUMBER is not configured.')
  }

  const code = await sock.requestPairingCode(pairingNumber)
  latestPairingCode = code
  latestPairingCodeIssuedAt = new Date().toISOString()
  connectionState.status = 'awaiting_pairing_code'
  log(`Fresh pairing code generated for ${pairingNumber}`)
  return code
}

async function sendText(jid, text) {
  if (!sock) {
    log(`Send skipped because socket is not ready for ${jid}`)
    return false
  }

  try {
    await sock.sendMessage(jid, { text })
    return true
  } catch (error) {
    log(`Send error to ${jid}: ${error.message}`)
    return false
  }
}

async function notifyAdmin(text) {
  const adminJid = toUserJid(ADMIN_NUMBER)
  if (!adminJid) {
    log('Admin notification skipped because ADMIN_NUMBER is missing.')
    return false
  }

  return sendText(adminJid, text)
}

function rememberContact(jid) {
  const phone = jidToPhone(jid)
  if (!phone) {
    return false
  }

  if (!runtimeState.knownContacts.includes(phone)) {
    runtimeState.knownContacts.push(phone)
    runtimeState.repliedContacts[phone] = Date.now()
    saveState()
    return true
  }

  return false
}

function markStatusSeen(fingerprint) {
  if (runtimeState.viewedStatuses.includes(fingerprint)) {
    return false
  }

  runtimeState.viewedStatuses.push(fingerprint)
  runtimeState.viewedStatuses = runtimeState.viewedStatuses.slice(-500)
  saveState()
  return true
}

function getOrderSession(jid) {
  return runtimeState.orderSessions[jidToPhone(jid)] || null
}

function setOrderSession(jid, session) {
  runtimeState.orderSessions[jidToPhone(jid)] = {
    ...session,
    updatedAt: new Date().toISOString()
  }
  saveState()
}

function clearOrderSession(jid) {
  delete runtimeState.orderSessions[jidToPhone(jid)]
  saveState()
}

function createEmptyOrderDraft(jid) {
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

function createOrderId() {
  const id = `MRUTC-${String(runtimeState.nextOrderNumber).padStart(4, '0')}`
  runtimeState.nextOrderNumber += 1
  return id
}

function formatOrderSummary(order) {
  return [
    `Order ID: *${order.id || 'Draft'}*`,
    `Customer: *${order.fullName || 'Not set'}*`,
    `Phone: *${order.customerPhone || 'Unknown'}*`,
    `Service: *${order.serviceLabel || 'Not selected'}*`,
    `Details: ${order.details || 'Not provided'}`,
    `Timeline / urgency: ${order.urgency || 'Not provided'}`,
    `Status: *${order.status || 'Draft'}*`,
    `Created: ${order.createdAt || new Date().toISOString()}`
  ].join('\n')
}

function startOrderFlow(jid, initialService) {
  const draft = createEmptyOrderDraft(jid)
  if (initialService) {
    draft.serviceKey = initialService.key
    draft.serviceLabel = initialService.label
  }

  setOrderSession(jid, {
    step: initialService ? 'full_name' : 'service',
    order: draft
  })
}

async function sendOrderPrompt(jid, step, session) {
  if (step === 'service') {
    await sendText(jid, ORDER_GUIDE_MESSAGE)
    return
  }

  if (step === 'full_name') {
    await sendText(
      jid,
      `Sawa \ud83d\udc4c Tumekusave kwenye *${session.order.serviceLabel}*.\n\nTuma *majina yako kamili* kama yatatumika kwenye order.`
    )
    return
  }

  if (step === 'details') {
    await sendText(
      jid,
      [
        `Nice, *${session.order.fullName}*.`,
        '',
        'Sasa eleza order yako vizuri kidogo.',
        'Andika details muhimu tu: unahitaji nini exactly, documents ulizonazo, na chochote kinachotakiwa tujue.'
      ].join('\n')
    )
    return
  }

  if (step === 'urgency') {
    await sendText(
      jid,
      'Order details zimepokelewa.\n\nTuambie *timeline* yako: unaitaka lini au ni urgent kiasi gani?'
    )
    return
  }

  if (step === 'confirm') {
    await sendText(
      jid,
      [
        '\ud83d\udccb *Order review*',
        '',
        formatOrderSummary({ ...session.order, status: 'Pending confirmation' }),
        '',
        'Reply *confirm* ku-submit order.',
        'Reply *edit* kuanza upya.',
        'Reply *cancel* kufuta order.'
      ].join('\n')
    )
  }
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
    const service = getServiceByText(normalized)
    if (!service) {
      await sendText(jid, `Please chagua service sahihi: ${formatServiceListInline()}.`)
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

  if (session.step === 'confirm') {
    if (normalized === 'confirm') {
      const order = {
        ...session.order,
        id: createOrderId(),
        status: 'New',
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      runtimeState.orders.push(order)
      runtimeState.orders = runtimeState.orders.slice(-ORDER_RETENTION_LIMIT)
      clearOrderSession(jid)
      saveState()

      await sendText(
        jid,
        [
          '\u2705 *Order yako imepokelewa*',
          '',
          `Order ID yako ni *${order.id}*.`,
          'Team yetu ita-review na kukurudia soon.',
          `Kwa follow-up ya haraka unaweza pia kutumia *${CONTACT_NUMBER}*.`
        ].join('\n')
      )

      await notifyAdmin(
        [
          '\ud83d\udea8 *New Order Received*',
          '',
          formatOrderSummary(order)
        ].join('\n')
      )
      log(`Order submitted: ${order.id} from ${order.customerPhone}`)
      return true
    }

    await sendText(jid, 'Reply *confirm*, *edit*, au *cancel* kwenye order review.')
    return true
  }

  return false
}

function getRecentOrders(limit = 5) {
  return runtimeState.orders.slice(-limit).reverse()
}

async function handleAdminCommand(from, command) {
  const trimmed = command.trim()
  const normalized = simplifyText(trimmed)

  if (normalized === 'status' || normalized === 'bot status' || normalized === '!status') {
    await sendText(
      from,
      [
        `*${BOT_NAME} Status*`,
        '',
        `Bot: ${runtimeState.botActive ? 'ON' : 'OFF'}`,
        `Connection: ${connectionState.status}`,
        `Auto welcome: ${runtimeState.autoReplyActive ? 'ON' : 'OFF'}`,
        `Auto view status: ${runtimeState.autoViewActive ? 'ON' : 'OFF'}`,
        `Auto react status: ${runtimeState.autoLikeActive ? `ON (${STATUS_REACTION})` : 'OFF'}`,
        `Known contacts: ${runtimeState.knownContacts.length}`,
        `Active order sessions: ${Object.keys(runtimeState.orderSessions).length}`,
        `Stored orders: ${runtimeState.orders.length}`,
        `Auth files: ${getStorageSnapshot().authFileCount}`,
        `Has creds.json: ${getStorageSnapshot().hasCredsFile ? 'YES' : 'NO'}`
      ].join('\n')
    )
    return true
  }

  if (normalized === 'on' || normalized === '!on') {
    runtimeState.botActive = true
    saveState()
    await sendText(from, 'Bot iko ON sasa.')
    return true
  }

  if (normalized === 'off' || normalized === '!off') {
    runtimeState.botActive = false
    saveState()
    await sendText(from, 'Bot iko OFF sasa.')
    return true
  }

  if (normalized === 'welcome on' || normalized === '!reply on') {
    runtimeState.autoReplyActive = true
    saveState()
    await sendText(from, 'First-time welcome iko ON.')
    return true
  }

  if (normalized === 'welcome off' || normalized === '!reply off') {
    runtimeState.autoReplyActive = false
    saveState()
    await sendText(from, 'First-time welcome iko OFF.')
    return true
  }

  if (normalized === 'view on' || normalized === '!view on') {
    runtimeState.autoViewActive = true
    saveState()
    await sendText(from, 'Auto-view status iko ON.')
    return true
  }

  if (normalized === 'view off' || normalized === '!view off') {
    runtimeState.autoViewActive = false
    saveState()
    await sendText(from, 'Auto-view status iko OFF.')
    return true
  }

  if (normalized === 'like on' || normalized === '!like on') {
    runtimeState.autoLikeActive = true
    saveState()
    await sendText(from, `Auto-react status iko ON (${STATUS_REACTION}).`)
    return true
  }

  if (normalized === 'like off' || normalized === '!like off') {
    runtimeState.autoLikeActive = false
    saveState()
    await sendText(from, 'Auto-react status iko OFF.')
    return true
  }

  if (normalized === 'orders' || normalized === '!orders') {
    const orders = getRecentOrders(5)
    await sendText(
      from,
      orders.length
        ? [
            '*Recent Orders*',
            '',
            ...orders.map(
              (order) =>
                `${order.id} | ${order.fullName} | ${order.serviceKey} | ${order.status} | ${order.customerPhone}`
            )
          ].join('\n')
        : 'Hakuna order bado.'
    )
    return true
  }

  if (normalized.startsWith('order ') || normalized.startsWith('!order ')) {
    const orderId = trimmed.split(/\s+/).slice(1).join(' ').trim().toUpperCase()
    const order = runtimeState.orders.find((item) => item.id === orderId)
    await sendText(from, order ? formatOrderSummary(order) : `Sijaona order yenye ID *${orderId}*.`)
    return true
  }

  if (normalized === 'sessions' || normalized === '!sessions') {
    const sessions = Object.entries(runtimeState.orderSessions)
    await sendText(
      from,
      sessions.length
        ? [
            '*Active Order Sessions*',
            '',
            ...sessions.map(([phone, session]) => `${phone} | step: ${session.step} | service: ${session.order.serviceKey || 'none'}`)
          ].join('\n')
        : 'Hakuna active order session right now.'
    )
    return true
  }

  if (normalized.startsWith('clear session ') || normalized.startsWith('!clear session ')) {
    const phone = normalizePhone(trimmed.split(/\s+/).slice(2).join(' '))
    if (phone && runtimeState.orderSessions[phone]) {
      delete runtimeState.orderSessions[phone]
      saveState()
      await sendText(from, `Session ya ${phone} imefutwa.`)
    } else {
      await sendText(from, 'Sijaona session ya hiyo namba.')
    }
    return true
  }

  if (normalized === 'storage' || normalized === '!storage') {
    const storage = getStorageSnapshot()
    await sendText(
      from,
      [
        '*Storage Snapshot*',
        '',
        `Auth dir: ${storage.authDir}`,
        `Data dir: ${storage.dataDir}`,
        `Auth files: ${storage.authFileCount}`,
        `Has creds.json: ${storage.hasCredsFile ? 'YES' : 'NO'}`,
        `Has state file: ${storage.hasStateFile ? 'YES' : 'NO'}`
      ].join('\n')
    )
    return true
  }

  if (normalized === 'logs' || normalized === '!logs') {
    const lastLogs = messageLog.slice(-10).join('\n')
    await sendText(from, `*Last 10 logs*\n\n${lastLogs || 'No logs recorded yet.'}`)
    return true
  }

  if (normalized === 'clearlogs' || normalized === '!clearlogs') {
    messageLog = []
    fs.writeFileSync(LOG_FILE, '')
    await sendText(from, 'Logs zimefutwa.')
    return true
  }

  if (normalized === 'help' || normalized === '!help') {
    await sendText(
      from,
      [
        `*Admin Commands - ${BOT_NAME}*`,
        '',
        '!on / !off',
        '!status',
        '!reply on / !reply off',
        '!view on / !view off',
        '!like on / !like off',
        '!orders',
        '!order MRUTC-0001',
        '!sessions',
        '!clear session 2557xxxxxxx',
        '!storage',
        '!logs',
        '!clearlogs'
      ].join('\n')
    )
    return true
  }

  return false
}

async function handleStatusMessage(msg) {
  const fingerprint = getStatusFingerprint(msg)
  const isUniqueStatus = markStatusSeen(fingerprint)

  if (!isUniqueStatus) {
    return
  }

  try {
    if (runtimeState.autoViewActive) {
      await sock.readMessages([msg.key])
      log(`Status viewed: ${msg.key.participant || 'unknown participant'}`)
    }

    if (runtimeState.autoLikeActive) {
      await sock.sendMessage('status@broadcast', {
        react: { text: STATUS_REACTION, key: msg.key }
      })
      log(`Status reacted with ${STATUS_REACTION}: ${msg.key.participant || 'unknown participant'}`)
    }
  } catch (error) {
    log(`Status handling error: ${error.message}`)
  }
}

async function handleDirectMessage(msg) {
  const from = msg.key.remoteJid
  const text = getTextFromMessage(msg)

  if (!text) {
    return
  }

  log(`Incoming message from ${from}: ${text}`)

  if (isAdmin(from) && text.startsWith('!')) {
    const handled = await handleAdminCommand(from, text)
    if (handled) {
      return
    }
  }

  if (!runtimeState.botActive) {
    return
  }

  const session = getOrderSession(from)
  if (session) {
    await handleOrderFlow(from, text, session)
    return
  }

  const normalized = simplifyText(text)
  const service = getServiceByText(normalized)
  const isNewContact = rememberContact(from)

  if (isNewContact && runtimeState.autoReplyActive) {
    await sendText(from, FIRST_CONTACT_MESSAGE)
    log(`Welcome message sent to new contact: ${from}`)
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

  if (normalized === 'services' || normalized === 'menu' || normalized === 'help') {
    await sendText(from, ORDER_GUIDE_MESSAGE)
    return
  }

  if (normalized === 'hours') {
    await sendText(from, `\ud83d\udd50 *Working Hours*\n\n${WORKING_HOURS}`)
    return
  }

  if (normalized === 'price') {
    await sendText(
      from,
      [
        '\ud83d\udcb0 *Pricing info*',
        '',
        'Bei inategemea service na ugumu wa kazi.',
        `Kwa exact quotation, text *order* au reach us direct kupitia *${CONTACT_NUMBER}*.`
      ].join('\n')
    )
    return
  }

  if (!isBusinessIntent(text)) {
    log(`Silenced non-business message from ${from}`)
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    startBot().catch((error) => {
      log(`Reconnect failed: ${error.message}`)
      scheduleReconnect()
    })
  }, 5000)
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  connectionState.status = 'starting'
  connectionState.lastError = null
  log(`Starting ${BOT_NAME}...`)

  sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    getMessage: async () => ({ conversation: '' })
  })

  sock.ev.on('creds.update', async () => {
    await saveCreds()
    log('Credentials updated and saved.')
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      connectionState.status = 'awaiting_qr_scan'
      safeConsoleLog(`\n[${BOT_NAME}] Scan this QR code:\n`)
      try {
        qrcode.generate(qr, { small: true })
      } catch (error) {
        if (error?.code !== 'EPIPE') {
          log(`QR terminal render error: ${error.message}`)
        }
      }

      try {
        await saveQrArtifacts(qr)
      } catch (error) {
        log(`QR file save error: ${error.message}`)
      }
    }

    if (connection === 'open') {
      connectionState.status = 'connected'
      connectionState.connectedAt = new Date().toISOString()
      connectionState.lastError = null
      connectionState.lastDisconnectCode = null
      clearQrArtifacts()
      log(`${BOT_NAME} connected successfully.`)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut

      connectionState.status = shouldReconnect ? 'reconnecting' : 'logged_out'
      connectionState.lastDisconnectCode = code || null
      connectionState.lastError = lastDisconnect?.error?.message || null

      log(`Connection closed. Code: ${code || 'unknown'} | Reconnect: ${shouldReconnect}`)

      if (shouldReconnect) {
        scheduleReconnect()
      } else {
        log('Session logged out. Re-scan is required before reconnecting.')
        if (!state.creds.registered || getStorageSnapshot().authFileCount <= 1) {
          log('Detected invalid or partial auth state. Clearing auth directory for a clean reconnect.')
          clearAuthDirectory()
          scheduleReconnect()
        }
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages?.[0]
    if (!msg || !msg.message || msg.key.fromMe) {
      return
    }

    const remoteJid = msg.key.remoteJid

    if (isStatusJid(remoteJid)) {
      await handleStatusMessage(msg)
      return
    }

    if (isGroupJid(remoteJid)) {
      return
    }

    await handleDirectMessage(msg)
  })
}

function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/connection-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getConnectionSnapshot()))
      return
    }

    if (req.url === '/storage-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getStorageSnapshot()))
      return
    }

    if (req.url === '/reset-auth') {
      clearAuthDirectory()
      clearQrArtifacts()
      connectionState.status = 'resetting_auth'
      connectionState.lastError = null
      connectionState.lastDisconnectCode = null
      scheduleReconnect()
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(
        JSON.stringify({
          ok: true,
          message: 'Auth directory cleared. The bot is reconnecting and should request a fresh QR or pairing code shortly.',
          ...getConnectionSnapshot()
        })
      )
      return
    }

    if (req.url === '/qr') {
      if (!latestQrDataUrl) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            message: 'No active QR right now. The bot may already be connected or not yet requesting a new scan.',
            ...getConnectionSnapshot()
          })
        )
        return
      }

      const imageBuffer = Buffer.from(latestQrDataUrl.split(',')[1], 'base64')
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store'
      })
      res.end(imageBuffer)
      return
    }

    if (req.url === '/qr.svg') {
      if (!latestQrSvg) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            message: 'No active SVG QR right now. The bot may already be connected or not yet requesting a new scan.',
            ...getConnectionSnapshot()
          })
        )
        return
      }

      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(latestQrSvg)
      return
    }

    if (req.url === '/pairing-code') {
      try {
        const code = await generatePairingCode()
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(
          JSON.stringify({
            ok: true,
            pairingCode: code,
            ...getConnectionSnapshot()
          })
        )
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            message: error.message,
            ...getConnectionSnapshot()
          })
        )
      }
      return
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, botName: BOT_NAME, ...getConnectionSnapshot() }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${BOT_NAME}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f4ed; color: #1c1c1c; margin: 0; padding: 24px; }
      .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.08); }
      h1 { margin-top: 0; }
      .status { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #f1ede2; font-weight: 700; }
      img { width: 100%; max-width: 360px; border-radius: 12px; border: 1px solid #ddd; background: white; }
      a { color: #0c6b58; text-decoration: none; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 6px; }
      .muted { color: #555; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${BOT_NAME}</h1>
      <p class="status">Status: ${connectionState.status}</p>
      <p class="muted">Use <code>/connection-status</code> to confirm Railway is connected, <code>/storage-status</code> to verify persistence, <code>/reset-auth</code> to wipe a broken session, <code>/qr.svg</code> for the sharpest QR, and <code>/pairing-code</code> for phone-number pairing when needed.</p>
      ${latestQrDataUrl ? `<p><img src="${latestQrDataUrl}" alt="WhatsApp QR code" /></p>` : '<p>No active QR right now. If the bot is already connected, this is expected.</p>'}
      ${latestPairingCode ? `<p><strong>Latest pairing code:</strong> <code>${latestPairingCode}</code></p>` : ''}
    </div>
  </body>
</html>`)
  })

  server.listen(PORT, () => {
    log(`Health server listening on port ${PORT}`)
  })
}

process.on('uncaughtException', (error) => {
  if (error?.code === 'EPIPE') {
    return
  }
  log(`Uncaught exception: ${error.message}`)
})

process.on('unhandledRejection', (error) => {
  connectionState.lastError = error?.message || String(error)
  log(`Unhandled rejection: ${error?.message || error}`)
})

process.on('SIGINT', () => {
  log('Bot shutting down with SIGINT.')
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('Bot shutting down with SIGTERM.')
  process.exit(0)
})

startBot().catch((error) => {
  connectionState.status = 'startup_failed'
  connectionState.lastError = error.message
  log(`Initial startup failed: ${error.message}`)
  scheduleReconnect()
})
