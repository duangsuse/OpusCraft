// 导出渲染器实际交给 three 的片元着色器源码（glmod 步骤 2「切模块后文本相同」用）
//   node tools/fsdump.mjs [r=v2/gl] [outDir=tools/out/fs/<r>]   → post.glsl / comp.glsl（+ defines.json）
//   之后 diff 两次导出即可；不渲染、不需要 GPU
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';
const R = process.argv[2] || 'v2/gl', OUT = process.argv[3] || `tools/out/fs/${R.replace(/\//g, '_')}`;
const b = await launch({ gpu: false, tag: 'fsdump' });
await b.send('Page.navigate', { url: `http://localhost:8765/VoxelCraft.html?r=${R}&seed=1` });
let r = null;
for (let i = 0; i < 100 && !r; i++) {
  await sleep(200);
  r = await b.js(`(() => { const V = window.game && window.game.VR; if (!V || !V.post) return null;
    return { name: V.name, post: V.post.fragmentShader, comp: V.comp.fragmentShader, defines: { post: V.post.defines, comp: V.comp.defines } }; })()`).catch(() => null);
}
await b.close();
if (!r) { console.error('VR 未就绪'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/post.glsl`, r.post); writeFileSync(`${OUT}/comp.glsl`, r.comp);
writeFileSync(`${OUT}/defines.json`, JSON.stringify(r.defines, null, 1));
console.log(`${r.name}: post ${r.post.length} 字符, comp ${r.comp.length} 字符 → ${OUT}/`);
