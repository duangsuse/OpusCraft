// Fase 8.7: el Wither en el servidor.
// - Invocación (WitherSkullBlock.checkSpawn): al poner un cráneo de esqueleto wither se mira si completa la figura
//   —tres cráneos encima de una T de arena o tierra de alma, con aire en las dos esquinas de abajo— en cualquiera de
//   sus 24 orientaciones (como el BlockPattern de Java: también tumbada o del revés). Los bloques desaparecen y el
//   Wither nace, invulnerable, en el de abajo del centro. No en pacífico.
// - La barra del jefe (morada, oscurece el cielo) a quien está cerca del Wither más cercano.
// - La rosa marchita da Marchitamiento (2 s) a quien la toca (jugadores y criaturas), salvo en pacífico.
import { AIR, SOUL_SAND, SOUL_SOIL, SKULLS, WALL_SKULLS, WITHER_ROSE, familyBase } from '../../blocks';
import { MOB_WITHER, WITHER_INVULNERABLE_TICKS } from '../../witherMobs';
import { EFFECT_WITHER } from '../../effects';
import { MIN_Y } from '../../constants';
import { STATE_DEAD } from '../../protocol';
import type { Entity } from '../entities';
import type { ServerContext, Session } from './context';

/** Distancia a la que se ve la barra del Wither. */
const BOSS_RANGE = 64;
const DIRS: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const isSkull = (id: number) => {
  const b = familyBase(id);
  return b === SKULLS.wither_skeleton || b === WALL_SKULLS.wither_skeleton;
};
const isSoul = (id: number) => id === SOUL_SAND || id === SOUL_SOIL;

export class WitherBoss {
  /** Cráneos puestos en el último tick. */
  private pending: [number, number, number][] = [];
  private bossSent = new Map<string, number>();

  constructor(private ctx: ServerContext) {}

  onBlockChanged(x: number, y: number, z: number, id: number): void {
    if (id > 0 && isSkull(id) && this.pending.length < 32) this.pending.push([x, y, z]);
  }

  tick(): void {
    const list = this.pending;
    if (list.length) {
      this.pending = [];
      for (const [x, y, z] of list) this.tryBuild(x, y, z);
    }
    this.bossBar();
    if (this.ctx.tickCount % 10 === 0) this.roses();
  }

  /**
   * ¿Completa el cráneo de (x, y, z) la figura del Wither? Filas de arriba abajo: «^^^», «###», «~#~» (^ cráneo, #
   * arena o tierra de alma, ~ aire). Si la completa, la borra y hace nacer al Wither.
   */
  tryBuild(x: number, y: number, z: number): Entity | null {
    const ctx = this.ctx, w = ctx.world;
    if (ctx.difficulty === 0 || y < MIN_Y) return null;
    const get = (p: readonly number[]) => w.getBlock(p[0], p[1], p[2]);
    for (const up of DIRS) {
      for (const right of DIRS) {
        if (up[0] * right[0] + up[1] * right[1] + up[2] * right[2] !== 0) continue;
        // El cráneo puede ser cualquiera de los tres de arriba (columna c de la fila 0).
        for (let c = 0; c < 3; c++) {
          const cell = (col: number, row: number): [number, number, number] => [
            x + right[0] * (col - c) - up[0] * row, y + right[1] * (col - c) - up[1] * row, z + right[2] * (col - c) - up[2] * row,
          ];
          const rows = ['^^^', '###', '~#~'];
          let ok = true;
          for (let row = 0; row < 3 && ok; row++) {
            for (let col = 0; col < 3 && ok; col++) {
              const id = get(cell(col, row));
              const want = rows[row][col];
              ok = want === '^' ? isSkull(id) : want === '#' ? isSoul(id) : id === AIR;
            }
          }
          if (!ok) continue;
          for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
            if (rows[row][col] === '~') continue;
            const [cx, cy, cz] = cell(col, row);
            ctx.fx('wither_cell', cx + 0.5, cy + 0.5, cz + 0.5, get([cx, cy, cz]));
            w.setBlock(cx, cy, cz, AIR);
          }
          const [sx, sy, sz] = cell(1, 2);
          // La T a lo largo de X mira a 0°; si no, a 90° (getForwards().getAxis()).
          const forwardX = right[0] === 0 && up[0] === 0;
          const e = ctx.entities.wither.summon(sx + 0.5, sy + 0.55, sz + 0.5, forwardX ? 0 : 90);
          if (e) ctx.fx('wither_summon', sx + 0.5, sy + 1.5, sz + 0.5);
          return e;
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ barra

  private bossBar(): void {
    const ctx = this.ctx;
    const withers = [...ctx.entities.list.values()].filter((e) => e.type === MOB_WITHER && !e.dead);
    for (const s of ctx.sessions()) {
      if (!s.joined) continue;
      let best: Entity | null = null, bd = BOSS_RANGE;
      for (const e of withers) {
        const d = Math.hypot(e.x - s.p[0], e.y - s.p[1], e.z - s.p[2]);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      // Naciendo, la barra se llena con la invulnerabilidad (1 − ticks / 220); luego, la vida.
      const invul = best ? ctx.entities.wither.invulnerable(best) : 0;
      const h = !best ? -1 : invul > 0 ? 1 - invul / WITHER_INVULNERABLE_TICKS : Math.max(0, Math.min(1, best.health / best.maxHealth));
      const last = this.bossSent.get(s.id);
      if (last === undefined && h < 0) continue;
      if (last !== undefined && Math.abs(last - h) < 0.002 && ctx.tickCount % 40 !== 0) continue;
      if (h < 0) this.bossSent.delete(s.id);
      else this.bossSent.set(s.id, h);
      const name = best && ctx.entities.wither.furious(best) ? 'Wither (furioso)' : best?.customName || 'Wither';
      ctx.send(s, h < 0 ? { t: 'boss', h: -1 } : { t: 'boss', n: name, h: Math.round(h * 1000) / 1000, c: 'purple' });
    }
  }

  onLeave(s: Session): void {
    this.bossSent.delete(s.id);
  }

  // ------------------------------------------------------------------ rosa marchita

  /** WitherRoseBlock.entityInside: 2 s de Marchitamiento a quien esté dentro de una rosa. */
  private roses(): void {
    const ctx = this.ctx, w = ctx.world;
    if (ctx.difficulty === 0) return;
    const inRose = (x: number, y: number, z: number, h: number) =>
      w.getBlock(Math.floor(x), Math.floor(y + 0.01), Math.floor(z)) === WITHER_ROSE || (h > 1 && w.getBlock(Math.floor(x), Math.floor(y + 1), Math.floor(z)) === WITHER_ROSE);
    for (const s of ctx.sessions()) {
      if (!s.joined || s.mode === 'c' || s.s & STATE_DEAD) continue;
      if (inRose(s.p[0], s.p[1], s.p[2], 1.8)) ctx.entities.host.effectPlayer?.(s.id, EFFECT_WITHER, 2, 0);
    }
    for (const e of ctx.entities.list.values()) {
      if (!e.ai || e.dead) continue;
      if (inRose(e.x, e.y, e.z, e.height)) ctx.entities.effects.add(e, EFFECT_WITHER, 2, 0);
    }
  }
}
