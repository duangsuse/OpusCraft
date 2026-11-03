// Fase 8.4 (estructuras del Nether): portales en ruinas del Nether (RuinedPortalStructure con la configuración
// «ruined_portal_nether» de la 26.3). Comparten la rejilla de los portales en ruinas (regiones de 40 chunks con 15
// de separación) y salen en cualquier bioma del Nether. Como en Java:
// - un 5 % son gigantes; los demás, de los diez tamaños normales (marcos de 4 × 5 a 5 × 6, algunos inclinados);
// - la altura (colocación «in_nether», sin bolsa de aire): la mitad de las veces se intenta entre y = 27 y 29 (bajo
//   el mar de lava) y la otra mitad entre 29 y 100, y se baja hasta que tres de las cuatro esquinas pisan firme; los
//   que salen bajo la lava se quedan medio hundidos (la lava no se despeja: LavaSubmergedBlockProcessor);
// - la obsidiana del marco pasa a obsidiana llorosa un 15 % de las veces (BlockAgeProcessor) y faltan trozos (están
//   en ruinas), el oro se pierde un 30 % de las veces y todo lo de piedra se hace de piedra negra
//   (replace_with_blackstone): ladrillos de piedra negra pulida, sus escaleras y losas, piedra negra;
// - alrededor, una mancha de rocanegra (con un 7 % de bloques de magma) que se desvanece hacia fuera
//   (spreadNetherrack) y el cofre del portal en ruinas.
// La forma de cada plantilla está dibujada aquí (nada copiado del juego).
import {
  AIR, LAVA, OBSIDIAN, CRYING_OBSIDIAN, GOLD_BLOCK, BLACKSTONE, POLISHED_BLACKSTONE_BRICKS, CRACKED_POLISHED_BLACKSTONE_BRICKS,
  CHISELED_POLISHED_BLACKSTONE, NETHERRACK, MAGMA_BLOCK, STAIRS, SLABS, stateOf,
} from '../blocks';
import { CHUNK_SIZE, hash2, hash3 } from '../constants';
import { mulberry32 } from './noise';
import type { Canvas } from './structures';
import type { NetherBaseColumn } from './netherFossils';

/** La rejilla de los portales en ruinas (StructureSet ruined_portals). */
export const NETHER_RUINED_PORTALS = { spacing: 40, separation: 15, salt: 34222645 };

export interface NetherRuinedPortal {
  /** Esquina del marco (su bloque de abajo a la izquierda) y la dirección del marco (a lo largo de x o de z). */
  x: number;
  y: number;
  z: number;
  alongX: boolean;
  /** Ancho y alto del marco (con el marco), si es gigante y cuánto se inclina (0: de pie). */
  w: number;
  h: number;
  giant: boolean;
  lean: number;
  /** Azar propio de la pieza. */
  seed: number;
}

const cache = new Map<string, NetherRuinedPortal | null>();

/** Los diez tamaños normales (ancho × alto del marco, inclinación) y los tres gigantes. */
const NORMAL: readonly [number, number, number][] = [[4, 5, 0], [4, 5, 0], [4, 6, 0], [5, 5, 0], [5, 6, 0], [4, 5, 1], [4, 6, 0], [5, 6, 1], [4, 5, 0], [5, 5, 0]];
const GIANT: readonly [number, number, number][] = [[7, 11, 0], [8, 12, 0], [7, 10, 1]];

const randIn = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

/** El portal de la región (rx, rz) o null. */
export function netherRuinedPortalAt(seed: number, gen: NetherBaseColumn, rx: number, rz: number): NetherRuinedPortal | null {
  const k = `${seed}:${rx},${rz}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  if (cache.size > 1024) cache.clear();
  const { spacing, separation, salt } = NETHER_RUINED_PORTALS;
  // El mismo chunk que en el mundo normal (la rejilla es la misma).
  const h = hash2(rx, rz, seed ^ salt);
  const range = spacing - separation;
  const cx = rx * spacing + (h % range), cz = rz * spacing + ((h >>> 12) % range);
  const r = mulberry32(hash2(cx, cz, seed ^ (salt * 7) ^ 0x4e7));
  const giant = r() < 0.05;
  const [w, hh, lean] = giant ? GIANT[Math.floor(r() * GIANT.length)] : NORMAL[Math.floor(r() * NORMAL.length)];
  const alongX = r() < 0.5;
  const x = cx * CHUNK_SIZE + 4 + Math.floor(r() * 8), z = cz * CHUNK_SIZE + 4 + Math.floor(r() * 8);
  // Altura: in_nether sin bolsa de aire.
  let y = r() < 0.5 ? randIn(r, 27, 29) : randIn(r, 29, 100);
  // Bajar hasta que tres de las cuatro esquinas de la caja pisen firme (la lava no es firme).
  const pad = giant ? 4 : 2;
  const corners: [number, number][] = alongX
    ? [[x - pad, z - pad], [x + w - 1 + pad, z - pad], [x - pad, z + pad], [x + w - 1 + pad, z + pad]]
    : [[x - pad, z - pad], [x + pad, z - pad], [x - pad, z + w - 1 + pad], [x + pad, z + w - 1 + pad]];
  for (; y > 15; y--) {
    let n = 0;
    for (const [qx, qz] of corners) if (gen.isSturdyBase(gen.baseBlockAt(qx, y, qz))) n++;
    if (n >= 3) break;
  }
  const out: NetherRuinedPortal = { x, y, z, alongX, w, h: hh, giant, lean, seed: hash2(cx, cz, seed ^ 0x2b1) };
  cache.set(k, out);
  return out;
}

/** Radio de la mancha de rocanegra alrededor (y de la caja que ocupa). */
function spread(p: NetherRuinedPortal): number {
  return p.giant ? 9 : 5;
}

/** Dibuja en el lienzo los portales en ruinas del Nether que tocan su chunk. */
export function drawNetherRuinedPortals(c: Canvas, seed: number, gen: NetherBaseColumn): void {
  const { spacing } = NETHER_RUINED_PORTALS;
  const x0 = c.x0, z0 = c.z0, R = 12;
  for (let rz = Math.floor((z0 - R) / 16 / spacing); rz <= Math.floor((z0 + 15 + R) / 16 / spacing); rz++) {
    for (let rx = Math.floor((x0 - R) / 16 / spacing); rx <= Math.floor((x0 + 15 + R) / 16 / spacing); rx++) {
      const p = netherRuinedPortalAt(seed, gen, rx, rz);
      if (!p) continue;
      const cx = p.alongX ? p.x + p.w / 2 : p.x, cz = p.alongX ? p.z : p.z + p.w / 2;
      if (cx + R < x0 || cx - R > x0 + 15 || cz + R < z0 || cz - R > z0 + 15) continue;
      drawPortal(c, p);
    }
  }
}

const BR = POLISHED_BLACKSTONE_BRICKS, CR = CRACKED_POLISHED_BLACKSTONE_BRICKS;
const stairs = (facing: number) => stateOf(STAIRS.polished_blackstone_brick, { facing, half: 0 });
const slab = () => stateOf(SLABS.blackstone, { type: 0 });

/** ¿Hay aire o lava? (lo que se puede tapar con la mancha o con escombros). */
const loose = (id: number) => id === AIR || id === LAVA;

function drawPortal(c: Canvas, p: NetherRuinedPortal): void {
  // Azar propio de cada celda (el mismo lo dibuje el chunk que lo dibuje).
  const n = (u: number, y: number, v: number, k: number) => (hash3(u * 7 + k * 131, y * 13 + k * 17, v * 5 + k * 31, p.seed) >>> 8) / 16777216;
  const { x: px, y: py, z: pz, w, h, alongX, giant, lean } = p;
  // Posición en el mundo del punto (u a lo largo del marco, v de través, altura dy).
  const at = (u: number, v: number): [number, number] => (alongX ? [px + u, pz + v] : [px + v, pz + u]);
  const put = (u: number, dy: number, v: number, id: number) => {
    const [x, z] = at(u, v);
    c.set(x, py + dy, z, id);
  };
  const get = (u: number, dy: number, v: number) => {
    const [x, z] = at(u, v);
    return c.get(x, py + dy, z);
  };

  // 1) La mancha de rocanegra con un 7 % de magma (spreadNetherrack): en el suelo de la caja, más rala cuanto más lejos.
  const rad = spread(p);
  for (let v = -rad; v <= rad; v++) {
    for (let u = -rad; u <= w - 1 + rad; u++) {
      const du = u < 0 ? -u : u > w - 1 ? u - (w - 1) : 0;
      const d = Math.hypot(du, v) / rad;
      if (d > 1 || n(u, 0, v, 1) > 1 - d * d * 0.9) continue;
      // Sobre el suelo firme más cercano a la base (arriba o abajo, un par de bloques).
      for (const dy of [0, -1, 1, -2]) {
        const here = get(u, dy, v), below = get(u, dy - 1, v);
        if (here < 0) break;
        if (!loose(here) && loose(get(u, dy + 1, v))) {
          put(u, dy, v, n(u, dy, v, 2) < 0.07 ? MAGMA_BLOCK : NETHERRACK);
          break;
        }
        if (loose(here) && below >= 0 && !loose(below) && dy <= 0) {
          put(u, dy - 1, v, n(u, dy, v, 2) < 0.07 ? MAGMA_BLOCK : NETHERRACK);
          break;
        }
      }
    }
  }

  // 2) La base: una plataforma de ladrillos bajo el marco con escaleras y losas alrededor (algunos trozos caídos).
  const bu0 = -1, bu1 = w, bv = giant ? 2 : 1;
  for (let v = -bv; v <= bv; v++) {
    for (let u = bu0; u <= bu1; u++) {
      const edgeU = u === bu0 || u === bu1, edgeV = Math.abs(v) === bv;
      if (edgeU && edgeV && n(u, 0, v, 3) < 0.6) continue;
      const roll = n(u, 0, v, 4);
      if (edgeU || edgeV) {
        if (roll < 0.25) continue; // falta
        const facing = edgeV ? (v < 0 ? (alongX ? 2 : 1) : alongX ? 0 : 3) : u < 0 ? (alongX ? 1 : 2) : alongX ? 3 : 0;
        put(u, 0, v, roll < 0.7 ? stairs(facing) : slab());
      } else put(u, 0, v, roll < 0.2 ? CR : roll < 0.3 ? CHISELED_POLISHED_BLACKSTONE : BR);
      // Cimientos: hasta el suelo, para que no quede colgando.
      for (let dy = -1; dy >= -8; dy--) {
        const id = get(u, dy, v);
        if (id < 0 || !loose(id)) break;
        put(u, dy, v, n(u, dy, v, 5) < 0.5 ? BLACKSTONE : BR);
      }
    }
  }

  // 3) El marco de obsidiana (con llorosa y trozos que faltan) y su hueco (aire, o la lava que haya).
  const missing = giant ? 0.18 : 0.22;
  for (let dy = 1; dy <= h; dy++) {
    const shift = lean ? Math.floor(((dy - 1) / (h - 1)) * lean + 0.5) : 0; // se inclina hacia un lado
    for (let u = 0; u < w; u++) {
      const frame = u === 0 || u === w - 1 || dy === 1 || dy === h;
      const v = shift;
      if (frame) {
        // Las esquinas de abajo siempre están (sostienen el resto); arriba falta más.
        const keep = dy === 1 && (u === 0 || u === w - 1);
        if (!keep && n(u, dy, v, 6) < missing * (0.6 + dy / h)) continue;
        put(u, dy, v, n(u, dy, v, 7) < 0.15 ? CRYING_OBSIDIAN : OBSIDIAN);
      } else if (get(u, dy, v) !== LAVA) put(u, dy, v, AIR);
    }
  }

  // 4) Trozos de obsidiana caídos junto al marco.
  const fallen = giant ? 6 : 2 + Math.floor(n(0, 0, 0, 8) * 3);
  for (let k = 0; k < fallen; k++) {
    const u = Math.floor(n(k, 1, 0, 9) * (w + 4)) - 2, v = (n(k, 2, 0, 9) < 0.5 ? -1 : 1) * (1 + Math.floor(n(k, 3, 0, 9) * (bv + 2)));
    for (let dy = 2; dy >= -3; dy--) {
      const here = get(u, dy, v), below = get(u, dy - 1, v);
      if (here < 0 || below < 0) break;
      if (loose(here) && !loose(below)) {
        put(u, dy, v, n(u, dy, v, 10) < 0.15 ? CRYING_OBSIDIAN : OBSIDIAN);
        break;
      }
    }
  }

  // 5) El oro (un 30 % se pierde) y el cofre, a un lado de la base.
  const gv = bv + 1;
  for (let k = 0; k < (giant ? 3 : 1); k++) {
    if (n(k, 0, 0, 11) < 0.3) continue;
    const u = Math.floor(n(k, 1, 0, 11) * w), v = n(k, 2, 0, 11) < 0.5 ? -gv : gv;
    if (loose(get(u, 1, v)) && !loose(get(u, 0, v))) put(u, 1, v, GOLD_BLOCK);
    else if (loose(get(u, 0, v))) put(u, 0, v, GOLD_BLOCK);
  }
  const chestU = n(0, 0, 0, 12) < 0.5 ? -2 : w + 1, chestV = Math.round(n(0, 1, 0, 12) * 2 - 1);
  let cy = 1;
  while (cy > -3 && loose(get(chestU, cy - 1, chestV))) cy--;
  if (get(chestU, cy, chestV) === LAVA) return; // el cofre no va dentro de la lava
  const facing = chestU < 0 ? (alongX ? 1 : 2) : alongX ? 3 : 0;
  const [chx, chz] = at(chestU, chestV);
  if (cy <= 1 && c.inside(chx, py + cy, chz)) c.chest(chx, py + cy, chz, facing, 'ruined_portal');
}

/** El portal en ruinas del Nether más cercano a (x, z). */
export function locateNetherRuinedPortal(seed: number, gen: NetherBaseColumn, x: number, z: number, maxRegions = 100): [number, number, number] | null {
  const { spacing } = NETHER_RUINED_PORTALS;
  const rx0 = Math.floor(x / 16 / spacing), rz0 = Math.floor(z / 16 / spacing);
  let best: [number, number, number] | null = null, bd = Infinity;
  for (let r = 0; r <= maxRegions; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const p = netherRuinedPortalAt(seed, gen, rx0 + dx, rz0 + dz);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) {
          bd = d;
          best = [p.x, p.y + 1, p.z];
        }
      }
    }
    if (best && (r + 1) * spacing * 16 > bd + spacing * 16) break;
  }
  return best;
}
