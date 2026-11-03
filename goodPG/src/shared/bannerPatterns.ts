// Fase 6.5 (libros y estandartes): dibujos de los estandartes y el telar. Un estandarte lleva hasta 6
// capas [dibujo, color] encima de su color de fondo. En el telar se pone el estandarte, un tinte y, si
// se quiere, un diseño de estandarte; se elige el dibujo y sale el estandarte con una capa más del color
// del tinte (se gastan el estandarte y el tinte; el diseño no). Sin diseño se eligen los dibujos básicos;
// con uno, sólo el suyo. Fase 8.4: el del hocico (piglin), de los bastiones; los de las cámaras de desafío no están.
//
// El índice de cada dibujo en BANNER_PATTERNS se guarda en los mundos: sólo se añaden al final.
import { DYES, BANNER_PATTERN_ITEMS, type ItemStack } from './items';
import { BANNERS, DYE_COLORS, COLOR_NAMES, baseBlock, type DyeColor } from './blocks';

export interface BannerPattern {
  key: string;
  /** Nombre del dibujo (en la lista del telar y en la descripción del estandarte). */
  name: string;
  /** Diseño de estandarte que hace falta en el telar (sin él, es un dibujo básico). */
  item?: number;
}

/** Capa de un estandarte: [índice del dibujo, índice del color en DYE_COLORS]. */
export type BannerLayer = [pattern: number, color: number];

/** Capas que caben en un estandarte. */
export const MAX_BANNER_LAYERS = 6;

export const BANNER_PATTERNS: readonly BannerPattern[] = [
  { key: 'stripe_bottom', name: '底横条' },
  { key: 'stripe_top', name: '顶横条' },
  { key: 'stripe_left', name: '左竖条' },
  { key: 'stripe_right', name: '右竖条' },
  { key: 'stripe_center', name: '中竖条' },
  { key: 'stripe_middle', name: '中横条' },
  { key: 'stripe_downright', name: '右斜条' },
  { key: 'stripe_downleft', name: '左斜条' },
  { key: 'small_stripes', name: '竖条纹' },
  { key: 'cross', name: '斜十字' },
  { key: 'straight_cross', name: '正十字' },
  { key: 'triangle_bottom', name: '底三角' },
  { key: 'triangle_top', name: '顶三角' },
  { key: 'triangles_bottom', name: '底锯齿' },
  { key: 'triangles_top', name: '顶锯齿' },
  { key: 'diagonal_left', name: '左上半对角' },
  { key: 'diagonal_right', name: '右下半对角' },
  { key: 'diagonal_up_left', name: '左下半对角' },
  { key: 'diagonal_up_right', name: '右上半对角' },
  { key: 'circle', name: '中圆' },
  { key: 'rhombus', name: '中菱形' },
  { key: 'half_vertical', name: '左半' },
  { key: 'half_vertical_right', name: '右半' },
  { key: 'half_horizontal', name: '上半' },
  { key: 'half_horizontal_bottom', name: '下半' },
  { key: 'square_bottom_left', name: '左下角' },
  { key: 'square_bottom_right', name: '右下角' },
  { key: 'square_top_left', name: '左上角' },
  { key: 'square_top_right', name: '右上角' },
  { key: 'border', name: '边框' },
  { key: 'gradient', name: '渐变' },
  { key: 'gradient_up', name: '上渐变' },
  { key: 'bricks', name: '砖纹', item: BANNER_PATTERN_ITEMS.bricks },
  { key: 'curly_border', name: '波纹边', item: BANNER_PATTERN_ITEMS.curly_border },
  { key: 'flower', name: '花朵', item: BANNER_PATTERN_ITEMS.flower },
  { key: 'creeper', name: '苦力怕', item: BANNER_PATTERN_ITEMS.creeper },
  { key: 'skull', name: '骷髅', item: BANNER_PATTERN_ITEMS.skull },
  { key: 'thing', name: 'Mojang标志', item: BANNER_PATTERN_ITEMS.thing },
  { key: 'globe', name: '地球', item: BANNER_PATTERN_ITEMS.globe },
  { key: 'piglin', name: '猪鼻', item: (BANNER_PATTERN_ITEMS as Record<string, number>).piglin }, // Fase 8.4: de los bastiones
];

/** Color (índice en DYE_COLORS) de cada estandarte (objeto o bloque, de pie o de pared). */
const BANNER_COLOR = new Map<number, number>();
DYE_COLORS.forEach((c, i) => BANNER_COLOR.set(BANNERS[c], i));
/** Color de cada tinte. */
const DYE_COLOR = new Map<number, number>();
DYE_COLORS.forEach((c, i) => DYE_COLOR.set(DYES[c], i));
const PATTERN_ITEM_IDS = new Set<number>(Object.values(BANNER_PATTERN_ITEMS));

/** Índice del color de fondo de un estandarte (-1 si no lo es): objeto o bloque, de pie o de pared. */
export function bannerColor(id: number): number {
  return BANNER_COLOR.get(id) ?? BANNER_COLOR.get(baseBlock(id)) ?? -1;
}

/** ¿Estandarte como objeto (el de pie; los de pared no son objeto)? */
export function isBannerItem(id: number): boolean {
  return BANNER_COLOR.has(id);
}

/** Índice del color de un tinte (-1 si no es tinte). */
export function dyeColor(id: number): number {
  return DYE_COLOR.get(id) ?? -1;
}

export function isBannerPatternItem(id: number): boolean {
  return PATTERN_ITEM_IDS.has(id);
}

export function colorKey(i: number): DyeColor {
  return DYE_COLORS[i] ?? 'white';
}

/** Dibujos que ofrece el telar: con un diseño, el suyo; sin él, los básicos. */
export function loomOptions(patternItem: number): number[] {
  const out: number[] = [];
  BANNER_PATTERNS.forEach((p, i) => {
    if (patternItem ? p.item === patternItem : p.item === undefined) out.push(i);
  });
  return out;
}

/** Capas de una pila de estandarte (vacío si no tiene). */
export function bannerLayers(s: ItemStack | null | undefined): BannerLayer[] {
  return s?.data?.layers ?? [];
}

/**
 * Resultado del telar: el estandarte con una capa más del dibujo `pattern` en el color del tinte, o null
 * si no se puede (falta algo, el dibujo no está en la lista o ya tiene 6 capas).
 */
export function loomResult(
  banner: ItemStack | null, dye: ItemStack | null, patternItem: ItemStack | null, pattern: number,
): ItemStack | null {
  if (!banner || !dye || !isBannerItem(banner.id)) return null;
  const color = dyeColor(dye.id);
  if (color < 0 || !loomOptions(patternItem && isBannerPatternItem(patternItem.id) ? patternItem.id : 0).includes(pattern)) return null;
  const layers = bannerLayers(banner);
  if (layers.length >= MAX_BANNER_LAYERS) return null;
  return { id: banner.id, count: 1, data: { layers: [...layers.map((l): BannerLayer => [l[0], l[1]]), [pattern, color]] } };
}

/** Texto de una capa para la descripción: «Franja inferior (rojo)». */
export function layerName(l: BannerLayer): string {
  const p = BANNER_PATTERNS[l[0]];
  return `${p?.name ?? '?'}（${COLOR_NAMES[colorKey(l[1])][0]}）`;
}
