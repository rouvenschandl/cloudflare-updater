# Cloudflare Updater Tutorial

This guide shows two ways to configure and run cloudflare-updater:

- Interactive setup (recommended for first-time use)
- Non-interactive via environment variables (Docker/CI)

## 1) Interactive Setup

Run the app locally or in Docker with an interactive terminal. It will guide you through selecting your zones, DNS records and (optionally) Access policies.

### Local

```bash
pnpm install
pnpm dev
```

Follow the prompts:

- Paste your Cloudflare API Token
- Pick your zone(s)
- Select A/AAAA records to auto-update
- Optionally: enter Account ID, choose Access app(s) and policy(ies)
- Choose an update interval

When done, the configuration is saved to `~/.cloudflare-updater/config.enc` (encrypted). Start monitoring:

```bash
pnpm build
pnpm start
```

Press `q` to stop monitoring.

### Docker (interactive)

```bash
docker run -it --rm \
  -e CF_ENCRYPTION_KEY="your-secret" \
  -v ~/.cloudflare-updater:/root/.cloudflare-updater \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

This writes `config.enc` to your host so subsequent runs can be headless.

## 2) Non-Interactive via Environment Variables

Skip prompts by providing full config via env vars. This is ideal for servers and CI.

Required:

- `CF_API_TOKEN` – Cloudflare API Token
- `CF_ZONES` – JSON array of zones with selected record IDs

Optional:

- `CF_ACCOUNT_ID` – Needed if using Access policies
- `CF_ACCESS_POLICIES` – JSON array of app/policy IDs
- `CF_UPDATE_INTERVAL` – Minutes between checks (default 5)
- `CF_EMAIL` – Only if your token requires email

Example:

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
- If you previously saved `config.enc`, you can mount it instead of envs:

```bash
docker run -d --name cloudflare-updater \
  -e CF_ENCRYPTION_KEY="your-secret" \
  -v ~/.cloudflare-updater:/root/.cloudflare-updater \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

## Getting Zone, Record, App and Policy IDs

Use the app once interactively to view all IDs:

- From the main menu choose "Show configuration IDs" to print ready-to-copy JSON snippets for `CF_ZONES`, `CF_ACCOUNT_ID`, `CF_ACCESS_POLICIES`.
- Alternatively, the Cloudflare Dashboard/API shows zone and record IDs.

## CI / GHCR

Images are built and pushed to GHCR with tags:

- Commit SHA
- `latest` on default branch
- `pr-<number>` for PRs

You can pull and run the published image with either the env-based config or a mounted `config.enc`.
