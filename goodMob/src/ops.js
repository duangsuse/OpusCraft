// "Guide voxel" emitters: each op writes plain integer boxes into a GridBuilder.
// They only decide *where extra voxels go*; Smooth Voxels' per-layer deform then turns the steps into slopes.

// Stacked slabs, 1 voxel tall, slab k shrunk by insets[k] on every side. Mound / hump / pyramid.
//   stack(b, 'hump', [-5,2], [5,10], 23, [0,1,2])  ->  10x8, 8x6, 6x4 slabs on z = 23, 24, 25
export function stack(b, layer, [x0, y0], [x1, y1], z, insets) {
  insets.forEach((s, k) => {
    const [ix, iy] = Array.isArray(s) ? s : [s, s];
    b.box(layer, [x0 + ix, y0 + iy, z + k], [x1 - ix, y1 - iy, z + k + 1]);
  });
}

// Linear taper over the whole length of a box along `axis` (0/1/2): inset 0 at the far end, `amount` voxels
// (rounded per slice, applied on both sides of the two other axes) at the near end (end = +1 max side, -1 min side).
// Tapered leg / head wedge / trapezoid torso. Steps stay 1 voxel; deform turns them into slopes.
//   frustum(b, 'leg', [1,6,2], [7,12,10], 2, -1, 1)   // 6x6 at the top, 4x4 at the bottom
export function frustum(b, layer, min, max, axis, end, amount) {
  const [u, v] = [0, 1, 2].filter(a => a !== axis);
  const L = max[axis] - min[axis];
  for (let i = 0; i < L; i++) {
    const near = end > 0 ? L - 1 - i : i;                  // 0 at the near end
    const s = Math.round(amount * (1 - near / Math.max(1, L - 1)));
    const l = min.slice(), h = max.slice();
    l[axis] = min[axis] + i; h[axis] = l[axis] + 1;
    l[u] += s; h[u] -= s; l[v] += s; h[v] -= s;
    if (h[u] > l[u] && h[v] > l[v]) b.box(layer, l, h);
  }
}

// Stepped polyline of cubes: pts = [[x, y, z, size], ...] (continuous centres, integer-ish size).
// Horn / tail / curved limb. `mirror` also emits the x -> -x copy.
export function chain(b, layer, pts, { mirror = false } = {}) {
  const put = (c, s) => {
    const m = c.map(v => Math.round(v - s / 2));
    (mirror ? b.boxM : b.box).call(b, layer, m, m.map(v => v + s));
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), Math.abs(q[2] - p[2]))));
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      put([0, 1, 2].map(a => p[a] + (q[a] - p[a]) * f), Math.max(1, Math.round(p[3] + (q[3] - p[3]) * f)));
    }
  }
}
