#!/usr/bin/env bash
# tunelle-two.sh host|listener — one terminal per role, from the repo root, after `npm run build`
set -euo pipefail
role="${1:?host or listener}"
repo="$(git rev-parse --show-toplevel)"
home="$HOME/tunelle-manual/$role"
mkdir -p "$home/user-data"

HOME="$home" XDG_CONFIG_HOME="$home" \
TUNELLE_APP_DATA="$home" TUNELLE_NO_UPDATE=1 TUNELLE_NO_ARTIST_PHOTOS=1 \
NODE_ENV=production \
exec "$repo/node_modules/.bin/electron" "$repo/out/index.js" --user-data-dir="$home/user-data"
