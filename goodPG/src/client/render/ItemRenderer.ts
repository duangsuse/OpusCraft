// Objetos en 3D: cubos de bloque y sprites extruidos (como en Minecraft). Dibuja los objetos
// tirados, los bloques que caen, las flechas, el objeto de la mano y las grietas de minado.
import { dyedSpriteRGBA, parseDyeKey } from './dyeArt'; // el cuero teñido
import { isDyeable } from '../../shared/dyedColor';
import { mat4 } from 'gl-matrix';
import { Program, type GL, type GLCaps } from '../engine/gl';
import { ITEM3D_VS, ITEM3D_FS, ITEM3D_SHADOW_VS, ITEM3D_SHADOW_FS } from './shaders/items';
import {
  BLOCKS, BLOCK_RENDER, BLOCK_TEX, BLOCK_MODEL_CUTOUT, R_CROSS, R_TORCH, R_NONE, R_MODEL, blockItemModel,
} from '../../shared/blocks';
import { modelQuads } from '../../shared/blockModels';
import { ITEMS, itemSpriteIndex } from '../../shared/items';
import { TEXTURE_DEFS, textureLayer } from '../../shared/textureDefs';
import type { BlockTextures } from './BlockTextures';
import type { ItemSprites } from '../textures/itemSprites';
import { potionSpriteLayer } from '../textures/potionSprites'; // Fase 7 (pociones)
import { SHIELD } from '../../shared/items';
import { decoratedShieldRGBA, parseShieldKey } from './shieldArt'; // Fase 7.6: escudos con estandarte

export interface ItemModel {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  /** Usa las texturas de bloque (si no, el atlas de sprites de objetos). */
  block: boolean;
  cutout: boolean;
  /** Sprite plano (herramientas, comida, plantas) o cubo. */
  flat: boolean;
}

export interface ItemDraw {
  model: ItemModel;
  m: mat4;
  light: [number, number];
  tint?: [number, number, number];
  /** Fase 7 (encantamientos): con el brillo de los encantamientos. */
  glint?: boolean;
}

const CORNERS: number[][][] = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CU = [0, 1, 1, 0];
const CV = [1, 1, 0, 0];
const MAX_QUADS = 4096;
/** Fase 7.6: capas libres del atlas para los escudos decorados que se van viendo (se reutilizan). */
const SHIELD_SLOTS = 16;

/** Fase 7 (encantamientos): reloj del brillo (segundos, acotado para no perder precisión). */
export function glintTime(): number {
  return (performance.now() / 1000) % 3600;
}

export class ItemRenderer {
  private gl: GL;
  private blocks: BlockTextures;
  private spriteRGBA: Uint8Array;
  readonly spriteTex: WebGLTexture;
  private prog: Program;
  private shadowProg: Program;
  private index: WebGLBuffer;
  private cache = new Map<string, ItemModel>();
  /** Fase 7.6: primera capa libre del atlas y decoración de escudo que ocupa cada una (por orden de uso). */
  private shieldBase: number;
  private shieldSlots: string[] = [];

  constructor(gl: GL, caps: GLCaps, blocks: BlockTextures, sprites: ItemSprites) {
    this.gl = gl;
    this.blocks = blocks;
    this.spriteRGBA = sprites.rgba;
    this.prog = new Program(gl, { name: 'item3d', vs: ITEM3D_VS, fs: ITEM3D_FS });
    this.shadowProg = new Program(gl, { name: 'item3d-shadow', vs: ITEM3D_SHADOW_VS, fs: ITEM3D_SHADOW_FS });
    // Atlas de sprites como TEXTURE_2D_ARRAY sRGB con mipmaps.
    const count = Math.max(1, sprites.count);
    this.shieldBase = count;
    const all = new Uint8Array((count + SHIELD_SLOTS) * 16 * 16 * 4);
    if (sprites.count) all.set(sprites.rgba);
    this.spriteTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.spriteTex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.SRGB8_ALPHA8, 16, 16, count + SHIELD_SLOTS, 0, gl.RGBA, gl.UNSIGNED_BYTE, all);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (caps.anisoExt) gl.texParameterf(gl.TEXTURE_2D_ARRAY, caps.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, caps.anisotropy));
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    this.index = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  }

  // ---------------------------------------------------------------- mallas

  private upload(data: number[], block: boolean, cutout: boolean, flat: boolean): ItemModel {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index);
    gl.bindVertexArray(null);
    const quads = Math.min(MAX_QUADS, data.length / 36);
    return { vao, indexCount: quads * 6, block, cutout, flat };
  }

  /** Cubo centrado en el origen (lado 1) con una capa por cara. */
  private cubeData(layers: number[]): number[] {
    const out: number[] = [];
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const c = CORNERS[f][k];
        out.push(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, ...NORMALS[f], CU[k], CV[k], layers[f]);
      }
    }
    return out;
  }

  /** Modelo de cajas (losas, escaleras, vallas…) centrado en el origen, con las UV de los cubos. */
  private boxesData(block: number): number[] {
    const out: number[] = [];
    const NORMAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const q of modelQuads(blockItemModel(block))) {
      const n = NORMAL[q.face];
      for (let k = 0; k < 4; k++) {
        out.push(q.p[k * 3] / 16 - 0.5, q.p[k * 3 + 1] / 16 - 0.5, q.p[k * 3 + 2] / 16 - 0.5, n[0], n[1], n[2],
          q.uv[k * 2] / 16, q.uv[k * 2 + 1] / 16, q.layer);
      }
    }
    return out;
  }

  /** Sprite 16x16 extruido 1/16 de grosor: caras delantera y trasera más bordes por píxel. */
  private extrudeData(rgba: Uint8Array, offset: number, layer: number): number[] {
    const out: number[] = [];
    const t = 1 / 32;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && rgba[offset + (y * 16 + x) * 4 + 3] >= 128;
    const quad = (p: number[][], n: number[], uv: number[][]) => {
      for (let k = 0; k < 4; k++) out.push(p[k][0], p[k][1], p[k][2], n[0], n[1], n[2], uv[k][0], uv[k][1], layer);
    };
    quad([[-0.5, -0.5, t], [0.5, -0.5, t], [0.5, 0.5, t], [-0.5, 0.5, t]], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    quad([[0.5, -0.5, -t], [-0.5, -0.5, -t], [-0.5, 0.5, -t], [0.5, 0.5, -t]], [0, 0, -1], [[1, 1], [0, 1], [0, 0], [1, 0]]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (!solid(x, y)) continue;
        const x0 = x / 16 - 0.5, x1 = (x + 1) / 16 - 0.5;
        const y1 = 0.5 - y / 16, y0 = 0.5 - (y + 1) / 16;
        const u = (x + 0.5) / 16, v = (y + 0.5) / 16;
        const uv = [[u, v], [u, v], [u, v], [u, v]];
        if (!solid(x - 1, y)) quad([[x0, y0, -t], [x0, y0, t], [x0, y1, t], [x0, y1, -t]], [-1, 0, 0], uv);
        if (!solid(x + 1, y)) quad([[x1, y0, t], [x1, y0, -t], [x1, y1, -t], [x1, y1, t]], [1, 0, 0], uv);
        if (!solid(x, y - 1)) quad([[x0, y1, t], [x1, y1, t], [x1, y1, -t], [x0, y1, -t]], [0, 1, 0], uv);
        if (!solid(x, y + 1)) quad([[x0, y0, -t], [x1, y0, -t], [x1, y0, t], [x0, y0, t]], [0, -1, 0], uv);
      }
    }
    return out;
  }

  /**
   * Modelo de un objeto (bloque o sprite). null si no se puede dibujar. Fase 7 (pociones): `dmg`, el tipo
   * de las pociones y las flechas con efecto (cada uno con su color).
   */
  model(id: number, dmg = 0, decor: string | null = null): ItemModel | null {
    if (decor && id === SHIELD) return this.shieldModel(decor); // Fase 7.6
    // El cuero teñido (y la armadura para lobo): su dibujo con el color.
    const dye = decor && isDyeable(id) ? parseDyeKey(decor) : null;
    if (dye !== null) {
      const s = itemSpriteIndex(id);
      return s < 0 ? null : this.decorModel(`${id}${decor}`, () => dyedSpriteRGBA(this.spriteRGBA, s * 256 * 4, id, dye));
    }
    const layer = dmg > 0 ? potionSpriteLayer(id, dmg) : -1;
    if (layer >= 0 && layer !== itemSpriteIndex(id)) {
      const pk = 'p' + layer;
      let pm = this.cache.get(pk);
      if (!pm) {
        pm = this.upload(this.extrudeData(this.spriteRGBA, layer * 256 * 4, layer), false, true, true);
        this.cache.set(pk, pm);
      }
      return pm;
    }
    const key = 'i' + id;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = ITEMS[id];
    if (!def) return null;
    let m: ItemModel | null = null;
    if (def.block !== undefined && def.sprite === undefined) {
      const b = def.block;
      const r = BLOCK_RENDER[b];
      const flat = BLOCKS[b]?.flatItem;
      if (r === R_NONE) return null;
      if (r === R_CROSS || r === R_TORCH || flat) {
        const layer = flat ? textureLayer(flat) : BLOCK_TEX[b * 6];
        m = this.upload(this.extrudeData(this.blocks.source.albedo, layer * 256 * 4, layer), true, true, true);
      } else if (r === R_MODEL) {
        m = this.upload(this.boxesData(b), true, BLOCK_MODEL_CUTOUT[b] === 1, false);
      } else {
        const layers = [0, 1, 2, 3, 4, 5].map((f) => BLOCK_TEX[b * 6 + f]);
        const cut = layers.some((l) => !!TEXTURE_DEFS[l]?.cutout);
        m = this.upload(this.cubeData(layers), true, cut, false);
      }
    } else {
      const s = itemSpriteIndex(id);
      if (s < 0) return null;
      m = this.upload(this.extrudeData(this.spriteRGBA, s * 256 * 4, s), false, true, true);
    }
    this.cache.set(key, m);
    return m;
  }

  /**
   * Fase 7.6: escudo con el dibujo de un estandarte. Cada decoración ocupa una de las capas libres del
   * atlas; cuando se acaban, la menos usada deja su sitio.
   */
  private shieldModel(decor: string): ItemModel | null {
    const d = parseShieldKey(decor);
    const s = itemSpriteIndex(SHIELD);
    if (!d || s < 0) return null;
    return this.decorModel(decor, () => decoratedShieldRGBA(this.spriteRGBA, s * 256 * 4, d.base, d.layers));
  }

  /** Modelo con un dibujo propio (`make`) guardado en una de las capas libres del atlas con la clave `decor`. */
  private decorModel(decor: string, make: () => Uint8Array): ItemModel {
    const key = 'sh' + decor;
    const hit = this.cache.get(key);
    if (hit) {
      this.shieldSlots.push(this.shieldSlots.splice(this.shieldSlots.indexOf(decor), 1)[0]);
      return hit;
    }
    let slot = this.shieldSlots.length;
    if (slot >= SHIELD_SLOTS) {
      const old = this.shieldSlots.shift()!;
      slot = this.shieldIndex.get(old)!;
      this.shieldIndex.delete(old);
      this.cache.delete('sh' + old);
    }
    const layer = this.shieldBase + slot;
    const rgba = make();
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.spriteTex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, 16, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    const m = this.upload(this.extrudeData(rgba, 0, layer), false, true, true);
    this.shieldSlots.push(decor);
    this.shieldIndex.set(decor, slot);
    this.cache.set(key, m);
    return m;
  }

  private shieldIndex = new Map<string, number>();

  /** Cubo de un bloque concreto (bloques que caen). */
  blockModel(block: number): ItemModel {
    const key = 'b' + block;
    let m = this.cache.get(key);
    if (!m) {
      const layers = [0, 1, 2, 3, 4, 5].map((f) => BLOCK_TEX[block * 6 + f]);
      m = this.upload(this.cubeData(layers), true, layers.some((l) => !!TEXTURE_DEFS[l]?.cutout), false);
      this.cache.set(key, m);
    }
    return m;
  }

  /**
   * Fase 7 (mecanismos): un bloque tal cual está (con su orientación y su forma) para dibujarlo suelto: lo
   * que mueve un pistón. null si no se dibuja así (plantas, antorchas…).
   */
  stateModel(block: number): ItemModel | null {
    const key = 's' + block;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = BLOCK_RENDER[block];
    if (r === R_NONE || r === R_CROSS || r === R_TORCH) return null;
    const m = r === R_MODEL ? this.upload(this.boxesData(block), true, BLOCK_MODEL_CUTOUT[block] === 1, false) : this.blockModel(block);
    this.cache.set(key, m);
    return m;
  }

  /** Fase 7 (encantamientos): cubo con la textura `name` en las seis caras (el libro de la mesa). */
  textureCube(name: string): ItemModel {
    const key = 't' + name;
    let m = this.cache.get(key);
    if (!m) {
      const l = textureLayer(name);
      m = this.upload(this.cubeData([l, l, l, l, l, l]), true, false, false);
      this.cache.set(key, m);
    }
    return m;
  }

  private crackModel(stage: number): ItemModel {
    const key = 'c' + stage;
    let m = this.cache.get(key);
    if (!m) {
      const l = textureLayer('destroy_' + stage);
      m = this.upload(this.cubeData([l, l, l, l, l, l]), true, true, false);
      this.cache.set(key, m);
    }
    return m;
  }

  // ---------------------------------------------------------------- dibujo

  private bindCommon(p: Program, m: ItemModel): void {
    const gl = this.gl;
    p.tex('uTex', gl.TEXTURE_2D_ARRAY, m.block ? this.blocks.albedo : this.spriteTex)
      .i1('uIsBlock', m.block ? 1 : 0)
      .i1('uCutout', m.cutout ? 1 : 0);
  }

  /** Objetos en el mundo (pasada principal). */
  drawWorld(list: ItemDraw[], viewProj: mat4, grassTint: [number, number, number], bindLighting: (p: Program) => Program): void {
    if (list.length === 0) return;
    const gl = this.gl;
    const p = bindLighting(this.prog.use());
    p.tex('uSpecular', gl.TEXTURE_2D_ARRAY, this.blocks.specular)
      .tex2D('uLayerProps', this.blocks.layerProps)
      .m4('uProjM', viewProj as Float32Array)
      .i1('uHand', 0)
      .i1('uCrack', 0)
      .f3('uGrassTint', grassTint[0], grassTint[1], grassTint[2])
      .f1('uTime', glintTime());
    for (const d of list) {
      this.bindCommon(p, d.model);
      const t = d.tint ?? [1, 1, 1];
      p.m4('uModel', d.m as Float32Array).f2('uLightLevel', d.light[0], d.light[1]).f3('uTint', t[0], t[1], t[2])
        .f1('uGlint', d.glint ? 1 : 0); // Fase 7 (encantamientos)
      gl.bindVertexArray(d.model.vao);
      gl.drawElements(gl.TRIANGLES, d.model.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }

  drawShadow(list: ItemDraw[]): void {
    if (list.length === 0) return;
    const gl = this.gl;
    const p = this.shadowProg.use();
    for (const d of list) {
      p.tex('uTex', gl.TEXTURE_2D_ARRAY, d.model.block ? this.blocks.albedo : this.spriteTex)
        .i1('uCutout', d.model.cutout ? 1 : 0)
        .m4('uModel', d.m as Float32Array);
      gl.bindVertexArray(d.model.vao);
      gl.drawElements(gl.TRIANGLES, d.model.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }

  /** Grietas sobre el bloque que se está minando (multiplican el color de la escena). */
  drawCrack(
    x: number, y: number, z: number, stage: number, camX: number, camY: number, camZ: number, viewProj: mat4,
    bindLighting: (p: Program) => Program, box: number[] = [0, 0, 0, 1, 1, 1],
  ): void {
    const gl = this.gl;
    const m = this.crackModel(Math.max(0, Math.min(9, stage)));
    const mm = mat4.create();
    // El cubo de grietas se ajusta a la caja de selección (losas, puertas, vallas…).
    const cx = (box[0] + box[3]) / 2, cy = (box[1] + box[4]) / 2, cz = (box[2] + box[5]) / 2;
    mat4.translate(mm, mm, [x + cx - camX, y + cy - camY, z + cz - camZ]);
    mat4.scale(mm, mm, [(box[3] - box[0]) + 0.004, (box[4] - box[1]) + 0.004, (box[5] - box[2]) + 0.004]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -2);
    const p = bindLighting(this.prog.use());
    this.bindCommon(p, m);
    p.tex('uSpecular', gl.TEXTURE_2D_ARRAY, this.blocks.specular)
      .tex2D('uLayerProps', this.blocks.layerProps)
      .m4('uModel', mm as Float32Array).m4('uProjM', viewProj as Float32Array).i1('uCrack', 1).i1('uHand', 0).f1('uGlint', 0);
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    p.i1('uCrack', 0);
  }

  /** Objeto en la mano (espacio de vista, con su propia proyección). */
  drawHand(
    model: ItemModel, mv: mat4, proj: mat4, lightDirView: number[], light: [number, number], grassTint: [number, number, number],
    bindLighting: (p: Program) => Program, glint = false,
  ): void {
    const gl = this.gl;
    const p = bindLighting(this.prog.use());
    this.bindCommon(p, model);
    p.tex('uSpecular', gl.TEXTURE_2D_ARRAY, this.blocks.specular)
      .tex2D('uLayerProps', this.blocks.layerProps)
      .m4('uModel', mv as Float32Array)
      .m4('uProjM', proj as Float32Array)
      .i1('uHand', 1)
      .i1('uCrack', 0)
      .f3('uLightDirView', lightDirView[0], lightDirView[1], lightDirView[2])
      .f2('uLightLevel', light[0], light[1])
      .f3('uGrassTint', grassTint[0], grassTint[1], grassTint[2])
      .f3('uTint', 1, 1, 1)
      .f1('uGlint', glint ? 1 : 0) // Fase 7 (encantamientos)
      .f1('uTime', glintTime());
    gl.bindVertexArray(model.vao);
    gl.drawElements(gl.TRIANGLES, model.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }
}
