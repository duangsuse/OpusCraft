// Fase 8.6 (el End): texturas del dragón de Ender (256 × 256) y del cristal del End (64 × 32), dibujadas aquí (nada
// copiado del juego) sobre la disposición de caras de sus modelos:
// - dragón: escamas casi negras en hileras con un reflejo violeta, la panza gris, las crestas del lomo de hueso
//   claro, las membranas de las alas oscuras y translúcidas a la vista (venas y bordes), la boca roja por dentro y
//   los ojos morados encendidos (píxeles emisivos: alfa entre 128 y 250);
// - cristal: los marcos de cristal (sólo el borde, el centro vacío), el cubo rosado encendido y la base de lecho de roca.
import { DRAGON_MODEL, CRYSTAL_MODEL, BULLET_MODEL } from '../render/DragonRenderer';
import type { MobTexture } from '../render/MobRenderer';

type RGBA = [number, number, number, number];

/** Azar fijo por píxel. */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface FaceCtx {
  part: string;
  box: number;
  /** 0 −X, 1 +X, 2 arriba, 3 abajo, 4 delante, 5 detrás. */
  face: number;
  /** Píxel dentro de la cara y su tamaño. */
  i: number;
  j: number;
  w: number;
  h: number;
  /** Píxel del atlas. */
  u: number;
  v: number;
}

function paint(width: number, height: number, parts: { name: string; boxes: [number, number, number, number, number, number, number, number][] }[], fn: (c: FaceCtx) => RGBA): MobTexture {
  const rgba = new Uint8Array(width * height * 4);
  for (const part of parts) {
    part.boxes.forEach(([, , , w, h, d, u, v], bi) => {
      const rects: [number, number, number, number][] = [[u, v + d, d, h], [u + d + w, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + d, v + d, w, h], [u + d + w + d, v + d, w, h]];
      rects.forEach(([fu, fv, fw, fh], face) => {
        for (let j = 0; j < fh; j++) {
          for (let i = 0; i < fw; i++) {
            const x = fu + i, y = fv + j;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const c = fn({ part: part.name, box: bi, face, i, j, w: fw, h: fh, u: x, v: y });
            const o = (y * width + x) * 4;
            rgba[o] = c[0];
            rgba[o + 1] = c[1];
            rgba[o + 2] = c[2];
            rgba[o + 3] = c[3];
          }
        }
      });
    });
  }
  return { width, height, rgba };
}

const mix = (a: RGBA, b: RGBA, t: number): RGBA => [
  Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), a[3],
];

const SCALE_DARK: RGBA = [14, 12, 18, 255];
const SCALE_MID: RGBA = [30, 26, 38, 255];
const SCALE_LIT: RGBA = [52, 44, 66, 255];
const BELLY: RGBA = [70, 66, 76, 255];
const BONE: RGBA = [196, 190, 200, 255];

/** Escamas: hileras desplazadas con el borde de abajo claro y un reflejo violeta. */
function scales(c: FaceCtx, seed: number): RGBA {
  const row = Math.floor(c.j / 2), shift = row & 1 ? 1 : 0;
  const col = Math.floor((c.i + shift) / 2);
  const edge = c.j % 2 === 1;
  const n = hash(col + c.u, row + c.v, seed);
  let k: RGBA = mix(SCALE_DARK, SCALE_MID, n);
  if (edge) k = mix(k, SCALE_LIT, 0.5 + n * 0.3);
  if (n > 0.93) k = mix(k, [96, 60, 130, 255], 0.5);
  return k;
}

export function dragonTexture(): MobTexture {
  return paint(256, 256, DRAGON_MODEL, (c) => {
    const p = c.part;
    // Crestas del lomo y del cuello: hueso claro con la punta más oscura.
    if ((p === 'body' && c.box > 0) || ((p.startsWith('neck') || p.startsWith('tail')) && c.box === 1) || (p === 'head' && (c.box === 2 || c.box === 4))) {
      return mix(BONE, [120, 114, 128, 255], c.j / Math.max(1, c.h) * 0.7 + hash(c.u, c.v, 3) * 0.15);
    }
    if (p.includes('wing')) {
      if (c.box === 1) {
        // Membrana: oscura, violácea, con venas que salen del hueso y el borde de atrás deshilachado.
        const vein = Math.abs(((c.i + c.j * 0.35) % 14) - 7) < 0.8;
        const n = hash(c.u, c.v, 11);
        let k: RGBA = mix([22, 18, 30, 255], [38, 30, 52, 255], n);
        if (vein) k = mix(k, [74, 64, 92, 255], 0.7);
        if (c.j < 2) k = mix(k, [60, 52, 74, 255], 0.5);
        return k;
      }
      return mix([34, 30, 40, 255], [60, 54, 70, 255], hash(c.u, c.v, 12) * 0.6 + (c.face === 2 ? 0.3 : 0));
    }
    if (p === 'head' && c.box === 1 && c.face === 4) {
      // La frente: los ojos morados encendidos, rasgados.
      const eyeRow = c.j >= 3 && c.j <= 4;
      const left = c.i >= 2 && c.i <= 5, right = c.i >= c.w - 6 && c.i <= c.w - 3;
      if (eyeRow && (left || right)) {
        const inner = (c.j === 3 && (c.i === 3 || c.i === c.w - 4)) || (c.j === 4 && (c.i === 4 || c.i === c.w - 5));
        return inner ? [255, 180, 255, 250] : [204, 64, 238, 200];
      }
    }
    if (p === 'jaw' && c.face === 2) return mix([96, 18, 24, 255], [140, 32, 36, 255], hash(c.u, c.v, 21));
    if (p === 'head' && c.box === 0 && c.face === 3) return mix([96, 18, 24, 255], [140, 32, 36, 255], hash(c.u, c.v, 22));
    if (p.includes('foot') && c.face === 4) {
      // Garras: cuatro puntas de hueso en el borde de delante.
      if (c.j >= c.h - 2 && c.i % 4 === 1) return BONE;
    }
    // La panza (la cara de abajo) algo más clara.
    if (c.face === 3) return mix(BELLY, SCALE_MID, hash(c.u, c.v, 5) * 0.4);
    return scales(c, p.length * 7 + c.box);
  });
}

export function crystalTexture(): MobTexture {
  return paint(64, 32, CRYSTAL_MODEL, (c) => {
    if (c.part === 'outer' || c.part === 'inner') {
      // El marco de cristal: sólo el borde (y algún brillo en diagonal); el centro, vacío.
      const edge = c.i === 0 || c.j === 0 || c.i === c.w - 1 || c.j === c.h - 1;
      const glint = Math.abs(c.i - c.j) === 0 && c.i > 1 && c.i < 4;
      if (edge) return [196, 214, 226, 255];
      if (glint) return [230, 240, 255, 255];
      return [0, 0, 0, 0];
    }
    if (c.part === 'cube') {
      // El cubo: rosa encendido con vetas más claras.
      const n = hash(c.u, c.v, 31);
      const vein = (c.i + c.j) % 5 === 0;
      const k: RGBA = vein ? [255, 196, 240, 240] : mix([214, 70, 170, 220], [246, 120, 210, 230], n);
      return k;
    }
    // La base: lecho de roca.
    const n = hash(c.u, c.v, 41);
    const g = n > 0.7 ? 150 : n > 0.4 ? 96 : 60;
    return [g, g, g + 4, 255];
  });
}

/**
 * Fase 8.6: la bala del shulker (64 × 32): placas de luz blanca amarillenta, más intensa en el centro y con el borde
 * deshilachado (los píxeles de fuera, transparentes a trozos).
 */
export function bulletTexture(): MobTexture {
  return paint(64, 32, BULLET_MODEL, (c) => {
    const cx = (c.w - 1) / 2, cy = (c.h - 1) / 2;
    const r = Math.max(Math.abs(c.i - cx) / Math.max(1, cx), Math.abs(c.j - cy) / Math.max(1, cy));
    const n = hash(c.u, c.v, 57);
    if (r > 0.8 && n < 0.45) return [0, 0, 0, 0];
    const core = 1 - r;
    const k: RGBA = mix([214, 200, 168, 230], [255, 252, 236, 245], core);
    return n > 0.85 ? [255, 255, 250, 250] : k;
  });
}
