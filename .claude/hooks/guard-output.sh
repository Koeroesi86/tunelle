#!/usr/bin/env bash
# PreToolUse (Bash): blocks reads and commands that put thousands of lines into the context.
# See docs/development/claude-usage.md. Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

CMD="$(jq -r '.tool_input.command // empty' <<<"$(cat)")"
MAX_LINES=300
MAX_BYTES=12000

deny() {
  echo "guard-output: blocked: $1" >&2
  exit 2
}

# a commit message may contain anything
case "$CMD" in
  git\ commit*) exit 0 ;;
esac

# so may the body of a heredoc, but not the rest of its command
CMD="$(awk '
  end != "" { line = $0; sub(/^\t+/, "", line); if (line == end) end = ""; next }
  { print }
  match($0, /(^|[^<])<<-?[[:space:]]*["\047\\]?[A-Za-z_][A-Za-z0-9_]*/) {
    end = substr($0, RSTART, RLENGTH); sub(/.*<<-?[[:space:]]*["\047\\]?/, "", end)
  }
' <<<"$CMD")"

BOUNDED='\|[[:space:]]*(tail|head|grep|wc|jq|sed -n)|[[:space:]]>[[:space:]]*[^&[:space:]]'
if [[ "$CMD" =~ (gh[[:space:]]+run[[:space:]]+view.*--log|gh[[:space:]]+pr[[:space:]]+diff|npm[[:space:]]+(ci|install))([[:space:]]|$) ]] && ! [[ "$CMD" =~ $BOUNDED ]]; then
  deny "this prints a whole log or diff; pipe it through 'tail -n 120' or 'grep', or use 'npx tsx scripts/checks/ci-failure.ts' for a failed run."
fi

SMALL='--(stat|numstat|shortstat|name-only|name-status|quiet|jq)([[:space:]=]|$)|[[:space:]]-q[[:space:]]'
if [[ "$CMD" =~ (git[[:space:]]+(show|diff)|gh[[:space:]]+issue[[:space:]]+view)([[:space:]]|$) ]] && ! [[ "$CMD" =~ $BOUNDED || "$CMD" =~ $SMALL ]]; then
  deny "this prints a whole diff, file or issue; add '--stat' or '--name-only', pipe it through 'head -n 120' or 'grep', or give a path to 'git diff'/'git show' and 'sed -n A,Bp'."
fi

while IFS= read -r segment; do
  segment="${segment#"${segment%%[![:space:]]*}"}"
  [[ "$segment" =~ ^cat[[:space:]] ]] || continue
  [[ "$segment" == *'>'* ]] && continue

  read -ra words <<<"$segment"
  files=()
  for word in "${words[@]:1}"; do
    [[ "$word" == -* || "$word" == '<'* ]] || files+=("$word")
  done

  [ "${#files[@]}" -gt 1 ] && deny "cat of several files; read what you need with 'grep -n' and 'sed -n A,Bp', or the Read tool with offset and limit."
  [[ "${files[0]:-}" == *'*'* ]] && deny "cat of a glob; read what you need with 'grep -n' and 'sed -n A,Bp'."
  [[ "$CMD" =~ $BOUNDED ]] && continue
  [ -f "${files[0]:-}" ] || continue
  [ "$(wc -l <"${files[0]}")" -le "$MAX_LINES" ] && [ "$(wc -c <"${files[0]}")" -le "$MAX_BYTES" ] ||
    deny "${files[0]} has over $MAX_LINES lines or $MAX_BYTES bytes; read the part you need with 'sed -n A,Bp' or the Read tool with offset and limit."
done < <(sed -E 's/(&&|\|\||[;|])/\n/g' <<<"$CMD")

exit 0
