# Mr. UTC WhatsApp Bot

This bot now uses `whatsapp-web.js` with persistent browser auth storage, so it must run on an always-on server with persistent storage for the WhatsApp session files and bot state.

## Best deployment target

Use Railway first.

Do not use Vercel for this bot because Vercel does not keep a long-running WhatsApp socket alive.
Render can work too, but for this bot Railway is the smoother option because it handles long-running services and mounted storage more naturally.

## What this bot keeps

- First-contact-only welcome flow
- Quiet mode for random or personal chats
- Swanglish order workflow with step-by-step prompts
- Admin notification when a new order is confirmed
- Auto-view status with unique handling
- Auto-react to viewed status with `🔥`
- Persistent contact, order, and session tracking

## Project structure

- `bot.js` : small entrypoint
- `src/app.js` : bot runtime, reconnect flow, HTTP endpoints
- `src/config.js` : environment config and storage defaults
- `src/store.js` : persistent state and session helpers
- `src/copy.js` : message templates
- `ecosystem.config.js` : PM2 config for VPS or Termux keep-alive
- `railway.json` : Railway healthcheck and restart policy
- `render.yaml` : Render service definition
- `Dockerfile` : container runtime for Railway and Render

## Environment variables

Copy `.env.example` to `.env` and set:

- `ADMIN_NUMBER`
- `CONTACT_NUMBER`
- `PAIRING_NUMBER`
- `HOST`
- `PORT`
- `WEB_CLIENT_ID`

Optional storage vars:

- `AUTH_DIR`
- `DATA_DIR`
- `LOG_FILE`
- `SESSION_BUNDLE_B64`
- `PUPPETEER_EXECUTABLE_PATH`
- `HEARTBEAT_INTERVAL_MS`
- `PRESENCE_INTERVAL_MS`
- `HEALTH_FAILURE_THRESHOLD`
- `EXIT_ON_HEALTH_FAILURE`

Default local values are set for `storage/...`.
For Railway or Render, setting only `DATA_DIR=/data` is enough for the bot to keep session files in `/data/session`, app state in `/data`, and logs in `/data/logs`.
Railway Docker already sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
For Railway, keep `EXIT_ON_HEALTH_FAILURE=true` so the service can restart itself when the WhatsApp web session goes stale even though the process is still alive.

## Local run

```bash
npm install
npm start
```

Use `/qr` or `/qr.svg` for the easiest connection flow.
Use `/pairing-code` when you want to link by code instead of scanning.

## Fresh connect

When you want a clean WhatsApp login without old session leftovers:

```bash
npm run start:fresh
```

This clears only the stored WhatsApp browser session and old QR artifacts, then starts the bot again so you get a fresh QR or pairing code.

## Session bootstrap fallback

If your cloud host refuses to generate a usable QR or pairing code, you can bootstrap the WhatsApp session once from a working local machine and move that session to the server.

1. Connect the bot locally where QR login works.
2. Export the session bundle:
   `npm run session:export`
3. Copy the generated base64 string from:
   `storage/data/session-bundle.b64.txt`
4. In Railway, set:
   `SESSION_BUNDLE_B64=<that long base64 string>`
5. Redeploy once.
6. After the bot comes up connected and writes its own session files to `/data`, remove `SESSION_BUNDLE_B64` from Railway so the secret is not left sitting in env vars and does not interfere with future restarts.

## Railway deployment

1. Create a new Railway project from this folder or GitHub repo.
2. Add a persistent volume mounted at `/data`.
3. Set `DATA_DIR=/data`.
4. Set `HOST=0.0.0.0`.
5. Add the environment variables from `.env.example`.
6. Deploy and open `/health` first.
7. Open `/qr` or `/qr.svg` and scan it in WhatsApp Linked Devices.
8. If you prefer code linking, open `/pairing-code`.
9. If the old session is broken, call `/reset-session` once and then fetch `/qr` or `/pairing-code` again.
10. Use `/connection-status` and `/storage-status` for quick live checks.

For live session checks, `/connection-status` now also reports:

- `waState`
- `lastStateCheckAt`
- `lastPresenceAt`
- `lastHealthyAt`
- `healthFailures`
- `connectionHealthy`

If `status` says `connected` but `connectionHealthy` is `false`, the service is alive but the WhatsApp web session is stale and should auto-recover or restart.

Railway uses the included [Dockerfile](C:/Users/MelekhFad31/mr-utc/Dockerfile) to install Chromium and the libraries required by `whatsapp-web.js`.

## Render deployment

1. Create a new Render service from this folder or GitHub repo.
2. Render will detect `render.yaml`.
3. Keep the attached disk mounted at `/data`.
4. Add the environment variables from `.env.example`.
5. Deploy and wait for `/health` to report `connected: false` or `true`.
6. Open `/qr`, `/qr.svg`, or `/pairing-code` to link the WhatsApp account.
7. If the service is stuck with old credentials, open `/reset-session` once, then fetch `/qr` or `/pairing-code` again.
8. Keep Render using only the mounted `/data` disk for auth files and bot state.

## VPS run

1. Install Node.js 20+.
2. Run `npm install`.
3. Start once with `npm start`.
4. Open `http://YOUR_SERVER_IP:3000/qr`, `http://YOUR_SERVER_IP:3000/qr.svg`, or `http://YOUR_SERVER_IP:3000/pairing-code`.
5. Link the WhatsApp account.
6. Stop the temporary process.
7. Run with PM2:
   `pm2 start ecosystem.config.js`
8. Save PM2:
   `pm2 save`

## Termux run

This is the best no-payment setup if you have an Android phone that can stay online and charging.

1. Install `Termux` from F-Droid:
   [https://f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/)
2. Open Termux and run:
   `pkg update && pkg upgrade -y`
3. Install required packages:
   `pkg install -y git nodejs-lts`
4. Clone the repo:
   `git clone https://github.com/Fadboy31/mr-uct.git`
5. Enter the project:
   `cd mr-uct`
6. Install dependencies:
   `npm install`
7. Copy env file:
   `cp .env.example .env`
8. Edit it:
   `nano .env`
9. Set at least:
   `ADMIN_NUMBER`
   `PAIRING_NUMBER`
   `CONTACT_NUMBER`
10. Keep:
   `AUTH_DIR=storage/session`
   `DATA_DIR=storage/data`
   `HOST=127.0.0.1`
   `PORT=3000`
11. Start once:
   `npm start`
12. On the same phone, open:
   [http://127.0.0.1:3000/pairing-code](http://127.0.0.1:3000/pairing-code)
   or
   [http://127.0.0.1:3000/qr.svg](http://127.0.0.1:3000/qr.svg)
13. Link WhatsApp.
14. If you want the page reachable from another device on your Wi-Fi, set:
   `HOST=0.0.0.0`

## Termux keep-alive

Termux does not behave exactly like a VPS. For the smoothest experience:

1. Keep the phone on charge.
2. Disable battery optimization for Termux.
3. In Android settings, allow Termux to run in background.
4. Keep Wi-Fi or mobile data stable.
5. If you want automatic restarts inside Termux, install PM2:
   `npm install -g pm2`
6. Then run:
   `pm2 start ecosystem.config.js`
7. Check:
   `pm2 status`

## Health and utility endpoints

The app exposes:

- `/`
- `/health`
- `/connection-status`
- `/storage-status`
- `/qr`
- `/qr.svg`
- `/pairing-code`
- `/reset-session`

Use `/qr` or `/qr.svg` for normal linking, `/pairing-code` when you want code linking, `/connection-status` and `/storage-status` for live diagnostics, and `/reset-session` to clear a broken WhatsApp session on the server.

## Admin commands

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
