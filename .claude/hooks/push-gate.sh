#!/usr/bin/env bash
# PreToolUse (Bash): before `git push` and `gh pr create` runs lint and typecheck, the cheap checks of CI, and blocks on a failure with the end of
# its output. On `gh pr create` it also reminds of the website when the app changed and site/ did not.
# Fails open when npm or jq is missing. Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

CMD="$(jq -r '.tool_input.command // empty' <<<"$(cat)")"
GIT_PUSH='(^|[;&|(][[:space:]]*)git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|$)'
PR_CREATE='(^|[;&|(][[:space:]]*)gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'

if ! [[ "$CMD" =~ $GIT_PUSH ]] && ! [[ "$CMD" =~ $PR_CREATE ]]; then
  exit 0
fi
command -v npm >/dev/null 2>&1 || exit 0

cd "${CLAUDE_PROJECT_DIR:-$PWD}"

for CHECK in lint typecheck; do
  if ! OUTPUT="$(npm run "$CHECK" 2>&1)"; then
    echo "push-gate: blocked: npm run $CHECK fails:" >&2
    tail -n 40 <<<"$OUTPUT" >&2
    exit 2
  fi
done

if [[ "$CMD" =~ $PR_CREATE ]]; then
  CHANGED="$(git diff --name-only origin/master...HEAD 2>/dev/null || true)"
  if grep -qE '^(client|electron|shared/locales)/' <<<"$CHANGED" && ! grep -q '^site/' <<<"$CHANGED"; then
    jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: "The app changed and site/ did not: if this adds, removes or visibly changes a feature, update the matching section of site/templates/index.html and site/strings/*.json (and retake the screenshots) in this pull request."}}'
  fi
fi

exit 0
