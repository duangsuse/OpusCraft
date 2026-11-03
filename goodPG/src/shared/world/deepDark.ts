// Fase 7.5 (abismo): el bioma Deep Dark. Como en Minecraft, está en lo más hondo (por debajo de y = 0) y
// bajo las montañas (donde la erosión es baja): aquí, donde el factor de montaña del terreno (interpolado
// en una rejilla de 16 bloques para que sea barato) es alto y un ruido de manchas lo permite.
//
// Al generar cada chunk, el sculk cubre casi todo el suelo, las paredes y el techo de sus cuevas (con
// huecos de pizarra), las venas bordean las manchas y salen sensores, chilladores que pueden invocar al
// warden y catalizadores. En el Deep Dark no aparece ninguna criatura (sim/entities/spawner.ts).
import {
  AIR, SCULK, SCULK_CATALYST, SCULK_SENSOR, BLOCK_OPAQUE, BLOCK_SOLID, sculkReplaceable, shriekerFor, stateOf, veinWith,
} from '../blocks';
import { MIN_Y, blockIndex, hash3 } from '../constants';
import { Simplex } from './noise';
import type { TerrainGenerator } from './terrain';

/** Altura hasta la que llega el Deep Dark (incluida). */
export const DEEP_DARK_TOP = 0;

interface DeepState {
  patch: Simplex;
  cover: Simplex;
  /** Factor de montaña en los nodos de la rejilla de 16 bloques. */
  grid: Map<number, number>;
}

const STATES = new WeakMap<TerrainGenerator, DeepState>();

function stateOf2(gen: TerrainGenerator): DeepState {
  let s = STATES.get(gen);
  if (!s) {
    s = { patch: new Simplex(gen.seed ^ 0xdeed), cover: new Simplex(gen.seed ^ 0x5c01c), grid: new Map() };
    STATES.set(gen, s);
  }
  return s;
}

const tmpInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

function mountAt(gen: TerrainGenerator, s: DeepState, gx: number, gz: number): number {
  const k = (gx + 131072) * 262144 + (gz + 131072);
  let m = s.grid.get(k);
  if (m === undefined) {
    if (s.grid.size > 20000) s.grid.clear();
    m = gen.columnInfo(gx * 16, gz * 16, tmpInfo).mount;
    s.grid.set(k, m);
  }
  return m;
}

/** Peso del Deep Dark en una columna (> 0: lo hay). */
export function deepDarkWeight(gen: TerrainGenerator, x: number, z: number): number {
  const s = stateOf2(gen);
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  const fx = (x - gx * 16) / 16, fz = (z - gz * 16) / 16;
  const a = mountAt(gen, s, gx, gz), b = mountAt(gen, s, gx + 1, gz);
  const c = mountAt(gen, s, gx, gz + 1), d = mountAt(gen, s, gx + 1, gz + 1);
  const mount = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  return mount - 0.62 + 0.2 * s.patch.noise2(x / 260, z / 260);
}

/** ¿Tiene Deep Dark esta columna (por debajo de DEEP_DARK_TOP)? */
export function deepDarkColumn(gen: TerrainGenerator, x: number, z: number): boolean {
  return deepDarkWeight(gen, x, z) > 0;
}

/** ¿Es (x, y, z) Deep Dark? */
export function isDeepDark(gen: TerrainGenerator, x: number, y: number, z: number): boolean {
  return y <= DEEP_DARK_TOP && deepDarkColumn(gen, x, z);
}

const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

/**
 * Sculk en las cuevas del Deep Dark de un chunk recién generado (después de excavar las cuevas y antes
 * de las estructuras: la ciudad antigua pone el suyo encima).
 */
export function decorateDeepDark(gen: TerrainGenerator, blocks: Uint16Array, x0: number, z0: number): void {
  const mask = new Uint8Array(256);
  let any = false;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      if (!deepDarkColumn(gen, x0 + lx, z0 + lz)) continue;
      mask[lz * 16 + lx] = 1;
      any = true;
    }
  }
  if (!any) return;
  const s = stateOf2(gen);
  const seed = gen.seed;
  const y0 = MIN_Y + 6, y1 = DEEP_DARK_TOP;
  const get = (lx: number, y: number, lz: number) =>
    lx < 0 || lx > 15 || lz < 0 || lz > 15 || y <= MIN_Y || y > y1 + 1 ? -1 : blocks[blockIndex(lx, y, lz)];
  // 1. Sculk sobre la roca que da al aire (con huecos donde el ruido baja).
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      if (!mask[lz * 16 + lx]) continue;
      const wx = x0 + lx, wz = z0 + lz;
      for (let y = y0; y <= y1; y++) {
        const i = blockIndex(lx, y, lz);
        if (!sculkReplaceable(blocks[i])) continue;
        let open = false;
        for (let f = 0; f < 6 && !open; f++) open = get(lx + DX[f], y + DY[f], lz + DZ[f]) === AIR;
        if (!open) continue;
        const n = s.cover.noise3(wx / 13, y / 9, wz / 13);
        if (n > -0.32) blocks[i] = SCULK;
      }
    }
  }
  // 2. Venas en la roca desnuda (más en el borde de las manchas) y lo que crece sobre el sculk del suelo.
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      if (!mask[lz * 16 + lx]) continue;
      const wx = x0 + lx, wz = z0 + lz;
      for (let y = y0; y <= y1; y++) {
        const i = blockIndex(lx, y, lz);
        if (blocks[i] !== AIR) continue;
        const h = hash3(wx, y, wz, seed ^ 0xdeda7c);
        const below = get(lx, y - 1, lz);
        // Sobre el sculk del suelo: sensores (1/40), chilladores que invocan (1/190) y catalizadores (1/320).
        if (below === SCULK) {
          const r = h % 7600;
          if (r < 190) {
            blocks[i] = stateOf(SCULK_SENSOR, { phase: 0, water: 0 });
            continue;
          }
          if (r < 230) {
            blocks[i] = shriekerFor(true);
            continue;
          }
          if (r < 254) {
            blocks[i] = SCULK_CATALYST;
            continue;
          }
        }
        // Venas en las caras de roca (no sculk) que tiene al lado.
        const n = s.cover.noise3(wx / 13, y / 9, wz / 13);
        const edge = n > -0.5 && n <= -0.32;
        if (((h >>> 13) & 1023) >= (edge ? 560 : 90)) continue;
        let faces = 0;
        for (let f = 0; f < 6; f++) {
          const b = get(lx + DX[f], y + DY[f], lz + DZ[f]);
          if (b > 0 && b !== SCULK && BLOCK_OPAQUE[b] === 1 && BLOCK_SOLID[b] === 1 && ((h >>> (f + 3)) & 1)) faces |= 1 << f;
        }
        if (faces) blocks[i] = veinWith(faces);
      }
    }
  }
}
