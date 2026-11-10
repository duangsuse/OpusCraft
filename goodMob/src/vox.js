// Minimal MagicaVoxel .vox reader: first model only. Layer = palette index.
import { Grid, hex, ramp } from './grid.js';

export function parseVox(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (u8.length < 8 || tag(0) !== 'VOX ') throw new Error('not a MagicaVoxel .vox file');

  const models = [];
  let size = null, palette = null, o = 8;
  while (o + 12 <= u8.length) {
    const id = tag(o), content = dv.getInt32(o + 4, true), d = o + 12;
    if (id === 'SIZE') size = [dv.getInt32(d, true), dv.getInt32(d + 4, true), dv.getInt32(d + 8, true)];
    else if (id === 'XYZI') {
      const n = dv.getInt32(d, true), vox = new Uint8Array(buf, d + 4, n * 4);
      models.push({ size, vox });
    } else if (id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) palette.push(hex(u8[d + i * 4], u8[d + i * 4 + 1], u8[d + i * 4 + 2]));
    }
    o = d + content;   // children (MAIN) follow immediately, so only skip content
  }
  if (!models.length) throw new Error('.vox contains no voxels');

  const { size: sz, vox } = models[0];
  const warnings = [];
  if (models.length > 1) warnings.push(`.vox has ${models.length} models; only the first is loaded`);
  if (!palette) warnings.push('.vox has no RGBA chunk; using a hue ramp');
  const colorOf = i => palette ? palette[i - 1] : ramp(i);

  // Palette index i (1..255) -> layer; compacted to the indices actually used.
  const used = new Map(), layers = [];
  const grid = new Grid([0, 0, 0], sz, layers);
  for (let k = 0; k < vox.length; k += 4) {
    const ci = vox[k + 3];
    let layer = used.get(ci);
    if (!layer) {
      layers.push({ name: `p${ci}`, color: colorOf(ci) });
      layer = layers.length;
      used.set(ci, layer);
    }
    grid.data[grid.index(vox[k], vox[k + 1], vox[k + 2])] = layer;
  }
  return { grid, warnings };
}
