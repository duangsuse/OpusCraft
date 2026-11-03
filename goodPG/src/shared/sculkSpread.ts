// Fase 7.5 (abismo): cómo se extiende el sculk desde un catalizador (el SculkSpreader de Minecraft), puro
// sobre un acceso a bloques: lo usa el servidor (sim/server/sculk.ts) y las pruebas.
//
// Cuando muere algo cerca de un catalizador, su experiencia se convierte en «cargas» que avanzan por el
// sculk y sus venas. En el aire ponen venas sobre lo que tengan al lado; en una vena, cada carga convierte
// en sculk un bloque de piedra, tierra, arena… que la vena cubra (y la rodea de venas); sobre el sculk, a
// más de 4 bloques del catalizador, a veces crece un sensor (o, 1 de cada 11, un chillador que no invoca)
// y la carga se va gastando con la distancia. Cada carga se mueve cada dos ticks a una casilla vecina con
// sculk o venas (sin esquinas) y se juntan las que coinciden.
import {
  AIR, WATER, SCULK, SCULK_SENSOR, SCULK_SHRIEKER, BLOCK_OPAQUE, BLOCK_SOLID, BLOCK_REPLACEABLE, BLOCK_FLUID, familyBase,
  isSculkVein, veinFaces, veinWith, veinCanStick, sculkReplaceable, shriekerFor, stateOf, isWaterlogged,
} from './blocks';

export interface SculkWorld {
  /** Id del bloque (−1 si no se sabe: sin cargar o fuera del chunk que se genera). */
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
  rand(): number;
}

/** Parámetros de un propagador (los de Minecraft para un catalizador). */
export interface SpreaderConfig {
  growthSpawnCost: number;
  noGrowthRadius: number;
  chargeDecayRate: number;
  additionalDecayRate: number;
}

export const CATALYST_SPREADER: SpreaderConfig = { growthSpawnCost: 10, noGrowthRadius: 4, chargeDecayRate: 10, additionalDecayRate: 5 };
/** Cargas como mucho por catalizador y carga máxima de cada una. */
export const MAX_CURSORS = 32;
export const MAX_CHARGE = 1000;

export interface Cursor {
  x: number;
  y: number;
  z: number;
  charge: number;
  updateDelay: number;
  decayDelay: number;
}

const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];
/** Las 18 casillas vecinas sin las 8 esquinas. */
const NON_CORNER: [number, number, number][] = [];
for (let dy = -1; dy <= 1; dy++) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (n === 1 || n === 2) NON_CORNER.push([dx, dy, dz]);
    }
  }
}

const isAirOrWater = (id: number) => id === AIR || id === WATER;
const isSculkLike = (id: number) => id === SCULK || isSculkVein(id);

/** Nuevas cargas en (x, y, z) con `charge` de experiencia (troceada en cargas de hasta 1000). */
export function addCursors(cursors: Cursor[], x: number, y: number, z: number, charge: number): void {
  while (charge > 0 && cursors.length < MAX_CURSORS) {
    const c = Math.min(MAX_CHARGE, charge);
    cursors.push({ x, y, z, charge: c, updateDelay: 0, decayDelay: 1 });
    charge -= c;
  }
}

/**
 * Avanza las cargas un tick alrededor del catalizador (cx, cy, cz). Devuelve las que siguen vivas (las
 * que coinciden en una casilla se juntan si no pasan de 1000).
 */
export function updateCursors(w: SculkWorld, cursors: Cursor[], cx: number, cy: number, cz: number, cfg = CATALYST_SPREADER): Cursor[] {
  const out: Cursor[] = [];
  const at = new Map<string, Cursor>();
  for (const c of cursors) {
    if (Math.abs(c.x - cx) > 1024 || Math.abs(c.z - cz) > 1024) continue;
    updateCursor(w, c, cx, cy, cz, cfg);
    if (c.charge <= 0) continue;
    const k = `${c.x},${c.y},${c.z}`;
    const prev = at.get(k);
    if (!prev) {
      at.set(k, c);
      out.push(c);
    } else if (prev.charge + c.charge <= MAX_CHARGE) {
      prev.charge += c.charge;
      prev.decayDelay = Math.max(prev.decayDelay, c.decayDelay);
    } else out.push(c);
  }
  return out;
}

function updateCursor(w: SculkWorld, c: Cursor, cx: number, cy: number, cz: number, cfg: SpreaderConfig): void {
  if (w.get(c.x, c.y, c.z) < 0) return;
  if (c.updateDelay > 0) {
    c.updateDelay--;
    return;
  }
  let id = w.get(c.x, c.y, c.z);
  // Venas: alrededor del sculk, desde una vena hacia las superficies vecinas o, en el aire, sobre lo que
  // tenga al lado.
  if (id === SCULK) spreadVeinsAround(w, c.x, c.y, c.z);
  else if (isSculkVein(id)) spreadVeinFrom(w, c.x, c.y, c.z);
  else if (isAirOrWater(id)) placeVeinsIn(w, c.x, c.y, c.z);
  id = w.get(c.x, c.y, c.z);
  c.charge = useCharge(w, c, id, cx, cy, cz, cfg);
  if (c.charge <= 0) {
    discharge(w, c.x, c.y, c.z);
    return;
  }
  const next = movementPos(w, c.x, c.y, c.z);
  if (next) {
    discharge(w, c.x, c.y, c.z);
    [c.x, c.y, c.z] = next;
  }
  // Retraso del desgaste: sólo baja fuera del sculk.
  if (w.get(c.x, c.y, c.z) !== SCULK) c.decayDelay = Math.max(0, c.decayDelay - 1);
  else c.decayDelay = 1;
  c.updateDelay = 1;
}

/** Lo que gasta la carga según lo que pisa (sculk, vena u otra cosa). */
function useCharge(w: SculkWorld, c: Cursor, id: number, cx: number, cy: number, cz: number, cfg: SpreaderConfig): number {
  const r = w.rand;
  const charge = c.charge;
  if (id === SCULK) {
    if (charge === 0 || Math.floor(r() * cfg.chargeDecayRate) !== 0) return charge;
    const d = Math.hypot(c.x - cx, c.y - cy, c.z - cz);
    const close = d < cfg.noGrowthRadius;
    if (!close && canPlaceGrowth(w, c.x, c.y, c.z)) {
      if (Math.floor(r() * cfg.growthSpawnCost) < charge) {
        const growth = Math.floor(r() * 11) === 0 ? shriekerFor(false, w.get(c.x, c.y + 1, c.z) === WATER) : stateOf(SCULK_SENSOR, {
          phase: 0, water: w.get(c.x, c.y + 1, c.z) === WATER ? 1 : 0,
        });
        w.set(c.x, c.y + 1, c.z, growth);
      }
      return Math.max(0, charge - cfg.growthSpawnCost);
    }
    if (Math.floor(r() * cfg.additionalDecayRate) !== 0) return charge;
    return charge - (close ? 1 : decayPenalty(cfg, d, charge));
  }
  if (isSculkVein(id)) {
    if (placeSculkUnder(w, c.x, c.y, c.z)) return charge - 1;
    return Math.floor(r() * cfg.chargeDecayRate) === 0 ? Math.floor(charge * 0.5) : charge;
  }
  return c.decayDelay > 0 ? charge : 0;
}

function decayPenalty(cfg: SpreaderConfig, d: number, charge: number): number {
  const i = cfg.noGrowthRadius;
  const f = (d - i) ** 2;
  const j = (24 - i) ** 2;
  return Math.max(1, Math.floor(charge * Math.min(1, f / j) * 0.5));
}

/** ¿Puede crecer un sensor o un chillador encima? (hueco libre y no más de 2 en 9×3×9). */
function canPlaceGrowth(w: SculkWorld, x: number, y: number, z: number): boolean {
  const above = w.get(x, y + 1, z);
  if (!isAirOrWater(above)) return false;
  let n = 0;
  for (let dy = 0; dy <= 2; dy++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const b = familyBase(Math.max(0, w.get(x + dx, y + dy, z + dz)));
        if (b === SCULK_SENSOR || b === SCULK_SHRIEKER) n++;
        if (n > 2) return false;
      }
    }
  }
  return true;
}

/** Una vena convierte en sculk uno de los bloques que cubre (al azar) y lo rodea de venas. */
function placeSculkUnder(w: SculkWorld, x: number, y: number, z: number): boolean {
  const mask = veinFaces(w.get(x, y, z));
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = 5; i > 0; i--) {
    const j = Math.floor(w.rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const f of order) {
    if (!(mask & (1 << f))) continue;
    const bx = x + DX[f], by = y + DY[f], bz = z + DZ[f];
    if (!sculkReplaceable(w.get(bx, by, bz))) continue;
    w.set(bx, by, bz, SCULK);
    spreadVeinsAround(w, bx, by, bz);
    // Las venas que tocaban ese bloque pierden la cara que ahora cubre el sculk.
    for (let g = 0; g < 6; g++) {
      if (g === (f ^ 1)) continue;
      const nx = bx + DX[g], ny = by + DY[g], nz = bz + DZ[g];
      if (isSculkVein(w.get(nx, ny, nz))) discharge(w, nx, ny, nz);
    }
    return true;
  }
  return false;
}

/** Venas en una celda vacía, pegadas a los bloques que tiene al lado (las caras que se puedan). */
export function placeVeinsIn(w: SculkWorld, x: number, y: number, z: number): boolean {
  const cur = w.get(x, y, z);
  if (!isAirOrWater(cur) && !isSculkVein(cur)) return false;
  let mask = veinFaces(cur);
  const before = mask;
  for (let f = 0; f < 6; f++) {
    const b = w.get(x + DX[f], y + DY[f], z + DZ[f]);
    if (b > 0 && b !== SCULK && veinCanStick(b)) mask |= 1 << f;
  }
  if (mask === before || cur === WATER) return false;
  w.set(x, y, z, veinWith(mask));
  return true;
}

/**
 * Venas alrededor de un bloque que se acaba de volver sculk: sobre las superficies vecinas en el mismo
 * plano (como el MultifaceSpreader de Minecraft desde las caras al aire del sculk).
 */
export function spreadVeinsAround(w: SculkWorld, x: number, y: number, z: number): void {
  for (let f = 0; f < 6; f++) {
    const ax = x + DX[f], ay = y + DY[f], az = z + DZ[f];
    if (!isAirOrWater(w.get(ax, ay, az)) && !isSculkVein(w.get(ax, ay, az))) continue;
    for (let d = 0; d < 6; d++) {
      if (d >> 1 === f >> 1) continue;
      const qx = ax + DX[d], qy = ay + DY[d], qz = az + DZ[d];
      const q = w.get(qx, qy, qz);
      if (!isAirOrWater(q) && !isSculkVein(q)) continue;
      // La vena en Q cubre el bloque vecino del sculk, del mismo lado (la cara opuesta a f).
      const target = w.get(qx - DX[f], qy - DY[f], qz - DZ[f]);
      if (target <= 0 || target === SCULK || !veinCanStick(target) || q === WATER) continue;
      w.set(qx, qy, qz, veinWith(veinFaces(q) | (1 << (f ^ 1))));
    }
  }
}

/** Una vena se extiende por la misma superficie a las celdas vecinas (sin doblar esquinas). */
function spreadVeinFrom(w: SculkWorld, x: number, y: number, z: number): void {
  const mask = veinFaces(w.get(x, y, z));
  for (let f = 0; f < 6; f++) {
    if (!(mask & (1 << f))) continue;
    for (let d = 0; d < 6; d++) {
      if (d >> 1 === f >> 1) continue;
      const qx = x + DX[d], qy = y + DY[d], qz = z + DZ[d];
      const q = w.get(qx, qy, qz);
      if (q !== AIR && !isSculkVein(q)) continue;
      const target = w.get(qx + DX[f], qy + DY[f], qz + DZ[f]);
      if (target <= 0 || target === SCULK || !veinCanStick(target) || veinFaces(q) & (1 << f)) continue;
      w.set(qx, qy, qz, veinWith(veinFaces(q) | (1 << f)));
    }
  }
}

/** Al irse la carga de una vena, pierde las caras que ya cubren sculk (y desaparece si no le queda ninguna). */
function discharge(w: SculkWorld, x: number, y: number, z: number): void {
  const id = w.get(x, y, z);
  if (!isSculkVein(id)) return;
  let mask = veinFaces(id);
  for (let f = 0; f < 6; f++) if (mask & (1 << f) && w.get(x + DX[f], y + DY[f], z + DZ[f]) === SCULK) mask &= ~(1 << f);
  if (mask === veinFaces(id)) return;
  w.set(x, y, z, veinWith(mask) || AIR);
}

/** Casilla vecina (sin esquinas) con sculk o venas a la que puede pasar la carga (null si ninguna). */
function movementPos(w: SculkWorld, x: number, y: number, z: number): [number, number, number] | null {
  const order = NON_CORNER.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(w.rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let best: [number, number, number] | null = null;
  for (const [dx, dy, dz] of order) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const id = w.get(nx, ny, nz);
    if (!isSculkLike(id) || !unobstructed(w, x, y, z, dx, dy, dz)) continue;
    best = [nx, ny, nz];
    // Preferir una vena con algo que convertir debajo (o el propio sculk).
    if (id === SCULK || hasSubstrate(w, nx, ny, nz, id)) break;
  }
  return best;
}

function hasSubstrate(w: SculkWorld, x: number, y: number, z: number, id: number): boolean {
  const mask = veinFaces(id);
  for (let f = 0; f < 6; f++) if (mask & (1 << f) && sculkReplaceable(w.get(x + DX[f], y + DY[f], z + DZ[f]))) return true;
  return false;
}

/** Paso en diagonal: libre si alguno de los dos caminos rectos no tiene una cara sólida delante. */
function unobstructed(w: SculkWorld, x: number, y: number, z: number, dx: number, dy: number, dz: number): boolean {
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) return true;
  const free = (ox: number, oy: number, oz: number) => {
    const b = w.get(x + ox, y + oy, z + oz);
    return b >= 0 && !(BLOCK_OPAQUE[b] === 1 && BLOCK_SOLID[b] === 1);
  };
  if (dx === 0) return free(0, dy, 0) || free(0, 0, dz);
  if (dy === 0) return free(dx, 0, 0) || free(0, 0, dz);
  return free(dx, 0, 0) || free(0, dy, 0);
}

/** ¿Deja el bloque sitio a una vena? (aire, agua quieta o algo que se sustituye y no es fluido). */
export function veinSpace(id: number): boolean {
  return id === AIR || id === WATER || (id > 0 && BLOCK_REPLACEABLE[id] === 1 && !BLOCK_FLUID[id] && !isWaterlogged(id));
}
