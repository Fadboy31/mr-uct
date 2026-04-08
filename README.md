# Mr. UTC WhatsApp Bot

This rebuild is designed for `VPS + Baileys`, not Railway-first session hosting.

## What this keeps

- First-contact-only welcome flow
- Quiet mode for random or personal chats
- Swanglish order workflow with step-by-step prompts
- Admin notification when a new order is confirmed
- Auto-view status with unique handling
- Auto-react to viewed status with `🔥`
- Persistent contact, order, and session tracking

## Structure

- `bot.js` : small entrypoint
- `src/app.js` : bot runtime, session recovery, HTTP tools
- `src/config.js` : environment config
- `src/store.js` : persistent state and session storage helpers
- `src/copy.js` : message templates
- `ecosystem.config.js` : PM2 config for VPS

## Environment

Copy `.env.example` to `.env` and set:

- `ADMIN_NUMBER` : admin WhatsApp number
- `PAIRING_NUMBER` : exact WhatsApp number you want to link
- `AUTH_DIR=storage/session`
- `DATA_DIR=storage/data`
- `LOG_FILE=storage/logs/mrutc.log`

## VPS Run

1. Install Node.js 20+
2. Run `npm install`
3. Start once with `npm start`
4. Open `http://YOUR_SERVER_IP:3000/pairing-code` or `http://YOUR_SERVER_IP:3000/qr.svg`
5. Link the WhatsApp account
6. Stop the temporary process
7. Run with PM2:
   `pm2 start ecosystem.config.js`
8. Save PM2:
   `pm2 save`

## Useful Endpoints

- `/health`
- `/connection-status`
- `/storage-status`
- `/pairing-code`
- `/qr`
- `/qr.svg`
- `/reset-session`

## Admin Commands

- `!status`
- `!on`
- `!off`
- `!reply on`
- `!reply off`
- `!view on`
- `!view off`
- `!like on`
- `!like off`
- `!orders`
- `!storage`
