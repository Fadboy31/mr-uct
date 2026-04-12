function getServiceMenu(config) {
  return config.services.map((service) => `- *${service.key}* : ${service.label}`).join('\n')
}

function getWelcomeMessage(config) {
  return [
    '*Karibu Mr. UTC | Uni-Connect TZ*',
    '',
    'Tunashughulika na online applications na digital support kwa style ya clean, fast, na professional.',
    'We only respond to service keywords so the line stays focused and premium.',
    '',
    '*Available service keywords*',
    getServiceMenu(config),
    '',
    'To continue, reply *order* au type service keyword moja kwa moja, mfano *visa*.',
    `Direct support: *${config.contactNumber}*`,
    `Working hours: ${config.workingHours}`
  ].join('\n')
}

function getOrderGuideMessage(config) {
  return [
    '*Order Desk*',
    '',
    'Reply keyword moja ya huduma unayotaka tuanze nayo:',
    getServiceMenu(config),
    '',
    'Mfano: *heslb*'
  ].join('\n')
}

function getPriceMessage(config) {
  return [
    '*Pricing guide*',
    '',
    'Bei inategemea aina ya service, urgency, na kazi iliyopo ndani ya order yako.',
    'Kwa quotation sahihi, reply *order* au tuma keyword ya huduma moja kwa moja.',
    `Direct line: *${config.contactNumber}*`
  ].join('\n')
}

function getHoursMessage(config) {
  return [
    '*Working hours*',
    '',
    config.workingHours
  ].join('\n')
}

function getSilentModeMessage() {
  return 'This bot only responds to service keywords and active order steps.'
}

function formatOrderSummary(order) {
  return [
    `Order ID: *${order.id || 'Draft'}*`,
    `Customer: *${order.fullName || 'Not set'}*`,
    `Phone: *${order.customerPhone || 'Unknown'}*`,
    `Service: *${order.serviceLabel || 'Not selected'}*`,
    `Brief: ${order.details || 'Not provided'}`,
    `Deadline / urgency: ${order.urgency || 'Not provided'}`,
    `Status: *${order.status || 'Draft'}*`
  ].join('\n')
}

module.exports = {
  getWelcomeMessage,
  getOrderGuideMessage,
  getPriceMessage,
  getHoursMessage,
  getSilentModeMessage,
  formatOrderSummary
}
