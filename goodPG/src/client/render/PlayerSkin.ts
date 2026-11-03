// Generador procedural de skins de jugador (64x64, disposición tipo Minecraft) y geometría de
// cajas con sus coordenadas UV.

export interface SkinColors {
  skin: string;
  hair: string;
  eyes: string;
  shirt: string;
  pants: string;
  shoes: string;
  hairStyle: number;
}

const SKIN_TONES = ['#f1c7a5', '#e0ac85', '#c68b62', '#a86b45', '#8a5433', '#5f3a24', '#f5d4bd'];
const HAIR = ['#2b1b10', '#4a2c16', '#6b4020', '#a8752f', '#d9b25e', '#1a1a1a', '#8c2f1c', '#c9c9c9', '#3b2a4a'];
const EYES = ['#2e5fa8', '#3b7a3a', '#5a3a1e', '#2a2a2a', '#4f7fa0'];
const PANTS = ['#2f3d6b', '#3a3a3a', '#4d3b2a', '#27425a', '#5a4a3a', '#1f2a44'];
const SHOES = ['#3a2a1e', '#222222', '#4b4b4b', '#5b3b20'];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function skinColorsFor(name: string, shirt: string): SkinColors {
  const h = hashString(name.toLowerCase());
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR[(h >>> 4) % HAIR.length],
    eyes: EYES[(h >>> 8) % EYES.length],
    shirt,
    pants: PANTS[(h >>> 12) % PANTS.length],
    shoes: SHOES[(h >>> 16) % SHOES.length],
    hairStyle: (h >>> 20) % 3,
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

/** Caras de una caja en el atlas: [u, v, w, h] para +X, -X, +Y, -Y, -Z (frente), +Z (espalda). */
export function boxUV(u: number, v: number, w: number, h: number, d: number): number[][] {
  return [
    [u, v + d, d, h], // +X (lado derecho del personaje)
    [u + d + w, v + d, d, h], // -X (lado izquierdo)
    [u + d, v, w, d], // arriba
    [u + d + w, v, w, d], // abajo
    [u + d, v + d, w, h], // frente (-Z)
    [u + d + w + d, v + d, w, h], // espalda (+Z)
  ];
}

export const PART_LAYOUT = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  rightArm: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  leftArm: { u: 32, v: 48, w: 4, h: 12, d: 4 },
  rightLeg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  leftLeg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
} as const;

export function drawSkin(c: SkinColors): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const rect = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  // Ruido sutil por píxel para dar textura.
  const noise = (x: number, y: number, w: number, h: number, base: string, amt: number, seed: number) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const n = Math.sin((x + i) * 12.9898 + (y + j) * 78.233 + seed) * 43758.5453;
        const f = 1 + ((n - Math.floor(n)) - 0.5) * amt;
        rect(x + i, y + j, 1, 1, shade(base, f));
      }
    }
  };
  const fillBox = (p: { u: number; v: number; w: number; h: number; d: number }, col: string, amt: number, seed: number) => {
    for (const [u, v, w, h] of boxUV(p.u, p.v, p.w, p.h, p.d)) noise(u, v, w, h, col, amt, seed);
  };

  // Cabeza: piel + pelo.
  fillBox(PART_LAYOUT.head, c.skin, 0.06, 1);
  const head = boxUV(0, 0, 8, 8, 8);
  // Pelo arriba y detrás.
  noise(head[2][0], head[2][1], 8, 8, c.hair, 0.18, 2);
  noise(head[5][0], head[5][1], 8, c.hairStyle === 2 ? 8 : 6, c.hair, 0.18, 3);
  // Pelo en los laterales y flequillo.
  for (const side of [head[0], head[1]]) noise(side[0], side[1], 8, c.hairStyle === 0 ? 3 : 5, c.hair, 0.18, 4);
  const [fx, fy] = head[4];
  noise(fx, fy, 8, c.hairStyle === 1 ? 2 : 1, c.hair, 0.18, 5);
  if (c.hairStyle === 1) { rect(fx, fy + 2, 1, 2, c.hair); rect(fx + 7, fy + 2, 1, 2, c.hair); }
  // Ojos, cejas, nariz y boca.
  rect(fx + 1, fy + 4, 2, 1, '#ffffff');
  rect(fx + 5, fy + 4, 2, 1, '#ffffff');
  rect(fx + 2, fy + 4, 1, 1, c.eyes);
  rect(fx + 5, fy + 4, 1, 1, c.eyes);
  rect(fx + 1, fy + 3, 2, 1, shade(c.hair, 0.9));
  rect(fx + 5, fy + 3, 2, 1, shade(c.hair, 0.9));
  rect(fx + 3, fy + 5, 2, 1, shade(c.skin, 0.85));
  rect(fx + 3, fy + 6, 2, 1, shade(c.skin, 0.62));

  // Cuerpo: camiseta con cuello.
  fillBox(PART_LAYOUT.body, c.shirt, 0.1, 6);
  const body = boxUV(16, 16, 8, 12, 4);
  rect(body[4][0] + 3, body[4][1], 2, 1, shade(c.skin, 1));
  rect(body[4][0], body[4][1] + 11, 8, 1, shade(c.pants, 0.8)); // cinturón
  // Brazos: manga corta + piel.
  for (const arm of [PART_LAYOUT.rightArm, PART_LAYOUT.leftArm]) {
    fillBox(arm, c.skin, 0.06, 7);
    for (const [u, v, w, h] of boxUV(arm.u, arm.v, arm.w, arm.h, arm.d)) {
      if (h === 12) noise(u, v, w, 4, c.shirt, 0.1, 8);
    }
    const top = boxUV(arm.u, arm.v, arm.w, arm.h, arm.d)[2];
    noise(top[0], top[1], top[2], top[3], c.shirt, 0.1, 9);
  }
  // Piernas: pantalón + zapatos.
  for (const leg of [PART_LAYOUT.rightLeg, PART_LAYOUT.leftLeg]) {
    fillBox(leg, c.pants, 0.1, 10);
    for (const [u, v, w, h] of boxUV(leg.u, leg.v, leg.w, leg.h, leg.d)) {
      if (h === 12) noise(u, v + 10, w, 2, c.shoes, 0.1, 11);
    }
    const bottom = boxUV(leg.u, leg.v, leg.w, leg.h, leg.d)[3];
    noise(bottom[0], bottom[1], bottom[2], bottom[3], c.shoes, 0.1, 12);
  }
  return cv;
}

/**
 * Geometría de una caja centrada en el origen del pivote: min/max en píxeles de modelo.
 * Devuelve posiciones, normales, UV (normalizadas al atlas 64x64) e índices.
 */
export function buildBox(
  min: [number, number, number],
  max: [number, number, number],
  layout: { u: number; v: number; w: number; h: number; d: number },
  scale: number,
): { pos: Float32Array; nrm: Float32Array; uv: Float32Array; idx: Uint16Array } {
  const [x0, y0, z0] = min.map((v) => v * scale);
  const [x1, y1, z1] = max.map((v) => v * scale);
  const faces = boxUV(layout.u, layout.v, layout.w, layout.h, layout.d);
  // Esquinas por cara en orden BL, BR, TR, TL vistas desde fuera.
  const corners: number[][][] = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], // +X (lado derecho: el frente queda a la derecha)
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // -X
    [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], // +Y
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // -Y
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], // -Z (frente)
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // +Z (espalda)
  ];
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1], [0, 0, 1]];
  const pos = new Float32Array(24 * 3);
  const nrm = new Float32Array(24 * 3);
  const uv = new Float32Array(24 * 2);
  const idx = new Uint16Array(36);
  for (let f = 0; f < 6; f++) {
    const [u, v, w, h] = faces[f];
    const uvs = [[u, v + h], [u + w, v + h], [u + w, v], [u, v]];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      pos.set(corners[f][k], i * 3);
      nrm.set(normals[f], i * 3);
      uv[i * 2] = uvs[k][0] / 64;
      uv[i * 2 + 1] = uvs[k][1] / 64;
    }
    idx.set([f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3], f * 6);
  }
  return { pos, nrm, uv, idx };
}
