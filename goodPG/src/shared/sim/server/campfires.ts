// Fogatas: hasta cuatro alimentos crudos se asan encima (30 s cada uno, como en Minecraft) y saltan ya
// hechos. Lo que se asa se ve como objetos quietos sobre la fogata. El estado se guarda con los
// contenedores (clave de posición).
import { CAMPFIRE, familyBase, stateProps, isCampfire } from '../../blocks';
import { sanitizeStack, smeltResult, variantSmelts } from '../../containers';
import type { ItemStack } from '../../items';
import type { ServerStore } from '../store';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext } from './context';

/** Segundos que tarda en asarse cada alimento. */
export const CAMPFIRE_COOK_SECONDS = 30;
const SLOTS = 4;
/** Dónde se ve cada alimento sobre la fogata (fracción del bloque) y su giro. */
const SPOTS: [number, number][] = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]];

interface Fire {
  slots: (ItemStack | null)[];
  times: number[];
  /** Entidades de adorno de cada hueco (no se guardan: se recrean). */
  shown: (number | null)[];
}

/** ¿Se puede asar en una fogata? (lo mismo que en el ahumador). */
export function campfireCooks(item: number): boolean {
  return variantSmelts(1, item);
}

export class Campfires {
  private fires = new Map<number, Fire>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; s?: unknown[]; t?: unknown[] };
        if (w.k !== 'cf' || !Array.isArray(w.s)) continue;
        const f = this.empty();
        for (let i = 0; i < SLOTS; i++) {
          const s = w.s[i];
          f.slots[i] = Array.isArray(s) ? sanitizeStack({ id: s[0], count: 1 }) : null;
          const t = Number(w.t?.[i]);
          f.times[i] = Number.isFinite(t) ? Math.max(0, Math.min(CAMPFIRE_COOK_SECONDS, t)) : 0;
        }
        this.fires.set(key, f);
      } catch {
        /* ignorar */
      }
    }
  }

  private empty(): Fire {
    return { slots: new Array(SLOTS).fill(null), times: new Array(SLOTS).fill(0), shown: new Array(SLOTS).fill(null) };
  }

  /** Poner a asar `item` (el cliente ya lo gastó). Devuelve si cabía. */
  use(x: number, y: number, z: number, item: number): boolean {
    const ctx = this.ctx;
    const id = ctx.world.getBlock(x, y, z);
    if (!isCampfire(id) || !stateProps(id)!.lit || !campfireCooks(item)) return false;
    const k = posKey(x, y, z);
    const f = this.fires.get(k) ?? this.empty();
    const i = f.slots.findIndex((sl) => !sl);
    if (i < 0) return false;
    f.slots[i] = { id: item, count: 1 };
    f.times[i] = 0;
    this.fires.set(k, f);
    this.show(k, f, i);
    this.dirty.add(k);
    ctx.fx('campfire_put', x + 0.5, y + 0.5, z + 0.5);
    return true;
  }

  /** Crea el adorno de un hueco. */
  private show(k: number, f: Fire, i: number): void {
    const st = f.slots[i];
    if (!st) return;
    const [ox, oz] = SPOTS[i];
    const e = this.ctx.entities.spawnDisplay(st, keyX(k) + ox, keyY(k) + 7 / 16 + 0.01, keyZ(k) + oz, (i * Math.PI) / 2);
    f.shown[i] = e.id;
  }

  private hide(f: Fire, i: number): void {
    const eid = f.shown[i];
    if (eid !== null) this.ctx.entities.remove(eid);
    f.shown[i] = null;
  }

  /** La fogata desaparece: suelta lo que se asaba. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isCampfire(old) || isCampfire(id)) return;
    const k = posKey(x, y, z);
    const f = this.fires.get(k);
    if (!f) return;
    for (let i = 0; i < SLOTS; i++) this.hide(f, i);
    this.ctx.entities.dropStacks(f.slots.filter((s): s is ItemStack => !!s), x + 0.5, y + 0.4, z + 0.5);
    this.fires.delete(k);
    this.dirty.add(k);
  }

  /** Asa (sólo encendida y con el chunk cargado) y reaparece los adornos que falten. */
  tick(dt: number): void {
    const ctx = this.ctx;
    for (const [k, f] of this.fires) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = ctx.world.getBlock(x, y, z);
      if (id < 0) continue;
      if (!isCampfire(id)) {
        this.onBlockChanged(x, y, z, CAMPFIRE, id);
        continue;
      }
      const lit = stateProps(id)!.lit === 1;
      for (let i = 0; i < SLOTS; i++) {
        const st = f.slots[i];
        if (!st) continue;
        if (f.shown[i] === null || !ctx.entities.list.has(f.shown[i]!)) this.show(k, f, i);
        if (!lit) continue;
        f.times[i] += dt;
        if (f.times[i] < CAMPFIRE_COOK_SECONDS) continue;
        const cooked = smeltResult(st.id) ?? st.id;
        this.hide(f, i);
        f.slots[i] = null;
        f.times[i] = 0;
        ctx.entities.spawnItem({ id: cooked, count: 1 }, x + SPOTS[i][0], y + 0.6, z + SPOTS[i][1], 0, 2.5, 0);
        ctx.fx('campfire_done', x + 0.5, y + 0.6, z + 0.5);
      }
      this.dirty.add(k);
      if (f.slots.every((sl) => !sl)) this.fires.delete(k);
    }
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const f = this.fires.get(k);
      store.saveContainer(k, f ? JSON.stringify({ k: 'cf', s: f.slots.map((sl) => (sl ? [sl.id, 1] : null)), t: f.times.map((t) => Math.round(t)) }) : null);
    }
    this.dirty.clear();
  }
}
