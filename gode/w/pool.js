/* gode/w/pool.js —— slicer 池（s01）：同一生成器脚本起 N 个 module Worker，单键动词信封 + id（s01 §2）。
   N = max(2, min(8, cores − 2))。每个 worker 同时最多 2 个区块任务在途（gen = 整块，col = 列级地表），藏住消息往返；sample 等小请求插队。
   代际 gen：换种子 / 换生成器 / regen 时 +1，过期应答丢弃（goal-pgviz P3-2）。 */
export class Pool {
  constructor(url, n = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 2))) {
    this.url = url; this.n = n; this.ws = []; this.seq = 0; this.wait = new Map(); this.gen = 0;
    this.onerr = (e) => console.error('[slicer]', e.msg, e.stack);
  }
  // 起池并 onkwarg；返回 meta。再次调用 = 热重置（不重建 worker）
  async init(kwarg) {
    if (!this.ws.length) for (let i = 0; i < this.n; i++) {
      const w = new Worker(this.url, { type: 'module' });
      w.busy = 0; w.i = i;
      w.onmessage = (e) => this.recv(w, e.data);
      w.onerror = (e) => { e.preventDefault?.(); this.onerr({ msg: `worker ${i}: ${e.message || 'load error'} (${this.url})`, stack: `${e.filename}:${e.lineno}` }); w.readyRej?.(new Error(e.message || 'worker load error')); for (const [, p] of this.wait) p.rej?.(new Error(e.message)); };
      this.ws.push(w);
    }
    this.gen++;
    for (const w of this.ws) w.busy = 0;
    for (const [id, p] of this.wait) if (p.job) this.wait.delete(id);
    const metas = await Promise.all(this.ws.map(w => new Promise((res, rej) => { w.ready = res; w.readyRej = rej; w.postMessage({ onkwarg: kwarg }); })));
    return metas[0];
  }
  recv(w, m) {
    if (m.ready) { w.ready?.(m.ready.meta); w.ready = null; return; }
    const p = this.wait.get(m.id);
    if (m.err) { this.onerr(m.err); if (p) { this.wait.delete(m.id); if (p.job) { w.busy--; p.fail?.(); } p.rej?.(new Error(m.err.msg)); this.pump?.(); } else w.readyRej?.(new Error(m.err.msg)); return; }
    if (!p) return;
    this.wait.delete(m.id);
    if (p.job) { w.busy--; if (p.gen === this.gen) p.res(m[p.verb]); this.pump?.(); }
    else p.res(m[p.verb]);
  }
  idle() { let best = null; for (const w of this.ws) if (w.busy < 2 && (!best || w.busy < best.busy)) best = w; return best; }
  // 发一个区块任务（verb = 'gen' | 'col' | 'mesh'）：返回 false = 没有空闲 worker；fail = 生成器报错时回调（main 好清在途标记）；tr = transfer 列表
  job(verb, arg, res, fail, tr) {
    const w = this.idle(); if (!w) return false;
    const id = ++this.seq; w.busy++;
    this.wait.set(id, { job: true, verb, gen: this.gen, res, fail });
    w.postMessage({ [verb]: arg, id }, tr ?? []);
    return true;
  }
  call(verb, arg, wi) {   // wi = 指定 worker（并行扫描用）；缺省 = 最闲的
    const w = wi !== undefined ? this.ws[wi % this.ws.length] : this.ws.reduce((a, b) => (b.busy < a.busy ? b : a));
    const id = ++this.seq;
    return new Promise((res, rej) => { this.wait.set(id, { verb, res, rej }); w.postMessage({ [verb]: arg, id }); });
  }
  close() { for (const w of this.ws) w.terminate(); this.ws = []; this.wait.clear(); }
}
