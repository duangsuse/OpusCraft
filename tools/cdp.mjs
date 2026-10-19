// 极简 CDP 客户端：启动 Chromium（无头或有头），连接第一个 page，提供 send / js / screenshot / close。
// 用 Node 内置 WebSocket，无 npm 依赖。
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

export async function launch({ width = 1280, height = 657, gpu = true, headed = false, tag = 'cdp' } = {}) {
  const port = 9700 + (process.pid % 200);
  const prof = `/tmp/${tag}-${port}`;
  rmSync(prof, { recursive: true, force: true });            // 干净的 profile：localStorage 里没有旧参数/存档
  const args = [headed ? '' : '--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`, `--user-data-dir=${prof}`, '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(gpu ? ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist']
            : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    'about:blank'].filter(Boolean);
  const proc = spawn('chromium', args, { stdio: 'ignore' });
  let url = null;
  for (let i = 0; i < 75 && !url; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); url = l.find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!url) await sleep(200);
  }
  if (!url) { proc.kill(); throw new Error('chromium did not start'); }
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let id = 0; const pend = new Map(), logs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error) throw new Error(r.error.message);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const screenshot = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
  const close = () => { try { ws.close(); } catch {} proc.kill(); };
  return { send, js, screenshot, close, logs };
}
