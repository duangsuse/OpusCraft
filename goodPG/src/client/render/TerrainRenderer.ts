// Mallas de terreno en la GPU (una por columna y pasada), mapa de tinte de biomas,
// culling por frustum y dibujado.
import type { GL, Program } from '../engine/gl';
import type { Column, MeshSink, ChunkMeshHandle } from '../world/World';
import { CHUNK_SIZE, MIN_Y } from '../../shared/constants';

interface PassMesh {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  quads: number;
}

export class ColumnMesh implements ChunkMeshHandle {
  cx: number;
  cz: number;
  minY = 0;
  maxY = 0;
  opaque: PassMesh | null = null;
  cutout: PassMesh | null = null;
  translucent: PassMesh | null = null;
  /** Distancia a la cámara calculada en el último frame (para ordenar). */
  dist = 0;
  private owner: TerrainRenderer;
  constructor(owner: TerrainRenderer, cx: number, cz: number) {
    this.owner = owner;
    this.cx = cx;
    this.cz = cz;
  }
  dispose(): void {
    this.owner.disposeMesh(this);
  }
}

const BIOME_SIZE = 256; // texels (4 bloques por texel → 1024 bloques con repetición)

export class TerrainRenderer implements MeshSink {
  private gl: GL;
  private indexBuffer: WebGLBuffer;
  private indexQuads = 0;
  readonly meshes = new Set<ColumnMesh>();
  readonly biomeMap: WebGLTexture;
  private planes = new Float32Array(24);
  visibleOpaque: ColumnMesh[] = [];
  visibleTranslucent: ColumnMesh[] = [];
  shadowList: ColumnMesh[] = [];
  stats = { drawCalls: 0, quads: 0, meshes: 0 };

  constructor(gl: GL) {
    this.gl = gl;
    this.indexBuffer = gl.createBuffer()!;
    this.ensureIndices(1 << 17);
    this.biomeMap = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.biomeMap);
    const init = new Uint8Array(BIOME_SIZE * BIOME_SIZE * 4);
    for (let i = 0; i < BIOME_SIZE * BIOME_SIZE; i++) {
      init[i * 4] = 145;
      init[i * 4 + 1] = 189;
      init[i * 4 + 2] = 89;
      init[i * 4 + 3] = 128;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, BIOME_SIZE, BIOME_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, init);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  /** Buffer de índices compartido (0,1,2, 0,2,3 por quad). */
  private ensureIndices(quads: number): void {
    if (quads <= this.indexQuads) return;
    let n = Math.max(this.indexQuads, 1024);
    while (n < quads) n *= 2;
    const idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4;
      const o = q * 6;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v;
      idx[o + 4] = v + 2;
      idx[o + 5] = v + 3;
    }
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.indexQuads = n;
  }

  private createPass(data: Uint32Array): PassMesh | null {
    const quads = data.length / 8;
    if (quads === 0) return null;
    this.ensureIndices(quads);
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 2, gl.UNSIGNED_INT, 8, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
    return { vao, buffer, quads };
  }

  private deletePass(p: PassMesh | null): void {
    if (!p) return;
    this.gl.deleteVertexArray(p.vao);
    this.gl.deleteBuffer(p.buffer);
  }

  // ---------------------------------------------------------------- MeshSink

  uploadMesh(col: Column, opaque: Uint32Array, cutout: Uint32Array, translucent: Uint32Array, minY: number, maxY: number): void {
    let mesh = col.mesh as ColumnMesh | null;
    if (!mesh) {
      mesh = new ColumnMesh(this, col.cx, col.cz);
      col.mesh = mesh;
      this.meshes.add(mesh);
    } else {
      this.deletePass(mesh.opaque);
      this.deletePass(mesh.cutout);
      this.deletePass(mesh.translucent);
    }
    mesh.opaque = this.createPass(opaque);
    mesh.cutout = this.createPass(cutout);
    mesh.translucent = this.createPass(translucent);
    mesh.minY = minY;
    mesh.maxY = maxY;
  }

  deleteMesh(col: Column): void {
    const mesh = col.mesh as ColumnMesh | null;
    if (mesh) this.disposeMesh(mesh);
    col.mesh = null;
  }

  disposeMesh(mesh: ColumnMesh): void {
    if (!this.meshes.has(mesh)) return;
    this.deletePass(mesh.opaque);
    this.deletePass(mesh.cutout);
    this.deletePass(mesh.translucent);
    mesh.opaque = mesh.cutout = mesh.translucent = null;
    this.meshes.delete(mesh);
  }

  uploadTint(cx: number, cz: number, tint: Uint8Array): void {
    const gl = this.gl;
    const x = ((cx * 4) % BIOME_SIZE + BIOME_SIZE) % BIOME_SIZE;
    const z = ((cz * 4) % BIOME_SIZE + BIOME_SIZE) % BIOME_SIZE;
    gl.bindTexture(gl.TEXTURE_2D, this.biomeMap);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, z, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, tint);
  }

  // ---------------------------------------------------------------- culling

  /** Extrae los planos del frustum de una matriz viewProj (relativa a la cámara). */
  setFrustum(m: ArrayLike<number>): void {
    const p = this.planes;
    const rows = [
      [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
      [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
      [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
      [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
      [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
      [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
    ];
    rows.forEach((r, i) => {
      const len = Math.hypot(r[0], r[1], r[2]) || 1;
      p[i * 4] = r[0] / len;
      p[i * 4 + 1] = r[1] / len;
      p[i * 4 + 2] = r[2] / len;
      p[i * 4 + 3] = r[3] / len;
    });
  }

  private boxVisible(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const p = this.planes;
    for (let i = 0; i < 6; i++) {
      const a = p[i * 4], b = p[i * 4 + 1], c = p[i * 4 + 2], d = p[i * 4 + 3];
      const x = a >= 0 ? maxX : minX;
      const y = b >= 0 ? maxY : minY;
      const z = c >= 0 ? maxZ : minZ;
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }

  /**
   * Calcula las listas visibles. cam = posición de la cámara (doble precisión).
   * shadowCenter/shadowRadius: región para la pasada de sombras.
   */
  cull(camX: number, camY: number, camZ: number, renderDist: number, shadowRadius: number): void {
    const vis: ColumnMesh[] = [];
    const tr: ColumnMesh[] = [];
    const sh: ColumnMesh[] = [];
    const maxD = (renderDist + 0.5) * CHUNK_SIZE;
    for (const m of this.meshes) {
      const x0 = m.cx * CHUNK_SIZE - camX;
      const z0 = m.cz * CHUNK_SIZE - camZ;
      const cxm = x0 + 8, czm = z0 + 8;
      const d = Math.sqrt(cxm * cxm + czm * czm);
      m.dist = d;
      if (d - 11.4 > maxD) continue;
      if (d - 11.4 < shadowRadius) sh.push(m);
      if (!this.boxVisible(x0, m.minY - camY - 0.5, z0, x0 + CHUNK_SIZE, m.maxY - camY + 1.5, z0 + CHUNK_SIZE)) continue;
      if (m.opaque || m.cutout) vis.push(m);
      if (m.translucent) tr.push(m);
    }
    vis.sort((a, b) => a.dist - b.dist);
    tr.sort((a, b) => b.dist - a.dist);
    this.visibleOpaque = vis;
    this.visibleTranslucent = tr;
    this.shadowList = sh;
  }

  // ---------------------------------------------------------------- dibujado

  draw(prog: Program, list: ColumnMesh[], pass: 'opaque' | 'cutout' | 'translucent', camX: number, camY: number, camZ: number): void {
    const gl = this.gl;
    const loc = prog.loc('uChunkOffset');
    for (const m of list) {
      const p = m[pass];
      if (!p) continue;
      // Las alturas de los vértices son filas de columna (0 = MIN_Y).
      gl.uniform3f(loc, m.cx * CHUNK_SIZE - camX, MIN_Y - camY, m.cz * CHUNK_SIZE - camZ);
      gl.bindVertexArray(p.vao);
      gl.drawElements(gl.TRIANGLES, p.quads * 6, gl.UNSIGNED_INT, 0);
      this.stats.drawCalls++;
      this.stats.quads += p.quads;
    }
    gl.bindVertexArray(null);
  }
}
