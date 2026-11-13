# Checks in CI

The list and order of the checks is in [CLAUDE.md](../../CLAUDE.md). The workflows are in `.github/workflows/`: `test.yml`, `dist.yml`, wired together by `pr-checks.yml` for pull requests and `build.yml` for `master`.

Checks 1, 2, 3 and 7 run once on Linux (the `static` job of `test.yml`). The `test` job, which starts at the same time as `static`, runs 4, 5, 6 and the build of 8 on Linux, macOS and Windows; `dist.yml` does the rest of 8. The integration tests (5) are a step of the `test` job, so `required-checks` of `pr-checks.yml`, the one check that `master` requires, fails when they fail on any system ([integration-tests.md](integration-tests.md)).

Pull requests also run `fallow audit --base` (findings of the changed files), CodeQL, dependency review (high severity, GPL/AGPL licences denied) and OSV.

The decode-only ffmpeg has its own workflow, `ffmpeg.yml`, which `dist.yml` calls before packaging and `test.yml` calls before the end to end tests, which play what it decodes (the build is cached per system: a planning job on one Ubuntu runner builds only the systems without a cache, so nothing starts on macOS or Windows unless the source changed) ([ffmpeg-build.md](ffmpeg-build.md)).

How pull requests are rebased and released is in [releases.md](../release/releases.md).

`dist.yml` also runs `npm run test:updater` on the macOS runners after the smoke test of the packaged app: the own updater of macOS replaces the app bundle, which needs the packaged app ([updater.md](../app/updater.md)).

## Caches

The repository's cache is limited to 10 GiB, and GitHub evicts the oldest entries when it is full. The apt downloads of `test.yml` and `dist.yml` are saved under a key with the run id, so every run adds one, and a pull request writes caches that no other ref reads. `cache-cleanup.yml` deletes the caches of a pull request when it closes, and every day (and by hand) the caches of pull requests that are not open and all but the newest apt cache of each name and ref. A run that needs a deleted cache builds it again.

The `test` job keeps `.cache/vitest` (the transformed modules of Vitest, `fsModuleCachePath` in `vitest.config.ts`, about 11 MB) for each system, and the `static` job keeps `.cache/eslint` (`npm run lint`). Both are saved under a key with the commit and restored from the newest one with the same lock file, so a run only transforms or lints what changed; the daily cleanup keeps the newest of each name and ref.

On the `ubuntu-26.04` runner image apt failed with `Temporary failure resolving` for the Ubuntu mirrors while the mirrors were up. The Ubuntu test job prints the resolver, and when `archive.ubuntu.com` does not resolve it adds 1.1.1.1, 8.8.8.8 and 9.9.9.9 as DNS servers of `systemd-resolved` (or to `/etc/resolv.conf`) before apt runs. `dist.yml` and `pages.yml` have no such step yet.

## Reading a red run

- `npx tsx scripts/checks/ci-failure.ts <run id>` prints the failed jobs. It shows `UNKNOWN STEP` for the log lines and the step name in its first line (here `Integration tests`); `gh run view <run> --json jobs` lists each step with its conclusion.
- A failed step skips the ones after it in the same job: when `Integration tests` fails, `npm run build` and the end to end tests of that system did not run, so a green rest of the run says nothing about them.
- `required-checks` only reports that another job failed.
- Compare with `master` first (`gh run list --workflow pr-checks.yml`): it is red often, with failures that are not in the change (`unit-test-isolation` on macos-15-intel, the `vi.waitFor` of `electron/listeners/persistence.integration.test.ts` on windows-2025, which timed out waiting for a reply and passed on the other systems, see [#377](https://github.com/Koeroesi86/tunelle/issues/377)). Run the failed job again (`gh run rerun <run> --failed`) before changing code for a failure like that.
- `digest-mismatch: error` in the log of a test job is the cache restore and not the failure.
