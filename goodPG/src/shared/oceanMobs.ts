// Fase 7.5 (océano): guardián y guardián anciano (ids 73 y 74). Aquí van sus ids, estadísticas,
// botín, constantes de combate y el modelo por cajas; mobs.ts los registra y sim/entities/guardians.ts
// les da vida.
//
// El modelo es el cuerpo cúbico de Minecraft: una caja de 12×12×16 con placas en los cuatro costados,
// un ojo en la cara de delante, doce púas en las aristas (salen y se esconden) y una cola de tres
// segmentos con aleta. El anciano es el mismo a 2,35 veces su tamaño.
import type { MobDef, ModelPart } from './mobs';
import { packParts } from './aquaticMobs';
import { PRISMARINE_SHARD } from './items';
import { EF_FAUNA_A } from './fauna';

export const MOB_GUARDIAN = 73;
export const MOB_ELDER_GUARDIAN = 74;

/** ¿Guardián o guardián anciano? */
export const isGuardian = (type: number): boolean => type === MOB_GUARDIAN || type === MOB_ELDER_GUARDIAN;

/** Bit de estado: se está moviendo (las púas están recogidas y no pinchan). */
export const EF_GUARDIAN_MOVING = EF_FAUNA_A;

/**
 * Láser: segundos que tarda en cargar (Minecraft: 80 ticks el guardián, 60 el anciano) y medio segundo
 * de aviso antes de que se vea el rayo (los −10 ticks del contador de Minecraft).
 */
export const LASER_CHARGE: Readonly<Record<number, number>> = { [MOB_GUARDIAN]: 4, [MOB_ELDER_GUARDIAN]: 3 };
export const LASER_WARMUP = 0.5;
/** Alcance del láser (bloques). */
export const LASER_RANGE = 16;
/** Daño mágico del láser: 1, +2 en difícil, +2 el anciano (Minecraft). */
export function laserMagic(type: number, difficulty: number): number {
  return 1 + (difficulty === 3 ? 2 : 0) + (type === MOB_ELDER_GUARDIAN ? 2 : 0);
}
/** Daño de las púas a quien le pega cuerpo a cuerpo con ellas fuera. */
export const THORNS_DAMAGE = 2;
/**
 * Fatiga minera del anciano: cada minuto, a los jugadores a menos de 50 bloques, fatiga minera III
 * durante 5 minutos (si no la tienen ya con al menos 1 minuto por delante).
 */
export const CURSE_EVERY = 60;
export const CURSE_RANGE = 50;
export const CURSE_SECONDS = 300;
export const CURSE_AMP = 2;

type PartSpec = Omit<ModelPart, 'uv'> & { share?: string };

/** Las doce púas de Minecraft: aristas del cubo (x, y, z respecto al centro, en píxeles). */
export const SPIKE_SPOTS: readonly [number, number, number][] = [
  [0, -8, 8], [0, -8, -8], [8, -8, 0], [-8, -8, 0], [-8, 0, -8], [8, 0, -8],
  [8, 0, 8], [-8, 0, 8], [0, 8, 8], [0, 8, -8], [8, 8, 0], [-8, 8, 0],
];

function guardianSpecs(): PartSpec[] {
  const specs: PartSpec[] = [
    { name: 'body', pivot: [0, 8, 0], from: [-6, -6, -8], size: [12, 12, 16] },
    { name: 'plateR', parent: 'body', pivot: [0, 0, 0], from: [6, -6, -6], size: [2, 12, 12] },
    { name: 'plateL', parent: 'body', pivot: [0, 0, 0], from: [-8, -6, -6], size: [2, 12, 12], share: 'plateR' },
    { name: 'plateTop', parent: 'body', pivot: [0, 0, 0], from: [-6, 6, -6], size: [12, 2, 12] },
    { name: 'plateBottom', parent: 'body', pivot: [0, 0, 0], from: [-6, -8, -6], size: [12, 2, 12], share: 'plateTop' },
    // El ojo gira alrededor del centro del cuerpo: así se desliza por la cara al mirar.
    { name: 'eye', parent: 'body', pivot: [0, 0, 0], from: [-1, -1, -8.25], size: [2, 2, 1] },
    { name: 'tail0', parent: 'body', pivot: [0, 0, 8], from: [-2, -2, -1], size: [4, 4, 8] },
    { name: 'tail1', parent: 'tail0', pivot: [0, 0, 7], from: [-1.5, -1.5, 0], size: [3, 3, 7] },
    { name: 'tail2', parent: 'tail1', pivot: [0, 0, 7], from: [-1, -1, 0], size: [2, 2, 6] },
    { name: 'fin', parent: 'tail2', pivot: [0, 0, 3], from: [-0.5, -4.5, 0], size: [1, 9, 9] },
  ];
  // Cada púa sale del centro del cuerpo hacia su arista: al recogerla (escala < 1) se mete dentro.
  SPIKE_SPOTS.forEach(([x, y, z], i) => {
    const r = Math.hypot(x, y, z);
    const a = Math.acos(y / r), b = Math.atan2(x, z);
    specs.push({
      name: `spike${i}`, parent: 'body', pivot: [0, 0, 0], from: [-1, r - 4.5, -1], size: [2, 9, 2], rot: [a, b, 0],
      share: i ? 'spike0' : undefined,
    });
  });
  return specs;
}

function model(base: Omit<MobDef, 'parts' | 'atlas'>): MobDef {
  const { parts, atlas } = packParts(64, guardianSpecs());
  return { ...base, parts, atlas };
}

const common = { hostile: true, burnsInSun: false, anim: 'guardian' as const, sound: 'guardian' };

export const OCEAN_MOBS: MobDef[] = [
  // Guardián: 30 de vida, 6 de daño (el del láser), nada a 0,5 y su caja mide 0,85.
  model({
    ...common, id: MOB_GUARDIAN, key: 'guardian', name: 'Guardián', health: 30, walk: 2.2, run: 4.2, width: 0.85, height: 0.85,
    damage: 6, drops: [[PRISMARINE_SHARD, 0, 2]], scale: 0.85, xp: 10,
  }),
  // Guardián anciano: 80 de vida, 8 de daño, más lento y 2,35 veces más grande.
  model({
    ...common, id: MOB_ELDER_GUARDIAN, key: 'elder_guardian', name: 'Guardián anciano', health: 80, walk: 1.2, run: 1.9,
    width: 1.9975, height: 1.9975, damage: 8, drops: [[PRISMARINE_SHARD, 0, 2]], scale: 2.0, xp: 10, sound: 'elder_guardian',
  }),
];
