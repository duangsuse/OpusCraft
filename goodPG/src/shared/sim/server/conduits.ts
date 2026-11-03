// Fase 6.5 (equipo): conductos. Cada 2 s cada conducto mira si está rodeado de agua (el cubo de 3×3×3
// a su alrededor) y cuántos bloques de prismarina (o linterna marina) tiene en su marco (ver
// CONDUIT_FRAME). Con 16 o más se enciende (abre el ojo) y da Poder del conducto (respiración
// acuática y visión bajo el agua) a los jugadores que estén en el agua dentro de su alcance (16
// bloques por cada 7 de marco). Los conductos se descubren al colocarlos y con los ticks aleatorios.
import {
  PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN, BLOCK_FLUID, isConduit, conduitActive, stateProps,
} from '../../blocks';
import { EFFECT_CONDUIT_POWER } from '../../effects';
import { STATE_DEAD } from '../../protocol';
import { CONDUIT_FRAME, CONDUIT_EFFECT_SECONDS, conduitRange } from '../../equipment';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { Nature } from './nature';
import type { ServerContext } from './context';

/** Bloques que cuentan para el marco. */
const FRAME_BLOCKS: ReadonlySet<number> = new Set([PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN]);
/** Ticks entre pulsos (Minecraft: 40). */
const PULSE = 40;

export class Conduits {
  private known = new Set<number>();

  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => {
      if (!isConduit(id)) return false;
      this.known.add(posKey(x, y, z));
      return true;
    });
  }

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (isConduit(id)) this.known.add(posKey(x, y, z));
    else if (isConduit(old)) this.known.delete(posKey(x, y, z));
  }

  /** Bloques de marco alrededor del conducto de (x, y, z), o 0 si no está rodeado de agua. */
  frameAt(x: number, y: number, z: number): number {
    const w = this.ctx.world;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const b = w.getBlock(x + dx, y + dy, z + dz);
          if (b <= 0 || BLOCK_FLUID[b] !== 1) return 0;
        }
      }
    }
    let n = 0;
    for (const [dx, dy, dz] of CONDUIT_FRAME) if (FRAME_BLOCKS.has(w.getBlock(x + dx, y + dy, z + dz))) n++;
    return n;
  }

  tick(): void {
    const ctx = this.ctx;
    if (this.known.size === 0 || ctx.tickCount % PULSE !== 0) return;
    const w = ctx.world;
    for (const k of [...this.known]) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = w.getBlock(x, y, z);
      if (id < 0) continue; // sin cargar: se mira cuando vuelva
      if (!isConduit(id)) {
        this.known.delete(k);
        continue;
      }
      const range = conduitRange(this.frameAt(x, y, z));
      const active = range > 0;
      if ((stateProps(id)?.active === 1) !== active) {
        w.setBlock(x, y, z, conduitActive(id, active));
        ctx.fx(active ? 'conduit_on' : 'conduit_off', x + 0.5, y + 0.5, z + 0.5);
      }
      if (!active) continue;
      for (const s of ctx.sessions()) {
        if (!s.joined || s.s & STATE_DEAD) continue;
        if (Math.hypot(s.p[0] - x - 0.5, s.p[1] - y - 0.5, s.p[2] - z - 0.5) > range) continue;
        // Sólo a quien está en el agua (pies o cabeza).
        const feet = w.getBlock(Math.floor(s.p[0]), Math.floor(s.p[1] + 0.2), Math.floor(s.p[2]));
        const head = w.getBlock(Math.floor(s.p[0]), Math.floor(s.p[1] + 1.6), Math.floor(s.p[2]));
        if ((feet > 0 && BLOCK_FLUID[feet] === 1) || (head > 0 && BLOCK_FLUID[head] === 1)) {
          ctx.send(s, { t: 'effect', id: EFFECT_CONDUIT_POWER, s: CONDUIT_EFFECT_SECONDS, a: 0 });
        }
      }
    }
  }
}
