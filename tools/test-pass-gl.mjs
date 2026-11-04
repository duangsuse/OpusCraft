// rgl/pass.js 的 GL 部分（编译缓存 / 自检 / 上传 / 采样器）：node tools/test-pass-gl.mjs（需要 :8765 静态服务器；无头 Chromium）
import { launch, killStray } from './cdp.mjs'; import { setTimeout as sleep } from 'node:timers/promises';
killStray();
const b = await launch({ tag: 'passgl', width: 320, height: 240 });
await b.send('Page.navigate', { url: 'http://localhost:8765/goal-remix/README.md' }); await sleep(800);
const r = await b.js(`(async () => {
  const { createPassKit, glsl, u } = await import('/rgl/pass.js'); const { vars } = await import('/rgl/vars.js');
  const cv = document.createElement('canvas'); cv.width = cv.height = 4; const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true });
  const kit = createPassKit(gl, { dev: true }), C = vars({ mode: true, k: 0.5, col: [0.2, 0.4, 0.6] }), out = {};
  const P = kit.Pass({ tag: 't' })\`#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
#if \${C.it.mode}
const float G = 1.0;
#else
const float G = 0.0;
#endif
void main() { o = vec4(\${C.it.k}, \${C.it.col}.g, \${C.it.col}.b, G); }\`;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.viewport(0, 0, 4, 4);
  const px = () => { const a = new Uint8Array(4); gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a); return [...a]; };
  const draw = () => { P.use(); gl.drawArrays(gl.TRIANGLES, 0, 3); return px(); };
  out.a = draw(); C.k = 1; out.b = draw();
  C.it.mode.set(false); out.c = draw(); out.v1 = P.variants;
  C.it.mode.set(true); out.d = draw(); out.v2 = P.variants;       // 切回旧值：命中缓存，不新增变体
  try { C.col = [1, 2]; draw(); out.err1 = null; } catch (e) { out.err1 = String(e.message).slice(0, 60); }
  C.col = [0.2, 0.4, 0.6];
  try { kit.Pass({ tag: 'bad' })\`#version 300 es
precision highp float; out vec4 o; void main(){ o = vec4(\${C.it.k}); float x = \${3}; }\`; } catch (e) { out.err2 = String(e.message).slice(0, 30); }
  const Q = kit.Pass({ tag: 'bad2' })\`#version 300 es
precision highp float; out vec4 o; uniform float stray; void main(){ o = vec4(stray); }\`;
  try { Q.use(); out.err3 = null; } catch (e) { out.err3 = String(e.message).slice(0, 50); }
  // 整数 / 矩阵 uniform（meta.glsl 或 Int32Array / Uint32Array 推断）：值经 RGBA8 读回
  const meta = (f, glsl) => Object.assign(f, { meta: { glsl } });   // uniform 名取自箭头函数源码，所以每个值各写一个箭头
  const ivA = new Int32Array([10, 20]), uvA = new Uint32Array([0, 0, 30]);
  const uiV = 50, iv2 = [1, 2], m3 = new Float32Array([1, 0, 0, 0, 40, 0, 0, 0, 1]), m2 = new Float32Array([5, 0, 0, 7]);
  const I = kit.Pass({ tag: 'int' })\`#version 300 es
precision highp float; out vec4 o;
void main() { o = vec4(float(\${() => ivA}.x), float(\${() => ivA}.y), float(\${() => uvA}.z), \${meta(() => m3, 'mat3')}[1][1] + float(\${meta(() => uiV, 'uint')}) + \${meta(() => m2, 'mat2')}[1][1] + float(\${meta(() => iv2, 'ivec2')}.y)) / 255.0; }\`;
  I.use(); gl.drawArrays(gl.TRIANGLES, 0, 3); out.int = px();
  return out;
})()`).catch(e => ({ err: String(e) }));
console.log(JSON.stringify(r)); b.close();
const ok = r.a && r.a[0] === 128 && r.a[3] === 255 && r.b[0] === 255 && r.c[3] === 0 && r.v1 === 2 && r.d[3] === 255 && r.v2 === 2 && /类型变了/.test(r.err1 || '') && /裸值/.test(r.err2 || '') && JSON.stringify(r.int) === '[10,20,30,99]';
console.log(ok ? 'pass-gl OK' : 'pass-gl FAIL'); process.exit(ok ? 0 : 1);
