# Checks in CI

The list and order of the checks is in [CLAUDE.md](../../CLAUDE.md). The workflows are in `.github/workflows/`: `test.yml`, `dist.yml`, wired together by `pr-checks.yml` for pull requests and `build.yml` for `master`.

Checks 1, 2, 3 and 7 run once on Linux (the `static` job of `test.yml`). The `test` job, which starts at the same time as `static`, runs 4, 5, 6 and the build of 8 on Linux, macOS and Windows; `dist.yml` does the rest of 8. The integration tests (5) are a step of the `test` job, so `required-checks` of `pr-checks.yml`, the one check that `master` requires, fails when they fail on any system ([integration-tests.md](integration-tests.md)).

Pull requests also run `fallow audit --base` (findings of the changed files), CodeQL, dependency review (high severity, GPL/AGPL licences denied) and OSV.

The decode-only ffmpeg has its own workflow, `ffmpeg.yml`, which `dist.yml` calls before packaging and `test.yml` calls before the end to end tests, which play what it decodes (the build is cached per system: a planning job on one Ubuntu runner builds only the systems without a cache, so nothing starts on macOS or Windows unless the source changed) ([ffmpeg-build.md](ffmpeg-build.md)).

How pull requests are rebased and released is in [releases.md](../release/releases.md).

`dist.yml` also runs `npm run test:updater` on the macOS runners after the smoke test of the packaged app: the own updater of macOS replaces the app bundle, which needs the packaged app ([updater.md](../app/updater.md)).

## Systems on a pull request

A pull request runs one system of each kind: `ubuntu-latest`, `macos-15` (arm64) and `windows-2025` in `test.yml`, and the Flatpak on `ubuntu-latest`, `macos-15` and `windows-2025` in `dist.yml`. `master`, `release.yml` and a pull request with the `full-ci` label run all eight systems. The `plan` job of each workflow lists the systems as JSON with a `pr` flag, and drops the ones without it when the `full` input is `false`; `pr-checks.yml` passes `full` from the label, and starts again when a label is added or removed (a run in progress is cancelled by the concurrency group, so add the label before the checks matter). The Store package of arm64 (`certification-arm64`) is skipped without `full`, as its package is not built.

What a pull request does not run is the Ubuntu 22.04 AppImage (the glibc check of `npm run check:dist`), the arm64 systems and macOS on Intel, so a failure that is specific to one of them shows on `master` after the merge. Add `full-ci` to a change of the packaging, the updater, ffmpeg or code that differs by system or processor.

## Caches

The repository's cache is limited to 10 GiB, and GitHub evicts the oldest entries when it is full. The apt downloads of `test.yml` and `dist.yml` are saved under a key with the run id, so every run adds one, and a pull request writes caches that no other ref reads. `cache-cleanup.yml` deletes the caches of a pull request when it closes, and every day (and by hand) the caches of pull requests that are not open and all but the newest apt cache of each name and ref. A run that needs a deleted cache builds it again.

The `test` job keeps `.cache/vitest` (the transformed modules of Vitest, `fsModuleCachePath` in `vitest.config.ts`, about 11 MB) for each system, and the `static` job keeps `.cache/eslint` (`npm run lint`). Both are saved under a key with the commit and restored from the newest one with the same lock file, so a run only transforms or lints what changed; the daily cleanup keeps the newest of each name and ref.

On the `ubuntu-26.04` runner image apt failed with `Temporary failure resolving` for the Ubuntu mirrors while the mirrors were up. The Ubuntu test job prints the resolver, and when `archive.ubuntu.com` does not resolve it adds 1.1.1.1, 8.8.8.8 and 9.9.9.9 as DNS servers of `systemd-resolved` (or to `/etc/resolv.conf`) before apt runs. `dist.yml` and `pages.yml` have no such step yet.

## Slow runners

Symptom: `End to end tests` of `macos-15-intel` on `master` (16 November) ended with `The action 'End to end tests' has timed out after 20 minutes` after 36 of 48 tests had passed, and the report was not kept. That runner needs about 15 minutes for the end to end tests when it is fast (a test of the background work alone took 3.9 minutes), so 20 was one slow runner away from red.

Cause: the step limit sat close to the normal duration, and a killed step writes no Playwright report. The limits now are 40 minutes for the step, 20 for the integration tests and 75 for a `test` job; `globalTimeout` of `playwright.config.ts` (35 minutes on CI) stops Playwright first, so the report with the traces is still uploaded. A retry is not used on purpose, as it would hide a test that fails now and then.

How to check: a step that takes more than 35 minutes ends with `Timed out waiting 2100s for the entire test run` and an `e2e-report-<system>` artifact; `gh run view <run> --json jobs` has the start and end of each step.

The same holds for the update test of the packaged app on macOS (`updateTimeout` of `e2e/updater/updater.spec.ts`): `Dist (macos arm64)` of the pull request 416 run polled 7 minutes for the new version, the marker and the dropped backup, and ended with `version: undefined` (the bundle is swapped at that moment) while the step usually takes 7 to 12 minutes in all. The poll now waits 12 minutes, below the 15 minutes of a test of the `updater` project and the 45 minutes of the step in `dist.yml`.

`offline.spec.ts` ("starts and shows its pages without a network") failed on `macos-15-intel` in the same run: the radio page did not show `radio.offline.text` within the 15 seconds of `expect`. The message comes after the search of the stations failed in the main process, and that took longer on a slow runner (the test ended after 43 seconds, and the other 47 tests passed). That one assertion now waits 60 seconds. Use a longer `timeout` on the assertion that waits for the outcome of a request that fails, not a retry of the test.

`loudness.spec.ts` ("measures a track that is queued before the ones that come first in the library") failed on `ubuntu-22.04` after 4.8 seconds with `first?.queued` null, and it is a race, not a timeout: the test took the second track as the one that comes next, but on a fast runner the pass had already started it when `LOUDNESS_PRIORITISE` came. The test now writes six tracks and asks that the queued one is measured with at most three others done before it (without the queue, five are); a longer wait would not have changed it. Check it by taking the `LOUDNESS_PRIORITISE` line out of the test: it must fail with 5 where at most 3 are expected.

`gapless.spec.ts` (the AAC case) failed on `macos-15-intel` with `longestGap` 0.0232 s, one window of the probe, where 0 is expected; the FLAC and mp3 cases of the same run passed. One window is also what a player without gapless playback leaves at a change of track, so the limit cannot be raised without the test missing a real regression. A starved audio thread of a loaded runner gives such a window once, and a regression gives one at every change, which is why this file (not the project, where `retries` stays 0) retries twice on CI: it fails only when all three tries show a gap. The trace of the failed tries is kept (`retain-on-failure`), and the list reporter prints `flaky` for a test that passed on a retry, so a test that needs one often can be seen.

## Jobs that no runner takes

Symptom: a run stays `queued` for hours with one job that has no runner (`runner_id: null`, no steps) while the rest is green, for example `Dist (macos arm64)` of the release of 16 November. Hosted macOS jobs are normally picked up within seconds (the slowest of the last releases took about five minutes). GitHub documents a queue limit of 24 hours for self-hosted runners only, and a run cannot be expected to be run again while it is in progress, so a job at the end of the run cannot retry it, and the next release waits in the `release` concurrency group.

`retry-unstarted-jobs.yml` (`scripts/release/retry-unstarted-jobs.js`) looks at the runs of `pr-checks.yml`, `build.yml` and `release.yml` at minute 17 and 47 of every hour (not at the start of the hour, when GitHub delays scheduled runs). A run is stalled when every job that has not ended is `queued` with no runner for more than 15 minutes, so it is caught 15 to 45 minutes after it was queued; a running job, or one that waits for an approval, keeps it alone. A stalled run is cancelled, and when it has ended its failed jobs run again (`rerun-failed-jobs`, which takes the cancelled ones and what depends on them; the jobs that passed keep their result and the release keeps its version and plan). A job with `always()` (`required-checks` of `pr-checks.yml`) still runs after a cancel and needs a runner too, so when the run has not ended after a minute it is cancelled by force (`force-cancel`, which skips such jobs) before its jobs run again; if it does not end after that either, the job fails and the run stays cancelled. The jobs are read again just before the cancel, and a run with more jobs than one page lists is left alone. It does this once: a run that is on its third attempt is left, and so is one that was run again by hand twice. A job that ran and failed is never retried, and a run you cancelled by hand is not run again, as only a stalled one is cancelled. The job has `actions: write` and checks out nothing of a pull request.

The schedule alone was too slow: GitHub delays scheduled runs under load, and on 17 November the workflow ran twice in 15 hours (02:38 and 11:14 UTC, not every half hour), so a macOS job that had waited 51 minutes was caught only then. `watch-unstarted-jobs.yml` therefore starts when a run of `pr-checks.yml`, `build.yml` or `release.yml` is created (`workflow_run`, type `requested`, which is not delayed like a schedule) and runs `retry-unstarted-jobs.js <run id>`: every five minutes it reads that one run and does the same as the schedule, until the run has ended or was run again as often as allowed (a cancelled run ends it, so a newer push to a pull request ends the watch of the old run). It is its own run, so it is not cancelled with the run it watches, and it checks out the default branch, never the code of the pull request. A run that is run again starts a second watch of the same run, which waits in the concurrency group of the first and ends at once when the run is done. The schedule stays as the fallback. The watch uses one runner for up to the length of the run (the job limit is 180 minutes), mostly asleep.

How to check: `gh run list --workflow retry-unstarted-jobs.yml` and `--workflow watch-unstarted-jobs.yml`, and the log of a run says which run it ran again. `--workflow retry-unstarted-jobs.yml` by hand (`gh workflow run`) does the same at once; `node scripts/release/retry-unstarted-jobs.js <run id>` with `GH_TOKEN` and `GITHUB_REPOSITORY` watches one run.

## Reading a red run

- `npx tsx scripts/checks/ci-failure.ts <run id>` prints the failed jobs. It shows `UNKNOWN STEP` for the log lines and the step name in its first line (here `Integration tests`); `gh run view <run> --json jobs` lists each step with its conclusion.
- A failed step skips the ones after it in the same job: when `Integration tests` fails, `npm run build` and the end to end tests of that system did not run, so a green rest of the run says nothing about them.
- `required-checks` only reports that another job failed.
- Compare with `master` first (`gh run list --workflow pr-checks.yml`): it is red often, with failures that are not in the change (`unit-test-isolation` on macos-15-intel, the `vi.waitFor` of `electron/listeners/persistence.integration.test.ts` on windows-2025, which timed out waiting for a reply and passed on the other systems, see [#377](https://github.com/Koeroesi86/tunelle/issues/377)). Run the failed job again (`gh run rerun <run> --failed`) before changing code for a failure like that.
- `digest-mismatch: error` in the log of a test job is the cache restore and not the failure.
