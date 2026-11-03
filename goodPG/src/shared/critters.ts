// Fase 7.5 (fauna): criaturas sueltas del mundo normal. Murciélago, ocelote, champiñaca, llama de
// comerciante, caballo esqueleto y caballo zombi (ids 78–83): ids, estadísticas, botín y modelos, y
// lo que comparten el servidor y el cliente (bits de estado, reglas de aparición del murciélago).
// mobs.ts los registra; su comportamiento va en sim/entities/critters.ts y la trampa del rayo en
// sim/entities/skeletonTrap.ts.
import type { MobDef, ModelPart } from './mobs';
import { packParts } from './aquaticMobs';
import { LEATHER, RAW_BEEF, BONE, ROTTEN_FLESH } from './items';
import { EF_FAUNA_A, EF_FAUNA_B } from './fauna';

export const MOB_BAT = 78;
export const MOB_OCELOT = 79;
export const MOB_MOOSHROOM = 80;
export const MOB_TRADER_LLAMA = 81;
export const MOB_SKELETON_HORSE = 82;
export const MOB_ZOMBIE_HORSE = 83;

/**
 * Bits de estado propios (van en Entity.flags y sólo significan algo para su especie):
 *  - murciélago: colgado boca abajo del techo;
 *  - champiñaca: marrón (sin el bit, roja);
 *  - esqueleto: jinete montado en un caballo esqueleto (la trampa del rayo).
 */
export const EF_BAT_HANGING = EF_FAUNA_A;
export const EF_BROWN_MOOSHROOM = EF_FAUNA_A;
export const EF_HORSEMAN = EF_FAUNA_B;

/** Champiñones que suelta la champiñaca al esquilarla (y se queda en vaca). */
export const MOOSHROOM_SHEAR_MUSHROOMS = 5;
/** Probabilidad de que un ocelote confíe en el jugador por cada pescado crudo (1 de cada 3). */
export const OCELOT_TRUST_CHANCE = 1 / 3;
/** Un caballo trampa desaparece si nadie se acerca en 15 minutos. */
export const TRAP_HORSE_SECONDS = 900;
/** Distancia a la que un jugador dispara la trampa (bloques). */
export const TRAP_RANGE = 10;
/** Jinetes esqueleto que salen de la trampa (el caballo trampa y tres más). */
export const TRAP_HORSEMEN = 4;
/** Una llama de comerciante sin comerciante ni dueño se va a los 40 minutos. */
export const TRADER_LLAMA_SECONDS = 2400;

/** Criaturas del ambiente (murciélagos): no se guardan, no cuentan como animales y desaparecen lejos. */
export function isAmbientCritter(type: number): boolean {
  return type === MOB_BAT;
}

/** Caballos no muertos: no crían, no comen y no se ahogan (el esqueleto camina bajo el agua). */
export function isUndeadHorse(type: number): boolean {
  return type === MOB_SKELETON_HORSE || type === MOB_ZOMBIE_HORSE;
}

/**
 * ¿Puede aparecer un murciélago con esta luz de bloques? Como en Minecraft: la luz no puede pasar de
 * una tirada entre 0 y 3 (entre 0 y 6 del 20 de octubre al 3 de noviembre). `r` es una tirada en [0, 1).
 */
export function batLightOk(light: number, r: number, halloween: boolean): boolean {
  return light <= Math.floor(r * (halloween ? 7 : 4));
}

/** ¿Es la temporada de Halloween (20 de octubre a 3 de noviembre)? Hay más murciélagos. */
export function isHalloween(d: Date): boolean {
  const m = d.getMonth(), day = d.getDate();
  return (m === 9 && day >= 20) || (m === 10 && day <= 3);
}

// ---------------------------------------------------------------------------------- modelos

type Spec = Parameters<typeof packParts>[1][number];
type Base = Omit<MobDef, 'parts' | 'atlas'>;

/** Murciélago: cuerpo pequeño, cabeza con orejas, alas de dos tramos (planos) y patitas. */
function batSpecs(): Spec[] {
  return [
    { name: 'body', pivot: [0, 5, 0], from: [-1.5, 0, -1], size: [3, 5, 2] },
    { name: 'head', pivot: [0, 10, 0], from: [-2, 0, -2], size: [4, 3, 3] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0.5, 3, -1], size: [1, 2, 1] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-1.5, 3, -1], size: [1, 2, 1], share: 'earR' },
    { name: 'wingR', parent: 'body', pivot: [1.5, 4.5, 0.5], from: [0, -5, 0], size: [5, 5, 0] },
    { name: 'wingTipR', parent: 'wingR', pivot: [5, 0, 0], from: [0, -4, 0], size: [4, 4, 0] },
    { name: 'wingL', parent: 'body', pivot: [-1.5, 4.5, 0.5], from: [-5, -5, 0], size: [5, 5, 0] },
    { name: 'wingTipL', parent: 'wingL', pivot: [-5, 0, 0], from: [-4, -4, 0], size: [4, 4, 0] },
    { name: 'feet', parent: 'body', pivot: [0, 0, 0], from: [-1.5, -1, -0.5], size: [3, 1, 1] },
  ];
}

/** Champiñones de la champiñaca: dos planos en cruz por champiñón (uno en la cabeza y dos en el lomo). */
function mushroomParts(): ModelPart[] {
  const out: ModelPart[] = [];
  const spots: [string, string, [number, number, number]][] = [['head', 'mushHead', [0, 4, -3]], ['body', 'mushFront', [2, 10, -3]], ['body', 'mushBack', [-2, 10, 4]]];
  for (const [parent, name, pivot] of spots) {
    for (const [k, a] of [['A', Math.PI / 4], ['B', -Math.PI / 4]] as const) {
      out.push({ name: `${name}${k}`, parent, pivot, from: [-4, 0, 0], size: [8, 8, 0], uv: [16, 44], rot: [0, a, 0] });
    }
  }
  return out;
}

const clone = (parts: readonly ModelPart[]): ModelPart[] => parts.map((p) => ({ ...p }));

/**
 * Definiciones de las criaturas nuevas. `base` es la lista de criaturas ya registradas: el ocelote usa
 * el modelo del gato, la champiñaca el de la vaca, la llama de comerciante el de la llama y los caballos
 * no muertos el del caballo (mobs.ts la llama al final, con todas las demás ya puestas). Este módulo no
 * importa nada de mobs.ts en tiempo de ejecución: mobs.ts lo importa a él.
 */
export function critterMobs(base: readonly MobDef[], ids: { cat: number; cow: number; llama: number; horse: number }): MobDef[] {
  const cat = base[ids.cat], cow = base[ids.cow], llama = base[ids.llama], horse = base[ids.horse];
  const bat = packParts(32, batSpecs());
  const horseLike = (b: Base): MobDef => ({ ...b, parts: clone(horse.parts), atlas: [horse.atlas[0], horse.atlas[1]] });
  return [
    {
      id: MOB_BAT, key: 'bat', name: 'Murciélago', hostile: false, health: 6, walk: 3, run: 5, width: 0.5, height: 0.9,
      damage: 0, burnsInSun: false, drops: [], xp: 0, anim: 'flyer', scale: 1, flying: true, parts: bat.parts, atlas: bat.atlas,
    },
    {
      id: MOB_OCELOT, key: 'ocelot', name: 'Ocelote', hostile: false, health: 10, walk: 1.4, run: 4.2, width: 0.6, height: 0.7,
      damage: 3, burnsInSun: false, drops: [], anim: 'quadruped', scale: 1,
      // El modelo del gato sin el collar (los ocelotes no se domestican).
      parts: clone(cat.parts.filter((p) => p.name !== 'collar')), atlas: [cat.atlas[0], cat.atlas[1]],
    },
    {
      id: MOB_MOOSHROOM, key: 'mooshroom', name: 'Champiñaca', hostile: false, health: 10, walk: 1.1, run: 2.4, width: 0.9,
      height: 1.4, damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2], [RAW_BEEF, 1, 3]], anim: 'quadruped', scale: 1,
      sound: 'cow', parts: [...clone(cow.parts), ...mushroomParts()], atlas: [cow.atlas[0], cow.atlas[1]],
    },
    {
      id: MOB_TRADER_LLAMA, key: 'trader_llama', name: 'Llama de comerciante', hostile: false, neutral: true, health: 20,
      walk: 1.2, run: 2.8, width: 0.9, height: 1.87, damage: 1, burnsInSun: false, drops: [[LEATHER, 0, 2]], anim: 'quadruped',
      scale: llama.scale,
      // La manta del comerciante: una funda sobre el lomo (algo más grande que el cuerpo).
      parts: [...clone(llama.parts), { name: 'decor', parent: 'body', pivot: [0, 0, 0], from: [-6.5, 4.5, -9.5], size: [13, 6, 19], uv: [0, 64] }],
      atlas: [llama.atlas[0], 96],
    },
    horseLike({
      id: MOB_SKELETON_HORSE, key: 'skeleton_horse', name: 'Caballo esqueleto', hostile: false, health: 15, walk: 1.4, run: 3.4,
      width: 1.3, height: 1.6, damage: 0, burnsInSun: false, drops: [[BONE, 0, 2]], anim: 'quadruped', scale: 1,
    }),
    horseLike({
      id: MOB_ZOMBIE_HORSE, key: 'zombie_horse', name: 'Caballo zombi', hostile: false, health: 15, walk: 1.4, run: 3.4,
      width: 1.3, height: 1.6, damage: 0, burnsInSun: false, drops: [[ROTTEN_FLESH, 0, 2]], anim: 'quadruped', scale: 1,
    }),
  ];
}
