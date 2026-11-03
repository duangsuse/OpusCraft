// Orbes de experiencia: aparecen al matar criaturas (si fue un jugador), al criar, al minar menas y
// al sacar lo fundido del horno o al morir; caen, se frenan, vuelan hacia el jugador vivo más
// cercano, se fusionan con los vecinos y se recogen al tocarlo.
import { ENT_XP, MOBS } from '../../mobs';
import { splitOrbs, mobXp, ORB_VALUES } from '../../experience';
import { moveBody, boxCollides } from '../physics';
import { MAX_XP_ORBS, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';

/** Distancia a la que un orbe empieza a volar hacia el jugador. */
const ATTRACT = 8;
/** Segundos hasta que desaparece (Minecraft: 5 minutos). */
const LIFETIME = 300;
/** Segundos que la última herida de un jugador cuenta para la experiencia de la criatura. */
const KILL_CREDIT = 5;
/** Espera entre dos orbes recogidos por el mismo jugador (Minecraft: 2 ticks). */
const PICKUP_GAP = 0.1;
/** Espera mínima entre dos 'dropxp' de un mismo jugador (ms). */
const DROP_COOLDOWN = 3000;
const MAX_ORB = ORB_VALUES[0];

export class XpOrbs {
  private grid = new Map<string, Entity[]>();
  /** Jugador → segundos que le faltan para poder recoger otro orbe. */
  private pickupWait = new Map<string, number>();
  /** Jugador → hora (ms) de su último 'dropxp'. */
  private lastDrop = new Map<string, number>();

  constructor(private m: Entities) {}

  /** Suelta `total` puntos repartidos en orbes alrededor de (x, y, z). */
  spawn(total: number, x: number, y: number, z: number): void {
    const r = this.m.rand;
    for (const v of splitOrbs(total)) {
      this.m.makeRoom(ENT_XP, MAX_XP_ORBS);
      const e = this.m.spawnBare(ENT_XP, x, y, z, 0.5, 0.5);
      e.xp = v;
      // Impulso inicial de Minecraft (±0,2 y hasta 0,4 bloques por tick).
      e.vx = (r() * 0.2 - 0.1) * 2 * 20;
      e.vy = r() * 0.2 * 2 * 20;
      e.vz = (r() * 0.2 - 0.1) * 2 * 20;
    }
  }

  /** Una criatura muere: experiencia si la hirió un jugador hace menos de 5 s. */
  onMobKilled(e: Entity): void {
    if (!e.ai || !e.lastHurtBy || e.lastHurtAt === undefined || e.age - e.lastHurtAt > KILL_CREDIT) return;
    const n = mobXp(e.type, (e.growAge ?? 0) > 0, this.m.rand);
    if (n > 0) this.spawn(n, e.x, e.y + (MOBS[e.type]?.height ?? 1) * 0.3, e.z);
  }

  /** Un jugador muere y pide soltar su experiencia (ya validada la cantidad); false si va muy seguido. */
  playerDrop(playerId: string, n: number, x: number, y: number, z: number, now: number): boolean {
    const last = this.lastDrop.get(playerId);
    if (last !== undefined && now - last < DROP_COOLDOWN) return false;
    this.lastDrop.set(playerId, now);
    if (this.lastDrop.size > 256) for (const [id, t] of this.lastDrop) if (now - t > DROP_COOLDOWN) this.lastDrop.delete(id);
    this.spawn(n, x, y, z);
    return true;
  }

  /** Al empezar cada tick: esperas de recogida y rejilla para fusionar orbes vecinos. */
  beginTick(dt: number): void {
    for (const [id, t] of this.pickupWait) {
      if (t - dt <= 0) this.pickupWait.delete(id);
      else this.pickupWait.set(id, t - dt);
    }
    this.grid.clear();
    for (const e of this.m.list.values()) {
      if (e.type !== ENT_XP) continue;
      const k = `${Math.floor(e.x)},${Math.floor(e.y)},${Math.floor(e.z)}`;
      const l = this.grid.get(k);
      if (l) l.push(e);
      else this.grid.set(k, [e]);
    }
  }

  orbTick(e: Entity, dt: number, players: PlayerView[]): void {
    if (e.age > LIFETIME || e.inLava) {
      if (e.inLava) this.m.host.fx('burn_item', e.x, e.y, e.z);
      this.m.remove(e.id);
      return;
    }
    const ticks = dt * 20;
    // Gravedad (0,03 bloques/tick²) y flotar en el agua.
    if (e.inWater) e.vy += (1.2 - e.vy) * Math.min(1, dt * 4);
    else e.vy -= 12 * dt;
    // Atracción hacia el jugador vivo más cercano (a menos de 8 bloques), como en Minecraft.
    let target: PlayerView | null = null, best = ATTRACT * ATTRACT;
    for (const p of players) {
      if (!p.alive) continue;
      const dx = p.x - e.x, dy = p.y + 0.8 - e.y, dz = p.z - e.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) {
        best = d2;
        target = p;
      }
    }
    if (target) {
      const dx = (target.x - e.x) / ATTRACT, dy = (target.y + 0.8 - e.y) / ATTRACT, dz = (target.z - e.z) / ATTRACT;
      const d = Math.hypot(dx, dy, dz);
      const k = 1 - d;
      if (k > 0 && d > 1e-4) {
        // 0,1 bloques/tick por tick con fuerza (1 − d)².
        const a = k * k * 0.1 * 20 * ticks;
        e.vx += (dx / d) * a;
        e.vy += (dy / d) * a;
        e.vz += (dz / d) * a;
      }
    }
    // Rozamiento: aire 0,98 por tick; en el suelo, además, el del bloque (0,6).
    const air = Math.pow(0.98, ticks);
    const ground = e.onGround ? Math.pow(0.6, ticks) : 1;
    e.vx *= air * ground;
    e.vy *= air;
    e.vz *= air * ground;
    // Si quedó dentro de un bloque, empujarlo hacia arriba.
    const hw = e.width / 2 - 0.01;
    if (boxCollides(this.m.w, e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.height - 0.01, e.z + hw)) {
      e.y += 3 * dt;
      e.vy = 0;
      e.onGround = false;
    } else moveBody(e, this.m.w, dt);
    e.flags = 0;
    if (target && this.touches(e, target)) {
      if (!this.pickupWait.has(target.id)) {
        this.pickupWait.set(target.id, PICKUP_GAP);
        this.m.remove(e.id, target.id);
        this.m.host.giveXp(target.id, e.xp ?? 1);
      }
      return;
    }
    if (((e.id + Math.floor(e.age * 4)) & 7) === 0) this.merge(e);
  }

  /** ¿Toca el orbe la caja del jugador ampliada 1 bloque en horizontal y 0,5 en vertical (Minecraft)? */
  private touches(e: Entity, p: PlayerView): boolean {
    const reach = 0.3 + 1 + e.width / 2;
    return Math.abs(e.x - p.x) < reach && Math.abs(e.z - p.z) < reach && e.y + e.height > p.y - 0.5 && e.y < p.y + 1.8 + 0.5;
  }

  /** Absorbe los orbes vecinos (hasta el valor máximo) para no llenar el mundo de entidades. */
  private merge(e: Entity): void {
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const l = this.grid.get(`${bx + dx},${by + dy},${bz + dz}`);
      if (!l) continue;
      for (const o of l) {
        if (o === e || !this.m.list.has(o.id) || !this.m.list.has(e.id)) continue;
        if (Math.abs(o.x - e.x) > 0.5 || Math.abs(o.y - e.y) > 0.5 || Math.abs(o.z - e.z) > 0.5) continue;
        const sum = (e.xp ?? 1) + (o.xp ?? 1);
        if (sum > MAX_ORB) continue;
        e.xp = sum;
        e.age = Math.min(e.age, o.age);
        this.m.remove(o.id);
      }
    }
  }
}
