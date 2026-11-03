// rgl/pass.js —— 模板化着色器 Pass（render.md §4.1 第 1–10 条；参照 goal-remix/ref/ripple-regl.js 的 Pass 工厂，加强版）
//   const kit = createPassKit(gl, { dev });  const pass = kit.Pass({ vs: glsl`…`, attribs })`#version 300 es … ${ao.strength} …`;
//   pass.use() → 绑 program（按当前宏值查编译缓存）+ 上传全部 uniform；返回 { p, loc }
//   位置决定种类：以 `#` 开头的行里的 ${f} = 宏（`#if ${f}` 取数值、`#ifdef ${f}` 按真假、`#define X ${f}` 取文本）；其他位置 = uniform，
//   名字取自 Ref 的 key / 箭头函数源码末尾的 `.xxx`（或裸标识符）/ 显式 `u('名字', f)`；类型取自第一次求值的默认值，声明自动前置。
//   正文里的裸值（数字、字符串）直接报错：静态值要走 `#` 行。`glsl` 片段可嵌套拼接（模块化），VS 与 FS 共用一张 uniform 表。
//   纯函数部分（flatten / buildSource / headerSplit）不碰 GL，tools/test-pass.mjs 在 node 里直接测。
import { glslTypeOf } from './vars.js';

// ---- 帧对象（原 frameref.js）：每帧开头 setFrame(F)。两个句柄：
//   Fps.sunDir —— 模板里用：`${Fps.sunDir}` 是名叫 sunDir 的 uniform 引用（同一个键总是同一个函数，名字就是键）
//   Fpv.w      —— JS 里读值：`Fpv.w`、`Fpv.underwater`
let cur = null;
export const setFrame = f => { cur = f; };
export const Fpv = new Proxy({}, { get: (_, k) => cur[k] });
const fps = new Map();
export const Fps = new Proxy({}, { get: (_, k) => { let r = fps.get(k); if (!r) { r = () => cur[k]; r.key = k; r.owner = Fpv; fps.set(k, r); } return r; } });

const GLSL_TAG = Symbol('glsl'), NAMED = Symbol('u');
export const glsl = (strings, ...vals) => ({ [GLSL_TAG]: true, strings, vals });
export const u = (name, f) => ({ [NAMED]: true, name, f });
// 一组 uniform 来源按键名自动命名：`named({ wnoise: () => tex(wnoise) })` ≡ `{ wnoise: u('wnoise', …) }`（已经是 u() 的原样保留）
export const named = o => Object.fromEntries(Object.entries(o).map(([k, f]) => [k, f && f[NAMED] ? f : u(k, f)]));

const isFrag = x => x && x[GLSL_TAG];
const isNamed = x => x && x[NAMED];

// ---- 名字：Ref → key；箭头函数 → 形参名（`texel => …`），否则源码末尾标识符（`() => softStr` → softStr，`_ => C.bru` → bru，`() => F.sunDir` → sunDir）
export function nameOf(f) {
  if (isNamed(f)) return f.name;
  if (typeof f !== 'function') throw new Error('pass: ${} 里只允许 glsl 片段和函数（Ref / 箭头函数）：' + String(f));
  if (f.key && f.owner) return f.key;                                        // Ref
  const src = Function.prototype.toString.call(f);
  const i = src.indexOf('=>'); if (i < 0) throw new Error('pass: 无法推断 uniform 名，请用 u(\'名字\', f)：' + src);
  const prm = src.slice(0, i).trim().replace(/^\(|\)$/g, '').trim();                    // `texel => …` / `(texel) => …`：形参名就是 uniform 名（`_` 和无参不算）
  if (/^[A-Za-z$][\w$]*$/.test(prm) && prm !== 'async') return prm;
  const m = src.slice(i + 2).trim().replace(/[\s;)}]+$/, '').match(/([A-Za-z_$][\w$]*)$/);
  if (!m) throw new Error('pass: 无法推断 uniform 名，请用 u(\'名字\', f)：' + src);
  return m[1];
}
const getter = f => isNamed(f) ? f.f : f;
const refLike = f => f.key && f.owner;
const srcOf = f => Function.prototype.toString.call(isNamed(f) ? f.f : f);
const sameSource = (a, b) => a === b || (!refLike(a) && !refLike(b) && srcOf(a) === srcOf(b));   // u('名', f) 两处写同一段源码也算同一个 uniform

// ---- 展平：片段树 → [{ t: 'text', s } | { t: 'macro'|'uniform', f, dir }]；位置按「当前行去掉前导空白后是否以 # 开头」决定
export function flatten(frag) {
  const out = []; let line = '';
  const text = s => { out.push({ t: 'text', s }); const k = s.lastIndexOf('\n'); line = k < 0 ? line + s : s.slice(k + 1); };
  const walk = fr => {
    for (let i = 0; i < fr.strings.length; i++) {
      text(fr.strings[i]);
      if (i >= fr.vals.length) continue;
      const v = fr.vals[i];
      if (isFrag(v)) { walk(v); continue; }
      if (typeof v !== 'function' && !isNamed(v)) throw new Error(`pass: 正文里不允许裸值 \${${String(v)}}（数字 / 字符串）；静态值请写在 # 行：#define X \${() => v}`);
      const hash = line.trimStart().startsWith('#');
      out.push({ t: hash ? 'macro' : 'uniform', f: v, dir: hash ? line.trimStart().match(/^#\s*(\w+)/)[1] : null });
    }
  };
  walk(frag); return out;
}

// ---- 头部：`#version` 必须第一行，precision 行紧随其后；uniform 声明插在它们之后
export function headerSplit(src) {
  const lines = src.split('\n'); let i = 0;
  while (i < lines.length && /^\s*(#version\b|precision\b|$)/.test(lines[i])) i++;
  return [lines.slice(0, i).join('\n'), lines.slice(i).join('\n')];
}

// ---- 生成源码（纯函数）：pieces → { src, macroVals }；uniformTypes：name → GLSL 类型（第一次求值时填）
export function buildSource(pieces, uniforms /* Map name → {f, type} */) {
  let body = '', macroVals = [];
  for (const p of pieces) {
    if (p.t === 'text') body += p.s;
    else if (p.t === 'uniform') body += nameOf(p.f);
    else {
      const v = getter(p.f)();
      const txt = p.dir === 'ifdef' ? (v ? '1' : '0') : p.dir === 'ifndef' ? (v ? '0' : '1') : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
      macroVals.push(txt); body += txt;
    }
  }
  // `#ifdef ${f}` / `#ifndef ${f}` 已被替换成 `#ifdef 1`：整行改写为 `#if 1` / `#if 0`
  body = body.replace(/^([ \t]*)#\s*ifdef[ \t]+([01])/gm, '$1#if $2').replace(/^([ \t]*)#\s*ifndef[ \t]+([01])/gm, '$1#if $2');
  const used = new Set(pieces.filter(p => p.t === 'uniform').map(p => nameOf(p.f)));      // 只声明本阶段用到的（VS / FS 共用表，但声明各自一份）
  const decl = [...uniforms].filter(([n]) => used.has(n)).map(([n, x]) => `uniform ${x.type} ${n};`).join('\n');
  const [head, rest] = headerSplit(body);
  return { src: head + '\n' + decl + '\n' + rest, macroKey: macroVals.join(','), macroVals };
}

const SAMPLER_TARGET = { sampler2D: 0x0DE1, sampler2DShadow: 0x0DE1, sampler2DArray: 0x8C1A, usampler3D: 0x806F, sampler3D: 0x806F, usampler2D: 0x0DE1, isampler2D: 0x0DE1 };

export function createPassKit(gl, { dev = false } = {}) {
  const warned = new Set();
  function Pass({ vs, attribs = {}, tag = '' } = {}) {
    return (strings, ...vals) => {
      const fsPieces = flatten({ strings, vals });
      const vsFrag = vs == null ? null : typeof vs === 'string' ? { strings: [vs], vals: [] } : vs;
      const vsPieces = vsFrag ? flatten(vsFrag) : null;
      // 共用的 uniform 表（FS + VS）：同名必须是同一个 Ref / 同源码箭头函数
      const table = new Map();
      for (const p of [...fsPieces, ...(vsPieces || [])]) {
        if (p.t !== 'uniform') continue;
        const n = nameOf(p.f), old = table.get(n);
        if (old && !sameSource(old.f, p.f)) throw new Error(`pass${tag ? ' ' + tag : ''}: uniform '${n}' 被两个不同的来源引用`);
        if (!old) table.set(n, { f: p.f, type: null, up: null, unit: -1 });
      }
      const cache = new Map(); let cur = null, nUnits = 0;
      const typeOf = (n, x) => {
        const v = getter(x.f)(), t = glslTypeOf(v, getter(x.f).meta || {});
        if (x.type == null) x.type = t;
        else if (dev && x.type !== t) throw new Error(`pass ${tag}: uniform '${n}' 类型变了：${x.type} → ${t}`);
        return t;
      };
      const compile = () => {
        for (const [n, x] of table) typeOf(n, x);                                // 第一次编译时定类型
        const fs = buildSource(fsPieces, table), vsr = vsPieces ? buildSource(vsPieces, table) : null;
        const key = fs.macroKey + '|' + (vsr ? vsr.macroKey : '');
        let e = cache.get(key); if (e) return e;
        const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`pass ${tag}: ${gl.getShaderInfoLog(s)}\n` + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return s; };
        const p = gl.createProgram();
        gl.attachShader(p, mk(gl.VERTEX_SHADER, vsr ? vsr.src : FSQ_VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs.src));
        for (const [a, l] of Object.entries(attribs)) gl.bindAttribLocation(p, l, a);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`pass ${tag}: link ${gl.getProgramInfoLog(p)}`);
        // 自检：活跃但没绑定 → 错；绑定了但不活跃 → 警告一次（被 #if 剔掉是正常的）
        const loc = new Map(), active = new Set();
        for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
          const info = gl.getActiveUniform(p, i), name = info.name.replace(/\[0\]$/, ''); active.add(name);
          if (!table.has(name)) throw new Error(`pass ${tag}: 活跃 uniform '${name}' 没有绑定`);
          loc.set(name, gl.getUniformLocation(p, info.name));
        }
        for (const n of table.keys()) if (!active.has(n) && !warned.has(tag + n)) { warned.add(tag + n); if (dev) console.warn(`pass ${tag}: uniform '${n}' 未被使用（可能被 #if 剔除）`); }
        e = { p, loc, key }; cache.set(key, e); return e;
      };
      const upload = (n, x, l) => {
        const v = getter(x.f)(), t = dev ? typeOf(n, x) : x.type;
        switch (t) {
          case 'float': gl.uniform1f(l, v); break;
          case 'int': gl.uniform1i(l, v); break;
          case 'bool': gl.uniform1i(l, v ? 1 : 0); break;
          case 'vec2': gl.uniform2fv(l, v); break; case 'vec3': gl.uniform3fv(l, v); break; case 'vec4': gl.uniform4fv(l, v); break;
          case 'mat4': gl.uniformMatrix4fv(l, false, v); break;
          default: {                                                            // 采样器：按声明顺序占纹理单元
            if (x.unit < 0) x.unit = nUnits++;
            gl.activeTexture(gl.TEXTURE0 + x.unit); gl.bindTexture(SAMPLER_TARGET[t], v && v.texture !== undefined ? v.texture : v); gl.bindSampler(x.unit, v && v.sampler || null); gl.uniform1i(l, x.unit);   // 值可以是 { texture, sampler, glslType }（要用 Sampler 对象时，如 goodGL 的 rawSampler）；否则解绑，以贴图自带参数为准（别的 pass 可能在这个单元上留了 Sampler）
          }
        }
        if (false) { const er = gl.getError(); if (er) throw new Error(`pass ${tag}: 上传 uniform '${n}' (${t}) 后 GL 错误 ${er}`); }
      };
      const pass = {
        tag, table, cache,
        use() { const e = compile(); gl.useProgram(e.p); cur = e; for (const [n, l] of e.loc) upload(n, table.get(n), l); return e; },
        touch(...names) { if (!cur) return; for (const n of names) { const l = cur.loc.get(n); if (l) upload(n, table.get(n), l); } },   // 每次 draw 都变的量（offset / origin）：只重传这几个
        get program() { return cur && cur.p; },
        get variants() { return cache.size; },
        source() { for (const [n, x] of table) typeOf(n, x); return { fs: buildSource(fsPieces, table).src, vs: vsPieces ? buildSource(vsPieces, table).src : FSQ_VS }; },
      };
      return pass;
    };
  }
  return { Pass, glsl, u };
}

const FSQ_VS = `#version 300 es
out vec2 v_uv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
