// Núcleo del generador procedural de texturas de VoxelCraft.
//
// Contiene el PRNG determinista, el lienzo de trabajo de cada capa (albedo,
// altura y canales PBR en coma flotante), ruido periódico (las texturas que se
// repiten lo hacen sin costuras), utilidades de dibujo y el «horneado» final que
// deriva las normales de la altura y empaqueta los bytes RGBA8.
// TypeScript puro, sin DOM ni canvas: puede ejecutarse dentro de un Web Worker.

import type { TextureDef } from '../../shared/textureDefs';

/** Lado de cada textura en píxeles. */
export const S = 16;
/** Píxeles por capa. */
export const N = S * S;

/** Color sRGB con componentes en 0..255 (se admiten decimales hasta el horneado). */
export type RGB = readonly [number, number, number];

/** Función que dibuja una textura sobre su lienzo. */
export type Generator = (t: Tex) => void;

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, v: number): number {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Módulo siempre positivo. */
export function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

/** Coordenada periódica dentro de la textura. */
export function wrap(v: number): number {
  return ((v % S) + S) % S;
}

/** Índice de píxel con coordenadas periódicas (x, y enteros). */
export function idx(x: number, y: number): number {
  return wrap(y) * S + wrap(x);
}

/** Diferencia mínima entre dos coordenadas sobre el toro de 16 px. */
export function wrapDelta(d: number): number {
  d %= S;
  if (d > S / 2) d -= S;
  else if (d < -S / 2) d += S;
  return d;
}

// ---------------------------------------------------------------------------
// PRNG determinista
// ---------------------------------------------------------------------------

/** Hash FNV-1a de 32 bits con avalancha final (semillas a partir de nombres). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** PRNG mulberry32: rápido, determinista y suficiente para arte procedural. */
export class Rng {
  private s: number;

  constructor(seed: number | string) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  }

  /** Flotante uniforme en [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Entero uniforme en [a, b] (ambos incluidos). */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export function gray(v: number): RGB {
  return [v, v, v];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function shift(c: RGB, d: number): RGB {
  return [c[0] + d, c[1] + d, c[2] + d];
}

/** Luma aproximada (Rec. 709 sobre valores sRGB). */
export function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// ---------------------------------------------------------------------------
// Lienzo de trabajo de una capa
// ---------------------------------------------------------------------------

/**
 * Lienzo de una textura en curso. Todos los canales son flotantes:
 *  - col: albedo sRGB 0..255 (RGB entrelazado)
 *  - alpha: 0..255
 *  - height: altura relativa (1 = superficie más alta; se normaliza al hornear)
 *  - smooth, f0, sss, emit: canales del mapa especular (0..255)
 */
export class Tex {
  readonly name: string;
  readonly col = new Float32Array(N * 3);
  readonly alpha = new Float32Array(N).fill(255);
  readonly height = new Float32Array(N).fill(1);
  readonly smooth = new Float32Array(N).fill(60);
  readonly f0 = new Float32Array(N).fill(10);
  readonly sss = new Float32Array(N);
  readonly emit = new Float32Array(N);
  /** Intensidad del relieve: pendiente de la normal = Δaltura por píxel · depth. */
  depth = 1;
  /** Vecinos periódicos al derivar normales (texturas que se repiten). */
  tiling = true;
  /** En recortes: los vecinos transparentes toman la altura del píxel central. */
  clampTransparent = false;

  constructor(name: string) {
    this.name = name;
  }

  /** PRNG propio de la textura; `sub` separa flujos independientes. */
  rng(sub = ''): Rng {
    return new Rng(this.name + '/' + sub);
  }

  setI(i: number, c: RGB): void {
    const j = i * 3;
    this.col[j] = c[0];
    this.col[j + 1] = c[1];
    this.col[j + 2] = c[2];
  }

  getI(i: number): RGB {
    const j = i * 3;
    return [this.col[j], this.col[j + 1], this.col[j + 2]];
  }

  set(x: number, y: number, c: RGB): void {
    this.setI(idx(x, y), c);
  }

  get(x: number, y: number): RGB {
    return this.getI(idx(x, y));
  }

  /** Pinta un píxel opaco con color, altura y canales especulares opcionales. */
  paint(x: number, y: number, c: RGB, h?: number, smooth?: number, sss?: number, emit?: number): number {
    const i = idx(x, y);
    this.setI(i, c);
    this.alpha[i] = 255;
    if (h !== undefined) this.height[i] = h;
    if (smooth !== undefined) this.smooth[i] = smooth;
    if (sss !== undefined) this.sss[i] = sss;
    if (emit !== undefined) this.emit[i] = emit;
    return i;
  }

  fill(c: RGB): void {
    for (let i = 0; i < N; i++) this.setI(i, c);
  }

  fillSpec(smooth: number, f0 = 10, sss = 0, emit = 0): void {
    this.smooth.fill(smooth);
    this.f0.fill(f0);
    this.sss.fill(sss);
    this.emit.fill(emit);
  }

  isOpaque(x: number, y: number): boolean {
    return this.alpha[idx(x, y)] >= 128;
  }
}

// ---------------------------------------------------------------------------
// Ruido periódico
// ---------------------------------------------------------------------------

/**
 * Ruido de valor periódico con período 16 px. `cx`×`cy` celdas de retícula
 * (celdas anisótropas → vetas horizontales o verticales).
 */
export class Noise {
  private readonly g: Float32Array;
  readonly cx: number;
  readonly cy: number;

  constructor(rng: Rng, cx: number, cy: number = cx) {
    this.cx = cx;
    this.cy = cy;
    this.g = new Float32Array(cx * cy);
    for (let i = 0; i < this.g.length; i++) this.g[i] = rng.next();
  }

  /** Muestra en coordenadas de píxel (se evalúa en el centro del píxel). */
  at(x: number, y: number): number {
    const cx = this.cx;
    const cy = this.cy;
    const fx = ((x + 0.5) * cx) / S;
    const fy = ((y + 0.5) * cy) / S;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    let tx = fx - x0;
    let ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const xa = mod(x0, cx);
    const xb = mod(x0 + 1, cx);
    const ya = mod(y0, cy) * cx;
    const yb = mod(y0 + 1, cy) * cx;
    const g = this.g;
    const top = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * tx;
    const bot = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * tx;
    return top + (bot - top) * ty;
  }
}

/** Un valor aleatorio independiente por píxel. */
export function pixelNoise(rng: Rng): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = rng.next();
  return out;
}

/** Evalúa una función por píxel y devuelve el campo resultante. */
export function field(fn: (x: number, y: number, i: number) => number): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = fn(i & 15, i >> 4, i);
  return out;
}

/**
 * Cuantiza un campo en niveles 0..k-1 por rango: los pesos fijan qué fracción de
 * píxeles cae en cada nivel. Así el reparto de tonos de la paleta es exacto y el
 * resultado son grumos nítidos de píxeles (estética pixel-art).
 * Si se pasa `mask`, sólo se reparten los píxeles con mask ≠ 0 (el resto → 0).
 */
export function rankLevels(values: ArrayLike<number>, weights: readonly number[], mask?: ArrayLike<number>): Uint8Array {
  const order: number[] = [];
  for (let i = 0; i < values.length; i++) if (!mask || mask[i]) order.push(i);
  order.sort((a, b) => values[a] - values[b] || a - b);
  let total = 0;
  for (const w of weights) total += w;
  const out = new Uint8Array(values.length);
  const n = order.length;
  let level = 0;
  let limit = (weights[0] / total) * n;
  for (let r = 0; r < n; r++) {
    while (r >= limit - 1e-6 && level < weights.length - 1) {
      level++;
      limit += (weights[level] / total) * n;
    }
    out[order[r]] = level;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Celdas (Voronoi periódico), distancias y trazos
// ---------------------------------------------------------------------------

export interface Site {
  x: number;
  y: number;
  /** Peso: >1 agranda la celda (distancia dividida por el peso). */
  w: number;
}

/** Reparto tipo Poisson-disk sobre el toro 16×16 (o sin envolver si tiling = false). */
export function scatter(rng: Rng, count: number, minDist: number, wMin = 1, wMax = 1, tiling = true): Site[] {
  const out: Site[] = [];
  const md2 = minDist * minDist;
  for (let tries = 0; out.length < count && tries < 4000; tries++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    let ok = true;
    for (const s of out) {
      let dx = s.x - x;
      let dy = s.y - y;
      if (tiling) {
        dx = wrapDelta(dx);
        dy = wrapDelta(dy);
      }
      if (dx * dx + dy * dy < md2) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ x, y, w: wMin + (wMax - wMin) * rng.next() });
  }
  return out;
}

export interface VoronoiHit {
  /** Celda más cercana y distancia ponderada. */
  i1: number;
  d1: number;
  /** Segunda celda más cercana y su distancia ponderada. */
  i2: number;
  d2: number;
  /** Desplazamiento del punto respecto al centro de la celda más cercana. */
  dx: number;
  dy: number;
}

/** Busca las dos celdas más cercanas a (px, py) con distancia euclídea ponderada. */
export function voronoi(sites: readonly Site[], px: number, py: number, tiling = true): VoronoiHit {
  let i1 = 0;
  let i2 = 0;
  let d1 = Infinity;
  let d2 = Infinity;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    let dx = px - s.x;
    let dy = py - s.y;
    if (tiling) {
      dx = wrapDelta(dx);
      dy = wrapDelta(dy);
    }
    const d = Math.sqrt(dx * dx + dy * dy) / s.w;
    if (d < d1) {
      d2 = d1;
      i2 = i1;
      d1 = d;
      i1 = i;
      bx = dx;
      by = dy;
    } else if (d < d2) {
      d2 = d;
      i2 = i;
    }
  }
  return { i1, d1, i2, d2, dx: bx, dy: by };
}

/** Distancia euclídea de cada píxel al píxel marcado más cercano (0 en los marcados). */
export function distanceTo(mask: ArrayLike<number>, tiling = true): Float32Array {
  const pts: number[] = [];
  for (let i = 0; i < N; i++) if (mask[i]) pts.push(i);
  const out = new Float32Array(N);
  if (pts.length === 0) return out.fill(S);
  for (let i = 0; i < N; i++) {
    if (mask[i]) continue;
    const x = i & 15;
    const y = i >> 4;
    let best = Infinity;
    for (const p of pts) {
      let dx = (p & 15) - x;
      let dy = (p >> 4) - y;
      if (tiling) {
        dx = wrapDelta(dx);
        dy = wrapDelta(dy);
      }
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    out[i] = Math.sqrt(best);
  }
  return out;
}

/** Línea de Bresenham entre dos píxeles (incluidos ambos extremos). */
export function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    plot(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Recorre un sprite en texto: cada carácter distinto de '.' o ' ' llama a `fn`. */
export function stamp(rows: readonly string[], ox: number, oy: number, fn: (x: number, y: number, ch: string) => void): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== '.' && ch !== ' ') fn(ox + x, oy + y, ch);
    }
  }
}

// ---------------------------------------------------------------------------
// Horneado: normalización, normales y empaquetado RGBA8
// ---------------------------------------------------------------------------

function q(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

/**
 * Rellena el color y los canales especulares de los píxeles transparentes con la
 * media de sus vecinos opacos (dilatación). Evita halos oscuros al generar mipmaps.
 */
function bleed(t: Tex): void {
  const known = new Uint8Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    if (t.alpha[i] > 0) {
      known[i] = 1;
      any = true;
    }
  }
  if (!any) return;
  for (let pass = 0; pass < S; pass++) {
    const next = known.slice();
    let changed = false;
    for (let i = 0; i < N; i++) {
      if (known[i]) continue;
      const x = i & 15;
      const y = i >> 4;
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let sm = 0;
      let f0 = 0;
      let ss = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          let nx = x + ox;
          let ny = y + oy;
          if (t.tiling) {
            nx = wrap(nx);
            ny = wrap(ny);
          } else if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const j = ny * S + nx;
          if (!known[j]) continue;
          n++;
          r += t.col[j * 3];
          g += t.col[j * 3 + 1];
          b += t.col[j * 3 + 2];
          sm += t.smooth[j];
          f0 += t.f0[j];
          ss += t.sss[j];
        }
      }
      if (n === 0) continue;
      t.col[i * 3] = r / n;
      t.col[i * 3 + 1] = g / n;
      t.col[i * 3 + 2] = b / n;
      t.smooth[i] = sm / n;
      t.f0[i] = f0 / n;
      t.sss[i] = ss / n;
      next[i] = 1;
      changed = true;
    }
    known.set(next);
    if (!changed) break;
  }
}

/**
 * Aplica las reglas de la definición (recorte, tinte), normaliza la altura,
 * deriva las normales (Sobel) y escribe la capa en los tres buffers RGBA8.
 */
export function bake(t: Tex, def: TextureDef, albedo: Uint8Array, normal: Uint8Array, specular: Uint8Array, base: number): void {
  const cutout = def.cutout === true;
  const tint = def.tint ?? 0;
  const a = t.alpha;

  // 1) Alpha binario en recortes y en la máscara de tinte de grass_side.
  if (cutout || tint === 2) for (let i = 0; i < N; i++) a[i] = a[i] >= 128 ? 255 : 0;

  // 2) Recortes: color y especular de los huecos heredados de los vecinos.
  if (cutout) bleed(t);

  // 3) Texturas tintadas: RGB en escala de grises neutra (R = G = B).
  if (tint !== 0) {
    for (let i = 0; i < N; i++) {
      if (tint === 2 && a[i] === 0) continue;
      const j = i * 3;
      const l = 0.2126 * t.col[j] + 0.7152 * t.col[j + 1] + 0.0722 * t.col[j + 2];
      t.col[j] = l;
      t.col[j + 1] = l;
      t.col[j + 2] = l;
    }
  }

  // 4) Altura desplazada para que el punto más alto valga exactamente 1.
  let maxH = -Infinity;
  for (let i = 0; i < N; i++) if (!cutout || a[i] > 0) maxH = Math.max(maxH, t.height[i]);
  const dh = Number.isFinite(maxH) ? 1 - maxH : 0;
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = t.height[i] + dh;

  // Alturas con un marco de 1 px (periódico o replicado) para aplicar Sobel sin
  // ramas de borde. `tp` marca vecinos transparentes cuando deben tomar la altura
  // del píxel central (recortes que no se repiten, como las plantas).
  const P = S + 2;
  const hp = new Float32Array(P * P);
  const tp = new Uint8Array(P * P);
  const clampT = cutout && t.clampTransparent;
  for (let y = -1; y <= S; y++) {
    for (let x = -1; x <= S; x++) {
      const sx = t.tiling ? (x + S) % S : clamp(x, 0, S - 1);
      const sy = t.tiling ? (y + S) % S : clamp(y, 0, S - 1);
      const j = (y + 1) * P + x + 1;
      hp[j] = h[sy * S + sx];
      tp[j] = clampT && a[sy * S + sx] === 0 ? 1 : 0;
    }
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const o = base + i * 4;
      const transparent = cutout && a[i] === 0;

      albedo[o] = q(t.col[i * 3]);
      albedo[o + 1] = q(t.col[i * 3 + 1]);
      albedo[o + 2] = q(t.col[i * 3 + 2]);
      albedo[o + 3] = q(a[i]);

      if (transparent) {
        normal[o] = 128;
        normal[o + 1] = 128;
        normal[o + 2] = 255;
        normal[o + 3] = 0;
      } else {
        // Sobel: +X = derecha de la imagen, +Y = arriba (fila 0), +Z = fuera.
        const c = (y + 1) * P + x + 1;
        const hc = hp[c];
        const tl = tp[c - P - 1] ? hc : hp[c - P - 1];
        const tc = tp[c - P] ? hc : hp[c - P];
        const tr = tp[c - P + 1] ? hc : hp[c - P + 1];
        const ml = tp[c - 1] ? hc : hp[c - 1];
        const mr = tp[c + 1] ? hc : hp[c + 1];
        const bl = tp[c + P - 1] ? hc : hp[c + P - 1];
        const bc = tp[c + P] ? hc : hp[c + P];
        const br = tp[c + P + 1] ? hc : hp[c + P + 1];
        const gx = ((tr + 2 * mr + br - (tl + 2 * ml + bl)) / 8) * t.depth;
        const gy = ((bl + 2 * bc + br - (tl + 2 * tc + tr)) / 8) * t.depth;
        // dh/dx > 0 → la normal mira a la izquierda; dh/dy_imagen > 0 → mira hacia arriba.
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        normal[o] = q((-gx * inv * 0.5 + 0.5) * 255);
        normal[o + 1] = q((gy * inv * 0.5 + 0.5) * 255);
        normal[o + 2] = q((inv * 0.5 + 0.5) * 255);
        normal[o + 3] = q(clamp01(hc) * 255);
      }

      specular[o] = q(t.smooth[i]);
      specular[o + 1] = q(t.f0[i]);
      specular[o + 2] = q(t.sss[i]);
      specular[o + 3] = transparent ? 0 : q(t.emit[i]);
    }
  }
}
