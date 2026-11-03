// Fase 6 (gólems/domesticar): cerebro de los gólems.
// - Gólem de hierro: busca monstruos cercanos (no creepers), los persigue y los lanza por los aires;
//   también se vuelve contra quien le pegue. Se cura con lingotes de hierro.
// - Gólem de nieve: tira bolas de nieve a los monstruos, deja capas de nieve al andar donde hace frío
//   y se derrite con el calor, la lluvia o el agua.
import { MOBS, MOB_CREEPER, MOB_ENDERMAN } from '../../mobs';
import { IRON_INGOT, SNOWBALL } from '../../items';
import { AIR, BLOCK_OPAQUE, SNOW_LAYER } from '../../blocks';
import { BIOME_MUSHROOM_FIELDS } from '../../world/biomeIds';
import { lineOfSight } from '../physics';
import type { PlayerView, InteractResult, Entity } from './types';
import type { Entities } from './Entities';
import type { Companions } from './companions';

/** Radio en el que el gólem de hierro busca monstruos. */
const IRON_SIGHT = 16;
/** Radio en el que el gólem de nieve dispara. */
const SNOW_SIGHT = 10;
/** Velocidad de salida de las bolas de nieve (bloques/s) y gravedad de los objetos lanzados. */
const SNOWBALL_SPEED = 20;
const THROWN_GRAVITY = 12;

export class GolemBrain {
  constructor(private m: Entities, private c: Companions) {}

  // ------------------------------------------------------------------ hierro

  iron(e: Entity, players: PlayerView[], dt: number): boolean {
    this.c.calm(e);
    let foe = this.c.resolveFoe(e, players, 24);
    if (!foe) {
      const mon = this.nearestMonster(e, IRON_SIGHT, false);
      if (mon) {
        e.foe = mon.id;
        foe = this.c.resolveFoe(e, players, 24);
      }
    }
    if (!foe) return false; // pasea
    const def = MOBS[e.type];
    // Minecraft: entre 7,5 y 21,5 en dificultad normal; aquí algo menos para no ser un rodillo.
    const dmg = 7 + Math.floor(this.m.rand() * 8);
    this.c.chaseAndHit(e, foe, dt, def.run, dmg, 1.25, 10);
    return true;
  }

  /** Lingote de hierro: cura 25 de vida a un gólem de hierro herido. */
  interact(e: Entity, item: number, creative: boolean): InteractResult | null {
    if (item !== IRON_INGOT) return null;
    if (e.dead || e.health >= e.maxHealth) return { ok: false };
    e.health = Math.min(e.maxHealth, e.health + 25);
    this.m.host.fx('golem_repair', e.x, e.y + e.height * 0.6, e.z);
    return { ok: true, take: creative ? 0 : 1 };
  }

  // ------------------------------------------------------------------ nieve

  snow(e: Entity, _players: PlayerView[], dt: number): boolean {
    this.c.calm(e);
    this.snowWeather(e, dt);
    const ai = e.ai!;
    if (e.dead) {
      ai.goalDir = [0, 0, 0, 0];
      return true;
    }
    const mon = this.nearestMonster(e, SNOW_SIGHT, true);
    if (!mon) return false;
    const dist = Math.hypot(mon.x - e.x, mon.y - e.y, mon.z - e.z); // en 3D, como RangedAttackGoal
    ai.lookAt = [mon.x, mon.y + mon.height * 0.7, mon.z];
    if (dist > SNOW_SIGHT * 0.8) {
      const [mx, mz, jump] = this.m.mobs.followPath(e, { id: '', name: '', x: mon.x, y: mon.y, z: mon.z, alive: true, creative: false, lookingAt: -1 }, dt);
      ai.goalDir = [mx, mz, MOBS[e.type].walk, jump ? 1 : 0];
    } else ai.goalDir = [0, 0, 0, 0];
    if (ai.shootCd <= 0 && dist <= SNOW_SIGHT) {
      ai.shootCd = 1;
      this.throwSnowball(e, mon);
    }
    return true;
  }

  /** Bola de nieve hacia la criatura (tiro parabólico). */
  throwSnowball(e: Entity, t: Entity): void {
    const sx = e.x, sy = e.y + e.height * 0.8, sz = e.z;
    const dx = t.x - sx, dz = t.z - sz;
    const horiz = Math.max(1e-3, Math.hypot(dx, dz));
    const time = Math.max(0.05, horiz / SNOWBALL_SPEED);
    const ty = t.y + t.height * 0.6;
    const vy = (ty - sy) / time + 0.5 * THROWN_GRAVITY * time;
    const ball = this.m.spawnThrown(SNOWBALL, sx + (dx / horiz) * 0.7, sy, sz + (dz / horiz) * 0.7, dx / time, vy, dz / time, '');
    ball.shooter = e.id;
    this.m.host.fx('throw', sx, sy, sz);
  }

  /** Calor, lluvia y agua lo derriten; donde nieva deja una capa de nieve bajo sus pies. */
  snowWeather(e: Entity, dt: number): void {
    const w = this.m.w;
    const bx = Math.floor(e.x), by = Math.floor(e.y + 0.01), bz = Math.floor(e.z);
    const inf = w.gen.columnInfo(bx, bz);
    const temp = inf.temp, height = inf.height, biome = inf.biome;
    // Mismo criterio que la nieve del clima (Nature.weatherTickAt).
    const cold = (temp < -0.5 || height > 150) && biome !== BIOME_MUSHROOM_FIELDS;
    const hot = temp > 0.55;
    const exposed = w.skyTop(bx, bz) < by;
    const wet = e.inWater || (!cold && exposed && this.m.host.raining() > 0.2);
    if (hot || wet) {
      e.meltAcc = (e.meltAcc ?? 0) + dt;
      if (e.meltAcc >= 1) {
        e.meltAcc -= 1;
        e.invuln = 0;
        this.m.damage(e, 1, e.x, e.z, null, 0);
        if (e.dead) return;
      }
    } else e.meltAcc = 0;
    if (cold && e.onGround && w.getBlock(bx, by, bz) === AIR) {
      const below = w.getBlock(bx, by - 1, bz);
      if (below > 0 && BLOCK_OPAQUE[below]) w.setBlock(bx, by, bz, SNOW_LAYER);
    }
  }

  // ------------------------------------------------------------------ comunes

  /** Monstruo más cercano a la vista (el de hierro no se mete con creepers; ninguno con endermen). */
  nearestMonster(e: Entity, radius: number, creepers: boolean): Entity | null {
    let best: Entity | null = null;
    let bd = radius * radius;
    for (const o of this.m.list.values()) {
      if (!o.ai || o.dead || o === e) continue;
      const def = MOBS[o.type];
      if (!def?.hostile || def.inert || o.type === MOB_ENDERMAN || (!creepers && o.type === MOB_CREEPER)) continue;
      const dx = o.x - e.x, dy = o.y - e.y, dz = o.z - e.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= bd) continue;
      if (!lineOfSight(this.m.w, e.x, e.y + e.height * 0.85, e.z, o.x, o.y + o.height * 0.7, o.z)) continue;
      bd = d2;
      best = o;
    }
    return best;
  }
}
