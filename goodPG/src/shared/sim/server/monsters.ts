// Fase 6 (monstruos): lo que los monstruos nuevos necesitan del servidor.
// - Insomnio: cada jugador lleva la cuenta del tiempo que pasa sin dormir (se reinicia al acostarse
//   en una cama y al morir, y se guarda). A partir de tres días, de noche y a cielo abierto, pueden
//   aparecer phantoms sobre él (más probable cuanto más tiempo lleve despierto).
// - Bloques infestados: al romperse (a mano, por una explosión o porque los despierta otra lepisma)
//   sale una lepisma.
import { MOB_PHANTOM, MOB_SILVERFISH } from '../../mobs';
import { AIR, BLOCK_SOLID, isInfested } from '../../blocks';
import { DAY_LENGTH_SECONDS, MAX_Y } from '../../constants';
import { STATE_DEAD } from '../../protocol';
import type { ServerStore } from '../store';
import type { ServerContext } from './context';

/** Segundos sin dormir a partir de los cuales pueden aparecer phantoms (tres días del juego). */
export const INSOMNIA_SECONDS = 3 * DAY_LENGTH_SECONDS;
const META_KEY = 'insomnia';

export class Monsters {
  /** Segundos sin dormir por jugador (nombre en minúsculas). */
  private awake = new Map<string, number>();
  /** Segundos hasta el próximo intento de phantoms por jugador. */
  private nextTry = new Map<string, number>();
  private dirty = false;

  constructor(private ctx: ServerContext, store: ServerStore) {
    try {
      const raw = JSON.parse(store.getMeta(META_KEY) ?? '{}') as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) this.awake.set(k, Math.min(n, INSOMNIA_SECONDS * 10));
      }
    } catch {
      /* ignorar */
    }
  }

  /** Segundos que lleva sin dormir un jugador. */
  insomnia(name: string): number {
    return this.awake.get(name.toLowerCase()) ?? 0;
  }

  setInsomnia(name: string, seconds: number): void {
    this.awake.set(name.toLowerCase(), Math.max(0, seconds));
    this.dirty = true;
  }

  /** Llamar una vez por segundo. */
  tick(): void {
    const ctx = this.ctx;
    const night = ctx.entities.host.sunHeight() < -0.02;
    for (const s of ctx.sessions()) {
      if (!s.joined) continue;
      const key = s.name.toLowerCase();
      if (s.sleeping !== null || s.s & STATE_DEAD) {
        if (this.awake.get(key)) {
          this.awake.set(key, 0);
          this.dirty = true;
        }
        continue;
      }
      const t = (this.awake.get(key) ?? 0) + 1;
      this.awake.set(key, t);
      this.dirty = true;
      // Un intento cada 60–120 s, como en Minecraft.
      const wait = (this.nextTry.get(key) ?? 60 + ctx.rand() * 60) - 1;
      if (wait > 0) {
        this.nextTry.set(key, wait);
        continue;
      }
      this.nextTry.set(key, 60 + ctx.rand() * 60);
      if (t >= INSOMNIA_SECONDS && night && s.mode !== 'c' && ctx.difficulty > 0 && ctx.rand() * t >= INSOMNIA_SECONDS) {
        this.spawnPhantoms(s.p[0], s.p[1], s.p[2]);
      }
    }
  }

  /** Phantoms (de 1 a 1 + dificultad) entre 20 y 34 bloques sobre un jugador a cielo abierto. */
  spawnPhantoms(x: number, y: number, z: number): number {
    const ctx = this.ctx;
    const w = ctx.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    if (w.skyTop(bx, bz) > Math.floor(y) + 1) return 0;
    const n = 1 + Math.floor(ctx.rand() * (1 + ctx.difficulty));
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const sx = x + (ctx.rand() - 0.5) * 10, sz = z + (ctx.rand() - 0.5) * 10;
      const sy = Math.min(MAX_Y - 4, y + 20 + ctx.rand() * 14);
      const b = w.getBlock(Math.floor(sx), Math.floor(sy), Math.floor(sz));
      if (b < 0 || BLOCK_SOLID[b]) continue;
      if (ctx.entities.spawnMob(MOB_PHANTOM, sx, sy, sz)) spawned++;
    }
    return spawned;
  }

  /** Un bloque infestado que desaparece suelta su lepisma. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isInfested(old) || isInfested(id) || this.ctx.difficulty === 0) return;
    if (id !== AIR && BLOCK_SOLID[id]) return;
    this.ctx.entities.spawnMob(MOB_SILVERFISH, x + 0.5, y, z + 0.5);
  }

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    const out: Record<string, number> = {};
    for (const [k, v] of this.awake) if (v > 0) out[k] = Math.round(v);
    store.setMeta(META_KEY, JSON.stringify(out));
  }
}
