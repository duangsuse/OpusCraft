// Objetos teñibles (DyedItemColor de Java 26.3, etiqueta #dyeable): las cuatro piezas de cuero, la armadura de cuero
// para caballo y la armadura para lobo. El color va en los datos de la pila (`dc`, 0xRRGGBB); sin él, el cuero se ve
// de su marrón de siempre (-6265536 = 0xA06540) y la armadura para lobo, sin la capa teñida.
// - Receta (DyeRecipe, «crafting_dye»): un objeto teñible y uno o más tintes, nada más.
// - Mezcla (DyedItemColor.applyDyes): la media de los canales del color que ya tenía y los de cada tinte, escalada para
//   que el canal más fuerte quede en la media de las intensidades (el canal más fuerte de cada color).
// - El caldero con agua lo lava (CauldronInteraction.DYED_ITEM): se quita el color y baja un nivel.
import { ARMOR, HORSE_ARMOR, WOLF_ARMOR, DYES, type ItemStack } from './items';
import { DYE_COLORS, type DyeColor } from './blocks';

/** Color del cuero sin teñir (DyedItemColor.LEATHER_COLOR). */
export const LEATHER_COLOR = 0xa06540;

/** Color de cada tinte al teñir (DyeColor.textureDiffuseColor). */
export const DYE_DIFFUSE: Readonly<Record<DyeColor, number>> = {
  white: 16383998, orange: 16351261, magenta: 13061821, light_blue: 3847130, yellow: 16701501, lime: 8439583, pink: 15961002,
  gray: 4673362, light_gray: 10329495, cyan: 1481884, purple: 8991416, blue: 3949738, brown: 8606770, green: 6192150,
  red: 11546150, black: 1908001,
};

const DYEABLE = new Set<number>([...Object.values(ARMOR.leather), HORSE_ARMOR.leather, WOLF_ARMOR]);
const DYE_OF = new Map<number, DyeColor>(DYE_COLORS.map((c) => [DYES[c], c]));

/** ¿Se puede teñir el objeto `id`? */
export function isDyeable(id: number): boolean {
  return DYEABLE.has(id);
}

/** Color guardado de una pila teñida (undefined si no lo está). */
export function dyedColor(s: ItemStack | null | undefined): number | undefined {
  return s && isDyeable(s.id) && s.data?.dc !== undefined ? s.data.dc : undefined;
}

/** Color con el que se ve: el teñido o, en el cuero, el de siempre; undefined si no lleva color (el lobo sin teñir). */
export function shownColor(id: number, dc: number | undefined): number | undefined {
  if (dc !== undefined) return dc;
  return isDyeable(id) && id !== WOLF_ARMOR ? LEATHER_COLOR : undefined;
}

/** Color válido que llega de la red o del guardado (undefined si no vale). */
export function sanitizeDyeColor(raw: unknown): number | undefined {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n >= 0 && n <= 0xffffff ? n : undefined;
}

/** DyedItemColor.applyDyes: `s` teñido con `dyes` (una sola unidad). */
export function applyDyes(s: ItemStack, dyes: readonly DyeColor[]): ItemStack {
  let r = 0, g = 0, b = 0, intensity = 0, n = 0;
  const add = (rgb: number) => {
    const cr = (rgb >> 16) & 255, cg = (rgb >> 8) & 255, cb = rgb & 255;
    intensity += Math.max(cr, cg, cb);
    r += cr;
    g += cg;
    b += cb;
    n++;
  };
  const cur = dyedColor(s);
  if (cur !== undefined) add(cur);
  for (const d of dyes) add(DYE_DIFFUSE[d]);
  // Divisiones enteras como en Java (int / int) y el escalado en float truncado.
  let cr = Math.trunc(r / n), cg = Math.trunc(g / n), cb = Math.trunc(b / n);
  const avg = Math.fround(intensity / n);
  const top = Math.max(cr, cg, cb);
  if (top > 0) {
    cr = Math.trunc(Math.fround(Math.fround(cr * avg) / top));
    cg = Math.trunc(Math.fround(Math.fround(cg * avg) / top));
    cb = Math.trunc(Math.fround(Math.fround(cb * avg) / top));
  }
  return { ...s, count: 1, data: { ...(s.data ?? {}), dc: (cr << 16) | (cg << 8) | cb } };
}

/** Receta de teñir: un objeto teñible y uno o más tintes (null si no es esta receta). */
export function dyeArmorCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  let target: ItemStack | null = null;
  const dyes: DyeColor[] = [];
  for (const s of grid) {
    if (!s || s.count <= 0) continue;
    const dye = DYE_OF.get(s.id);
    if (dye) dyes.push(dye);
    else if (isDyeable(s.id) && !target) target = s;
    else return null;
  }
  return target && dyes.length ? applyDyes(target, dyes) : null;
}

/** El caldero con agua quita el color: la pila sin él (null si no estaba teñida). */
export function washDye(s: ItemStack): ItemStack | null {
  if (dyedColor(s) === undefined) return null;
  const data = { ...s.data };
  delete data.dc;
  const out: ItemStack = { ...s, count: 1 };
  if (Object.keys(data).length) out.data = data;
  else delete out.data;
  return out;
}

/** '#rrggbb' de un color. */
export function colorHex(rgb: number): string {
  return '#' + rgb.toString(16).padStart(6, '0');
}
