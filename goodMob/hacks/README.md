# hacks/

Everything goodMob adds on top of Blockbench lives here. Two kinds of change, and only two:

| dir | for | how it lands |
|---|---|---|
| [plugin/](plugin) | anything the public plugin API can do | `<script>` tags in `blockbench/index.html`, edited by the sync script |
| [patches/](patches) | the rest (layout, start screen, paint/animate internals) | `git apply` on upstream source **before** `node build.js` |

The rule is: **try the plugin API first, patch only when it genuinely cannot reach the seam.** A patch must be small
and semantic (one behaviour per patch), because every upstream sync re-applies it — that is the price that keeps
upstream updates alive. Nothing here is a fork: `scripts/sync-blockbench.sh` clones upstream, applies the series,
builds, and fails loudly if a patch no longer applies.

`hacks/.upstream/` (gitignored) holds local clones of `JannisX11/blockbench` and `JannisX11/blockbench-plugins` for
authoring patches and looking up plugin ids/APIs. Delete it whenever; nothing depends on it.

## plugin/

- `svox-view.js` — the SVOX mode, magic wand tool, panel, imports, and the `goodmob_svox` project data.
- `svox-gui.js`, `svox-render.js`, `svox-worker.js` — tweak panel, materials, Smooth Voxels worker.
- `defaults.js` — installs the default plugin set once per browser profile. The store marks Asset Browser, Export to
  Blender and Free Rotation as desktop-only, so on the web build they are skipped with a log line; Minecraft Entity
  Wizard, WASD Controls and Ambient Occlusion do install.
- `home.js` — the start screen model library: built-in manifest (`hacks/library.json`, regenerate with
  `scripts/make-library.py`), a remembered folder (File System Access API + IndexedDB), drop and paste handling. The
  patched start screen only knows `window.goodmobHome`; all model-specific logic lives here.

Paths inside the plugin are resolved from `document.currentScript`, so moving the directory means editing two
constants (`PLUGIN`, `ROOT` at the top of `svox-view.js`).

## patches/

`NNNN-topic.patch` files, applied in filename order. `0001-start-screen-library.patch` replaces the web start
screen's empty "Recent" column with the library grid + folder picker + drop/paste slot (the `window.goodmobHome`
contract above). See [patches/README.md](patches/README.md) for the current
series, the upstream ref it was written against, and how to rebase one.
