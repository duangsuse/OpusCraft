// Fase 7 (mecanismos): vagonetas con tolva y con dinamita (comportamiento en el transporte, CART_BEHAVIORS).
// - Con tolva: cada 4 ticks coge un objeto del contenedor de encima o lo que haya tirado alrededor (no
//   suelta nada: se vacía con una tolva debajo del raíl). Un raíl activador encendido la bloquea y uno
//   apagado la desbloquea. Su inventario (5 huecos) se abre como el de la vagoneta con cofre.
// - Con dinamita: un raíl activador encendido o un mechero le encienden la mecha (4 s, parpadea); una
//   explosión, una más corta. Explota también al chocar fuerte. Rota mientras corre no se suelta: se
//   enciende con una mecha corta (quieta, sí se suelta, aunque tenga la mecha encendida). Cuanto más
//   deprisa va, más fuerte explota (Minecraft: 4 + hasta 1,5 × velocidad).
import { FLINT_AND_STEEL } from '../../items';
import { ENT_HOPPER_MINECART, ENT_TNT_MINECART, VF_PRIMED, vehicleContainerPos } from '../../vehicles';
import { TNT_FUSE } from '../../mechanisms';
import { UP, DOWN } from '../../redstone';
import { CART_BEHAVIORS, type Transport, type Vehicle } from './vehicles';
import { insertStack, isFull, type Inventories } from './inventories';
import type { ContainerSystem } from './containerSystem';
import type { Explosives } from './tnt';

/** Ticks entre objeto y objeto de la vagoneta con tolva. */
const HOPPER_CART_COOLDOWN = 4;
/** Velocidad (bloques/s) a partir de la cual un choque o romperla la hace explotar (0,1 bloques por tick). */
const CRASH_SPEED = 2;

interface CartSystems {
  inv: Inventories;
  containers: ContainerSystem;
  tnt: Explosives;
}

const SYSTEMS = new WeakMap<Transport, CartSystems>();

/** Engancha las vagonetas con tolva y con dinamita del transporte `t` con los sistemas del servidor. */
export function bindCarts(t: Transport, s: CartSystems): void {
  SYSTEMS.set(t, s);
}

const extraOf = (v: Vehicle): Record<string, unknown> => (v.extra ??= {});
const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);

// ------------------------------------------------------------------ con tolva

function hopperPull(s: CartSystems, v: Vehicle): void {
  const e = v.e;
  const [cx, cy, cz] = vehicleContainerPos(e.id);
  const o = s.containers.access(cx, cy, cz);
  if (!o || isFull(o.state)) return;
  const bx = Math.floor(e.x), by = Math.floor(e.y + 0.3), bz = Math.floor(e.z);
  if (s.inv.hasInventory(bx, by + 1, bz)) {
    if (s.inv.extractOne(bx, by + 1, bz, DOWN, (st) => insertStack(o.state, st, UP) === 1)) o.done();
    return;
  }
  if (s.inv.suckItems(o.state, e.x - 0.75, e.y - 0.25, e.z - 0.75, e.x + 0.75, e.y + 1.25, e.z + 0.75)) o.done();
}

CART_BEHAVIORS[ENT_HOPPER_MINECART] = {
  tick(t, v) {
    const s = SYSTEMS.get(t);
    const x = extraOf(v);
    if (!s || x.locked) return;
    x.cd = num(x.cd, 0) - 1;
    if (num(x.cd, 0) > 0) return;
    x.cd = HOPPER_CART_COOLDOWN;
    hopperPull(s, v);
  },
  activator(_t, v, powered) {
    extraOf(v).locked = powered;
  },
  save: (v) => (v.extra?.locked ? 1 : undefined),
  load(v, d) {
    extraOf(v).locked = d === 1;
  },
};

// ------------------------------------------------------------------ con dinamita

function speedOf(v: Vehicle): number {
  return v.cart ? Math.hypot(v.cart.vx, v.cart.vz) : 0;
}

/** Explota al acabar el tick, más fuerte cuanto más deprisa va. */
function boom(t: Transport, v: Vehicle): void {
  const x = extraOf(v);
  if (x.boom) return;
  x.boom = true;
  SYSTEMS.get(t)?.tnt.queueCart(v, speedOf(v));
}

function prime(v: Vehicle, fuse: number, t: Transport): void {
  const x = extraOf(v);
  if (num(x.fuse, -1) >= 0) return;
  x.fuse = fuse;
  SYSTEMS.get(t)?.tnt.primedCart(v);
}

CART_BEHAVIORS[ENT_TNT_MINECART] = {
  tick(t, v) {
    const x = extraOf(v);
    const speed = speedOf(v);
    const prev = num(x.speed, 0);
    x.speed = speed;
    const fuse = num(x.fuse, -1);
    if (fuse >= 0) {
      x.fuse = fuse - 1;
      if (fuse - 1 <= 0) boom(t, v);
      return;
    }
    // Choque fuerte: iba deprisa y se ha parado de golpe.
    if (prev >= CRASH_SPEED && speed < prev * 0.25) boom(t, v);
  },
  activator(t, v, powered) {
    if (powered) prime(v, TNT_FUSE, t);
  },
  use(t, v, s, item) {
    if (item !== FLINT_AND_STEEL) return null;
    prime(v, TNT_FUSE, t);
    return { ok: true, wear: s.mode === 'c' ? 0 : 1 };
  },
  flags: (v) => (num(v.extra?.fuse, -1) >= 0 ? VF_PRIMED : 0),
  // Rota mientras corre (0,1 bloques por tick o más): no se suelta, se enciende con una mecha corta
  // (MinecartTNT.destroy de Minecraft). Quieta se suelta (y se apaga, si estaba encendida).
  broken(t, v) {
    if (speedOf(v) < CRASH_SPEED) return true;
    const s = SYSTEMS.get(t);
    if (s) prime(v, s.tnt.shortCartFuse(), t);
    return false;
  },
  save: (v) => (num(v.extra?.fuse, -1) >= 0 ? Math.round(num(v.extra?.fuse, -1)) : undefined),
  load(v, d) {
    if (typeof d === 'number' && d >= 0) extraOf(v).fuse = d;
  },
};
