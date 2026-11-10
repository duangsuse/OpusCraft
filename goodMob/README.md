# goodMob · voxel filter

Integer boxes / `.vox` / Blockbench `.bbmodel` → voxel grid → per-layer [Smooth Voxels](https://www.smoothdev.nl/smoothvoxels) → low-poly mesh.
Open `index.html` through any static server (ES modules; no build step).

```
src/grid.js     Grid + GridBuilder (sparse, integer boxes, later writes win). Frame: x right, y forward, z up.
src/ops.js      guide-voxel emitters: stack (mound/hump), frustum (taper), chain (horn/tail)
src/vox.js      MagicaVoxel .vox reader (first model; layer = palette index)
src/bbmodel.js  Blockbench .bbmodel reader (cubes; layer = outliner group; per-cube rotation sampled)
src/svox.js     Grid + per-layer styles → SVOX text (one material per layer)
src/bull.js     preset: reference-mobs/ref1.py bull as integer boxes + ops
src/boxes.js    Grid -> greedy integer boxes (used by the Blockbench .vox importer)
src/svoxprops.js SVOX settings as strings: parse/write, planar helpers, presets, widget spec
src/svoximport.js SVOX worker parse -> grid + project data
src/main.js     standalone three.js viewer + layer panel (index.html)
vendor/         three r164, OrbitControls, Smooth Voxels 2.4.0 (MIT, see vendor/LICENSE), lil-gui 0.21 (MIT, vendor/lil-gui/LICENSE.md)
blockbench/     Blockbench 5.2.2 web build (GPL-3.0, see blockbench/LICENSE.MD); only edit: one <script> tag in index.html
plugin/         svox-view.js (Blockbench mode/tool/panel/imports), svox-gui.js (lil-gui panel), svox-render.js (three materials), svox-worker.js (Smooth Voxels off-thread)
scripts/        sync-blockbench.sh: rebuild blockbench/ from source and re-apply the plugin tag
```

## Layers

A layer is one Smooth Voxels material. Its text box takes any material property from the Smooth Voxels docs,
e.g. `deform = 3 1 0.8, clamp = -y, scatter = 0.1`. Axes in those properties are **SVOX axes** (`y` = up).
"Base material" is prepended to every layer. "raw voxels" bypasses every layer style to show the un-filtered grid.
The "SVOX text" box is a complete model you can paste into the Smooth Voxels Playground (e.g. to export glTF).

## Guide-voxel ops (`src/ops.js`)

| op | emits | use |
|---|---|---|
| `stack(b, layer, [x0,y0], [x1,y1], z, insets)` | 1-voxel slabs, slab k inset by `insets[k]` | hump, mound, pyramid |
| `frustum(b, layer, min, max, axis, end, amount)` | slices inset linearly toward one end | tapered leg, head wedge, trapezoid torso |
| `chain(b, layer, [[x,y,z,size],…], {mirror})` | stepped cubes along a polyline | horn, tail |

The ops only place integer voxels; the layer's `deform` turns the 1-voxel steps into slopes.

## Known limits

- `.vox`: first model only, no scene graph (nTRN) offsets.
- `.bbmodel`: cubes only; group rotations ignored (warned); per-cube rotation assumes Euler order `ZYX` (Blockbench's `Format.euler_order` default — not tested against a real Blockbench file).
- Layer colours from `.bbmodel` are auto-assigned; edit them in the panel.
- Smooth Voxels merges layers with identical three.js material settings into one draw call (vertex colours), so the viewer reports "1 materials"; per-layer deform is still independent.
- Orientation: forward is authoring `+y` (= SVOX `-z`, the side the default camera looks from). `.vox` models authored facing another way show their back; there is no rotate control yet.

## Blockbench integration (`blockbench/index.html`)

Same filter, inside the real editor. Nothing in Blockbench's source is modified.

- **File ▸ Import ▸ Import MagicaVoxel .vox (goodMob)**: voxels → greedy-merged cubes, one outliner group per palette index (palette colours kept as layer colours).
- **File ▸ Import ▸ Import Smooth Voxels from clipboard (goodMob)** (also a button in the SVOX panel): reads SVOX text from the clipboard (a paste dialog opens if the browser blocks clipboard reads), opens a **new tab**, turns the voxels into cubes (one group per colour id) and keeps materials, groups, lights and model settings as project data. `%ENVIRONMENT%` and any image are replaced by one built-in texture. All 17 models in `reference-ents/` load. **Copy SVOX** writes the model back as SVOX text (textures as `%ENVIRONMENT%`).
- **SVOX mode** (top-right mode switcher, next to Edit/Paint/Animate): hides the cubes and shows the Smooth Voxels result of the project, 1 voxel = 1 Blockbench unit, aligned with the cubes. Layers = outliner groups. Rebuilds on every edit/undo/redo.
- **SVOX panel**: raw-voxels / wireframe toggles, wand options, selection actions, and a lil-gui tweak panel: **Layers** (colour, material, select voxels), **Materials** (shared by layers, presets, type-aware sliders/dropdowns for lighting, deform, scatter, warp, clamp, roughness, metalness, opacity, fade, plus "+ add property" for everything else the library allows), **Model** (scale, ao, shape, resize, clamp/skip/aosides, ...), **Lights**, **Groups**. Each finished edit is one undo step. Materials are rendered with real three.js materials (env map, opacity, emissive, blending, ...). See `MAT.md`.
- **Magic wand tool** (active by default in SVOX mode): click a voxel → flood fill. `match`: same layer / same colour / any; `connect`: 6 or 26; `surface only` (default) keeps the fill on exposed voxels; `whole model` ignores connectivity. Shift adds, Ctrl/Cmd subtracts, click on empty space clears. Click a layer name in the panel to select the whole layer.
- **Assign** moves the selected voxels into a (new or existing) layer; **Reset** returns them to their group's layer. Cubes are never modified: assignments are per-voxel overrides stored in the `.bbmodel` under `goodmob_svox` (with the layer styles), keyed by voxel position, so they do not follow cubes that are moved later. Assign/Reset and every tweak are Blockbench undo steps (Ctrl+Z / Ctrl+Y).

Run `scripts/sync-blockbench.sh [ref]` to update Blockbench (needs git, node ≥ 20, network).

Why a worker: Blockbench adds enumerable methods to `Array.prototype`, which break Smooth Voxels' `for … in` voxel loops, and Smooth Voxels' top-level classes (e.g. `BoundingBox`) would shadow Blockbench globals. Running it in `plugin/svox-worker.js` avoids both.

Limits: cubes only (meshes skipped), hidden cubes ignored, group rotations ignored, per-cube rotation voxelised by cell-centre sampling.
