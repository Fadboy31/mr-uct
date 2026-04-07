const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const P = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')
const http = require('http')

const BOT_NAME = process.env.BOT_NAME || 'Mr. UTC | Uni-Connect TZ Bot'
const ADMIN_NUMBER = normalizePhone(process.env.ADMIN_NUMBER || '255710852376')
const CONTACT_NUMBER = process.env.CONTACT_NUMBER || '+255710852376'
const AUTH_DIR = process.env.AUTH_DIR || 'auth_mrutc'
const DATA_DIR = process.env.DATA_DIR || 'data'
const LOG_FILE = process.env.LOG_FILE || 'mrutc_log.txt'
const STATE_FILE = path.join(DATA_DIR, 'bot-state.json')
const PORT = Number(process.env.PORT || 3000)
const WORKING_HOURS =
  process.env.WORKING_HOURS ||
  'Mon-Fri: 10:00am - 11:00pm\nSat & Sun: 9:30am - 11:00pm'
const AUTO_REPLY_COOLDOWN_MS = Number(
  process.env.AUTO_REPLY_COOLDOWN_MS || 12 * 60 * 60 * 1000
)
const STATUS_REACTION = '\ud83d\udd25'

const AUTO_REPLY_MESSAGE = [
  '\ud83d\udc4b *Karibu Mr. UTC | Uni-Connect TZ*',
  '',
  'Tunasaidia huduma mbalimbali za mtandaoni kwa haraka na kwa ufanisi.',
  'We support a wide range of online services professionally and quickly.',
  '',
  '*Huduma zetu / Our services:*',
  '\ud83c\udf93 *heslb* - HESLB Loan Application',
  '\ud83d\udcdc *rita* - RITA Birth & Death Certificate',
  '\ud83d\udcbc *ajira* - Ajira Portal & Job Application',
  '\ud83d\udcdd *research* - Research Proposal & Field Report',
  '\u2708\ufe0f *visa* - Visa Application',
  '\ud83d\uded2 *passport* - Passport Application',
  '\ud83c\udfeb *university* - University Application',
  '\ud83d\udccb *services* - Full service list',
  '\ud83d\udd50 *hours* - Working hours',
  '\ud83d\udcb0 *price* - Pricing information',
  '',
  `\ud83d\udcf1 Contact us directly: *${CONTACT_NUMBER}*`,
  '',
  '_Reply with any keyword above and we will guide you immediately._'
].join('\n')

const KEYWORD_REPLIES = {
  heslb: [
    '\ud83c\udf93 *HESLB Loan Application Support*',
    '',
    'We assist with:',
    '- New loan applications',
    '- Loan renewals',
    '- Status checking',
    '- Appeals and corrections',
    '- General HESLB portal support',
    '',
    'Required items may include:',
    '- Registration number',
    '- ID or passport photo',
    '- Parent or guardian documents',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  rita: [
    '\ud83d\udcdc *RITA Certificate Services*',
    '',
    'We assist with:',
    '- Birth certificate applications',
    '- Death certificate applications',
    '- Certificate verification',
    '- Record corrections',
    '',
    'Typical requirements:',
    '- Full name',
    '- Date of birth',
    '- Parent details',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  ajira: [
    '\ud83d\udcbc *Ajira Portal Services*',
    '',
    'We assist with:',
    '- Ajira account creation',
    '- Job application submission',
    '- CV and cover letter support',
    '- Government job applications',
    '- Application follow-up',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  research: [
    '\ud83d\udcdd *Research & Academic Writing Support*',
    '',
    'We assist with:',
    '- Research proposals',
    '- Field reports',
    '- Literature review support',
    '- Data analysis guidance',
    '- Thesis and dissertation formatting',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  visa: [
    '\u2708\ufe0f *Visa Application Support*',
    '',
    'We assist with:',
    '- Tourist visa applications',
    '- Business visa applications',
    '- Student visa applications',
    '- Tracking and document preparation',
    '',
    'Typical requirements:',
    '- Valid passport',
    '- Passport photos',
    '- Supporting documents',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  passport: [
    '\ud83d\uded2 *Passport Application Support*',
    '',
    'We assist with:',
    '- New passport applications',
    '- Passport renewals',
    '- Application follow-up',
    '- Urgent passport support',
    '',
    'Typical requirements:',
    '- Birth certificate',
    '- National ID',
    '- Passport photos',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  university: [
    '\ud83c\udfeb *University Application Support*',
    '',
    'We assist with:',
    '- TCU online applications',
    '- Private university applications',
    '- International university applications',
    '- Scholarship applications',
    '- Admission follow-up',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  services: [
    '\ud83d\udccb *Mr. UTC Services*',
    '',
    '\ud83c\udf93 *heslb* - HESLB Loan Application',
    '\ud83d\udcdc *rita* - RITA Birth & Death Certificate',
    '\ud83d\udcbc *ajira* - Ajira Portal & Job Application',
    '\ud83d\udcdd *research* - Research Proposal & Field Report',
    '\u2708\ufe0f *visa* - Visa Application',
    '\ud83d\uded2 *passport* - Passport Application',
    '\ud83c\udfeb *university* - University Application',
    '\ud83d\udcb0 *price* - Pricing information',
    '\ud83d\udd50 *hours* - Working hours',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`
  ].join('\n'),
  price: [
    '\ud83d\udcb0 *Pricing Information*',
    '',
    'Pricing depends on the type of service and the amount of work involved.',
    'Message us directly for an accurate quotation and quick assistance.',
    '',
    `\ud83d\udcf1 Contact: *${CONTACT_NUMBER}*`,
    `\ud83d\udd50 Hours: ${WORKING_HOURS}`
  ].join('\n'),
  hours: [
    '\ud83d\udd50 *Working Hours*',
    '',
    WORKING_HOURS,
    '',
    'If you message outside working hours, we will still receive it and follow up as soon as possible.'
  ].join('\n'),
  hi: 'Hello and welcome to *Mr. UTC*. Reply with *services* to see everything we offer.',
  hello: 'Hello and welcome to *Mr. UTC*. Reply with *services* to see everything we offer.',
  habari: 'Karibu *Mr. UTC*. Andika *services* kuona huduma zote tunazotoa.',
  help: 'Reply with any of these keywords: *heslb, rita, ajira, research, visa, passport, university, services, price, hours*.'
}

let sock
let messageLog = []
let reconnectTimer = null

const runtimeState = {
  botActive: true,
  autoReplyActive: true,
  autoViewActive: true,
  autoLikeActive: true,
  knownContacts: [],
  viewedStatuses: [],
  repliedContacts: {}
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

function isAdmin(jid) {
  return jidToPhone(jid).includes(ADMIN_NUMBER)
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

function getStatusFingerprint(msg) {
  const participant = msg?.key?.participant || 'unknown'
  const statusId = msg?.key?.id || 'no-id'
  return `${participant}:${statusId}`
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
    repliedContacts: runtimeState.repliedContacts
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2))
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}`
  console.log(entry)
  messageLog.push(entry)
  if (messageLog.length > 200) {
    messageLog = messageLog.slice(-200)
  }
  fs.appendFileSync(LOG_FILE, `${entry}\n`)
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

function rememberContact(jid) {
  const phone = jidToPhone(jid)
  if (!phone) {
    return false
  }

  if (!runtimeState.knownContacts.includes(phone)) {
    runtimeState.knownContacts.push(phone)
    saveState()
    return true
  }

  return false
}

function shouldSendCooldownReply(jid) {
  const phone = jidToPhone(jid)
  if (!phone) {
    return false
  }

  const lastReplyAt = Number(runtimeState.repliedContacts[phone] || 0)
  return Date.now() - lastReplyAt >= AUTO_REPLY_COOLDOWN_MS
}

function touchReplyCooldown(jid) {
  const phone = jidToPhone(jid)
  if (!phone) {
    return
  }

  runtimeState.repliedContacts[phone] = Date.now()
  saveState()
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

async function handleAdminCommand(from, command) {
  const cmd = command.toLowerCase().trim()

  if (cmd === '!status') {
    await sendText(
      from,
      [
        `*${BOT_NAME} Status*`,
        '',
        `Bot: ${runtimeState.botActive ? 'ON' : 'OFF'}`,
        `Auto reply: ${runtimeState.autoReplyActive ? 'ON' : 'OFF'}`,
        `Auto view status: ${runtimeState.autoViewActive ? 'ON' : 'OFF'}`,
        `Auto react status: ${runtimeState.autoLikeActive ? `ON (${STATUS_REACTION})` : 'OFF'}`,
        `Known contacts: ${runtimeState.knownContacts.length}`,
        `Viewed statuses tracked: ${runtimeState.viewedStatuses.length}`,
        `Recent logs in memory: ${messageLog.length}`
      ].join('\n')
    )
    return true
  }

  if (cmd === '!on') {
    runtimeState.botActive = true
    saveState()
    await sendText(from, 'Bot is now ON.')
    return true
  }

  if (cmd === '!off') {
    runtimeState.botActive = false
    saveState()
    await sendText(from, 'Bot is now OFF.')
    return true
  }

  if (cmd === '!reply on') {
    runtimeState.autoReplyActive = true
    saveState()
    await sendText(from, 'Auto reply is now ON.')
    return true
  }

  if (cmd === '!reply off') {
    runtimeState.autoReplyActive = false
    saveState()
    await sendText(from, 'Auto reply is now OFF.')
    return true
  }

  if (cmd === '!view on') {
    runtimeState.autoViewActive = true
    saveState()
    await sendText(from, 'Auto status view is now ON.')
    return true
  }

  if (cmd === '!view off') {
    runtimeState.autoViewActive = false
    saveState()
    await sendText(from, 'Auto status view is now OFF.')
    return true
  }

  if (cmd === '!like on') {
    runtimeState.autoLikeActive = true
    saveState()
    await sendText(from, `Auto status reaction is now ON (${STATUS_REACTION}).`)
    return true
  }

  if (cmd === '!like off') {
    runtimeState.autoLikeActive = false
    saveState()
    await sendText(from, 'Auto status reaction is now OFF.')
    return true
  }

  if (cmd === '!logs') {
    const lastLogs = messageLog.slice(-10).join('\n')
    await sendText(from, `*Last 10 logs*\n\n${lastLogs || 'No logs recorded yet.'}`)
    return true
  }

  if (cmd === '!clearlogs') {
    messageLog = []
    fs.writeFileSync(LOG_FILE, '')
    await sendText(from, 'Logs cleared successfully.')
    return true
  }

  if (cmd === '!help') {
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

  const isNewContact = rememberContact(from)
  const normalized = text.toLowerCase()

  if (isNewContact && runtimeState.autoReplyActive) {
    const sent = await sendText(from, AUTO_REPLY_MESSAGE)
    if (sent) {
      touchReplyCooldown(from)
      log(`Welcome services menu sent to new contact: ${from}`)
    }
    return
  }

  for (const [keyword, response] of Object.entries(KEYWORD_REPLIES)) {
    if (normalized.includes(keyword)) {
      const sent = await sendText(from, response)
      if (sent) {
        touchReplyCooldown(from)
        log(`Keyword reply sent for "${keyword}" to ${from}`)
      }
      return
    }
  }

  if (runtimeState.autoReplyActive && shouldSendCooldownReply(from)) {
    const sent = await sendText(from, AUTO_REPLY_MESSAGE)
    if (sent) {
      touchReplyCooldown(from)
      log(`Fallback services menu sent to ${from}`)
    }
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

  log(`Starting ${BOT_NAME}...`)

  sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    getMessage: async () => ({ conversation: '' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(`\n[${BOT_NAME}] Scan this QR code:\n`)
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      log(`${BOT_NAME} connected successfully.`)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut

      log(`Connection closed. Code: ${code || 'unknown'} | Reconnect: ${shouldReconnect}`)

      if (shouldReconnect) {
        scheduleReconnect()
      } else {
        log('Session logged out. Re-scan is required before reconnecting.')
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
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          botName: BOT_NAME,
          knownContacts: runtimeState.knownContacts.length,
          uptimeSeconds: Math.round(process.uptime())
        })
      )
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`${BOT_NAME} is running.`)
  })

  server.listen(PORT, () => {
    log(`Health server listening on port ${PORT}`)
  })
}

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`)
})

process.on('unhandledRejection', (error) => {
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
  log(`Initial startup failed: ${error.message}`)
  scheduleReconnect()
})
