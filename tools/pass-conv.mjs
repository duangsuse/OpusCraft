// 把 goodGL 的一个 GLSL 条目转成 rgl/shaders/*.js 的模板 Pass（R5 的机械部分；转完要人看一遍，并 --ref 0 px）：
//   node tools/pass-conv.mjs <GLSL键> <导出名> <文件名> [u_name=表达式 ...] [--vs <VS 的 GLSL 键>]   （不给 --vs = 默认全屏三角形 VS）
//   未给表达式的 uniform 默认 `() => F.<去掉 u_ 的名字>`（每帧量）；表达式里可写 u('名', …)，或引用 X（调用方传入的外部量，如纹理：X.skyLut）。
//   产物：删掉 `uniform <类型> u_x;` 声明，正文里 u_x → ${表达式}；GLSL 逻辑一字不改。
import { writeFileSync } from 'node:fs';
const { GLSL } = await import('../vendor/gl/glsl.js');
const [key, exp, file, ...rest] = process.argv.slice(2);
const map = {}; let vsKey = null; 
import { readFileSync } from 'node:fs';
const args = rest.flatMap(a => a.startsWith('@') ? readFileSync(a.slice(1), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')) : [a]);   // @文件：每行 u_名=表达式
rest.length = 0; rest.push(...args);
for (let i = 0; i < rest.length; i++) { if (rest[i] === '--vs') { vsKey = rest[++i]; continue; } const k = rest[i].indexOf('='); map[rest[i].slice(0, k)] = rest[i].slice(k + 1); }
const conv = (src, what) => {
  if (src == null) throw new Error('没有 GLSL 条目 ' + what);
  if (/[`]|\$\{/.test(src)) throw new Error(what + ' 含反引号或 ${，需手工转');
  const names = [...new Set([...src.matchAll(/\bu_\w+/g)].map(m => m[0]))];
  let s = src;
  for (const n of names) {
    const decl = new RegExp(`uniform\\s+(?:(?:lowp|mediump|highp)\\s+)?\\w+\\s+${n}\\s*;[ \\t]*`, 'g');
    const arr = new RegExp(`uniform\\s+\\w+\\s+${n}\\s*\\[`);
    if (arr.test(s)) throw new Error(`${what}: ${n} 是数组 uniform，需手工转`);
    s = s.replace(decl, '');
    s = s.replace(new RegExp(`\\b${n}\\b`, 'g'), '${' + (map[n] || `() => F.${n.slice(2)}`) + '}');
  }
  return { s: s.replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n').replace(/^([ \t]*\n)+(?=in |out |layout)/m, ''), names };
};
const fs = conv(GLSL[key], key), vs = vsKey ? conv(GLSL[vsKey], vsKey) : null;
const unseen = Object.keys(map).filter(k => !fs.names.includes(k) && !(vs && vs.names.includes(k)));
if (unseen.length) throw new Error('映射里有源码没用到的名字：' + unseen.join(','));
const head = `// rgl/shaders/${file} —— goodGL ${key}${vsKey ? ' + ' + vsKey : ''}（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u${vs ? ', glsl' : ''} } from '../pass.js';
import { F } from '../frameref.js';
`;
const tmpl = t => '`' + t + '`';
const body = `export const ${exp} = (Pass, X = {}) => Pass({ tag: '${exp}'${vs ? ', vs: glsl' + tmpl(vs.s) : ''} })${tmpl(fs.s)};\n`;
writeFileSync(new URL('../rgl/shaders/' + file, import.meta.url), head + body);
console.log(file, '名字：', fs.names.join(' '));
