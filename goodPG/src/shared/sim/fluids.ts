// Simulación de fluidos al estilo de Minecraft: el agua avanza 7 bloques y la lava 3, caen,
// buscan el hueco más cercano, se secan al quitar la fuente, dos fuentes de agua crean una
// tercera y el contacto agua–lava produce obsidiana, roca o piedra. Como en Java, el nivel es 8 − la
// cantidad: el agua baja 1 por bloque y la lava 2 (niveles 2, 4 y 6). Fase 8.2: en las dimensiones de
// lava rápida (el Nether, FAST_LAVA de Java) la lava baja 1 por bloque (avanza 7), busca huecos a 4 y se
// actualiza cada 10 ticks en vez de 30.
import { MIN_Y, MAX_Y } from '../constants';
import {
  AIR, OBSIDIAN, COBBLESTONE, STONE, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_SOLID, FLUID_MAX_LEVEL, fluidBlock,
} from '../blocks';
import { washedByFluids } from './fluidWash';
import { posKey, keyX, keyY, keyZ } from './posKey';

export interface FluidWorld {
  /** Id del bloque o -1 si el chunk no está cargado. */
  getBlock(x: number, y: number, z: number): number;
  /** Cambia un bloque (el mundo avisará de vuelta con onBlockChanged). */
  setBlock(x: number, y: number, z: number, id: number): void;
  /** Un fluido arrastra una planta/antorcha: soltar su objeto. */
  washAway(x: number, y: number, z: number, id: number): void;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class FluidSim {
  tick = 0;
  /** Ticks entre actualizaciones (20 ticks/s): agua 5, lava 30 (10 si es rápida). */
  private readonly RATE: readonly number[];
  /** Distancia de búsqueda de huecos: agua 4, lava 2 (4 si es rápida). */
  private readonly SEARCH: readonly number[];
  /** Cuánto baja el nivel por bloque: agua 1, lava 2 (1 si es rápida). */
  private readonly DROP: readonly number[];

  constructor(fastLava = false) {
    this.RATE = [0, 5, fastLava ? 10 : 30];
    this.SEARCH = [0, 4, fastLava ? 4 : 2];
    this.DROP = [0, 1, fastLava ? 1 : 2];
  }

  private due = new Map<number, number[]>();
  private scheduled = new Map<number, number>();
  /** Límite de actualizaciones por tick (protege la CPU ante inundaciones enormes). */
  maxPerTick = 600;

  get pending(): number {
    return this.scheduled.size;
  }

  schedule(x: number, y: number, z: number, delay: number): void {
    if (y < MIN_Y || y >= MAX_Y) return;
    const k = posKey(x, y, z);
    const at = this.tick + Math.max(1, delay);
    const prev = this.scheduled.get(k);
    if (prev !== undefined && prev <= at) return;
    this.scheduled.set(k, at);
    let list = this.due.get(at);
    if (!list) {
      list = [];
      this.due.set(at, list);
    }
    list.push(k);
  }

  /** Un bloque cambió: programa la actualización de los fluidos implicados. */
  onBlockChanged(world: FluidWorld, x: number, y: number, z: number): void {
    const self = world.getBlock(x, y, z);
    if (self > 0 && BLOCK_FLUID[self]) this.schedule(x, y, z, this.RATE[BLOCK_FLUID[self]]);
    const n: [number, number, number][] = [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1], [x, y + 1, z], [x, y - 1, z]];
    for (const [nx, ny, nz] of n) {
      const id = world.getBlock(nx, ny, nz);
      if (id > 0 && BLOCK_FLUID[id]) this.schedule(nx, ny, nz, this.RATE[BLOCK_FLUID[id]]);
    }
  }

  step(world: FluidWorld): void {
    this.tick++;
    const list = this.due.get(this.tick);
    if (!list) return;
    this.due.delete(this.tick);
    let processed = 0;
    for (const k of list) {
      if (this.scheduled.get(k) !== this.tick) continue; // reprogramado
      this.scheduled.delete(k);
      if (processed++ > this.maxPerTick) {
        this.schedule(keyX(k), keyY(k), keyZ(k), 1);
        continue;
      }
      this.update(world, keyX(k), keyY(k), keyZ(k));
    }
  }

  private canFlowInto(id: number, f: number): boolean {
    if (id < 0) return false;
    if (id === AIR) return true;
    const fl = BLOCK_FLUID[id];
    if (fl === f) return BLOCK_FLUID_LEVEL[id] !== 0;
    if (fl) return true;
    return washedByFluids()[id] === 1;
  }

  private update(world: FluidWorld, x: number, y: number, z: number): void {
    const id = world.getBlock(x, y, z);
    if (id <= 0) return;
    const f = BLOCK_FLUID[id];
    if (!f) return;
    // Lava en contacto con agua: se solidifica.
    if (f === 2) {
      const checks: [number, number, number][] = [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1], [x, y + 1, z]];
      for (const [nx, ny, nz] of checks) {
        if (BLOCK_FLUID[Math.max(0, world.getBlock(nx, ny, nz))] === 1) {
          world.setBlock(x, y, z, BLOCK_FLUID_LEVEL[id] === 0 ? OBSIDIAN : COBBLESTONE);
          return;
        }
      }
    }
    let level = BLOCK_FLUID_LEVEL[id];
    if (level !== 0) {
      const expected = this.expectedState(world, x, y, z, f);
      if (expected !== id) {
        world.setBlock(x, y, z, expected);
        if (expected === AIR) return;
        level = BLOCK_FLUID_LEVEL[expected];
      }
    }
    this.spread(world, x, y, z, f, level);
  }

  /** Estado que debería tener un bloque de fluido no-fuente según sus vecinos. */
  private expectedState(world: FluidWorld, x: number, y: number, z: number, f: number): number {
    const above = world.getBlock(x, y + 1, z);
    if (above > 0 && BLOCK_FLUID[above] === f) return fluidBlock(f, 8);
    let best = 99;
    let sources = 0;
    for (const [dx, dz] of DIRS) {
      const n = world.getBlock(x + dx, y, z + dz);
      if (n <= 0 || BLOCK_FLUID[n] !== f) continue;
      const nl = BLOCK_FLUID_LEVEL[n];
      if (nl === 0) sources++;
      let eff = nl;
      if (nl === 8) {
        // Una columna que cae sólo alimenta los lados cuando ya tocó suelo.
        const nb = world.getBlock(x + dx, y - 1, z + dz);
        eff = this.canFlowInto(nb, f) ? 99 : 0;
      }
      if (eff < best) best = eff;
    }
    if (f === 1 && sources >= 2) {
      const below = world.getBlock(x, y - 1, z);
      if (below > 0 && (BLOCK_SOLID[below] || (BLOCK_FLUID[below] === 1 && BLOCK_FLUID_LEVEL[below] === 0))) return fluidBlock(1, 0);
    }
    const nl = best + this.DROP[f];
    if (nl > FLUID_MAX_LEVEL[f]) return AIR;
    return fluidBlock(f, nl);
  }

  private spread(world: FluidWorld, x: number, y: number, z: number, f: number, level: number): void {
    // El mundo baja hasta MIN_Y (−64): también cae por debajo de y = 0 (cuevas profundas y minas).
    if (y > MIN_Y) {
      const below = world.getBlock(x, y - 1, z);
      if (this.canFlowInto(below, f)) {
        const isSameFall = BLOCK_FLUID[below] === f && BLOCK_FLUID_LEVEL[below] === 8;
        if (!isSameFall) this.flowInto(world, x, y - 1, z, f, 8, true);
        if (level !== 0 || this.sourceNeighbors(world, x, y, z, f) < 3) return;
      }
    }
    const base = level === 8 ? 0 : level;
    const nl = base + this.DROP[f];
    if (nl > FLUID_MAX_LEVEL[f]) return;
    // Direcciones transitables (incluidas las ya ocupadas por el mismo fluido): se calcula la
    // distancia al hueco más cercano y sólo se fluye hacia las de distancia mínima.
    const cands: number[] = [];
    const ids: number[] = [];
    let any = false;
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d];
      const n = world.getBlock(x + dx, y, z + dz);
      if (n < 0) continue;
      if (!(BLOCK_FLUID[n] === f || this.canFlowInto(n, f))) continue;
      cands.push(d);
      ids.push(n);
      if (this.canSpreadTo(n, f, nl)) any = true;
    }
    if (!any) return;
    const dist = cands.map((d) => this.holeDistance(world, x + DIRS[d][0], y, z + DIRS[d][1], f, d));
    const minD = Math.min(...dist);
    for (let i = 0; i < cands.length; i++) {
      if (dist[i] !== minD || !this.canSpreadTo(ids[i], f, nl)) continue;
      const [dx, dz] = DIRS[cands[i]];
      this.flowInto(world, x + dx, y, z + dz, f, nl, false);
    }
  }

  private canSpreadTo(id: number, f: number, newLevel: number): boolean {
    if (id < 0) return false;
    if (BLOCK_FLUID[id] === f) {
      const l = BLOCK_FLUID_LEVEL[id];
      return l !== 0 && l !== 8 && l > newLevel;
    }
    return this.canFlowInto(id, f);
  }

  private sourceNeighbors(world: FluidWorld, x: number, y: number, z: number, f: number): number {
    let n = 0;
    for (const [dx, dz] of DIRS) {
      const id = world.getBlock(x + dx, y, z + dz);
      if (id > 0 && BLOCK_FLUID[id] === f && BLOCK_FLUID_LEVEL[id] === 0) n++;
    }
    return n;
  }

  /** Pasos hasta la caída más cercana partiendo de (x, y, z), o Infinity si no hay en el radio. */
  private holeDistance(world: FluidWorld, x: number, y: number, z: number, f: number, fromDir: number): number {
    const max = this.SEARCH[f];
    const back = fromDir ^ 1;
    const seen = new Set<number>();
    let frontier: [number, number, number][] = [[x, z, back]];
    seen.add(posKey(x, y, z));
    for (let depth = 0; depth <= max; depth++) {
      const next: [number, number, number][] = [];
      for (const [cx, cz, excl] of frontier) {
        const below = world.getBlock(cx, y - 1, cz);
        if (this.canFlowInto(below, f)) return depth;
        if (depth === max) continue;
        for (let d = 0; d < 4; d++) {
          if (d === excl) continue;
          const nx = cx + DIRS[d][0], nz = cz + DIRS[d][1];
          const k = posKey(nx, y, nz);
          if (seen.has(k)) continue;
          seen.add(k);
          const id = world.getBlock(nx, y, nz);
          if (!this.canFlowInto(id, f) && !(id > 0 && BLOCK_FLUID[id] === f)) continue;
          next.push([nx, nz, d ^ 1]);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return Infinity;
  }

  private flowInto(world: FluidWorld, x: number, y: number, z: number, f: number, level: number, falling: boolean): void {
    const cur = world.getBlock(x, y, z);
    if (cur < 0) return;
    const cf = BLOCK_FLUID[cur];
    if (cf && cf !== f) {
      // Agua sobre lava: obsidiana (fuente) o roca; lava sobre agua: piedra al caer, roca de lado.
      if (f === 1) world.setBlock(x, y, z, BLOCK_FLUID_LEVEL[cur] === 0 ? OBSIDIAN : COBBLESTONE);
      else world.setBlock(x, y, z, falling ? STONE : COBBLESTONE);
      return;
    }
    if (cur !== AIR && !cf) world.washAway(x, y, z, cur);
    const id = fluidBlock(f, level);
    if (cur !== id) world.setBlock(x, y, z, id);
  }
}
