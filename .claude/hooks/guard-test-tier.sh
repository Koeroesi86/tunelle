#!/usr/bin/env bash
# PreToolUse (Edit, Write): blocks an end to end spec or integration test file without the reason for its tier.
# Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
FILE="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"
TSX="$PROJECT/node_modules/.bin/tsx"

# the names of the two tiers only, so that no other edit waits for tsx
case "$FILE" in
  *.spec.ts | *.integration.test.ts | *.integration.test.tsx) ;;
  *) exit 0 ;;
esac

[ -x "$TSX" ] || exit 0

if ! MESSAGE="$("$TSX" "$PROJECT/scripts/checks/test-tier-reason.ts" <<<"$INPUT" 2>&1)"; then
  echo "guard-test-tier: blocked: $MESSAGE. Choose the tier first: unit test what a unit test can cover, and if this file is needed, say why in that line (docs/development/unit-tests.md)." >&2
  exit 2
fi

exit 0
