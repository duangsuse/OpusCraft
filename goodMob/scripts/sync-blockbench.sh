#!/bin/sh
# Rebuild the vendored Blockbench web app (blockbench/) from upstream source, apply the goodMob patch series, and
# re-inject the goodMob plugin tags.
#
# usage: scripts/sync-blockbench.sh [git-ref]     (default: gh-pages, the branch web.blockbench.net is built from)
#
# Everything the goodMob workflow needs is stacked on top of upstream in this order:
#   1. hacks/patches/*.patch   small, semantic source patches (see hacks/patches/README.md); applied in filename order
#   2. hacks/plugin/*.js       plain Blockbench plugins, loaded by the <script> tags injected below
# Nothing here is a fork: upstream updates are "re-run this script". A patch that stops applying is a rebase task,
# and the script fails loudly instead of silently shipping a half-patched build.
set -eu
REF=${1:-gh-pages}
HERE=$(cd "$(dirname "$0")/.." && pwd)
PATCHES="$HERE/hacks/patches"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 -b "$REF" https://github.com/JannisX11/blockbench.git "$TMP/bb"
cd "$TMP/bb"

for p in "$PATCHES"/*.patch; do
	[ -e "$p" ] || continue
	printf 'apply %s\n' "$(basename "$p")"
	git apply --whitespace=nowarn "$p" || { echo "patch failed: $(basename "$p") — rebase it against the new upstream" >&2; exit 1; }
done

npm ci --ignore-scripts --no-audit --no-fund     # --ignore-scripts skips electron's binary download
node build.js --target=web

OUT="$HERE/blockbench"
rm -rf "$OUT"; mkdir -p "$OUT/dist"
cp -r index.html css font lang lib assets themes keymaps icons content favicon.png icon.png icon_full.png icon_maskable.png manifest.webmanifest LICENSE.MD "$OUT/"
cp dist/bundle.js "$OUT/dist/"

# the only edit to Blockbench's own index.html: load the goodMob plugins after the bundle
sed -i 's|<script type="module" src="dist/bundle.js"></script>|&\n\t<script src="../hacks/plugin/svox-view.js"></script><!-- goodMob: SVOX view + magic wand -->\n\t<script src="../hacks/plugin/defaults.js"></script><!-- goodMob: default plugin set -->\n\t<script src="../hacks/plugin/home.js"></script><!-- goodMob: start screen library -->|' "$OUT/index.html"
grep -q 'hacks/plugin/svox-view.js' "$OUT/index.html" || { echo "plugin tag not injected" >&2; exit 1; }
echo "Blockbench $(node -p "require('./package.json').version") synced into $OUT ($(ls "$PATCHES"/*.patch 2>/dev/null | wc -l) patches)"
