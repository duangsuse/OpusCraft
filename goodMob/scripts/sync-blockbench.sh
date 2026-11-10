#!/bin/sh
# Rebuild the vendored Blockbench web app (goodMob/blockbench/) from source and re-apply the goodMob plugin tag.
# usage: scripts/sync-blockbench.sh [git-ref]     (default: gh-pages, the branch web.blockbench.net is built from)
set -eu
REF=${1:-gh-pages}
HERE=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 -b "$REF" https://github.com/JannisX11/blockbench.git "$TMP/bb"
cd "$TMP/bb"
npm ci --ignore-scripts --no-audit --no-fund     # --ignore-scripts skips electron's binary download
node build.js --target=web

OUT="$HERE/blockbench"
rm -rf "$OUT"; mkdir -p "$OUT/dist"
cp -r index.html css font lang lib assets themes keymaps icons content favicon.png icon.png icon_full.png icon_maskable.png manifest.webmanifest LICENSE.MD "$OUT/"
cp dist/bundle.js "$OUT/dist/"

# the only edit to Blockbench itself: load the goodMob plugin after the bundle
sed -i 's|<script type="module" src="dist/bundle.js"></script>|&\n\t<script src="../plugin/svox-view.js"></script><!-- goodMob: SVOX view + magic wand -->|' "$OUT/index.html"
grep -q 'plugin/svox-view.js' "$OUT/index.html" || { echo "plugin tag not injected" >&2; exit 1; }
echo "Blockbench $(node -p "require('./package.json').version") synced into $OUT"
