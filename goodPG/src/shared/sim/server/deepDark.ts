// Fase 7.5 (abismo): lo que crea GameServer para el Deep Dark y lo que le avisa.
// - Vibraciones (vibrations.ts) y sculk (sculk.ts): sensores, catalizadores, chilladores y avisos del warden.
// - El warden (sim/entities/warden.ts) oye por el sistema de vibraciones y sale del suelo al invocarlo.
// - Dónde murió cada jugador por última vez (la brújula de recuperación apunta allí): se guarda con el
//   mundo y se le manda al entrar y al morir.
import type { ServerStore } from '../store';
import type { RedstoneApi } from '../../redstone/api';
import type { Entity } from '../entities';
import type { ServerContext, Session } from './context';
import { Vibrations } from './vibrations';
import { Sculk, type WardenTracker } from './sculk';

/** Lo que se guarda: niveles de aviso y últimas muertes, por jugador (nombre en minúsculas). */
interface Saved {
  w?: Record<string, [number, number, number]>;
  d?: Record<string, [number, number, number]>;
}

const META = 'abismo';

export class DeepDark {
  readonly vibrations: Vibrations;
  readonly sculk: Sculk;
  /** Última muerte de cada jugador (nombre en minúsculas). */
  private deaths = new Map<string, [number, number, number]>();
  private dirty = false;

  constructor(private ctx: ServerContext, store: ServerStore, redstone: RedstoneApi) {
    this.vibrations = new Vibrations(ctx, redstone);
    this.sculk = new Sculk(ctx, redstone, this.vibrations);
    const warden = ctx.entities.mobs.warden;
    warden.vibrations = this.vibrations;
    this.sculk.onSummon = (e) => warden.emerge(e);
    ctx.entities.xpEater = (e: Entity) => this.sculk.onMobKilled(e);
    this.load(store.getMeta(META));
  }

  private load(raw: string | null): void {
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Saved;
      const ok = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
      for (const [name, v] of Object.entries(data.w ?? {})) {
        if (!ok(v)) continue;
        const t: WardenTracker = { level: Math.max(0, Math.min(4, v[0] | 0)), since: Math.max(0, v[1] | 0), cooldown: Math.max(0, v[2] | 0) };
        this.sculk.trackers.set(name, t);
      }
      for (const [name, v] of Object.entries(data.d ?? {})) if (ok(v)) this.deaths.set(name, v);
    } catch {
      /* ignorar */
    }
  }

  flush(store: ServerStore): void {
    if (!this.dirty && !this.sculk.dirty) return;
    this.dirty = false;
    this.sculk.dirty = false;
    const w: Record<string, [number, number, number]> = {};
    for (const [name, t] of this.sculk.trackers) if (t.level > 0 || t.cooldown > 0) w[name] = [t.level, t.since, t.cooldown];
    const d: Record<string, [number, number, number]> = {};
    for (const [name, p] of this.deaths) d[name] = p;
    store.setMeta(META, JSON.stringify({ w, d }));
  }

  tick(): void {
    this.vibrations.tick();
    this.sculk.tick();
    // Los niveles de aviso cambian con el tiempo: que se guarden de vez en cuando.
    if (this.ctx.tickCount % (20 * 60) === 0 && this.sculk.trackers.size) this.sculk.dirty = true;
  }

  // ------------------------------------------------------------------ avisos de GameServer

  onBlockChanged(x: number, y: number, z: number, old: number, id: number, actor: string | null): void {
    this.vibrations.onBlockChanged(x, y, z, old, id, actor);
    this.sculk.onBlockChanged(x, y, z, old, id);
  }

  onFx(kind: string, x: number, y: number, z: number, a?: number): void {
    this.vibrations.onFx(kind, x, y, z, a);
  }

  /** Cae un rayo. */
  lightning(x: number, y: number, z: number): void {
    this.vibrations.emit('lightning_strike', x, y, z);
  }

  /** Un jugador muerto suelta `n` de experiencia en (x, y, z): true si se la comió un catalizador. */
  playerXp(x: number, y: number, z: number, n: number): boolean {
    return this.sculk.consumeXp(x, y, z, n);
  }

  /** Muere un jugador: su última muerte (para la brújula de recuperación). */
  onDied(s: Session): void {
    const p: [number, number, number] = [Math.floor(s.p[0]), Math.floor(s.p[1]), Math.floor(s.p[2])];
    this.deaths.set(s.name.toLowerCase(), p);
    this.dirty = true;
    this.ctx.send(s, { t: 'death', p });
    this.vibrations.emit('entity_die', s.p[0], s.p[1] + 0.9, s.p[2], { who: s.id });
  }

  onJoin(s: Session): void {
    const p = this.deaths.get(s.name.toLowerCase());
    if (p) this.ctx.send(s, { t: 'death', p });
  }

  /** Última muerte de un jugador (para las pruebas). */
  deathOf(name: string): [number, number, number] | null {
    return this.deaths.get(name.toLowerCase()) ?? null;
  }
}
