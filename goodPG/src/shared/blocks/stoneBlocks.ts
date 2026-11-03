// Fase 6.5 (piedras): piedras del mundo normal que faltaban y sus formas. Piedra lisa, ladrillos de
// piedra cincelados, granito/diorita/andesita pulidos, la familia de la pizarra profunda (pulida,
// ladrillos, azulejos, agrietados y cincelada), la de la toba, areniscas lisas, cortadas y cinceladas,
// barro (el de los pantanos), barro compacto y ladrillos de barro, y el cinabrio y el azufre de las
// cuevas de azufre (Minecraft 26.3). Además, losas, escaleras y muros de todas ellas y de las piedras
// que ya existían y no los tenían (como en Minecraft: no todas tienen las tres formas).
// Se registran al final de index.ts para no mover ningún id guardado.
import { family, defs, L, R_CUBE, R_MODEL, type BlockDef, type Opts, type SoundMaterial, type ToolKind } from './registry';
import { MOSSY_COBBLESTONE, GRANITE, DIORITE, ANDESITE } from './classic';
import { addMaterialShapes, SLABS, type Material } from './building';
import { addWall } from './decoration';
import { RED_SANDSTONE } from './biomes';
import { COBBLED_DEEPSLATE, TUFF } from './underground';
import { MOSSY_STONE_BRICKS, CUT_SANDSTONE } from './structures';
import { mbox } from '../blockModels';

const stone = (tex: string, hardness: number, o: Opts = {}): Opts => ({
  all: tex, hardness, tool: 'pickaxe', tier: 1, sound: 'stone', ...o,
});
const block = (key: string, name: string, o: Opts): number => family(key, name, [], () => o);

// ------------------------------------------------------------------ piedra y ladrillos de piedra

export const SMOOTH_STONE = block('smooth_stone', '平滑石头', stone('smooth_stone', 2));
export const CHISELED_STONE_BRICKS = block('chiseled_stone_bricks', '雕纹石砖', stone('chiseled_stone_bricks', 1.5));
export const POLISHED_GRANITE = block('polished_granite', '磨制花岗岩', stone('polished_granite', 1.5));
export const POLISHED_DIORITE = block('polished_diorite', '磨制闪长岩', stone('polished_diorite', 1.5));
export const POLISHED_ANDESITE = block('polished_andesite', '磨制安山岩', stone('polished_andesite', 1.5));

// ------------------------------------------------------------------ pizarra profunda

export const POLISHED_DEEPSLATE = block('polished_deepslate', '磨制深板岩', stone('polished_deepslate', 3.5));
export const DEEPSLATE_BRICKS = block('deepslate_bricks', '深板岩砖', stone('deepslate_bricks', 3.5));
export const CRACKED_DEEPSLATE_BRICKS = block('cracked_deepslate_bricks', '裂纹深板岩砖', stone('cracked_deepslate_bricks', 3.5));
export const DEEPSLATE_TILES = block('deepslate_tiles', '深板岩瓦', stone('deepslate_tiles', 3.5));
export const CRACKED_DEEPSLATE_TILES = block('cracked_deepslate_tiles', '裂纹深板岩瓦', stone('cracked_deepslate_tiles', 3.5));
export const CHISELED_DEEPSLATE = block('chiseled_deepslate', '雕纹深板岩', stone('chiseled_deepslate', 3.5));

// ------------------------------------------------------------------ toba

export const POLISHED_TUFF = block('polished_tuff', '磨制凝灰岩', stone('polished_tuff', 1.5));
export const TUFF_BRICKS = block('tuff_bricks', '凝灰岩砖', stone('tuff_bricks', 1.5));
export const CHISELED_TUFF = block('chiseled_tuff', '雕纹凝灰岩', stone('chiseled_tuff', 1.5, { top: 'chiseled_tuff_top' }));
export const CHISELED_TUFF_BRICKS = block('chiseled_tuff_bricks', '雕纹凝灰岩砖',
  stone('chiseled_tuff_bricks', 1.5, { top: 'chiseled_tuff_bricks_top' }));

// ------------------------------------------------------------------ areniscas

export const SMOOTH_SANDSTONE = block('smooth_sandstone', '平滑砂岩', stone('sandstone_top', 2));
export const SMOOTH_RED_SANDSTONE = block('smooth_red_sandstone', '平滑红砂岩', stone('red_sandstone_top', 2));
export const CUT_RED_SANDSTONE = block('cut_red_sandstone', '切制红砂岩', stone('cut_red_sandstone', 0.8, {
  top: 'red_sandstone_top', bottom: 'red_sandstone_bottom',
}));
export const CHISELED_RED_SANDSTONE = block('chiseled_red_sandstone', '雕纹红砂岩', stone('chiseled_red_sandstone', 0.8, {
  top: 'red_sandstone_top', bottom: 'red_sandstone_bottom',
}));

// ------------------------------------------------------------------ barro

/** Barro: se hunde un poco al pisarlo (como en Minecraft, la colisión mide 14/16). */
export const MUD = block('mud', '泥', {
  all: 'mud', hardness: 0.5, tool: 'shovel', sound: 'dirt', category: 'naturaleza', collision: [0, 0, 0, 1, 14 / 16, 1],
});
export const PACKED_MUD = block('packed_mud', '泥坯', { all: 'packed_mud', hardness: 1, tool: 'pickaxe', sound: 'dirt' });
export const MUD_BRICKS = block('mud_bricks', '泥砖', stone('mud_bricks', 1.5));

// ------------------------------------------------------------------ cuevas de azufre

export const CINNABAR = block('cinnabar', '朱砂', stone('cinnabar', 1.5, { category: 'naturaleza' }));
export const POLISHED_CINNABAR = block('polished_cinnabar', '磨制朱砂', stone('polished_cinnabar', 1.5));
export const CINNABAR_BRICKS = block('cinnabar_bricks', '朱砂砖', stone('cinnabar_bricks', 1.5));
export const CHISELED_CINNABAR = block('chiseled_cinnabar', '雕纹朱砂', stone('chiseled_cinnabar', 1.5));
export const SULFUR = block('sulfur', '硫磺', stone('sulfur', 1.5, { category: 'naturaleza' }));
export const POLISHED_SULFUR = block('polished_sulfur', '磨制硫磺', stone('polished_sulfur', 1.5));
export const SULFUR_BRICKS = block('sulfur_bricks', '硫磺砖', stone('sulfur_bricks', 1.5));
export const CHISELED_SULFUR = block('chiseled_sulfur', '雕纹硫磺', stone('chiseled_sulfur', 1.5));

// ------------------------------------------------------------------ formas

const mat = (key: string, name: string, b: number, hardness: number, tier = 1, sound: SoundMaterial = 'stone'): Material => ({
  key, name, block: b, hardness, tool: 'pickaxe' as ToolKind, tier, sound,
});

/** Materiales con losa y escaleras (las de Minecraft 26.3 que faltaban). */
const SHAPED: Material[] = [
  mat('mossy_cobblestone', '苔石', MOSSY_COBBLESTONE, 2),
  mat('mossy_stone_brick', '苔石砖', MOSSY_STONE_BRICKS, 1.5),
  mat('granite', '花岗岩', GRANITE, 1.5),
  mat('diorite', '闪长岩', DIORITE, 1.5),
  mat('andesite', '安山岩', ANDESITE, 1.5),
  mat('polished_granite', '磨制花岗岩', POLISHED_GRANITE, 1.5),
  mat('polished_diorite', '磨制闪长岩', POLISHED_DIORITE, 1.5),
  mat('polished_andesite', '磨制安山岩', POLISHED_ANDESITE, 1.5),
  mat('polished_deepslate', '磨制深板岩', POLISHED_DEEPSLATE, 3.5),
  mat('deepslate_brick', '深板岩砖', DEEPSLATE_BRICKS, 3.5),
  mat('deepslate_tile', '深板岩瓦', DEEPSLATE_TILES, 3.5),
  mat('tuff', '凝灰岩', TUFF, 1.5),
  mat('polished_tuff', '磨制凝灰岩', POLISHED_TUFF, 1.5),
  mat('tuff_brick', '凝灰岩砖', TUFF_BRICKS, 1.5),
  mat('smooth_sandstone', '平滑砂岩', SMOOTH_SANDSTONE, 2),
  mat('red_sandstone', '红砂岩', RED_SANDSTONE, 0.8),
  mat('smooth_red_sandstone', '平滑红砂岩', SMOOTH_RED_SANDSTONE, 2),
  mat('mud_brick', '泥砖', MUD_BRICKS, 1.5),
  mat('cinnabar', '朱砂', CINNABAR, 1.5),
  mat('polished_cinnabar', '磨制朱砂', POLISHED_CINNABAR, 1.5),
  mat('cinnabar_brick', '朱砂砖', CINNABAR_BRICKS, 1.5),
  mat('sulfur', '硫磺', SULFUR, 1.5),
  mat('polished_sulfur', '磨制硫磺', POLISHED_SULFUR, 1.5),
  mat('sulfur_brick', '硫磺砖', SULFUR_BRICKS, 1.5),
];
for (const m of SHAPED) addMaterialShapes(m);

/**
 * Losa sola (piedra lisa y areniscas cortadas: en Minecraft no tienen escaleras). `side` es la
 * textura de los lados: la de la piedra lisa tiene dos mitades con su borde, una por losa.
 */
function addSlab(m: Material, side?: string): number {
  const base = defs[m.block].tex;
  const tex: BlockDef['tex'] = side ? [side, side, base[2], base[3], side, side] : base;
  const t = tex.map(L);
  const opts: Opts = { hardness: m.hardness, tool: m.tool, tier: m.tier, sound: m.sound, tex };
  const id = family(`${m.key}_slab`, `${m.name}台阶`, [['type', 3]], (st) => {
    if (st.type === 2) return { ...opts, render: R_CUBE };
    return { ...opts, render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
  });
  SLABS[m.key] = id;
  return id;
}
/** Materiales que sólo tienen losa. */
const SLAB_ONLY: Material[] = [
  mat('smooth_stone', '平滑石头', SMOOTH_STONE, 2),
  mat('cut_sandstone', '切制砂岩', CUT_SANDSTONE, 0.8),
  mat('cut_red_sandstone', '切制红砂岩', CUT_RED_SANDSTONE, 0.8),
];
for (const m of SLAB_ONLY) addSlab(m, m.key === 'smooth_stone' ? 'smooth_stone_slab_side' : undefined);

/** Muros nuevos (los de Minecraft 26.3 que faltaban). */
const WALLED: [key: string, name: string, block: number, hardness: number][] = [
  ['mossy_stone_brick', '苔石砖', MOSSY_STONE_BRICKS, 1.5],
  ['cobbled_deepslate', '深板岩圆石', COBBLED_DEEPSLATE, 3.5],
  ['polished_deepslate', '磨制深板岩', POLISHED_DEEPSLATE, 3.5],
  ['deepslate_brick', '深板岩砖', DEEPSLATE_BRICKS, 3.5],
  ['deepslate_tile', '深板岩瓦', DEEPSLATE_TILES, 3.5],
  ['tuff', '凝灰岩', TUFF, 1.5],
  ['polished_tuff', '磨制凝灰岩', POLISHED_TUFF, 1.5],
  ['tuff_brick', '凝灰岩砖', TUFF_BRICKS, 1.5],
  ['red_sandstone', '红砂岩', RED_SANDSTONE, 0.8],
  ['mud_brick', '泥砖', MUD_BRICKS, 1.5],
  ['cinnabar', '朱砂', CINNABAR, 1.5],
  ['polished_cinnabar', '磨制朱砂', POLISHED_CINNABAR, 1.5],
  ['cinnabar_brick', '朱砂砖', CINNABAR_BRICKS, 1.5],
  ['sulfur', '硫磺', SULFUR, 1.5],
  ['polished_sulfur', '磨制硫磺', POLISHED_SULFUR, 1.5],
  ['sulfur_brick', '硫磺砖', SULFUR_BRICKS, 1.5],
];
for (const [key, name, b, hardness] of WALLED) addWall({ key, name, block: b, hardness });

// ------------------------------------------------------------------ inventario

/**
 * Bloques de piedra nuevos en el orden del inventario creativo (las losas y escaleras de MATERIALS y
 * los muros de WALLS ya entran solos en el inventario; aquí van los bloques y las losas sueltas).
 */
export const STONE_INVENTORY: readonly number[] = [
  SMOOTH_STONE, CHISELED_STONE_BRICKS, POLISHED_GRANITE, POLISHED_DIORITE, POLISHED_ANDESITE,
  POLISHED_DEEPSLATE, DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS, DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES, CHISELED_DEEPSLATE,
  POLISHED_TUFF, TUFF_BRICKS, CHISELED_TUFF, CHISELED_TUFF_BRICKS,
  SMOOTH_SANDSTONE, SMOOTH_RED_SANDSTONE, CUT_RED_SANDSTONE, CHISELED_RED_SANDSTONE,
  MUD, PACKED_MUD, MUD_BRICKS,
  CINNABAR, POLISHED_CINNABAR, CINNABAR_BRICKS, CHISELED_CINNABAR, SULFUR, POLISHED_SULFUR, SULFUR_BRICKS, CHISELED_SULFUR,
  ...SLAB_ONLY.map((m) => SLABS[m.key]),
];

