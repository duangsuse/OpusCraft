// Fase 6.5 (decoración): cuadros y marcos colgados en las paredes. Son entidades sin comportamiento
// (se dibujan en el cliente) que este sistema crea, guarda (en los metadatos del mundo) y retira:
// se cuelgan con 'hang', el marco recibe o gira su objeto con 'frame', un golpe los descuelga (o saca el
// objeto del marco) y se caen si desaparece la pared o se pone un bloque en su sitio.
// Fase 6.5 (colecciones): también el marco brillante (clase 2; el objeto se dibuja a plena luz).
import { BLOCK_SOLID, BLOCK_RENDER, BLOCK_COLLIDE, R_CROSS } from '../../blocks';
import { ITEMS, PAINTING, ITEM_FRAME, isValidItem, type ItemStack } from '../../items';
import { GLOW_ITEM_FRAME } from '../../items'; // Fase 6.5 (colecciones)
import { DIR_X, DIR_Z } from '../../blockModels';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import {
  ENT_PAINTING, ENT_FRAME, PAINTINGS, isHangingType, hangingCells, hangingCenter, hangingYaw, rightOf,
} from '../../paintings';
import { ENT_GLOW_FRAME } from '../../paintings'; // Fase 6.5 (colecciones)
import type { ServerStore } from '../store';
import { posKey } from '../posKey';
import type { Entity } from '../entities';
import type { ServerContext, Session } from './context';

/** Cuadros y marcos que se guardan como mucho. */
const MAX_HANGINGS = 5000;

/** Entidad y objeto de cada clase: 0 cuadro, 1 marco y (Fase 6.5, colecciones) 2 marco brillante. */
const KIND_ENTITY = [ENT_PAINTING, ENT_FRAME, ENT_GLOW_FRAME];
const KIND_ITEM = [PAINTING, ITEM_FRAME, GLOW_ITEM_FRAME];

interface Hanging {
  /** 0 cuadro, 1 marco, 2 marco brillante. */
  kind: number;
  /** Celda de aire de abajo a la izquierda (vista de frente) y dirección hacia la que da. */
  x: number;
  y: number;
  z: number;
  f: number;
  /** Cuadro: variante. Marco: objeto que muestra (0 = vacío). */
  v: number;
  /** Marco: giro del objeto (0..7, de 45° en 45°). */
  rot: number;
  /** Entidad que lo representa. */
  ent: number;
}

type Row = [kind: number, x: number, y: number, z: number, f: number, v: number, rot: number];

export class Hangings {
  private byEnt = new Map<number, Hanging>();
  /** Celdas (de aire y de pared) → cuadros y marcos que dependen de ellas. */
  private byCell = new Map<number, Set<Hanging>>();
  private dirty = false;
  /** Fase 7 (redstone): cambió un marco colgado en la celda de aire (x, y, z) (lo leen los comparadores). */
  onFrameChanged: ((x: number, y: number, z: number) => void) | null = null;

  constructor(private ctx: ServerContext, store: ServerStore) {
    try {
      const rows = JSON.parse(store.getMeta('hangings') ?? '[]') as unknown;
      if (Array.isArray(rows)) {
        for (const r of rows.slice(0, MAX_HANGINGS)) {
          if (!Array.isArray(r) || r.length < 7 || !r.every(Number.isFinite)) continue;
          const [kind, x, y, z, f, v, rot] = (r as number[]).map((n) => Math.trunc(n));
          if (!KIND_ENTITY[kind] || f < 0 || f > 3) continue;
          if (kind === 0 && !PAINTINGS[v]) continue;
          if (kind >= 1 && v !== 0 && !isValidItem(v)) continue;
          this.add({ kind, x, y, z, f, v, rot: rot & 7, ent: 0 });
        }
      }
    } catch {
      /* ignorar */
    }
  }

  private size(h: Hanging): [number, number] {
    return h.kind === 0 ? [PAINTINGS[h.v].w, PAINTINGS[h.v].h] : [1, 1];
  }

  private cells(h: Hanging) {
    const [w, hh] = this.size(h);
    return hangingCells(h.x, h.y, h.z, h.f, w, hh);
  }

  /** Crea (o vuelve a crear) la entidad de un cuadro o marco. */
  private spawn(h: Hanging): void {
    if (h.ent) this.ctx.entities.remove(h.ent);
    this.byEnt.delete(h.ent);
    const [w, hh] = this.size(h);
    const [cx, cy, cz] = hangingCenter(h.x, h.y, h.z, h.f, w, hh);
    const e = this.ctx.entities.spawnBare(KIND_ENTITY[h.kind], cx, cy - hh / 2, cz, Math.max(w, 1 / 16), hh);
    e.y = cy;
    e.yaw = hangingYaw(h.f);
    e.bodyYaw = e.yaw;
    e.pitch = h.kind >= 1 ? (h.rot * Math.PI) / 4 : 0;
    e.variant = h.v;
    h.ent = e.id;
    this.byEnt.set(e.id, h);
    if (h.kind >= 1) this.onFrameChanged?.(h.x, h.y, h.z); // Fase 7 (redstone)
  }

  private add(h: Hanging): void {
    for (const c of this.cells(h)) {
      for (const k of [posKey(c.x, c.y, c.z), posKey(c.wx, c.y, c.wz)]) {
        let set = this.byCell.get(k);
        if (!set) this.byCell.set(k, (set = new Set()));
        set.add(h);
      }
    }
    this.spawn(h);
    this.dirty = true;
  }

  private delete(h: Hanging): void {
    for (const c of this.cells(h)) {
      for (const k of [posKey(c.x, c.y, c.z), posKey(c.wx, c.y, c.wz)]) this.byCell.get(k)?.delete(h);
    }
    this.byEnt.delete(h.ent);
    this.ctx.entities.remove(h.ent);
    this.dirty = true;
    if (h.kind >= 1) this.onFrameChanged?.(h.x, h.y, h.z); // Fase 7 (redstone)
  }

  /** Fase 7 (redstone): lectura de un comparador del marco colgado en la celda de aire (x, y, z): giro + 1 con objeto, 0 vacío, −1 si no hay. */
  frameSignal(x: number, y: number, z: number): number {
    const set = this.byCell.get(posKey(x, y, z));
    if (set) for (const h of set) if (h.kind >= 1 && h.x === x && h.y === y && h.z === z) return h.v ? h.rot + 1 : 0;
    return -1;
  }

  /** ¿Sigue bien colgado? (pared sólida detrás y aire delante en todas sus celdas). */
  private fits(h: Hanging, ignore?: Hanging): boolean {
    const w = this.ctx.world;
    for (const c of this.cells(h)) {
      const space = w.getBlock(c.x, c.y, c.z);
      const wall = w.getBlock(c.wx, c.y, c.wz);
      if (space < 0 || wall < 0) return true; // sin cargar: no tocar
      if (BLOCK_COLLIDE[space] || BLOCK_SOLID[wall] !== 1 || BLOCK_RENDER[wall] === R_CROSS) return false;
      for (const o of this.byCell.get(posKey(c.x, c.y, c.z)) ?? []) {
        if (o !== h && o !== ignore && o.f === h.f && this.cells(o).some((oc) => oc.x === c.x && oc.y === c.y && oc.z === c.z)) return false;
      }
    }
    return true;
  }

  /** Suelta lo que lleva (el cuadro o el marco y su objeto) salvo en creativo. */
  private drops(h: Hanging, creative: boolean): void {
    if (creative) return;
    const e = this.ctx.entities.list.get(h.ent);
    const x = e?.x ?? h.x + 0.5, y = e?.y ?? h.y + 0.5, z = e?.z ?? h.z + 0.5;
    const out: ItemStack[] = [{ id: KIND_ITEM[h.kind], count: 1 }];
    if (h.kind >= 1 && h.v) out.push({ id: h.v, count: 1 });
    this.ctx.entities.dropStacks(out, x + DIR_X[h.f] * 0.2, y, z + DIR_Z[h.f] * 0.2);
  }

  // ------------------------------------------------------------------ mensajes

  /** Colgar un cuadro o un marco en la cara `f` del bloque (x, y, z). */
  onHang(s: Session, msg: Extract<ClientMsg, { t: 'hang' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), f = Number(msg.f), item = Number(msg.item), q = Number(msg.q);
    const reply = (ok: boolean) => ctx.send(s, { t: 'ires', q: Number.isInteger(q) ? q : 0, ok, take: ok ? 1 : 0 });
    if (![x, y, z, f, item].every(Number.isInteger) || f < 0 || f > 3 || !KIND_ITEM.includes(item)) return reply(false);
    if (s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8) || this.byEnt.size >= MAX_HANGINGS) return reply(false);
    const ax = x + DIR_X[f], az = z + DIR_Z[f];
    let chosen: Hanging | null = null;
    if (item !== PAINTING) {
      const h: Hanging = { kind: KIND_ITEM.indexOf(item), x: ax, y, z: az, f, v: 0, rot: 0, ent: 0 };
      if (this.fits(h)) chosen = h;
    } else {
      // El cuadro más grande que quepa (al azar entre los del mismo tamaño), con la celda del clic dentro.
      const r = rightOf(f);
      const fitting: Hanging[] = [];
      PAINTINGS.forEach((v, i) => {
        for (let oy = 0; oy < v.h; oy++) {
          for (let ox = 0; ox < v.w; ox++) {
            const h: Hanging = { kind: 0, x: ax - DIR_X[r] * ox, y: y - oy, z: az - DIR_Z[r] * ox, f, v: i, rot: 0, ent: 0 };
            if (this.fits(h)) {
              fitting.push(h);
              return;
            }
          }
        }
      });
      const area = (h: Hanging) => PAINTINGS[h.v].w * PAINTINGS[h.v].h;
      const best = Math.max(0, ...fitting.map(area));
      const top = fitting.filter((h) => area(h) === best);
      if (top.length) chosen = top[Math.floor(ctx.rand() * top.length)];
    }
    if (!chosen) return reply(false);
    this.add(chosen);
    ctx.fx('hang_place', ax + 0.5, y + 0.5, az + 0.5);
    reply(true);
  }

  /** Fase 8.6: un marco colgado en la celda de aire (x, y, z) mirando hacia `f` con `item` (el de los élitros del barco del End). */
  placeFrame(x: number, y: number, z: number, f: number, item: number): void {
    if (this.byEnt.size >= MAX_HANGINGS || f < 0 || f > 3) return;
    for (const h of this.byCell.get(posKey(x, y, z)) ?? []) if (h.x === x && h.y === y && h.z === z) return;
    this.add({ kind: 1, x, y, z, f, v: item, rot: 0, ent: 0 });
  }

  /** Clic derecho en un marco: poner el objeto de la mano o girar el que ya tiene. */
  onFrame(s: Session, msg: Extract<ClientMsg, { t: 'frame' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q), item = Number(msg.item);
    const reply = (ok: boolean) => ctx.send(s, { t: 'ires', q: Number.isInteger(q) ? q : 0, ok, take: ok ? 1 : 0 });
    const h = this.byEnt.get(Number(msg.e));
    const e = h ? ctx.entities.list.get(h.ent) : undefined;
    if (!h || !e || h.kind === 0 || s.s & STATE_DEAD || !this.near(s, e)) return reply(false);
    if (!h.v) {
      if (!isValidItem(item) || !ITEMS[item]) return reply(false);
      h.v = item;
      h.rot = 0;
      this.spawn(h);
      this.dirty = true;
      ctx.fx('frame_add', e.x, e.y, e.z);
      return reply(true);
    }
    h.rot = (h.rot + 1) & 7;
    e.pitch = (h.rot * Math.PI) / 4;
    this.dirty = true;
    this.onFrameChanged?.(h.x, h.y, h.z); // Fase 7 (redstone)
    ctx.fx('frame_rotate', e.x, e.y, e.z);
    reply(false);
  }

  /** Golpe a una entidad: si es un cuadro o un marco, se atiende aquí (devuelve true). */
  onAttack(s: Session, entityId: number): boolean {
    const h = this.byEnt.get(entityId);
    if (!h) return false;
    const e = this.ctx.entities.list.get(h.ent);
    if (!e || s.s & STATE_DEAD || !this.near(s, e)) return true;
    const creative = s.mode === 'c';
    if (h.kind >= 1 && h.v) {
      // El primer golpe saca el objeto del marco.
      if (!creative) this.ctx.entities.dropStacks([{ id: h.v, count: 1 }], e.x + DIR_X[h.f] * 0.2, e.y, e.z + DIR_Z[h.f] * 0.2);
      h.v = 0;
      h.rot = 0;
      this.spawn(h);
      this.dirty = true;
      this.ctx.fx('frame_remove', e.x, e.y, e.z);
      return true;
    }
    this.drops(h, creative);
    this.delete(h);
    this.ctx.fx('hang_break', e.x, e.y, e.z);
    return true;
  }

  private near(s: Session, e: Entity): boolean {
    const reach = this.ctx.local ? 8 : 6;
    return Math.hypot(e.x - s.p[0], e.y - (s.p[1] + 1.6), e.z - s.p[2]) <= reach;
  }

  /** Un bloque cambió: lo que se quedó sin pared (o con un bloque delante) se cae. */
  onBlockChanged(x: number, y: number, z: number): void {
    const set = this.byCell.get(posKey(x, y, z));
    if (!set || set.size === 0) return;
    for (const h of [...set]) {
      if (this.fits(h)) continue;
      this.drops(h, false);
      const e = this.ctx.entities.list.get(h.ent);
      if (e) this.ctx.fx('hang_break', e.x, e.y, e.z);
      this.delete(h);
    }
  }

  /** ¿Es una entidad de cuadro o marco de este sistema? */
  isHanging(e: Entity): boolean {
    return isHangingType(e.type) && this.byEnt.has(e.id);
  }

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    const rows: Row[] = [...this.byEnt.values()].map((h) => [h.kind, h.x, h.y, h.z, h.f, h.v, h.rot]);
    store.setMeta('hangings', JSON.stringify(rows));
  }
}
