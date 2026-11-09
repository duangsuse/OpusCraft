/**
 * decl — 改源码里的参数声明：`c_.Fx = { gravity: [0.8, 0, 2, '重力'], bloom: { on: [true, 'Bloom'] } }`（面板 ✎ 落盘，s09）。
 * 零依赖、纯函数：dev.js 的 POST /__dev/patch 用它，tools/test-decl.mjs 在 node 里直接测。
 *
 * 定位：页面登记 `c_.Fx = {…}` 时在 Proxy 的 set 里取调用栈（caller sloc），V8 给的 文件:行:列 指向这条赋值语句的 `=`。
 *   所以 patchDecl 要求 src[line:col] 正好是 `=`，且它左边紧挨着 `c_.<topic>`、右边是对象字面量；对不上一律拒绝（文件改过 / 声明是生成出来的）。
 *   循环里生成的声明共用同一个 sloc，页面那边已经认出来并不发请求；计算出来的字面量（`2 * 3`、标识符、Object.fromEntries）这里也不改。
 * 分词：只认够读声明的那一小撮（空白、// 与 块注释、单双引号与模板字符串、嵌套的 () [] {}），按顶层逗号切元组的元素。
 * 安全：旧值必须是「字面量」且与页面给的 old 一致才改；新值由这里从 JSON 值生成字面量（数 / 布尔 / null / 字符串 / 扁平数组），不收调用方拼好的代码文本。
 */
export class PatchError extends Error { constructor(msg, status = 409) { super(msg); this.status = status; } }

// ── 字面量文法：数 / true false null / 单双引号字符串 / 由它们组成的扁平数组。够写默认值、区间、向量，不够写代码
const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ATOM = `(?:${NUM}|true|false|null|${STR})`;
const LIT = new RegExp(`^(?:${ATOM}|\\[\\s*(?:${ATOM}(?:\\s*,\\s*${ATOM})*\\s*,?)?\\s*\\])$`);
const ATOMS = new RegExp(`${STR}|,\\s*\\]|${NUM}|true|false|null`, 'g');   // 字符串先匹配，所以字符串里的 ,] 不会被当成数组的尾逗号
export const isLiteral = s => LIT.test(String(s).trim());

const unquote = s => {
  let out = '';
  for (let i = 1; i < s.length - 1; i++) {
    const c = s[i]; if (c !== '\\') { out += c; continue; }
    const d = s[++i];
    if (d === 'n') out += '\n'; else if (d === 't') out += '\t'; else if (d === 'r') out += '\r';
    else if (d === 'u') { out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16)); i += 4; }
    else if (d === 'x') { out += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else out += d;
  }
  return out;
};
/** 字面量文本 → JS 值（不满足 isLiteral 抛 PatchError） */
export function parseLiteral(text) {
  const t = String(text).trim();
  if (!LIT.test(t)) throw new PatchError(`不是字面量：${t.slice(0, 40)}`);
  const json = t.replace(ATOMS, a => {
    if (a[0] === '"' || a[0] === "'") return JSON.stringify(unquote(a));
    if (a === 'true' || a === 'false' || a === 'null') return a;
    if (a[0] === ',') return ']';
    const n = Number(a); if (!Number.isFinite(n)) throw new PatchError(`数溢出：${a}`);
    return String(n);
  });
  return JSON.parse(json);
}
/** JS 值 → 字面量文本（单引号字符串，数组 `[a, b]`）。只接受 isLiteral 能读回来的那些值 */
export function formatLiteral(v) {
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new PatchError('数必须有限', 400); return String(v); }
  if (typeof v === 'boolean' || v === null) return String(v);
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\x00-\x1f]/g, c => c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')) + "'";
  if (Array.isArray(v) && v.every(x => x === null || ['number', 'boolean', 'string'].includes(typeof x))) return '[' + v.map(formatLiteral).join(', ') + ']';
  throw new PatchError(`不能写成字面量：${JSON.stringify(v)?.slice(0, 40)}`, 400);
}

// ── 分词 / 解析
function skipTrivia(s, i) {
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    else if (s[i] === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; }
    else return i;
  }
}
/** 从引号处跳过整个字符串（模板字符串不解析 ${…}），返回结束引号之后的位置 */
function skipString(s, i) {
  const q = s[i]; i++;
  while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
  if (i >= s.length) throw new PatchError('字符串没有闭合');
  return i + 1;
}
/** 从 i 起读一段表达式，到顶层的 , 或闭括号（不含）为止；返回 { a: 第一个有效字符, b: 末尾有效字符之后, end: 停下的位置 } */
function scanExpr(s, i) {
  const a = skipTrivia(s, i); let d = 0, j = a, b = a;
  while (j < s.length) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') { j = skipString(s, j); b = j; continue; }
    if (c === '/' && (s[j + 1] === '/' || s[j + 1] === '*')) { j = skipTrivia(s, j); continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) break; d--; }
    else if (c === ',' && d === 0) break;
    j++; if (!/\s/.test(c)) b = j;
  }
  return { a, b, end: j };
}
/** s[i] === '{'：返回 { end, props: Map<键, {type:'obj',props} | {type:'arr',items:[{a,b}]} | {type:'raw'}> }。展开 / 计算键 / 简写的条目跳过（找不到就是找不到） */
function parseObj(s, i) {
  const props = new Map(); i = skipTrivia(s, i + 1);
  while (s[i] !== '}') {
    if (i >= s.length) throw new PatchError('对象字面量没有闭合');
    let key = null; const start = i;
    if (s[i] === '"' || s[i] === "'") { const e = skipString(s, i); key = unquote(s.slice(i, e)); i = e; }
    else { const m = /^(?:[A-Za-z_$][\w$]*|\d+)/.exec(s.slice(i, i + 120)); if (m) { key = m[0]; i += m[0].length; } }
    const j = skipTrivia(s, i);
    if (key !== null && s[j] === ':') {
      i = skipTrivia(s, j + 1);
      if (s[i] === '{') { const o = parseObj(s, i); props.set(key, o.node); i = o.end; }
      else if (s[i] === '[') {
        const items = []; let k = skipTrivia(s, i + 1);
        while (s[k] !== ']') {
          if (k >= s.length) throw new PatchError('数组字面量没有闭合');
          const e = scanExpr(s, k); if (e.end === k) throw new PatchError('看不懂的数组字面量'); if (e.b > e.a) items.push({ a: e.a, b: e.b });
          k = skipTrivia(s, e.end); if (s[k] === ',') k = skipTrivia(s, k + 1);
        }
        props.set(key, { type: 'arr', items }); i = k + 1;
      } else { const e = scanExpr(s, i); if (e.end === i) throw new PatchError('看不懂的对象字面量'); props.set(key, { type: 'raw' }); i = e.end; }
    } else { const e = scanExpr(s, i); if (e.end === start) throw new PatchError('看不懂的对象字面量'); i = e.end; }   // 简写 / 展开 / 计算键 / 方法：整条跳过
    i = skipTrivia(s, i); if (s[i] === ',') i = skipTrivia(s, i + 1);
  }
  return { end: i + 1, node: { type: 'obj', props } };
}

/**
 * 改 src 里 line:col 处那条 `c_.<topic> = {…}` 的若干元组元素。edits = [{ key: 'gravity' | 'bloom.strength', idx: 元组下标, old: 页面以为的旧值, value: 新值 }]。
 * 返回 { src: 新全文, changed: [{ key, idx, from, to }] }；任何一处对不上都整体拒绝（抛 PatchError，不改任何东西）。
 */
export function patchDecl(src, { line, col, topic, edits }) {
  if (!Number.isInteger(line) || !Number.isInteger(col) || line < 1 || col < 1) throw new PatchError('line / col 要是正整数', 400);
  if (typeof topic !== 'string' || !Array.isArray(edits) || !edits.length) throw new PatchError('要 topic 和非空的 edits', 400);
  const lines = src.split('\n');
  if (line > lines.length || col > lines[line - 1].length) throw new PatchError(`源码里没有 ${line}:${col}（文件改过？刷新页面再试）`);
  let off = col - 1; for (let k = 0; k < line - 1; k++) off += lines[k].length + 1;
  if (src[off] !== '=') throw new PatchError(`源码 ${line}:${col} 不是赋值的 =（文件改过？刷新页面再试）`);
  const m = /c_\s*\.\s*([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, off - 160), off));
  if (!m || m[1] !== topic) throw new PatchError(`${line}:${col} 处不是 c_.${topic} = …`);
  const i = skipTrivia(src, off + 1);
  if (src[i] !== '{') throw new PatchError(`c_.${topic} 的右边不是对象字面量（生成出来的？不能落盘）`);
  const root = parseObj(src, i).node, reps = [];
  for (const e of edits) {
    if (typeof e?.key !== 'string' || !Number.isInteger(e.idx) || e.idx < 0) throw new PatchError('edit 要 key 与 idx', 400);
    const path = e.key.split('.'); let node = root;
    for (const k of path.slice(0, -1)) { node = node.props?.get(k); if (node?.type !== 'obj') throw new PatchError(`c_.${topic} 里找不到 ${e.key}`); }
    const arr = node.props.get(path.at(-1));
    if (arr?.type !== 'arr') throw new PatchError(`c_.${topic}.${e.key} 不是 [默认, …] 字面量（找不到，或是生成出来的）`);
    const it = arr.items[e.idx]; if (!it) throw new PatchError(`c_.${topic}.${e.key} 没有第 ${e.idx} 项`);
    const was = src.slice(it.a, it.b); let from;
    try { from = parseLiteral(was); } catch { throw new PatchError(`c_.${topic}.${e.key} 第 ${e.idx} 项不是字面量（计算出来的？）：${was.slice(0, 30)}`); }
    if (JSON.stringify(from) !== JSON.stringify(e.old)) throw new PatchError(`c_.${topic}.${e.key} 第 ${e.idx} 项源码里是 ${was}，页面以为是 ${JSON.stringify(e.old)}（文件改过？刷新页面再试）`);
    reps.push({ a: it.a, b: it.b, text: formatLiteral(e.value), key: e.key, idx: e.idx, from, to: e.value });
  }
  reps.sort((x, y) => y.a - x.a);
  for (let k = 1; k < reps.length; k++) if (reps[k].b > reps[k - 1].a) throw new PatchError('两处修改指向同一个元素', 400);
  let out = src; for (const r of reps) out = out.slice(0, r.a) + r.text + out.slice(r.b);
  return { src: out, changed: reps.reverse().map(({ key, idx, from, to }) => ({ key, idx, from, to })) };
}
