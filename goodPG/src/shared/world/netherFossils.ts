// Fase 8.4 (estructuras del Nether): fósiles del Nether (NetherFossilStructure de la 26.3). Esqueletos de bloques de
// hueso (costillas que se curvan, arcos, espinazos y cráneos; catorce formas dibujadas aquí con los tamaños de las de
// Java) medio enterrados en el suelo del valle de almas. Su rejilla es de 2 chunks (separación 1): en cada región se
// elige una columna al azar del chunk y una altura entre y = 32 y el techo − 2, y se baja hasta el primer aire con
// arena de alma o algo firme debajo (en el terreno base, sin decorar); si llega al mar de lava, no sale. Se gira al
// azar y sólo pone el hueso (el aire del dibujo no toca nada). El ghast seco que Java deja junto a la mitad de ellos
// llega con el ghast feliz (fase 9).
import { BONE_BLOCK, BONE_BLOCK_AXIS, AXIS_X, AXIS_Z } from '../blocks';
import { CHUNK_SIZE, hash2 } from '../constants';
import { mulberry32 } from './noise';
import { BIOME_SOUL_SAND_VALLEY } from './biomeIds';
import type { Canvas } from './structures';

/** La rejilla de los fósiles del Nether (StructureSet nether_fossils). */
export const NETHER_FOSSILS = { spacing: 2, separation: 1, salt: 14357921 };

/**
 * Las formas: capas de abajo arriba, filas por z, columnas por x. «|» hueso de pie, «-» tumbado a lo largo de x,
 * «=» tumbado a lo largo de z, «.» nada.
 */
const SHAPES: readonly (readonly string[][])[] = [
  // 1 (4 × 4 × 5): dos costillas que se juntan arriba.
  [['|..|', '....', '....', '....', '|...'], ['|..|', '....', '....', '....', '|...'], ['|..|', '....', '....', '....', '....'], ['.--.', '....', '....', '....', '....']],
  // 2 (5 × 1 × 5): espinazo en cruz tumbado.
  [['..=..', '..=..', '--=--', '..=..', '..=..']],
  // 3 (3 × 4 × 2): una costilla con la punta doblada.
  [['|..', '|..'], ['|..', '...'], ['|..', '...'], ['.--', '...']],
  // 4 (3 × 4 × 1): una costilla alta.
  [['|..'], ['|..'], ['||.'], ['.|-']],
  // 5 (2 × 5 × 1): una costilla curvada.
  [['|.'], ['|.'], ['|.'], ['|.'], ['.-']],
  // 6 (7 × 5 × 5): un costillar de tres pares.
  [['|.|.|.|', '.......', '.......', '.......', '|.|.|.|'], ['|.|.|.|', '.......', '.......', '.......', '|.|.|.|'], ['|...|..', '.......', '.......', '.......', '..|...|'], ['.---...', '.......', '.......', '.......', '...---.'], ['.......', '.......', '.......', '.......', '.......']],
  // 7 (4 × 6 × 5): un arco alto con costillas a los lados.
  [['|..|', '....', '|..|', '....', '|..|'], ['|..|', '....', '|..|', '....', '|...'], ['|..|', '....', '|..|', '....', '....'], ['|..|', '....', '....', '....', '....'], ['.--.', '....', '.--.', '....', '....'], ['.--.', '....', '....', '....', '....']],
  // 8 (3 × 5 × 1): costilla con dos puntas.
  [['|..'], ['|..'], ['|..'], ['|-.'], ['..-']],
  // 9 (3 × 5 × 5): costillas en fila con el espinazo arriba.
  [['|..', '...', '|..', '...', '|..'], ['|..', '...', '|..', '...', '|..'], ['|-.', '...', '|-.', '...', '|..'], ['..-', '...', '..-', '...', '.-.'], ['...', '...', '...', '...', '...']],
  // 10 (3 × 7 × 1): una costilla muy alta que se dobla dos veces.
  [['|..'], ['|..'], ['|..'], ['|..'], ['.|.'], ['.|-'], ['...']],
  // 11 (5 × 5 × 7): un costillar grande de cuatro costillas y el espinazo.
  [['|...|', '.....', '|...|', '.....', '|...|', '.....', '|...|'], ['|...|', '.....', '|...|', '.....', '|...|', '.....', '|...|'], ['|...|', '.....', '|...|', '.....', '.....', '.....', '.....'], ['.---.', '.....', '.---.', '.....', '.---.', '.....', '.....'], ['.....', '.....', '.....', '.....', '.....', '.....', '.....']],
  // 12 (4 × 4 × 3): dos costillas cortas y una tumbada.
  [['|..|', '....', '|..|'], ['|..|', '....', '|...'], ['|..|', '....', '....'], ['.--.', '....', '.--.']],
  // 13 (4 × 5 × 6): costillas escalonadas.
  [['|..|', '....', '|..|', '....', '|..|', '....'], ['|..|', '....', '|..|', '....', '|...', '....'], ['|..|', '....', '|...', '....', '....', '....'], ['.--.', '....', '.--.', '....', '.-..', '....'], ['....', '....', '....', '....', '....', '....']],
  // 14 (7 × 7 × 6): el más grande: un arco doble con costillas y el cráneo.
  [['|.....|', '.......', '|.....|', '.......', '|.....|', '.......'], ['|.....|', '.......', '|.....|', '.......', '|.....|', '.......'], ['|.....|', '.......', '|.....|', '.......', '|.....|', '.......'], ['.|...|.', '.......', '.|...|.', '.......', '.|...|.', '.......'], ['.|...|.', '.......', '..---..', '.......', '..---..', '.......'], ['..---..', '.......', '.......', '.......', '.......', '.......'], ['.......', '.......', '.......', '.......', '.......', '.......']],
];

export interface NetherFossil {
  x: number;
  y: number;
  z: number;
  shape: number;
  rot: number;
}

/** El terreno base del Nether que se consulta (sin decorar). */
export interface NetherBaseColumn {
  biomeAt(x: number, z: number): number;
  baseBlockAt(x: number, y: number, z: number): number;
  isSturdyBase(id: number): boolean;
}

const cache = new Map<string, NetherFossil | null>();

/** El fósil de la región (rx, rz) o null. */
export function netherFossilAt(seed: number, gen: NetherBaseColumn, rx: number, rz: number): NetherFossil | null {
  const k = `${seed}:${rx},${rz}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  if (cache.size > 4096) cache.clear();
  const { spacing, salt } = NETHER_FOSSILS;
  const cx = rx * spacing, cz = rz * spacing; // con separación 1, siempre el primer chunk de la región
  const r = mulberry32(hash2(cx, cz, seed ^ salt));
  const x = cx * CHUNK_SIZE + Math.floor(r() * 16), z = cz * CHUNK_SIZE + Math.floor(r() * 16);
  let out: NetherFossil | null = null;
  if (gen.biomeAt(x, z) === BIOME_SOUL_SAND_VALLEY) {
    // Altura uniforme entre 32 y el techo − 2 (below_top 2 de 128 de alto) y bajar hasta un hueco con suelo.
    let y = 32 + Math.floor(r() * (125 - 32 + 1));
    const sea = 32;
    while (y > sea) {
      const cur = gen.baseBlockAt(x, y, z);
      const below = gen.baseBlockAt(x, --y, z);
      if (cur === 0 && gen.isSturdyBase(below)) break;
    }
    if (y > sea) out = { x, y, z, shape: Math.floor(r() * SHAPES.length), rot: Math.floor(r() * 4) };
  }
  cache.set(k, out);
  return out;
}

/** Hueso tumbado o de pie, girado con la pieza. */
function bone(ch: string, rot: number): number {
  if (ch === '|') return BONE_BLOCK;
  const alongX = (ch === '-') !== ((rot & 1) === 1);
  return BONE_BLOCK_AXIS + (alongX ? AXIS_X : AXIS_Z);
}

/** Dibuja en el lienzo los fósiles de las regiones de alrededor que tocan su chunk. */
export function drawNetherFossils(c: Canvas, seed: number, gen: NetherBaseColumn): void {
  const cx = Math.floor(c.x0 / CHUNK_SIZE), cz = Math.floor(c.z0 / CHUNK_SIZE);
  const { spacing } = NETHER_FOSSILS;
  for (let rz = Math.floor((cz - 1) / spacing); rz <= Math.floor((cz + 1) / spacing); rz++) {
    for (let rx = Math.floor((cx - 1) / spacing); rx <= Math.floor((cx + 1) / spacing); rx++) {
      const f = netherFossilAt(seed, gen, rx, rz);
      if (!f) continue;
      const layers = SHAPES[f.shape];
      for (let y = 0; y < layers.length; y++) {
        const rows = layers[y];
        for (let z = 0; z < rows.length; z++) {
          for (let x = 0; x < rows[z].length; x++) {
            const ch = rows[z][x];
            if (ch === '.') continue;
            const [ax, az] = f.rot === 1 ? [-z, x] : f.rot === 2 ? [-x, -z] : f.rot === 3 ? [z, -x] : [x, z];
            c.set(f.x + ax, f.y + y, f.z + az, bone(ch, f.rot));
          }
        }
      }
    }
  }
}

/** El fósil del Nether más cercano a (x, z) (hasta `maxRegions` regiones). */
export function locateNetherFossil(seed: number, gen: NetherBaseColumn, x: number, z: number, maxRegions = 100): [number, number, number] | null {
  const { spacing } = NETHER_FOSSILS;
  const rx0 = Math.floor(x / 16 / spacing), rz0 = Math.floor(z / 16 / spacing);
  let best: [number, number, number] | null = null, bd = Infinity;
  for (let r = 0; r <= maxRegions; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const f = netherFossilAt(seed, gen, rx0 + dx, rz0 + dz);
        if (!f) continue;
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < bd) {
          bd = d;
          best = [f.x, f.y, f.z];
        }
      }
    }
    if (best && (r + 1) * spacing * 16 > bd + spacing * 16) break;
  }
  return best;
}
