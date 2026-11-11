#!/usr/bin/env node
/**
 * biomeshots —— 给 pgviz 的群系逐个拍一组：top / side / slc（多层）/ mine。
 *
 *   node gode/tools/biomeshots.mjs <gen> [<name>[&<urlparams>]]
 *
 *   <gen>    生成器短名（?g=veg|gp|liq|mini|old|pg1|luan0|luanV）
 *   <name>   群系名（精确；all / * / 省略 = 该生成器的全部群系）
 *            紧跟着的 &k=v 是附带 URL 参数，覆盖默认
 *            g/seed/pv/z/terr/tod（默认 seed=20240607 pv=Y z=5 terr=1 tod=14.08）
 *            &views=top,side,slc,mine（默认全拍；只拍 side 时约 1/4 时间）
 *            &side=auto|north|south|east|west（auto = 用 viz.silhouette 在四个方向里挑「起伏 + 拱洞」最高的一侧）
 *
 * 产物（都在 gode/shots/<YYMMDD>/ 下）：
 *   <seed>/<gen>/top|side|mine/<群系名>.webp
 *   <seed>/<gen>/slc/<群系名>/@<Y>.webp   （层高随群系变，所以按群系分目录、Y 写文件名）
 * 跑完若有 ffmpeg：把 slc/<群系名>/ 里各层拼成 slc/<群系名>_going_deeper.webp（2 列、行优先、Y 从高到低，
 *   每格 640×360、四周 8 px 黑边；GD_NOGRID=1 关）。grid 是派生图，不进 biomes.tsv / index.tsv；
 *   `gd open .../slc/<群系名>_going_deeper.webp --nth N` 可以直接开第 N 层（1 = 最高）。
 *   <seed>/<gen>/biomes.tsv   每个群系的中心点 / 高度 / 采样字段 / 每层 Y 与图片路径 / 空气统计
 *   （目录名用 seed，不用日期：同一个种子反复跑都落在一起）
 *
 * 机位：先 viz.jump('@0,0')（固定起点，重跑同一个中心），再 viz.bioSearch 找最近的该群系，
 * 在 ±256 格里跑 bfind 取命中点；
 * 命中点里优先陆地（sample.h > meta.sea + 1，比例 ≥10% 时），取质心后回落到
 * 最近的命中点；最后复验中心点的 sample.biome，不符就退回 bioSearch 的点。
 *   top  = 地表（关闭切片）
 *   side = 南侧视
 *   slc  = 切片，**多层**：默认 auto = 按中心列「真地表」`min(hSample, hTop)` 的 0.9 / 0.6 / 0.3 / 0.1 取 Y
 *          （深海海底 98 → 88/59/29/10，高山 200 → 180/120/60/20，跨群系同义）；
 *          `&slc=auto:N`（N 层均分 0.9→0.1）或 `&slc=Y1,Y2,…`（绝对高度，`slc=110` 兼容旧用法）。
 *          每层开 `xray=N`（默认 12）：切面往里 N 格按 alpha 前到后合成（实体 0.26 / 水 0.14，
 *          越深越淡），地表以下的空气叠紫雾 —— 洞 / 空腔 / 矿脉在后面透出来，不再只是一张截面。
 *          `&xray=N` 改厚度，`&xray=0` 关。
 *          tsv 的 `air` 列给每层「空气占比/平均空气格数/最大」（33×33 采样、步长 8）；
 *          `depth` 列是逐 Y 组成曲（JSON：4 格一档的空气/水/岩浆/矿石千分比），调 3D 洞穴用。
 *   mine = 俯视 + shade=height（洞窟 / 空气深度图）
 * 顶栏两个输入框临时填 @x,z 与群系名（只改 value，不触发提交）。
 *
 * gd 的 --tag 不支持路径（会 slug 成 _），所以按默认名截图后把文件搬到目标目录，
 * 并同步改 shots/index.tsv 里该行的 files（tag 直接用目标相对路径）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const GODE = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(GODE);
const GD = join(GODE, 'tools', 'gd.js');
const SHOTS = join(GODE, 'shots');
const INDEX = join(SHOTS, 'index.tsv');
const PROBE_Y = 64;                          // center() 的 probe 高度：只取列数据（col/sample/h），与切片无关
const SLC_FRACS = [0.9, 0.6, 0.3, 0.1];      // auto 模式：按 hTop 的比例取 Y
const AIR_N = 33, AIR_STEP = 8;              // 空气距离采样：以中心为原点 (AIR_N-1)*AIR_STEP 格见方

const hasFF = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
/** slc/<群系名>/ 的各层 → slc/<群系名>.webp：2 列行优先、Y 从高到低（= tsv slcY），每格 640×360、四周 8 px 黑边。没 ffmpeg 直接跳过 */
function makeGrids(outDir, force) {
  if (!hasFF || (process.env.GD_NOGRID && !force)) return 0;
  const slcDir = join(outDir, 'slc'), PAD = 8, CELL_W = 640, COLS = 2;
  const yOf = f => Number(f.replace(/^\.?\/?@/, '').replace(/\.webp$/, ''));
  let made = 0, size = '';
  for (const d of existsSync(slcDir) ? readdirSync(slcDir, { withFileTypes: true }).filter(x => x.isDirectory()) : []) {
    const dir = join(slcDir, d.name), tiles = readdirSync(dir).filter(f => f.endsWith('.webp')).sort((a, b) => yOf(b) - yOf(a));
    if (tiles.length < 2) continue;   // 一层没什么可拼的
    const { width, height } = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', join(dir, tiles[0])], { encoding: 'utf8' })).streams[0];
    const w = Math.min(CELL_W, width), h = Math.round(height * w / width / 2) * 2, cw = w + PAD * 2, ch = h + PAD * 2, cols = Math.min(COLS, tiles.length);
    const fc = tiles.map((_, i) => `[${i}:v]scale=${w}:${h},pad=${cw}:${ch}:${PAD}:${PAD}:color=black[v${i}]`).join(';')
      + ';' + tiles.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${tiles.length}:layout=${tiles.map((_, i) => `${(i % cols) * cw}_${Math.floor(i / cols) * ch}`).join('|')}:fill=black`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...tiles.flatMap(f => ['-i', join(dir, f)]), '-filter_complex', fc, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', join(slcDir, `${d.name}_going_deeper.webp`)]);
    rmSync(join(slcDir, `${d.name}.webp`), { force: true });   // 旧命名（11-10 早期）的拼图，别留下两份
    made++; size = `${cols}x${Math.ceil(tiles.length / cols)} 格 × ${w}×${h}，间距 ${PAD * 2}`;
  }
  if (made) console.log(`grid ${made} 张（slc/<群系名>_going_deeper.webp，${size}）`);
  return made;
}

const gen = process.argv[2] ?? '';
const spec = process.argv.slice(3).join(' ');
if (!gen) {
  console.error('用法: node gode/tools/biomeshots.mjs <gen> [<name>[&<urlparams>]]\n      node gode/tools/biomeshots.mjs grid <gen>[&seed=…]   （只补 slc/<群系名>.webp 拼图）');
  process.exit(2);
}
if (gen === 'grid') {   // 只拼图：不连浏览器，用已有 slc/<群系名>/ 里的层
  const g = (spec.split('&')[0] || '').trim(), sd = (spec.match(/(?:^|&)seed=([^&]*)/) || [])[1] ?? '20240607';
  const dir = join(SHOTS, String(sd).replace(/[^\w.-]/g, '_'), g);
  if (!g || !existsSync(dir)) { console.error(`没有 ${relative(ROOT, dir)}`); process.exit(2); }
  if (!hasFF) { console.error('没装 ffmpeg（或 GD_NOGRID=1）'); process.exit(2); }
  process.exit(makeGrids(dir, true) ? 0 : 1);
}
const amp = spec.indexOf('&');
const wantName = (amp < 0 ? spec : spec.slice(0, amp)).trim();
const extra = amp < 0 ? '' : spec.slice(amp);

const q = new Map([['g', gen], ['seed', '20240607'], ['pv', 'Y'], ['z', '5'], ['terr', '1'], ['tod', '14.08']]);
for (const kv of extra.replace(/^&/, '').split('&').filter(Boolean)) {
  const i = kv.indexOf('=');
  if (i > 0) q.set(kv.slice(0, i), kv.slice(i + 1));
}
const slcSpec = (q.get('slc') ?? 'auto').trim();   // 本地参数，不进页面 URL
const shade = q.get('shade') ?? 'block';            // 用户给的 shade 覆盖默认（其他 URL 参数同理，extra 后写覆盖默认）
const XRAY = Math.max(0, Math.min(64, Math.round(+(q.get('xray') ?? 12) || 0)));   // 切面往里多少格做半透明叠加
const VIEWS_REQ = (q.get('views') ?? 'top,side,slc,mine').split(',').map(x => x.trim()).filter(x => ['top', 'side', 'slc', 'mine'].includes(x));
const SIDE_MODE = (q.get('side') ?? 'south').trim();
q.delete('slc'); q.delete('views'); q.delete('side');
const url = `gode/viz/?${[...q].map(([k, v]) => `${k}=${v}`).join('&')}`;

const env = { ...process.env, GD_HEADLESS: '1', GD_NOPRUNE: '1' };   // 图册一批几百张，别让 gd 的 prune（>500 行时每 tag 只留 20）顺手删旧图
const run = (...args) => {
  try {
    return execFileSync('node', [GD, ...args], { cwd: ROOT, encoding: 'utf8', env, timeout: 300_000, maxBuffer: 16 << 20 });
  } catch (e) {
    throw new Error(`gd ${args[0]} 失败（${e.status}）\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  }
};
/** gd eval 的 stdout 是返回值本身（字符串原样）；取最后一段能 JSON.parse 的行 */
const evalJson = code => {
  const out = run('eval', code);
  const body = out.split('\n').filter(l => !/^(# |log: |error: )/.test(l)).join('\n').trim();   // 去掉 gd 自己的 # eval ms / 页面日志
  try { return JSON.parse(body); } catch {}                                                     // 多行 JSON（gd 会 pretty-print）
  for (const line of body.split('\n').reverse()) {
    if (!line || line[0] !== '{' && line[0] !== '[') continue;
    try { return JSON.parse(line); } catch {}
  }
  throw new Error(`gd eval 没有返回 JSON：\n${out}`);
};
const evalOk = code => {
  const out = run('eval', code);
  if (!out.trim()) throw new Error('gd eval 空输出');
  return out.trim().split('\n')[0];
};
/** 产物根目录：gode/shots/<seed>（seed 里不能有路径分隔符） */
const SEED_DIR = String(q.get('seed') ?? '20240607').replace(/[^\w.-]/g, '_');

// ── 守护进程：本来没起就跑完关掉；已经在跑就留着 ──
const wasUp = !run('ps').startsWith('没有在跑的守护进程');
const stop = () => { if (!wasUp) { try { run('down'); } catch {} } };
process.on('SIGINT', () => { stop(); process.exit(130); });

run('up');
run('go', url);
evalOk(`(async()=>{
  const app=document.getElementById('app');
  app.classList.add('nosd');
  document.getElementById('giz').style.display='none';
  document.getElementById('tools').style.display='none';
  document.getElementById('toast').style.display='none';
  // 顶栏 X/Z 是 number input，readout 每帧用视口左上角覆盖 value；把 value 设成
  // 只读的影子属性（保留 HTMLInputElement.prototype 的 get/set 到 window.__gv），
  // 之后用 __gv.d.set 写标签，tlUI 的赋值变成 no-op。
  const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  window.__gv=d;
  for(const el of [document.getElementById('gx'),document.getElementById('gz')]){
    el.type='text';
    el.style.width='112px';
    Object.defineProperty(el,'value',{get(){return window.__gv.get.call(this)},set(){},configurable:true});
  }
  window.dispatchEvent(new Event('resize'));
  await viz.ready();
  viz.set('lay',true);
  await new Promise(r=>setTimeout(r,120));
  return 'ok';
})()`);

const meta = evalJson('JSON.stringify(viz.stats().meta)');
const sea = typeof meta.sea === 'number' ? meta.sea : null;
const H = typeof meta.h === 'number' && meta.h > 1 ? meta.h : 256;

/** slc 层高：auto[:N] = 按 hTop 的比例；否则逗号列表当绝对 Y。返回去重并夹在 0…H-1 的整数 */
const layerYs = ht => {
  const clampY = y => Math.max(0, Math.min(H - 1, Math.round(y)));
  const m = /^auto(?::(\d+))?$/.exec(slcSpec);
  let ys;
  if (m) {
    const n = Math.max(1, Math.min(8, +(m[1] ?? SLC_FRACS.length)));
    const fr = n === SLC_FRACS.length ? SLC_FRACS : Array.from({ length: n }, (_, i) => 0.9 - 0.8 * i / Math.max(1, n - 1));
    ys = fr.map(f => clampY(ht * f));
  } else ys = slcSpec.split(/[,:;\s]+/).map(Number).filter(Number.isFinite).map(clampY);
  ys = [...new Set(ys)];
  return ys.length ? ys : [clampY(ht * 0.5)];
};

const all = evalJson(`(async()=>{await viz.ready();viz.set('lay',true);await new Promise(r=>setTimeout(r,120));
  return JSON.stringify([...document.querySelectorAll('#bgrid .bc[data-b]')].map(e=>[+e.dataset.b,e.getAttribute('title')]));})()`);
if (!all.length) { console.error('群系表是空的：页面没加载好？'); stop(); process.exit(1); }

let picked = all;
if (wantName && wantName !== 'all' && wantName !== '*') {
  picked = all.filter(([, n]) => n === wantName);
  if (!picked.length) {
    console.error(`没有群系叫「${wantName}」。可选：\n  ${all.map(([, n]) => n).join('、')}`);
    stop();
    process.exit(1);
  }
}

const outDir = join(SHOTS, SEED_DIR, gen);
mkdirSync(outDir, { recursive: true });
const TSV = join(outDir, 'biomes.tsv');
const TSV_COLS = ['id', 'name', 'x', 'z', 'hSample', 'hTop', 'block', 'temp', 'humid', 'mount', 'cont', 'top', 'side', 'slcY', 'slc', 'air', 'depth', 'mine', 'sideView'];
// 只换表头（参数可能变），**已有数据行保留**：部分群系重跑不能把别群系的行冲掉
const TSV_HEAD = `# gen=${gen} seed=${q.get('seed')} url=${url} slc=${slcSpec} shade=${shade} xray=${XRAY} air=${AIR_N}x${AIR_N}/step${AIR_STEP}\n`
  + `# slcY / slc = 每层 Y 与图片（逗号分隔，顺序一致）；air = 每层「空气占比/平均空气格数/最大」（空格分隔）\n`
  + `# depth = viz.depth({x,z,n:17,step:16,bin:4})：逐 Y 组成（bin 格一档，air/water/lava/ore 千分比）\n`;
const tsvAll = existsSync(TSV) ? readFileSync(TSV, 'utf8').split('\n').filter(l => l && l[0] !== '#') : [];
const tsvRows = tsvAll.slice(1);   // 旧表头丢掉，下面按当前 TSV_COLS 重写（加列后老行缺列 = 空）
writeFileSync(TSV, TSV_HEAD + TSV_COLS.join('\t') + '\n' + (tsvRows.length ? tsvRows.join('\n') + '\n' : ''));

/** 截图并搬到 <day>/<gen>/<kind>/<name>.webp；返回相对 gen 目录的路径 */
const shot = (kind, name) => {
  const out = run('snap', '--tag', `${gen}/${kind}/${name}`, '--note', `${gen}/${kind} ${name}`);
  const m = out.match(/^(\d+)\t(.+\.webp)$/m);
  if (!m) throw new Error(`snap 没有回文件路径：\n${out}`);
  const [, seq, file] = m;
  const rel = `${kind}/${name}.webp`;
  mkdirSync(dirname(join(outDir, rel)), { recursive: true });
  renameSync(join(ROOT, file), join(outDir, rel));
  // index 行：文件路径改成新位置（tag 已经是 <gen>/<kind>/<name>）；
  // 同一 tag 的旧行丢掉，否则重跑会撞上 prune（每组只留最后 20 行，会把当前文件删掉）
  const tag = `${gen}/${kind}/${name}`;
  const keep = [];
  for (const line of readFileSync(INDEX, 'utf8').split('\n')) {
    const c = line.split('\t');
    if (c[2] === tag && c[0] !== seq) continue;
    if (c[0] === seq) c[5] = relative(SHOTS, join(outDir, rel));
    keep.push(c.join('\t'));
  }
  writeFileSync(INDEX, keep.join('\n'));
  return rel;
};

const center = (id, name) => evalJson(`(async()=>{
  const ID=${id}, SEA=${sea === null ? 'null' : sea};
  viz.set('bio',[ID]);
  viz.jump('@0,0'); await viz.ready();   // 固定从原点开始搜：同一生成器/种子每次得到同一个中心
  let iv=setInterval(()=>{const e=document.querySelector('#bfind button[data-a=go]');if(e)e.click();},150);
  let r=null; try { r=await viz.bioSearch(ID); } catch(e) {}
  clearInterval(iv); viz.bioStop();
  if(!r) return JSON.stringify({miss:true});
  const R=await viz.bfind({x0:r[0]-256,z0:r[1]-256,n:64,step:8,want:{id:ID}});
  const hits=[]; for(let i=0;i<R.hits.length;i+=2) hits.push([R.hits[i],R.hits[i+1]]);
  const n=hits.length, stride=Math.max(1,Math.floor(n/400)), sub=[];
  for(let i=0;i<n;i+=stride) sub.push(hits[i]);
  const ps=await Promise.all(sub.map(p=>viz.probe(p[0],${PROBE_Y},p[1])));
  const land=sub.filter((p,i)=>ps[i]&&ps[i].sample&&SEA!=null&&ps[i].sample.h>SEA+1);
  const use=(land.length>=8&&land.length>=0.1*sub.length)?land:hits;
  let cx=r[0],cz=r[1];
  if(use.length){
    let sx=0,sz=0; for(const p of use){sx+=p[0];sz+=p[1];}
    cx=Math.round(sx/use.length); cz=Math.round(sz/use.length);
    let bd=1e18,bx=cx,bz=cz;
    for(const p of use){const d=(p[0]-cx)**2+(p[1]-cz)**2; if(d<bd){bd=d;bx=p[0];bz=p[1];}}
    cx=bx; cz=bz;
  }
  let chk=await viz.probe(cx,${PROBE_Y},cz);
  if(!chk.sample||chk.sample.biome!==ID){cx=r[0];cz=r[1];chk=await viz.probe(cx,${PROBE_Y},cz);}
  viz.set('bio',[]);
  viz.set('shade','block');viz.set('view','top');viz.set('mode','surface');viz.set('slice',null);
  viz.jump('@'+cx+','+cz); await viz.ready();
  const p=await viz.probe(cx,${PROBE_Y},cz), ht=p.h, t=ht==null?null:await viz.probe(cx,ht,cz);
  return JSON.stringify({cx,cz,hs:p.sample.h,ht,blk:t&&t.name,temp:p.sample.temp,humid:p.sample.humid,mount:p.sample.mount,cont:p.sample.cont,biome:chk.sample&&chk.sample.biome,err:viz.errors()});
})()`);

const VIEW = {
  top: `viz.set('shade',${JSON.stringify(shade)});viz.set('view','top');viz.set('mode','surface');viz.set('slice',null);viz.set('air',false);viz.set('xray',0);`,
  side: (v = 'south') => `viz.set('shade',${JSON.stringify(shade)});viz.set('view',${JSON.stringify(v)});viz.set('mode','surface');viz.set('slice',null);viz.set('air',false);viz.set('xray',0);`,
  slc: y => `viz.set('shade',${JSON.stringify(shade)});viz.set('view','top');viz.set('mode','slice');viz.set('slice',${y});viz.set('air',false);viz.set('xray',${XRAY});`,
  mine: `viz.set('shade','height');viz.set('view','top');viz.set('mode','surface');viz.set('slice',null);viz.set('air',false);viz.set('xray',0);`,
};
/** 侧视方向：auto 时用 viz.silhouette 的起伏 + 4×中空列数挑最壮观的一侧。 */
const pickSide = c => {
  if (SIDE_MODE !== 'auto') return SIDE_MODE;
  const score = v => {
    const r = evalJson(`JSON.stringify(viz.silhouette({view:${JSON.stringify(v)},x:${c.cx},z:${c.cz},width:128,span:48,n:81}))`);
    return (r.relief || 0) + 0.05 * (r.hollows || 0);
  };
  return ['south', 'north', 'east', 'west'].map(v => [v, score(v)]).sort((a, b) => b[1] - a[1])[0][0];
};
/** 顶栏两个输入框填机位 / 群系名。必须放在 ready() 之后：tlUI() 每帧会用视口左上角覆盖未聚焦的输入框。 */
const label = (cx, cz, name) => `const gx=document.getElementById('gx'),gz=document.getElementById('gz');window.__gv.set.call(gx,'@${cx},${cz}');window.__gv.set.call(gz,${JSON.stringify(name)});`;

/** 追加一行；同名群系的旧行先删掉（重跑同一群系不堆重复行） */
const writeRow = row => {
  const keep = readFileSync(TSV, 'utf8').split('\n').filter(l => l && l[0] === '#' || l && l.split('\t')[1] !== String(row[1]));
  writeFileSync(TSV, keep.join('\n') + (keep.length ? '\n' : '') + row.map(v => String(v ?? '')).join('\t') + '\n');
};
const missing = [];
let nShots = 0;
for (let i = 0; i < picked.length; i++) {
  const [id, name] = picked[i];
  const c = center(id, name);
  if (c.miss) { missing.push(name); console.log(`${i + 1}/${picked.length} ${name} —— 24k 格内没有，跳过`); continue; }
  // 重跑同一群系：先清掉这个群系的旧层（切层 Y 会随地形变，不清会和新图拼进同一张 _going_deeper）
  rmSync(join(outDir, 'slc', name), { recursive: true, force: true });
  rmSync(join(outDir, 'slc', `${name}_going_deeper.webp`), { force: true });
  const paths = { slc: [] }, air = [];
  const sideView = pickSide(c);
  for (const k of ['top', 'side', 'mine'].filter(k => VIEWS_REQ.includes(k))) {
    const expr = k === 'side' ? VIEW.side(sideView) : VIEW[k];
    evalOk(`(async()=>{${expr}await viz.ready();${label(c.cx, c.cz, name)}return 'ok'})()`);
    paths[k] = shot(k, name); nShots++;
  }
  // 参考高度取 min(hSample, hTop)：水域的 hTop 是水面 / 冰面（深海 hTop 一律 126，切出来全是水），
  // 取小的才是真地表（海底 / 山峰尖）。两者相等时就是普通陆地列。
  const ref = Math.min(c.hs ?? c.ht ?? (sea ?? 64), c.ht ?? c.hs ?? (sea ?? 64));
  const slcYs = VIEWS_REQ.includes('slc') ? layerYs(ref) : [];
  for (const y of slcYs) {
    const a = evalJson(`(async()=>{${VIEW.slc(y)}await viz.ready();${label(c.cx, c.cz, name)}
      let tot=0,airN=0,sum=0,maxD=0;
      for(let dz=0;dz<${AIR_N};dz++)for(let dx=0;dx<${AIR_N};dx++){
        const d=viz.airDist(${c.cx}+(dx-${(AIR_N - 1) / 2})*${AIR_STEP},${c.cz}+(dz-${(AIR_N - 1) / 2})*${AIR_STEP});
        tot++; if(d==null)continue; if(d>0){airN++;sum+=d;if(d>maxD)maxD=d;}
      }
      return JSON.stringify({pct:airN/tot,mean:airN?sum/airN:0,max:maxD})})()`);
    paths.slc.push(shot(`slc/${name}`, `@${y}`)); nShots++;
    air.push(`${Math.round(a.pct * 100)}%/${a.mean.toFixed(1)}/${a.max}`);
  }
  const depth = evalJson(`(async()=>{await viz.ready();return JSON.stringify(viz.depth(${JSON.stringify({ x: c.cx, z: c.cz, n: 17, step: 16, bin: 4 })}))})()`);
  const row = [id, name, c.cx, c.cz, c.hs, c.ht, c.blk, c.temp, c.humid, c.mount, c.cont, paths.top, paths.side,
    slcYs.join(','), paths.slc.join(','), air.join(' '), JSON.stringify(depth), paths.mine, sideView];
  writeRow(row);
  console.log(`${i + 1}/${picked.length} ${name} @${c.cx},${c.cz} h=${c.hs}/${c.ht} ${c.blk} slc ${slcYs.join('/')} ${c.err?.length ? 'ERR ' + JSON.stringify(c.err) : 'ok'}`);
}

stop();

if (VIEWS_REQ.includes('slc')) makeGrids(outDir);

console.log(`\n${gen}: ${picked.length - missing.length} 个群系、共 ${nShots} 张（slc=${slcSpec}）→ ${relative(ROOT, outDir)}`);
if (missing.length) console.log(`未找到（地表不生成）：${missing.join('、')}`);
console.log(`索引 ${relative(ROOT, TSV)}`);
stop();
