// Fase 8.7: el Wither (WitherBoss de Java 26.3). Lo que comparten el servidor y el cliente: ids, las constantes de Java
// (en ticks, como allí) y el modelo (WitherBossModel, con sus números).
// - Wither (id 99): 300 de vida, armadura 4, vuela. Nace con un tercio de la vida y 220 ticks de invulnerabilidad en los
//   que se cura 10 cada 10 ticks; al acabar, explota con fuerza 7. Su cabeza del centro dispara a su objetivo cada 40
//   ticks (a 20 bloques) y las de los lados, a cualquier criatura viva que no sea un no muerto. Por debajo de la mitad
//   se blinda: las flechas no le hacen nada. Al recibir daño rompe los bloques que le rodean. Suelta una estrella del
//   Nether.
// - Calavera del Wither (entidad 126): acelera como las bolas de fuego; al chocar explota con fuerza 1, hace 8 de daño
//   y da Marchitamiento II (10 s en normal, 40 s en difícil). Las azules («peligrosas») van más despacio y rompen hasta
//   la obsidiana.
// mobs.ts lo registra; su comportamiento va en sim/entities/wither.ts.
import type { MobDef } from './mobs';
import { jb } from './netherMobs';

export const MOB_WITHER = 99;
export const ENT_WITHER_SKULL = 126;

export const WITHER_HEALTH = 300;
export const WITHER_ARMOR = 4;
/** Ticks de invulnerabilidad al nacer (WitherBoss.makeInvulnerable) y fuerza de la explosión al acabar. */
export const WITHER_INVULNERABLE_TICKS = 220;
export const WITHER_SPAWN_BLAST = 7;
/** Experiencia al morir (xpReward). */
export const WITHER_XP = 50;
/** RangedAttackGoal(this, 1.0, 40, 20): cada 40 ticks, a 20 bloques. */
export const WITHER_ATTACK_INTERVAL = 40;
export const WITHER_ATTACK_RADIUS = 20;
/** Alcance para elegir objetivo (FOLLOW_RANGE) y el de las cabezas de los lados (20 × 8 × 20). */
export const WITHER_FOLLOW_RANGE = 40;
export const WITHER_HEAD_RANGE = 20;

/** Calavera: daño, curación del Wither si mata, Marchitamiento (segundos en normal y en difícil, nivel II), explosión. */
export const WITHER_SKULL_DAMAGE = 8;
export const WITHER_SKULL_HEAL = 5;
export const WITHER_SKULL_WITHER_NORMAL = 10;
export const WITHER_SKULL_WITHER_HARD = 40;
export const WITHER_SKULL_POWER = 1;
/** AbstractHurtingProjectile: acelera 0,1 bloques por tick y frena con el aire (0,95; las azules 0,73) o el agua (0,8). */
export const WITHER_SKULL_ACCEL = 0.1;
export const WITHER_SKULL_INERTIA = 0.95;
export const WITHER_SKULL_DANGEROUS_INERTIA = 0.73;
export const WITHER_SKULL_WATER_INERTIA = 0.8;
export const WITHER_SKULL_SIZE = 0.3125;

/** Posición de cada cabeza respecto a los pies (getHeadX/Y/Z; escala 1): 0 la del centro, 1 y 2 las de los lados. */
export function witherHeadPos(bodyYawDeg: number, head: number): [number, number, number] {
  if (head <= 0) return [0, 3, 0];
  const a = ((bodyYawDeg + 180 * (head - 1)) * Math.PI) / 180;
  return [Math.cos(a) * 1.3, 2.2, Math.sin(a) * 1.3];
}

/** WitherBossModel: hombros, costillas (espina y tres costillas), cola y las tres cabezas (64 × 64). */
function witherParts() {
  const ribX = 0.20420352;
  return [
    jb({ name: 'shoulders', o: [0, 0, 0], box: [-10, 3.9, -0.5, 20, 3, 3], uv: [0, 16] }),
    jb({ name: 'ribcage', o: [-2, 6.9, -0.5], box: [0, 0, 0, 3, 10, 3], uv: [0, 22], r: [ribX, 0, 0] }),
    jb({ name: 'rib0', parent: 'ribcage', o: [0, 0, 0], box: [-4, 1.5, 0.5, 11, 2, 2], uv: [24, 22] }),
    jb({ name: 'rib1', parent: 'ribcage', o: [0, 0, 0], box: [-4, 4, 0.5, 11, 2, 2], uv: [24, 22] }),
    jb({ name: 'rib2', parent: 'ribcage', o: [0, 0, 0], box: [-4, 6.5, 0.5, 11, 2, 2], uv: [24, 22] }),
    jb({ name: 'tail', o: [-2, 6.9 + Math.cos(ribX) * 10, -0.5 + Math.sin(ribX) * 10], box: [0, 0, 0, 3, 6, 3], uv: [12, 22], r: [0.83252203, 0, 0] }),
    jb({ name: 'center_head', o: [0, 0, 0], box: [-4, -4, -4, 8, 8, 8], uv: [0, 0] }),
    jb({ name: 'right_head', o: [-8, 4, 0], box: [-4, -4, -4, 6, 6, 6], uv: [32, 0] }),
    jb({ name: 'left_head', o: [10, 4, 0], box: [-4, -4, -4, 6, 6, 6], uv: [32, 0] }),
    // La calavera que lanza (WitherSkullRenderer, 0, 35): no se dibuja con el Wither, pero así su textura la incluye.
    jb({ name: 'skull', o: [0, 0, 0], box: [-4, -8, -4, 8, 8, 8], uv: [0, 35] }),
  ];
}

/** El Wither (lo registra mobs.ts). */
export function witherMobs(): MobDef[] {
  return [
    {
      id: MOB_WITHER, key: 'wither', name: 'Wither', hostile: true, health: WITHER_HEALTH, walk: 0.6 * 20, run: 0.6 * 20, width: 0.9,
      height: 3.5, damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], parts: witherParts(), anim: 'wither', scale: 2,
      flying: true, fireImmune: true, fullBright: true, xp: WITHER_XP,
    },
  ];
}
