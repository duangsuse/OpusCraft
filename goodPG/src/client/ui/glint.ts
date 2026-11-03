// Fase 7 (encantamientos): brillo animado de los objetos encantados en las ranuras de la interfaz (barra,
// inventario, cursor, creativo, comercio, mesa, yunque y afiladora).
import './glint.css';
import { hasGlint } from '../../shared/enchantments';
import type { ItemStack } from '../../shared/items';

/** Pone o quita el brillo en el elemento del icono (`url`: la imagen del icono, que recorta el brillo). */
export function paintGlint(ico: HTMLElement, s: ItemStack | null | undefined, url: string | undefined): void {
  const on = !!url && hasGlint(s);
  ico.classList.toggle('glint', on);
  if (on) ico.style.setProperty('--glint-mask', `url(${url})`);
  else ico.style.removeProperty('--glint-mask');
}

/** Atributos para un icono escrito como HTML (clase y máscara del brillo). */
export function glintAttrs(s: ItemStack | null | undefined, url: string | undefined): { cls: string; style: string } {
  return url && hasGlint(s) ? { cls: ' glint', style: `;--glint-mask:url(${url})` } : { cls: '', style: '' };
}
