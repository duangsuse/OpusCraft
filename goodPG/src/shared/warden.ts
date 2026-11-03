// Fase 7.5 (abismo): el warden (criatura 70). Aquí van su id, estadísticas, botín, modelo por cajas
// (el de Minecraft: torso con costillar, cabeza con dos zarcillos, brazos largos y piernas cortas, y un
// corazón que late) y lo que comparten el servidor y el cliente: sus poses y su nivel de enfado, que
// viajan en los bits de estado. mobs.ts lo registra y sim/entities/warden.ts le da comportamiento.
import type { MobDef } from './mobs';
import { packParts } from './aquaticMobs';
import { SCULK_CATALYST } from './blocks';
import { ARMOR_BYPASS } from './armor';

// El estampido sónico atraviesa la armadura (y los escudos y las protecciones: ver lifeCycle.ts y enchantEffects.ts).
(ARMOR_BYPASS as Set<string>).add('sonic_boom');

export const MOB_WARDEN = 70;

/** Poses (3 bits de estado a partir de WARDEN_POSE_SHIFT; bits propios del warden). */
export const WARDEN_POSE_SHIFT = 12;
export const WARDEN_POSE_MASK = 7 << WARDEN_POSE_SHIFT;
export const POSE_IDLE = 0, POSE_EMERGING = 1, POSE_DIGGING = 2, POSE_SNIFFING = 3, POSE_ROARING = 4, POSE_SONIC = 5,
  POSE_ATTACK = 6;
/** Zarcillos vibrando (acaba de sentir una vibración). */
export const WARDEN_TENDRILS = 1 << 15;
/**
 * Enfado hacia su presa principal, en cuartos del umbral de enfado (2 bits: 0..3, 3 = enfadado). Acelera el
 * latido del corazón, como el `clientAngerLevel` de Minecraft.
 */
export const WARDEN_ANGER_SHIFT = 19;
export const WARDEN_ANGER_MASK = 3 << WARDEN_ANGER_SHIFT;

export function wardenPose(flags: number): number {
  return (flags & WARDEN_POSE_MASK) >> WARDEN_POSE_SHIFT;
}

export function wardenAngerLevel(flags: number): number {
  return (flags & WARDEN_ANGER_MASK) >> WARDEN_ANGER_SHIFT;
}

/** Nivel (0..3) que viaja en los bits de estado para un enfado. */
export function angerBits(anger: number): number {
  return Math.round(Math.max(0, Math.min(1, anger / ANGER_ANGRY)) * 3);
}

/** Duración de cada pose (ticks de juego, los de Minecraft). */
export const EMERGE_TICKS = 134;
export const DIG_TICKS = 100;
export const ROAR_TICKS = 84;
export const SNIFF_TICKS = 84;
export const SONIC_TICKS = 60;
/** Tick del estampido sónico en que golpea (tras cargarlo). */
export const SONIC_HIT_TICK = 34;

/** Enfado: umbrales (agitado desde 40, enfadado desde 80) y máximo. */
export const ANGER_AGITATED = 40;
export const ANGER_ANGRY = 80;
export const ANGER_MAX = 150;

/** Nivel (0 tranquilo, 1 agitado, 2 enfadado) de un enfado. */
export function angerLevelOf(anger: number): number {
  return anger >= ANGER_ANGRY ? 2 : anger >= ANGER_AGITATED ? 1 : 0;
}

/** Segundos entre latidos según los bits de enfado (de 2 s tranquilo a 0,5 s enfadado, como en Minecraft). */
export function heartbeatInterval(bits: number): number {
  return (40 - Math.max(0, Math.min(3, bits)) * 10) / 20;
}

export const WARDEN_DEF: MobDef = (() => {
  const { parts, atlas } = packParts(128, [
    { name: 'body', pivot: [0, 13, 0], from: [-9, 0, -4], size: [18, 21, 11] },
    // El costillar: dos láminas delante del pecho, con huecos por los que se ve el corazón.
    { name: 'ribR', parent: 'body', pivot: [0, 0, -4.1], from: [0, 0, 0], size: [9, 21, 0] },
    { name: 'ribL', parent: 'body', pivot: [0, 0, -4.1], from: [-9, 0, 0], size: [9, 21, 0] },
    { name: 'heart', parent: 'body', pivot: [0, 14, -4.05], from: [-3.5, -3.5, 0], size: [7, 7, 0] },
    { name: 'head', parent: 'body', pivot: [0, 21, 0], from: [-8, 0, -5], size: [16, 16, 10] },
    { name: 'tendrilR', parent: 'head', pivot: [8, 12, 0], from: [0, -3, 0], size: [16, 16, 0] },
    { name: 'tendrilL', parent: 'head', pivot: [-8, 12, 0], from: [-16, -3, 0], size: [16, 16, 0] },
    { name: 'armR', parent: 'body', pivot: [13, 21, 1], from: [-4, -28, -4], size: [8, 28, 8] },
    { name: 'armL', parent: 'body', pivot: [-13, 21, 1], from: [-4, -28, -4], size: [8, 28, 8] },
    { name: 'legR', pivot: [5.9, 13, 0], from: [-3, -13, -3], size: [6, 13, 6] },
    { name: 'legL', pivot: [-5.9, 13, 0], from: [-3, -13, -3], size: [6, 13, 6], share: 'legR' },
  ]);
  return {
    // 500 de vida, 30 de daño en normal (15 corazones; 16 y 45 en fácil y difícil), ciego: sólo siente
    // vibraciones y olores. Al morir suelta un catalizador de sculk (y 5 de experiencia).
    id: MOB_WARDEN, key: 'warden', name: 'Warden', hostile: true, health: 500, walk: 2, run: 5, width: 0.9, height: 2.9,
    damage: 30, burnsInSun: false, drops: [[SCULK_CATALYST, 1, 1]], xp: 5, anim: 'warden', scale: 1, sound: 'warden', parts, atlas,
  };
})();
