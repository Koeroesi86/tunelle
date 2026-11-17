# Releases

Releases come from `release.yml`: Monday and Thursday 06:00 UTC and by hand, from `master` only. A scheduled run skips when only docs or `.github/` changed since the latest `vYY.M.N` tag. The published release is what installed apps update from, see [updater.md](../app/updater.md). After every release it publishes it calls `store.yml`, see [microsoft-store.md](microsoft-store.md). Each release carries a short summary of its changes, see [release-notes.md](release-notes.md). A job of a release that no runner takes is run again by `watch-unstarted-jobs.yml` (and `retry-unstarted-jobs.yml` on a schedule), see [ci.md](../development/ci.md#jobs-that-no-runner-takes).

## The version (`scripts/release/version.js`)

The version is `YY.M.<run number>` (for example 26.10.14), stamped into `package.json` in the packaging job. Never edit `version` by hand.

- `node scripts/release/version.js` prints the version of a new release, from `GITHUB_RUN_NUMBER` and today.
- `node scripts/release/version.js --after <latest>` does the same, but fails when it is not greater than the latest release (empty: no release yet).
- `node scripts/release/version.js <version>` writes that version to `package.json`, so the package, `latest*.yml` and the release agree.

It is valid semver for electron-updater: no zero padded month and no prerelease part, which it would take for an update channel; and small enough for the numbers of a Windows file version. The plan job refuses a version that is not greater than the latest tag.

`release.yml` must not be renamed or recreated: its run number would restart, and the version with it.

## Pull requests and `master`

`master` requires up to date branches. Pull requests with auto-merge on are rebased onto `master` one at a time: only the one whose auto-merge was enabled first is looked at, and it is rebased when it is behind (`rebase-auto-merge.yml`, `scripts/release/rebase-auto-merge.js`). The ones after it wait until it merges or its auto-merge is turned off, also when its checks fail or it has a conflict, so that the author fixes it first. The state of the checks is not looked at. It pushes with the `GH_REBASE_TOKEN` secret, as a push with `GITHUB_TOKEN` starts no checks.

A pull request of a stack cannot get auto-merge while its base is another pull request. The `automerge` label asks for squash auto-merge instead: `automerge-label.yml` (`scripts/release/automerge-label.js`) turns it on for the open pull requests to `master` that have the label, are not drafts and are not from a fork. It runs when a pull request is opened, marked ready, labeled or has its base edited, when `master` moves and when the checks of a pull request end, so it also catches a pull request whose base became `master` after the one below it merged (the docs of GitHub do not say which event that retarget sends, and a push to `master` can come before it, hence the last two). Removing the label turns auto-merge off. The rebase of `rebase-auto-merge.yml` then takes over, and both use `GH_REBASE_TOKEN`, as auto-merge turned on with `GITHUB_TOKEN` starts no workflow. There is no schedule, a run missed by an event is started by hand (`workflow_dispatch`).

## Signature of the macOS update file

`release.yml` signs the merged `latest-mac.yml` with the secret `UPDATE_SIGNING_KEY` of the environment `release` and uploads `latest-mac.yml.sig` with it; the macOS app installs nothing without a valid signature, see [updater.md](../app/updater.md). Without the secret the release goes out unsigned and macOS apps stay on their version.
