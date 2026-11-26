# Keeping the usage of Claude Code down

An analysis of 197 sessions (Oct 17 to Nov 9, 2026) showed where the usage goes, with approximate weights (cache read 0.1, one hour cache write 2, output 5, input 1):

- About 60% is cache reads: every call re-reads the whole context. The 5 longest sessions (400 to 1000 calls, up to 549K tokens of context) are about 38% of the total, and calls made at over 200K tokens of context about 29%.
- A session starts at about 41K tokens (system prompt, skills, connectors, `CLAUDE.md`, memory) that are re-read on every call.
- Tool output is small in comparison; the outliers were `cat` of several files (20 to 28K characters).
- About 30% of the output is thinking.

A second analysis of 110 sessions (Nov 9 to 19, 5052 calls, 88M weighted tokens) after the hooks below: calls over 200K tokens of context fell to 7% (longest context 315K), but the start context grew to 45K and, re-read on every call, is about 26% of the total. The 5 longest sessions are still 32%. 161 tool results of over 8K characters (1.9M characters) were unbounded `git show`, `git diff`, `gh issue view` and whole-file Reads of files of 500 lines. Thinking is probably about 60% of the output; its text is redacted in the transcript, so this is an estimate. Run the analysis again with the transcripts in `~/.claude/projects/` (`usage` of every `assistant` entry; ids repeat per content block, count each once).

## Reads that filled the context (Nov 24 to 26, 2026)

The symptom: sessions were summarized after about half as many calls. The mean growth of the context per call rose from 1.4K tokens (Nov 9 to 19) to 2.5K, and results of 8K characters or more from 3% to 10% of the tool calls (40% of the result text). The cause: dense files that a limit in lines lets through (a doc of 212 lines and 33K characters, read whole again and again), chains of `sed -n` and `grep`, and docs that only grew. Hence the limits in bytes, the cap of the Bash output and the limit of 12,000 characters for a doc (`scripts/checks/docs-check.ts`). The nudge at 200K never showed, as the summary came first. Check with `usage.ts`: the growth per call and the number of automatic compactions.

## What enforces it

All in `.claude/hooks/`, wired in `.claude/settings.json`, tested in `claude-hooks.integration.test.ts`:

- `guard-output.sh` (PreToolUse, Bash) blocks `cat` of several files, of a glob or of a file over 300 lines or 12,000 bytes, and a whole log, diff or issue (`gh run view --log`, `gh pr diff`, `git show`, `git diff`, `gh issue view`, `npm ci`, `npm install`) that is not piped through `tail`, `head`, `grep`, `wc`, `jq` or `sed -n`, redirected, or (for `git`) limited with `--stat`, `--name-only` or `--name-status`. `npx tsx scripts/checks/ci-failure.ts` prints only what failed.
- `guard-read.sh` (PreToolUse, Read) blocks reading a whole text file of over 300 lines or 12,000 bytes; give `offset` and `limit`. `guard-output.sh` skips the body of a heredoc, not the rest of its command.
- `edit-nudge.sh` (PreToolUse, Bash) says once per session that a change to one file is cheaper with the Edit tool than with `sed -i` or a `python3 -` script, whose text stays in the context (about 200 such calls in the second analysis; it does not block, as Edit needs a Read first).
- `session-state.sh` (SessionStart) puts the branch, the commits ahead, the uncommitted files and the pull request into the context in one line, so the session does not spend its first calls on `git status` and `gh pr view`.
- `context-nudge.sh` (PostToolUse) says once at 120K and once at 160K tokens of context that the session should end. The count comes from the last `usage` of the transcript.
- `repeat-failure.sh` (PostToolUseFailure, Bash) says to stop after the same command fails 3 times in a row.

The `handoff` skill writes the 15 lines a new session needs. The skills that only the user starts (`open-pr`, `task-gaps`, `handoff`) have `disable-model-invocation: true`, so their descriptions are not in the context. `verify-change` and `verify-task` do not, as `open-pr` and `verify-change` call them.

## Settings and rules

- `env` in `.claude/settings.json`: `CLAUDE_CODE_SUBAGENT_MODEL=haiku` (subagents are for searches and logs, which a small model does as well; the `session-state.sh` line points at the Explore agent, which was used 6 times in 110 sessions) and `CLAUDE_CODE_AUTO_COMPACT_WINDOW=220000` (a session that goes on is summarized automatically before the window is full, at 187K to 195K tokens, so the last nudge is at 160K; the summary loses detail, so end the session at the nudge when you can).
- `bashOutputMaxChars: 10000`: a longer output of Bash is saved to a file and Claude gets a preview. It bounds what the guards can not tell from a command (chains of `sed -n`, `grep`).
- `disableClaudeAiConnectors` and `skillOverrides` keep connectors and skills that this repository does not use out of the start context; a skill set to `user-invocable-only` still runs when typed. Plugin skills are not affected by `skillOverrides`.
- `.claude/rules/` (`tests`, `protocol`, `migrations`, `client`, `releases`) hold the rules that only matter in one area, with `paths` so that they load when a file of it is read; `CLAUDE.md` keeps one line with the links. This took `CLAUDE.md` from 11.4 to 8.4 KB, about 750 tokens on every call. A rule loads on a read, not on a new file, so the hooks stay the guard for what must not be missed (`version`, `release.yml`, migrations that shipped).

## Scripts and the skill

Deterministic scripts in `scripts/claude/` (unit tested next to them) give in one call what took several, each with a bounded output:

- `npx tsx scripts/claude/usage.ts [--since YYYY-MM-DD] [--top N]`: this analysis from the transcripts in `~/.claude/projects/` (cost per day, the share of cache reads, writes and output, of calls over 200K tokens and of the costliest sessions, the start context, the growth of the context per call, the compactions and the largest tool results with the command). Run it after a change to a guard to see what it did.
- `npx tsx scripts/claude/context.ts [issue]`: the branch, the pull request with the state of its checks, the issue it closes (title and the start of each section, at most 60 lines; the number comes from the argument, the pull request or the branch name) and the changed files against `origin/master`.
- `npx tsx scripts/claude/test-failure.ts [vitest arguments]`: `vitest run` with only the totals and, for each failed test, its name and the first 8 lines of its message. For one test file or project; `scripts/checks/verify.ts` stays for the whole chain.
- `npx tsx scripts/claude/handoff.ts <file> --next … --decisions … --unverified …`: used by the `handoff` skill (which runs on `haiku`, as it only supplies three lines) to write the 15 lines with the facts from git and gh.

Not done: denying `export PATH=…` (the 24 of Nov 17 are the only ones after Nov 9, and a worktree outside the repository does not get the path of `session-node.sh`).

## What is left to the user

Plugins and synced skills (`anthropic-skills:*`) that this repository does not use add to the start context of every session: turn them off in `~/.claude/settings.json` and in the claude.ai settings. A lower effort level for routine edits cuts thinking.
