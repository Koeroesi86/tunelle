# Checks in CI

The list and order of the checks is in [CLAUDE.md](../../CLAUDE.md). The workflows are in `.github/workflows/`: `test.yml`, `dist.yml`, wired together by `pr-checks.yml` for pull requests and `build.yml` for `master`.

Checks 1, 2, 3 and 7 run once on Linux (the `static` job of `test.yml`). The `test` job, which starts at the same time as `static`, runs 4, 5, 6 and the build of 8 on Linux, macOS and Windows; `dist.yml` does the rest of 8. The integration tests (5) are a step of the `test` job, so `required-checks` of `pr-checks.yml`, the one check that `master` requires, fails when they fail on any system ([integration-tests.md](integration-tests.md)).

Pull requests also run `fallow audit --base` (findings of the changed files), CodeQL, dependency review (high severity, GPL/AGPL licences denied) and OSV.

The decode-only ffmpeg has its own workflow, `ffmpeg.yml`, which `dist.yml` calls before packaging and `test.yml` calls before the end to end tests, which play what it decodes (the second call names its artifacts `test-ffmpeg-…`, as a run takes an artifact name once; the build is cached, so the wait is short unless the source changed) ([ffmpeg-build.md](ffmpeg-build.md)).

How pull requests are rebased and released is in [releases.md](../release/releases.md).

`dist.yml` also runs `npm run test:updater` on the macOS runners after the smoke test of the packaged app: the own updater of macOS replaces the app bundle, which needs the packaged app ([updater.md](../app/updater.md)).
