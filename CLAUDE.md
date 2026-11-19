# Tunelle

Electron lossless audio player: main process in `electron/` (TypeScript, SQLite with `migrations/`), renderer in `client/` (React, Redux), build scripts in `scripts/`. The repository is a single package; the default branch is `master` and every change goes through a pull request.

## Checks

CI (`.github/workflows/`: `test.yml`, `dist.yml`, wired together by `pr-checks.yml` for pull requests and `build.yml` for `master`) runs these (in this order within a job): 1, 2, 3 and 7 once on Linux (the `static` job of `test.yml`), and beside it the rest on Linux, macOS and Windows (the `test` job runs 4, 5, 6 and the build of 8; on pull requests `dist.yml` also starts at once):

1. `npm run lint` (ESLint with Prettier; fix with `npm run lint:fix`, not `prettier --write`)
2. `npm run fallow` (dead code, unused dependencies and stale suppressions fail; complexity and duplication are reported)
3. `npm run typecheck`
4. `npm run test:coverage` (Vitest with coverage thresholds in `vitest.config.ts`, `--project backend` or `--project frontend` for one side with `npm test`)
5. `npm run test:integration` (Vitest project `integration`, `*.integration.test.ts` in `electron/` and `scripts/`: real SQLite, real files and the real ffmpeg without Electron, see [docs/development/integration-tests.md](docs/development/integration-tests.md); it runs after 4, on every system)
6. `npm run test:e2e` (Playwright in `e2e/`, run by `test.yml` on every system, after the build, with the Playwright report kept as an artifact: it starts the built `out/`, so `npm run build` first, and measures the audio the app sends out, see Testing the app)
7. `npm run security:electron` (Electronegativity on `electron/`, the baseline entries are justified in [docs/development/electron-security.md](docs/development/electron-security.md); fails on a finding that is not in `electronegativity-baseline.json`, `node scripts/checks/security-scan.js --update` after fixing one)
8. `npm run build`, then `npm run dist`, `npm run check:dist` (nothing that must not ship is in the package) and `npm run smoke:packaged` (the packaged app opens and answers; needs a display, `xvfb-run` on a headless Linux; `npm run smoke` does the same for `out/`)

A pull request runs the `test` and `dist` matrices on one Linux, one macOS and one Windows system only; `master`, releases and a pull request with the `full-ci` label run every system (docs/development/ci.md).

Pull requests also run `fallow audit --base`, CodeQL, dependency review and OSV (docs/development/ci.md). Pull requests with auto-merge on are rebased onto `master` one at a time (docs/release/releases.md).

`npx tsx scripts/checks/verify.ts` runs 1, 2, 3, 4, 5, 7 and the build of 8 in order and prints only the end of the failed check. A SessionStart hook puts Node 24 of nvm on `PATH` for Claude, so do not `export PATH` in a command.

## Rules by area

`.claude/rules/` holds the rules of an area, loaded when a file of it is read: tests and end to end tests ([unit tests](docs/development/unit-tests.md), [end to end tests](docs/development/end-to-end-tests.md)), the `tunelle://app` protocol ([docs/app/tunelle-protocol.md](docs/app/tunelle-protocol.md)), migrations ([docs/app/migrations.md](docs/app/migrations.md)), layout and accessibility ([responsive layout](docs/development/responsive-layout.md), [accessibility](docs/development/accessibility.md)) and releases ([releases](docs/release/releases.md), [Microsoft Store](docs/release/microsoft-store.md), [the `TUNELLE_` variables](docs/development/building.md)). `master` releases from `release.yml` only, and `version` of `package.json` is never edited by hand.

## Guards

Claude Code hooks (`.claude/hooks/`, wired in `.claude/settings.json`, tested in `.claude/hooks/claude-hooks.integration.test.ts`) block what the rules below forbid: `--no-verify`, `prettier --write`, `continue-on-error`, renaming `release.yml`, pushing to `master`, editing `version` of `package.json` or a migration that has shipped, and writing a comment block over 4 lines. `git push` and `gh pr create` run lint and typecheck first. `.github/workflows/workflows.test.ts` checks the workflow rules, and `pr-description.yml` fails a pull request without **Not verified:**.

## Context

Every call re-reads the whole session, so keep it small ([docs/development/claude-usage.md](docs/development/claude-usage.md)): one issue or pull request per session; read a part of a file (`grep -n`, `sed -n A,Bp`, Read with offset and limit), never `cat` several files; send a wide search or a long log to a subagent; run independent calls together; at a task boundary, or when a hook says the context is large, `/handoff` and `/clear`.

## Conventions

- The code of the app does not take a parameter, an option or a default only so that a test can replace it (`fetcher = fetch`, `now = Date.now`, `pause`, `random`, `gap`, a date that no caller passes, or a fallback for when Electron is not there): it calls `fetch`, `Date.now()`, `setTimeout`, `Math.random` and `utilityProcess` itself, and the test replaces the global (`vi.stubGlobal('fetch', …)`, `vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })` with `vi.setSystemTime`, `vi.spyOn(Math, 'random')`) or the module (`vi.mock('electron')`; the backend tests get a fake `utilityProcess` from `electron/test-utility-process.ts`). A wait is a `setTimeout` promise, as the fake timers do not cover `timers/promises`. A parameter that the app passes, or that the user sets (a `TUNELLE_` variable), is not a test seam.
- User-facing text goes in `shared/locales/en.json` (the complete source of truth) and is shown with `useTranslation()` in the renderer or `getMainTranslator()` in `electron/`, never written into a component; a new language is a `shared/locales/<tag>.json` that is added to `shared/locales/index.ts`, and a key it lacks shows the English text.
- Lint runs on TypeScript 6 through a hook in `eslint.config.js` while the compiler is TypeScript 7 ([docs/development/typescript-eslint.md](docs/development/typescript-eslint.md)).
- Data that crosses a boundary has a Zod schema and its type is inferred from it ([docs/development/validation.md](docs/development/validation.md)).
- No `any` or casts; fallow suppressions need a reason.
- Issues (`gh issue create`) follow the forms in `.github/ISSUE_TEMPLATE/` (`bug.yml`, `enhancement.yml`): the same sections as headings (Problem, then where it is in the code, the fix or what is wanted, and how to check it or the acceptance), with the `bug` or `enhancement` label.
- Workflow changes: actions stay on the major versions already used, with minimal `permissions`.
- The website (`site/`, plain HTML and CSS, `npm run site` shows it) describes the app, so a change that adds, removes or visibly changes a feature (a page, the player bar, radio, platform support, install steps) updates the matching section of `site/templates/index.html` and the strings of every language (`site/strings/`) in the same pull request, and the screenshots in `site/screenshots/` when what they show changed (retake them with `npm run screenshots`, do not edit them). Keep the Linux install steps in `docs/install.md` and on the page the same. Read [docs/development/website.md](docs/development/website.md) and [docs/development/screenshots.md](docs/development/screenshots.md) first.
- Explanations go in `docs/` (one Markdown file per topic, kebab-case, in `development/`, `release/` or `app/`, linked from `README.md` or this file), not in comments and not in the README. A comment block is at most 4 lines, in `electron/`, `client/`, `scripts/` and `.github/`; longer reasoning (history, trade-offs, platform quirks) goes in the matching doc and the comment says `See docs/<folder>/<file>.md`. The README stays a title, a short description and links. A change that alters documented behaviour updates the doc in the same pull request. Links are relative. `scripts/checks/docs-check.test.ts` checks the links, the unlinked docs and the comment length, and `guard-comments.sh` blocks a long comment at edit time.
- A finding that took a while to get to (a behaviour, a test setup, a CI failure, a measurement) is written into the matching doc in the same pull request, with the symptom, the cause and how to check it, so nobody has to debug it again; the comment in the code says `See docs/<folder>/<file>.md`.
