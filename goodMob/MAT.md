# MAT.md: material / tweak-UI requirements

Goal: replace the free-text "material props" field with typed, live-tweakable controls (lil-gui) that cover what the models in `reference-ents/` actually use, and let Blockbench load those models. Status: implemented (see "Implementation" at the end); sections 1 to 7 are the requirements it was built from.

Sources: the 17 SVOX models in `reference-ents/` (58 `material` lines; `notes` is a small AO test cube), the property tables in `vendor/smoothvoxels.three.js` (`SVOX.MATERIALDEFINITIONS`, `MODELDEFINITIONS`; dumped with a vm script, 2.4.0), and the cheat sheet at smoothdev.nl (my fetch came back empty because the tables are JS-rendered; the full text is now in `svox-cht`, tab-separated, and matches the lib's definitions).

## 1. What the references need that the plugin cannot express today

`src/svox.js` emits one `material` line per **layer** with one colour, plus a fixed header (`size`, `scale`, `origin = -y`). Gaps, most important first:

| # | Gap | Evidence | Consequence |
|---|---|---|---|
| G1 | **Material ≠ layer.** One SVOX material lists several colours (`colors = A:#D11 B:#F60 D:#000 C:#F93`), and `fade = true` blends between the colours *of the same material*. | `aapl`, `bush` (7 greens, `fade`), `tree`, `fry`, `jack-o` | With 1 layer = 1 material, `fade` does nothing. Needed: a layer references a named material preset; layers that share a preset go into one `material` line. |
| G2 | **Model-level props** missing: `ao` (baked AO), `scale` (non-uniform), `resize`, `shape`, `clamp`/`skip`/`flatten`/`hide`/`origin`, `wireframe`, `randomSeed`, `rotation`, `position`. | `ao` in `aapl fax rkt notes`; non-uniform `scale` in `aapl axes fax bush1 tree`; `shape` in `jack-o knot rkt`; `resize = fit` in `gems knot rkt` | AO is the single biggest look factor in `aapl`/`jack-o`; needs a model panel. |
| G3 | **Planar props use SVOX axes** (y up, z back). Authoring frame is z up, forward = -y (see `src/svox.js` header). | `clamp = -y` means "flat bottom" | UI must show axis choices in authoring terms (bottom/top/front/back/left/right) and translate on emit. |
| G4 | **Define = shared preset.** `define metal lighting = both, roughness = 0.4, metalness = 1` then `material metal, deform = 6`. | `sword`, `fry`, `knot`, `bush1` | A preset layer (base props) + per-material overrides. Natural fit for G1. |
| G5 | **Groups** (`group id = …`, `material group = …`, rotation/position/scale/bend/shape, `clone`, `prefab`). | `rkt` (whole ship from 3 prefabs), `chair` (legs), `crate` | Not representable from cubes. See decision D1. |
| G6 | **Lights** (`light color, intensity, direction, atvoxel, distance, size, detail`). | `bush` (2 directional), `logo` (6 atvoxel lights) | `lights = false` on materials only matters once lights exist. See D2. |
| G7 | **Textures / maps** (`texture id, image, size, cube`; `envmap`, `map`, `normalmap`). | `chair`, `gems`: `image = %ENVIRONMENT%`; `knot`: two `%ENVIRONMENT%` 512×512 textures | `%ENVIRONMENT%` is a Playground-only token (the `chair` file says so). No loader here. See D3. |
| G8 | **Colour options**: palette index `A(66):#C30`, `transparent = true` on a colour, multi-character colour ids (`Reflection`) referenced by `shell`. | `jack-o`, `bush` (index), `logo` (transparent), `gems` (shell) | Colour ids must stay stable and shell must pick a colour by layer name; the current generator only makes `A..Z, Ab..`. |
| G9 | **Voxel data**: models use `shape`-reshaped matrices and `scale`-stretched voxels; ours are 1 unit cubes at `1/16`. | all | Per-axis voxel scale needs to live in the model panel (not in the cubes). |

## 2. Material property usage (58 material lines)

Count = number of reference files using it (directly or through `define`). Tier: **P0** used by ≥5 files, **P1** used by 2–4, **P2** single use, **–** in SVOX but not in any reference (kept out of the UI unless asked).

| Property | Type / range | Values seen | Files | Tier | Widget |
|---|---|---|---|---|---|
| `lighting` | enum `flat quad smooth both sides` | all five | 15 | P0 | dropdown |
| `deform` | `count:int strength:float damping:float`, e.g. `3`, `1 0.75`, `1 1.5` | 1 to 50 | 15 | P0 | 3 sliders (count 0..50 int, strength 0..2, damping 0..1.5) |
| `roughness` | float 0..1 (default 1) | 0 to 1 | 10 | P0 | slider |
| `clamp` | planar set `-x >x x <x +x … none` | `-y +y y x -z +z x -y none` | 9 | P0 | 6 face toggles + "all but ends" variants |
| `metalness` | float 0..1 | 0.1 0.2 0.5 1 | 8 | P0 | slider |
| `type` | enum `basic lambert phong standard physical toon matcap normal` | basic lambert phong (default `standard`) | 6 | P0 | dropdown; hides props the type does not allow (`allowedFor` in the lib) |
| `fade` | bool | true | 5 | P0 | checkbox (needs G1) |
| `scatter` | float, voxels | 0.1 to 3 | 4 | P1 | slider 0..3 |
| `opacity` | float 0..1 | 0.0001 0.2 0.99 1 | 4 | P1 | slider (0.0001 = invisible but still lit; do not clamp to 0) |
| `skip` | planar set | `-y +y -z x y z x z -y` | 2 | P1 | face toggles |
| `hide` | planar set | `-z y` | 2 | P1 | face toggles |
| `ao` | `[#color] maxDist [intensity] [angle]`; colour optional in refs (`ao = 5`, `ao = 1 0.75`), negative distances seen (`#01F -3 -3`) | | 2 + model-level 4 | P1 | colour pick + 3 numbers, enable checkbox |
| `warp` | `ampl [freq]` or `ax ay az [freq]` | `1 0.2`, `1 0.25` | 2 | P1 | amplitude (uniform or xyz) + frequency |
| `lights` | bool | false | 2 | P1 | checkbox |
| `shininess` | float (phong) | 1000 | 2 | P1 | slider 1..2000 (phong only) |
| `envmap` | texture id | `env` | 2 | P1 | dropdown of loaded textures (needs G7) |
| `side` | enum `front back double` | double | 1 | P2 | dropdown |
| `reflectivity` | float | 0.05 | 1 | P2 | slider |
| `refractionratio` | float | 0.5 | 1 | P2 | slider |
| `combine` | enum `add multiply mix` | multiply | 1 | P2 | dropdown |
| `shell` | `[colorId distance]+` | `Reflection 0.01` | 1 | P2 | list of (layer, distance) rows |
| `emissive` | colour | #FC0 | 1 | P2 | colour pick (+ `emissiveIntensity`, default 1) |
| `fog` | bool | false | 1 | P2 | checkbox |
| `blending` | enum `no normal additive subtractive multiply` | additive | 1 | P2 | dropdown |
| `map`, `normalmap` | texture id | `rustmap`, `rustnormal` | 1 | P2 | dropdown (needs G7) |
| `group` | group id | `legs Hull Window …` | 3 | P2 | not a material tweak, see G5 |

Colour-level (inside `colors =`): `fade` between colours (P0), `transparent` (P2), palette index (P2, only for .vox round-trip).

Not used by any reference, left out of the UI: `wireframe` per material, `shadowSide`, atlas*, `mapTransform`, `mapProject`, `bumpMap/Scale`, `roughnessMap`, `metalnessMap`, `matcap`, `alphaTest`, `alphaToCoverage`, `alphaMap`, `emissiveMap`, all `specular*`, `ior thickness transmission attenuation* clearcoat*`, `displacement*`, `dithering`, `castShadow receiveShadow quickAo`, `simplify`, `data`.

## 3. Model-level properties seen

| Property | Values seen | Files | Tier |
|---|---|---|---|
| `scale` (1 or 3 numbers) | 0.02 to 0.15, non-uniform in 5 | 17 | P0 |
| `origin` | `-y`, `+z`, `x -y z` | 17 | P0 (currently hard-coded `-y`) |
| `ao` | `5 0.5`, `2 0.5`, `1 0.75` | 4 | P0 |
| `resize` | `fit` | 3 | P1 |
| `shape` | `cylindery sphere` (also `box cylinderx cylinderz`) | 3 | P1 |
| `clamp`, `skip` | `-y`, `none` | 4 | P1 |
| `wireframe` | false | 3 | P2 |
| `rotation`, `position` | `0 180 0`, `90 0 0`, `0 0.25 0` | 4 | P2 |

## 3b. Per-type availability (from `svox-cht`)

The cheat sheet has a ✓ matrix per material type (`bas lam pho sta phy too mat nor`); the lib carries the same flags (`basic: true`, …). The UI must use it to show only valid controls. Consequences that matter for the references:

- `roughness`, `metalness`, `envmapintensity`: only `standard`/`physical`. Default type is `standard`; `type = basic|lambert|phong` (6 reference files) makes them irrelevant. `bush`/`jack-o` use `basic`, `chair`/`gems` use `phong`.
- `shininess`, `specular`: `phong` only. `reflectivity`: basic, lambert, phong, physical. `combine`, `refractionratio`: basic, lambert, phong.
- `emissive*`: not `basic`, not `normal`. `ao`, `quickao`, `fog`, `lights`, `fade`, `receiveshadow`, `alphatest`: not `normal`.
- `deform`, `warp`, `scatter`, `clamp`, `flatten`, `skip`, `hide`, `lighting`, `side`, `shell`, `opacity`, `blending`: all types.
- `quickao` overrules `ao` on the model and is not suitable for deformed models: offer it only when a layer has `deform = 0`.

Other things the sheet adds that the first pass missed:

- Model: `tile` (do not warp/scatter these edges, for tiling) and `aosides` (walls/floor that occlude the model: a quick contact-shadow for animals standing on the ground). Both are cheap to expose; `aosides` is worth P1.
- Planar tokens `>y` / `<y` mean "all except the ends"; `origin` and `aosides` only take `-x x +x …` (no `>`/`<`). The planar widget needs two variants.
- Group: `swap` / `recolor` (colour swaps per group, useful for clone variants), `group` = attach to a parent group. Only relevant if D1 is "support groups".
- Light: `position` (world units) and `castshadow`; baked shadows are controlled from the light, `castshadow = false` is advised on materials with `atvoxel` lights.
- `shadowquality` accepts `hight` / `low` (the typo is in the lib's own list: write it exactly).

## 4. Axis convention for the planar UI (G3)

SVOX frame: x right, y up, z back. Authoring frame (plugin): x right, y forward, z up. Mapping used by `toSvox`: authoring forward ends up at SVOX -z, authoring up = SVOX y. So:

| UI label | SVOX token |
|---|---|
| bottom / top | `-y` / `+y` |
| front / back | `-z` / `+z` |
| left / right | `-x` / `+x` |
| "all vertices on that axis" (e.g. top and bottom) | `y` (unsigned) |
| "all except the ends" | `>y` / `<y` (see cheat sheet) |

Each planar field (`clamp`, `flatten`, `skip`, `hide`) = a 3-axis × {neg, mid, pos, both} control, not a text box.

## 5. Proposed data model

Replace `styles[layer] = { color, mat: "<free text>" }` with:

```
materials: { <name>: { type, lighting, deform:[n,s,d], roughness, …, props only if non-default } }
layers:    { <layer>: { color, material: <name> } }
model:     { ao, scale:[x,y,z], origin, resize, shape, clamp, skip, … }
```

- Presets (G4) = materials created from a list: `Flat clay`, `Smooth lowpoly` (`deform=1..3`), `Metal` (`both, roughness .4, metalness 1`), `Foliage` (`quad/flat, fade, scatter, warp`), `Glow` (`emissive, opacity`), taken from the references.
- `toSvox` groups layers by material name → one `material` line with all their colours (G1) and appends the model panel's header.
- Old `mat` strings: parse on load into the object where all keys are known, otherwise keep as an "extra" text field (so nothing is lost).
- Schema, ranges, defaults and `allowedFor` are read from `SVOX.MATERIALDEFINITIONS` at runtime where the worker can export them, so the UI cannot drift from the library version.

## 6. UI plan

lil-gui (single file, vendored under `vendor/`) mounted in the existing SVOX panel:

1. **Model** folder: scale xyz, origin, ao (colour/distance/intensity), resize, shape, clamp/skip (planar widget), wireframe.
2. **Materials** list (add/duplicate/rename/delete, preset dropdown). One folder per material: Surface (type, lighting, roughness, metalness, shininess, reflectivity, side), Shape (deform×3, scatter, warp, clamp/flatten/skip/hide planar widgets), Transparency/Glow (opacity, emissive, blending, fog, lights), Colours (fade, ao).
3. **Layers** list: colour picker + material dropdown per layer (the wand's Assign target stays here).
4. Controls not allowed for the selected `type` are hidden (from `allowedFor`), not disabled.
5. Rebuilds are debounced and run in the worker; sliders do not create Blockbench undo entries per tick: one entry on release.
6. Cheat-sheet style tooltips: each control shows the lib's `doc` string.
7. A "Copy SVOX" button dumps the generated model text so results can be pasted into the Playground.

## 7. Decisions (made)

- **D1 groups:** supported. `group` / `clone` / `prefab` lines are kept as data and re-emitted; `material group = X` is a material prop. The cubes themselves stay flat (one Blockbench group per layer); SVOX groups only transform the generated mesh.
- **D2 lights:** supported (`light` lines, including `atvoxel` by layer name). The library bakes them into vertex colours / visible light spheres, so they render without extra three.js lights.
- **D3 textures:** every SVOX texture id is backed by one built-in generated image (`makeEnvImage` in `hacks/plugin/svox-render.js`, a small studio-style equirect). `%ENVIRONMENT%` and any pasted base64 image are replaced by it. `Copy SVOX` writes `%ENVIRONMENT%` back.
- **D4 scope:** all P0, P1 and P2 properties in section 2 are editable. Others in the library tables can be added from the "+ add property" dropdown (it lists everything valid for the material type).

## Implementation

| Piece | File |
|---|---|
| Props parse/write, planar helpers, presets, widget spec | `src/svoxprops.js` |
| Project data model, migration from the old `styles` form, SVOX emitter | `src/svox.js` |
| Worker `parse` result -> grid + data (every colour id = a layer, every `material` line = a shared material) | `src/svoximport.js` |
| Worker ops `schema` / `parse` / `generate` | `hacks/plugin/svox-worker.js` |
| Real three.js material per SVOX material, env map, built-in image | `hacks/plugin/svox-render.js` |
| lil-gui panel (Layers, Materials, Model, Lights, Groups) | `hacks/plugin/svox-gui.js` |
| Blockbench glue, undo snapshots, clipboard import, Copy SVOX | `hacks/plugin/svox-view.js` |

Behaviour worth knowing:
- Type-dependent controls come from the library's own allowed-types flags (`schema` op), so `roughness` disappears for `lambert`, `shininess` only shows for `phong`, etc. Props that are set but not valid for the type stay listed as `(n/a)`.
- The editor view always renders at 1 voxel = 1 Blockbench unit with `origin = -y` so the wand and cubes line up; the model's own `scale` only contributes its y/x and z/x ratios (non-uniform voxels), and `origin`, `rotation`, `position` are only written by `Copy SVOX`.
- Wand picking maps a hit back to a grid cell, so on meshes that are warped, shaped or cloned by groups it can land on a neighbouring voxel.
- Verified: all 17 files in `reference-ents/` import (cubes + data) and the re-emitted text generates the same triangle count as the original (scatter/warp models vary by a few triangles run to run because the library's noise is random), in Node and in Blockbench.
