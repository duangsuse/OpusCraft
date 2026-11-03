// Fase 6.5 (océano y plantas): bloques del mar. Corales de cinco tipos (bloque, coral, gorgonia y
// gorgonia de pared, vivos y muertos: fuera del agua se mueren), algas que crecen hacia arriba y el
// bloque de algas secas, plantas marinas (cortas y altas), pepinos de mar (1–4, dan luz bajo el agua),
// prismarina (con sus losas, escaleras y muro) y esponjas (secas y mojadas).
//
// Bloques anegados: las plantas marinas, las algas, los corales y los pepinos de mar tienen un estado
// «con agua» que es a la vez un bloque de agua fuente (BLOCK_FLUID = 1, nivel 0): se nada en él, el
// agua de alrededor no lo arrastra, el mallador dibuja el agua en su celda y al romperlo queda agua.
// El estado 0 de cada familia es el seco (el que se obtiene como objeto).
// Se registran al final de index.ts para no mover ningún id guardado.
import {
  family, defs, L, familyBase, stateOf, stateProps, BLOCK_SOLID, BLOCK_RENDER, R_CROSS, R_MODEL, BLOCK_FLUID, type Opts,
  type NeighborGet,
} from './registry';
import { AIR, WATER, ICE } from './classic';
import { addMaterialShapes } from './building';
import { addWall } from './decoration';
import { MAX_BLOCK_ID } from '../constants';
import { mbox, rotateBoxes, rotateFlat, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

// ------------------------------------------------------------------ bloques anegados

/** 1 si el bloque es un estado anegado (planta o coral con agua en su celda). */
export const BLOCK_WATERLOGGED = new Uint8Array(MAX_BLOCK_ID);

export function isWaterlogged(id: number): boolean {
  return id > 0 && BLOCK_WATERLOGGED[id] === 1;
}

// Fase 7 (encantamientos): bloques que dejan agua al quitarlos sin estar anegados (el hielo escarchado). Lo
// rellena enchantBlocks.ts: importarlo desde aquí lo registraría antes de tiempo y movería los ids.
export const BLOCK_LEAVES_WATER = new Uint8Array(MAX_BLOCK_ID);

/** Lo que queda en la celda al quitar el bloque: agua si estaba anegado, aire si no. */
export function emptyAfterBreak(id: number): number {
  return isWaterlogged(id) || (id > 0 && BLOCK_LEAVES_WATER[id] === 1) ? WATER : AIR;
}

/**
 * El mismo bloque con agua o sin ella (conducto, corales, pepinos de mar: las familias con estado
 * `water`), o 0 si no tiene ese estado o ya está así. Como en Minecraft, el agua que corre no anega:
 * se anega vaciando un cubo de agua sobre el bloque.
 */
export function withWater(id: number, wet: boolean): number {
  const st = id > 0 ? stateProps(id) : null;
  if (!st || st.water === undefined || (st.water === 1) === wet) return 0;
  return stateOf(familyBase(id), { ...st, water: wet ? 1 : 0 });
}

/**
 * Lo que queda al romper un jugador el bloque. El hielo roto en supervivencia sin Toque de seda se
 * convierte en agua si debajo hay un bloque sólido o un líquido (como IceBlock.playerDestroy de
 * Minecraft); sobre el aire desaparece. En creativo, con Toque de seda o por una explosión no deja agua.
 */
export function emptyAfterPlayerBreak(id: number, below: number, survival: boolean, silk: boolean): number {
  if (id === ICE && survival && !silk) return below < 0 || BLOCK_SOLID[below] === 1 || BLOCK_FLUID[below] ? WATER : AIR;
  return emptyAfterBreak(id);
}

/** Marca como anegados los estados de una familia que son fluido (después de registrarla). */
function markWet(base: number): void {
  for (let id = base; defs[id] && familyBase(id) === base; id++) if (defs[id].fluid === 1) BLOCK_WATERLOGGED[id] = 1;
}

/** Opciones de un estado anegado (luz como el agua). */
const WET: Opts = { fluid: 1, level: 0, lightOpacity: 2 };

const solidBelow = (get: NeighborGet): boolean => {
  const b = get(0, -1, 0);
  return b < 0 || (BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS);
};

const seaPlant = (tex: string, o: Opts = {}): Opts => ({
  render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, all: tex,
  category: 'naturaleza', ...o,
});

// ------------------------------------------------------------------ corales

export const CORAL_TYPES = ['tube', 'brain', 'bubble', 'fire', 'horn'] as const;
export type CoralType = (typeof CORAL_TYPES)[number];
const CORAL_NAMES: Record<CoralType, string> = {
  tube: 'de tubo', brain: 'de cerebro', bubble: 'de burbuja', fire: 'de fuego', horn: 'de cuerno',
};

export interface CoralSet {
  block: number;
  /** Coral (planta) con estado `water`. */
  coral: number;
  /** Gorgonia en el suelo con estado `water`. */
  fan: number;
  /** Gorgonia de pared con estados `water` y `facing` (hacia donde apunta; la pared, detrás). */
  wallFan: number;
}

/** Corales vivos y muertos de cada tipo. */
export const CORALS: Record<CoralType, CoralSet> = {} as Record<CoralType, CoralSet>;
export const DEAD_CORALS: Record<CoralType, CoralSet> = {} as Record<CoralType, CoralSet>;
/** Familia viva → familia muerta equivalente. */
const DEAD_OF = new Map<number, number>();
const LIVE_CORAL_BASES = new Set<number>();
const CORAL_BLOCKS = new Set<number>();
const CORAL_PLANT_BASES = new Set<number>();
const WALL_FAN_BASES = new Set<number>();

/** Gorgonia de pared mirando al norte: lámina que sale de la pared (en +Z) algo inclinada. */
function wallFanBoxes(t: number): ModelBox[] {
  return [mbox(0, 6, 5, 16, 7, 16, [-1, -1, t, t, -1, -1]), mbox(2, 7, 9, 14, 8, 16, [-1, -1, t, -1, -1, -1])];
}

function coralSet(type: CoralType, dead: boolean): CoralSet {
  const pre = dead ? 'dead_' : '';
  const name = CORAL_NAMES[type];
  const m = dead ? ' muerto' : '', f = dead ? ' muerta' : '';
  const blockTex = `${pre}${type}_coral_block`, plantTex = `${pre}${type}_coral`, fanTex = `${pre}${type}_coral_fan`;
  const block = family(`${pre}${type}_coral_block`, `Bloque de coral ${name}${m}`, [], () => ({
    all: blockTex, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone', category: 'naturaleza',
  }));
  const coral = family(`${pre}${type}_coral`, `Coral ${name}${m}`, [['water', 2]], (st) => ({
    ...seaPlant(plantTex, { sound: 'stone' }), ...(st.water ? WET : {}), support: solidBelow,
  }));
  const fan = family(`${pre}${type}_coral_fan`, `Gorgonia ${name}${f}`, [['water', 2]], (st) => ({
    ...seaPlant(fanTex, { sound: 'stone' }), ...(st.water ? WET : {}), support: solidBelow,
  }));
  const wallFan = family(`${pre}${type}_coral_wall_fan`, `Gorgonia ${name}${f}`, [['water', 2], ['facing', 4]], (st) => {
    const d = st.facing;
    return {
      render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'stone', all: fanTex,
      category: null, noItem: true, base: fan, walkThrough: true,
      ...(st.water ? WET : {}),
      model: rotateBoxes(wallFanBoxes(L(fanTex)), d),
      collision: [],
      selection: rotateFlat([0, 4 / 16, 5 / 16, 1, 9 / 16, 1], d),
      support: (get) => {
        const b = get(-DIR_X[d], 0, -DIR_Z[d]);
        return b < 0 || BLOCK_SOLID[b] === 1;
      },
    };
  });
  for (const b of [coral, fan, wallFan]) markWet(b);
  CORAL_BLOCKS.add(block);
  CORAL_PLANT_BASES.add(coral).add(fan).add(wallFan);
  WALL_FAN_BASES.add(wallFan);
  return { block, coral, fan, wallFan };
}

for (const type of CORAL_TYPES) {
  CORALS[type] = coralSet(type, false);
  DEAD_CORALS[type] = coralSet(type, true);
  const a = CORALS[type], d = DEAD_CORALS[type];
  for (const k of ['block', 'coral', 'fan', 'wallFan'] as const) {
    DEAD_OF.set(a[k], d[k]);
    LIVE_CORAL_BASES.add(a[k]);
  }
}

/** ¿Coral vivo (cualquier forma)? */
export function isLiveCoral(id: number): boolean {
  return id > 0 && LIVE_CORAL_BASES.has(familyBase(id));
}

/** ¿Bloque de coral (vivo o muerto)? */
export function isCoralBlock(id: number): boolean {
  return CORAL_BLOCKS.has(id);
}

/** ¿Coral, gorgonia o gorgonia de pared (viva o muerta)? */
export function isCoralPlant(id: number): boolean {
  return id > 0 && CORAL_PLANT_BASES.has(familyBase(id));
}

/** ¿Gorgonia de pared? */
export function isCoralWallFan(id: number): boolean {
  return id > 0 && WALL_FAN_BASES.has(familyBase(id));
}

/** El mismo coral, muerto (con el mismo estado); el propio id si no es un coral vivo. */
export function deadCoralOf(id: number): number {
  const dead = DEAD_OF.get(familyBase(id));
  return dead === undefined ? id : stateOf(dead, stateProps(id) ?? {});
}

/**
 * ¿Sigue vivo este coral? Los corales, las gorgonias y las de pared necesitan estar anegados; los
 * bloques, tocar agua por algún lado.
 */
export function coralAlive(id: number, get: NeighborGet): boolean {
  if (!isLiveCoral(id)) return true;
  if (!CORAL_BLOCKS.has(id)) return isWaterlogged(id);
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const n = get(dx, dy, dz);
    if (n < 0 || defs[n]?.fluid === 1) return true;
  }
  return false;
}

// ------------------------------------------------------------------ algas

/** Alga: `part` 0 = objeto (seca, no existe en el mundo), 1 = punta, 2 = tallo (las dos anegadas). */
export const KELP = family('kelp', 'Alga', [['part', 3]], (st) => ({
  ...seaPlant(st.part === 2 ? 'kelp_plant' : 'kelp'),
  ...(st.part ? WET : {}),
  support: (get) => {
    if (st.part === 0) return false;
    const b = get(0, -1, 0);
    return b < 0 || isKelp(b) || (BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS);
  },
}));
markWet(KELP);
export const KELP_TOP = KELP + 1;
export const KELP_STEM = KELP + 2;
export const isKelp = (id: number): boolean => id === KELP_TOP || id === KELP_STEM;

export const DRIED_KELP_BLOCK = family('dried_kelp_block', 'Bloque de algas secas', [], () => ({
  top: 'dried_kelp_top', side: 'dried_kelp_side', hardness: 0.5, sound: 'grass', category: 'naturaleza',
}));

// ------------------------------------------------------------------ plantas marinas

/** Planta marina: `kind` 0 = objeto (seca), 1 = corta, 2 = alta (abajo), 3 = alta (arriba). */
export const SEAGRASS = family('seagrass', 'Planta marina', [['kind', 4]], (st) => ({
  ...seaPlant(['seagrass', 'seagrass', 'tall_seagrass_bottom', 'tall_seagrass_top'][st.kind]),
  ...(st.kind ? WET : {}),
  replaceable: st.kind > 0,
  noItem: false,
  support: (get) => {
    if (st.kind === 0) return false;
    if (st.kind === 3) {
      const b = get(0, -1, 0);
      return b < 0 || b === SEAGRASS + 2;
    }
    if (!solidBelow(get)) return false;
    if (st.kind === 2) {
      const a = get(0, 1, 0);
      return a < 0 || a === SEAGRASS + 3;
    }
    return true;
  },
}));
markWet(SEAGRASS);
export const SEAGRASS_SHORT = SEAGRASS + 1;
export const TALL_SEAGRASS_LOWER = SEAGRASS + 2;
export const TALL_SEAGRASS_UPPER = SEAGRASS + 3;
export const isSeagrass = (id: number): boolean => id > SEAGRASS && id <= SEAGRASS + 3;

// ------------------------------------------------------------------ pepinos de mar

/** Cajas de cada pepino (dieciseisavos), en el orden en que se van añadiendo. */
const PICKLE_BOXES: [number, number, number, number, number, number][] = [
  [6, 0, 6, 10, 6, 10],
  [2, 0, 3, 6, 4, 7],
  [9, 0, 9, 13, 6, 13],
  [10, 0, 2, 13, 5, 5],
];

/** Pepinos de mar: `count` 0..3 = de 1 a 4; anegados dan luz (6, 9, 12 y 15). */
export const SEA_PICKLE = family('sea_pickle', 'Pepino de mar', [['count', 4], ['water', 2]], (st) => {
  const t = L('sea_pickle');
  const model = PICKLE_BOXES.slice(0, st.count + 1).map(([x0, y0, z0, x1, y1, z1]) => mbox(x0, y0, z0, x1, y1, z1, t));
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0, sound: 'wool', all: 'sea_pickle', category: 'naturaleza',
    solid: false, walkThrough: true,
    ...(st.water ? { ...WET, emission: [6, 9, 12, 15][st.count] } : {}),
    model,
    collision: [],
    selection: [2 / 16, 0, 2 / 16, 14 / 16, 6 / 16, 14 / 16],
    support: solidBelow,
  };
});
markWet(SEA_PICKLE);
export const isSeaPickle = (id: number): boolean => id >= SEA_PICKLE && id < SEA_PICKLE + 8;

/** Pepinos (1..4) de un estado. */
export function pickleCount(id: number): number {
  return isSeaPickle(id) ? stateProps(id)!.count + 1 : 0;
}

/** Estado con `n` pepinos (1..4), anegado o no. */
export function seaPickleBlock(n: number, water: boolean): number {
  return stateOf(SEA_PICKLE, { count: Math.max(1, Math.min(4, n)) - 1, water: water ? 1 : 0 });
}

// ------------------------------------------------------------------ prismarina

const prismarine = (key: string, name: string, tex: string): number => family(key, name, [], () => ({
  all: tex, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone',
}));
export const PRISMARINE = prismarine('prismarine', 'Prismarina', 'prismarine');
export const PRISMARINE_BRICKS = prismarine('prismarine_bricks', 'Ladrillos de prismarina', 'prismarine_bricks');
export const DARK_PRISMARINE = prismarine('dark_prismarine', 'Prismarina oscura', 'dark_prismarine');
addMaterialShapes({ key: 'prismarine', name: 'de prismarina', block: PRISMARINE, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone' });
addMaterialShapes({
  key: 'prismarine_brick', name: 'de ladrillos de prismarina', block: PRISMARINE_BRICKS, hardness: 1.5, tool: 'pickaxe', tier: 1,
  sound: 'stone',
});
addMaterialShapes({
  key: 'dark_prismarine', name: 'de prismarina oscura', block: DARK_PRISMARINE, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone',
});
export const PRISMARINE_WALL = addWall({ key: 'prismarine', name: 'de prismarina', block: PRISMARINE, hardness: 1.5 });

// ------------------------------------------------------------------ esponjas

export const SPONGE = family('sponge', 'Esponja', [], () => ({
  all: 'sponge', hardness: 0.6, sound: 'grass', category: 'naturaleza',
}));
export const WET_SPONGE = family('wet_sponge', 'Esponja mojada', [], () => ({
  all: 'wet_sponge', hardness: 0.6, sound: 'grass', category: 'naturaleza',
}));

/** Bloques del mar en el orden del inventario creativo. */
export const OCEAN_INVENTORY: readonly number[] = [
  ...CORAL_TYPES.flatMap((t) => [CORALS[t].block, CORALS[t].coral, CORALS[t].fan]),
  ...CORAL_TYPES.flatMap((t) => [DEAD_CORALS[t].block, DEAD_CORALS[t].coral, DEAD_CORALS[t].fan]),
  KELP, DRIED_KELP_BLOCK, SEAGRASS, SEA_PICKLE, PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE,
  SPONGE, WET_SPONGE,
];
