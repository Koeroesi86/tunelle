#!/usr/bin/env bash
# PreToolUse (Read): blocks reading a whole text file of over 300 lines or 12000 bytes, as it is re-read on every later call.
# See docs/development/claude-usage.md. Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
FILE="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
RANGE="$(jq -r '(.tool_input.limit // .tool_input.offset // .tool_input.pages // .tool_input.allow_large // empty) | tostring' <<<"$INPUT")"
MAX_LINES=300
MAX_BYTES=12000

[ -z "$RANGE" ] && [ -f "$FILE" ] && grep -Iq . "$FILE" || exit 0
[ "$(wc -l <"$FILE")" -gt "$MAX_LINES" ] || [ "$(wc -c <"$FILE")" -gt "$MAX_BYTES" ] || exit 0

echo "guard-read: blocked: $FILE has over $MAX_LINES lines or $MAX_BYTES bytes; find the part with 'grep -n' and read it with offset and limit." >&2
exit 2
