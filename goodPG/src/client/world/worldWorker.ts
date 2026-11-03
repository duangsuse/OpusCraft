// Web Worker: generación de terreno y mallado (con iluminación) de columnas de chunk.
import type { TerrainGenerator } from '../../shared/world/terrain';
import { createGenerator } from '../../shared/world/generators'; // Fase 8 (dimensiones)
import { Mesher } from './mesh/mesher';

export type WorkerRequest =
  | { type: 'init'; seed: number; dim: number }
  | { type: 'gen'; id: number; cx: number; cz: number }
  | { type: 'mesh'; id: number; cx: number; cz: number; chunks: ArrayBuffer[] }
  | { type: 'spawn'; id: number };

export type WorkerResponse =
  | { type: 'gen'; id: number; cx: number; cz: number; blocks: Uint16Array; tint: Uint8Array; heights: Int16Array }
  | {
      type: 'mesh';
      id: number;
      cx: number;
      cz: number;
      opaque: Uint32Array;
      cutout: Uint32Array;
      translucent: Uint32Array;
      light: Uint8Array;
      minY: number;
      maxY: number;
    }
  | { type: 'spawn'; id: number; x: number; y: number; z: number }
  | { type: 'error'; id: number; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let gen: TerrainGenerator | null = null;
const mesher = new Mesher();

scope.onmessage = (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        gen = createGenerator(msg.dim, msg.seed);
        mesher.setSeed(msg.seed);
        mesher.setDim(msg.dim); // Fase 8 (entorno del Nether): luz de alma
        break;
      case 'gen': {
        if (!gen) throw new Error('worker sin inicializar');
        const r = gen.generate(msg.cx, msg.cz);
        scope.postMessage(
          { type: 'gen', id: msg.id, cx: msg.cx, cz: msg.cz, blocks: r.blocks, tint: r.tint, heights: r.heights },
          [r.blocks.buffer, r.tint.buffer, r.heights.buffer],
        );
        break;
      }
      case 'mesh': {
        const chunks = msg.chunks.map((b) => new Uint16Array(b));
        const r = mesher.mesh(chunks, msg.cx, msg.cz);
        scope.postMessage(
          {
            type: 'mesh',
            id: msg.id,
            cx: msg.cx,
            cz: msg.cz,
            opaque: r.opaque,
            cutout: r.cutout,
            translucent: r.translucent,
            light: r.light,
            minY: r.minY,
            maxY: r.maxY,
          },
          [r.opaque.buffer, r.cutout.buffer, r.translucent.buffer, r.light.buffer],
        );
        break;
      }
      case 'spawn': {
        if (!gen) throw new Error('worker sin inicializar');
        const s = gen.findSpawn();
        scope.postMessage({ type: 'spawn', id: msg.id, x: s.x, y: s.y, z: s.z });
        break;
      }
    }
  } catch (err) {
    const id = 'id' in msg ? msg.id : -1;
    scope.postMessage({ type: 'error', id, message: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
};
