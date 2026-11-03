// Fase 8 (dimensiones): portales del Nether, como en Minecraft.
// - Encender: cualquier fuego que aparezca dentro de un marco de obsidiana (de 2×3 a 21×21 por dentro, en
//   vertical) lo llena de portal. Da igual qué lo encienda: mechero, carga de fuego, rayo, fuego que se
//   extiende…
// - Romper: un bloque de portal sólo se sostiene con portal u obsidiana arriba, abajo y a los lados de su
//   plano; si le falta, desaparece, y con él, en cadena, el resto.
// - Cruzar: quien pasa 4 s dentro de un portal (en creativo, al momento) viaja a la otra dimensión, al
//   sitio equivalente (÷8 al ir al Nether, ×8 al volver). Al llegar no vuelve a viajar hasta que sale.
// - Llegar: se busca el portal más cercano de la dimensión de destino (128 bloques en el mundo normal, 16
//   en el Nether); si no hay, se construye uno (con plataforma si hace falta) en el mejor sitio cercano.
// Los bloques de portal de cada dimensión se apuntan (y se guardan) para encontrarlos sin buscar a ciegas.
// Fase 8.6: el portal del End lleva al momento (EndPortalBlock.entityInside: al tocar su lámina, de y 6/16 a 12/16) al
// End, a la plataforma de obsidiana; desde el End, al punto de aparición (la cama) del mundo normal.
import { AIR, OBSIDIAN, BLOCK_SOLID, BLOCK_FLUID, NETHER_PORTAL, END_PORTAL, isNetherPortal, isFire, portalAxis } from '../../blocks';
import { MIN_Y, MAX_Y, CHUNK_SIZE, WORLD_LIMIT } from '../../constants';
import { STATE_DEAD } from '../../protocol';
import { DIM_OVERWORLD, DIM_NETHER, DIM_END, PORTAL_TICKS, dimensionDef } from '../../dimensions';
import { NETHER_LAVA_LEVEL, NETHER_ROOF } from '../../world/nether';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import type { ServerContext, Session } from './context';

export { PORTAL_TICKS };
const MIN_W = 2, MIN_H = 3, MAX_SIDE = 21;

/** Dimensión a la que lleva un portal del Nether desde `dim`. */
export function netherPortalTarget(dim: number): number {
  return dim === DIM_NETHER ? DIM_OVERWORLD : DIM_NETHER;
}

export class Portals {
  /** Bloques de portal de esta dimensión (claves de posición). */
  private blocks = new Set<number>();
  private dirty = false;
  /** Ticks que lleva cada jugador dentro de un portal. */
  private inside = new Map<string, number>();
  /** Jugadores que acaban de llegar por un portal y aún no han salido de él. */
  private arrived = new Set<string>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    try {
      const list = JSON.parse(store.getMeta('portals') ?? '[]') as unknown;
      if (Array.isArray(list)) for (const k of list) if (Number.isFinite(k)) this.blocks.add(k as number);
    } catch {
      /* sin portales guardados */
    }
  }

  get count(): number {
    return this.blocks.size;
  }

  // ------------------------------------------------------------------ encender y romper

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (isNetherPortal(id)) {
      this.blocks.add(posKey(x, y, z));
      this.dirty = true;
    } else if (isNetherPortal(old)) {
      this.blocks.delete(posKey(x, y, z));
      this.dirty = true;
    }
    // Fase 8.6: el portal sólo se enciende en el mundo normal y en el Nether (en el End, no: inPortalDimension).
    if (isFire(id) && (this.ctx.dim === DIM_OVERWORLD || this.ctx.dim === DIM_NETHER) && this.light(x, y, z)) return;
    // Lo que cambia junto a un portal puede dejarlo sin marco.
    if (old === OBSIDIAN || isNetherPortal(old)) {
      const w = this.ctx.world;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const n = w.getBlock(nx, ny, nz);
        if (isNetherPortal(n) && !this.holds(nx, ny, nz, portalAxis(n))) w.setBlock(nx, ny, nz, AIR);
      }
    }
  }

  /** ¿Se sostiene el bloque de portal (portal u obsidiana arriba, abajo y a los lados de su plano)? */
  private holds(x: number, y: number, z: number, axis: number): boolean {
    const w = this.ctx.world;
    const ok = (b: number) => b === OBSIDIAN || (isNetherPortal(b) && portalAxis(b) === axis) || b < 0;
    const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1;
    return ok(w.getBlock(x, y + 1, z)) && ok(w.getBlock(x, y - 1, z)) && ok(w.getBlock(x + ax, y, z + az)) && ok(w.getBlock(x - ax, y, z - az));
  }

  /** Fuego en (x, y, z): si está dentro de un marco de obsidiana, lo llena de portal. */
  light(x: number, y: number, z: number): boolean {
    for (const axis of [0, 1]) {
      const frame = this.findFrame(x, y, z, axis);
      if (!frame) continue;
      const w = this.ctx.world;
      const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1;
      for (let j = 0; j < frame.h; j++) {
        for (let i = 0; i < frame.w; i++) w.setBlock(frame.x + ax * i, frame.y + j, frame.z + az * i, NETHER_PORTAL + axis);
      }
      this.ctx.fx('portal_light', x + 0.5, y + 0.5, z + 0.5);
      return true;
    }
    return false;
  }

  /** Hueco del marco que contiene (x, y, z) en el plano del eje, o null si no hay marco completo. */
  private findFrame(x: number, y: number, z: number, axis: number): { x: number; y: number; z: number; w: number; h: number } | null {
    const w = this.ctx.world;
    const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1;
    const empty = (b: number) => b === AIR || isFire(b);
    // Baja hasta el suelo del marco.
    let by = y;
    for (let k = 0; k < MAX_SIDE && empty(w.getBlock(x, by - 1, z)); k++) by--;
    if (w.getBlock(x, by - 1, z) !== OBSIDIAN) return null;
    // Va hasta el lado de «atrás» del eje.
    let bx = x, bz = z;
    for (let k = 0; k < MAX_SIDE; k++) {
      const nb = w.getBlock(bx - ax, by, bz - az);
      if (!empty(nb) || w.getBlock(bx - ax, by - 1, bz - az) !== OBSIDIAN) break;
      bx -= ax;
      bz -= az;
    }
    if (w.getBlock(bx - ax, by, bz - az) !== OBSIDIAN) return null;
    // Ancho: hasta la pared de obsidiana del otro lado, con suelo de obsidiana.
    let width = 0;
    while (width <= MAX_SIDE && empty(w.getBlock(bx + ax * width, by, bz + az * width)) && w.getBlock(bx + ax * width, by - 1, bz + az * width) === OBSIDIAN) width++;
    if (width < MIN_W || width > MAX_SIDE || w.getBlock(bx + ax * width, by, bz + az * width) !== OBSIDIAN) return null;
    // Alto: filas vacías con paredes de obsidiana a los dos lados, hasta un techo de obsidiana.
    let height = 0;
    for (; height <= MAX_SIDE; height++) {
      const yy = by + height;
      if (w.getBlock(bx - ax, yy, bz - az) !== OBSIDIAN || w.getBlock(bx + ax * width, yy, bz + az * width) !== OBSIDIAN) break;
      let row = true;
      for (let i = 0; i < width && row; i++) if (!empty(w.getBlock(bx + ax * i, yy, bz + az * i))) row = false;
      if (!row) break;
    }
    if (height < MIN_H || height > MAX_SIDE) return null;
    for (let i = 0; i < width; i++) if (w.getBlock(bx + ax * i, by + height, bz + az * i) !== OBSIDIAN) return null;
    // El fuego tiene que estar dentro.
    const inside = (axis === 0 ? x - bx : z - bz);
    if (y < by || y >= by + height || inside < 0 || inside >= width) return null;
    return { x: bx, y: by, z: bz, w: width, h: height };
  }

  // ------------------------------------------------------------------ cruzar

  tick(): void {
    const w = this.ctx.world;
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.dimPending || s.s & STATE_DEAD) continue;
      const x = Math.floor(s.p[0]), y = Math.floor(s.p[1]), z = Math.floor(s.p[2]);
      const b = w.getBlock(x, y, z), b2 = w.getBlock(x, y + 1, z);
      // Fase 8.6: el portal del End: el cuerpo toca la lámina (de 6/16 a 12/16 de su bloque) por los pies o por arriba.
      if ((b === END_PORTAL && s.p[1] - y < 0.75) || b2 === END_PORTAL) {
        this.inside.delete(s.id);
        if (this.ctx.dim === DIM_END) this.ctx.travel(s, DIM_OVERWORLD, { kind: 'spawn' });
        else this.ctx.travel(s, DIM_END, { kind: 'pos' });
        continue;
      }
      const inPortal = isNetherPortal(b) || isNetherPortal(b2);
      if (!inPortal) {
        this.inside.delete(s.id);
        this.arrived.delete(s.id);
        continue;
      }
      if (this.arrived.has(s.id)) continue;
      const t = (this.inside.get(s.id) ?? 0) + 1;
      this.inside.set(s.id, t);
      if (t < (s.mode === 'c' ? 1 : PORTAL_TICKS)) continue;
      this.inside.delete(s.id);
      this.travel(s, isNetherPortal(b) ? b : b2);
    }
  }

  /** Lleva al jugador por el portal en el que está. */
  private travel(s: Session, portal: number): void {
    const to = netherPortalTarget(this.ctx.dim);
    const k = dimensionDef(this.ctx.dim).scale / dimensionDef(to).scale;
    const clampH = (v: number) => Math.max(-WORLD_LIMIT + 64, Math.min(WORLD_LIMIT - 64, v));
    this.ctx.travel(s, to, { kind: 'portal', x: clampH(s.p[0] * k), y: s.p[1], z: clampH(s.p[2] * k), axis: portalAxis(portal) });
  }

  /** Alguien acaba de llegar por un portal: no vuelve a viajar hasta que salga de él. */
  justArrived(s: Session): void {
    this.arrived.add(s.id);
    this.inside.delete(s.id);
  }

  onLeave(s: Session): void {
    this.inside.delete(s.id);
    this.arrived.delete(s.id);
  }

  // ------------------------------------------------------------------ llegar

  /**
   * Punto de llegada cerca de (x, y, z) de esta dimensión: el portal más cercano dentro del radio de
   * búsqueda o uno nuevo. Devuelve dónde poner los pies.
   */
  arrive(x: number, y: number, z: number, axis: number): [number, number, number] {
    const range = this.ctx.dim === DIM_NETHER ? 16 : 128;
    let best = -1, bestD = Infinity;
    for (const k of this.blocks) {
      const dx = keyX(k) - x, dz = keyZ(k) - z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      const d = dx * dx + dz * dz + (keyY(k) - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      const bx = keyX(best), bz = keyZ(best);
      this.load(bx, bz, 0);
      let by = keyY(best);
      while (isNetherPortal(this.ctx.world.getBlock(bx, by - 1, bz))) by--;
      if (isNetherPortal(this.ctx.world.getBlock(bx, by, bz))) return [bx + 0.5, by, bz + 0.5];
      this.blocks.delete(best); // ya no está (se rompió sin que lo supiéramos)
      return this.arrive(x, y, z, axis);
    }
    return this.build(Math.floor(x), Math.floor(y), Math.floor(z), axis);
  }

  /** Genera (si hace falta) los chunks alrededor de un punto. */
  private load(x: number, z: number, r: number): void {
    const now = this.ctx.now();
    for (let cz = Math.floor((z - r) / CHUNK_SIZE); cz <= Math.floor((z + r) / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor((x - r) / CHUNK_SIZE); cx <= Math.floor((x + r) / CHUNK_SIZE); cx++) this.ctx.world.ensureChunk(cx, cz, now);
    }
  }

  /** Alturas en las que puede ir un portal en esta dimensión. */
  private yRange(): [number, number] {
    return this.ctx.dim === DIM_NETHER ? [NETHER_LAVA_LEVEL + 1, NETHER_ROOF - 8] : [MIN_Y + 8, MAX_Y - 10];
  }

  /** Construye un portal de 2×3 (marco de 4×5) cerca de (x, y, z) y devuelve el punto de llegada. */
  private build(x: number, y: number, z: number, axis: number): [number, number, number] {
    const w = this.ctx.world;
    const [y0, y1] = this.yRange();
    const ty = Math.max(y0, Math.min(y1, y));
    this.load(x, z, 16);
    const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1;
    const px = az, pz = ax; // perpendicular al plano del portal
    // ¿Cabe aquí? Suelo firme bajo el portal y los lados, y aire para el marco y un paso a cada lado.
    const fits = (bx: number, by: number, bz: number): boolean => {
      for (let i = -1; i <= 2; i++) {
        for (let d = -1; d <= 1; d++) {
          const cx = bx + ax * i + px * d, cz = bz + az * i + pz * d;
          const floor = w.getBlock(cx, by - 1, cz);
          if (floor < 0 || !BLOCK_SOLID[floor] || BLOCK_FLUID[floor]) return false;
          for (let j = 0; j < 4; j++) if (w.getBlock(cx, by + j, cz) !== AIR) return false;
        }
      }
      return true;
    };
    let spot: [number, number, number] | null = null;
    for (let r = 0; r <= 16 && !spot; r++) {
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (let yy = y1; yy >= y0; yy--) {
            if (!fits(x + dx, yy, z + dz)) continue;
            const d = Math.abs(yy - ty);
            if (d < bestD) {
              bestD = d;
              spot = [x + dx, yy, z + dz];
            }
          }
        }
      }
    }
    if (!spot) {
      // A la fuerza: plataforma de obsidiana y aire alrededor (como en Minecraft).
      spot = [x, ty, z];
      for (let i = -1; i <= 2; i++) {
        for (let d = -1; d <= 1; d++) {
          const cx = x + ax * i + px * d, cz = z + az * i + pz * d;
          w.setBlock(cx, ty - 1, cz, OBSIDIAN);
          for (let j = 0; j < 4; j++) w.setBlock(cx, ty + j, cz, AIR);
        }
      }
    }
    const [bx, by, bz] = spot;
    // Marco de 4×5 (con esquinas) y el portal dentro.
    for (let i = -1; i <= 2; i++) {
      for (let j = -1; j <= 3; j++) {
        const edge = i === -1 || i === 2 || j === -1 || j === 3;
        if (edge) w.setBlock(bx + ax * i, by + j, bz + az * i, OBSIDIAN);
      }
    }
    for (let i = 0; i <= 1; i++) for (let j = 0; j <= 2; j++) w.setBlock(bx + ax * i, by + j, bz + az * i, NETHER_PORTAL + axis);
    return [bx + 0.5, by, bz + 0.5];
  }

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    store.setMeta('portals', JSON.stringify([...this.blocks]));
  }
}
