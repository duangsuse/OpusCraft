// Fase 6 (monturas): el jugador montado, en el cliente.
//
// Clic derecho sobre una montura pide montarse ('mount'); el servidor contesta con 'ride' a todos.
// Si la montura está domada y con silla, este cliente la guía: simula su cuerpo con la física de las
// criaturas (W/S adelante y atrás, A/D de lado, mira hacia donde mira la cámara, sube escalones de un
// bloque y, en caballos, burros y mulas, salto cargado manteniendo el espacio) y manda su posición
// ('mpos') junto a la del jugador; si el servidor la rechaza ('mfix') vuelve a donde él dice. Si no
// la guía (sin domar, cerdo con silla, llama) el jugador va sentado donde el servidor la lleve.
// Mayúsculas para bajarse. Los demás jugadores se dibujan sentados sobre la montura que llevan.
import { moveBody, boxCollides, type Body } from '../../shared/sim/physics';
import { MOBS, MOB_PIG } from '../../shared/mobs';
import { MOUNTS, RIDER_HIP } from '../../shared/mounts';
import { SADDLE, BREED_FOOD } from '../../shared/items';
import { EF_BABY, EF_SADDLE, EF_TAMED, type ServerMsg } from '../../shared/protocol';
import type { MoveControls } from './Player';
import type { ClientEntity } from './ClientEntities';
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { Game } from './Game';

const GRAVITY = 32;
/** Las monturas suben escalones de un bloque sin saltar. */
const STEP = 1.05;
const TAU = Math.PI * 2;
const NO_CONTROLS: MoveControls = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };

interface MountBody extends Body {
  yaw: number;
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = (((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI;
  return a + (Number.isFinite(d) ? d : 0) * Math.min(1, t);
}

export class Riding {
  /** Entidad que monta este jugador (-1: va a pie). */
  entityId = -1;
  /** La guía él (si no, la lleva el servidor). */
  controlled = false;
  /** Jugador → entidad que monta (los demás y este). */
  readonly riders = new Map<string, number>();
  private type = 0;
  /** Velocidad y salto de la montura (del servidor). */
  private stats: [number, number] = [0, 0];
  private body: MountBody | null = null;
  /** Carga del salto (0..1; -1 sin cargar). */
  private charge = -1;
  private walkPhase = 0;
  private walkAmount = 0;
  /** Pidió bajarse (el 'ride' vacío que llegue después no es que le hayan tirado). */
  private asked = false;
  /** Segundos que lleva sin ver la entidad que monta. */
  private missing = 0;
  private lastKey = '';
  private bar: HTMLDivElement | null = null;
  private barFill: HTMLDivElement | null = null;

  constructor(private g: Game) {}

  get active(): boolean {
    return this.entityId > 0;
  }

  // ------------------------------------------------------------------ red

  /** Mensajes del servidor de las monturas ('ride', 'mfix'); true si era uno de ellos. */
  onMessage(msg: ServerMsg): boolean {
    if (msg.t === 'ride') {
      this.onRide(msg);
      return true;
    }
    if (msg.t === 'mfix') {
      const p = Array.isArray(msg.p) ? msg.p.map(Number) : [];
      if (this.body && msg.e === this.entityId && p.length === 3 && p.every(Number.isFinite)) {
        [this.body.x, this.body.y, this.body.z] = p;
        this.body.vx = this.body.vy = this.body.vz = 0;
        this.lastKey = '';
      }
      return true;
    }
    return false;
  }

  private onRide(msg: Extract<ServerMsg, { t: 'ride' }>): void {
    const id = String(msg.id);
    const e = Number(msg.e);
    if (!Number.isInteger(e) || e < 0) return;
    if (e > 0) this.riders.set(id, e);
    else this.riders.delete(id);
    if (id !== this.g.net?.id) return;
    if (e === 0) {
      if (this.active) this.leave(!this.asked);
      this.asked = false;
      return;
    }
    const again = this.entityId === e;
    const controlled = !!msg.c;
    this.entityId = e;
    this.asked = false;
    this.missing = 0;
    if (Array.isArray(msg.st) && msg.st.length === 2 && msg.st.every(Number.isFinite)) this.stats = [Number(msg.st[0]), Number(msg.st[1])];
    const ent = this.g.ents.list.get(e);
    if (ent) this.type = ent.type;
    if (controlled && (!this.controlled || !again || !this.body)) this.startBody(ent);
    if (!controlled) this.body = null;
    this.controlled = controlled;
    const md = MOUNTS[this.type];
    if (again) this.g.ui.toast(md?.saddle ? '¡Domado! Ponle una silla para guiarlo.' : '¡Domada!');
    else if (controlled) this.g.ui.toast(md?.chargeJump ? 'Mayús: bajarse · Espacio (mantener): saltar' : 'Mayús: bajarse');
    else if (md?.tameable && ent && !(ent.flags & EF_TAMED)) this.g.ui.toast('Aguanta… a ver si se deja domar');
    else this.g.ui.toast('Mayús: bajarse');
  }

  /** Cuerpo local de la montura que guía (alto como montura y jinete, si cabe). */
  private startBody(ent?: ClientEntity): void {
    const def = MOBS[this.type];
    const md = MOUNTS[this.type];
    const p = this.g.player;
    if (!def || !md) {
      this.body = null;
      return;
    }
    const x = ent?.x ?? p.x, y = ent?.y ?? p.y + RIDER_HIP - md.seat, z = ent?.z ?? p.z;
    const hw = def.width / 2;
    let height = Math.max(def.height, md.seat + 0.95);
    const world = this.g.world;
    if (world && boxCollides(world, x - hw, y + 0.01, z - hw, x + hw, y + height, z + hw)) height = def.height;
    this.body = {
      x, y, z, vx: 0, vy: 0, vz: 0, width: def.width, height, onGround: false, inWater: false, inLava: false, hitWall: false,
      yaw: ent?.bodyYaw ?? p.yaw,
    };
    this.charge = -1;
    this.lastKey = '';
  }

  /** Manda la posición de la montura que guía (a la vez que 'pos', sólo si cambió). */
  send(): void {
    const b = this.body;
    if (!this.active || !this.controlled || !b || !this.g.net) return;
    const q = (v: number, s: number) => Math.round(v / s);
    const key = `${q(b.x, 0.05)},${q(b.y, 0.05)},${q(b.z, 0.05)},${q(b.yaw, 0.03)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    this.g.net.send({ t: 'mpos', e: this.entityId, p: [r3(b.x), r3(b.y), r3(b.z)], r: r3(b.yaw) });
  }

  // ------------------------------------------------------------------ interacción

  /**
   * Clic derecho sobre una criatura: poner la silla o montarse. Devuelve true si se encargó (la
   * comida sigue su camino normal: criar o, sin domar, calmarla).
   */
  onUse(target: ClientEntity, item: number): boolean {
    const def = MOBS[target.type];
    const md = MOUNTS[target.type];
    if (!def || !md || target.deathT >= 0) return false;
    const baby = (target.flags & EF_BABY) !== 0;
    if (item === SADDLE) {
      if (!md.saddle || baby || target.flags & EF_SADDLE) return false;
      if (md.tameable && !(target.flags & EF_TAMED)) {
        this.g.ui.toast('Primero tienes que domarlo: móntate hasta que se deje.');
        return true;
      }
      this.g.interaction.interactEntity(target, SADDLE);
      return true;
    }
    if (BREED_FOOD[def.key]?.includes(item)) return false;
    if (baby || this.active || this.g.player.sneaking) return false;
    if (target.type === MOB_PIG && !(target.flags & EF_SADDLE)) return false;
    this.g.net?.send({ t: 'mount', e: target.id });
    this.g.swing(false);
    return true;
  }

  /** Mayúsculas (o morir, o dormirse): bajarse ya, sin esperar al servidor. `place`: dejarlo a un lado. */
  requestDismount(place = true): void {
    if (!this.active) return;
    this.asked = true;
    this.g.net?.send({ t: 'dismount' });
    this.leave(false, place);
  }

  /** Deja al jugador a un lado de la montura (y, si le ha tirado, con un empujón). */
  private leave(thrown: boolean, place = true): void {
    if (!place) {
      this.reset();
      return;
    }
    const g = this.g, p = g.player;
    const e = g.ents.list.get(this.entityId);
    const def = MOBS[this.type];
    const md = MOUNTS[this.type];
    const b = this.body;
    const x = b?.x ?? e?.x ?? p.x;
    const y = b?.y ?? e?.y ?? p.y + RIDER_HIP - (md?.seat ?? 1);
    const z = b?.z ?? e?.z ?? p.z;
    const yaw = b?.yaw ?? e?.bodyYaw ?? p.yaw;
    const side = (def?.width ?? 1) / 2 + 0.45;
    const world = g.world;
    // Por la izquierda; si no hay sitio, por la derecha; si tampoco, encima.
    const spots: [number, number][] = [[x - Math.cos(yaw) * side, z + Math.sin(yaw) * side], [x + Math.cos(yaw) * side, z - Math.sin(yaw) * side]];
    const free = spots.find(([sx, sz]) => !world || !boxCollides(world, sx - 0.3, y + 0.01, sz - 0.3, sx + 0.3, y + 1.8, sz + 0.3));
    if (free) [p.x, p.z] = free;
    else [p.x, p.z] = [x, z];
    p.y = free ? y + 0.05 : y + (md?.seat ?? 1);
    p.vx = p.vy = p.vz = 0;
    p.fallDistance = 0;
    if (world) p.unstuck(world);
    if (thrown) {
      p.impulse(Math.sin(yaw) * 4, 5, Math.cos(yaw) * 4);
      g.ui.toast('¡Te ha tirado! Vuelve a intentarlo (o dale de comer para calmarlo).');
    }
    this.reset();
  }

  private reset(): void {
    this.entityId = -1;
    this.controlled = false;
    this.body = null;
    this.type = 0;
    this.charge = -1;
    this.walkAmount = 0;
    this.renderBar();
  }

  // ------------------------------------------------------------------ cada frame

  /**
   * En lugar del movimiento del jugador: devuelve false si va a pie (entonces se mueve él). Montado,
   * mueve la montura que guía (o nada, si la lleva el servidor) y sienta al jugador en ella.
   */
  update(dt: number, c: MoveControls, active: boolean): boolean {
    if (!this.active) return false;
    const g = this.g, p = g.player;
    if (g.survival.dead || g.life.sleeping || (active && g.input.wasPressed(g.cfg.settings.keys.sneak))) {
      // Dormido se queda en la cama: bajarse sin moverlo.
      this.requestDismount(!g.life.sleeping);
      return false;
    }
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    p.justLanded = false;
    p.landedFall = 0;
    p.walkAmount = 0;
    p.sprinting = false;
    p.sneaking = false;
    p.flying = false;
    if (this.controlled && this.body && g.world) this.steer(dt, active ? c : NO_CONTROLS);
    this.seat();
    return true;
  }

  private steer(dt: number, c: MoveControls): void {
    const b = this.body!;
    const md = MOUNTS[this.type];
    if (!md) return;
    const speed = this.stats[0] > 0 ? this.stats[0] : md.speed[0];
    const jump = this.stats[1] > 0 ? this.stats[1] : md.jump[0];
    // La montura mira hacia donde mira el jinete.
    b.yaw = lerpAngle(b.yaw, this.g.player.yaw, 1 - Math.exp(-dt * 10));
    const f = c.forward ? 1 : c.back ? -0.35 : 0;
    const s = ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * 0.4;
    const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
    const wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wet = b.inWater || b.inLava;
    const diver = !!md.underwater && b.inWater; // Fase 7.5 (fauna): el caballo esqueleto anda bajo el agua
    const v = speed * (diver ? 0.7 : wet ? 0.35 : 1);
    const k = 1 - Math.exp(-dt * (b.onGround ? 5 : wet ? 3 : 1));
    b.vx += (wx * v - b.vx) * k;
    b.vz += (wz * v - b.vz) * k;
    if (diver) {
      b.vy = Math.max(-3, b.vy - GRAVITY * 0.3 * dt);
      if (b.hitWall) b.vy = Math.max(b.vy, 4);
    } else if (wet) {
      // Nada con la cabeza fuera (como las criaturas).
      b.vy += (1.8 - b.vy) * Math.min(1, dt * 3);
      if (b.hitWall) b.vy = Math.max(b.vy, 4);
    } else {
      b.vy = Math.max(-60, b.vy - GRAVITY * dt);
    }
    if (md.chargeJump) {
      // Salto cargado: cuanto más se mantiene el espacio (hasta ~0,8 s), más alto.
      if (c.jump && b.onGround && (!wet || diver)) this.charge = Math.min(1, Math.max(0, this.charge) + dt / 0.8);
      else if (!c.jump && this.charge >= 0) {
        if (b.onGround) b.vy = jump * (0.45 + 0.55 * this.charge);
        this.charge = -1;
      }
    } else if (c.jump && b.onGround && !wet) b.vy = jump;
    const ox = b.x, oz = b.z;
    moveBody(b, this.g.world!, Math.min(dt, 0.05), STEP);
    const moved = Math.hypot(b.x - ox, b.z - oz);
    const target = dt > 0 ? Math.min(1, moved / dt / 4) : 0;
    this.walkAmount += (target - this.walkAmount) * (1 - Math.exp(-dt * 10));
    this.walkPhase += moved * 1.6;
  }

  /** Pone al jugador en el asiento (cadera sobre la silla). */
  private seat(): void {
    const md = MOUNTS[this.type];
    if (!md) return;
    const p = this.g.player;
    const b = this.body;
    const e = b ? null : this.g.ents.list.get(this.entityId);
    const src = b ?? e;
    if (!src) return;
    p.x = src.x;
    p.y = src.y + md.seat - RIDER_HIP;
    p.z = src.z;
  }

  /**
   * Después de interpolar las entidades: la montura que guía se dibuja donde está aquí (no donde el
   * servidor la vio hace un momento) y el jinete se sienta en la que lleve el servidor.
   */
  afterEntities(dt: number): void {
    if (!this.active) {
      this.renderBar();
      return;
    }
    const e = this.g.ents.list.get(this.entityId);
    if (!e) {
      // La montura ya no existe aquí (reconexión, se alejó): bajarse.
      this.missing += dt;
      if (this.missing > 2) this.leave(false);
      return;
    }
    this.missing = 0;
    if (!this.type) this.type = e.type;
    if (this.controlled && !this.body) this.startBody(e);
    const b = this.body;
    if (this.controlled && b) {
      e.x = b.x;
      e.y = b.y;
      e.z = b.z;
      e.yaw = e.bodyYaw = b.yaw;
      e.pitch = 0;
      e.lastX = e.x;
      e.lastZ = e.z;
      e.walkAmount = this.walkAmount;
      e.walkPhase = this.walkPhase;
    }
    this.seat();
    this.renderBar();
  }

  /** Otro jugador montado: sentado sobre su montura (si se ve). */
  placeRemote(id: string, v: RemotePlayerView): void {
    const eid = this.riders.get(id);
    v.riding = eid !== undefined;
    if (eid === undefined) return;
    const e = this.g.ents.list.get(eid);
    const md = e ? MOUNTS[e.type] : undefined;
    if (!e || !md) return;
    v.x = e.x;
    v.y = e.y + md.seat - RIDER_HIP;
    v.z = e.z;
    v.bodyYaw = e.bodyYaw;
    v.walkAmount = 0;
  }

  /** Barra de carga del salto (en el sitio de la de experiencia, como en Minecraft). */
  private renderBar(): void {
    const show = this.active && this.controlled && !!MOUNTS[this.type]?.chargeJump;
    if (!show) {
      if (this.bar) this.bar.style.display = 'none';
      return;
    }
    if (!this.bar) {
      const bar = document.createElement('div');
      bar.id = 'mount-jump';
      bar.style.cssText = 'position:fixed;left:50%;bottom:80px;width:182px;height:5px;margin-left:-91px;background:#1c1c1c;' +
        'border:1px solid #000;box-shadow:0 1px 2px rgba(0,0,0,.5);z-index:6;pointer-events:none';
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:0;background:linear-gradient(#9ac8ff 0 40%,#5a8dde 40% 70%,#2f5da8 70%)';
      bar.appendChild(fill);
      document.body.appendChild(bar);
      this.bar = bar;
      this.barFill = fill;
    }
    this.bar.style.display = '';
    this.barFill!.style.width = `${(Math.max(0, this.charge) * 100).toFixed(1)}%`;
  }
}
