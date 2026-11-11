#!/usr/bin/env node
/* gode/tools/scserver.js —— 一条命令保活：常驻游戏进程（自动进第 N 个世界），挂了自动重启；
   顺手把 ScBridge 的定长文件软链到 gode/tools/out/，给 scview.html 当数据源。
   用法： node gode/tools/scserver.js [--game <游戏目录>] [--world 1] [--log /tmp/scserver.log] [--no-raise]
   退出： Ctrl-C（先杀游戏子进程）。查看： http://localhost:8765/gode/tools/scview.html */
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, unlinkSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const gameDir = opt('--game', `${process.env.HOME}/bin/SurvivalcraftAPI-1.9.5.1`);
const world = opt('--world', '1');
const logPath = opt('--log', '/tmp/scserver.log');
const exe = join(gameDir, 'Survivalcraft');
const bridge = join(gameDir, 'ScBridge');
const outDir = join(repo, 'gode/tools/out');
const base = process.env.GD_BASE ?? 'http://localhost:8765/';

mkdirSync(outDir, { recursive: true });
for (const [name, target] of [['scbridge-data.tsv', join(bridge, 'data.tsv')], ['scbridge-resp.txt', join(bridge, 'resp.txt')]]) {
  const link = join(outDir, name);
  try { if (existsSync(link)) unlinkSync(link); } catch { /* ignore */ }
  if (existsSync(target)) symlinkSync(target, link);
}

const KWIN_JS = join(tmpdir(), 'scserver-raise.js');
writeFileSync(KWIN_JS, `const ws = workspace.windowList();
let t = null;
for (const w of ws) { const id = (w.resourceClass || '') + ' ' + (w.resourceName || '') + ' ' + (w.caption || ''); if (id.toLowerCase().indexOf('survivalcraft') >= 0) t = w; }
if (t) workspace.activeWindow = t;\n`);

function raise() {
  if (flag('--no-raise') || !process.env.KDE_FULL_SESSION) return;
  const dbus = ['org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting'];
  execFile('qdbus6', [...dbus, 'unloadScript', 'scserver'], () => {
    execFile('qdbus6', [...dbus, 'loadScript', KWIN_JS, 'scserver'], () => {
      execFile('qdbus6', [...dbus, 'start'], () => {});
    });
  });
}

let child = null, stopping = false, starts = 0;

function start() {
  starts++;
  const fd = openSync(logPath, 'a');
  child = spawn(exe, [], {
    cwd: gameDir,
    env: { ...process.env, OMP_SC_AUTOPLAY: world },
    stdio: ['ignore', fd, fd]
  });
  closeSync(fd);
  console.log(`[${new Date().toTimeString().slice(0, 8)}] start #${starts} pid=${child.pid} world=${world}`);
  setTimeout(raise, 4000);
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) { process.exit(0); }
    console.log(`[${new Date().toTimeString().slice(0, 8)}] game exited code=${code} signal=${signal}, restart in 2s`);
    setTimeout(() => { if (!stopping) start(); }, 2000);
  });
}

function stop() {
  stopping = true;
  if (child) { try { child.kill('SIGTERM'); } catch { /* ignore */ } setTimeout(() => { try { child?.kill('SIGKILL'); } catch { /* ignore */ } process.exit(0); }, 3000); }
  else process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

existsSync(exe) ? start() : (console.error(`找不到 ${exe}`), process.exit(1));
console.log(`viewer: ${base}gode/tools/scview.html`);
console.log(`log:    ${logPath}`);
console.log(`bridge: ${bridge}/req.txt`);
setInterval(() => {}, 1 << 30);