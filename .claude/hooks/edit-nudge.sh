#!/usr/bin/env bash
# PreToolUse (Bash): says once per session that a file edit through sed -i, python or a heredoc is cheaper with the Edit tool,
# as the script is part of the output that every later call re-reads. See docs/development/claude-usage.md.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
CMD="$(jq -r '.tool_input.command // empty' <<<"$INPUT")"
SESSION="$(jq -r '.session_id // empty' <<<"$INPUT")"
[ -n "$SESSION" ] || exit 0

[[ "$CMD" =~ (^|[;&|[:space:]])(sed[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-i|python3?[[:space:]]+(-I[[:space:]]+)?-([[:space:]]|$)) ]] || exit 0

STATE="${TMPDIR:-/tmp}/tunelle-claude-edit-nudge"
mkdir -p "$STATE"
[ ! -e "$STATE/$SESSION" ] || exit 0
touch "$STATE/$SESSION"

jq -n --arg text "A change to one file is cheaper with the Edit tool (after a Read with offset and limit) than with sed -i or a python script: the script stays in the context. Use the shell for the same change in many files." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $text}}'
