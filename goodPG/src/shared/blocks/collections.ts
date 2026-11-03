// Fase 6.5 (colecciones): cabezas de criaturas, tocadiscos y el modelo del marco brillante.
//
// Las cabezas son un cubo de 8×8×8 píxeles. En el suelo tienen 16 orientaciones (de 22,5° en 22,5°,
// mirando a quien las pone) y en la pared, 4. Como los modelos de cajas sólo giran de 90° en 90°, el
// modelo es siempre el mismo cubo centrado en el bloque y el mallador lo gira y lo desplaza con
// `skullPose` (hacia el suelo o hacia la pared). Así cada cara de la cabeza toma siempre el mismo
// trozo de su textura: el cuadrado central de 8×8.
// Se registra la última (export * al final de index.ts): no mueve ningún id guardado.
import { family, familyBase, stateOf, stateProps, L, R_MODEL } from './registry';
import { mbox, rotateFlat, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

/** Tipos de cabeza de la fase 6.5 (el orden es el del inventario creativo). */
export const SKULL_KINDS = ['zombie', 'skeleton', 'creeper', 'player'] as const;
/** Fase 8.3 (criaturas del Nether): el cráneo de esqueleto wither y la cabeza de piglin (registrados al final). */
export type SkullKind = (typeof SKULL_KINDS)[number] | 'wither_skeleton' | 'piglin' | 'dragon'; // Fase 8.6: la de dragón
/** Todos los tipos de cabeza registrados (los de la fase 6.5 y los que se añaden después con registerSkull). */
export const ALL_SKULL_KINDS: SkullKind[] = [];

const SKULL_NAMES: Readonly<Record<SkullKind, string>> = {
  zombie: 'Cabeza de zombi',
  skeleton: 'Cráneo de esqueleto',
  creeper: 'Cabeza de creeper',
  player: 'Cabeza de jugador',
  wither_skeleton: 'Cráneo de esqueleto wither',
  piglin: 'Cabeza de piglin',
  dragon: 'Cabeza de dragón',
};

/** Caras de una cabeza (su derecha es +X cuando mira al norte, −Z). */
export const SKULL_FACES = ['right', 'left', 'top', 'bottom', 'back', 'front'] as const;
export type SkullFace = (typeof SKULL_FACES)[number];

/** Textura de una cara de una cabeza. */
export function skullTexture(kind: SkullKind, face: SkullFace): string {
  return `${kind}_head_${face}`;
}

/** Nombres de todas las texturas de las cabezas (para textureDefs; Fase 8.3: registerSkull añade las nuevas). */
export const SKULL_TEXTURES: string[] = [];

/** El cubo de la cabeza, centrado en el bloque, mirando al norte (caras +X, −X, +Y, −Y, +Z, −Z). */
function skullBoxes(kind: SkullKind): ModelBox[] {
  return [mbox(4, 4, 4, 12, 12, 12, SKULL_FACES.map((f) => L(skullTexture(kind, f))))];
}

/** Cabeza en el suelo (el objeto) y en la pared de cada tipo. */
export const SKULLS = {} as Record<SkullKind, number>;
export const WALL_SKULLS = {} as Record<SkullKind, number>;
/** Cabeza del suelo → la de pared del mismo tipo. */
export const SKULL_WALL_OF: Record<number, number> = {};

/**
 * Cómo dibujar cada estado de cabeza: [coseno, seno, dx, dy, dz] (desplazamiento en dieciseisavos).
 * El giro lleva el norte hacia el este, como rotateBoxes.
 */
const POSE: (readonly number[] | undefined)[] = [];
const KIND_OF = new Map<number, SkullKind>();

/**
 * Registra un tipo de cabeza (en el suelo y en la pared). `boxes`: el modelo mirando al norte y centrado en el
 * bloque (el cubo de 8×8×8 si no se da; la cabeza de piglin es más ancha y tiene hocico y orejas).
 * Fase 8.3: las cabezas nuevas se registran al final (blocks/netherMobBlocks.ts), así no mueven ningún id.
 */
export function registerSkull(kind: SkullKind, boxes: ModelBox[] = skullBoxes(kind), halfWidth = 4): void {
  ALL_SKULL_KINDS.push(kind);
  SKULL_TEXTURES.push(...SKULL_FACES.map((f) => skullTexture(kind, f)));
  const common = {
    render: R_MODEL, solid: true, opaque: false, lightOpacity: 0, hardness: 1, sound: 'stone' as const,
    all: skullTexture(kind, 'left'), itemModel: boxes,
  };
  const lo = (8 - halfWidth) / 16, hi = (8 + halfWidth) / 16;
  const floorBox = [lo, 0, 4 / 16, hi, 8 / 16, 12 / 16];
  SKULLS[kind] = family(`${kind}_head`, SKULL_NAMES[kind], [['rot', 16]], () => ({
    ...common, category: 'decoracion', model: boxes, selection: floorBox, collision: floorBox,
  }));
  WALL_SKULLS[kind] = family(`${kind}_wall_head`, SKULL_NAMES[kind], [['facing', 4]], (st) => {
    const box = rotateFlat([lo, 4 / 16, 8 / 16, hi, 12 / 16, 1], st.facing);
    return { ...common, category: null, model: boxes, selection: box, collision: box, wall: st.facing, base: SKULLS[kind] };
  });
  SKULL_WALL_OF[SKULLS[kind]] = WALL_SKULLS[kind];
  for (let r = 0; r < 16; r++) {
    const a = (r * Math.PI) / 8;
    POSE[SKULLS[kind] + r] = [Math.cos(a), Math.sin(a), 0, -4, 0];
    KIND_OF.set(SKULLS[kind] + r, kind);
  }
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    // Pegada a la pared, que está detrás (al contrario de hacia donde mira).
    POSE[WALL_SKULLS[kind] + f] = [Math.round(Math.cos(a)), Math.round(Math.sin(a)), -DIR_X[f] * 4, 0, -DIR_Z[f] * 4];
    KIND_OF.set(WALL_SKULLS[kind] + f, kind);
  }
}

for (const kind of SKULL_KINDS) registerSkull(kind);

/** Giro y desplazamiento con los que el mallador dibuja una cabeza (undefined si no lo es). */
export function skullPose(id: number): readonly number[] | undefined {
  return POSE[id];
}

/** Tipo de cabeza de un bloque (en el suelo o en la pared) o del objeto; undefined si no es cabeza. */
export function skullKind(id: number): SkullKind | undefined {
  return KIND_OF.get(id);
}

export function isSkull(id: number): boolean {
  return KIND_OF.has(id);
}

/** Orientación (0..15) de una cabeza en el suelo que mira a un jugador con ese yaw. */
export function skullRotationFor(yaw: number): number {
  return ((Math.round((Math.PI - yaw) / (Math.PI / 8)) % 16) + 16) % 16;
}

/**
 * Estado de cabeza que coloca el objeto `base` al usarlo sobre una cara ('up', 'down' o 'side', con la
 * normal nx, nz): -1 si no es una cabeza, 0 si ahí no se puede (en el techo).
 */
export function skullPlacement(base: number, face: 'up' | 'down' | 'side', nx: number, nz: number, yaw: number): number {
  const wall = SKULL_WALL_OF[base];
  if (wall === undefined) return -1;
  if (face === 'down') return 0;
  if (face === 'side') {
    const f = nz < 0 ? 0 : nx > 0 ? 1 : nz > 0 ? 2 : 3;
    return stateOf(wall, { facing: f });
  }
  return stateOf(base, { rot: skullRotationFor(yaw) });
}

// ------------------------------------------------------------------ tocadiscos

/** Tocadiscos: `disc` 1 cuando tiene un disco dentro (qué disco lo sabe el servidor). */
export const JUKEBOX = family('jukebox', 'Tocadiscos', [['disc', 2]], () => ({
  side: 'jukebox_side', top: 'jukebox_top', bottom: 'jukebox_bottom', hardness: 2, tool: 'axe', sound: 'wood',
  category: 'decoracion',
}));

export function isJukebox(id: number): boolean {
  return familyBase(id) === JUKEBOX;
}

/** ¿Tiene un disco dentro? */
export function jukeboxHasDisc(id: number): boolean {
  return isJukebox(id) && stateProps(id)!.disc === 1;
}

export function jukeboxWith(disc: boolean): number {
  return stateOf(JUKEBOX, { disc: disc ? 1 : 0 });
}

// ------------------------------------------------------------------ marco brillante

/** Bloque oculto con el que se dibuja el marco brillante (como ITEM_FRAME_MODEL). */
export const GLOW_ITEM_FRAME_MODEL = family('glow_item_frame_model', 'Marco brillante', [], () => ({
  tex: ['birch_planks', 'birch_planks', 'birch_planks', 'birch_planks', 'glow_item_frame', 'birch_planks'], noItem: true,
  category: null, hardness: 0, sound: 'wood',
}));

/** Bloques de las colecciones en el orden del inventario creativo. */
export const COLLECTION_INVENTORY: readonly number[] = [...SKULL_KINDS.map((k) => SKULLS[k]), JUKEBOX];
