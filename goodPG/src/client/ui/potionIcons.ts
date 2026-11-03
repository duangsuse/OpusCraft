// Fase 7 (pociones): iconos de las pociones y flechas con efecto de cada tipo (el líquido, o la punta,
// de su color). Se guardan en el mapa de iconos con claves negativas (potionIconKey) al arrancar.
import { ITEM_SPRITES, type ItemStack } from '../../shared/items';
import { POTION_VARIANTS, potionIconKey } from '../textures/potionSprites';
import type { ItemSprites } from '../textures/itemSprites';

export function addPotionIcons(icons: Map<number, string>, sprites: ItemSprites): void {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  POTION_VARIANTS.forEach((v, k) => {
    const layer = ITEM_SPRITES.length + k;
    const key = potionIconKey({ id: v.item, count: 1, dmg: v.type });
    if (key === null || layer >= sprites.count) return;
    const img = g.createImageData(16, 16);
    img.data.set(sprites.rgba.subarray(layer * 1024, layer * 1024 + 1024));
    g.clearRect(0, 0, 16, 16);
    g.putImageData(img, 0, 0);
    icons.set(key, c.toDataURL());
  });
}

/** Icono de una poción con tipo (undefined si la pila no es una de ésas). */
export function potionIconUrl(s: ItemStack, icons: Map<number, string>): string | undefined {
  const key = potionIconKey(s);
  return key === null ? undefined : icons.get(key);
}
