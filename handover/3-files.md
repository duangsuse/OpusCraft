# Critical Context: Voxel Engine Project (bridge-mind / VoxelCraft / 青屿)

## Files and Environment

| File | Size | Notes |
|------|------|-------|
| `bridge-mind.html` | 288563 B | Main target, 4464 lines, Three r128 UMD + JSZip |
| `old.htm` | 66388 B | 青屿, Three r170 + Tweakpane, 1406 lines |
| `VoxelCraft.html` | 159646 B | Reference (senko.net), Three r160 ESM, 2590 lines |
| `.git` | Present | Version control available |

**CDN reachable (proxy, HTTP 200):**
- `cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`
- `jszip@3.10.1/+esm`
- `tweakpane@4.0.5/dist/tweakpane.js`

start game test: `http://localhost:8765/index.html`

---

## bridge-mind.html

### Overview
- **Size & stack**: 4464 lines, Three r128 UMD (cdnjs) + JSZip 3.10 (cdnjs) at lines 241–242. Main `<script>` starts at line 243.
- **Structure**: 19 sections. Global systems include `world.getBlock`, `Blocks.byName`.
- **Header note**: Every deliberately unfinished feature is marked with `STUB`.
- **STUB index**: lines 4448–4460.

### Section Map

| # | Section | Line |
|---|---------|------|
| 1 | UTILITIES | 246 |
| 2 | Block and item registry | 445 |
| 3 | Recipes | 772 |
| 4 | Procedural textures | 898 |
| 5 | Atlas and resource pack | 1094 |
| 6 | World storage | 1280 |
| 7 | Terrain | 1479 |
| 8 | Lighting | 1760 |
| 9 | Meshing | 1899 |
| 10 | Chunk manager | 2293 |
| 11 | Physics, input, player | 2405 |
| 12 | Interaction | 2692 |
| 13 | Inventory and screens | 3014 |
| 14 | Entities | 3269 |
| 15 | Mobs | 3457 |
| 16 | Simulation | 3762 |
| 17 | Sky and weather | 4036 |
| 18 | HUD, persistence, menus | 4135 |
| 19 | Bootstrap and main loop | 4309 |

### Utilities (Section 1)

| Name | Line |
|------|------|
| `chunkKey(cx,cz)` | 280 |
| `hashString` | 283 |
| `class Rand` | 295 |
| `const rng = new Rand(Date.now()&0x7fffffff)` | 310 |
| `class Noise` | 313 |
| `class GrowBuf` | 397 |
| `Scheduler` | 412 |
| `Events` | 436 |
| `$ = id => document.getElementById(id)` | 443 |

**Constants**:
- `CHUNK_W=16`, `CHUNK_H=128`, `CHUNK_VOL`, `SEA_LEVEL=62`
- `TICK_RATE=20`, `TICK_DT`, `DAY_LENGTH=24000`
- `bidx=(x<<11)|(z<<7)|y`
- `DIRS`, `FACE_PX`..`FACE_NZ`, `HDIRS`

**Helpers**: `clamp`, `lerp`, `smoothstep`, `floor`, `dist2`, `hexToRgb`, `rgbToHex`, `mixColor`, `posKey` (x,z ±2^20, y 0..255).

### Porting Notes for Three.js r170
- No `outputEncoding` / `Encoding` usage and no `addAttribute`.
- Chunk shader uses `#include <fog_pars_vertex>` / `fog_vertex` / `fog_pars_fragment` / `fog_fragment` (lines 1920–1943).
- `THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {...}])` at line 1998.
- Renderer (lines 4316–4317): `new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'})` with `setPixelRatio(min(dpr,1.5))`.
- Menu preview: `HemisphereLight(0xffffff,0x666666,0.95)` + `DirectionalLight(0xffffff,0.45)` (lines 4061–4062).
- **Caveats**: r170 defaults to sRGB output and physically correct lights. Custom `ShaderMaterial` colors may need `colorSpace` handling; Lambert intensities may need ×π.

### THREE.* APIs Used (to port)
`BufferAttribute` ×10, `Mesh` ×9, `NearestFilter`, `CanvasTexture`, `PointsMaterial`, `MeshLambertMaterial`, `Group`, `BufferGeometry`, `BoxGeometry`, `Points`, `Color`, `ShaderMaterial` ×2 + `UniformsUtils`/`UniformsLib` (fog), `MeshBasicMaterial`, `WebGLRenderer`, `Vector3`, `Sprite`/`SpriteMaterial`, `SphereGeometry`, `Scene`, `PlaneGeometry`, `PerspectiveCamera`, `LineSegments`/`EdgesGeometry`/`LineBasicMaterial`, `HemisphereLight`, `DirectionalLight`, `Fog`, `FrontSide`/`BackSide`.

### Key Systems Summary

#### Recipes (Section 3)
- Fields: `shaped`, `shapeless`, `smelting`, `fuels`.
- Methods: `ingredientMatches(spec, stack)` (supports `tag:`, arrays, null), `addShaped`, `addShapeless`, `addSmelting`, `addFuel(item,seconds,container)`, `match(grid,gw,gh)` (bounding box + mirror).

#### Chunk / World (Sections 6–7, 10)
- **Chunk data**: `blocks`, `meta`, `sky`, `blk`, `height` (index `x*16+z`), `biomes`, `state` (`CH_EMPTY`…`CH_GENERATED`).
- Flags/meshes: `dirty`, `modified`, `mesh`/`waterMesh`/`meshed`, `tiles` Map, `spawned` passive.
- Methods: `updateHeight`, `recomputeHeights`.
- **World**: `chunks`, `stored`, `pendingFeatures`, `lastChunk` cache, `seed`. Methods: `reset(seed)`, `getChunk`, `chunkAt`, `isLoaded`, `getBlock`.

#### Lighting (Section 8)
- `get`/`set`; borders call `ChunkManager.markDirty`.
- `initChunk` steps: column sky light → BFS seeds → `seedFromNeighbors` → propagate → block light from emitters.
- Exposes `getBlockLight` (line 1357) and `getLightLevel(x,y,z,skyFactor)`.

#### Meshing (Section 9)
- `FACE_SHADE=[0.6,0.6,1.0,0.5,0.8,0.8]`, `AO_CURVE=[0.45,0.65,0.85,1.0]`.
- Padded indexing: `pidx` with `PX=18`, `PY=CHUNK_H+2`, `PZ=18`; `OPEN_SIDE` for doors.
- Shaders (`CHUNK_VERT`/`CHUNK_FRAG`): attributes `tile`, `light`, `tint`; uniforms `uAtlas`, `uTiles`, `uSkyBright`, `uAlphaTest`, `uNightTint`.
- Brightness: `br = 0.035+0.965*(l*l*0.55+l*0.45)`.
- `GrowBuf.toGeometry()` at line 1972.
- `blockBoxes(def, meta)`: `null` = full cube, `[]` = none.
- `emitFace(b, face, x0..z1, tile, cl, tint, shade, uvo, bothSides)`.
- Corner lights: `[sky, blk, ao]`.
- Tints: `biome.grassRGB`, `foliageRGB`, `waterRGB`, `BIRCH_RGB`, `SPRUCE_RGB`.

#### Physics (Section 11)
- Constants: `GRAVITY:32`, `TERMINAL:78`, `JUMP_VEL:8.4`.
- `collectBoxes`: unloaded terrain = solid + void floor.
- `sweep(e,axis,d,boxes)`: AABB `{x,y,z,w,h}` with 1-block step-up.

#### Interaction (Section 12, ~2706+)
- `buildCrackTextures()`: draws `destroy_stage_0..9` into `CanvasTexture`s at `Atlas.tileRes`. Reruns on `atlasRebuilt`.
- Mousedown resets `useCooldown`/`attackCooldown`.
- `reach()`: 6 creative / 4.5 survival.
- `raycast(ox,oy,oz,dx,dy,dz,maxDist,hitLiquid=false)`: voxel DDA (≤200 steps), non-cube via `blockBoxes` + `rayBox`. Returns `{x,y,z,face,px,py,pz,dist}`.
- `rayBox(ox,oy,oz,dx,dy,dz,x0..z1)`: slab test returning `[t, face]`.

#### Particles (Section 14)
- `MAX:4000`, `Points` + `PointsMaterial({size:0.14, vertexColors, sizeAttenuation})`, `frustumCulled=false`.
- Methods: `spawn(...)`, `blockBreak(x,y,z,def,count)` (colors from `Atlas.avgColor` × `Mesher.tintFor`), `burst(...)`.

#### Fluids (Section 16)
- Meta: `0` = source, `1..7` = flowing (7 thinnest), `8` = falling column.
- Strength: 8 for source/falling, `8−meta` for flowing. Water loses 1/block, lava 2.
- Delay: water 5, lava 25. Scheduled via `Scheduler.add(..., TICK_FLUID)`.
- No supply → AIR. Infinite water: 2+ adjacent sources over solid (or water below) → new source.
- Water + lava → obsidian (source) / cobblestone (flowing).
- Random ticks: snow melts at block light ≥12, ice → water at ≥11 (lines 3943–3944).

#### Block Registry Fields (~481)
`id`, `name`, `displayName`, `tex`, `model`, `hardness`, `tool`, `tier`, `requiresTool`, `solid`, `transparent`, `cullSame`, `opaque`, `opacity`, `light`, `tint`, `drops`, `replaceable`, `flammable`, `box` (1/16), `variants`, `facing`, `liquid`, `climbable`, `gravity`, `damage`, `needsSupport`.

**Redstone blocks**: lines 599, 608, 644–646.

#### Item Uses (`defineItemUses`, ~2960)
- `bucket.onUse`: picks up source liquid (`meta===0`), then `Inventory.replaceHeld`.
- `placeLiquid(blockId, emptyTo)`: places at target or offset by `DIRS[t.face]` if not replaceable. Skips emptying in creative.
- Hoes (per tier from `TOOL_TIERS`): till grass/dirt/`dirt_path`.
- Also: seeds, flint & steel, bow.

#### Mobs (Section 15)
| Mob | w | h | health | speed | Flags | Drops |
|-----|---|---|--------|-------|-------|-------|
| pig | 0.45 | 0.9 | 10 | 1.6 | passive | porkchop |
| cow | 0.45 | 1.4 | 10 | 1.5 | passive | beef, leather |
| sheep | 0.45 | 1.3 | 8 | 1.5 | passive | mutton |
| chicken | 0.2 | 0.7 | 4 | 1.7 | passive | chicken, feather |
| zombie | 0.3 | 1.95 | 20 | 2.4 | hostile, damage:3, burns | rotten_flesh |
| skeleton | 0.3 | 1.99 | 20 | 2.6 | hostile, ranged, burns | bone, arrow |
| creeper | 0.3 | 1.7 | 20 | 2.6 | hostile, explodes | gunpowder |

- Fields/methods: `list`, `scene`, `faceTex` Map, `init(scene)`, `clear()`.
- `faceTexture(type, base)` paints 8px faces with `Pix`.
- Always procedural colors. Sheep wool from `SHEEP_COLOR_WEIGHTS`.

#### Save / Persistence (Section 18)
- `saveSync()` → `localStorage[KEY]`; `hasSave()` checks existence.
- `loadData()`: raw JSON if starts with `{`, else JSZip base64 → `world.json`.
- `apply(data)` requires `version===1`, then `Game.start(String(data.seed), data)`.
- `exportFile()` downloads `voxelcraft_${Game.seed}.json`; `importFile` uses `FileReader`.
- Format: JSZip deflate + base64, RLE on modified chunks.

#### Menus / Atlas / Procedural Textures
- `Menus.init`: `packstatus`/`packstatus2` elements. `ResourcePack.load(file)` returns `{count,total}`. Resolution in `Atlas.tileRes`.
- Procedural (`G.name=(p)=>...`): uses `p.mottle`, `p.rect`, `p.set`, `p.line`, `p.ellipse`, `p.outline`, `p.r`. Defines `destroy_stage_0..9`. **Remove redstone_lamp textures**.

#### Terrain
- Biomes: `BIO_DEEP_OCEAN`, `OCEAN`, `MOUNTAINS`, `BEACH`, `TAIGA`, `SNOWY`, `DESERT`, `BIRCH`, `FOREST`, `PLAINS`.
- Noises: `nCont`, `nEro`, `nHill`, `nRidge`, `nTemp`, `nHum`, `nCaveA`, `nCaveB`, `nRavine`, `nDetail`.
- `Terrain.generateChunk(c)` ~1541.

#### Input / Other
- Fields: `keys`, `buttons`, `dx`, `dy`, `locked`, `wheel`.
- Events: `'keypress'|'mousedown'|'unlock'`.
- Mouse lock only when `Game.running && !Screens.isOpen() && !Game.paused`.
- Keys: G, T, R, F1, F3, Q, F, E.
- 20Hz simulation; **no audio**, **no touch support**.
- `ChunkManager.update(player.x, player.z, 6)` at line 4412.
- KeyG handling at 2684.

### Key Code Locations

| Item | Line(s) |
|------|---------|
| Block registry fields | ~481 |
| `Blocks.define(...)` calls | ~569–650 |
| Procedural textures `G.*` | ~1000–1100 |
| `Terrain.generateChunk(c)` | ~1541 |
| `Mesher.emitFace(...)` | ~2048 |
| Input | ~2491 |
| player | ~2520 |
| KeyG handling | 2684 |
| `rayBox` | ~2942 |
| `defineItemUses` | ~2960 |
| Particles | ~3270 |
| `MOB_TYPES` | ~3460 |
| Fluids | ~3766 |
| STUB index | 4448–4460 |

---

## VoxelCraft.html (Reference)

- **Origin**: https://senko.net/vibecode-bench/2026/voxel-opus-5.5.html (Three r160 ESM, VT323 font, 2590 lines).
- **Constants**: `CS=16`, `CH=96`, `SEA=40`, `PS=64`. `updateChunks` at line 1366.
- **Title/splash**: CSS `#splash` (line 51); markup `<div id="title">VOXELCRAFT<span id="splash">Now with creepers!</span></div>` (line 176). Low health: `#hearts.low` + shake keyframes.
- **Sound (`SND` at line 856)**:
  - `SND.splash()`, `SND.explode(pos)`.
  - `sndNoise(dur,freq,{q,vol,type,pos,freqEnd,delay})`, `sndTone(freq,freqEnd,dur,{type,vol,pos,delay,lp})`.
  - Uses `spatial(pos)`, `noiseBuf`, `master`.
  - `SOUND_MAT` maps materials (stone/wood/grass/gravel/sand/snow/glass) → `[freq,q,filter]`.
  - `sndBlock(id,pos,kind)` for block sounds.
- **Player (line 1442)**: `pos`, `vel`, `hw:0.3`, `h:1.8`, `yaw`, `pitch`, `onGround`, `hitWall`, `inWater`, `eyeInWater`, `health:20`, `fly`, `airMaxY:80`, `invuln`, `kbTime`, `hurtT`, `dead`, `regen`, `sprint`, `bob`, `bobAmt`, `stepDist`.
  - `inputActive = uiMode===null && (locked||testMode) && !player.dead`.
- **updatePlayer(dt) & fall damage**:
  - Decays `invuln`/`kbTime`/`hurtT`; regen 1 HP / 4s when <20.
  - Movement: `wx=-sn*fw+cs*st`, `wz=-cs*fw-sn*st` (normalized).
  - Water check at feet+0.1 / +0.8. Entering water with `vel.y<-6` → `SND.splash()`.
  - Sprint: `act && !fly && Shift && fw>0`. Flight smoothing `k=1-exp(-dt*8)`.
  - Speeds: water 2.3, sprint 5.6, walk 4.3.
  - Fall damage (1490–1495): on land `fall=p.airMaxY-p.pos.y` then reset; airborne tracks max. Respawn sets `airMaxY=pos.y`, `invuln=2`.
  - Mobs: damage `floor(fall-3)` when `fall>3.4` (line 1972).
  - Bob: `bobAmt` lerps toward `min(1,hs/4.3)` on ground; `bob += hs*dt*1.9`.
- **Camera effects**:
  - Explosion shake scaled by distance/30 (line 2057).
  - Bob: `bobY=-|cos(bob)|*0.07*bobAmt`, `bobX=sin(bob)*0.04*bobAmt` (2529–2534). Death drops camera −1.3.
  - Roll: `sin(hurtT/0.4*π)*0.12 + (dead?0.6:0)` + shake jitter.
  - FOV: `settings.fov*(sprint?1.1:1)*(eyeInWater?0.92:1)`.
- **Held item (`updateHeld` ~2245)**: `swingT` (0.28s), `equipT` (0.2s) on `heldPivot` + bob coupling.
- **Sky**: `updateSky` uses `worldTime`, colors (`cDayTop`/`cDayHor`/`cNightTop`/`cNightHor`/`cSunset`/`cWater`), `skyDarken` from `NIGHT_DARKEN`. `cloudDrift`.
- **Settings/storage**: `settings` holds `rd`, `fov`, `sens`. Keys: `voxelcraft-save-v1`, `voxelcraft-settings-v1`.

---

## old.htm ("青屿")

- **Size & stack**: 1406 lines. Importmap: three@0.170.0 + tweakpane@4.0.5. 8 module scripts coupled via `gg`.
- **CSS**: `#hud` 200×200 minimap canvas (bottom-left); `#tip` help text.
- **`gg = window.gg`**: `{THREE, tickers:[], ctl:{yaw,pitch,fly:true,vy,keys,rising,lastSpace,grounded}, terrainDirty}`.
- **`gg.P`** (normalized −1..1 with log support via `ranges`/`toActual`):
  - Terrain: `seed`, `scaleWater`, `peakSharp`, `ridgeFrac`, `offset`
  - Sky/render: `hour`, `sun:1.25`, `exposure:1.08`, `fog:0.12`, `wire`, `lightDir`, `wind`
  - Colors: `cDeep`, `cShallow`, `cPlat`, `cSnow`
  - Movement: `speed:22`, `smooth:12`
- **Terrain**: `gg.height(x,z)`, `gg.waterY`, seeded Simplex + LCG (`gg.seedNoise`).
- **Script layout highlights**:
  - Script 1: `ranges` (146), `toActual` (165), `gg.noiseUI`, `gg.pane = new Pane({title:'青屿-生成体素世界块'})` (199), `gg.refreshNoisePanel` (233), `gg.renderer` (128), camera `PerspectiveCamera(70,1,0.1,700)`.
  - Script 2 (245): `gg.terrainMat` = `MeshStandardMaterial({vertexColors, flatShading, roughness:.95})`, `gg.colorAt(h,out)`.
  - Sky (359): `gg.sun` DirectionalLight, hemi `(0xc8fff4,0x0c3c42,0.55)`, moon `(0x9ec4ff,0.2)`, fill ambient `(0x8fdfff,0.18)`. `FogExp2(0x6fb7c8,.003)`. Gradient sphere ShaderMaterial (stars with `step(.997)`), `renderOrder=-1`. Night factor via smoothstep hours 5–7 / 17–19.
- **VOX panel (619+)**: `hmRes` options 256–2048 (readonly). '体素地形' folder: `size` (0.5–6), `stoneH`, `snowH`, `steep` (0.5–3). `gg.voxelizeGeometry(mesh,V)` rasterizes triangles into height/color grid aligned to world V multiples.
- **Fauna (1219+)**: Spatial hash class `Hash` (`T=1<<12`, `key(cx,cz,l)`, `build(groups)`, `each(x,z,l,r,layers,fn)`). Low-poly `build.deer`/`crab`/... models facing −Z. Boids (deer, crab, gull, ray).
- **Shader uniforms**: `aoStrength`, `aoCurve`, `shadowStrength`, `shadowDist`, `SHADOW_STEPS`, `ambient`, `sunColor`, `waveStrength`, `waterClarity`, `waterShallow`, `waterDeep`. Fresnel: `0.02+0.98*pow(1-cosT,5)`. Clarity: `k=mix(1.5,0.06,waterClarity)`.
- **Rendering**: Max-Mip DDA with `sceneRT` + `tDepth` compositing, 10ms budget, view-direction prefetch.
- **Controls**: mouse sensitivity 0.002, pitch ±1.5 clamp. Double-tap Space (300ms) to fly; Ctrl descend; Shift ×5. `CAM_R=0.7` camera collision. `beforeunload` guard. Two-finger touch emulates WASD. Minimap teleport.
- **Messiness notes**: `build` overwritten twice, deprecated panel, stray `// ===== voxel.js` line in body.

---

## Cross-Project Notes
- **bridge-mind** is the primary full Minecraft-like engine (blocks, inventory, recipes, fluids, mobs, lighting, meshing, save).
- **VoxelCraft** provides polished reference for audio, camera feel, fall damage, held-item animation, sky.
- **青屿 (old.htm)** provides modern Three r170 + Tweakpane workflow, advanced terrain controls, fauna, water/shader techniques, and minimap.
- Porting target appears to be aligning bridge-mind toward r170 while selectively integrating features from the other two.