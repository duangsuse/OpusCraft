// Fase 8.6 (el End): las criaturas del End. Aquí va lo que comparten el servidor y el cliente: ids, constantes de
// Java 26.3 (en ticks, como allí) y los modelos (con los números de las clases del cliente de Java).
// - Endermita (id 96): la que a veces sale al caer una perla de ender (5 %). Cuatro segmentos (EndermiteModel),
//   8 de vida, muerde por 2; a los 2400 ticks se va si nadie le ha puesto nombre; los enderman la persiguen.
// - Dragón de Ender (id 97): el jefe del End (200 de vida, 16 × 8). Vuela por fases (EnderDragonPhase), se cura con
//   los cristales, rompe lo que atraviesa y lo que toca le hace daño por partes (la cabeza entero; el resto, un cuarto).
// - Cristal del End (entidad 123) y bola de fuego del dragón (entidad 124).
// - Shulker (id 98): la concha de las ciudades del End (Shulker de Java). Pegado a una cara de un bloque, se asoma
//   a ratos y, si ve a un jugador a 16 bloques (sólo 4 en el eje de la cara donde se pega), se abre y le lanza balas
//   que le persiguen (entidad 125) y dan Levitación. Cerrado tiene 20 de armadura y las flechas le rebotan; herido
//   por debajo de la mitad, a veces se teletransporta; si su propia bala le da, puede salir otro.
// mobs.ts las registra; su comportamiento va en sim/entities (monsterAi.ts, enderDragon.ts).
import type { MobDef, ModelPart } from './mobs';
import { javaGroundSpeed } from './netherMobs';
import { EF_FAUNA_A, EF_FAUNA_B } from './fauna';

export const MOB_ENDERMITE = 96;
export const MOB_ENDER_DRAGON = 97;
export const MOB_SHULKER = 98;
export const ENT_END_CRYSTAL = 123;
export const ENT_DRAGON_FIREBALL = 124;
export const ENT_SHULKER_BULLET = 125;

/** Caras de Java (Direction.get3DDataValue): 0 abajo, 1 arriba, 2 norte, 3 sur, 4 oeste, 5 este. */
export const DIR6: readonly (readonly [number, number, number])[] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
export const oppositeDir = (d: number): number => d ^ 1;
/** Vida del shulker (createAttributes: MAX_HEALTH 30) y armadura cerrado (COVERED_ARMOR_MODIFIER: +20). */
export const SHULKER_HEALTH = 30;
export const SHULKER_COVERED_ARMOR = 20;
/** Cuánto se asoma (DATA_PEEK_ID): cerrado, asomándose (ShulkerPeekGoal) y atacando (ShulkerAttackGoal). */
export const SHULKER_PEEKS = [0, 30, 100] as const;
/** Variante que se envía: la cara donde se pega (0..5) y cómo se asoma (0..2). */
export const shulkerVariant = (face: number, peek: number): number => face | (peek << 3);
export const shulkerFace = (v: number): number => (v & 7) % 6;
export const shulkerPeekState = (v: number): number => Math.min(2, (v >> 3) & 3);
/** getPhysicalPeek: cuánto sale la tapa (0..1) con lo que se asoma (0..1). */
export const shulkerPhysicalPeek = (amount: number): number => 0.5 - Math.sin((0.5 + amount) * Math.PI) * 0.5;
/** getProgressAabb: la caja del shulker pegado a `face` en (x, y, z) (el centro de abajo), estirada lo que sale la tapa. */
export function shulkerBox(x: number, y: number, z: number, face: number, peek: number): [number, number, number, number, number, number] {
  const [dx, dy, dz] = DIR6[oppositeDir(face)];
  const k = shulkerPhysicalPeek(peek);
  return [x - 0.5 + Math.min(0, dx * k), y + Math.min(0, dy * k), z - 0.5 + Math.min(0, dz * k), x + 0.5 + Math.max(0, dx * k), y + 1 + Math.max(0, dy * k), z + 0.5 + Math.max(0, dz * k)];
}
/** Daño de la bala (ShulkerBullet.onHitEntity: 4) y la Levitación que da (200 ticks). */
export const SHULKER_BULLET_DAMAGE = 4;
export const SHULKER_LEVITATION_SECONDS = 10;
/** Probabilidad de soltar la concha (loot table: 0,5 y 0,0625 más por nivel de Saqueo). */
export const SHULKER_SHELL_CHANCE = 0.5;
export const SHULKER_SHELL_LOOTING = 0.0625;

/** Bits de estado del dragón: sentado en el podio (fases de SITTING_*) y aterrizando o despegando. */
export const EF_DRAGON_SITTING = EF_FAUNA_A;
export const EF_DRAGON_LANDING = EF_FAUNA_B;
/** Vida del dragón (EnderDragon.createAttributes: MAX_HEALTH 200). */
export const DRAGON_HEALTH = 200;
/** Experiencia del dragón: la primera vez 12 000; después, 500. */
export const DRAGON_XP_FIRST = 12000;
export const DRAGON_XP_AGAIN = 500;
/** Partes del dragón (EnderDragonPart): nombre, ancho y alto. La cabeza recibe el daño entero; el resto, un cuarto + 1. */
export const DRAGON_PARTS: readonly (readonly [string, number, number])[] = [
  ['head', 1, 1], ['neck', 3, 3], ['body', 5, 3], ['tail1', 2, 2], ['tail2', 2, 2], ['tail3', 2, 2], ['wing1', 4, 2], ['wing2', 4, 2],
];

/** Ticks que vive una endermita sin nombre (Endermite.aiStep: life ≥ 2400 → discard). */
export const ENDERMITE_LIFE_TICKS = 2400;
/** Probabilidad de que salga una endermita donde estaba quien lanzó la perla (ThrownEnderpearl.onHit). */
export const ENDERMITE_PEARL_CHANCE = 0.05;

/** EndermiteModel: cuatro segmentos [tamaño, z del centro, uv] de la cabeza (−z) a la cola. */
function endermiteParts(): ModelPart[] {
  const sizes: [number, number, number][] = [[4, 3, 2], [6, 4, 5], [3, 3, 1], [1, 2, 1]];
  const uvs: [number, number][] = [[0, 0], [0, 5], [0, 14], [0, 18]];
  const out: ModelPart[] = [];
  let z = -3.5;
  for (let i = 0; i < 4; i++) {
    const s = sizes[i];
    out.push({ name: `seg${i}`, pivot: [0, 0, z], from: [-s[0] / 2, 0, -s[2] / 2], size: s, uv: uvs[i] });
    if (i < 3) z += (s[2] + sizes[i + 1][2]) * 0.5;
  }
  return out;
}

/** ShulkerModel (64 × 64) en nuestros ejes: la tapa (sube al asomarse), la base y la cabeza dentro. */
function shulkerParts(): ModelPart[] {
  return [
    { name: 'lid', pivot: [0, 0, 0], from: [-8, 4, -8], size: [16, 12, 16], uv: [0, 0] },
    { name: 'base', pivot: [0, 0, 0], from: [-8, 0, -8], size: [16, 8, 16], uv: [0, 28] },
    { name: 'head', pivot: [0, 12, 0], from: [-3, -6, -3], size: [6, 6, 6], uv: [0, 52] },
  ];
}

/** Las criaturas del End (las registra mobs.ts). */
export function endMobs(): MobDef[] {
  return [
    {
      id: MOB_ENDERMITE, key: 'endermite', name: 'Endermita', hostile: true, health: 8, walk: 1.4, run: javaGroundSpeed(0.25),
      width: 0.4, height: 0.3, damage: 2, burnsInSun: false, drops: [], atlas: [64, 32], parts: endermiteParts(), anim: 'endermite',
      scale: 1, xp: 3,
    },
    {
      id: MOB_ENDER_DRAGON, key: 'ender_dragon', name: 'Dragón de Ender', hostile: true, health: DRAGON_HEALTH, walk: 0, run: 0,
      width: 16, height: 8, damage: 10, burnsInSun: false, drops: [], atlas: [256, 256], parts: [], anim: 'dragon', scale: 1,
      flying: true, fireImmune: true, xp: 0,
    },
    {
      id: MOB_SHULKER, key: 'shulker', name: 'Shulker', hostile: true, health: SHULKER_HEALTH, walk: 0, run: 0, width: 1, height: 1,
      damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], parts: shulkerParts(), anim: 'shulker', scale: 1, xp: 5,
    },
  ];
}

const END = new Set([MOB_ENDERMITE, MOB_ENDER_DRAGON, MOB_SHULKER]);
export function isEndMob(type: number): boolean {
  return END.has(type);
}
