#!/usr/bin/env bash
# PreToolUse (Bash): blocks reads and commands that put thousands of lines into the context.
# See docs/development/claude-usage.md. Exit 2 sends the message on stderr to Claude.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

CMD="$(jq -r '.tool_input.command // empty' <<<"$(cat)")"
MAX_LINES=300

deny() {
  echo "guard-output: blocked: $1" >&2
  exit 2
}

# a commit message or a heredoc may contain anything
case "$CMD" in
  git\ commit* | *'<<'*) exit 0 ;;
esac

BOUNDED='\|[[:space:]]*(tail|head|grep|wc|jq|sed -n)|[[:space:]]>[[:space:]]*[^&[:space:]]'
if [[ "$CMD" =~ (gh[[:space:]]+run[[:space:]]+view.*--log|gh[[:space:]]+pr[[:space:]]+diff|npm[[:space:]]+(ci|install))([[:space:]]|$) ]] && ! [[ "$CMD" =~ $BOUNDED ]]; then
  deny "this prints a whole log or diff; pipe it through 'tail -n 120' or 'grep', or use 'npx tsx scripts/checks/ci-failure.ts' for a failed run."
fi

while IFS= read -r segment; do
  segment="${segment#"${segment%%[![:space:]]*}"}"
  [[ "$segment" =~ ^cat[[:space:]] ]] || continue
  [[ "$segment" == *'>'* ]] && continue

  read -ra words <<<"$segment"
  files=()
  for word in "${words[@]:1}"; do
    [[ "$word" == -* ]] || files+=("$word")
  done

  [ "${#files[@]}" -gt 1 ] && deny "cat of several files; read what you need with 'grep -n' and 'sed -n A,Bp', or the Read tool with offset and limit."
  [[ "${files[0]:-}" == *'*'* ]] && deny "cat of a glob; read what you need with 'grep -n' and 'sed -n A,Bp'."
  [[ "$CMD" =~ $BOUNDED ]] && continue
  [ -f "${files[0]:-}" ] && [ "$(wc -l <"${files[0]}")" -gt "$MAX_LINES" ] && deny "${files[0]} has over $MAX_LINES lines; read the part you need with 'sed -n A,Bp' or the Read tool with offset and limit."
done < <(sed -E 's/(&&|\|\||[;|])/\n/g' <<<"$CMD")

exit 0
