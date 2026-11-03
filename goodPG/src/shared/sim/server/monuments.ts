// Fase 7.5 (océano): lo que las estructuras del mar necesitan del servidor.
// - Criaturas de estructura: los guardianes ancianos del monumento y los ahogados de las ruinas aparecen
//   una sola vez, al generarse su chunk, y no desaparecen (Entity.persist).
// - Guardianes: dentro de la caja de un monumento, con jugadores cerca, aparecen en grupos de 2 a 4 en el
//   agua (con agua también debajo; a cielo abierto, sólo 1 de cada 20 intentos), como en Minecraft.
// - Maldición del anciano: cada minuto, cada guardián anciano da fatiga minera III durante 5 minutos a los
//   jugadores a menos de 50 bloques que no la tengan ya (con al menos un minuto por delante), y les
//   enseña su cara fantasmal con su lamento.
import { isNetherMob, MOB_PIGLIN, packGear } from '../../netherMobs'; // Fase 8.4
import { CROSSBOW, TOOLS } from '../../items';
import { MOB_GUARDIAN, MOB_ELDER_GUARDIAN, CURSE_EVERY, CURSE_RANGE, CURSE_SECONDS, CURSE_AMP } from '../../oceanMobs';
import { EFFECT_MINING_FATIGUE } from '../../effects';
import { BLOCK_FLUID, BLOCK_OPAQUE } from '../../blocks';
import { SEA_LEVEL } from '../../constants';
import { STATE_DEAD } from '../../protocol';
import { locateStructure, type StructureMob } from '../../world/structures';
import { MONUMENT_RADIUS, MONUMENT_Y, inMonumentBox } from '../../world/monument';
import { TICK_RATE, r2, type ServerContext } from './context';

/** Guardianes (no ancianos) como mucho dentro de un monumento. */
export const MONUMENT_GUARDIAN_CAP = 12;
/** Distancia mínima a un jugador para aparecer (bloques). */
const SPAWN_MIN_DIST = 16;

export class OceanMonuments {
  /** Hasta cuándo (ms) dura la maldición de cada jugador (si su cliente aún no mandó sus efectos). */
  private cursed = new Map<string, number>();

  constructor(private ctx: ServerContext) {}

  /** Criaturas de una estructura recién generada. */
  spawnStructureMobs(list: StructureMob[]): void {
    for (const m of list) {
      const e = this.ctx.entities.spawnMob(m.type, m.x, m.y, m.z);
      if (!e) continue;
      e.persist = true;
      if (isNetherMob(m.type)) {
        // Fase 8.4: las del bastión, con el arma de su plantilla (el piglin: ballesta o espada de oro) y lo demás de
        // finalizeSpawn con motivo STRUCTURE (armadura de oro al azar, la casa del bruto…).
        if (m.type === MOB_PIGLIN) e.gear = packGear(m.variant === 1 ? CROSSBOW : TOOLS.golden.sword, 0, 0);
        this.ctx.entities.mobs.nether.finalizeSpawn(e, 'structure');
        e.yaw = e.bodyYaw = this.ctx.rand() * Math.PI * 2;
      } else if (m.variant !== undefined) e.variant = m.variant; // Fase 7.5 (fauna): el gato negro de la cabaña
    }
  }

  /** Llamar cada tick. */
  tick(): void {
    const ctx = this.ctx;
    if (ctx.tickCount % TICK_RATE !== 0) return;
    const second = Math.floor(ctx.tickCount / TICK_RATE);
    for (const e of ctx.entities.list.values()) {
      if (e.type === MOB_ELDER_GUARDIAN && !e.dead && (second + e.id) % CURSE_EVERY === 0) this.curse(e.x, e.y + e.height / 2, e.z);
    }
    if (ctx.difficulty > 0) this.spawnGuardians();
  }

  /** Maldición de un guardián anciano en (x, y, z). Devuelve a cuántos jugadores alcanzó. */
  curse(x: number, y: number, z: number): number {
    const ctx = this.ctx;
    let n = 0;
    for (const s of ctx.sessions()) {
      if (!s.joined || s.mode === 'c' || s.s & STATE_DEAD) continue;
      if (Math.hypot(s.p[0] - x, s.p[1] - y, s.p[2] - z) > CURSE_RANGE) continue;
      // Ya maldito con tiempo de sobra (según lo último que guardó su cliente o, sin eso, lo que se le dio).
      const fx = s.save?.fx;
      const has = fx?.find(([id]) => id === EFFECT_MINING_FATIGUE);
      if (has ? has[1] >= CURSE_AMP && has[2] >= 60 : !fx && (this.cursed.get(s.id) ?? 0) - ctx.now() >= 60_000) continue;
      this.cursed.set(s.id, ctx.now() + CURSE_SECONDS * 1000);
      if (this.cursed.size > 64) for (const [k, t] of this.cursed) if (t < ctx.now()) this.cursed.delete(k);
      ctx.send(s, { t: 'effect', id: EFFECT_MINING_FATIGUE, s: CURSE_SECONDS, a: CURSE_AMP });
      ctx.send(s, { t: 'fx', k: 'elder_curse', p: [r2(x), r2(y), r2(z)] });
      if (s.save?.fx) {
        s.save.fx = s.save.fx.filter(([id]) => id !== EFFECT_MINING_FATIGUE);
        s.save.fx.push([EFFECT_MINING_FATIGUE, CURSE_AMP, CURSE_SECONDS]);
      }
      n++;
    }
    return n;
  }

  /** Grupos de guardianes dentro de los monumentos con jugadores cerca. */
  private spawnGuardians(): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const done = new Set<string>();
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      const mon = locateStructure(w.gen, 'monument', Math.floor(s.p[0]), Math.floor(s.p[2]), 1);
      if (!mon || Math.max(Math.abs(mon[0] - s.p[0]), Math.abs(mon[2] - s.p[2])) > MONUMENT_RADIUS + 64) continue;
      const key = `${mon[0]},${mon[2]}`;
      if (done.has(key) || ctx.rand() > 0.25) continue;
      done.add(key);
      let n = 0;
      for (const e of ctx.entities.list.values()) if (e.type === MOB_GUARDIAN && !e.dead && inMonumentBox(mon[0], mon[2], e.x, e.y, e.z)) n++;
      if (n >= MONUMENT_GUARDIAN_CAP) continue;
      const spot = this.spawnSpot(mon[0], mon[2]);
      if (!spot) continue;
      const group = Math.min(MONUMENT_GUARDIAN_CAP - n, 2 + Math.floor(ctx.rand() * 3));
      for (let i = 0; i < group; i++) {
        const x = spot[0] + (ctx.rand() - 0.5) * 3, z = spot[2] + (ctx.rand() - 0.5) * 3;
        if (!this.water(Math.floor(x), spot[1], Math.floor(z))) continue;
        ctx.entities.spawnMob(MOB_GUARDIAN, x, spot[1], z);
      }
    }
  }

  private water(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    const a = w.getBlock(x, y, z), b = w.getBlock(x, y - 1, z), c = w.getBlock(x, y + 1, z);
    return a > 0 && BLOCK_FLUID[a] === 1 && b > 0 && BLOCK_FLUID[b] === 1 && c > 0 && BLOCK_FLUID[c] === 1;
  }

  /** Punto de agua dentro de la caja del monumento, lejos de los jugadores y en un chunk cargado. */
  private spawnSpot(mx: number, mz: number): [number, number, number] | null {
    const ctx = this.ctx;
    const w = ctx.world;
    for (let t = 0; t < 8; t++) {
      const x = mx + Math.floor((ctx.rand() * 2 - 1) * MONUMENT_RADIUS);
      const z = mz + Math.floor((ctx.rand() * 2 - 1) * MONUMENT_RADIUS);
      const y = MONUMENT_Y + 1 + Math.floor(ctx.rand() * (SEA_LEVEL - 2 - MONUMENT_Y));
      if (!w.isLoaded(Math.floor(x / 16), Math.floor(z / 16)) || !this.water(x, y, z)) continue;
      let near = false;
      for (const s of ctx.sessions()) if (s.joined && Math.hypot(s.p[0] - x, s.p[1] - y, s.p[2] - z) < SPAWN_MIN_DIST) near = true;
      if (near) continue;
      // A cielo abierto (sin nada encima hasta la superficie), sólo 1 de cada 20.
      let covered = false;
      for (let yy = y + 1; yy < SEA_LEVEL && !covered; yy++) {
        const b = w.getBlock(x, yy, z);
        if (b > 0 && !BLOCK_FLUID[b] && BLOCK_OPAQUE[b]) covered = true;
      }
      if (!covered && ctx.rand() >= 0.05) continue;
      return [x + 0.5, y, z + 0.5];
    }
    return null;
  }
}
