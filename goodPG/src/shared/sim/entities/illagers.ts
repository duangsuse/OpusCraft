// Fase 6 (asaltos): comportamiento de los illagers y compañía. MobBrain le cede el tick de cada
// criatura antes de decidir; si devuelve true, ya se movió y MobBrain no hace nada más.
//
// - Objetivos: jugadores, aldeanos y gólems de hierro (y quien les pegue). En un asalto, sin nadie a
//   la vista, marchan hacia el centro de la aldea.
// - Saqueador: guarda las distancias y dispara con la ballesta (carga ~1 s).
// - Vindicador: persigue y golpea con el hacha.
// - Evocador: huye si te acercas; invoca vex y hace brotar colmillos del suelo (en línea hacia su
//   presa o en corro a su alrededor si la tiene encima).
// - Vex: vuela atravesando paredes, embiste con la espada y se consume con el tiempo.
// - Devastador: embiste con fuerza, arrasa hojas y cultivos a su paso y ruge al avistar presa.
// - Colmillos: salen del suelo, muerden una vez a lo que tengan encima y desaparecen.
// - Zombis: sin jugadores cerca, van a por los aldeanos; en normal y difícil, a veces los convierten
//   en aldeanos zombi.
import {
  MOBS, MOB_VILLAGER, MOB_WANDERING_TRADER, MOB_IRON_GOLEM, MOB_ZOMBIE, MOB_HUSK, MOB_ZOMBIE_VILLAGER, MOB_DROWNED,
  MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, MOB_VEX, MOB_RAVAGER, MOB_EVOKER_FANGS, isRaider, isVillagerType,
} from '../../mobs';
import { OMINOUS_BOTTLE } from '../../items';
import { BLOCK_SOLID, BLOCK_FLUID, isLeaves, isCrop } from '../../blocks';
import { EF_ACTION, EF_CAPTAIN } from '../../protocol';
import { lineOfSight } from '../physics';
import { canMeleeHit } from './meleeReach'; // alcance y línea de visión de Java
import { TAU, angleTo, lerpAngle, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
import type { MobBrain } from './mobBrain';

/** Algo a lo que atacar: un jugador o una criatura. */
type Foe = { p: PlayerView; e?: undefined } | { e: Entity; p?: undefined };

const fx = (f: Foe) => f.p ? f.p.x : f.e!.x;
const fy = (f: Foe) => f.p ? f.p.y : f.e!.y;
const fz = (f: Foe) => f.p ? f.p.z : f.e!.z;
const fh = (f: Foe) => f.p ? 1.8 : f.e!.height;

/** Zombis que van a por los aldeanos. */
const ZOMBIES = new Set([MOB_ZOMBIE, MOB_HUSK, MOB_ZOMBIE_VILLAGER, MOB_DROWNED]);
/** Probabilidad de que un aldeano muerto por un zombi se convierta (fácil, normal, difícil). */
const CONVERT_CHANCE = [0, 0, 0.5, 1];
/** Segundos que tarda el saqueador en cargar la ballesta. */
const CROSSBOW_CHARGE = 1.1;
/** Segundos entre hechizos del evocador. */
const FANGS_EVERY = 5;
const VEX_EVERY = 17;
/** Vex como mucho a la vez cerca de un evocador. */
const MAX_VEX = 8;

interface IllagerState {
  /** Venganza: quién le pegó (id de jugador o de entidad) y cuánto le queda. */
  revenge: string | number | null;
  revengeT: number;
  /** Evocador: esperas de cada hechizo y segundos de lanzamiento en curso. */
  fangsCd: number;
  vexCd: number;
  casting: number;
  /** Vex: dueño, vida que le queda y embestida en curso. */
  owner: number;
  life: number;
  charge: number;
  chargeCd: number;
  /** Devastador: ya rugió por esta presa. */
  roared: string | number | null;
}

interface PendingFang {
  at: number;
  x: number;
  y: number;
  z: number;
  owner: number;
}

export class IllagerAI {
  private states = new WeakMap<Entity, IllagerState>();
  private pending: PendingFang[] = [];
  private clock = 0;

  constructor(private m: Entities, private brain: MobBrain) {}

  state(e: Entity): IllagerState {
    let s = this.states.get(e);
    if (!s) {
      const r = this.m.rand;
      s = {
        revenge: null, revengeT: 0, fangsCd: 2 + r() * 2, vexCd: 4 + r() * 4, casting: 0, owner: 0, life: 30 + r() * 90,
        charge: 0, chargeCd: 1 + r() * 2, roared: null,
      };
      this.states.set(e, s);
    }
    return s;
  }

  /** Tick propio; true si ya se encargó de todo. */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    switch (e.type) {
      case MOB_PILLAGER:
      case MOB_VINDICATOR:
      case MOB_EVOKER:
      case MOB_RAVAGER:
        this.raider(e, dt, players);
        return true;
      case MOB_VEX:
        this.vex(e, dt, players);
        return true;
      case MOB_EVOKER_FANGS:
        this.fangs(e);
        return true;
    }
    if (ZOMBIES.has(e.type) && !e.inWater) return this.zombieHunt(e, dt, players);
    return false;
  }

  /** Una vez por tick del mundo: colmillos pendientes de brotar. */
  tickWorld(dt: number): void {
    this.clock += dt;
    if (this.pending.length === 0) return;
    const due = this.pending.filter((f) => f.at <= this.clock);
    if (due.length === 0) return;
    this.pending = this.pending.filter((f) => f.at > this.clock);
    for (const f of due) {
      const y = this.groundNear(f.x, f.y, f.z);
      if (y === null) continue;
      const fang = this.m.spawnMob(MOB_EVOKER_FANGS, f.x, y, f.z);
      if (!fang) continue;
      fang.shooter = f.owner;
      fang.yaw = fang.bodyYaw = this.m.rand() * TAU;
    }
  }

  // ------------------------------------------------------------------ avisos

  onDamaged(e: Entity, attacker: string | number | null): void {
    if (attacker === null || (!isRaider(e.type) && e.type !== MOB_VEX)) return;
    if (typeof attacker === 'number') {
      const src = this.m.list.get(attacker);
      if (!src || isRaider(src.type) || src.type === MOB_VEX) return;
    }
    const s = this.state(e);
    s.revenge = attacker;
    s.revengeT = 12;
  }

  /** El capitán suelta la botella ominosa. */
  onKilled(e: Entity): void {
    if (e.captain) this.m.dropStacks([{ id: OMINOUS_BOTTLE, count: 1 }], e.x, e.y + 0.5, e.z);
  }

  // ------------------------------------------------------------------ objetivos

  private resolve(id: string | number, players: PlayerView[]): Foe | null {
    if (typeof id === 'string') {
      const p = players.find((pp) => pp.id === id && pp.alive && !pp.creative);
      return p ? { p } : null;
    }
    const o = this.m.list.get(id);
    return o && !o.dead && o.ai ? { e: o } : null;
  }

  /** Presa: la venganza pendiente o lo más cercano (jugador, aldeano o gólem de hierro). */
  private pick(e: Entity, players: PlayerView[], range: number, dt: number): Foe | null {
    const s = this.state(e);
    if (s.revengeT > 0) {
      s.revengeT -= dt;
      const r = s.revenge !== null ? this.resolve(s.revenge, players) : null;
      if (r && Math.hypot(fx(r) - e.x, fz(r) - e.z) < 32) return r;
      s.revengeT = 0;
    }
    const ai = e.ai!;
    // La presa actual mientras siga a tiro.
    const cur = ai.target ? players.find((p) => p.id === ai.target && p.alive && !p.creative) : null;
    if (cur && Math.hypot(cur.x - e.x, cur.z - e.z) < range + 8) return { p: cur };
    // En un asalto (y el vex, que atraviesa paredes) buscan presa sin necesidad de verla.
    const blind = e.raid !== undefined || e.type === MOB_VEX;
    const p = this.brain.nearestPlayer(e, players, range, !blind);
    let best: Foe | null = p ? { p } : null;
    let bd = p ? Math.hypot(p.x - e.x, p.z - e.z) : range;
    for (const o of this.m.list.values()) {
      if (o.dead || !o.ai || (!isVillagerType(o.type) && o.type !== MOB_IRON_GOLEM)) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      // Los gólems sólo si están cerca; los aldeanos, en todo el radio.
      if (d >= bd || Math.abs(o.y - e.y) > 6 || (o.type === MOB_IRON_GOLEM && d > 10)) continue;
      if (!blind && !lineOfSight(this.m.w, e.x, e.y + e.height * 0.85, e.z, o.x, o.y + o.height * 0.7, o.z)) continue;
      bd = d;
      best = { e: o };
    }
    ai.target = best?.p ? best.p.id : null;
    return best;
  }

  /** Golpe cuerpo a cuerpo a la presa (jugador o criatura); true si la mató. */
  private hit(e: Entity, f: Foe, damage: number, knock: number): boolean {
    const dx = fx(f) - e.x, dz = fz(f) - e.z;
    const d = Math.hypot(dx, dz) || 1;
    this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
    if (f.p) {
      this.m.host.hurtPlayer(f.p.id, damage * this.m.difficultyScale(), (dx / d) * 5 * knock, 4 + knock, (dz / d) * 5 * knock, MOBS[e.type].key, e); // Fase 7: e (Espinas)
      return false;
    }
    f.e!.invuln = 0;
    return this.m.damage(f.e!, damage * this.m.difficultyScale(), e.x, e.z, e.id, knock);
  }

  // ------------------------------------------------------------------ illagers y devastador

  private raider(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const s = this.state(e);
    const monsters = this.brain.monsters;
    const foe = this.pick(e, players, e.raid ? 32 : e.type === MOB_RAVAGER ? 20 : 16, dt);
    let mx = 0, mz = 0, speed = 0, jump = false;
    let lookAt: [number, number, number] | null = null;
    let acting = false;
    if (foe) {
      const tx = fx(foe), ty = fy(foe), tz = fz(foe);
      const dx = tx - e.x, dz = tz - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      const dist3 = Math.hypot(dx, ty - e.y, dz); // la distancia de verdad, para los ataques a distancia
      lookAt = [tx, ty + fh(foe) * 0.85, tz];
      const los = dist < 24 && lineOfSight(this.m.w, e.x, e.y + e.height * 0.85, e.z, tx, ty + fh(foe) * 0.6, tz);
      const chase = (): void => {
        if (dist < 2.2 && los) {
          mx = dx / dist;
          mz = dz / dist;
        } else [mx, mz, jump] = this.brain.followPath(e, this.asView(foe), dt);
        speed = def.run;
      };
      switch (e.type) {
        case MOB_PILLAGER: {
          if (dist < 4) {
            mx = -dx / dist;
            mz = -dz / dist;
            speed = def.walk;
          } else if (dist3 > 8 || !los) chase();
          else {
            const side = Math.sin(e.age * 0.6 + e.id) > 0 ? 1 : -1;
            mx = (-dz / dist) * side;
            mz = (dx / dist) * side;
            speed = def.walk * 0.5;
          }
          // RangedCrossbowAttackGoal(8): dispara a 8 bloques como mucho.
          if (los && dist3 <= 8) {
            acting = ai.shootCd < CROSSBOW_CHARGE;
            if (ai.shootCd <= 0) {
              ai.shootCd = CROSSBOW_CHARGE + 1.2 + this.m.rand() * 1.2;
              this.shoot(e, foe);
            }
          } else ai.shootCd = Math.max(ai.shootCd, CROSSBOW_CHARGE);
          break;
        }
        case MOB_VINDICATOR:
        case MOB_RAVAGER: {
          chase();
          const reach = def.width / 2 + 1.2 + (foe.e ? foe.e.width / 2 : 0.3);
          acting = dist < reach + 1.5;
          if (e.type === MOB_RAVAGER && s.roared !== (foe.p?.id ?? foe.e!.id)) {
            s.roared = foe.p?.id ?? foe.e!.id;
            this.m.host.fx('ravager_roar', e.x, e.y + 1.8, e.z, e.type);
          }
          if (ai.attackCd <= 0 && canMeleeHit(this.m.w, e, fx(foe), fy(foe), fz(foe), foe.e ? foe.e.width : 0.6, fh(foe), foe.e ? fh(foe) * 0.85 : 1.62)) {
            ai.attackCd = e.type === MOB_RAVAGER ? 2 : 1;
            this.hit(e, foe, def.damage, e.type === MOB_RAVAGER ? 2.2 : 1);
          }
          break;
        }
        case MOB_EVOKER: {
          if (dist < 7) {
            mx = -dx / dist;
            mz = -dz / dist;
            speed = def.run;
          } else if (dist > 14 || !los) chase();
          s.fangsCd -= dt;
          s.vexCd -= dt;
          if (s.casting > 0) {
            s.casting -= dt;
            acting = true;
            mx = mz = speed = 0;
          } else if (los && dist3 < 20) {
            if (s.vexCd <= 0 && this.vexNear(e) < MAX_VEX) {
              s.vexCd = VEX_EVERY + this.m.rand() * 4;
              s.casting = 1.2;
              this.summonVex(e, foe);
            } else if (s.fangsCd <= 0) {
              s.fangsCd = FANGS_EVERY + this.m.rand() * 2;
              s.casting = 0.9;
              this.castFangs(e, tx, ty, tz, dist);
            }
          }
          break;
        }
      }
    } else if (e.raid !== undefined) {
      // En un asalto y sin nadie a la vista: hacia el centro de la aldea (y a rondar por allí).
      const c = this.m.raidCenters.get(e.raid);
      if (c && Math.hypot(c[0] - e.x, c[2] - e.z) > 6) {
        [mx, mz, jump] = this.brain.followPath(e, { id: '', name: '', x: c[0], y: c[1], z: c[2], alive: true, creative: false, lookingAt: -1 }, dt);
        speed = def.walk * 1.4;
      } else [mx, mz, speed] = monsters.wander(e);
    } else if (e.patrolTo) {
      // Patrulla: camina hacia su destino; el capitán marca el paso y los demás le siguen.
      const [px, pz] = e.patrolTo;
      if (Math.hypot(px - e.x, pz - e.z) > 3) {
        const d = Math.hypot(px - e.x, pz - e.z);
        mx = (px - e.x) / d;
        mz = (pz - e.z) / d;
        speed = def.walk;
      } else e.patrolTo = undefined;
    } else [mx, mz, speed] = monsters.wander(e);
    if (jump && e.onGround) e.vy = Math.max(e.vy, 8.6);
    if (e.type === MOB_RAVAGER && speed > 0) this.trample(e, mx, mz);
    monsters.walk(e, mx, mz, speed, lookAt, dt);
    this.brain.updateFlags(e, ai);
    if (acting) e.flags |= EF_ACTION;
    if (e.captain) e.flags |= EF_CAPTAIN;
  }

  /** Vista de jugador para followPath (que sólo usa la posición). */
  private asView(f: Foe): PlayerView {
    return f.p ?? { id: '', name: '', x: f.e!.x, y: f.e!.y, z: f.e!.z, alive: true, creative: false, lookingAt: -1 };
  }

  /** Virote de ballesta hacia la presa (más rápido y tenso que la flecha del esqueleto). */
  private shoot(e: Entity, f: Foe): void {
    const sx = e.x, sy = e.y + e.height * 0.78, sz = e.z;
    const tx = fx(f), ty = fy(f) + fh(f) * 0.6, tz = fz(f);
    const dx = tx - sx, dz = tz - sz;
    const horiz = Math.max(1e-3, Math.hypot(dx, dz));
    const speed = 36;
    const t = Math.max(0.05, horiz / speed);
    const spread = [0.1, 0.07, 0.05, 0.025][this.m.host.difficulty()] ?? 0.05;
    const vy = (ty - sy) / t + 0.5 * 20 * t;
    const vx = dx / t + (this.m.rand() - 0.5) * spread * speed;
    const vz = dz / t + (this.m.rand() - 0.5) * spread * speed;
    this.m.spawnArrow(sx + (dx / horiz) * 0.6, sy, sz + (dz / horiz) * 0.6, vx, vy + (this.m.rand() - 0.5) * spread * speed, vz, e.id, 2.2);
    this.m.host.fx('crossbow_shoot', sx, sy, sz, e.type);
  }

  /** El devastador arrasa hojas y cultivos que tiene delante. */
  private trample(e: Entity, mx: number, mz: number): void {
    if (this.m.rand() > 0.35) return;
    const w = this.m.w;
    const ax = Math.floor(e.x + mx * (e.width / 2 + 0.6)), az = Math.floor(e.z + mz * (e.width / 2 + 0.6));
    for (let dy = 0; dy < 3; dy++) {
      for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const bx = ax + ox, by = Math.floor(e.y) + dy, bz = az + oz;
        const b = w.getBlock(bx, by, bz);
        if (b > 0 && (isLeaves(b) || isCrop(b))) this.m.host.breakBlock(bx, by, bz, true);
      }
    }
  }

  // ------------------------------------------------------------------ evocador

  private vexNear(e: Entity): number {
    let n = 0;
    for (const o of this.m.list.values()) if (o.type === MOB_VEX && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < 16) n++;
    return n;
  }

  private summonVex(e: Entity, f: Foe): void {
    this.m.host.fx('evoker_cast', e.x, e.y + 2.2, e.z, 1);
    for (let i = 0; i < 3; i++) {
      const a = this.m.rand() * TAU;
      const v = this.m.spawnMob(MOB_VEX, e.x + Math.cos(a) * 1.2, e.y + 1.2 + this.m.rand(), e.z + Math.sin(a) * 1.2);
      if (!v) continue;
      const vs = this.state(v);
      vs.owner = e.id;
      if (e.raid !== undefined) v.raid = e.raid;
      if (f.p) v.ai!.target = f.p.id;
      else {
        vs.revenge = f.e!.id;
        vs.revengeT = 20;
      }
    }
  }

  /** Colmillos: en corro alrededor si la presa está encima; si no, en fila hacia ella. */
  private castFangs(e: Entity, tx: number, ty: number, tz: number, dist: number): void {
    this.m.host.fx('evoker_cast', e.x, e.y + 2.2, e.z, 0);
    const y = Math.min(e.y, ty);
    if (dist < 3) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        this.pending.push({ at: this.clock + 0.1, x: e.x + Math.cos(a) * 1.5, y, z: e.z + Math.sin(a) * 1.5, owner: e.id });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.4;
        this.pending.push({ at: this.clock + 0.4, x: e.x + Math.cos(a) * 2.5, y, z: e.z + Math.sin(a) * 2.5, owner: e.id });
      }
      return;
    }
    const dx = (tx - e.x) / dist, dz = (tz - e.z) / dist;
    for (let i = 0; i < 16; i++) {
      const d = 1.25 * (i + 1);
      this.pending.push({ at: this.clock + 0.05 * i, x: e.x + dx * d, y: y + (ty - y) * Math.min(1, d / dist), z: e.z + dz * d, owner: e.id });
    }
  }

  /** Suelo más cercano a (x, y, z) buscando unos bloques arriba y abajo (null si no hay). */
  private groundNear(x: number, y: number, z: number): number | null {
    const w = this.m.w;
    const bx = Math.floor(x), bz = Math.floor(z), by = Math.floor(y);
    for (let dy = 0; dy <= 4; dy++) {
      for (const yy of [by + dy, by - dy]) {
        const here = w.getBlock(bx, yy, bz), below = w.getBlock(bx, yy - 1, bz);
        if (here >= 0 && !BLOCK_SOLID[here] && !(here > 0 && BLOCK_FLUID[here] === 2) && below > 0 && BLOCK_SOLID[below]) return yy;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ colmillos

  private fangs(e: Entity): void {
    e.flags = e.age > 0.25 ? EF_ACTION : 0;
    if (e.age > 0.3 && !e.stuck) {
      e.stuck = true;
      const dmg = 6 * this.m.difficultyScale();
      for (const o of this.m.list.values()) {
        if (o === e || o.dead || !o.ai || isRaider(o.type) || o.type === MOB_VEX || MOBS[o.type].inert) continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) < 0.5 + o.width / 2 && o.y < e.y + 1 && o.y + o.height > e.y) {
          o.invuln = 0;
          this.m.damage(o, 6, e.x, e.z, typeof e.shooter === 'number' ? e.shooter : null, 0.3);
        }
      }
      for (const p of this.m.host.players()) {
        if (!p.alive || p.creative) continue;
        if (Math.hypot(p.x - e.x, p.z - e.z) < 0.8 && p.y < e.y + 1 && p.y + 1.8 > e.y) this.m.host.hurtPlayer(p.id, dmg, 0, 2, 0, 'evoker');
      }
      this.m.host.fx('fangs_bite', e.x, e.y + 0.4, e.z);
    }
    if (e.age > 1.15) this.m.remove(e.id);
  }

  // ------------------------------------------------------------------ vex

  private vex(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const s = this.state(e);
    // Se consume con el tiempo: pasado su plazo pierde vida cada segundo.
    s.life -= dt;
    if (s.life <= 0) {
      ai.think -= dt;
      if (ai.think <= 0) {
        ai.think = 1;
        e.invuln = 0;
        if (this.m.damage(e, 1, e.x, e.z, null, 0)) return;
      }
    }
    const owner = s.owner ? this.m.list.get(s.owner) : undefined;
    const foe = this.pick(e, players, 20, dt);
    let tx: number, ty: number, tz: number, speed: number;
    s.chargeCd -= dt;
    if (foe && s.charge > 0) {
      // Embestida: directo a la presa con la espada por delante.
      s.charge -= dt;
      tx = fx(foe);
      ty = fy(foe) + fh(foe) * 0.5;
      tz = fz(foe);
      speed = def.run;
      if (Math.hypot(tx - e.x, ty - (e.y + e.height / 2), tz - e.z) < 1.1 && ai.attackCd <= 0) {
        ai.attackCd = 1;
        s.charge = 0;
        this.hit(e, foe, def.damage, 0.6);
      }
      if (s.charge <= 0) s.chargeCd = 1.2 + this.m.rand() * 1.5;
    } else {
      s.charge = 0;
      // Revolotea cerca de la presa (o de su dueño) esperando el momento.
      const cx = foe ? fx(foe) : owner?.x ?? e.x, cz = foe ? fz(foe) : owner?.z ?? e.z;
      const cy = (foe ? fy(foe) : owner?.y ?? e.y) + 1.5;
      const a = e.age * 0.9 + e.id;
      tx = cx + Math.cos(a) * 3;
      tz = cz + Math.sin(a) * 3;
      ty = cy + Math.sin(e.age * 1.7 + e.id) * 0.8;
      speed = def.walk;
      if (foe && s.chargeCd <= 0) s.charge = 1.6;
    }
    const dx = tx - e.x, dy = ty - (e.y + e.height / 2), dz = tz - e.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * 4);
    const go = d < 0.3 ? 0 : speed;
    e.vx += ((dx / d) * go - e.vx) * k;
    e.vy += ((dy / d) * go - e.vy) * k;
    e.vz += ((dz / d) * go - e.vz) * k;
    // Atraviesa bloques: se mueve sin colisiones.
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.z += e.vz * dt;
    e.onGround = false;
    e.hitWall = false;
    e.fallStart = e.y;
    const h = Math.hypot(e.vx, e.vz);
    if (h > 0.2) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 8);
    if (foe) e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, fx(foe), fz(foe)), dt * 10);
    else e.yaw = e.bodyYaw;
    this.brain.updateFlags(e, ai);
    if (s.charge > 0) e.flags |= EF_ACTION;
  }

  // ------------------------------------------------------------------ zombis contra aldeanos

  private zombieHunt(e: Entity, dt: number, players: PlayerView[]): boolean {
    const ai = e.ai!;
    // Con un jugador a la vista, se encarga MobBrain como siempre.
    if (ai.target || this.brain.nearestPlayer(e, players, 24, true)) return false;
    let prey: Entity | null = null, bd = 16;
    for (const o of this.m.list.values()) {
      if (o.dead || !o.ai || (o.type !== MOB_VILLAGER && o.type !== MOB_WANDERING_TRADER)) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < bd && Math.abs(o.y - e.y) < 4) {
        bd = d;
        prey = o;
      }
    }
    if (!prey) return false;
    const def = MOBS[e.type];
    const dx = prey.x - e.x, dz = prey.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx: number, mz: number, jump = false;
    if (dist < 2) {
      mx = dx / dist;
      mz = dz / dist;
    } else [mx, mz, jump] = this.brain.followPath(e, this.asView({ e: prey }), dt);
    if (jump && e.onGround) e.vy = Math.max(e.vy, 8.6);
    if (dist < def.width / 2 + prey.width / 2 + 0.9 && Math.abs(prey.y - e.y) < 1.5 && ai.attackCd <= 0) {
      ai.attackCd = 1;
      const convert = this.m.rand() < (CONVERT_CHANCE[this.m.host.difficulty()] ?? 0);
      if (convert && prey.type === MOB_VILLAGER && prey.health <= def.damage * this.m.difficultyScale()) {
        // Muerde al aldeano y lo convierte en aldeano zombi.
        this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
        this.brain.monsters.convert(prey, MOB_ZOMBIE_VILLAGER);
      } else this.hit(e, { e: prey }, def.damage, 1);
    }
    this.brain.monsters.walk(e, mx, mz, def.run, [prey.x, prey.y + 1.5, prey.z], dt);
    this.brain.updateFlags(e, ai);
    return true;
  }
}
