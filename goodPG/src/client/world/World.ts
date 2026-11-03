// Mundo en el hilo principal: almacena columnas de chunk, planifica generación/mallado en
// un pool de Web Workers y aplica las ediciones (locales y de la red).
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (entorno del Nether)
import { CHUNK_SIZE, MIN_Y, MAX_Y, blockIndex, chunkKey, indexY } from '../../shared/constants';
import { AIR, BLOCK_LIGHT_OPACITY, BLOCK_EMISSION, isValidBlockId } from '../../shared/blocks';
import type { WorkerRequest, WorkerResponse } from './worldWorker';
import type { TerrainGenerator } from '../../shared/world/terrain';
import { createGenerator } from '../../shared/world/generators'; // Fase 8 (dimensiones)

export interface ChunkMeshHandle {
  dispose(): void;
}

export interface Column {
  cx: number;
  cz: number;
  key: string;
  blocks: Uint16Array | null;
  light: Uint8Array | null;
  /** y máximo con bloques (para truncar las copias hacia los workers). */
  maxY: number;
  genPending: boolean;
  meshPending: boolean;
  dirty: boolean;
  meshed: boolean;
  version: number;
  mesh: ChunkMeshHandle | null;
}

export interface MeshSink {
  uploadMesh(
    col: Column,
    opaque: Uint32Array,
    cutout: Uint32Array,
    translucent: Uint32Array,
    minY: number,
    maxY: number,
  ): void;
  deleteMesh(col: Column): void;
  uploadTint(cx: number, cz: number, tint: Uint8Array): void;
}

interface WorkerSlot {
  worker: Worker;
  inFlight: number;
}

interface Job {
  kind: 'gen' | 'mesh' | 'spawn';
  col?: Column;
  version?: number;
  resolve?: (v: { x: number; y: number; z: number }) => void;
}

const MAX_IN_FLIGHT = 2;
const MAX_RADIUS = 24;

export class World {
  readonly seed: number;
  /** Fase 8: dimensión de este mundo (ver shared/dimensions.ts). */
  readonly dim: number;
  readonly columns = new Map<string, Column>();
  /** Ediciones persistentes por chunk: índice de bloque → id. */
  private edits = new Map<string, Map<number, number>>();
  private workers: WorkerSlot[] = [];
  private jobs = new Map<number, Job>();
  private nextJobId = 1;
  private sink: MeshSink;
  renderDistance = 8;
  private order: Int32Array = new Int32Array(0);
  private orderCx = 1e9;
  private orderCz = 1e9;
  private orderYaw = 1e9;
  private orderRadius = -1;
  private unloadTimer = 0;
  private pendingUploads: { col: Column; msg: Extract<WorkerResponse, { type: 'mesh' }> }[] = [];
  /** Generador local (para consultas de bioma en el HUD). */
  readonly generator: TerrainGenerator;
  meshedCount = 0;
  onColumnMeshed: ((col: Column) => void) | null = null;

  constructor(seed: number, sink: MeshSink, workerCount: number, dim = 0) {
    this.seed = seed;
    this.dim = dim;
    this.soulChannel = !dimensionDef(dim).skyLight;
    this.sink = sink;
    this.generator = createGenerator(dim, seed);
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./worldWorker.ts', import.meta.url), { type: 'module' });
      const slot: WorkerSlot = { worker, inFlight: 0 };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(slot, e.data);
      worker.onerror = (e) => console.error('Error en worker de mundo', e.message);
      const init: WorkerRequest = { type: 'init', seed, dim };
      worker.postMessage(init);
      this.workers.push(slot);
    }
  }

  dispose(): void {
    for (const w of this.workers) w.worker.terminate();
    this.workers = [];
    for (const col of this.columns.values()) if (col.mesh) this.sink.deleteMesh(col);
    this.columns.clear();
  }

  // ------------------------------------------------------------------ consultas

  getColumn(cx: number, cz: number): Column | undefined {
    return this.columns.get(chunkKey(cx, cz));
  }

  /** Id del bloque, o -1 si la columna no está cargada. */
  getBlock(x: number, y: number, z: number): number {
    if (y < MIN_Y) return -1;
    if (y >= MAX_Y) return AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const col = this.columns.get(chunkKey(cx, cz));
    if (!col || !col.blocks) return -1;
    return col.blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  /**
   * Luz empaquetada (cielo << 4 | bloque); 0xf0 si no hay datos. Fase 8 (entorno del Nether): sin luz del cielo, el
   * cielo es 0 (su canal lleva la luz de alma, que sólo sirve para dibujar: ver renderLight).
   */
  getLight(x: number, y: number, z: number): number {
    const l = this.renderLight(x, y, z);
    return this.soulChannel ? l & 15 : l;
  }

  /** Fase 8 (entorno del Nether): luz para dibujar: sin luz del cielo, (alma << 4 | bloque). */
  private readonly soulChannel: boolean;
  renderLight(x: number, y: number, z: number): number {
    if (y >= MAX_Y) return this.soulChannel ? 0 : 0xf0;
    if (y < MIN_Y) return 0;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const col = this.columns.get(chunkKey(cx, cz));
    if (!col || !col.light) return this.soulChannel ? 0 : 0xf0;
    return col.light[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  isReady(cx: number, cz: number): boolean {
    const col = this.columns.get(chunkKey(cx, cz));
    return !!col && col.meshed;
  }

  // ------------------------------------------------------------------ ediciones

  /** Carga ediciones iniciales (del servidor) antes de generar. */
  loadEdits(list: Iterable<[number, number, number, number]>): void {
    for (const [x, y, z, id] of list) this.recordEdit(x, y, z, id);
  }

  /**
   * Sustituye todas las ediciones por la lista autoritativa del servidor (al reconectar) y
   * regenera las columnas cargadas cuyo contenido cambió. Así se descartan cambios locales que
   * el servidor nunca recibió y se aplican los que hicieron otros mientras tanto.
   */
  resetEdits(list: Iterable<[number, number, number, number]>): void {
    const old = this.edits;
    this.edits = new Map();
    this.loadEdits(list);
    const changed = new Set<string>();
    const keys = new Set<string>([...old.keys(), ...this.edits.keys()]);
    for (const key of keys) {
      const a = old.get(key);
      const b = this.edits.get(key);
      if (!a || !b || a.size !== b.size) {
        changed.add(key);
        continue;
      }
      for (const [idx, id] of a) {
        if (b.get(idx) !== id) {
          changed.add(key);
          break;
        }
      }
    }
    for (const key of changed) {
      const col = this.columns.get(key);
      if (!col || !col.blocks) continue;
      // Regenerar: la malla anterior se mantiene hasta que llegue la nueva.
      col.blocks = null;
      col.light = null;
      col.genPending = false;
      col.meshPending = false;
      col.dirty = true;
      col.version++;
    }
  }

  private recordEdit(x: number, y: number, z: number, id: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    let m = this.edits.get(key);
    if (!m) {
      m = new Map();
      this.edits.set(key, m);
    }
    m.set(blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE), id);
  }

  /** Cambia un bloque. Devuelve el id anterior (o -1 si no se pudo). */
  setBlock(x: number, y: number, z: number, id: number): number {
    if (y < MIN_Y || y >= MAX_Y || !isValidBlockId(id)) return -1;
    this.recordEdit(x, y, z, id);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const col = this.columns.get(chunkKey(cx, cz));
    if (!col || !col.blocks) return -1;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const i = blockIndex(lx, y, lz);
    const old = col.blocks[i];
    if (old === id) return old;
    col.blocks[i] = id;
    col.version++;
    if (id !== AIR && y > col.maxY) col.maxY = y;
    col.dirty = true;
    // Vecinos: caras en el borde y propagación de luz (hasta 15 bloques, distancia Manhattan).
    const lightChange =
      BLOCK_LIGHT_OPACITY[old] !== BLOCK_LIGHT_OPACITY[id] || BLOCK_EMISSION[old] !== BLOCK_EMISSION[id];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const distX = dx < 0 ? lx + 1 : dx > 0 ? CHUNK_SIZE - lx : 0;
        const distZ = dz < 0 ? lz + 1 : dz > 0 ? CHUNK_SIZE - lz : 0;
        const dist = distX + distZ;
        const touches = (dx === 0 || distX === 1) && (dz === 0 || distZ === 1);
        if ((lightChange && dist <= 15) || touches) {
          const n = this.columns.get(chunkKey(cx + dx, cz + dz));
          if (n && n.blocks) n.dirty = true;
        }
      }
    }
    return old;
  }

  // ------------------------------------------------------------------ planificación

  private rebuildOrder(pcx: number, pcz: number, yaw: number): void {
    const R = Math.min(MAX_RADIUS, this.renderDistance + 3);
    const items: { dx: number; dz: number; score: number }[] = [];
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > R + 0.5) continue;
        // Prioriza lo que está delante de la cámara.
        const dot = d > 0 ? (dx * fx + dz * fz) / d : 1;
        const score = d * (dot > 0.3 ? 1 : 1.6) - (d < 2.5 ? 100 : 0);
        items.push({ dx, dz, score });
      }
    }
    items.sort((a, b) => a.score - b.score);
    this.order = new Int32Array(items.length * 2);
    items.forEach((it, i) => {
      this.order[i * 2] = it.dx;
      this.order[i * 2 + 1] = it.dz;
    });
    this.orderCx = pcx;
    this.orderCz = pcz;
    this.orderYaw = yaw;
    this.orderRadius = this.renderDistance;
  }

  private freeSlot(): WorkerSlot | null {
    let best: WorkerSlot | null = null;
    for (const w of this.workers) {
      if (w.inFlight < MAX_IN_FLIGHT && (!best || w.inFlight < best.inFlight)) best = w;
    }
    return best;
  }

  /** Llamar cada frame con la posición del jugador. */
  update(px: number, pz: number, yaw: number, dt: number): void {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    let dyaw = Math.abs(yaw - this.orderYaw) % (Math.PI * 2);
    if (dyaw > Math.PI) dyaw = Math.PI * 2 - dyaw;
    if (pcx !== this.orderCx || pcz !== this.orderCz || dyaw > 0.6 || this.orderRadius !== this.renderDistance) {
      this.rebuildOrder(pcx, pcz, yaw);
    }

    // Subidas a la GPU limitadas por frame para evitar tirones.
    let uploads = 0;
    while (this.pendingUploads.length > 0 && uploads < 12) {
      const u = this.pendingUploads.shift()!;
      if (this.columns.get(u.col.key) !== u.col) continue;
      this.sink.uploadMesh(u.col, u.msg.opaque, u.msg.cutout, u.msg.translucent, u.msg.minY, u.msg.maxY);
      u.col.light = u.msg.light;
      if (!u.col.meshed) {
        u.col.meshed = true;
        this.meshedCount++;
      }
      this.onColumnMeshed?.(u.col);
      uploads++;
    }

    const R = this.renderDistance;
    const order = this.order;
    for (let k = 0; k < order.length; k += 2) {
      const slot = this.freeSlot();
      if (!slot) break;
      const dx = order[k];
      const dz = order[k + 1];
      const d2 = dx * dx + dz * dz;
      const cx = pcx + dx;
      const cz = pcz + dz;
      const key = chunkKey(cx, cz);
      let col = this.columns.get(key);
      if (!col) {
        if (d2 > (R + 2) * (R + 2)) continue;
        col = {
          cx, cz, key, blocks: null, light: null, maxY: MIN_Y, genPending: false, meshPending: false,
          dirty: true, meshed: false, version: 0, mesh: null,
        };
        this.columns.set(key, col);
      }
      if (!col.blocks) {
        if (!col.genPending && d2 <= (R + 2) * (R + 2)) this.dispatchGen(slot, col);
        continue;
      }
      if (col.dirty && !col.meshPending && d2 <= (R + 0.5) * (R + 0.5)) {
        const nb = this.neighbors(cx, cz);
        if (nb) this.dispatchMesh(slot, col, nb);
      }
    }

    // Descarga periódica de columnas lejanas.
    this.unloadTimer += dt;
    if (this.unloadTimer > 0.5) {
      this.unloadTimer = 0;
      const lim = (R + 3.5) * (R + 3.5);
      for (const col of this.columns.values()) {
        const dx = col.cx - pcx;
        const dz = col.cz - pcz;
        if (dx * dx + dz * dz > lim) {
          if (col.mesh) this.sink.deleteMesh(col);
          if (col.meshed) this.meshedCount--;
          this.columns.delete(col.key);
        }
      }
    }
  }

  private neighbors(cx: number, cz: number): Column[] | null {
    const out: Column[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.columns.get(chunkKey(cx + dx, cz + dz));
        if (!n || !n.blocks) return null;
        out.push(n);
      }
    }
    return out;
  }

  private dispatchGen(slot: WorkerSlot, col: Column): void {
    const id = this.nextJobId++;
    col.genPending = true;
    this.jobs.set(id, { kind: 'gen', col });
    slot.inFlight++;
    const req: WorkerRequest = { type: 'gen', id, cx: col.cx, cz: col.cz };
    slot.worker.postMessage(req);
  }

  private dispatchMesh(slot: WorkerSlot, col: Column, nb: Column[]): void {
    const id = this.nextJobId++;
    col.meshPending = true;
    col.dirty = false;
    this.jobs.set(id, { kind: 'mesh', col, version: col.version });
    slot.inFlight++;
    // Sólo las filas hasta el bloque más alto (+1); el mallador toma el resto como aire.
    const chunks: ArrayBuffer[] = nb.map((n) => n.blocks!.slice(0, (Math.min(MAX_Y - 1, n.maxY + 1) - MIN_Y + 1) << 8).buffer);
    const req: WorkerRequest = { type: 'mesh', id, cx: col.cx, cz: col.cz, chunks };
    slot.worker.postMessage(req, chunks);
  }

  requestSpawn(): Promise<{ x: number; y: number; z: number }> {
    return new Promise((resolve) => {
      const slot = this.workers[0];
      const id = this.nextJobId++;
      this.jobs.set(id, { kind: 'spawn', resolve });
      slot.inFlight++;
      const req: WorkerRequest = { type: 'spawn', id };
      slot.worker.postMessage(req);
    });
  }

  private onWorkerMessage(slot: WorkerSlot, msg: WorkerResponse): void {
    const job = this.jobs.get(msg.id);
    this.jobs.delete(msg.id);
    slot.inFlight = Math.max(0, slot.inFlight - 1);
    if (msg.type === 'error') {
      console.error('Error en worker:', msg.message);
      if (job?.col) {
        if (job.kind === 'mesh') job.col.dirty = true;
        job.col.genPending = false;
        job.col.meshPending = false;
      }
      if (job?.kind === 'spawn') job.resolve?.({ x: 0.5, y: 120, z: 0.5 });
      return;
    }
    if (!job) return;
    if (msg.type === 'spawn') {
      job.resolve?.({ x: msg.x, y: msg.y, z: msg.z });
      return;
    }
    const col = job.col!;
    if (this.columns.get(col.key) !== col) return; // descargada mientras tanto
    if (msg.type === 'gen') {
      col.genPending = false;
      col.blocks = msg.blocks;
      let maxY = MIN_Y;
      for (let i = 0; i < 256; i++) if (msg.heights[i] > maxY) maxY = msg.heights[i];
      col.maxY = maxY;
      // Aplicar ediciones guardadas de este chunk.
      const ed = this.edits.get(col.key);
      if (ed) {
        for (const [idx, id] of ed) {
          col.blocks[idx] = id;
          const y = indexY(idx);
          if (id !== AIR && y > col.maxY) col.maxY = y;
        }
      }
      col.dirty = true;
      this.sink.uploadTint(col.cx, col.cz, msg.tint);
      // Los vecinos ya mallados deben re-mallarse (su borde ahora tiene datos reales).
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const n = this.columns.get(chunkKey(col.cx + dx, col.cz + dz));
          if (n && n.meshed) n.dirty = true;
        }
      }
    } else if (msg.type === 'mesh') {
      col.meshPending = false;
      this.pendingUploads.push({ col, msg });
    }
  }
}
