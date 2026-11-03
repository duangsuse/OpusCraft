// Fase 7 (transporte): barcas y vagonetas en el cliente.
//
// - Poner: con una barca en la mano, clic derecho en el agua (el rayo se para en la superficie) o en el
//   suelo; con una vagoneta, sobre un raíl ('vplace'; el objeto se gasta con la respuesta 'ires').
// - Usar: clic derecho sube ('vride'); en la barca con cofre, agachado abre el cofre; la vagoneta con
//   cofre abre el cofre; la de horno se alimenta con carbón (y empuja) con 'interact'.
// - Montado delante (el que rema o lleva la vagoneta): este cliente mueve la barca o la vagoneta con la
//   misma física que el servidor (sim/vehicles), a 20 ticks por segundo e interpolada al dibujarla, y
//   manda su posición ('vpos'); si el servidor la rechaza ('vfix') vuelve a donde él dice. En la barca,
//   W/A/S/D reman y la vista gira con ella (hasta 105° a cada lado, como en Minecraft); en la vagoneta,
//   W/A/S/D la empujan un poco si está casi parada. Detrás (segundo pasajero) se va sentado donde la
//   lleve el servidor. Mayúsculas para bajarse.
// - Los demás jugadores se dibujan sentados en su plaza ('vpass' dice quién va en cada una).
import { MOB_SHULKER } from '../../shared/endMobs'; // Fase 8.6
import { shulkerCollisionBox } from '../render/shulkerPose';
import { boxCollides } from '../../shared/sim/physics';
import { boatStep, paddlesOf, BOAT_IN_WATER, type BoatBody, type BoatInput } from '../../shared/sim/vehicles/boatPhysics';
import { cartStep, type CartBody } from '../../shared/sim/vehicles/cartPhysics';
import {
  ENT_BOAT, ENT_CHEST_BOAT, ENT_CHEST_MINECART, ENT_FURNACE_MINECART, isBoatType, isCartType, isVehicleType, seatPos, vehicleSize,
  vehicleContainerPos, vehicleOfContainer, VF_PADDLE_L, VF_PADDLE_R, pushApart,
} from '../../shared/vehicles';
import { PLAYER_WIDTH } from '../../shared/constants'; // Fase 7 (remate)
import { vehicleForItem, isRideable, vehicleTitle } from '../../shared/vehicleItems';
import { ENT_HOPPER_MINECART } from '../../shared/vehicles'; // Fase 7 (mecanismos)
import { RIDER_HIP } from '../../shared/mounts';
import type { ItemStack } from '../../shared/items';
import { isRail, BLOCK_FLUID } from '../../shared/blocks';
import type { ServerMsg } from '../../shared/protocol';
import { raycast, type RayHit } from './raycast';
import { REACH_CREATIVE, REACH_SURVIVAL } from './gameTypes';
import type { MoveControls } from './Player';
import type { ClientEntity } from './ClientEntities';
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { Interaction } from './interaction';
import type { Game } from './Game';

const TICK = 1 / 20;
const TAU = Math.PI * 2;
/**
 * Fase 7 (remate): empujón de una barca o vagoneta que se solapa con el jugador (bloques/s² con el
 * empujón a tope; Minecraft: 0,05 bloques/tick en cada tick).
 */
const PUSH_ACCEL = 20;
/** Cuánto puede girar la cabeza respecto a la barca (Minecraft: 105°). */
const BOAT_LOOK = (105 * Math.PI) / 180;
const NO_INPUT: BoatInput = { forward: false, back: false, left: false, right: false };

const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

type Body = { boat: BoatBody } | { cart: CartBody };

export class VehicleClient {
  /** Entidad en la que va este jugador (-1: en ninguna) y su plaza. */
  entityId = -1;
  seat = 0;
  /** Jugador → [entidad, plaza] (los demás y este). */
  private riders = new Map<string, [number, number]>();
  private type = 0;
  /** Cuerpo que mueve este cliente (sólo si va delante) y su estado del tick anterior (para interpolar). */
  private body: Body | null = null;
  private prev: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  private acc = 0;
  private paddles = 0;
  private lastKey = '';
  /** Pidió subirse (hasta que llegue su 'vpass'). */
  private asked = -1;
  private missing = 0;

  constructor(private g: Game) {}

  get active(): boolean {
    return this.entityId > 0;
  }

  /** ¿Lleva él la barca o la vagoneta? */
  get driving(): boolean {
    return this.active && this.seat === 0;
  }

  // ------------------------------------------------------------------ red

  /** Mensajes del servidor ('vpass', 'vfix'); true si era uno de ellos. */
  onMessage(msg: ServerMsg): boolean {
    if (msg.t === 'vpass') {
      this.noteMobs(msg);
      this.onPassengers(msg);
      return true;
    }
    if (msg.t === 'vfix') {
      const p = Array.isArray(msg.p) ? msg.p.map(Number) : [];
      const b = this.body ? ('boat' in this.body ? this.body.boat : this.body.cart) : null;
      if (b && msg.e === this.entityId && p.length === 3 && p.every(Number.isFinite)) {
        [b.x, b.y, b.z] = p;
        b.vx = b.vy = b.vz = 0;
        this.snapPrev();
        this.lastKey = '';
      }
      return true;
    }
    return false;
  }

  private onPassengers(msg: Extract<ServerMsg, { t: 'vpass' }>): void {
    const e = Number(msg.e);
    const seats = Array.isArray(msg.p) ? msg.p : [];
    for (const [id, r] of [...this.riders]) if (r[0] === e) this.riders.delete(id);
    seats.forEach((s, i) => {
      if (typeof s === 'string' && s) this.riders.set(s, [e, i]);
    });
    const me = this.g.net?.id;
    if (!me) return;
    const mine = seats.findIndex((s) => s === me);
    if (mine >= 0) {
      const again = this.entityId === e;
      const wasDriving = this.driving;
      this.entityId = e;
      this.seat = mine;
      this.asked = -1;
      this.missing = 0;
      const ent = this.g.ents.list.get(e);
      if (ent) this.type = ent.type;
      // Delante: este cliente la mueve (también si pasa delante porque se bajó el de delante).
      // (Si aún no se ve la entidad, el cuerpo se crea en afterEntities, cuando llegue.)
      if (mine === 0 && (!again || !wasDriving || !this.body)) {
        if (ent) this.startBody(ent);
        else this.body = null;
      }
      if (mine !== 0) this.body = null;
      if (!again) {
        this.g.ui.toast(isBoatType(this.type) ? 'W/A/S/D: remar · Mayús: bajarse' : 'Mayús: bajarse');
        this.g.audio.playTransportSfx('vehicle_board', [this.g.player.x, this.g.player.y, this.g.player.z], isCartType(this.type) ? 1 : 0);
      }
    } else if (this.entityId === e) {
      // Ya no va en ella (le echaron: raíl activador, se hundió…).
      this.leave(true);
    } else if (this.asked === e) this.asked = -1;
  }

  /** Cuerpo local a partir de la entidad (o, si aún no se ve, del jugador). */
  private startBody(ent?: ClientEntity): void {
    const p = this.g.player;
    const x = ent?.x ?? p.x, y = ent?.y ?? p.y, z = ent?.z ?? p.z, yaw = ent?.yaw ?? p.yaw;
    if (isBoatType(this.type || ENT_BOAT)) {
      this.body = { boat: { x, y, z, vx: 0, vy: 0, vz: 0, yaw, spin: 0, status: BOAT_IN_WATER, waterLevel: y + 0.366, onGround: false, underTicks: 0 } };
    } else {
      this.body = {
        cart: { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: ent?.pitch ?? 0, flipped: false, onRails: false, onGround: false, inWater: false, occupied: true },
      };
    }
    this.acc = 0;
    this.snapPrev();
    this.lastKey = '';
  }

  private bodyOf(): (BoatBody | CartBody) | null {
    return this.body ? ('boat' in this.body ? this.body.boat : this.body.cart) : null;
  }

  private snapPrev(): void {
    const b = this.bodyOf();
    if (b) this.prev = [b.x, b.y, b.z, b.yaw, 'pitch' in b ? b.pitch : 0];
  }

  /** Manda la posición de la que lleva (cada tick, sólo si cambió). */
  private send(): void {
    const b = this.bodyOf();
    if (!this.driving || !b || !this.g.net) return;
    const q = (v: number, s: number) => Math.round(v / s);
    const key = `${q(b.x, 0.01)},${q(b.y, 0.01)},${q(b.z, 0.01)},${q(b.yaw, 0.01)},${this.paddles}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    this.g.net.send({
      t: 'vpos', e: this.entityId, p: [r3(b.x), r3(b.y), r3(b.z)], r: r3(b.yaw), v: [r3(b.vx), r3(b.vy), r3(b.vz)],
      ...('pitch' in b ? { pi: r3(b.pitch) } : { k: this.paddles }),
    });
  }

  // ------------------------------------------------------------------ interacción

  /** Clic derecho sobre una barca o vagoneta (true si lo era y se encargó). */
  onUse(target: ClientEntity, held: ItemStack | null): boolean {
    if (!isVehicleType(target.type) || target.gone) return false;
    const g = this.g;
    const item = held?.id ?? 0;
    // Vagoneta con horno: carbón (y empujón); vagonetas nuevas (tolva, TNT…): su propio uso en el servidor.
    const hopper = target.type === ENT_HOPPER_MINECART; // Fase 7 (mecanismos): se abre como la de cofre
    if (target.type === ENT_FURNACE_MINECART || (!isRideable(target.type) && target.type !== ENT_CHEST_MINECART && !hopper)) {
      g.interaction.interactEntity(target, item);
      return true;
    }
    const chest = target.type === ENT_CHEST_MINECART || hopper || (target.type === ENT_CHEST_BOAT && g.player.sneaking);
    if (chest) {
      const pos = vehicleContainerPos(target.id);
      g.interaction.pendingOpen = pos;
      g.net?.send({ t: 'open', x: pos[0], y: pos[1], z: pos[2] });
      g.swing(true);
      return true;
    }
    if (g.player.sneaking || this.entityId === target.id || g.riding.active) return true;
    this.asked = target.id;
    g.net?.send({ t: 'vride', e: target.id });
    g.swing(false);
    return true;
  }

  /**
   * Clic derecho con una barca o una vagoneta en la mano: ponerla (en el agua o el suelo; la vagoneta,
   * sobre un raíl). Devuelve true si el objeto era de éstos.
   */
  place(ia: Interaction, pressed: boolean, hit: RayHit | null, held: ItemStack | null, dir: number[]): boolean {
    const what = held ? vehicleForItem(held.id) : null;
    if (!what || !held) return false;
    if (!pressed) return true;
    const g = this.g, p = g.player, world = g.world!;
    const reach = g.creative ? REACH_CREATIVE : REACH_SURVIVAL;
    let point: [number, number, number] | null = null;
    let block: [number, number, number] | undefined;
    if (isBoatType(what.type)) {
      // El rayo se para en el agua (como con el nenúfar); si no, en el bloque.
      const wet = raycast(p.x, p.eyeY, p.z, dir[0], dir[1], dir[2], reach, (x, y, z) => world.getBlock(x, y, z), true);
      const h = wet && (!hit || wet.dist <= hit.dist + 1e-6) ? wet : hit;
      if (!h) return true;
      const fluid = BLOCK_FLUID[Math.max(0, h.id)] === 1;
      // Encima de la cara tocada (en el agua, a la altura de la superficie).
      point = fluid ? [h.px, h.py, h.pz] : [h.px + h.nx * 0.01, h.py + (h.ny < 0 ? -0.6 : 0.01), h.pz + h.nz * 0.01];
      if (!fluid && h.ny === 0) point[1] = h.y;
    } else {
      if (!hit || !isRail(hit.id)) return true;
      point = [hit.px, hit.py, hit.pz];
      block = [hit.x, hit.y, hit.z];
    }
    const q = ++ia.interactQ;
    ia.pendingInteract.set(q, { slot: g.selected, item: held.id });
    if (ia.pendingInteract.size > 32) ia.pendingInteract.delete(ia.pendingInteract.keys().next().value!);
    g.net?.send({ t: 'vplace', item: held.id, p: point, ...(block ? { b: block } : {}), yaw: p.yaw, q });
    g.swing(false);
    return true;
  }

  /** Título de la ventana del cofre de una barca o vagoneta (null si la posición no es de éstas). */
  containerTitle(pos: [number, number, number]): string | null {
    const id = vehicleOfContainer(pos[0], pos[1], pos[2]);
    if (id < 0) return null;
    const e = this.g.ents.list.get(id);
    return e ? vehicleTitle(e.type, e.variant) : 'Cofre';
  }

  // ------------------------------------------------------------------ bajarse

  /** Mayúsculas (o morir, o dormirse): bajarse ya, sin esperar al servidor. */
  requestLeave(place = true): void {
    if (!this.active) return;
    this.g.net?.send({ t: 'vleave' });
    this.leave(place);
  }

  /** Deja al jugador a un lado (o encima, si no cabe) de la barca o vagoneta. */
  private leave(place: boolean): void {
    const g = this.g, p = g.player;
    const e = g.ents.list.get(this.entityId);
    const b = this.bodyOf();
    if (place && (b || e)) {
      const x = b?.x ?? e!.x, y = b?.y ?? e!.y, z = b?.z ?? e!.z, yaw = b?.yaw ?? e!.yaw;
      const [w, h] = vehicleSize(this.type || ENT_BOAT);
      const side = w / 2 + 0.4;
      const world = g.world;
      const spots: [number, number][] = [
        [x - Math.cos(yaw) * side, z + Math.sin(yaw) * side], [x + Math.cos(yaw) * side, z - Math.sin(yaw) * side],
        [x + Math.sin(yaw) * side, z + Math.cos(yaw) * side], [x - Math.sin(yaw) * side, z - Math.cos(yaw) * side],
      ];
      let done = false;
      for (const [sx, sz] of spots) {
        for (const sy of [y + 0.05, Math.floor(y) + 1.001]) {
          if (world && boxCollides(world, sx - 0.3, sy, sz - 0.3, sx + 0.3, sy + 1.8, sz + 0.3)) continue;
          [p.x, p.y, p.z] = [sx, sy, sz];
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) [p.x, p.y, p.z] = [x, y + h, z];
      p.vx = p.vy = p.vz = 0;
      p.fallDistance = 0;
      if (world) p.unstuck(world);
    }
    this.entityId = -1;
    this.seat = 0;
    this.body = null;
    this.type = 0;
    this.paddles = 0;
  }

  // ------------------------------------------------------------------ cada frame

  /**
   * En lugar del movimiento del jugador: false si no va en ninguna. Delante mueve la barca o la
   * vagoneta (ticks fijos) y en cualquier plaza sienta al jugador.
   */
  update(dt: number, c: MoveControls, active: boolean): boolean {
    if (!this.active) return false;
    const g = this.g, p = g.player;
    if (g.survival.dead || g.life.sleeping || (active && g.input.wasPressed(g.cfg.settings.keys.sneak))) {
      this.requestLeave(!g.life.sleeping && !g.survival.dead);
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
    const b = this.bodyOf();
    if (this.driving && b && g.world) {
      this.acc = Math.min(this.acc + dt, TICK * 5);
      while (this.acc >= TICK) {
        this.acc -= TICK;
        this.snapPrev();
        this.step(active ? c : null);
        this.send();
      }
    }
    this.seatPlayer();
    return true;
  }

  /** Un tick de la que lleva: remar o empujar con lo que se pulsa. */
  private step(c: MoveControls | null): void {
    const body = this.body!, world = this.g.world!, p = this.g.player;
    if ('boat' in body) {
      const input: BoatInput = c ? { forward: c.forward, back: c.back, left: c.left, right: c.right } : NO_INPUT;
      const before = body.boat.yaw;
      boatStep(body.boat, world, input);
      // Fase 8.5: una columna de burbujas que baja hunde la barca y echa al que rema.
      if (body.boat.eject) {
        this.leave(false);
        return;
      }
      const [l, r] = paddlesOf(input);
      this.paddles = (l ? 1 : 0) | (r ? 2 : 0);
      // La vista gira con la barca.
      p.yaw += wrap(body.boat.yaw - before);
    } else {
      let push: [number, number] | null = null;
      if (c) {
        const f = (c.forward ? 1 : 0) - (c.back ? 1 : 0), s = (c.right ? 1 : 0) - (c.left ? 1 : 0);
        if (f || s) {
          const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
          const x = -sy * f + cy * s, z = -cy * f - sy * s, l = Math.hypot(x, z);
          push = [(x / l) * 0.1, (z / l) * 0.1];
        }
      }
      body.cart.occupied = true;
      cartStep(body.cart, world, push);
    }
  }

  /** Posición interpolada del cuerpo local entre el tick anterior y el actual. */
  private interpolated(): [number, number, number, number, number] | null {
    const b = this.bodyOf();
    if (!b) return null;
    const t = Math.min(1, this.acc / TICK);
    const [px, py, pz, pyaw, ppitch] = this.prev;
    const pitch = 'pitch' in b ? b.pitch : 0;
    return [px + (b.x - px) * t, py + (b.y - py) * t, pz + (b.z - pz) * t, pyaw + wrap(b.yaw - pyaw) * t, ppitch + (pitch - ppitch) * t];
  }

  /** Sienta al jugador en su plaza (la cadera en el asiento). */
  private seatPlayer(): void {
    const g = this.g, p = g.player;
    const e = g.ents.list.get(this.entityId);
    const at = this.driving ? this.interpolated() : e ? [e.x, e.y, e.z, e.yaw, e.pitch] : null;
    if (!at) return;
    const type = this.type || e?.type || ENT_BOAT;
    const occupied = Math.max(this.seat + 1, [...this.riders.values()].filter((r) => r[0] === this.entityId).length + this.mobsIn(e));
    const [sx, sy, sz] = seatPos(type, at[0], at[1], at[2], at[3], this.seat, occupied, e?.variant ?? 0);
    p.x = sx;
    p.y = sy - RIDER_HIP;
    p.z = sz;
    // En la barca la cabeza no gira más de 105° respecto a ella (el de atrás, que va de lado, también).
    if (isBoatType(type)) {
      const facing = at[3] + (this.seat === 1 && occupied > 1 ? Math.PI / 2 : 0);
      const d = wrap(p.yaw - facing);
      if (Math.abs(d) > BOAT_LOOK) p.yaw = facing + Math.sign(d) * BOAT_LOOK;
    }
  }

  /** Criaturas sentadas en la barca (para saber cuántas plazas van ocupadas). */
  private mobsIn(e: ClientEntity | undefined): number {
    return e && e.type === ENT_BOAT ? this.mobSeats.get(e.id)?.length ?? 0 : 0;
  }

  /** Criaturas a bordo de cada barca o vagoneta (del último 'vpass'): [id de la criatura, plaza]. */
  private mobSeats = new Map<number, [number, number][]>();

  /**
   * Después de interpolar las entidades: la que lleva se dibuja donde está aquí (con sus remos) y el
   * jugador se sienta en ella.
   */
  afterEntities(dt: number): void {
    if (!this.active) return;
    const e = this.g.ents.list.get(this.entityId);
    if (!e) {
      this.missing += dt;
      if (this.missing > 2) this.leave(false);
      return;
    }
    this.missing = 0;
    if (!this.type) this.type = e.type;
    if (this.driving && !this.body) this.startBody(e);
    const at = this.driving ? this.interpolated() : null;
    if (at) {
      [e.x, e.y, e.z, e.yaw] = at;
      e.bodyYaw = at[3];
      e.pitch = at[4];
      e.lastX = e.x;
      e.lastZ = e.z;
      if (isBoatType(e.type)) e.flags = (e.flags & ~(VF_PADDLE_L | VF_PADDLE_R)) | (this.paddles & 1 ? VF_PADDLE_L : 0) | (this.paddles & 2 ? VF_PADDLE_R : 0);
      // La criatura que va detrás, en su asiento de esta barca (no en el de la que ve el servidor).
      const occupied = 1 + this.mobsIn(e);
      for (const [mid, seat] of this.mobSeats.get(e.id) ?? []) {
        const m = this.g.ents.list.get(mid);
        if (!m) continue;
        const [sx, sy, sz] = seatPos(e.type, e.x, e.y, e.z, e.yaw, seat, occupied, e.variant);
        [m.x, m.y, m.z] = [sx, sy - 0.35, sz];
        m.yaw = m.bodyYaw = e.yaw + (e.type === ENT_BOAT && occupied > 1 && seat === 1 ? Math.PI / 2 : 0);
        m.lastX = m.x;
        m.lastZ = m.z;
      }
    }
    this.seatPlayer();
  }

  /** Otro jugador en una barca o vagoneta: sentado en su plaza (si se ve). */
  placeRemote(id: string, v: RemotePlayerView): boolean {
    const r = this.riders.get(id);
    if (!r) return false;
    const e = this.g.ents.list.get(r[0]);
    if (!e) return false;
    const occupied = Math.max(r[1] + 1, [...this.riders.values()].filter((x) => x[0] === r[0]).length + this.mobsIn(e));
    const [sx, sy, sz] = seatPos(e.type, e.x, e.y, e.z, e.yaw, r[1], occupied, e.variant);
    v.x = sx;
    v.y = sy - RIDER_HIP;
    v.z = sz;
    v.bodyYaw = e.yaw + (e.type === ENT_BOAT && r[1] === 1 && occupied > 1 ? Math.PI / 2 : 0);
    v.walkAmount = 0;
    v.riding = true;
    return true;
  }

  /**
   * Fase 7 (remate): antes de mover al jugador (a pie): las barcas cercanas son cajas sólidas (se choca con
   * ellas y se puede estar de pie encima, como en Minecraft) y las vagonetas (y la barca que se le mete
   * encima) le apartan si se solapan. A ellas las empuja el servidor (Transport.collide).
   */
  collidePlayer(dt: number): void {
    const g = this.g, p = g.player, boxes = p.entityBoxes;
    boxes.length = 0;
    if (this.active || g.riding.active || g.survival.dead) return;
    const hw = PLAYER_WIDTH / 2;
    for (const e of g.ents.list.values()) {
      if (!isVehicleType(e.type) || e.gone) continue;
      const [w, h] = vehicleSize(e.type);
      const ew = w / 2;
      if (Math.abs(e.x - p.x) > ew + 3 || Math.abs(e.z - p.z) > ew + 3 || Math.abs(e.y - p.y) > 4) continue;
      if (isBoatType(e.type)) boxes.push(e.x - ew, e.y, e.z - ew, e.x + ew, e.y + h, e.z + ew);
      const overlap = Math.abs(e.x - p.x) < ew + hw && Math.abs(e.z - p.z) < ew + hw && p.y < e.y + h - 0.01 && p.y + p.height > e.y;
      if (!overlap) continue;
      // De pie encima de una barca que sube un poco (se mece en el agua): sigue encima, no la atraviesa.
      if (isBoatType(e.type) && p.vy <= 0 && p.y > e.y + h - 0.3) {
        p.y = e.y + h;
        continue;
      }
      const [kx, kz] = pushApart(p.x, p.z, e.x, e.z);
      p.kx += kx * PUSH_ACCEL * dt;
      p.kz += kz * PUSH_ACCEL * dt;
    }
    // Fase 8.6: los shulkers son sólidos (canBeCollidedWith) y la tapa que sube empuja al que está encima.
    const now = performance.now() / 1000;
    for (const e of g.ents.list.values()) {
      if (e.type !== MOB_SHULKER || e.gone || e.deathT >= 0) continue;
      if (Math.abs(e.x - p.x) > 3 || Math.abs(e.z - p.z) > 3 || Math.abs(e.y - p.y) > 4) continue;
      const b = shulkerCollisionBox(e, now);
      boxes.push(...b);
      const inside = p.x + hw > b[0] && p.x - hw < b[3] && p.z + hw > b[2] && p.z - hw < b[5] && p.y < b[4] && p.y + p.height > b[1];
      if (inside && p.y > b[4] - 0.6) {
        p.y = b[4];
        if (p.vy < 0) p.vy = 0;
      }
    }
  }

  /** Entidad que no debe tapar el rayo del jugador (la suya). */
  get skipId(): number {
    return this.entityId;
  }

  /** Para 'vpass': anota si en la barca va alguna criatura (ids numéricos distintos de 0). */
  private noteMobs(msg: Extract<ServerMsg, { t: 'vpass' }>): void {
    const e = Number(msg.e);
    const mobs: [number, number][] = [];
    if (Array.isArray(msg.p)) msg.p.forEach((s, i) => typeof s === 'number' && s > 0 && mobs.push([s, i]));
    if (mobs.length) this.mobSeats.set(e, mobs);
    else this.mobSeats.delete(e);
  }

  /** ¿Está la entidad en el agua? (para los sonidos de los remos). */
  static wet(g: Game, e: ClientEntity): boolean {
    const id = g.world?.getBlock(Math.floor(e.x), Math.floor(e.y + 0.2), Math.floor(e.z)) ?? 0;
    return id > 0 && BLOCK_FLUID[id] === 1;
  }
}
