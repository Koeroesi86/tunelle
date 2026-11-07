# Checks in CI

The list and order of the checks is in [CLAUDE.md](../../CLAUDE.md). The workflows are in `.github/workflows/`: `test.yml`, `dist.yml`, wired together by `pr-checks.yml` for pull requests and `build.yml` for `master`.

Checks 1, 2, 3 and 6 run once on Linux (the `static` job of `test.yml`). The `test` job, which needs `static`, runs 4, 5 and the build of 7 on Linux, macOS and Windows; `dist.yml` does the rest of 7.

Pull requests also run `fallow audit --base` (findings of the changed files), CodeQL, dependency review (high severity, GPL/AGPL licences denied) and OSV.

How pull requests are rebased and released is in [releases.md](../release/releases.md).

`dist.yml` also runs `npm run test:updater` on the macOS runners after the smoke test of the packaged app: the own updater of macOS replaces the app bundle, which needs the packaged app ([updater.md](../app/updater.md)).
