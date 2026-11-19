#!/usr/bin/env bash
# SessionStart: tells Claude the branch, the uncommitted files and the pull request in one line, so the session does not spend calls to find out.
# See docs/development/claude-usage.md. Without git nothing is said.
set -euo pipefail

command -v jq >/dev/null 2>&1 && command -v git >/dev/null 2>&1 || exit 0

BRANCH="$(git branch --show-current 2>/dev/null || true)"
[ -n "$BRANCH" ] || exit 0
DIRTY="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"
AHEAD="$(git rev-list --count origin/master..HEAD 2>/dev/null || echo '?')"
PR="none"
if command -v gh >/dev/null 2>&1; then
  PR="$(timeout 5 gh pr view --json number,state -q '"#\(.number) \(.state)"' 2>/dev/null || echo none)"
fi

jq -n --arg text "Branch $BRANCH, $AHEAD commits ahead of origin/master, $DIRTY uncommitted files, pull request: $PR. 'npx tsx scripts/claude/context.ts [issue]' gives the issue, the checks and the changed files in one call. A search over many files goes to the Explore subagent (it runs on haiku), not to a series of greps here." \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $text}}'
