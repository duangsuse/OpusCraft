// Mundo del servidor: genera los mismos chunks que los clientes (generador determinista),
// aplica y guarda las ediciones, y mantiene mapas de altura y fuentes de luz para la simulación.
import type { TerrainGenerator } from '../world/terrain';
import { createGenerator } from '../world/generators'; // Fase 8 (dimensiones)
import { CHUNK_SIZE, CHUNK_VOLUME, MIN_Y, MAX_Y, blockIndex, chunkKey, indexY } from '../constants';
import { AIR, BLOCK_EMISSION, BLOCK_LIGHT_OPACITY, BLOCK_SOLID, MOB_SPAWNER, isChest } from '../blocks';
import type { StructureChest } from '../world/structures';
import type { VillagerSpawn } from '../world/villages'; // Fase 6 (aldeanos)
import type { StructureMob } from '../world/structures'; // Fase 7.5 (océano)
import { decodeChunkEdits, encodeChunkEdits, type ServerStore } from './store';

export interface SimChunk {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  /** y del bloque más alto que tapa el cielo, por columna (z*16+x); MIN_Y − 1 si ninguno. */
  top: Int16Array;
  /** Índices locales de bloques que emiten luz. */
  emitters: Set<number>;
  /** Índices locales de los generadores de monstruos. */
  spawners: Set<number>;
  lastUsed: number;
}

export type ChangeListener = (x: number, y: number, z: number, old: number, id: number) => void;

function blocksSky(id: number): boolean {
  return id !== AIR && (BLOCK_LIGHT_OPACITY[id] > 0 || BLOCK_SOLID[id] === 1);
}

export class WorldSim {
  readonly gen: TerrainGenerator;
  readonly seed: number;
  /** Fase 8: dimensión de este mundo (ver shared/dimensions.ts). */
  readonly dim: number;
  private store: ServerStore;
  private chunks = new Map<string, SimChunk>();
  private edits = new Map<string, Map<number, number>>();
  private allLoaded = false;
  private dirty = new Set<string>();
  onChange: ChangeListener | null = null;
  /** Cofres de estructuras de un chunk recién generado por primera vez (para llenarlos de botín). */
  onLoot: ((chests: StructureChest[]) => void) | null = null;
  /** Fase 6 (aldeanos): aldeanos de una aldea recién generada (una sola vez por chunk). */
  onVillagers: ((villagers: VillagerSpawn[]) => void) | null = null;
  /** Fase 7.5 (océano, mansión): criaturas de una estructura recién generada (una sola vez por chunk). */
  onStructureMobs: ((mobs: StructureMob[]) => void) | null = null;
  /** Fase 7 (redstone): un chunk acaba de cargarse (sus componentes se apuntan y reprograman). */
  onChunkLoaded: ((c: SimChunk) => void) | null = null;
  /** Fase 8.2: fluidos que el generador deja para que corran al cargar el chunk (x, y, z, x, y, z…). */
  onFluidTicks: ((coords: readonly number[]) => void) | null = null;
  /** Fase 7 (mecanismos): un chunk se va a descargar (lo que mueven los pistones en él se asienta ya). */
  onChunkUnload: ((c: SimChunk) => void) | null = null;
  /**
   * Fase 7 (mecanismos): bloques que se guardan en lugar de los que hay, [x, y, z, bloque] (lo que se está
   * moviendo, tal como quedará al asentarse).
   */
  savedInstead: (() => [number, number, number, number][]) | null = null;
  generatedCount = 0;

  constructor(seed: number, store: ServerStore, dim = 0) {
    this.seed = seed;
    this.store = store;
    this.dim = dim;
    this.gen = createGenerator(dim, seed);
  }

  // ------------------------------------------------------------------ ediciones

  private chunkEdits(key: string): Map<number, number> {
    let m = this.edits.get(key);
    if (m) return m;
    if (!this.allLoaded) {
      const data = this.store.loadChunkEdits(key);
      m = data ? decodeChunkEdits(data) : new Map();
    } else m = new Map();
    this.edits.set(key, m);
    return m;
  }

  /** Todas las ediciones (para la bienvenida de un jugador). */
  allEdits(): [number, number, number, number][] {
    if (!this.allLoaded) {
      for (const [key, data] of this.store.loadAllChunkEdits()) {
        if (!this.edits.has(key)) this.edits.set(key, decodeChunkEdits(data));
      }
      this.allLoaded = true;
    }
    const out: [number, number, number, number][] = [];
    for (const [key, m] of this.edits) {
      const [cx, cz] = key.split(',').map(Number);
      for (const [idx, b] of m) out.push([cx * 16 + (idx & 15), indexY(idx), cz * 16 + ((idx >> 4) & 15), b]);
    }
    return out;
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  flush(): void {
    // Fase 7 (mecanismos): lo que se mueve se guarda ya asentado (sin tocar el mundo).
    const instead = new Map<string, Map<number, number>>();
    for (const [x, y, z, id] of this.savedInstead?.() ?? []) {
      const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
      const key = chunkKey(cx, cz);
      let m = instead.get(key);
      if (!m) instead.set(key, (m = new Map()));
      m.set(blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE), id);
      this.dirty.add(key);
    }
    for (const key of this.dirty) {
      let m = this.edits.get(key);
      const over = instead.get(key);
      if (m && over) m = new Map([...m, ...over]);
      if (m) this.store.saveChunkEdits(key, encodeChunkEdits(m));
    }
    this.dirty.clear();
    // Los chunks guardados así se vuelven a guardar cuando se asienten de verdad.
    for (const key of instead.keys()) this.dirty.add(key);
  }

  // ------------------------------------------------------------------ chunks

  isLoaded(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getChunk(cx: number, cz: number): SimChunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  ensureChunk(cx: number, cz: number, now = 0): SimChunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) {
      c.lastUsed = now;
      return c;
    }
    const r = this.gen.generate(cx, cz);
    const blocks = r.blocks;
    const ed = this.chunkEdits(key);
    for (const [idx, id] of ed) blocks[idx] = id;
    c = { cx, cz, blocks, top: new Int16Array(256), emitters: new Set(), spawners: new Set(), lastUsed: now };
    for (let i = 0; i < 256; i++) {
      const lx = i & 15, lz = i >> 4;
      let t = MIN_Y - 1;
      for (let y = MAX_Y - 1; y >= MIN_Y; y--) {
        if (blocksSky(blocks[blockIndex(lx, y, lz)])) {
          t = y;
          break;
        }
      }
      c.top[i] = t;
    }
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      if (BLOCK_EMISSION[blocks[i]]) c.emitters.add(i);
      if (blocks[i] === MOB_SPAWNER) c.spawners.add(i);
    }
    // Cofres de estructuras: se llenan una sola vez por chunk (si siguen siendo cofres).
    if (r.chests.length > 0 && this.onLoot && !this.store.getMeta(`loot:${key}`)) {
      this.store.setMeta(`loot:${key}`, '1');
      this.onLoot(r.chests.filter((ch) => isChest(blocks[blockIndex(ch.x - cx * CHUNK_SIZE, ch.y, ch.z - cz * CHUNK_SIZE)])));
    }
    // Fase 6 (aldeanos): los aldeanos del pozo aparecen una sola vez por chunk.
    if (r.villagers.length > 0 && this.onVillagers && !this.store.getMeta(`villagers:${key}`)) {
      this.store.setMeta(`villagers:${key}`, '1');
      this.onVillagers(r.villagers);
    }
    // Fase 7.5 (océano, mansión): guardianes ancianos, ahogados de las ruinas, illagers de la mansión y alays
    // presos, también una sola vez por chunk.
    if (r.mobs.length > 0 && this.onStructureMobs && !this.store.getMeta(`smobs:${key}`)) {
      this.store.setMeta(`smobs:${key}`, '1');
      this.onStructureMobs(r.mobs);
    }
    this.chunks.set(key, c);
    this.generatedCount++;
    this.onChunkLoaded?.(c); // Fase 7 (redstone)
    if (r.fluidTicks?.length) this.onFluidTicks?.(r.fluidTicks); // Fase 8.2
    return c;
  }

  /** Descarga los chunks no usados desde hace tiempo (las ediciones se conservan). */
  unloadUnused(now: number, keep: (cx: number, cz: number) => boolean): number {
    let n = 0;
    for (const [key, c] of this.chunks) {
      if (!keep(c.cx, c.cz) && now - c.lastUsed > 5000) {
        this.onChunkUnload?.(c); // Fase 7 (mecanismos)
        this.chunks.delete(key);
        n++;
      }
    }
    return n;
  }

  /** Fase 7 (redstone): chunks cargados ahora mismo. */
  loadedChunks(): IterableIterator<SimChunk> {
    return this.chunks.values();
  }

  get loadedCount(): number {
    return this.chunks.size;
  }

  // ------------------------------------------------------------------ bloques

  /** Id del bloque, o -1 si el chunk no está cargado. */
  getBlock(x: number, y: number, z: number): number {
    if (y < MIN_Y) return -1;
    if (y >= MAX_Y) return AIR;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return -1;
    return c.blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  /**
   * Cambia un bloque (y registra la edición). Devuelve el id anterior o -1 si no hubo cambio.
   * Sólo en chunks cargados: así toda edición se difunde y dispara sus reacciones.
   */
  setBlock(x: number, y: number, z: number, id: number): number {
    if (y < MIN_Y || y >= MAX_Y) return -1;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    const idx = blockIndex(lx, y, lz);
    const c = this.chunks.get(key);
    if (!c) return -1;
    const old = c.blocks[idx];
    if (old === id) return -1;
    c.blocks[idx] = id;
    // Mapa de altura.
    const col = lz * 16 + lx;
    if (blocksSky(id)) {
      if (y > c.top[col]) c.top[col] = y;
    } else if (y === c.top[col]) {
      let t = MIN_Y - 1;
      for (let yy = y - 1; yy >= MIN_Y; yy--) {
        if (blocksSky(c.blocks[blockIndex(lx, yy, lz)])) {
          t = yy;
          break;
        }
      }
      c.top[col] = t;
    }
    if (BLOCK_EMISSION[id]) c.emitters.add(idx);
    else c.emitters.delete(idx);
    if (id === MOB_SPAWNER) c.spawners.add(idx);
    else c.spawners.delete(idx);
    this.chunkEdits(key).set(idx, id);
    this.dirty.add(key);
    this.onChange?.(x, y, z, old, id);
    return old;
  }

  /** y del bloque más alto que tapa el cielo en (x, z), o MIN_Y − 2 si no está cargado. */
  skyTop(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return MIN_Y - 2;
    return c.top[(z - cz * CHUNK_SIZE) * 16 + (x - cx * CHUNK_SIZE)];
  }

  /** Luz de bloques aproximada en (x, y, z): el máximo de (emisión − distancia Manhattan), sin paredes. */
  blockLightAt(x: number, y: number, z: number): number {
    let best = 0;
    const cx0 = Math.floor((x - 15) / CHUNK_SIZE), cx1 = Math.floor((x + 15) / CHUNK_SIZE);
    const cz0 = Math.floor((z - 15) / CHUNK_SIZE), cz1 = Math.floor((z + 15) / CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(chunkKey(cx, cz));
        if (!c) continue;
        for (const idx of c.emitters) {
          const ex = cx * 16 + (idx & 15), ey = indexY(idx), ez = cz * 16 + ((idx >> 4) & 15);
          const l = BLOCK_EMISSION[c.blocks[idx]] - (Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z));
          if (l > best) best = l;
        }
      }
    }
    return best;
  }

  /** ¿Algún bloque emisor ilumina (x, y, z)? (distancia Manhattan menor que su nivel de luz). */
  isLitByBlocks(x: number, y: number, z: number): boolean {
    const cx0 = Math.floor((x - 15) / CHUNK_SIZE), cx1 = Math.floor((x + 15) / CHUNK_SIZE);
    const cz0 = Math.floor((z - 15) / CHUNK_SIZE), cz1 = Math.floor((z + 15) / CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(chunkKey(cx, cz));
        if (!c) continue;
        for (const idx of c.emitters) {
          const ex = cx * 16 + (idx & 15), ey = indexY(idx), ez = cz * 16 + ((idx >> 4) & 15);
          const d = Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z);
          if (d < BLOCK_EMISSION[c.blocks[idx]]) return true;
        }
      }
    }
    return false;
  }
}
