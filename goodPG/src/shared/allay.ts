// Fase 7.5 (mansión): el alay. Espíritu azul pequeño que vuela: si se le da un objeto, recoge los que
// sean iguales y se los lleva al jugador (o al bloque musical que oyó hace poco); baila junto a un
// tocadiscos que suena y, bailando, se duplica con un fragmento de amatista. Aquí van su id, sus
// estadísticas, su modelo y las constantes que comparten servidor y cliente; su comportamiento está en
// sim/entities/allay.ts.
import type { MobDef } from './mobs';
import { packParts } from './aquaticMobs';

export const MOB_ALLAY = 76;

/** Bloques (en horizontal) a los que busca objetos iguales al suyo. */
export const ALLAY_SEARCH = 32;
/** Bloques a los que sigue a su jugador y a los que oye un bloque musical. */
export const ALLAY_FOLLOW = 64;
export const ALLAY_NOTE_RANGE = 16;
/** Segundos que recuerda el bloque musical que oyó (se los lleva allí en vez de al jugador). */
export const ALLAY_NOTE_MEMORY = 30;
/** Bloques a los que baila con un tocadiscos que suena. */
export const ALLAY_JUKEBOX_RANGE = 10;
/** Segundos de espera tras duplicarse (5 minutos) y tras soltar lo que llevaba (no lo vuelve a coger). */
export const ALLAY_DUPLICATE_COOLDOWN = 300;
export const ALLAY_PICKUP_COOLDOWN = 3;

/** Bit de estado (en Entity.flags, sólo para el alay): bailando. Comparte bit con EF_FAUNA_A (1 << 19). */
export const EF_ALLAY_DANCING = 1 << 19;

/**
 * Modelo: cabeza grande, cuerpo corto con faldón, brazos finos y dos alas planas a la espalda. Mira
 * hacia −Z y flota (el cuerpo no toca el suelo).
 */
export const ALLAY_DEF: MobDef = (() => {
  const { parts, atlas } = packParts(32, [
    { name: 'body', pivot: [0, 6, 0], from: [-1.5, -5, -1], size: [3, 5, 2] },
    { name: 'head', pivot: [0, 6, 0], from: [-2.5, 0, -2.5], size: [5, 5, 5] },
    { name: 'armR', pivot: [1.75, 5.75, 0], from: [-0.5, -4, -1], size: [1, 4, 2] },
    { name: 'armL', pivot: [-1.75, 5.75, 0], from: [-0.5, -4, -1], size: [1, 4, 2], share: 'armR' },
    { name: 'wingR', pivot: [0.5, 5.5, 1], from: [0, -5, 0], size: [0, 5, 8], rot: [0, 0.35, 0] },
    { name: 'wingL', pivot: [-0.5, 5.5, 1], from: [0, -5, 0], size: [0, 5, 8], rot: [0, -0.35, 0], share: 'wingR' },
  ]);
  return {
    id: MOB_ALLAY, key: 'allay', name: 'Alay', hostile: false, health: 20, walk: 3.2, run: 5.5, width: 0.35, height: 0.6,
    damage: 0, burnsInSun: false, drops: [], anim: 'allay', scale: 1, flying: true, parts, atlas,
  };
})();
