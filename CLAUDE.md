# Tunelle

Electron lossless audio player: main process in `electron/` (TypeScript, SQLite with `migrations/`), renderer in `client/` (React, Redux), build scripts in `scripts/`. The repository is a single package; the default branch is `master` and every change goes through a pull request.

## Checks

CI (`.github/workflows/`: `test.yml`, `dist.yml`, wired together by `pr-checks.yml` for pull requests and `build.yml` for `master`) runs these in this order: 1, 2, 3 and 6 once on Linux (the `static` job of `test.yml`), then the rest on Linux, macOS and Windows (the `test` job, which needs `static`, runs 4, 5 and the build of 7):

1. `npm run lint` (ESLint with Prettier; fix with `npm run lint:fix`, not `prettier --write`)
2. `npm run fallow` (dead code, unused dependencies and stale suppressions fail; complexity and duplication are reported)
3. `npm run typecheck`
4. `npm run test:coverage` (Vitest with coverage thresholds in `vitest.config.ts`, `--project backend` or `--project frontend` for one side with `npm test`)
5. `npm run test:e2e` (Playwright in `e2e/`, run by `test.yml` on every system, after the build, with the Playwright report kept as an artifact: it starts the built `out/`, so `npm run build` first, and measures the audio the app sends out, see Testing the app)
6. `npm run security:electron` (Electronegativity on `electron/`; fails on a finding that is not in `electronegativity-baseline.json`, `node scripts/checks/security-scan.js --update` after fixing one)
7. `npm run build`, then `npm run dist`, `npm run check:dist` (nothing that must not ship is in the package) and `npm run smoke:packaged` (the packaged app opens and answers; needs a display, `xvfb-run` on a headless Linux; `npm run smoke` does the same for `out/`)

Pull requests also run `fallow audit --base`, CodeQL, dependency review and OSV (docs/development/ci.md). Pull requests with auto-merge on are rebased onto `master` one at a time (docs/release/releases.md).

Releases come from `release.yml` (Monday and Thursday 06:00 UTC and by hand, from `master` only) and the published release is what installed apps update from. Never edit `version` of `package.json` by hand (`scripts/release/version.js` stamps `YY.M.<run number>` in the release workflow; no zero padded month and no prerelease part, electron-updater would take it for a channel), and `release.yml` must not be renamed or recreated (its run number would restart). A release goes to the Microsoft Store through `store.yml`, whose secrets are in the environment `microsoft-store` (limited to `master`, with no reviewer: an automatic run starts by itself). Read [docs/release/releases.md](docs/release/releases.md) and [docs/release/microsoft-store.md](docs/release/microsoft-store.md) before working on either. The `TUNELLE_` variables that the smoke and end to end tests set are in [docs/development/building.md](docs/development/building.md).

`npx tsx scripts/checks/verify.ts` runs 1, 2, 3, 4, 6 and the build of 7 in order and prints only the end of the failed check. A SessionStart hook puts Node 24 of nvm on `PATH` for Claude.

## Guards

Claude Code hooks (`.claude/hooks/`, wired in `.claude/settings.json`, tested in `scripts/checks/claude-hooks.test.ts`) block what the rules below forbid: `--no-verify`, `prettier --write`, `continue-on-error`, renaming `release.yml`, pushing to `master`, editing `version` of `package.json` or a migration that has shipped, and writing a comment block over 4 lines. `git push` and `gh pr create` run lint and typecheck first. `scripts/workflows.test.js` checks the workflow rules, and `pr-description.yml` fails a pull request without **Not verified:**.

## Conventions

- Testing the app (`e2e/`, Playwright with `_electron`, `npm run test:e2e` after `npm run build`): assert on the audio the app sends out with `e2e/support/audio.ts`, never on a sleep, select by the English text of `shared/locales/en.json`, and branch on `process.platform` in the test, with the reason, for what differs by system. Read [docs/development/end-to-end-tests.md](docs/development/end-to-end-tests.md) before writing one.
- The renderer reaches the main process data and the page itself through the `tunelle://app` protocol, not through a port. A handler never throws into the main process: an error of a stream ends that stream (`pipeline`, not `pipe`), as an unhandled one opens a blocking error dialog ([docs/app/tunelle-protocol.md](docs/app/tunelle-protocol.md)).
- A test next to the code (`name.test.ts`) that fails without the change; no fixed sleeps.
- The code of the app does not take a parameter, an option or a default only so that a test can replace it (`fetcher = fetch`, `now = Date.now`, `pause`, `random`, `gap`, a date that no caller passes, or a fallback for when Electron is not there): it calls `fetch`, `Date.now()`, `setTimeout`, `Math.random` and `utilityProcess` itself, and the test replaces the global (`vi.stubGlobal('fetch', …)`, `vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })` with `vi.setSystemTime`, `vi.spyOn(Math, 'random')`) or the module (`vi.mock('electron')`; the backend tests get a fake `utilityProcess` from `electron/test-utility-process.ts`). A wait is a `setTimeout` promise, as the fake timers do not cover `timers/promises`. A parameter that the app passes, or that the user sets (a `TUNELLE_` variable), is not a test seam.
- A new migration goes in `migrations/` as `NNN-name.sql` with the next number. Do not edit one that has shipped (`electron/migrations.checksums.test.ts` fails on it; a new migration gets its line in `electron/migrations-checksums.json`). Numbers start at 1 with no gap. Read [docs/app/migrations.md](docs/app/migrations.md) before adding one.
- User-facing text goes in `shared/locales/en.json` (the complete source of truth) and is shown with `useTranslation()` in the renderer or `getMainTranslator()` in `electron/`, never written into a component; a new language is a `shared/locales/<tag>.json` that is added to `shared/locales/index.ts`, and a key it lacks shows the English text.
- No `any` or casts; fallow suppressions need a reason.
- Workflow changes: actions stay on the major versions already used, with minimal `permissions`.
- The website (`site/`, plain HTML and CSS, `npm run site` shows it) describes the app, so a change that adds, removes or visibly changes a feature (a page, the player bar, radio, platform support, install steps) updates the matching section of `site/index.html` in the same pull request, and the screenshots in `site/screenshots/` when what they show changed (retake them with `npm run screenshots`, do not edit them). Keep the Linux install steps in `docs/install.md` and on the page the same. Read [docs/development/website.md](docs/development/website.md) and [docs/development/screenshots.md](docs/development/screenshots.md) first.
- Explanations go in `docs/` (one Markdown file per topic, kebab-case, in `development/`, `release/` or `app/`, linked from `README.md` or this file), not in comments and not in the README. A comment block is at most 4 lines, in `electron/`, `client/`, `scripts/` and `.github/`; longer reasoning (history, trade-offs, platform quirks) goes in the matching doc and the comment says `See docs/<folder>/<file>.md`. The README stays a title, a short description and links. A change that alters documented behaviour updates the doc in the same pull request. Links are relative. `scripts/docs-check.test.js` checks the links, the unlinked docs and the comment length, and `guard-comments.sh` blocks a long comment at edit time.
