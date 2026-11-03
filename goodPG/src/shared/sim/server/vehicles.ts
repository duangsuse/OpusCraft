// Fase 7 (transporte): barcas y vagonetas en el servidor.
//
// Son entidades sin IA que crea, mueve, guarda (en los metadatos del mundo) y retira este sistema. Se
// ponen con 'vplace' (barcas en el agua o en el suelo; vagonetas sobre un raíl), se suben con 'vride' y
// se bajan con 'vleave'. Como las monturas, la que lleva un jugador la mueve su cliente (con la misma
// física compartida) y manda su posición ('vpos'), que aquí se comprueba por encima ('vfix' si no
// cuadra); las demás (vacías o con una criatura) las mueve el servidor. A golpes se rompen y sueltan su
// objeto (y lo que lleven dentro). Las criaturas se suben solas al chocar con una barca o al pasarles
// por encima una vagoneta. Las de cofre abren su inventario como un cofre (ver ContainerSystem.virtual)
// y la de horno se alimenta con carbón y empuja.
//
// Fase 7 (remate): las barcas se pueden atar con la correa (Leashes, por el gancho `leash`); de la atada
// tira aquí la correa (como en Minecraft, pasados 6 bloques) y la valla a la que está atada se guarda con ella.
//
// Tipos nuevos de vagoneta (con tolva, con TNT): registrarlos en vehicleItems.ts (addCartKind) y darles
// comportamiento en CART_BEHAVIORS (usar, cada tick, raíl activador, guardado).
import { STATE_DEAD, stackToWire, stackFromWire, type ClientMsg, type ServerMsg } from '../../protocol';
import { MOBS, MOB_IRON_GOLEM } from '../../mobs';
import { COAL, CHARCOAL, LEAD, type ItemStack } from '../../items';
import { RAIL_KIND, RAIL_SHAPE, RAIL_DETECTOR, RAIL_ACTIVATOR, isRail, railIsPowered } from '../../blocks';
import { newContainer, sanitizeStack, type ContainerState } from '../../containers';
import { attackDamage } from '../../combat';
import { WORLD_LIMIT, VOID_Y } from '../../constants';
import {
  ENT_BOAT, ENT_CHEST_BOAT, ENT_FURNACE_MINECART, BOAT_WOODS, isBoatType, isCartType, isVehicleType, seatsOf, seatPos,
  vehicleSize, vehicleContainerPos, vehicleOfContainer, VF_PADDLE_L, VF_PADDLE_R, VF_LIT, VF_HURT_FLIP, BOAT_WIDTH,
} from '../../vehicles';
import { vehicleForItem, itemForVehicle, vehicleSlots, isRideable } from '../../vehicleItems';
import { boatStep, pushBoat, BOAT_IN_WATER, BOAT_ON_LAND, type BoatBody } from '../vehicles/boatPhysics';
import { cartStep, cartsCollide, pushCart, railHeight, type CartBody } from '../vehicles/cartPhysics';
import { boxCollides } from '../physics';
import { EF_HURT } from '../../protocol';
import type { ServerStore } from '../store';
import type { Entity, InteractResult } from '../entities';
import type { Riding } from './riding';
import { Rails } from './railway';
import { posKey as posKeyOf } from '../posKey';
import { r2, type ServerContext, type Session } from './context';

const MAX_VEHICLES = 1000;
/** Distancia para subirse, ponerlas o golpearlas. */
const REACH = 6;
/** Si el pasajero se separa más que esto, se baja. */
const MAX_GAP = 6;
/** Fase 7 (remate): a partir de aquí la correa tira de la barca (Minecraft: 6 bloques) y tope de lo que corre así. */
const LEASH_SLACK = 6, LEASH_MAX_SPEED = 0.6;
/** Combustible de la vagoneta con horno: ticks por carbón y máximo (Minecraft). */
const FUEL_PER_COAL = 3600, FUEL_MAX = 32000;

/** Pasajero de una plaza: un jugador (id de sesión) o una criatura (id de entidad). */
type Seat = { player: string } | { mob: number } | null;

export interface Vehicle {
  e: Entity;
  boat?: BoatBody;
  cart?: CartBody;
  seats: Seat[];
  /** Daño acumulado (se rompe al pasar de 40; baja 1 por tick) y ticks de la sacudida. */
  damage: number;
  hurt: number;
  hurtFlip: boolean;
  inv: ContainerState | null;
  /** Jugador que la lleva (su cliente la mueve) y cuándo llegó su última posición (ms). */
  driver: string | null;
  last: number;
  /** Remos que reman (bits: 1 izquierdo, 2 derecho). */
  paddles: number;
  /** Datos propios de otros tipos de vagoneta (tolva, TNT…). */
  extra?: Record<string, unknown>;
  /** Fase 7 (remate): valla a la que estaba atada en el último tick ('' si a ninguna), para guardarla al cambiar. */
  tied?: string;
}

/** Comportamiento de un tipo de vagoneta (para las que vengan: tolva, TNT…). */
export interface CartBehavior {
  /** Clic derecho de un jugador con `item` en la mano (null: lo de siempre). */
  use?(t: Transport, v: Vehicle, s: Session, item: number): InteractResult | null;
  /** Cada tick que se simula. */
  tick?(t: Transport, v: Vehicle): void;
  /** Sobre un raíl activador (encendido o no). */
  activator?(t: Transport, v: Vehicle, powered: boolean): void;
  /** Datos propios que se guardan con ella. */
  save?(v: Vehicle): unknown;
  load?(v: Vehicle, data: unknown): void;
  /** Lo que suelta además de su objeto al romperla. */
  drops?(v: Vehicle): ItemStack[];
  /**
   * Fase 7 (mecanismos): un jugador la rompe (en supervivencia); false si no se rompe (la vagoneta con
   * dinamita que corre se enciende en lugar de soltarse).
   */
  broken?(t: Transport, v: Vehicle): boolean;
  /** Fase 7 (mecanismos): bits de estado propios para los clientes (la mecha de la vagoneta con dinamita). */
  flags?(v: Vehicle): number;
}

export const CART_BEHAVIORS: Record<number, CartBehavior> = {};

const wrapAngle = (a: number) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

export class Transport {
  readonly rails: Rails;
  private byEnt = new Map<number, Vehicle>();
  /** Jugador → entidad en la que va. */
  private riders = new Map<string, number>();
  private dirty = false;
  /** Criaturas guardadas en asientos, por volver a sentar tras cargar el mundo: [vehículo, plaza, tipo]. */
  private pendingMobs: [Vehicle, number, number][] = [];
  /** Fase 7 (remate): la correa sobre una barca (atar, soltar, pasar de la valla a la mano; lo hace Leashes). */
  leash: ((s: Session, e: Entity, msg: Extract<ClientMsg, { t: 'interact' }>) => InteractResult | null) | null = null;

  constructor(private ctx: ServerContext, store: ServerStore, private riding: Riding) {
    this.rails = new Rails(ctx);
    ctx.entities.seated = (e) => this.seatMob(e);
    try {
      const rows = JSON.parse(store.getMeta('vehicles') ?? '[]') as unknown;
      if (Array.isArray(rows)) for (const r of rows.slice(0, MAX_VEHICLES)) this.load(r);
    } catch {
      /* ignorar */
    }
    this.relinkMobs();
  }

  // ------------------------------------------------------------------ altas y bajas

  get count(): number {
    return this.byEnt.size;
  }

  vehicleOf(entityId: number): Vehicle | undefined {
    return this.byEnt.get(entityId);
  }

  /** Entidad en la que va el jugador (undefined si en ninguna). */
  rideOf(playerId: string): number | undefined {
    return this.riders.get(playerId);
  }

  spawn(type: number, variant: number, x: number, y: number, z: number, yaw: number): Vehicle {
    const [w, h] = vehicleSize(type);
    const e = this.ctx.entities.spawnBare(type, x, y, z, w, h);
    e.yaw = e.bodyYaw = yaw;
    e.variant = variant;
    const v: Vehicle = {
      e, seats: new Array(Math.max(1, seatsOf(type))).fill(null), damage: 0, hurt: 0, hurtFlip: false, driver: null, last: 0,
      paddles: 0, inv: vehicleSlots(type) > 0 ? newContainer('chest', vehicleSlots(type)) : null,
    };
    if (isBoatType(type)) {
      v.boat = { x, y, z, vx: 0, vy: 0, vz: 0, yaw, spin: 0, status: BOAT_ON_LAND, waterLevel: 0, onGround: false, underTicks: 0 };
    } else {
      v.cart = { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, flipped: false, onRails: false, onGround: false, inWater: false, occupied: false };
      if (type === ENT_FURNACE_MINECART) v.cart.furnace = { fuel: 0, px: 0, pz: 0 };
    }
    this.byEnt.set(e.id, v);
    this.dirty = true;
    return v;
  }

  /** Retira la barca o vagoneta: baja a todos y, si `drop`, suelta su objeto y lo que lleve dentro. */
  destroy(v: Vehicle, drop: boolean, withItem: boolean): void {
    for (let i = 0; i < v.seats.length; i++) this.unseat(v, i, false);
    this.sendPassengers(v);
    const e = v.e;
    if (drop) {
      const out: ItemStack[] = [];
      if (withItem) out.push({ id: itemForVehicle(e.type, e.variant ?? 0), count: 1 });
      if (v.inv) for (const s of v.inv.slots) if (s) out.push(s);
      out.push(...(CART_BEHAVIORS[e.type]?.drops?.(v) ?? []));
      if (e.leash) out.push({ id: LEAD, count: 1 }); // Fase 7 (remate): la correa cae con ella
      this.ctx.entities.dropStacks(out, e.x, e.y + 0.3, e.z);
    }
    if (v.inv) {
      // Cerrar el cofre a quien lo tenga abierto.
      const [cx, cy, cz] = vehicleContainerPos(e.id);
      const key = posKeyOf(cx, cy, cz);
      for (const s of this.ctx.sessions()) {
        if (s.container === key) {
          s.container = null;
          this.ctx.send(s, { t: 'cclose' });
        }
      }
    }
    this.byEnt.delete(e.id);
    this.ctx.entities.remove(e.id);
    this.dirty = true;
  }

  // ------------------------------------------------------------------ pasajeros

  private passengersMsg(v: Vehicle): ServerMsg {
    return { t: 'vpass', e: v.e.id, p: v.seats.map((s) => (!s ? 0 : 'player' in s ? s.player : s.mob)) };
  }

  private sendPassengers(v: Vehicle): void {
    this.ctx.broadcast(this.passengersMsg(v));
  }

  /** Vacía una plaza (la criatura queda a un lado). */
  private unseat(v: Vehicle, seat: number, notify = true): void {
    const s = v.seats[seat];
    if (!s) return;
    v.seats[seat] = null;
    if ('player' in s) {
      this.riders.delete(s.player);
      if (v.driver === s.player) v.driver = null;
    } else {
      const m = this.ctx.entities.list.get(s.mob);
      if (m) {
        m.vehicle = undefined;
        this.placeBeside(v, m);
      }
    }
    if (v.cart) v.cart.occupied = v.seats.some(Boolean);
    if (notify) this.sendPassengers(v);
  }

  /** Deja una criatura al lado de la barca o vagoneta (donde quepa). */
  private placeBeside(v: Vehicle, m: Entity): void {
    const w = this.ctx.world;
    const yaw = v.e.yaw;
    const side = (v.e.width + m.width) / 2 + 0.1;
    for (const [dx, dz] of [[Math.cos(yaw), -Math.sin(yaw)], [-Math.cos(yaw), Math.sin(yaw)], [-Math.sin(yaw), -Math.cos(yaw)], [Math.sin(yaw), Math.cos(yaw)]]) {
      const x = v.e.x + dx * side, z = v.e.z + dz * side;
      const hw = m.width / 2;
      for (const y of [v.e.y + 0.1, v.e.y + 1]) {
        if (!boxCollides(w, x - hw, y, z - hw, x + hw, y + m.height, z + hw)) {
          m.x = x;
          m.y = y;
          m.z = z;
          m.vx = m.vy = m.vz = 0;
          m.fallStart = m.y;
          return;
        }
      }
    }
    m.y = v.e.y + 1;
  }

  /** Sube una criatura a una plaza libre (true si cupo). */
  private boardMob(v: Vehicle, m: Entity): boolean {
    const seat = v.seats.findIndex((s) => !s);
    if (seat < 0) return false;
    v.seats[seat] = { mob: m.id };
    m.vehicle = v.e.id;
    const ai = m.ai;
    if (ai) {
      ai.path = null;
      ai.goal = null;
    }
    if (v.cart) v.cart.occupied = true;
    this.sendPassengers(v);
    this.ctx.fx('vehicle_board', v.e.x, v.e.y, v.e.z, v.e.type);
    return true;
  }

  /** Criatura sentada: a su asiento (lo llama el cerebro de las criaturas cada tick). */
  private seatMob(m: Entity): boolean {
    const v = m.vehicle !== undefined ? this.byEnt.get(m.vehicle) : undefined;
    const seat = v ? v.seats.findIndex((s) => !!s && 'mob' in s && s.mob === m.id) : -1;
    if (!v || seat < 0) {
      m.vehicle = undefined;
      return false;
    }
    const occupied = v.seats.filter(Boolean).length;
    const [x, y, z] = seatPos(v.e.type, v.e.x, v.e.y, v.e.z, v.e.yaw, seat, occupied, v.e.variant ?? 0);
    m.x = x;
    m.y = y - 0.35;
    m.z = z;
    m.vx = m.vy = m.vz = 0;
    m.fallStart = m.y;
    m.onGround = true;
    // Mira hacia delante (en la barca, de lado si van dos, como en Minecraft).
    m.bodyYaw = m.yaw = v.e.yaw + (v.e.type === ENT_BOAT && occupied > 1 && seat === 1 ? Math.PI / 2 : 0);
    if (m.ai) this.ctx.entities.mobs.updateFlags(m, m.ai);
    return true;
  }

  /** Subirse: la plaza de delante para el jugador (la criatura que la ocupara pasa atrás). */
  onRide(s: Session, msg: Extract<ClientMsg, { t: 'vride' }>): void {
    const v = this.byEnt.get(Number(msg.e));
    const reject = () => {
      const cur = this.riders.get(s.id);
      const cv = cur !== undefined ? this.byEnt.get(cur) : undefined;
      this.ctx.send(s, cv ? this.passengersMsg(cv) : { t: 'vpass', e: Number(msg.e) || 0, p: [] });
    };
    if (!v || s.s & STATE_DEAD || !isRideable(v.e.type) || this.riders.get(s.id) === v.e.id) return reject();
    if (!this.ctx.local && Math.hypot(v.e.x - s.p[0], v.e.y - s.p[1], v.e.z - s.p[2]) > REACH) return reject();
    if (v.seats.some((p) => !!p && 'player' in p) && v.e.type !== ENT_BOAT) return reject();
    const free = v.seats.filter((p) => !p).length;
    if (free === 0) return reject();
    this.leave(s.id);
    this.riding.dismount(s.id);
    // El jugador va delante (y rema); si ya iba otro jugador delante, detrás.
    const front = v.seats[0];
    if (front && 'player' in front) v.seats[1] = { player: s.id };
    else {
      if (front) v.seats[v.seats.findIndex((p, i) => i > 0 && !p)] = front;
      v.seats[0] = { player: s.id };
      v.driver = s.id;
      v.last = this.ctx.now();
    }
    this.riders.set(s.id, v.e.id);
    if (v.cart) v.cart.occupied = true;
    this.sendPassengers(v);
  }

  /** Baja al jugador de donde vaya. */
  leave(playerId: string): void {
    const id = this.riders.get(playerId);
    if (id === undefined) return;
    const v = this.byEnt.get(id);
    this.riders.delete(playerId);
    if (!v) return;
    const seat = v.seats.findIndex((p) => !!p && 'player' in p && p.player === playerId);
    if (seat >= 0) this.unseat(v, seat);
    // Si iba otro jugador detrás, pasa a remar él.
    const back = v.seats.findIndex((p) => !!p && 'player' in p);
    if (v.driver === null && back >= 0) {
      const p = v.seats[back] as { player: string };
      v.seats[back] = v.seats[0];
      v.seats[0] = p;
      v.driver = p.player;
      v.last = this.ctx.now();
      this.sendPassengers(v);
    }
  }

  onJoin(s: Session): void {
    for (const v of this.byEnt.values()) if (v.seats.some(Boolean)) this.ctx.send(s, this.passengersMsg(v));
  }

  onLeave(s: Session): void {
    this.leave(s.id);
  }

  // ------------------------------------------------------------------ poner, usar y romper

  /** Poner una barca (en el agua o en el suelo) o una vagoneta (sobre un raíl). */
  onPlace(s: Session, msg: Extract<ClientMsg, { t: 'vplace' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q) | 0;
    const reply = (ok: boolean) => ctx.send(s, { t: 'ires', q, ok, take: ok && s.mode !== 'c' ? 1 : 0 });
    const what = vehicleForItem(Number(msg.item));
    const p = Array.isArray(msg.p) && msg.p.length === 3 ? msg.p.map(Number) : [];
    const yaw = Number(msg.yaw);
    if (!what || p.length !== 3 || !p.every(Number.isFinite) || !Number.isFinite(yaw) || s.s & STATE_DEAD) return reply(false);
    if (Math.abs(p[0]) > WORLD_LIMIT || Math.abs(p[2]) > WORLD_LIMIT || p[1] < VOID_Y || p[1] > 1024 || this.byEnt.size >= MAX_VEHICLES) return reply(false);
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - (s.p[1] + 1.6), p[2] - s.p[2]) > 7) return reply(false);
    const w = ctx.world;
    // Mirando hacia donde mira el jugador.
    const facing = wrapAngle(yaw);
    if (isBoatType(what.type)) {
      const hw = BOAT_WIDTH / 2;
      let y = p[1];
      // En el agua, desde la superficie; si no cabe, un poco más arriba.
      if (boxCollides(w, p[0] - hw, y + 0.01, p[2] - hw, p[0] + hw, y + 0.5, p[2] + hw)) y += 0.5;
      if (boxCollides(w, p[0] - hw, y + 0.01, p[2] - hw, p[0] + hw, y + 0.5, p[2] + hw)) return reply(false);
      this.spawn(what.type, what.variant, p[0], y, p[2], facing);
      ctx.fx('vehicle_place', p[0], y, p[2], what.type);
      return reply(true);
    }
    if (!isCartType(what.type)) return reply(false);
    // Vagoneta: sobre el raíl tocado.
    const b = Array.isArray(msg.b) && msg.b.length === 3 ? msg.b.map(Number) : [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
    if (!b.every(Number.isInteger)) return reply(false);
    let [bx, by, bz] = b;
    if (!isRail(w.getBlock(bx, by, bz)) && isRail(w.getBlock(bx, by - 1, bz))) by--;
    if (!isRail(w.getBlock(bx, by, bz))) return reply(false);
    const y = railHeight(w, bx + 0.5, by + 0.5, bz + 0.5) ?? by + 0.0625;
    for (const o of this.byEnt.values()) {
      if (o.cart && Math.hypot(o.e.x - bx - 0.5, o.e.y - y, o.e.z - bz - 0.5) < 0.5) return reply(false);
    }
    const shape = RAIL_SHAPE[w.getBlock(bx, by, bz)];
    // Alineada con la vía.
    const along = shape === 1 || shape === 2 || shape === 3 ? (Math.sin(facing) > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.cos(facing) > 0 ? 0 : Math.PI;
    this.spawn(what.type, 0, bx + 0.5, y, bz + 0.5, along);
    ctx.fx('vehicle_place', bx + 0.5, y, bz + 0.5, what.type);
    reply(true);
  }

  /** Clic derecho con un objeto sobre una barca o vagoneta ('interact'): null si no es de éstas. */
  onInteract(s: Session, e: Entity, msg: Extract<ClientMsg, { t: 'interact' }>): InteractResult | null {
    const v = this.byEnt.get(e.id);
    if (!v) return null;
    if (s.s & STATE_DEAD) return { ok: false };
    const item = Number(msg.item);
    // Fase 7 (remate): la correa sobre la barca.
    const leash = v.boat ? this.leash?.(s, e, msg) : null;
    if (leash) return leash;
    const behavior = CART_BEHAVIORS[e.type]?.use?.(this, v, s, item);
    if (behavior) return behavior;
    if (v.cart?.furnace) {
      // Carbón: más combustible; con combustible, empuja alejándose del jugador.
      const f = v.cart.furnace;
      let take = 0;
      if ((item === COAL || item === CHARCOAL) && f.fuel + FUEL_PER_COAL <= FUEL_MAX) {
        f.fuel += FUEL_PER_COAL;
        take = s.mode === 'c' ? 0 : 1;
      }
      if (f.fuel > 0) {
        f.px = v.e.x - s.p[0];
        f.pz = v.e.z - s.p[2];
        this.dirty = true;
      }
      return { ok: take > 0 || f.fuel > 0, take };
    }
    return { ok: false };
  }

  /** Golpe a una entidad: si es una barca o vagoneta, se daña (y se rompe). true si lo era. */
  onAttack(s: Session, entityId: number, item: number): boolean {
    const v = this.byEnt.get(entityId);
    if (!v) return false;
    if (s.s & STATE_DEAD || this.riders.get(s.id) === entityId) return true;
    if (!this.ctx.local && Math.hypot(v.e.x - s.p[0], v.e.y - s.p[1], v.e.z - s.p[2]) > REACH + 1) return true;
    const dmg = Number.isInteger(item) && item > 0 ? attackDamage(item) : 1;
    v.damage += dmg * 10;
    v.hurt = 10;
    v.hurtFlip = !v.hurtFlip;
    const creative = s.mode === 'c';
    if ((creative || v.damage > 40) && (creative || CART_BEHAVIORS[v.e.type]?.broken?.(this, v) !== false)) {
      this.ctx.fx('vehicle_break', v.e.x, v.e.y + 0.3, v.e.z, v.e.type);
      this.destroy(v, true, !creative);
    } else this.ctx.fx('vehicle_hit', v.e.x, v.e.y + 0.3, v.e.z, v.e.type);
    return true;
  }

  // ------------------------------------------------------------------ la que lleva un jugador

  /** Posición de la que lleva el jugador: se acepta si es alcanzable desde la anterior. */
  onMove(s: Session, msg: Extract<ClientMsg, { t: 'vpos' }>): void {
    const ctx = this.ctx;
    const v = this.byEnt.get(Number(msg.e));
    if (!v || v.driver !== s.id) return;
    const p = Array.isArray(msg.p) && msg.p.length === 3 ? msg.p.map(Number) : [];
    const vel = Array.isArray(msg.v) && msg.v.length === 3 ? msg.v.map(Number) : [0, 0, 0];
    const yaw = Number(msg.r);
    if (p.length !== 3 || !p.every(Number.isFinite) || !vel.every(Number.isFinite) || !Number.isFinite(yaw)) return;
    const now = ctx.now();
    const e = v.e;
    if (!ctx.local) {
      const dt = Math.max(0.05, Math.min(1, (now - v.last) / 1000));
      // Sobre hielo azul una barca pasa de 70 bloques por segundo; una vagoneta, 8 (40 con sus saltos).
      const max = (v.boat ? 80 : 45) * dt + 2;
      const [w, h] = vehicleSize(e.type);
      const hw = w / 2 - 0.1;
      const bad = Math.hypot(p[0] - e.x, p[1] - e.y, p[2] - e.z) > max || Math.abs(p[0]) > WORLD_LIMIT || Math.abs(p[2]) > WORLD_LIMIT ||
        p[1] < VOID_Y - 64 || p[1] > 1024 || boxCollides(ctx.world, p[0] - hw, p[1] + 0.1, p[2] - hw, p[0] + hw, p[1] + h - 0.05, p[2] + hw);
      if (bad) {
        ctx.send(s, { t: 'vfix', e: e.id, p: [r2(e.x), r2(e.y), r2(e.z)], v: [0, 0, 0] });
        return;
      }
    }
    v.last = now;
    const body = v.boat ?? v.cart!;
    body.x = e.x = p[0];
    body.y = e.y = p[1];
    body.z = e.z = p[2];
    body.vx = Math.max(-4, Math.min(4, vel[0]));
    body.vy = Math.max(-4, Math.min(4, vel[1]));
    body.vz = Math.max(-4, Math.min(4, vel[2]));
    body.yaw = e.yaw = e.bodyYaw = wrapAngle(yaw);
    if (v.cart) {
      const pi = Number(msg.pi);
      v.cart.pitch = e.pitch = Number.isFinite(pi) ? Math.max(-1, Math.min(1, pi)) : 0;
    }
    const k = Number(msg.k) | 0;
    v.paddles = v.boat ? k & 3 : 0;
    // Los pasajeros van con ella (sus 'pos' llegan más espaciados: a toda velocidad se quedarían atrás).
    for (const st of v.seats) {
      const ps = st && 'player' in st ? [...ctx.sessions()].find((o) => o.id === st.player) : undefined;
      if (ps) ps.p = [r2(e.x), ps.p[1], r2(e.z)];
    }
  }

  // ------------------------------------------------------------------ cada tick

  tick(): void {
    this.rails.tick();
    if (this.byEnt.size === 0) return;
    const ctx = this.ctx;
    const byId = new Map<string, Session>();
    for (const s of ctx.sessions()) if (s.joined) byId.set(s.id, s);
    // Pasajeros que ya no pueden ir (se fueron, murieron o se alejaron).
    for (const [pid, eid] of [...this.riders]) {
      const s = byId.get(pid);
      const v = this.byEnt.get(eid);
      if (!s || !v || s.s & STATE_DEAD || (!ctx.local && Math.hypot(v.e.x - s.p[0], v.e.z - s.p[2]) > MAX_GAP)) this.leave(pid);
    }
    const w = ctx.world;
    const carts: Vehicle[] = [];
    const boats: Vehicle[] = [];
    for (const v of [...this.byEnt.values()]) {
      const e = v.e;
      if (!this.ctx.entities.list.has(e.id)) {
        this.byEnt.delete(e.id);
        continue;
      }
      if (!w.isLoaded(Math.floor(e.x / 16), Math.floor(e.z / 16))) continue;
      // Criaturas que ya no están (muertas o retiradas): plaza libre.
      for (let i = 0; i < v.seats.length; i++) {
        const st = v.seats[i];
        if (st && 'mob' in st) {
          const m = ctx.entities.list.get(st.mob);
          if (!m || m.dead || m.vehicle !== e.id) {
            v.seats[i] = null;
            if (v.cart) v.cart.occupied = v.seats.some(Boolean);
            this.sendPassengers(v);
          }
        }
      }
      const tied = Array.isArray(e.leash) ? e.leash.join() : ''; // Fase 7 (remate)
      if (tied !== (v.tied ?? '')) {
        v.tied = tied;
        this.dirty = true;
      }
      if (v.damage > 0) v.damage--;
      if (v.hurt > 0) v.hurt--;
      const ox = e.x, oy = e.y, oz = e.z;
      if (v.boat) {
        boats.push(v);
        if (!v.driver) {
          this.pullLeash(v); // Fase 7 (remate)
          boatStep(v.boat, w, null);
          v.paddles = 0;
          if (v.boat.underTicks >= 60 || v.boat.eject) for (let i = 0; i < v.seats.length; i++) this.unseat(v, i); // Fase 8.5: o la hunde una columna de burbujas
        }
      } else if (v.cart) {
        carts.push(v);
        CART_BEHAVIORS[e.type]?.tick?.(this, v);
        const rail = v.driver ? this.railUnder(v.cart) : cartStep(v.cart, w, null);
        if (rail) this.onRail(v, rail);
      }
      const body = (v.boat ?? v.cart)!;
      e.x = body.x;
      e.y = body.y;
      e.z = body.z;
      e.yaw = e.bodyYaw = body.yaw;
      e.pitch = v.cart ? v.cart.pitch : 0;
      if (e.y < VOID_Y) {
        this.destroy(v, false, false);
        continue;
      }
      if (Math.abs(e.x - ox) + Math.abs(e.y - oy) + Math.abs(e.z - oz) > 0.001) this.dirty = true;
      let f = v.hurt > 0 ? EF_HURT : 0;
      if (v.hurt > 0 && v.hurtFlip) f |= VF_HURT_FLIP;
      if (v.paddles & 1) f |= VF_PADDLE_L;
      if (v.paddles & 2) f |= VF_PADDLE_R;
      if (v.cart?.furnace && v.cart.furnace.fuel > 0) f |= VF_LIT;
      f |= CART_BEHAVIORS[e.type]?.flags?.(v) ?? 0; // Fase 7 (mecanismos)
      e.flags = f;
    }
    this.collide(carts, boats);
  }

  /**
   * Fase 7 (remate): la barca atada, más allá de 6 bloques de quien la lleva (o de la valla), va hacia allí
   * (Minecraft: 0,4·n² bloques/tick en cada eje por tick, con n la dirección). Leashes deja el punto en leashTo.
   */
  private pullLeash(v: Vehicle): void {
    const e = v.e, b = v.boat!, h = e.leash ? e.leashTo : undefined;
    if (!h) return;
    const dx = h[0] - b.x, dz = h[2] - b.z, d = Math.hypot(dx, h[1] - b.y, dz);
    if (d <= LEASH_SLACK) return;
    const nx = dx / d, nz = dz / d;
    b.vx += Math.sign(nx) * nx * nx * 0.4;
    b.vz += Math.sign(nz) * nz * nz * 0.4;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > LEASH_MAX_SPEED) {
      b.vx *= LEASH_MAX_SPEED / sp;
      b.vz *= LEASH_MAX_SPEED / sp;
    }
  }

  /** Raíl bajo una vagoneta que mueve su jugador (para detectores y activadores). */
  private railUnder(c: CartBody): [number, number, number, number] | null {
    const w = this.ctx.world;
    const x = Math.floor(c.x), z = Math.floor(c.z);
    let y = Math.floor(c.y);
    if (isRail(w.getBlock(x, y - 1, z))) y--;
    const id = w.getBlock(x, y, z);
    return isRail(id) ? [x, y, z, id] : null;
  }

  /** La vagoneta está sobre un raíl: pisa los detectores y, en un activador encendido, echa a los pasajeros. */
  private onRail(v: Vehicle, [x, y, z, id]: [number, number, number, number]): void {
    const kind = RAIL_KIND[id];
    if (kind === RAIL_DETECTOR) this.rails.press(x, y, z);
    else if (kind === RAIL_ACTIVATOR) {
      const powered = railIsPowered(id);
      const b = CART_BEHAVIORS[v.e.type];
      if (b?.activator) b.activator(this, v, powered);
      else if (powered) {
        if (v.seats.some(Boolean)) for (let i = 0; i < v.seats.length; i++) this.unseat(v, i);
        if (v.hurt === 0) {
          v.hurt = 10;
          v.hurtFlip = !v.hurtFlip;
        }
      }
    }
  }

  /** Choques: vagonetas entre sí, barcas entre sí y con lo que las toca; las criaturas se suben. */
  private collide(carts: Vehicle[], boats: Vehicle[]): void {
    const ctx = this.ctx;
    // Vagonetas entre sí (la que lleva un jugador no cambia: la mueve su cliente).
    for (let i = 0; i < carts.length; i++) {
      for (let j = i + 1; j < carts.length; j++) {
        const a = carts[i], b = carts[j];
        const A = a.cart!, B = b.cart!;
        if (Math.abs(A.x - B.x) > 1 || Math.abs(A.z - B.z) > 1 || Math.abs(A.y - B.y) > 0.8) continue;
        const [avx, avz, bvx, bvz] = [A.vx, A.vz, B.vx, B.vz];
        cartsCollide(A, B);
        if (a.driver) [A.vx, A.vz] = [avx, avz];
        if (b.driver) [B.vx, B.vz] = [bvx, bvz];
      }
    }
    // Barcas entre sí.
    for (let i = 0; i < boats.length; i++) {
      for (let j = i + 1; j < boats.length; j++) {
        const a = boats[i].boat!, b = boats[j].boat!;
        if (Math.abs(a.x - b.x) > BOAT_WIDTH || Math.abs(a.z - b.z) > BOAT_WIDTH || Math.abs(a.y - b.y) > 0.6) continue;
        if (!boats[i].driver) pushBoat(a, b.x, b.z);
        if (!boats[j].driver) pushBoat(b, a.x, a.z);
      }
    }
    const players = [...ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD) && !this.riders.has(s.id));
    for (const v of [...carts, ...boats]) {
      const e = v.e;
      const body = (v.boat ?? v.cart)!;
      const reach = e.width / 2 + 0.2;
      // Los jugadores que la tocan la empujan.
      if (!v.driver) {
        for (const s of players) {
          if (Math.abs(s.p[0] - e.x) < reach + 0.3 && Math.abs(s.p[2] - e.z) < reach + 0.3 && s.p[1] < e.y + e.height && s.p[1] + 1.8 > e.y) {
            if (v.cart) pushCart(v.cart, s.p[0], s.p[2]);
            else pushBoat(v.boat!, s.p[0], s.p[2]);
          }
        }
      }
      // Criaturas: se suben (vagoneta vacía que va rápido; barca sin jugador que reme) o se empujan.
      const moving = body.vx * body.vx + body.vz * body.vz > 0.01;
      const canBoard = isRideable(e.type) && v.seats.some((s) => !s) &&
        (v.cart ? moving && !v.seats.some(Boolean) : !v.seats.some((s) => !!s && 'player' in s));
      for (const m of ctx.entities.list.values()) {
        if (!m.ai || m.dead || m.vehicle !== undefined || m.rider || MOBS[m.type]?.inert) continue;
        if (Math.abs(m.x - e.x) > reach + m.width / 2 || Math.abs(m.z - e.z) > reach + m.width / 2) continue;
        if (m.y > e.y + e.height || m.y + m.height < e.y) continue;
        const fits = v.boat ? m.width < BOAT_WIDTH && !MOBS[m.type]?.aquatic : m.type !== MOB_IRON_GOLEM;
        if (canBoard && fits && !m.leash && this.boardMob(v, m)) continue;
        // Empuje de la criatura.
        if (!v.driver) {
          if (v.cart) pushCart(v.cart, m.x, m.z);
          else pushBoat(v.boat!, m.x, m.z);
        }
        const dx = m.x - e.x, dz = m.z - e.z, d = Math.hypot(dx, dz) || 1;
        m.vx += (dx / d) * 1;
        m.vz += (dz / d) * 1;
      }
    }
  }

  // ------------------------------------------------------------------ inventario (cofres)

  /** Contenido del cofre de la posición virtual (x, y, z) (ver ContainerSystem.virtual). */
  container(x: number, y: number, z: number, s?: Session): ContainerState | null | undefined {
    const id = vehicleOfContainer(x, y, z);
    if (id < 0) return undefined;
    const v = this.byEnt.get(id);
    if (!v?.inv) return null;
    if (s && !this.ctx.local && Math.hypot(v.e.x - s.p[0], v.e.y - s.p[1], v.e.z - s.p[2]) > REACH + 2) return null;
    return v.inv;
  }

  containerChanged(): void {
    this.dirty = true;
  }

  // ------------------------------------------------------------------ guardado

  private load(r: unknown): void {
    if (!r || typeof r !== 'object') return;
    const o = r as { t?: unknown; v?: unknown; p?: unknown; r?: unknown; m?: unknown; c?: unknown; f?: unknown; s?: unknown; x?: unknown; l?: unknown };
    const type = Number(o.t);
    const p = Array.isArray(o.p) ? o.p.map(Number) : [];
    if (!isVehicleType(type) || p.length !== 3 || !p.every(Number.isFinite)) return;
    const variant = Math.max(0, Math.min(BOAT_WOODS.length - 1, Number(o.v) | 0));
    const yaw = Number.isFinite(Number(o.r)) ? Number(o.r) : 0;
    const v = this.spawn(type, isBoatType(type) ? variant : 0, p[0], p[1], p[2], yaw);
    const body = (v.boat ?? v.cart)!;
    const m = Array.isArray(o.m) ? o.m.map(Number) : [];
    if (m.length === 3 && m.every(Number.isFinite)) [body.vx, body.vy, body.vz] = m.map((x) => Math.max(-2, Math.min(2, x)));
    if (v.inv && Array.isArray(o.c)) {
      v.inv.slots = v.inv.slots.map((_, i) => sanitizeStack(stackFromWire((o.c as unknown[])[i])));
    }
    if (v.cart?.furnace && Array.isArray(o.f)) {
      const [fuel, px, pz] = o.f.map(Number);
      if ([fuel, px, pz].every(Number.isFinite)) Object.assign(v.cart.furnace, { fuel: Math.max(0, Math.min(FUEL_MAX, fuel)), px, pz });
    }
    if (Array.isArray(o.s)) {
      for (const st of o.s) {
        if (Array.isArray(st) && st.length === 2 && st.every(Number.isInteger) && st[0] >= 0 && st[0] < v.seats.length) {
          this.pendingMobs.push([v, st[0], st[1]]);
        }
      }
    }
    if (o.x !== undefined) CART_BEHAVIORS[type]?.load?.(v, o.x);
    // Fase 7 (remate): la valla a la que está atada (la correa en la mano de un jugador no se guarda).
    const l = Array.isArray(o.l) ? o.l.map(Number) : [];
    if (v.boat && l.length === 3 && l.every(Number.isInteger)) v.e.leash = [l[0], l[1], l[2]];
  }

  /** Tras cargar: cada criatura guardada en un asiento vuelve a él (la del mismo tipo más cercana). */
  private relinkMobs(): void {
    for (const [v, seat, type] of this.pendingMobs) {
      let best: Entity | null = null, bestD = 2;
      for (const m of this.ctx.entities.list.values()) {
        if (m.type !== type || !m.ai || m.vehicle !== undefined) continue;
        const d = Math.hypot(m.x - v.e.x, m.y - v.e.y, m.z - v.e.z);
        if (d < bestD) {
          best = m;
          bestD = d;
        }
      }
      if (best && !v.seats[seat]) {
        v.seats[seat] = { mob: best.id };
        best.vehicle = v.e.id;
        if (v.cart) v.cart.occupied = true;
      }
    }
    this.pendingMobs = [];
  }

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    const rows = [...this.byEnt.values()].map((v) => {
      const body = (v.boat ?? v.cart)!;
      const row: Record<string, unknown> = {
        t: v.e.type, v: v.e.variant ?? 0, p: [r3(body.x), r3(body.y), r3(body.z)], r: r3(body.yaw), m: [r3(body.vx), r3(body.vy), r3(body.vz)],
      };
      if (v.inv) row.c = v.inv.slots.map((s) => stackToWire(s) ?? 0);
      if (v.cart?.furnace) row.f = [v.cart.furnace.fuel, r3(v.cart.furnace.px), r3(v.cart.furnace.pz)];
      const mobs: [number, number][] = [];
      v.seats.forEach((st, i) => {
        const m = st && 'mob' in st ? this.ctx.entities.list.get(st.mob) : undefined;
        if (m) mobs.push([i, m.type]);
      });
      if (mobs.length) row.s = mobs;
      const x = CART_BEHAVIORS[v.e.type]?.save?.(v);
      if (x !== undefined) row.x = x;
      if (Array.isArray(v.e.leash)) row.l = v.e.leash; // Fase 7 (remate)
      return row;
    });
    store.setMeta('vehicles', JSON.stringify(rows));
  }

  /** Para las pruebas: ¿está en el agua (flotando)? */
  floating(v: Vehicle): boolean {
    return !!v.boat && v.boat.status === BOAT_IN_WATER;
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
