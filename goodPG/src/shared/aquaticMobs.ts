// Criaturas acuáticas (fase 6): bacalao, salmón, pez tropical, pez globo, delfín, tortuga, ajolote,
// rana, renacuajo y calamar brillante. Aquí van sus ids, estadísticas, botín y modelos por cajas;
// mobs.ts los registra. Las UV de cada modelo se reparten solas en el atlas (packParts), así no
// hay que colocarlas a mano ni se solapan.
import {
  BIOME_DESERT, BIOME_WARM_OCEAN, BIOME_JUNGLE, BIOME_SPARSE_JUNGLE, BIOME_BAMBOO_JUNGLE, BIOME_SAVANNA, BIOME_SAVANNA_PLATEAU,
  BIOME_WINDSWEPT_SAVANNA, BIOME_BADLANDS, BIOME_ERODED_BADLANDS, BIOME_WOODED_BADLANDS, BIOME_MANGROVE_SWAMP, BIOME_NETHER_WASTES,
  BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS, BIOME_SNOWY_PLAINS, BIOME_ICE_SPIKES,
  BIOME_FROZEN_PEAKS, BIOME_JAGGED_PEAKS, BIOME_SNOWY_PEAKS, BIOME_FROZEN_OCEAN, BIOME_DEEP_FROZEN_OCEAN, BIOME_GROVE, BIOME_FROZEN_RIVER,
  BIOME_SNOWY, BIOME_SNOWY_BEACH, BIOME_THE_END, BIOME_END_HIGHLANDS, BIOME_END_MIDLANDS, BIOME_SMALL_END_ISLANDS, BIOME_END_BARRENS,
} from './world/biomeIds'; // variedades de rana
import type { MobDef, ModelPart } from './mobs';
import {
  COD, SALMON, TROPICAL_FISH, PUFFERFISH, COD_BUCKET, SALMON_BUCKET, TROPICAL_FISH_BUCKET, PUFFERFISH_BUCKET,
  AXOLOTL_BUCKET, TADPOLE_BUCKET,
} from './items';
import { GLOW_INK_SAC } from './items'; // Fase 6.5 (colecciones)

export const MOB_COD = 30;
export const MOB_SALMON = 31;
export const MOB_TROPICAL_FISH = 32;
export const MOB_PUFFERFISH = 33;
export const MOB_DOLPHIN = 34;
export const MOB_TURTLE = 35;
export const MOB_AXOLOTL = 36;
export const MOB_FROG = 37;
/** Variedades de rana (frog_variant de Java): templada (naranja), cálida (blanca) y fría (verde). */
export const FROG_TEMPERATE = 0, FROG_WARM = 1, FROG_COLD = 2;
const WARM_FROG_BIOMES = new Set([
  BIOME_DESERT, BIOME_WARM_OCEAN, BIOME_JUNGLE, BIOME_SPARSE_JUNGLE, BIOME_BAMBOO_JUNGLE, BIOME_SAVANNA, BIOME_SAVANNA_PLATEAU,
  BIOME_WINDSWEPT_SAVANNA, BIOME_BADLANDS, BIOME_ERODED_BADLANDS, BIOME_WOODED_BADLANDS, BIOME_MANGROVE_SWAMP, BIOME_NETHER_WASTES,
  BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
]);
const COLD_FROG_BIOMES = new Set([
  BIOME_SNOWY_PLAINS, BIOME_ICE_SPIKES, BIOME_FROZEN_PEAKS, BIOME_JAGGED_PEAKS, BIOME_SNOWY_PEAKS, BIOME_FROZEN_OCEAN,
  BIOME_DEEP_FROZEN_OCEAN, BIOME_GROVE, BIOME_FROZEN_RIVER, BIOME_SNOWY, BIOME_SNOWY_BEACH, BIOME_THE_END, BIOME_END_HIGHLANDS,
  BIOME_END_MIDLANDS, BIOME_SMALL_END_ISLANDS, BIOME_END_BARRENS,
]);
/** La variedad de la rana que aparece (o crece) en ese bioma (spawns_warm/cold_variant_frogs; el Deep Dark, fría). */
export function frogVariantFor(biome: number, deepDark = false): number {
  if (deepDark || COLD_FROG_BIOMES.has(biome)) return FROG_COLD;
  return WARM_FROG_BIOMES.has(biome) ? FROG_WARM : FROG_TEMPERATE;
}
export const MOB_TADPOLE = 38;
export const MOB_GLOW_SQUID = 39;

/** Peces pequeños: nadan en bancos, se ahogan fuera del agua y caben en un cubo. */
export const FISH_TYPES: readonly number[] = [MOB_COD, MOB_SALMON, MOB_TROPICAL_FISH, MOB_PUFFERFISH];

/** Criaturas que se meten en un cubo de agua → cubo que se obtiene. */
export const MOB_BUCKETS: Readonly<Record<number, number>> = {
  [MOB_COD]: COD_BUCKET,
  [MOB_SALMON]: SALMON_BUCKET,
  [MOB_TROPICAL_FISH]: TROPICAL_FISH_BUCKET,
  [MOB_PUFFERFISH]: PUFFERFISH_BUCKET,
  [MOB_AXOLOTL]: AXOLOTL_BUCKET,
  [MOB_TADPOLE]: TADPOLE_BUCKET,
};

/** Cubo con criatura → criatura que sale al vaciarlo (0 si el objeto no es uno de ellos). */
export function mobInBucket(item: number): number {
  for (const [mob, bucket] of Object.entries(MOB_BUCKETS)) if (bucket === item) return Number(mob);
  return 0;
}

export function isFish(type: number): boolean {
  return type >= MOB_COD && type <= MOB_PUFFERFISH;
}

/**
 * Criaturas de agua que no se guardan con el mundo y desaparecen lejos de los jugadores (como el
 * calamar): peces, delfines, ajolotes, renacuajos y calamares brillantes. Tortugas y ranas se quedan.
 */
export function isWaterAmbient(type: number): boolean {
  return isFish(type) || type === MOB_DOLPHIN || type === MOB_AXOLOTL || type === MOB_TADPOLE || type === MOB_GLOW_SQUID;
}

// ---------------------------------------------------------------------------------- modelos

type PartSpec = Omit<ModelPart, 'uv'> & {
  /** Reutiliza la UV de otra parte (patas o aletas gemelas). */
  share?: string;
};

/**
 * Reparte las UV de las partes en un atlas de ancho `W` por estantes (disposición de caja de
 * Minecraft: cada caja ocupa 2·(fondo + ancho) × (fondo + alto)). Devuelve las partes y el alto
 * del atlas (potencia de dos).
 */
export function packParts(W: number, specs: PartSpec[]): { parts: ModelPart[]; atlas: [number, number] } {
  const parts: ModelPart[] = [];
  const byName = new Map<string, ModelPart>();
  let x = 0, y = 0, shelf = 0;
  for (const s of specs) {
    const { share, ...rest } = s;
    let uv: [number, number];
    if (share) {
      const o = byName.get(share);
      if (!o) throw new Error(`Parte compartida desconocida: ${share}`);
      uv = [o.uv[0], o.uv[1]];
    } else {
      const [w, h, d] = s.size.map((v) => Math.ceil(v));
      const rw = 2 * (d + w), rh = d + h;
      if (rw > W) throw new Error(`Parte ${s.name} más ancha que el atlas`);
      if (x + rw > W) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      uv = [x, y];
      x += rw;
      shelf = Math.max(shelf, rh);
    }
    const p: ModelPart = { ...rest, uv };
    parts.push(p);
    byName.set(p.name, p);
  }
  let H = 16;
  while (H < y + shelf) H *= 2;
  return { parts, atlas: [W, H] };
}

type Base = Omit<MobDef, 'parts' | 'atlas'>;

function model(base: Base, W: number, specs: PartSpec[]): MobDef {
  const { parts, atlas } = packParts(W, specs);
  return { ...base, parts, atlas };
}

/** Pez de cuerpo alargado: cuerpo, cabeza, morro, aleta dorsal, aletas laterales y cola. */
function fishSpecs(o: { w: number; h: number; len: number; head: number; fin: number; tail: number; y?: number }): PartSpec[] {
  const y = o.y ?? 0;
  const half = Math.floor(o.len / 2);
  return [
    { name: 'body', pivot: [0, y, 0], from: [-o.w / 2, 0, -half], size: [o.w, o.h, o.len] },
    { name: 'head', parent: 'body', pivot: [0, 0, -half], from: [-o.w / 2, 0.5, -o.head], size: [o.w, o.h - 1, o.head] },
    { name: 'nose', parent: 'head', pivot: [0, 0, -o.head], from: [-o.w / 2 + 0.5, 1, -1], size: [Math.max(1, o.w - 1), Math.max(1, o.h - 3), 1] },
    { name: 'finTop', parent: 'body', pivot: [0, o.h, -1], from: [-0.5, 0, 0], size: [1, o.fin, Math.max(2, half)] },
    { name: 'finR', parent: 'body', pivot: [o.w / 2, 1, -half + 2], from: [0, 0, 0], size: [2, 1, 2], rot: [0, -0.5, 0.5] },
    { name: 'finL', parent: 'body', pivot: [-o.w / 2, 1, -half + 2], from: [-2, 0, 0], size: [2, 1, 2], rot: [0, 0.5, -0.5], share: 'finR' },
    { name: 'tail', parent: 'body', pivot: [0, o.h / 2, o.len - half], from: [-0.5, -o.tail / 2, 0], size: [1, o.tail, o.tail] },
  ];
}

/** Tentáculos del calamar brillante (misma geometría que los del calamar). */
function tentacles(): PartSpec[] {
  const t: PartSpec[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    t.push({ name: `tent${i}`, parent: 'body', pivot: [Math.cos(a) * 5, -8, Math.sin(a) * 5], from: [-1, -18, -1], size: [2, 18, 2], share: i ? 'tent0' : undefined });
  }
  return t;
}

/** Espinas del pez globo (sólo se ven cuando está hinchado). */
function spikes(): PartSpec[] {
  const s: PartSpec[] = [];
  const spots: [number, number, number, number, number, number][] = [
    // pivote (x, y, z) y rotación de reposo (x, y, z)
    [-3, 8, -3, -0.5, 0, 0.5], [3, 8, -3, -0.5, 0, -0.5], [-3, 8, 3, 0.5, 0, 0.5], [3, 8, 3, 0.5, 0, -0.5],
    [-4, 4, 0, 0, 0, 1.2], [4, 4, 0, 0, 0, -1.2], [0, 0, -4, -1.8, 0, 0], [0, 0, 4, 1.8, 0, 0],
    [-4, 1, -4, -1, 0, 1], [4, 1, 4, 1, 0, -1], [0, 8, 0, 0, 0, 0], [0, 4, -4, -1.57, 0, 0],
  ];
  spots.forEach(([x, y, z, rx, ry, rz], i) => {
    s.push({ name: `spike${i}`, parent: 'body', pivot: [x, y, z], from: [-0.5, 0, -0.5], size: [1, 2, 1], rot: [rx, ry, rz], share: i ? 'spike0' : undefined });
  });
  return s;
}

const common = { hostile: false, burnsInSun: false, damage: 0 };

export const AQUATIC_MOBS: MobDef[] = [
  model(
    { ...common, id: MOB_COD, key: 'cod', name: 'Bacalao', health: 3, walk: 1.4, run: 3.2, width: 0.5, height: 0.3, drops: [[COD, 1, 1]], anim: 'fish', scale: 0.75 },
    32,
    fishSpecs({ w: 2, h: 4, len: 7, head: 3, fin: 1, tail: 4 }),
  ),
  model(
    { ...common, id: MOB_SALMON, key: 'salmon', name: 'Salmón', health: 3, walk: 1.6, run: 3.6, width: 0.6, height: 0.4, drops: [[SALMON, 1, 1]], anim: 'fish', scale: 0.8 },
    32,
    fishSpecs({ w: 3, h: 5, len: 8, head: 3, fin: 2, tail: 5 }),
  ),
  model(
    { ...common, id: MOB_TROPICAL_FISH, key: 'tropical_fish', name: 'Pez tropical', health: 3, walk: 1.3, run: 3.2, width: 0.5, height: 0.4, drops: [[TROPICAL_FISH, 1, 1]], anim: 'fish', scale: 0.7 },
    32,
    [
      { name: 'body', pivot: [0, 1, 0], from: [-1, 0, -3], size: [2, 5, 6] },
      { name: 'finTop', parent: 'body', pivot: [0, 5, -2], from: [-0.5, 0, 0], size: [1, 3, 4] },
      { name: 'finBottom', parent: 'body', pivot: [0, 0, -1], from: [-0.5, -1, 0], size: [1, 1, 3] },
      { name: 'finR', parent: 'body', pivot: [1, 2, -1], from: [0, 0, 0], size: [2, 1, 2], rot: [0, -0.5, 0.5] },
      { name: 'finL', parent: 'body', pivot: [-1, 2, -1], from: [-2, 0, 0], size: [2, 1, 2], rot: [0, 0.5, -0.5], share: 'finR' },
      { name: 'tail', parent: 'body', pivot: [0, 2.5, 3], from: [-0.5, -2.5, 0], size: [1, 5, 3] },
    ],
  ),
  model(
    { ...common, id: MOB_PUFFERFISH, key: 'pufferfish', name: 'Pez globo', health: 3, walk: 1.1, run: 2.4, width: 0.6, height: 0.6, drops: [[PUFFERFISH, 1, 1]], anim: 'puffer', scale: 0.8 },
    64,
    [
      { name: 'body', pivot: [0, 0, 0], from: [-4, 0, -4], size: [8, 8, 8] },
      { name: 'finR', parent: 'body', pivot: [4, 4, -2], from: [0, -1, 0], size: [1, 3, 3] },
      { name: 'finL', parent: 'body', pivot: [-4, 4, -2], from: [-1, -1, 0], size: [1, 3, 3], share: 'finR' },
      { name: 'finTop', parent: 'body', pivot: [0, 8, 1], from: [-0.5, 0, 0], size: [1, 2, 3] },
      { name: 'tail', parent: 'body', pivot: [0, 4, 4], from: [-0.5, -2, 0], size: [1, 4, 3] },
      ...spikes(),
    ],
  ),
  model(
    { ...common, id: MOB_DOLPHIN, key: 'dolphin', name: 'Delfín', health: 10, walk: 2.6, run: 6, width: 0.9, height: 0.6, damage: 3, neutral: true, drops: [[COD, 0, 1]], anim: 'dolphin', scale: 0.8 },
    64,
    [
      { name: 'body', pivot: [0, 0, 0], from: [-4, 0, -6], size: [8, 7, 13] },
      { name: 'head', parent: 'body', pivot: [0, 0, -6], from: [-4, 0, -6], size: [8, 7, 6] },
      { name: 'nose', parent: 'head', pivot: [0, 0, -6], from: [-1, 0, -4], size: [2, 2, 4] },
      { name: 'finTop', parent: 'body', pivot: [0, 7, 1], from: [-0.5, 0, 0], size: [1, 4, 5], rot: [0.5, 0, 0] },
      { name: 'finR', parent: 'body', pivot: [4, 1, -3], from: [0, 0, -1], size: [6, 1, 4], rot: [0, 0.3, 0.6] },
      { name: 'finL', parent: 'body', pivot: [-4, 1, -3], from: [-6, 0, -1], size: [6, 1, 4], rot: [0, -0.3, -0.6], share: 'finR' },
      { name: 'tail', parent: 'body', pivot: [0, 1, 7], from: [-2, 0, 0], size: [4, 5, 11] },
      { name: 'tailFin', parent: 'tail', pivot: [0, 2, 10], from: [-5, 0, 0], size: [10, 1, 6] },
    ],
  ),
  model(
    { ...common, id: MOB_TURTLE, key: 'turtle', name: 'Tortuga', health: 30, walk: 0.7, run: 1.4, width: 1.2, height: 0.4, drops: [], anim: 'turtle', scale: 1 },
    128,
    [
      { name: 'body', pivot: [0, 2, 0], from: [-8, 0, -9], size: [16, 5, 18] },
      { name: 'belly', parent: 'body', pivot: [0, 0, 0], from: [-7, -1, -8], size: [14, 1, 16] },
      { name: 'head', pivot: [0, 3, -9], from: [-3, -1, -6], size: [6, 5, 6] },
      { name: 'legFR', pivot: [7, 3, -6], from: [0, -1, -2], size: [8, 1, 4], rot: [0, 0.3, 0] },
      { name: 'legFL', pivot: [-7, 3, -6], from: [-8, -1, -2], size: [8, 1, 4], rot: [0, -0.3, 0], share: 'legFR' },
      { name: 'legBR', pivot: [5, 2, 8], from: [-2, -1, 0], size: [4, 1, 6] },
      { name: 'legBL', pivot: [-5, 2, 8], from: [-2, -1, 0], size: [4, 1, 6], share: 'legBR' },
    ],
  ),
  model(
    { ...common, id: MOB_AXOLOTL, key: 'axolotl', name: 'Ajolote', health: 14, walk: 0.6, run: 2.4, width: 0.75, height: 0.42, damage: 2, drops: [], anim: 'axolotl', scale: 1 },
    64,
    [
      { name: 'body', pivot: [0, 2, 0], from: [-4, 0, -5], size: [8, 4, 10] },
      { name: 'head', parent: 'body', pivot: [0, 0, -5], from: [-4, 0, -5], size: [8, 5, 5] },
      { name: 'gillTop', parent: 'head', pivot: [0, 5, -2], from: [-4, 0, 0], size: [8, 3, 1] },
      { name: 'gillR', parent: 'head', pivot: [4, 0, -2], from: [0, 0, 0], size: [3, 7, 1], rot: [0, -0.3, 0] },
      { name: 'gillL', parent: 'head', pivot: [-4, 0, -2], from: [-3, 0, 0], size: [3, 7, 1], rot: [0, 0.3, 0], share: 'gillR' },
      { name: 'legFR', parent: 'body', pivot: [4, 1, -3], from: [0, -3, -1], size: [2, 3, 2] },
      { name: 'legFL', parent: 'body', pivot: [-4, 1, -3], from: [-2, -3, -1], size: [2, 3, 2], share: 'legFR' },
      { name: 'legBR', parent: 'body', pivot: [4, 1, 3], from: [0, -3, -1], size: [2, 3, 2], share: 'legFR' },
      { name: 'legBL', parent: 'body', pivot: [-4, 1, 3], from: [-2, -3, -1], size: [2, 3, 2], share: 'legFR' },
      { name: 'tail', parent: 'body', pivot: [0, 0, 5], from: [-0.5, 0, 0], size: [1, 4, 9] },
    ],
  ),
  model(
    { ...common, id: MOB_FROG, key: 'frog', name: 'Rana', health: 10, walk: 1.4, run: 2.8, width: 0.5, height: 0.5, drops: [], anim: 'frog', scale: 1 },
    64,
    [
      { name: 'body', pivot: [0, 1, 0], from: [-3.5, 0, -4], size: [7, 3, 8] },
      { name: 'head', parent: 'body', pivot: [0, 3, 2], from: [-3.5, 0, -7], size: [7, 2, 7] },
      { name: 'eyeR', parent: 'head', pivot: [0, 2, -5], from: [0.5, 0, -1], size: [3, 2, 3] },
      { name: 'eyeL', parent: 'head', pivot: [0, 2, -5], from: [-3.5, 0, -1], size: [3, 2, 3], share: 'eyeR' },
      { name: 'armR', pivot: [3, 2, -3], from: [-1, -2, -1], size: [2, 2, 2] },
      { name: 'armL', pivot: [-3, 2, -3], from: [-1, -2, -1], size: [2, 2, 2], share: 'armR' },
      { name: 'legR', pivot: [3.5, 2, 2], from: [-1, -2, -2], size: [3, 2, 5] },
      { name: 'legL', pivot: [-3.5, 2, 2], from: [-2, -2, -2], size: [3, 2, 5], share: 'legR' },
      // La lengua (sólo se ve mientras caza: FrogModel, 4 × 7 en el suelo de la boca).
      { name: 'tongue', parent: 'body', pivot: [0, 3.1, -4], from: [-2, 0, -7], size: [4, 0.01, 7] },
    ],
  ),
  model(
    { ...common, id: MOB_TADPOLE, key: 'tadpole', name: 'Renacuajo', health: 6, walk: 1, run: 2.2, width: 0.4, height: 0.3, drops: [], anim: 'tadpole', scale: 1 },
    32,
    [
      { name: 'body', pivot: [0, 0, 0], from: [-1.5, 0, -2], size: [3, 2, 3] },
      { name: 'tail', parent: 'body', pivot: [0, 1, 1], from: [-0.5, -1, 0], size: [1, 2, 5] },
    ],
  ),
  // Fase 6.5 (colecciones): el calamar brillante suelta sacos de tinta brillante.
  model(
    { ...common, id: MOB_GLOW_SQUID, key: 'glow_squid', name: 'Calamar brillante', health: 10, walk: 1.2, run: 2.5, width: 0.8, height: 0.8, drops: [[GLOW_INK_SAC, 1, 3]], anim: 'squid', scale: 0.8, aquatic: true },
    64,
    [{ name: 'body', pivot: [0, 18, 0], from: [-6, -8, -6], size: [12, 16, 12] }, ...tentacles()],
  ),
];
