// Fase 8.6 (el End): el dragón de Ender y el cristal del End. El dragón tiene 36 partes que se animan cada una (cuello
// de cinco, cola de doce, patas de tres tramos, alas con su punta), más de las que admite el renderizador de
// criaturas: se dibuja parte a parte con el mismo programa (la luz, las sombras y los píxeles emisivos de sus ojos).
// - Geometría y texturas: las cajas de EnderDragonModel y EndCrystalModel (en coordenadas de modelo de Java).
// - Animación (EnderDragonModel.setupAnim y EnderDragonRenderer): el aleteo sube y baja el cuerpo, abre la mandíbula
//   y bate las alas; el cuello y la cola siguen la historia de giros y alturas del vuelo; al morir se desintegra
//   (con los bordes encendidos, por encima del recorte de Java) mientras salen los rayos.
// - Cristal (EndCrystalRenderer): la base de lecho de roca (los de los pilares), dos marcos de cristal y el cubo que
//   giran encima, flotando arriba y abajo.
import { mat4 } from 'gl-matrix';
import type { GL, Program } from '../engine/gl';
import type { ClientEntity } from '../game/ClientEntities';
import { dragonView, dragonSample, dragonLanding } from '../game/dragonClient';
import { EF_DRAGON_SITTING } from '../../shared/mobs';
import type { MobTexture } from './MobRenderer';

const DEG = Math.PI / 180;
const P = 1 / 16;
const wrapDeg = (a: number) => {
  let d = a % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

/** Caja de Java: [x, y, z, ancho, alto, fondo, u, v]. */
type JBox = [number, number, number, number, number, number, number, number];
interface JPart {
  name: string;
  parent?: string;
  pose: [number, number, number];
  boxes: JBox[];
}

const NECK: JBox[] = [[-5, -5, -5, 10, 10, 10, 192, 104], [-1, -9, -3, 2, 4, 6, 48, 0]];
const legs = (side: 'left' | 'right'): JPart[] => {
  const s = side === 'left' ? 1 : -1;
  return [
    { name: `${side}_front_leg`, parent: 'body', pose: [12 * s, 17, -6], boxes: [[-4, -4, -4, 8, 24, 8, 112, 104]] },
    { name: `${side}_front_leg_tip`, parent: `${side}_front_leg`, pose: [0, 20, -1], boxes: [[-3, -1, -3, 6, 24, 6, 226, 138]] },
    { name: `${side}_front_foot`, parent: `${side}_front_leg_tip`, pose: [0, 23, 0], boxes: [[-4, 0, -12, 8, 4, 16, 144, 104]] },
    { name: `${side}_hind_leg`, parent: 'body', pose: [16 * s, 13, 34], boxes: [[-8, -4, -8, 16, 32, 16, 0, 0]] },
    { name: `${side}_hind_leg_tip`, parent: `${side}_hind_leg`, pose: [0, 30, -1], boxes: [[-6, -2, 0, 12, 32, 12, 196, 0]] },
    { name: `${side}_hind_foot`, parent: `${side}_hind_leg_tip`, pose: [0, 31, 4], boxes: [[-9, 0, -20, 18, 6, 24, 112, 0]] },
  ];
};

/** EnderDragonModel.createBodyLayer (256 × 256). */
export const DRAGON_MODEL: JPart[] = [
  {
    name: 'head', pose: [0, 0, 0], boxes: [
      [-6, -1, -24, 12, 5, 16, 176, 44], [-8, -8, -10, 16, 16, 16, 112, 30], [-5, -12, -4, 2, 4, 6, 0, 0], [-5, -3, -22, 2, 2, 4, 112, 0],
      [3, -12, -4, 2, 4, 6, 0, 0], [3, -3, -22, 2, 2, 4, 112, 0],
    ],
  },
  { name: 'jaw', parent: 'head', pose: [0, 4, -8], boxes: [[-6, 0, -16, 12, 4, 16, 176, 65]] },
  ...[0, 1, 2, 3, 4].map((i): JPart => ({ name: `neck${i}`, pose: [0, 0, 0], boxes: NECK })),
  ...Array.from({ length: 12 }, (_, i): JPart => ({ name: `tail${i}`, pose: [0, 0, 0], boxes: NECK })),
  {
    name: 'body', pose: [0, 20, 8], boxes: [
      [-12, 0, -16, 24, 24, 64, 0, 0], [-1, -6, -10, 2, 6, 12, 220, 53], [-1, -6, 10, 2, 6, 12, 220, 53], [-1, -6, 30, 2, 6, 12, 220, 53],
    ],
  },
  { name: 'left_wing', parent: 'body', pose: [12, 2, -6], boxes: [[0, -4, -4, 56, 8, 8, 112, 88], [0, 0, 2, 56, 0, 56, -56, 88]] },
  { name: 'left_wing_tip', parent: 'left_wing', pose: [56, 0, 0], boxes: [[0, -2, -2, 56, 4, 4, 112, 136], [0, 0, 2, 56, 0, 56, -56, 144]] },
  { name: 'right_wing', parent: 'body', pose: [-12, 2, -6], boxes: [[-56, -4, -4, 56, 8, 8, 112, 88], [-56, 0, 2, 56, 0, 56, -56, 88]] },
  { name: 'right_wing_tip', parent: 'right_wing', pose: [-56, 0, 0], boxes: [[-56, -2, -2, 56, 4, 4, 112, 136], [-56, 0, 2, 56, 0, 56, -56, 144]] },
  ...legs('left'),
  ...legs('right'),
];

/** EndCrystalModel (64 × 32): marco de cristal (dos veces) y cubo de 8, base de 12 × 4 × 12. */
export const CRYSTAL_MODEL: JPart[] = [
  { name: 'base', pose: [0, 0, 0], boxes: [[-6, 0, -6, 12, 4, 12, 0, 16]] },
  { name: 'outer', pose: [0, 0, 0], boxes: [[-4, -4, -4, 8, 8, 8, 0, 0]] },
  { name: 'inner', pose: [0, 0, 0], boxes: [[-4, -4, -4, 8, 8, 8, 0, 0]] },
  { name: 'cube', pose: [0, 0, 0], boxes: [[-4, -4, -4, 8, 8, 8, 32, 0]] },
];

/** Fase 8.6: ShulkerBulletModel (64 × 32): tres placas cruzadas. */
export const BULLET_MODEL: JPart[] = [
  { name: 'main', pose: [0, 0, 0], boxes: [[-4, -4, -1, 8, 8, 2, 0, 0], [-1, -4, -4, 2, 8, 8, 0, 10], [-4, -1, -4, 8, 2, 8, 20, 0]] },
];

/** Caras de una caja con la disposición de Minecraft: [u, v, ancho, alto] para −X, +X, −Y, +Y, −Z, +Z (en Java). */
function faces(u: number, v: number, w: number, h: number, d: number): [number, number, number, number][] {
  return [[u, v + d, d, h], [u + d + w, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + d, v + d, w, h], [u + d + w + d, v + d, w, h]];
}

interface PartMesh {
  vao: WebGLVertexArrayObject;
  count: number;
}

/** Transformación de una parte (su pose, que la animación cambia). */
interface Pose {
  x: number; y: number; z: number; xr: number; yr: number; zr: number;
}

export class DragonRenderer {
  private meshes = new Map<string, PartMesh>();
  private skins = new Map<string, WebGLTexture>();
  private readonly bone = mat4.create();
  private readonly flip = mat4.fromScaling(mat4.create(), [-1, -1, 1]);

  constructor(private gl: GL, private texture: (key: 'dragon' | 'crystal' | 'bullet') => MobTexture) {}

  /** Malla de las cajas de una parte en coordenadas de Java (y hacia abajo), con su UV. */
  private mesh(key: string, part: JPart, aw: number, ah: number): PartMesh {
    const k = `${key}:${part.name}`;
    let m = this.meshes.get(k);
    if (m) return m;
    const gl = this.gl;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], bone: number[] = [], idx: number[] = [];
    for (const [bx, by, bz, w, h, d, u, v] of part.boxes) {
      // A nuestro espacio (x e y invertidos, como jb); la matriz de la parte deshace el cambio.
      const x0 = -(bx + w) * P, y0 = -(by + h) * P, z0 = bz * P, x1 = x0 + w * P, y1 = y0 + h * P, z1 = z0 + d * P;
      const f = faces(u, v, w, h, d);
      // En nuestro espacio: +X = −X de Java, +Y = −Y de Java.
      const rects = [f[0], f[1], f[2], f[3], f[4], f[5]];
      const corners: number[][][] = [
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
        [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]],
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      ];
      const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1], [0, 0, 1]];
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let fi = 0; fi < 6; fi++) {
        if (dims[fi][0] <= 0 || dims[fi][1] <= 0) continue;
        const [fu, fv, fw, fh] = rects[fi];
        const uvs = [[fu, fv + fh], [fu + fw, fv + fh], [fu + fw, fv], [fu, fv]];
        const base = pos.length / 3;
        for (let c = 0; c < 4; c++) {
          pos.push(...corners[fi][c]);
          nrm.push(...normals[fi]);
          uv.push(uvs[c][0] / aw, uvs[c][1] / ah);
          bone.push(0);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const attr = (loc: number, data: number[], size: number) => {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, pos, 3);
    attr(1, nrm, 3);
    attr(2, uv, 2);
    attr(3, bone, 1);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    m = { vao, count: idx.length };
    this.meshes.set(k, m);
    return m;
  }

  private skin(key: 'dragon' | 'crystal' | 'bullet'): WebGLTexture {
    let t = this.skins.get(key);
    if (t) return t;
    const gl = this.gl;
    const src = this.texture(key);
    t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.skins.set(key, t);
    return t;
  }

  // ------------------------------------------------------------------ pose del dragón

  /** EnderDragonModel.setupAnim: la pose de cada parte (en píxeles y radianes de Java) y la de la raíz. */
  private dragonPoses(e: ClientEntity): { root: Pose; parts: Map<string, Pose> } {
    const v = dragonView(e);
    const flap = (v.flap + (v.flap - v.flapPrev) * v.frac) * Math.PI * 2;
    const parts = new Map<string, Pose>();
    for (const p of DRAGON_MODEL) parts.set(p.name, { x: p.pose[0], y: p.pose[1], z: p.pose[2], xr: 0, yr: 0, zr: 0 });
    const g = (n: string) => parts.get(n)!;
    g('jaw').xr = (Math.sin(flap) + 1) * 0.2;
    let speed = Math.sin(flap - 1) + 1;
    speed = (speed * speed + speed * 2) * 0.05;
    const root: Pose = { x: 0, y: (speed - 2) * 16, z: -48, xr: speed * 2 * DEG, yr: 0, zr: 0 };
    const sitting = (e.flags & EF_DRAGON_SITTING) !== 0, landing = dragonLanding(e);
    const headOff = (i: number, start: [number, number], cur: [number, number]) =>
      sitting ? i / Math.max(Math.hypot(e.x, e.z) / 4, 1) : landing ? i : i === 6 ? 0 : cur[1] - start[1];
    let nx = 0, ny = 20, nz = -12;
    const ss = 1.5;
    let start = dragonSample(v, 6);
    const yDiff = wrapDeg(dragonSample(v, 5)[0] - dragonSample(v, 10)[0]);
    const rotation = wrapDeg(dragonSample(v, 5)[0] + yDiff / 2);
    for (let i = 0; i < 5; i++) {
      const n = g(`neck${i}`);
      const p = dragonSample(v, 5 - i);
      const cc = Math.cos(i * 0.45 + flap) * 0.15;
      n.yr = wrapDeg(p[0] - start[0]) * DEG * ss;
      n.xr = cc + headOff(i, start, p) * DEG * ss * 5;
      n.zr = -wrapDeg(p[0] - rotation) * DEG * ss;
      n.x = nx; n.y = ny; n.z = nz;
      ny += Math.sin(n.xr) * 10;
      nz -= Math.cos(n.yr) * Math.cos(n.xr) * 10;
      nx -= Math.sin(n.yr) * Math.cos(n.xr) * 10;
    }
    const head = g('head');
    head.x = nx; head.y = ny; head.z = nz;
    let p = dragonSample(v, 0);
    head.yr = wrapDeg(p[0] - start[0]) * DEG;
    head.xr = wrapDeg(headOff(6, start, p)) * DEG * ss * 5;
    head.zr = -wrapDeg(p[0] - rotation) * DEG;
    g('body').zr = -yDiff * ss * DEG;
    const lw = g('left_wing'), rw = g('right_wing');
    lw.xr = 0.125 - Math.cos(flap) * 0.2;
    lw.yr = -0.25;
    lw.zr = -(Math.sin(flap) + 0.125) * 0.8;
    g('left_wing_tip').zr = (Math.sin(flap + 2) + 0.5) * 0.75;
    rw.xr = lw.xr;
    rw.yr = -lw.yr;
    rw.zr = -lw.zr;
    g('right_wing_tip').zr = -g('left_wing_tip').zr;
    for (const side of ['left', 'right']) {
      g(`${side}_hind_leg`).xr = 1 + speed * 0.1;
      g(`${side}_hind_leg_tip`).xr = 0.5 + speed * 0.1;
      g(`${side}_hind_foot`).xr = 0.75 + speed * 0.1;
      g(`${side}_front_leg`).xr = 1.3 + speed * 0.1;
      g(`${side}_front_leg_tip`).xr = -0.5 - speed * 0.1;
      g(`${side}_front_foot`).xr = 0.75 + speed * 0.1;
    }
    let rot2 = 0;
    ny = 10; nz = 60; nx = 0;
    start = dragonSample(v, 11);
    for (let i = 0; i < 12; i++) {
      p = dragonSample(v, 12 + i);
      rot2 += Math.sin(i * 0.45 + flap) * 0.05;
      const t = g(`tail${i}`);
      t.yr = (wrapDeg(p[0] - start[0]) * ss + 180) * DEG;
      t.xr = rot2 + (p[1] - start[1]) * DEG * ss * 5;
      t.zr = wrapDeg(p[0] - rotation) * DEG * ss;
      t.x = nx; t.y = ny; t.z = nz;
      ny += Math.sin(t.xr) * 10;
      nz -= Math.cos(t.yr) * Math.cos(t.xr) * 10;
      nx -= Math.sin(t.yr) * Math.cos(t.xr) * 10;
    }
    return { root, parts };
  }

  /** T(x, y, z) · Rz · Ry · Rx (ModelPart.translateAndRotate: rotationZYX). */
  private applyPose(m: mat4, p: Pose): void {
    mat4.translate(m, m, [p.x * P, p.y * P, p.z * P]);
    if (p.zr) mat4.rotateZ(m, m, p.zr);
    if (p.yr) mat4.rotateY(m, m, p.yr);
    if (p.xr) mat4.rotateX(m, m, p.xr);
  }

  /** Matriz de la raíz del dragón (EnderDragonRenderer.submit), relativa a la cámara. */
  private dragonRoot(e: ClientEntity, camX: number, camY: number, camZ: number, root: Pose): mat4 {
    const v = dragonView(e);
    const m = mat4.create();
    mat4.translate(m, m, [e.x - camX, e.y - camY, e.z - camZ]);
    mat4.rotateY(m, m, -dragonSample(v, 7)[0] * DEG);
    mat4.rotateX(m, m, (dragonSample(v, 5)[1] - dragonSample(v, 10)[1]) * 10 * DEG);
    mat4.translate(m, m, [0, 0, 1]);
    mat4.scale(m, m, [-1, -1, 1]);
    mat4.translate(m, m, [0, -1.501, 0]);
    this.applyPose(m, root);
    return m;
  }

  /** Recorre las partes del dragón con la matriz de cada una (en nuestro espacio: la del mundo · flip). */
  private eachDragonPart(e: ClientEntity, camX: number, camY: number, camZ: number, fn: (part: JPart, world: mat4) => void): void {
    const { root, parts } = this.dragonPoses(e);
    const base = this.dragonRoot(e, camX, camY, camZ, root);
    const mats = new Map<string, mat4>();
    for (const part of DRAGON_MODEL) {
      const m = mat4.clone(part.parent ? mats.get(part.parent)! : base);
      this.applyPose(m, parts.get(part.name)!);
      mats.set(part.name, m);
      const w = mat4.create();
      mat4.multiply(w, m, this.flip);
      fn(part, w);
    }
  }

  // ------------------------------------------------------------------ dibujo

  /** Dibuja el dragón con el programa de criaturas `p` (ya con la luz enlazada). */
  drawDragon(p: Program, e: ClientEntity, camX: number, camY: number, camZ: number, light: [number, number], hurt: boolean): void {
    const gl = this.gl;
    mat4.identity(this.bone);
    const death = e.variant > 0 ? Math.min(1, e.variant / 200) : 0;
    p.tex2D('uSkin', this.skin('dragon')).f2('uLightLevel', light[0], light[1]).f3('uTint', 1, hurt ? 0.45 : 1, hurt ? 0.45 : 1).f1('uFlash', 0)
      .f1('uDissolve', death);
    gl.uniformMatrix4fv(p.loc('uBones'), false, this.bone as Float32Array, 0, 16);
    this.eachDragonPart(e, camX, camY, camZ, (part, w) => {
      const mesh = this.mesh('dragon', part, 256, 256);
      p.m4('uModel', w as Float32Array);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    });
    p.f1('uDissolve', 0);
    gl.bindVertexArray(null);
  }

  drawDragonShadow(p: Program, e: ClientEntity, camX: number, camY: number, camZ: number): void {
    if (e.variant > 150) return;
    const gl = this.gl;
    mat4.identity(this.bone);
    p.tex2D('uSkin', this.skin('dragon'));
    gl.uniformMatrix4fv(p.loc('uBones'), false, this.bone as Float32Array, 0, 16);
    this.eachDragonPart(e, camX, camY, camZ, (part, w) => {
      const mesh = this.mesh('dragon', part, 256, 256);
      p.m4('uModel', w as Float32Array);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.bindVertexArray(null);
  }

  /** EndCrystalRenderer.getY: cuánto sube y baja el cubo (de −1,4 a −0,6). */
  private crystalBob(e: ClientEntity, time: number): number {
    const age = time * 20 + e.seed * 1000;
    const b = Math.sin(age * 0.2) / 2 + 0.5;
    return (b * b + b) * 0.4 - 1.4;
  }

  /** EndCrystalRenderer: escala 2, base (si la lleva) y los tres cubos que giran y flotan (modelo sin voltear). */
  private eachCrystalPart(e: ClientEntity, camX: number, camY: number, camZ: number, time: number, fn: (part: JPart, world: mat4) => void): void {
    const age = time * 20 + e.seed * 1000;
    const bob = this.crystalBob(e, time);
    const spin = age * 3 * DEG;
    const axis: [number, number, number] = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const base = mat4.create();
    mat4.translate(base, base, [e.x - camX, e.y - camY, e.z - camZ]);
    mat4.scale(base, base, [2, 2, 2]);
    mat4.translate(base, base, [0, -0.5, 0]);
    const draw = (name: string, m: mat4) => {
      const w = mat4.create();
      mat4.multiply(w, m, this.flip);
      fn(CRYSTAL_MODEL.find((q) => q.name === name)!, w);
    };
    if (e.variant) draw('base', base);
    const m = mat4.clone(base);
    mat4.rotateY(m, m, spin);
    mat4.translate(m, m, [0, 1.5 + bob / 2, 0]);
    mat4.rotate(m, m, 60 * DEG, axis);
    draw('outer', m);
    for (const name of ['inner', 'cube']) {
      mat4.scale(m, m, [0.875, 0.875, 0.875]);
      mat4.rotate(m, m, 60 * DEG, axis);
      mat4.rotateY(m, m, spin);
      draw(name, m);
    }
  }

  drawCrystal(p: Program, e: ClientEntity, camX: number, camY: number, camZ: number, time: number): void {
    const gl = this.gl;
    mat4.identity(this.bone);
    p.tex2D('uSkin', this.skin('crystal')).f2('uLightLevel', 1, 1).f3('uTint', 1, 1, 1).f1('uFlash', 0);
    gl.uniformMatrix4fv(p.loc('uBones'), false, this.bone as Float32Array, 0, 16);
    gl.disable(gl.CULL_FACE);
    this.eachCrystalPart(e, camX, camY, camZ, time, (part, w) => {
      const mesh = this.mesh('crystal', part, 64, 32);
      p.m4('uModel', w as Float32Array);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  /**
   * Fase 8.6 (ShulkerBulletRenderer): la bala del shulker, con toda la luz, girando sobre sí misma y con un halo más
   * grande y tenue alrededor.
   */
  drawBullet(p: Program, e: ClientEntity, camX: number, camY: number, camZ: number, time: number): void {
    const gl = this.gl;
    const tc = time * 20 + e.seed * 1000;
    const m = mat4.create();
    mat4.translate(m, m, [e.x - camX, e.y - camY + 0.15, e.z - camZ]);
    mat4.rotateY(m, m, Math.sin(tc * 0.1) * Math.PI);
    mat4.rotateX(m, m, Math.cos(tc * 0.1) * Math.PI);
    mat4.rotateZ(m, m, Math.sin(tc * 0.15) * Math.PI * 2);
    mat4.scale(m, m, [0.5, 0.5, 0.5]);
    mat4.rotateY(m, m, e.yaw);
    mat4.rotateX(m, m, e.pitch);
    mat4.identity(this.bone);
    p.tex2D('uSkin', this.skin('bullet')).f2('uLightLevel', 1, 1).f3('uTint', 1, 1, 1).f1('uFlash', 0);
    gl.uniformMatrix4fv(p.loc('uBones'), false, this.bone as Float32Array, 0, 16);
    const mesh = this.mesh('bullet', BULLET_MODEL[0], 64, 32);
    gl.disable(gl.CULL_FACE);
    const w = mat4.create();
    mat4.multiply(w, m, this.flip);
    p.m4('uModel', w as Float32Array);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    // El halo: la misma bala × 1,5, casi transparente y aditiva.
    mat4.scale(w, w, [1.5, 1.5, 1.5]);
    p.m4('uModel', w as Float32Array).f3('uTint', 0.35, 0.35, 0.3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    p.f3('uTint', 1, 1, 1);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  /** Posición del cubo del cristal (de donde sale su haz). */
  crystalBeamOrigin(e: ClientEntity, time: number): [number, number, number] {
    return [e.x, e.y + 2 + this.crystalBob(e, time), e.z];
  }
}
