// Bloques de construcción con formas y estados: losas y escaleras por material, vallas, portillos,
// puertas, trampillas, escaleras de mano, paneles de cristal, antorchas en la pared y cama.
import {
  family, defs, L, texOf, familyBase, BLOCK_OPAQUE, R_CUBE, R_MODEL, R_TORCH, type Opts, type ToolKind,
  type SoundMaterial,
} from './registry';
import { OAK_PLANKS, BIRCH_PLANKS, SPRUCE_PLANKS, COBBLESTONE, STONE, STONE_BRICKS, BRICKS, SANDSTONE, GLASS, TORCH } from './classic';
import { mbox, rotateBoxes, rotateFlat, DIR_X, DIR_Z } from '../blockModels';

export interface Material {
  key: string;
  name: string;
  block: number;
  hardness: number;
  tool: ToolKind;
  tier: number;
  sound: SoundMaterial;
}

export const MATERIALS: Material[] = [
  { key: 'oak', name: 'de roble', block: OAK_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' },
  { key: 'birch', name: 'de abedul', block: BIRCH_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' },
  { key: 'spruce', name: 'de abeto', block: SPRUCE_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' },
  { key: 'cobblestone', name: 'de roca', block: COBBLESTONE, hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'stone', name: 'de piedra', block: STONE, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'stone_brick', name: 'de ladrillos de piedra', block: STONE_BRICKS, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'brick', name: 'de ladrillos', block: BRICKS, hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'sandstone', name: 'de arenisca', block: SANDSTONE, hardness: 0.8, tool: 'pickaxe', tier: 1, sound: 'stone' },
];
export const WOODS = MATERIALS.slice(0, 3);

const matOpts = (m: Material): Opts => ({ hardness: m.hardness, tool: m.tool, tier: m.tier, sound: m.sound, tex: defs[m.block].tex });

/** Losas por material (tipo 0 abajo, 1 arriba, 2 doble). */
export const SLABS: Record<string, number> = {};
/** Escaleras por material (orientación 0..3 hacia donde suben, mitad 0 normal / 1 invertida). */
export const STAIRS: Record<string, number> = {};
/** Losa y escaleras de un material (los materiales nuevos se añaden al final: ids guardados). */
export function addMaterialShapes(m: Material): void {
  if (!MATERIALS.includes(m)) MATERIALS.push(m);
  const t = texOf(m.block);
  SLABS[m.key] = family(`${m.key}_slab`, `Losa ${m.name}`, [['type', 3]], (st) => {
    if (st.type === 2) return { ...matOpts(m), render: R_CUBE };
    return { ...matOpts(m), render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
  });
  STAIRS[m.key] = family(`${m.key}_stairs`, `Escaleras ${m.name}`, [['facing', 4], ['half', 2]], (st) => {
    const boxes = st.half === 0
      ? [mbox(0, 0, 0, 16, 8, 16, t), mbox(0, 8, 0, 16, 16, 8, t)]
      : [mbox(0, 8, 0, 16, 16, 16, t), mbox(0, 0, 0, 16, 8, 8, t)];
    return { ...matOpts(m), render: R_MODEL, model: rotateBoxes(boxes, st.facing) };
  });
}
for (const m of [...MATERIALS]) addMaterialShapes(m);

export const FENCES: Record<string, number> = {};
export const FENCE_GATES: Record<string, number> = {};
export const DOORS: Record<string, number> = {};
export const TRAPDOORS: Record<string, number> = {};
const FENCE_IDS = new Set<number>();
/** Vallas que no son de madera (la de ladrillos del Nether): sólo se unen entre ellas (isSameFence de Java). */
const NON_WOOD_FENCES = new Set<number>();

/** ¿Valla? (se atan a ella las correas). */
export function isFence(id: number): boolean {
  return FENCE_IDS.has(id);
}

const GATE_BASES = new Set<number>();
function isGate(id: number): boolean {
  return GATE_BASES.has(familyBase(id));
}

/**
 * Las vallas se unen a las vallas de su clase (de madera con las de madera; la de ladrillos del Nether, con
 * las suyas), a los portillos y a los bloques sólidos completos.
 */
function fenceConnectsTo(wooden: boolean, id: number): boolean {
  return id > 0 && ((FENCE_IDS.has(id) && NON_WOOD_FENCES.has(id) !== wooden) || isGate(id) || BLOCK_OPAQUE[id] === 1);
}

/** Valla de un material (`wooden`: de madera; la de ladrillos del Nether no lo es). */
export function addFence(w: Material, wooden = true, key = `${w.key}_fence`, name = `Valla ${w.name}`): number {
  const t = texOf(w.block);
  const post = mbox(6, 0, 6, 10, 16, 10, t);
  const arm = (d: number) => rotateBoxes([mbox(7, 6, 0, 9, 9, 6, t), mbox(7, 12, 0, 9, 15, 6, t)], d);
  const fenceConnects = (id: number) => fenceConnectsTo(wooden, id);
  const fence = family(key, name, [], () => ({
    ...matOpts(w),
    render: R_MODEL,
    shape: (get) => {
      const boxes = [post];
      for (let d = 0; d < 4; d++) if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
      return boxes;
    },
    itemModel: [mbox(6, 0, 0, 10, 16, 4, t), mbox(6, 0, 12, 10, 16, 16, t), mbox(7, 6, 4, 9, 9, 12, t), mbox(7, 12, 4, 9, 15, 12, t)],
    collision: (get) => {
      const out = [0.375, 0, 0.375, 0.625, 1.5, 0.625];
      for (let d = 0; d < 4; d++) if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...rotateFlat([0.375, 0, 0, 0.625, 1.5, 0.375], d));
      return out;
    },
    selection: (get) => {
      const out = [0.375, 0, 0.375, 0.625, 1, 0.625];
      for (let d = 0; d < 4; d++) if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...rotateFlat([0.375, 0, 0, 0.625, 1, 0.375], d));
      return out;
    },
  }));
  FENCES[w.key] = fence;
  FENCE_IDS.add(fence);
  if (!wooden) NON_WOOD_FENCES.add(fence);
  return fence;
}

/** Valla, portillo, puerta y trampilla de una madera. */
export function addWoodShapes(w: Material): void {
  if (!WOODS.includes(w)) WOODS.push(w);
  const t = texOf(w.block);
  addFence(w);
  FENCE_GATES[w.key] = family(`${w.key}_fence_gate`, `Portillo ${w.name}`, [['facing', 4], ['open', 2]], (st) => {
    const closed = [
      mbox(0, 5, 7, 2, 16, 9, t), mbox(14, 5, 7, 16, 16, 9, t), mbox(2, 6, 7, 14, 9, 9, t), mbox(2, 12, 7, 14, 15, 9, t),
      mbox(6, 9, 7, 10, 12, 9, t),
    ];
    // Abierto, las dos hojas giran hacia donde mira el portillo (hacia -Z mirando al norte).
    const open = [
      mbox(0, 5, 7, 2, 16, 9, t), mbox(14, 5, 7, 16, 16, 9, t),
      mbox(0, 6, 1, 2, 15, 3, t), mbox(14, 6, 1, 16, 15, 3, t),
      mbox(0, 6, 3, 2, 9, 7, t), mbox(0, 12, 3, 2, 15, 7, t), mbox(14, 6, 3, 16, 9, 7, t), mbox(14, 12, 3, 16, 15, 7, t),
    ];
    return {
      ...matOpts(w),
      render: R_MODEL,
      model: rotateBoxes(st.open ? open : closed, st.facing),
      solid: !st.open,
      walkThrough: st.open === 1,
      collision: st.open ? [] : rotateFlat([0, 0, 0.375, 1, 1.5, 0.625], st.facing),
      selection: rotateFlat([0, 0, 0.375, 1, 1, 0.625], st.facing),
    };
  });
  GATE_BASES.add(FENCE_GATES[w.key]);
  DOORS[w.key] = family(`${w.key}_door`, `Puerta ${w.name}`, [['facing', 4], ['half', 2], ['open', 2], ['hinge', 2]], (st) => {
    const tx = L(`${w.key}_door_${st.half ? 'top' : 'bottom'}`);
    const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
    const name = `${w.key}_door_bottom`;
    return {
      hardness: 3, tool: 'axe', sound: 'wood', render: R_MODEL, model: rotateBoxes([panel], st.facing),
      tex: [name, name, name, name, name, name], walkThrough: st.open === 1,
    };
  });
  TRAPDOORS[w.key] = family(`${w.key}_trapdoor`, `Trampilla ${w.name}`, [['facing', 4], ['half', 2], ['open', 2]], (st) => {
    const name = `${w.key}_trapdoor`;
    const tx = L(name);
    const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing)
      : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
    return { hardness: 3, tool: 'axe', sound: 'wood', render: R_MODEL, model: box, tex: [name, name, name, name, name, name] };
  });
}
for (const w of [...WOODS]) addWoodShapes(w);

export const LADDER = family('ladder', 'Escalera de mano', [['facing', 4]], (st) => {
  const tl = L('ladder');
  return {
    render: R_MODEL, hardness: 0.4, tool: 'axe', sound: 'wood', all: 'ladder', category: 'decoracion',
    model: rotateBoxes([mbox(0, 0, 15, 16, 16, 16, [-1, -1, -1, -1, tl, tl])], st.facing),
    collision: rotateFlat([0, 0, 13 / 16, 1, 1, 1], st.facing),
    selection: rotateFlat([0, 0, 13 / 16, 1, 1, 1], st.facing),
    climbable: true, wall: st.facing, flatItem: 'ladder',
  };
});

/** Paneles y cristales a los que se unen los paneles (Fase 6.5 (colores): también los de color). */
export const PANE_IDS = new Set<number>();
export function paneConnects(id: number): boolean {
  return id > 0 && (PANE_IDS.has(id) || id === GLASS || BLOCK_OPAQUE[id] === 1);
}
export const GLASS_PANE = family('glass_pane', 'Panel de cristal', [], () => {
  const g = L('glass');
  const arm = (d: number) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, g)], d);
  const flat = (d: number) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
  return {
    render: R_MODEL, hardness: 0.3, sound: 'glass', all: 'glass', flatItem: 'glass',
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, g)];
      for (let d = 0; d < 4; d++) if (paneConnects(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
      return boxes;
    },
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0; d < 4; d++) if (paneConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...flat(d));
      return out;
    },
  };
});
PANE_IDS.add(GLASS_PANE);

export const WALL_TORCH = family('wall_torch', 'Antorcha', [['facing', 4]], (st) => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: 'wood', all: 'torch', hardness: 0, category: null,
  wall: st.facing, base: TORCH, selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing),
}));

/** Cama roja: orientación hacia la cabecera y parte (0 pies, 1 cabecera). */
export const RED_BED = family('red_bed', 'Cama roja', [['facing', 4], ['part', 2]], (st) => {
  const red = L('red_wool'), white = L('white_wool'), wood = L('oak_planks');
  const mattress = mbox(0, 3, 0, 16, 9, 16, [red, red, red, wood, red, red]);
  const boxes = st.part === 0
    ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)]
    : [mattress, mbox(1, 9, 1, 15, 11, 7, white), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
  return {
    render: R_MODEL, hardness: 0.2, sound: 'wool', all: 'red_wool', category: 'decoracion',
    model: rotateBoxes(boxes, st.facing), collision: [0, 0, 0, 1, 9 / 16, 1],
  };
});
