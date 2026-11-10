export const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

// Distinct fallback colour for layer i (HSL s=.55 l=.5 -> hex).
export function ramp(i) {
  const h = ((i * 47) % 360) / 60, c = 0.5 * 0.55, x = c * (1 - Math.abs((h % 2) - 1)), m = 0.5 - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h)];
  return hex(...[r, g, b].map(v => Math.round((v + m) * 255)));
}

// Authoring frame everywhere in this project: x right, y forward, z up, 1 voxel = 1 unit.
// (Same as MagicaVoxel and reference-mobs/ref1.py.) Layer index 0 = empty; layers[i-1] describes index i.

export class Grid {
  constructor(min, size, layers) {
    this.min = min;                       // world coord of local voxel (0,0,0)
    this.size = size;                     // [sx, sy, sz]
    this.layers = layers;                 // [{ name, color? }]
    this.data = new Uint16Array(size[0] * size[1] * size[2]);
  }
  index(x, y, z) { return x + this.size[0] * (y + this.size[1] * z); }
}

const OFF = 512, W = 1024;
const key = (x, y, z) => (x + OFF) + W * ((y + OFF) + W * (z + OFF));

// Sparse builder: later writes overwrite earlier ones, so order = layer priority.
export class GridBuilder {
  constructor() {
    this.layers = [];
    this.ids = new Map();
    this.cells = new Map();
    this.lo = [Infinity, Infinity, Infinity];
    this.hi = [-Infinity, -Infinity, -Infinity];
  }

  layer(name, color) {
    let id = this.ids.get(name);
    if (id === undefined) {
      this.layers.push({ name, color });
      id = this.layers.length;
      this.ids.set(name, id);
    }
    return id;
  }

  set(layer, x, y, z) {
    if (Math.abs(x) >= OFF || Math.abs(y) >= OFF || Math.abs(z) >= OFF) throw new RangeError(`voxel ${x},${y},${z} out of range`);
    this.cells.set(key(x, y, z), typeof layer === 'number' ? layer : this.layer(layer));
    if (x < this.lo[0]) this.lo[0] = x; if (x > this.hi[0]) this.hi[0] = x;
    if (y < this.lo[1]) this.lo[1] = y; if (y > this.hi[1]) this.hi[1] = y;
    if (z < this.lo[2]) this.lo[2] = z; if (z > this.hi[2]) this.hi[2] = z;
  }

  // Half-open integer box [min, max).
  box(layer, [x0, y0, z0], [x1, y1, z1]) {
    const id = typeof layer === 'number' ? layer : this.layer(layer);
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) this.set(id, x, y, z);
  }

  // Box plus its mirror across x = 0 (give the +x side).
  boxM(layer, min, max) {
    this.box(layer, min, max);
    this.box(layer, [-max[0], min[1], min[2]], [-min[0], max[1], max[2]]);
  }

  build() {
    if (!this.cells.size) throw new Error('empty model');
    const min = this.lo.slice();
    const size = [this.hi[0] - min[0] + 1, this.hi[1] - min[1] + 1, this.hi[2] - min[2] + 1];
    const grid = new Grid(min, size, this.layers);
    for (const [k, id] of this.cells) {
      const x = (k % W) - OFF, y = (Math.floor(k / W) % W) - OFF, z = Math.floor(k / (W * W)) - OFF;
      grid.data[grid.index(x - min[0], y - min[1], z - min[2])] = id;
    }
    return grid;
  }
}
