// Saqueadores e illagers (fase 6): saqueador, vindicador, evocador, vex, devastador y los colmillos
// del evocador. Aquí van sus ids, estadísticas, botín y modelos por cajas; mobs.ts los registra y
// sim/entities/illagers.ts les da comportamiento. Las UV se reparten solas (packParts).
import type { MobDef } from './mobs';
import { packParts } from './aquaticMobs';
import { ARROW, EMERALD, SADDLE, TOTEM_OF_UNDYING } from './items';

export const MOB_PILLAGER = 60;
export const MOB_VINDICATOR = 61;
export const MOB_EVOKER = 62;
export const MOB_VEX = 63;
export const MOB_RAVAGER = 64;
/** Colmillos del evocador: salen del suelo, muerden una vez y desaparecen (sin IA ni vida). */
export const MOB_EVOKER_FANGS = 65;

/** Criaturas de los asaltos (no se hacen daño entre ellas y no desaparecen durante un asalto). */
export function isRaider(type: number): boolean {
  return type >= MOB_PILLAGER && type <= MOB_RAVAGER;
}

/** Illagers con cabeza de aldeano (los que pueden ser capitanes llevan el estandarte). */
export function isIllager(type: number): boolean {
  return type === MOB_PILLAGER || type === MOB_VINDICATOR || type === MOB_EVOKER;
}

type Base = Omit<MobDef, 'parts' | 'atlas'>;
type Spec = Parameters<typeof packParts>[1][number];

/** Cuerpo de illager: cabeza alargada con nariz, torso con chaqueta, brazos y piernas. */
function illagerSpecs(): Spec[] {
  return [
    { name: 'head', pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8] },
    { name: 'nose', parent: 'head', pivot: [0, 2, -4], from: [-1, -1, -2], size: [2, 4, 2] },
    { name: 'body', pivot: [0, 12, 0], from: [-4, 0, -3], size: [8, 12, 6] },
    { name: 'jacket', parent: 'body', pivot: [0, 0, 0], from: [-4.5, -6, -3.5], size: [9, 18, 7] },
    { name: 'armR', pivot: [6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4] },
    { name: 'armL', pivot: [-6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4], share: 'armR' },
    { name: 'legR', pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4] },
    { name: 'legL', pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], share: 'legR' },
  ];
}

/** Estandarte ominoso a la espalda de los capitanes (oculto si no lo es). */
function bannerSpecs(): Spec[] {
  return [
    { name: 'bannerPole', parent: 'body', pivot: [0, 0, 4], from: [-0.5, 0, -0.5], size: [1, 28, 1] },
    { name: 'bannerBar', parent: 'bannerPole', pivot: [0, 27, 0], from: [-5.5, 0, -0.5], size: [11, 1, 1] },
    { name: 'banner', parent: 'bannerPole', pivot: [0, 27, 0.5], from: [-5, -20, 0], size: [10, 20, 1] },
  ];
}

function model(base: Base, W: number, specs: Spec[]): MobDef {
  const { parts, atlas } = packParts(W, specs);
  return { ...base, parts, atlas };
}

const illagerBase = { hostile: true, burnsInSun: false, width: 0.6, height: 1.95, anim: 'illager' as const, scale: 0.94, sound: 'illager' };

export const ILLAGER_MOBS: MobDef[] = [
  model({
    ...illagerBase, id: MOB_PILLAGER, key: 'pillager', name: 'Saqueador', health: 24, walk: 1.2, run: 2.8, damage: 2,
    drops: [[ARROW, 0, 2]],
  }, 64, [
    ...illagerSpecs(),
    // Ballesta en la mano derecha: culata hacia delante y el arco atravesado.
    { name: 'crossbow', parent: 'armR', pivot: [0, -9, 0], from: [-0.5, -0.5, -9], size: [1, 1, 10] },
    { name: 'crossbowLimbs', parent: 'crossbow', pivot: [0, 0, -7], from: [-5, -0.5, -0.5], size: [10, 1, 1] },
    ...bannerSpecs(),
  ]),
  model({
    ...illagerBase, id: MOB_VINDICATOR, key: 'vindicator', name: 'Vindicador', health: 24, walk: 1.2, run: 3.3, damage: 13,
    drops: [[EMERALD, 0, 1]],
  }, 64, [
    ...illagerSpecs(),
    // Hacha de hierro: mango hacia delante y la hoja hacia abajo en la punta.
    { name: 'axe', parent: 'armR', pivot: [0, -9, 0], from: [-0.5, -0.5, -9], size: [1, 1, 11] },
    { name: 'axeHead', parent: 'axe', pivot: [0, 0, -8], from: [-0.5, -4, -1], size: [1, 5, 3] },
    ...bannerSpecs(),
  ]),
  model({
    ...illagerBase, id: MOB_EVOKER, key: 'evoker', name: 'Evocador', health: 24, walk: 1.1, run: 2.2, damage: 0,
    drops: [[TOTEM_OF_UNDYING, 1, 1], [EMERALD, 0, 1]],
  }, 64, illagerSpecs()),
  model({
    id: MOB_VEX, key: 'vex', name: 'Vex', hostile: true, burnsInSun: false, health: 14, walk: 3, run: 6.5, width: 0.4, height: 0.8,
    damage: 9, drops: [], anim: 'vex', scale: 0.45, flying: true, sound: 'vex',
  }, 64, [
    { name: 'body', pivot: [0, 14, 0], from: [-4, 0, -2], size: [8, 10, 4] },
    { name: 'head', parent: 'body', pivot: [0, 10, 0], from: [-4, 0, -4], size: [8, 8, 8] },
    { name: 'tail', parent: 'body', pivot: [0, 0, 0], from: [-2, -8, -1.5], size: [4, 8, 3] },
    { name: 'armR', parent: 'body', pivot: [5.5, 9, 0], from: [-1.5, -9, -1.5], size: [3, 10, 3] },
    { name: 'armL', parent: 'body', pivot: [-5.5, 9, 0], from: [-1.5, -9, -1.5], size: [3, 10, 3], share: 'armR' },
    { name: 'sword', parent: 'armR', pivot: [0, -8, 0], from: [-0.5, -0.5, -12], size: [1, 1, 13] },
    { name: 'swordGuard', parent: 'sword', pivot: [0, 0, -1], from: [-2, -0.5, -0.5], size: [4, 1, 1] },
    { name: 'wingR', parent: 'body', pivot: [1.5, 8, 2], from: [0, -10, 0], size: [12, 14, 1], rot: [0, -0.5, 0.2] },
    { name: 'wingL', parent: 'body', pivot: [-1.5, 8, 2], from: [-12, -10, 0], size: [12, 14, 1], rot: [0, 0.5, -0.2], share: 'wingR' },
  ]),
  model({
    id: MOB_RAVAGER, key: 'ravager', name: 'Devastador', hostile: true, burnsInSun: false, health: 100, walk: 1.2, run: 3.1,
    width: 1.95, height: 2.2, damage: 12, drops: [[SADDLE, 1, 1]], anim: 'ravager', scale: 1, sound: 'ravager',
  }, 128, [
    { name: 'body', pivot: [0, 17, 0], from: [-7, 0, -11], size: [14, 15, 23] },
    { name: 'neck', pivot: [0, 26, -10], from: [-5, -6, -9], size: [10, 11, 10] },
    { name: 'head', parent: 'neck', pivot: [0, 0, -9], from: [-8, -9, -12], size: [16, 16, 12] },
    { name: 'jaw', parent: 'head', pivot: [0, -8, -2], from: [-7, -3, -10], size: [14, 3, 11] },
    { name: 'hornR', parent: 'head', pivot: [8, 4, -6], from: [0, -1, -1], size: [5, 2, 2], rot: [0, 0, -0.5] },
    { name: 'hornL', parent: 'head', pivot: [-8, 4, -6], from: [-5, -1, -1], size: [5, 2, 2], rot: [0, 0, 0.5], share: 'hornR' },
    { name: 'leg0', pivot: [-4.5, 17, -7], from: [-3, -17, -3], size: [6, 17, 6] },
    { name: 'leg1', pivot: [4.5, 17, -7], from: [-3, -17, -3], size: [6, 17, 6], share: 'leg0' },
    { name: 'leg2', pivot: [-4.5, 17, 8], from: [-3, -17, -3], size: [6, 17, 6], share: 'leg0' },
    { name: 'leg3', pivot: [4.5, 17, 8], from: [-3, -17, -3], size: [6, 17, 6], share: 'leg0' },
  ]),
  model({
    id: MOB_EVOKER_FANGS, key: 'evoker_fangs', name: 'Colmillos de evocador', hostile: true, burnsInSun: false, health: 1, walk: 0,
    run: 0, width: 0.5, height: 0.8, damage: 6, drops: [], anim: 'fangs', scale: 1, inert: true,
  }, 64, [
    { name: 'base', pivot: [0, 0, 0], from: [-5, 0, -5], size: [10, 2, 10] },
    { name: 'jawA', pivot: [0, 1, 0], from: [-4, 0, -1], size: [8, 12, 2], rot: [0.2, 0, 0] },
    { name: 'jawB', pivot: [0, 1, 0], from: [-4, 0, -1], size: [8, 12, 2], rot: [-0.2, Math.PI, 0], share: 'jawA' },
  ]),
];

/** Ominosa: botella que suelta el capitán y que da Mal presagio al beberla. */
export const OMEN_SECONDS = 100 * 60;
