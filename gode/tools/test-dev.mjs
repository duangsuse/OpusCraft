/**
 * test-dev — gode/tools/dev.js 的测试：在临时目录里起一个实例，逐个端点与安全规则断言；不碰仓库文件，不占 8765。
 *   node --test gode/tools/test-dev.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, readFileSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDev } from './dev.js';

const root = mkdtempSync(join(tmpdir(), 'gode-dev-test-'));
const w = (rel, s = '') => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let dev, B, port;

before(async () => {
  w('gode/index.html', '<h1>hi</h1>'); w('gode/defl/c_.json', '{"a":1}'); w('gode/defl/g/mini.js', '//'); w('gode/main/boot.js', '//'); w('.git/config', 'secret'); w('a/b.txt', 'abcdefghij');
  mkdirSync(join(root, 'gode/shots'), { recursive: true });
  dev = createDev({ root, debounce: 40, log: () => {}, perf: 'gode/shots/perf.jsonl' });
  port = (await dev.listen(0, '127.0.0.1')).port; B = `http://127.0.0.1:${port}`;
});
after(async () => { await dev.close(); rmSync(root, { recursive: true, force: true }); });

/** fetch 不让改 Host / 绑源地址，这两项用 http.request */
const raw = (path, { method = 'GET', headers = {}, body, localAddress } = {}) => new Promise((ok, no) => {
  const r = request({ host: '127.0.0.1', port, path, method, headers, localAddress }, res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => ok({ status: res.statusCode, body: Buffer.concat(c).toString() })); });
  r.on('error', no); r.end(body);
});
const put = (rel, body, headers = {}, q = '') => fetch(`${B}/__dev/write?path=${rel}${q}`, { method: 'PUT', body, headers });

/** 订阅 SSE，返回 { events, get(name), close }：events = 默认事件的 DevEvent，names = 命名事件 */
function sse(headers = {}) {
  const out = { events: [], names: [], ids: [] };
  const r = request({ host: '127.0.0.1', port, path: '/__dev/events', headers }, res => {
    let buf = ''; res.setEncoding('utf8');
    res.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const f = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(f)?.[1], data = /^data: (.*)$/m.exec(f)?.[1], id = /^id: (.*)$/m.exec(f)?.[1];
        if (ev) out.names.push(ev); else if (data) { out.events.push(JSON.parse(data)); out.ids.push(id); }
      }
    });
  });
  r.end(); out.close = () => r.destroy();
  return new Promise(ok => { const t = setInterval(() => { if (out.names.includes('hello')) { clearInterval(t); ok(out); } }, 5); });
}

test('静态：index / ETag / 304 / HEAD / MIME', async () => {
  const r = await fetch(`${B}/gode/`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html; charset=utf-8/); assert.equal(r.headers.get('cache-control'), 'max-age=1');
  const etag = r.headers.get('etag'); assert.ok(etag);
  assert.equal((await fetch(`${B}/gode/`, { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal((await fetch(`${B}/gode/`, { method: 'HEAD' })).status, 200);
  assert.match((await fetch(`${B}/gode/main/boot.js`)).headers.get('content-type'), /^text\/javascript/);
  assert.match((await fetch(`${B}/gode/defl/c_.json`)).headers.get('content-type'), /^application\/json/);
});
test('静态：Range / 416', async () => {
  const r = await fetch(`${B}/a/b.txt`, { headers: { Range: 'bytes=2-4' } });
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 2-4/10'); assert.equal(await r.text(), 'cde');
  assert.equal(await (await fetch(`${B}/a/b.txt`, { headers: { Range: 'bytes=-3' } })).text(), 'hij');
  assert.equal((await fetch(`${B}/a/b.txt`, { headers: { Range: 'bytes=99-' } })).status, 416);
});
test('静态：目录 301 / 列目录 / 点段 404 / 穿越 404 / 非 GET 405', async () => {
  const r = await fetch(`${B}/gode/defl`, { redirect: 'manual' }); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/gode/defl/');
  const l = await (await fetch(`${B}/gode/defl/`)).text(); assert.match(l, /c_\.json/); assert.match(l, /g\//);
  assert.equal((await fetch(`${B}/.git/config`)).status, 404);
  assert.equal((await raw('/gode/../../etc/passwd')).status, 404);
  assert.equal((await raw('/gode/%2e%2e/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await fetch(`${B}/gode/`, { method: 'POST' })).status, 405);
});

test('监听：add / 去抖合并 / 原子保存是 change / unlink / 排除项 / 新目录', async () => {
  const s = await sse(), f = 'gode/defl/t.tsv', ev = () => s.events.map(e => `${e.kind} ${e.path}`);
  w(f, 'a'); await sleep(150);
  for (let i = 0; i < 5; i++) { w(f, String(i)); await sleep(8); } await sleep(150);      // 5 次快写 → 1 个 change
  w('gode/defl/.t.tmp', 'x'); renameSync(join(root, 'gode/defl/.t.tmp'), join(root, f)); await sleep(150);   // 原子保存 → change
  w('gode/shots/x.png', 'x'); w('gode/defl/.hid', 'x'); w('gode/defl/e.tsv~', 'x'); await sleep(150);       // 排除
  rmSync(join(root, f)); await sleep(150);
  mkdirSync(join(root, 'gode/defl/nd')); await sleep(100); w('gode/defl/nd/a.tsv', '1'); await sleep(150);   // 新目录里的新文件
  assert.deepEqual(ev(), ['add gode/defl/t.tsv', 'change gode/defl/t.tsv', 'change gode/defl/t.tsv', 'unlink gode/defl/t.tsv', 'add gode/defl/nd/a.tsv']);
  assert.ok(s.events.every(e => Number.isFinite(e.t)));
  s.close();
});
test('SSE：hello / 断线补发 / epoch 变了或 id 太大发 reset', async () => {
  const a = await sse(), epoch = dev.hub.epoch, seq0 = dev.hub.seq;
  a.close(); w('gode/defl/r1.tsv', '1'); await sleep(120); w('gode/defl/r2.tsv', '2'); await sleep(120);
  const b = await sse({ 'Last-Event-ID': `${epoch}:${seq0}` }); await sleep(50);
  assert.deepEqual(b.events.map(e => e.path), ['gode/defl/r1.tsv', 'gode/defl/r2.tsv']); assert.ok(!b.names.includes('reset')); b.close();
  const c = await sse({ 'Last-Event-ID': 'other:5' }); await sleep(50); assert.ok(c.names.includes('reset')); c.close();
  const d = await sse({ 'Last-Event-ID': `${epoch}:999999` }); await sleep(50); assert.ok(d.names.includes('reset')); d.close();
});

test('写回：428 / 新建 / 409 / If-Match / force', async () => {
  const f = 'gode/defl/w.tsv';
  assert.equal((await put(f, 'a')).status, 428);
  const r1 = await put(f, 'id\tname\n', { 'If-None-Match': '*' }); assert.equal(r1.status, 200); const e1 = (await r1.json()).etag;
  assert.equal((await put(f, 'b', { 'If-None-Match': '*' })).status, 409);
  const r2 = await put(f, 'v2', { 'If-Match': e1 }); assert.equal(r2.status, 200);
  const r3 = await put(f, 'v3', { 'If-Match': e1 }); assert.equal(r3.status, 409); assert.ok((await r3.json()).etag);
  assert.equal((await put(f, 'v4', {}, '&force=1')).status, 200); assert.equal(readFileSync(join(root, f), 'utf8'), 'v4');
});
test('写回：白名单与校验', async () => {
  const F = '&force=1';
  assert.equal((await put('gode/main/boot.js', 'x', {}, F)).status, 403);
  assert.equal((await put('gode/defl/x.js', 'x', {}, F)).status, 403);
  assert.equal((await put('gode/defl/../main/x.tsv', 'x', {}, F)).status, 403);
  assert.equal((await put('gode/defl/.h.tsv', 'x', {}, F)).status, 403);
  assert.equal((await put('/etc/passwd', 'x', {}, F)).status, 403);
  assert.equal((await put('gode/defl/nodir/x.tsv', 'x', {}, F)).status, 404);
  assert.equal((await put('gode/defl/j.json', '{bad', {}, F)).status, 400);
  assert.equal((await put('gode/defl/j.json', '{"a":1}', {}, F)).status, 200);
  assert.equal((await put('gode/defl/u.tsv', new Uint8Array([0xff, 0xfe]), {}, F)).status, 400);
  assert.equal((await put('gode/defl/big.tsv', 'a'.repeat(5 << 20), {}, F)).status, 413);
  assert.equal((await fetch(`${B}/__dev/write?path=gode/defl/w.tsv`)).status, 405);
  symlinkSync(join(root, 'gode/main/boot.js'), join(root, 'gode/defl/l.tsv'));
  assert.equal((await put('gode/defl/l.tsv', 'x', {}, F)).status, 403);
  assert.equal(readFileSync(join(root, 'gode/main/boot.js'), 'utf8'), '//');
  assert.ok(!existsSync(join(root, 'gode/defl/.w.tsv.tmp')), '不留临时文件');
});
test('写回：只收本机（Host 与源地址两层）', async () => {
  const q = '/__dev/write?path=gode/defl/h.tsv&force=1';
  assert.equal((await raw(q, { method: 'PUT', headers: { Host: 'evil.example.com' }, body: 'x' })).status, 403);
  assert.equal((await raw(q, { method: 'PUT', headers: { Host: `localhost:${port}` }, body: 'x' })).status, 200);
  const r = await raw(q, { method: 'PUT', headers: { Host: `localhost:${port}` }, body: 'x', localAddress: '127.0.0.2' }).catch(() => null);   // 源地址不是 127.0.0.1
  if (r) assert.equal(r.status, 403); else console.warn('  （这台机器不能绑 127.0.0.2，跳过源地址那一层）');
});

test('改声明：POST /__dev/patch（只改 gode/ 下 .js 里 c_.X = {…} 的字面量）', async () => {
  const F = 'gode/mock/decl.js', src = "// 头\nc_.Fx = {\n  gravity: [0.8, 0, 2, '重力'],\n  on: [true, '开'],\n}\n";
  w(F, src);
  const at = { line: 2, col: 7, topic: 'Fx' };
  const post = (rel, body, headers = {}) => fetch(`${B}/__dev/patch?path=${rel}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
  const ok = await post(F, { ...at, edits: [{ key: 'gravity', idx: 0, old: 0.8, value: 1.5 }, { key: 'on', idx: 0, old: true, value: false }] });
  assert.equal(ok.status, 200); const j = await ok.json(); assert.equal(j.changed.length, 2); assert.equal(j.path, F);
  assert.equal(readFileSync(join(root, F), 'utf8'), src.replace("[0.8, 0, 2, '重力']", "[1.5, 0, 2, '重力']").replace("[true, '开']", "[false, '开']"));
  const cur = readFileSync(join(root, F), 'utf8');
  const stale = await post(F, { ...at, edits: [{ key: 'gravity', idx: 0, old: 0.8, value: 9 }] });          // 页面还以为是 0.8：整体拒绝
  assert.equal(stale.status, 409); assert.match((await stale.json()).error, /源码里是 1\.5/); assert.equal(readFileSync(join(root, F), 'utf8'), cur);
  assert.equal((await post(F, { ...at, col: 8, edits: [{ key: 'on', idx: 0, old: false, value: true }] })).status, 409);
  assert.equal((await post(F, '{bad')).status, 400);
  assert.equal((await post(F, { ...at, edits: [{ key: 'on', idx: 0, old: false, value: { a: 1 } }] })).status, 400);
  // 白名单
  w('gode/tools/x.js', src); w('gode/vendor/v.js', src); w('gode/defl/x.json', '{}'); w('other/y.js', src);
  for (const rel of ['gode/tools/x.js', 'gode/vendor/v.js', 'gode/defl/x.json', 'other/y.js', 'gode/../other/y.js', 'gode/.h.js', '/etc/passwd'])
    assert.equal((await post(rel, { ...at, edits: [{ key: 'on', idx: 0, old: true, value: false }] })).status, 403, rel);
  assert.equal((await post('gode/mock/none.js', { ...at, edits: [{ key: 'on', idx: 0, old: true, value: false }] })).status, 404);
  assert.equal((await fetch(`${B}/__dev/patch?path=${F}`)).status, 405);
  symlinkSync(join(root, 'gode/tools/x.js'), join(root, 'gode/mock/l.js'));
  assert.equal((await post('gode/mock/l.js', { ...at, edits: [{ key: 'on', idx: 0, old: true, value: false }] })).status, 403);
  assert.equal(readFileSync(join(root, 'gode/tools/x.js'), 'utf8'), src, '符号链接指向的文件没被改');
  // 只收本机
  const q = `/__dev/patch?path=${F}`, body = JSON.stringify({ ...at, edits: [{ key: 'on', idx: 0, old: false, value: true }] });
  assert.equal((await raw(q, { method: 'POST', headers: { Host: 'evil.example.com' }, body })).status, 403);
  assert.equal((await raw(q, { method: 'POST', headers: { Host: `localhost:${port}` }, body })).status, 200);
  assert.ok(!readdirSync(join(root, 'gode/mock')).some(n => n.includes('.tmp-')), '不留临时文件');
});

test('ls / info', async () => {
  assert.deepEqual(await (await fetch(`${B}/__dev/ls`)).json(), (await (await fetch(`${B}/__dev/ls`)).json()).slice().sort());
  assert.ok((await (await fetch(`${B}/__dev/ls`)).json()).includes('g/'));
  assert.deepEqual(await (await fetch(`${B}/__dev/ls?dir=gode/defl/g`)).json(), ['mini.js']);
  assert.equal((await fetch(`${B}/__dev/ls?dir=gode/main`)).status, 403);
  assert.equal((await fetch(`${B}/__dev/ls?dir=gode/defl/nope`)).status, 404);
  const i = await (await fetch(`${B}/__dev/info`)).json(); assert.equal(i.name, 'gode-dev'); assert.ok(i.dirs > 0);
  assert.equal((await fetch(`${B}/__dev/nope`)).status, 404);
});
test('perf-collect：/t 收 JSON 与 JSONL，/agg 按 path 取中位数', async () => {
  const post = body => fetch(`${B}/t`, { method: 'POST', body });
  assert.equal((await post('{"topic":"gl_wtf","path":"$Gl.pom","from":0,"to":1,"fps":-3.5,"gpu":0.8}')).status, 204);
  assert.equal((await post('{"path":"$Gl.pom","fps":-4.5,"gpu":1.2}\n{"path":"$Gl.taa","fps":-1}\n')).status, 204);
  assert.equal((await post('oops')).status, 400);
  const a = await (await fetch(`${B}/agg`)).json();
  assert.equal(a['$Gl.pom'].n, 2); assert.equal(a['$Gl.pom'].fps, -4); assert.equal(a['$Gl.taa'].n, 1); assert.equal(a['$Gl.taa'].gpu, null);
  assert.deepEqual(Object.keys(await (await fetch(`${B}/agg?path=${encodeURIComponent('$Gl.taa')}`)).json()), ['$Gl.taa']);
});
