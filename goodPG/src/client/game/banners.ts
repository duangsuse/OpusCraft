// Fase 6.5 (libros y estandartes): estandartes con dibujos en el cliente. Las capas de cada uno (las
// manda el servidor al entrar y cuando cambian) y la lista de los cercanos que hay que dibujar.
import { BLOCK_WALL, isBanner, stateProps } from '../../shared/blocks';
import { bannerColor, type BannerLayer } from '../../shared/bannerPatterns';
import { sanitizeLayers } from '../../shared/itemData';
import type { BannerDraw } from '../render/BannerRenderer';

/** Distancia a la que se dibujan los dibujos (más lejos se ve la tela lisa). */
const BANNER_RANGE = 48;

export class BannerLayers {
  private layers = new Map<string, BannerLayer[]>();

  get(x: number, y: number, z: number): BannerLayer[] {
    return this.layers.get(`${x},${y},${z}`) ?? [];
  }

  set(x: number, y: number, z: number, raw: unknown): void {
    const l = sanitizeLayers(raw);
    const k = `${x},${y},${z}`;
    if (l) this.layers.set(k, l);
    else this.layers.delete(k);
  }

  clear(): void {
    this.layers.clear();
  }

  /** Estandartes con dibujos cerca de la cámara (y que siguen siendo estandartes). */
  draws(getBlock: (x: number, y: number, z: number) => number, camX: number, camY: number, camZ: number): BannerDraw[] {
    const out: BannerDraw[] = [];
    for (const [k, layers] of this.layers) {
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x + 0.5 - camX) > BANNER_RANGE || Math.abs(y + 0.5 - camY) > BANNER_RANGE || Math.abs(z + 0.5 - camZ) > BANNER_RANGE) continue;
      const id = getBlock(x, y, z);
      if (!isBanner(id)) continue;
      out.push({ x, y, z, facing: stateProps(id)!.facing, wall: BLOCK_WALL[id] >= 0, base: bannerColor(id), layers });
    }
    return out;
  }
}
