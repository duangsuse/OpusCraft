// Criaturas: estadísticas, botín y modelos por cajas (en píxeles, 1 px = 1/16 de bloque).
// El modelo mira hacia -Z; y crece hacia arriba desde los pies.
import {
  RAW_PORKCHOP, RAW_BEEF, LEATHER, RAW_MUTTON, RAW_CHICKEN, FEATHER, ROTTEN_FLESH, BONE, ARROW, GUNPOWDER, STRING,
  ENDER_PEARL, SPIDER_EYE, COD, SALMON,
  IRON_INGOT, SNOWBALL,
} from './items';
import { RAW_RABBIT, RABBIT_HIDE } from './items'; // Fase 6 (fauna): botín del conejo
import { INK_SAC } from './items';
import { WHITE_WOOL, POPPY } from './blocks';
// Fase 6 (monstruos): botín de los monstruos nuevos.
import { STICK, SUGAR, REDSTONE, SLIME_BALL, PHANTOM_MEMBRANE } from './items';
// Fase 6 (acuáticos): peces, delfín, tortuga, ajolote, rana, renacuajo y calamar brillante (ids 30–39).
import { AQUATIC_MOBS } from './aquaticMobs';
export * from './aquaticMobs';
// Fase 6 (asaltos): saqueadores, vindicadores, evocadores, vex, devastadores y colmillos (ids 60–69).
import { ILLAGER_MOBS } from './illagers';
export * from './illagers';
// Fase 7.5 (abismo): el warden (id 70).
import { WARDEN_DEF } from './warden';
export * from './warden';
// Fase 7.5 (océano): guardián y guardián anciano (ids 73–74).
import { OCEAN_MOBS } from './oceanMobs';
export * from './oceanMobs';
// Fase 7.5 (fauna): murciélago, ocelote, champiñaca, llama de comerciante y caballos no muertos (ids 78–83).
import { critterMobs } from './critters';
export * from './critters';
// Fase 7.5 (mansión): el alay (id 76).
import { ALLAY_DEF } from './allay';
export { MOB_ALLAY } from './allay';
// Fase 8.3 (criaturas del Nether): piglins, ghast, blaze, cubos de magma, hoglin, zoglin, strider y esqueleto wither (ids 84–95).
import { netherMobs } from './netherMobs';
export * from './netherMobs';
import { endMobs } from './endMobs'; // Fase 8.6 (el End)
export * from './endMobs';
import { witherMobs } from './witherMobs'; // Fase 8.7 (el Wither)
export * from './witherMobs';

export const MOB_PIG = 1;
export const MOB_COW = 2;
export const MOB_SHEEP = 3;
export const MOB_CHICKEN = 4;
export const MOB_ZOMBIE = 5;
export const MOB_HUSK = 6;
export const MOB_SKELETON = 7;
export const MOB_STRAY = 8;
export const MOB_CREEPER = 9;
export const MOB_SPIDER = 10;
export const MOB_ENDERMAN = 11;
export const MOB_SQUID = 12;
// Fase 6: animales salvajes.
export const MOB_FOX = 13;
export const MOB_GOAT = 14;
export const MOB_POLAR_BEAR = 15;
export const MOB_RABBIT = 16;
export const MOB_WOLF = 17;
// Fase 6 (aldeanos): aldeano y comerciante ambulante.
export const MOB_VILLAGER = 18;
export const MOB_WANDERING_TRADER = 19;
// Fase 6 (monturas): ids 25–29.
export const MOB_HORSE = 25;
export const MOB_DONKEY = 26;
export const MOB_MULE = 27;
export const MOB_LLAMA = 28;
export const MOB_CAMEL = 29;
// Fase 6 (monstruos): ids 40–49.
export const MOB_DROWNED = 40;
export const MOB_WITCH = 41;
/** Slime grande (tamaño 4); al morir se divide en medianos (47) y éstos en pequeños (48). */
export const MOB_SLIME = 42;
export const MOB_PHANTOM = 43;
export const MOB_SILVERFISH = 44;
export const MOB_CAVE_SPIDER = 45;
export const MOB_ZOMBIE_VILLAGER = 46;
export const MOB_SLIME_MEDIUM = 47;
export const MOB_SLIME_SMALL = 48;
// Fase 6 (gólems/domesticar): gólems y gatos (ids 20–24 reservados; 23 y 24 libres).
export const MOB_IRON_GOLEM = 20;
export const MOB_SNOW_GOLEM = 21;
export const MOB_CAT = 22;
// Fase 6 (fauna): abejas, pandas, loros y armadillos (ids 50–59 reservados).
export const MOB_BEE = 50;
export const MOB_PANDA = 51;
export const MOB_PARROT = 52;
export const MOB_ARMADILLO = 53;
/** Entidades que no son criaturas. */
export const ENT_ITEM = 100;
export const ENT_ARROW = 101;
/** Bloque que cae (arena, grava). */
export const ENT_FALLING = 102;
/** Orbe de experiencia (extra: valor). */
export const ENT_XP = 103;
/** Objeto lanzado (huevo; extra: id del objeto). */
export const ENT_THROWN = 104;
/** Flotador de una caña de pescar. */
export const ENT_BOBBER = 105;
/** Objeto quieto de adorno (comida asándose en una fogata; extra: id del objeto). */
export const ENT_DISPLAY = 106;

export interface ModelPart {
  name: string;
  /** Parte a la que va unida (hereda su transformación). */
  parent?: string;
  /** Pivote respecto al origen de la entidad (o del padre), en píxeles. */
  pivot: [number, number, number];
  /** Esquina mínima de la caja respecto al pivote. */
  from: [number, number, number];
  /** Tamaño: ancho (x), alto (y), fondo (z). */
  size: [number, number, number];
  /** Desplazamiento UV (disposición de caja estilo Minecraft). */
  uv: [number, number];
  /** Rotación de reposo (radianes, orden X, Y, Z). */
  rot?: [number, number, number];
  /** Fase 8.3: píxeles que crece la caja por cada lado sin cambiar su UV (CubeDeformation de Java: la silla del strider). */
  grow?: number;
}

export type MobAnim = 'quadruped' | 'humanoid' | 'zombie' | 'skeleton' | 'creeper' | 'spider' | 'chicken' | 'enderman' | 'squid'
  | 'villager' // Fase 6 (aldeanos)
  // Fase 6 (monstruos)
  | 'slime' | 'phantom' | 'silverfish'
  // Fase 6 (acuáticos).
  | 'fish' | 'puffer' | 'dolphin' | 'turtle' | 'axolotl' | 'frog' | 'tadpole'
  // Fase 6 (gólems/domesticar): brazos largos que se balancean y golpean hacia arriba.
  | 'golem'
  | 'flyer' // Fase 6 (fauna): abejas y loros
  | 'illager' | 'vex' | 'ravager' | 'fangs' // Fase 6 (asaltos)
  | 'warden' // Fase 7.5 (abismo)
  | 'guardian' // Fase 7.5 (océano)
  | 'allay' // Fase 7.5 (mansión)
  | 'wither' // Fase 8.7
  | 'piglin' | 'ghast' | 'blaze' | 'magma' | 'hoglin' | 'strider' | 'wither_skeleton' // Fase 8.3 (criaturas del Nether)
  | 'endermite' | 'dragon' | 'shulker'; // Fase 8.6 (el End)

export interface MobDef {
  id: number;
  key: string;
  name: string;
  hostile: boolean;
  /** Neutral: sólo ataca si se le provoca (arañas de día, enderman). */
  neutral?: boolean;
  health: number;
  /** Velocidad de paseo y de persecución (bloques/s). */
  walk: number;
  run: number;
  width: number;
  height: number;
  /** Daño cuerpo a cuerpo en dificultad normal (medios corazones). */
  damage: number;
  burnsInSun: boolean;
  /** Botín: [objeto, mín, máx]. */
  drops: [number, number, number][];
  atlas: [number, number];
  parts: ModelPart[];
  anim: MobAnim;
  /** Escala global del modelo. */
  scale: number;
  aquatic?: boolean;
  /** Fase 6 (monstruos): voz (clave de sonido) si no es la propia clave (el ahogado suena como un zombi). */
  sound?: string;
  /** Fase 6 (fauna): vuela (abejas y loros; su movimiento va en sim/entities/wildlife.ts). */
  flying?: boolean;
  /** Fase 6 (asaltos): sin vida ni IA propia (colmillos del evocador): no se le puede golpear ni apuntar. */
  inert?: boolean;
  /** Fase 7.5 (océano): experiencia al matarla (si no, 5 los monstruos y 1–3 los animales). */
  xp?: number;
  /** Fase 8.3: experiencia de la cría (si no, ninguna): la del piglin zombificado y la del hoglin. */
  babyXp?: number;
  /** Fase 8.3: no le hacen daño el fuego ni la lava y no se le ve arder (las criaturas del Nether). */
  fireImmune?: boolean;
  /** Fase 8.3: se dibuja con toda la luz (blaze y cubo de magma, como getBlockLightLevel 15 en Java). */
  fullBright?: boolean;
}

const quadLegs = (h: number, xs: number, zs: [number, number], uv: [number, number], w = 4): ModelPart[] => [
  { name: 'leg0', pivot: [-xs, h, zs[0]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: 'leg1', pivot: [xs, h, zs[0]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: 'leg2', pivot: [-xs, h, zs[1]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: 'leg3', pivot: [xs, h, zs[1]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
];

const humanoid = (thin: boolean): ModelPart[] => {
  const limb = thin ? 2 : 4;
  return [
    { name: 'head', pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'body', pivot: [0, 12, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [16, 16] },
    { name: 'armR', pivot: [thin ? 5 : 6, 22, 0], from: [-limb / 2, -10, -limb / 2], size: [limb, 12, limb], uv: [40, 16] },
    { name: 'armL', pivot: [thin ? -5 : -6, 22, 0], from: [-limb / 2, -10, -limb / 2], size: [limb, 12, limb], uv: thin ? [40, 32] : [32, 48] },
    { name: 'legR', pivot: [2, 12, 0], from: [-limb / 2, -12, -limb / 2], size: [limb, 12, limb], uv: [0, 16] },
    { name: 'legL', pivot: [-2, 12, 0], from: [-limb / 2, -12, -limb / 2], size: [limb, 12, limb], uv: thin ? [0, 32] : [16, 48] },
  ];
};

const spiderLegs = (): ModelPart[] => {
  const legs: ModelPart[] = [];
  const zs = [-1, 0, 1, 2];
  for (let i = 0; i < 4; i++) {
    const yaw = [0.75, 0.3, -0.3, -0.75][i];
    legs.push({ name: `leg${i * 2}`, parent: 'thorax', pivot: [3, 0, zs[i]], from: [0, -1, -1], size: [16, 2, 2], uv: [0, 40], rot: [0, yaw, 0.6] });
    legs.push({ name: `leg${i * 2 + 1}`, parent: 'thorax', pivot: [-3, 0, zs[i]], from: [-16, -1, -1], size: [16, 2, 2], uv: [0, 40], rot: [0, -yaw, -0.6] });
  }
  return legs;
};

const squidTentacles = (): ModelPart[] => {
  const t: ModelPart[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    t.push({ name: `tent${i}`, parent: 'body', pivot: [Math.cos(a) * 5, -8, Math.sin(a) * 5], from: [-1, -18, -1], size: [2, 18, 2], uv: [48, 0] });
  }
  return t;
};

export const MOBS: MobDef[] = [];

function mob(d: MobDef): void {
  MOBS[d.id] = d;
}

mob({
  id: MOB_PIG, key: 'pig', name: 'Cerdo', hostile: false, health: 10, walk: 1.2, run: 2.6, width: 0.9, height: 0.9,
  damage: 0, burnsInSun: false, drops: [[RAW_PORKCHOP, 1, 3]], atlas: [64, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 6, 0], from: [-5, 0, -8], size: [10, 8, 16], uv: [0, 32] },
    { name: 'head', pivot: [0, 12, -8], from: [-4, -4, -8], size: [8, 8, 8], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2, -3, -9], size: [4, 3, 1], uv: [16, 16] },
    ...quadLegs(6, 3, [-5, 5], [0, 16]),
    // Fase 6 (monturas): silla (sólo se dibuja si la lleva).
    { name: 'saddle', pivot: [0, 6, 0], from: [-5.5, 5, -4], size: [11, 4, 8], uv: [26, 16] },
  ],
});
mob({
  id: MOB_COW, key: 'cow', name: 'Vaca', hostile: false, health: 10, walk: 1.1, run: 2.4, width: 0.9, height: 1.4,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2], [RAW_BEEF, 1, 3]], atlas: [64, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 12, 0], from: [-6, 0, -9], size: [12, 10, 18], uv: [0, 16] },
    { name: 'head', pivot: [0, 20, -9], from: [-4, -4, -6], size: [8, 8, 6], uv: [0, 0] },
    { name: 'hornR', parent: 'head', pivot: [0, 0, 0], from: [4, 2, -4], size: [1, 3, 1], uv: [28, 0] },
    { name: 'hornL', parent: 'head', pivot: [0, 0, 0], from: [-5, 2, -4], size: [1, 3, 1], uv: [28, 0] },
    ...quadLegs(12, 4, [-6, 7], [0, 44]),
  ],
});
mob({
  id: MOB_SHEEP, key: 'sheep', name: 'Oveja', hostile: false, health: 8, walk: 1.1, run: 2.4, width: 0.9, height: 1.3,
  damage: 0, burnsInSun: false, drops: [[WHITE_WOOL, 1, 1], [RAW_MUTTON, 1, 2]], atlas: [64, 96], anim: 'quadruped', scale: 1,
  parts: [
    // Cuerpo esquilado (piel) y, encima, la capa de lana que desaparece al esquilarla.
    { name: 'body', pivot: [0, 12, 0], from: [-5, 0, -8], size: [10, 8, 16], uv: [0, 14] },
    { name: 'wool', parent: 'body', pivot: [0, 0, 0], from: [-6, -1, -9], size: [12, 10, 18], uv: [0, 56] },
    { name: 'head', pivot: [0, 18, -8], from: [-3, -4, -8], size: [6, 6, 8], uv: [0, 0] },
    ...quadLegs(12, 3, [-5, 6], [0, 38]),
  ],
});
mob({
  id: MOB_CHICKEN, key: 'chicken', name: 'Gallina', hostile: false, health: 4, walk: 1.0, run: 2.2, width: 0.4, height: 0.7,
  damage: 0, burnsInSun: false, drops: [[FEATHER, 0, 2], [RAW_CHICKEN, 1, 1]], atlas: [64, 64], anim: 'chicken', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 5, 0], from: [-3, 0, -4], size: [6, 6, 8], uv: [0, 9] },
    { name: 'head', pivot: [0, 9, -4], from: [-2, 0, -3], size: [4, 6, 3], uv: [0, 0] },
    { name: 'beak', parent: 'head', pivot: [0, 0, 0], from: [-2, 3, -5], size: [4, 2, 2], uv: [14, 0] },
    { name: 'wattle', parent: 'head', pivot: [0, 0, 0], from: [-1, 1, -4], size: [2, 2, 2], uv: [14, 4] },
    { name: 'legR', pivot: [1.5, 5, 1], from: [-1.5, -5, -1.5], size: [3, 5, 3], uv: [26, 0] },
    { name: 'legL', pivot: [-1.5, 5, 1], from: [-1.5, -5, -1.5], size: [3, 5, 3], uv: [26, 0] },
    { name: 'wingR', pivot: [3, 10, 0], from: [0, -4, -3], size: [1, 4, 6], uv: [28, 9] },
    { name: 'wingL', pivot: [-3, 10, 0], from: [-1, -4, -3], size: [1, 4, 6], uv: [28, 9] },
  ],
});
mob({
  id: MOB_ZOMBIE, key: 'zombie', name: 'Zombi', hostile: true, health: 20, walk: 1.0, run: 2.4, width: 0.6, height: 1.95,
  damage: 3, burnsInSun: true, drops: [[ROTTEN_FLESH, 0, 2]], atlas: [64, 64], anim: 'zombie', scale: 1,
  parts: humanoid(false),
});
mob({
  id: MOB_HUSK, key: 'husk', name: 'Zombi momificado', hostile: true, health: 20, walk: 1.0, run: 2.4, width: 0.6, height: 1.95,
  damage: 3, burnsInSun: false, drops: [[ROTTEN_FLESH, 0, 2]], atlas: [64, 64], anim: 'zombie', scale: 1.06,
  parts: humanoid(false),
});
mob({
  id: MOB_SKELETON, key: 'skeleton', name: 'Esqueleto', hostile: true, health: 20, walk: 1.1, run: 2.3, width: 0.6, height: 1.99,
  damage: 2, burnsInSun: true, drops: [[BONE, 0, 2], [ARROW, 0, 2]], atlas: [64, 64], anim: 'skeleton', scale: 1,
  parts: humanoid(true),
});
mob({
  id: MOB_STRAY, key: 'stray', name: 'Esqueleto errante', hostile: true, health: 20, walk: 1.1, run: 2.3, width: 0.6, height: 1.99,
  damage: 2, burnsInSun: true, drops: [[BONE, 0, 2], [ARROW, 0, 2]], atlas: [64, 64], anim: 'skeleton', scale: 1,
  parts: humanoid(true),
});
mob({
  id: MOB_CREEPER, key: 'creeper', name: 'Creeper', hostile: true, health: 20, walk: 1.0, run: 2.2, width: 0.6, height: 1.7,
  damage: 0, burnsInSun: false, drops: [[GUNPOWDER, 0, 2]], atlas: [64, 64], anim: 'creeper', scale: 1,
  parts: [
    { name: 'head', pivot: [0, 18, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'body', pivot: [0, 6, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [16, 16] },
    ...quadLegs(6, 2, [-4, 4], [0, 16]),
  ],
});
mob({
  id: MOB_SPIDER, key: 'spider', name: 'Araña', hostile: true, neutral: true, health: 16, walk: 1.3, run: 3.0,
  width: 1.4, height: 0.9, damage: 2, burnsInSun: false, drops: [[STRING, 0, 2], [SPIDER_EYE, 0, 1]], atlas: [64, 64], anim: 'spider', scale: 1,
  parts: [
    { name: 'thorax', pivot: [0, 9, 0], from: [-3, -3, -3], size: [6, 6, 6], uv: [0, 0] },
    { name: 'head', parent: 'thorax', pivot: [0, 0, -3], from: [-4, -4, -8], size: [8, 8, 8], uv: [32, 4] },
    { name: 'abdomen', parent: 'thorax', pivot: [0, 0, 3], from: [-5, -4, 0], size: [10, 8, 12], uv: [0, 20] },
    ...spiderLegs(),
  ],
});
mob({
  id: MOB_ENDERMAN, key: 'enderman', name: 'Enderman', hostile: true, neutral: true, health: 40, walk: 1.2, run: 3.4,
  width: 0.6, height: 2.9, damage: 7, burnsInSun: false, drops: [[ENDER_PEARL, 0, 1]], atlas: [64, 64], anim: 'enderman',
  scale: 0.93,
  parts: [
    { name: 'head', pivot: [0, 42, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'body', pivot: [0, 30, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [32, 16] },
    { name: 'armR', pivot: [5, 40, 0], from: [-1, -28, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: 'armL', pivot: [-5, 40, 0], from: [-1, -28, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: 'legR', pivot: [2, 30, 0], from: [-1, -30, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: 'legL', pivot: [-2, 30, 0], from: [-1, -30, -1], size: [2, 30, 2], uv: [56, 0] },
  ],
});
mob({
  id: MOB_SQUID, key: 'squid', name: 'Calamar', hostile: false, health: 10, walk: 1.2, run: 2.5, width: 0.8, height: 0.8,
  damage: 0, burnsInSun: false, drops: [[INK_SAC, 1, 3]], atlas: [64, 32], anim: 'squid', scale: 0.8, aquatic: true,
  parts: [{ name: 'body', pivot: [0, 18, 0], from: [-6, -8, -6], size: [12, 16, 12], uv: [0, 0] }, ...squidTentacles()],
});

// ---------------------------------------------------------------- fase 6: animales salvajes
mob({
  id: MOB_FOX, key: 'fox', name: 'Zorro', hostile: false, health: 10, walk: 1.3, run: 3.2, width: 0.6, height: 0.7,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 48], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 6, 0], from: [-3, 0, -6], size: [6, 6, 11], uv: [0, 12] },
    { name: 'head', pivot: [0, 10, -6], from: [-4, -3, -6], size: [8, 6, 6], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2, -3, -9], size: [4, 2, 3], uv: [28, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [1, 3, -4], size: [2, 2, 1], uv: [44, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-3, 3, -4], size: [2, 2, 1], uv: [44, 0] },
    { name: 'tail', pivot: [0, 10, 5], from: [-2, -2, 0], size: [4, 4, 9], uv: [34, 12], rot: [0.7, 0, 0] },
    ...quadLegs(6, 2, [-4, 3], [0, 30], 2),
  ],
});
mob({
  id: MOB_GOAT, key: 'goat', name: 'Cabra', hostile: false, health: 10, walk: 1.2, run: 2.8, width: 0.9, height: 1.3,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 10, 0], from: [-4, 0, -7], size: [8, 8, 14], uv: [0, 20] },
    { name: 'head', pivot: [0, 17, -7], from: [-2.5, -2, -6], size: [5, 6, 6], uv: [0, 0] },
    { name: 'hornR', parent: 'head', pivot: [0, 0, 0], from: [1, 4, -2], size: [1, 5, 1], uv: [28, 0] },
    { name: 'hornL', parent: 'head', pivot: [0, 0, 0], from: [-2, 4, -2], size: [1, 5, 1], uv: [28, 0] },
    { name: 'beard', parent: 'head', pivot: [0, 0, 0], from: [-0.5, -5, -6], size: [1, 3, 1], uv: [34, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [2.5, 2, -2], size: [3, 1, 2], uv: [40, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-5.5, 2, -2], size: [3, 1, 2], uv: [40, 0] },
    ...quadLegs(10, 2.5, [-5, 5], [0, 44], 3),
  ],
});
mob({
  id: MOB_POLAR_BEAR, key: 'polar_bear', name: 'Oso polar', hostile: false, neutral: true, health: 30, walk: 1.0, run: 2.6,
  width: 1.4, height: 1.4, damage: 6, burnsInSun: false, drops: [[COD, 0, 2], [SALMON, 0, 2]], atlas: [128, 64],
  anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 10, 0], from: [-6, 0, -11], size: [12, 12, 22], uv: [0, 20] },
    { name: 'head', pivot: [0, 19, -11], from: [-4, -4, -7], size: [8, 8, 7], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2.5, -4, -10], size: [5, 3, 3], uv: [32, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [2, 4, -3], size: [2, 2, 1], uv: [50, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-4, 4, -3], size: [2, 2, 1], uv: [50, 0] },
    ...quadLegs(10, 4, [-8, 8], [70, 20], 5),
  ],
});
mob({
  id: MOB_RABBIT, key: 'rabbit', name: 'Conejo', hostile: false, health: 3, walk: 1.6, run: 3.6, width: 0.4, height: 0.5,
  damage: 0, burnsInSun: false, drops: [[RAW_RABBIT, 0, 1], [RABBIT_HIDE, 0, 1]], atlas: [32, 32], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 3, 0], from: [-2, 0, -3], size: [4, 4, 6], uv: [0, 0] },
    { name: 'head', pivot: [0, 6, -3], from: [-2, -1, -4], size: [4, 4, 4], uv: [0, 10] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0, 3, -2], size: [2, 4, 1], uv: [16, 10] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-2, 3, -2], size: [2, 4, 1], uv: [16, 10] },
    { name: 'tail', pivot: [0, 5, 3], from: [-1, -1, 0], size: [2, 2, 2], uv: [22, 10] },
    ...quadLegs(3, 1.5, [-2, 2], [0, 18], 2),
  ],
});
mob({
  id: MOB_WOLF, key: 'wolf', name: 'Lobo', hostile: false, neutral: true, health: 8, walk: 1.2, run: 3.4, width: 0.6, height: 0.85,
  damage: 4, burnsInSun: false, drops: [], atlas: [64, 48], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 8, 0], from: [-3, 0, -2], size: [6, 6, 9], uv: [30, 10] },
    { name: 'mane', pivot: [0, 8, -2], from: [-4, -0.5, -6], size: [8, 7, 6], uv: [0, 10] },
    { name: 'head', pivot: [0, 13, -8], from: [-3, -3, -4], size: [6, 6, 4], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-1.5, -3, -7], size: [3, 3, 3], uv: [20, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [1, 3, -2], size: [2, 2, 1], uv: [36, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-3, 3, -2], size: [2, 2, 1], uv: [36, 0] },
    { name: 'tail', pivot: [0, 13, 7], from: [-1, -1, 0], size: [2, 2, 8], uv: [0, 26], rot: [0.9, 0, 0] },
    ...quadLegs(8, 2, [-5, 5], [24, 26], 2),
    // Fase 6 (gólems/domesticar): collar rojo alrededor de la melena (sólo se dibuja si está domesticado).
    { name: 'collar', pivot: [0, 8, -2], from: [-4.5, -1, -5.5], size: [9, 8, 2], uv: [34, 26] },
  ],
});

// ---------------------------------------------------------------- Fase 6 (gólems/domesticar)
mob({
  id: MOB_IRON_GOLEM, key: 'iron_golem', name: 'Gólem de hierro', hostile: false, health: 100, walk: 0.9, run: 2.2,
  width: 1.4, height: 2.7, damage: 11, burnsInSun: false, drops: [[IRON_INGOT, 3, 5], [POPPY, 0, 2]], atlas: [128, 64],
  anim: 'golem', scale: 1,
  parts: [
    { name: 'head', pivot: [0, 33, -2], from: [-4, 0, -5.5], size: [8, 10, 8], uv: [0, 0] },
    { name: 'nose', parent: 'head', pivot: [0, 0, 0], from: [-1, 1, -7.5], size: [2, 4, 2], uv: [32, 0] },
    { name: 'body', pivot: [0, 21, 0], from: [-9, 0, -5.5], size: [18, 12, 11], uv: [0, 18] },
    { name: 'waist', pivot: [0, 16, 0], from: [-4.5, 0, -3], size: [9, 5, 6], uv: [60, 18] },
    { name: 'armR', pivot: [11, 31, 0], from: [-2, -28, -3], size: [4, 30, 6], uv: [90, 0] },
    { name: 'armL', pivot: [-11, 31, 0], from: [-2, -28, -3], size: [4, 30, 6], uv: [90, 0] },
    { name: 'legR', pivot: [4, 16, 0], from: [-3, -16, -2.5], size: [6, 16, 5], uv: [0, 41] },
    { name: 'legL', pivot: [-4, 16, 0], from: [-3, -16, -2.5], size: [6, 16, 5], uv: [0, 41] },
  ],
});
mob({
  id: MOB_SNOW_GOLEM, key: 'snow_golem', name: 'Gólem de nieve', hostile: false, health: 4, walk: 1.0, run: 1.6,
  width: 0.7, height: 1.9, damage: 0, burnsInSun: false, drops: [[SNOWBALL, 0, 15]], atlas: [64, 64], anim: 'golem', scale: 1,
  parts: [
    { name: 'lower', pivot: [0, 0, 0], from: [-6, 0, -6], size: [12, 12, 12], uv: [0, 36] },
    { name: 'upper', pivot: [0, 11, 0], from: [-5, 0, -5], size: [10, 10, 10], uv: [0, 16] },
    { name: 'head', pivot: [0, 21, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'armR', pivot: [4, 18, 0], from: [0, -1, -1], size: [12, 2, 2], uv: [32, 0], rot: [0, 0, -0.5] },
    { name: 'armL', pivot: [-4, 18, 0], from: [-12, -1, -1], size: [12, 2, 2], uv: [32, 0], rot: [0, 0, 0.5] },
  ],
});
mob({
  id: MOB_CAT, key: 'cat', name: 'Gato', hostile: false, health: 10, walk: 1.1, run: 3.0, width: 0.6, height: 0.7,
  damage: 0, burnsInSun: false, drops: [[STRING, 0, 2]], atlas: [64, 32], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 5, 0], from: [-2, 0, -7], size: [4, 5, 14], uv: [0, 13] },
    { name: 'head', pivot: [0, 9, -7], from: [-2.5, -2, -5], size: [5, 4, 5], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-1.5, -2, -6], size: [3, 2, 1], uv: [20, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0.5, 2, -3], size: [1, 1, 2], uv: [28, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-1.5, 2, -3], size: [1, 1, 2], uv: [28, 0] },
    { name: 'tail', pivot: [0, 9, 7], from: [-0.5, -0.5, 0], size: [1, 1, 8], uv: [36, 13], rot: [0.9, 0, 0] },
    ...quadLegs(5, 1.1, [-5, 5], [36, 22], 2),
    // Collar (sólo si está domesticado).
    { name: 'collar', parent: 'head', pivot: [0, 0, 0], from: [-3, -2.5, -3], size: [6, 1, 4], uv: [44, 22] },
  ],
});

// ---------------------------------------------------------------- fase 6 (monturas)
/** Caballo, burro y mula comparten modelo; cambian las orejas (largas en burros y mulas). */
const horseParts = (earH: number): ModelPart[] => [
  { name: 'body', pivot: [0, 11, 0], from: [-5, 0, -11], size: [10, 10, 22], uv: [0, 32] },
  { name: 'neck', pivot: [0, 17, -8], from: [-2, 0, -3], size: [4, 12, 7], uv: [0, 0], rot: [-0.52, 0, 0] },
  { name: 'head', parent: 'neck', pivot: [0, 11, 0], from: [-3, -1, -4], size: [6, 5, 7], uv: [24, 0] },
  { name: 'mouth', parent: 'head', pivot: [0, 0, 0], from: [-2, -1, -10], size: [4, 4, 6], uv: [52, 0] },
  { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0.5, 4, 0.5], size: [2, earH, 1], uv: [74, 0] },
  { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-2.5, 4, 0.5], size: [2, earH, 1], uv: [74, 0] },
  { name: 'mane', parent: 'neck', pivot: [0, 0, 0], from: [-1, 1, 4], size: [2, 14, 2], uv: [82, 0] },
  { name: 'tail', pivot: [0, 20, 11], from: [-1.5, -12, 0], size: [3, 12, 4], uv: [92, 0], rot: [-0.4, 0, 0] },
  ...quadLegs(11, 3, [-8, 8], [24, 14]),
  { name: 'saddle', pivot: [0, 21, -1], from: [-6, -2, -5], size: [12, 3, 10], uv: [64, 32] },
  { name: 'stirrupR', pivot: [6, 19, -1], from: [0, -6, -1], size: [1, 6, 2], uv: [108, 0] },
  { name: 'stirrupL', pivot: [-6, 19, -1], from: [-1, -6, -1], size: [1, 6, 2], uv: [108, 0] },
];

mob({
  id: MOB_HORSE, key: 'horse', name: 'Caballo', hostile: false, health: 22, walk: 1.4, run: 3.4, width: 1.3, height: 1.6,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 1, parts: horseParts(3),
});
mob({
  id: MOB_DONKEY, key: 'donkey', name: 'Burro', hostile: false, health: 20, walk: 1.3, run: 3, width: 1.2, height: 1.4,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 0.87, parts: horseParts(7),
});
mob({
  id: MOB_MULE, key: 'mule', name: 'Mula', hostile: false, health: 22, walk: 1.3, run: 3, width: 1.25, height: 1.5,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 0.92, parts: horseParts(6),
});
mob({
  id: MOB_LLAMA, key: 'llama', name: 'Llama', hostile: false, neutral: true, health: 20, walk: 1.2, run: 2.8, width: 0.9,
  height: 1.87, damage: 1, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 0.85,
  parts: [
    { name: 'body', pivot: [0, 13, 0], from: [-6, 0, -9], size: [12, 10, 18], uv: [0, 36] },
    { name: 'neck', pivot: [0, 20, -7], from: [-4, 0, -3], size: [8, 11, 6], uv: [0, 0] },
    { name: 'head', parent: 'neck', pivot: [0, 11, 0], from: [-4, 0, -3], size: [8, 6, 6], uv: [30, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2, 0, -7], size: [4, 4, 4], uv: [60, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [1.5, 6, -1], size: [2, 3, 2], uv: [78, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-3.5, 6, -1], size: [2, 3, 2], uv: [78, 0] },
    { name: 'tail', pivot: [0, 21, 9], from: [-2, -4, 0], size: [4, 5, 2], uv: [88, 0], rot: [-0.2, 0, 0] },
    ...quadLegs(13, 3.5, [-6, 6], [0, 18]),
  ],
});
mob({
  id: MOB_CAMEL, key: 'camel', name: 'Camello', hostile: false, health: 32, walk: 1.1, run: 2.6, width: 1.5, height: 2.3,
  damage: 0, burnsInSun: false, drops: [], atlas: [128, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 18, 0], from: [-7, 0, -11], size: [14, 11, 22], uv: [0, 28] },
    { name: 'hump', parent: 'body', pivot: [0, 11, 0], from: [-4, 0, -5], size: [8, 5, 9], uv: [74, 28] },
    { name: 'neck', pivot: [0, 24, -10], from: [-2.5, -1, -4], size: [5, 14, 5], uv: [0, 0], rot: [-0.7, 0, 0] },
    { name: 'head', parent: 'neck', pivot: [0, 13, 0], from: [-3, -1, -9], size: [6, 5, 10], uv: [22, 0], rot: [0.6, 0, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [2.5, 3, 0], size: [2, 1, 2], uv: [56, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-4.5, 3, 0], size: [2, 1, 2], uv: [56, 0] },
    { name: 'tail', pivot: [0, 27, 11], from: [-1, -9, 0], size: [2, 9, 1], uv: [66, 0] },
    ...quadLegs(18, 4, [-8, 8], [80, 0]),
    { name: 'saddle', parent: 'body', pivot: [0, 11, 0], from: [-5, -1, -6], size: [10, 7, 11], uv: [74, 44] },
    { name: 'stirrupR', pivot: [7, 28, -1], from: [0, -7, -1], size: [1, 7, 2], uv: [98, 0] },
    { name: 'stirrupL', pivot: [-7, 28, -1], from: [-1, -7, -1], size: [1, 7, 2], uv: [98, 0] },
  ],
});
// ---------------------------------------------------------------- Fase 6 (aldeanos): aldeano y comerciante
/** Aldeano: cabeza grande con nariz, túnica larga y los brazos cruzados delante. */
const villagerParts = (): ModelPart[] => [
  { name: 'head', pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8], uv: [0, 0] },
  { name: 'nose', parent: 'head', pivot: [0, 0, 0], from: [-1, 1, -6], size: [2, 4, 2], uv: [32, 0] },
  { name: 'body', pivot: [0, 24, 0], from: [-4, -18, -3], size: [8, 18, 6], uv: [16, 20] },
  { name: 'arms', pivot: [0, 22, -1], from: [-4, -6, -2], size: [8, 4, 4], uv: [40, 44], rot: [0.75, 0, 0] },
  { name: 'armR', parent: 'arms', pivot: [0, 0, 0], from: [4, -8, -2], size: [4, 8, 4], uv: [44, 22] },
  { name: 'armL', parent: 'arms', pivot: [0, 0, 0], from: [-8, -8, -2], size: [4, 8, 4], uv: [44, 22] },
  { name: 'legR', pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
  { name: 'legL', pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
];
mob({
  id: MOB_VILLAGER, key: 'villager', name: 'Aldeano', hostile: false, health: 20, walk: 0.9, run: 2.2, width: 0.6, height: 1.95,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], anim: 'villager', scale: 0.94, parts: villagerParts(),
});
mob({
  id: MOB_WANDERING_TRADER, key: 'wandering_trader', name: 'Comerciante ambulante', hostile: false, health: 20, walk: 0.9,
  run: 2.2, width: 0.6, height: 1.95, damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], anim: 'villager', scale: 0.94,
  parts: villagerParts(),
});
/** ¿Aldeano o comerciante ambulante (se comercia con ellos)? */
export const isVillagerType = (type: number): boolean => type === MOB_VILLAGER || type === MOB_WANDERING_TRADER;
// ---------------------------------------------------------------- Fase 6 (monstruos)
/** Cabeza de aldeano (alargada, con nariz) sobre un cuerpo de túnica: aldeano zombi y bruja. */
const villagerLike = (): ModelPart[] => [
  { name: 'head', pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8], uv: [0, 0] },
  { name: 'nose', parent: 'head', pivot: [0, 0, 0], from: [-1, 1, -6], size: [2, 4, 2], uv: [32, 0] },
  { name: 'body', pivot: [0, 12, 0], from: [-4, 0, -3], size: [8, 12, 6], uv: [16, 20] },
  { name: 'armR', pivot: [6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4], uv: [44, 22] },
  { name: 'armL', pivot: [-6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4], uv: [44, 22] },
  { name: 'legR', pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
  { name: 'legL', pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
];

/** Slimes: el mismo cubo a escala 4, 2 o 1 (grande, mediano, pequeño). Sólo los pequeños sueltan bolas. */
const slime = (id: number, key: string, name: string, size: number, health: number, damage: number): void => mob({
  id, key, name, hostile: true, health, walk: 1.2, run: 2.2 + size * 0.1, width: 0.51 * size, height: 0.51 * size, damage,
  burnsInSun: false, drops: size === 1 ? [[SLIME_BALL, 0, 2]] : [], atlas: [32, 16], anim: 'slime', scale: size, sound: 'slime',
  parts: [{ name: 'body', pivot: [0, 0, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] }],
});

mob({
  id: MOB_DROWNED, key: 'drowned', name: 'Ahogado', hostile: true, health: 20, walk: 1.0, run: 2.2, width: 0.6, height: 1.95,
  damage: 3, burnsInSun: true, drops: [[ROTTEN_FLESH, 0, 2]], atlas: [64, 64], anim: 'zombie', scale: 1, sound: 'zombie',
  parts: humanoid(false),
});
mob({
  id: MOB_WITCH, key: 'witch', name: 'Bruja', hostile: true, health: 26, walk: 1.0, run: 1.7, width: 0.6, height: 1.95,
  damage: 0, burnsInSun: false, atlas: [64, 72], anim: 'humanoid', scale: 1,
  drops: [[STICK, 0, 2], [SUGAR, 0, 2], [GUNPOWDER, 0, 1], [REDSTONE, 0, 2], [SPIDER_EYE, 0, 1]],
  parts: [
    ...villagerLike(),
    // Sombrero puntiagudo, algo torcido hacia atrás.
    { name: 'hat1', parent: 'head', pivot: [0, 10, 0], from: [-5, 0, -5], size: [10, 2, 10], uv: [0, 40] },
    { name: 'hat2', parent: 'hat1', pivot: [0, 2, 0.5], from: [-3.5, 0, -3.5], size: [7, 4, 7], uv: [0, 54], rot: [-0.08, 0, 0.04] },
    { name: 'hat3', parent: 'hat2', pivot: [0, 4, 0.5], from: [-2, 0, -2], size: [4, 4, 4], uv: [44, 0], rot: [-0.14, 0, 0.06] },
    { name: 'hat4', parent: 'hat3', pivot: [0, 4, 0.5], from: [-0.5, 0, -0.5], size: [1, 2, 1], uv: [40, 0], rot: [-0.22, 0, 0.1] },
  ],
});
slime(MOB_SLIME, 'slime', 'Slime', 4, 16, 4);
slime(MOB_SLIME_MEDIUM, 'slime_medium', 'Slime mediano', 2, 4, 2);
slime(MOB_SLIME_SMALL, 'slime_small', 'Slime pequeño', 1, 1, 0);
mob({
  id: MOB_PHANTOM, key: 'phantom', name: 'Phantom', hostile: true, health: 20, walk: 5, run: 9, width: 0.9, height: 0.5,
  damage: 4, burnsInSun: true, drops: [[PHANTOM_MEMBRANE, 0, 1]], atlas: [64, 48], anim: 'phantom', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 4, 0], from: [-2.5, -1.5, -4.5], size: [5, 3, 9], uv: [0, 8] },
    { name: 'head', parent: 'body', pivot: [0, 0, -4.5], from: [-3.5, -1, -5], size: [7, 3, 5], uv: [0, 0] },
    { name: 'wingR', parent: 'body', pivot: [2.5, 1, -4.5], from: [0, -1, 0], size: [6, 2, 9], uv: [0, 20] },
    { name: 'wingTipR', parent: 'wingR', pivot: [6, 0, 0], from: [0, -0.5, 0], size: [13, 1, 9], uv: [0, 32] },
    { name: 'wingL', parent: 'body', pivot: [-2.5, 1, -4.5], from: [-6, -1, 0], size: [6, 2, 9], uv: [0, 20] },
    { name: 'wingTipL', parent: 'wingL', pivot: [-6, 0, 0], from: [-13, -0.5, 0], size: [13, 1, 9], uv: [0, 32] },
    { name: 'tail', parent: 'body', pivot: [0, 0.5, 4.5], from: [-1.5, -1, 0], size: [3, 2, 6], uv: [30, 20] },
    { name: 'tailTip', parent: 'tail', pivot: [0, 0, 6], from: [-0.5, -0.5, 0], size: [1, 1, 6], uv: [48, 20] },
  ],
});
mob({
  id: MOB_SILVERFISH, key: 'silverfish', name: 'Lepisma', hostile: true, health: 8, walk: 1.3, run: 2.8, width: 0.4, height: 0.3,
  damage: 1, burnsInSun: false, drops: [], atlas: [32, 32], anim: 'silverfish', scale: 1,
  // Siete segmentos de la cabeza (delante, -Z) a la cola: [tamaño, z del centro, uv].
  parts: ([
    [[3, 2, 2], -7, [0, 0]], [[4, 3, 2], -5, [0, 4]], [[6, 4, 3], -2.5, [0, 9]], [[3, 3, 3], 0.5, [0, 16]],
    [[2, 2, 3], 3.5, [0, 22]], [[2, 1, 2], 6, [12, 0]], [[1, 1, 2], 8, [20, 0]],
  ] as [[number, number, number], number, [number, number]][]).map(([size, z, uv], i): ModelPart => ({
    name: `seg${i}`, pivot: [0, 0, z], from: [-size[0] / 2, 0, -size[2] / 2], size, uv,
  })),
});
mob({
  id: MOB_CAVE_SPIDER, key: 'cave_spider', name: 'Araña de cueva', hostile: true, neutral: true, health: 12, walk: 1.3, run: 3.1,
  width: 0.7, height: 0.5, damage: 2, burnsInSun: false, drops: [[STRING, 0, 2], [SPIDER_EYE, 0, 1]], atlas: [64, 64],
  anim: 'spider', scale: 0.7, sound: 'spider',
  parts: [
    { name: 'thorax', pivot: [0, 9, 0], from: [-3, -3, -3], size: [6, 6, 6], uv: [0, 0] },
    { name: 'head', parent: 'thorax', pivot: [0, 0, -3], from: [-4, -4, -8], size: [8, 8, 8], uv: [32, 4] },
    { name: 'abdomen', parent: 'thorax', pivot: [0, 0, 3], from: [-5, -4, 0], size: [10, 8, 12], uv: [0, 20] },
    ...spiderLegs(),
  ],
});
mob({
  id: MOB_ZOMBIE_VILLAGER, key: 'zombie_villager', name: 'Aldeano zombi', hostile: true, health: 20, walk: 1.0, run: 2.4,
  width: 0.6, height: 2.0, damage: 3, burnsInSun: true, drops: [[ROTTEN_FLESH, 0, 2]], atlas: [64, 64], anim: 'zombie', scale: 1,
  sound: 'zombie', parts: villagerLike(),
});
// Fase 6 (acuáticos): definiciones en aquaticMobs.ts.
for (const d of AQUATIC_MOBS) mob(d);

// ---------------------------------------------------------------- fase 6 (fauna): abejas, pandas, loros y armadillos
mob({
  id: MOB_BEE, key: 'bee', name: 'Abeja', hostile: false, neutral: true, health: 10, walk: 2.2, run: 4.2, width: 0.7, height: 0.6,
  damage: 2, burnsInSun: false, drops: [], atlas: [64, 32], anim: 'flyer', scale: 1, flying: true,
  parts: [
    { name: 'body', pivot: [0, 3, 0], from: [-3.5, 0, -5], size: [7, 7, 10], uv: [0, 0] },
    { name: 'stinger', parent: 'body', pivot: [0, 0, 0], from: [-0.5, 2, 5], size: [1, 1, 2], uv: [36, 0] },
    { name: 'antennaR', parent: 'body', pivot: [0, 0, 0], from: [0.5, 5, -8], size: [1, 2, 3], uv: [44, 0] },
    { name: 'antennaL', parent: 'body', pivot: [0, 0, 0], from: [-1.5, 5, -8], size: [1, 2, 3], uv: [44, 0] },
    { name: 'wingR', parent: 'body', pivot: [1, 7, -2], from: [0, 0, 0], size: [9, 0, 6], uv: [0, 18] },
    { name: 'wingL', parent: 'body', pivot: [-1, 7, -2], from: [-9, 0, 0], size: [9, 0, 6], uv: [0, 18] },
    { name: 'leg0', parent: 'body', pivot: [0, 0, -2], from: [-2.5, -2, 0], size: [5, 2, 1], uv: [34, 8] },
    { name: 'leg1', parent: 'body', pivot: [0, 0, 0], from: [-2.5, -2, 0], size: [5, 2, 1], uv: [34, 8] },
    { name: 'leg2', parent: 'body', pivot: [0, 0, 2], from: [-2.5, -2, 0], size: [5, 2, 1], uv: [34, 8] },
  ],
});
mob({
  id: MOB_PANDA, key: 'panda', name: 'Panda', hostile: false, neutral: true, health: 20, walk: 0.9, run: 2.2, width: 1.3, height: 1.25,
  damage: 6, burnsInSun: false, drops: [], atlas: [128, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 8, 0], from: [-7.5, 0, -11], size: [15, 12, 22], uv: [0, 17] },
    { name: 'head', pivot: [0, 17, -11], from: [-5.5, -4, -8], size: [11, 9, 8], uv: [0, 0] },
    { name: 'nose', parent: 'head', pivot: [0, 0, 0], from: [-2.5, -4, -10], size: [5, 3, 2], uv: [40, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [3, 4, -3], size: [3, 3, 1], uv: [56, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-6, 4, -3], size: [3, 3, 1], uv: [56, 0] },
    { name: 'tail', pivot: [0, 17, 11], from: [-1.5, -1.5, 0], size: [3, 3, 2], uv: [66, 0] },
    ...quadLegs(8, 4.5, [-7, 7], [76, 17], 5),
  ],
});
mob({
  id: MOB_PARROT, key: 'parrot', name: 'Loro', hostile: false, health: 6, walk: 3, run: 5.5, width: 0.5, height: 0.7,
  damage: 0, burnsInSun: false, drops: [[FEATHER, 1, 2]], atlas: [32, 32], anim: 'flyer', scale: 1, flying: true,
  parts: [
    { name: 'body', pivot: [0, 2, 0], from: [-1.5, 0, -1.5], size: [3, 6, 3], uv: [0, 0], rot: [-0.28, 0, 0] },
    { name: 'head', parent: 'body', pivot: [0, 6, -0.5], from: [-1, 0, -1], size: [2, 3, 2], uv: [12, 0] },
    { name: 'beak', parent: 'head', pivot: [0, 0, 0], from: [-0.5, 1, -2], size: [1, 2, 1], uv: [20, 0] },
    { name: 'crest', parent: 'head', pivot: [0, 3, 0.5], from: [-0.5, -1, 0], size: [1, 3, 2], uv: [20, 4], rot: [-0.6, 0, 0] },
    { name: 'wingR', parent: 'body', pivot: [1.5, 5.5, 0], from: [0, -5, -1.5], size: [1, 5, 3], uv: [0, 9] },
    { name: 'wingL', parent: 'body', pivot: [-1.5, 5.5, 0], from: [-1, -5, -1.5], size: [1, 5, 3], uv: [0, 9] },
    { name: 'tail', parent: 'body', pivot: [0, 0.5, 1.5], from: [-1.5, -3, -0.5], size: [3, 3, 1], uv: [10, 9], rot: [-0.5, 0, 0] },
    { name: 'legR', pivot: [1, 2, 0], from: [-0.5, -2, -0.5], size: [1, 2, 1], uv: [20, 10] },
    { name: 'legL', pivot: [-1, 2, 0], from: [-0.5, -2, -0.5], size: [1, 2, 1], uv: [20, 10] },
  ],
});
mob({
  id: MOB_ARMADILLO, key: 'armadillo', name: 'Armadillo', hostile: false, health: 12, walk: 1.1, run: 2.6, width: 0.7, height: 0.65,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 32], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 3, 0], from: [-3.5, 0, -5], size: [7, 6, 10], uv: [0, 0] },
    { name: 'head', pivot: [0, 6, -5], from: [-1.5, -3.5, -4], size: [3, 4, 4], uv: [36, 0], rot: [-0.3, 0, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0.5, 0, -1], size: [2, 3, 1], uv: [50, 0], rot: [0, 0, -0.35] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-2.5, 0, -1], size: [2, 3, 1], uv: [50, 0], rot: [0, 0, 0.35] },
    { name: 'tail', pivot: [0, 4, 5], from: [-1, -1, 0], size: [2, 2, 5], uv: [36, 8], rot: [0.9, 0, 0] },
    ...quadLegs(3, 2, [-3, 3], [0, 18], 2),
  ],
});

// Fase 6 (asaltos): definiciones en illagers.ts.
for (const d of ILLAGER_MOBS) mob(d);
mob(WARDEN_DEF); // Fase 7.5 (abismo)
for (const d of OCEAN_MOBS) mob(d); // Fase 7.5 (océano)
// Fase 7.5 (fauna): definiciones en critters.ts (reutilizan los modelos del gato, la vaca, la llama y el caballo).
for (const d of critterMobs(MOBS, { cat: MOB_CAT, cow: MOB_COW, llama: MOB_LLAMA, horse: MOB_HORSE })) mob(d);
mob(ALLAY_DEF); // Fase 7.5 (mansión)
for (const d of netherMobs()) mob(d); // Fase 8.3 (criaturas del Nether)
for (const d of endMobs()) mob(d); // Fase 8.6 (el End)
for (const d of witherMobs()) mob(d); // Fase 8.7 (el Wither)

export const MOB_TYPES: readonly number[] = MOBS.filter(Boolean).map((m) => m.id);

/**
 * Rectángulos de cada cara de una caja en el atlas (disposición de Minecraft):
 * [u, v, ancho, alto] para +X, -X, +Y (arriba), -Y (abajo), -Z (frente), +Z (espalda).
 */
export function boxFaces(u: number, v: number, w: number, h: number, d: number): [number, number, number, number][] {
  return [
    [u, v + d, d, h],
    [u + d + w, v + d, d, h],
    [u + d, v, w, d],
    [u + d + w, v, w, d],
    [u + d, v + d, w, h],
    [u + d + w + d, v + d, w, h],
  ];
}
