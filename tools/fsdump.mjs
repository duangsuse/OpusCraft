// 导出渲染器实际交给 three 的片元着色器源码（glmod 步骤 2「切模块后文本相同」用）
//   node tools/fsdump.mjs [r=v2/gl] [outDir=tools/out/fs/<r>] [--vs]   → <program>.glsl（片元）/ defines.json（--vs 另写 <program>.vs.glsl）
//   读渲染器契约里的 programs: { 名字: { vs, fs, defines } }（bench.md §2）；没有就退回 v2 的 post / comp 三件套（v2.js 单文件原版）
//   之后 diff 两次导出即可；不渲染、不需要 GPU
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';
const pos = process.argv.slice(2).filter(a => !a.startsWith('--')), VS = process.argv.includes('--vs');
const R = pos[0] || 'v2/gl', OUT = pos[1] || `tools/out/fs/${R.replace(/\//g, '_')}`;
const b = await launch({ gpu: false, tag: 'fsdump' });
await b.send('Page.navigate', { url: `http://localhost:8765/VoxelCraft.html?r=${R}&seed=1` });
let r = null;
for (let i = 0; i < 100 && !r; i++) {
  await sleep(200);
  r = await b.js(`(() => { const V = window.game && window.game.VR; if (!V || !(V.programs || V.post)) return null;
    const m = x => ({ vs: x.vertexShader, fs: x.fragmentShader, defines: x.defines });
    return { name: V.name, progs: V.programs || { post: m(V.post), comp: m(V.comp) } }; })()`).catch(() => null);
}
await b.close();
if (!r) { console.error('VR 未就绪'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
for (const [k, p] of Object.entries(r.progs)) { writeFileSync(`${OUT}/${k}.glsl`, p.fs); if (VS) writeFileSync(`${OUT}/${k}.vs.glsl`, p.vs); }
writeFileSync(`${OUT}/defines.json`, JSON.stringify(Object.fromEntries(Object.entries(r.progs).map(([k, p]) => [k, p.defines])), null, 1));
console.log(`${r.name}: ` + Object.entries(r.progs).map(([k, p]) => `${k} ${p.fs.length} 字符`).join(', ') + ` → ${OUT}/`);
