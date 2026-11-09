#!/usr/bin/env bash
# PostToolUse: tells Claude once per level when the context of the session gets large, as every call re-reads it.
# See docs/development/claude-usage.md.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
TRANSCRIPT="$(jq -r '.transcript_path // empty' <<<"$INPUT")"
SESSION="$(jq -r '.session_id // empty' <<<"$INPUT")"
[ -f "$TRANSCRIPT" ] && [ -n "$SESSION" ] || exit 0

CONTEXT="$(tail -n 40 "$TRANSCRIPT" | jq -rs '[.[] | select(.type == "assistant" and .message.usage) | .message.usage] | last | ((.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))' 2>/dev/null || echo 0)"
STATE="${TMPDIR:-/tmp}/tunelle-claude-context"
mkdir -p "$STATE"

for LEVEL in 250000 150000; do
  [ "$CONTEXT" -ge "$LEVEL" ] || continue
  [ ! -e "$STATE/$SESSION-$LEVEL" ] || exit 0
  touch "$STATE/$SESSION-$LEVEL" "$STATE/$SESSION-150000"
  jq -n --arg text "The context of this session is $((CONTEXT / 1000))K tokens and every call re-reads it. Finish the current step, then tell the user to run /handoff and /clear before the next task." \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $text}}'
  exit 0
done

exit 0
