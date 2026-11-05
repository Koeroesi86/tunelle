#!/usr/bin/env bash
# PreToolUse (Edit, Write): blocks a comment block over the limit of CLAUDE.md; the explanation goes in docs/.
# Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
FILE="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"
TSX="$PROJECT/node_modules/.bin/tsx"

[ -x "$TSX" ] || exit 0
TEXT="$(jq -r '.tool_input.new_string // .tool_input.content // empty' <<<"$INPUT")"

[ -n "$FILE" ] && [ -n "$TEXT" ] || exit 0

if ! MESSAGE="$(printf '%s\n' "$TEXT" | "$TSX" "$PROJECT/scripts/checks/docs-check.ts" "$FILE" 2>&1)"; then
  echo "guard-comments: blocked: $MESSAGE. Keep a comment to 4 lines, put the reasoning in a file of docs/ and write 'See docs/<folder>/<file>.md'." >&2
  exit 2
fi

exit 0
