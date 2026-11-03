// Registro de bloques: tipos, definición de bloques (def) y de familias con estados (family), y las
// tablas planas que usan los bucles calientes. Las tablas se rellenan en finalizeBlocks(), que llama
// index.ts cuando ya están registrados todos los bloques (el orden de registro fija los ids guardados).
import { textureLayer, TEXTURE_DEFS } from '../textureDefs';
import { MAX_BLOCK_ID, FIRST_EXTENDED_BLOCK } from '../constants';
import { flatBoxes, type ModelBox } from '../blockModels';

/** Tipos de renderizado de un bloque. */
export const R_NONE = 0; // aire
export const R_CUBE = 1; // cubo opaco (pasada opaca)
export const R_CUTOUT = 2; // cubo completo con recorte alpha (hojas, cristal)
export const R_CROSS = 3; // planta en cruz
export const R_WATER = 4; // agua (pasada translúcida)
export const R_TRANSLUCENT = 5; // hielo (pasada translúcida)
export const R_TORCH = 6; // antorcha
export const R_CACTUS = 7; // cactus (caras laterales hundidas 1/16)
export const R_LAVA = 8; // lava (opaca, emisiva, superficie rebajada)
export const R_MODEL = 9; // forma hecha de cajas (losas, escaleras, vallas, puertas…)
export const R_CROP = 10; // cultivo: cuatro planos en forma de # (trigo, zanahorias…)
/** Fase 7 (transporte): raíl (un plano pegado al suelo o en cuesta). Valor alto: no choca con otros tipos nuevos. */
export const R_RAIL = 21;

/** Vecino relativo (dx, dy, dz) → id del bloque (-1 si no se sabe). */
export type NeighborGet = (dx: number, dy: number, dz: number) => number;

export type SoundMaterial =
  | 'stone'
  | 'wood'
  | 'grass'
  | 'dirt'
  | 'sand'
  | 'gravel'
  | 'glass'
  | 'snow'
  | 'wool'
  | 'metal'
  | 'leaves'
  | 'water'
  | 'lava'
  | 'sculk' // Fase 7.5 (abismo)
  // Fase 8.2 (biomas del Nether): los tipos de sonido propios del Nether, como en Java.
  | 'netherrack'
  | 'nether_bricks'
  | 'nether_wood'
  | 'stem'
  | 'nylium'
  | 'fungus'
  | 'roots'
  | 'shroomlight'
  | 'vines'
  | 'soul_sand'
  | 'soul_soil'
  | 'basalt'
  | 'wart'
  | 'nether_ore'
  // Fase 8.5 (lo que da el Nether): escombros ancestrales, netherita y magnetita.
  | 'ancient_debris'
  | 'netherite'
  | 'lodestone';

export type BlockCategory = 'construccion' | 'naturaleza' | 'minerales' | 'decoracion' | 'colores'
  | 'redstone'; // Fase 7 (redstone)

export interface BlockDef {
  id: number;
  key: string;
  /** Nombre visible (en español). */
  name: string;
  render: number;
  /** Colisiona con el jugador. */
  solid: boolean;
  /** Cubo opaco completo: oculta caras vecinas, bloquea la luz y proyecta oclusión ambiental. */
  opaque: boolean;
  /** Cuánto reduce la luz al atravesarlo (0..15). */
  lightOpacity: number;
  /** Nivel de luz emitida (0..15). */
  emission: number;
  /** Texturas por cara: +X, -X, +Y, -Y, +Z, -Z. */
  tex: [string, string, string, string, string, string];
  sound: SoundMaterial;
  /** Se puede colocar otro bloque encima de su celda (aire, agua, hierba...). */
  replaceable: boolean;
  breakable: boolean;
  category: BlockCategory | null;
  /** Dureza estilo Minecraft (segundos base de minado); -1 = irrompible. */
  hardness: number;
  /** Herramienta adecuada para minarlo. */
  tool: ToolKind | null;
  /** Nivel mínimo de pico para que suelte algo (0 = cualquiera, 1 madera, 2 piedra, 3 hierro, 4 diamante). */
  tier: number;
  /** 0 = no es fluido, 1 = agua, 2 = lava. */
  fluid: number;
  /** Nivel del fluido: 0 fuente, 1..7 fluyendo (más alto = más lejos), 8 cayendo. */
  level: number;
  /** Forma fija hecha de cajas (render R_MODEL). */
  model?: ModelBox[];
  /** Forma que depende de los vecinos (vallas, paneles). */
  shape?: (get: NeighborGet) => ModelBox[];
  /** Modelo para la mano y el inventario (si la forma depende de los vecinos). */
  itemModel?: ModelBox[];
  /** Cajas de colisión (0..1, 6 números por caja); por defecto las del modelo o el cubo. */
  collision?: number[] | ((get: NeighborGet) => number[]);
  /** Cajas de selección (contorno y rayo). */
  selection?: number[] | ((get: NeighborGet) => number[]);
  /** Bloque que se obtiene como objeto (estados de una familia → su estado base). */
  base?: number;
  /** Se puede trepar (escalera de mano). */
  climbable?: boolean;
  /** Apoyado en una pared: dirección (0 N, 1 E, 2 S, 3 O) hacia la que mira; la pared está detrás. */
  wall?: number;
  /** Las criaturas pueden cruzarlo (puertas y portillos abiertos). */
  walkThrough?: boolean;
  /** Textura con la que se dibuja plano como objeto (escalera de mano, panel). */
  flatItem?: string;
  /** No se obtiene como objeto (cultivos, tierra de cultivo). */
  noItem?: boolean;
  /** Caras cuya textura va girada 90° (bit por cara, en el orden de `tex`): troncos tumbados. */
  texRot?: number;
  /** Apoyo a medida (enredaderas, nenúfares): se rompe cuando deja de cumplirse. */
  support?: (get: NeighborGet) => boolean;
}

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'hoe'; // Fase 7.5 (abismo): la azada, para el sculk

export type Opts = Partial<Omit<BlockDef, 'id' | 'key' | 'name' | 'tex'>> & {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
  tex?: BlockDef['tex'];
};

export const defs: BlockDef[] = [];

export function def(id: number, key: string, name: string, o: Opts): void {
  const side = o.side ?? o.all ?? 'stone';
  const top = o.top ?? o.all ?? side;
  const bottom = o.bottom ?? o.top ?? o.all ?? side;
  const tex: BlockDef['tex'] = o.tex ?? [side, side, top, bottom, side, side];
  const render = o.render ?? R_CUBE;
  const opaque = o.opaque ?? render === R_CUBE;
  defs[id] = {
    id,
    key,
    name,
    render,
    solid: o.solid ?? true,
    opaque,
    lightOpacity: o.lightOpacity ?? (opaque ? 15 : 0),
    emission: o.emission ?? 0,
    tex,
    sound: o.sound ?? 'stone',
    replaceable: o.replaceable ?? false,
    breakable: o.breakable ?? true,
    category: o.category === undefined ? 'construccion' : o.category,
    hardness: o.hardness ?? 1.5,
    tool: o.tool === undefined ? null : o.tool,
    tier: o.tier ?? 0,
    fluid: o.fluid ?? 0,
    level: o.level ?? 0,
    model: o.model,
    shape: o.shape,
    itemModel: o.itemModel,
    collision: o.collision,
    selection: o.selection,
    base: o.base,
    climbable: o.climbable,
    wall: o.wall,
    walkThrough: o.walkThrough,
    flatItem: o.flatItem,
    noItem: o.noItem,
    support: o.support,
    texRot: o.texRot,
  };
}

// ------------------------------------------------------------------ familias de estados
// Un bloque con propiedades (orientación, mitad, abierto…) ocupa un id por combinación, a partir de
// FIRST_EXTENDED_BLOCK. El primer estado es el que se obtiene como objeto.

interface Family {
  key: string;
  base: number;
  props: [string, number][];
  count: number;
}

const FAMILY_OF: (Family | undefined)[] = [];
let nextFamilyId = FIRST_EXTENDED_BLOCK;

function decodeState(props: [string, number][], index: number): Record<string, number> {
  const st: Record<string, number> = {};
  let r = index;
  for (const [name, n] of props) {
    st[name] = r % n;
    r = Math.floor(r / n);
  }
  return st;
}

export function family(key: string, name: string, props: [string, number][], make: (st: Record<string, number>) => Opts): number {
  const count = props.reduce((a, [, n]) => a * n, 1);
  const base = nextFamilyId;
  const fam: Family = { key, base, props, count };
  for (let i = 0; i < count; i++) {
    const o = make(decodeState(props, i));
    const category = i === 0 ? (o.category === undefined ? 'construccion' : o.category) : null;
    def(base + i, i === 0 ? key : `${key}_${i}`, name, { ...o, category, base: o.base ?? base });
    FAMILY_OF[base + i] = fam;
  }
  nextFamilyId += count;
  return base;
}

/** Todos los ids (estados) de la familia de `id` (sólo él si no es de una familia). */
export function familyStates(id: number): number[] {
  const fam = FAMILY_OF[id];
  if (!fam) return [id];
  return Array.from({ length: fam.count }, (_, i) => fam.base + i);
}

/** Id del estado de la familia de `base` con las propiedades dadas (las que falten valen 0). */
export function stateOf(base: number, st: Record<string, number>): number {
  const fam = FAMILY_OF[base];
  if (!fam) return base;
  let idx = 0, mul = 1;
  for (const [name, n] of fam.props) {
    idx += (((st[name] ?? 0) % n) + n) % n * mul;
    mul *= n;
  }
  return fam.base + idx;
}

/** Propiedades de un estado (null si no pertenece a una familia). */
export function stateProps(id: number): Record<string, number> | null {
  const fam = FAMILY_OF[id];
  return fam ? decodeState(fam.props, id - fam.base) : null;
}

/** Estado base de la familia de un bloque (o el propio id). */
export function familyBase(id: number): number {
  return FAMILY_OF[id]?.base ?? id;
}

/** Capa de textura de un nombre (para los modelos de cajas). */
export const L = (name: string) => textureLayer(name);
/** Capas de las seis caras de un bloque ya registrado. */
export const texOf = (block: number) => defs[block].tex.map(L);

// Tablas planas para los bucles calientes (mallado, luz, física).
export const BLOCK_RENDER = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_SOLID = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_OPAQUE = new Uint8Array(MAX_BLOCK_ID);
/** Proyecta oclusión ambiental (cubos opacos y hojas). */
export const BLOCK_AO = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_LIGHT_OPACITY = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_EMISSION = new Uint8Array(MAX_BLOCK_ID);
/** Fase 8 (entorno del Nether): luz de alma (fuego, antorchas, faroles y fogatas de alma): alumbra en turquesa. */
export const BLOCK_SOUL_LIGHT = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_REPLACEABLE = new Uint8Array(MAX_BLOCK_ID);
/** Capa de textura para cada cara: índice = id * 6 + cara. */
export const BLOCK_TEX = new Uint16Array(MAX_BLOCK_ID * 6);
/** Caras con la textura girada 90° (bit por cara). */
export const BLOCK_TEXROT = new Uint8Array(MAX_BLOCK_ID);
/** 0 = no fluido, 1 = agua, 2 = lava. */
export const BLOCK_FLUID = new Uint8Array(MAX_BLOCK_ID);
/** 0 fuente, 1..7 fluyendo, 8 cayendo. */
export const BLOCK_FLUID_LEVEL = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_HARDNESS = new Float32Array(MAX_BLOCK_ID);
/** Bloque que se obtiene como objeto (estados → su estado base). */
export const BLOCK_BASE = new Uint16Array(MAX_BLOCK_ID);
/** Colisión: 0 ninguna, 1 cubo completo, 2 forma (cajas). */
export const BLOCK_COLLIDE = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_CLIMB = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_WALKTHROUGH = new Uint8Array(MAX_BLOCK_ID);
/** Dirección de la pared (0..3) de antorchas de pared y escaleras de mano; -1 si no. */
export const BLOCK_WALL = new Int8Array(MAX_BLOCK_ID);
/** El modelo usa texturas con recorte (pasada de recortes). */
export const BLOCK_MODEL_CUTOUT = new Uint8Array(MAX_BLOCK_ID);
/** Fase 6.5 (colores): el modelo usa texturas translúcidas (paneles de cristal de color: pasada translúcida). */
export const BLOCK_MODEL_TRANSLUCENT = new Uint8Array(MAX_BLOCK_ID);
export const STATIC_COLLISION: (number[] | undefined)[] = [];
/** Tipo de bloque con estados: 1 puerta, 2 trampilla, 3 portillo, 4 cama, 5 losa, 6 escalera. */
const KIND_DOOR = 1, KIND_TRAPDOOR = 2, KIND_GATE = 3, KIND_BED = 4, KIND_SLAB = 5, KIND_STAIRS = 6;
const KIND_CROP = 7, KIND_CAKE = 8, KIND_FARMLAND = 9, KIND_FENCE = 10;
/** Tipos de bloque para finalizeBlocks(). */
export const KINDS = {
  door: KIND_DOOR, trapdoor: KIND_TRAPDOOR, gate: KIND_GATE, bed: KIND_BED, slab: KIND_SLAB, stairs: KIND_STAIRS,
  crop: KIND_CROP, cake: KIND_CAKE, farmland: KIND_FARMLAND, fence: KIND_FENCE,
} as const;
export const BLOCK_KIND = new Uint8Array(MAX_BLOCK_ID);
/** Fase 6.5 (cobre): tipo de las familias registradas fuera de index.ts (estado base → tipo de KINDS). */
export const FAMILY_KINDS = new Map<number, number>();
/** Necesita apoyo de un vecino (antorchas de pared, escaleras de mano, puertas, camas). */
export const BLOCK_NEEDS_SUPPORT = new Uint8Array(MAX_BLOCK_ID);
/** Colisión más alta que un bloque (vallas y portillos cerrados): no se puede saltar por encima. */
export const BLOCK_TALL = new Uint8Array(MAX_BLOCK_ID);
/** Rellena las tablas planas; `kindOf` da el tipo de cada familia por su estado base. */
export function finalizeBlocks(kindOf: ReadonlyMap<number, number>): void {
  for (const b of defs) {
    if (!b) continue;
    const k = kindOf.get(familyBase(b.id)) ?? FAMILY_KINDS.get(familyBase(b.id)) ?? 0;
    BLOCK_KIND[b.id] = k;
    BLOCK_TALL[b.id] = k === KIND_FENCE || (k === KIND_GATE && b.solid) ? 1 : 0;
    BLOCK_NEEDS_SUPPORT[b.id] = k === KIND_DOOR || k === KIND_BED || k === KIND_CROP || k === KIND_CAKE ||
      (b.wall !== undefined && b.wall >= 0) || !!b.support ? 1 : 0;
  }
  for (const b of defs) {
    if (!b) continue;
    BLOCK_FLUID[b.id] = b.fluid;
    BLOCK_FLUID_LEVEL[b.id] = b.level;
    BLOCK_HARDNESS[b.id] = b.hardness;
    BLOCK_RENDER[b.id] = b.render;
    BLOCK_SOLID[b.id] = b.solid ? 1 : 0;
    BLOCK_OPAQUE[b.id] = b.opaque ? 1 : 0;
    BLOCK_AO[b.id] = b.opaque || (b.render === R_CUTOUT && b.lightOpacity > 0) ? 1 : 0;
    BLOCK_LIGHT_OPACITY[b.id] = b.lightOpacity;
    BLOCK_EMISSION[b.id] = b.emission;
    BLOCK_SOUL_LIGHT[b.id] = b.emission > 0 && b.key.startsWith('soul_') ? 1 : 0;
    BLOCK_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
    for (let f = 0; f < 6; f++) BLOCK_TEX[b.id * 6 + f] = b.render === R_NONE ? 0 : textureLayer(b.tex[f]);
    BLOCK_TEXROT[b.id] = b.texRot ?? 0;
    BLOCK_BASE[b.id] = b.base ?? b.id;
    BLOCK_COLLIDE[b.id] = !b.solid ? 0 : b.render === R_MODEL || b.collision ? 2 : 1;
    BLOCK_CLIMB[b.id] = b.climbable ? 1 : 0;
    BLOCK_WALKTHROUGH[b.id] = b.walkThrough ? 1 : 0;
    BLOCK_WALL[b.id] = b.wall ?? -1;
    const boxes = b.model ?? b.itemModel ?? [];
    BLOCK_MODEL_CUTOUT[b.id] = boxes.some((m) => m.tex.some((l) => l >= 0 && !!TEXTURE_DEFS[l]?.cutout)) ||
      (b.render === R_MODEL && b.tex.some((n) => !!TEXTURE_DEFS[textureLayer(n)]?.cutout)) ? 1 : 0;
    // Fase 6.5 (colores)
    // Fase 6.5 (equipo): el fuego (special 5) no es translúcido, va con los recortes.
    BLOCK_MODEL_TRANSLUCENT[b.id] = b.render === R_MODEL && b.tex.some((n) => [3, 4].includes(TEXTURE_DEFS[textureLayer(n)]?.special ?? 0)) ? 1 : 0;
    if (b.render === R_MODEL && !b.shape) STATIC_COLLISION[b.id] = typeof b.collision === 'object' ? b.collision : flatBoxes(b.model ?? []);
  }
}

export function isBed(id: number): boolean {
  return BLOCK_KIND[id] === KIND_BED;
}

export function isDoor(id: number): boolean {
  return BLOCK_KIND[id] === KIND_DOOR;
}

export function isTrapdoor(id: number): boolean {
  return BLOCK_KIND[id] === KIND_TRAPDOOR;
}

export function isFenceGate(id: number): boolean {
  return BLOCK_KIND[id] === KIND_GATE;
}

export function isSlab(id: number): boolean {
  return BLOCK_KIND[id] === KIND_SLAB;
}

export function isCrop(id: number): boolean {
  return BLOCK_KIND[id] === KIND_CROP;
}

export function isCake(id: number): boolean {
  return BLOCK_KIND[id] === KIND_CAKE;
}

export function isFarmland(id: number): boolean {
  return BLOCK_KIND[id] === KIND_FARMLAND;
}

export function isStairs(id: number): boolean {
  return BLOCK_KIND[id] === KIND_STAIRS;
}
