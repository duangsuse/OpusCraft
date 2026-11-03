// Fase 6.5 (libros y estandartes): iconos de los estandartes. Se ven de frente, como en Minecraft (el
// isométrico del modelo dejaba la tela en una tira de pocos píxeles): el travesaño de madera y la tela
// con su color y sus capas. Los lisos se cambian en el mapa de iconos al arrancar (así salen iguales en
// todas partes); los que tienen dibujos se componen al pedirlos y se guardan. También la imagen de la
// tela sola (vista previa del telar y botones de sus dibujos).
import { ITEMS, type ItemStack } from '../../shared/items';
import { bannerColor, bannerLayers, type BannerLayer } from '../../shared/bannerPatterns';
import { bannerPixels, BANNER_W, BANNER_H } from '../render/bannerArt';
import { potionIconUrl } from './potionIcons'; // Fase 7 (pociones)
import { shieldIconUrl, dyedIconUrl } from './shieldIcons'; // Fase 7.6: escudos decorados; el cuero teñido

const iconCache = new Map<string, string>();
const frontCache = new Map<string, string>();

function layersKey(base: number, layers: readonly BannerLayer[]): string {
  return `${base}|${layers.map((l) => l.join('.')).join(',')}`;
}

/** Lienzo de frente de la tela (20×40). */
function clothCanvas(base: number, layers: readonly BannerLayer[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = BANNER_W;
  c.height = BANNER_H;
  c.getContext('2d')!.putImageData(new ImageData(bannerPixels(base, layers), BANNER_W, BANNER_H), 0, 0);
  return c;
}

/** Imagen (dataURL) de la tela vista de frente. */
export function bannerFrontUrl(base: number, layers: readonly BannerLayer[]): string {
  const key = layersKey(base, layers);
  let url = frontCache.get(key);
  if (!url) {
    url = clothCanvas(base, layers).toDataURL();
    if (frontCache.size > 512) frontCache.clear();
    frontCache.set(key, url);
  }
  return url;
}

/** Icono de 64×64: travesaño y punta del palo de roble, y la tela (26×52) colgando con un borde oscuro. */
function bannerIcon(base: number, layers: readonly BannerLayer[]): string {
  const key = layersKey(base, layers);
  let url = iconCache.get(key);
  if (url) return url;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // Tela con un contorno de 1 px más oscuro.
  g.fillStyle = 'rgba(20, 14, 8, 0.55)';
  g.fillRect(18, 9, 28, 54);
  g.drawImage(clothCanvas(base, layers), 19, 10, 26, 52);
  // Punta del palo y travesaño (roble: claro arriba, oscuro abajo).
  g.fillStyle = '#5a4128';
  g.fillRect(29, 1, 6, 5);
  g.fillRect(12, 5, 40, 7);
  g.fillStyle = '#b08c56';
  g.fillRect(30, 2, 4, 4);
  g.fillRect(13, 6, 38, 3);
  g.fillStyle = '#8a6b40';
  g.fillRect(13, 9, 38, 2);
  url = cv.toDataURL();
  if (iconCache.size > 256) iconCache.clear();
  iconCache.set(key, url);
  return url;
}

/** Cambia los iconos de los estandartes lisos por los de frente. */
export function prepareBannerIcons(icons: Map<number, string>): void {
  for (const it of ITEMS) {
    if (it && it.block === it.id && bannerColor(it.id) >= 0) icons.set(it.id, bannerIcon(bannerColor(it.id), []));
  }
}

/** Icono de una pila: el de su objeto o, si es un estandarte con dibujos, el suyo propio. */
export function stackIconUrl(s: ItemStack | null | undefined, icons: Map<number, string>): string | undefined {
  if (!s) return undefined;
  const potion = potionIconUrl(s, icons) ?? shieldIconUrl(s) ?? dyedIconUrl(s); // Fase 7 (pociones): con el color de su tipo; 7.6: escudos; el cuero teñido
  if (potion) return potion;
  const layers = bannerLayers(s);
  const base = layers.length ? bannerColor(s.id) : -1;
  return base >= 0 ? bannerIcon(base, layers) : icons.get(s.id);
}
