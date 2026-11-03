// Iconos isométricos de bloques (Canvas 2D) a partir de las texturas generadas.
import { BLOCKS, BLOCK_TEX, R_CROSS, R_TORCH, R_NONE, R_MODEL, blockItemModel } from '../../shared/blocks';
import { modelQuads } from '../../shared/blockModels';
import { TEXTURE_DEFS, textureLayer } from '../../shared/textureDefs';
import type { GeneratedTextures } from '../textures/generateTextures';
import { isSkull } from '../../shared/blocks'; // Fase 6.5 (colecciones)

const GRASS_TINT = [145, 189, 89];
const FOLIAGE_TINT = [113, 167, 55];

function layerCanvas(tex: GeneratedTextures, layer: number): HTMLCanvasElement {
  const size = tex.size;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const def = TEXTURE_DEFS[layer];
  const off = layer * size * size * 4;
  for (let i = 0; i < size * size; i++) {
    let r = tex.albedo[off + i * 4];
    let gg = tex.albedo[off + i * 4 + 1];
    let b = tex.albedo[off + i * 4 + 2];
    let a = tex.albedo[off + i * 4 + 3];
    const tint = def.tint === 1 || (def.tint === 2 && a > 127) ? GRASS_TINT : def.tint === 3 ? FOLIAGE_TINT : null;
    if (tint) {
      r = (r * tint[0]) / 255;
      gg = (gg * tint[1]) / 255;
      b = (b * tint[2]) / 255;
    }
    if (!def.cutout && def.special !== 1 && def.special !== 3) a = 255;
    if (def.special === 1) a = Math.max(a, 200);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Dibujante de iconos de bloque: devuelve una función id → dataURL que pinta cada icono la primera vez que se
 * pide (dibujarlos todos al arrancar eran miles de PNG y varios segundos antes de que respondiera el menú).
 */
export function blockIconMaker(tex: GeneratedTextures): (id: number) => string | undefined {
  const layers = new Map<number, HTMLCanvasElement>();
  const L = (i: number) => {
    let c = layers.get(i);
    if (!c) {
      c = layerCanvas(tex, i);
      layers.set(i, c);
    }
    return c;
  };
  const S = 64;
  return (id: number) => {
    const b = BLOCKS[id];
    if (!b || b.render === R_NONE) return undefined;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    if (b.render === R_CROSS || b.render === R_TORCH || b.flatItem) {
      g.drawImage(L(b.flatItem ? textureLayer(b.flatItem) : BLOCK_TEX[b.id * 6]), 8, 8, 48, 48);
    } else if (b.render === R_MODEL) {
      drawModelIcon(g, blockItemModel(b.id), L, tex.size);
      // Fase 6.5 (colecciones): las cabezas (medio bloque de lado) se ven más grandes en el inventario.
      if (isSkull(b.id)) enlargeIcon(cv, 1.75);
    } else {
      const top = L(BLOCK_TEX[b.id * 6 + 2]);
      const left = L(BLOCK_TEX[b.id * 6 + 4]);
      const right = L(BLOCK_TEX[b.id * 6 + 0]);
      const k = 26 / 16; // tamaño del texel en el icono
      const face = (img: HTMLCanvasElement, a: number, bb: number, c: number, d: number, e: number, f: number, dark: number) => {
        g.save();
        g.setTransform(a, bb, c, d, e, f);
        g.drawImage(img, 0, 0);
        if (dark > 0) {
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = `rgba(0,0,0,${dark})`;
          g.fillRect(0, 0, 16, 16);
        }
        g.restore();
      };
      // Cara superior (rombo), izquierda y derecha.
      face(top, k, -k / 2, k, k / 2, 6, 18.5, 0);
      face(left, k, k / 2, 0, k, 6, 18.5, 0.22);
      face(right, k, -k / 2, 0, k, 32, 31.5, 0.4);
    }
    return cv.toDataURL();
  };
}

/** Fase 6.5 (colecciones): amplía el dibujo de un icono alrededor de su centro. */
function enlargeIcon(cv: HTMLCanvasElement, k: number): void {
  const tmp = document.createElement('canvas');
  tmp.width = cv.width;
  tmp.height = cv.height;
  tmp.getContext('2d')!.drawImage(cv, 0, 0);
  const g = cv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.imageSmoothingEnabled = false;
  const w = cv.width / k, h = cv.height / k;
  g.drawImage(tmp, 32 - w / 2, 31.5 - h / 2, w, h, 0, 0, cv.width, cv.height);
}

/** Proyección isométrica del icono (dieciseisavos → píxeles): vista desde el sureste y arriba. */
const ISO_K = 26 / 16;
function iso(x: number, y: number, z: number): [number, number] {
  return [32 + (x - z) * ISO_K, 31.5 + ((x + z) / 2 - y) * ISO_K];
}

/**
 * Icono de un bloque hecho de cajas: se pintan las caras visibles (+X, +Y, +Z) de la más lejana a la
 * más cercana, cada una con su trozo de textura (las mismas UV que en el mundo).
 */
function drawModelIcon(
  g: CanvasRenderingContext2D, boxes: ReturnType<typeof blockItemModel>, L: (i: number) => HTMLCanvasElement, size: number,
): void {
  const DARK = [0.4, 0, 0, 0, 0.22, 0];
  const faces = modelQuads(boxes).filter((q) => q.face === 0 || q.face === 2 || q.face === 4);
  const depth = (q: (typeof faces)[number]) => {
    let d = 0;
    for (let k = 0; k < 4; k++) d += q.p[k * 3] + q.p[k * 3 + 1] + q.p[k * 3 + 2];
    return d;
  };
  faces.sort((a, b) => depth(a) - depth(b));
  const px = size / 16;
  for (const q of faces) {
    // Esquinas con UV (0,1), (1,1) y (0,0) del cuadro: sirven para la transformación afín.
    const u0 = Math.min(q.uv[0], q.uv[2], q.uv[4], q.uv[6]), u1 = Math.max(q.uv[0], q.uv[2], q.uv[4], q.uv[6]);
    const v0 = Math.min(q.uv[1], q.uv[3], q.uv[5], q.uv[7]), v1 = Math.max(q.uv[1], q.uv[3], q.uv[5], q.uv[7]);
    const sw = u1 - u0, sh = v1 - v0;
    if (sw <= 0 || sh <= 0) continue;
    const at = (u: number, v: number): [number, number] => {
      // Punto de la cara con esas UV (interpolación bilineal de las esquinas).
      const k = [0, 1, 2, 3].find((i) => q.uv[i * 2] === u && q.uv[i * 2 + 1] === v);
      if (k !== undefined) return iso(q.p[k * 3], q.p[k * 3 + 1], q.p[k * 3 + 2]);
      return [0, 0];
    };
    const A = at(u0, v0), B = at(u1, v0), C = at(u0, v1);
    g.save();
    g.setTransform((B[0] - A[0]) / (sw * px), (B[1] - A[1]) / (sw * px), (C[0] - A[0]) / (sh * px), (C[1] - A[1]) / (sh * px), A[0], A[1]);
    g.drawImage(L(q.layer), u0 * px, v0 * px, sw * px, sh * px, 0, 0, sw * px, sh * px);
    if (DARK[q.face] > 0) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(0,0,0,${DARK[q.face]})`;
      g.fillRect(0, 0, sw * px, sh * px);
    }
    g.restore();
  }
}
