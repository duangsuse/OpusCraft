// Fase 7.5 (océano): los delfines llevan a los tesoros. Al darle bacalao o salmón crudos, el delfín busca
// el naufragio o las ruinas oceánicas más cercanos y nada hacia allí (el jugador lo sigue); al llegar, o
// si tarda demasiado, vuelve a lo suyo (como en Minecraft).
import { MOB_DOLPHIN } from '../../mobs';
import { COD, SALMON } from '../../items';
import { locateStructure } from '../../world/structures';
import type { Entity, InteractResult } from './types';
import type { Entities } from './Entities';

/** Estructuras a las que guía (Minecraft: la etiqueta «dolphin_located»). */
const GUIDE_TO = ['shipwreck', 'ocean_ruins'];
/** Segundos que insiste antes de rendirse y distancia a la que da por llegado. */
const GUIDE_SECONDS = 60;
const ARRIVED = 6;

interface Guide {
  x: number;
  y: number;
  z: number;
  left: number;
}

export class DolphinGuide {
  private guides = new WeakMap<Entity, Guide>();

  constructor(private m: Entities) {}

  /** Darle pescado crudo a un delfín: se lo come y busca a dónde llevarte. */
  feed(e: Entity, item: number): InteractResult | null {
    if (e.type !== MOB_DOLPHIN || (item !== COD && item !== SALMON) || e.dead || !e.ai) return null;
    this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
    const gen = this.m.w.gen;
    let best: [number, number, number] | null = null, bd = Infinity;
    for (const key of GUIDE_TO) {
      const p = locateStructure(gen, key, Math.floor(e.x), Math.floor(e.z), 4);
      const d = p ? Math.hypot(p[0] - e.x, p[2] - e.z) : Infinity;
      if (p && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) this.guides.set(e, { x: best[0] + 0.5, y: best[1] + 2, z: best[2] + 0.5, left: GUIDE_SECONDS });
    return { ok: true, take: 1 };
  }

  /** Rumbo del delfín hacia su destino (normalizado) o null si no está guiando. */
  heading(e: Entity, dt: number): [number, number, number] | null {
    const g = this.guides.get(e);
    if (!g) return null;
    g.left -= dt;
    const dx = g.x - e.x, dy = g.y - e.y, dz = g.z - e.z;
    const d = Math.hypot(dx, dz);
    if (g.left <= 0 || d < ARRIVED) {
      this.guides.delete(e);
      if (d < ARRIVED) this.m.host.fx('dolphin_arrived', e.x, e.y + e.height, e.z, e.type);
      return null;
    }
    // Horizontal hacia el destino; baja poco a poco hacia el fondo al acercarse.
    const vy = d < 24 ? dy * 0.5 : 0;
    const l = Math.hypot(dx, dz, vy) || 1;
    return [dx / l, vy / l, dz / l];
  }

  /** ¿Está guiando a alguien? */
  guiding(e: Entity): boolean {
    return this.guides.has(e);
  }
}
