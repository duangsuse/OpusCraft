// Fase 7 (mecanismos): dispensadores y soltadores en el servidor, como en Minecraft.
// - Al recibir un pulso (también por el bloque de encima: cuasi-conectividad) esperan 4 ticks y usan un
//   objeto al azar de sus 9 huecos. Sin nada dentro, sólo hacen «clic».
// - Como en Minecraft Java, uno que se pone donde ya hay potencia no dispara: sólo mira la potencia cuando
//   le llega un aviso de un vecino (no tiene onPlace).
// - El soltador lo suelta delante o, si delante hay algo que guarda objetos, lo mete dentro (uno).
// - El dispensador según lo que sea: dispara flechas (también con efecto), bolas de nieve, huevos, pociones
//   arrojadizas y persistentes, botellas con experiencia y cohetes; pone y recoge agua, lava y nieve polvo
//   con los cubos; echa polvo de hueso; pone barcas en el agua y vagonetas en los raíles; viste con la
//   armadura a quien tenga delante (jugadores y soportes); enciende con el mechero (fuego, velas, fogatas y
//   dinamita); pone dinamita encendida y esquila ovejas. Lo demás lo suelta como el soltador.
import {
  AIR, TNT, WATER, LAVA, POWDER_SNOW, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_REPLACEABLE, DISPENSER, DROPPER, isRail,
  isDropper, dispenserTriggered, dispenserWith, facingOf, familyBase,
} from '../../blocks';
import { withWater } from '../../blocks'; // Fase 7: anegar y vaciar el conducto y los corales
import {
  ITEMS, ARROW, TIPPED_ARROW, SNOWBALL, EGG, SPLASH_POTION, LINGERING_POTION, EXPERIENCE_BOTTLE, FIREWORK_ROCKET, BUCKET,
  WATER_BUCKET, LAVA_BUCKET, POWDER_SNOW_BUCKET, BONE_MEAL, FLINT_AND_STEEL, SHEARS, type ItemStack,
} from '../../items';
import { SPECTRAL_ARROW, FIRE_CHARGE } from '../../items'; // Fase 8.3 (criaturas del Nether)
import { SPECTRAL_ARROW_TYPE } from '../../potions';
import { ENT_SMALL_FIREBALL } from '../../netherMobs';
import { MOB_SHEEP } from '../../mobs';
import { ENT_ARMOR_STAND } from '../../armorStands';
import { STATE_DEAD } from '../../protocol';
import { isBoatType, isCartType } from '../../vehicles';
import { vehicleForItem } from '../../vehicleItems';
import { registerRedstone, FACE_X, FACE_Y, FACE_Z, UP, UPDATE_CLIENTS, type RedstoneApi } from '../../redstone';
import { railHeight } from '../vehicles/cartPhysics';
import { insertStack, type Inventories } from './inventories';
import type { Explosives } from './tnt';
import type { Fire } from './fire';
import type { Transport } from './vehicles';
import type { ArmorStands } from './armorStands';
import type { Redstone } from './redstone';
import type { ServerContext } from './context';

/** Retardo del disparo tras el pulso (Minecraft: 4 ticks). */
const DISPENSE_DELAY = 4;

const SYSTEMS = new WeakMap<RedstoneApi, Dispensers>();

registerRedstone([DISPENSER, DROPPER], {
  // neighborChanged de DispenserBlock (también la cuasi-conectividad por el bloque de encima); `triggered`
  // cambia sin avisar (opción 2). Recién puesto no se dispara: Java no le avisa a él.
  neighbor: (api, x, y, z, id) => {
    const powered = api.isPowered(x, y, z) || api.isPowered(x, y + 1, z);
    const triggered = dispenserTriggered(id);
    if (powered && !triggered) {
      api.schedule(x, y, z, DISPENSE_DELAY);
      api.setBlock(x, y, z, dispenserWith(id, true), UPDATE_CLIENTS);
    } else if (!powered && triggered) api.setBlock(x, y, z, dispenserWith(id, false), UPDATE_CLIENTS);
  },
  tick: (api, x, y, z, id) => SYSTEMS.get(api)?.dispense(x, y, z, id),
});

/** Resultado de usar un objeto: se gastó (o cambió), falló (clic) o se suelta como objeto. */
type Outcome = 'ok' | 'fail' | 'drop';

export interface DispenserHooks {
  fertilize(x: number, y: number, z: number): boolean;
}

export class Dispensers {
  constructor(
    private ctx: ServerContext, rs: Redstone, private inv: Inventories, private tnt: Explosives, private fire: Fire,
    private transport: Transport, private stands: ArmorStands, private hooks: DispenserHooks,
  ) {
    SYSTEMS.set(rs, this);
  }

  private rand(): number {
    return this.ctx.rand();
  }

  /** Reparto triangular de Minecraft: media ± amplitud. */
  private triangle(mean: number, spread: number): number {
    return mean + spread * (this.rand() - this.rand());
  }

  /** Usa (o suelta) un objeto al azar del dispensador o soltador de (x, y, z). */
  dispense(x: number, y: number, z: number, id: number): void {
    const o = this.inv.open(x, y, z);
    if (!o) return;
    const c = o.state;
    const f = facingOf(id);
    // Un hueco al azar entre los que tienen algo (cada uno con la misma probabilidad).
    let slot = -1, n = 0;
    for (let i = 0; i < c.slots.length; i++) if (c.slots[i] && this.rand() * ++n < 1) slot = i;
    const center = [x + 0.5, y + 0.5, z + 0.5];
    if (slot < 0) {
      this.ctx.fx('dispense_fail', center[0], center[1], center[2]);
      return;
    }
    const stack = c.slots[slot]!;
    const fx = x + FACE_X[f], fy = y + FACE_Y[f], fz = z + FACE_Z[f];
    if (isDropper(id)) {
      if (this.inv.hasInventory(fx, fy, fz)) {
        if (!this.inv.insertOne(fx, fy, fz, f ^ 1, stack)) return;
        this.take(c, slot);
        o.done();
        this.ctx.fx('dispense', center[0], center[1], center[2], 0, f);
        return;
      }
      this.dropItem(x, y, z, f, { ...stack, count: 1 });
      this.take(c, slot);
      o.done();
      this.ctx.fx('dispense', center[0], center[1], center[2], 0, f);
      return;
    }
    const res = this.use(x, y, z, f, c.slots, slot, stack);
    if (res === 'drop') {
      this.dropItem(x, y, z, f, { ...stack, count: 1 });
      this.take(c, slot);
    }
    if (res === 'fail') {
      this.ctx.fx('dispense_fail', center[0], center[1], center[2]);
      return;
    }
    // Lo que el dispensador devuelve (un cubo lleno o vacío) va a otro hueco si el suyo sigue ocupado.
    o.done();
    this.ctx.fx('dispense', center[0], center[1], center[2], res === 'ok' && this.launched ? 1 : 0, f);
  }

  /** Si el último uso fue disparar algo (otro sonido). */
  private launched = false;

  /** Gasta un objeto del hueco. */
  private take(c: { slots: (ItemStack | null)[] }, slot: number): void {
    const s = c.slots[slot];
    if (!s) return;
    c.slots[slot] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
  }

  /** Cambia el objeto usado por `result` (el cubo que se llena o se vacía). */
  private swap(slots: (ItemStack | null)[], slot: number, result: ItemStack, x: number, y: number, z: number, f: number): void {
    const s = slots[slot]!;
    if (s.count <= 1) {
      slots[slot] = result;
      return;
    }
    slots[slot] = { ...s, count: s.count - 1 };
    const fit = insertStack({ kind: 'chest', slots, burn: 0, burnMax: 0, cook: 0 }, result, UP);
    if (fit < result.count) this.dropItem(x, y, z, f, { ...result, count: result.count - fit });
  }

  /** Desgasta una herramienta (mechero, tijeras): se rompe al gastarse del todo. */
  private wear(slots: (ItemStack | null)[], slot: number): void {
    const s = slots[slot]!;
    const max = ITEMS[s.id]?.tool?.durability ?? 0;
    const dmg = (s.dmg ?? 0) + 1;
    slots[slot] = max > 0 && dmg >= max ? null : { ...s, dmg };
  }

  /** Punto de salida (el centro, 0,7 bloques hacia delante). */
  private outPoint(x: number, y: number, z: number, f: number): [number, number, number] {
    return [x + 0.5 + FACE_X[f] * 0.7, y + 0.5 + FACE_Y[f] * 0.7, z + 0.5 + FACE_Z[f] * 0.7];
  }

  /** Velocidad (bloques/s) de un disparo hacia delante (un poco hacia arriba) con su imprecisión. */
  private shot(f: number, power: number, spread: number): [number, number, number] {
    let dx = FACE_X[f], dy = FACE_Y[f] + 0.1, dz = FACE_Z[f];
    const len = Math.hypot(dx, dy, dz);
    const s = 0.0172275 * spread;
    dx = dx / len + this.triangle(0, s);
    dy = dy / len + this.triangle(0, s);
    dz = dz / len + this.triangle(0, s);
    const k = power * 20;
    return [dx * k, dy * k, dz * k];
  }

  /** Suelta un objeto como el soltador: sale por delante con un pequeño empujón (y algo hacia arriba). */
  dropItem(x: number, y: number, z: number, f: number, stack: ItemStack): void {
    const [px, py0, pz] = this.outPoint(x, y, z, f);
    const py = py0 - (FACE_Y[f] !== 0 ? 0.125 : 0.15625);
    const d = this.rand() * 0.1 + 0.2;
    const s = 0.0172275 * 6;
    this.ctx.entities.spawnItem(stack, px, py, pz, this.triangle(FACE_X[f] * d, s) * 20, this.triangle(0.2, s) * 20, this.triangle(FACE_Z[f] * d, s) * 20);
  }

  /** Lo que hace el dispensador con el objeto del hueco `slot`. */
  private use(x: number, y: number, z: number, f: number, slots: (ItemStack | null)[], slot: number, stack: ItemStack): Outcome {
    const ctx = this.ctx, w = ctx.world, ents = ctx.entities;
    const fx = x + FACE_X[f], fy = y + FACE_Y[f], fz = z + FACE_Z[f];
    const front = w.getBlock(fx, fy, fz);
    const id = stack.id;
    const [px, py, pz] = this.outPoint(x, y, z, f);
    this.launched = false;
    const shoot = (): 'ok' => {
      this.launched = true;
      this.take({ slots }, slot);
      return 'ok';
    };
    // Proyectiles.
    if (id === ARROW || id === TIPPED_ARROW || id === SPECTRAL_ARROW) {
      const [vx, vy, vz] = this.shot(f, 1.1, 6);
      const a = ents.spawnArrow(px, py, pz, vx, vy, vz, 0, 2);
      if (id === TIPPED_ARROW) a.arrowPotion = stack.dmg ?? 0;
      if (id === SPECTRAL_ARROW) a.arrowPotion = SPECTRAL_ARROW_TYPE; // Fase 8.3
      return shoot();
    }
    // Fase 8.3: la carga de fuego sale como una bola de fuego pequeña (con un poco de dispersión).
    if (id === FIRE_CHARGE) {
      const g = () => (this.ctx.rand() + this.ctx.rand() + this.ctx.rand() - 1.5) * 0.05;
      ents.mobs.nether.flyers.spawnFireball(ENT_SMALL_FIREBALL, px, py, pz, FACE_X[f] + g(), FACE_Y[f] + g(), FACE_Z[f] + g(), 0);
      ctx.fx('fire_charge_shoot', px, py, pz);
      return shoot();
    }
    if (id === SNOWBALL || id === EGG) {
      const [vx, vy, vz] = this.shot(f, 1.1, 6);
      ents.spawnThrown(id, px, py, pz, vx, vy, vz, '');
      return shoot();
    }
    if (id === SPLASH_POTION || id === LINGERING_POTION || id === EXPERIENCE_BOTTLE) {
      const [vx, vy, vz] = this.shot(f, 1.375, 3);
      ents.spawnThrown(id, px, py, pz, vx, vy, vz, '', id === EXPERIENCE_BOTTLE ? 0 : stack.dmg ?? 0);
      return shoot();
    }
    if (id === FIREWORK_ROCKET) {
      const e = ents.gearShots.spawnFirework(px, py, pz, stack, '');
      e.vx = FACE_X[f] * 10;
      e.vy = FACE_Y[f] * 10;
      e.vz = FACE_Z[f] * 10;
      return shoot();
    }
    // Cubos.
    if (id === WATER_BUCKET || id === LAVA_BUCKET || id === POWDER_SNOW_BUCKET) {
      const wet = id === WATER_BUCKET ? withWater(front, true) : 0;
      if (wet) {
        w.setBlock(fx, fy, fz, wet);
        this.swap(slots, slot, { id: BUCKET, count: 1 }, x, y, z, f);
        ctx.fx('bucket_empty', fx + 0.5, fy + 0.5, fz + 0.5);
        return 'ok';
      }
      if (front < 0 || !(front === AIR || BLOCK_REPLACEABLE[front] || (BLOCK_FLUID[front] && BLOCK_FLUID_LEVEL[front] !== 0))) return 'drop';
      w.setBlock(fx, fy, fz, id === WATER_BUCKET ? WATER : id === LAVA_BUCKET ? LAVA : POWDER_SNOW);
      this.swap(slots, slot, { id: BUCKET, count: 1 }, x, y, z, f);
      ctx.fx(id === LAVA_BUCKET ? 'bucket_empty_lava' : 'bucket_empty', fx + 0.5, fy + 0.5, fz + 0.5);
      return 'ok';
    }
    if (id === BUCKET) {
      const dry = withWater(front, false);
      if (dry) {
        w.setBlock(fx, fy, fz, dry);
        this.swap(slots, slot, { id: WATER_BUCKET, count: 1 }, x, y, z, f);
        ctx.fx('bucket_fill', fx + 0.5, fy + 0.5, fz + 0.5);
        return 'ok';
      }
      const full = front === POWDER_SNOW ? POWDER_SNOW_BUCKET : front === WATER ? WATER_BUCKET : front === LAVA ? LAVA_BUCKET : 0;
      if (!full) return 'drop';
      w.setBlock(fx, fy, fz, AIR);
      this.swap(slots, slot, { id: full, count: 1 }, x, y, z, f);
      ctx.fx(full === LAVA_BUCKET ? 'bucket_fill_lava' : 'bucket_fill', fx + 0.5, fy + 0.5, fz + 0.5);
      return 'ok';
    }
    if (id === BONE_MEAL) {
      if (!this.hooks.fertilize(fx, fy, fz)) return 'fail';
      this.take({ slots }, slot);
      return 'ok';
    }
    // Barcas (en el agua) y vagonetas (en un raíl).
    const vehicle = vehicleForItem(id);
    if (vehicle && isBoatType(vehicle.type)) {
      const water = BLOCK_FLUID[front] === 1;
      const below = w.getBlock(fx, fy - 1, fz);
      if (!water && !(front === AIR && BLOCK_FLUID[below] === 1)) return 'drop';
      this.transport.spawn(vehicle.type, vehicle.variant, fx + 0.5, water ? fy + 0.5 : fy, fz + 0.5, Math.atan2(-FACE_X[f], -FACE_Z[f]));
      this.take({ slots }, slot);
      return 'ok';
    }
    if (vehicle && isCartType(vehicle.type)) {
      let ry = fy;
      if (!isRail(front)) {
        if (front !== AIR || !isRail(w.getBlock(fx, fy - 1, fz))) return 'drop';
        ry = fy - 1;
      }
      const h = railHeight(w, fx + 0.5, ry + 0.5, fz + 0.5) ?? ry + 0.0625;
      this.transport.spawn(vehicle.type, 0, fx + 0.5, h, fz + 0.5, FACE_Y[f] ? 0 : Math.atan2(-FACE_X[f], -FACE_Z[f]));
      this.take({ slots }, slot);
      return 'ok';
    }
    // Armadura: a quien esté delante (jugador o soporte) si tiene ese hueco libre.
    const piece = ITEMS[id]?.armor;
    if (piece) {
      for (const s of ctx.sessions()) {
        if (!s.joined || s.s & STATE_DEAD || s.a[piece.slot]) continue;
        if (!this.inCell(s.p[0], s.p[1], s.p[2], 0.3, 1.8, fx, fy, fz)) continue;
        ctx.send(s, { t: 'equip', s: { ...stack, count: 1 } });
        s.a[piece.slot] = id;
        this.take({ slots }, slot);
        return 'ok';
      }
      for (const e of ents.list.values()) {
        if (e.type !== ENT_ARMOR_STAND || !this.inCell(e.x, e.y, e.z, e.width / 2, e.height, fx, fy, fz)) continue;
        if (!this.stands.equip(e.id, stack)) continue;
        this.take({ slots }, slot);
        return 'ok';
      }
      return 'drop';
    }
    // Mechero: dinamita, velas, fogatas o fuego en el hueco de delante.
    if (id === FLINT_AND_STEEL) {
      const lit = (front === TNT && this.tnt.prime(fx, fy, fz)) || this.fire.lightBlock(fx, fy, fz) || this.fire.ignite(fx, fy, fz);
      if (!lit) return 'fail';
      this.wear(slots, slot);
      ctx.fx('ignite', fx + 0.5, fy + 0.5, fz + 0.5);
      return 'ok';
    }
    // Dinamita: encendida delante.
    if (id === TNT) {
      this.tnt.spawnPrimed(fx + 0.5, fy, fz + 0.5);
      this.take({ slots }, slot);
      return 'ok';
    }
    // Tijeras: esquilan la oveja de delante.
    if (id === SHEARS) {
      for (const e of ents.list.values()) {
        if (e.type !== MOB_SHEEP || e.dead || e.sheared || !this.inCell(e.x, e.y, e.z, e.width / 2, e.height, fx, fy, fz)) continue;
        if (!ents.interact(e, SHEARS, false).ok) continue;
        this.wear(slots, slot);
        return 'ok';
      }
      return 'fail';
    }
    return 'drop';
  }

  /** ¿Toca la caja (pies en x, y, z; media anchura hw; alto h) la celda (cx, cy, cz)? */
  private inCell(x: number, y: number, z: number, hw: number, h: number, cx: number, cy: number, cz: number): boolean {
    return x + hw > cx && x - hw < cx + 1 && y + h > cy && y < cy + 1 && z + hw > cz && z - hw < cz + 1;
  }
}
