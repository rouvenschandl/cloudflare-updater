# Cloudflare Updater – Quick Start Guide

This guide shows two ways to configure and run cloudflare-updater:

- Interactive setup (recommended for first-time use)
- Non-interactive setup via environment variables (best for Docker/CI)

---

## 1) Interactive Setup (Recommended)

Use this once to select your zones, DNS records, and optional Access policies. The app will save an encrypted config so future runs can be headless.

### Option A: Run Locally

```bash
pnpm install
pnpm dev
```

Follow the prompts:

- Paste your Cloudflare API Token
- Pick your zone(s)
- Select A/AAAA records to auto-update
- Optional: enter Account ID, choose Access app(s) and policy(ies)
- Choose an update interval

The config is saved to `~/.cloudflare-updater/config.enc` (encrypted).

Start monitoring:

```bash
pnpm build
pnpm start
```

Press `q` to stop monitoring.

### Option B: Docker (Interactive)

```bash
docker run -it --rm \
  -e CF_ENCRYPTION_KEY="your-secret" \
  -v ~/.cloudflare-updater:/root/.cloudflare-updater \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

This writes `config.enc` to your host so future runs can be headless.

### Option C: Linux (Headless with screen)

Keep it running after you disconnect using `screen`:

```bash
# Prepare once
corepack enable
pnpm install --frozen-lockfile
pnpm dev           # creates ~/.cloudflare-updater/config.enc
pnpm build

# Start a screen session and run the updater
screen -S cloudflare-updater
pnpm start         # press q to stop
# Detach: Ctrl+A, then D

# Reattach later
screen -r cloudflare-updater

# Stop cleanly
# - In the app: q or Ctrl+C
# - Then type `exit` to close the screen shell
```

---

## 2) Non-Interactive Setup (Environment Variables)

Skip prompts by providing full config via environment variables. Ideal for servers and CI.

Required:

- `CF_API_TOKEN` – Cloudflare API Token
- `CF_ZONES` – JSON array of zones with selected record IDs

Optional:

- `CF_ACCOUNT_ID` – Needed if using Access policies
- `CF_ACCESS_POLICIES` – JSON array of app/policy IDs
- `CF_UPDATE_INTERVAL` – Minutes between checks (default: 5)
- `CF_EMAIL` – Only if your token requires an email

Example (Docker):

```bash
docker run -d --name cloudflare-updater \
  -e CF_API_TOKEN="..." \
  -e CF_ZONES='[{"zoneId":"<zone-id>","zoneName":"example.com","selectedRecordIds":["<record-id-a>","<record-id-aaaa>"]}]' \
  -e CF_ACCOUNT_ID="..." \
  -e CF_ACCESS_POLICIES='[{"appId":"<app-id>","appName":"My App","policyId":"<policy-id>","policyName":"Allow Home"}]' \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

Notes:

- `recordIds` is accepted as a synonym for `selectedRecordIds` in `CF_ZONES`.
- If you already have `config.enc`, you can mount it instead of using env vars:

```bash
docker run -d --name cloudflare-updater \
  -e CF_ENCRYPTION_KEY="your-secret" \
  -v ~/.cloudflare-updater:/root/.cloudflare-updater \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

---

## Getting IDs (Zone, Record, App, Policy)

Use the app interactively once:

- From the main menu, choose “Show configuration IDs” to print ready-to-copy JSON for `CF_ZONES`, `CF_ACCOUNT_ID`, and `CF_ACCESS_POLICIES`.
- You can also find zone and record IDs in the Cloudflare Dashboard/API.

---

## CI / GHCR

Docker images are pushed to GHCR with tags:

- Commit SHA
- `latest` (default branch)
- `pr-<number>` (pull requests)

You can run the published image using either the env-based config or a mounted `config.enc`.

---

## Mode Overview

Choose what fits your setup:

- Interactive locally (best for first setup)
- Docker interactive (writes config to host; then go headless)
- Docker headless via environment variables
- Linux bare-metal headless with `screen`

---

## Notifications (Discord & Slack)

Get instant alerts when your IP updates or fails. Set up optional Discord or Slack webhooks.

### Discord Webhook

1. Create a Discord server webhook:
   - Right-click channel → Edit channel → Integrations → Webhooks → New Webhook
   - Copy the Webhook URL

2. Set the environment variable:

   ```bash
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
   ```

3. Restart the app. Notifications will now post to Discord on every IP change or error.

### Slack Webhook

1. Create a Slack webhook:
   - Go to https://api.slack.com/apps → Create New App → From scratch
   - Enable Incoming Webhooks
   - Add New Webhook to Workspace and copy the URL

2. Set the environment variable:

   ```bash
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
   ```

3. Restart the app. Notifications will now post to Slack on every IP change or error.

### Docker with Notifications

```bash
docker run -d --name cloudflare-updater \
  -e CF_API_TOKEN="..." \
  -e CF_ZONES='[...]' \
  -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
  -e SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

Both Discord and Slack are optional—use whichever fits your workflow. Messages include:

- Zone/record or app/policy name
- Old and new IP
- Timestamp
- Error details (if update failed)
