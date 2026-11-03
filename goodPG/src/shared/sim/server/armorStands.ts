// Fase 6.5 (remate): soportes para armadura. Entidades sin comportamiento que este sistema crea, guarda
// (en los metadatos del mundo) y retira. Se ponen con 'stand' sobre un bloque; clic derecho con una pieza
// de armadura la viste (o la cambia por la que tenía) y con la mano vacía se quita la de más arriba; un
// golpe lo tira (suelta el soporte y su armadura). Si le quitan el suelo, cae hasta el siguiente.
import { dyedColor } from '../../dyedColor';
import { BLOCK_SOLID, BLOCK_COLLIDE } from '../../blocks';
import { ITEMS, ARMOR_STAND, type ItemStack } from '../../items';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { ENT_ARMOR_STAND, STAND_HALF, STAND_HEIGHT, standYaw } from '../../armorStands';
import { sanitizeStack } from '../../containers';
import { stackToWire, stackFromWire } from '../../protocol';
import type { ServerStore } from '../store';
import type { Entity, InteractResult } from '../entities';
import type { ServerContext, Session } from './context';
import { hasGlint } from '../../enchantments'; // Fase 7 (encantamientos)

const MAX_STANDS = 2000;

interface Stand {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Cabeza, pecho, piernas y pies. */
  armor: (ItemStack | null)[];
  ent: number;
}

export class ArmorStands {
  private byEnt = new Map<number, Stand>();
  /** Soportes por columna (para mirar sólo los afectados cuando cambia un bloque). */
  private byCol = new Map<string, Set<Stand>>();
  private dirty = false;

  constructor(private ctx: ServerContext, store: ServerStore) {
    try {
      const rows = JSON.parse(store.getMeta('stands') ?? '[]') as unknown;
      if (Array.isArray(rows)) {
        for (const r of rows.slice(0, MAX_STANDS)) {
          if (!Array.isArray(r) || r.length < 4 || !r.slice(0, 4).every(Number.isFinite)) continue;
          const armor = [0, 1, 2, 3].map((slot) => {
            const st = sanitizeStack(stackFromWire(r[4 + slot]));
            return st && ITEMS[st.id]?.armor?.slot === slot ? st : null;
          });
          this.spawn({ x: Number(r[0]), y: Number(r[1]), z: Number(r[2]), yaw: Number(r[3]), armor, ent: 0 });
        }
      }
    } catch {
      /* ignorar */
    }
  }

  /** Crea (o vuelve a crear) la entidad del soporte. */
  private spawn(st: Stand): void {
    if (st.ent) {
      this.ctx.entities.remove(st.ent);
      this.byEnt.delete(st.ent);
    }
    const e = this.ctx.entities.spawnBare(ENT_ARMOR_STAND, st.x, st.y, st.z, STAND_HALF * 2, STAND_HEIGHT);
    e.yaw = st.yaw;
    e.bodyYaw = st.yaw;
    e.standArmor = st.armor.map((a) => a?.id ?? 0);
    e.standGlint = st.armor.reduce((m, a, i) => (hasGlint(a) ? m | (1 << i) : m), 0); // Fase 7 (encantamientos)
    e.standDye = st.armor.map((a) => dyedColor(a) ?? -1); // el cuero teñido
    st.ent = e.id;
    this.byEnt.set(e.id, st);
    const k = `${Math.floor(st.x)},${Math.floor(st.z)}`;
    let set = this.byCol.get(k);
    if (!set) this.byCol.set(k, (set = new Set()));
    set.add(st);
    this.dirty = true;
  }

  private remove(st: Stand): void {
    this.byCol.get(`${Math.floor(st.x)},${Math.floor(st.z)}`)?.delete(st);
    this.byEnt.delete(st.ent);
    this.ctx.entities.remove(st.ent);
    this.dirty = true;
  }

  isStand(entityId: number): boolean {
    return this.byEnt.has(entityId);
  }

  /** Fase 7 (mecanismos): un dispensador le pone una pieza de armadura si ese hueco está libre; true si se la puso. */
  equip(entityId: number, stack: ItemStack): boolean {
    const st = this.byEnt.get(entityId);
    const piece = ITEMS[stack.id]?.armor;
    if (!st || !piece || st.armor[piece.slot]) return false;
    st.armor[piece.slot] = { ...stack, count: 1 };
    this.spawn(st);
    this.ctx.fx('stand_equip', st.x, st.y + 1, st.z);
    return true;
  }

  /** Poner un soporte encima del bloque (x, y, z). */
  onPlace(s: Session, msg: Extract<ClientMsg, { t: 'stand' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), q = Number(msg.q);
    const reply = (ok: boolean) => ctx.send(s, { t: 'ires', q: Number.isInteger(q) ? q : 0, ok, take: ok ? 1 : 0 });
    if (![x, y, z].every(Number.isInteger) || !Number.isFinite(Number(msg.yaw)) || s.s & STATE_DEAD) return reply(false);
    if (!ctx.reachOk(s, x, y, z, 8) || this.byEnt.size >= MAX_STANDS) return reply(false);
    const w = ctx.world;
    const floor = w.getBlock(x, y, z), a = w.getBlock(x, y + 1, z), b = w.getBlock(x, y + 2, z);
    if (floor < 0 || BLOCK_SOLID[floor] !== 1 || a < 0 || BLOCK_COLLIDE[a] || b < 0 || BLOCK_COLLIDE[b]) return reply(false);
    // No encima de otro soporte.
    for (const st of this.byEnt.values()) if (Math.floor(st.x) === x && Math.floor(st.z) === z && Math.abs(st.y - (y + 1)) < 2) return reply(false);
    this.spawn({ x: x + 0.5, y: y + 1, z: z + 0.5, yaw: standYaw(Number(msg.yaw)), armor: [null, null, null, null], ent: 0 });
    ctx.fx('stand_place', x + 0.5, y + 1, z + 0.5);
    reply(true);
  }

  /** Clic derecho: vestir con la pieza de la mano o quitar la de más arriba. null si no es un soporte. */
  onInteract(s: Session, e: Entity, msg: Extract<ClientMsg, { t: 'interact' }>): InteractResult | null {
    const st = this.byEnt.get(e.id);
    if (!st) return null;
    if (s.s & STATE_DEAD) return { ok: false };
    const item = Number(msg.item);
    const piece = Number.isInteger(item) && item > 0 ? ITEMS[item]?.armor : undefined;
    if (piece) {
      const old = st.armor[piece.slot];
      // La pieza de la mano (con su desgaste) y, si había otra, a la mano.
      // La pila entera (encantamientos, color) si el cliente la manda y es la misma pieza; si no, sólo el desgaste.
      const full = msg.st && Number(msg.st.id) === item ? sanitizeStack({ ...msg.st, count: 1 }) : null;
      const dmg = Math.max(0, Math.min(piece.durability - 1, Math.floor(Number(msg.d) || 0)));
      st.armor[piece.slot] = full ?? (dmg ? { id: item, count: 1, dmg } : { id: item, count: 1 });
      this.spawn(st);
      this.ctx.fx('stand_equip', st.x, st.y + 1, st.z);
      return old ? { ok: true, take: 1, give: old } : { ok: true, take: 1 };
    }
    if (item > 0) return { ok: false };
    const slot = st.armor.findIndex(Boolean);
    if (slot < 0) return { ok: false };
    const old = st.armor[slot]!;
    st.armor[slot] = null;
    this.spawn(st);
    this.ctx.fx('stand_equip', st.x, st.y + 1, st.z);
    return { ok: true, give: old };
  }

  /** Golpe a una entidad: si es un soporte, se rompe (devuelve true). */
  onAttack(s: Session, entityId: number): boolean {
    const st = this.byEnt.get(entityId);
    if (!st) return false;
    if (s.s & STATE_DEAD || Math.hypot(st.x - s.p[0], st.y - s.p[1], st.z - s.p[2]) > 7) return true;
    this.breakStand(st, s.mode === 'c');
    return true;
  }

  private breakStand(st: Stand, creative: boolean): void {
    const out: ItemStack[] = st.armor.filter((a): a is ItemStack => !!a);
    if (!creative) out.push({ id: ARMOR_STAND, count: 1 });
    if (out.length) this.ctx.entities.dropStacks(out, st.x, st.y + 0.5, st.z);
    this.ctx.fx('stand_break', st.x, st.y + 0.8, st.z);
    this.remove(st);
  }

  /** Cambió un bloque: si era el suelo de un soporte, cae hasta el siguiente (o se rompe). */
  onBlockChanged(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const col = this.byCol.get(`${x},${z}`);
    if (!col || col.size === 0) return;
    for (const st of [...col]) {
      const fy = Math.round(st.y) - 1;
      if (fy === y && BLOCK_SOLID[Math.max(0, w.getBlock(x, y, z))] !== 1) {
        let ny = y - 1;
        while (ny > y - 24 && w.getBlock(x, ny, z) >= 0 && BLOCK_SOLID[w.getBlock(x, ny, z)] !== 1) ny--;
        if (w.getBlock(x, ny, z) >= 0 && BLOCK_SOLID[w.getBlock(x, ny, z)] === 1) {
          st.y = ny + 1;
          this.spawn(st);
        } else this.breakStand(st, false);
      } else if ((y === Math.round(st.y) || y === Math.round(st.y) + 1) && BLOCK_COLLIDE[Math.max(0, w.getBlock(x, y, z))]) {
        // Un bloque en su sitio: se rompe.
        this.breakStand(st, false);
      }
    }
  }

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    const rows = [...this.byEnt.values()].map((st) => [
      Math.round(st.x * 100) / 100, st.y, Math.round(st.z * 100) / 100, Math.round(st.yaw * 1000) / 1000,
      ...st.armor.map((a) => stackToWire(a) ?? 0),
    ]);
    store.setMeta('stands', JSON.stringify(rows));
  }
}
