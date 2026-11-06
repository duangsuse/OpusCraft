// Block registry. A stored block value is 16 bits: low 12 bits = block type, high 4 bits = metadata (state).
// Shared between the main thread and workers (no DOM usage).

export const META_SHIFT = 12;
export const TYPE_MASK = 0xfff;
export const typeOf = (v) => v & TYPE_MASK;
export const metaOf = (v) => v >>> META_SHIFT;
export const mk = (type, meta = 0) => type | (meta << META_SHIFT);

// Face order (matches Minecraft's Direction order)
export const DOWN = 0, UP = 1, NORTH = 2, SOUTH = 3, WEST = 4, EAST = 5;
export const FACE_DIR = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
export const OPPOSITE = [1, 0, 3, 2, 5, 4];
// Horizontal facing order used in metadata: 0 north, 1 south, 2 west, 3 east
export const HFACE = [NORTH, SOUTH, WEST, EAST];

// Render layers
export const L_SOLID = 0, L_CUTOUT = 1, L_TRANSLUCENT = 2;

// Shader material ids (written per-vertex)
export const MAT = {
  DEFAULT: 0, PLANT: 1, LEAVES: 2, WATER: 3, LAVA: 4, EMISSIVE: 5, GLASS: 6, METAL: 7, ICE: 8, PLANT_TOP: 9, FIRE: 10, PORTAL: 11, SNOW: 12, SAND: 13, GRASS_BLOCK: 14,
};

export const BLOCKS = [];
export const ID = Object.create(null);

const DEFAULTS = {
  model: 'cube', opaque: true, layer: L_SOLID, light: 0, hardness: 1, resistance: null, tool: null, level: 0, requiresTool: false,
  sound: 'stone', solid: true, replaceable: false, tint: null, drops: undefined, mat: MAT.DEFAULT, friction: 0.6, speedFactor: 1,
  gravity: false, item: true, climbable: false, fluid: null, waterlogged: false, cull: 'opaque', interact: null, flammable: false,
};

function def(name, props = {}) {
  const id = BLOCKS.length;
  const b = Object.assign({}, DEFAULTS, props);
  b.id = id; b.name = name;
  b.displayName = props.displayName || name.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' ');
  if (b.lightOpacity === undefined) b.lightOpacity = b.opaque ? 15 : 0;
  if (b.resistance === null) b.resistance = Math.max(0, b.hardness);
  b.texFaces = normalizeTex(b.tex !== undefined ? b.tex : name);
  BLOCKS.push(b);
  ID[name] = id;
  return id;
}

// tex can be: 'name' | {all} | {top,bottom,side} | {end, side} | {top, bottom, front, side} | {down,up,north,south,west,east}
function normalizeTex(t) {
  if (t === null) return null;
  if (typeof t === 'string') return [t, t, t, t, t, t];
  const side = t.side || t.all;
  const end = t.end;
  const top = t.top || end || t.all || side;
  const bottom = t.bottom || end || t.all || side;
  return [t.down || bottom, t.up || top, t.north || side, t.south || side, t.west || side, t.east || side, t.front || null];
}

const plant = (extra = {}) => ({ model: 'cross', opaque: false, layer: L_CUTOUT, hardness: 0, sound: 'grass', solid: false, replaceable: false, mat: MAT.PLANT, drops: undefined, ...extra });
const ore = (name, extra) => def(name, { hardness: name.startsWith('deepslate') ? 4.5 : 3, tool: 'pickaxe', requiresTool: true, sound: name.startsWith('deepslate') ? 'deepslate' : 'stone', ...extra });

// ---- Air & terrain -------------------------------------------------------------------------------
def('air', { model: 'none', opaque: false, solid: false, replaceable: true, item: false, hardness: 0, tex: null });
def('stone', { hardness: 1.5, resistance: 6, tool: 'pickaxe', requiresTool: true, drops: 'cobblestone' });
def('granite', { hardness: 1.5, tool: 'pickaxe', requiresTool: true });
def('polished_granite', { hardness: 1.5, tool: 'pickaxe', requiresTool: true });
def('diorite', { hardness: 1.5, tool: 'pickaxe', requiresTool: true });
def('polished_diorite', { hardness: 1.5, tool: 'pickaxe', requiresTool: true });
def('andesite', { hardness: 1.5, tool: 'pickaxe', requiresTool: true });
def('polished_andesite', { hardness: 1.5, tool: 'pickaxe', requiresTool: true });
def('deepslate', { tex: { end: 'deepslate_top', side: 'deepslate' }, hardness: 3, tool: 'pickaxe', requiresTool: true, sound: 'deepslate', drops: 'cobbled_deepslate', axis: true });
def('cobbled_deepslate', { hardness: 3.5, tool: 'pickaxe', requiresTool: true, sound: 'deepslate' });
def('tuff', { hardness: 1.5, tool: 'pickaxe', requiresTool: true, sound: 'stone' });
def('grass_block', { tex: { top: 'grass_block_top', bottom: 'dirt', side: 'grass_block_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', tint: 'grass', drops: 'dirt', mat: MAT.GRASS_BLOCK, overlay: 'grass_block_side_overlay' });
def('dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def('coarse_dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def('podzol', { tex: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' }, hardness: 0.5, tool: 'shovel', sound: 'gravel', drops: 'dirt' });
def('farmland', { tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, model: 'farmland', opaque: false, lightOpacity: 0, hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: 'dirt', cull: 'none' });
def('dirt_path', { tex: { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt_path_side' }, model: 'farmland', opaque: false, lightOpacity: 0, hardness: 0.65, tool: 'shovel', sound: 'grass', drops: 'dirt' });
def('bedrock', { hardness: -1, resistance: 3600000, item: true });
def('sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true, mat: MAT.SAND });
def('red_sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true, mat: MAT.SAND });
def('gravel', { hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true });
def('clay', { hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: ['clay_ball', 4] });
def('sandstone', { tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' }, hardness: 0.8, tool: 'pickaxe', requiresTool: true });
def('red_sandstone', { tex: { top: 'red_sandstone_top', bottom: 'red_sandstone_bottom', side: 'red_sandstone' }, hardness: 0.8, tool: 'pickaxe', requiresTool: true });
def('snow_block', { tex: 'snow', hardness: 0.2, tool: 'shovel', requiresTool: true, sound: 'snow', drops: ['snowball', 4], mat: MAT.SNOW });
def('snow', { tex: 'snow', model: 'layer', opaque: false, lightOpacity: 0, hardness: 0.1, tool: 'shovel', requiresTool: true, sound: 'snow', replaceable: true, drops: ['snowball', 1], mat: MAT.SNOW, displayName: 'Snow' });
def('ice', { opaque: false, layer: L_TRANSLUCENT, lightOpacity: 1, hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drops: null, mat: MAT.ICE, cull: 'self' });
def('packed_ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drops: null, mat: MAT.ICE });
def('obsidian', { hardness: 50, resistance: 1200, tool: 'pickaxe', level: 3, requiresTool: true });
def('water', { tex: { top: 'water_still', bottom: 'water_still', side: 'water_flow' }, model: 'fluid', opaque: false, layer: L_TRANSLUCENT, lightOpacity: 1, hardness: 100, solid: false, replaceable: true, item: false, fluid: 'water', tint: 'water', mat: MAT.WATER, sound: 'none', cull: 'fluid' });
def('lava', { tex: { top: 'lava_still', bottom: 'lava_still', side: 'lava_flow' }, model: 'fluid', opaque: false, layer: L_SOLID, lightOpacity: 1, light: 15, hardness: 100, solid: false, replaceable: true, item: false, fluid: 'lava', mat: MAT.LAVA, sound: 'none', cull: 'fluid' });
for (const c of ['terracotta', 'white_terracotta', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta', 'red_terracotta', 'light_gray_terracotta'])
  def(c, { hardness: 1.25, tool: 'pickaxe', requiresTool: true });

// ---- Ores ----------------------------------------------------------------------------------------
ore('coal_ore', { drops: 'coal', xp: [0, 2] });
ore('iron_ore', { level: 1, drops: 'raw_iron' });
ore('copper_ore', { level: 1, drops: ['raw_copper', 2, 5] });
ore('gold_ore', { level: 2, drops: 'raw_gold' });
ore('redstone_ore', { level: 2, drops: ['redstone', 4, 5], xp: [1, 5] });
ore('lapis_ore', { level: 1, drops: ['lapis_lazuli', 4, 9], xp: [2, 5] });
ore('diamond_ore', { level: 2, drops: 'diamond', xp: [3, 7] });
ore('emerald_ore', { level: 2, drops: 'emerald', xp: [3, 7] });
ore('deepslate_coal_ore', { drops: 'coal', xp: [0, 2] });
ore('deepslate_iron_ore', { level: 1, drops: 'raw_iron' });
ore('deepslate_copper_ore', { level: 1, drops: ['raw_copper', 2, 5] });
ore('deepslate_gold_ore', { level: 2, drops: 'raw_gold' });
ore('deepslate_redstone_ore', { level: 2, drops: ['redstone', 4, 5], xp: [1, 5] });
ore('deepslate_lapis_ore', { level: 1, drops: ['lapis_lazuli', 4, 9], xp: [2, 5] });
ore('deepslate_diamond_ore', { level: 2, drops: 'diamond', xp: [3, 7] });
ore('deepslate_emerald_ore', { level: 2, drops: 'emerald', xp: [3, 7] });

// ---- Mineral blocks ------------------------------------------------------------------------------
def('coal_block', { hardness: 5, tool: 'pickaxe', requiresTool: true });
def('iron_block', { hardness: 5, tool: 'pickaxe', level: 1, requiresTool: true, sound: 'metal', mat: MAT.METAL });
def('gold_block', { hardness: 3, tool: 'pickaxe', level: 2, requiresTool: true, sound: 'metal', mat: MAT.METAL });
def('diamond_block', { hardness: 5, tool: 'pickaxe', level: 2, requiresTool: true, sound: 'metal' });
def('emerald_block', { hardness: 5, tool: 'pickaxe', level: 2, requiresTool: true, sound: 'metal' });
def('lapis_block', { hardness: 3, tool: 'pickaxe', level: 1, requiresTool: true });
def('redstone_block', { hardness: 5, tool: 'pickaxe', requiresTool: true, sound: 'metal', power: true });
for (const c of ['copper_block', 'exposed_copper', 'weathered_copper', 'oxidized_copper', 'cut_copper', 'exposed_cut_copper', 'weathered_cut_copper', 'oxidized_cut_copper'])
  def(c, { hardness: 3, tool: 'pickaxe', level: 1, requiresTool: true, sound: 'copper', mat: MAT.METAL });

// ---- Wood ----------------------------------------------------------------------------------------
export const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry'];
const LEAF_TINT = { oak: 'foliage', spruce: 'spruce', birch: 'birch', jungle: 'foliage', acacia: 'foliage', dark_oak: 'foliage', cherry: null };
for (const w of WOODS) {
  const ws = w === 'cherry' ? 'cherry_wood' : 'wood';
  def(`${w}_log`, { tex: { end: `${w}_log_top`, side: `${w}_log` }, hardness: 2, tool: 'axe', sound: ws, axis: true, flammable: true });
  def(`${w}_planks`, { hardness: 2, resistance: 3, tool: 'axe', sound: ws, flammable: true });
  def(`${w}_leaves`, {
    opaque: false, layer: L_CUTOUT, lightOpacity: 1, hardness: 0.2, tool: 'hoe', sound: w === 'cherry' ? 'cherry_leaves' : 'grass', tint: LEAF_TINT[w],
    mat: MAT.LEAVES, cull: 'leaves', drops: `leaves:${w}`, flammable: true,
  });
  def(`${w}_sapling`, plant({ drops: undefined }));
}

// ---- Plants --------------------------------------------------------------------------------------
def('short_grass', plant({ tint: 'grass', replaceable: true, drops: 'seeds', displayName: 'Grass' }));
def('tall_grass', plant({ tex: 'tall_grass_bottom', texTop: 'tall_grass_top', model: 'double_plant', tint: 'grass', replaceable: true, drops: 'seeds' }));
def('fern', plant({ tint: 'grass', replaceable: true, drops: 'seeds' }));
def('large_fern', plant({ tex: 'large_fern_bottom', texTop: 'large_fern_top', model: 'double_plant', tint: 'grass', replaceable: true, drops: 'seeds' }));
export const FLOWERS = ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley'];
for (const f of FLOWERS) def(f, plant({ offset: true }));
def('sunflower', plant({ tex: 'sunflower_bottom', texTop: 'sunflower_top', model: 'double_plant', sunflower: true }));
def('lilac', plant({ tex: 'lilac_bottom', texTop: 'lilac_top', model: 'double_plant' }));
def('rose_bush', plant({ tex: 'rose_bush_bottom', texTop: 'rose_bush_top', model: 'double_plant' }));
def('peony', plant({ tex: 'peony_bottom', texTop: 'peony_top', model: 'double_plant' }));
def('dead_bush', plant({ replaceable: true, drops: ['stick', 0, 2], mat: MAT.PLANT }));
def('cactus', { tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, model: 'cactus', opaque: false, layer: L_CUTOUT, lightOpacity: 0, hardness: 0.4, sound: 'cloth', cull: 'none', damage: 1 });
def('sugar_cane', plant({ tint: 'grass', mat: MAT.DEFAULT }));
def('pumpkin', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood' });
def('carved_pumpkin', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'carved_pumpkin' }, hardness: 1, tool: 'axe', sound: 'wood', facing: true });
def('jack_o_lantern', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_o_lantern' }, hardness: 1, tool: 'axe', sound: 'wood', facing: true, light: 15, displayName: "Jack o'Lantern" });
def('melon', { tex: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', drops: ['melon_slice', 3, 7] });
def('lily_pad', { model: 'lily_pad', opaque: false, layer: L_CUTOUT, hardness: 0, sound: 'grass', tint: 'lily', solid: true, mat: MAT.PLANT });
def('vine', { model: 'vine', opaque: false, layer: L_CUTOUT, hardness: 0.2, tool: 'shears', sound: 'grass', solid: false, replaceable: true, tint: 'foliage', climbable: true, mat: MAT.LEAVES, drops: null });
def('seagrass', plant({ replaceable: true, waterlogged: true, drops: null, sound: 'wet_grass', mat: MAT.PLANT }));
def('tall_seagrass', plant({ tex: 'tall_seagrass_bottom', texTop: 'tall_seagrass_top', model: 'double_plant', replaceable: true, waterlogged: true, drops: null, sound: 'wet_grass' }));
def('kelp', plant({ waterlogged: true, drops: 'kelp', sound: 'wet_grass' }));
def('kelp_plant', plant({ waterlogged: true, drops: 'kelp', sound: 'wet_grass', item: false }));
def('brown_mushroom', plant({ light: 1, mat: MAT.DEFAULT }));
def('red_mushroom', plant({ mat: MAT.DEFAULT }));
def('pink_petals', plant({ model: 'petals', tex: 'pink_petals', mat: MAT.DEFAULT }));
def('wheat', plant({ tex: 'wheat_stage7', model: 'crop', drops: 'wheat_crop', item: false, mat: MAT.PLANT }));

// ---- Building blocks -----------------------------------------------------------------------------
def('cobblestone', { hardness: 2, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('mossy_cobblestone', { hardness: 2, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('stone_bricks', { hardness: 1.5, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('mossy_stone_bricks', { hardness: 1.5, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('cracked_stone_bricks', { hardness: 1.5, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('chiseled_stone_bricks', { hardness: 1.5, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('smooth_stone', { hardness: 2, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('bricks', { hardness: 2, resistance: 6, tool: 'pickaxe', requiresTool: true });
def('glass', { opaque: false, layer: L_CUTOUT, hardness: 0.3, sound: 'glass', drops: null, mat: MAT.GLASS, cull: 'self' });
def('glass_pane', { tex: { all: 'glass', top: 'glass_pane_top', bottom: 'glass_pane_top' }, model: 'pane', opaque: false, layer: L_CUTOUT, hardness: 0.3, sound: 'glass', drops: null, mat: MAT.GLASS, cull: 'none' });
export const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
for (const c of COLORS) def(`${c}_wool`, { hardness: 0.8, sound: 'cloth', tool: 'shears', flammable: true });
def('bookshelf', { tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', drops: ['book', 3] });
def('crafting_table', { tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', north: 'crafting_table_front', west: 'crafting_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'crafting' });
def('furnace', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hardness: 3.5, tool: 'pickaxe', requiresTool: true, facing: true, interact: 'furnace' });
def('lit_furnace', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on' }, hardness: 3.5, tool: 'pickaxe', requiresTool: true, facing: true, light: 13, item: false, drops: 'furnace', interact: 'furnace', displayName: 'Furnace' });
def('chest', { tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, model: 'chest', opaque: false, lightOpacity: 0, hardness: 2.5, tool: 'axe', sound: 'wood', facing: true, interact: 'chest', cull: 'none' });
def('tnt', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', interact: 'tnt', displayName: 'TNT' });
def('glowstone', { light: 15, hardness: 0.3, sound: 'glass', drops: ['glowstone_dust', 2, 4], mat: MAT.EMISSIVE });
def('sea_lantern', { light: 15, hardness: 0.3, sound: 'glass', mat: MAT.EMISSIVE });
def('lantern', { model: 'lantern', opaque: false, layer: L_CUTOUT, light: 15, hardness: 3.5, tool: 'pickaxe', sound: 'lantern', mat: MAT.EMISSIVE, cull: 'none' });
def('torch', { model: 'torch', opaque: false, layer: L_CUTOUT, light: 14, hardness: 0, sound: 'wood', solid: false, mat: MAT.EMISSIVE });
def('redstone_torch', { model: 'torch', opaque: false, layer: L_CUTOUT, light: 7, hardness: 0, sound: 'wood', solid: false, mat: MAT.EMISSIVE, power: true });
def('ladder', { model: 'ladder', opaque: false, layer: L_CUTOUT, hardness: 0.4, tool: 'axe', sound: 'ladder', climbable: true, cull: 'none' });
def('rail', { model: 'rail', opaque: false, layer: L_CUTOUT, hardness: 0.7, tool: 'pickaxe', sound: 'metal', solid: false, rail: true });
def('powered_rail', { model: 'rail', opaque: false, layer: L_CUTOUT, hardness: 0.7, tool: 'pickaxe', sound: 'metal', solid: false, rail: true, poweredRail: true });
def('hay_block', { tex: { end: 'hay_block_top', side: 'hay_block_side' }, hardness: 0.5, tool: 'hoe', sound: 'grass', axis: true, displayName: 'Hay Bale' });
def('netherrack', { hardness: 0.4, tool: 'pickaxe', requiresTool: true, sound: 'netherrack' });
def('soul_sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', speedFactor: 0.4 });
def('nether_portal', { model: 'portal', opaque: false, layer: L_TRANSLUCENT, light: 11, hardness: -1, solid: false, item: false, mat: MAT.PORTAL, cull: 'self', sound: 'glass' });
def('fire', { tex: 'fire_0', model: 'fire', opaque: false, layer: L_CUTOUT, light: 15, hardness: 0, solid: false, replaceable: true, item: false, mat: MAT.FIRE, drops: null, damage: 1 });
def('cobweb', plant({ hardness: 4, tool: 'sword', drops: 'string', speedFactor: 0.05, web: true, mat: MAT.DEFAULT, sound: 'stone' }));
def('iron_bars', { tex: 'iron_bars', model: 'pane', opaque: false, layer: L_CUTOUT, hardness: 5, tool: 'pickaxe', requiresTool: true, sound: 'metal', mat: MAT.METAL, cull: 'none', bars: true });
def('oak_door', { tex: { all: 'oak_door_bottom' }, texTop: 'oak_door_top', model: 'door', opaque: false, layer: L_CUTOUT, hardness: 3, tool: 'axe', sound: 'wood', interact: 'door', cull: 'none' });
def('oak_trapdoor', { model: 'trapdoor', opaque: false, layer: L_CUTOUT, hardness: 3, tool: 'axe', sound: 'wood', interact: 'trapdoor', cull: 'none' });

// Slabs / stairs / fences (shapes derived from a base block's textures)
const SHAPED = [
  ['oak', 'oak_planks', 'wood'], ['spruce', 'spruce_planks', 'wood'], ['birch', 'birch_planks', 'wood'], ['jungle', 'jungle_planks', 'wood'],
  ['acacia', 'acacia_planks', 'wood'], ['dark_oak', 'dark_oak_planks', 'wood'], ['cherry', 'cherry_planks', 'cherry_wood'],
  ['cobblestone', 'cobblestone', 'stone'], ['stone_brick', 'stone_bricks', 'stone'], ['mossy_cobblestone', 'mossy_cobblestone', 'stone'],
  ['stone', 'stone', 'stone'], ['sandstone', 'sandstone', 'stone'], ['brick', 'bricks', 'stone'], ['polished_andesite', 'polished_andesite', 'stone'],
  ['cut_copper', 'cut_copper', 'copper'], ['oxidized_cut_copper', 'oxidized_cut_copper', 'copper'], ['cobbled_deepslate', 'cobbled_deepslate', 'deepslate'],
];
for (const [n, base, sound] of SHAPED) {
  const bb = BLOCKS[ID[base]];
  const isWood = sound.includes('wood');
  const common = { tex: bb.tex !== undefined ? bb.tex : base, opaque: false, lightOpacity: 0, hardness: bb.hardness, tool: bb.tool, requiresTool: bb.requiresTool, level: bb.level, sound, cull: 'none', mat: bb.mat, base: ID[base] };
  def(`${n}_slab`, { ...common, model: 'slab', tex: base === 'sandstone' ? { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' } : common.tex });
  def(`${n}_stairs`, { ...common, model: 'stairs', tex: base === 'sandstone' ? { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' } : common.tex });
  if (isWood) def(`${n}_fence`, { ...common, model: 'fence' });
}
def('smooth_stone_slab', { tex: { top: 'smooth_stone', bottom: 'smooth_stone', side: 'smooth_stone_slab_side' }, model: 'slab', opaque: false, lightOpacity: 0, hardness: 2, tool: 'pickaxe', requiresTool: true, cull: 'none', base: ID.smooth_stone });
def('cobblestone_wall', { tex: 'cobblestone', model: 'wall', opaque: false, lightOpacity: 0, hardness: 2, tool: 'pickaxe', requiresTool: true, cull: 'none' });
def('white_carpet', { tex: 'white_wool', model: 'carpet', opaque: false, lightOpacity: 0, hardness: 0.1, sound: 'cloth' });
def('red_carpet', { tex: 'red_wool', model: 'carpet', opaque: false, lightOpacity: 0, hardness: 0.1, sound: 'cloth' });

export const NUM_TYPES = BLOCKS.length;

// ---- Fast lookup tables (typed arrays indexed by type) -------------------------------------------
export const T_OPAQUE = new Uint8Array(4096);      // full opaque cube (culls faces, casts AO)
export const T_SOLID = new Uint8Array(4096);       // has collision
export const T_LIGHT = new Uint8Array(4096);       // emitted light
export const T_OPACITY = new Uint8Array(4096);     // light opacity
export const T_LAYER = new Uint8Array(4096);
export const T_FLUID = new Uint8Array(4096);       // 1 water, 2 lava
export const T_REPLACEABLE = new Uint8Array(4096);
export const T_FULLCUBE = new Uint8Array(4096);    // uses the full-cube fast path in the mesher
for (const b of BLOCKS) {
  T_OPAQUE[b.id] = b.opaque ? 1 : 0;
  T_SOLID[b.id] = b.solid ? 1 : 0;
  T_LIGHT[b.id] = b.light;
  T_OPACITY[b.id] = b.lightOpacity;
  T_LAYER[b.id] = b.layer;
  T_FLUID[b.id] = b.fluid === 'water' ? 1 : b.fluid === 'lava' ? 2 : (b.waterlogged ? 1 : 0);
  T_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
  T_FULLCUBE[b.id] = b.model === 'cube' ? 1 : 0;
}

export const AIR = ID.air;
export const isWater = (v) => T_FLUID[v & TYPE_MASK] === 1;
export const isLava = (v) => T_FLUID[v & TYPE_MASK] === 2;
export const blockDef = (v) => BLOCKS[v & TYPE_MASK];

// Every texture name referenced by the registry (used to build the texture array).
export function allBlockTextureNames() {
  const set = new Set();
  for (const b of BLOCKS) {
    if (b.texFaces) for (const t of b.texFaces) if (t) set.add(t);
    if (b.texTop) set.add(b.texTop);
    if (b.overlay) set.add(b.overlay);
  }
  for (let i = 0; i < 8; i++) set.add('wheat_stage' + i);
  for (let i = 0; i < 10; i++) set.add('destroy_stage_' + i);
  ['grass_block_snow', 'rail_corner', 'powered_rail_on', 'oak_door_top', 'oak_trapdoor', 'kelp_plant', 'pink_petals_stem', 'sunflower_front', 'sunflower_back',
    'farmland_moist', 'glass_pane_top', 'water_flow', 'lava_flow', 'chest_front'].forEach(n => set.add(n));
  return [...set];
}

// Collision boxes in block-local coordinates [x0,y0,z0,x1,y1,z1]; neighbor lookup fn for connecting shapes.
const FULL = [[0, 0, 0, 1, 1, 1]];
export function collisionBoxes(v, get, x, y, z) {
  const t = v & TYPE_MASK, b = BLOCKS[t];
  if (!b.solid) return null;
  const m = v >>> META_SHIFT;
  switch (b.model) {
    case 'cube': return FULL;
    case 'slab': return m === 2 ? FULL : m === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
    case 'stairs': {
      const top = m & 4, f = m & 3;
      const base = top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
      const y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
      const step = f === 0 ? [0, y0, 0, 1, y1, 0.5] : f === 1 ? [0, y0, 0.5, 1, y1, 1] : f === 2 ? [0, y0, 0, 0.5, y1, 1] : [0.5, y0, 0, 1, y1, 1];
      return [base, step];
    }
    case 'layer': { const h = (m & 7) / 8; return h <= 0 ? null : [[0, 0, 0, 1, h, 1]]; }
    case 'farmland': return [[0, 0, 0, 1, 15 / 16, 1]];
    case 'cactus': return [[1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16]];
    case 'chest': return [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]];
    case 'carpet': return [[0, 0, 0, 1, 1 / 16, 1]];
    case 'lily_pad': return [[1 / 16, 0, 1 / 16, 15 / 16, 1.5 / 16, 15 / 16]];
    case 'lantern': return m & 1 ? [[5 / 16, 1 / 16, 5 / 16, 11 / 16, 15 / 16, 11 / 16]] : [[5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16]];
    case 'ladder': {
      const f = m & 3, t2 = 3 / 16;
      return f === 0 ? [[0, 0, 1 - t2, 1, 1, 1]] : f === 1 ? [[0, 0, 0, 1, 1, t2]] : f === 2 ? [[1 - t2, 0, 0, 1, 1, 1]] : [[0, 0, 0, t2, 1, 1]];
    }
    case 'door': {
      const f = m & 3, open = m & 4, t2 = 3 / 16;
      // closed door occupies the side opposite to facing; open door swings
      const ff = open ? [3, 2, 0, 1][f] : f;
      return ff === 0 ? [[0, 0, 1 - t2, 1, 1, 1]] : ff === 1 ? [[0, 0, 0, 1, 1, t2]] : ff === 2 ? [[1 - t2, 0, 0, 1, 1, 1]] : [[0, 0, 0, t2, 1, 1]];
    }
    case 'trapdoor': {
      const f = m & 3, open = m & 4, top = m & 8, t2 = 3 / 16;
      if (!open) return top ? [[0, 1 - t2, 0, 1, 1, 1]] : [[0, 0, 0, 1, t2, 1]];
      return f === 0 ? [[0, 0, 1 - t2, 1, 1, 1]] : f === 1 ? [[0, 0, 0, 1, 1, t2]] : f === 2 ? [[1 - t2, 0, 0, 1, 1, 1]] : [[0, 0, 0, t2, 1, 1]];
    }
    case 'fence': case 'pane': case 'wall': {
      const isFence = b.model !== 'pane';
      const w = b.model === 'fence' ? 2 / 16 : b.model === 'wall' ? 4 / 16 : 1 / 16;
      const h = isFence ? 1.5 : 1;
      const lo = 0.5 - w, hi = 0.5 + w;
      const boxes = [[lo, 0, lo, hi, h, hi]];
      if (get) {
        if (connects(b, get(x, y, z - 1))) boxes.push([lo, 0, 0, hi, h, lo]);
        if (connects(b, get(x, y, z + 1))) boxes.push([lo, 0, hi, hi, h, 1]);
        if (connects(b, get(x - 1, y, z))) boxes.push([0, 0, lo, lo, h, hi]);
        if (connects(b, get(x + 1, y, z))) boxes.push([hi, 0, lo, 1, h, hi]);
      }
      return boxes;
    }
    case 'fluid': case 'cross': case 'double_plant': case 'torch': case 'rail': case 'none': return null;
    default: return FULL;
  }
}

// Whether a fence/pane/wall connects to neighbor value v
export function connects(b, v) {
  const t = v & TYPE_MASK, nb = BLOCKS[t];
  if (!nb || t === 0) return false;
  if (nb.model === b.model) return b.model !== 'fence' || (nb.sound.includes('wood')) === (b.sound.includes('wood')) || true;
  if (b.model === 'fence' && nb.model === 'fence') return true;
  if (b.model === 'pane' && nb.model === 'pane') return true;
  return nb.opaque && nb.model === 'cube';
}

// Outline / selection box(es) for raycasting (includes non-solid blocks like flowers and torches)
export function selectionBoxes(v, get, x, y, z) {
  const t = v & TYPE_MASK, b = BLOCKS[t], m = v >>> META_SHIFT;
  if (t === 0 || b.fluid) return null;
  switch (b.model) {
    case 'cross': case 'double_plant': {
      if (b.name === 'short_grass' || b.name === 'fern' || b.name === 'seagrass') return [[2 / 16, 0, 2 / 16, 14 / 16, 13 / 16, 14 / 16]];
      if (b.offset) return [[5 / 16, 0, 5 / 16, 11 / 16, 10 / 16, 11 / 16]];
      if (b.name.endsWith('mushroom')) return [[5 / 16, 0, 5 / 16, 11 / 16, 6 / 16, 11 / 16]];
      return [[2 / 16, 0, 2 / 16, 14 / 16, b.model === 'double_plant' ? 1 : 13 / 16, 14 / 16]];
    }
    case 'crop': return [[0, 0, 0, 1, ((m & 7) + 1) * 2 / 16, 1]];
    case 'petals': return [[0, 0, 0, 1, 3 / 16, 1]];
    case 'torch': {
      if (m === 0) return [[6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16]];
      const f = m - 1; // facing away from wall
      return f === 0 ? [[5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1]] : f === 1 ? [[5.5 / 16, 3 / 16, 0, 10.5 / 16, 13 / 16, 5 / 16]]
        : f === 2 ? [[11 / 16, 3 / 16, 5.5 / 16, 1, 13 / 16, 10.5 / 16]] : [[0, 3 / 16, 5.5 / 16, 5 / 16, 13 / 16, 10.5 / 16]];
    }
    case 'rail': return [[0, 0, 0, 1, (m & 7) >= 2 && (m & 7) <= 5 ? 8 / 16 : 2 / 16, 1]];
    case 'vine': return [[0, 0, 0, 1, 1, 1]];
    case 'portal': return [[0, 0, 0, 1, 1, 1]];
    case 'fire': return [[0, 0, 0, 1, 1 / 16, 1]];
    case 'layer': { const h = ((m & 7) + 1) / 8; return [[0, 0, 0, 1, h, 1]]; }
    case 'fence': case 'pane': case 'wall': {
      const bx = collisionBoxes(v, get, x, y, z);
      return bx.map(a => [a[0], a[1], a[2], a[3], Math.min(a[4], 1), a[5]]);
    }
    default: {
      const c = collisionBoxes(v, get, x, y, z);
      return c || FULL;
    }
  }
}
