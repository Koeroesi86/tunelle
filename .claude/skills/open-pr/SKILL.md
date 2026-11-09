---
name: open-pr
description: Open a pull request for the current branch with the repository template filled in and what was tried by hand listed (CI-run checks are not). Trigger "open pr", "create pr", "/open-pr".
disable-model-invocation: true
model: sonnet
allowed-tools: Read, Bash
---

Open a pull request for the current branch, applying the rules of `CLAUDE.md` in this order.

## Before pushing
1. Refuse on `master`. The branch must come off `master` and hold one change; if more, say so and stop.
2. Changed files: `git diff --name-only origin/master...HEAD`.
3. Stacked on another branch: use it as `--base` and say so in "What and why".

## Body
Fill `.github/pull_request_template.md` section by section:
- **What and why**: a few sentences; `Closes #N` (`gh issue view N`) or the PR it is stacked on.
- **Changes**: one line each.
- **Behaviour changes**: what users of the app notice (UI, playback, library scanning, migrations, packaging); delete if none.
- **Verification**: what was tried by hand in the app, as run and seen. Do not list lint, fallow, typecheck, tests, build or dist: CI runs them on all three platforms.
- **Not verified**: what CI does not cover and was not tried by hand (audio output, a platform, a packaged build), with the reason; "nothing" only when everything was covered.
- **Not in this pull request**: limits and follow-ups with issue numbers.

Run missing checks first with `verify-change` unless told not to.

## Opening
1. Title = squash commit: imperative sentence, no prefix, no number.
2. `git push -u origin HEAD`; never push to `master`.
3. `gh pr create --base <base> --title ... --body-file <file>` with the body in the scratchpad directory; end it with the attribution line from the conversation, if any.
4. Do not merge or change repository settings.
5. Give the user the link and the Not verified list.

Never comment on the PR; when the change moves, update it with `gh pr edit --body-file`, keeping the template.
