// Tormentas eléctricas: mientras truena caen rayos al azar cerca de los jugadores (en lo más alto
// de la columna, a la intemperie). Un rayo hace 5 de daño y prende a lo que haya a 3 bloques, y
// todos los jugadores ven el destello y oyen el trueno (más tarde cuanto más lejos).
import { Listeners } from './hooks';
import { thunderAt } from '../../weather';
import { MIN_Y } from '../../constants';
import type { ServerContext } from './context';
import type { Entity } from '../entities';

/** Rayos por segundo y jugador con la tormenta en su punto más fuerte. */
const STRIKES_PER_SECOND = 1 / 9;

export class Storms {
  /** Fase 6.5 (cobre): aviso de cada rayo (el punto de impacto, encima del bloque alcanzado). */
  /** Cada rayo que cae (cobre, creepers cargados, fuego, redstone, vibraciones…). */
  readonly strikes = new Listeners<[number, number, number]>();
  /** Fase 7 (redstone): un pararrayos cercano atrae el rayo (devuelve el nuevo punto de impacto). */
  redirect: ((x: number, y: number, z: number) => [number, number, number] | null) | null = null;
  /** Fase 7.5 (fauna): antes de cada rayo natural; true si en su lugar quedó una trampa de esqueletos. */
  natural: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Fase 7.5 (fauna): una criatura alcanzada por un rayo; true si lo resuelve ella (la champiñaca cambia de color). */
  struck: ((e: Entity) => boolean) | null = null;

  constructor(private ctx: ServerContext) {}

  tick(dt: number): void {
    const ctx = this.ctx;
    const th = thunderAt(ctx.worldTime(), ctx.seed);
    if (th <= 0) return;
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & 8 || ctx.rand() > STRIKES_PER_SECOND * th * dt) continue;
      const x = Math.floor(s.p[0] + (ctx.rand() - 0.5) * 96), z = Math.floor(s.p[2] + (ctx.rand() - 0.5) * 96);
      const top = ctx.world.skyTop(x, z);
      if (top < MIN_Y) continue; // sin cargar
      const rod = this.redirect?.(x, top + 1, z); // Fase 7 (redstone)
      if (!rod && this.natural?.(x + 0.5, top + 1, z + 0.5)) continue; // Fase 7.5 (fauna)
      if (rod) this.strike(rod[0], rod[1], rod[2]);
      else this.strike(x + 0.5, top + 1, z + 0.5);
    }
  }

  /** Cae un rayo en (x, y, z). */
  strike(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    ctx.broadcast({ t: 'fx', k: 'lightning', p: [Math.round(x * 100) / 100, y, Math.round(z * 100) / 100] });
    for (const e of ctx.entities.list.values()) {
      if (!e.ai || e.dead || Math.hypot(e.x - x, e.y - y, e.z - z) > 3) continue;
      if (this.struck?.(e)) continue; // Fase 7.5 (fauna)
      ctx.entities.damage(e, 5, x, z, null, 0.3);
      e.fire = Math.max(e.fire, 8);
    }
    for (const s of ctx.sessions()) {
      if (!s.joined || Math.hypot(s.p[0] - x, s.p[1] - y, s.p[2] - z) > 3) continue;
      ctx.entities.host.hurtPlayer(s.id, 5, 0, 0.3, 0, 'lightning');
    }
    this.strikes.emit(x, y, z);
  }
}
