// Fase 8.3 (criaturas del Nether): piglin, piglin bruto, piglin zombificado, ghast, blaze, cubo de magma (tres
// tamaños, como el slime), hoglin, zoglin, strider y esqueleto wither (ids 84–95), y las bolas de fuego del
// ghast y del blaze (entidades 121 y 122). Aquí va lo que comparten el servidor y el cliente: ids, bits de
// estado, las constantes de Java 26.3 (en ticks, como allí), el trueque, los objetos que adoran los piglins, los
// bloques que espantan a piglins y hoglins, qué sale en cada bioma y los modelos.
//
// Los modelos se definen con los números de las clases del cliente de Java (addBox y PartPose de
// AdultPiglinModel, GhastModel, BlazeModel, MagmaCubeModel, HoglinModel, AdultStriderModel y SkeletonModel) y
// `jb` los pasa a nuestro espacio: Java dibuja las criaturas con la escala (−1, −1, 1) y los pies en y = 24.
// mobs.ts las registra; su comportamiento va en sim/entities/netherMobs.ts (y los archivos nether*.ts de allí).
import type { MobDef, ModelPart } from './mobs';
import {
  GOLD_NUGGET, ROTTEN_FLESH, GHAST_TEAR, GUNPOWDER, MAGMA_CREAM, RAW_PORKCHOP, LEATHER, STRING, COAL, BONE,
  ITEMS, BOOK, POTION, SPLASH_POTION, IRON_NUGGET, ENDER_PEARL, QUARTZ, FIRE_CHARGE, SPECTRAL_ARROW, NETHER_BRICK, ARMOR,
} from './items';
import { OBSIDIAN, CRYING_OBSIDIAN, SOUL_SAND, GRAVEL, BLACKSTONE, BLOCKS } from './blocks';
import { EF_FAUNA_A, EF_FAUNA_B } from './fauna';

export const MOB_PIGLIN = 84;
export const MOB_PIGLIN_BRUTE = 85;
export const MOB_ZOMBIFIED_PIGLIN = 86;
export const MOB_GHAST = 87;
export const MOB_BLAZE = 88;
/** Cubo de magma grande (tamaño 4); al morir se divide en medianos (90) y éstos en pequeños (91). */
export const MOB_MAGMA_CUBE = 89;
export const MOB_MAGMA_CUBE_MEDIUM = 90;
export const MOB_MAGMA_CUBE_SMALL = 91;
export const MOB_HOGLIN = 92;
export const MOB_ZOGLIN = 93;
export const MOB_STRIDER = 94;
export const MOB_WITHER_SKELETON = 95;
/** Bola de fuego del ghast (explota) y del blaze (prende fuego). */
export const ENT_LARGE_FIREBALL = 121;
export const ENT_SMALL_FIREBALL = 122;

/**
 * Bits de estado propios (Entity.flags; sólo significan algo para su especie):
 *  - piglin: bailando (celebra haber cazado un hoglin); strider: tiene frío (fuera de la lava, tirita y
 *    se vuelve morado);
 *  - piglin, piglin bruto y hoglin: convirtiéndose en zombificado (tiemblan) fuera del Nether.
 * EF_ACTION: el ghast carga su disparo (abre los ojos y la boca), el piglin tensa la ballesta, el hoglin y el
 * zoglin embisten (10 ticks) y el cubo de magma está en el aire. EF_FIRE: el blaze cargado arde.
 */
export const EF_PIGLIN_DANCING = EF_FAUNA_A;
export const EF_STRIDER_COLD = EF_FAUNA_A;
export const EF_ZOMBIFYING = EF_FAUNA_B;

// ---------------------------------------------------------------------------------- tipos

const PIGLINS = new Set([MOB_PIGLIN, MOB_PIGLIN_BRUTE]);
const MAGMAS = [MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL];
const NETHER = new Set([
  MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, ...MAGMAS, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER,
  MOB_WITHER_SKELETON,
]);

export function isNetherMob(type: number): boolean {
  return NETHER.has(type);
}

/** Piglin o piglin bruto (AbstractPiglin: se convierten fuera del Nether y los espantan las cosas de alma). */
export function isPiglin(type: number): boolean {
  return PIGLINS.has(type);
}

export function isMagmaCube(type: number): boolean {
  return MAGMAS.includes(type);
}

/** Tamaño del cubo de magma (4, 2 o 1). */
export function magmaSize(type: number): number {
  return type === MOB_MAGMA_CUBE ? 4 : type === MOB_MAGMA_CUBE_MEDIUM ? 2 : 1;
}

/** Cubo de magma de ese tamaño. */
export function magmaOfSize(size: number): number {
  return size >= 4 ? MOB_MAGMA_CUBE : size >= 2 ? MOB_MAGMA_CUBE_MEDIUM : MOB_MAGMA_CUBE_SMALL;
}

/** Cubo que sale al dividirse cada tamaño. */
export const MAGMA_SPLIT: Readonly<Record<number, number>> = {
  [MOB_MAGMA_CUBE]: MOB_MAGMA_CUBE_MEDIUM,
  [MOB_MAGMA_CUBE_MEDIUM]: MOB_MAGMA_CUBE_SMALL,
};

/** Zombificados (PiglinAi.isZombified): los piglins se apartan de ellos. */
export function isZombifiedType(type: number): boolean {
  return type === MOB_ZOMBIFIED_PIGLIN || type === MOB_ZOGLIN;
}

// ---------------------------------------------------------------------------------- equipo

/**
 * Lo que llevan puesto los piglins, los zombificados, los brutos y los esqueletos wither (Entity.gear, que ya
 * viaja a los clientes con las entidades): el objeto de la mano principal, el de la secundaria (el oro que
 * admira el piglin) y la armadura de oro (bits: 1 casco, 2 peto, 4 grebas, 8 botas).
 */
export function packGear(main: number, off: number, armor: number): number {
  return main + off * 0x10000 + armor * 0x100000000;
}

export function gearMain(gear: number | undefined): number {
  return (gear ?? 0) % 0x10000;
}

export function gearOff(gear: number | undefined): number {
  return Math.floor((gear ?? 0) / 0x10000) % 0x10000;
}

export function gearArmor(gear: number | undefined): number {
  return Math.floor((gear ?? 0) / 0x100000000) & 15;
}

/** Piezas de armadura de oro por bit de gearArmor (casco, peto, grebas, botas). */
export const GOLD_ARMOR_PIECES: readonly number[] = [ARMOR.golden.helmet, ARMOR.golden.chestplate, ARMOR.golden.leggings, ARMOR.golden.boots];

// ---------------------------------------------------------------------------------- constantes de Java

/** Ticks fuera del Nether hasta convertirse en zombificado (piglins y hoglins) y Náuseas que les da. */
export const ZOMBIFY_TICKS = 300;
export const ZOMBIFY_NAUSEA_TICKS = 200;
/** Piglin: ticks que admira el oro antes de soltar el trueque; enfado; sin cazar tras una caza (30–120 s). */
export const PIGLIN_ADMIRE_TICKS = 119;
export const PIGLIN_ANGER_TICKS = 600;
export const PIGLIN_HUNT_WAIT: readonly [number, number] = [600, 2400];
/** Radio en que se enfadan los piglins al abrir un cofre o romper oro (16) y el de los repelentes (8 × 4). */
export const PIGLIN_ANGER_RANGE = 16;
export const REPELLENT_RANGE_H = 8;
export const REPELLENT_RANGE_V = 4;
/** Hoglin: ataque cada 40 ticks (15 la cría) y 10 ticks de embestida; huye 5–20 s. */
export const HOGLIN_ATTACK_INTERVAL = 40;
export const HOGLIN_BABY_ATTACK_INTERVAL = 15;
/** Ghast: sigue a quien vea a menos de 64 bloques; carga 20 ticks y descansa 40. */
export const GHAST_SHOOT_RANGE = 64;
/** Blaze: 60 ticks de carga, tres bolas separadas 6 ticks y 100 de descanso. */
export const BLAZE_CHARGE_TICKS = 60;
export const BLAZE_REST_TICKS = 100;
/** Esqueleto wither: Marchitamiento 10 s al golpear. */
export const WITHER_HIT_SECONDS = 10;
/** Bolas de fuego: aceleración (0,1 por tick) y rozamiento (0,95 en el aire, 0,8 en el agua). */
export const FIREBALL_ACCEL = 0.1;
export const FIREBALL_INERTIA = 0.95;
export const FIREBALL_WATER_INERTIA = 0.8;
/** La del ghast explota con fuerza 1 y hace 6 de daño a quien golpea; la del blaze, 5 y 5 s de fuego. */
export const LARGE_FIREBALL_POWER = 1;
export const LARGE_FIREBALL_DAMAGE = 6;
export const SMALL_FIREBALL_DAMAGE = 5;
export const SMALL_FIREBALL_FIRE_SECONDS = 5;
/** Strider: acelerón de la caña (140–980 ticks) y velocidades de montado (× 0,55; con frío × 0,35). */
export const STRIDER_SPEED = 0.175;
export const STRIDER_STEER = 0.55;
export const STRIDER_COLD_STEER = 0.35;
/** Caña con hongo distorsionado: desgaste por acelerón. */
export const FUNGUS_STICK_WEAR = 1;
/** Velocidad de alma: +0,0405 de velocidad (+0,0105 por nivel más) sobre arena o tierra de alma. */
export const SOUL_SPEED_BASE = 0.0405;
export const SOUL_SPEED_PER_LEVEL = 0.0105;

/**
 * Velocidad en el suelo (bloques/s) de una criatura de Java que anda con velocidad `s` (modificador × atributo):
 * Mob.setSpeed(s) pone también zza = s, así que cada tick acelera s · s (en suelo normal) y el rozamiento deja
 * v = s² / (1 − 0,546) bloques por tick.
 */
export function javaGroundSpeed(s: number): number {
  return (20 * s * s) / (1 - 0.6 * 0.91);
}

// ---------------------------------------------------------------------------------- trueque

/** Una entrada del trueque (loot_table/gameplay/piglin_bartering.json de la 26.3). */
export interface BarterEntry {
  id: number;
  weight: number;
  min: number;
  max: number;
  /** Retoque: libro o botas con Velocidad de alma al azar, poción de resistencia al fuego o de agua. */
  mod?: 'soul_speed' | 'fire_resistance' | 'water';
}

/**
 * El trueque de los piglins: una tirada por lingote. Falta el ghast seco (peso 10), que llega con el ghast
 * feliz (fase 9); hasta entonces el resto conserva sus pesos (459 en vez de 469).
 */
export const BARTER: readonly BarterEntry[] = [
  { id: BOOK, weight: 5, min: 1, max: 1, mod: 'soul_speed' },
  { id: ARMOR.iron.boots, weight: 8, min: 1, max: 1, mod: 'soul_speed' },
  { id: POTION, weight: 8, min: 1, max: 1, mod: 'fire_resistance' },
  { id: SPLASH_POTION, weight: 8, min: 1, max: 1, mod: 'fire_resistance' },
  { id: POTION, weight: 10, min: 1, max: 1, mod: 'water' },
  { id: IRON_NUGGET, weight: 10, min: 10, max: 36 },
  { id: ENDER_PEARL, weight: 10, min: 2, max: 4 },
  { id: STRING, weight: 20, min: 3, max: 9 },
  { id: QUARTZ, weight: 20, min: 5, max: 12 },
  { id: OBSIDIAN, weight: 40, min: 1, max: 1 },
  { id: CRYING_OBSIDIAN, weight: 40, min: 1, max: 3 },
  { id: FIRE_CHARGE, weight: 40, min: 1, max: 1 },
  { id: LEATHER, weight: 40, min: 2, max: 4 },
  { id: SOUL_SAND, weight: 40, min: 2, max: 8 },
  { id: NETHER_BRICK, weight: 40, min: 2, max: 8 },
  { id: SPECTRAL_ARROW, weight: 40, min: 6, max: 12 },
  { id: GRAVEL, weight: 40, min: 8, max: 16 },
  { id: BLACKSTONE, weight: 40, min: 8, max: 16 },
];

/** Una tirada del trueque con `rand` en [0, 1): la entrada y la cantidad. */
export function rollBarter(rand: () => number): [BarterEntry, number] {
  const total = BARTER.reduce((s, e) => s + e.weight, 0);
  let r = Math.floor(rand() * total);
  for (const e of BARTER) {
    if (r < e.weight) return [e, e.min + Math.floor(rand() * (e.max - e.min + 1))];
    r -= e.weight;
  }
  return [BARTER[BARTER.length - 1], 1];
}

// ---------------------------------------------------------------------------------- objetos de los piglins

/** Claves de la etiqueta piglin_loved de la 26.3 que existen en el juego (la lanza y el diente de león dorados, aún no). */
const LOVED_KEYS = [
  'gold_ore', 'deepslate_gold_ore', 'nether_gold_ore', 'gold_block', 'gilded_blackstone', 'light_weighted_pressure_plate',
  'gold_ingot', 'bell', 'clock', 'golden_carrot', 'glistering_melon_slice', 'golden_apple', 'enchanted_golden_apple',
  'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots', 'golden_horse_armor', 'golden_sword',
  'golden_pickaxe', 'golden_shovel', 'golden_axe', 'golden_hoe', 'raw_gold', 'raw_gold_block',
];
let loved: Set<number> | null = null;

/** ¿Lo adoran los piglins? (lo cogen del suelo, lo admiran y miran a quien lo lleva en la mano). */
export function isPiglinLoved(id: number): boolean {
  if (!loved) {
    loved = new Set();
    const keys = new Set(LOVED_KEYS);
    for (const it of ITEMS) if (it && keys.has(it.key)) loved.add(it.id);
  }
  return loved.has(id);
}

/** Lingote de oro: lo único con lo que comercian. */
export function isBarterCurrency(id: number): boolean {
  return ITEMS[id]?.key === 'gold_ingot';
}

/** Comida de los piglins (piglin_food): chuleta cruda o cocinada. */
export function isPiglinFood(id: number): boolean {
  const k = ITEMS[id]?.key;
  return k === 'raw_porkchop' || k === 'cooked_porkchop';
}

/** Objetos de alma que no cogen del suelo (piglin_repellents de objetos): antorcha, farol y fogata de alma. */
export function isPiglinRepellentItem(id: number): boolean {
  const k = ITEMS[id]?.key;
  return k === 'soul_torch' || k === 'soul_lantern' || k === 'soul_campfire';
}

/** Armadura de oro (piglin_safe_armor): con una sola pieza, los piglins no atacan. */
export function isGoldArmor(id: number): boolean {
  return GOLD_ARMOR_PIECES.includes(id);
}

// ---------------------------------------------------------------------------------- bloques

const blockKey = (id: number): string => (id > 0 ? BLOCKS[id]?.key ?? '' : '');

/**
 * Bloques que espantan a los piglins (etiqueta de bloques piglin_repellents): fuego, antorcha, farol y fogata
 * (encendida) de alma. `lit`: la fogata está encendida (la fogata de alma llega en la fase 8.5).
 */
export function isPiglinRepellentBlock(id: number): boolean {
  const k = blockKey(id);
  return k === 'soul_fire' || k === 'soul_torch' || k === 'soul_wall_torch' || k === 'soul_lantern' || k === 'soul_campfire';
}

/** Bloques que espantan a los hoglins (hoglin_repellents): hongo distorsionado (también en maceta), portal y ancla. */
export function isHoglinRepellentBlock(id: number, pottedWarped: (id: number) => boolean): boolean {
  const k = blockKey(id);
  return k === 'warped_fungus' || k === 'nether_portal' || k === 'respawn_anchor' || pottedWarped(id);
}

/**
 * Bloques que guardan los piglins (guarded_by_piglins): abrir uno de los cofres o romper cualquiera enfada a
 * los que estén a 16 bloques (a los que lo vean, al abrir).
 */
export function isGuardedByPiglins(id: number): boolean {
  const k = blockKey(id);
  return /^(gold_block|barrel|chest|ender_chest|gilded_blackstone|trapped_chest|raw_gold_block|gold_ore|deepslate_gold_ore|nether_gold_ore)$/.test(k)
    || /shulker_box$/.test(k) || /copper_chest$/.test(k);
}

// ---------------------------------------------------------------------------------- aparición

/** Criatura que sale en un bioma: [tipo, peso, grupo mínimo, grupo máximo]. */
export type SpawnEntry = readonly [number, number, number, number];

/** Qué sale en cada bioma del Nether (NetherBiomes.java de la 26.3). Los esqueletos y endermen son los normales. */
export interface NetherSpawns {
  monsters: readonly SpawnEntry[];
  creatures: readonly SpawnEntry[];
  /** Coste de aparición (carga, presupuesto de energía): el valle de almas y el bosque distorsionado. */
  costs?: Readonly<Record<number, readonly [number, number]>>;
}

/** Tipos del mundo normal que también salen en el Nether (los pone mobs.ts para no importarlo aquí). */
export const OVERWORLD_IN_NETHER = { skeleton: 7, enderman: 11 };

/** Fase 8.4: monstruos de las fortalezas (NetherFortressStructure.FORTRESS_ENEMIES): [tipo, peso, mín., máx.]. */
export const FORTRESS_ENEMIES: readonly SpawnEntry[] = [
  [MOB_BLAZE, 10, 2, 3], [MOB_ZOMBIFIED_PIGLIN, 5, 4, 4], [MOB_WITHER_SKELETON, 8, 5, 5], [OVERWORLD_IN_NETHER.skeleton, 2, 5, 5],
  [MOB_MAGMA_CUBE, 3, 4, 4],
];

export const NETHER_SPAWNS: Readonly<Record<string, NetherSpawns>> = {
  nether_wastes: {
    monsters: [[MOB_GHAST, 50, 4, 4], [MOB_ZOMBIFIED_PIGLIN, 100, 4, 4], [MOB_MAGMA_CUBE, 2, 4, 4], [OVERWORLD_IN_NETHER.enderman, 1, 4, 4], [MOB_PIGLIN, 15, 4, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
  },
  soul_sand_valley: {
    monsters: [[OVERWORLD_IN_NETHER.skeleton, 20, 5, 5], [MOB_GHAST, 50, 4, 4], [OVERWORLD_IN_NETHER.enderman, 1, 4, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
    costs: {
      [OVERWORLD_IN_NETHER.skeleton]: [0.7, 0.15], [MOB_GHAST]: [0.7, 0.15], [OVERWORLD_IN_NETHER.enderman]: [0.7, 0.15], [MOB_STRIDER]: [0.7, 0.15],
    },
  },
  basalt_deltas: {
    monsters: [[MOB_GHAST, 40, 1, 1], [MOB_MAGMA_CUBE, 100, 2, 5]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
  },
  crimson_forest: {
    monsters: [[MOB_ZOMBIFIED_PIGLIN, 1, 2, 4], [MOB_HOGLIN, 9, 3, 4], [MOB_PIGLIN, 5, 3, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
  },
  warped_forest: {
    monsters: [[OVERWORLD_IN_NETHER.enderman, 1, 4, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
    costs: { [OVERWORLD_IN_NETHER.enderman]: [1, 0.12] },
  },
};

/** Tope de criaturas (MobCategory): 70 monstruos y 10 animales por cada 289 chunks donde puede salir algo. */
export const MONSTER_CAP = 70;
export const CREATURE_CAP = 10;
/** Los animales (striders) sólo se intentan cada 400 ticks. */
export const CREATURE_SPAWN_PERIOD = 400;

// ---------------------------------------------------------------------------------- modelos

export interface JavaPart {
  name: string;
  parent?: string;
  /** PartPose.offset(x, y, z). */
  o: readonly [number, number, number];
  /** addBox(x, y, z, ancho, alto, fondo). */
  box: readonly [number, number, number, number, number, number];
  uv: readonly [number, number];
  /** PartPose (xRot, yRot, zRot). */
  r?: readonly [number, number, number];
  grow?: number;
}

/**
 * Una parte de Java en nuestro espacio (y hacia arriba desde los pies, la derecha de la criatura en +X):
 * se invierten X e Y (Java dibuja con escala −1, −1) y las raíces se suben 24 píxeles. Las rotaciones de X e Y
 * cambian de signo; la de Z se guarda cambiada porque MobRenderer la vuelve a cambiar al aplicarla.
 */
export function jb(p: JavaPart): ModelPart {
  const [ox, oy, oz] = p.o;
  const [x, y, z, w, h, d] = p.box;
  const part: ModelPart = {
    name: p.name, pivot: [-ox, p.parent ? -oy : 24 - oy, oz], from: [-(x + w), -(y + h), z], size: [w, h, d], uv: [p.uv[0], p.uv[1]],
  };
  if (p.parent) part.parent = p.parent;
  if (p.r) part.rot = [-p.r[0], -p.r[1], -p.r[2]];
  if (p.grow) part.grow = p.grow;
  return part;
}

const PI6 = Math.PI / 6;

/** AdultPiglinModel (piglin, piglin bruto y piglin zombificado): cabeza de 10 de ancho con hocico, colmillos y orejas. */
function piglinParts(): ModelPart[] {
  return [
    jb({ name: 'head', o: [0, 0, 0], box: [-5, -8, -4, 10, 8, 8], uv: [0, 0] }),
    jb({ name: 'snout', parent: 'head', o: [0, 0, 0], box: [-2, -4, -5, 4, 4, 1], uv: [31, 1] }),
    jb({ name: 'tuskL', parent: 'head', o: [0, 0, 0], box: [2, -2, -5, 1, 2, 1], uv: [2, 4] }),
    jb({ name: 'tuskR', parent: 'head', o: [0, 0, 0], box: [-3, -2, -5, 1, 2, 1], uv: [2, 0] }),
    jb({ name: 'earL', parent: 'head', o: [4.5, -6, 0], box: [0, 0, -2, 1, 5, 4], uv: [51, 6], r: [0, 0, -PI6] }),
    jb({ name: 'earR', parent: 'head', o: [-4.5, -6, 0], box: [-1, 0, -2, 1, 5, 4], uv: [39, 6], r: [0, 0, PI6] }),
    jb({ name: 'body', o: [0, 0, 0], box: [-4, 0, -2, 8, 12, 4], uv: [16, 16] }),
    jb({ name: 'armR', o: [-5, 2, 0], box: [-3, -2, -2, 4, 12, 4], uv: [40, 16] }),
    jb({ name: 'armL', o: [5, 2, 0], box: [-1, -2, -2, 4, 12, 4], uv: [32, 48] }),
    jb({ name: 'legR', o: [-1.9, 12, 0], box: [-2, 0, -2, 4, 12, 4], uv: [0, 16] }),
    jb({ name: 'legL', o: [1.9, 12, 0], box: [-2, 0, -2, 4, 12, 4], uv: [16, 48] }),
  ];
}

/**
 * Tentáculos del ghast: posición y largo (GhastModel: RandomSource con semilla 1660, nextInt(7) + 8). En Java
 * comparten el rincón de la textura; aquí cada uno tiene su sitio (miden distinto y se pintan por separado).
 */
export const GHAST_TENTACLES: readonly (readonly [number, number, number])[] = [
  [-3.75, -5, 8], [1.25, -5, 13], [6.25, -5, 9], [-6.25, 0, 11], [-1.25, 0, 11], [3.75, 0, 10], [-3.75, 5, 12], [1.25, 5, 9], [6.25, 5, 12],
];

function ghastParts(): ModelPart[] {
  const parts = [jb({ name: 'body', o: [0, 17.6, 0], box: [-8, -8, -8, 16, 16, 16], uv: [0, 0] })];
  GHAST_TENTACLES.forEach(([xo, zo, len], i) => {
    parts.push(jb({ name: `tent${i}`, o: [xo, 24.6, zo], box: [-1, 0, -1, 2, len, 2], uv: [(i % 8) * 8, i < 8 ? 32 : 48] }));
  });
  return parts;
}

/** Posición (x, y, z de Java) de la vara `i` del blaze a los `t` ticks (BlazeModel.setupAnim). */
export function blazeRodPos(i: number, t: number): [number, number, number] {
  if (i < 4) {
    const a = t * Math.PI * -0.1 + i;
    return [Math.cos(a) * 9, -2 + Math.cos((i * 2 + t) * 0.25), Math.sin(a) * 9];
  }
  if (i < 8) {
    const a = Math.PI / 4 + t * Math.PI * 0.03 + (i - 4);
    return [Math.cos(a) * 7, 2 + Math.cos((i * 2 + t) * 0.25), Math.sin(a) * 7];
  }
  const a = 0.47123894 + t * Math.PI * -0.05 + (i - 8);
  return [Math.cos(a) * 5, 11 + Math.cos((i * 1.5 + t) * 0.5), Math.sin(a) * 5];
}

function blazeParts(): ModelPart[] {
  const parts = [jb({ name: 'head', o: [0, 0, 0], box: [-4, -4, -4, 8, 8, 8], uv: [0, 0] })];
  for (let i = 0; i < 12; i++) parts.push(jb({ name: `rod${i}`, o: blazeRodPos(i, 0), box: [0, 0, 0, 2, 8, 2], uv: [0, 16] }));
  return parts;
}

/** MagmaCubeModel: ocho rodajas de 8×1×8 (se separan al estirarse) y el núcleo de 4×4×4. */
function magmaParts(): ModelPart[] {
  const parts: ModelPart[] = [];
  for (let i = 0; i < 8; i++) {
    const uv: [number, number] = i < 4 ? [0, 9 * i] : [32, 9 * i - 36];
    parts.push(jb({ name: `cube${i}`, o: [0, 0, 0], box: [-4, 16 + i, -4, 8, 1, 8], uv }));
  }
  parts.push(jb({ name: 'core', o: [0, 0, 0], box: [-2, 18, -2, 4, 4, 4], uv: [24, 40] }));
  return parts;
}

const HOGLIN_EAR = (Math.PI * 2) / 9;
/** Inclinación de reposo de la cabeza del hoglin (0,8727 rad): mira al suelo; al embestir la levanta hasta −π/9. */
export const HOGLIN_HEAD_REST = 0.87266463;

function hoglinParts(): ModelPart[] {
  return [
    jb({ name: 'body', o: [0, 7, 0], box: [-8, -7, -13, 16, 14, 26], uv: [1, 1] }),
    jb({ name: 'mane', parent: 'body', o: [0, -14, -7], box: [0, 0, -9, 0, 10, 19], uv: [90, 33] }),
    jb({ name: 'head', o: [0, 2, -12], box: [-7, -3, -19, 14, 6, 19], uv: [61, 1], r: [HOGLIN_HEAD_REST, 0, 0] }),
    jb({ name: 'earR', parent: 'head', o: [-6, -2, -3], box: [-6, -1, -2, 6, 1, 4], uv: [1, 1], r: [0, 0, -HOGLIN_EAR] }),
    jb({ name: 'earL', parent: 'head', o: [6, -2, -3], box: [0, -1, -2, 6, 1, 4], uv: [1, 6], r: [0, 0, HOGLIN_EAR] }),
    jb({ name: 'hornR', parent: 'head', o: [-7, 2, -12], box: [-1, -11, -1, 2, 11, 2], uv: [10, 13] }),
    jb({ name: 'hornL', parent: 'head', o: [7, 2, -12], box: [-1, -11, -1, 2, 11, 2], uv: [1, 13] }),
    jb({ name: 'legFR', o: [-4, 10, -8.5], box: [-3, 0, -3, 6, 14, 6], uv: [66, 42] }),
    jb({ name: 'legFL', o: [4, 10, -8.5], box: [-3, 0, -3, 6, 14, 6], uv: [41, 42] }),
    jb({ name: 'legBR', o: [-5, 13, 10], box: [-2.5, 0, -2.5, 5, 11, 5], uv: [21, 45] }),
    jb({ name: 'legBL', o: [5, 13, 10], box: [-2.5, 0, -2.5, 5, 11, 5], uv: [0, 45] }),
  ];
}

/** Ángulos de reposo de las cerdas del strider (AdultStriderModel.customAnimations). */
export const STRIDER_BRISTLES: Readonly<Record<string, number>> = {
  bristleRB: -1.2217305, bristleRM: -1.134464, bristleRT: -0.87266463, bristleLT: 0.87266463, bristleLM: 1.134464, bristleLB: 1.2217305,
};

function striderParts(): ModelPart[] {
  const b = STRIDER_BRISTLES;
  return [
    jb({ name: 'legR', o: [-4, 8, 0], box: [-2, 0, -2, 4, 16, 4], uv: [0, 32] }),
    jb({ name: 'legL', o: [4, 8, 0], box: [-2, 0, -2, 4, 16, 4], uv: [0, 55] }),
    jb({ name: 'body', o: [0, 1, 0], box: [-8, -6, -8, 16, 14, 16], uv: [0, 0] }),
    jb({ name: 'bristleRB', parent: 'body', o: [-8, 4, -8], box: [-12, 0, 0, 12, 0, 16], uv: [16, 65], r: [0, 0, b.bristleRB] }),
    jb({ name: 'bristleRM', parent: 'body', o: [-8, -1, -8], box: [-12, 0, 0, 12, 0, 16], uv: [16, 49], r: [0, 0, b.bristleRM] }),
    jb({ name: 'bristleRT', parent: 'body', o: [-8, -5, -8], box: [-12, 0, 0, 12, 0, 16], uv: [16, 33], r: [0, 0, b.bristleRT] }),
    jb({ name: 'bristleLT', parent: 'body', o: [8, -6, -8], box: [0, 0, 0, 12, 0, 16], uv: [16, 33], r: [0, 0, b.bristleLT] }),
    jb({ name: 'bristleLM', parent: 'body', o: [8, -2, -8], box: [0, 0, 0, 12, 0, 16], uv: [16, 49], r: [0, 0, b.bristleLM] }),
    jb({ name: 'bristleLB', parent: 'body', o: [8, 3, -8], box: [0, 0, 0, 12, 0, 16], uv: [16, 65], r: [0, 0, b.bristleLB] }),
    // Silla (capa de equipo strider_saddle): la mitad de arriba del cuerpo, medio píxel más grande.
    jb({ name: 'saddle', parent: 'body', o: [0, 0, 0], box: [-8, -6, -8, 16, 7, 16], uv: [0, 90], grow: 0.5 }),
  ];
}

/** SkeletonModel (el esqueleto wither lo dibuja a escala 1,2). */
function witherSkeletonParts(): ModelPart[] {
  return [
    jb({ name: 'head', o: [0, 0, 0], box: [-4, -8, -4, 8, 8, 8], uv: [0, 0] }),
    jb({ name: 'body', o: [0, 0, 0], box: [-4, 0, -2, 8, 12, 4], uv: [16, 16] }),
    jb({ name: 'armR', o: [-5, 2, 0], box: [-1, -2, -1, 2, 12, 2], uv: [40, 16] }),
    jb({ name: 'armL', o: [5, 2, 0], box: [-1, -2, -1, 2, 12, 2], uv: [40, 16] }),
    jb({ name: 'legR', o: [-2, 12, 0], box: [-1, 0, -1, 2, 12, 2], uv: [0, 16] }),
    jb({ name: 'legL', o: [2, 12, 0], box: [-1, 0, -1, 2, 12, 2], uv: [0, 16] }),
  ];
}

// ---------------------------------------------------------------------------------- definiciones

type Base = Omit<MobDef, 'id' | 'key' | 'name' | 'parts' | 'atlas' | 'anim' | 'scale'>;

const piglinBase = (health: number, damage: number): Base => ({
  hostile: true, neutral: true, health, walk: javaGroundSpeed(0.6 * 0.35), run: javaGroundSpeed(0.35), width: 0.6, height: 1.95, damage,
  burnsInSun: false, drops: [],
});

const magma = (id: number, key: string, name: string, size: number): MobDef => ({
  id, key, name, hostile: true, health: size * size, walk: javaGroundSpeed(0.2 + 0.1 * size), run: javaGroundSpeed(0.2 + 0.1 * size),
  width: 0.52 * size, height: 0.52 * size, damage: size + 2, burnsInSun: false, drops: size >= 2 ? [[MAGMA_CREAM, -2, 1]] : [],
  atlas: [64, 64], parts: magmaParts(), anim: 'magma', scale: size, fireImmune: true, fullBright: true, xp: size,
  sound: size === 1 ? 'magma_cube_small' : 'magma_cube',
});

/** Las criaturas del Nether (las registra mobs.ts). */
export function netherMobs(): MobDef[] {
  return [
    {
      id: MOB_PIGLIN, key: 'piglin', name: 'Piglin', ...piglinBase(16, 5), atlas: [64, 64], parts: piglinParts(), anim: 'piglin', scale: 1, xp: 5,
    },
    {
      id: MOB_PIGLIN_BRUTE, key: 'piglin_brute', name: 'Piglin bruto', ...piglinBase(50, 7), atlas: [64, 64], parts: piglinParts(), anim: 'piglin',
      scale: 1, xp: 20,
    },
    {
      id: MOB_ZOMBIFIED_PIGLIN, key: 'zombified_piglin', name: 'Piglin zombificado', hostile: true, neutral: true, health: 20,
      walk: javaGroundSpeed(0.23), run: javaGroundSpeed(0.28), width: 0.6, height: 1.95, damage: 5, burnsInSun: false,
      drops: [[ROTTEN_FLESH, 0, 1], [GOLD_NUGGET, 0, 1]], atlas: [64, 64], parts: piglinParts(), anim: 'piglin', scale: 1, fireImmune: true,
      xp: 5, babyXp: 12,
    },
    {
      id: MOB_GHAST, key: 'ghast', name: 'Ghast', hostile: true, health: 10, walk: 1.2, run: 1.2, width: 4, height: 4, damage: 0,
      burnsInSun: false, drops: [[GHAST_TEAR, 0, 1], [GUNPOWDER, 0, 2]], atlas: [64, 64], parts: ghastParts(), anim: 'ghast', scale: 4.5,
      flying: true, fireImmune: true, xp: 5,
    },
    {
      id: MOB_BLAZE, key: 'blaze', name: 'Blaze', hostile: true, health: 20, walk: javaGroundSpeed(0.23), run: javaGroundSpeed(0.23), width: 0.6,
      height: 1.8, damage: 6, burnsInSun: false, drops: [], atlas: [64, 32], parts: blazeParts(), anim: 'blaze', scale: 1, fireImmune: true,
      fullBright: true, xp: 10,
    },
    magma(MOB_MAGMA_CUBE, 'magma_cube', 'Cubo de magma', 4),
    magma(MOB_MAGMA_CUBE_MEDIUM, 'magma_cube_medium', 'Cubo de magma mediano', 2),
    magma(MOB_MAGMA_CUBE_SMALL, 'magma_cube_small', 'Cubo de magma pequeño', 1),
    {
      id: MOB_HOGLIN, key: 'hoglin', name: 'Hoglin', hostile: true, health: 40, walk: javaGroundSpeed(0.4 * 0.3), run: javaGroundSpeed(0.3),
      width: 1.3964844, height: 1.4, damage: 6, burnsInSun: false, drops: [[RAW_PORKCHOP, 2, 4], [LEATHER, 0, 1]], atlas: [128, 64],
      parts: hoglinParts(), anim: 'hoglin', scale: 1, xp: 5, babyXp: 3,
    },
    {
      id: MOB_ZOGLIN, key: 'zoglin', name: 'Zoglin', hostile: true, health: 40, walk: javaGroundSpeed(0.4 * 0.3), run: javaGroundSpeed(0.3),
      width: 1.3964844, height: 1.4, damage: 6, burnsInSun: false, drops: [[ROTTEN_FLESH, 1, 3]], atlas: [128, 64], parts: hoglinParts(),
      anim: 'hoglin', scale: 1, fireImmune: true, xp: 5, babyXp: 5,
    },
    {
      id: MOB_STRIDER, key: 'strider', name: 'Strider', hostile: false, health: 20, walk: javaGroundSpeed(STRIDER_SPEED),
      run: javaGroundSpeed(STRIDER_SPEED * 1.65), width: 0.9, height: 1.7, damage: 0, burnsInSun: false, drops: [[STRING, 2, 5]],
      atlas: [64, 128], parts: striderParts(), anim: 'strider', scale: 1, fireImmune: true,
    },
    {
      id: MOB_WITHER_SKELETON, key: 'wither_skeleton', name: 'Esqueleto wither', hostile: true, health: 20, walk: javaGroundSpeed(0.25),
      run: javaGroundSpeed(0.25 * 1.2), width: 0.7, height: 2.4, damage: 8, burnsInSun: false, drops: [[COAL, -1, 1], [BONE, 0, 2]],
      atlas: [64, 32], parts: witherSkeletonParts(), anim: 'wither_skeleton', scale: 1.2, fireImmune: true, xp: 5,
    },
  ];
}
