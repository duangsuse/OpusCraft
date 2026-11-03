// Cortapiedras: qué sale de cada piedra (valores de Minecraft: losas de 2 en 2, escaleras y muros de
// 1 en 1, y ladrillos de piedra de la piedra lisa).
import { STONE, COBBLESTONE, STONE_BRICKS, BRICKS, SANDSTONE, SLABS, STAIRS, WALLS, WALL_SOURCE } from './blocks';
import { BLOCKS } from './blocks'; // Fase 6.5 (piedras)
import type { ItemStack } from './items';
// Fase 6.5 (piedras).
import {
  MATERIALS, DEEPSLATE, COBBLED_DEEPSLATE, TUFF, GRANITE, DIORITE, ANDESITE, RED_SANDSTONE, CUT_SANDSTONE, CHISELED_SANDSTONE,
  CHISELED_STONE_BRICKS, POLISHED_GRANITE, POLISHED_DIORITE, POLISHED_ANDESITE, POLISHED_DEEPSLATE, DEEPSLATE_BRICKS,
  DEEPSLATE_TILES, CHISELED_DEEPSLATE, POLISHED_TUFF, TUFF_BRICKS, CHISELED_TUFF, CHISELED_TUFF_BRICKS, CUT_RED_SANDSTONE,
  CHISELED_RED_SANDSTONE, CINNABAR, POLISHED_CINNABAR, CINNABAR_BRICKS, CHISELED_CINNABAR, SULFUR, POLISHED_SULFUR,
  SULFUR_BRICKS, CHISELED_SULFUR,
} from './blocks';
import { COPPER, OXIDATION_STAGES } from './blocks'; // Fase 6.5 (cobre)
import { PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE } from './blocks'; // Fase 6.5 (océano y plantas)
import { // Fase 8.2 (biomas del Nether)
  BASALT, POLISHED_BASALT, BLACKSTONE, POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BRICKS, CHISELED_POLISHED_BLACKSTONE, NETHER_BRICKS,
  CHISELED_NETHER_BRICKS,
} from './blocks';
import { QUARTZ_BLOCK, CHISELED_QUARTZ_BLOCK, QUARTZ_BRICKS, QUARTZ_PILLAR } from './blocks'; // Fase 8.5
import { END_STONE, END_STONE_BRICKS, PURPUR_BLOCK, PURPUR_PILLAR } from './blocks'; // Fase 8.6

const table = new Map<number, ItemStack[]>();
const add = (input: number, id: number, count = 1) => {
  const l = table.get(input) ?? [];
  l.push({ id, count });
  table.set(input, l);
};
// Losas y escaleras de cada piedra (y los de ladrillos de piedra también desde la piedra lisa).
const SHAPED: [number, string][] = [
  [STONE, 'stone'], [COBBLESTONE, 'cobblestone'], [STONE_BRICKS, 'stone_brick'], [BRICKS, 'brick'], [SANDSTONE, 'sandstone'],
];
for (const [block, key] of SHAPED) {
  add(block, SLABS[key], 2);
  add(block, STAIRS[key]);
}
add(STONE, STONE_BRICKS);
add(STONE, SLABS.stone_brick, 2);
add(STONE, STAIRS.stone_brick);
// Muros de su piedra (y el de ladrillos de piedra desde la piedra lisa).
for (const [wall, src] of Object.entries(WALL_SOURCE)) add(src, Number(wall));
add(STONE, WALLS.stone_brick);

// Fase 6.5 (piedras): cadenas del cortapiedras como en Minecraft 26.3. Cada flecha dice a qué piedra se
// puede llevar otra; una piedra da todas las que alcanza siguiendo flechas y las formas (losa x2,
// escaleras, muro) de ella misma y de todas ésas. Lo que ya estaba en la tabla no se repite.
const CUT_EDGES: readonly (readonly [number, number])[] = [
  [STONE, STONE_BRICKS], [STONE, COBBLESTONE], [STONE_BRICKS, CHISELED_STONE_BRICKS],
  [GRANITE, POLISHED_GRANITE], [DIORITE, POLISHED_DIORITE], [ANDESITE, POLISHED_ANDESITE],
  [DEEPSLATE, COBBLED_DEEPSLATE], [COBBLED_DEEPSLATE, POLISHED_DEEPSLATE], [COBBLED_DEEPSLATE, CHISELED_DEEPSLATE],
  [POLISHED_DEEPSLATE, DEEPSLATE_BRICKS], [DEEPSLATE_BRICKS, DEEPSLATE_TILES],
  [TUFF, POLISHED_TUFF], [TUFF, CHISELED_TUFF], [POLISHED_TUFF, TUFF_BRICKS], [TUFF_BRICKS, CHISELED_TUFF_BRICKS],
  [SANDSTONE, CUT_SANDSTONE], [SANDSTONE, CHISELED_SANDSTONE],
  [RED_SANDSTONE, CUT_RED_SANDSTONE], [RED_SANDSTONE, CHISELED_RED_SANDSTONE],
  [CINNABAR, POLISHED_CINNABAR], [CINNABAR, CHISELED_CINNABAR], [POLISHED_CINNABAR, CINNABAR_BRICKS],
  [SULFUR, POLISHED_SULFUR], [SULFUR, CHISELED_SULFUR], [POLISHED_SULFUR, SULFUR_BRICKS],
  // Fase 8.2 (biomas del Nether): basalto, piedra negra y ladrillos del Nether.
  [BASALT, POLISHED_BASALT], [BLACKSTONE, POLISHED_BLACKSTONE], [POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BRICKS],
  [POLISHED_BLACKSTONE, CHISELED_POLISHED_BLACKSTONE], [NETHER_BRICKS, CHISELED_NETHER_BRICKS],
  // Fase 8.5 (lo que da el Nether): del bloque de cuarzo, el cincelado, los ladrillos y el pilar.
  [QUARTZ_BLOCK, CHISELED_QUARTZ_BLOCK], [QUARTZ_BLOCK, QUARTZ_BRICKS], [QUARTZ_BLOCK, QUARTZ_PILLAR],
  // Fase 8.6 (el End): de la piedra del End, sus ladrillos; de la púrpura, el pilar.
  [END_STONE, END_STONE_BRICKS], [PURPUR_BLOCK, PURPUR_PILLAR],
];
{
  /** Formas de cada bloque: [id, cantidad]. */
  const shapes = new Map<number, [number, number][]>();
  const addShape = (b: number, id: number | undefined, n: number) => {
    if (id !== undefined) shapes.set(b, [...(shapes.get(b) ?? []), [id, n]]);
  };
  for (const m of MATERIALS) {
    if (m.tool !== 'pickaxe') continue;
    addShape(m.block, SLABS[m.key], 2);
    addShape(m.block, STAIRS[m.key], 1);
  }
  // Losas sueltas (piedra lisa y areniscas cortadas).
  for (const [key, id] of Object.entries(SLABS)) {
    const b = BLOCKS.find((d) => d?.key === key);
    if (b && b.tool === 'pickaxe' && !MATERIALS.some((m) => m.key === key)) addShape(b.id, id, 2);
  }
  for (const [wall, src] of Object.entries(WALL_SOURCE)) addShape(src, Number(wall), 1);
  const next = new Map<number, number[]>();
  for (const [a, b] of CUT_EDGES) next.set(a, [...(next.get(a) ?? []), b]);
  const addOnce = (input: number, id: number, count: number) => {
    if (!(table.get(input) ?? []).some((s) => s.id === id)) add(input, id, count);
  };
  for (const input of new Set([...next.keys(), ...shapes.keys()])) {
    const reach: number[] = [input];
    for (let k = 0; k < reach.length; k++) for (const b of next.get(reach[k]) ?? []) if (!reach.includes(b)) reach.push(b);
    for (const b of reach) {
      if (b !== input) addOnce(input, b, 1);
      for (const [id, n] of shapes.get(b) ?? []) addOnce(input, id, n);
    }
  }
}

// Fase 6.5 (cobre): de cada bloque de cobre (en su fase y con su cera) sale cobre cortado, grabado,
// rejillas, losas y escaleras; del cobre cortado, losas, escaleras y cobre grabado.
for (let s = 0; s < OXIDATION_STAGES; s++) {
  for (const w of [0, 1]) {
    const block = COPPER.block[w][s], cut = COPPER.cut[w][s];
    add(block, cut, 4);
    add(block, COPPER.cut_slab[w][s], 8);
    add(block, COPPER.cut_stairs[w][s], 4);
    add(block, COPPER.chiseled[w][s], 4);
    add(block, COPPER.grate[w][s], 4);
    add(cut, COPPER.cut_slab[w][s], 2);
    add(cut, COPPER.cut_stairs[w][s]);
    add(cut, COPPER.chiseled[w][s]);
  }
}
// Fase 6.5 (océano y plantas): losas y escaleras de las tres prismarinas.
for (const [block, key] of [[PRISMARINE, 'prismarine'], [PRISMARINE_BRICKS, 'prismarine_brick'], [DARK_PRISMARINE, 'dark_prismarine']] as const) {
  for (const [id, n] of [[SLABS[key], 2], [STAIRS[key], 1]] as const) {
    if (!(table.get(block) ?? []).some((s) => s.id === id)) add(block, id, n);
  }
}

/** Lo que se puede cortar de una piedra (vacío si no sirve). */
export function stonecutterOptions(input: number): readonly ItemStack[] {
  return table.get(input) ?? [];
}
