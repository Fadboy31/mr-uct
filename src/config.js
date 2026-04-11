const path = require('path')

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '')
}

const explicitDataDir = process.env.DATA_DIR
const dataDir = explicitDataDir || path.join('storage', 'data')
const sessionDir = process.env.AUTH_DIR || (explicitDataDir ? path.join(dataDir, 'session') : path.join('storage', 'session'))
const logFile = process.env.LOG_FILE || (explicitDataDir ? path.join(dataDir, 'logs', 'mrutc.log') : path.join('storage', 'logs', 'mrutc.log'))

const config = {
  botName: process.env.BOT_NAME || 'Mr. UTC | Uni-Connect TZ Bot',
  adminNumber: normalizePhone(process.env.ADMIN_NUMBER || '255710852376'),
  pairingNumber: normalizePhone(process.env.PAIRING_NUMBER || process.env.ADMIN_NUMBER || '255710852376'),
  contactNumber: process.env.CONTACT_NUMBER || '+255710852376',
  workingHours:
    process.env.WORKING_HOURS ||
    'Mon-Fri: 10:00am - 11:00pm\nSat & Sun: 9:30am - 11:00pm',
  sessionDir,
  dataDir,
  logFile,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  statusReaction: '\ud83d\udd25',
  orderRetentionLimit: 300
}

config.stateFile = path.join(config.dataDir, 'bot-state.json')
config.qrPngFile = path.join(config.dataDir, 'latest-qr.png')
config.qrSvgFile = path.join(config.dataDir, 'latest-qr.svg')
config.qrTextFile = path.join(config.dataDir, 'latest-qr.txt')

config.services = [
  { key: 'heslb', label: 'HESLB Loan Application' },
  { key: 'rita', label: 'RITA Birth & Death Certificate' },
  { key: 'ajira', label: 'Ajira Portal & Job Application' },
  { key: 'research', label: 'Research Proposal & Field Report' },
  { key: 'visa', label: 'Visa Application' },
  { key: 'passport', label: 'Passport Application' },
  { key: 'university', label: 'University Application' }
]

config.serviceMap = Object.fromEntries(config.services.map((service) => [service.key, service]))
config.silentKeywords = new Set(['hey', 'hi', 'hello', 'mambo', 'habari', 'niaje', 'yo', 'bro', 'poa', 'sasa'])

module.exports = { config, normalizePhone }
