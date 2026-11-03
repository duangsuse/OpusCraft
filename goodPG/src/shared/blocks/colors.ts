// Fase 6.5 (colores): los 16 colores de Minecraft. Completa la lana y la terracota de color (las que
// ya había conservan su id), y añade alfombras, hormigón y hormigón en polvo (cae como la arena y se
// endurece al tocar agua), cristal de color y sus paneles (translúcidos), terracota esmaltada (con
// orientación), camas de todos los colores, velas (de 1 a 4 por bloque, dan luz 3/6/9/12 encendidas)
// y estandartes lisos (de pie y en la pared). Se registran al final de index.ts: no mueven ningún id.
import {
  family, L, stateOf, stateProps, familyBase, BLOCK_SOLID, R_MODEL, R_TRANSLUCENT, type NeighborGet,
} from './registry';
import { WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL } from './classic';
import { PANE_IDS, paneConnects } from './building';
import { BEDS, SIGN_WALL_OF } from './decoration';
import { COLORED_TERRACOTTA } from './biomes';
import { mbox, rotateBoxes, rotateFlat, flatBoxes, unionBox, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

/** Los 16 colores de Minecraft, en su orden. */
export const DYE_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black',
] as const;
export type DyeColor = (typeof DYE_COLORS)[number];

/** Nombre de cada color: [masculino, femenino] ("Tinte rojo", "Lana roja"). */
export const COLOR_NAMES: Readonly<Record<DyeColor, readonly [string, string]>> = {
  white: ['blanco', 'blanca'], orange: ['naranja', 'naranja'], magenta: ['magenta', 'magenta'],
  light_blue: ['azul claro', 'azul claro'], yellow: ['amarillo', 'amarilla'], lime: ['verde lima', 'verde lima'],
  pink: ['rosa', 'rosa'], gray: ['gris', 'gris'], light_gray: ['gris claro', 'gris claro'], cyan: ['cian', 'cian'],
  purple: ['morado', 'morada'], blue: ['azul', 'azul'], brown: ['marrón', 'marrón'], green: ['verde', 'verde'],
  red: ['rojo', 'roja'], black: ['negro', 'negra'],
};
const masc = (c: DyeColor) => COLOR_NAMES[c][0];
const fem = (c: DyeColor) => COLOR_NAMES[c][1];

/** Suelo firme debajo (alfombras, velas, estandartes de pie). */
const needsFloor = (get: NeighborGet): boolean => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1;
};

// ------------------------------------------------------------------ lana y terracota (completar)

/** Lana de cada color (las ocho clásicas conservan su id). */
export const WOOL: Record<DyeColor, number> = {
  white: WHITE_WOOL, black: BLACK_WOOL, red: RED_WOOL, orange: ORANGE_WOOL, yellow: YELLOW_WOOL, lime: LIME_WOOL,
  blue: BLUE_WOOL, purple: PURPLE_WOOL,
} as Record<DyeColor, number>;
for (const c of DYE_COLORS) {
  if (WOOL[c] !== undefined) continue;
  WOOL[c] = family(`${c}_wool`, `Lana ${fem(c)}`, [], () => ({ all: `${c}_wool`, sound: 'wool', hardness: 0.8, category: 'colores' }));
}

// Terracota de color: las seis de las badlands ya existían; el resto entra en el mismo registro.
for (const c of DYE_COLORS) {
  if (COLORED_TERRACOTTA[c] !== undefined) continue;
  COLORED_TERRACOTTA[c] = family(`${c}_terracotta`, `Terracota ${fem(c)}`, [], () => ({
    all: `${c}_terracotta`, hardness: 1.25, tool: 'pickaxe', tier: 1, category: 'colores',
  }));
}

// ------------------------------------------------------------------ alfombras

/** Alfombra de cada color: una losita de 1/16 de alto que necesita suelo. */
export const CARPETS = {} as Record<DyeColor, number>;
for (const c of DYE_COLORS) {
  CARPETS[c] = family(`${c}_carpet`, `Alfombra ${fem(c)}`, [], () => ({
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.1, sound: 'wool', all: `${c}_wool`, category: 'colores',
    model: [mbox(0, 0, 0, 16, 1, 16, L(`${c}_wool`))], collision: [0, 0, 0, 1, 1 / 16, 1], support: needsFloor,
  }));
}

// ------------------------------------------------------------------ hormigón

export const CONCRETE = {} as Record<DyeColor, number>;
export const CONCRETE_POWDER = {} as Record<DyeColor, number>;
const POWDER_TO_CONCRETE = new Map<number, number>();
for (const c of DYE_COLORS) {
  CONCRETE[c] = family(`${c}_concrete`, `Hormigón ${masc(c)}`, [], () => ({
    all: `${c}_concrete`, hardness: 1.8, tool: 'pickaxe', tier: 1, category: 'colores',
  }));
}
for (const c of DYE_COLORS) {
  CONCRETE_POWDER[c] = family(`${c}_concrete_powder`, `Hormigón en polvo ${masc(c)}`, [], () => ({
    all: `${c}_concrete_powder`, hardness: 0.5, tool: 'shovel', sound: 'sand', category: 'colores',
  }));
  POWDER_TO_CONCRETE.set(CONCRETE_POWDER[c], CONCRETE[c]);
}

/** ¿Hormigón en polvo? (cae como la arena). */
export function isConcretePowder(id: number): boolean {
  return POWDER_TO_CONCRETE.has(id);
}

/** Hormigón en que se convierte un hormigón en polvo al tocar agua (el mismo id si no lo es). */
export function concreteOf(id: number): number {
  return POWDER_TO_CONCRETE.get(id) ?? id;
}

// ------------------------------------------------------------------ cristal de color y paneles

export const STAINED_GLASS = {} as Record<DyeColor, number>;
export const STAINED_GLASS_PANES = {} as Record<DyeColor, number>;
const STAINED_GLASS_IDS = new Set<number>();
for (const c of DYE_COLORS) {
  STAINED_GLASS[c] = family(`${c}_stained_glass`, `Cristal ${masc(c)}`, [], () => ({
    all: `${c}_stained_glass`, render: R_TRANSLUCENT, lightOpacity: 0, hardness: 0.3, sound: 'glass', category: 'colores',
  }));
  STAINED_GLASS_IDS.add(STAINED_GLASS[c]);
  PANE_IDS.add(STAINED_GLASS[c]);
}
for (const c of DYE_COLORS) {
  const name = `${c}_stained_glass`;
  STAINED_GLASS_PANES[c] = family(`${c}_stained_glass_pane`, `Panel de cristal ${masc(c)}`, [], () => {
    const g = L(name);
    const arm = (d: number) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, g)], d);
    const flat = (d: number) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
    return {
      render: R_MODEL, hardness: 0.3, sound: 'glass', all: name, flatItem: name, category: 'colores',
      shape: (get) => {
        const boxes = [mbox(7, 0, 7, 9, 16, 9, g)];
        for (let d = 0; d < 4; d++) if (paneConnects(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
        return boxes;
      },
      collision: (get) => {
        const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
        for (let d = 0; d < 4; d++) if (paneConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...flat(d));
        return out;
      },
    };
  });
  STAINED_GLASS_IDS.add(STAINED_GLASS_PANES[c]);
  PANE_IDS.add(STAINED_GLASS_PANES[c]);
}

/** ¿Cristal o panel de color? */
export function isStainedGlass(id: number): boolean {
  return STAINED_GLASS_IDS.has(id);
}

// ------------------------------------------------------------------ terracota esmaltada

/**
 * Terracota esmaltada: el dibujo tiene simetría de media vuelta, así que basta con girarlo un cuarto
 * de vuelta en las orientaciones este y oeste (la textura sólo se puede girar 90°).
 */
export const GLAZED_TERRACOTTA = {} as Record<DyeColor, number>;
const GLAZED_BASES = new Set<number>();
for (const c of DYE_COLORS) {
  GLAZED_TERRACOTTA[c] = family(`${c}_glazed_terracotta`, `Terracota esmaltada ${fem(c)}`, [['facing', 4]], (st) => ({
    all: `${c}_glazed_terracotta`, hardness: 1.4, tool: 'pickaxe', tier: 1, category: 'colores',
    texRot: st.facing & 1 ? 63 : 0,
  }));
  GLAZED_BASES.add(GLAZED_TERRACOTTA[c]);
}

export function isGlazedTerracotta(id: number): boolean {
  return GLAZED_BASES.has(familyBase(id));
}

// ------------------------------------------------------------------ camas (completar)

for (const c of DYE_COLORS) {
  if (BEDS[c] !== undefined) continue;
  BEDS[c] = family(`${c}_bed`, `Cama ${fem(c)}`, [['facing', 4], ['part', 2]], (st) => {
    const wool = L(`${c}_wool`), pillow = L('white_wool'), wood = L('oak_planks');
    const mattress = mbox(0, 3, 0, 16, 9, 16, [wool, wool, wool, wood, wool, wool]);
    const boxes = st.part === 0
      ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)]
      : [mattress, mbox(1, 9, 1, 15, 11, 7, pillow), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
    return {
      render: R_MODEL, hardness: 0.2, sound: 'wool', all: `${c}_wool`, category: 'decoracion',
      model: rotateBoxes(boxes, st.facing), collision: [0, 0, 0, 1, 9 / 16, 1],
    };
  });
}

// ------------------------------------------------------------------ velas

/** Velas que caben en un bloque. */
export const MAX_CANDLES = 4;
/** Posición (x, z) y altura de cada vela según cuántas hay (en dieciseisavos). */
const CANDLE_SPOTS: readonly (readonly [number, number, number])[][] = [
  [[7, 7, 6]],
  [[5, 7, 6], [9, 6, 5]],
  [[7, 5, 6], [5, 9, 5], [9, 8, 4]],
  [[5, 5, 6], [9, 5, 5], [5, 9, 5], [9, 9, 4]],
];
const CANDLE_BASES = new Set<number>();

function candleFamily(key: string, name: string, bodyTex: string): number {
  const base = family(key, name, [['count', MAX_CANDLES], ['lit', 2]], (st) => {
    const body = L(bodyTex), wick = L('black_concrete'), flame = L('candle_flame');
    const spots = CANDLE_SPOTS[st.count];
    const boxes: ModelBox[] = [];
    const bodies: number[] = [];
    for (const [x, z, h] of spots) {
      boxes.push(mbox(x, 0, z, x + 2, h, z + 2, body), mbox(x, h, z, x + 1, h + 1, z + 1, wick));
      if (st.lit) boxes.push(mbox(x, h + 1, z, x + 1, h + 3, z + 1, flame));
      bodies.push(x / 16, 0, z / 16, (x + 2) / 16, h / 16, (z + 2) / 16);
    }
    return {
      render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.1, sound: 'wool', all: bodyTex, category: 'colores',
      emission: st.lit ? 3 * (st.count + 1) : 0,
      model: boxes, collision: bodies, selection: unionBox(bodies.concat(flatBoxes(boxes.filter((b) => b.tex[0] === wick)))),
      itemModel: [mbox(6, 0, 6, 10, 11, 10, body), mbox(7, 11, 7, 8, 13, 8, wick)],
      support: needsFloor,
    };
  });
  CANDLE_BASES.add(base);
  return base;
}

/** Vela sin teñir. */
export const CANDLE = candleFamily('candle', 'Vela', 'candle');
/** Vela de cada color (la cera usa el color del hormigón). */
export const CANDLES = {} as Record<DyeColor, number>;
for (const c of DYE_COLORS) CANDLES[c] = candleFamily(`${c}_candle`, `Vela ${fem(c)}`, `${c}_concrete`);

/** ¿Vela (cualquier número y estado)? */
export function isCandle(id: number): boolean {
  return CANDLE_BASES.has(familyBase(id));
}

/** Cuántas velas hay en el bloque (0 si no es una vela). */
export function candleCount(id: number): number {
  return isCandle(id) ? stateProps(id)!.count + 1 : 0;
}

export function isLitCandle(id: number): boolean {
  return isCandle(id) && stateProps(id)!.lit === 1;
}

/** Las mismas velas con otro número (1..4) o encendidas o apagadas. */
export function candleState(id: number, count: number, lit: boolean): number {
  return stateOf(familyBase(id), { count: Math.max(1, Math.min(MAX_CANDLES, count)) - 1, lit: lit ? 1 : 0 });
}

/** ¿Poner la vela `item` sobre el bloque `block` añade una más? (misma vela y menos de 4). */
export function canAddCandle(item: number, block: number): boolean {
  return isCandle(item) && familyBase(block) === item && candleCount(block) < MAX_CANDLES;
}

// ------------------------------------------------------------------ estandartes

/** Estandarte de pie de cada color (el objeto) y su versión de pared. */
export const BANNERS = {} as Record<DyeColor, number>;
export const WALL_BANNERS = {} as Record<DyeColor, number>;
const BANNER_BASES = new Set<number>();
for (const c of DYE_COLORS) {
  const common = {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1, tool: 'axe', sound: 'wood', all: `${c}_wool`,
    category: null,
  } as const;
  // De pie: palo de dos bloques con travesaño y la tela colgando por delante (el frente mira a -Z al norte).
  BANNERS[c] = family(`${c}_banner`, `Estandarte ${masc(c)}`, [['facing', 4]], (st) => {
    const w = L(`${c}_wool`), p = L('oak_planks');
    return {
      ...common,
      category: 'colores',
      model: rotateBoxes([
        mbox(7, 0, 7, 9, 16, 9, p), mbox(7, 16, 7, 9, 30, 9, p), mbox(1, 28, 6, 15, 30, 8, p), mbox(1, 3, 5, 15, 28, 6, w),
      ], st.facing),
      itemModel: [mbox(7, 0, 7, 9, 16, 9, p), mbox(2, 14, 6, 14, 15, 8, p), mbox(3, 3, 5, 13, 14, 6, w)],
      selection: rotateFlat([1 / 16, 0, 5 / 16, 15 / 16, 1, 9 / 16], st.facing),
      support: needsFloor,
    };
  });
  // En la pared: travesaño arriba y la tela colgando hasta el bloque de abajo.
  WALL_BANNERS[c] = family(`${c}_wall_banner`, `Estandarte ${masc(c)}`, [['facing', 4]], (st) => {
    const w = L(`${c}_wool`), p = L('oak_planks');
    return {
      ...common,
      model: rotateBoxes([mbox(1, 14, 14, 15, 16, 16, p), mbox(1, -12, 15, 15, 14, 16, w)], st.facing),
      selection: rotateFlat([1 / 16, 0, 13 / 16, 15 / 16, 1, 1], st.facing),
      wall: st.facing, base: BANNERS[c],
    };
  });
  // Se colocan como los carteles: en una pared, colgados; si no, de pie mirando al jugador.
  SIGN_WALL_OF[BANNERS[c]] = WALL_BANNERS[c];
  BANNER_BASES.add(BANNERS[c]);
  BANNER_BASES.add(WALL_BANNERS[c]);
}

/** ¿Estandarte (de pie o de pared)? */
export function isBanner(id: number): boolean {
  return BANNER_BASES.has(familyBase(id));
}

// ------------------------------------------------------------------ botín e inventario

/**
 * Botín especial de los bloques de color (null = el normal): el cristal de color y sus paneles no
 * se recogen (sin toque de seda) y las velas sueltan todas las que hay.
 */
export function colorBlockDrops(block: number): { id: number; count: number }[] | null {
  if (isStainedGlass(block)) return [];
  if (isCandle(block)) return [{ id: familyBase(block), count: candleCount(block) }];
  return null;
}

/**
 * Sitio en el inventario creativo (las camas y las terracotas nuevas ya salen con las demás, porque
 * están en BEDS y COLORED_TERRACOTTA).
 */
export const COLOR_INVENTORY: readonly number[] = [
  ...DYE_COLORS.filter((c) => ![WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL].includes(WOOL[c]))
    .map((c) => WOOL[c]),
  ...DYE_COLORS.map((c) => CARPETS[c]),
  ...DYE_COLORS.map((c) => CONCRETE[c]),
  ...DYE_COLORS.map((c) => CONCRETE_POWDER[c]),
  ...DYE_COLORS.map((c) => STAINED_GLASS[c]),
  ...DYE_COLORS.map((c) => STAINED_GLASS_PANES[c]),
  ...DYE_COLORS.map((c) => GLAZED_TERRACOTTA[c]),
  CANDLE, ...DYE_COLORS.map((c) => CANDLES[c]),
  ...DYE_COLORS.map((c) => BANNERS[c]),
];
