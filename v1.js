// v1.js — 光栅化渲染器：逐面网格 + 顶点 AO + 四角平滑光照
// 共享接口（由 VoxelCraft.html 提供的 ctx，见其中 "Shared renderer interface"）：
//   顶点: ctx.MeshBuilder / ctx.makeGeometry  (pos Int16×3 /PS, aUv Uint8×2 texel, aData Uint8×4 = layer, sky*16, blk*16, shade*255)
//   光照: ctx.RB / ctx.RSKY / ctx.RBLK  (meshChunk 前已为 3×3 区块区域算好)，GLSL ctx.GLSL.light → voxLight(sky,blk)
//   材质: ctx.atlas (sampler2DArray)，ctx.T_TOP/T_BOT/T_SIDE 图层表，GLSL ctx.GLSL.mat / ctx.GLSL.fog
// 渲染器导出 createRenderer(ctx) → { name, buildChunk(c), disposeChunk(c), update(dt), render(), stats() }
export function createRenderer(ctx) {
const { THREE, scene, camera, renderer, U, GLSL, MeshBuilder, makeGeometry,
  CS, CH, RS, RSCH, PS, B, FACES, UVS, AO_CURVE, RB, RSKY, RBLK,
  SOLID, OPAQUE, RENDER, T_TOP, T_BOT, T_SIDE, R_CUBE, R_CROSS, R_TORCH, R_WATER } = ctx;

const WORLD_VS = /* glsl */`
  attribute vec2 aUv;
  attribute vec4 aData;       // layer, sky*16, block*16, shade*255
  uniform float uWave, uTime;
  uniform vec3 uSway;         // 树叶摇动（与 v2 同参：幅度, 频率, 距离）
  varying vec3 vUv;
  varying vec3 vLight;
  varying float vFog;
  ${GLSL.light}
  void main() {
    vUv = vec3(aUv / 16.0 + vec2(uWave, uWave * 0.5), aData.x);
    vLight = voxLight(aData.y / 16.0, aData.z / 16.0) * (aData.w / 255.0);
    vec3 p = position / ${PS.toFixed(1)};
    if (uSway.x > 0.0 && abs(aData.x - ${T_SIDE[B.LEAVES]}.0) < 0.5) {   // 树叶：按世界位置的连续场平移顶点（相邻叶块共享顶点同步移动，不开缝）
      vec3 w = (modelMatrix * vec4(p, 1.0)).xyz;
      float dist = length((modelViewMatrix * vec4(p, 1.0)).xyz);
      p.xz += uSway.x * clamp((uSway.z - dist) / (0.3 * uSway.z), 0.0, 1.0)
            * sin(uTime * uSway.y + (w.x + w.z) * 0.3 + w.y * 0.5) * vec2(1.0, 0.6);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFog = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const WORLD_FS = /* glsl */`
  ${GLSL.mat}
  ${GLSL.fog}
  uniform float uAlphaTest;
  varying vec3 vUv;
  varying vec3 vLight;
  varying float vFog;
  void main() {
    vec4 t = matSample(vUv.xy, vUv.z);
    if (t.a < uAlphaTest) discard;
    gl_FragColor = vec4(applyFog(t.rgb * vLight, vFog), t.a);
  }`;
// 摇动参数取 v2 面板保存的值（vc.v2.params），没有则用 v2 默认
const SWAY = (() => { try { const s = JSON.parse(localStorage.getItem('vc.v2.params') || 'null') || {};
  return [s.swayAmp ?? 0.04, s.swayFreq ?? 1.2, s.swayDist ?? 32]; } catch (e) { return [0.04, 1.2, 32]; } })();
const uTime = { value: 0 }, uSway = { value: new THREE.Vector3(...SWAY) };
const opaqueMat = new THREE.ShaderMaterial({ uniforms: { ...U, uAlphaTest: { value: 0.5 }, uWave: { value: 0 }, uTime, uSway }, vertexShader: WORLD_VS, fragmentShader: WORLD_FS });
const waterMat = new THREE.ShaderMaterial({ uniforms: { ...U, uAlphaTest: { value: 0.01 }, uWave: { value: 0 }, uTime, uSway: { value: new THREE.Vector3() } }, vertexShader: WORLD_VS, fragmentShader: WORLD_FS,
  transparent: true, depthWrite: false, side: THREE.DoubleSide });

const mbOpaque = new MeshBuilder(), mbWater = new MeshBuilder();
const tAO = new Int8Array(4), tS = new Float32Array(4), tB = new Float32Array(4);
function emitCube(mb, f, lx, y, lz, i, layer, water, lowerTop) {
  const F = FACES[f], ni = i + F.n, s0 = RSKY[ni], b0 = RBLK[ni];
  for (let k = 0; k < 4; k++) {
    const d = F.ao[k], i1 = i + d[0], i2 = i + d[1], i3 = i + d[2];
    const o1 = OPAQUE[RB[i1]], o2 = OPAQUE[RB[i2]], o3 = OPAQUE[RB[i3]];
    let s = s0, b = b0, n = 1;
    if (!o1) { s += RSKY[i1]; b += RBLK[i1]; n++; }
    if (!o2) { s += RSKY[i2]; b += RBLK[i2]; n++; }
    if (!o3 && !(o1 && o2)) { s += RSKY[i3]; b += RBLK[i3]; n++; }
    tAO[k] = water ? 3 : (o1 && o2) ? 0 : 3 - o1 - o2 - o3;
    tS[k] = s * 16 / n; tB[k] = b * 16 / n;
  }
  const base = mb.vc, sh = F.shade * 255;
  for (let k = 0; k < 4; k++) {
    const cc = F.c[k];
    let vy = (y + cc[1]) * PS; if (lowerTop && cc[1] === 1) vy -= PS / 8;
    mb.vert((lx + cc[0]) * PS, vy, (lz + cc[2]) * PS, UVS[k][0] * 16, UVS[k][1] * 16, layer, tS[k], tB[k], sh * AO_CURVE[tAO[k]]);
  }
  mb.quad(base, tAO[0] + tAO[2] < tAO[1] + tAO[3]);
}
function emitCross(mb, lx, y, lz, i, layer) {
  const s = RSKY[i] * 16, b = RBLK[i] * 16, lo = PS * 0.15, hi = PS * 0.85;
  const X = lx * PS, Y = y * PS, Z = lz * PS, T = Y + PS;
  const quads = [[X + lo, Z + lo, X + hi, Z + hi], [X + lo, Z + hi, X + hi, Z + lo]];
  for (const [ax, az, bx, bz] of quads) for (let side = 0; side < 2; side++) {
    const base = mb.vc;
    const p = side ? [[bx, Y, bz], [ax, Y, az], [ax, T, az], [bx, T, bz]] : [[ax, Y, az], [bx, Y, bz], [bx, T, bz], [ax, T, az]];
    for (let k = 0; k < 4; k++) mb.vert(p[k][0], p[k][1], p[k][2], UVS[k][0] * 16, UVS[k][1] * 16, layer, s, b, 235);
    mb.quad(base, false);
  }
}
function emitTorch(mb, lx, y, lz, i, layer) {
  let wx = 0, wz = 0;
  if (!SOLID[RB[i - 1]]) {
    if (SOLID[RB[i + RSCH]]) wx = 1; else if (SOLID[RB[i - RSCH]]) wx = -1;
    else if (SOLID[RB[i + CH]]) wz = 1; else if (SOLID[RB[i - CH]]) wz = -1;
  }
  const s = RSKY[i] * 16, b = RBLK[i] * 16;
  for (const f of [0, 1, 2, 4, 5]) {
    const F = FACES[f], base = mb.vc;
    for (let k = 0; k < 4; k++) {
      const cc = F.c[k];
      let vx = 7 / 16 + cc[0] * 2 / 16, vy = cc[1] * 10 / 16, vz = 7 / 16 + cc[2] * 2 / 16;
      if (wx || wz) { const t = 0.35 - vy * 0.45; vx += wx * t; vz += wz * t; vy += 0.2; }
      const u = 7 + UVS[k][0] * 2, v = f === 2 ? 8 + UVS[k][1] * 2 : UVS[k][1] * 10;
      mb.vert(Math.round((lx + vx) * PS), Math.round((y + vy) * PS), Math.round((lz + vz) * PS), u, v, layer, s, b, 255);
    }
    mb.quad(base, false);
  }
}

let meshTimeAvg = 0;
function buildChunk(c) {
  const t0 = performance.now();
  const mo = mbOpaque, mw = mbWater; mo.reset(); mw.reset();
  for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
    const base = ((lx + CS) * RS + lz + CS) * CH;
    for (let y = 0; y < CH - 1; y++) {
      const i = base + y, b = RB[i]; if (b === 0) continue;
      const r = RENDER[b];
      if (r === R_CUBE) {
        for (let f = 0; f < 6; f++) {
          if (f === 3 && y === 0) continue;
          const nb = RB[i + FACES[f].n];
          if (OPAQUE[nb] || (b === B.GLASS && nb === B.GLASS)) continue;
          emitCube(mo, f, lx, y, lz, i, f === 2 ? T_TOP[b] : f === 3 ? T_BOT[b] : T_SIDE[b], false, false);
        }
      } else if (r === R_WATER) {
        const lower = RB[i + 1] !== B.WATER;
        for (let f = 0; f < 6; f++) {
          const nb = RB[i + FACES[f].n];
          if (nb === B.WATER || OPAQUE[nb]) continue;
          emitCube(mw, f, lx, y, lz, i, T_SIDE[b], true, lower);
        }
      } else if (r === R_CROSS) emitCross(mo, lx, y, lz, i, T_SIDE[b]);
      else if (r === R_TORCH) emitTorch(mo, lx, y, lz, i, T_SIDE[b]);
    }
  }
  setChunkMesh(c, 'mesh', mo, opaqueMat);
  setChunkMesh(c, 'waterMesh', mw, waterMat);
  meshTimeAvg = meshTimeAvg * 0.9 + (performance.now() - t0) * 0.1;
}
function setChunkMesh(c, key, mb, mat) {
  const old = c[key];
  if (old) { scene.remove(old); old.geometry.dispose(); c[key] = null; }
  if (mb.vc === 0) return;
  const m = new THREE.Mesh(makeGeometry(mb), mat);
  m.position.set(c.cx * CS, 0, c.cz * CS); m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m); c[key] = m;
}
function disposeChunk(c) {
  for (const k of ['mesh', 'waterMesh']) if (c[k]) { scene.remove(c[k]); c[k].geometry.dispose(); c[k] = null; }
}
function update(dt) { waterMat.uniforms.uWave.value = (performance.now() / 12000) % 1; uTime.value = (performance.now() / 1000) % 3600; }
function render() { renderer.render(scene, camera); }
return { name: 'v1', buildChunk, disposeChunk, update, render, mbOpaque,
  stats: () => `mesh ${meshTimeAvg.toFixed(1)} ms` };
}
