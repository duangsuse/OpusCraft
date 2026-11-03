// Fase 6.5 (libros y estandartes): estandartes con dibujos. Las capas viajan en la pila del estandarte;
// al colocarlo, el servidor las guarda por posición (con los contenedores, clave 'bn'), las reenvía a
// todos y quien entra las recibe en la bienvenida. Al romperlo, el estandarte que cae las conserva: el
// servidor recuerda las capas del que acaba de desaparecer y se las pone a su objeto al soltarlo.
import { isBanner } from '../../blocks';
import { bannerColor, type BannerLayer } from '../../bannerPatterns';
import { sanitizeLayers } from '../../itemData';
import type { ClientMsg } from '../../protocol';
import type { ItemStack } from '../../items';
import type { Edit } from '../../placement';
import type { ServerStore } from '../store';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext, Session } from './context';

/** Estandartes con dibujos que se envían al entrar (como mucho). */
const MAX_BANNERS = 4000;

export class Banners {
  private layers = new Map<number, BannerLayer[]>();
  private dirty = new Set<number>();
  /** Estandartes con dibujos recién rotos (posición → color y capas) hasta que se suelta su objeto. */
  private broken = new Map<number, { color: number; layers: BannerLayer[] }>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; l?: unknown };
        if (w.k !== 'bn') continue;
        const l = sanitizeLayers(w.l);
        if (l) this.layers.set(key, l);
      } catch {
        /* ignorar */
      }
    }
  }

  /** Capas del estandarte de (x, y, z) (vacío si es liso). */
  layersAt(x: number, y: number, z: number): BannerLayer[] {
    return this.layers.get(posKey(x, y, z)) ?? [];
  }

  /** Se colocó un bloque con 'place': si es un estandarte con dibujos, se guardan sus capas. */
  onPlaced(_s: Session, msg: Extract<ClientMsg, { t: 'place' }>, edits: readonly Edit[]): void {
    const l = sanitizeLayers(msg.l);
    if (!l) return;
    for (const [x, y, z, id] of edits) {
      if (!isBanner(id) || this.ctx.world.getBlock(x, y, z) !== id) continue;
      const k = posKey(x, y, z);
      if (!this.layers.has(k) && this.layers.size >= MAX_BANNERS) return;
      this.layers.set(k, l);
      this.dirty.add(k);
      this.ctx.broadcast({ t: 'banner', x, y, z, l });
      return;
    }
  }

  /** Se quita un estandarte: se olvidan sus capas (y se recuerdan para el objeto que suelte). */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isBanner(old) || isBanner(id)) return;
    const k = posKey(x, y, z);
    const l = this.layers.get(k);
    if (!l) return;
    this.layers.delete(k);
    this.dirty.add(k);
    this.broken.set(k, { color: bannerColor(old), layers: l });
    this.ctx.broadcast({ t: 'banner', x, y, z, l: [] });
  }

  /**
   * Objetos que se sueltan en (x, y, z): si ahí se acaba de romper un estandarte con dibujos, su objeto
   * se lleva las capas. Devuelve las mismas pilas (con los datos puestos).
   */
  decorateDrops(stacks: ItemStack[], x: number, y: number, z: number): ItemStack[] {
    if (this.broken.size === 0) return stacks;
    const k = posKey(Math.floor(x), Math.floor(y), Math.floor(z));
    const b = this.broken.get(k);
    if (!b) return stacks;
    const i = stacks.findIndex((s) => s && !s.data && s.count === 1 && bannerColor(s.id) === b.color);
    if (i < 0) return stacks;
    this.broken.delete(k);
    const out = stacks.slice();
    out[i] = { ...stacks[i], data: { layers: b.layers } };
    return out;
  }

  /** Al final de cada tick: lo roto que no soltó nada (creativo) ya no espera su objeto. */
  endTick(): void {
    this.broken.clear();
  }

  /** Todos los estandartes con dibujos: [x, y, z, capas]. */
  all(): [number, number, number, BannerLayer[]][] {
    return [...this.layers].map(([k, l]) => [keyX(k), keyY(k), keyZ(k), l]);
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const l = this.layers.get(k);
      store.saveContainer(k, l ? JSON.stringify({ k: 'bn', l }) : null);
    }
    this.dirty.clear();
  }
}
