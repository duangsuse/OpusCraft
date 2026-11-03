// Fase 6 (monturas): quién monta qué. El jugador pide montarse ('mount'); si la montura está domada
// y con silla la guía él: su cliente la mueve y manda su posición ('mpos'), que aquí se valida por
// velocidad y colisión (si no cuadra, 'mfix' la devuelve a su sitio). Si no, la montura va a su aire
// (el cerdo con silla, la llama) o, sin domar, tira al jinete hasta que se deja domar. Todos los
// jugadores reciben 'ride' con cada cambio (y los que entran, los que ya hay).
import { STATE_DEAD, type ClientMsg, type ServerMsg } from '../../protocol';
import { MOB_PIG, MOB_STRIDER } from '../../mobs';
import { MOUNTS } from '../../mounts';
import { WORLD_LIMIT, VOID_Y } from '../../constants';
import { boxCollides } from '../physics';
import type { Entity } from '../entities';
import { DT, r2, type ServerContext, type Session } from './context';

/** Distancia máxima para montarse (bloques). */
const MOUNT_REACH = 5;
/** Si el jinete se separa más que esto de su montura, se baja. */
const MAX_GAP = 6;
const TAU = Math.PI * 2;

interface Ride {
  /** Entidad montada. */
  e: number;
  /** Segundos hasta que una montura sin domar decide si se deja (0: no hay doma en curso). */
  buck: number;
  /** Momento (ms) del último movimiento aceptado. */
  last: number;
}

export class Riding {
  private rides = new Map<string, Ride>();

  constructor(private ctx: ServerContext) {}

  /** Entidad que monta el jugador (undefined si va a pie). */
  mountOf(playerId: string): number | undefined {
    return this.rides.get(playerId)?.e;
  }

  private rideMsg(playerId: string, e: Entity): ServerMsg {
    const msg: Extract<ServerMsg, { t: 'ride' }> = { t: 'ride', id: playerId, e: e.id, c: this.ctx.entities.mounts.controlled(e) };
    if (e.mountSpeed !== undefined) msg.st = [r2(e.mountSpeed), r2(e.mountJump ?? 0)];
    return msg;
  }

  onMount(s: Session, msg: Extract<ClientMsg, { t: 'mount' }>): void {
    const ctx = this.ctx;
    const e = ctx.entities.list.get(Number(msg.e));
    const md = e ? MOUNTS[e.type] : undefined;
    const ok = !!e && !!md && !!e.ai && !e.dead && !(s.s & STATE_DEAD) && !e.rider && !((e.growAge ?? 0) > 0) &&
      ((e.type !== MOB_PIG && e.type !== MOB_STRIDER) || !!e.saddled) && // Fase 8.3: el strider, también con silla
      (ctx.local || Math.hypot(e.x - s.p[0], e.y - s.p[1], e.z - s.p[2]) <= MOUNT_REACH);
    if (!ok || !e || !md) {
      // Rechazado: el cliente deja de esperar (si ya montaba algo, sigue montado).
      const cur = this.rides.get(s.id);
      const curE = cur ? ctx.entities.list.get(cur.e) : undefined;
      ctx.send(s, curE ? this.rideMsg(s.id, curE) : { t: 'ride', id: s.id, e: 0 });
      return;
    }
    if (this.rides.has(s.id)) this.dismount(s.id);
    e.rider = s.id;
    const ai = e.ai!;
    ai.panic = 0;
    ai.target = null;
    ai.angry = 0;
    this.rides.set(s.id, { e: e.id, buck: md.tameable && !e.tamed ? 1.5 + ctx.rand() * 2 : 0, last: ctx.now() });
    ctx.broadcast(this.rideMsg(s.id, e));
  }

  /** Baja al jugador de su montura (si iba montado) y se lo cuenta a todos. */
  dismount(playerId: string): void {
    const r = this.rides.get(playerId);
    if (!r) return;
    this.rides.delete(playerId);
    const e = this.ctx.entities.list.get(r.e);
    if (e && e.rider === playerId) {
      e.rider = undefined;
      e.vx = e.vy = e.vz = 0;
      e.fallStart = e.y;
    }
    this.ctx.broadcast({ t: 'ride', id: playerId, e: 0 });
  }

  /** Posición de la montura que guía el jugador: se acepta si es alcanzable desde la anterior. */
  onMove(s: Session, msg: Extract<ClientMsg, { t: 'mpos' }>): void {
    const ctx = this.ctx;
    const r = this.rides.get(s.id);
    const e = r ? ctx.entities.list.get(r.e) : undefined;
    if (!r || !e || Number(msg.e) !== e.id || !ctx.entities.mounts.controlled(e)) return;
    const p = Array.isArray(msg.p) && msg.p.length === 3 ? msg.p.map(Number) : [];
    const yaw = Number(msg.r);
    if (p.length !== 3 || !p.every(Number.isFinite) || !Number.isFinite(yaw)) return;
    const now = ctx.now();
    if (!ctx.local) {
      const md = MOUNTS[e.type];
      const dt = Math.max(0.05, Math.min(1, (now - r.last) / 1000));
      const speed = e.mountSpeed ?? md.speed[1];
      const jump = e.mountJump ?? md.jump[1];
      const horiz = Math.hypot(p[0] - e.x, p[2] - e.z);
      const hw = e.width / 2 - 0.05;
      const bad = horiz > speed * 1.5 * dt + 1.5 || p[1] - e.y > jump * dt + 1.3 ||
        Math.abs(p[0]) > WORLD_LIMIT || Math.abs(p[2]) > WORLD_LIMIT || p[1] < VOID_Y - 64 || p[1] > 1024 ||
        boxCollides(ctx.world, p[0] - hw, p[1] + 0.05, p[2] - hw, p[0] + hw, p[1] + e.height - 0.05, p[2] + hw);
      if (bad) {
        ctx.send(s, { t: 'mfix', e: e.id, p: [r2(e.x), r2(e.y), r2(e.z)] });
        return;
      }
    }
    r.last = now;
    e.x = p[0];
    e.y = p[1];
    e.z = p[2];
    e.yaw = e.bodyYaw = ((yaw % TAU) + TAU) % TAU;
    e.pitch = 0;
    e.vx = e.vy = e.vz = 0;
    e.fallStart = e.y;
  }

  /** Al entrar un jugador: quién va montado en qué. */
  onJoin(s: Session): void {
    for (const [pid, r] of this.rides) {
      const e = this.ctx.entities.list.get(r.e);
      if (e && pid !== s.id) this.ctx.send(s, this.rideMsg(pid, e));
    }
  }

  onLeave(s: Session): void {
    this.dismount(s.id);
  }

  /** Cada tick: bajar a los que ya no pueden ir montados y decidir las domas en curso. */
  tick(): void {
    if (this.rides.size === 0) return;
    const ctx = this.ctx;
    const byId = new Map<string, Session>();
    for (const s of ctx.sessions()) if (s.joined) byId.set(s.id, s);
    for (const [pid, r] of [...this.rides]) {
      const s = byId.get(pid);
      const e = ctx.entities.list.get(r.e);
      const off = !s || !e || e.dead || e.rider !== pid || (s.s & STATE_DEAD) !== 0 ||
        (!ctx.local && Math.hypot(e.x - s.p[0], e.z - s.p[2]) > MAX_GAP);
      if (off || !e) {
        this.dismount(pid);
        continue;
      }
      if (r.buck > 0) {
        r.buck -= DT;
        if (r.buck > 0) continue;
        if (ctx.entities.mounts.tryTame(e)) ctx.broadcast(this.rideMsg(pid, e));
        else this.dismount(pid);
      }
    }
  }
}
