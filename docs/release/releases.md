# Releases

Releases come from `release.yml`: Monday and Thursday 06:00 UTC and by hand, from `master` only. A scheduled run skips when only docs or `.github/` changed since the latest `vYY.M.N` tag. The published release is what installed apps update from, see [updater.md](../app/updater.md). After every release it publishes it calls `store.yml`, see [microsoft-store.md](microsoft-store.md).

## The version (`scripts/release/version.js`)

The version is `YY.M.<run number>` (for example 26.10.14), stamped into `package.json` in the packaging job. Never edit `version` by hand.

- `node scripts/release/version.js` prints the version of a new release, from `GITHUB_RUN_NUMBER` and today.
- `node scripts/release/version.js --after <latest>` does the same, but fails when it is not greater than the latest release (empty: no release yet).
- `node scripts/release/version.js <version>` writes that version to `package.json`, so the package, `latest*.yml` and the release agree.

It is valid semver for electron-updater: no zero padded month and no prerelease part, which it would take for an update channel; and small enough for the numbers of a Windows file version. The plan job refuses a version that is not greater than the latest tag.

`release.yml` must not be renamed or recreated: its run number would restart, and the version with it.

## Pull requests and `master`

`master` requires up to date branches. Pull requests with auto-merge on are rebased onto `master` one at a time, the one whose auto-merge was enabled first (`rebase-auto-merge.yml`, `scripts/release/rebase-auto-merge.js`). It pushes with the `GH_REBASE_TOKEN` secret, as a push with `GITHUB_TOKEN` starts no checks.
