# Cloudflare Updater

Keeps your Cloudflare DNS A/AAAA records and optional Zero Trust Access policies in sync with your changing public IP.

- Automatic monitoring loop with clear terminal output
- Interactive setup with zone/record selection
- Headless Docker/CI mode via environment variables

Quick start (Docker, env-based config):

```bash
docker run -d --name cloudflare-updater \
  -e CF_API_TOKEN="..." \
  -e CF_ZONES='[{"zoneId":"<zone-id>","zoneName":"example.com","selectedRecordIds":["<record-id-a>","<record-id-aaaa>"]}]' \
  ghcr.io/rouvenschandl/cloudflare-updater:latest
```

For a complete guide (interactive setup, IDs, Access policies, CI), see [docs/TUTORIAL.md](docs/TUTORIAL.md).

## Configuration Options (env)

- CF_API_TOKEN: Cloudflare API token (required)
- CF_ZONES: JSON array of zones with selected record IDs (required)
- CF_ACCOUNT_ID: Account ID (optional; needed for Access policies)
- CF_ACCESS_POLICIES: JSON array of app/policy IDs (optional)
- CF_UPDATE_INTERVAL: Minutes between checks (optional, default 5)
- CF_EMAIL: Email if your token requires it (optional)

Tips:

- `recordIds` is accepted as a synonym for `selectedRecordIds` in CF_ZONES
- To manage config via file instead, use interactive setup once and mount `~/.cloudflare-updater/config.enc` in Docker

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on commit conventions, development workflow, and code style.
