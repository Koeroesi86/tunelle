# Keeping the usage of Claude Code down

An analysis of 197 sessions (Oct 17 to Nov 9, 2026) showed where the usage goes, with approximate weights (cache read 0.1, one hour cache write 2, output 5, input 1):

- About 60% is cache reads: every call re-reads the whole context. The 5 longest sessions (400 to 1000 calls, up to 549K tokens of context) are about 38% of the total, and calls made at over 200K tokens of context about 29%.
- A session starts at about 41K tokens (system prompt, skills, connectors, `CLAUDE.md`, memory) that are re-read on every call.
- Tool output is small in comparison; the outliers were `cat` of several files (20 to 28K characters).
- About 30% of the output is thinking.

## What enforces it

All in `.claude/hooks/`, wired in `.claude/settings.json`, tested in `claude-hooks.test.ts`:

- `guard-output.sh` (PreToolUse, Bash) blocks `cat` of several files, of a glob or of a file over 300 lines, and a whole log or diff (`gh run view --log`, `gh pr diff`, `npm ci`, `npm install`) that is not piped through `tail`, `head`, `grep`, `wc`, `jq` or `sed -n`, or redirected. `npx tsx scripts/checks/ci-failure.ts` prints only what failed.
- `context-nudge.sh` (PostToolUse) says once at 150K and once at 250K tokens of context that the session should end. The count comes from the last `usage` of the transcript.
- `repeat-failure.sh` (PostToolUseFailure, Bash) says to stop after the same command fails 3 times in a row.

The `handoff` skill writes the 15 lines a new session needs. The skills that only the user starts (`open-pr`, `task-gaps`, `handoff`) have `disable-model-invocation: true`, so their descriptions are not in the context. `verify-change` and `verify-task` do not, as `open-pr` and `verify-change` call them.

## What is left to the user

Plugins and connectors that this repository does not use (`cloudflare`, Typefully, Claude Docs) add to the 41K of every session: turn them off in `~/.claude/settings.json` and in the claude.ai connector settings. A lower effort level for routine edits cuts thinking.
