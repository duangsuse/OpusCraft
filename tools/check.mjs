// 改完代码先跑这个：node tools/check.mjs（正确性闸门，目标 <30s，需要 :8765 静态服务器）
// 只验「还对不对」：单元测试 → vendor 一致 → pass GL 自检 → ?r=gl 契约 + 画面 + 0 px 确定性。
// 不含性能（bench-v2）、不含像素对比（bench-v2 --ref --cmp）、不含 v1/v2/v2/gl 组（node tools/verify-renderer.mjs 全量，约 2 分钟）。
import { spawnSync } from 'node:child_process';
const steps = [
  ['pass/vars 单元', 'test-pass.mjs'], ['pass/vars 单元', 'test-vars.mjs'],
  ['vendor 与生成一致', 'vendor.mjs', 'gl', '--check'],
  ['pass GL 自检', 'test-pass-gl.mjs'],
  ['?r=gl 契约 + 画面（静态检查 + --fast）', 'verify-renderer.mjs', '--only', 'static,gl', '--fast'],
];
const t0 = Date.now(); let bad = 0;
for (const [name, f, ...a] of steps) {
  const t = Date.now(), r = spawnSync('node', [new URL(f, import.meta.url).pathname, ...a], { encoding: 'utf8' });
  const ok = r.status === 0; if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${((Date.now() - t) / 1000).toFixed(1)}s`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').filter(l => /FAIL|Error|DIFF|EXCEPTION/.test(l)).slice(0, 8).join('\n'));
}
const sec = (Date.now() - t0) / 1000;
console.log(`${bad ? bad + ' 项失败' : '全部通过'}  共 ${sec.toFixed(1)}s${sec > 30 ? '（超过 30s 预算！）' : ''}`);
process.exit(bad ? 1 : 0);
