---
name: verify-change
description: Run the checks the repository requires before a change counts as done (lint, fallow, typecheck, tests, build), verify the issue with verify-task, and report what ran and what did not. Trigger "verify", "verify change", "/verify-change".
model: sonnet
allowed-tools: Read, Bash, Skill
---

Run what `CLAUDE.md` requires before something is called done. The report feeds the Verification and **Not verified** sections of the pull request (`open-pr`).

## Checks
Changed files: `git diff --name-only origin/master...HEAD` and `git status --short`.

From the root run `npx tsx scripts/verify.ts`: lint, fallow, typecheck, test:coverage, security:electron and build in order, stopping at the first failure. It prints one line per check and the end of the output of the failed one; fix the failure and continue with `npx tsx scripts/verify.ts --from <check>`. Its last line lists what did not run.

- `npm run dist` packages the app for the current OS only; run it when packaging, `build/`, `scripts/` or `package.json` `build` changed, otherwise leave it to CI. After it, `npm run check:dist` and `npm run smoke:packaged` (with `xvfb-run` when there is no display).
- A change to UI or playback cannot be proven by the checks: say it was **Not run** by hand unless the app was started (`npm run dev`).
- Workflow change: the YAML must parse, and the matrix still covers Linux, macOS and Windows.
- Finally run the `verify-task` skill on the branch's issue and include its gaps. Skip with a note if no issue is found.

## Failures
- Find the cause; never skip a check, add `continue-on-error` or use `--no-verify`.
- A flaky test is fixed at the root (no dependence on machine speed or fixed sleeps), not retried.
- Fix lint with `npm run lint:fix`, never `prettier --write`; read `git diff` for hunks in code you did not change.

## Report
One list, nothing rounded up:
- **Ran and passed**: commands as run.
- **Ran and failed**: command and failure.
- **Not run**: command and reason (e.g. other platforms, audio output, `dist`).
- **Task** (`verify-task`): requirements Partial/Missing, or "all covered".

Also read the changed files once for behaviour a refactor or dependency swap lost, and say you did.
