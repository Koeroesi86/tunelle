#!/usr/bin/env bash
# PostToolUseFailure (Bash): tells Claude to stop retrying a command that failed 3 times in a row.
# See docs/development/claude-usage.md.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
SESSION="$(jq -r '.session_id // empty' <<<"$INPUT")"
[ -n "$SESSION" ] || exit 0

SUM="$(jq -r '.tool_input.command // empty' <<<"$INPUT" | cksum | cut -d' ' -f1)"
STATE="${TMPDIR:-/tmp}/tunelle-claude-context"
FILE="$STATE/$SESSION-failure"
mkdir -p "$STATE"

COUNT=1
[ -f "$FILE" ] && [ "$(cut -d' ' -f1 "$FILE")" = "$SUM" ] && COUNT=$(($(cut -d' ' -f2 "$FILE") + 1))
echo "$SUM $COUNT" >"$FILE"

[ "$COUNT" -ge 3 ] || exit 0
jq -n '{hookSpecificOutput: {hookEventName: "PostToolUseFailure", additionalContext: "This command failed 3 times in a row. Stop retrying it: read the error, find the cause, and change the command or the code."}}'
