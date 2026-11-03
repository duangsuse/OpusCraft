// Fase 6.5 (equipo): fuego y conducto.
// - Fuego: sin colisión, luz 15, llamas animadas (textura con `special` 5). Su edad (0..15) va en el
//   estado; la lleva el sistema de fuego del servidor, que lo propaga, quema lo inflamable y lo apaga.
//   No se obtiene como objeto: lo enciende el mechero (o un rayo).
// - Conducto: cubo pequeño que da luz; con estado `water` (anegado, como las plantas marinas) y
//   `active` (con marco de prismarina completo se abre el ojo).
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import { family, defs, L, familyBase, stateOf, stateProps, BLOCK_SOLID, R_MODEL, R_CROSS, type NeighborGet } from './registry';
import { BLOCK_WATERLOGGED } from './ocean';
import { mbox, type ModelBox } from '../blockModels';

// ------------------------------------------------------------------ fuego

/** Edades del fuego (Minecraft: 0..15; a más edad, más cerca de apagarse). */
export const FIRE_AGES = 16;

/**
 * Llamas: dos planos cruzados en el centro y cuatro pegados a los lados (como el fuego de Minecraft
 * sobre el suelo). Todos con la textura por las dos caras.
 */
function fireBoxes(): ModelBox[] {
  const f = L('fire');
  const x = [f, f, -1, -1, -1, -1], z = [-1, -1, -1, -1, f, f];
  return [
    mbox(8, 0, 0, 8, 16, 16, x), mbox(0, 0, 8, 16, 16, 8, z),
    mbox(1, 0, 0, 1, 15, 16, x), mbox(15, 0, 0, 15, 15, 16, x),
    mbox(0, 0, 1, 16, 15, 1, z), mbox(0, 0, 15, 16, 15, 15, z),
  ];
}

/** El fuego se sostiene sobre un bloque sólido o junto a algo inflamable. */
/**
 * Forma según el sitio: sobre suelo firme, las llamas de siempre; en el aire junto a algo inflamable,
 * láminas pegadas a las caras de lo que arde (como el fuego de Minecraft en una pared o un techo).
 */
function fireShape(get: NeighborGet): ModelBox[] {
  const below = get(0, -1, 0);
  if (below < 0 || BLOCK_SOLID[below] === 1) return fireBoxes();
  const f = L('fire');
  const x = [f, f, -1, -1, -1, -1], z = [-1, -1, -1, -1, f, f];
  const out: ModelBox[] = [];
  if (flameEncouragement(get(1, 0, 0)) > 0) out.push(mbox(15, 0, 0, 15, 16, 16, x));
  if (flameEncouragement(get(-1, 0, 0)) > 0) out.push(mbox(1, 0, 0, 1, 16, 16, x));
  if (flameEncouragement(get(0, 0, 1)) > 0) out.push(mbox(0, 0, 15, 16, 16, 15, z));
  if (flameEncouragement(get(0, 0, -1)) > 0) out.push(mbox(0, 0, 1, 16, 16, 1, z));
  if (flameEncouragement(get(0, 1, 0)) > 0) out.push(mbox(0, 14, 0, 16, 14, 16, [-1, -1, f, f, -1, -1]));
  return out.length ? out : fireBoxes();
}

export function fireSupport(get: NeighborGet): boolean {
  const below = get(0, -1, 0);
  if (below < 0 || BLOCK_SOLID[below] === 1) return true;
  for (const [dx, dy, dz] of NEIGHBORS6) if (flameEncouragement(get(dx, dy, dz)) > 0) return true;
  return false;
}

export const FIRE = family('fire', 'Fuego', [['age', FIRE_AGES]], () => ({
  render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, emission: 15, hardness: 0, sound: 'wool', all: 'fire',
  replaceable: true, walkThrough: true, noItem: true, category: null, model: fireBoxes(), shape: fireShape, collision: [],
  selection: [0, 0, 0, 1, 1 / 16, 1], support: fireSupport,
}));

export function isFire(id: number): boolean {
  return id > 0 && familyBase(id) === FIRE;
}

export function fireAge(id: number): number {
  return isFire(id) ? id - FIRE : 0;
}

export function fireWithAge(age: number): number {
  return FIRE + Math.max(0, Math.min(FIRE_AGES - 1, age | 0));
}

/** Los seis vecinos (+X, −X, +Y, −Y, +Z, −Z). */
export const NEIGHBORS6: readonly [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Inflamabilidad de Minecraft por tipo de bloque: [facilidad para que prenda (propagación), facilidad
// para consumirse]. Se decide por la clave del bloque base (con todos los bloques ya registrados).
const FLAME_RULES: [RegExp, number, number][] = [
  [/_leaves$/, 30, 60],
  [/_wool$|^dried_kelp_block$/, 30, 60],
  [/_carpet$|^hay_bale$|^pink_petals$/, 60, 20],
  [/^(chiseled_)?bookshelf$|^lectern$/, 30, 20],
  [/^bamboo_block$|^stripped_bamboo_block$/, 5, 5],
  [/(^|_)(log|wood)$|^mangrove_roots$/, 5, 5],
  [/_planks$|_slab$|_stairs$|_fence$|_fence_gate$|^bamboo_mosaic$|^composter$|^bee_nest$|^beehive$|_table$/, 5, 20],
  [/^vine$|^glow_lichen$|^big_dripleaf$|^cave_vines$/, 15, 100],
  [/^moss_block$|^moss_carpet$/, 5, 100],
  [/^azalea$|^flowering_azalea$|^hanging_roots$/, 30, 60],
  [/^scaffolding$|^bamboo$/, 60, 60],
  [/^tnt$/, 15, 100], // Fase 7 (mecanismos): la dinamita prende (y se enciende al quemarse)
];
/** Madera carmesí y distorsionada (y sus formas): no arde, como en Java. */
const NETHER_WOOD_KEY = /^(stripped_)?(crimson|warped)_/;
/** Plantas en cruz que arden (hierba, helechos, flores…): no las de cultivo ni los brotes. */
const PLANT_FLAMES: [number, number] = [60, 100];
const NOT_FLAMMABLE_PLANT = /sapling|propagule|mushroom|crop|carrots|potatoes|beetroots|stem|sugar_cane|kelp|seagrass|coral|lily_pad|cobweb|dripstone|amethyst/;

let flameTable: Int16Array | null = null;

function buildFlames(): Int16Array {
  const t = new Int16Array(defs.length * 2);
  for (const b of defs) {
    if (!b || b.fluid) continue;
    const base = defs[familyBase(b.id)] ?? b;
    const key = base.key;
    if (NETHER_WOOD_KEY.test(key)) continue; // Fase 8.2: la madera del Nether no arde
    let rule: [number, number] | null = null;
    for (const [re, enc, burn] of FLAME_RULES) {
      if (!re.test(key)) continue;
      // Losas, escaleras y vallas de piedra no arden: sólo las de madera.
      if (/_slab$|_stairs$|_fence$|_fence_gate$|_table$/.test(key) && base.sound !== 'wood') continue;
      rule = [enc, burn];
      break;
    }
    if (!rule && b.render === R_CROSS && base.sound === 'grass' && !NOT_FLAMMABLE_PLANT.test(key)) rule = PLANT_FLAMES;
    if (rule) {
      t[b.id * 2] = rule[0];
      t[b.id * 2 + 1] = rule[1];
    }
  }
  return t;
}

/** Facilidad con que el fuego prende en el bloque (0 = no arde). */
export function flameEncouragement(id: number): number {
  if (id <= 0) return 0;
  flameTable ??= buildFlames();
  return flameTable[id * 2] ?? 0;
}

/** Facilidad con que el fuego consume el bloque (0 = no arde). */
export function flammability(id: number): number {
  if (id <= 0) return 0;
  flameTable ??= buildFlames();
  return flameTable[id * 2 + 1] ?? 0;
}

// ------------------------------------------------------------------ conducto

function conduitBoxes(active: boolean): ModelBox[] {
  const t = L(active ? 'conduit_open' : 'conduit_closed');
  return [mbox(5, 5, 5, 11, 11, 11, t)];
}

export const CONDUIT = family('conduit', 'Conducto', [['water', 2], ['active', 2]], (st) => ({
  render: R_MODEL, opaque: false, lightOpacity: 0, emission: 15, hardness: 3, tool: 'pickaxe', sound: 'stone', all: 'conduit_closed',
  category: 'decoracion', model: conduitBoxes(st.active === 1), itemModel: conduitBoxes(false),
  collision: [5 / 16, 5 / 16, 5 / 16, 11 / 16, 11 / 16, 11 / 16], selection: [5 / 16, 5 / 16, 5 / 16, 11 / 16, 11 / 16, 11 / 16],
  ...(st.water ? { fluid: 1, level: 0, lightOpacity: 2 } : {}),
}));
for (let id = CONDUIT; defs[id] && familyBase(id) === CONDUIT; id++) if (defs[id].fluid === 1) BLOCK_WATERLOGGED[id] = 1;

export function isConduit(id: number): boolean {
  return id > 0 && familyBase(id) === CONDUIT;
}

/** El mismo conducto encendido o apagado. */
export function conduitActive(id: number, active: boolean): number {
  return stateOf(CONDUIT, { water: stateProps(id)?.water ?? 0, active: active ? 1 : 0 });
}

/** Conducto (anegado si la celda tiene agua) para colocar. */
export function conduitFor(wet: boolean): number {
  return stateOf(CONDUIT, { water: wet ? 1 : 0, active: 0 });
}

export const EQUIPMENT_INVENTORY: readonly number[] = [CONDUIT];
