// 两组 bench 基准像素逐像素比较，列出差异像素：node tools/refdiff.mjs A B view [max]
import { readFileSync } from 'node:fs';
const [A, B, view, max = 30] = process.argv.slice(2);
const ld = n => { const b = readFileSync(`tools/out/ref/${n}/${view}.bin`); return { w: b.readUInt32LE(0), h: b.readUInt32LE(4), px: b.subarray(8) }; };
const a = ld(A), b = ld(B); let n = 0;
for (let i = 0; i < a.px.length; i += 4) {
  let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(a.px[i + c] - b.px[i + c]));
  if (m && n++ < max) { const p = i / 4; console.log(`x ${p % a.w} y ${(p / a.w) | 0} (从下) Δ${m}  ${A}=${[...a.px.subarray(i, i + 3)]}  ${B}=${[...b.px.subarray(i, i + 3)]}`); }
}
console.log(`${n} px 不同`);
