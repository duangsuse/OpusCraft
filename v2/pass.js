// v2/pass.js — 全屏 pass 模板（goal-glmod §1.1 / §1.1b）：把 2D 项目 Pass({tag})`...${_ => P.x}` 的写法搬到 three 上
//   GLSL 里的 ${fn}：所在行以 # 开头 → 编译期宏（插入宏名；值每帧求值，变了才重编译）；其他位置 → uniform（插入名字，每次 run 回填 fn()）
//   名字 = 箭头函数源码末尾的 `.xxx`；非属性表达式 / 冲突时 u('名字', fn) 显式给名。非函数插值按文本原样拼接
//   glsl`…` 产出可拼接的片段（模块）：片段里的 ${fn} 跟着片段走，拼进哪个 pass 就成为哪个 pass 的 uniform / 宏
export const u = (k, f) => (f.k = k, f);
const nameOf = f => {
  if (f.k) return f.k;
  const m = (f + '').match(/\.(\w+)\s*$/);
  if (!m) throw new Error(`[pass] 无法从 ${f} 推出名字，用 u('名字', fn)`);
  return (f.k = m[1]);
};
class Frag { constructor(strs, vals) { this.strs = strs; this.vals = vals; } }
export const glsl = (strs, ...vals) => new Frag(strs, vals);
// 展平：片段嵌片段 → 一串 [文本, 函数, 文本, …]
function flat(strs, vals, out = []) {
  strs.forEach((t, i) => {
    out.push(t);
    if (i >= vals.length) return;
    const v = vals[i];
    if (v instanceof Frag) flat(v.strs, v.vals, out);
    else if (typeof v === 'function') out.push(v);
    else out.push(String(v));
  });
  return out;
}
// three 自带、不由我们绑定的 uniform（ShaderMaterial 前缀里的）
const BUILTIN = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic']);

// defs：模块级派生宏 { NAME: () => 值 }（= 原 syncDefines 的 want），kit.update() 每帧求值一次；ext：宿主共享 uniform（GLSL 里自己声明，不回填）
export function passKit(THREE, { defs = {}, ext = {} } = {}) {
  const geo = new THREE.PlaneGeometry(2, 2), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const defVal = {}, warned = new Set();
  const update = () => { for (const k in defs) defVal[k] = +defs[k](); };
  update();
  const head = Object.keys(defs).map(k => `#ifndef ${k}\n#define ${k} 0\n#endif\n`).join('');

  // 一份源码 → { src, uniforms, macros }；macros = { 名字: getter }（${} 宏 + 源码里出现的 Defs 键）
  function compile(strs, vals) {
    const parts = flat(strs, vals), own = {}, macros = {};
    let src = '';
    for (const p of parts) {
      if (typeof p !== 'function') { src += p; continue; }
      const k = nameOf(p), line = src.slice(src.lastIndexOf('\n') + 1);
      if (/^\s*#/.test(line)) {
        if (macros[k] && macros[k] !== p) throw new Error(`[pass] 宏 ${k} 有两个不同的来源`);
        macros[k] = p;
      } else {
        if (own[k] && own[k].get !== p) throw new Error(`[pass] uniform ${k} 有两个不同的 getter`);
        own[k] = own[k] || { value: null, get: p };
      }
      src += k;
    }
    for (const k of new Set(src.match(/\b[A-Z_][A-Z0-9_]*\b/g) || [])) if (k in defs && !macros[k]) macros[k] = () => defVal[k];
    return { src: head + src, own, macros };
  }

  // 一个 pass = 一个材质（同一份源码可派生多个变体：静态宏不同，uniform 对象共享）
  function make(c, { defines = {}, ...matOpts }) {
    const uniforms = { ...ext, ...c.own };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, depthTest: false, depthWrite: false, ...matOpts,
      uniforms, fragmentShader: c.src, defines: { ...defines } });
    const quad = new THREE.Mesh(geo, mat); quad.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(quad);
    const fixed = new Set(Object.keys(defines));
    let checked = null;
    const pass = {
      mat, uniforms, defineRefs: Object.keys(c.macros).filter(k => !fixed.has(k)),
      // 宏：静态 defines 优先；其余按当前值同步，变了才 needsUpdate
      sync() {
        let ch = false;
        for (const k in c.macros) if (!fixed.has(k)) { const v = +c.macros[k](); if (mat.defines[k] !== v) { mat.defines[k] = v; ch = true; } }
        if (ch) mat.needsUpdate = true;
      },
      fill() { for (const k in c.own) uniforms[k].value = c.own[k].get(); },
      run(renderer, rt, clear = false) {
        pass.sync(); pass.fill();
        renderer.setRenderTarget(rt); if (clear) renderer.clear();
        renderer.render(scene, cam);
        const pr = renderer.properties.get(mat).currentProgram;
        if (pr && pr !== checked) { checked = pr; selfCheck(renderer.getContext(), pr.program); }
      },
      variant: opts => make(c, { ...matOpts, ...opts }),
    };
    // 双向自检（§1.1b-4）：活跃但未绑定 → throw；绑定但不活跃 → warn（被 #if 剔掉是正常的，同一组只报一次）
    function selfCheck(gl, prog) {
      const act = new Set(), n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) act.add(gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '').replace(/\..*$/, ''));
      const miss = [...act].filter(k => !(k in uniforms) && !BUILTIN.has(k));
      if (miss.length) throw new Error(`[pass] 活跃 uniform 未绑定：${miss.join(', ')}`);
      const idle = Object.keys(c.own).filter(k => !act.has(k)), key = idle.join(',');
      if (idle.length && !warned.has(key)) { warned.add(key); console.warn(`[pass] 绑定但不活跃（#if 剔除？）：${key}`); }
    }
    return pass;
  }
  const Pass = (opts = {}) => (strs, ...vals) => make(compile(strs, vals), opts);
  return { Pass, update, defVal };
}
