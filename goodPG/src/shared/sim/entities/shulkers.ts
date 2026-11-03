// Fase 8.6 (el End): el shulker y su bala, portados de Shulker y ShulkerBullet de la 26.3 (a 20 ticks por segundo).
// - Pegado a una cara de un bloque (si se queda sin apoyo, busca otra cara en su celda o se teletransporta), nunca se
//   mueve. Sin objetivo, de vez en cuando se asoma (30 %) de 1 a 3 s. Busca jugadores que vea a 16 bloques (4 en el
//   eje de la cara donde se pega); con uno, se abre del todo y le dispara cada 1–5,5 s mientras esté a menos de 20.
// - Cerrado tiene 20 de armadura y las flechas le rebotan. Herido por debajo de la mitad, 1 de cada 4 veces se va a
//   una celda libre a 8 bloques como mucho con una cara donde pegarse. Si le da una bala de shulker estando abierto
//   y se teletransporta, deja otro donde estaba (menos probable cuantos más haya cerca). Al herirle, los shulkers de
//   alrededor también van a por el que le hirió.
// - Bala: vuela a saltos de un eje cada vez (una celda a 0,15 bloques por tick, acelerando un 2,5 % por tick) hacia su
//   objetivo, cambiando de eje al topar con algo o al alinearse; sin objetivo, cae. Hace 4 de daño y 10 s de
//   Levitación; un golpe la deshace.
import {
  MOB_SHULKER, ENT_SHULKER_BULLET, DIR6, oppositeDir, SHULKER_PEEKS, SHULKER_COVERED_ARMOR, SHULKER_BULLET_DAMAGE,
  SHULKER_LEVITATION_SECONDS, SHULKER_SHELL_CHANCE, SHULKER_SHELL_LOOTING, shulkerVariant, shulkerFace, shulkerPeekState,
  shulkerBox,
} from '../../endMobs';
import { MOBS } from '../../mobs';
import { BLOCK_COLLIDE, BLOCK_OPAQUE } from '../../blocks';
import { SHULKER_SHELL } from '../../items';
import { EFFECT_LEVITATION } from '../../effects';
import { armorReduce } from '../../armor';
import { lineOfSight } from '../physics';
import type { Entity, PlayerView } from './types';
import type { Entities } from './Entities';

const DT = 0.05;

interface ShulkerState {
  acc: number;
  /** Lo que se asoma ahora (currentPeekAmount, 0..1). */
  peek: number;
  /** Ticks que le quedan asomándose (ShulkerPeekGoal) y hasta el próximo disparo (ShulkerAttackGoal). */
  peekTime: number;
  attackTime: number;
  attacking: boolean;
  /** Objetivo (id de sesión) y ticks sin verlo. */
  target: string | null;
  unseen: number;
  /** Mirada: jugador al que mira (LookAtPlayerGoal) y cuánto le queda, o una dirección al azar. */
  lookAt: string | null;
  lookTime: number;
}

interface BulletState {
  acc: number;
  target: string | null;
  owner: number;
  dir: number;
  steps: number;
  tx: number;
  ty: number;
  tz: number;
}

export class ShulkerAI {
  private states = new Map<number, ShulkerState>();
  private bullets = new Map<number, BulletState>();
  /** Bala que está haciendo daño ahora (para saber si al shulker le da una de las suyas). */
  private hittingBullet = false;

  constructor(private m: Entities) {
    m.custom.set(MOB_SHULKER, (e, dt) => this.tick(e, dt));
    m.custom.set(ENT_SHULKER_BULLET, (e, dt) => this.bulletTick(e, dt));
  }

  private state(e: Entity): ShulkerState {
    let s = this.states.get(e.id);
    if (!s) {
      s = { acc: 0, peek: SHULKER_PEEKS[shulkerPeekState(e.variant ?? 0)] / 100, peekTime: 0, attackTime: 0, attacking: false, target: null, unseen: 0, lookAt: null, lookTime: 0 };
      this.states.set(e.id, s);
    }
    return s;
  }

  /** Coloca el shulker en su celda (setPos: el centro de abajo) y le da su variante (pegado abajo, cerrado). */
  init(e: Entity): void {
    e.x = Math.floor(e.x) + 0.5;
    e.y = Math.floor(e.y + 0.5);
    e.z = Math.floor(e.z) + 0.5;
    e.variant = shulkerVariant(shulkerFace(e.variant ?? 0), 0);
    e.bodyYaw = 0;
  }

  private face(e: Entity): number {
    return shulkerFace(e.variant ?? 0);
  }

  private rawPeek(e: Entity): number {
    return SHULKER_PEEKS[shulkerPeekState(e.variant ?? 0)];
  }

  /** setRawPeekAmount: con su sonido (cerrarse o abrirse). */
  private setPeek(e: Entity, state: number): void {
    if (shulkerPeekState(e.variant ?? 0) === state) return;
    e.variant = shulkerVariant(this.face(e), state);
    this.m.host.fx(state === 0 ? 'shulker_close' : 'shulker_open', e.x, e.y + 0.5, e.z);
  }

  closed(e: Entity): boolean {
    return this.rawPeek(e) === 0;
  }

  /** ¿Se puede pegar en la celda (x, y, z) a su cara `face`? (canStayAt: celda libre, cara entera y sitio para abrirse). */
  private canStayAt(_e: Entity | null, x: number, y: number, z: number, face: number): boolean {
    const w = this.m.w;
    // isPositionBlocked: la celda tiene que estar vacía.
    if (w.getBlock(x, y, z) !== 0) return false;
    const [dx, dy, dz] = DIR6[face];
    const on = w.getBlock(x + dx, y + dy, z + dz);
    if (on <= 0 || !BLOCK_COLLIDE[on] || !BLOCK_OPAQUE[on]) return false;
    // La caja abierta del todo no puede chocar con bloques.
    const [ox, oy, oz] = DIR6[oppositeDir(face)];
    const nx = x + ox, ny = y + oy, nz = z + oz;
    const n = w.getBlock(nx, ny, nz);
    return n === 0 || !BLOCK_COLLIDE[n];
  }

  /** findAttachableSurface: la primera cara (abajo, arriba, norte, sur, oeste, este) donde se puede pegar. */
  private attachable(e: Entity | null, x: number, y: number, z: number): number {
    for (let f = 0; f < 6; f++) if (this.canStayAt(e, x, y, z, f)) return f;
    return -1;
  }

  /** teleportSomewhere: 5 intentos a ±8 bloques; celda vacía con una cara donde pegarse. */
  teleport(e: Entity): boolean {
    if (e.dead) return false;
    const w = this.m.w;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    const r = () => Math.floor(this.m.rand() * 17) - 8;
    for (let i = 0; i < 5; i++) {
      const x = bx + r(), y = by + r(), z = bz + r();
      if (y <= 0 || w.getBlock(x, y, z) !== 0 || !w.isLoaded(Math.floor(x / 16), Math.floor(z / 16))) continue;
      if (this.occupied(e, x, y, z)) continue;
      const f = this.attachable(e, x, y, z);
      if (f < 0) continue;
      this.m.host.fx('shulker_teleport', e.x, e.y + 0.5, e.z);
      e.x = x + 0.5;
      e.y = y;
      e.z = z + 0.5;
      e.variant = shulkerVariant(f, 0);
      const s = this.state(e);
      s.peek = 0;
      s.target = null;
      s.attacking = false;
      this.m.host.fx('shulker_teleport', e.x, e.y + 0.5, e.z);
      return true;
    }
    return false;
  }

  /** ¿Hay otra criatura (u otro shulker) en esa celda? */
  private occupied(self: Entity, x: number, y: number, z: number): boolean {
    for (const o of this.m.list.values()) {
      if (o === self || !o.ai || o.dead) continue;
      if (o.x + o.width / 2 > x && o.x - o.width / 2 < x + 1 && o.z + o.width / 2 > z && o.z - o.width / 2 < z + 1 && o.y + o.height > y && o.y < y + 1) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ daño

  /** Lo que le llega de un golpe: cerrado, 20 de armadura (y las flechas no le hacen nada). */
  absorb(e: Entity, amount: number): number {
    if (e.type !== MOB_SHULKER || !this.closed(e)) return amount;
    return armorReduce(amount, SHULKER_COVERED_ARMOR, 0);
  }

  /** ¿Rebota la flecha? (cerrado, las flechas no le hacen daño). */
  deflectsArrow(e: Entity): boolean {
    return e.type === MOB_SHULKER && this.closed(e);
  }

  /** Tras un golpe (hurtServer): teletransporte, duplicación por su propia bala y aviso a los de alrededor. */
  onDamaged(e: Entity, attacker: string | number | null): void {
    if (e.type !== MOB_SHULKER || e.dead) return;
    const s = this.state(e);
    if (typeof attacker === 'string') {
      s.target = attacker;
      s.unseen = 0;
      // HurtByTargetGoal.setAlertOthers: los shulkers de alrededor sin objetivo, también.
      for (const o of this.m.list.values()) {
        if (o === e || o.type !== MOB_SHULKER || o.dead) continue;
        if (Math.abs(o.x - e.x) > 16 || Math.abs(o.z - e.z) > 16 || Math.abs(o.y - e.y) > 10) continue;
        const os = this.state(o);
        if (!os.target) os.target = attacker;
      }
    }
    if (e.health < e.maxHealth * 0.5 && this.m.rand() < 0.25) this.teleport(e);
    else if (this.hittingBullet) this.hitByBullet(e);
  }

  /** hitByShulkerBullet: abierto, se va y deja otro (falla más cuantos más shulkers haya a 8 bloques). */
  private hitByBullet(e: Entity): void {
    const [ox, oy, oz] = [e.x, e.y, e.z];
    if (this.closed(e) || !this.teleport(e)) return;
    let n = 0;
    for (const o of this.m.list.values()) {
      if (o.type === MOB_SHULKER && !o.dead && Math.abs(o.x - ox) <= 8.5 && Math.abs(o.y - oy) <= 8.5 && Math.abs(o.z - oz) <= 8.5) n++;
    }
    if (this.m.rand() < (n - 1) / 5) return;
    const baby = this.m.spawnMob(MOB_SHULKER, ox, oy, oz);
    if (baby) this.init(baby);
  }

  /** Botín: la concha, al 50 % (+6,25 % por nivel de Saqueo). */
  onKilled(e: Entity): void {
    if (e.type !== MOB_SHULKER) return;
    this.states.delete(e.id);
    if (this.m.rand() < SHULKER_SHELL_CHANCE + SHULKER_SHELL_LOOTING * this.m.looting) this.m.dropStacks([{ id: SHULKER_SHELL, count: 1 }], e.x, e.y + 0.5, e.z);
  }

  // ------------------------------------------------------------------ tick

  private tick(e: Entity, dt: number): void {
    e.vx = e.vy = e.vz = 0;
    const s = this.state(e);
    s.acc += dt;
    while (s.acc >= DT) {
      s.acc -= DT;
      this.step(e, s);
      if (e.dead || !this.m.list.has(e.id)) return;
    }
  }

  private step(e: Entity, s: ShulkerState): void {
    const m = this.m;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    // Sin apoyo: otra cara o a otra parte.
    if (!this.canStayAt(e, bx, by, bz, this.face(e))) {
      const f = this.attachable(e, bx, by, bz);
      if (f >= 0) e.variant = shulkerVariant(f, shulkerPeekState(e.variant ?? 0));
      else this.teleport(e);
    }
    // Lo que se asoma va hacia lo pedido, 0,05 por tick.
    const want = this.rawPeek(e) / 100;
    if (s.peek < want) s.peek = Math.min(want, s.peek + 0.05);
    else if (s.peek > want) s.peek = Math.max(want, s.peek - 0.05);
    // getDefaultDimensions: pegado abajo, crece hacia arriba lo que se asoma.
    e.height = this.face(e) === 0 ? 1 + s.peek : 1;
    const players = m.host.players();
    const peaceful = m.host.difficulty() === 0;
    // Objetivo: el que le hirió o el jugador más cercano que vea (buscado 1 de cada 10 ticks).
    let target = s.target ? players.find((p) => p.id === s.target && p.alive && !p.creative) ?? null : null;
    if (target) {
      if (this.sees(e, target)) s.unseen = 0;
      else if (++s.unseen > 60) target = null;
      if (target && this.dist2(e, target) > 16 * 16) target = null;
    }
    if (!target && !peaceful && m.rand() < 0.1) target = this.findTarget(e, players);
    s.target = peaceful ? null : target?.id ?? null;
    if (peaceful) target = null;
    // ShulkerAttackGoal.
    if (target) {
      if (!s.attacking) {
        s.attacking = true;
        s.attackTime = 20;
        this.setPeek(e, 2);
      }
      this.look(e, target.x, target.y + 1.6, target.z);
      if (this.dist2(e, target) < 400) {
        if (--s.attackTime <= 0) {
          s.attackTime = 20 + Math.floor(m.rand() * 10) * 10;
          this.shoot(e, target);
        }
      } else s.target = null;
      return;
    }
    if (s.attacking) {
      s.attacking = false;
      this.setPeek(e, 0);
    }
    // ShulkerPeekGoal.
    if (s.peekTime > 0) {
      if (--s.peekTime <= 0) this.setPeek(e, 0);
    } else if (m.rand() < 1 / 40 && this.canStayAt(e, bx, by, bz, this.face(e))) {
      s.peekTime = 20 * (1 + Math.floor(m.rand() * 3));
      this.setPeek(e, 1);
    }
    // LookAtPlayerGoal (8 bloques, 2 % por tick, de 2 a 4 s) y RandomLookAroundGoal.
    if (s.lookTime > 0) {
      s.lookTime--;
      const p = s.lookAt ? players.find((q) => q.id === s.lookAt && q.alive) : null;
      if (p) this.look(e, p.x, p.y + 1.6, p.z);
    } else if (m.rand() < 0.02) {
      const p = players.filter((q) => q.alive && this.dist2(e, q) < 64).sort((a, b) => this.dist2(e, a) - this.dist2(e, b))[0];
      if (p) {
        s.lookAt = p.id;
        s.lookTime = 40 + Math.floor(m.rand() * 40);
      }
    } else if (m.rand() < 0.02) {
      s.lookAt = null;
      s.lookTime = 20 + Math.floor(m.rand() * 20);
      e.yaw = m.rand() * Math.PI * 2;
    }
  }

  private dist2(e: Entity, p: { x: number; y: number; z: number }): number {
    return (p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2;
  }

  private sees(e: Entity, p: PlayerView): boolean {
    return lineOfSight(this.m.w, e.x, e.y + 0.5, e.z, p.x, p.y + 1.6, p.z);
  }

  /** ShulkerNearestAttackGoal: el jugador más cercano a 16 bloques (4 en el eje de su cara) que se vea. */
  private findTarget(e: Entity, players: PlayerView[]): PlayerView | null {
    const axis = this.face(e) >> 1; // 0 y, 1 z, 2 x
    let best: PlayerView | null = null, bd = Infinity;
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const dx = Math.abs(p.x - e.x), dy = Math.abs(p.y - e.y), dz = Math.abs(p.z - e.z);
      const lim = (a: number) => (a === axis ? 4.5 : 16.5);
      if (dx > lim(2) || dy > lim(0) || dz > lim(1)) continue;
      const d = this.dist2(e, p);
      if (d > 16 * 16 || d >= bd) continue;
      const range = p.invisible ? 16 * 0.07 : 16;
      if (d > range * range || !this.sees(e, p)) continue;
      best = p;
      bd = d;
    }
    return best;
  }

  /** Mira hacia (x, y, z): la cabeza gira (el cliente la pasa a los ejes de su cara). */
  private look(e: Entity, x: number, y: number, z: number): void {
    e.yaw = Math.atan2(-(x - e.x), -(z - e.z));
    e.pitch = Math.atan2(y - (e.y + 0.5), Math.hypot(x - e.x, z - e.z));
  }

  // ------------------------------------------------------------------ bala

  private shoot(e: Entity, p: PlayerView): void {
    const m = this.m;
    m.makeRoom(ENT_SHULKER_BULLET, 64);
    const box = shulkerBox(e.x, e.y, e.z, this.face(e), this.state(e).peek);
    const b = m.spawnBare(ENT_SHULKER_BULLET, (box[0] + box[3]) / 2, (box[1] + box[4]) / 2 - 0.15625, (box[2] + box[5]) / 2, 0.3125, 0.3125);
    const bs: BulletState = { acc: 0, target: p.id, owner: e.id, dir: 1, steps: 0, tx: 0, ty: 0, tz: 0 };
    this.bullets.set(b.id, bs);
    this.selectDirection(b, bs, [1, 2, 0][this.face(e) >> 1], p);
    m.host.fx('shulker_shoot', e.x, e.y + 0.5, e.z);
  }

  /** Eje de una cara: 0 x, 1 y, 2 z. */
  private axisOf(dir: number): number {
    return dir < 2 ? 1 : dir < 4 ? 2 : 0;
  }

  /** selectNextMoveDirection: un eje hacia el objetivo por donde haya hueco (o cualquiera), una celda. */
  private selectDirection(b: Entity, s: BulletState, avoid: number, t: PlayerView | null): void {
    const m = this.m, w = m.w;
    const cx = Math.floor(b.x), cy = Math.floor(b.y), cz = Math.floor(b.z);
    let yOff = 0.5;
    let tx: number, ty: number, tz: number;
    if (!t) [tx, ty, tz] = [cx, cy - 1, cz];
    else {
      yOff = 0.9;
      [tx, ty, tz] = [Math.floor(t.x), Math.floor(t.y + yOff), Math.floor(t.z)];
    }
    let gx = tx + 0.5, gy = ty + yOff, gz = tz + 0.5;
    let dir = -1;
    const close = (gx - 0.5 - b.x + 0.5) ** 2 + (ty + 0.5 - b.y) ** 2 + (gz - 0.5 - b.z + 0.5) ** 2 < 4;
    if (!close) {
      const empty = (x: number, y: number, z: number) => w.getBlock(x, y, z) === 0;
      const opts: number[] = [];
      if (avoid !== 0) {
        if (cx < tx && empty(cx + 1, cy, cz)) opts.push(5);
        else if (cx > tx && empty(cx - 1, cy, cz)) opts.push(4);
      }
      if (avoid !== 1) {
        if (cy < ty && empty(cx, cy + 1, cz)) opts.push(1);
        else if (cy > ty && empty(cx, cy - 1, cz)) opts.push(0);
      }
      if (avoid !== 2) {
        if (cz < tz && empty(cx, cy, cz + 1)) opts.push(3);
        else if (cz > tz && empty(cx, cy, cz - 1)) opts.push(2);
      }
      dir = Math.floor(m.rand() * 6);
      if (!opts.length) {
        for (let n = 5; n > 0 && !empty(cx + DIR6[dir][0], cy + DIR6[dir][1], cz + DIR6[dir][2]); n--) dir = Math.floor(m.rand() * 6);
      } else dir = opts[Math.floor(m.rand() * opts.length)];
      gx = b.x + DIR6[dir][0];
      gy = b.y + DIR6[dir][1];
      gz = b.z + DIR6[dir][2];
    }
    s.dir = dir;
    const dx = gx - b.x, dy = gy - b.y, dz = gz - b.z;
    const d = Math.hypot(dx, dy, dz);
    if (d === 0) s.tx = s.ty = s.tz = 0;
    else {
      s.tx = (dx / d) * 0.15;
      s.ty = (dy / d) * 0.15;
      s.tz = (dz / d) * 0.15;
    }
    s.steps = 10 + Math.floor(m.rand() * 5) * 10;
  }

  private bulletTick(b: Entity, dt: number): void {
    const s = this.bullets.get(b.id);
    if (!s || this.m.host.difficulty() === 0) {
      this.bullets.delete(b.id);
      this.m.remove(b.id);
      return;
    }
    s.acc += dt;
    while (s.acc >= DT) {
      s.acc -= DT;
      if (!this.bulletStep(b, s)) return;
    }
  }

  /** Un tick de la bala; false si desapareció. */
  private bulletStep(b: Entity, s: BulletState): boolean {
    const m = this.m;
    const players = m.host.players();
    const t = s.target ? players.find((p) => p.id === s.target && p.alive) ?? null : null;
    // En bloques por tick (nuestras velocidades van en bloques por segundo).
    let vx = b.vx / 20, vy = b.vy / 20, vz = b.vz / 20;
    if (!t) {
      s.target = null;
      vy -= 0.04;
    } else {
      s.tx = Math.max(-1, Math.min(1, s.tx * 1.025));
      s.ty = Math.max(-1, Math.min(1, s.ty * 1.025));
      s.tz = Math.max(-1, Math.min(1, s.tz * 1.025));
      vx += (s.tx - vx) * 0.2;
      vy += (s.ty - vy) * 0.2;
      vz += (s.tz - vz) * 0.2;
    }
    b.vx = vx * 20;
    b.vy = vy * 20;
    b.vz = vz * 20;
    // Choques en el camino (getHitResultOnMoveVector): bloques y criaturas o jugadores.
    const n = Math.max(1, Math.ceil(Math.hypot(vx, vy, vz) / 0.2));
    for (let i = 1; i <= n; i++) {
      const x = b.x + (vx * i) / n, y = b.y + (vy * i) / n, z = b.z + (vz * i) / n;
      const id = m.w.getBlock(Math.floor(x), Math.floor(y + 0.15), Math.floor(z));
      if (id !== 0 && (id < 0 || BLOCK_COLLIDE[id])) {
        m.host.fx('shulker_bullet_hit', x, y + 0.15, z);
        return this.destroy(b);
      }
      for (const p of players) {
        if (!p.alive || p.creative) continue;
        if (Math.abs(p.x - x) < 0.46 && Math.abs(p.z - z) < 0.46 && y + 0.31 > p.y && y < p.y + 1.8) {
          m.host.hurtPlayer(p.id, SHULKER_BULLET_DAMAGE * m.difficultyScale(), 0, 0, 0, 'shulker_bullet');
          m.host.effectPlayer?.(p.id, EFFECT_LEVITATION, SHULKER_LEVITATION_SECONDS, 0);
          m.host.fx('shulker_bullet_hit', x, y + 0.15, z);
          return this.destroy(b);
        }
      }
      for (const o of m.list.values()) {
        if (!o.ai || o.dead || o.id === s.owner || MOBS[o.type].inert) continue;
        const hw = o.width / 2 + 0.16;
        if (Math.abs(o.x - x) < hw && Math.abs(o.z - z) < hw && y + 0.31 > o.y && y < o.y + o.height) {
          this.hittingBullet = true;
          const died = m.damage(o, SHULKER_BULLET_DAMAGE, b.x, b.z, s.owner, 0.3);
          this.hittingBullet = false;
          if (!died && !o.dead) m.effects.add(o, EFFECT_LEVITATION, SHULKER_LEVITATION_SECONDS, 0);
          m.host.fx('shulker_bullet_hit', x, y + 0.15, z);
          return this.destroy(b);
        }
      }
    }
    b.x += vx;
    b.y += vy;
    b.z += vz;
    b.yaw = Math.atan2(-vx, -vz);
    b.pitch = Math.atan2(vy, Math.hypot(vx, vz));
    if (!t) return b.age < 30 || this.destroy(b);
    // Cambia de eje al acabar el tramo, al topar con algo o al alinearse con el objetivo.
    if (s.steps > 0 && --s.steps === 0) this.selectDirection(b, s, s.dir < 0 ? -1 : this.axisOf(s.dir), t);
    if (s.dir >= 0) {
      const cx = Math.floor(b.x), cy = Math.floor(b.y), cz = Math.floor(b.z);
      const axis = this.axisOf(s.dir);
      const [dx, dy, dz] = DIR6[s.dir];
      const next = m.w.getBlock(cx + dx, cy + dy, cz + dz);
      if (next !== 0 && (next < 0 || BLOCK_COLLIDE[next])) this.selectDirection(b, s, axis, t);
      else if ((axis === 0 && cx === Math.floor(t.x)) || (axis === 2 && cz === Math.floor(t.z)) || (axis === 1 && cy === Math.floor(t.y))) {
        this.selectDirection(b, s, axis, t);
      }
    }
    return true;
  }

  private destroy(b: Entity): false {
    this.bullets.delete(b.id);
    this.m.remove(b.id);
    return false;
  }

  /** Un jugador golpea la bala: se deshace (hurtServer). */
  hitBullet(b: Entity): boolean {
    if (b.type !== ENT_SHULKER_BULLET) return false;
    this.m.host.fx('shulker_bullet_hurt', b.x, b.y + 0.15, b.z);
    this.destroy(b);
    return true;
  }

  /** Lo que se asoma ahora cada shulker (para su caja). */
  peekOf(e: Entity): number {
    return this.states.get(e.id)?.peek ?? 0;
  }
}
