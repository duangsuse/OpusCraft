// Iluminación (luz de cielo + luz de bloques por inundación BFS) y mallado de una columna de chunk.
// Se ejecuta en los Web Workers. Trabaja sobre un volumen de 3x3 columnas (48x48) para que la luz
// que llega desde los chunks vecinos (hasta 15 bloques) sea correcta.
//
// Formato de vértice (2 x uint32):
//   A: x+16 (9 bits, 1/16 de bloque) | z+16 (9 bits) << 9 | y − MIN_Y (13 bits) << 18 | capa bit 9 << 31
//   B: u (5) | v (5) << 5 | capa bits 0–8 << 10 | normal (3) << 19 | ao (2) << 22 | cielo (4) << 24 | bloque (4) << 28
// (La capa de textura tiene 10 bits: hasta 1024 texturas.)
// Cada quad son 4 vértices; se dibujan con un buffer de índices compartido (0,1,2, 0,2,3).
import {
  AIR, BEDROCK, ICE, GLASS, CACTUS, SUGAR_CANE,
  BLOCK_RENDER, BLOCK_OPAQUE, BLOCK_AO, BLOCK_LIGHT_OPACITY, BLOCK_EMISSION, BLOCK_TEX, BLOCK_FLUID, BLOCK_SOLID, BLOCK_TEXROT,
  BLOCK_FLUID_LEVEL, R_NONE, R_CUBE, R_CUTOUT, R_CROSS, R_WATER, R_TRANSLUCENT, R_TORCH, R_CACTUS, R_LAVA, R_MODEL,
  BLOCK_MODEL_CUTOUT, BLOCK_WALL, R_CROP, fluidHeight, blockModel, isFarmland, isCrop,
  BLOCK_MODEL_TRANSLUCENT, // Fase 6.5 (colores)
} from '../../../shared/blocks';
import { WATER, BLOCK_WATERLOGGED } from '../../../shared/blocks'; // Fase 6.5 (océano y plantas)
import { skullPose } from '../../../shared/blocks'; // Fase 6.5 (colecciones)
import { R_RAIL, RAIL_SHAPE } from '../../../shared/blocks'; // Fase 7 (transporte)
import { DIR_X, DIR_Z } from '../../../shared/blockModels';
import { BLOCK_SOUL_LIGHT } from '../../../shared/blocks'; // Fase 8 (entorno del Nether)
import { dimensionDef } from '../../../shared/dimensions';
import { hash2, MIN_Y, WORLD_HEIGHT, CHUNK_VOLUME } from '../../../shared/constants';

const W = 48; // ancho del volumen de trabajo (3 chunks)
// Filas de trabajo: la 0 es sólida (bajo el fondo del mundo), la r es la fila de columna r − 1
// (y = MIN_Y + r − 1) y la última, aire.
const H = WORLD_HEIGHT + 2;
const SZ = W; // paso en z
const SY = W * W; // paso en y
const VOL = W * W * H;
const QUEUE_SIZE = 1 << 21;
const QUEUE_MASK = QUEUE_SIZE - 1;
/** Fase 6.5 (colecciones): cara a la que pasa cada cara (+X, −X, +Y, −Y, +Z, −Z) en un giro de 90° (norte → este). */
const TURN_FACE = [4, 5, 2, 3, 1, 0];

export interface MeshResult {
  opaque: Uint32Array;
  cutout: Uint32Array;
  translucent: Uint32Array;
  /** Luz del chunk central: (cielo << 4) | bloque, con el índice de blockIndex. */
  light: Uint8Array;
  minY: number;
  maxY: number;
}

class QuadBuffer {
  data = new Uint32Array(1 << 16);
  length = 0;
  reset(): void {
    this.length = 0;
  }
  ensure(extra: number): void {
    if (this.length + extra > this.data.length) {
      let n = this.data.length * 2;
      while (n < this.length + extra) n *= 2;
      const d = new Uint32Array(n);
      d.set(this.data.subarray(0, this.length));
      this.data = d;
    }
  }
  result(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}

// Definición de caras: normal, esquinas (BL, BR, TR, TL) en coordenadas 0/1 del cubo.
// Orden de caras: +X, -X, +Y, -Y, +Z, -Z.
const FACE_NORMALS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const FACE_CORNERS: number[][][] = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const CORNER_U = [0, 16, 16, 0];
const CORNER_V = [16, 16, 0, 0];

/** Desplazamiento de índice del vecino en cada dirección. */
const FACE_OFFSET = FACE_NORMALS.map(([x, y, z]) => x + z * SZ + y * SY);

// Para cada cara y vértice: desplazamientos (relativos a la celda frontal) de lado1, lado2, esquina.
const AO_OFFSETS: Int32Array[] = [];
for (let f = 0; f < 6; f++) {
  const n = FACE_NORMALS[f];
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  const ta = axis === 0 ? 1 : 0; // primer eje tangente
  const tb = axis === 2 ? 1 : 2; // segundo eje tangente
  const stride = [1, SY, SZ];
  const arr = new Int32Array(12);
  for (let k = 0; k < 4; k++) {
    const c = FACE_CORNERS[f][k];
    const sa = c[ta] === 1 ? 1 : -1;
    const sb = c[tb] === 1 ? 1 : -1;
    arr[k * 3] = sa * stride[ta];
    arr[k * 3 + 1] = sb * stride[tb];
    arr[k * 3 + 2] = sa * stride[ta] + sb * stride[tb];
  }
  AO_OFFSETS.push(arr);
}

export class Mesher {
  private vox = new Uint16Array(VOL);
  private sky = new Uint8Array(VOL);
  private blk = new Uint8Array(VOL);
  private queue = new Int32Array(QUEUE_SIZE);
  private heightMap = new Int16Array(W * W);
  private opaque = new QuadBuffer();
  private cutout = new QuadBuffer();
  private translucent = new QuadBuffer();
  private seed = 0;
  private tAo = new Int32Array(4);
  private tSl = new Int32Array(4);
  private tBl = new Int32Array(4);
  private tU = new Int32Array(4); // Fase 6.5 (colores)
  private tV = new Int32Array(4);

  setSeed(seed: number): void {
    this.seed = seed | 0;
  }

  /**
   * Fase 8 (entorno del Nether): en las dimensiones sin luz del cielo, su canal (4 bits por vértice y en la luz
   * del chunk) lleva la luz de alma, que el shader pinta en turquesa.
   */
  private soulChannel = false;
  setDim(dim: number): void {
    this.soulChannel = !dimensionDef(dim).skyLight;
  }

  /**
   * chunks: 9 columnas en orden (dz+1)*3 + (dx+1), cada una Uint16Array(CHUNK_VOLUME) con el índice
   * de blockIndex (fila = y − MIN_Y). Dentro del mallador las alturas son filas de columna.
   */
  mesh(chunks: Uint16Array[], cx: number, cz: number): MeshResult {
    const top = this.fillVolume(chunks);
    if (this.soulChannel) this.computeBlockLight(top, this.sky, true);
    else this.computeSkyLight(top);
    this.computeBlockLight(top);
    return this.buildMesh(top, cx, cz);
  }

  /**
   * Copia las 9 columnas al volumen de trabajo. Las columnas pueden venir truncadas en altura
   * (sólo las filas hasta su bloque más alto); el resto se considera aire.
   * Devuelve la fila de trabajo superior (completamente de aire).
   */
  private fillVolume(chunks: Uint16Array[]): number {
    const vox = this.vox;
    let maxY = 0;
    for (let c = 0; c < 9; c++) {
      const src = chunks[c];
      const rows = src.length >> 8;
      for (let y = rows - 1; y > maxY; y--) {
        const base = y << 8;
        let any = false;
        for (let i = 0; i < 256; i++) {
          if (src[base + i] !== 0) {
            any = true;
            break;
          }
        }
        if (any) {
          maxY = y;
          break;
        }
      }
    }
    const topRow = Math.min(H - 1, maxY + 2); // fila = y + 1
    vox.fill(0, 0, (topRow + 1) * SY);
    // Fila 0 (bajo el fondo del mundo): sólida para ocultar su cara inferior.
    vox.fill(BEDROCK, 0, SY);
    for (let c = 0; c < 9; c++) {
      const src = chunks[c];
      const rows = Math.min(src.length >> 8, maxY + 1);
      const ox = (c % 3) * 16;
      const oz = Math.floor(c / 3) * 16;
      for (let y = 0; y < rows; y++) {
        const rowBase = (y + 1) * SY;
        const srcBase = y << 8;
        for (let z = 0; z < 16; z++) {
          const d = rowBase + (oz + z) * SZ + ox;
          const s = srcBase + (z << 4);
          for (let x = 0; x < 16; x++) vox[d + x] = src[s + x];
        }
      }
    }
    return topRow;
  }

  private computeSkyLight(topRow: number): void {
    const vox = this.vox;
    const sky = this.sky;
    const q = this.queue;
    const hm = this.heightMap;
    let head = 0;
    let tail = 0;
    sky.fill(0, 0, (topRow + 1) * SY);
    // Pasada por columnas: la luz del cielo baja sin atenuarse por el aire.
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        let light = 15;
        let h = -1;
        const col = z * SZ + x;
        for (let r = topRow; r >= 1; r--) {
          const i = r * SY + col;
          const op = BLOCK_LIGHT_OPACITY[vox[i]];
          if (op >= 15) light = 0;
          else if (op > 0) light = light > op ? light - op : 0;
          if (light === 0) {
            if (h < 0) h = r;
            break;
          }
          sky[i] = light;
          if (light < 15) {
            if (h < 0) h = r;
            q[tail++ & QUEUE_MASK] = i;
          }
        }
        hm[z * W + x] = h; // filas > h tienen luz 15
      }
    }
    // Semillas: celdas con luz 15 junto a columnas más cubiertas.
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const h = hm[z * W + x];
        let maxN = h;
        if (x > 0) maxN = Math.max(maxN, hm[z * W + x - 1]);
        if (x < W - 1) maxN = Math.max(maxN, hm[z * W + x + 1]);
        if (z > 0) maxN = Math.max(maxN, hm[(z - 1) * W + x]);
        if (z < W - 1) maxN = Math.max(maxN, hm[(z + 1) * W + x]);
        for (let r = h + 1; r <= maxN; r++) {
          q[tail++ & QUEUE_MASK] = r * SY + z * SZ + x;
        }
      }
    }
    // Propagación BFS.
    while (head !== tail) {
      const i = q[head++ & QUEUE_MASK];
      const L = sky[i];
      if (L <= 1) continue;
      const x = i % W;
      const z = ((i / W) | 0) % W;
      const r = (i / SY) | 0;
      if (x > 0) tail = this.spread(sky, i - 1, L, tail);
      if (x < W - 1) tail = this.spread(sky, i + 1, L, tail);
      if (z > 0) tail = this.spread(sky, i - SZ, L, tail);
      if (z < W - 1) tail = this.spread(sky, i + SZ, L, tail);
      if (r > 1) tail = this.spread(sky, i - SY, L, tail);
      if (r < topRow) tail = this.spread(sky, i + SY, L, tail);
    }
  }

  private spread(arr: Uint8Array, n: number, L: number, tail: number): number {
    const op = BLOCK_LIGHT_OPACITY[this.vox[n]];
    if (op >= 15) return tail;
    const nl = L - (op > 1 ? op : 1);
    if (nl > arr[n]) {
      arr[n] = nl;
      this.queue[tail & QUEUE_MASK] = n;
      return tail + 1;
    }
    return tail;
  }

  /** Luz de bloque (o, con `soul`, sólo la de los bloques de alma) por BFS desde lo que emite. */
  private computeBlockLight(topRow: number, blk = this.blk, soul = false): void {
    const vox = this.vox;
    const q = this.queue;
    let head = 0;
    let tail = 0;
    const end = (topRow + 1) * SY;
    blk.fill(0, 0, end);
    for (let i = SY; i < end; i++) {
      const e = BLOCK_EMISSION[vox[i]];
      if (e > 0 && (!soul || BLOCK_SOUL_LIGHT[vox[i]])) {
        blk[i] = e;
        q[tail++ & QUEUE_MASK] = i;
      }
    }
    while (head !== tail) {
      const i = q[head++ & QUEUE_MASK];
      const L = blk[i];
      if (L <= 1) continue;
      const x = i % W;
      const z = ((i / W) | 0) % W;
      const r = (i / SY) | 0;
      if (x > 0) tail = this.spread(blk, i - 1, L, tail);
      if (x < W - 1) tail = this.spread(blk, i + 1, L, tail);
      if (z > 0) tail = this.spread(blk, i - SZ, L, tail);
      if (z < W - 1) tail = this.spread(blk, i + SZ, L, tail);
      if (r > 1) tail = this.spread(blk, i - SY, L, tail);
      if (r < topRow) tail = this.spread(blk, i + SY, L, tail);
    }
  }

  private buildMesh(topRow: number, cx: number, cz: number): MeshResult {
    const vox = this.vox;
    const sky = this.sky;
    const blk = this.blk;
    this.opaque.reset();
    this.cutout.reset();
    this.translucent.reset();
    let minY = 1e9;
    let maxY = -1e9;
    const maxRow = Math.min(topRow, WORLD_HEIGHT);

    for (let r = 1; r <= maxRow; r++) {
      const y = r - 1;
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const i = r * SY + (z + 16) * SZ + (x + 16);
          const id = vox[i];
          if (id === AIR) continue;
          const render = BLOCK_RENDER[id];
          if (render === R_NONE) continue;
          let emitted = false;
          switch (render) {
            case R_CUBE:
            case R_CUTOUT:
            case R_TRANSLUCENT:
            case R_WATER:
            case R_LAVA:
              emitted = this.emitCube(i, id, render, x, y, z);
              break;
            case R_CROSS:
              this.emitCross(i, id, x, y, z, cx, cz);
              emitted = true;
              break;
            case R_TORCH:
              this.emitTorch(i, id, x, y, z);
              emitted = true;
              break;
            case R_MODEL:
              emitted = this.emitModel(i, id, x, y, z);
              break;
            case R_CROP:
              this.emitCrop(i, id, x, y, z);
              emitted = true;
              break;
            case R_CACTUS:
              this.emitCactus(i, id, x, y, z);
              emitted = true;
              break;
            case R_RAIL: // Fase 7 (transporte)
              this.emitRail(i, id, x, y, z);
              emitted = true;
              break;
          }
          // Fase 6.5 (océano y plantas): las plantas y corales anegados llevan agua en su celda.
          if (BLOCK_WATERLOGGED[id] && this.emitCube(i, WATER, R_WATER, x, y, z)) emitted = true;
          if (emitted) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }

    // Luz del chunk central para consultas en el hilo principal.
    const light = new Uint8Array(CHUNK_VOLUME);
    for (let y = 0; y < WORLD_HEIGHT && y + 1 <= topRow; y++) {
      const r = y + 1;
      for (let z = 0; z < 16; z++) {
        const src = r * SY + (z + 16) * SZ + 16;
        const dst = (y << 8) | (z << 4);
        for (let x = 0; x < 16; x++) light[dst + x] = (sky[src + x] << 4) | blk[src + x];
      }
    }
    // Por encima de la fila de trabajo todo es cielo abierto.
    for (let y = Math.max(0, topRow); y < WORLD_HEIGHT; y++) light.fill(this.soulChannel ? 0 : 0xf0, y << 8, (y + 1) << 8);

    return {
      opaque: this.opaque.result(),
      cutout: this.cutout.result(),
      translucent: this.translucent.result(),
      light,
      // En alturas del mundo (para el recorte por frustum).
      minY: minY === 1e9 ? MIN_Y : minY + MIN_Y,
      maxY: maxY === -1e9 ? MIN_Y : maxY + 1 + MIN_Y,
    };
  }

  private faceVisible(id: number, render: number, nid: number): boolean {
    if (BLOCK_OPAQUE[nid]) return false;
    switch (render) {
      case R_CUBE:
        return true;
      case R_LAVA:
        return BLOCK_FLUID[nid] !== 2;
      case R_CUTOUT:
        return id !== GLASS || nid !== GLASS;
      case R_WATER:
        return BLOCK_FLUID[nid] !== 1 && nid !== ICE;
      case R_TRANSLUCENT:
        // Fase 6.5 (colores): entre dos cristales iguales (de color o tintados) no hay cara.
        return nid !== ICE && nid !== id;
      default:
        return true;
    }
  }

  private emitCube(i: number, id: number, render: number, x: number, y: number, z: number): boolean {
    const liquid = render === R_WATER || render === R_LAVA;
    const hts = liquid ? this.liquidHeights(i, id) : null;
    const buf = render === R_CUBE || render === R_LAVA ? this.opaque : render === R_CUTOUT ? this.cutout : this.translucent;
    let any = false;
    for (let f = 0; f < 6; f++) {
      const n = i + FACE_OFFSET[f];
      const nid = this.vox[n];
      if (!this.faceVisible(id, render, nid)) continue;
      any = true;
      this.emitFace(buf, i, n, f, id, x, y, z, hts);
    }
    return any;
  }

  private tHts = new Int32Array(4);

  /**
   * Altura (en 1/16) de las cuatro esquinas de la superficie de un fluido, promediando las
   * celdas que comparten cada esquina como Minecraft (las fuentes pesan más). Índice x + z*2.
   */
  private liquidHeights(i: number, id: number): Int32Array | null {
    const vox = this.vox;
    const f = BLOCK_FLUID[id];
    const up = vox[i + SY];
    if (BLOCK_FLUID[up] === f || BLOCK_OPAQUE[up]) return null;
    const out = this.tHts;
    for (let cz = 0; cz < 2; cz++) {
      for (let cx = 0; cx < 2; cx++) {
        let sum = 0, weight = 0, full = false;
        for (let dz = cz - 1; dz <= cz && !full; dz++) {
          for (let dx = cx - 1; dx <= cx; dx++) {
            const j = i + dx + dz * SZ;
            const nid = vox[j];
            if (BLOCK_FLUID[nid] === f) {
              if (BLOCK_FLUID[vox[j + SY]] === f) {
                full = true;
                break;
              }
              const h = fluidHeight(nid);
              if (BLOCK_FLUID_LEVEL[nid] === 0 || h >= 0.8) {
                sum += h * 10;
                weight += 10;
              } else {
                sum += h;
                weight += 1;
              }
            } else if (!BLOCK_SOLID[nid]) {
              weight += 1;
            }
          }
        }
        const h = full ? 16 : weight > 0 ? Math.round((sum / weight) * 16) : 14;
        out[cx + cz * 2] = Math.max(1, Math.min(16, h));
      }
    }
    return out;
  }

  /** Emite una cara de cubo con AO e iluminación suave. */
  private emitFace(
    buf: QuadBuffer, i: number, front: number, f: number, id: number,
    x: number, y: number, z: number, hts: Int32Array | null,
  ): void {
    const vox = this.vox;
    const sky = this.sky;
    const blk = this.blk;
    const layer = BLOCK_TEX[id * 6 + f];
    const corners = FACE_CORNERS[f];
    const offs = AO_OFFSETS[f];
    const ao = this.tAo;
    const sl = this.tSl;
    const bl = this.tBl;
    const fs = sky[front];
    const fb = blk[front];
    for (let k = 0; k < 4; k++) {
      const s1 = front + offs[k * 3];
      const s2 = front + offs[k * 3 + 1];
      const c = front + offs[k * 3 + 2];
      const o1 = BLOCK_AO[vox[s1]];
      const o2 = BLOCK_AO[vox[s2]];
      const oc = BLOCK_AO[vox[c]];
      ao[k] = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      let ss = fs;
      let sb = fb;
      let cnt = 1;
      const p1 = BLOCK_OPAQUE[vox[s1]];
      const p2 = BLOCK_OPAQUE[vox[s2]];
      if (!p1) {
        ss += sky[s1];
        sb += blk[s1];
        cnt++;
      }
      if (!p2) {
        ss += sky[s2];
        sb += blk[s2];
        cnt++;
      }
      if ((!p1 || !p2) && !BLOCK_OPAQUE[vox[c]]) {
        ss += sky[c];
        sb += blk[c];
        cnt++;
      }
      sl[k] = Math.round(ss / cnt);
      bl[k] = Math.round(sb / cnt);
    }
    const flip = ao[0] + ao[2] > ao[1] + ao[3];
    // Textura girada 90° (troncos tumbados): cada esquina toma la UV de la siguiente.
    const rot = (BLOCK_TEXROT[id] >> f) & 1;
    buf.ensure(8);
    const d = buf.data;
    let o = buf.length;
    for (let kk = 0; kk < 4; kk++) {
      const k = flip ? (kk + 1) & 3 : kk;
      const kr = rot ? (k + 1) & 3 : k;
      const c = corners[k];
      const px = (x + c[0]) * 16;
      const pz = (z + c[2]) * 16;
      let py = y * 16 + c[1] * 16;
      let v = CORNER_V[kr];
      if (c[1] === 1 && hts) {
        const h = hts[c[0] + c[2] * 2];
        py = y * 16 + h;
        if (f !== 2) v = 16 - h;
      }
      d[o++] = (px + 16) | ((pz + 16) << 9) | (py << 18) | ((layer >> 9) << 31);
      d[o++] = CORNER_U[kr] | (v << 5) | ((layer & 511) << 10) | (f << 19) | (ao[k] << 22) | (sl[k] << 24) | (bl[k] << 28);
    }
    buf.length = o;
  }

  private pushVertex(
    buf: QuadBuffer, px: number, py: number, pz: number, u: number, v: number,
    layer: number, normal: number, ao: number, sl: number, bl: number,
  ): void {
    const d = buf.data;
    const o = buf.length;
    d[o] = (px + 16) | ((pz + 16) << 9) | (py << 18) | ((layer >> 9) << 31);
    d[o + 1] = u | (v << 5) | ((layer & 511) << 10) | (normal << 19) | (ao << 22) | (sl << 24) | (bl << 28);
    buf.length = o + 2;
  }

  private emitCross(i: number, id: number, x: number, y: number, z: number, cx: number, cz: number): void {
    const layer = BLOCK_TEX[id * 6];
    const sl = this.sky[i];
    const bl = this.blk[i];
    // Desplazamiento aleatorio por columna (igual para plantas apiladas).
    const h = hash2(cx * 16 + x, cz * 16 + z, this.seed ^ 0x51a7);
    // La caña y los tallos (cultivos en cruz) van centrados; los tallos, hundidos en la tierra de cultivo.
    const still = id === SUGAR_CANE || isCrop(id);
    const ox = still ? 0 : (h & 7) - 3;
    const oz = still ? 0 : ((h >>> 3) & 7) - 3;
    const bx = x * 16 + ox;
    const bz = z * 16 + oz;
    const by = y * 16 - (isCrop(id) && isFarmland(this.vox[i - SY]) ? 1 : 0);
    const buf = this.cutout;
    buf.ensure(32);
    // Dos planos diagonales, cada uno con sus dos caras.
    const planes = [
      [1, 1, 15, 15],
      [1, 15, 15, 1],
    ];
    for (const [ax, az, bxx, bzz] of planes) {
      // cara frontal: BL, BR, TR, TL
      this.pushVertex(buf, bx + ax, by, bz + az, 0, 16, layer, 6, 2, sl, bl);
      this.pushVertex(buf, bx + bxx, by, bz + bzz, 16, 16, layer, 6, 2, sl, bl);
      this.pushVertex(buf, bx + bxx, by + 16, bz + bzz, 16, 0, layer, 6, 3, sl, bl);
      this.pushVertex(buf, bx + ax, by + 16, bz + az, 0, 0, layer, 6, 3, sl, bl);
      // cara trasera (orden inverso)
      this.pushVertex(buf, bx + bxx, by, bz + bzz, 16, 16, layer, 6, 2, sl, bl);
      this.pushVertex(buf, bx + ax, by, bz + az, 0, 16, layer, 6, 2, sl, bl);
      this.pushVertex(buf, bx + ax, by + 16, bz + az, 0, 0, layer, 6, 3, sl, bl);
      this.pushVertex(buf, bx + bxx, by + 16, bz + bzz, 16, 0, layer, 6, 3, sl, bl);
    }
  }

  /** Cultivo: cuatro planos en forma de # (a 4/16 y 12/16), 1/16 más bajo sobre tierra de cultivo. */
  private emitCrop(i: number, id: number, x: number, y: number, z: number): void {
    const layer = BLOCK_TEX[id * 6];
    const sl = this.sky[i];
    const bl = this.blk[i];
    const bx = x * 16, bz = z * 16;
    const by = y * 16 - (isFarmland(this.vox[i - SY]) ? 1 : 0);
    const buf = this.cutout;
    buf.ensure(64);
    for (const k of [4, 12]) {
      // Plano paralelo a Z (x = k) y plano paralelo a X (z = k), cada uno con sus dos caras.
      const planes = [
        [k, 0, k, 16],
        [0, k, 16, k],
      ];
      for (const [ax, az, cx2, cz2] of planes) {
        this.pushVertex(buf, bx + ax, by, bz + az, 0, 16, layer, 6, 2, sl, bl);
        this.pushVertex(buf, bx + cx2, by, bz + cz2, 16, 16, layer, 6, 2, sl, bl);
        this.pushVertex(buf, bx + cx2, by + 16, bz + cz2, 16, 0, layer, 6, 3, sl, bl);
        this.pushVertex(buf, bx + ax, by + 16, bz + az, 0, 0, layer, 6, 3, sl, bl);
        this.pushVertex(buf, bx + cx2, by, bz + cz2, 16, 16, layer, 6, 2, sl, bl);
        this.pushVertex(buf, bx + ax, by, bz + az, 0, 16, layer, 6, 2, sl, bl);
        this.pushVertex(buf, bx + ax, by + 16, bz + az, 0, 0, layer, 6, 3, sl, bl);
        this.pushVertex(buf, bx + cx2, by + 16, bz + cz2, 16, 0, layer, 6, 3, sl, bl);
      }
    }
  }

  private emitTorch(i: number, id: number, x: number, y: number, z: number): void {
    const layer = BLOCK_TEX[id * 6];
    const sl = this.sky[i];
    const bl = this.blk[i];
    const bx = x * 16, by = y * 16, bz = z * 16;
    const buf = this.cutout;
    buf.ensure(40);
    // Antorcha de pared: la base se acerca a la pared (5/16) y la punta se inclina hacia fuera.
    const wall = BLOCK_WALL[id];
    const wx = wall >= 0 ? -DIR_X[wall] : 0, wz = wall >= 0 ? -DIR_Z[wall] : 0;
    const P = (f: number, pts: number[][]) => {
      for (const p of pts) {
        const shift = wall >= 0 ? (p[1] <= 0 ? 6 : 2) : 0;
        this.pushVertex(buf, bx + p[0] + wx * shift, by + p[1] + (wall >= 0 ? 3 : 0), bz + p[2] + wz * shift, p[3], p[4], layer, f, 3, sl, bl);
      }
    };
    // +X (u = 16 - z), -X (u = z), +Z (u = x), -Z (u = 16 - x); v de 16 (abajo) a 6 (arriba)
    P(0, [[9, 0, 9, 7, 16], [9, 0, 7, 9, 16], [9, 10, 7, 9, 6], [9, 10, 9, 7, 6]]);
    P(1, [[7, 0, 7, 7, 16], [7, 0, 9, 9, 16], [7, 10, 9, 9, 6], [7, 10, 7, 7, 6]]);
    P(4, [[7, 0, 9, 7, 16], [9, 0, 9, 9, 16], [9, 10, 9, 9, 6], [7, 10, 9, 7, 6]]);
    P(5, [[9, 0, 7, 7, 16], [7, 0, 7, 9, 16], [7, 10, 7, 9, 6], [9, 10, 7, 7, 6]]);
    // tapa superior (llama)
    P(2, [[7, 10, 9, 7, 8], [9, 10, 9, 9, 8], [9, 10, 7, 9, 6], [7, 10, 7, 7, 6]]);
  }

  /**
   * Bloque hecho de cajas: cada cara se dibuja salvo que esté en el borde del bloque y el vecino
   * sea opaco. Las UV salen de la posición (como en los cubos) y la luz, de la celda a la que mira.
   */
  private emitModel(i: number, id: number, x: number, y: number, z: number): boolean {
    const vox = this.vox;
    const boxes = blockModel(id, (dx, dy, dz) => vox[i + dx + dz * SZ + dy * SY]);
    if (!boxes || boxes.length === 0) return false;
    // Fase 6.5 (colores): los paneles de cristal de color van en la pasada translúcida.
    const buf = BLOCK_MODEL_TRANSLUCENT[id] ? this.translucent : BLOCK_MODEL_CUTOUT[id] ? this.cutout : this.opaque;
    const bx = x * 16, by = y * 16, bz = z * 16;
    const us = this.tU, vs = this.tV;
    // Fase 6.5 (colecciones): las cabezas se giran (de 22,5° en 22,5°) y se desplazan al suelo o a la pared.
    const pose = skullPose(id);
    const turns = pose ? (Math.round(Math.atan2(pose[1], pose[0]) / (Math.PI / 2)) + 4) & 3 : 0;
    let any = false;
    for (const b of boxes) {
      const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
      for (let f = 0; f < 6; f++) {
        const layer = b.tex[f];
        if (layer < 0) continue;
        let nf = f;
        for (let t = 0; t < turns; t++) nf = TURN_FACE[nf];
        const onEdge = (f === 0 && b.x1 === 16) || (f === 1 && b.x0 === 0) || (f === 2 && b.y1 === 16) ||
          (f === 3 && b.y0 === 0) || (f === 4 && b.z1 === 16) || (f === 5 && b.z0 === 0);
        let li = i;
        if (onEdge) {
          const n = i + FACE_OFFSET[f];
          if (BLOCK_OPAQUE[vox[n]]) continue;
          li = n;
        }
        const sl = this.sky[li], bl = this.blk[li];
        buf.ensure(8);
        const corners = FACE_CORNERS[f];
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          const px = c[0] ? hi[0] : lo[0], py = c[1] ? hi[1] : lo[1], pz = c[2] ? hi[2] : lo[2];
          let u: number, v: number;
          switch (f) {
            case 0: u = 16 - pz; v = 16 - py; break;
            case 1: u = pz; v = 16 - py; break;
            case 2: u = px; v = pz; break;
            case 3: u = px; v = 16 - pz; break;
            case 4: u = px; v = 16 - py; break;
            default: u = 16 - px; v = 16 - py; break;
          }
          us[k] = u;
          vs[k] = v;
        }
        // Fase 6.5 (colores): cajas que salen del bloque (estandartes de dos de alto): la UV se desplaza
        // un múltiplo de 16 (la textura se repite) para que quepa en los 5 bits del vértice.
        const su = Math.floor(Math.min(us[0], us[1], us[2], us[3]) / 16) * 16;
        const sv = Math.floor(Math.min(vs[0], vs[1], vs[2], vs[3]) / 16) * 16;
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          let px = c[0] ? hi[0] : lo[0], py = c[1] ? hi[1] : lo[1], pz = c[2] ? hi[2] : lo[2];
          if (pose) {
            const dx = px - 8, dz = pz - 8;
            px = Math.round(8 + dx * pose[0] - dz * pose[1] + pose[2]);
            py += pose[3];
            pz = Math.round(8 + dx * pose[1] + dz * pose[0] + pose[4]);
          }
          this.pushVertex(buf, bx + px, by + py, bz + pz, us[k] - su, vs[k] - sv, layer, nf, 3, sl, bl);
        }
        any = true;
      }
    }
    return any;
  }

  /**
   * Fase 7 (transporte): raíl. Un plano a 1/16 del suelo (o en cuesta, de 1/16 a 17/16) con la textura
   * girada según la forma: las rectas se dibujan de norte a sur y la curva de sur a este; se ve por las
   * dos caras (desde abajo, a través del cristal o en las cuestas).
   */
  private emitRail(i: number, id: number, x: number, y: number, z: number): void {
    const shape = RAIL_SHAPE[id];
    const layer = BLOCK_TEX[id * 6 + 2];
    const sl = this.sky[i], bl = this.blk[i];
    const bx = x * 16, by = y * 16, bz = z * 16;
    // Cuartos de vuelta de la textura (en el sentido de las agujas del reloj visto desde arriba).
    const turns = shape >= 6 ? shape - 6 : shape === 1 || shape === 2 || shape === 3 ? 1 : 0;
    // Esquinas (x, z en 1/16) en el orden BL, BR, TR, TL de la cara de arriba y su altura.
    const cx = [0, 16, 16, 0], cz = [16, 16, 0, 0];
    const h = [1, 1, 1, 1];
    for (let k = 0; k < 4; k++) {
      if ((shape === 2 && cx[k] === 16) || (shape === 3 && cx[k] === 0) || (shape === 4 && cz[k] === 0) || (shape === 5 && cz[k] === 16)) h[k] = 17;
    }
    const buf = this.cutout;
    buf.ensure(16);
    const us = this.tU, vs = this.tV;
    for (let k = 0; k < 4; k++) {
      // UV: el punto de la textura sin girar que cae en esta esquina (girar hacia atrás `turns` veces).
      let u = cx[k] - 8, v = cz[k] - 8;
      for (let t = 0; t < turns; t++) [u, v] = [v, -u];
      us[k] = u + 8;
      vs[k] = v + 8;
    }
    for (let k = 0; k < 4; k++) this.pushVertex(buf, bx + cx[k], by + h[k], bz + cz[k], us[k], vs[k], layer, 2, 3, sl, bl);
    for (let k = 3; k >= 0; k--) this.pushVertex(buf, bx + cx[k], by + h[k], bz + cz[k], us[k], vs[k], layer, 3, 3, sl, bl);
  }

  private emitCactus(i: number, id: number, x: number, y: number, z: number): void {
    const vox = this.vox;
    const sl = this.sky[i];
    const bl = this.blk[i];
    const bx = x * 16, by = y * 16, bz = z * 16;
    const buf = this.cutout;
    buf.ensure(48);
    const side = BLOCK_TEX[id * 6];
    const topL = BLOCK_TEX[id * 6 + 2];
    const botL = BLOCK_TEX[id * 6 + 3];
    const P = (f: number, layer: number, pts: number[][]) => {
      for (const p of pts) this.pushVertex(buf, bx + p[0], by + p[1], bz + p[2], p[3], p[4], layer, f, 3, sl, bl);
    };
    P(0, side, [[15, 0, 16, 0, 16], [15, 0, 0, 16, 16], [15, 16, 0, 16, 0], [15, 16, 16, 0, 0]]);
    P(1, side, [[1, 0, 0, 0, 16], [1, 0, 16, 16, 16], [1, 16, 16, 16, 0], [1, 16, 0, 0, 0]]);
    P(4, side, [[0, 0, 15, 0, 16], [16, 0, 15, 16, 16], [16, 16, 15, 16, 0], [0, 16, 15, 0, 0]]);
    P(5, side, [[16, 0, 1, 0, 16], [0, 0, 1, 16, 16], [0, 16, 1, 16, 0], [16, 16, 1, 0, 0]]);
    const up = vox[i + SY];
    if (!BLOCK_OPAQUE[up] && up !== CACTUS) {
      P(2, topL, [[1, 16, 15, 1, 15], [15, 16, 15, 15, 15], [15, 16, 1, 15, 1], [1, 16, 1, 1, 1]]);
    }
    const down = vox[i - SY];
    if (!BLOCK_OPAQUE[down] && down !== CACTUS) {
      P(3, botL, [[1, 0, 1, 1, 15], [15, 0, 1, 15, 15], [15, 0, 15, 15, 1], [1, 0, 15, 1, 1]]);
    }
  }
}
