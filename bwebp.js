/* bwebp.js — world snapshot as an image file. Shares window.gg (see index.html).
   File = <cover webp (may be empty)> <payload> — .webp only. Decoders stop at the RIFF size, so the payload rides along unseen.
   payload = records, each  "\b" + decimal byteLength + ":" + bytes
     record 0      UTF-8 JSON head { v: 3, enc, order: 'yzx', cols: [names], n, tiles: [[chunk, yzx index, tile]], cover: {w, h} (window px), …game head }
     record 1..k   the c_BW.cols columns, compressed with head.enc ('deflate'; 'brotli' when the columns exceed c_BW.brotliOver
                   — CompressionStream shim in index.html; 'raw' for the synchronous unload save)
   Columns (YZX order: y outermost, then z, x fastest — layers compress well):
     xz      Int32 cx, cz per chunk           bio  Uint8 256 per chunk (z, x)
     b, m    per chunk  [palette size-1 (u8)] [palette (u8…)] [indices bit-packed LSB-first, ceil(log2 size) bits each]
   Efficiency (64 MC-like chunks, blocks+meta 4 MB): palette/bit-pack shrinks 3.4x before compression and then deflates
   ~4% smaller than raw YZX bytes (68 KB vs 71 KB, deflate-9); brotli-11 ~55 KB (-20%) — so bit-pack + deflate, brotli for big worlds.
   Only v3 loads. Wired directly to the live game: this.world = gg.world, this.head = gg.Save.head(); UI: $('io') + #btn-save. */
(() => {
'use strict';
const c_BW = {
  v: 3, enc: 'deflate', brotliOver: 50 << 20 /* uncompressed column bytes */, order: 'yzx', mark: 8 /* '\b' */, sep: 58 /* ':' */, ext: '.webp',
  // Columns in file order: [name, encode(chunks) -> Uint8Array, decode(bytes, chunks)]; 'xz' creates the chunks
  cols: [
    ['xz', (cs) => new Uint8Array(Int32Array.from(cs.flatMap(c => [c.cx, c.cz])).buffer), null],
    ['b', (cs) => bwebp.packAll(cs, 'blocks'), (u8, cs) => bwebp.unpackAll(u8, cs, 'blocks')],
    ['m', (cs) => bwebp.packAll(cs, 'meta'), (u8, cs) => bwebp.unpackAll(u8, cs, 'meta')],
    ['bio', (cs) => bwebp.zx(cs), (u8, cs) => bwebp.unzx(u8, cs)],
  ],
  prefix: 'bw_',                // download name: bw_<save name>.webp
  logo: { src: 'res/logo.webp', w: 0.4, top: 0.03, q: 0.85 },   // stamped top-centre on downloaded covers: width share, top margin share, webp quality
  pickAccept: '',               // Android file picker: no filter (Firefox's image/* opens the gallery only)
};
const te = new TextEncoder(), td = new TextDecoder();
const pipe = (u8, T, enc) => new Response(new Blob([u8]).stream().pipeThrough(new T(enc))).arrayBuffer().then(b => new Uint8Array(b));
const cat = (parts) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.byteLength; } return out; };

const bwebp = gg.my(new class bwebp {
  hooks = null;
  get world() { return gg.world; }
  get head() { return gg.Save.head(); }

  // ---- framing ----
  record(u8) { return [te.encode('\b' + u8.byteLength + ':'), u8]; }
  *records(u8, at) {
    while (at < u8.length && u8[at] === c_BW.mark) {
      let p = at + 1, n = 0;
      while (u8[p] !== c_BW.sep) { if (p >= u8.length || u8[p] < 48 || u8[p] > 57) throw new Error('bwebp: bad length'); n = n * 10 + u8[p++] - 48; }
      yield u8.subarray(p + 1, p + 1 + n); at = p + 1 + n;
    }
  }
  // End of the cover webp = start of the payload (0: no cover, -1: not a bwebp file)
  split(u8) {
    if (u8[0] === c_BW.mark) return 0;
    const s4 = (o) => String.fromCharCode(...u8.subarray(o, o + 4));
    if (u8.length < 12 || s4(0) !== 'RIFF' || s4(8) !== 'WEBP') return -1;
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true); return 8 + n + (n & 1);
  }
  has(buf) { const u8 = new Uint8Array(buf), end = this.split(u8); return end >= 0 && u8[end] === c_BW.mark; }
  headOf(u8, end = this.split(u8)) {
    if (end < 0 || u8[end] !== c_BW.mark) throw new Error('no world data in this file');
    const it = this.records(u8, end), head = JSON.parse(td.decode(it.next().value));
    if (head.v !== c_BW.v || head.order !== c_BW.order || String(head.cols) !== String(c_BW.cols.map(c => c[0]))) throw new Error(`unsupported world format v${head.v}`);
    return { head, it };
  }

  // ---- YZX <-> chunk-native index (bidx = x<<11 | z<<7 | y) ----
  yzx(i) { return ((i & 127) << 8) | (((i >> 7) & 15) << 4) | (i >> 11); }
  native(j) { return gg.bidx(j & 15, j >> 8, (j >> 4) & 15); }

  // ---- palette + bit-pack of one chunk array (read in YZX order) ----
  pack(src) {
    const n = src.length, slot = new Int16Array(256).fill(-1), pal = [], idx = new Uint8Array(n);
    for (let y = 0, j = 0; y < gg.CHUNK_H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++, j++) {
      const v = src[(x << 11) | (z << 7) | y];
      if (slot[v] < 0) { slot[v] = pal.length; pal.push(v); }
      idx[j] = slot[v];
    }
    const bits = pal.length < 2 ? 0 : 32 - Math.clz32(pal.length - 1), out = new Uint8Array(1 + pal.length + Math.ceil(n * bits / 8));
    out[0] = pal.length - 1; out.set(pal, 1);
    if (bits) { let o = 1 + pal.length, acc = 0, nb = 0; for (let j = 0; j < n; j++) { acc |= idx[j] << nb; nb += bits; while (nb >= 8) { out[o++] = acc & 255; acc >>>= 8; nb -= 8; } } if (nb) out[o] = acc; }
    return out;
  }
  // -> offset after this chunk's record
  unpack(u8, at, dst) {
    const size = u8[at] + 1, pal = u8.subarray(at + 1, at + 1 + size), bits = size < 2 ? 0 : 32 - Math.clz32(size - 1), n = dst.length, mask = (1 << bits) - 1;
    let o = at + 1 + size, acc = 0, nb = 0;
    for (let y = 0, j = 0; y < gg.CHUNK_H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++, j++) {
      let k = 0;
      if (bits) { while (nb < bits) { acc |= u8[o++] << nb; nb += 8; } k = acc & mask; acc >>>= bits; nb -= bits; }
      dst[(x << 11) | (z << 7) | y] = pal[k];
    }
    return at + 1 + size + Math.ceil(n * bits / 8);
  }

  packAll(cs, prop) { return cat(cs.map(c => this.pack(c[prop]))); }
  unpackAll(u8, cs, prop) { let at = 0; for (const c of cs) at = this.unpack(u8, at, c[prop]); }
  // biomes: chunk-native (x<<4 | z) <-> file (z<<4 | x)
  zx(cs) { const a = new Uint8Array(cs.length * 256); cs.forEach((c, k) => { for (let i = 0; i < 256; i++) a[k * 256 + i] = c.biomes[(i & 15) << 4 | i >> 4]; }); return a; }
  unzx(u8, cs) { cs.forEach((c, k) => { for (let i = 0; i < 256; i++) c.biomes[(i & 15) << 4 | i >> 4] = u8[k * 256 + i]; }); }

  // ---- world <-> columns ----
  chunks() { const w = this.world; return [...w.chunks.values()].filter(c => c.modified).concat([...w.stored.values()]); }
  columns(enc) {
    const cs = this.chunks(), tiles = cs.flatMap((c, k) => [...c.tiles].map(([i, t]) => [k, this.yzx(i), t]));
    return { head: { ...this.head, v: c_BW.v, enc, order: c_BW.order, cols: c_BW.cols.map(c => c[0]), n: cs.length, tiles }, arrays: c_BW.cols.map(([, en]) => en(cs)) };
  }
  // sink: where decoded chunks go (default: the running world's stored map; XRay passes its own map for a diff base)
  fill(head, arrays, sink = (c) => this.world.stored.set(c.key, c)) {
    const xz = new Int32Array(arrays[0].slice().buffer), cs = Array.from({ length: head.n }, (_, k) => new gg.Chunk(xz[2 * k], xz[2 * k + 1]));
    c_BW.cols.forEach(([, , de], j) => de?.(arrays[j], cs));
    for (const [k, i, t] of head.tiles) cs[k].tiles.set(this.native(i), t);
    for (const c of cs) { c.recomputeHeights(); c.state = gg.CH_DECORATED; c.modified = true; sink(c); }
  }

  // ---- dump / load ----  shot = { w, h (window px at capture), url, u8 (cover webp bytes) } | null
  file(shot, head, arrays) {
    head.cover = shot?.u8 ? { w: shot.w, h: shot.h } : null;
    return [shot?.u8 || new Uint8Array(0), ...this.record(te.encode(JSON.stringify(head))), ...arrays.flatMap(a => this.record(a))];
  }
  // deflate; brotli once blocks + meta exceed c_BW.brotliOver
  async dump(shot) {
    const big = this.chunks().length * gg.CHUNK_VOL * 2 > c_BW.brotliOver, { head, arrays } = this.columns(big ? 'brotli' : c_BW.enc);
    const z = await Promise.all(arrays.map(a => pipe(a, CompressionStream, head.enc)));
    return Object.assign(new Blob(this.file(shot, head, z), { type: 'image/webp' }), { enc: head.enc });   // enc: for the HUD message
  }
  // Page unload (compression is async): palette/bit-packed columns, uncompressed
  dumpSync(shot) { const { head, arrays } = this.columns('raw'); return cat(this.file(shot, head, arrays)); }
  // Cover only (title preview, no inflate) -> shot | null; keep: also hold the cover bytes (for re-saving)
  cover(buf, keep) {
    const u8 = new Uint8Array(buf), end = this.split(u8);
    if (end <= 0) return null;
    const { head } = this.headOf(u8, end), img = u8.slice(0, end);
    return head.cover && { ...head.cover, url: URL.createObjectURL(new Blob([img], { type: 'image/webp' })), u8: keep ? img : null };
  }
  // -> { ...head, shot, file (the original bytes), fill(sink?) }
  async load(buf) {
    const u8 = new Uint8Array(buf), { head, it } = this.headOf(u8), raw = [...it];
    const arrays = head.enc === 'raw' ? raw : await Promise.all(raw.map(a => pipe(a, DecompressionStream, head.enc)));
    return { ...head, shot: this.cover(u8, true), file: u8, fill: (sink) => this.fill(head, arrays, sink) };
  }
  // Downloaded copy: c_BW.logo drawn top-centre on the cover (payload untouched); any failure -> the file as is
  async stamp(blob) {
    const L = c_BW.logo, u8 = new Uint8Array(await blob.arrayBuffer()), end = this.split(u8);
    const logo = await (this.logo ??= fetch(L.src).then(r => r.blob()).then(createImageBitmap).catch(() => null));
    if (end <= 0 || !logo) return blob;
    try {
      const bm = await createImageBitmap(new Blob([u8.subarray(0, end)], { type: 'image/webp' })), c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d');
      const w = bm.width * L.w, h = w * logo.height / logo.width;
      g.drawImage(bm, 0, 0); g.drawImage(logo, (bm.width - w) / 2, bm.height * L.top, w, h);
      const cover = await c.convertToBlob({ type: 'image/webp', quality: L.q });
      return cover.type === 'image/webp' ? Object.assign(new Blob([cover, u8.subarray(end)], { type: 'image/webp' }), { enc: blob.enc }) : blob;
    } catch (e) { return blob; }
  }

  /* ---- UI: #btn-save = snapshot / download, $('io') = paste a file or type to roll back (Android: tap opens a file picker) ----
     No clipboard formats: files only. 1st click: dump -> this.lastW (a checkpoint), 2nd click: download that checkpoint
     as bw_<name>.webp; the next click takes a fresh one. Typing any text into ⇅ restores lastW.
     hooks: dump() -> Promise<{blob, name}|null> (also saves locally), import(buf) (a file carrying world data), msg(text), done(), asking() -> bool */
  lastW = null;   // { blob, name, got: downloaded already }
  coarse() { return matchMedia('(pointer: coarse)').matches; }
  onUI(hooks) {
    this.hooks = hooks;
    const io = document.getElementById('io'), btn = document.getElementById('btn-save'), stop = (e) => e.stopPropagation(), B = this;
    // Persistent hidden file input (Firefox wants it in the document); opened synchronously inside the tap's activation
    const pick = Object.assign(document.createElement('input'), { type: 'file', accept: c_BW.pickAccept, hidden: true });
    document.body.append(pick);
    gg.ev(pick, { change() { const f = [...this.files]; this.value = ''; if (f.length) B.paste(f); } });
    if (this.coarse()) Object.assign(io, { readOnly: true, inputMode: 'none' });   // no soft keyboard on touch
    gg.ev(btn, { async click(e) { if (e.target === io) return; if (hooks.asking?.()) return pick.click(); await B.share(); } });   // asking: the button picks a file instead
    gg.ev(io, {
      click: stop, keydown: stop,
      focus() { if (!B.coarse()) return; pick.click(); this.blur(); },
      input() { if (!this.value) return; this.value = ''; B.rollback(); },
      paste(e) { e.preventDefault(); e.stopPropagation(); B.paste([...(e.clipboardData?.files || [])]); },
    });
  }
  shake(el = document.getElementById('btn-save')) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true }); }
  kb(r) { return `${(r.blob.size / 1024).toFixed(0)} KB${r.blob.enc && r.blob.enc !== c_BW.enc ? ' ' + r.blob.enc : ''}`; }
  told(text) { this.hooks.msg(text); this.shake(); return this.hooks.done?.(); }
  async share() {
    const W = this.lastW;
    if (W && !W.got) { W.got = true; return this.download(W); }
    const r = await this.hooks.dump(); if (!r) return;
    this.lastW = { ...r, got: false };
    return this.told(`Checkpoint (${this.kb(r)}) · click again to download · type in ⇅ to roll back`);
  }
  async download(r) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await this.stamp(r.blob)), download: c_BW.prefix + r.name + c_BW.ext });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
    return this.told(`World downloaded (${this.kb(r)}) · ${a.download}`);
  }
  async rollback() {
    if (!this.lastW) return this.hooks.msg('No checkpoint yet — click Share first');
    return this.hooks.import(await this.lastW.blob.arrayBuffer());
  }
  // Pasted / picked files: the smallest one carrying a payload wins (re-encoded copies of the cover are skipped by has())
  async paste(files) {
    const hooks = this.hooks;
    try {
      let buf = null;
      for (const f of [...files].sort((a, b) => a.size - b.size)) if (f.type === 'image/webp' || !f.type) { const b = await f.arrayBuffer(); if (this.has(b)) { buf = b; break; } }
      if (!buf) return hooks.msg(files.length ? 'This file has no world data' : 'Paste a world file (bw_….webp)');
      return hooks.import(buf);
    } catch (err) { hooks.msg('Import failed: ' + err.message); }
  }
});
Object.assign(gg, { c_BW });
})();
