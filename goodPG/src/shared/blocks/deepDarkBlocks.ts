// Fase 7.5 (abismo): bloques del Deep Dark y de la ciudad antigua.
// - Sculk (bloque, venas en varias caras, catalizador que florece), sensor de sculk (inactivo, activo
//   y enfriándose), sensor calibrado (lee la potencia por su lado de entrada) y chillador (chillando y
//   si puede invocar al warden). Los sensores y el chillador se pueden anegar (estado `water`).
// - Pizarra profunda reforzada (se rompe despacísimo y no suelta nada).
// - Bloques de alma que se adelantan de la fase 8 porque los usa la ciudad antigua: arena y tierra de
//   alma, fuego de alma, antorcha de alma y farol de alma.
// Lo que emite cada sensor (potencia y lectura del comparador) va en el dato por posición del motor de
// redstone (`power | frecuencia << 4`, ver sculkSignal); lo que hacen al vibrar, en
// sim/server/vibrations.ts. Se registran los últimos (export * al final de index.ts): no mueven ids.
import {
  family, defs, L, familyBase, stateOf, stateProps, BLOCK_OPAQUE, BLOCK_SOLID, R_CUBE, R_MODEL, R_TORCH, type NeighborGet,
  type Opts,
} from './registry';
import { BLOCK_WATERLOGGED } from './ocean';
import { isChain } from './decorBlocks';
import { mbox, rotateFlat, type ModelBox } from '../blockModels';
import { registerRedstone, UP, DOWN, HFACE, type RedstoneView } from '../redstone/api';

const N = -1;
/** Opciones de un estado anegado (luz como el agua). */
const WET: Opts = { fluid: 1, level: 0, lightOpacity: 2 };

/** Marca como anegados los estados de una familia que son fluido. */
function markWet(base: number): void {
  for (let id = base; defs[id] && familyBase(id) === base; id++) if (defs[id].fluid === 1) BLOCK_WATERLOGGED[id] = 1;
}

const INVENTORY: number[] = [];

// ------------------------------------------------------------------ sculk

const sculkish = (o: Opts): Opts => ({ tool: 'hoe', sound: 'sculk', category: 'naturaleza', ...o });

/** Sculk: sin Toque de seda sólo suelta experiencia (1 punto). */
export const SCULK = family('sculk', 'Sculk', [], () => sculkish({ all: 'sculk', hardness: 0.2 }));

/**
 * Venas de sculk: una capa fina en cualquiera de las seis caras de la celda (`faces`, un bit por cara en
 * el orden de las texturas: +X, −X, +Y, −Y, +Z, −Z; el bit f cubre la cara que da al vecino de ese
 * lado). El estado 0 (sin caras) es el del objeto.
 */
export const VEIN_FACES = 64;
const FACE_DX = [1, -1, 0, 0, 0, 0], FACE_DY = [0, 0, 1, -1, 0, 0], FACE_DZ = [0, 0, 0, 0, 1, -1];

function veinBoxes(mask: number): ModelBox[] {
  const t = L('sculk_vein');
  const out: ModelBox[] = [];
  const faces = (outer: number): number[] => [t, t, t, t, t, t].map((v, i) => (i === outer ? N : v));
  const d = 0.1;
  if (mask & 1) out.push(mbox(16 - d, 0, 0, 16, 16, 16, faces(0)));
  if (mask & 2) out.push(mbox(0, 0, 0, d, 16, 16, faces(1)));
  if (mask & 4) out.push(mbox(0, 16 - d, 0, 16, 16, 16, faces(2)));
  if (mask & 8) out.push(mbox(0, 0, 0, 16, d, 16, faces(3)));
  if (mask & 16) out.push(mbox(0, 0, 16 - d, 16, 16, 16, faces(4)));
  if (mask & 32) out.push(mbox(0, 0, 0, 16, 16, d, faces(5)));
  return out;
}

export const SCULK_VEIN = family('sculk_vein', 'Vena de sculk', [['faces', VEIN_FACES]], (st) => {
  const mask = st.faces;
  const boxes = veinBoxes(mask || 8);
  const sel: number[] = [];
  for (const b of boxes) sel.push(b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16);
  return sculkish({
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0.2, all: 'sculk_vein', flatItem: 'sculk_vein',
    replaceable: true, walkThrough: true, model: veinBoxes(mask), itemModel: veinBoxes(8), collision: [], selection: sel,
    category: mask === 0 ? 'naturaleza' : null,
    // Se sostiene mientras alguna de sus caras siga pegada a un bloque (las sueltas las quita el servidor).
    support: (get: NeighborGet) => mask !== 0 && veinAttached(mask, get) !== 0,
  });
});

/** Caras de una vena de sculk (bits; 0 si no lo es). */
export function veinFaces(id: number): number {
  return id > 0 && familyBase(id) === SCULK_VEIN ? id - SCULK_VEIN : 0;
}

/** Vena con estas caras (aire si no queda ninguna). */
export function veinWith(mask: number): number {
  return mask & 63 ? SCULK_VEIN + (mask & 63) : 0;
}

export function isSculkVein(id: number): boolean {
  return id > 0 && familyBase(id) === SCULK_VEIN;
}

/** ¿Puede una vena pegarse al bloque `b`? (cara completa: bloques opacos y sólidos). */
export function veinCanStick(b: number): boolean {
  return b < 0 || (BLOCK_OPAQUE[b] === 1 && BLOCK_SOLID[b] === 1);
}

/** De las caras `mask`, las que siguen pegadas a un bloque. */
export function veinAttached(mask: number, get: NeighborGet): number {
  let out = 0;
  for (let f = 0; f < 6; f++) if (mask & (1 << f) && veinCanStick(get(FACE_DX[f], FACE_DY[f], FACE_DZ[f]))) out |= 1 << f;
  return out;
}

/** Desplazamiento del vecino de cada cara (el orden de los bits de las venas). */
export const VEIN_DIRS: readonly (readonly [number, number, number])[] = FACE_DX.map((dx, f) => [dx, FACE_DY[f], FACE_DZ[f]] as const);

// ------------------------------------------------------------------ catalizador

/** Catalizador de sculk: florece (`bloom`) un momento cuando muere algo cerca y extiende el sculk. */
export const SCULK_CATALYST = family('sculk_catalyst', 'Catalizador de sculk', [['bloom', 2]], (st) => sculkish({
  top: st.bloom ? 'sculk_catalyst_top_bloom' : 'sculk_catalyst_top',
  side: st.bloom ? 'sculk_catalyst_side_bloom' : 'sculk_catalyst_side',
  bottom: 'sculk_catalyst_bottom', hardness: 3, emission: 6,
}));

export function isCatalyst(id: number): boolean {
  return id > 0 && familyBase(id) === SCULK_CATALYST;
}

// ------------------------------------------------------------------ sensores

/** Fases de un sensor (las de Minecraft). */
export const PHASE_INACTIVE = 0, PHASE_ACTIVE = 1, PHASE_COOLDOWN = 2;

/** Sensor: losa de medio bloque con cuatro zarcillos (que brillan mientras está activo). */
function sensorBoxes(active: boolean, calibrated: boolean, facing: number): ModelBox[] {
  const side = L(calibrated ? 'calibrated_sculk_sensor_side' : 'sculk_sensor_side');
  const top = L(calibrated ? 'calibrated_sculk_sensor_top' : 'sculk_sensor_top');
  const bottom = L('sculk_sensor_bottom');
  const tex = [side, side, top, bottom, side, side];
  // El sensor calibrado lleva la cara de entrada (con la amatista incrustada) hacia `facing`.
  if (calibrated) tex[[5, 0, 4, 1][facing]] = L('calibrated_sculk_sensor_input_side');
  const out = [mbox(0, 0, 0, 16, 8, 16, tex)];
  const tendril = L(active ? 'sculk_sensor_tendril_active' : 'sculk_sensor_tendril');
  const x = [tendril, tendril, N, N, N, N], z = [N, N, N, N, tendril, tendril];
  // Cuatro láminas en molinete, de 8 píxeles de alto.
  out.push(mbox(2, 8, 4, 8, 16, 4, z), mbox(12, 8, 2, 12, 16, 8, x), mbox(8, 8, 12, 14, 16, 12, z), mbox(4, 8, 8, 4, 16, 14, x));
  // El calibrado lleva además un cristal de amatista en el centro.
  if (calibrated) {
    const a = L(active ? 'calibrated_sculk_sensor_amethyst_active' : 'calibrated_sculk_sensor_amethyst');
    out.push(mbox(5, 8, 8, 11, 16, 8, [N, N, N, N, a, a]), mbox(8, 8, 5, 8, 16, 11, [a, a, N, N, N, N]));
  }
  return out;
}

const HALF_BOX = [0, 0, 0, 1, 0.5, 1];

export const SCULK_SENSOR = family('sculk_sensor', 'Sensor de sculk', [['phase', 3], ['water', 2]], (st) => sculkish({
  render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 1.5, emission: 1, category: 'redstone', all: 'sculk_sensor_side',
  model: sensorBoxes(st.phase === PHASE_ACTIVE, false, 0), itemModel: sensorBoxes(false, false, 0),
  collision: HALF_BOX, selection: HALF_BOX, ...(st.water ? WET : {}),
}));
markWet(SCULK_SENSOR);

export const CALIBRATED_SCULK_SENSOR = family(
  'calibrated_sculk_sensor', 'Sensor de sculk calibrado', [['facing', 4], ['phase', 3], ['water', 2]], (st) => sculkish({
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 1.5, emission: 1, category: 'redstone',
    all: 'calibrated_sculk_sensor_side', model: sensorBoxes(st.phase === PHASE_ACTIVE, true, st.facing),
    itemModel: sensorBoxes(false, true, 2), collision: HALF_BOX, selection: HALF_BOX, ...(st.water ? WET : {}),
  }),
);
markWet(CALIBRATED_SCULK_SENSOR);

export function isSculkSensor(id: number): boolean {
  return id > 0 && familyBase(id) === SCULK_SENSOR;
}

export function isCalibratedSensor(id: number): boolean {
  return id > 0 && familyBase(id) === CALIBRATED_SCULK_SENSOR;
}

/** ¿Sensor (normal o calibrado)? */
export function isAnySensor(id: number): boolean {
  return isSculkSensor(id) || isCalibratedSensor(id);
}

/** Fase del sensor (PHASE_*); −1 si no es un sensor. */
export function sensorPhase(id: number): number {
  return isAnySensor(id) ? stateProps(id)!.phase : -1;
}

/** El mismo sensor en otra fase (conserva la orientación y el agua). */
export function sensorWithPhase(id: number, phase: number): number {
  const st = stateProps(id);
  return st ? stateOf(familyBase(id), { ...st, phase }) : id;
}

/** Cara de entrada de un sensor calibrado (hacia la que mira; la de las caras de redstone). */
export function calibratedInputFace(id: number): number {
  return HFACE[stateProps(id)?.facing ?? 0];
}

/** Dato del motor de redstone de un sensor: potencia (0..15) y frecuencia de la última vibración (1..15). */
export function sculkSignal(power: number, freq: number): number {
  return (power & 15) | ((freq & 15) << 4);
}
export const signalPower = (data: number): number => data & 15;
export const signalFrequency = (data: number): number => (data >> 4) & 15;

// Emiten mientras están activos: la potencia hacia todos los lados (el calibrado, no hacia su entrada) y
// fuerte hacia el bloque de debajo. El comparador lee la frecuencia de la última vibración.
const activePower = (v: RedstoneView, x: number, y: number, z: number, id: number): number =>
  sensorPhase(id) === PHASE_ACTIVE ? signalPower(v.getData(x, y, z)) : 0;
registerRedstone(SCULK_SENSOR, {
  emitter: {
    weak: (v, x, y, z, id) => activePower(v, x, y, z, id),
    strong: (v, x, y, z, id, face) => (face === DOWN ? activePower(v, x, y, z, id) : 0),
  },
  analog: (api, x, y, z, id) => (sensorPhase(id) === PHASE_ACTIVE ? signalFrequency(api.getData(x, y, z)) : 0),
});
registerRedstone(CALIBRATED_SCULK_SENSOR, {
  emitter: {
    weak: (v, x, y, z, id, face) => (face === calibratedInputFace(id) ? 0 : activePower(v, x, y, z, id)),
    strong: (v, x, y, z, id, face) => (face === DOWN ? activePower(v, x, y, z, id) : 0),
    connects: (id, face) => face !== calibratedInputFace(id),
  },
  analog: (api, x, y, z, id) => (sensorPhase(id) === PHASE_ACTIVE ? signalFrequency(api.getData(x, y, z)) : 0),
});
void UP;

// ------------------------------------------------------------------ chillador

function shriekerBoxes(canSummon: boolean): ModelBox[] {
  const side = L('sculk_shrieker_side'), top = L('sculk_shrieker_top'), bottom = L('sculk_shrieker_bottom');
  const inner = L(canSummon ? 'sculk_shrieker_can_summon_inner_top' : 'sculk_shrieker_inner_top');
  return [
    mbox(0, 0, 0, 16, 8, 16, [side, side, top, bottom, side, side]),
    mbox(1, 8, 1, 15, 15, 15, [side, side, inner, N, side, side]),
  ];
}

/**
 * Chillador de sculk: `shrieking` mientras chilla (90 ticks) y `can_summon` si lo generó el mundo
 * (sólo ésos avisan al warden y lo invocan; los que pone un jugador o hace crecer un catalizador, no).
 */
export const SCULK_SHRIEKER = family(
  'sculk_shrieker', 'Chillador de sculk', [['shrieking', 2], ['can_summon', 2], ['water', 2]], (st) => sculkish({
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 3, all: 'sculk_shrieker_side', category: 'redstone',
    model: shriekerBoxes(st.can_summon === 1), itemModel: shriekerBoxes(false), collision: HALF_BOX, selection: HALF_BOX,
    ...(st.water ? WET : {}),
  }),
);
markWet(SCULK_SHRIEKER);

export function isShrieker(id: number): boolean {
  return id > 0 && familyBase(id) === SCULK_SHRIEKER;
}

export function shriekerProps(id: number): { shrieking: boolean; canSummon: boolean } {
  const st = stateProps(id);
  return { shrieking: st?.shrieking === 1, canSummon: st?.can_summon === 1 };
}

export function shriekerWith(id: number, shrieking: boolean): number {
  const st = stateProps(id);
  return st ? stateOf(SCULK_SHRIEKER, { ...st, shrieking: shrieking ? 1 : 0 }) : id;
}

/** Chillador para colocar o generar. */
export function shriekerFor(canSummon: boolean, wet = false): number {
  return stateOf(SCULK_SHRIEKER, { shrieking: 0, can_summon: canSummon ? 1 : 0, water: wet ? 1 : 0 });
}

INVENTORY.push(SCULK, SCULK_VEIN, SCULK_CATALYST, SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, SCULK_SHRIEKER);

// ------------------------------------------------------------------ pizarra reforzada

/** Pizarra profunda reforzada: dureza 55 y resistencia 1200; no suelta nada ni la mueven los pistones. */
export const REINFORCED_DEEPSLATE = family('reinforced_deepslate', 'Pizarra profunda reforzada', [], () => ({
  top: 'reinforced_deepslate_top', side: 'reinforced_deepslate_side', bottom: 'reinforced_deepslate_bottom', hardness: 55,
  sound: 'stone', category: 'construccion',
}));
INVENTORY.push(REINFORCED_DEEPSLATE);

// ------------------------------------------------------------------ bloques de alma

/** Arena de alma: se hunde un poco (su colisión mide 14/16) y frena al andar por ella. */
export const SOUL_SAND = family('soul_sand', 'Arena de alma', [], () => ({
  all: 'soul_sand', hardness: 0.5, tool: 'shovel', sound: 'soul_sand', category: 'naturaleza', collision: [0, 0, 0, 1, 14 / 16, 1],
  selection: [0, 0, 0, 1, 1, 1],
}));
export const SOUL_SOIL = family('soul_soil', 'Tierra de alma', [], () => ({
  all: 'soul_soil', hardness: 0.5, tool: 'shovel', sound: 'soul_soil', category: 'naturaleza',
}));

/** ¿Suelo de alma? (sobre él, el fuego es fuego de alma). */
export function isSoulGround(id: number): boolean {
  return id === SOUL_SAND || id === SOUL_SOIL;
}

function soulFireBoxes(): ModelBox[] {
  const f = L('soul_fire');
  const x = [f, f, N, N, N, N], z = [N, N, N, N, f, f];
  return [
    mbox(8, 0, 0, 8, 16, 16, x), mbox(0, 0, 8, 16, 16, 8, z),
    mbox(1, 0, 0, 1, 15, 16, x), mbox(15, 0, 0, 15, 15, 16, x),
    mbox(0, 0, 1, 16, 15, 1, z), mbox(0, 0, 15, 16, 15, 15, z),
  ];
}

/** Fuego de alma: azul, luz 10 y el doble de daño; sólo arde sobre arena o tierra de alma. */
export const SOUL_FIRE = family('soul_fire', 'Fuego de alma', [], () => ({
  render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, emission: 10, hardness: 0, sound: 'wool', all: 'soul_fire',
  replaceable: true, walkThrough: true, noItem: true, category: null, model: soulFireBoxes(), collision: [],
  selection: [0, 0, 0, 1, 1 / 16, 1], support: (get: NeighborGet) => isSoulGround(get(0, -1, 0)),
}));

export const SOUL_TORCH = family('soul_torch', 'Antorcha de alma', [], () => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: 10, sound: 'wood', all: 'soul_torch', hardness: 0, category: 'decoracion',
}));
export const SOUL_WALL_TORCH = family('soul_wall_torch', 'Antorcha de alma', [['facing', 4]], (st) => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: 10, sound: 'wood', all: 'soul_torch', hardness: 0, category: null,
  wall: st.facing, base: SOUL_TORCH, selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing),
}));

/** ¿Se puede colgar un farol de este bloque o apoyarlo encima? (como con el farol normal). */
const holds = (id: number): boolean => id < 0 || BLOCK_SOLID[id] === 1 || isChain(id);

function soulLanternBoxes(hanging: boolean): ModelBox[] {
  const s = L('soul_lantern'), t = L('lantern_top'), c = L('chain');
  const dy = hanging ? 1 : 0;
  const out = [
    mbox(5, dy, 5, 11, 7 + dy, 11, [s, s, t, t, s, s]),
    mbox(6, 7 + dy, 6, 10, 9 + dy, 10, [s, s, t, N, s, s]),
  ];
  if (hanging) out.push(mbox(8, 10, 6, 8, 16, 10, [c, c, N, N, N, N]), mbox(6, 10, 8, 10, 16, 8, [N, N, N, N, c, c]));
  return out;
}

export const SOUL_LANTERN = family('soul_lantern', 'Farol de alma', [['hanging', 2]], (st) => {
  const hanging = st.hanging === 1;
  const box = hanging ? [5 / 16, 1 / 16, 5 / 16, 11 / 16, 10 / 16, 11 / 16] : [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16];
  return {
    render: R_MODEL, hardness: 3.5, tool: 'pickaxe', sound: 'metal', category: 'decoracion', all: 'soul_lantern', emission: 10,
    lightOpacity: 0, model: soulLanternBoxes(hanging), collision: box, selection: box, itemModel: soulLanternBoxes(false),
    support: (get: NeighborGet) => (hanging ? holds(get(0, 1, 0)) : holds(get(0, -1, 0))),
  };
});
INVENTORY.push(SOUL_SAND, SOUL_SOIL, SOUL_TORCH, SOUL_LANTERN);

/** Bloques de esta fase en el orden del inventario creativo. */
export const DEEP_DARK_INVENTORY: readonly number[] = INVENTORY;

// ------------------------------------------------------------------ consultas

/** ¿Suelta sólo experiencia sin Toque de seda? Devuelve los puntos (0 si no es de la familia del sculk). */
export function sculkXp(id: number): number {
  const b = familyBase(id);
  if (b === SCULK) return 1;
  if (b === SCULK_CATALYST || b === SCULK_SENSOR || b === CALIBRATED_SCULK_SENSOR || b === SCULK_SHRIEKER) return 5;
  return 0;
}

/** ¿Sólo se recoge con Toque de seda? (la familia del sculk). */
export function needsSilkTouch(id: number): boolean {
  const b = familyBase(id);
  return b === SCULK || b === SCULK_VEIN || b === SCULK_CATALYST || b === SCULK_SENSOR || b === CALIBRATED_SCULK_SENSOR ||
    b === SCULK_SHRIEKER;
}

/**
 * Bloques que el sculk puede cubrir al extenderse (la etiqueta `sculk_replaceable` de Minecraft: piedras,
 * pizarra, tierras, arenas, grava, arcilla, calcita, basalto liso, espeleotema…). Se decide por la clave
 * del bloque base, ya con todo registrado.
 */
const REPLACEABLE_KEYS = /^(stone|granite|diorite|andesite|deepslate|tuff|calcite|smooth_basalt|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|grass_block|snowy_grass_block|moss_block|mud|clay|sand|red_sand|gravel|soul_sand|soul_soil|sandstone|red_sandstone|dripstone_block|terracotta|[a-z_]+_terracotta|netherrack|cobbled_deepslate|cobblestone|mossy_cobblestone)$/;
let replaceableTable: Uint8Array | null = null;

export function sculkReplaceable(id: number): boolean {
  if (id <= 0) return false;
  if (!replaceableTable) {
    replaceableTable = new Uint8Array(defs.length);
    for (const b of defs) {
      if (!b || b.fluid || /glazed/.test(b.key)) continue;
      const key = defs[familyBase(b.id)]?.key ?? b.key;
      if (familyBase(b.id) === b.id && REPLACEABLE_KEYS.test(key)) replaceableTable[b.id] = 1;
    }
  }
  return replaceableTable[id] === 1;
}
