const path = require('path')
const fs = require('fs')

function loadEnvFile() {
  const candidates = [path.resolve('.env')]

  const rootEnv = path.resolve('.env')
  if (fs.existsSync(rootEnv) && fs.statSync(rootEnv).isDirectory()) {
    candidates.push(path.join(rootEnv, '.env'))
  }

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      continue
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      let value = trimmed.slice(separatorIndex + 1)

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }

    break
  }
}

loadEnvFile()

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
  sessionBundleB64: process.env.SESSION_BUNDLE_B64 || '',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  chromeExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '',
  webClientId: process.env.WEB_CLIENT_ID || 'mr-utc',
  statusReaction: '\ud83d\udd25',
  orderRetentionLimit: 300
}

config.stateFile = path.join(config.dataDir, 'bot-state.json')
config.qrPngFile = path.join(config.dataDir, 'latest-qr.png')
config.qrSvgFile = path.join(config.dataDir, 'latest-qr.svg')
config.qrTextFile = path.join(config.dataDir, 'latest-qr.txt')

config.services = [
  {
    key: 'heslb',
    label: 'HESLB Loan Application',
    aliases: ['heslb', 'loan', 'loan application', 'mkopo', 'heslb loan']
  },
  {
    key: 'rita',
    label: 'RITA Birth & Death Certificate',
    aliases: ['rita', 'birth certificate', 'death certificate', 'cheti', 'birth cert', 'death cert']
  },
  {
    key: 'ajira',
    label: 'Ajira Portal & Job Application',
    aliases: ['ajira', 'job', 'job application', 'ajira portal', 'kazi']
  },
  {
    key: 'research',
    label: 'Research Proposal & Field Report',
    aliases: ['research', 'proposal', 'field report', 'project', 'report']
  },
  {
    key: 'visa',
    label: 'Visa Application',
    aliases: ['visa', 'travel visa', 'visa application']
  },
  {
    key: 'passport',
    label: 'Passport Application',
    aliases: ['passport', 'passport application']
  },
  {
    key: 'university',
    label: 'University Application',
    aliases: ['university', 'admission', 'application', 'college', 'udahili']
  }
]

config.serviceMap = Object.fromEntries(
  config.services.flatMap((service) => service.aliases.map((alias) => [alias, service]))
)
config.silentKeywords = new Set(['hey', 'hi', 'hello', 'mambo', 'habari', 'niaje', 'yo', 'bro', 'poa', 'sasa', 'vp', 'vipi'])
config.keywordMap = {
  menu: new Set(['menu', 'services', 'service', 'huduma', 'help', 'info', 'start']),
  order: new Set(['order', 'apply', 'application', 'book', 'nataka huduma', 'nataka order']),
  hours: new Set(['hours', 'time', 'working hours', 'muda']),
  price: new Set(['price', 'pricing', 'cost', 'quotation', 'quote', 'bei'])
}

module.exports = { config, normalizePhone }
