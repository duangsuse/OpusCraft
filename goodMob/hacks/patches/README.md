# patches/

Source patches against upstream Blockbench, applied by `scripts/sync-blockbench.sh` **before** `node build.js`.
Filename order is apply order: `0001-start-screen.patch`, `0002-...`, …

Rules that keep upstream updates cheap:

1. **One behaviour per patch.** A patch you can describe in one sentence is a patch you can rebase in minutes.
2. **Stay out of hot code.** Prefer a new function + one call site over rewriting a loop.
3. **No vendored upstream code.** If the fix needs a new file, add it under `js/` in the patch; never paste a whole
   upstream file to change two lines.
4. **Patch the source, never `blockbench/dist/bundle.js`.** The bundle is a build artifact and is overwritten on sync.
5. **Write it against a known ref.** Record the ref below and in the patch header (`git log -1 --format=%h`).

## Current series

| patch | upstream ref tested | what it changes |
|---|---|---|
| `0001-start-screen-library.patch` | `gh-pages` 5.2.2 (2026-11-10) | web start screen: the empty "Recent" column becomes a model library — search, `Open Folder` (File System Access API), grid, and the drop/paste slot to the right of `Open Model`. All model handling is behind `window.goodmobHome` (`hacks/plugin/home.js`). |

The vendored app in `blockbench/` is built from `gh-pages` (what web.blockbench.net ships); `master` is the dev
branch. Prefer `gh-pages` so the vendored app matches a release that users actually see.

## Authoring a patch

```sh
git clone --depth 1 -b gh-pages https://github.com/JannisX11/blockbench.git hacks/.upstream/bb
cd hacks/.upstream/bb
# ...edit, then:
git diff > ../../patches/0001-topic.patch
```

Test it exactly the way the sync script applies it, without building:

```sh
git clone --depth 1 -b gh-pages https://github.com/JannisX11/blockbench.git /tmp/bb-test
cd /tmp/bb-test && git apply --whitespace=nowarn /path/to/hacks/patches/0001-topic.patch
```

Then run `scripts/sync-blockbench.sh` and check the app at `blockbench/index.html` (needs a static server, not
`file://`).

## Rebasing

When a patch stops applying, the sync script prints `patch failed: …`. Re-clone the ref, apply the patch with
`git apply --reject`, fix the `.rej` hunks by hand, then regenerate the diff. Keep the filename; bump the ref in the
table above. If a piece can be moved to `hacks/plugin/` instead, do that — plugin code never needs rebasing.
