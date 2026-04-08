function getServiceMenu(config) {
  return config.services.map((service) => `- *${service.key}* : ${service.label}`).join('\n')
}

function getWelcomeMessage(config) {
  return [
    '\ud83d\udc4b *Karibu Mr. UTC | Uni-Connect TZ*',
    '',
    'Tunasaidia online services kwa style ya haraka, clean, na professional.',
    'We handle online services fast and professionally.',
    '',
    '*Services zetu:*',
    getServiceMenu(config),
    '',
    'Kama uko ready ku-place order, reply *order* au type service moja kwa moja, mfano *visa*.',
    `\ud83d\udcf1 Direct support: *${config.contactNumber}*`,
    `\ud83d\udd50 Working hours: ${config.workingHours}`
  ].join('\n')
}

function getOrderGuideMessage(config) {
  return [
    '\ud83d\udce6 *Order Flow imeanza*',
    '',
    'Chagua service unayotaka kwa ku-reply keyword moja hapa chini:',
    getServiceMenu(config),
    '',
    'Mfano: *heslb*'
  ].join('\n')
}

function formatOrderSummary(order) {
  return [
    `Order ID: *${order.id || 'Draft'}*`,
    `Customer: *${order.fullName || 'Not set'}*`,
    `Phone: *${order.customerPhone || 'Unknown'}*`,
    `Service: *${order.serviceLabel || 'Not selected'}*`,
    `Details: ${order.details || 'Not provided'}`,
    `Timeline / urgency: ${order.urgency || 'Not provided'}`,
    `Status: *${order.status || 'Draft'}*`
  ].join('\n')
}

module.exports = { getWelcomeMessage, getOrderGuideMessage, formatOrderSummary }
