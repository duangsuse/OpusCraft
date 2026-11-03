// Fase 6.5 (maderas): árboles y plantas de las maderas nuevas al generar el mundo y al crecer un brote.
//  - Mangles en algunos pantanos (zonas de ~100 bloques elegidas con ruido): tronco levantado sobre
//    raíces arqueadas que bajan hasta el suelo o el fondo del agua (con raíces lodosas al pie), copa
//    ancha y propágulos colgando bajo las hojas.
//  - Algún roble pálido suelto en los bosques oscuros (sólo la madera: el jardín pálido es de otra fase).
//  - Bambú en rodales en las junglas (tallos de 4 a 14 con hojas en lo alto).
// Todo es determinista (semilla y posición), así que cada chunk que toca un árbol lo genera igual.
import {
  AIR, GRASS, SHORT_GRASS, FERN, WOOD_TYPES, MANGROVE_LOG, MANGROVE_LEAVES, MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS,
  HANGING_PROPAGULE, PALE_OAK_LOG, PALE_OAK_LEAVES, BAMBOO, VINE, horizontalLog, AXIS_X, AXIS_Z,
} from '../blocks';
import { MAX_Y, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import { DIR_X, DIR_Z } from '../blockModels';
import { Simplex } from './noise';
import { BIOME_SWAMP, BIOME_DARK_FOREST, BIOME_JUNGLE, BIOME_MANGROVE_SWAMP, BIOME_BAMBOO_JUNGLE, baseBiome } from './biomeIds';

type SetBlock = (x: number, y: number, z: number, id: number, force: boolean) => void;
/** Altura del suelo (último bloque sólido) en la columna (x, z). */
type Ground = (x: number, z: number) => number;

const noiseCache = new Map<number, Simplex>();
function regionNoise(seed: number): Simplex {
  let n = noiseCache.get(seed);
  if (!n) {
    n = new Simplex((seed ^ 0x6a2f65) | 0);
    noiseCache.set(seed, n);
  }
  return n;
}

/** ¿Está (x, z) en una zona de manglar? (algunos pantanos, a manchas grandes). */
export function isMangroveArea(seed: number, x: number, z: number): boolean {
  return regionNoise(seed).noise2(x / 110, z / 110) > 0.05;
}

const kindOf = (key: string) => WOOD_TYPES.findIndex((w) => w.key === key);

// ------------------------------------------------------------------ copas

function inDisc(seed: number, cx: number, cz: number, rad: number, x: number, y: number, z: number): boolean {
  const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
  return dx * dx + dz * dz <= rad * rad + rad * 0.6 + (hash3(x, y, z, seed ^ 0x2ee) % 3) * 0.25;
}

/** Capa de hojas; devuelve las celdas puestas (para colgar propágulos debajo). */
function leafDisc(seed: number, cx: number, y: number, cz: number, rad: number, leaves: number, set: SetBlock, out?: [number, number][]): void {
  const r0 = Math.ceil(rad + 1);
  const ix = Math.floor(cx), iz = Math.floor(cz);
  for (let z = iz - r0; z <= iz + r0; z++) {
    for (let x = ix - r0; x <= ix + r0; x++) {
      if (!inDisc(seed, cx, cz, rad, x, y, z)) continue;
      set(x, y, z, leaves, false);
      out?.push([x, z]);
    }
  }
}

// ------------------------------------------------------------------ mangle

/**
 * Mangle con el pie en (x, y, z) (y = primera celda por encima del suelo del tronco). Las raíces bajan
 * hasta `ground` de cada columna (la celda de abajo del todo es de raíces lodosas).
 */
export function mangroveTree(seed: number, x: number, y: number, z: number, r: number, set: SetBlock, ground: Ground): void {
  const lift = 2 + (Math.floor(r * 1000) % 2); // raíces bajo el tronco
  const h = 4 + (Math.floor(r * 7919) % 3);
  const base = y + lift;
  // Raíces: la columna del tronco y arcos hacia los lados (y alguna diagonal), bajando hasta el suelo.
  const root = (rx: number, rz: number, fromY: number) => {
    const g = ground(rx, rz);
    const lowest = Math.max(g + 1, y - 4);
    for (let yy = fromY; yy >= lowest; yy--) set(rx, yy, rz, yy === lowest && lowest === g + 1 ? MUDDY_MANGROVE_ROOTS : MANGROVE_ROOTS, true);
  };
  root(x, z, base - 1);
  for (let d = 0; d < 8; d++) {
    const hh = hash3(x, d, z, seed ^ 0x3a9f);
    if (d >= 4 && hh % 3 !== 0) continue; // diagonales: pocas
    const dx = d < 4 ? DIR_X[d] : DIR_X[d & 3] + DIR_X[(d + 1) & 3];
    const dz = d < 4 ? DIR_Z[d] : DIR_Z[d & 3] + DIR_Z[(d + 1) & 3];
    const reach = 1 + (hh >>> 4) % 2;
    // Primer tramo pegado al tronco, luego baja abriéndose.
    set(x + dx, base - 1, z + dz, MANGROVE_ROOTS, true);
    root(x + dx * reach, z + dz * reach, base - 1 - reach + 1);
  }
  // Tronco.
  for (let k = 0; k < h; k++) set(x, base + k, z, MANGROVE_LOG, true);
  const top = base + h - 1;
  // Una rama corta tumbada con su propia copa pequeña.
  const bd = Math.floor(r * 4000) % 4;
  const bx = x + DIR_X[bd], bz = z + DIR_Z[bd];
  set(bx, top - 1, bz, horizontalLog(MANGROVE_LOG, DIR_X[bd] !== 0 ? AXIS_X : AXIS_Z), true);
  set(bx + DIR_X[bd], top, bz + DIR_Z[bd], MANGROVE_LOG, true);
  const cells: [number, number][] = [];
  leafDisc(seed, x + 0.5, top - 1, z + 0.5, 2.8, MANGROVE_LEAVES, set, cells);
  const low = cells.length;
  leafDisc(seed, x + 0.5, top, z + 0.5, 3, MANGROVE_LEAVES, set);
  leafDisc(seed, x + 0.5, top + 1, z + 0.5, 2.2, MANGROVE_LEAVES, set);
  leafDisc(seed, x + 0.5, top + 2, z + 0.5, 1.2, MANGROVE_LEAVES, set);
  leafDisc(seed, bx + DIR_X[bd] + 0.5, top + 1, bz + DIR_Z[bd] + 0.5, 1.6, MANGROVE_LEAVES, set);
  // Propágulos colgando bajo la capa de hojas de abajo y enredaderas por el borde.
  const inLow = new Set(cells.map(([cx, cz]) => cx * 4096 + cz));
  for (let i = 0; i < low; i++) {
    const [lx, lz] = cells[i];
    if (lx === x && lz === z) continue;
    const hh = hash3(lx, top, lz, seed ^ 0x9e0);
    if (hh % 9 === 0) set(lx, top - 2, lz, HANGING_PROPAGULE, false);
    for (let d = 0; d < 4; d++) {
      const vx = lx + DIR_X[d], vz = lz + DIR_Z[d];
      if (inLow.has(vx * 4096 + vz) || (hh >>> (4 + d * 3)) % 6 !== 0) continue;
      const len = 1 + ((hh >>> 20) + d) % 3;
      for (let j = 0; j < len; j++) set(vx, top - 1 - j, vz, VINE + d, false);
    }
  }
}

// ------------------------------------------------------------------ roble pálido

/** Roble pálido: tronco recto de 6 a 8 y copa ancha y plana (como un roble oscuro de un solo tronco). */
export function paleOakTree(seed: number, x: number, y: number, z: number, r: number, set: SetBlock): void {
  const h = 6 + (Math.floor(r * 1000) % 3);
  for (let k = 0; k < h; k++) set(x, y + k, z, PALE_OAK_LOG, true);
  const top = y + h - 1;
  for (let i = 0; i < 2; i++) {
    const d = (Math.floor(r * 131) + i * 2) % 4;
    const bx = x + DIR_X[d], bz = z + DIR_Z[d];
    set(bx, top - 1, bz, horizontalLog(PALE_OAK_LOG, DIR_X[d] !== 0 ? AXIS_X : AXIS_Z), true);
    leafDisc(seed, bx + DIR_X[d] + 0.5, top, bz + DIR_Z[d] + 0.5, 1.6, PALE_OAK_LEAVES, set);
  }
  const radii = [2.8, 3.4, 2.8, 1.5];
  for (let k = 0; k < 4; k++) leafDisc(seed, x + 0.5, top - 1 + k, z + 0.5, radii[k], PALE_OAK_LEAVES, set);
}

// ------------------------------------------------------------------ ganchos para terrain.ts

/**
 * Árbol de la fase 6.5 al generar el terreno en (x, y, z) (y = primer bloque del tronco), o false si
 * ahí va el árbol de siempre.
 */
export function placeWoodTree(
  seed: number, biome: number, x: number, y: number, z: number, tr: number, set: SetBlock, ground: Ground,
): boolean {
  // Fase 7.6: en el pantano de manglares, todos; en los demás pantanos, en sus zonas de mangle.
  if (biome === BIOME_MANGROVE_SWAMP || (biome === BIOME_SWAMP && isMangroveArea(seed, x, z) && tr < 0.85)) {
    mangroveTree(seed, x, y, z, tr, set, ground);
    return true;
  }
  if (biome === BIOME_DARK_FOREST && tr >= 0.82 && tr < 0.86) {
    paleOakTree(seed, x, y, z, tr, set);
    return true;
  }
  return false;
}

/** Árbol de un brote de la fase 6.5 (kind = posición en WOOD_TYPES); false si no es de una madera nueva. */
export function growWoodTree(seed: number, kind: number, x: number, y: number, z: number, r: number, set: SetBlock): boolean {
  if (kind === kindOf('mangrove')) {
    // Desde un propágulo las raíces sólo llegan hasta el suelo del brote.
    mangroveTree(seed, x, y, z, r, set, () => y - 1);
    return true;
  }
  if (kind === kindOf('pale_oak')) {
    paleOakTree(seed, x, y, z, r, set);
    return true;
  }
  return false;
}

/** Hojas de un tallo de bambú según su distancia a la punta (0 = la punta). */
const leavesFromTop = (k: number) => (k < 2 ? 2 : k === 2 ? 1 : 0);

/** Rodales de bambú en las junglas (dentro del chunk: el bambú no cruza bordes). */
export function placeBamboo(
  seed: number, blocks: Uint16Array, tops: Int16Array, biomes: (lx: number, lz: number) => number, x0: number, z0: number,
): void {
  const n = regionNoise(seed);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      // Fase 7.6: la jungla de bambú está llena; las demás junglas, a rodales.
      const b = biomes(lx, lz);
      if (baseBiome(b) !== BIOME_JUNGLE) continue;
      const wx = x0 + lx, wz = z0 + lz;
      const dense = b === BIOME_BAMBOO_JUNGLE;
      if (!dense && n.noise2(wx / 26 + 300, wz / 26) < 0.3) continue;
      if (hashToFloat(hash2(wx, wz, seed ^ 0xba3b)) > (dense ? 0.55 : 0.3)) continue;
      const top = tops[lz * 16 + lx];
      if (top >= MAX_Y - 18 || blocks[blockIndex(lx, top, lz)] !== GRASS) continue;
      const above = blocks[blockIndex(lx, top + 1, lz)];
      if (above !== AIR && above !== SHORT_GRASS && above !== FERN) continue;
      const h = 4 + (hash2(wx, wz, seed ^ 0xba3c) % 11);
      for (let k = 0; k < h; k++) {
        const i = blockIndex(lx, top + 1 + k, lz);
        if (k > 0 && blocks[i] !== AIR) break;
        blocks[i] = BAMBOO + leavesFromTop(h - 1 - k);
      }
    }
  }
}
