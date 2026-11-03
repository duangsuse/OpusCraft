// Fase 8.4 (estructuras del Nether): dónde salen y qué dibuja cada chunk del Nether.
// - Fortalezas y bastiones comparten la rejilla «nether_complexes» de la 26.3 (regiones de 27 chunks con 4 de
//   separación): en cada región se elige por pesos (fortaleza 2, bastión 3) y, si el bastión no puede salir en
//   ese bioma (los deltas de basalto), sale la fortaleza, que vale en todo el Nether.
// - Los fósiles del Nether y los portales en ruinas tienen sus propias rejillas (netherFossils.ts, netherPortals.ts)
//   y se dibujan antes (una fortaleza o un bastión que pase por encima manda).
// Las piezas de cada estructura se calculan una vez (con su propio azar) y se guardan; cada chunk dibuja lo suyo
// después de la decoración (en Java se intercalan por pasos: la vegetación y el fuego no crecen encima).
import { CHUNK_SIZE, hash2 } from '../constants';
import { BIOME_BASALT_DELTAS } from './biomeIds';
import { Canvas, type StructureChest, type StructureMob } from './structures';
import type { TerrainGenerator } from './terrain';
import { fortressPieces, fortressBounds, drawFortress, Box, type FortressPiece } from './netherFortress';
import { bastionPieces, bastionBounds, drawBastion, BASTION_MOB_TYPES, type BastionPiece } from './bastion';
import { drawNetherFossils, locateNetherFossil, type NetherBaseColumn } from './netherFossils';
import { drawNetherRuinedPortals, locateNetherRuinedPortal } from './netherPortals';
import { MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_HOGLIN } from '../netherMobs';

// Las criaturas de las plantillas de criaturas del bastión.
Object.assign(BASTION_MOB_TYPES, { piglin_crossbow: MOB_PIGLIN, piglin_sword: MOB_PIGLIN, piglin: MOB_PIGLIN, piglin_brute: MOB_PIGLIN_BRUTE, hoglin: MOB_HOGLIN });

/** La rejilla de fortalezas y bastiones (StructureSet nether_complexes). */
export const NETHER_COMPLEXES = { spacing: 27, separation: 4, salt: 30084232 };

export type NetherStructureKey = 'fortress' | 'bastion_remnant';

/** ¿Da el generador el terreno base del Nether? (el del Nether, sí). */
const hasBase = (gen: TerrainGenerator): gen is TerrainGenerator & NetherBaseColumn => 'baseBlockAt' in gen;

/** Nombres en español (y las claves que acepta /localizar en el Nether). */
export const NETHER_STRUCTURE_NAMES: Readonly<Record<string, string>> = {
  fortress: 'Fortaleza del Nether',
  bastion_remnant: 'Bastión en ruinas',
  nether_fossil: 'Fósil del Nether',
  ruined_portal_nether: 'Portal en ruinas',
};

/** Las claves del mundo normal que en el Nether son las suyas (/localizar fosil o portal_en_ruinas). */
export const NETHER_STRUCTURE_OF: Readonly<Record<string, string>> = { fossil: 'nether_fossil', ruined_portal: 'ruined_portal_nether' };

interface ComplexStart {
  key: NetherStructureKey;
  cx: number;
  cz: number;
  /** Piezas y caja que ocupan. */
  fortress?: FortressPiece[];
  bastion?: BastionPiece[];
  bounds: Box;
}

/** Caché de orígenes por región (y de sus piezas). */
const starts = new Map<string, ComplexStart | null>();

/** Chunk de la región (rx, rz) donde se intenta la estructura (RandomSpreadStructurePlacement, lineal). */
function regionChunk(seed: number, rx: number, rz: number, spacing: number, separation: number, salt: number): [number, number] {
  const h = hash2(rx, rz, seed ^ salt);
  const range = spacing - separation;
  return [rx * spacing + (h % range), rz * spacing + ((h >>> 12) % range)];
}

/** Estructura de la región (rx, rz) de la rejilla de fortalezas y bastiones. */
export function complexStart(gen: TerrainGenerator, rx: number, rz: number): ComplexStart | null {
  const k = `${gen.seed}:${rx},${rz}`;
  const cached = starts.get(k);
  if (cached !== undefined) return cached;
  if (starts.size > 256) starts.clear();
  const { spacing, separation, salt } = NETHER_COMPLEXES;
  const [cx, cz] = regionChunk(gen.seed, rx, rz, spacing, separation, salt);
  // Por pesos (2 : 3); el bastión no sale en los deltas de basalto (entonces, la fortaleza).
  let key: NetherStructureKey = hash2(cx, cz, gen.seed ^ 0x6e7c) % 5 < 2 ? 'fortress' : 'bastion_remnant';
  if (key === 'bastion_remnant' && gen.biomeAt(cx * CHUNK_SIZE, cz * CHUNK_SIZE) === BIOME_BASALT_DELTAS) key = 'fortress';
  let s: ComplexStart;
  if (key === 'fortress') {
    const pieces = fortressPieces(hash2(cx, cz, gen.seed ^ 0xf0f7), cx, cz);
    s = { key, cx, cz, fortress: pieces, bounds: fortressBounds(pieces) };
  } else {
    const pieces = bastionPieces(hash2(cx, cz, gen.seed ^ 0xba57), cx, cz);
    const b = bastionBounds(pieces);
    s = { key, cx, cz, bastion: pieces, bounds: new Box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1) };
  }
  starts.set(k, s);
  return s;
}

/** Orígenes cuya caja puede tocar el rectángulo [x0, x1] × [z0, z1] (margen de 12 chunks). */
function startsNear(gen: TerrainGenerator, x0: number, z0: number, x1: number, z1: number): ComplexStart[] {
  const { spacing } = NETHER_COMPLEXES;
  const r0 = Math.floor((Math.floor(x0 / 16) - 12) / spacing), r1 = Math.floor((Math.floor(x1 / 16) + 12) / spacing);
  const q0 = Math.floor((Math.floor(z0 / 16) - 12) / spacing), q1 = Math.floor((Math.floor(z1 / 16) + 12) / spacing);
  const out: ComplexStart[] = [];
  for (let rz = q0; rz <= q1; rz++) {
    for (let rx = r0; rx <= r1; rx++) {
      const s = complexStart(gen, rx, rz);
      if (!s) continue;
      const b = s.bounds;
      if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
      out.push(s);
    }
  }
  return out;
}

/** Dibuja en el chunk (cx, cz) las estructuras del Nether que lo tocan; los fluidos que ponen, a `ticks`. */
export function placeNetherStructures(
  gen: TerrainGenerator & NetherBaseColumn, blocks: Uint16Array, cx: number, cz: number, chests: StructureChest[], mobs: StructureMob[], ticks: number[],
): void {
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const c = new Canvas(blocks, x0, z0, chests, [], mobs);
  drawNetherFossils(c, gen.seed, gen);
  drawNetherRuinedPortals(c, gen.seed, gen);
  for (const s of startsNear(gen, x0, z0, x0 + 15, z0 + 15)) {
    if (s.fortress) drawFortress(c, s.fortress, ticks);
    if (s.bastion) drawBastion(c, s.bastion, ticks);
  }
}

/** ¿Está (x, y, z) dentro de una pieza de fortaleza? (su lista de monstruos manda ahí: spawn_overrides «piece»). */
export function inFortressPiece(gen: TerrainGenerator, x: number, y: number, z: number): boolean {
  for (const s of startsNear(gen, x, z, x, z)) {
    if (!s.fortress) continue;
    for (const p of s.fortress) if (p.box.isInside(x, y, z)) return true;
  }
  return false;
}

/** ¿Está (x, y, z) dentro de la caja entera de una fortaleza? (NaturalSpawner.isInNetherFortressBounds). */
export function inFortressBounds(gen: TerrainGenerator, x: number, y: number, z: number): boolean {
  for (const s of startsNear(gen, x, z, x, z)) if (s.fortress && s.bounds.isInside(x, y, z)) return true;
  return false;
}

/** La estructura del Nether más cercana de un tipo a (x, z): [x, y, z] o null (busca hasta `maxRegions` regiones). */
export function locateNetherStructure(gen: TerrainGenerator, key: string, x: number, z: number, maxRegions = 12): [number, number, number] | null {
  if (key === 'nether_fossil') return hasBase(gen) ? locateNetherFossil(gen.seed, gen, x, z) : null;
  if (key === 'ruined_portal_nether') return hasBase(gen) ? locateNetherRuinedPortal(gen.seed, gen, x, z) : null;
  if (key !== 'fortress' && key !== 'bastion_remnant') return null;
  const { spacing } = NETHER_COMPLEXES;
  const rx0 = Math.floor(x / 16 / spacing), rz0 = Math.floor(z / 16 / spacing);
  let best: [number, number, number] | null = null, bd = Infinity;
  for (let r = 0; r <= maxRegions; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const s = complexStart(gen, rx0 + dx, rz0 + dz);
        if (!s || s.key !== key) continue;
        const sx = s.cx * 16 + 8, sz = s.cz * 16 + 8;
        const d = Math.hypot(sx - x, sz - z);
        if (d < bd) {
          bd = d;
          best = [sx, s.fortress ? s.fortress[0].box.y0 + 5 : s.bounds.y0 + 1, sz];
        }
      }
    }
    if (best && (r + 1) * spacing * 16 > bd + spacing * 16) break;
  }
  return best;
}
