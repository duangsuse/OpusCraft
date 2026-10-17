/* bwebp.js — world snapshot as an image file. Shares window.gg (see index.html).
   File = <cover image bytes (webp; png where the browser can't encode webp; may be empty)> <payload>
   Image decoders stop at the RIFF size / PNG IEND, so the payload rides along unseen.
   payload = records, each  "\b" + decimal byteLength + ":" + bytes
     record 0      UTF-8 JSON head { v: 3, enc, order: 'yzx', cols: [names], n, tiles: [[chunk, yzx index, tile]], cover: {w, h}, …game head }
     record 1..k   the c_BW.cols columns, compressed with head.enc ('gzip' | 'raw' for the synchronous unload save)
   Columns (YZX order: y outermost, then z, x fastest — layers compress well):
     xz      Int32 cx, cz per chunk           bio  Uint8 256 per chunk (z, x)
     b, m    per chunk  [palette size-1 (u8)] [palette (u8…)] [indices bit-packed LSB-first, ceil(log2 size) bits each]
   Only v3 loads. Wired directly to the live game: this.world = gg.world, this.head = gg.Save.head(); UI: $('io') + #btn-save. */
(() => {
'use strict';
const c_BW = {
  v: 3, enc: 'gzip', order: 'yzx', mark: 8 /* '\b' */, sep: 58 /* ':' */, ext: '.webp',
  // Columns in file order: [name, encode(chunks) -> Uint8Array, decode(bytes, chunks)]; 'xz' creates the chunks
  cols: [
    ['xz', (cs) => new Uint8Array(Int32Array.from(cs.flatMap(c => [c.cx, c.cz])).buffer), null],
    ['b', (cs) => bwebp.packAll(cs, 'blocks'), (u8, cs) => bwebp.unpackAll(u8, cs, 'blocks')],
    ['m', (cs) => bwebp.packAll(cs, 'meta'), (u8, cs) => bwebp.unpackAll(u8, cs, 'meta')],
    ['bio', (cs) => bwebp.zx(cs), (u8, cs) => bwebp.unzx(u8, cs)],
  ],
  clipType: 'web image/webp',   // web custom format: not re-encoded by the browser, so the payload survives copy/paste
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
  // End of the cover image = start of the payload; type = cover mime
  split(u8) {
    const s4 = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (u8[0] === c_BW.mark) return { end: 0, type: '' };
    if (s4(0) === 'RIFF' && s4(8) === 'WEBP') { const n = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true); return { end: 8 + n + (n & 1), type: 'image/webp' }; }
    if (u8[0] === 0x89 && s4(1).startsWith('PNG')) {
      const dv = new DataView(u8.buffer, u8.byteOffset);
      for (let p = 8; p + 8 <= u8.length;) { const n = dv.getUint32(p), t = s4(p + 4); p += 12 + n; if (t === 'IEND') return { end: p, type: 'image/png' }; }
    }
    return { end: -1, type: '' };
  }
  has(buf) { const u8 = new Uint8Array(buf), { end } = this.split(u8); return end >= 0 && u8[end] === c_BW.mark; }
  headOf(u8) {
    const { end } = this.split(u8); if (end < 0 || u8[end] !== c_BW.mark) throw new Error('no world data in this image');
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
  fill(head, arrays) {
    const xz = new Int32Array(arrays[0].slice().buffer), cs = Array.from({ length: head.n }, (_, k) => new gg.Chunk(xz[2 * k], xz[2 * k + 1]));
    c_BW.cols.forEach(([, , de], j) => de?.(arrays[j], cs));
    for (const [k, i, t] of head.tiles) cs[k].tiles.set(this.native(i), t);
    for (const c of cs) { c.recomputeHeights(); c.state = gg.CH_DECORATED; c.modified = true; this.world.stored.set(c.key, c); }
  }

  // ---- dump / load ----
  // cover: Blob | null; coverWH: {w, h} for the title preview fit test
  async dump(cover, coverWH) {
    const { head, arrays } = this.columns(c_BW.enc); head.cover = coverWH || null;
    const z = await Promise.all(arrays.map(a => pipe(a, CompressionStream, c_BW.enc)));
    return new Blob([cover || new Uint8Array(0), ...this.record(te.encode(JSON.stringify(head))), ...z.flatMap(a => this.record(a))], { type: cover?.type || 'image/webp' });
  }
  // Synchronous variant for page unload (no compression available): palette/bit-packed columns, uncompressed
  dumpSync(coverU8, coverWH) {
    const { head, arrays } = this.columns('raw'); head.cover = coverWH || null;
    return cat([coverU8 || new Uint8Array(0), ...this.record(te.encode(JSON.stringify(head))), ...arrays.flatMap(a => this.record(a))]);
  }
  // Cover only (title preview): { w, h, url } or null — no inflate
  cover(buf) {
    const u8 = new Uint8Array(buf), { end, type } = this.split(u8);
    if (end <= 0) return null;
    const { head } = this.headOf(u8);
    return head.cover ? { ...head.cover, url: URL.createObjectURL(new Blob([u8.subarray(0, end)], { type })) } : null;
  }
  // -> { ...head, shot, coverU8, coverBlob, file (the original bytes), fill() }
  async load(buf) {
    const u8 = new Uint8Array(buf), { head, it } = this.headOf(u8), raw = [...it], { end, type } = this.split(u8);
    const arrays = head.enc === 'raw' ? raw : await Promise.all(raw.map(a => pipe(a, DecompressionStream, head.enc)));
    const coverU8 = end > 0 ? u8.slice(0, end) : null;
    return { ...head, shot: this.cover(u8), coverU8, coverBlob: coverU8 && new Blob([coverU8], { type }), file: u8, fill: () => this.fill(head, arrays) };
  }

  // ---- UI: #btn-save shares/copies the image, $('io') takes a pasted image (Android: tap opens a file picker) ----
  // hooks: dump() -> Promise<{blob, name}|null> (also saves locally), import(buf) (a file carrying world data), msg(text), done()
  coarse() { return matchMedia('(pointer: coarse)').matches; }
  onUI(hooks) {
    this.hooks = hooks;
    const io = document.getElementById('io'), btn = document.getElementById('btn-save'), stop = (e) => e.stopPropagation(), B = this;
    // Persistent hidden file input (Firefox wants it in the document); opened synchronously inside the tap's activation
    const pick = Object.assign(document.createElement('input'), { type: 'file', accept: c_BW.pickAccept, hidden: true });
    document.body.append(pick);
    gg.ev(pick, { change() { const f = [...this.files]; this.value = ''; if (f.length) B.paste(f); } });
    if (this.coarse()) Object.assign(io, { readOnly: true, inputMode: 'none' });   // no soft keyboard on touch
    gg.ev(btn, { async click(e) { if (e.target === io) return; await B.share(); } });
    gg.ev(io, {
      click: stop, keydown: stop,
      focus() { if (!B.coarse()) return; pick.click(); this.blur(); },
      paste(e) { e.preventDefault(); e.stopPropagation(); B.paste([...(e.clipboardData?.files || [])]); },
    });
  }
  shake(el = document.getElementById('btn-save')) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true }); }
  copied(text) { this.hooks.msg(text); this.shake(); return this.hooks.done?.(); }
  // Touch devices (Android): system share sheet with the file (bytes untouched). Desktop: clipboard with the lossless
  // web custom format + a plain PNG of the cover for other apps. Last resort: download.
  async share() {
    const hooks = this.hooks;
    if (!this.coarse() && navigator.clipboard?.write && window.ClipboardItem) {
      // ClipboardItem with promises keeps the click's user activation while the world is encoded
      const got = hooks.dump(), blobP = got.then(r => { if (!r) throw new Error('no world'); return r.blob; });
      const pngP = blobP.then(b => this.png(b));
      try {
        await navigator.clipboard.write([new ClipboardItem({ [c_BW.clipType]: blobP, 'image/png': pngP })]);
        return this.copied('World saved · image copied — paste it into ⇅ to import');
      } catch (err) {
        const r = await got.catch(() => null); if (!r) return;
        return this.fallback(r, err);
      }
    }
    const r = await hooks.dump(); if (!r) return;
    const file = new File([r.blob], r.name + c_BW.ext, { type: r.blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: r.name }); return this.copied('World saved · image shared'); }
      catch (err) { if (err.name === 'AbortError') return hooks.done?.(); }
    }
    return this.fallback(r);
  }
  async fallback(r, err) {
    const hooks = this.hooks;
    try { await navigator.clipboard.write([new ClipboardItem({ [c_BW.clipType]: r.blob })]); return this.copied('World saved · image copied'); } catch (e) { err ??= e; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(r.blob), download: r.name + c_BW.ext });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
    hooks.msg('World saved · clipboard unavailable (' + (err?.message || 'blocked') + '), image downloaded'); hooks.done?.();
  }
  async png(blob) {
    const u8 = new Uint8Array(await blob.arrayBuffer()), { end, type } = this.split(u8);
    const bm = await createImageBitmap(new Blob([u8.subarray(0, Math.max(0, end))], { type }));
    const c = Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height }); c.getContext('2d').drawImage(bm, 0, 0);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  /* Pasted files: only an original file keeps its tail. Wayland clipboards also offer re-encoded copies (a multi-MB PNG
     of the cover, no payload) — those are skipped by has(); the smallest file carrying a payload wins. Then the lossless
     clipboard format. */
  async paste(files) {
    const hooks = this.hooks;
    try {
      let buf = null;
      for (const f of [...files].sort((a, b) => a.size - b.size)) if (f.type.startsWith('image/') || !f.type) { const b = await f.arrayBuffer(); if (this.has(b)) { buf = b; break; } }
      if (!buf && navigator.clipboard?.read) {
        try { for (const it of await navigator.clipboard.read()) if (it.types.includes(c_BW.clipType)) { buf = await (await it.getType(c_BW.clipType)).arrayBuffer(); break; } }
        catch (e) { /* permission denied / unsupported */ }
      }
      if (!buf) return hooks.msg(files.length ? 'This image has no world data (re-encoded by the copy?)' : 'Paste a world image (from Share)');
      return hooks.import(buf);
    } catch (err) { hooks.msg('Import failed: ' + err.message); }
  }
});
Object.assign(gg, { c_BW });
})();
