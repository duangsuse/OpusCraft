// Fase 8 (dimensiones): lo que se ve al estar dentro de un portal: un velo violeta y la imagen que se
// retuerce, cada vez más durante los 4 s que tarda el viaje (en creativo el viaje es inmediato). El viaje
// lo decide el servidor; esto sólo mira si el jugador está dentro de un bloque de portal.
import { isNetherPortal } from '../../shared/blocks';
import { PORTAL_TICKS } from '../../shared/dimensions';
import type { Game } from './Game';
import '../ui/portal.css';

const TRAVEL_S = PORTAL_TICKS / 20;

export class PortalFx {
  /** Segundos dentro del portal (baja al salir). */
  private t = 0;
  private el: HTMLDivElement | null = null;

  /** Cuánto se nota (0..1): distorsión de la imagen y velo. */
  get warp(): number {
    return Math.min(1, this.t / TRAVEL_S);
  }

  update(g: Game, dt: number): void {
    const w = g.world;
    const p = g.player;
    const inside = !!w && !g.survival.dead
      && (isNetherPortal(w.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))
        || isNetherPortal(w.getBlock(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z))));
    this.t = inside ? Math.min(TRAVEL_S, this.t + dt) : Math.max(0, this.t - dt * 2.5);
    if (this.t > 0 || this.el) {
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.id = 'portal-veil';
        document.body.appendChild(this.el);
      }
      this.el.style.opacity = String(this.warp * 0.85);
    }
  }

  /** Al llegar a otra dimensión el velo se va solo (el jugador sigue dentro del portal de llegada). */
  reset(): void {
    this.t = 0;
    if (this.el) this.el.style.opacity = '0';
  }

  dispose(): void {
    this.el?.remove();
    this.el = null;
  }
}
