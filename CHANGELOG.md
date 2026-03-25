## [1.2.1](https://github.com/rouvenschandl/cloudflare-updater/compare/v1.2.0...v1.2.1) (2026-03-25)


### Bug Fixes

* **ip:** stabilize public IP detection using multi-source consensus ([2a59fc8](https://github.com/rouvenschandl/cloudflare-updater/commit/2a59fc83935854245370e71dad3419c0a08d9b13))
* remove unused esbuild and tsx dependencies from bun.lock ([f5e8e8d](https://github.com/rouvenschandl/cloudflare-updater/commit/f5e8e8db7e741ea1545264e738fe364273f80ff2))
* update dev and start scripts to use bun instead of tsx and node ([4fac6ab](https://github.com/rouvenschandl/cloudflare-updater/commit/4fac6abfb8674da1799462325b45fd459b4a869b))

# [1.2.0](https://github.com/rouvenschandl/cloudflare-updater/compare/v1.1.2...v1.2.0) (2026-03-24)


### Bug Fixes

* require API key and at least one of zones or access policies in loadEnvConfig ([b083755](https://github.com/rouvenschandl/cloudflare-updater/commit/b083755dffe3f9881fab76ae5971b61c8b670225))
* update API token permission message ([021d2ea](https://github.com/rouvenschandl/cloudflare-updater/commit/021d2ea83a41d3b17fe752f76ceee4aa7392c151))


### Features

* make DNS zones and records optional ([bcecc55](https://github.com/rouvenschandl/cloudflare-updater/commit/bcecc553fa16b0df4f59afcd0acb73ad052dc9a5))

## [1.1.2](https://github.com/rouvenschandl/cloudflare-updater/compare/v1.1.1...v1.1.2) (2026-03-23)


### Bug Fixes

* disable Docker image push in CI workflow ([c2651b3](https://github.com/rouvenschandl/cloudflare-updater/commit/c2651b3ccd6215af46e8de1efcfa9467b44bc6fe))

## [1.1.1](https://github.com/rouvenschandl/cloudflare-updater/compare/v1.1.0...v1.1.1) (2026-03-23)


### Bug Fixes

* ci docker push permissions ([6db77ce](https://github.com/rouvenschandl/cloudflare-updater/commit/6db77ce36c7b34b0517f9df0bd0286ce1ab6388e))

# [1.1.0](https://github.com/rouvenschandl/cloudflare-updater/compare/v1.0.0...v1.1.0) (2025-12-13)

### Features

- add Discord and Slack webhook notifications with TUI configuration ([1759ea9](https://github.com/rouvenschandl/cloudflare-updater/commit/1759ea91b2b91dd0e770aba556784ab0541587b8))

# 1.0.0 (2025-12-12)

### Bug Fixes

- **ci:** fix pnpm not available in ci ([c0d915c](https://github.com/rouvenschandl/cloudflare-updater/commit/c0d915c89c354191cc648bc50f274e952246fb46))
- **ci:** ghcr.io push token ([b25c94d](https://github.com/rouvenschandl/cloudflare-updater/commit/b25c94d8194c9e0b1bff84041d1646270308223a))
- **ci:** replace GITHUB_TOKEN with GHCR_TOKEN ([5fc7ed4](https://github.com/rouvenschandl/cloudflare-updater/commit/5fc7ed48fcdf51f622507679bc2eece69ac443bf))

### Features

- add Docker support and env-based configuration ([62e715d](https://github.com/rouvenschandl/cloudflare-updater/commit/62e715dabec25a226d82237849415a33d7474bfc))
- add multi-zone support with interactive menu ([865bf70](https://github.com/rouvenschandl/cloudflare-updater/commit/865bf70d882a2387026a035ba6de8a5aa65f0af3))
- add support for access ip bypass updates ([db6a880](https://github.com/rouvenschandl/cloudflare-updater/commit/db6a88003076d62256efce3165870b16cf73c14a))
- add TUI setup with API key management and public IP display ([0ec673a](https://github.com/rouvenschandl/cloudflare-updater/commit/0ec673a240aaab0b98cc541f1a67a50eaff1de0d))
- **ci:** add release action ([2522560](https://github.com/rouvenschandl/cloudflare-updater/commit/25225601c1ad739e6267c15fcb172a91a96ff62b))
- implement automatic DNS record monitoring and update system ([2eb5dda](https://github.com/rouvenschandl/cloudflare-updater/commit/2eb5dda3cf861588271bba962bd174510b7ee1c2))
