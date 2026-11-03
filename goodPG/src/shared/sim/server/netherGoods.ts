// Fase 8.5 (lo que da el Nether): lo que el servidor hace con los bloques nuevos del Nether.
// - Nexo de reaparición (RespawnAnchorBlock): se carga con piedra luminosa (una por uso, hasta 4) en cualquier
//   dimensión; cargado, en el Nether fija ahí el punto de reaparición («Punto de reaparición establecido») y en
//   otra dimensión explota (potencia 5, con fuego; si hay agua al lado, no rompe bloques). Al reaparecer se busca
//   sitio de pie a su alrededor y se gasta una carga; sin cargas, roto u obstruido, se pierde el punto.
// - Columnas de burbujas (BubbleColumnBlock): el agua quieta encima de arena de alma (sube) o de magma (tira hacia
//   abajo) se vuelve columna, hacia arriba mientras siga habiendo agua quieta; si le quitan el apoyo, vuelve a
//   ser agua. La arena y el magma la forman a los 20 ticks; la columna se revisa a los 5. Dentro, las criaturas y
//   los objetos suben (o bajan) como en Java; en la superficie de una que sube salen despedidos.
// - Faro: guarda los efectos elegidos en su pantalla (el pago lo gasta el cliente) y cada 4 s repasa su pirámide
//   y su haz; encendido, da sus efectos a los jugadores a su alcance (ver shared/beacon.ts).
import {
  AIR, FIRE, GLOWSTONE, BLOCK_SOLID, BLOCK_FLUID, RESPAWN_ANCHOR, RESPAWN_ANCHOR_MAX_CHARGES, anchorCharges,
  WATER, SOUL_SAND, MAGMA_BLOCK, BUBBLE_COLUMN, isBubbleColumn, bubbleColumnDown,
} from '../../blocks';
import { ENT_ITEM } from '../../mobs';
import { BEACON } from '../../blocks';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import {
  beaconActive, validPrimary, validSecondary, beaconRange, beaconSeconds, BEACON_PULSE,
} from '../../beacon';
import type { ServerStore } from '../store';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { dimensionDef } from '../../dimensions';
import type { ServerContext, Session } from './context';

/** Dónde se busca sitio para reaparecer junto al nexo (como RESPAWN_HORIZONTAL_OFFSETS, a su altura y debajo). */
const AROUND: readonly (readonly [number, number])[] = [[0, -1], [-1, 0], [0, 1], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/** Ticks hasta revisar una columna: desde su arena o su magma (20) y desde la propia columna (5). */
const COLUMN_FROM_BASE = 20;
const COLUMN_FROM_SELF = 5;

/** ¿Puede ocupar la columna este bloque? (agua quieta o columna: canExistIn). */
const columnFits = (id: number) => id === WATER || isBubbleColumn(id);

/** La columna que toca encima de `below` (o agua si no hay apoyo): getColumnState. */
function columnFor(below: number): number {
  if (isBubbleColumn(below)) return below;
  if (below === SOUL_SAND) return BUBBLE_COLUMN;
  if (below === MAGMA_BLOCK) return BUBBLE_COLUMN + 1;
  return WATER;
}

/** Faro: efectos elegidos (0 ninguno) y si estaba encendido en el último repaso. */
interface Beacon {
  primary: number;
  secondary: number;
  active: boolean;
}

export class NetherGoods {
  /** Columnas por revisar: posición → tick en que toca. */
  private columns = new Map<number, number>();
  private ticks = 0;
  private beacons = new Map<number, Beacon>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; p?: unknown; s?: unknown };
        if (w.k !== 'bc') continue;
        this.beacons.set(key, { primary: Number(w.p) || 0, secondary: Number(w.s) || 0, active: false });
      } catch {
        /* ignorar */
      }
    }
  }

  // ------------------------------------------------------------------ faro

  /** El jugador eligió los efectos del faro de (x, y, z) (y ya gastó el pago). */
  onBeacon(s: Session, msg: Extract<ClientMsg, { t: 'beacon' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 6)) return;
    if (ctx.world.getBlock(x, y, z) !== BEACON) return;
    const get = (a: number, b: number, c: number) => ctx.world.getBlock(a, b, c);
    const { level } = beaconActive(get, x, y, z);
    const p = Number(msg.p), sec = Number(msg.s);
    if (!validPrimary(p, level)) return;
    const b: Beacon = { primary: p, secondary: validSecondary(sec, p, level) ? sec : 0, active: false };
    const k = posKey(x, y, z);
    b.active = this.beacons.get(k)?.active ?? false;
    this.beacons.set(k, b);
    this.dirty.add(k);
    ctx.broadcast({ t: 'beacon', x, y, z, p: b.primary, s: b.secondary });
    ctx.fx('beacon_power', x + 0.5, y + 0.5, z + 0.5);
  }

  /** Lo que un jugador que entra debe saber: los efectos elegidos de cada faro. */
  onJoin(s: Session): void {
    for (const [k, b] of this.beacons) {
      if (b.primary) this.ctx.send(s, { t: 'beacon', x: keyX(k), y: keyY(k), z: keyZ(k), p: b.primary, s: b.secondary });
    }
  }

  /** Cada 80 ticks: la pirámide y el haz de cada faro conocido, y sus efectos. */
  private pulseBeacons(): void {
    const ctx = this.ctx, w = ctx.world;
    const get = (a: number, b: number, c: number) => w.getBlock(a, b, c);
    for (const [k, b] of this.beacons) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = w.getBlock(x, y, z);
      if (id < 0) continue; // sin cargar
      if (id !== BEACON) {
        this.beacons.delete(k);
        this.dirty.add(k);
        continue;
      }
      const { level, segments } = beaconActive(get, x, y, z);
      const active = level > 0 && !!segments;
      b.active = active; // (el sonido de encenderse y apagarse lo pone el cliente, que ve el haz)
      if (!active || !b.primary || !validPrimary(b.primary, level)) continue;
      const range = beaconRange(level), secs = beaconSeconds(level);
      const second = validSecondary(b.secondary, b.primary, level) ? b.secondary : 0;
      for (const s of ctx.sessions()) {
        if (!s.joined || s.s & STATE_DEAD) continue;
        if (Math.abs(s.p[0] - x - 0.5) > range + 0.5 || Math.abs(s.p[2] - z - 0.5) > range + 0.5 || s.p[1] < y - range) continue;
        ctx.send(s, { t: 'effect', id: b.primary, s: secs, a: second === b.primary ? 1 : 0 });
        if (second && second !== b.primary) ctx.send(s, { t: 'effect', id: second, s: secs, a: 0 });
      }
    }
  }

  /** Un faro colocado: a la lista (sin efectos hasta que se elijan). */
  private noteBeacon(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    if (!this.beacons.has(k)) this.beacons.set(k, { primary: 0, secondary: 0, active: false });
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const b = this.beacons.get(k);
      store.saveContainer(k, b && b.primary ? JSON.stringify({ k: 'bc', p: b.primary, s: b.secondary }) : null);
    }
    this.dirty.clear();
  }

  // ------------------------------------------------------------------ columnas de burbujas

  /** Un bloque cambió: revisar la columna de su sitio y la de encima. */
  onBlockChanged(x: number, y: number, z: number, id: number): void {
    if (id === BEACON) this.noteBeacon(x, y, z);
    const base = id === SOUL_SAND || id === MAGMA_BLOCK;
    if (base || columnFits(id) || isBubbleColumn(this.ctx.world.getBlock(x, y + 1, z))) {
      this.scheduleColumn(x, y + 1, z, base ? COLUMN_FROM_BASE : COLUMN_FROM_SELF);
    }
    if (isBubbleColumn(id) || id === WATER) this.scheduleColumn(x, y, z, COLUMN_FROM_SELF);
  }

  private scheduleColumn(x: number, y: number, z: number, delay: number): void {
    const k = posKey(x, y, z);
    const at = this.ticks + delay;
    const prev = this.columns.get(k);
    if (prev === undefined || prev > at) this.columns.set(k, at);
  }

  /** updateColumn: la columna de (x, y, z) según lo de debajo, y hacia arriba mientras haya agua quieta. */
  private updateColumn(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const here = w.getBlock(x, y, z);
    if (!columnFits(here)) return;
    const target = columnFor(w.getBlock(x, y - 1, z));
    for (let yy = y; yy < y + 256; yy++) {
      const b = w.getBlock(x, yy, z);
      if (!columnFits(b)) break;
      if (b !== target) w.setBlock(x, yy, z, target);
    }
  }

  /** Cada tick: las columnas que tocan y el empuje a lo que está dentro. */
  tick(dt: number): void {
    this.ticks++;
    for (const [k, at] of this.columns) {
      if (at > this.ticks) continue;
      this.columns.delete(k);
      this.updateColumn(keyX(k), keyY(k), keyZ(k));
    }
    this.pushEntities(dt);
    if (this.ctx.tickCount % BEACON_PULSE === 0) this.pulseBeacons();
  }

  /**
   * onInsideBubbleColumn / onAboveBubbleColumn de Java (en bloques por tick: dentro sube 0,06 hasta 0,7 o baja
   * 0,03 hasta −0,3; en la superficie de una que sube, 0,1 hasta 1,8; encima de una que baja, −0,03 hasta −0,9).
   */
  private pushEntities(dt: number): void {
    const w = this.ctx.world;
    const k = dt * 20; // de «por tick» a este paso
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || (!e.ai && e.type !== ENT_ITEM)) continue;
      const bx = Math.floor(e.x), bz = Math.floor(e.z);
      const b = w.getBlock(bx, Math.floor(e.y + 0.1), bz);
      if (!isBubbleColumn(b)) continue;
      const down = bubbleColumnDown(b);
      const top = w.getBlock(bx, Math.floor(e.y + 0.1) + 1, bz) === AIR;
      const vy = e.vy / 20;
      let nv: number;
      if (top) nv = down ? Math.max(-0.9, vy - 0.03 * k) : Math.min(1.8, vy + 0.1 * k);
      else nv = down ? Math.max(-0.3, vy - 0.03 * k) : Math.min(0.7, vy + 0.06 * k);
      e.vy = nv * 20;
    }
  }

  // ------------------------------------------------------------------ nexo de reaparición

  /** Clic derecho sobre un bloque de los suyos (`item`: lo que lleva en la mano). Devuelve si lo atendió. */
  use(s: Session, x: number, y: number, z: number, id: number, item: number): boolean {
    const charges = anchorCharges(id);
    if (charges < 0) return false;
    const ctx = this.ctx;
    // Con piedra luminosa y hueco: una carga más (el cliente ya gastó la piedra luminosa).
    if (item === GLOWSTONE && charges < RESPAWN_ANCHOR_MAX_CHARGES) {
      ctx.world.setBlock(x, y, z, RESPAWN_ANCHOR + charges + 1);
      ctx.fx('anchor_charge', x + 0.5, y + 0.5, z + 0.5, charges + 1);
      return true;
    }
    if (charges === 0) return false;
    if (!dimensionDef(ctx.dim).anchors) {
      this.explode(x, y, z);
      return true;
    }
    const same = s.bed && s.bedDim === ctx.dim && s.bed[0] === x && s.bed[1] === y && s.bed[2] === z;
    if (!same) {
      s.bed = [x, y, z];
      s.bedDim = ctx.dim;
      ctx.savePlayer(s);
      ctx.send(s, { t: 'spawn', p: [x, y, z], d: ctx.dim });
      ctx.tell(s, 'Punto de reaparición establecido.');
      ctx.fx('anchor_set', x + 0.5, y + 0.5, z + 0.5);
    }
    return true;
  }

  /** El nexo cargado usado fuera del Nether: desaparece y explota (con fuego). */
  private explode(x: number, y: number, z: number): void {
    const ctx = this.ctx, w = ctx.world;
    // Con agua que correría al lado, la explosión no rompe bloques (isWaterThatWouldFlow).
    const water = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => BLOCK_FLUID[Math.max(0, w.getBlock(x + dx, y, z + dz))] === 1);
    w.setBlock(x, y, z, AIR);
    ctx.entities.explosion?.(x + 0.5, y + 0.5, z + 0.5, 5, false, !water);
    if (water) return;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (ctx.rand() > 0.33) continue;
          const b = w.getBlock(x + dx, y + dy, z + dz), below = w.getBlock(x + dx, y + dy - 1, z + dz);
          if (b === AIR && below > 0 && BLOCK_SOLID[below]) w.setBlock(x + dx, y + dy, z + dz, FIRE);
        }
      }
    }
  }

  /**
   * Reaparecer en el nexo de (x, y, z) de esta dimensión: si sigue ahí con carga y hay sitio de pie a su
   * alrededor, gasta una carga y devuelve dónde (los pies); si no, null.
   */
  respawnAt(x: number, y: number, z: number): [number, number, number] | null {
    const w = this.ctx.world;
    w.ensureChunk(Math.floor(x / 16), Math.floor(z / 16), this.ctx.now());
    const id = w.getBlock(x, y, z);
    const charges = anchorCharges(id);
    if (charges <= 0) return null;
    const free = (bx: number, by: number, bz: number) => {
      const a = w.getBlock(bx, by, bz), b = w.getBlock(bx, by + 1, bz), g = w.getBlock(bx, by - 1, bz);
      return a >= 0 && b >= 0 && !BLOCK_SOLID[a] && !BLOCK_SOLID[b] && !BLOCK_FLUID[a] && !BLOCK_FLUID[b] && g > 0 && BLOCK_SOLID[g] && a !== FIRE;
    };
    for (const dy of [0, -1]) {
      for (const [dx, dz] of AROUND) {
        if (!free(x + dx, y + dy, z + dz)) continue;
        w.setBlock(x, y, z, RESPAWN_ANCHOR + charges - 1);
        this.ctx.fx('anchor_deplete', x + 0.5, y + 0.5, z + 0.5);
        return [x + dx + 0.5, y + dy, z + dz + 0.5];
      }
    }
    // Encima del nexo.
    if (free(x, y + 1, z)) {
      w.setBlock(x, y, z, RESPAWN_ANCHOR + charges - 1);
      this.ctx.fx('anchor_deplete', x + 0.5, y + 0.5, z + 0.5);
      return [x + 0.5, y + 1, z + 0.5];
    }
    return null;
  }
}

