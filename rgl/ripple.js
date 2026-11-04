// rgl/ripple.js —— 水面波纹：Eulerian 高度场（goal-remix/ref/ripple-regl.js ②③ 的移植，water.md §0.1「为高度场波纹留的口子」）。
//   状态 = 环形 RGBA16F 纹理 S = { R: h, G: 上一步 h }，ping-pong 两张；以世界格坐标取模索引（texel = world·T mod N，不滚动，同 surfacefield）。
//   sim pass（20 Hz 固定步长，与帧率无关）：4 邻拉普拉斯 n = Σ邻居·0.5 − 上一步（波方程 Verlet）× 阻尼；
//     边界遮罩 = 岸线场 fieldTex（R == 1 水面列 → 整体阻尼；实心 / 无信息 → 0.6，波在岸边被吸收），不需要额外的边界数据。
//   扰动 = 线段 SDF 连续笔刷：玩家上一帧 → 这一帧的脚底位置，沿线连续注入（快速移动不断点）。
//     注入条件：身体与水面相交（脚在水面下、头在水面上或刚没过头）。力度 = 水平速度（尾迹）+ 竖直速度（入水 / 出水的水花）。
//   水着色器（long/water.js）读 h 的梯度，加进水面法线（上下表面共用，水下看水面也会晃）。窗口 N/T = 64 格，以相机为中心 ±32 格有效（着色器按距离淡出）。
import { named } from './pass.js';

export const RIP = { N: 256, T: 4, HZ: 20 };
const AWAKE_S = 5;   // 最后一次注入后继续跑 sim 的秒数（0.985^(20·5) ≈ 0.22，之后清零休眠）   // N 纹素 / T 纹素每格 → 窗口 N/T = 64 格；固定步长 HZ

export function createRipples(gl, R, kit, { tex, X, field, restore, eyeHeight = 1.62 }) {
  const on = R.floatOK && typeof R.makeTex === 'function';
  if (!on) return { on: false, tex: () => null, update() {}, poke() {}, step() {}, stats: () => ({}) };
  const st = { camXZ: [0, 0], brushA: [0, 0], brushB: [0, 0], brushF: 0, brushR: 0.5, damp: 0.985 };
  const U = named({ camXZ: () => st.camXZ, brushA: () => st.brushA, brushB: () => st.brushB, brushF: () => st.brushF, brushR: () => st.brushR, damp: () => st.damp });

  const mk = () => { const t = R.makeTex(RIP.N, RIP.N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); gl.bindTexture(gl.TEXTURE_2D, null); return t; };
  const texs = [mk(), mk()], fbos = texs.map(t => R.fbo(t));
  let cur = 0;                                            // 最新状态所在下标；sim 读 cur、写 1 − cur
  const Xs = named({ rS: () => tex(texs[cur]) });
  const sim = kit.Pass({ tag: 'ripple' })`#version 300 es
precision highp float; precision highp usampler2D;
#define RN ${() => RIP.N}
#define RT ${() => RIP.T}
in vec2 v_uv; out vec4 o;
float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0)); }
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy), m = ivec2(RN - 1);
  vec4 s = texelFetch(${Xs.rS}, ij, 0);
  float nb = texelFetch(${Xs.rS}, (ij + ivec2(1, 0)) & m, 0).r + texelFetch(${Xs.rS}, (ij - ivec2(1, 0)) & m, 0).r
           + texelFetch(${Xs.rS}, (ij + ivec2(0, 1)) & m, 0).r + texelFetch(${Xs.rS}, (ij - ivec2(0, 1)) & m, 0).r;
  float n = nb * 0.5 - s.g;
  // 这个纹素在相机附近对应的世界位置（环形：取离相机最近的那个）
  float W = float(RN / RT);
  vec2 d = (vec2(ij) + 0.5) / float(RT) - ${U.camXZ}; d -= W * floor(d / W + 0.5);
  vec2 w = ${U.camXZ} + d;
  uint r = texelFetch(${X.shoreFld}, ivec2(floor(w)) & ivec2(${X.shoreN} - 1), 0).r;
  n *= r == 1u ? ${U.damp} : 0.6;
  n += ${U.brushF} * (1.0 - smoothstep(0.0, ${U.brushR}, segDist(w, ${U.brushA}, ${U.brushB})));
  o = vec4(n, s.r, 0.0, 0.0);
}`;

  function runSim() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1 - cur]); gl.viewport(0, 0, RIP.N, RIP.N);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    sim.use(); gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    cur = 1 - cur; st.brushF = 0;
  }

  // 玩家笔刷：每帧合并成一个待注入的线段（最早的 A、最新的 B、最大力度 / 半径），下一个固定步长消费
  const pend = { has: false, ax: 0, az: 0, bx: 0, bz: 0, f: 0, r: 0.5 };
  const prev = { x: 0, y: 0, z: 0, ok: false };
  let acc = 0, steps = 0, touch = 0, awake = 0;                  // awake：剩余清醒秒数（有注入时 = AWAKE_S，衰减到 0 就休眠：不跑 sim、着色器也不采样）
  const colAt = (x, z) => { const m = field.N - 1, i = (((Math.floor(z)) & m) * field.N + ((Math.floor(x)) & m)) * 2; return [field.data[i], field.data[i + 1]]; };
  function poke(ax, az, bx, bz, f, r = 0.5) {
    if (!pend.has) { pend.has = true; pend.ax = ax; pend.az = az; pend.f = 0; pend.r = r; }
    pend.bx = bx; pend.bz = bz; if (Math.abs(f) > Math.abs(pend.f)) pend.f = f; pend.r = Math.max(pend.r, r); awake = AWAKE_S;
  }
  // 水体模拟的水位变化（宿主 B 流体 tick / 破坏海边方块后水涌入）→ 在该格注入一个点扰动，f 的符号 = 水位升 / 降。
  //   排队：事件发生时区块还没重建，岸线场里这一列可能还不是水面列（sim 在非水列上阻尼 0.6，脉冲会被吃掉）→ 等 field 标成水面列再注入，超过 1.5 s 放弃；
  //   y（可选）：变化格的高度，只在水面附近（≥ 水面列最高水格 − 1）才注入，深水下方的变化不会引起水面波。
  const dq = [];
  const disturb = (x, z, f = 0.04, r = 0.7, y = null) => { if (dq.length < 256) dq.push({ x, z, f, r, y, age: 0 }); awake = AWAKE_S; };
  function flushDisturb(s) {
    for (let i = dq.length - 1; i >= 0; i--) {
      const d = dq[i]; d.age += s; const [rr, g] = colAt(d.x, d.z);
      if (rr === 1 && (d.y == null || d.y >= g - 1)) { poke(d.x, d.z, d.x, d.z, d.f, d.r); dq.splice(i, 1); }
      else if (d.age > 1.5) dq.splice(i, 1);
    }
  }
  // 玩家尾迹：身体与水面相交满 delay 秒、且在水平移动才出波纹。入水 / 出水那一下不出（没有水花）：刚接触时 touch 从 0 计时，离开水面清零
  function player(dt, cam, delay) {
    const x = cam.x, y = cam.y - eyeHeight, z = cam.z, s = dt / 1000;
    let touching = false;
    if (prev.ok && s > 0 && Math.hypot(x - prev.x, z - prev.z) < 6 && Math.abs(y - prev.y) < 6) {
      const [r, g] = colAt(x, z);
      if (r === 1) {
        const surf = g + 1 - 1 / 9, top = y + 1.8;
        touching = y < surf + 0.15 && top > surf - 0.3;                    // 与水面相交
        if (touching) {
          touch += s;
          const sp = Math.hypot(x - prev.x, z - prev.z) / s;
          const f = Math.min(sp * 0.012, 0.12);
          if (touch >= delay && f > 0.004) poke(prev.x, prev.z, x, z, f, 0.5);
        }
      }
    }
    if (!touching) touch = 0;
    prev.x = x; prev.y = y; prev.z = z; prev.ok = true;
  }
  function step(n = 1) {
    st.camXZ = [lastCam.x, lastCam.z];
    for (let i = 0; i < n; i++) {
      if (pend.has) { st.brushA = [pend.ax, pend.az]; st.brushB = [pend.bx, pend.bz]; st.brushF = pend.f; st.brushR = pend.r; pend.has = false; }
      asleep = false; runSim(); steps++;
    }
  }
  const lastCam = { x: 0, z: 0 };
  let asleep = true;
  function sleep() {
    if (asleep) return; asleep = true; acc = 0;
    for (const f of fbos) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    restore();
  }
  return {
    on: true, RIP,
    tex: () => texs[cur],
    poke, step: n => { step(n); restore(); },
    stats: () => ({ steps, pending: pend.has }),
    // 每帧（renderFancy 之前）：玩家笔刷 → 固定步长累加 → 跑 sim；返回是否动过 GL 状态（调用方据此 restore）
    update(dt, cam, strength, delay = 0.5) {
      lastCam.x = cam.x; lastCam.z = cam.z;
      if (!(strength > 0)) { prev.ok = false; touch = 0; dq.length = 0; sleep(); return false; }
      st.damp = 0.985; player(dt, cam, delay); flushDisturb(dt / 1000);
      if (awake <= 0 && !pend.has) { sleep(); return false; }
      awake = Math.max(0, awake - dt / 1000);
      acc += dt; const n = Math.min(2, Math.floor(acc * RIP.HZ / 1000)); acc -= n * 1000 / RIP.HZ; if (acc > 100) acc = 0;
      if (!n) return false;
      step(n); restore(); return true;
    },
    awake: () => awake > 0 || pend.has,
    // 调试：读回当前状态，返回 { max |h|, 非零纹素数, 重心（世界格，相对相机最近的映射）}；tools/ripple-check.mjs 用
    probe() {
      const px = new Float32Array(RIP.N * RIP.N * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[cur]); gl.readPixels(0, 0, RIP.N, RIP.N, gl.RGBA, gl.FLOAT, px); restore();
      let mx = 0, nz = 0, sx = 0, sz = 0, sw = 0;
      for (let j = 0; j < RIP.N; j++) for (let i = 0; i < RIP.N; i++) { const h = Math.abs(px[(j * RIP.N + i) * 4]); if (h > 1e-4) { nz++; sw += h; sx += i * h; sz += j * h; if (h > mx) mx = h; } }
      return { max: +mx.toFixed(4), nonzero: nz, cx: sw ? +(sx / sw / RIP.T).toFixed(2) : null, cz: sw ? +(sz / sw / RIP.T).toFixed(2) : null, awake: awake > 0 };
    },
    disturb,
  };
}
