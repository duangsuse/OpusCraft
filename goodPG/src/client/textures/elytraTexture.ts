// Fase 8.6 (el End): la textura de los élitros, procedural, sobre la caja de cada ala (ElytraModel: 10 × 20 × 2 en
// 22,0 de un atlas de 64). Se pinta en coordenadas del ala: la envergadura (del hombro a la punta, que al planear
// apunta hacia fuera) y la cuerda (del borde de ataque, junto a la bisagra del hombro, al de salida). Membrana de
// escamas gris violácea que aclara hacia la punta, plumas con su raquis y sus barbas en diagonal, el borde de ataque
// de hueso, una punta en flecha recortada y un leve tornasol; el alfa (128..255) dice cuánto brilla cada téxel.
import { boxUV } from '../render/PlayerSkin';
import type { ArmorTexture } from './armorTextures';

export const ELYTRA_LAYOUT = { u: 22, v: 0, w: 10, h: 20, d: 2 };
const S = 64;

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** ¿Hay ala en (cuerda c, envergadura s)? La punta, en flecha: el borde de salida se recorta en el último tercio. */
function solid(c: number, s: number): boolean {
  if (s <= 0.6) return true;
  return c <= 1 - ((s - 0.6) / 0.4) * 0.8;
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const ROOT: RGB = [62, 58, 76];
const TIP: RGB = [142, 140, 158];
const BONE: RGB = [206, 200, 186];
const SHAFT: RGB = [58, 54, 70];
const TINT: RGB = [120, 104, 168];

/** Color y brillo de un téxel del ala. `outer`: la cara de fuera (la que se ve por detrás), más viva. */
function shade(c: number, s: number, ci: number, sj: number, outer: boolean): [RGB, number] {
  let col = mix(ROOT, TIP, Math.pow(s, 0.8));
  // Plumas: franjas a lo largo de la envergadura, un raquis oscuro cada 2,5 téxeles de cuerda.
  const fe = c * 4;
  const inFeather = fe - Math.floor(fe);
  if (inFeather < 0.2 && s > 0.12) col = mix(col, SHAFT, 0.55);
  // Barbas en diagonal (hacia la punta y hacia fuera).
  else if ((ci + sj) % 3 === 0) col = mix(col, SHAFT, 0.18);
  // Escamas cerca del hombro.
  if (s < 0.2 && (ci + (sj >> 1)) % 2 === 0) col = mix(col, SHAFT, 0.25);
  // Borde de ataque de hueso y un filo oscuro en el de salida.
  if (c < 0.12) col = mix(col, BONE, 0.7);
  else if (!solid(c + 0.12, s) || c > 0.9) col = mix(col, SHAFT, 0.4);
  // Tornasol leve, más vivo en la cara de fuera y a media envergadura.
  const iri = Math.sin(s * 5.5 + c * 2.1) * 0.5 + 0.5;
  col = mix(col, TINT, (outer ? 0.22 : 0.1) * iri * (1 - Math.abs(s - 0.5)));
  const n = 1 + (hash(ci, sj, outer ? 7 : 3) - 0.5) * 0.1;
  const gloss = c < 0.12 ? 176 : inFeather < 0.2 ? 136 : outer ? 164 : 144;
  return [[col[0] * n, col[1] * n, col[2] * n], gloss];
}

/** Atlas de los élitros (el ala izquierda; la derecha es su reflejo, como el .mirror() de Java). */
export function generateElytraTexture(): ArmorTexture {
  const rgba = new Uint8Array(S * S * 4);
  const { u, v, w, h, d } = ELYTRA_LAYOUT;
  const faces = boxUV(u, v, w, h, d);
  for (let f = 0; f < 6; f++) {
    const [fu, fv, fw, fh] = faces[f];
    for (let j = 0; j < fh; j++) {
      for (let i = 0; i < fw; i++) {
        // Coordenadas del ala de cada cara (ver la malla: x de la caja = cuerda, y = envergadura).
        let c: number, s: number, ci: number, sj: number;
        switch (f) {
          case 0: c = 1; s = (j + 0.5) / h; ci = w - 1; sj = j; break; // borde de salida
          case 1: c = 0; s = (j + 0.5) / h; ci = 0; sj = j; break; // borde de ataque
          case 2: c = 1 - (i + 0.5) / w; s = 0; ci = w - 1 - i; sj = 0; break; // hombro
          case 3: c = (i + 0.5) / w; s = 1; ci = i; sj = h - 1; break; // punta
          case 4: c = 1 - (i + 0.5) / w; s = (j + 0.5) / h; ci = w - 1 - i; sj = j; break; // cara de dentro
          default: c = (i + 0.5) / w; s = (j + 0.5) / h; ci = i; sj = j; break; // cara de fuera
        }
        if (!solid(Math.min(c, 0.999), Math.min(s, 0.999))) continue;
        const [col, gloss] = shade(c, s, ci, sj, f === 5);
        const o = ((fv + j) * S + fu + i) * 4;
        rgba[o] = Math.max(0, Math.min(255, Math.round(col[0])));
        rgba[o + 1] = Math.max(0, Math.min(255, Math.round(col[1])));
        rgba[o + 2] = Math.max(0, Math.min(255, Math.round(col[2])));
        rgba[o + 3] = gloss;
      }
    }
  }
  return { width: S, height: S, rgba };
}
