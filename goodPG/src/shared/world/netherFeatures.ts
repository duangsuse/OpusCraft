// Fase 8.2 (biomas del Nether): las features de los biomas del Nether, portadas del código de la 26.3
// (levelgen/feature) con los datos de data/minecraft/worldgen (feature y placed_feature). Cada una trabaja
// sobre un FeatureLevel (el generador, sobre los chunks base de alrededor; el servidor, sobre el mundo: los
// hongos que crecen con polvo de hueso y lo que pone el polvo de hueso en el necelio).
import {
  AIR, BEDROCK, NETHERRACK, LAVA, GLOWSTONE, FIRE, SOUL_FIRE, SOUL_SOIL, SOUL_SAND, GRAVEL, MAGMA_BLOCK, BLACKSTONE,
  BASALT, NETHER_GOLD_ORE, NETHER_QUARTZ_ORE, NETHER_BRICKS, NETHER_BRICK_FENCE, STAIRS, BROWN_MUSHROOM, RED_MUSHROOM,
  CRIMSON_NYLIUM, WARPED_NYLIUM, CRIMSON_FUNGUS, WARPED_FUNGUS, CRIMSON_ROOTS, WARPED_ROOTS, NETHER_SPROUTS, CRIMSON_STEM,
  WARPED_STEM, NETHER_WART_BLOCK, WARPED_WART_BLOCK, SHROOMLIGHT, WEEPING_VINES, WEEPING_VINES_PLANT, TWISTING_VINES,
  TWISTING_VINES_PLANT, BLOCK_REPLACEABLE, BLOCK_SOLID, BLOCK_RENDER, R_CROSS, BLOCK_FLUID, CHEST, MOB_SPAWNER, blockSupported,
  vineHead, isCrop, familyBase, ANCIENT_DEBRIS,
} from '../blocks';
import {
  BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
} from './biomeIds';
import type { NoiseRandom } from './javaNoise';

/** Donde trabaja una feature. */
export interface FeatureLevel {
  /** Id del bloque, o -1 si no se puede leer (fuera de la zona o del mundo). */
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
  biome(x: number, z: number): number;
  /** Rompe el bloque soltando lo suyo (el hongo gigante plantado). */
  destroy?(x: number, y: number, z: number): void;
  /** Programa la actualización del fluido de (x, y, z) (los manantiales de lava corren al cargarse). */
  fluidTick?(x: number, y: number, z: number): void;
}

/** Profundidad de generación del Nether (getGenDepth). */
const GEN_DEPTH = 128;
const MIN_Y = 0, MAX_Y = 127;

// ------------------------------------------------------------------ enteros al azar (IntProvider)

const uniform = (r: NoiseRandom, a: number, b: number) => a + r.nextInt(b - a + 1);
/** TrapezoidInt simétrico con meseta 0 (triangle): diferencia de dos uniformes. */
const triangle = (r: NoiseRandom, m: number) => r.nextInt(m + 1) - r.nextInt(m + 1);
/** TrapezoidInt(min, max, meseta). */
function trapezoid(r: NoiseRandom, min: number, max: number, plateau: number): number {
  if (plateau === 0 && max === -min) return triangle(r, max);
  const range = max - min;
  if (plateau === range) return uniform(r, min, max);
  const start = (range - plateau) >> 1, end = range - start;
  return min + uniform(r, 0, end) + uniform(r, 0, start);
}
/** BiasedToBottomInt. */
const biasedToBottom = (r: NoiseRandom, a: number, b: number) => a + r.nextInt(r.nextInt(b - a + 1) + 1);

// ------------------------------------------------------------------ bloques

const isAir = (id: number) => id === AIR;
/** Vacío para count_on_every_layer: aire, agua o lava. */
const isEmptyLayer = (id: number) => id === AIR || (id > 0 && BLOCK_FLUID[id] > 0);
/** canBeReplaced de Java (aire, fluidos, plantas que se sustituyen). */
const canBeReplaced = (id: number) => id === AIR || (id > 0 && BLOCK_REPLACEABLE[id] === 1);
/** Plantas que el hongo gigante sustituye (replaceable_blocks del hongo: brotes, flores, cultivos, enredaderas…). */
function hugeFungusReplaces(id: number): boolean {
  if (id <= 0) return false;
  if (BLOCK_RENDER[id] === R_CROSS || isCrop(id)) return true;
  const b = familyBase(id);
  return b === WEEPING_VINES || b === WEEPING_VINES_PLANT || b === TWISTING_VINES || b === TWISTING_VINES_PLANT;
}

/** ¿Se sostiene `id` en (x, y, z)? (canSurvive, para simple_block). */
function survives(l: FeatureLevel, x: number, y: number, z: number, id: number): boolean {
  const get = (dx: number, dy: number, dz: number) => l.get(x + dx, y + dy, z + dz);
  if (id === BROWN_MUSHROOM || id === RED_MUSHROOM) {
    // En el Nether (poca luz) basta un bloque sólido debajo.
    const b = get(0, -1, 0);
    return b > 0 && BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS;
  }
  return blockSupported(id, get);
}

// ------------------------------------------------------------------ features

/** SpringFeature: un manantial de lava si alrededor hay tantos bloques válidos y tantos huecos. */
function spring(l: FeatureLevel, x: number, y: number, z: number, valid: ReadonlySet<number>, rocks: number, holes: number, needBelow: boolean): void {
  if (!valid.has(l.get(x, y + 1, z))) return;
  if (needBelow && !valid.has(l.get(x, y - 1, z))) return;
  const cur = l.get(x, y, z);
  if (cur !== AIR && !valid.has(cur)) return;
  let rock = 0, hole = 0;
  for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]]) {
    const b = l.get(x + dx, y + dy, z + dz);
    if (valid.has(b)) rock++;
    if (b === AIR) hole++;
  }
  if (rock === rocks && hole === holes) {
    l.set(x, y, z, LAVA);
    l.fluidTick?.(x, y, z);
  }
}

/** RandomNeighborSpreadFeature (la piedra luminosa y las verrugas del techo). */
function neighborSpread(
  l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, block: number, accepted: ReadonlySet<number>, attempts: number,
  xz: () => number, dy: () => number,
): void {
  l.set(x, y, z, block);
  for (let i = 0; i < attempts; i++) {
    const px = x + xz(), py = y + dy(), pz = z + xz();
    if (!isAir(l.get(px, py, pz))) continue;
    let n = 0;
    for (const [ax, ay, az] of NEIGHBORS6) {
      if (accepted.has(l.get(px + ax, py + ay, pz + az))) n++;
      if (n > 1) break;
    }
    if (n === 1) l.set(px, py, pz, block);
  }
  void r;
}
const NEIGHBORS6: readonly (readonly [number, number, number])[] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

/** OreFeature de Java (sin descarte al aire, como las menas del Nether). */
function ore(l: FeatureLevel, r: NoiseRandom, ox: number, oy: number, oz: number, size: number, target: number, state: number): void {
  const dir = r.nextFloat() * Math.PI;
  const spreadXY = size / 8;
  const maxRadius = Math.ceil((size / 16 * 2 + 1) / 2);
  const x0 = ox + Math.sin(dir) * spreadXY, x1 = ox - Math.sin(dir) * spreadXY;
  const z0 = oz + Math.cos(dir) * spreadXY, z1 = oz - Math.cos(dir) * spreadXY;
  const y0 = oy + r.nextInt(3) - 2, y1 = oy + r.nextInt(3) - 2;
  const xStart = ox - Math.ceil(spreadXY) - maxRadius, yStart = oy - 2 - maxRadius, zStart = oz - Math.ceil(spreadXY) - maxRadius;
  const sizeXZ = 2 * (Math.ceil(spreadXY) + maxRadius), sizeY = 2 * (2 + maxRadius);
  const data = new Float64Array(size * 4);
  for (let i = 0; i < size; i++) {
    const step = i / size;
    const ss = r.nextDouble() * size / 16;
    const rad = ((Math.sin(Math.PI * step) + 1) * ss + 1) / 2;
    data[i * 4] = x0 + step * (x1 - x0);
    data[i * 4 + 1] = y0 + step * (y1 - y0);
    data[i * 4 + 2] = z0 + step * (z1 - z0);
    data[i * 4 + 3] = rad;
  }
  for (let i1 = 0; i1 < size - 1; i1++) {
    if (data[i1 * 4 + 3] <= 0) continue;
    for (let i2 = i1 + 1; i2 < size; i2++) {
      if (data[i2 * 4 + 3] <= 0) continue;
      const dx = data[i1 * 4] - data[i2 * 4], dy = data[i1 * 4 + 1] - data[i2 * 4 + 1], dz = data[i1 * 4 + 2] - data[i2 * 4 + 2];
      const dr = data[i1 * 4 + 3] - data[i2 * 4 + 3];
      if (dr * dr > dx * dx + dy * dy + dz * dz) {
        if (dr > 0) data[i2 * 4 + 3] = -1;
        else data[i1 * 4 + 3] = -1;
      }
    }
  }
  const tested = new Uint8Array((sizeXZ + 1) * (sizeY + 1) * (sizeXZ + 1));
  for (let i = 0; i < size; i++) {
    const rad = data[i * 4 + 3];
    if (rad < 0) continue;
    const xx = data[i * 4], yy = data[i * 4 + 1], zz = data[i * 4 + 2];
    const xMin = Math.max(Math.floor(xx - rad), xStart), yMin = Math.max(Math.floor(yy - rad), yStart), zMin = Math.max(Math.floor(zz - rad), zStart);
    const xMax = Math.max(Math.floor(xx + rad), xMin), yMax = Math.max(Math.floor(yy + rad), yMin), zMax = Math.max(Math.floor(zz + rad), zMin);
    for (let x = xMin; x <= xMax; x++) {
      const xd = (x + 0.5 - xx) / rad;
      if (xd * xd >= 1) continue;
      for (let y = yMin; y <= yMax; y++) {
        const yd = (y + 0.5 - yy) / rad;
        if (xd * xd + yd * yd >= 1) continue;
        for (let z = zMin; z <= zMax; z++) {
          const zd = (z + 0.5 - zz) / rad;
          if (xd * xd + yd * yd + zd * zd >= 1 || y < MIN_Y || y > MAX_Y) continue;
          const bit = x - xStart + (y - yStart) * (sizeXZ + 1) + (z - zStart) * (sizeXZ + 1) * (sizeY + 1);
          if (tested[bit]) continue;
          tested[bit] = 1;
          if (l.get(x, y, z) === target) l.set(x, y, z, state);
        }
      }
    }
  }
}

/** Posiciones dentro de una caja por distancia de Manhattan creciente hasta `limit` (withinBoxByManhattanDistance + break). */
function* manhattan(x: number, y: number, z: number, rx: number, ry: number, rz: number, limit: number): Generator<[number, number, number]> {
  for (let d = 0; d <= limit; d++) {
    for (let dy = -Math.min(ry, d); dy <= Math.min(ry, d); dy++) {
      const rem = d - Math.abs(dy);
      for (let dx = -Math.min(rx, rem); dx <= Math.min(rx, rem); dx++) {
        const dz = rem - Math.abs(dx);
        if (dz > rz) continue;
        yield [x + dx, y + dy, z + dz];
        if (dz !== 0) yield [x + dx, y + dy, z - dz];
      }
    }
  }
}

/** ReplaceBlobsFeature (manchas de basalto y de piedra negra en la rocanegra). */
function replaceBlobs(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, target: number, state: number): void {
  let cy = Math.max(MIN_Y + 1, Math.min(MAX_Y, y));
  while (cy > MIN_Y + 1 && l.get(x, cy, z) !== target) cy--;
  if (cy <= MIN_Y + 1) return;
  const rx = uniform(r, 3, 7), ry = uniform(r, 3, 7), rz = uniform(r, 3, 7);
  const max = Math.max(rx, ry, rz);
  for (const [px, py, pz] of manhattan(x, cy, z, rx, ry, rz, max)) if (l.get(px, py, pz) === target) l.set(px, py, pz, state);
}

/** Bloques que las deltas y las columnas no tocan (CANNOT_REPLACE de DeltaFeature y cannot_place_basalt_pillar_on). */
function deltaCannotReplace(id: number): boolean {
  return id === BEDROCK || id === NETHER_BRICKS || id === NETHER_BRICK_FENCE || familyBase(id) === STAIRS.nether_brick ||
    familyBase(id) === CHEST || id === MOB_SPAWNER;
}
const cannotPlaceBasaltOn = (id: number) => id === LAVA || id === MAGMA_BLOCK || id === SOUL_SAND || deltaCannotReplace(id);

/** DeltaFeature: charcas de lava con borde de magma sobre el suelo. */
function delta(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number): void {
  const spawnRim = r.nextDouble() < 0.9;
  const rimX = spawnRim ? uniform(r, 0, 2) : 0, rimZ = spawnRim ? uniform(r, 0, 2) : 0;
  const hasRim = spawnRim && rimX !== 0 && rimZ !== 0;
  const radX = uniform(r, 3, 7), radZ = uniform(r, 3, 7);
  const isClear = (px: number, py: number, pz: number) => {
    const s = l.get(px, py, pz);
    if (s === LAVA || s < 0 || deltaCannotReplace(s)) return false;
    for (const [dx, dy, dz] of NEIGHBORS6) {
      const air = l.get(px + dx, py + dy, pz + dz) === AIR;
      if ((air && dy !== 1) || (!air && dy === 1)) return false;
    }
    return true;
  };
  for (const [px, py, pz] of manhattan(x, y, z, radX, 0, radZ, Math.max(radX, radZ))) {
    if (!isClear(px, py, pz)) continue;
    if (hasRim) l.set(px, py, pz, MAGMA_BLOCK);
    if (isClear(px + rimX, py, pz + rimZ)) l.set(px + rimX, py, pz + rimZ, LAVA);
  }
}

/** SteppedColumnClusterFeature (columnas de basalto): `large` elige la configuración grande. */
function columnCluster(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, large: boolean): void {
  // weighted_random_selector 9:1 entre las dos configuraciones.
  const wide = r.nextInt(10) === 9;
  const reachCfg = wide ? 8 : 5, countCfg = wide ? 15 : 50;
  const canReplace = (px: number, py: number, pz: number) => {
    const b = l.get(px, py, pz);
    return b === AIR || (b === LAVA && py <= 32);
  };
  const canPlaceAt = (px: number, py: number, pz: number) => {
    if (!canReplace(px, py, pz)) return false;
    const below = l.get(px, py - 1, pz);
    return below > 0 && below !== AIR && !cannotPlaceBasaltOn(below);
  };
  if (!canPlaceAt(x, y, z)) return;
  const columnHeight = large ? uniform(r, 5, 10) : uniform(r, 1, 4);
  const clusterReach = Math.min(columnHeight, reachCfg);
  for (let n = 0; n < countCfg; n++) {
    const px = uniform(r, x - clusterReach, x + clusterReach), pz = uniform(r, z - clusterReach, z + clusterReach);
    const toPlace = columnHeight - (Math.abs(px - x) + Math.abs(pz - z));
    if (toPlace < 0) continue;
    const reach = large ? uniform(r, 2, 3) : 1;
    for (let cx = px - reach; cx <= px + reach; cx++) {
      for (let cz = pz - reach; cz <= pz + reach; cz++) {
        const stepLimit = Math.abs(cx - px) + Math.abs(cz - pz);
        let cy = y;
        let found = false;
        if (canReplace(cx, cy, cz)) {
          // findSurface: baja hasta un sitio donde apoyarse.
          for (let lim = stepLimit; cy > MIN_Y + 1 && lim > 0; lim--, cy--) {
            if (canPlaceAt(cx, cy, cz)) {
              found = true;
              break;
            }
          }
        } else {
          // findAir: sube hasta el aire.
          for (let lim = stepLimit; cy <= MAX_Y && lim > 0; lim--, cy++) {
            const b = l.get(cx, cy, cz);
            if (cannotPlaceBasaltOn(b)) break;
            if (b === AIR) {
              found = true;
              break;
            }
          }
        }
        if (!found) continue;
        for (let h = toPlace - (stepLimit >> 1); h >= 0; h--) {
          if (canReplace(cx, cy, cz)) {
            l.set(cx, cy, cz, BASALT);
            cy++;
          } else if (l.get(cx, cy, cz) === BASALT) cy++;
          else break;
        }
      }
    }
  }
}

/** El pilar de basalto del valle de almas (basalt_pillar: un pilar que cuelga y sus cuatro vecinos). */
function basaltPillar(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number): void {
  // Pilar principal hasta el suelo, con su pie.
  let py = y;
  while (py >= MIN_Y && l.get(x, py, z) === AIR) {
    l.set(x, py, z, BASALT);
    py--;
  }
  const by = py + 1; // el último basalto puesto
  // projected_random_patchy_square de 3 en el suelo (una fila más abajo), cayendo hasta 3 por el aire.
  const size = 3, bound = size * size + 1;
  for (let dx = -size; dx <= size; dx++) {
    for (let dz = -size; dz <= size; dz++) {
      if (r.nextInt(bound) >= bound - Math.abs(dx) * Math.abs(dz)) continue;
      let qy = by - 1;
      for (let drop = 3; l.get(x + dx, qy - 1, z + dz) === AIR; ) {
        qy--;
        if (--drop <= 0) break;
      }
      const below = l.get(x + dx, qy - 1, z + dz);
      if (below > 0 && below !== AIR) l.set(x + dx, qy, z + dz, BASALT);
    }
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (r.nextInt(2) === 0) l.set(x + dx, by, z + dz, BASALT);
  // Los cuatro pilares de al lado, que se cortan al azar (90 % cada paso).
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let qy = y;
    while (qy >= MIN_Y && l.get(x + dx, qy, z + dz) === AIR && r.nextFloat() < 0.9) {
      l.set(x + dx, qy, z + dz, BASALT);
      qy--;
    }
  }
}

/** BlockColumnFeature de las enredaderas del Nether (el tallo y la punta, recortado si no cabe). */
export function vineColumn(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, down: boolean, minH: number, maxH: number): boolean {
  // createVines de NetherFeatures: la altura del tallo sale de una lista con pesos 10/2/3.
  const w = r.nextInt(15);
  let body = w < 10 ? uniform(r, minH - 1, maxH - 1) : w < 12 ? uniform(r, minH, maxH * 2 - 1) : minH - 1;
  let tip = 1;
  const total = body + tip;
  const dir = down ? -1 : 1;
  for (let k = 0; k < total; k++) {
    if (l.get(x, y + dir * (k + 1), z) !== AIR) {
      // truncate con prioridad a la punta: se quita primero del tallo.
      let remove = total - k;
      const cut = Math.min(body, remove);
      body -= cut;
      remove -= cut;
      tip -= Math.min(tip, remove);
      break;
    }
  }
  const age = uniform(r, 17, 25);
  let cy = y;
  for (let k = 0; k < body; k++, cy += dir) l.set(x, cy, z, down ? WEEPING_VINES_PLANT : TWISTING_VINES_PLANT);
  if (tip) l.set(x, cy, z, vineHead(down ? WEEPING_VINES : TWISTING_VINES, age));
  return body + tip > 0;
}

// ------------------------------------------------------------------ hongo gigante

/**
 * HugeFungusFeature: el hongo gigante carmesí o distorsionado sobre su necelio. `planted`: el que crece con
 * polvo de hueso (sin límite de altura ni variante enorme; rompe lo que estorbe soltándolo).
 */
export function hugeFungus(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, warped: boolean, planted: boolean): boolean {
  const base = warped ? WARPED_NYLIUM : CRIMSON_NYLIUM;
  if (l.get(x, y - 1, z) !== base) return false;
  let h = uniform(r, 4, 13);
  if (r.nextInt(12) === 0) h *= 2;
  if (!planted && y + h + 1 >= GEN_DEPTH) return false;
  const huge = !planted && r.nextFloat() < 0.06;
  const stem = warped ? WARPED_STEM : CRIMSON_STEM, hat = warped ? WARPED_WART_BLOCK : NETHER_WART_BLOCK;
  const replaceable = (px: number, py: number, pz: number, plants: boolean) => {
    const b = l.get(px, py, pz);
    return b >= 0 && (canBeReplaced(b) || (plants && hugeFungusReplaces(b)));
  };
  const clear = (px: number, py: number, pz: number) => {
    if (planted && l.get(px, py - 1, pz) !== AIR) l.destroy?.(px, py, pz);
  };
  l.set(x, y, z, AIR);
  // Tallo (el enorme, de 3×3 con las esquinas a veces).
  const sr = huge ? 1 : 0;
  for (let dx = -sr; dx <= sr; dx++) {
    for (let dz = -sr; dz <= sr; dz++) {
      const corner = huge && Math.abs(dx) === sr && Math.abs(dz) === sr;
      for (let dy = 0; dy < h; dy++) {
        const px = x + dx, py = y + dy, pz = z + dz;
        if (!replaceable(px, py, pz, true)) continue;
        if (planted) {
          clear(px, py, pz);
          l.set(px, py, pz, stem);
        } else if (corner) {
          if (r.nextFloat() < 0.1) l.set(px, py, pz, stem);
        } else l.set(px, py, pz, stem);
      }
    }
  }
  // Sombrero.
  const vines = !warped;
  const hatHeight = Math.min(r.nextInt(1 + Math.floor(h / 3)) + 5, h);
  const hatStart = h - hatHeight;
  const weeping = (px: number, py: number, pz: number) => {
    if (l.get(px, py - 1, pz) !== AIR) return;
    let goal = uniform(r, 1, 5);
    if (r.nextInt(7) === 0) goal *= 2;
    for (let k = 0, cy = py - 1; k <= goal; k++, cy--) {
      if (l.get(px, cy, pz) !== AIR) continue;
      if (k === goal || l.get(px, cy - 1, pz) !== AIR) {
        l.set(px, cy, pz, vineHead(WEEPING_VINES, uniform(r, 23, 25)));
        break;
      }
      l.set(px, cy, pz, WEEPING_VINES_PLANT);
    }
  };
  const hatBlock = (px: number, py: number, pz: number, decor: number, hatP: number, vineP: number) => {
    if (r.nextFloat() < decor) l.set(px, py, pz, SHROOMLIGHT);
    else if (r.nextFloat() < hatP) {
      l.set(px, py, pz, hat);
      if (r.nextFloat() < vineP) weeping(px, py, pz);
    }
  };
  for (let dy = hatStart; dy <= h; dy++) {
    let radius = dy < h - r.nextInt(3) ? 2 : 1;
    if (hatHeight > 8 && dy < hatStart + 4) radius = 3;
    if (huge) radius++;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const edgeX = dx === -radius || dx === radius, edgeZ = dz === -radius || dz === radius;
        const inside = !edgeX && !edgeZ && dy !== h;
        const corner = edgeX && edgeZ;
        const bottom = dy < hatStart + 3;
        const px = x + dx, py = y + dy, pz = z + dz;
        if (!replaceable(px, py, pz, false)) continue;
        clear(px, py, pz);
        if (bottom) {
          if (inside) continue;
          // placeHatDropBlock: cuelga del sombrero.
          if (l.get(px, py - 1, pz) === hat) l.set(px, py, pz, hat);
          else if (r.nextFloat() < 0.15) {
            l.set(px, py, pz, hat);
            if (vines && r.nextInt(11) === 0) weeping(px, py, pz);
          }
        } else if (inside) hatBlock(px, py, pz, 0.1, 0.2, vines ? 0.1 : 0);
        else if (corner) hatBlock(px, py, pz, 0.01, 0.7, vines ? 0.083 : 0);
        else hatBlock(px, py, pz, 0.0005, 0.98, vines ? 0.07 : 0);
      }
    }
  }
  return true;
}

// ------------------------------------------------------------------ vegetación de los bosques

const CRIMSON_VEGETATION: readonly (readonly [number, number])[] = [[CRIMSON_ROOTS, 87], [CRIMSON_FUNGUS, 11], [WARPED_FUNGUS, 1]];
const WARPED_VEGETATION: readonly (readonly [number, number])[] = [[WARPED_ROOTS, 85], [CRIMSON_ROOTS, 1], [WARPED_FUNGUS, 13], [CRIMSON_FUNGUS, 1]];
function weighted(r: NoiseRandom, list: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (const [, w] of list) total += w;
  let k = r.nextInt(total);
  for (const [id, w] of list) {
    if ((k -= w) < 0) return id;
  }
  return list[0][0];
}

/** simple_block con comprobación de apoyo. */
function simpleBlock(l: FeatureLevel, x: number, y: number, z: number, id: number): void {
  if (survives(l, x, y, z, id)) l.set(x, y, z, id);
}

/**
 * Polvo de hueso en el necelio (NetherFeatures.NYLIUM_BONEMEAL): 9 intentos de vegetación de su bosque
 * (a ±2 en triángulo) y, en el distorsionado, además 9 de brotes y a veces (1 de cada 8) enredaderas
 * retorcidas. `x, y, z` es la celda de encima del necelio.
 */
export function nyliumBonemeal(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number): void {
  const below = l.get(x, y - 1, z);
  const spread = (place: (px: number, py: number, pz: number) => void) => {
    for (let k = 0; k < 9; k++) {
      const px = x + triangle(r, 2), pz = z + triangle(r, 2);
      if (l.get(px, y, pz) === AIR) place(px, y, pz);
    }
  };
  if (below === CRIMSON_NYLIUM) spread((px, py, pz) => simpleBlock(l, px, py, pz, weighted(r, CRIMSON_VEGETATION)));
  else if (below === WARPED_NYLIUM) {
    spread((px, py, pz) => simpleBlock(l, px, py, pz, weighted(r, WARPED_VEGETATION)));
    spread((px, py, pz) => simpleBlock(l, px, py, pz, NETHER_SPROUTS));
    if (r.nextInt(8) === 0) twistingVinesSpread(l, r, x, y, z, 3, 1, 1, 2);
  }
}

const TWISTING_BASE = new Set([NETHERRACK, WARPED_NYLIUM, WARPED_WART_BLOCK]);
/** spreadTwistingVines: enredaderas retorcidas repartidas alrededor de (x, y, z) sobre su suelo. */
function twistingVinesSpread(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, w: number, h: number, minH: number, maxH: number): void {
  const ok = (px: number, py: number, pz: number) => l.get(px, py, pz) === AIR && TWISTING_BASE.has(l.get(px, py - 1, pz));
  if (!ok(x, y, z)) return;
  for (let k = 0; k < w * w; k++) {
    const px = x + uniform(r, -w, w), pz = z + uniform(r, -w, w);
    let py = y + uniform(r, -h, h) - 1;
    // environment_scan hacia abajo (32) buscando algo que no sea aire; luego uno arriba.
    let found = false;
    for (let s = 0; s < 32 && py >= MIN_Y; s++, py--) {
      const b = l.get(px, py, pz);
      if (b < 0) break;
      if (b !== AIR) {
        found = true;
        break;
      }
    }
    if (!found) continue;
    if (ok(px, py + 1, pz)) vineColumn(l, r, px, py + 1, pz, false, minH, maxH);
  }
}

// ------------------------------------------------------------------ decoración de un chunk

/** Heightmap MOTION_BLOCKING del Nether: la celda de encima del techo de lecho de roca. */
function motionTop(l: FeatureLevel, x: number, z: number): number {
  let y = MAX_Y;
  while (y > MIN_Y && l.get(x, y, z) === AIR) y--;
  return y + 1;
}

/** count_on_every_layer: por cada capa de suelo (de arriba abajo), `count` columnas al azar. */
function* everyLayer(l: FeatureLevel, r: NoiseRandom, cx: number, cz: number, count: number): Generator<[number, number, number]> {
  for (let layer = 0; ; layer++) {
    let any = false;
    for (let i = 0; i < count; i++) {
      const x = cx * 16 + r.nextInt(16), z = cz * 16 + r.nextInt(16);
      const start = motionTop(l, x, z);
      let n = 0, cur = l.get(x, start, z);
      let found = -1;
      for (let y = start; y >= MIN_Y + 1; y--) {
        const below = l.get(x, y - 1, z);
        if (!isEmptyLayer(below) && isEmptyLayer(cur) && below !== BEDROCK) {
          if (n === layer) {
            found = y;
            break;
          }
          n++;
        }
        cur = below;
      }
      if (found >= 0) {
        any = true;
        yield [x, found, z];
      }
    }
    if (!any) return;
  }
}

/** Posición al azar en el chunk (in_square) con la altura uniforme entre `lo` y `hi`. */
function square(r: NoiseRandom, cx: number, cz: number, lo: number, hi: number): [number, number, number] {
  const x = cx * 16 + r.nextInt(16), z = cz * 16 + r.nextInt(16);
  return [x, uniform(r, lo, hi), z];
}

const SPRING_NETHER = new Set([NETHERRACK]);
const SPRING_DELTA = new Set([NETHERRACK, SOUL_SAND, GRAVEL, MAGMA_BLOCK, BLACKSTONE]);
const GLOWSTONE_CEILING = new Set([NETHERRACK, BASALT, BLACKSTONE]);
const GLOWSTONE_ONLY = new Set([GLOWSTONE]);
const WART_CEILING = new Set([NETHERRACK, NETHER_WART_BLOCK]);

type FeatureFn = (l: FeatureLevel, r: NoiseRandom, cx: number, cz: number) => void;

/** Parche: 96 intentos a ±7 (en horizontal) y ±3 (en vertical) alrededor de (x, y, z). */
function patch(l: FeatureLevel, r: NoiseRandom, x: number, y: number, z: number, place: (px: number, py: number, pz: number) => void): void {
  for (let k = 0; k < 96; k++) {
    const px = x + trapezoid(r, -7, 7, 0), py = y + trapezoid(r, -3, 3, 0), pz = z + trapezoid(r, -7, 7, 0);
    place(px, py, pz);
  }
}

const inBiome = (l: FeatureLevel, x: number, z: number, biomes: readonly number[]) => biomes.includes(l.biome(x, z));
const ALL = [BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS];
const NOT_DELTAS = [BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST];
const SOUL_FIRE_BIOMES = [BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS];

/** Fase 8.5: piedra base del Nether (la etiqueta base_stone_nether: rocanegra, basalto y piedra negra). */
const BASE_STONE_NETHER = new Set([NETHERRACK, BASALT, BLACKSTONE]);

/**
 * Fase 8.5: ScatteredOreFeature de Java (los escombros ancestrales): hasta `size` bloques sueltos alrededor del
 * origen, cada vez más separados; como descartan todos los que tocan aire, sólo salen enterrados.
 */
function scatteredOre(l: FeatureLevel, r: NoiseRandom, ox: number, oy: number, oz: number, size: number, state: number): void {
  const n = r.nextInt(size + 1);
  const off = (j: number) => Math.round((r.nextFloat() - r.nextFloat()) * j);
  for (let j = 0; j < n; j++) {
    const k = Math.min(j, 7);
    const x = ox + off(k), y = oy + off(k), z = oz + off(k);
    if (!BASE_STONE_NETHER.has(l.get(x, y, z))) continue;
    if (NEIGHBORS6.some(([dx, dy, dz]) => l.get(x + dx, y + dy, z + dz) === AIR)) continue;
    l.set(x, y, z, state);
  }
}

/** Fase 8.5: los dos yacimientos de escombros ancestrales de cada chunk (en todo el Nether). */
const ancientDebris: FeatureFn = (l, r, cx, cz) => {
  // Grande: 3 bloques, altura trapezoidal entre 8 y 24 (sin meseta: la suma de dos al azar).
  let x = cx * 16 + r.nextInt(16), z = cz * 16 + r.nextInt(16);
  let y = 8 + r.nextInt(9) + r.nextInt(9);
  scatteredOre(l, r, x, y, z, 3, ANCIENT_DEBRIS);
  // Pequeño: 2 bloques, de 8 a 119 por igual.
  x = cx * 16 + r.nextInt(16);
  z = cz * 16 + r.nextInt(16);
  y = uniform(r, 8, 119);
  scatteredOre(l, r, x, y, z, 2, ANCIENT_DEBRIS);
};

/** Ore con su recuento y su altura, sólo en esos biomas. */
function oreFeature(count: number, lo: number, hi: number, size: number, target: number, state: number, biomes: readonly number[]): FeatureFn {
  return (l, r, cx, cz) => {
    for (let i = 0; i < count; i++) {
      const [x, y, z] = square(r, cx, cz, lo, hi);
      if (inBiome(l, x, z, biomes)) ore(l, r, x, y, z, size, target, state);
    }
  };
}

function springFeature(count: number, lo: number, hi: number, valid: ReadonlySet<number>, rocks: number, holes: number, below: boolean, biomes: readonly number[]): FeatureFn {
  return (l, r, cx, cz) => {
    for (let i = 0; i < count; i++) {
      const [x, y, z] = square(r, cx, cz, lo, hi);
      if (inBiome(l, x, z, biomes)) spring(l, x, y, z, valid, rocks, holes, below);
    }
  };
}

/** Parche de fuego (o de fuego de alma) sobre rocanegra (o tierra de alma). */
function firePatch(fire: number, ground: number, biomes: readonly number[]): FeatureFn {
  return (l, r, cx, cz) => {
    const n = uniform(r, 0, 5);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = square(r, cx, cz, 4, 123);
      if (!inBiome(l, x, z, biomes)) continue;
      patch(l, r, x, y, z, (px, py, pz) => {
        if (l.get(px, py, pz) === AIR && l.get(px, py - 1, pz) === ground) l.set(px, py, pz, fire);
      });
    }
  };
}

function mushroomPatch(id: number, biomes: readonly number[]): FeatureFn {
  return (l, r, cx, cz) => {
    if (r.nextInt(2) !== 0) return; // rarity_filter 2
    const [x, y, z] = square(r, cx, cz, 0, 127);
    if (!inBiome(l, x, z, biomes)) return;
    patch(l, r, x, y, z, (px, py, pz) => {
      if (l.get(px, py, pz) === AIR) simpleBlock(l, px, py, pz, id);
    });
  };
}

function glowstoneFeature(extra: boolean): FeatureFn {
  return (l, r, cx, cz) => {
    const n = extra ? biasedToBottom(r, 0, 9) : 10;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = extra ? square(r, cx, cz, 4, 123) : square(r, cx, cz, 0, 127);
      if (l.get(x, y, z) !== AIR || !GLOWSTONE_CEILING.has(l.get(x, y + 1, z)) || !inBiome(l, x, z, ALL)) continue;
      neighborSpread(l, r, x, y, z, GLOWSTONE, GLOWSTONE_ONLY, 1500, () => triangle(r, 7), () => uniform(r, -11, 0));
    }
  };
}

/** Vegetación de un bosque: `perLayer` columnas por capa, y en cada una 64 intentos alrededor. */
function forestVegetation(perLayer: number, biome: number, pick: (r: NoiseRandom) => number): FeatureFn {
  return (l, r, cx, cz) => {
    for (const [x, y, z] of everyLayer(l, r, cx, cz, perLayer)) {
      if (l.biome(x, z) !== biome) continue;
      const below = l.get(x, y - 1, z);
      if (below !== CRIMSON_NYLIUM && below !== WARPED_NYLIUM) continue;
      for (let k = 0; k < 64; k++) {
        const px = x + trapezoid(r, -7, 7, 0), py = y + trapezoid(r, -3, 3, 0), pz = z + trapezoid(r, -7, 7, 0);
        if (l.get(px, py, pz) === AIR) simpleBlock(l, px, py, pz, pick(r));
      }
    }
  };
}

/**
 * Features de cada paso de la decoración (GenerationStep) en el orden global de Java; cada una comprueba el
 * bioma donde cae (el filtro «biome»).
 */
const STEPS: readonly (readonly FeatureFn[])[] = [
  // 2 (modificaciones locales): pilares de basalto del valle de almas.
  [(l, r, cx, cz) => {
    for (let i = 0; i < 10; i++) {
      const [x, y, z] = square(r, cx, cz, 0, 127);
      if (l.get(x, y, z) !== AIR || l.get(x, y + 1, z) === AIR || l.biome(x, z) !== BIOME_SOUL_SAND_VALLEY) continue;
      basaltPillar(l, r, x, y, z);
    }
  }],
  // 4 (estructuras de superficie): deltas y columnas de basalto.
  [
    (l, r, cx, cz) => {
      for (const [x, y, z] of everyLayer(l, r, cx, cz, 40)) if (l.biome(x, z) === BIOME_BASALT_DELTAS) delta(l, r, x, y, z);
    },
    (l, r, cx, cz) => {
      for (const [x, y, z] of everyLayer(l, r, cx, cz, 4)) if (l.biome(x, z) === BIOME_BASALT_DELTAS) columnCluster(l, r, x, y, z, false);
    },
    (l, r, cx, cz) => {
      for (const [x, y, z] of everyLayer(l, r, cx, cz, 2)) if (l.biome(x, z) === BIOME_BASALT_DELTAS) columnCluster(l, r, x, y, z, true);
    },
  ],
  // 7 (decoración subterránea).
  [
    (l, r, cx, cz) => {
      for (let i = 0; i < 75; i++) {
        const [x, y, z] = square(r, cx, cz, 0, 127);
        if (l.biome(x, z) === BIOME_BASALT_DELTAS) replaceBlobs(l, r, x, y, z, NETHERRACK, BASALT);
      }
    },
    (l, r, cx, cz) => {
      for (let i = 0; i < 25; i++) {
        const [x, y, z] = square(r, cx, cz, 0, 127);
        if (l.biome(x, z) === BIOME_BASALT_DELTAS) replaceBlobs(l, r, x, y, z, NETHERRACK, BLACKSTONE);
      }
    },
    springFeature(16, 4, 123, SPRING_DELTA, 4, 1, true, [BIOME_BASALT_DELTAS]),
    springFeature(8, 4, 123, SPRING_NETHER, 4, 1, false, NOT_DELTAS),
    firePatch(FIRE, NETHERRACK, ALL),
    firePatch(SOUL_FIRE, SOUL_SOIL, SOUL_FIRE_BIOMES),
    glowstoneFeature(true),
    glowstoneFeature(false),
    mushroomPatch(BROWN_MUSHROOM, [BIOME_NETHER_WASTES, BIOME_BASALT_DELTAS]),
    mushroomPatch(RED_MUSHROOM, [BIOME_NETHER_WASTES, BIOME_BASALT_DELTAS]),
    // Raíces carmesíes del valle de almas: un parche por chunk desde su esquina.
    (l, r, cx, cz) => {
      const x = cx * 16, z = cz * 16, y = uniform(r, 0, 127);
      if (l.biome(x, z) !== BIOME_SOUL_SAND_VALLEY) return;
      patch(l, r, x, y, z, (px, py, pz) => {
        if (l.get(px, py, pz) === AIR) simpleBlock(l, px, py, pz, CRIMSON_ROOTS);
      });
    },
    oreFeature(4, 27, 36, 33, NETHERRACK, MAGMA_BLOCK, ALL),
    springFeature(16, 10, 117, SPRING_NETHER, 5, 0, false, NOT_DELTAS),
    springFeature(32, 10, 117, SPRING_NETHER, 5, 0, false, [BIOME_BASALT_DELTAS]),
    oreFeature(12, 0, 31, 12, NETHERRACK, SOUL_SAND, [BIOME_SOUL_SAND_VALLEY]),
    oreFeature(2, 5, 41, 33, NETHERRACK, GRAVEL, NOT_DELTAS),
    oreFeature(2, 5, 31, 33, NETHERRACK, BLACKSTONE, NOT_DELTAS),
    oreFeature(10, 10, 117, 10, NETHERRACK, NETHER_GOLD_ORE, NOT_DELTAS),
    oreFeature(16, 10, 117, 14, NETHERRACK, NETHER_QUARTZ_ORE, NOT_DELTAS),
    oreFeature(20, 10, 117, 10, NETHERRACK, NETHER_GOLD_ORE, [BIOME_BASALT_DELTAS]),
    oreFeature(32, 10, 117, 14, NETHERRACK, NETHER_QUARTZ_ORE, [BIOME_BASALT_DELTAS]),
    ancientDebris, // Fase 8.5 (lo que da el Nether)
  ],
  // 9 (vegetación).
  [
    // Enredaderas lloronas: verrugas en el techo y enredaderas colgando de él.
    (l, r, cx, cz) => {
      for (let i = 0; i < 10; i++) {
        const [x, y, z] = square(r, cx, cz, 0, 127);
        if (l.biome(x, z) !== BIOME_CRIMSON_FOREST || l.get(x, y, z) !== AIR || !WART_CEILING.has(l.get(x, y + 1, z))) continue;
        neighborSpread(l, r, x, y, z, NETHER_WART_BLOCK, WART_CEILING, 200, () => triangle(r, 5), () => trapezoid(r, -4, 1, 3));
        for (let k = 0; k < 100; k++) {
          const px = x + triangle(r, 7), py = y + trapezoid(r, -4, 1, 3), pz = z + triangle(r, 7);
          if (l.get(px, py, pz) === AIR && WART_CEILING.has(l.get(px, py + 1, pz))) vineColumn(l, r, px, py, pz, true, 2, 9);
        }
      }
    },
    (l, r, cx, cz) => {
      for (const [x, y, z] of everyLayer(l, r, cx, cz, 8)) if (l.biome(x, z) === BIOME_CRIMSON_FOREST) hugeFungus(l, r, x, y, z, false, false);
    },
    forestVegetation(6, BIOME_CRIMSON_FOREST, (r) => weighted(r, CRIMSON_VEGETATION)),
    (l, r, cx, cz) => {
      for (const [x, y, z] of everyLayer(l, r, cx, cz, 8)) if (l.biome(x, z) === BIOME_WARPED_FOREST) hugeFungus(l, r, x, y, z, true, false);
    },
    forestVegetation(5, BIOME_WARPED_FOREST, (r) => weighted(r, WARPED_VEGETATION)),
    forestVegetation(4, BIOME_WARPED_FOREST, () => NETHER_SPROUTS),
    // Enredaderas retorcidas: 10 zonas y en cada una 64 intentos.
    (l, r, cx, cz) => {
      for (let i = 0; i < 10; i++) {
        const [x, y, z] = square(r, cx, cz, 0, 127);
        if (l.biome(x, z) !== BIOME_WARPED_FOREST) continue;
        twistingVinesSpread(l, r, x, y, z, 8, 4, 1, 8);
      }
    },
  ],
];

/**
 * Decora el chunk (cx, cz): cada feature con su propio generador (semilla del chunk, paso e índice, como
 * setFeatureSeed de Java).
 */
export function decorateNetherChunk(l: FeatureLevel, cx: number, cz: number, rngFor: (step: number, index: number) => NoiseRandom): void {
  STEPS.forEach((features, step) => features.forEach((f, i) => f(l, rngFor(step, i), cx, cz)));
}
