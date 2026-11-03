// Fase 7 (mecanismos): tolvas en el servidor, como en Minecraft.
// - Cada tolva pasa un objeto a lo que tiene en el pico (contenedores, hornos, soporte para pociones, otras
//   tolvas, compostador, tocadiscos, estantería cincelada, vagonetas con cofre o con tolva) y coge uno del
//   contenedor de encima o los objetos tirados encima (si no hay un bloque entero tapándola). Si movió algo,
//   espera 8 ticks (su cooldownTime: 2,5 objetos por segundo). La que recibe de otra estando vacía espera 8, o
//   7 si ya le tocó en este tick (8 − 1, como en Java): una fila de tolvas va a 2,5 objetos por segundo.
// - Como en Java (auditoría de la redstone), es una entidad de bloque: cada tick, en el orden en que se
//   cargaron o se pusieron, baja su espera y, si no le queda, prueba a mover.
// - Con potencia de redstone se bloquean (ni pasan ni cogen nada).
// - Un comparador lee lo llenas que están (y las de los dispensadores y soltadores).
// Las vagonetas con tolva usan lo mismo (sim/server/mechanismCarts.ts).
import {
  HOPPER, DISPENSER, DROPPER, BLOCK_COLLIDE, familyBase, hopperLocked, hopperWith, hopperOutFace,
} from '../../blocks';
import { registerRedstone, containerSignal, FACE_X, FACE_Y, FACE_Z, UP, DOWN, UPDATE_CLIENTS, type RedstoneApi } from '../../redstone';
import { ENT_ITEM } from '../../mobs';
import { ENT_CHEST_MINECART, ENT_HOPPER_MINECART } from '../../vehicles';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { insertStack, isEmpty, isFull, type Inventories, type Opened } from './inventories';
import type { Redstone } from './redstone';
import type { ServerContext } from './context';

/** Ticks entre objeto y objeto (Minecraft: 8). */
export const HOPPER_COOLDOWN = 8;

const SYSTEMS = new WeakMap<RedstoneApi, Hoppers>();

/** checkPoweredState de HopperBlock: bloqueada mientras recibe potencia (cambia sin avisar: opción 2). */
function checkHopperPower(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const locked = api.isPowered(x, y, z);
  if (locked !== hopperLocked(id)) api.setBlock(x, y, z, hopperWith(id, locked), UPDATE_CLIENTS);
}

registerRedstone(HOPPER, {
  // Cualquier cambio a su lado la despierta.
  neighbor: (api, x, y, z, id) => {
    checkHopperPower(api, x, y, z, id);
    SYSTEMS.get(api)?.wake(x, y, z);
  },
  placed: (api, x, y, z, old, id) => {
    if (old >= 0 && !(old > 0 && familyBase(old) === HOPPER)) checkHopperPower(api, x, y, z, id);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0) api.updateAt(x, y, z);
    SYSTEMS.get(api)?.changed(x, y, z, id);
  },
});
registerRedstone([HOPPER, DISPENSER, DROPPER], {
  analog: (api, x, y, z) => containerSignal(api.containerSlots(x, y, z)),
});

const isHopper = (id: number) => id > 0 && familyBase(id) === HOPPER;

export class Hoppers {
  /** Tolvas cargadas, en el orden de las entidades de bloque de Java: su espera y el tick en que les tocó. */
  private all = new Map<number, { cooldown: number; ticked: number }>();

  constructor(private ctx: ServerContext, rs: Redstone, private inv: Inventories) {
    SYSTEMS.set(rs, this);
  }

  /** Tolvas que esperan (para las pruebas). */
  get coolingCount(): number {
    let n = 0;
    for (const h of this.all.values()) if (h.cooldown > 0) n++;
    return n;
  }

  /** Compatibilidad: todas miran cada tick (como en Java), no hay que despertarlas. */
  wake(x: number, y: number, z: number): void {
    this.add(posKey(x, y, z));
  }

  private add(k: number): void {
    if (!this.all.has(k)) this.all.set(k, { cooldown: -1, ticked: -1 });
  }

  /** Cambió el bloque de (x, y, z): una tolva que se pone (o se carga su chunk) o que se quita. */
  changed(x: number, y: number, z: number, id: number): void {
    if (isHopper(id)) this.add(posKey(x, y, z));
    else this.all.delete(posKey(x, y, z));
  }

  /** Compatibilidad: cambió lo que guarda (x, y, z) (ya no hace falta despertar a nadie). */
  contentsChanged(x: number, y: number, z: number): void {
    void x;
    void y;
    void z;
  }

  /**
   * Fase de entidades: un objeto que cae dentro de una tolva sin espera la hace mover en el acto (entityInside
   * de Java, antes de su tick).
   */
  itemsInside(): void {
    if (this.all.size === 0) return;
    const now = this.ctx.tickCount;
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || e.type !== ENT_ITEM) continue;
      const k = posKey(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
      const h = this.all.get(k);
      if (h && h.cooldown <= 0) this.run(k, h, now);
    }
  }

  /** Fase de entidades de bloque: cada tolva, en su orden (pushItemsTick de Java). */
  tick(): void {
    if (this.all.size === 0) return;
    const now = this.ctx.tickCount;
    for (const [k, h] of [...this.all]) {
      if (this.all.get(k) !== h) continue;
      h.cooldown--;
      h.ticked = now;
      if (h.cooldown > 0) continue;
      h.cooldown = 0;
      this.run(k, h, now);
    }
  }

  /** tryMoveItems de Java: si no está bloqueada, pasa un objeto y coge otro; si movió algo, espera 8. */
  private run(k: number, h: { cooldown: number; ticked: number }, now: number): void {
    const x = keyX(k), y = keyY(k), z = keyZ(k);
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isHopper(id)) {
      // Quitada o sin cargar (al cargarse su chunk se apunta otra vez).
      this.all.delete(k);
      return;
    }
    if (hopperLocked(id)) return;
    const self = this.inv.open(x, y, z);
    if (!self) return;
    let moved = false;
    if (!isEmpty(self.state)) moved = this.push(x, y, z, id, self, now, h);
    if (!isFull(self.state)) moved = this.pull(x, y, z, self) || moved;
    if (moved) h.cooldown = HOPPER_COOLDOWN;
  }

  /**
   * Pasa un objeto (el del primer hueco que quepa) a lo que tiene en el pico. Una tolva vacía que lo recibe
   * espera 7 ticks (Minecraft: 8 menos el tick que ya lleva), así que no lo pasa en el mismo tick.
   */
  private push(x: number, y: number, z: number, id: number, self: Opened, now: number, h: { cooldown: number; ticked: number }): boolean {
    const out = hopperOutFace(id);
    const tx = x + FACE_X[out], ty = y + FACE_Y[out], tz = z + FACE_Z[out];
    if (!this.inv.hasInventory(tx, ty, tz)) return false;
    const target = isHopper(this.ctx.world.getBlock(tx, ty, tz)) ? this.inv.open(tx, ty, tz) : null;
    const wasEmpty = !!target && isEmpty(target.state);
    const c = self.state;
    for (let i = 0; i < c.slots.length; i++) {
      const s = c.slots[i];
      if (!s || s.count <= 0) continue;
      if (!this.inv.insertOne(tx, ty, tz, out ^ 1, s)) continue;
      c.slots[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
      self.done();
      // La que lo recibe estando vacía espera 8, o 7 si ya le tocó en este tick (tryMoveInItem de Java).
      if (wasEmpty) {
        const tk = posKey(tx, ty, tz);
        this.add(tk);
        const t = this.all.get(tk)!;
        if (t.cooldown <= 8) t.cooldown = HOPPER_COOLDOWN - (t.ticked >= h.ticked ? 1 : 0);
      }
      void now;
      return true;
    }
    return false;
  }

  /** Coge un objeto del contenedor de encima o lo que haya tirado encima. */
  private pull(x: number, y: number, z: number, self: Opened): boolean {
    const c = self.state;
    if (this.inv.hasInventory(x, y + 1, z)) {
      const ok = this.inv.extractOne(x, y + 1, z, DOWN, (s) => insertStack(c, s, UP) === 1);
      if (ok) self.done();
      return ok;
    }
    const above = this.ctx.world.getBlock(x, y + 1, z);
    if (above > 0 && BLOCK_COLLIDE[above] === 1) return false;
    if (!this.inv.suckItems(c, x, y + 11 / 16, z, x + 1, y + 2, z + 1)) return false;
    self.done();
    return true;
  }
}
