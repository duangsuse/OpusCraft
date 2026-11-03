// Vegetación que cambia sola: ticks aleatorios (brotes que crecen, hierba que se extiende o muere,
// cactus y caña que crecen) y hojas que se caen cuando se tala su árbol. Otros sistemas (la granja)
// añaden sus propios manejadores de ticks aleatorios.
import { DIR_VEC, amethystBudAt, amethystBudInfo } from '../../blocks'; // los brotes de amatista
import {
  AIR, GRASS, DIRT, SNOWY_GRASS, CACTUS, SUGAR_CANE, BLOCK_OPAQUE, BLOCK_FLUID, BLOCK_RENDER, BLOCK_REPLACEABLE,
  R_CROSS, MYCELIUM, isVine, BUDDING_AMETHYST, CAVE_VINES, familyBase, WATER, ICE, PACKED_ICE,
  SNOW_LAYER, isSnowLayer, BLOCK_FLUID_LEVEL,
} from '../../blocks';
import { rainAt } from '../../weather';
import { BIOME_MUSHROOM_FIELDS } from '../../world/biomeIds';
import { MIN_Y, MAX_Y, CHUNK_SIZE, CHUNK_VOLUME, indexY } from '../../constants';
import { leafDecayDrops } from '../drops';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { LOGS, LEAVES, SAPLINGS, SOIL } from './plants';
import { SIM_RADIUS, type ServerContext } from './context';

/** Ticks aleatorios por chunk y tick (Minecraft usa 3 por sección de 16³ = 48 por columna). */
/** 48 por cada 256 de alto (la misma frecuencia por bloque que antes de subir la altura). */
const RANDOM_TICKS_PER_CHUNK = 72;
/** Tipos de árbol (posición en WOOD_TYPES) que pueden crecer desde 2×2 brotes. */
const KIND_JUNGLE = 3, KIND_DARK_OAK = 5;

/** Manejador de ticks aleatorios: devuelve true si el bloque era suyo. */
export type RandomTickHandler = (id: number, x: number, y: number, z: number) => boolean;

export class Nature {
  /** Hojas que se caerán: clave de posición → tick. */
  private decay = new Map<number, number>();
  private handlers: RandomTickHandler[] = [];

  constructor(private ctx: ServerContext) {}

  addRandomTickHandler(h: RandomTickHandler): void {
    this.handlers.push(h);
  }

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    // Troncos quitados: las hojas sin tronco cercano se caerán.
    if (LOGS.has(old) && !LOGS.has(id)) this.scheduleLeafDecay(x, y, z);
  }

  tick(): void {
    this.processDecay();
    this.randomTicks();
    this.weatherTicks();
  }

  /**
   * Clima sobre la superficie (como los ticks de lluvia de Minecraft): de vez en cuando, en una
   * columna al azar de cada chunk, el agua a la intemperie se congela donde hace frío y, si nieva,
   * se posa una capa de nieve.
   */
  private weatherTicks(): void {
    const ctx = this.ctx;
    const snowing = rainAt(ctx.worldTime(), ctx.seed) > 0.2;
    for (const c of this.loadedNearPlayers()) {
      if (ctx.rand() > 1 / 16) continue;
      this.weatherTickAt(c.cx * 16 + ((ctx.rand() * 16) | 0), c.cz * 16 + ((ctx.rand() * 16) | 0), snowing);
    }
  }

  /** Clima en la columna (x, z): congela el agua a la intemperie y, si nieva, posa una capa de nieve. */
  weatherTickAt(x: number, z: number, snowing: boolean): void {
    const w = this.ctx.world;
    const top = w.skyTop(x, z);
    if (top < MIN_Y) return;
    const inf = w.gen.columnInfo(x, z);
    // Como en Minecraft, en los campos de champiñones nunca nieva ni se hiela el agua.
    if ((inf.temp >= -0.5 && inf.height <= 150) || inf.biome === BIOME_MUSHROOM_FIELDS) return;
    const b = w.getBlock(x, top, z);
    if (b === WATER && BLOCK_FLUID_LEVEL[b] === 0) {
      if (w.blockLightAt(x, top + 1, z) < 10) w.setBlock(x, top, z, ICE);
      return;
    }
    if (!snowing || b === ICE || b === PACKED_ICE || !(BLOCK_OPAQUE[b] || LEAVES.has(b))) return;
    if (w.getBlock(x, top + 1, z) === AIR && w.blockLightAt(x, top + 1, z) <= 11) w.setBlock(x, top + 1, z, SNOW_LAYER);
  }

  private scheduleLeafDecay(x: number, y: number, z: number): void {
    const R = 4;
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const id = this.ctx.world.getBlock(x + dx, y + dy, z + dz);
          if (!LEAVES.has(id)) continue;
          const k = posKey(x + dx, y + dy, z + dz);
          if (this.decay.has(k)) continue;
          if (!this.logNearby(x + dx, y + dy, z + dz)) this.decay.set(k, this.ctx.tickCount + 10 + Math.floor(this.ctx.rand() * 200));
        }
      }
    }
  }

  /** ¿Hay un tronco a 6 pasos o menos a través de hojas? */
  private logNearby(x: number, y: number, z: number): boolean {
    const seen = new Set<number>([posKey(x, y, z)]);
    let frontier: [number, number, number][] = [[x, y, z]];
    for (let step = 0; step < 6 && frontier.length; step++) {
      const next: [number, number, number][] = [];
      for (const [cx, cy, cz] of frontier) {
        for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = cx + ox, ny = cy + oy, nz = cz + oz;
          const k = posKey(nx, ny, nz);
          if (seen.has(k)) continue;
          seen.add(k);
          const id = this.ctx.world.getBlock(nx, ny, nz);
          if (id < 0 || LOGS.has(id)) return true; // sin cargar: prudencia
          if (LEAVES.has(id)) next.push([nx, ny, nz]);
        }
      }
      frontier = next;
    }
    return false;
  }

  private processDecay(): void {
    const ctx = this.ctx;
    if (this.decay.size === 0 || ctx.tickCount % 5 !== 0) return;
    for (const [k, due] of this.decay) {
      if (due > ctx.tickCount) continue;
      this.decay.delete(k);
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = ctx.world.getBlock(x, y, z);
      if (!LEAVES.has(id) || this.logNearby(x, y, z)) continue;
      ctx.world.setBlock(x, y, z, AIR);
      ctx.entities.dropStacks(leafDecayDrops(id, () => ctx.rand()), x + 0.5, y + 0.3, z + 0.5);
      ctx.fx('leaves', x + 0.5, y + 0.5, z + 0.5, id);
    }
  }

  /** Ticks aleatorios: brotes que crecen, hierba que se extiende o muere, cactus y cañas que crecen. */
  private randomTicks(): void {
    const rand = () => this.ctx.rand();
    for (const c of this.loadedNearPlayers()) {
      for (let k = 0; k < RANDOM_TICKS_PER_CHUNK; k++) {
        const idx = (rand() * CHUNK_VOLUME) | 0;
        const id = c.blocks[idx];
        if (id === AIR) continue;
        const x = c.cx * 16 + (idx & 15), y = indexY(idx), z = c.cz * 16 + ((idx >> 4) & 15);
        this.tickBlock(id, x, y, z);
      }
    }
  }

  /** Tick aleatorio sobre un bloque concreto (las pruebas lo usan para no depender del azar). */
  randomTickAt(x: number, y: number, z: number): void {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id > 0) this.tickBlock(id, x, y, z);
  }

  private tickBlock(id: number, x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const rand = () => this.ctx.rand();
    if (SAPLINGS.has(id)) {
      this.growTree(x, y, z, SAPLINGS.get(id)!);
    } else if (id === GRASS || id === SNOWY_GRASS || id === MYCELIUM) {
      const above = w.getBlock(x, y + 1, z);
      if (above > 0 && (BLOCK_OPAQUE[above] || BLOCK_FLUID[above])) {
        w.setBlock(x, y, z, DIRT);
        return;
      }
      // La hierba y el micelio se extienden por la tierra de alrededor.
      const spread = id === MYCELIUM ? MYCELIUM : GRASS;
      for (let t = 0; t < 2; t++) {
        const nx = x + ((rand() * 3) | 0) - 1, ny = y + ((rand() * 5) | 0) - 3, nz = z + ((rand() * 3) | 0) - 1;
        if (w.getBlock(nx, ny, nz) !== DIRT) continue;
        const up = w.getBlock(nx, ny + 1, nz);
        if (up < 0 || BLOCK_OPAQUE[up] || BLOCK_FLUID[up]) continue;
        // Sólo a la luz: cielo abierto encima o bajo la copa de un árbol.
        const top = w.skyTop(nx, nz);
        if (top <= ny + 1 || LEAVES.has(w.getBlock(nx, top, nz))) w.setBlock(nx, ny, nz, spread);
      }
    } else if (id === BUDDING_AMETHYST) {
      // BuddingAmethystBlock.randomTick: 1 de cada 5, hacia una cara al azar: si está libre (aire o agua quieta), un
      // brote pequeño que apunta hacia allí; si ya hay un brote que apunta hacia allí, crece un tamaño.
      if (rand() >= 0.2) return;
      const dir = Math.floor(rand() * 6);
      const [dx, dy, dz] = DIR_VEC[dir];
      const at = w.getBlock(x + dx, y + dy, z + dz);
      const bud = amethystBudInfo(at);
      if (at === AIR || at === WATER) w.setBlock(x + dx, y + dy, z + dz, amethystBudAt(0, dir));
      else if (bud && bud.dir === dir && bud.stage < 3) w.setBlock(x + dx, y + dy, z + dz, amethystBudAt(bud.stage + 1, dir));
    } else if (id === CAVE_VINES) {
      // Las enredaderas de cueva dan bayas luminosas de vez en cuando.
      if (rand() < 0.1) w.setBlock(x, y, z, CAVE_VINES + 1);
    } else if (id === ICE || isSnowLayer(id)) {
      // Junto a una luz fuerte (más de 11) el hielo se derrite y la nieve desaparece.
      if (w.blockLightAt(x, y, z) > 11) w.setBlock(x, y, z, id === ICE ? WATER : AIR);
    } else if (isVine(id)) {
      // Las enredaderas bajan poco a poco hasta el suelo.
      if (rand() < 0.25 && w.getBlock(x, y - 1, z) === AIR) w.setBlock(x, y - 1, z, id);
    } else if (id === CACTUS || id === SUGAR_CANE) {
      if (w.getBlock(x, y + 1, z) !== AIR || rand() > 0.25) return;
      let h = 1;
      while (h < 3 && w.getBlock(x, y - h, z) === id) h++;
      if (h < 3) w.setBlock(x, y + 1, z, id);
    } else {
      for (const handle of this.handlers) if (handle(id, x, y, z)) break;
    }
  }

  private loadedNearPlayers(): { cx: number; cz: number; blocks: Uint16Array }[] {
    const out: { cx: number; cz: number; blocks: Uint16Array }[] = [];
    const seen = new Set<string>();
    for (const s of this.ctx.sessions()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let dz = -SIM_RADIUS; dz <= SIM_RADIUS; dz++) {
        for (let dx = -SIM_RADIUS; dx <= SIM_RADIUS; dx++) {
          const key = (pcx + dx) + ',' + (pcz + dz);
          if (seen.has(key)) continue;
          seen.add(key);
          const c = this.ctx.world.getChunk(pcx + dx, pcz + dz);
          if (c) out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Esquina noroeste de un cuadrado de 2×2 brotes iguales que contenga (x, z), o null. El roble
   * oscuro sólo crece así; la jungla, en 2×2, da un árbol gigante.
   */
  private square(x: number, y: number, z: number, id: number): [number, number] | null {
    const w = this.ctx.world;
    for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const x0 = x + ox, z0 = z + oz;
      if (w.getBlock(x0, y, z0) === id && w.getBlock(x0 + 1, y, z0) === id && w.getBlock(x0, y, z0 + 1) === id && w.getBlock(x0 + 1, y, z0 + 1) === id) {
        return [x0, z0];
      }
    }
    return null;
  }

  /** Hace crecer un árbol desde un brote si hay sitio. */
  growTree(x: number, y: number, z: number, kind: number): void {
    const w = this.ctx.world;
    const below = w.getBlock(x, y - 1, z);
    if (!SOIL.has(below)) return;
    const sapling = w.getBlock(x, y, z);
    const sq = kind === KIND_JUNGLE || kind === KIND_DARK_OAK ? this.square(x, y, z, sapling) : null;
    if (kind === KIND_DARK_OAK && !sq) return;
    const cells: [number, number][] = sq ? [[sq[0], sq[1]], [sq[0] + 1, sq[1]], [sq[0], sq[1] + 1], [sq[0] + 1, sq[1] + 1]] : [[x, z]];
    const need = sq && kind === KIND_JUNGLE ? 20 : kind === 2 ? 10 : 7;
    for (const [cx, cz] of cells) {
      for (let k = 1; k <= need; k++) {
        const b = w.getBlock(cx, y + k, cz);
        if (b < 0 || (b !== AIR && !LEAVES.has(b) && BLOCK_RENDER[b] !== R_CROSS)) return;
      }
    }
    const r = this.ctx.rand();
    for (const [cx, cz] of cells) w.setBlock(cx, y, cz, AIR);
    const [tx, tz] = cells[0];
    w.gen.growTree(kind, tx, y, tz, r, (bx, by, bz, id, force) => {
      if (by <= MIN_Y || by >= MAX_Y) return;
      const cur = w.getBlock(bx, by, bz);
      if (cur < 0) return;
      if (cur === AIR || (force && (LEAVES.has(cur) || BLOCK_RENDER[cur] === R_CROSS || BLOCK_REPLACEABLE[cur]))) {
        w.setBlock(bx, by, bz, id);
      }
    }, !!sq);
    for (const [cx, cz] of cells) if (w.getBlock(cx, y - 1, cz) === GRASS) w.setBlock(cx, y - 1, cz, DIRT);
  }
}
