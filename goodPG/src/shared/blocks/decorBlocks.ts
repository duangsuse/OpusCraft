// Fase 6.5 (decoración): maceta (con cualquier planta en cruz dentro), farol de hierro (de pie y
// colgando), cadena de hierro, barrotes de hierro, campana, andamio, vasija decorada y los bloques
// ocultos con los que se dibujan cuadros y marcos (que son entidades).
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import {
  family, defs, L, familyBase, stateOf, stateProps, BLOCK_SOLID, BLOCK_OPAQUE, R_MODEL, R_CROSS, R_CUTOUT,
  type NeighborGet,
} from './registry';
import { CACTUS, GLASS } from './classic';
import { GLASS_PANE } from './building';
import { mbox, rotateBoxes, flatBoxes, DIR_X, DIR_Z, type ModelBox } from '../blockModels';
import { PAINTINGS, paintingCellTexture } from '../paintings';

// ------------------------------------------------------------------ maceta

/** Estados de la maceta: 0 vacía y 1..63 con la planta i-ésima de la lista de plantas para maceta. */
export const POT_STATES = 64;
/** Plantas en cruz que no van en maceta (hierba, caña, telaraña…), por clave. */
const NOT_POTTABLE = new Set(['short_grass', 'sugar_cane', 'cobweb', 'tall_grass', 'large_fern', 'pointed_dripstone']);
/** Plantas con apoyo propio que sí van en maceta (la anflorcha sólo necesita suelo). */
const POTTABLE_WITH_SUPPORT = new Set([
  'torchflower', 'wither_rose', // Fase 8.7: la rosa marchita
  'crimson_fungus', 'warped_fungus', 'crimson_roots', 'warped_roots', // Fase 8.7: y los hongos y raíces del Nether (potted_*)
]);

let pottable: number[] | null = null;
let pottableIndex: Map<number, number> | null = null;

/**
 * Plantas que caben en una maceta, en orden de id: todas las plantas en cruz que son objeto y no
 * necesitan un apoyo propio (brotes, flores, champiñones, helechos, arbustos…), más el cactus. Se
 * calcula la primera vez que se pide (con todos los bloques ya registrados): así sirve también para
 * las plantas que se añadan después. Como los ids nuevos siempre van al final, el índice de cada
 * planta (el estado de la maceta, que se guarda) no cambia.
 */
export function pottablePlants(): readonly number[] {
  if (!pottable) {
    pottable = [];
    for (const b of defs) {
      if (!b || (b.base !== undefined && b.base !== b.id) || b.noItem || NOT_POTTABLE.has(b.key)) continue;
      if ((b.render === R_CROSS && (!b.support || POTTABLE_WITH_SUPPORT.has(b.key)) && b.category !== null) || b.id === CACTUS) pottable.push(b.id);
    }
    pottable = pottable.slice(0, POT_STATES - 1);
    pottableIndex = new Map(pottable.map((id, i) => [id, i + 1]));
  }
  return pottable;
}

/** ¿Se puede plantar este bloque en una maceta? */
export function isPottable(block: number): boolean {
  pottablePlants();
  return pottableIndex!.has(block);
}

const potModels: (ModelBox[] | undefined)[] = [];

function potModel(k: number): ModelBox[] {
  const cached = potModels[k];
  if (cached) return cached;
  const side = L('flower_pot');
  const plant = k > 0 ? pottablePlants()[k - 1] ?? 0 : 0;
  const top = L(plant ? 'flower_pot_soil' : 'flower_pot_top');
  const boxes = [mbox(5, 0, 5, 11, 6, 11, [side, side, top, side, side, side])];
  if (plant === CACTUS) {
    const t = defs[CACTUS].tex.map(L);
    boxes.push(mbox(6, 6, 6, 10, 16, 10, [t[0], t[1], t[2], -1, t[4], t[5]]));
  } else if (plant) {
    // Dos planos en cruz (sin grosor) con la textura de la planta, hundidos en la tierra de la maceta.
    const p = L(defs[plant].tex[0]);
    boxes.push(mbox(8, 4, 1, 8, 16, 15, [p, p, -1, -1, -1, -1]));
    boxes.push(mbox(1, 4, 8, 15, 16, 8, [-1, -1, -1, -1, p, p]));
  }
  potModels[k] = boxes;
  return boxes;
}

const POT_BOX = [5 / 16, 0, 5 / 16, 11 / 16, 6 / 16, 11 / 16];

export const FLOWER_POT = family('flower_pot', 'Maceta', [['plant', POT_STATES]], (st) => ({
  render: R_MODEL, hardness: 0, sound: 'stone', category: 'decoracion', all: 'flower_pot', lightOpacity: 0,
  shape: () => potModel(st.plant),
  itemModel: potModel(0),
  collision: POT_BOX,
  selection: POT_BOX,
}));

/** Planta de una maceta (0 si está vacía o no es una maceta). */
export function pottedPlant(id: number): number {
  if (familyBase(id) !== FLOWER_POT) return 0;
  return pottablePlants()[stateProps(id)!.plant - 1] ?? 0;
}

/** Maceta con esta planta (0 si no se puede plantar). */
export function potWith(plant: number): number {
  pottablePlants();
  const k = pottableIndex!.get(plant);
  return k === undefined ? 0 : stateOf(FLOWER_POT, { plant: k });
}

export function isFlowerPot(id: number): boolean {
  return familyBase(id) === FLOWER_POT;
}

// ------------------------------------------------------------------ cadena de hierro

export const CHAIN_AXIS_Y = 0;
export const CHAIN_AXIS_X = 1;
export const CHAIN_AXIS_Z = 2;

/** Dos planos en cruz a lo largo del eje (texturas: eslabones en vertical o en horizontal). */
function chainBoxes(axis: number): ModelBox[] {
  const v = L('chain'), h = L('chain_h');
  if (axis === CHAIN_AXIS_Y) return [mbox(8, 0, 6, 8, 16, 10, [v, v, -1, -1, -1, -1]), mbox(6, 0, 8, 10, 16, 8, [-1, -1, -1, -1, v, v])];
  if (axis === CHAIN_AXIS_X) return [mbox(0, 6, 8, 16, 10, 8, [-1, -1, -1, -1, h, h]), mbox(0, 8, 6, 16, 8, 10, [-1, -1, h, h, -1, -1])];
  return [mbox(8, 6, 0, 8, 10, 16, [h, h, -1, -1, -1, -1]), mbox(6, 8, 0, 10, 8, 16, [-1, -1, v, v, -1, -1])];
}

const CHAIN_SEL = [
  [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16],
  [0, 6 / 16, 6 / 16, 1, 10 / 16, 10 / 16],
  [6 / 16, 6 / 16, 0, 10 / 16, 10 / 16, 1],
];

export const IRON_CHAIN = family('iron_chain', 'Cadena de hierro', [['axis', 3]], (st) => ({
  render: R_MODEL, hardness: 5, tool: 'pickaxe', sound: 'metal', category: 'decoracion', all: 'chain', lightOpacity: 0,
  model: chainBoxes(st.axis), collision: CHAIN_SEL[st.axis], selection: CHAIN_SEL[st.axis], flatItem: 'chain',
}));

export function isChain(id: number): boolean {
  return familyBase(id) === IRON_CHAIN;
}

/** Cadena a lo largo del eje de una normal (arriba/abajo → vertical). */
export function chainForNormal(nx: number, ny: number): number {
  return stateOf(IRON_CHAIN, { axis: ny !== 0 ? CHAIN_AXIS_Y : nx !== 0 ? CHAIN_AXIS_X : CHAIN_AXIS_Z });
}

// ------------------------------------------------------------------ farol

/** ¿Se puede colgar algo (farol, campana) de este bloque o apoyar algo encima? */
function holds(id: number): boolean {
  return id < 0 || BLOCK_SOLID[id] === 1 || isChain(id);
}

function lanternBoxes(hanging: boolean): ModelBox[] {
  const s = L('lantern'), t = L('lantern_top'), c = L('chain');
  const dy = hanging ? 1 : 0;
  const out = [
    mbox(5, dy, 5, 11, 7 + dy, 11, [s, s, t, t, s, s]),
    mbox(6, 7 + dy, 6, 10, 9 + dy, 10, [s, s, t, -1, s, s]),
  ];
  // Colgando: el asa de cadena hasta el techo.
  if (hanging) out.push(mbox(8, 10, 6, 8, 16, 10, [c, c, -1, -1, -1, -1]), mbox(6, 10, 8, 10, 16, 8, [-1, -1, -1, -1, c, c]));
  return out;
}

export const LANTERN = family('lantern', 'Farol', [['hanging', 2]], (st) => {
  const boxes = lanternBoxes(st.hanging === 1);
  const sel = flatBoxes(boxes.slice(0, 2));
  return {
    render: R_MODEL, hardness: 3.5, tool: 'pickaxe', sound: 'metal', category: 'decoracion', all: 'lantern', emission: 15,
    lightOpacity: 0, model: boxes, collision: sel, selection: sel, itemModel: lanternBoxes(false),
    support: (get: NeighborGet) => (st.hanging ? holds(get(0, 1, 0)) : holds(get(0, -1, 0))),
  };
});

export function isLantern(id: number): boolean {
  return familyBase(id) === LANTERN;
}

// ------------------------------------------------------------------ barrotes de hierro

const BAR_IDS = new Set<number>();
function barsConnect(id: number): boolean {
  return id > 0 && (BAR_IDS.has(id) || id === GLASS || familyBase(id) === GLASS_PANE || BLOCK_OPAQUE[id] === 1);
}

export const IRON_BARS = family('iron_bars', 'Barrotes de hierro', [], () => {
  const b = L('iron_bars');
  const arm = (d: number) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, b)], d);
  const flat = (d: number) => flatBoxes(arm(d));
  return {
    render: R_MODEL, hardness: 5, tool: 'pickaxe', sound: 'metal', category: 'decoracion', all: 'iron_bars', lightOpacity: 0,
    flatItem: 'iron_bars',
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, b)];
      for (let d = 0; d < 4; d++) if (barsConnect(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
      return boxes;
    },
    itemModel: [mbox(7, 0, 0, 9, 16, 16, b)],
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0; d < 4; d++) if (barsConnect(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...flat(d));
      return out;
    },
  };
});
BAR_IDS.add(IRON_BARS);

// ------------------------------------------------------------------ campana

/** Sujeción de la campana: 0 en el suelo (dos postes y un travesaño), 1 colgada del techo. */
export const BELL_FLOOR = 0;
export const BELL_CEILING = 1;

function bellBoxes(facing: number, attach: number): ModelBox[] {
  const b = L('bell'), post = L('stone'), bar = L('dark_oak_planks');
  const bell = [mbox(5, 6, 5, 11, 13, 11, b), mbox(4, 4, 4, 12, 6, 12, b)];
  const frame = attach === BELL_FLOOR
    ? [mbox(0, 0, 6, 2, 16, 10, post), mbox(14, 0, 6, 16, 16, 10, post), mbox(2, 13, 7, 14, 15, 9, bar)]
    : [mbox(7, 13, 7, 9, 16, 9, bar)];
  return rotateBoxes([...frame, ...bell], facing);
}

export const BELL = family('bell', 'Campana', [['facing', 4], ['attach', 2]], (st) => {
  const boxes = bellBoxes(st.facing, st.attach);
  return {
    render: R_MODEL, hardness: 5, tool: 'pickaxe', sound: 'metal', category: 'decoracion', all: 'bell', lightOpacity: 0,
    model: boxes, collision: flatBoxes(boxes), selection: flatBoxes(boxes),
    support: (get: NeighborGet) => (st.attach === BELL_CEILING ? holds(get(0, 1, 0)) : holds(get(0, -1, 0))),
  };
});

export function isBell(id: number): boolean {
  return familyBase(id) === BELL;
}

// ------------------------------------------------------------------ andamio

/** Bloques de andamio en voladizo como mucho (desde uno apoyado en el suelo), como en Minecraft. */
export const SCAFFOLD_MAX_DISTANCE = 6;
/** Celdas que mira como mucho la búsqueda de apoyo (torres altas y plataformas grandes). */
const SCAFFOLD_SEARCH = 4096;

let SCAFFOLD_ID = -1;

/**
 * ¿Se sostiene un andamio en (0, 0, 0)? Como en Minecraft: si debajo hay otro andamio, vale lo que
 * valga ése; si hay un bloque sólido, está apoyado; si no, cuelga de un andamio vecino y cada paso en
 * horizontal cuenta uno (hasta SCAFFOLD_MAX_DISTANCE). Búsqueda en anchura por los andamios unidos.
 */
export function scaffoldSupported(get: NeighborGet): boolean {
  const seen = new Set<string>();
  const queue: [number, number, number, number][] = [[0, 0, 0, 0]];
  seen.add('0,0,0');
  for (let qi = 0; qi < queue.length && qi < SCAFFOLD_SEARCH; qi++) {
    const [x, y, z, d] = queue[qi];
    const below = get(x, y - 1, z);
    if (below < 0) return true; // sin cargar: no romper nada
    if (familyBase(below) === SCAFFOLD_ID) {
      const k = `${x},${y - 1},${z}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([x, y - 1, z, d]);
      }
      continue;
    }
    if (below > 0 && BLOCK_SOLID[below] === 1) return true;
    if (d >= SCAFFOLD_MAX_DISTANCE) continue;
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DIR_X[dir], nz = z + DIR_Z[dir];
      const k = `${nx},${y},${nz}`;
      if (seen.has(k)) continue;
      const n = get(nx, y, nz);
      if (n < 0) return true;
      if (familyBase(n) !== SCAFFOLD_ID) continue;
      seen.add(k);
      queue.push([nx, y, nz, d + 1]);
    }
  }
  return false;
}

export const SCAFFOLDING = family('scaffolding', 'Andamio', [], () => ({
  render: R_CUTOUT, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'wood', category: 'decoracion',
  // Se trepa a su manera (ver scaffoldPhysics.ts): de pie encima, saltando se sube y agachado se baja.
  top: 'scaffolding_top', bottom: 'scaffolding_top', side: 'scaffolding_side', walkThrough: true,
  support: scaffoldSupported,
}));
SCAFFOLD_ID = SCAFFOLDING;

export function isScaffolding(id: number): boolean {
  return familyBase(id) === SCAFFOLDING;
}

// ------------------------------------------------------------------ vasija decorada

export const DECORATED_POT = family('decorated_pot', 'Vasija decorada', [], () => {
  const s = L('decorated_pot_side'), t = L('decorated_pot_top');
  const boxes = [
    mbox(1, 0, 1, 15, 13, 15, [s, s, t, t, s, s]),
    mbox(4, 13, 4, 12, 14, 12, [s, s, -1, -1, s, s]),
    mbox(3, 14, 3, 13, 16, 13, [s, s, t, t, s, s]),
  ];
  return {
    render: R_MODEL, hardness: 0, sound: 'stone', category: 'decoracion', all: 'decorated_pot_side', lightOpacity: 0,
    model: boxes, collision: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16], selection: flatBoxes(boxes),
  };
});

// ------------------------------------------------------------------ cuadros y marcos (modelos)

/**
 * Bloques ocultos (no son objeto ni se colocan) que sólo sirven para dibujar las entidades: una celda
 * de cuadro (arte en la cara +Z, madera detrás) y el marco. PAINTING_CELLS[variante][cy * w + cx].
 */
export const PAINTING_CELLS: readonly (readonly number[])[] = PAINTINGS.map((v) => {
  const cells: number[] = [];
  for (let cy = 0; cy < v.h; cy++) {
    for (let cx = 0; cx < v.w; cx++) {
      const art = paintingCellTexture(v, cx, cy);
      cells.push(family(`painting_${v.key}_${cy * v.w + cx}`, `Cuadro «${v.name}»`, [], () => ({
        tex: ['birch_planks', 'birch_planks', 'birch_planks', 'birch_planks', art, 'birch_planks'], noItem: true, category: null,
        hardness: 0, sound: 'wood',
      })));
    }
  }
  return cells;
});

export const ITEM_FRAME_MODEL = family('item_frame_model', 'Marco', [], () => ({
  tex: ['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'item_frame', 'oak_planks'], noItem: true, category: null,
  hardness: 0, sound: 'wood',
}));

/** Bloques de la decoración en el orden del inventario creativo. */
export const DECOR_INVENTORY: readonly number[] = [
  FLOWER_POT, LANTERN, IRON_CHAIN, IRON_BARS, BELL, SCAFFOLDING, DECORATED_POT,
];
