#!/usr/bin/env bash
# Build, install, run, inspect and remove a Flatpak of the current code under an id of its own (io.github.koeroesi86.TunelleTry),
# beside the real app: other id, other data, other desktop entry. See docs/development/try-flatpak.md
set -euo pipefail

id=io.github.koeroesi86.TunelleTry
root="$(cd "$(dirname "$0")/../.." && pwd)"
bundle="$root/dist/try-flatpak/Tunelle-try.flatpak"

usage() {
  cat <<EOF
usage: scripts/tooling/try-flatpak.sh <command>

  build      npm run build, then the Flatpak into dist/try-flatpak (a few minutes)
  install    installs the bundle for your user
  run        starts it with the updater off
  inspect    lists the MPRIS services on the session bus and what each one says
  remove     stops it, uninstalls it with its data and deletes the build and the cover
EOF
}

command_build() {
  (cd "$root" && npm run build && node scripts/tooling/try-flatpak.js)
  mv "$root"/dist/try-flatpak/Tunelle-*.flatpak "$bundle"
}

command_install() {
  flatpak install --user -y --noninteractive "$bundle"
}

command_run() {
  flatpak run --env=TUNELLE_NO_UPDATE=1 "$id"
}

command_inspect() {
  local names
  names="$(busctl --user list --no-legend | awk '{print $1}' | grep '^org.mpris.MediaPlayer2\.' || true)"
  [ -n "$names" ] || { echo "No MPRIS service on the session bus."; return; }
  for name in $names; do
    echo "== $name"
    busctl --user get-property "$name" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2 Identity DesktopEntry || true
    busctl --user get-property "$name" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus Position Metadata || true
  done
  if command -v playerctl >/dev/null; then echo "== playerctl"; playerctl -l; fi
}

command_remove() {
  flatpak kill "$id" 2>/dev/null || true
  flatpak uninstall --user -y --delete-data "$id" 2>/dev/null || true
  rm -rf "$root/dist/try-flatpak" "${XDG_RUNTIME_DIR:-/run/user/$UID}/app/$id" "$HOME/.var/app/$id"
  echo "Removed $id. The real io.github.koeroesi86.Tunelle was not touched."
}

case "${1:-}" in
  build) command_build ;;
  install) command_install ;;
  run) command_run ;;
  inspect) command_inspect ;;
  remove) command_remove ;;
  *) usage; exit 1 ;;
esac
