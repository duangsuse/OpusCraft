/**
 * test-decl — gode/tools/decl.js（✎ 落盘改 `c_.X = {…}` 声明）的测试：纯函数，不碰文件、不起服务。
 *   node --test gode/tools/test-decl.mjs
 * line:col 的约定 = V8 调用栈给的位置：赋值语句的 `=`（见 decl.js 头注释）。这里用 at() 从源码里找，不手算。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchDecl, parseLiteral, formatLiteral, isLiteral, PatchError } from './decl.js';

/** 第 n 次出现的 `c_.<topic> =` 的 `=` 的 1 起 行:列 */
function at(src, topic, n = 0) {
  const re = new RegExp(`c_\\s*\\.\\s*${topic}\\s*=`, 'g'); let m; for (let k = 0; k <= n; k++) m = re.exec(src);
  const off = m.index + m[0].length - 1, before = src.slice(0, off).split('\n');
  return { line: before.length, col: before.at(-1).length + 1 };
}
const patch = (src, topic, edits, n = 0) => patchDecl(src, { ...at(src, topic, n), topic, edits });
const throws = (f, re) => assert.throws(f, e => e instanceof PatchError && re.test(e.message), String(re));

const SRC = `// 头
c_.Fx = {
  gravity: [0.8, 0, 2, '重力'],            // [默认, 最小, 最大, 标签]
  max:     [600, 100, 2000, '粒子上限', { step: 10, doc: 'a, b] // not a comment' }],
  on:      [true, '开关'],
  tint:    ['#6fa8ff', '色', { color: true }],
  v2:      [[3, 4], '向量'],
  /* 块注释，里面有逗号, 和 ] */
  bloom: {
    strength: [.35, 0, 2, '强度'],
    deep: { k: [1, 0, 9, 'k'] },
  },
}
c_.Gy = { z: [1, 0, 2, 'z'] }
`;

test('改默认值与区间：只动目标元素，其余字节不变', () => {
  const r = patch(SRC, 'Fx', [{ key: 'gravity', idx: 0, old: 0.8, value: 1.25 }, { key: 'gravity', idx: 1, old: 0, value: -1 }, { key: 'gravity', idx: 2, old: 2, value: 5 }]);
  assert.equal(r.src, SRC.replace("[0.8, 0, 2, '重力']", "[1.25, -1, 5, '重力']"));
  assert.deepEqual(r.changed.map(c => [c.key, c.idx, c.from, c.to]), [['gravity', 0, 0.8, 1.25], ['gravity', 1, 0, -1], ['gravity', 2, 2, 5]]);
});
test('嵌套表：路径 bloom.strength / bloom.deep.k；.35 这种写法也认', () => {
  const r = patch(SRC, 'Fx', [{ key: 'bloom.strength', idx: 0, old: 0.35, value: 0.5 }, { key: 'bloom.deep.k', idx: 2, old: 9, value: 10 }]);
  assert.ok(r.src.includes("strength: [0.5, 0, 2, '强度']") && r.src.includes("k: [1, 0, 10, 'k']"));
});
test('布尔、字符串、向量；元素里有 }、逗号、// 的字符串和嵌套 meta 不会让分词错位', () => {
  const r = patch(SRC, 'Fx', [{ key: 'on', idx: 0, old: true, value: false }, { key: 'tint', idx: 0, old: '#6fa8ff', value: '#112233' }, { key: 'v2', idx: 0, old: [3, 4], value: [5, 6.5] }, { key: 'max', idx: 0, old: 600, value: 700 }]);
  assert.ok(r.src.includes("on:      [false, '开关']") && r.src.includes("['#112233', '色'") && r.src.includes("[[5, 6.5], '向量']"));
  assert.ok(r.src.includes("[700, 100, 2000, '粒子上限', { step: 10, doc: 'a, b] // not a comment' }]"));
});
test('同一条声明多处修改从后往前改；多条声明各自定位', () => {
  const r = patch(SRC, 'Gy', [{ key: 'z', idx: 2, old: 2, value: 3 }, { key: 'z', idx: 0, old: 1, value: 2 }]);
  assert.ok(r.src.includes("c_.Gy = { z: [2, 0, 3, 'z'] }") && r.src.includes("gravity: [0.8, 0, 2"));
});
test('CRLF 源码：列按行内偏移算', () => {
  const crlf = SRC.replace(/\n/g, '\r\n'), r = patch(crlf, 'Fx', [{ key: 'gravity', idx: 0, old: 0.8, value: 9 }]);
  assert.ok(r.src.includes("gravity: [9, 0, 2, '重力']") && r.src.split('\r\n').length === crlf.split('\r\n').length);
});

test('拒绝：位置不是 = / 不是 c_.<topic> / 文件改过（old 对不上）', () => {
  const p = at(SRC, 'Fx');
  throws(() => patchDecl(SRC, { ...p, col: p.col + 1, topic: 'Fx', edits: [{ key: 'on', idx: 0, old: true, value: false }] }), /不是赋值的 =/);
  throws(() => patchDecl(SRC, { ...p, topic: 'Gy', edits: [{ key: 'z', idx: 0, old: 1, value: 2 }] }), /不是 c_\.Gy/);
  throws(() => patch(SRC, 'Fx', [{ key: 'gravity', idx: 0, old: 0.7, value: 1 }]), /源码里是 0\.8，页面以为是 0\.7/);
  throws(() => patchDecl(SRC, { line: 999, col: 1, topic: 'Fx', edits: [{ key: 'on', idx: 0, old: true, value: 1 }] }), /没有 999:1/);
});
test('拒绝：键 / 下标不存在、不是元组、是计算出来的、生成出来的声明', () => {
  throws(() => patch(SRC, 'Fx', [{ key: 'nope', idx: 0, old: 1, value: 2 }]), /不是 \[默认, …\] 字面量/);
  throws(() => patch(SRC, 'Fx', [{ key: 'bloom', idx: 0, old: 1, value: 2 }]), /不是 \[默认, …\] 字面量/);
  throws(() => patch(SRC, 'Fx', [{ key: 'on', idx: 9, old: 1, value: 2 }]), /没有第 9 项/);
  throws(() => patch(SRC, 'Fx', [{ key: 'x.y', idx: 0, old: 1, value: 2 }]), /找不到 x\.y/);
  const calc = "c_.Q = {\n  a: [2 * 3, 0, 9, 'a'],\n  b: [K, 0, 9, 'b'],\n  c: [1, 0, 9, 'c'],\n}\n";
  throws(() => patch(calc, 'Q', [{ key: 'a', idx: 0, old: 6, value: 7 }]), /不是字面量/);
  throws(() => patch(calc, 'Q', [{ key: 'b', idx: 0, old: 1, value: 7 }]), /不是字面量/);
  assert.ok(patch(calc, 'Q', [{ key: 'c', idx: 0, old: 1, value: 7 }]).src.includes("c: [7, 0, 9, 'c']"), '同一条声明里别的键仍可改');
  const gen = "c_.G = Object.fromEntries([['a', [1, 0, 2, 'a']]])\n";
  throws(() => patch(gen, 'G', [{ key: 'a', idx: 0, old: 1, value: 2 }]), /右边不是对象字面量/);
  const loop = "for (const n of ['A', 'B']) c_[n] = { k: [1, 0, 2, 'k'] }\nc_.A = 1\n";
  throws(() => patchDecl(loop, { line: 1, col: 38, topic: 'A', edits: [{ key: 'k', idx: 0, old: 1, value: 2 }] }), /不是赋值的 =|不是 c_\.A/);
});
test('展开 / 简写 / 方法条目跳过，不影响后面的键', () => {
  const s = "c_.W = {\n  ...base,\n  short,\n  fn() { return [1, 2] },\n  [k]: [1],\n  ok: [5, 0, 9, 'ok'],\n}\n";
  assert.ok(patch(s, 'W', [{ key: 'ok', idx: 0, old: 5, value: 6 }]).src.includes("ok: [6, 0, 9, 'ok']"));
});
test('畸形源码不会死循环：孤立的 ) 与没闭合的括号', () => {
  throws(() => patch("c_.B = { a: [1, ), 0] }\n", 'B', [{ key: 'a', idx: 0, old: 1, value: 2 }]), /看不懂/);
  throws(() => patch("c_.B = { a: [1, 0\n", 'B', [{ key: 'a', idx: 0, old: 1, value: 2 }]), /没有闭合|看不懂/);
});

test('字面量往返：数 / 负数 / 小数 / 指数 / 字符串转义 / 数组', () => {
  for (const v of [0, -5, 0.001, 1e-7, 123456789, 1e21, true, false, null, 'a', "it's", 'a"b', 'x\ny\tz\\', '重力', '', [1, 2.5], ['a', "b'c", true], []])
    assert.deepEqual(parseLiteral(formatLiteral(v)), v, JSON.stringify(v));
  assert.deepEqual(parseLiteral('[1, 2, ]'), [1, 2]);
  assert.equal(parseLiteral('.5'), 0.5); assert.equal(parseLiteral('"a,]"'), 'a,]'); assert.deepEqual(parseLiteral("['a,]', 1,]"), ['a,]', 1]);
});
test('注入：新值只会变成一个字面量，写回后源码仍是同一个字符串元素', () => {
  const evil = "'); process.exit(1); ('";
  const r = patch(SRC, 'Fx', [{ key: 'tint', idx: 0, old: '#6fa8ff', value: evil }]);
  assert.equal(r.src.split('\n').length, SRC.split('\n').length);
  const again = patch(r.src, 'Fx', [{ key: 'tint', idx: 0, old: evil, value: '#000000' }]);          // 能按值读回 = 它在源码里是一个完整的字符串字面量
  assert.ok(again.src.includes("['#000000', '色'"));
  for (const bad of [{ a: 1 }, NaN, Infinity, undefined, [[1]], [{}], () => 1]) assert.throws(() => formatLiteral(bad), PatchError);
  assert.ok(!isLiteral('1 + 2') && !isLiteral('foo') && !isLiteral('[1, x]') && !isLiteral("'a' + 'b'") && !isLiteral('1 // x') && isLiteral(' [1, "a"] '));
});
test('请求形状：缺字段 400；两处改同一元素 400', () => {
  const p = at(SRC, 'Fx');
  assert.throws(() => patchDecl(SRC, { ...p, topic: 'Fx', edits: [] }), e => e.status === 400);
  assert.throws(() => patchDecl(SRC, { ...p, line: 0, topic: 'Fx', edits: [{}] }), e => e.status === 400);
  assert.throws(() => patch(SRC, 'Fx', [{ key: 'on', idx: 0, old: true, value: false }, { key: 'on', idx: 0, old: true, value: true }]), e => e.status === 400);
});
