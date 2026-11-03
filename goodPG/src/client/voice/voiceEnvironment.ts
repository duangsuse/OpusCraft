// Chat de voz (parte 2): cómo cambia una voz con el entorno. Las paredes entre quien habla y quien escucha la
// apagan y le quitan los agudos (según el material: la lana casi no deja pasar nada, el cristal y las hojas poco
// tapan); en una cueva o una sala cerrada la voz retumba (más cuanto más grande es el hueco); y bajo el agua se
// oye ahogada. Todo se calcula con rayos por los bloques, sin tocar el audio, para poder probarlo aparte.
import { BLOCKS, BLOCK_COLLIDE, BLOCK_FLUID, BLOCK_OPAQUE } from '../../shared/blocks';
import { MAX_BLOCK_ID } from '../../shared/constants';

export type BlockAt = (x: number, y: number, z: number) => number;

/** Por cada bloque: cuánto sonido deja pasar (0..1) y cuánto apaga los agudos (0 nada, ~1.6 la lana). */
const PASS = new Float32Array(MAX_BLOCK_ID);
const MUFFLE = new Float32Array(MAX_BLOCK_ID);
let tablesReady = false;

function buildTables(): void {
  for (let id = 0; id < MAX_BLOCK_ID; id++) {
    const def = BLOCKS[id];
    let pass = 1, muffle = 0;
    if (id === 0 || !def) {
      // aire
    } else if (BLOCK_FLUID[id] === 1) {
      pass = 0.8; muffle = 0.35;
    } else if (BLOCK_FLUID[id] === 2) {
      pass = 0.5; muffle = 0.8;
    } else if (def.sound === 'wool') {
      // Lana: la que mejor aísla (las alfombras, finas, casi nada).
      if (BLOCK_COLLIDE[id] === 1) { pass = 0.16; muffle = 1.6; } else { pass = 0.95; muffle = 0.1; }
    } else if (def.sound === 'leaves' || def.sound === 'vines') {
      pass = 0.85; muffle = 0.15;
    } else if (def.sound === 'glass') {
      if (BLOCK_COLLIDE[id]) { pass = 0.55; muffle = 0.5; }
    } else if (BLOCK_OPAQUE[id] && BLOCK_COLLIDE[id] === 1) {
      pass = 0.3; muffle = 1;
    } else if (BLOCK_COLLIDE[id] === 1) {
      pass = 0.6; muffle = 0.5;
    } else if (BLOCK_COLLIDE[id] === 2) {
      // Losas, escaleras, puertas, vallas…: tapan en parte.
      pass = 0.75; muffle = 0.35;
    }
    PASS[id] = pass;
    MUFFLE[id] = muffle;
  }
  tablesReady = true;
}

export interface Occlusion {
  /** Parte del sonido que llega de frente (1 sin nada en medio). */
  gain: number;
  /** Frecuencia de corte del filtro de paso bajo (Hz): 20000 sin nada, unos cientos tras mucha roca. */
  cutoff: number;
}

/** Corte según lo tapado: m = 1 (una pared) ≈ 3300 Hz, m = 2 ≈ 550 Hz; nunca por debajo de 250 Hz. */
export function muffleCutoff(m: number): number {
  return Math.max(250, 20000 * Math.exp(-1.8 * m));
}

/**
 * Recorre los bloques que cruza el segmento a → b (sin contar las celdas de los extremos, donde están las
 * cabezas) y acumula lo que dejan pasar y lo que apagan.
 */
export function traceSegment(get: BlockAt, ax: number, ay: number, az: number, bx: number, by: number, bz: number): { pass: number; muffle: number } {
  if (!tablesReady) buildTables();
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  let pass = 1, muffle = 0;
  if (len < 1e-6) return { pass, muffle };
  let x = Math.floor(ax), y = Math.floor(ay), z = Math.floor(az);
  const ex = Math.floor(bx), ey = Math.floor(by), ez = Math.floor(bz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
  let ty = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * tdy : Infinity;
  let tz = dz !== 0 ? (dz > 0 ? z + 1 - az : az - z) * tdz : Infinity;
  for (let i = 0; i < 160; i++) {
    if (tx < ty && tx < tz) { x += sx; if (tx > 1) break; tx += tdx; }
    else if (ty < tz) { y += sy; if (ty > 1) break; ty += tdy; }
    else { z += sz; if (tz > 1) break; tz += tdz; }
    if (x === ex && y === ey && z === ez) break;
    const id = get(x, y, z);
    if (id <= 0 || id >= MAX_BLOCK_ID) continue;
    pass *= PASS[id];
    muffle += MUFFLE[id];
    if (pass < 0.002) break;
  }
  return { pass, muffle };
}

/**
 * Lo que tapa el camino de una voz: además del rayo directo (cabeza a cabeza) se prueban rayos paralelos un poco
 * por encima, a los lados y hacia los pies, y vale el más despejado. Así se oye algo por encima de un muro bajo o
 * por el borde de una puerta, aunque menos que sin nada (el sonido que rodea un obstáculo pierde algo).
 */
export function voiceOcclusion(get: BlockAt, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number): Occlusion {
  const hx = sx - lx, hz = sz - lz;
  const hl = Math.hypot(hx, hz) || 1;
  // Perpendicular horizontal al camino, para los rayos de los lados.
  const px = -hz / hl * 0.8, pz = hx / hl * 0.8;
  const rays: [number, number, number, number, number, number][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 1, 0],
    [px, 0, pz, px, 0, pz],
    [-px, 0, -pz, -px, 0, -pz],
    [0, 0, 0, 0, -1.2, 0],
  ];
  let best = { pass: 0, muffle: Infinity };
  for (let i = 0; i < rays.length; i++) {
    const [ax, ay, az, bx, by, bz] = rays[i];
    const r = traceSegment(get, lx + ax, ly + ay, lz + az, sx + bx, sy + by, sz + bz);
    const pass = i === 0 ? r.pass : r.pass * 0.8;
    if (pass > best.pass) best = { pass, muffle: r.muffle + (i === 0 ? 0 : 0.15) };
  }
  return { gain: best.pass, cutoff: muffleCutoff(best.muffle) };
}

// ------------------------------------------------------------------ la sala: tamaño y materiales

/** Direcciones de los rayos para medir el hueco: los seis ejes y las ocho diagonales. */
const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1],
].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as [number, number, number]; });

/** Hasta dónde se miran las paredes para decidir si es un sitio cerrado. */
const ROOM_RANGE = 32;

/** Lo que rebota cada material (0 lo absorbe todo, 1 lo devuelve todo): la piedra retumba, la lana no. */
const REFLECT = new Float32Array(MAX_BLOCK_ID);
let reflectReady = false;
function buildReflect(): void {
  for (let id = 0; id < MAX_BLOCK_ID; id++) {
    const snd = BLOCKS[id]?.sound;
    REFLECT[id] =
      snd === 'wool' ? 0.08
        : snd === 'snow' ? 0.25
          : snd === 'leaves' || snd === 'vines' ? 0.2
            : snd === 'sculk' || snd === 'fungus' || snd === 'roots' ? 0.3
              : snd === 'grass' || snd === 'dirt' || snd === 'sand' || snd === 'gravel' || snd === 'nylium' ? 0.45
                : snd === 'wood' || snd === 'nether_wood' || snd === 'stem' ? 0.55
                  : snd === 'glass' ? 0.85
                    : snd === 'metal' ? 0.92
                      : 0.9; // piedra, pizarra, ladrillos, menas, rocanegra…
  }
  reflectReady = true;
}

/** Primera pared en una dirección: distancia (hasta max; max si no hay) y el bloque con el que da. */
function wallHit(get: BlockAt, x: number, y: number, z: number, d: [number, number, number], max: number): [number, number] {
  for (let t = 0.5; t <= max; t += 0.5) {
    const id = get(Math.floor(x + d[0] * t), Math.floor(y + d[1] * t), Math.floor(z + d[2] * t));
    if (id > 0 && id < MAX_BLOCK_ID && BLOCK_COLLIDE[id] === 1 && (BLOCK_OPAQUE[id] || BLOCKS[id]?.sound === 'glass')) return [t, id];
  }
  return [max, 0];
}

export interface RoomProfile {
  /** Parte de las direcciones que topan con pared (0 al aire libre, 1 bien cerrado). */
  closed: number;
  /** Distancia media a las paredes (bloques): lo grande que es el hueco. */
  size: number;
  /** Lo que rebotan de media esas paredes (0..1). */
  reflect: number;
}

/** Cómo es el sitio alrededor de un punto: cerrado o abierto, pequeño o enorme, de piedra o de lana. */
export function roomProfile(get: BlockAt, x: number, y: number, z: number): RoomProfile {
  if (!reflectReady) buildReflect();
  let hits = 0, dist = 0, refl = 0;
  for (const d of DIRS) {
    const [w, id] = wallHit(get, x, y, z, d, ROOM_RANGE);
    if (w < ROOM_RANGE) {
      hits++;
      dist += w;
      refl += REFLECT[id];
    }
  }
  return { closed: hits / DIRS.length, size: hits ? dist / hits : 0, reflect: hits ? refl / hits : 0 };
}

/** Cuánto retumba un sitio (0..1): la mezcla de lo cerrado, lo grande y lo que rebotan sus paredes. */
export function roomWet(r: RoomProfile): number {
  return Math.min(0.8, 0.03 + r.closed * r.closed * (0.18 + 0.45 * Math.min(1, r.size / 16)) * (0.25 + 0.75 * r.reflect));
}

/** Cuánto retumba una voz en un sitio (0..1): casi nada al aire libre, bastante en una sala y mucho en una cueva. */
export function voiceReverb(get: BlockAt, x: number, y: number, z: number): number {
  return roomWet(roomProfile(get, x, y, z));
}

/**
 * El eco de un sitio grande: el retardo de ida y vuelta hasta las paredes (a 343 bloques por segundo), lo que se
 * realimenta (más con paredes que rebotan) y cuánto se oye (nada en sitios pequeños o abiertos).
 */
export function roomEcho(r: RoomProfile): { delay: number; feedback: number; level: number } {
  const big = Math.max(0, Math.min(1, (r.size - 9) / 14));
  const shut = Math.max(0, Math.min(1, (r.closed - 0.45) / 0.4));
  return {
    delay: Math.min(0.35, (2 * Math.max(4, r.size)) / 343),
    feedback: Math.min(0.62, 0.18 + 0.44 * r.reflect * shut),
    level: 0.5 * big * shut * r.reflect,
  };
}

// ------------------------------------------------------------------ el camino del sonido

export interface SoundPath {
  /** Largo del camino por el aire (bloques). */
  length: number;
  /** Punto del camino más lejano que se ve desde quien escucha: de ahí parece venir la voz (la puerta, la esquina). */
  aperture: [number, number, number];
}

/** Coste de pasar por una celda: el aire y las plantas, 1; hojas, agua, puertas abiertas o losas, algo más. */
function stepCost(id: number): number {
  if (id <= 0) return id === 0 ? 1 : Infinity;
  if (id >= MAX_BLOCK_ID) return Infinity;
  const pass = PASS[id];
  return pass >= 0.99 ? 1 : pass >= 0.74 ? 1.6 : Infinity;
}

/**
 * Camino más corto del sonido por el aire (A* en la rejilla de bloques, seis vecinos) de quien escucha a quien
 * habla, rodeando paredes por puertas, ventanas y pasillos; null si no hay (o si es más largo que maxLen).
 */
export function soundPath(
  get: BlockAt, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, maxLen = 72, budget = 7000,
): SoundPath | null {
  if (!tablesReady) buildTables();
  const x0 = Math.floor(lx), y0 = Math.floor(ly), z0 = Math.floor(lz);
  const gx = Math.floor(sx), gy = Math.floor(sy), gz = Math.floor(sz);
  const key = (x: number, y: number, z: number) => ((x - x0 + 512) * 1024 + (y - y0 + 512)) * 1024 + (z - z0 + 512);
  const h = (x: number, y: number, z: number) => Math.abs(x - gx) + Math.abs(y - gy) + Math.abs(z - gz);
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  // Montículo binario de [f, x, y, z].
  const heap: number[][] = [];
  const push = (n: number[]) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): number[] => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const k0 = key(x0, y0, z0);
  g.set(k0, 0);
  push([h(x0, y0, z0), x0, y0, z0]);
  let found = -1;
  let expanded = 0;
  while (heap.length && expanded < budget) {
    const [f, x, y, z] = pop();
    const k = key(x, y, z);
    const gc = g.get(k)!;
    if (f - h(x, y, z) > gc + 1e-9) continue; // entrada vieja
    if ((x === gx && z === gz && (y === gy || y === gy - 1))) { found = k; break; }
    expanded++;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const c = stepCost(get(nx, ny, nz));
      if (c === Infinity) continue;
      const ng = gc + c;
      if (ng > maxLen) continue;
      const nk = key(nx, ny, nz);
      const old = g.get(nk);
      if (old !== undefined && old <= ng) continue;
      g.set(nk, ng);
      came.set(nk, k);
      push([ng + h(nx, ny, nz), nx, ny, nz]);
    }
  }
  if (found < 0) return null;
  // El camino, de quien escucha a quien habla.
  const nodes: [number, number, number][] = [];
  for (let k: number | undefined = found; k !== undefined; k = came.get(k)) {
    const z = (k % 1024) - 512 + z0, y = (Math.floor(k / 1024) % 1024) - 512 + y0, x = Math.floor(k / 1048576) - 512 + x0;
    nodes.push([x + 0.5, y + 0.5, z + 0.5]);
    if (k === k0) break;
  }
  nodes.reverse();
  // La abertura: el último punto del camino que se ve sin nada en medio desde quien escucha.
  let aperture = nodes[nodes.length - 1];
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    if (traceSegment(get, lx, ly, lz, n[0], n[1], n[2]).pass < 0.9) {
      aperture = nodes[i - 1];
      break;
    }
  }
  return { length: g.get(found)!, aperture };
}

const NEIGHBORS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// ------------------------------------------------------------------ la voz en el aire

/**
 * Hacia dónde habla: la voz sale por delante; de espaldas se oye más baja (≈ −4 dB) y sin agudos. `facing`: el
 * coseno del ángulo entre hacia dónde mira quien habla y hacia quien escucha (1 de frente, −1 de espaldas).
 */
export function voiceDirectivity(facing: number): { gain: number; cutoff: number } {
  const f = (1 + Math.max(-1, Math.min(1, facing))) / 2;
  return { gain: 0.62 + 0.38 * f, cutoff: 4500 + 15500 * Math.pow(f, 1.5) };
}

/** El aire se come los agudos con la distancia: a 48 bloques, unos 5 kHz. */
export function airCutoff(d: number): number {
  return Math.max(4200, 20000 * Math.exp(-d / 32));
}
