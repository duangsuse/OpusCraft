// Cobre (fase 6.5): bloque de cobre en bruto y, en cuatro fases de oxidación (normal, expuesto,
// degradado y oxidado) y con o sin cera, el bloque de cobre, el cobre cortado con sus escaleras y
// losas, el cobre grabado, la rejilla (se ve a través), la puerta y la trampilla, las barras, la
// cadena y el farol (da luz; de pie o colgado).
//
// Cada variante es una familia propia con las mismas propiedades que las demás de su tipo, así que
// pasar de una a otra (oxidarse, encerar, raspar) conserva el estado: id − base + otra base.
// El bloque de cobre normal sin cera es el clásico COPPER_BLOCK (id 60).
// Se registran al final de index.ts para no mover ningún id guardado.
import {
  family, defs, L, texOf, familyBase, stateOf, FAMILY_KINDS, KINDS, BLOCK_OPAQUE, BLOCK_SOLID, R_CUBE, R_CUTOUT, R_MODEL, R_TORCH,
  type BlockCategory, type NeighborGet, type Opts,
} from './registry';
import { COPPER_BLOCK } from './classic';
import { blockSupported } from './queries';
import { mbox, rotateBoxes, rotateFlat, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

/** Fases de oxidación: 0 normal, 1 expuesto, 2 degradado, 3 oxidado. */
export const OXIDATION_STAGES = 4;
export const OXIDIZED = 3;
/** Prefijo de las claves y texturas de cada fase (como en Minecraft). */
export const STAGE_PREFIX = ['', 'exposed_', 'weathered_', 'oxidized_'] as const;
const STAGE_NAME = ['', ' expuesto', ' degradado', ' oxidado'];

/** Texturas de cada fase de los tipos de bloque de cobre (lo que dibuja genCopper.ts). */
export function copperTexture(base: string, stage: number): string {
  if (base === 'copper_block') return stage === 0 ? 'copper_block' : `${STAGE_PREFIX[stage]}copper`;
  return STAGE_PREFIX[stage] + base;
}

export type CopperKind =
  | 'block' | 'cut' | 'chiseled' | 'grate' | 'cut_stairs' | 'cut_slab' | 'door' | 'trapdoor' | 'bars' | 'chain' | 'lantern'
  | 'bulb' | 'lightning_rod'; // Fase 7 (redstone)

interface CopperInfo {
  kind: CopperKind;
  stage: number;
  waxed: boolean;
}

/** COPPER[tipo][cera 0/1][fase] → estado base de la familia. */
export const COPPER = {} as Record<CopperKind, number[][]>;
/** Estado base de cada variante → tipo, fase y cera. */
const INFO = new Map<number, CopperInfo>();
/** Orden del inventario creativo. */
const INVENTORY: number[] = [];

const metal = (hardness: number, category: BlockCategory): Opts => ({ hardness, tool: 'pickaxe', tier: 1, sound: 'metal', category });

/** Nombre visible: «Cobre cortado expuesto encerado», «Puerta de cobre oxidado»… */
function copperName(noun: string, stage: number, waxed: boolean): string {
  return noun + STAGE_NAME[stage] + (waxed ? ' encerado' : '');
}

/** Clave: «waxed_exposed_cut_copper», «oxidized_copper_door»… */
function copperKey(base: string, stage: number, waxed: boolean): string {
  const k = base === 'copper_block' && stage > 0 ? `${STAGE_PREFIX[stage]}copper` : STAGE_PREFIX[stage] + base;
  return (waxed ? 'waxed_' : '') + k;
}

/**
 * Registra las ocho variantes de un tipo (cuatro fases, sin y con cera). `make` recibe la fase y
 * devuelve los datos de la familia; `existing` sustituye a la variante normal sin cera.
 */
function variants(
  kind: CopperKind, keyBase: string, noun: string, props: [string, number][],
  make: (stage: number) => (st: Record<string, number>) => Opts, existing?: number,
): void {
  COPPER[kind] = [[], []];
  for (const waxed of [false, true]) {
    for (let stage = 0; stage < OXIDATION_STAGES; stage++) {
      const id = existing !== undefined && !waxed && stage === 0
        ? existing
        : family(copperKey(keyBase, stage, waxed), copperName(noun, stage, waxed), props, make(stage));
      COPPER[kind][waxed ? 1 : 0][stage] = id;
      INFO.set(id, { kind, stage, waxed });
      if (id !== existing) INVENTORY.push(id);
    }
  }
}

/**
 * Fase 7 (redstone): tipos de cobre que se registran en otros módulos (la bombilla y el pararrayos) con
 * sus ocho variantes; oxidación, cera y raspado les funcionan como a los demás. Devuelve COPPER[kind].
 */
export function addCopperVariants(
  kind: CopperKind, keyBase: string, noun: string, props: [string, number][],
  make: (stage: number) => (st: Record<string, number>) => Opts,
): number[][] {
  variants(kind, keyBase, noun, props, make);
  return COPPER[kind];
}

// ------------------------------------------------------------------ bloques completos
/** Bloque de cobre en bruto (nueve de cobre en bruto). */
export const RAW_COPPER_BLOCK = family('raw_copper_block', 'Bloque de cobre en bruto', [], () => ({
  all: 'raw_copper_block', hardness: 5, tool: 'pickaxe', tier: 2, sound: 'stone', category: 'minerales',
}));
INVENTORY.push(RAW_COPPER_BLOCK);

// El bloque de cobre clásico pasa a picarse como los demás bloques de cobre.
Object.assign(defs[COPPER_BLOCK], { hardness: 3, tool: 'pickaxe', tier: 1 });

variants('block', 'copper_block', 'Cobre', [], (s) => () => ({
  ...metal(3, 'minerales'), all: copperTexture('copper_block', s),
}), COPPER_BLOCK);
// «Bloque de cobre» en la fase normal (con o sin cera), «Cobre expuesto»… en las demás.
defs[COPPER.block[1][0]].name = 'Bloque de cobre encerado';

variants('cut', 'cut_copper', 'Cobre cortado', [], (s) => () => ({ ...metal(3, 'construccion'), all: copperTexture('cut_copper', s) }));
variants('chiseled', 'chiseled_copper', 'Cobre grabado', [], (s) => () => ({
  ...metal(3, 'construccion'), all: copperTexture('chiseled_copper', s),
}));
/** Rejilla: cubo completo con agujeros (se ve a través y no tapa la luz). */
variants('grate', 'copper_grate', 'Rejilla de cobre', [], (s) => () => ({
  ...metal(3, 'construccion'), all: copperTexture('copper_grate', s), render: R_CUTOUT, lightOpacity: 0,
}));

// ------------------------------------------------------------------ escaleras y losas de cobre cortado
variants('cut_slab', 'cut_copper_slab', 'Losa de cobre cortado', [['type', 3]], (s) => (st) => {
  const cut = COPPER.cut[0][s];
  const t = texOf(cut);
  const o: Opts = { ...metal(3, 'construccion'), tex: defs[cut].tex };
  if (st.type === 2) return { ...o, render: R_CUBE };
  return { ...o, render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
});
variants('cut_stairs', 'cut_copper_stairs', 'Escaleras de cobre cortado', [['facing', 4], ['half', 2]], (s) => (st) => {
  const cut = COPPER.cut[0][s];
  const t = texOf(cut);
  const boxes = st.half === 0
    ? [mbox(0, 0, 0, 16, 8, 16, t), mbox(0, 8, 0, 16, 16, 8, t)]
    : [mbox(0, 8, 0, 16, 16, 16, t), mbox(0, 0, 0, 16, 8, 8, t)];
  return { ...metal(3, 'construccion'), tex: defs[cut].tex, render: R_MODEL, model: rotateBoxes(boxes, st.facing) };
});

// ------------------------------------------------------------------ puertas y trampillas
// Como las de madera (se abren con la mano), pero de metal y con pico.
variants('door', 'copper_door', 'Puerta de cobre', [['facing', 4], ['half', 2], ['open', 2], ['hinge', 2]], (s) => (st) => {
  const name = copperTexture(st.half ? 'copper_door_top' : 'copper_door_bottom', s);
  const tx = L(name);
  const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
  const bottom = copperTexture('copper_door_bottom', s);
  return {
    ...metal(3, 'decoracion'), render: R_MODEL, model: rotateBoxes([panel], st.facing),
    tex: [bottom, bottom, bottom, bottom, bottom, bottom], walkThrough: st.open === 1,
  };
});
variants('trapdoor', 'copper_trapdoor', 'Trampilla de cobre', [['facing', 4], ['half', 2], ['open', 2]], (s) => (st) => {
  const name = copperTexture('copper_trapdoor', s);
  const tx = L(name);
  const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing)
    : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
  return { ...metal(3, 'decoracion'), render: R_MODEL, model: box, tex: [name, name, name, name, name, name] };
});

// ------------------------------------------------------------------ barras
/** Las barras se unen a otras barras de cobre y a los bloques sólidos completos. */
function barsConnect(id: number): boolean {
  return id > 0 && (INFO.get(familyBase(id))?.kind === 'bars' || BLOCK_OPAQUE[id] === 1);
}
variants('bars', 'copper_bars', 'Barras de cobre', [], (s) => () => {
  const name = copperTexture('copper_bars', s);
  const b = L(name);
  const arm = (d: number) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, b)], d);
  const flat = (d: number) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
  return {
    ...metal(5, 'decoracion'), render: R_MODEL, all: name, flatItem: name,
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, b)];
      for (let d = 0; d < 4; d++) if (barsConnect(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
      return boxes;
    },
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0; d < 4; d++) if (barsConnect(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...flat(d));
      return out;
    },
  };
});

// ------------------------------------------------------------------ cadena
/** Eje de la cadena: 0 vertical (Y), 1 a lo largo de X, 2 a lo largo de Z. */
export const CHAIN_Y = 0, CHAIN_X = 1, CHAIN_Z = 2;

/** Dos planos cruzados de 4 px de ancho a lo largo del eje (la textura lleva la cadena en forma de cruz). */
function chainBoxes(axis: number, t: number): ModelBox[] {
  const n = -1;
  if (axis === CHAIN_X) return [mbox(0, 6, 8, 16, 10, 8, [n, n, n, n, t, t]), mbox(0, 8, 6, 16, 8, 10, [n, n, t, t, n, n])];
  if (axis === CHAIN_Z) return [mbox(8, 6, 0, 8, 10, 16, [t, t, n, n, n, n]), mbox(6, 8, 0, 10, 8, 16, [n, n, t, t, n, n])];
  return [mbox(6, 0, 8, 10, 16, 8, [n, n, n, n, t, t]), mbox(8, 0, 6, 8, 16, 10, [t, t, n, n, n, n])];
}
const CHAIN_BOX = [
  [6.5 / 16, 0, 6.5 / 16, 9.5 / 16, 1, 9.5 / 16],
  [0, 6.5 / 16, 6.5 / 16, 1, 9.5 / 16, 9.5 / 16],
  [6.5 / 16, 6.5 / 16, 0, 9.5 / 16, 9.5 / 16, 1],
];
variants('chain', 'copper_chain', 'Cadena de cobre', [['axis', 3]], (s) => (st) => {
  const name = copperTexture('copper_chain', s);
  return {
    ...metal(5, 'decoracion'), render: R_MODEL, all: name, flatItem: name, model: chainBoxes(st.axis, L(name)),
    collision: CHAIN_BOX[st.axis], selection: CHAIN_BOX[st.axis],
  };
});

// ------------------------------------------------------------------ farol
/**
 * Farol de pie (sobre un bloque) o colgado (de un techo o de una cadena). La textura lleva el
 * farol en su sitio (cuerpo abajo, tapa encima y asa o cadena arriba); las tapas usan la del
 * bloque de cobre de su fase.
 */
function lanternBoxes(hanging: boolean, side: number, top: number): ModelBox[] {
  const n = -1;
  const f = [side, side, top, top, side, side];
  const y = hanging ? 1 : 0;
  const boxes = [mbox(5, y, 5, 11, y + 7, 11, f), mbox(6, y + 7, 6, 10, y + 9, 10, f)];
  const y0 = y + 9, y1 = hanging ? 16 : y + 11;
  boxes.push(mbox(7, y0, 8, 9, y1, 8, [n, n, n, n, side, side]), mbox(8, y0, 7, 8, y1, 9, [side, side, n, n, n, n]));
  return boxes;
}
variants('lantern', 'copper_lantern', 'Farol de cobre', [['hanging', 2]], (s) => (st) => {
  const name = copperTexture('copper_lantern', s);
  const hanging = st.hanging === 1;
  const box = hanging ? [5 / 16, 1 / 16, 5 / 16, 11 / 16, 10 / 16, 11 / 16] : [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16];
  return {
    ...metal(3.5, 'decoracion'), render: R_MODEL, all: name, flatItem: name, emission: 15, lightOpacity: 0,
    model: lanternBoxes(hanging, L(name), L(copperTexture('copper_block', s))),
    collision: box, selection: box,
    // De pie necesita un bloque sólido debajo; colgado, uno encima (o una cadena).
    support: (get: NeighborGet) => {
      const b = hanging ? get(0, 1, 0) : get(0, -1, 0);
      return b < 0 || BLOCK_SOLID[b] === 1;
    },
  };
});

// ------------------------------------------------------------------ antorcha de cobre
/** Antorcha de cobre: como la normal, pero con la llama verde (no se oxida). */
export const COPPER_TORCH = family('copper_torch', 'Antorcha de cobre', [], () => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: 'wood', all: 'copper_torch', hardness: 0, category: 'decoracion',
}));
export const COPPER_WALL_TORCH = family('copper_wall_torch', 'Antorcha de cobre', [['facing', 4]], (st) => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: 'wood', all: 'copper_torch', hardness: 0, category: null,
  wall: st.facing, base: COPPER_TORCH, selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing),
}));
INVENTORY.push(COPPER_TORCH);

// ------------------------------------------------------------------ tipos, inventario y consultas
for (const [kind, k] of [['cut_slab', KINDS.slab], ['cut_stairs', KINDS.stairs], ['door', KINDS.door], ['trapdoor', KINDS.trapdoor]] as const) {
  for (const row of COPPER[kind]) for (const id of row) FAMILY_KINDS.set(id, k);
}

/** Bloques de cobre en el orden del inventario creativo (el bloque de cobre clásico ya está). */
export const COPPER_INVENTORY: readonly number[] = INVENTORY;

/** Tipo, fase de oxidación y cera de un bloque de cobre (null si no lo es). */
export function copperInfo(id: number): CopperInfo | null {
  return INFO.get(familyBase(id)) ?? null;
}

/** El mismo bloque (mismo estado: orientación, mitad…) en otra fase o con otra cera. */
export function copperVariant(id: number, stage: number, waxed: boolean): number {
  const info = copperInfo(id);
  if (!info) return 0;
  return COPPER[info.kind][waxed ? 1 : 0][stage] + (id - familyBase(id));
}

/** Siguiente fase de oxidación (0 si está encerado o ya oxidado). */
export function oxidizedCopper(id: number): number {
  const info = copperInfo(id);
  if (!info || info.waxed || info.stage >= OXIDIZED) return 0;
  return copperVariant(id, info.stage + 1, false);
}

/** El mismo bloque encerado (0 si no es cobre o ya tiene cera). */
export function waxedCopper(id: number): number {
  const info = copperInfo(id);
  return info && !info.waxed ? copperVariant(id, info.stage, true) : 0;
}

/** Raspado con un hacha: quita la cera o, si no tiene, una fase de oxidación (0 si no hay nada que raspar). */
export function scrapedCopper(id: number): number {
  const info = copperInfo(id);
  if (!info) return 0;
  if (info.waxed) return copperVariant(id, info.stage, false);
  return info.stage > 0 ? copperVariant(id, info.stage - 1, false) : 0;
}

/** ¿Se oxida con el tiempo? (cobre sin cera que aún no está oxidado del todo). */
export function isWeathering(id: number): boolean {
  const info = copperInfo(id);
  return !!info && !info.waxed && info.stage < OXIDIZED;
}

/**
 * Colocación especial de cadenas (en el eje de la cara en la que se hace clic), faroles (colgados si
 * se hace clic en la cara de abajo de un bloque) y antorchas de cobre (en la pared o de pie; el apoyo
 * de la de pie lo comprueba quien llama, como con las antorchas normales). Devuelve el estado que se
 * coloca, 0 si no se puede o −1 si el bloque no es uno de éstos.
 */
export function copperPlacement(item: number, face: 'up' | 'down' | 'side', nx: number, nz: number, get: NeighborGet): number {
  if (item === COPPER_TORCH) {
    if (face === 'down') return 0;
    if (face === 'side') {
      const id = stateOf(COPPER_WALL_TORCH, { facing: nz < 0 ? 0 : nx > 0 ? 1 : nz > 0 ? 2 : 3 });
      if (blockSupported(id, get)) return id;
    }
    return COPPER_TORCH;
  }
  const info = copperInfo(item);
  if (!info) return -1;
  const base = familyBase(item);
  if (info.kind === 'chain') return base + (face !== 'side' ? CHAIN_Y : nx !== 0 ? CHAIN_X : CHAIN_Z);
  if (info.kind !== 'lantern') return -1;
  const solid = (b: number) => b > 0 && BLOCK_SOLID[b] === 1;
  const above = solid(get(0, 1, 0)), below = solid(get(0, -1, 0));
  if (face === 'down') return above ? base + 1 : below ? base : 0;
  return below ? base : above ? base + 1 : 0;
}
