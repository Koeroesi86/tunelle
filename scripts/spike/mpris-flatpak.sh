#!/usr/bin/env bash
# Spike of #258: build, install, run, inspect and remove a Flatpak of its own id (io.github.koeroesi86.TunelleSpike)
# that has no org.mpris.MediaPlayer2.chromium.* permission. It sits beside the real app: other id, other data, other desktop entry.
# See docs/development/mpris-spike.md
set -euo pipefail

id=io.github.koeroesi86.TunelleSpike
root="$(cd "$(dirname "$0")/../.." && pwd)"
bundle="$root/dist/mpris-spike/Tunelle-spike.flatpak"

usage() {
  cat <<EOF
usage: scripts/spike/mpris-flatpak.sh <command>

  build                 npm run build, then the Flatpak into dist/mpris-spike (a few minutes)
  install               installs the bundle for your user
  run [options]         starts it (see the options below)
  inspect               lists the MPRIS services on the session bus and what each one says
  remove                stops it, uninstalls it with its data and deletes the build and the cover

options of run (combine them, the app has no chromium.* permission unless --chromium-name is given):
  --spike               start our own MPRIS service under org.mpris.MediaPlayer2.$id (demo tracks, Next and Previous change them)
  --disable-features=X  pass X to --disable-features of Chromium, e.g. MediaSessionService or HardwareMediaKeyHandling
  --chromium-name       allow org.mpris.MediaPlayer2.chromium.* for this run, as the app has it today
EOF
}

command_build() {
  (cd "$root" && npm run build && node scripts/spike/build-mpris-flatpak.js)
  mv "$root"/dist/mpris-spike/*.flatpak "$bundle" 2>/dev/null || true
}

command_install() {
  flatpak install --user -y --noninteractive "$bundle"
}

command_run() {
  local flags=() env=(--env=TUNELLE_NO_UPDATE=1)
  for option in "$@"; do
    case "$option" in
      --spike) env+=(--env=TUNELLE_MPRIS_SPIKE=1) ;;
      --disable-features=*) env+=(--env=TUNELLE_MPRIS_DISABLE_FEATURES="${option#*=}") ;;
      --chromium-name) flags+=(--own-name='org.mpris.MediaPlayer2.chromium.*') ;;
      *) usage; exit 1 ;;
    esac
  done
  echo "flatpak run ${flags[*]:-} ${env[*]} $id"
  echo "Play something is not needed: the spike has demo tracks. Run 'inspect' in another terminal."
  flatpak run "${flags[@]}" "${env[@]}" "$id"
}

command_inspect() {
  local names
  names="$(busctl --user list --no-legend | awk '{print $1}' | grep '^org.mpris.MediaPlayer2\.' || true)"
  [ -n "$names" ] || { echo "No MPRIS service on the session bus."; return; }
  for name in $names; do
    echo "== $name"
    busctl --user get-property "$name" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2 Identity DesktopEntry || true
    busctl --user get-property "$name" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus Metadata || true
  done
  if command -v playerctl >/dev/null; then echo "== playerctl"; playerctl -l; fi
  echo
  echo "Try by hand: busctl --user call <name> /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player Next"
  echo "Look at: the media keys, the GNOME media popup (icon, cover, buttons), a KDE widget, playerctl."
}

command_remove() {
  flatpak kill "$id" 2>/dev/null || true
  flatpak uninstall --user -y --delete-data "$id" 2>/dev/null || true
  rm -rf "$root/dist/mpris-spike" "${XDG_RUNTIME_DIR:-/run/user/$UID}/app/$id" "$HOME/.var/app/$id"
  echo "Removed $id. The real io.github.koeroesi86.Tunelle was not touched."
}

case "${1:-}" in
  build) command_build ;;
  install) command_install ;;
  run) shift; command_run "$@" ;;
  inspect) command_inspect ;;
  remove) command_remove ;;
  *) usage; exit 1 ;;
esac
