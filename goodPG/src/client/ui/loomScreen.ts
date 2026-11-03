// Fase 6.5 (libros y estandartes): el telar dentro de la pantalla de inventario. Tres huecos (estandarte,
// tinte y, si se quiere, un diseño de estandarte), la lista de dibujos que se pueden hacer (cada botón
// muestra el dibujo con el color del tinte sobre el del estandarte), la vista previa del resultado y la
// salida. Coger la salida gasta un estandarte y un tinte; el diseño se queda.
import './loom.css';
import {
  BANNER_PATTERNS, loomOptions, loomResult, bannerColor, bannerLayers, dyeColor, isBannerPatternItem, MAX_BANNER_LAYERS,
} from '../../shared/bannerPatterns';
import type { ItemStack } from '../../shared/items';
import { bannerFrontUrl } from './bannerIcons';

/** Huecos del telar en la cuadrícula de la pantalla. */
export const LOOM_BANNER = 0;
export const LOOM_DYE = 1;
export const LOOM_PATTERN = 2;

/** Colores de muestra de los botones cuando falta el estandarte (gris claro) o el tinte (negro). */
const SAMPLE_BASE = 8, SAMPLE_DYE = 15;

export const LOOM_HTML =
  '<h3>Telar</h3><div class="loom">' +
  `<div class="loom-in"><div class="slot2" data-s="grid:${LOOM_BANNER}" data-hint="Estandarte"></div>` +
  `<div class="slot2" data-s="grid:${LOOM_DYE}" data-hint="Tinte"></div>` +
  `<div class="slot2" data-s="grid:${LOOM_PATTERN}" data-hint="Diseño"></div></div>` +
  '<div class="loom-list"></div>' +
  '<div class="loom-preview"><img alt=""></div>' +
  '<div class="arrow"></div><div class="slot2 big" data-s="out"></div></div>';

export class LoomPanel {
  /** Dibujo elegido (índice en BANNER_PATTERNS) o -1. */
  pattern = -1;

  reset(): void {
    this.pattern = -1;
  }

  options(grid: readonly (ItemStack | null)[]): number[] {
    const p = grid[LOOM_PATTERN];
    return loomOptions(p && isBannerPatternItem(p.id) ? p.id : 0);
  }

  result(grid: readonly (ItemStack | null)[]): ItemStack | null {
    if (!this.options(grid).includes(this.pattern)) return null;
    return loomResult(grid[LOOM_BANNER], grid[LOOM_DYE], grid[LOOM_PATTERN], this.pattern);
  }

  /** Coger la salida: un estandarte y un tinte menos (el diseño no se gasta). */
  consume(grid: (ItemStack | null)[]): void {
    for (const i of [LOOM_BANNER, LOOM_DYE]) {
      const s = grid[i];
      if (!s) continue;
      grid[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
    }
  }

  /** Elegir un dibujo (desde un botón de la lista). */
  pick(i: number, grid: readonly (ItemStack | null)[]): boolean {
    if (!this.options(grid).includes(i)) return false;
    this.pattern = i;
    return true;
  }

  /** Lista de dibujos y vista previa. */
  render(panel: HTMLElement, grid: readonly (ItemStack | null)[]): void {
    const list = panel.querySelector('.loom-list') as HTMLElement | null;
    const preview = panel.querySelector('.loom-preview img') as HTMLImageElement | null;
    if (!list || !preview) return;
    const banner = grid[LOOM_BANNER], dye = grid[LOOM_DYE];
    const base = banner ? bannerColor(banner.id) : -1;
    const color = dye ? dyeColor(dye.id) : -1;
    const opts = this.options(grid);
    if (!opts.includes(this.pattern)) this.pattern = -1;
    const full = bannerLayers(banner).length >= MAX_BANNER_LAYERS;
    const ready = base >= 0 && color >= 0 && !full;
    const key = `${opts.join(',')}|${base}|${color}|${this.pattern}|${ready}`;
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.classList.toggle('off', !ready);
      const b = base >= 0 ? base : SAMPLE_BASE, c = color >= 0 ? color : SAMPLE_DYE;
      list.innerHTML = opts.map((i) => {
        const url = bannerFrontUrl(b, [[i, c]]);
        return `<button type="button" class="loom-pat${i === this.pattern ? ' sel' : ''}" data-loom="${i}" title="${BANNER_PATTERNS[i].name}">` +
          `<i style="background-image:url(${url})"></i></button>`;
      }).join('');
    }
    // Vista previa: el resultado si lo hay; si no, el estandarte tal como está.
    const res = this.result(grid);
    const show = res ?? banner;
    const src = show && base >= 0 ? bannerFrontUrl(base, bannerLayers(show)) : '';
    if (preview.getAttribute('src') !== src) {
      if (src) preview.setAttribute('src', src);
      else preview.removeAttribute('src');
    }
    preview.parentElement!.classList.toggle('empty', !src);
    preview.parentElement!.title = full ? 'Ya tiene 6 capas: no caben más' : '';
  }
}
