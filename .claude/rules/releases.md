---
paths:
  - ".github/workflows/release.yml"
  - ".github/workflows/store.yml"
  - "scripts/release/**"
  - "package.json"
  - "docs/release/**"
---

# Releases

Releases come from `release.yml` (Monday and Thursday 06:00 UTC and by hand, from `master` only) and the published release is what installed apps update from. Never edit `version` of `package.json` by hand (`scripts/release/version.js` stamps `YY.M.<run number>` in the release workflow; no zero padded month and no prerelease part, electron-updater would take it for a channel), and `release.yml` must not be renamed or recreated (its run number would restart). A release goes to the Microsoft Store through `store.yml`, whose secrets are in the environment `microsoft-store` (limited to `master`, with no reviewer: an automatic run starts by itself). Read [docs/release/releases.md](docs/release/releases.md) and [docs/release/microsoft-store.md](docs/release/microsoft-store.md) before working on either. The `TUNELLE_` variables that the smoke and end to end tests set are in [docs/development/building.md](docs/development/building.md).
