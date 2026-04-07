# Mr. UTC WhatsApp Bot

This bot is prepared for 24/7 deployment on Railway using Baileys.

## Features

- Professional first-contact welcome message for new phone numbers
- Keyword-based service replies
- Auto-view status with unique handling
- Auto-react to viewed status with `🔥`
- Persistent contact and status tracking
- Health endpoint for Railway on `/health`
- Admin commands for bot control

## Local run

1. Copy `.env.example` to `.env` if you want to override defaults.
2. Install dependencies with `npm install`.
3. Start with `npm start`.
4. Scan the QR code once.

## Railway deploy

1. Push this project to GitHub.
2. Create a new Railway project from the repository.
3. Set the start command to `npm start` if Railway does not detect it automatically.
4. Add a persistent volume and keep `AUTH_DIR=auth_mrutc` so the WhatsApp session survives restarts.
5. Add any environment variables you want to customize from `.env.example`.
6. Deploy and open `/health` to confirm the worker is alive.

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
- `!logs`
- `!clearlogs`
