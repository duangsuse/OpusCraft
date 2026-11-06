// Tiny dependency-free PNG encoder for previewing procedurally generated textures in Node.
// Usage: import { writePNG, sheet } from './tools/png.mjs';
//   writePNG('/tmp/x.png', width, height, rgbaUint8Array, scale=1)
//   sheet(list of {w,h,data,label?}, cols, scale, pad, bg) -> {w,h,data}  (packs images into a grid)
import fs from 'node:fs';
import zlib from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export function scaleUp(w, h, rgba, s) {
  if (s === 1) return { w, h, data: rgba };
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const si = ((y / s | 0) * w + (x / s | 0)) * 4, di = (y * w * s + x) * 4;
    out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
  }
  return { w: w * s, h: h * s, data: out };
}
export function writePNG(file, w, h, rgba, scale = 1) {
  const s = scaleUp(w, h, rgba, scale);
  fs.writeFileSync(file, encodePNG(s.w, s.h, s.data));
}
// Pack images into a grid sheet; transparent areas are shown over a checkerboard-ish background color.
export function sheet(images, cols = 16, scale = 4, pad = 2, bg = [40, 40, 48, 255]) {
  const cw = Math.max(...images.map(i => i.w)) * scale + pad, ch = Math.max(...images.map(i => i.h)) * scale + pad;
  const rows = Math.ceil(images.length / cols);
  const W = cols * cw + pad, H = rows * ch + pad;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set(bg, i * 4);
  images.forEach((img, k) => {
    const ox = pad + (k % cols) * cw, oy = pad + Math.floor(k / cols) * ch;
    for (let y = 0; y < img.h * scale; y++) for (let x = 0; x < img.w * scale; x++) {
      const si = ((y / scale | 0) * img.w + (x / scale | 0)) * 4, di = ((oy + y) * W + ox + x) * 4;
      const a = img.data[si + 3] / 255;
      for (let c = 0; c < 3; c++) out[di + c] = img.data[si + c] * a + out[di + c] * (1 - a);
    }
  });
  return { w: W, h: H, data: out };
}
