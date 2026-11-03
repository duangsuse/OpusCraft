// Modelos de bloque hechos de cajas (en dieciseisavos de bloque), como los de Minecraft: losas,
// escaleras, vallas, puertas, trampillas, camas… Las UV se calculan a partir de la posición de
// cada cara (igual que en los cubos), así las texturas encajan entre bloques vecinos.

/** Caja con una capa de textura por cara (+X, -X, +Y, -Y, +Z, -Z); -1 = cara sin dibujar. */
export interface ModelBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  tex: number[];
}

/** Direcciones horizontales: 0 norte (-Z), 1 este (+X), 2 sur (+Z), 3 oeste (-X). */
export const DIR_X = [0, 1, 0, -1];
export const DIR_Z = [-1, 0, 1, 0];
/** Índice de cara (+X 0, -X 1, +Z 4, -Z 5) de cada dirección horizontal. */
export const DIR_FACE = [5, 0, 4, 1];

export function mbox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: number | number[]): ModelBox {
  return { x0, y0, z0, x1, y1, z1, tex: typeof tex === 'number' ? [tex, tex, tex, tex, tex, tex] : tex.slice() };
}

/**
 * Gira las cajas (pensadas mirando al norte, -Z) para que miren en la dirección `dir`.
 * Un giro lleva el norte al este: (x, z) → (16 - z, x).
 */
export function rotateBoxes(boxes: ModelBox[], dir: number): ModelBox[] {
  let out = boxes;
  for (let k = 0; k < (dir & 3); k++) {
    out = out.map((b) => {
      const ax = 16 - b.z0, bx = 16 - b.z1;
      const t = b.tex;
      return {
        x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: b.y0, y1: b.y1, z0: b.x0, z1: b.x1,
        // +X ← -Z, -X ← +Z, +Z ← +X, -Z ← -X
        tex: [t[5], t[4], t[2], t[3], t[0], t[1]],
      };
    });
  }
  return out;
}

/** Cajas planas (0..1, 6 números por caja) a partir de cajas de modelo. */
export function flatBoxes(boxes: ModelBox[]): number[] {
  const out: number[] = [];
  for (const b of boxes) out.push(b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16);
  return out;
}

/** Caja envolvente (0..1) de una lista plana de cajas. */
export function unionBox(flat: number[]): number[] {
  if (flat.length === 0) return [0, 0, 0, 1, 1, 1];
  const u = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < flat.length; i += 6) {
    for (let k = 0; k < 3; k++) {
      u[k] = Math.min(u[k], flat[i + k]);
      u[k + 3] = Math.max(u[k + 3], flat[i + 3 + k]);
    }
  }
  return u;
}

/** Gira cajas planas (0..1) como `rotateBoxes`. */
export function rotateFlat(flat: number[], dir: number): number[] {
  let out = flat;
  for (let k = 0; k < (dir & 3); k++) {
    const r: number[] = [];
    for (let i = 0; i < out.length; i += 6) {
      const ax = 1 - out[i + 2], bx = 1 - out[i + 5];
      r.push(Math.min(ax, bx), out[i + 1], out[i], Math.max(ax, bx), out[i + 4], out[i + 3]);
    }
    out = r;
  }
  return out;
}

/** Esquinas (0 = mínimo, 1 = máximo) de cada cara, en el orden de UV (0,1), (1,1), (1,0), (0,0). */
export const FACE_CORNERS: readonly (readonly (readonly number[])[])[] = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];

/** UV (en dieciseisavos) de un punto de una cara según su posición: igual que en los cubos. */
export function autoUV(f: number, px: number, py: number, pz: number): [number, number] {
  switch (f) {
    case 0: return [16 - pz, 16 - py];
    case 1: return [pz, 16 - py];
    case 2: return [px, pz];
    case 3: return [px, 16 - pz];
    case 4: return [px, 16 - py];
    default: return [16 - px, 16 - py];
  }
}

export interface ModelQuad {
  face: number;
  layer: number;
  /** 4 esquinas × (x, y, z) en dieciseisavos. */
  p: number[];
  /** 4 × (u, v) en dieciseisavos. */
  uv: number[];
}

/** Caras de un modelo de cajas (para objetos en la mano, en el suelo y los iconos). */
export function modelQuads(boxes: readonly ModelBox[]): ModelQuad[] {
  const out: ModelQuad[] = [];
  for (const b of boxes) {
    const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    for (let f = 0; f < 6; f++) {
      const layer = b.tex[f];
      if (layer < 0) continue;
      const p: number[] = [], uv: number[] = [];
      for (const c of FACE_CORNERS[f]) {
        const px = c[0] ? hi[0] : lo[0], py = c[1] ? hi[1] : lo[1], pz = c[2] ? hi[2] : lo[2];
        p.push(px, py, pz);
        uv.push(...autoUV(f, px, py, pz));
      }
      out.push({ face: f, layer, p, uv });
    }
  }
  return out;
}
