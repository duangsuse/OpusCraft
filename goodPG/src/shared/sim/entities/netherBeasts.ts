// Fase 8.3 (criaturas del Nether): hoglin, zoglin y strider, como HoglinAi, Zoglin y Strider de Java 26.3.
//
// Hoglin: ataca a los jugadores que ve (cada 40 ticks; la cría cada 15) y los lanza por los aires; se aparta de
// los piglins adultos y huye (5–20 s) si le superan en número; le espantan el hongo distorsionado, los portales y
// las anclas (200 ticks sin atacar); prefiere pisar necelio carmesí; cría con hongos carmesíes y un 20 % nacen
// crías, que siguen a los adultos. Fuera del Nether, a los 300 ticks se convierte en zoglin.
// Zoglin: ataca a cualquier criatura que vea (menos a otros zoglins y a los creepers) y a los jugadores.
// Strider: camina sobre la lava (se hunde medio bloque y flota); fuera de ella tiene frío (un 34 % más lento,
// morado y tiritando); busca lava a 8 bloques; le atrae el hongo distorsionado (y la caña con él), con el que
// cría; huye al recibir daño; el agua y la lluvia le hacen daño. Con silla se monta y se guía con la caña (cada
// acelerón dura 140–980 ticks y gasta un uso). Al aparecer, uno de cada 30 lleva un jinete (piglin zombificado
// con la caña) y uno de cada 10 lleva a su cría encima.
import {
  MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER, MOB_PIGLIN, MOB_ZOMBIFIED_PIGLIN, EF_STRIDER_COLD, HOGLIN_ATTACK_INTERVAL,
  HOGLIN_BABY_ATTACK_INTERVAL, STRIDER_SPEED, STRIDER_STEER, STRIDER_COLD_STEER, REPELLENT_RANGE_H, REPELLENT_RANGE_V,
  isHoglinRepellentBlock, packGear,
} from '../../netherMobs';
import { MOBS, MOB_CREEPER } from '../../mobs';
import { BLOCK_FLUID, CRIMSON_NYLIUM, CRIMSON_FUNGUS, WARPED_FUNGUS, pottedPlant, familyBase, FLOWER_POT } from '../../blocks';
import { WARPED_FUNGUS_ON_A_STICK, SADDLE } from '../../items';
import { EF_ACTION } from '../../protocol';
import { GROW_SECONDS, BREED_COOLDOWN, type Entity, type InteractResult, type PlayerView } from './types';
import { breedXp } from '../../experience';
import { DT, type NetherAI, type NState, type Tgt, type TargetId } from './netherMobs';

/** Voces: normal, enfadado, huyendo; el strider además contento, comiendo y ensillado. */
export const BV_AMBIENT = 0;
export const BV_ANGRY = 1;
export const BV_RETREAT = 2;
export const BV_HAPPY = 3;

interface BeastState {
  /** Hoglin: actividad, de quién huye (y ticks), repelente cercano y ticks de calma (PACIFIED). */
  act: 'idle' | 'fight' | 'avoid';
  avoid: TargetId | null;
  avoidT: number;
  repellent: [number, number, number] | null;
  pacified: number;
  /** Adultos que ve (piglins y hoglins) y el piglin adulto más cercano. */
  piglins: number;
  hoglins: number;
  nearPiglin: number | null;
  /** Ticks que le quedan a la embestida (la animación). */
  attackAnim: number;
  /** Pareja con la que cría y ticks juntos. */
  mate: number | null;
  mateT: number;
  /** Ya no se le puede cazar (lo marcan los hoglins de los bastiones). */
  noHunt: boolean;
  /** Strider: frío, acelerón (ticks y total), sonido contento y de huida. */
  cold: boolean;
  boost: number;
  boostTotal: number;
}

/** Tras las crías: segundos que tarda en crecer una cría de hoglin (20 minutos, como un animal). */
const HOGLIN_GROW = GROW_SECONDS;

export class BeastAI {
  private states = new WeakMap<Entity, BeastState>();

  constructor(private ai: NetherAI) {}

  private get m() {
    return this.ai.m;
  }

  bstate(e: Entity): BeastState {
    let b = this.states.get(e);
    if (!b) {
      b = {
        act: 'idle', avoid: null, avoidT: 0, repellent: null, pacified: 0, piglins: 0, hoglins: 0, nearPiglin: null, attackAnim: 0,
        mate: null, mateT: 0, noHunt: false, cold: false, boost: 0, boostTotal: 0,
      };
      this.states.set(e, b);
    }
    return b;
  }

  /** ¿Se le puede cazar? (adulto y no de los que no se cazan). */
  canBeHunted(e: Entity): boolean {
    return e.type === MOB_HOGLIN && (e.growAge ?? 0) <= 0 && !this.bstate(e).noHunt;
  }

  // ------------------------------------------------------------------ aparición

  finalizeSpawn(e: Entity, reason: string): void {
    const r = this.m.rand;
    if (e.type === MOB_HOGLIN || e.type === MOB_ZOGLIN) {
      if (reason !== 'jockey' && r() < 0.2) this.makeBaby(e, e.type === MOB_ZOGLIN ? 1e9 : HOGLIN_GROW);
      return;
    }
    if (e.type !== MOB_STRIDER || (e.growAge ?? 0) > 0 || reason === 'jockey') return;
    // Uno de cada 30: jinete piglin zombificado con la caña (y la silla, que siempre suelta).
    if (r() < 1 / 30 && this.m.host.difficulty() > 0) {
      const j = this.m.spawnMob(MOB_ZOMBIFIED_PIGLIN, e.x, e.y, e.z);
      if (j) {
        this.ai.finalizeSpawn(j, 'jockey');
        j.gear = packGear(WARPED_FUNGUS_ON_A_STICK, 0, 0);
        e.saddled = true;
        this.ai.mount(j, e);
      }
    } else if (r() < 0.1) {
      const baby = this.m.spawnMob(MOB_STRIDER, e.x, e.y, e.z, true);
      if (baby) this.ai.mount(baby, e);
    }
  }

  /** Cría (la del hoglin mide 0,75 × 0,85 y crece; la del zoglin se queda cría). */
  private makeBaby(e: Entity, seconds: number): void {
    this.m.animals.setBaby(e, seconds);
    e.width = 0.75;
    e.height = 0.85;
  }

  // ------------------------------------------------------------------ tick

  tick(e: Entity, s: NState, players: PlayerView[]): void {
    const b = this.bstate(e);
    if (b.attackAnim > 0) b.attackAnim--;
    if (e.type === MOB_STRIDER) {
      this.strider(e, s, b, players);
      return;
    }
    // La cría de hoglin crece (el hoglin es un animal aunque ataque).
    if (e.type === MOB_HOGLIN && (e.growAge ?? 0) > 0) {
      e.growAge! -= DT;
      if (e.growAge! <= 0) {
        e.growAge = 0;
        e.width = MOBS[e.type].width;
        e.height = MOBS[e.type].height;
      }
    }
    if (e.type === MOB_HOGLIN) {
      if ((e.love ?? 0) > 0) e.love! -= DT;
      if ((e.breedCd ?? 0) > 0) e.breedCd! -= DT;
      if (this.ai.zombify(e, s, MOB_ZOGLIN, false)) return;
      this.hoglin(e, s, b, players);
    } else this.zoglin(e, s, b, players);
  }

  /** Velocidad del hoglin y del zoglin (0,3). */
  private speed(): number {
    return 0.3;
  }

  // ------------------------------------------------------------------ hoglin

  private hoglin(e: Entity, s: NState, b: BeastState, players: PlayerView[]): void {
    if (b.avoidT > 0 && --b.avoidT === 0) b.avoid = null;
    if (b.pacified > 0) b.pacified--;
    if (s.sense === 20) this.senseHoglin(e, s, b);
    // Repelente cerca: se calma 200 ticks.
    if (b.repellent) b.pacified = 200;
    if (b.pacified > 0 && s.target !== null) s.target = null;
    const before = b.act;
    b.act = s.target !== null ? 'fight' : b.avoid !== null ? 'avoid' : 'idle';
    if (b.act !== before) this.ai.voice(e, this.hoglinSound(s, b));
    if (this.breeding(e, s, b)) {
      this.ai.ambient(e, s, () => this.hoglinSound(s, b));
      return;
    }
    const adult = (e.growAge ?? 0) <= 0;
    if (b.act === 'fight') {
      const t = this.ai.resolve(s.target, players);
      if (!t || (t.p && !this.ai.attackable(e, t.p, 16))) {
        s.target = null;
      } else this.charge(e, s, b, t, adult ? HOGLIN_ATTACK_INTERVAL : HOGLIN_BABY_ATTACK_INTERVAL);
    } else if (b.act === 'avoid') {
      const t = this.ai.resolve(b.avoid, players);
      if (!t || (adult && b.piglins <= b.hoglins + 1)) b.avoid = null;
      else this.flee(e, s, t, this.speed() * 1.3, 15);
    } else {
      // Pasear: lejos de repelentes, apartándose de los piglins, atacando al jugador que vea, siguiendo a los adultos.
      if (b.repellent && Math.hypot(b.repellent[0] + 0.5 - e.x, b.repellent[2] + 0.5 - e.z) < 8) {
        this.flee(e, s, { id: 0, x: b.repellent[0] + 0.5, y: b.repellent[1], z: b.repellent[2] + 0.5, w: 1, h: 1 }, this.speed(), 8);
      } else if (b.pacified === 0 && (e.love ?? 0) <= 0 && s.players[0] && adult === adult) {
        s.target = s.players[0].id;
        s.targetT = -1;
      } else if (adult && b.nearPiglin !== null && this.nearPiglinWithin(e, b, 8)) {
        const pg = this.m.list.get(b.nearPiglin)!;
        this.flee(e, s, { id: pg.id, x: pg.x, y: pg.y, z: pg.z, w: pg.width, h: pg.height }, this.speed() * 0.4, 8);
      } else if (!adult && this.followAdult(e, s, MOB_HOGLIN, this.speed() * 0.6)) {
        // sigue a un adulto
      } else this.stroll(e, s, players, this.speed() * 0.4, true);
    }
    this.ai.ambient(e, s, () => this.hoglinSound(s, b));
  }

  /** HoglinSpecificSensor: repelente más cercano, piglins y hoglins adultos que ve. */
  private senseHoglin(e: Entity, s: NState, b: BeastState): void {
    b.repellent = this.ai.nearestBlock(e, REPELLENT_RANGE_H, REPELLENT_RANGE_V, (id) => isHoglinRepellentBlock(id, isPottedWarped));
    let piglins = 0, hoglins = 0;
    b.nearPiglin = null;
    for (const o of s.seen) {
      if ((o.growAge ?? 0) > 0) continue;
      if (o.type === MOB_PIGLIN) {
        piglins++;
        b.nearPiglin ??= o.id;
      } else if (o.type === MOB_HOGLIN) hoglins++;
    }
    b.piglins = piglins;
    b.hoglins = hoglins;
  }

  private nearPiglinWithin(e: Entity, b: BeastState, d: number): boolean {
    const p = this.m.list.get(b.nearPiglin!);
    return !!p && !p.dead && Math.hypot(p.x - e.x, p.z - e.z) < d;
  }

  private hoglinSound(s: NState, b: BeastState): number {
    if (b.act === 'avoid' || s.zombify > 0) return BV_RETREAT;
    if (b.act === 'fight') return BV_ANGRY;
    return b.repellent ? BV_RETREAT : BV_AMBIENT;
  }

  /** Se acerca y embiste cada `interval` ticks (MeleeAttack). */
  private charge(e: Entity, s: NState, b: BeastState, t: Tgt, interval: number): void {
    this.ai.lookAt(e, t.x, t.y + t.h * 0.6, t.z);
    if (!this.ai.inReach(e, t) || !this.ai.canSee(e, t)) {
      this.ai.goTo(e, t.x, t.y, t.z, this.speed(), 0.5, this.pathOpts(e), true);
      return;
    }
    this.ai.walk(e, 0, 0, 0);
    this.ai.face(e, t.x, t.z);
    if (s.cool > 0) return;
    s.cool = interval;
    b.attackAnim = 10;
    this.m.host.fx('nether_attack', e.x, e.y + e.height * 0.6, e.z, e.type);
    this.hurtAndThrow(e, t);
    if (e.type === MOB_HOGLIN && (e.growAge ?? 0) <= 0) this.onHitTarget(e, s, t);
  }

  /** HoglinBase.hurtAndThrowTarget: 3–8 de daño (la cría 0,5) y, el adulto, lo lanza hacia arriba. */
  private hurtAndThrow(e: Entity, t: Tgt): void {
    const adult = (e.growAge ?? 0) <= 0;
    const dmg = adult ? 3 + Math.floor(this.m.rand() * 6) : 0.5;
    this.ai.hit(e, t, dmg, MOBS[e.type].key);
    if (!adult) return;
    // throwTarget: fuerza 1 − la resistencia al empuje del objetivo; ±10° al azar; hacia arriba hasta 0,5 por tick.
    const res = t.e ? this.ai.knockbackResistance(t.e) : 0;
    const k = 1 - res;
    if (k <= 0) return;
    const ang = ((Math.floor(this.m.rand() * 21) - 10) * Math.PI) / 180;
    let dx = t.x - e.x, dz = t.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const hs = k * (this.m.rand() * 0.5 + 0.2) * 20;
    const hx = (dx * Math.cos(ang) + dz * Math.sin(ang)) * hs, hz = (dz * Math.cos(ang) - dx * Math.sin(ang)) * hs;
    const vy = k * this.m.rand() * 0.5 * 20;
    if (t.p) this.m.host.hurtPlayer(t.p.id, 0, hx, vy, hz, 'push');
    else if (t.e) {
      t.e.vx += hx;
      t.e.vz += hz;
      t.e.vy += vy;
    }
  }

  /** HoglinAi.onHitTarget: si golpea a un piglin y los piglins les superan, huyen todos; si no, todos atacan. */
  private onHitTarget(e: Entity, s: NState, t: Tgt): void {
    const b = this.bstate(e);
    const adults = s.seen.filter((o) => o.type === MOB_HOGLIN && (o.growAge ?? 0) <= 0);
    if (t.e?.type === MOB_PIGLIN && b.piglins > b.hoglins + 1) {
      this.setAvoid(e, s, t.id);
      for (const o of adults) this.setAvoid(o, this.ai.state(o), t.id);
    } else for (const o of adults) this.setTargetIfCloser(o, t.id);
  }

  private setAvoid(e: Entity, s: NState, id: TargetId): void {
    const b = this.bstate(e);
    s.target = null;
    s.walk = null;
    b.avoid = id;
    b.avoidT = 100 + Math.floor(this.m.rand() * 301);
  }

  private setTargetIfCloser(e: Entity, id: TargetId): void {
    const s = this.ai.state(e);
    if (this.bstate(e).pacified > 0) return;
    const players = this.m.host.players();
    const cur = this.ai.resolve(s.target, players), nt = this.ai.resolve(id, players);
    if (!nt) return;
    if (!cur || Math.hypot(nt.x - e.x, nt.z - e.z) < Math.hypot(cur.x - e.x, cur.z - e.z)) {
      s.target = id;
      s.targetT = 200;
    }
  }

  /** Penalizaciones de camino: el hoglin evita acercarse a los repelentes y prefiere el necelio carmesí. */
  private pathOpts(e: Entity) {
    const b = this.bstate(e);
    const rep = b.repellent;
    return {
      avoidFire: false,
      cost: (x: number, y: number, z: number) => {
        if (rep && Math.hypot(x - rep[0], y - rep[1], z - rep[2]) < 8) return Infinity;
        return this.m.w.getBlock(x, y - 1, z) === CRIMSON_NYLIUM ? -0.3 : 0;
      },
    };
  }

  // ------------------------------------------------------------------ zoglin

  private zoglin(e: Entity, s: NState, b: BeastState, players: PlayerView[]): void {
    const adult = (e.growAge ?? 0) <= 0;
    let t = this.ai.resolve(s.target, players);
    if (t && t.p && !this.ai.attackable(e, t.p, 16)) t = null;
    if (!t) {
      s.target = null;
      // Cualquier criatura viva que vea (menos zoglins y creepers) o jugador: la más cercana.
      const mob = s.seen.find((o) => o.type !== MOB_ZOGLIN && o.type !== MOB_CREEPER && !MOBS[o.type]?.inert);
      const pl = s.players[0];
      const dm = mob ? Math.hypot(mob.x - e.x, mob.y - e.y, mob.z - e.z) : Infinity;
      const dp = pl ? Math.hypot(pl.x - e.x, pl.y - e.y, pl.z - e.z) : Infinity;
      const pick: TargetId | null = dp <= dm ? pl?.id ?? null : mob?.id ?? null;
      if (pick !== null) {
        s.target = pick;
        s.targetT = -1;
        this.ai.voice(e, BV_ANGRY);
        t = this.ai.resolve(pick, players);
      }
    }
    if (t) this.charge(e, s, b, t, adult ? HOGLIN_ATTACK_INTERVAL : HOGLIN_BABY_ATTACK_INTERVAL);
    else this.stroll(e, s, players, this.speed() * 0.4, false);
    this.ai.ambient(e, s, () => (s.target !== null ? BV_ANGRY : BV_AMBIENT));
  }

  // ------------------------------------------------------------------ paseo

  /** RunOne: pasear (2), ir hacia lo que mira (2) o quedarse quieto 30–60 ticks (1). */
  private stroll(e: Entity, s: NState, players: PlayerView[], sp: number, hoglin: boolean): void {
    const opts = hoglin ? this.pathOpts(e) : undefined;
    if (s.walk) {
      if (this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], sp, 1, opts) || e.ai!.stuck > 60) s.walk = null;
    } else {
      this.ai.walk(e, 0, 0, 0);
      if (s.idle > 0) s.idle--;
      else {
        const r = this.m.rand() * 5;
        if (r < 2) s.walk = hoglin ? this.bestStroll(e) : this.ai.landPos(e, 10, 7);
        else if (r < 4) {
          const look = s.seen.find((o) => Math.hypot(o.x - e.x, o.z - e.z) < 8) ?? null;
          if (look) s.walk = [look.x, look.y, look.z];
        }
        if (!s.walk) s.idle = 30 + Math.floor(this.m.rand() * 31);
      }
    }
    // Mirar a algo cercano de vez en cuando (SetEntityLookTargetSometimes, 30–60 ticks).
    if (s.look === null && this.m.rand() < 1 / 45) {
      s.look = s.players[0]?.id ?? s.seen[0]?.id ?? null;
      s.lookT = 30 + Math.floor(this.m.rand() * 31);
    }
    const t = this.ai.resolve(s.look, players);
    if (t && Math.hypot(t.x - e.x, t.z - e.z) < 8) this.ai.lookAt(e, t.x, t.y + t.h * 0.8, t.z);
    else this.ai.relaxLook(e);
  }

  /** Paseo del hoglin: de diez puntos al azar, el de más valor (necelio carmesí 10; junto a un repelente, nunca). */
  private bestStroll(e: Entity): [number, number, number] | null {
    const b = this.bstate(e);
    let best: [number, number, number] | null = null, bv = -1;
    for (let i = 0; i < 10; i++) {
      const p = this.ai.landPos(e, 10, 7);
      if (!p) continue;
      if (b.repellent && Math.hypot(p[0] - b.repellent[0], p[1] - b.repellent[1], p[2] - b.repellent[2]) < 8) continue;
      const v = this.m.w.getBlock(Math.floor(p[0]), Math.floor(p[1]) - 1, Math.floor(p[2])) === CRIMSON_NYLIUM ? 10 : 0;
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    return best;
  }

  /** Huye de `t` hasta estar a `dist`. */
  private flee(e: Entity, s: NState, t: Tgt, sp: number, dist: number): void {
    if (Math.hypot(t.x - e.x, t.z - e.z) >= dist) {
      this.ai.walk(e, 0, 0, 0);
      return;
    }
    if (!s.walk || Math.hypot(s.walk[0] - t.x, s.walk[2] - t.z) < dist) s.walk = this.ai.awayPos(e, t.x, t.z, 16, 7);
    if (s.walk && this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], sp, 1)) s.walk = null;
    if (!s.walk) this.ai.walk(e, 0, 0, 0);
  }

  /** BabyFollowAdult: la cría sigue a un adulto de su especie a entre 5 y 16 bloques. */
  private followAdult(e: Entity, s: NState, type: number, sp: number): boolean {
    let best: Entity | null = null, bd = 16;
    for (const o of s.seen) {
      if (o.type !== type || (o.growAge ?? 0) > 0) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best || bd < 5) return false;
    // La cría de strider sigue al adulto también por encima de la lava.
    if (type === MOB_STRIDER) this.goStrider(e, [best.x, best.y, best.z], sp, 5);
    else this.ai.goTo(e, best.x, best.y, best.z, sp, 5, undefined, true);
    return true;
  }

  // ------------------------------------------------------------------ cría del hoglin

  /** AnimalMakeLove: dos hoglins en amor a 8 bloques se juntan y al cabo de 60 ticks tienen una cría. */
  private breeding(e: Entity, s: NState, b: BeastState): boolean {
    if (e.type !== MOB_HOGLIN || (e.love ?? 0) <= 0 || (e.growAge ?? 0) > 0) {
      b.mate = null;
      return false;
    }
    let mate = b.mate !== null ? this.m.list.get(b.mate) : undefined;
    if (!mate || mate.dead || (mate.love ?? 0) <= 0) {
      mate = undefined;
      let bd = 8;
      for (const o of this.m.list.values()) {
        if (o === e || o.type !== MOB_HOGLIN || o.dead || (o.love ?? 0) <= 0 || (o.growAge ?? 0) > 0) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y, o.z - e.z);
        if (d < bd) {
          bd = d;
          mate = o;
        }
      }
      b.mate = mate?.id ?? null;
      b.mateT = 0;
    }
    if (!mate) return false;
    s.target = null;
    this.ai.lookAt(e, mate.x, mate.y + 1, mate.z);
    const d = Math.hypot(mate.x - e.x, mate.z - e.z);
    if (d > 2) this.ai.goTo(e, mate.x, mate.y, mate.z, this.speed() * 0.6, 1.5, undefined, true);
    else this.ai.walk(e, 0, 0, 0);
    if (d < 3 && ++b.mateT >= 60 && e.id < mate.id) {
      e.love = 0;
      mate.love = 0;
      e.breedCd = BREED_COOLDOWN;
      mate.breedCd = BREED_COOLDOWN;
      const baby = this.m.spawnMob(MOB_HOGLIN, (e.x + mate.x) / 2, Math.max(e.y, mate.y), (e.z + mate.z) / 2);
      if (baby) {
        this.makeBaby(baby, HOGLIN_GROW);
        baby.persist = true;
      }
      this.m.host.fx('breed', e.x, e.y + 1, e.z);
      this.m.xp.spawn(breedXp(this.m.rand), e.x, e.y + 0.3, e.z);
    }
    return true;
  }

  // ------------------------------------------------------------------ strider

  private strider(e: Entity, s: NState, b: BeastState, players: PlayerView[]): void {
    const w = this.m.w;
    // ¿Tiene calor? (dentro o encima de lava, o sobre un strider que no tiene frío).
    const at = w.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    const on = w.getBlock(Math.floor(e.x), Math.floor(e.y - 0.3), Math.floor(e.z));
    const lava = (id: number) => id > 0 && BLOCK_FLUID[id] === 2;
    const mount = e.mountId !== undefined ? this.m.list.get(e.mountId) : undefined;
    b.cold = !(lava(at) || lava(on) || e.inLava) && !(mount?.type === MOB_STRIDER && !this.bstate(mount).cold);
    // El agua (y la lluvia) le hacen daño.
    if (e.inWater || (this.m.host.raining() > 0.3 && this.ai.brain.isSunlit({ ...e, inWater: false } as Entity))) {
      e.invuln = Math.min(e.invuln, 0);
      if (this.m.damage(e, 1, e.x, e.z, null, 0)) return;
    }
    const attr = STRIDER_SPEED * (b.cold ? 0.66 : 1);
    const baby = (e.growAge ?? 0) > 0;
    let steered = false;
    if (e.rider && e.saddled && e.leashTo) {
      // Lo guía el jugador con la caña: hacia donde mira, a su velocidad por el acelerón.
      const dx = e.leashTo[0] - e.x, dz = e.leashTo[2] - e.z;
      const d = Math.hypot(dx, dz) || 1;
      const ridden = attr * (b.cold ? STRIDER_COLD_STEER : STRIDER_STEER) * (e.steerSpeed ?? 1);
      this.walkStrider(e, dx / d, dz / d, Math.sqrt(ridden), e.hitWall);
      e.bodyYaw = e.yaw = Math.atan2(-dx, -dz);
      steered = true;
    } else if (e.rider) {
      this.walkStrider(e, 0, 0, 0, false);
      steered = true;
    }
    const cmd = this.ai.steering(e, s);
    if (!steered && cmd) {
      // Lo guía su jinete (el piglin zombificado).
      this.walkStrider(e, cmd[0], cmd[1], attr * (cmd[2] > 0 ? 1 : 0), cmd[3]);
      this.ai.face(e, e.x + cmd[0], e.z + cmd[1]);
      steered = true;
    }
    if (!steered) {
      const ai = e.ai!;
      const tempter = this.tempter(e, players);
      if (ai.panic > 0) {
        if (this.m.rand() < 1 / 60) this.ai.voice(e, BV_RETREAT);
        if (!s.walk) s.walk = this.ai.landPos(e, 5, 4, { lavaFloor: true });
        if (s.walk && this.goStrider(e, s.walk, attr * 1.65)) s.walk = null;
        if (!s.walk) this.walkStrider(e, 0, 0, 0, false);
      } else if ((e.love ?? 0) > 0 && this.m.animals.animalGoal(e, players, DT)) {
        const g = ai.goalDir;
        this.walkStrider(e, g[0], g[1], attr, g[3] > 0);
        this.ai.face(e, e.x + g[0], e.z + g[1]);
      } else if (tempter) {
        if (this.m.rand() < 1 / 140) this.ai.voice(e, BV_HAPPY);
        this.ai.lookAt(e, tempter.x, tempter.y + 1.62, tempter.z);
        if (Math.hypot(tempter.x - e.x, tempter.z - e.z) > 2.5) this.goStrider(e, [tempter.x, tempter.y, tempter.z], attr * 1.4);
        else this.walkStrider(e, 0, 0, 0, false);
      } else if (!e.inLava && !lava(on) && this.toLava(e, s, attr)) {
        // va hacia la lava
      } else if (baby && this.followAdult(e, s, MOB_STRIDER, attr)) {
        // sigue a un adulto
      } else {
        if (s.walk) {
          if (this.goStrider(e, s.walk, attr) || ai.stuck > 60) s.walk = null;
        } else {
          this.walkStrider(e, 0, 0, 0, false);
          if (this.m.rand() < 1 / 60) s.walk = this.ai.landPos(e, 10, 7, { lavaFloor: true });
        }
        const near = s.players.find((p) => Math.hypot(p.x - e.x, p.z - e.z) < 8);
        if (near) this.ai.lookAt(e, near.x, near.y + 1.62, near.z);
        else this.ai.relaxLook(e);
      }
      if (!tempter && ai.panic <= 0) this.ai.ambient(e, s, () => BV_AMBIENT);
    }
    // Acelerón de la caña (lo pone el sistema de equipo): el total al azar y el factor en seno.
    if (b.boost > 0 && ++b.boost > b.boostTotal) b.boost = 0;
  }

  /** Jugador con hongo distorsionado (o la caña) a menos de 10 bloques. */
  private tempter(e: Entity, players: PlayerView[]): PlayerView | null {
    let best: PlayerView | null = null, bd = 10;
    for (const p of players) {
      if (!p.alive || (p.held !== WARPED_FUNGUS && p.held !== WARPED_FUNGUS_ON_A_STICK && p.offhand !== WARPED_FUNGUS && p.offhand !== WARPED_FUNGUS_ON_A_STICK)) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** StriderGoToLavaGoal: la lava más cercana a 8 bloques (y 2 de altura) con aire encima. */
  private toLava(e: Entity, s: NState, attr: number): boolean {
    const w = this.m.w;
    if (!s.walk || s.walkS !== 1) {
      const p = this.ai.nearestBlock(e, 8, 2, (id) => BLOCK_FLUID[id] === 2);
      if (!p || w.getBlock(p[0], p[1] + 1, p[2]) !== 0) return false;
      s.walk = [p[0] + 0.5, p[1] + 1, p[2] + 0.5];
      s.walkS = 1;
    }
    if (this.goStrider(e, s.walk!, attr)) {
      s.walk = null;
      s.walkS = 0;
    }
    return true;
  }

  private goStrider(e: Entity, to: [number, number, number], s: number, near = 1): boolean {
    // Al llegar también se mueve (sin avanzar): la gravedad y la lava se aplican en cada tick, como travel en Java.
    if (Math.hypot(to[0] - e.x, to[2] - e.z) < near) {
      this.walkStrider(e, 0, 0, 0, false);
      return true;
    }
    const [dx, dz, jump] = this.ai.steerTo(e, to[0], to[1], to[2], { lavaFloor: true }, true);
    this.walkStrider(e, dx, dz, s, jump);
    this.ai.face(e, e.x + dx, e.z + dz);
    return false;
  }

  /**
   * Movimiento del strider: el de siempre, pero la lava de la que asoma es suelo a media altura (Strider.
   * canStandOnFluid y floatStrider): si se hunde más, sube (× 0,5 + 0,05 por tick).
   */
  private walkStrider(e: Entity, dx: number, dz: number, s: number, jump: boolean): void {
    const w = this.m.w;
    const inLava = e.inLava;
    const before = e.y;
    e.inLava = false;
    this.ai.walk(e, dx, dz, s, jump);
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    const here = w.getBlock(bx, by, bz), above = w.getBlock(bx, by + 1, bz);
    const lava = (id: number) => id > 0 && BLOCK_FLUID[id] === 2;
    if (lava(here) && !lava(above)) {
      const surface = by + 0.5;
      // Venía de encima (LiquidBlock.STABLE_SHAPE es colisión si está por encima): se posa sin hundirse.
      if (before >= surface - 1e-3 && e.y < surface) {
        e.y = surface;
        e.vy = 0;
        e.onGround = true;
        e.fallStart = e.y;
      } else if (e.y < surface - 0.2) e.vy = (e.vy * DT * 0.5 + 0.05) / DT;
      else if (e.y < surface) {
        e.y = surface;
        e.vy = 0;
        e.onGround = true;
        e.fallStart = e.y;
      }
    } else if (lava(here)) e.vy = (e.vy * DT * 0.5 + 0.05) / DT;
    e.inLava = inLava || lava(here);
  }

  // ------------------------------------------------------------------ interacción

  /** Hoglin: con hongo carmesí entra en amor (o crece la cría); strider: silla, montarse (lo demás, genérico). */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult | null {
    void who;
    if (e.type === MOB_HOGLIN && item === CRIMSON_FUNGUS) {
      const baby = (e.growAge ?? 0) > 0;
      if (baby) e.growAge = Math.max(0.05, e.growAge! * 0.9);
      else {
        if ((e.love ?? 0) > 0 || (e.breedCd ?? 0) > 0 || this.bstate(e).pacified > 0) return { ok: false };
        e.love = 30;
        e.persist = true;
      }
      this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
      return { ok: true, take: creative ? 0 : 1 };
    }
    if (e.type === MOB_STRIDER && item === SADDLE) return null; // la silla la pone el sistema de monturas
    return null;
  }

  /** Acelerón (lo pide el sistema de equipo cuando el jinete usa la caña): false si ya iba acelerado. */
  boost(e: Entity): boolean {
    const b = this.bstate(e);
    if (b.boost > 0) return false;
    b.boost = 1;
    b.boostTotal = 140 + Math.floor(this.m.rand() * 841);
    return true;
  }

  /** Factor del acelerón ahora mismo (1 sin acelerón; hasta 2,15). */
  boostFactor(e: Entity): number {
    const b = this.bstate(e);
    return b.boost > 0 ? 1 + 1.15 * Math.sin((b.boost / b.boostTotal) * Math.PI) : 1;
  }

  // ------------------------------------------------------------------ daño

  onDamaged(e: Entity, s: NState, attacker: TargetId | null): void {
    if (attacker === null) return;
    if (e.type === MOB_STRIDER) return; // huye (ai.panic lo pone Entities.damage)
    const players = this.m.host.players();
    if (e.type === MOB_ZOGLIN) {
      const cur = this.ai.resolve(s.target, players), t = this.ai.resolve(attacker, players);
      if (!t || (typeof attacker === 'number' && this.m.list.get(attacker)?.type === MOB_ZOGLIN)) return;
      if (cur && Math.hypot(t.x - e.x, t.z - e.z) > Math.hypot(cur.x - e.x, cur.z - e.z) + 4) return;
      s.target = attacker;
      s.targetT = 200;
      return;
    }
    const b = this.bstate(e);
    b.pacified = 0;
    b.mate = null;
    if ((e.growAge ?? 0) > 0) {
      this.setAvoid(e, s, attacker);
      return;
    }
    const atk = typeof attacker === 'number' ? this.m.list.get(attacker) : undefined;
    if (b.act === 'avoid' && atk?.type === MOB_PIGLIN) return;
    if (atk?.type === MOB_HOGLIN) return;
    const cur = this.ai.resolve(s.target, players), t = this.ai.resolve(attacker, players);
    if (!t || (t.p && !this.ai.attackable(e, t.p, 64))) return;
    if (cur && Math.hypot(t.x - e.x, t.z - e.z) > Math.hypot(cur.x - e.x, cur.z - e.z) + 4) return;
    s.target = attacker;
    s.targetT = 200;
    for (const o of s.seen) if (o.type === MOB_HOGLIN && (o.growAge ?? 0) <= 0) this.setTargetIfCloser(o, attacker);
  }

  onKilled(e: Entity, killer: TargetId | null): void {
    void killer;
    // El strider jinete suelta la silla que llevaba (siempre); la del strider ensillado la suelta Entities.kill.
    void e;
  }

  flags(e: Entity, s: NState): number {
    const b = this.bstate(e);
    let f = b.attackAnim > 0 ? EF_ACTION : 0;
    if (e.type === MOB_STRIDER && b.cold) f |= EF_STRIDER_COLD;
    if (e.type === MOB_STRIDER) f &= ~0; // el enfado no cuenta para el strider
    void s;
    return f;
  }
}

/** ¿Es una maceta con hongo distorsionado? */
function isPottedWarped(id: number): boolean {
  return familyBase(id) === FLOWER_POT && pottedPlant(id) === WARPED_FUNGUS;
}
