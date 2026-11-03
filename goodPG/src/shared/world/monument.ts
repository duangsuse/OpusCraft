// Fase 7.5 (océano): monumento oceánico. Un edificio de prismarina de 59×59 bloques en los océanos
// profundos, con la base a 24 bloques bajo el nivel del mar y sobre patas que bajan hasta el fondo:
// - Edificio central de dos pisos (6×6 salas de 7×7) con un tercero más pequeño encima (4×4 salas) y el
//   ático del guardián anciano en lo más alto. Las salas forman un laberinto (árbol al azar con algunos
//   pasos de más) de puertas de 2×2 y agujeros en los suelos.
// - En el centro, la cámara del núcleo (dos pisos de alto, forrada de prismarina oscura) con 8 bloques
//   de oro dentro de un cubo de prismarina oscura.
// - Salas de las esponjas: salas dobles con esponjas mojadas en el techo.
// - Dos alas (una a cada lado), torres con la sala de un guardián anciano cada una.
// - Un pórtico de entrada delante y una terraza alrededor, con faroles marinos por fuera y por dentro.
// Todo lo que queda dentro de la caja por encima de la base es agua (el fondo que asome se retira).
//
// El dibujo es una función de la posición (monumentBlock): cada chunk evalúa sólo sus columnas.
import {
  AIR, WATER, GOLD_BLOCK, SEA_LANTERN, PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, WET_SPONGE, BLOCK_OPAQUE,
} from '../blocks';
import { SEA_LEVEL, hash2, hash3 } from '../constants';
import { mulberry32 } from './noise';
import { MOB_ELDER_GUARDIAN } from '../oceanMobs';
import type { Canvas, Start } from './structures';

/** Suelo de la base (Minecraft: 24 bloques bajo el nivel del mar). */
export const MONUMENT_Y = SEA_LEVEL - 24;
/** Medio lado del monumento (59 bloques de lado). */
export const MONUMENT_RADIUS = 29;
/** Techo del ático: el monumento llega hasta aquí (dos por debajo de la superficie). */
export const MONUMENT_TOP = MONUMENT_Y + 22;

const B = MONUMENT_Y;
/** Celda sin tocar (fuera del monumento o bajo la base sin pata). */
const KEEP = -1;
/** Pata: prismarina hasta el fondo (sólo sustituye agua o aire). */
const LEG = -2;

/** Cómo es un monumento concreto: laberinto, salas de las esponjas y giro. */
interface Layout {
  /** Pasos abiertos entre salas vecinas ("i,k,s|i,k,s" de menor a mayor). */
  open: Set<string>;
  /** Salas de las esponjas: columnas (i, k) con los pisos 0 y 1 unidos. */
  sponge: Set<string>;
  rot: number;
  seed: number;
}

// ------------------------------------------------------------------ laberinto

/** ¿Existe la sala (i, k) en el piso s? (pisos 0 y 1: 6×6; piso 2: las 4×4 del centro). */
function cellExists(i: number, k: number, s: number): boolean {
  if (s < 2) return i >= 0 && i < 6 && k >= 0 && k < 6;
  return s === 2 && i >= 1 && i <= 4 && k >= 1 && k <= 4;
}

const isCore = (i: number, k: number, s: number) => s < 2 && i >= 2 && i <= 3 && k >= 2 && k <= 3;
const isLobby = (i: number, k: number, s: number) => s === 0 && k === 0 && (i === 2 || i === 3);

function edgeKey(a: [number, number, number], b: [number, number, number]): string {
  const ka = a.join(','), kb = b.join(',');
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

const layoutCache = new Map<string, Layout>();

function monumentLayout(s: Start): Layout {
  const key = `${s.x},${s.z},${s.rng}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  if (layoutCache.size > 64) layoutCache.clear();
  const rnd = mulberry32(s.rng);
  // Salas de las esponjas: de 1 a 3 en el anillo exterior de los pisos 0 y 1 (fuera del vestíbulo).
  const sponge = new Set<string>();
  const n = 1 + Math.floor(rnd() * 3);
  for (let t = 0; t < 20 && sponge.size < n; t++) {
    const i = Math.floor(rnd() * 6), k = 1 + Math.floor(rnd() * 5);
    if (!isCore(i, k, 0) && !(i >= 1 && i <= 4 && k >= 1 && k <= 4 && rnd() < 0.5)) sponge.add(`${i},${k}`);
  }
  // Nodos: cada sala; el núcleo, el vestíbulo y cada sala de esponjas son un nodo cada uno.
  const node = (i: number, k: number, s2: number): string =>
    isCore(i, k, s2) ? 'core' : isLobby(i, k, s2) ? 'lobby' : s2 < 2 && sponge.has(`${i},${k}`) ? `sp${i},${k}` : `${i},${k},${s2}`;
  const cells: [number, number, number][] = [];
  for (let s2 = 0; s2 < 3; s2++) for (let k = 0; k < 6; k++) for (let i = 0; i < 6; i++) if (cellExists(i, k, s2)) cells.push([i, k, s2]);
  // Pasos posibles entre salas de nodos distintos.
  const edges: [[number, number, number], [number, number, number]][] = [];
  for (const c of cells) {
    const [i, k, s2] = c;
    for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const o: [number, number, number] = [i + d[0], k + d[1], s2 + d[2]];
      if (!cellExists(o[0], o[1], o[2]) || node(i, k, s2) === node(o[0], o[1], o[2])) continue;
      edges.push([c, o]);
    }
  }
  const adj = new Map<string, [string, string][]>();
  for (const [a, b] of edges) {
    const na = node(...a), nb = node(...b), ek = edgeKey(a, b);
    if (!adj.has(na)) adj.set(na, []);
    if (!adj.has(nb)) adj.set(nb, []);
    adj.get(na)!.push([nb, ek]);
    adj.get(nb)!.push([na, ek]);
  }
  // Árbol al azar desde el vestíbulo (búsqueda en profundidad) y, además, un paso de cada cinco.
  const open = new Set<string>();
  const seen = new Set<string>(['lobby']);
  const stack = ['lobby'];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const next = (adj.get(cur) ?? []).filter(([nb]) => !seen.has(nb));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nb, ek] = next[Math.floor(rnd() * next.length)];
    open.add(ek);
    seen.add(nb);
    stack.push(nb);
  }
  for (const [a, b] of edges) if (rnd() < 0.2) open.add(edgeKey(a, b));
  const L: Layout = { open, sponge, rot: s.rng % 4, seed: s.rng };
  layoutCache.set(key, L);
  return L;
}

// ------------------------------------------------------------------ bloques

/** Índice de la sala que contiene la coordenada c (−21..21), o −1 si c está en una pared. */
function cellOf(c: number): number {
  const r = c + 21;
  return r % 7 === 0 ? -1 : Math.floor(r / 7);
}
/** ¿Está c en el hueco de la puerta de su sala (las dos casillas centrales)? */
function inDoor(c: number): boolean {
  const r = (c + 21) % 7;
  return r === 3 || r === 4;
}

function isOpen(L: Layout, a: [number, number, number], b: [number, number, number]): boolean {
  return L.open.has(edgeKey(a, b));
}

/** Bloque del monumento en coordenadas locales (u a lo ancho, v hacia el fondo: la entrada mira a −v). */
function monumentBlock(L: Layout, u: number, y: number, v: number): number {
  const au = Math.abs(u), av = Math.abs(v), m = Math.max(au, av);
  if (m > MONUMENT_RADIUS || y > SEA_LEVEL - 1) return KEEP;
  if (y < B) {
    // Patas: en los cruces de la rejilla de 7 del anillo exterior y bajo las paredes del edificio.
    const grid = (c: number) => c % 7 === 0 || Math.abs(c) === MONUMENT_RADIUS;
    return grid(u) && grid(v) && (m >= 21 || (au % 14 === 0 && av % 14 === 0)) ? LEG : KEEP;
  }
  const h = hash3(u, y, v, L.seed);
  // Base: terraza de prismarina con líneas de prismarina oscura y algún farol marino.
  if (y === B) {
    if (m === MONUMENT_RADIUS) return DARK_PRISMARINE;
    if (au <= 21 && av <= 21) {
      if (au <= 6 && av <= 6) return DARK_PRISMARINE; // suelo del núcleo
      return (u + 21) % 7 === 0 || (v + 21) % 7 === 0 ? DARK_PRISMARINE : PRISMARINE;
    }
    if (u % 7 === 0 && v % 7 === 0) return u % 14 === 0 && v % 14 === 0 ? SEA_LANTERN : DARK_PRISMARINE;
    return h % 9 === 0 ? PRISMARINE_BRICKS : PRISMARINE;
  }
  // Alas: una torre a cada lado con la sala de un guardián anciano.
  if (au >= 22 && av <= 10 && y <= B + 14) return wing(u, y, v, au, av);
  // Pórtico de la entrada.
  if (v <= -22 && au <= 8 && y <= B + 8) return portico(u, y, v, au);
  // Edificio central y lo de encima.
  if (m <= 21 && y <= B + 8) return building(L, u, y, v, au, av, m, h);
  if (m <= 14 && y <= B + 12) {
    if (y === B + 12) {
      if (m <= 7) return penthouseFloor(u, v);
      // Tejado del tercer piso.
      return m === 14 ? DARK_PRISMARINE : lanternRoof(u, v) ? SEA_LANTERN : PRISMARINE_BRICKS;
    }
    return building(L, u, y, v, au, av, m, h);
  }
  if (m <= 7 && y <= B + 20) return penthouse(u, y, v, au, av, m);
  // Agujas en las esquinas del ático.
  if (au === 7 && av === 7 && y <= B + 22) return y === B + 22 ? SEA_LANTERN : DARK_PRISMARINE;
  return WATER;
}

/** Faroles de los tejados: en el centro de una de cada dos salas. */
function lanternRoof(u: number, v: number): boolean {
  const cu = cellOf(u), cv = cellOf(v);
  return cu >= 0 && cv >= 0 && (u + 21) % 7 === 3 && (v + 21) % 7 === 3 && (cu + cv) % 2 === 0;
}

function wing(u: number, y: number, v: number, au: number, av: number): number {
  // Puerta desde la sala del borde del edificio (piso 0, hacia +v).
  if (au <= 22 && (v === 3 || v === 4) && y >= B + 1 && y <= B + 2) return WATER;
  const shell = au === 22 || au === MONUMENT_RADIUS || av === 10 || y === B + 14;
  if (!shell) {
    // Pilares de prismarina oscura con faroles en las esquinas de la sala.
    if ((au === 23 || au === 28) && (av === 9) && y >= B + 1) return y === B + 7 ? SEA_LANTERN : DARK_PRISMARINE;
    return WATER;
  }
  const edge = (au === 22 || au === MONUMENT_RADIUS) && av === 10;
  if (edge || (y === B + 14 && (au === 22 || au === MONUMENT_RADIUS || av === 10))) return DARK_PRISMARINE;
  if (y === B + 14) return au === 25 && v % 3 === 0 ? SEA_LANTERN : PRISMARINE_BRICKS;
  // Ventanas de farol en las caras de fuera y bandas de prismarina oscura.
  if (au === MONUMENT_RADIUS && (y - B) % 4 === 2 && v % 4 === 0) return SEA_LANTERN;
  if (y === B + 7) return DARK_PRISMARINE;
  return PRISMARINE_BRICKS;
}

function portico(u: number, y: number, v: number, au: number): number {
  if (y === B + 8) return au === 8 || v === -29 ? DARK_PRISMARINE : u === 0 && v % 2 === 0 ? SEA_LANTERN : PRISMARINE_BRICKS;
  // Columnas y paredes laterales con ventanas.
  if ((au === 8 || au === 4) && (v === -29 || v === -25)) return DARK_PRISMARINE;
  if (au === 8) return y === B + 4 ? DARK_PRISMARINE : y === B + 2 && v === -27 ? SEA_LANTERN : PRISMARINE_BRICKS;
  return WATER;
}

function penthouseFloor(u: number, v: number): number {
  // Agujero desde la sala del tercer piso de debajo (sala 2, 2).
  if ((u === -4 || u === -3) && (v === -4 || v === -3)) return WATER;
  return Math.abs(u) === 7 || Math.abs(v) === 7 ? DARK_PRISMARINE : PRISMARINE;
}

function penthouse(u: number, y: number, v: number, au: number, av: number, m: number): number {
  if (y === B + 20) return au <= 1 && av <= 1 ? SEA_LANTERN : m === 7 ? DARK_PRISMARINE : PRISMARINE_BRICKS;
  if (m === 7) {
    if (au === 7 && av === 7) return DARK_PRISMARINE;
    if (y === B + 16 && (au === 0 || av === 0 || au === 1 || av === 1) && (au === 7 || av === 7)) return SEA_LANTERN;
    return y === B + 13 || y === B + 19 ? DARK_PRISMARINE : PRISMARINE_BRICKS;
  }
  // Cuatro pilares con un farol en medio.
  if (au === 4 && av === 4) return y === B + 16 ? SEA_LANTERN : DARK_PRISMARINE;
  return WATER;
}

/** Pisos 0–2 del edificio: salas, paredes, puertas, agujeros, núcleo y salas de las esponjas. */
function building(L: Layout, u: number, y: number, v: number, au: number, av: number, m: number, h: number): number {
  const ry = y - B;
  // Núcleo: 13×13×7 por dentro, forrado de prismarina oscura, con el oro en medio.
  if (au <= 7 && av <= 7 && ry <= 8) {
    if (ry === 8) {
      if (au === 7 || av === 7) return DARK_PRISMARINE;
      const i = cellOf(u), k = cellOf(v);
      if (i >= 0 && k >= 0 && inDoor(u) && inDoor(v) && isOpen(L, [i, k, 1], [i, k, 2])) return WATER;
      return au <= 1 && av <= 1 ? SEA_LANTERN : DARK_PRISMARINE;
    }
    if (au <= 6 && av <= 6) {
      if ((u === -1 || u === 0) && (v === -1 || v === 0) && (ry === 3 || ry === 4)) return GOLD_BLOCK;
      if (u >= -2 && u <= 1 && v >= -2 && v <= 1 && ry >= 2 && ry <= 5) return DARK_PRISMARINE;
      if (au === 6 && av === 6) return ry === 4 ? SEA_LANTERN : DARK_PRISMARINE;
      return WATER;
    }
    // Pared del núcleo: puertas hacia las salas vecinas abiertas.
    if (au === 7 && av === 7) return DARK_PRISMARINE;
    const door = coreDoor(L, u, ry, v, au);
    return door ? WATER : DARK_PRISMARINE;
  }
  const onU = (u + 21) % 7 === 0, onV = (v + 21) % 7 === 0;
  const s = Math.floor((ry - 1) / 4); // piso (en los planos, el de debajo)
  // Planos de suelo y techo.
  if (ry % 4 === 0) {
    if (m === 21 || m === 14 && ry === 12) return DARK_PRISMARINE;
    if (onU || onV) return ry === 8 && m > 14 ? PRISMARINE_BRICKS : DARK_PRISMARINE;
    const i = cellOf(u), k = cellOf(v), below = ry / 4 - 1;
    // Salas de las esponjas: sin suelo entre los pisos 0 y 1.
    if (ry === 4 && L.sponge.has(`${i},${k}`)) return WATER;
    if (inDoor(u) && inDoor(v) && cellExists(i, k, below + 1) && isOpen(L, [i, k, below], [i, k, below + 1])) return WATER;
    // Tejado del anillo del segundo piso.
    if (ry === 8 && m > 14) return lanternRoof(u, v) ? SEA_LANTERN : PRISMARINE_BRICKS;
    // Farol en el techo de algunas salas.
    if ((u + 21) % 7 === 3 && (v + 21) % 7 === 3 && hash2(i * 7 + below, k, L.seed) % 2 === 0) return SEA_LANTERN;
    return PRISMARINE;
  }
  const low = ry % 4 <= 2; // las dos filas de abajo de cada piso (donde van las puertas)
  // Paredes exteriores del edificio y del tercer piso.
  if (m === 21 || (s === 2 && m === 14)) {
    // Entrada principal y puertas de las alas.
    if (v === -21 && au <= 2 && s === 0) return WATER;
    if (au === 21 && (v === 3 || v === 4) && s === 0 && low) return WATER;
    if (au === av) return DARK_PRISMARINE;
    const along = au === m ? v : u;
    if (ry % 4 === 2 && (along + 21) % 7 === 3) return SEA_LANTERN;
    return PRISMARINE_BRICKS;
  }
  if (onU && onV) return DARK_PRISMARINE;
  if (onU || onV) {
    // Vestíbulo: sin la pared que separa sus dos salas.
    if (onU && u === 0 && s === 0 && cellOf(v) === 0) return WATER;
    if (low) {
      if (onU && inDoor(v)) {
        const k = cellOf(v), i = (u + 21) / 7;
        if (isOpen(L, [i - 1, k, s], [i, k, s])) return WATER;
      }
      if (onV && inDoor(u)) {
        const i = cellOf(u), k = (v + 21) / 7;
        if (isOpen(L, [i, k - 1, s], [i, k, s])) return WATER;
      }
    }
    return PRISMARINE_BRICKS;
  }
  // Salas de las esponjas: esponjas mojadas pegadas al techo (por dentro).
  if (ry === 7 && L.sponge.has(`${cellOf(u)},${cellOf(v)}`)) return h % 4 !== 0 ? WET_SPONGE : WATER;
  return WATER;
}

/** ¿Hay una puerta del núcleo en esta casilla de su pared (|u| o |v| = 7)? */
function coreDoor(L: Layout, u: number, ry: number, v: number, au: number): boolean {
  const s = ry <= 4 ? 0 : 1;
  if (ry % 4 === 0 || ry % 4 === 3) return false;
  if (au === 7) {
    if (!inDoor(v)) return false;
    const k = cellOf(v), inner = u > 0 ? 3 : 2, outer = u > 0 ? 4 : 1;
    return isOpen(L, [inner, k, s], [outer, k, s]);
  }
  if (!inDoor(u)) return false;
  const i = cellOf(u), inner = v > 0 ? 3 : 2, outer = v > 0 ? 4 : 1;
  return isOpen(L, [i, inner, s], [i, outer, s]);
}

// ------------------------------------------------------------------ colocación

/** Coordenadas locales (u, v) de la posición relativa (dx, dz) con el giro `rot`. */
function toLocal(dx: number, dz: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 0: return [dx, dz];
    case 1: return [dz, -dx];
    case 2: return [-dx, -dz];
    default: return [-dz, dx];
  }
}

/** Posición relativa (dx, dz) de las coordenadas locales (u, v). */
function toWorld(u: number, v: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 0: return [u, v];
    case 1: return [-v, u];
    case 2: return [-u, -v];
    default: return [v, -u];
  }
}

/** Dibuja la parte del monumento que cae en el chunk del lienzo y anota sus guardianes ancianos. */
export function buildMonument(c: Canvas, s: Start): void {
  const L = monumentLayout(s);
  const R = MONUMENT_RADIUS;
  const xa = Math.max(c.x0, s.x - R), xb = Math.min(c.x0 + 15, s.x + R);
  const za = Math.max(c.z0, s.z - R), zb = Math.min(c.z0 + 15, s.z + R);
  for (let z = za; z <= zb; z++) {
    for (let x = xa; x <= xb; x++) {
      const [u, v] = toLocal(x - s.x, z - s.z, L.rot);
      for (let y = SEA_LEVEL - 1; y >= B; y--) {
        const id = monumentBlock(L, u, y, v);
        if (id >= 0) c.set(x, y, z, id);
      }
      if (monumentBlock(L, u, B - 1, v) === LEG) {
        for (let y = B - 1; y > B - 40; y--) {
          const cur = c.get(x, y, z);
          if (cur < 0 || (cur !== AIR && BLOCK_OPAQUE[cur])) break;
          c.set(x, y, z, PRISMARINE_BRICKS);
        }
      }
    }
  }
  // Tres guardianes ancianos: el del ático y uno en cada ala.
  for (const [u, y, v] of MONUMENT_ELDERS) {
    const [dx, dz] = toWorld(u, v, L.rot);
    c.mob(MOB_ELDER_GUARDIAN, s.x + dx + 0.5, y, s.z + dz + 0.5);
  }
}

/** Sitios de los guardianes ancianos (coordenadas locales: u, y, v). */
export const MONUMENT_ELDERS: readonly [number, number, number][] = [[0, B + 14, 0], [25, B + 3, 0], [-26, B + 3, 0]];

/** ¿Está (x, y, z) dentro de la caja del monumento con centro (mx, mz)? (de la base al nivel del mar). */
export function inMonumentBox(mx: number, mz: number, x: number, y: number, z: number): boolean {
  return Math.abs(x - mx) <= MONUMENT_RADIUS + 0.5 && Math.abs(z - mz) <= MONUMENT_RADIUS + 0.5 && y >= B - 1 && y <= SEA_LEVEL;
}
