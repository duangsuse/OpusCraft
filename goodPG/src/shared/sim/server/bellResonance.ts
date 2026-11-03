// Fase 7 (efectos): la campana delata a los saqueadores. Al sonar (tocada o con redstone), si hay alguno
// a menos de 48 bloques, a los 2,25 s resuena y todos los que estén a ese alcance brillan 3 s (se les ve
// el contorno a través de las paredes), como en Minecraft Java.
import { EFFECT_GLOWING, BELL_GLOW_RANGE, BELL_GLOW_SECONDS, BELL_GLOW_DELAY } from '../../effects';
import { isRaider } from '../../mobs';
import type { ServerContext } from './context';

interface Ringing {
  x: number;
  y: number;
  z: number;
  /** Segundos que faltan para resonar. */
  t: number;
}

export class BellResonance {
  private ringing: Ringing[] = [];

  constructor(private ctx: ServerContext) {}

  /** Una campana suena en (x, y, z) (su centro). */
  ring(x: number, y: number, z: number): void {
    if (!this.raidersNear(x, y, z).length) return;
    // Otra vez la misma campana mientras resuena: no vuelve a empezar.
    if (this.ringing.some((r) => r.x === x && r.y === y && r.z === z)) return;
    this.ringing.push({ x, y, z, t: BELL_GLOW_DELAY });
  }

  tick(dt: number): void {
    if (this.ringing.length === 0) return;
    for (const r of this.ringing) {
      r.t -= dt;
      if (r.t > 0) continue;
      for (const e of this.raidersNear(r.x, r.y, r.z)) this.ctx.entities.effects.add(e, EFFECT_GLOWING, BELL_GLOW_SECONDS, 0);
    }
    this.ringing = this.ringing.filter((r) => r.t > 0);
  }

  private raidersNear(x: number, y: number, z: number) {
    const out = [];
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || !e.ai || !isRaider(e.type)) continue;
      const dx = e.x - x, dy = e.y - y, dz = e.z - z;
      if (dx * dx + dy * dy + dz * dz <= BELL_GLOW_RANGE * BELL_GLOW_RANGE) out.push(e);
    }
    return out;
  }
}
