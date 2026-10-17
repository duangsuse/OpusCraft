/* bwebp.js — world snapshot as an image file. Shares window.gg (see index.html).
   File = <cover image bytes (webp; png where the browser can't encode webp; may be empty)> <payload>
   Image decoders stop at the RIFF size / PNG IEND, so the payload rides along unseen.
   payload = records, each  "\b" + decimal byteLength + ":" + bytes
     record 0      UTF-8 JSON head { v: 2, enc, soa: [[name, type, perChunk]…], n, tiles, cover: {w, h}, …caller head }
     record 1..k   SoA arrays in head.soa order (little-endian typed-array bytes), deflate-raw when head.enc says so
   Connected only to: world (dump/fill), $('io') (paste an image to import) and #btn-save (share / copy image).
   The world format will change: everything chunk-shaped lives in c_BW.soa + dump/fill below. */
(() => {
'use strict';
const c_BW = {
  v: 2, enc: 'deflate-raw', mark: 8 /* '\b' */, sep: 58 /* ':' */, ext: '.webp',
  // SoA columns: [name, typed array, elements per chunk, chunk property (null = cx/cz scalar)]
  soa: () => [
    ['cx', Int32Array, 1, 'cx'], ['cz', Int32Array, 1, 'cz'],
    ['b', Uint8Array, gg.CHUNK_VOL, 'blocks'], ['m', Uint8Array, gg.CHUNK_VOL, 'meta'],
    ['bio', Uint8Array, gg.CHUNK_W * gg.CHUNK_W, 'biomes'],
  ],
  types: { Int32Array, Uint8Array, Uint16Array, Float32Array },
  clipType: 'web image/webp',   // web custom format: not re-encoded by the browser, so the payload survives copy/paste
};
const te = new TextEncoder(), td = new TextDecoder();
const pipe = (u8, T) => new Response(new Blob([u8]).stream().pipeThrough(new T(c_BW.enc))).arrayBuffer().then(b => new Uint8Array(b));

const bwebp = gg.my(class bwebp {
  // ---- framing ----
  static record(u8) { return [te.encode('\b' + u8.byteLength + ':'), u8]; }
  static *records(u8, at) {
    while (at < u8.length && u8[at] === c_BW.mark) {
      let p = at + 1, n = 0;
      while (u8[p] !== c_BW.sep) { if (p >= u8.length || u8[p] < 48 || u8[p] > 57) throw new Error('bwebp: bad length'); n = n * 10 + u8[p++] - 48; }
      yield u8.subarray(p + 1, p + 1 + n); at = p + 1 + n;
    }
  }
  // End of the cover image = start of the payload; type = cover mime
  static split(u8) {
    const s4 = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (u8[0] === c_BW.mark) return { end: 0, type: '' };
    if (s4(0) === 'RIFF' && s4(8) === 'WEBP') { const n = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true); return { end: 8 + n + (n & 1), type: 'image/webp' }; }
    if (u8[0] === 0x89 && s4(1).startsWith('PNG')) {
      const dv = new DataView(u8.buffer, u8.byteOffset);
      for (let p = 8; p + 8 <= u8.length;) { const n = dv.getUint32(p), t = s4(p + 4); p += 12 + n; if (t === 'IEND') return { end: p, type: 'image/png' }; }
    }
    return { end: -1, type: '' };
  }
  static has(buf) { const u8 = new Uint8Array(buf), { end } = this.split(u8); return end >= 0 && u8[end] === c_BW.mark; }
  static headOf(u8) { const { end } = this.split(u8); if (end < 0 || u8[end] !== c_BW.mark) throw new Error('no world data in this image'); const it = this.records(u8, end); return { head: JSON.parse(td.decode(it.next().value)), it }; }

  // ---- world <-> SoA ----
  static columns(world, head) {
    const cs = [...world.chunks.values()].filter(c => c.modified).concat([...world.stored.values()]), n = cs.length;
    const cols = c_BW.soa().map(([name, T, per, prop]) => {
      const a = new T(n * per);
      cs.forEach((c, k) => per === 1 ? (a[k] = c[prop]) : a.set(c[prop], k * per));
      return [name, T.name, per, a];
    });
    const tiles = cs.flatMap((c, k) => [...c.tiles].map(([i, t]) => [k, i, t]));
    return { head: { ...head, v: c_BW.v, n, tiles, soa: cols.map(c => c.slice(0, 3)) }, arrays: cols.map(c => new Uint8Array(c[3].buffer)) };
  }
  static fill(world, head, arrays) {
    const col = Object.fromEntries(head.soa.map(([name, type], j) => [name, new c_BW.types[type](arrays[j].slice().buffer)]));
    const per = Object.fromEntries(head.soa.map(([name, , p]) => [name, p]));
    const props = c_BW.soa().filter(s => s[2] > 1 && col[s[0]]);
    const cs = Array.from({ length: head.n }, (_, k) => {
      const c = new gg.Chunk(col.cx[k], col.cz[k]);
      for (const [name, , , prop] of props) c[prop].set(col[name].subarray(k * per[name], (k + 1) * per[name]));
      return c;
    });
    for (const [k, i, t] of head.tiles || []) cs[k].tiles.set(i, t);
    for (const c of cs) { c.recomputeHeights(); c.state = gg.CH_DECORATED; c.modified = true; world.stored.set(c.key, c); }
  }

  // ---- dump / load ----
  // head: plain JSON (seed, player…); cover: Blob | ArrayBuffer | null; coverWH: {w, h} for the title preview fit test
  static async dump(world, head, cover, coverWH) {
    const { head: h, arrays } = this.columns(world, { ...head, cover: coverWH || null, enc: c_BW.enc });
    const z = await Promise.all(arrays.map(a => pipe(a, CompressionStream)));
    return new Blob([cover || new Uint8Array(0), ...this.record(te.encode(JSON.stringify(h))), ...z.flatMap(a => this.record(a))], { type: cover?.type || 'image/webp' });
  }
  // Synchronous variant for page unload (no compression available): raw columns
  static dumpSync(world, head, coverU8, coverWH) {
    const { head: h, arrays } = this.columns(world, { ...head, cover: coverWH || null, enc: 'raw' });
    const parts = [coverU8 || new Uint8Array(0), ...this.record(te.encode(JSON.stringify(h))), ...arrays.flatMap(a => this.record(a))];
    const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0)); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.byteLength; }
    return out;
  }
  // Cover only (title preview): { w, h, url } or null — no inflate
  static cover(buf) {
    const u8 = new Uint8Array(buf), { end, type } = this.split(u8);
    if (end <= 0) return null;
    const { head } = this.headOf(u8);
    return head.cover ? { ...head.cover, url: URL.createObjectURL(new Blob([u8.subarray(0, end)], { type })) } : null;
  }
  // -> { ...head, shot, coverU8, coverBlob, fill(world) }
  static async load(buf) {
    const u8 = new Uint8Array(buf), { head, it } = this.headOf(u8), raw = [...it], { end, type } = this.split(u8);
    const arrays = head.enc === 'raw' ? raw : await Promise.all(raw.map(a => pipe(a, DecompressionStream)));
    const coverU8 = end > 0 ? u8.slice(0, end) : null;
    return { ...head, shot: this.cover(u8), coverU8, coverBlob: coverU8 && new Blob([coverU8], { type }), fill: (world) => this.fill(world, head, arrays) };
  }

  // ---- base64 for localStorage ----
  static b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  static unb64(s) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

  // ---- UI: #btn-save shares/copies the image, $('io') takes a pasted image ----
  // hooks: dump() -> Promise<{blob, name}|null> (also saves locally), load(data) -> bool, msg(text), done()
  static onUI(hooks) {
    const io = document.getElementById('io'), stop = (e) => e.stopPropagation();
    gg.ev(document.getElementById('btn-save'), { async click(e) { if (e.target === io) return; await bwebp.share(hooks); } });
    gg.ev(io, {
      click: stop, keydown: stop,
      paste(e) { e.preventDefault(); e.stopPropagation(); bwebp.paste([...(e.clipboardData?.files || [])], hooks); },
    });
  }
  // Touch devices (Android): system share sheet with the file (bytes untouched). Desktop: clipboard with the lossless
  // web custom format + a plain PNG of the cover for other apps. Last resort: download.
  static async share(hooks) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!coarse && navigator.clipboard?.write && window.ClipboardItem) {
      // ClipboardItem with promises keeps the click's user activation while the world is encoded
      const got = hooks.dump(), blobP = got.then(r => { if (!r) throw new Error('no world'); return r.blob; });
      const pngP = blobP.then(b => this.png(b));
      try {
        await navigator.clipboard.write([new ClipboardItem({ [c_BW.clipType]: blobP, 'image/png': pngP })]);
        hooks.msg('World saved · image copied — paste it into ⇅ to import'); return hooks.done?.();
      } catch (err) {
        const r = await got.catch(() => null); if (!r) return;
        return this.fallback(r, hooks, err);
      }
    }
    const r = await hooks.dump(); if (!r) return;
    const file = new File([r.blob], r.name + c_BW.ext, { type: r.blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: r.name }); hooks.msg('World saved · image shared'); return hooks.done?.(); }
      catch (err) { if (err.name === 'AbortError') return hooks.done?.(); }
    }
    return this.fallback(r, hooks);
  }
  static async fallback(r, hooks, err) {
    try { await navigator.clipboard.write([new ClipboardItem({ [c_BW.clipType]: r.blob })]); hooks.msg('World saved · image copied'); return hooks.done?.(); } catch (e) { err ??= e; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(r.blob), download: r.name + c_BW.ext });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
    hooks.msg('World saved · clipboard unavailable (' + (err?.message || 'blocked') + '), image downloaded'); hooks.done?.();
  }
  static async png(blob) {
    const u8 = new Uint8Array(await blob.arrayBuffer()), { end, type } = this.split(u8);
    const bm = await createImageBitmap(new Blob([u8.subarray(0, Math.max(0, end))], { type }));
    const c = Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height }); c.getContext('2d').drawImage(bm, 0, 0);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  // Pasted files first (an original image file keeps its tail), then the lossless clipboard format
  static async paste(files, hooks) {
    try {
      let buf = null;
      for (const f of files) if (f.type.startsWith('image/') || !f.type) { const b = await f.arrayBuffer(); if (this.has(b)) { buf = b; break; } }
      if (!buf && navigator.clipboard?.read) {
        try { for (const it of await navigator.clipboard.read()) if (it.types.includes(c_BW.clipType)) { buf = await (await it.getType(c_BW.clipType)).arrayBuffer(); break; } }
        catch (e) { /* permission denied / unsupported */ }
      }
      if (!buf) return hooks.msg(files.length ? 'This image has no world data (re-encoded by the copy?)' : 'Paste a world image (from Share)');
      if (hooks.load(await this.load(buf))) hooks.done?.();
    } catch (err) { hooks.msg('Import failed: ' + err.message); }
  }
});
Object.assign(gg, { c_BW });
})();
