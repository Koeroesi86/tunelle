#!/usr/bin/env bash
# PreToolUse (Edit, Write): blocks edits that CLAUDE.md forbids, with the way to do it instead.
# Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
FILE="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"

deny() {
  echo "guard-edit: blocked: $1" >&2
  exit 2
}

case "$FILE" in
  "$PROJECT"/package.json)
    # edits that touch the "version" line; the release workflow stamps it
    jq -e '[.tool_input.old_string, .tool_input.new_string] | map(. // "") | any(test("\"version\"[[:space:]]*:"))' <<<"$INPUT" >/dev/null \
      && deny "never edit version in package.json; scripts/release/version.js stamps it in the release workflow."
    CURRENT="$(jq -r '.version' "$FILE")"
    NEW="$(jq -r '.tool_input.content // empty' <<<"$INPUT" | jq -r '.version // empty' 2>/dev/null || true)"
    [ -z "$NEW" ] || [ "$NEW" = "$CURRENT" ] || deny "never edit version in package.json; scripts/release/version.js stamps it in the release workflow."
    ;;
  "$PROJECT"/migrations/*.sql)
    if jq -e --arg name "$(basename "$FILE")" 'has($name)' "$PROJECT/electron/migrations-checksums.json" >/dev/null 2>&1; then
      deny "$(basename "$FILE") has shipped; add a new migration with the next number instead (and its line in electron/migrations-checksums.json)."
    fi
    ;;
esac

exit 0
