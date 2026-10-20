// Intel/Mesa 着色器编译统计：node tools/shader-stats.mjs [url] —— 用 INTEL_DEBUG=fs 启动 Chromium（ANGLE/GL），
// 等 v2 DDA 着色器编译后，从 GPU 进程 stderr 里摘出最大的几个片元着色器的 SIMD 宽度 / 指令数 / 循环 / spill:fill。
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const URL_ = process.argv[2] || 'http://localhost:8765/VoxelCraft.html?r=v2';
const port = 9500 + (process.pid % 200), prof = `/tmp/shstat-${port}`;
rmSync(prof, { recursive: true, force: true });
const proc = spawn('chromium', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, '--window-size=1280,657', `--user-data-dir=${prof}`,
  '--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', URL_], { env: { ...process.env, INTEL_DEBUG: 'fs' }, stdio: ['ignore', 'ignore', 'pipe'] });
let err = '';
proc.stderr.on('data', d => { err += d; });
await sleep(+(process.argv[3] || 20000));
proc.kill();
const stats = [...err.matchAll(/(SIMD\d+) shader: (\d+) instructions\. (\d+) loops\. (\d+) cycles\. (\d+):(\d+) spills:fills/g)]
  .map(m => ({ simd: m[1], ins: +m[2], loops: +m[3], cycles: +m[4], spills: +m[5], fills: +m[6] }));
stats.sort((a, b) => b.ins - a.ins);
console.log(stats.slice(0, 8).map(s => `${s.simd} ins ${s.ins} loops ${s.loops} cycles ${s.cycles} spills ${s.spills}:${s.fills}`).join('\n') || err.slice(0, 2000));
