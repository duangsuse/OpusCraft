// rgl/pass.js 的纯函数部分（flatten / buildSource / nameOf / headerSplit）：node tools/test-pass.mjs；GL 部分由 verify-renderer 的 pass 检查覆盖
import assert from 'node:assert/strict';
import { glsl, u, named, nameOf, flatten, buildSource, headerSplit, Fps, Fpv, setFrame } from '../rgl/pass.js';
import { vars } from '../rgl/vars.js';
const C = vars({ pbr: true, ao: { strength: 0.6 }, n: 3, sun: [1, 2, 3] }), F = { sunDir: [0, 1, 0], k: 2 };
const ao = C.ao.it;
// 名字
assert.equal(nameOf(ao.strength), 'strength');
assert.equal(nameOf(() => F.sunDir), 'sunDir'); assert.equal(nameOf(_ => C.n), 'n'); assert.equal(nameOf(() => softStr), 'softStr');
assert.equal(nameOf(u('x', () => 1)), 'x');
assert.equal(nameOf(texel => [1, 2]), 'texel'); assert.equal(nameOf((reset) => 1 + 2), 'reset'); assert.equal(nameOf(() => Fpv.w), 'w');   // 形参名优先；无参 / `_` 取末尾标识符
setFrame({ sunDir: [0, 1, 0], w: 4 }); assert.equal(nameOf(Fps.sunDir), 'sunDir'); assert.deepEqual(Fps.sunDir(), [0, 1, 0]); assert.equal(Fps.sunDir, Fps.sunDir); assert.equal(Fpv.w, 4);
assert.equal(nameOf(named({ wnoise: () => 1 }).wnoise), 'wnoise'); assert.equal(nameOf(named({ k: u('real', () => 1) }).k), 'real');
assert.throws(() => nameOf(() => 1 + 2), /无法推断/);
assert.throws(() => nameOf(5), /只允许/);
// 位置 → 种类
const frag = (s, ...v) => ({ strings: s, vals: v });
const mk = (...a) => glsl(...a);
const f1 = mk`#version 300 es
precision highp float;
#if ${C.it.pbr}
float a = ${ao.strength};
#endif
#ifdef ${() => F.k > 1}
void b() {}
#endif
#define N ${C.it.n}
void main() { float s = ${() => F.k}; vec3 d = ${() => F.sunDir}; }`;
const pieces = flatten(f1);
assert.deepEqual(pieces.filter(p => p.t !== 'text').map(p => [p.t, p.dir]), [['macro', 'if'], ['uniform', null], ['macro', 'ifdef'], ['macro', 'define'], ['uniform', null], ['uniform', null]]);
const table = new Map([['strength', { f: ao.strength, type: 'float' }], ['k', { f: () => F.k, type: 'float' }], ['sunDir', { f: () => F.sunDir, type: 'vec3' }]]);
let b = buildSource(pieces, table);
assert.ok(b.src.startsWith('#version 300 es\nprecision highp float;\n'));
assert.ok(b.src.includes('uniform float strength;\nuniform float k;\nuniform vec3 sunDir;'));
assert.ok(b.src.indexOf('uniform float strength;') < b.src.indexOf('#if 1'));
assert.ok(/^#if 1$/m.test(b.src) && /^#define N 3$/m.test(b.src) && !/ifdef/.test(b.src));
assert.equal(b.macroKey, '1,1,3');
C.pbr = false; F.k = 0; b = buildSource(pieces, table);
assert.equal(b.macroKey, '0,0,3'); assert.ok(/^#if 0$/m.test(b.src));
// 裸值报错
assert.throws(() => flatten(mk`float x = ${3};`), /裸值/);
assert.throws(() => flatten(mk`vec3 c = ${'a'};`), /裸值/);
// 片段嵌套
const inner = mk`float inner = ${ao.strength};`, outer = mk`void main(){ ${inner} }`;
assert.deepEqual(flatten(outer).filter(p => p.t === 'uniform').map(p => nameOf(p.f)), ['strength']);
// # 行里嵌片段后的位置：片段后换行，不应被前一个 # 行污染
const f3 = mk`#define A 1
${mk`float q = ${ao.strength};`}`;
assert.deepEqual(flatten(f3).filter(p => p.t !== 'text').map(p => p.t), ['uniform']);
// headerSplit
assert.deepEqual(headerSplit('#version 300 es\nprecision highp float;\nvoid main(){}'), ['#version 300 es\nprecision highp float;', 'void main(){}']);
console.log('pass OK');
