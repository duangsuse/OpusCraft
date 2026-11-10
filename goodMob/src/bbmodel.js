// Blockbench .bbmodel -> Grid. 1 Blockbench unit = 1 voxel. Layer = nearest outliner group name.
// Blockbench is y-up with north = -z; authoring frame is z-up with forward = +y:  (x,y,z)_bb -> (x,-z,y).
import { GridBuilder, ramp } from './grid.js';

const rad = d => d * Math.PI / 180;

// Euler 'ZYX' (three.js convention: R = Rz * Ry * Rx), returned as row-major 3x3.
function eulerZYX([rx, ry, rz]) {
  const [a, b, c] = [Math.cos(rad(rx)), Math.cos(rad(ry)), Math.cos(rad(rz))];
  const [d, e, f] = [Math.sin(rad(rx)), Math.sin(rad(ry)), Math.sin(rad(rz))];
  return [
    [c * b, c * e * d - f * a, c * e * a + f * d],
    [f * b, f * e * d + c * a, f * e * a - c * d],
    [-e, b * d, b * a],
  ];
}

export function parseBbmodel(json) {
  const bb = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(bb.elements)) throw new Error('not a .bbmodel (no elements[])');

  const warnings = [], groupOf = new Map();
  const walk = (nodes, group) => {
    for (const n of nodes || []) {
      if (typeof n === 'string') groupOf.set(n, group);
      else {
        if (n.rotation && n.rotation.some(v => v)) warnings.push(`group "${n.name}" has a rotation; it is ignored (only per-cube rotation is voxelised)`);
        walk(n.children, n.name || group);
      }
    }
  };
  walk(bb.outliner, 'root');

  const b = new GridBuilder();
  let skipped = 0;
  for (const el of bb.elements) {
    if ((el.type || 'cube') !== 'cube') { skipped++; continue; }
    const layer = b.layer(groupOf.get(el.uuid) || 'root');
    const from = el.from, to = el.to, rot = el.rotation || [0, 0, 0], org = el.origin || [0, 0, 0];

    // bb-space integer cells (i,j,k) -> authoring cell (i, -k-1, j)
    const put = (i, j, k) => b.set(layer, i, -k - 1, j);

    if (!rot.some(v => v)) {
      const lo = from.map(Math.round), hi = to.map((v, i) => Math.max(Math.round(v), lo[i] + 1));
      for (let k = lo[2]; k < hi[2]; k++) for (let j = lo[1]; j < hi[1]; j++) for (let i = lo[0]; i < hi[0]; i++) put(i, j, k);
      continue;
    }

    // Rotated cube: sample cell centres against the un-rotated box in its local frame.
    const R = eulerZYX(rot);
    const corners = [];
    for (const x of [from[0], to[0]]) for (const y of [from[1], to[1]]) for (const z of [from[2], to[2]]) {
      const p = [x - org[0], y - org[1], z - org[2]];
      corners.push(R.map(r => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]).map((v, i) => v + org[i]));
    }
    const lo = [0, 1, 2].map(i => Math.floor(Math.min(...corners.map(c => c[i])))), hi = [0, 1, 2].map(i => Math.ceil(Math.max(...corners.map(c => c[i]))));
    const mid = [0, 1, 2].map(i => (from[i] + to[i]) / 2), half = [0, 1, 2].map(i => Math.max((to[i] - from[i]) / 2, 0.5));
    for (let k = lo[2]; k < hi[2]; k++) for (let j = lo[1]; j < hi[1]; j++) for (let i = lo[0]; i < hi[0]; i++) {
      const p = [i + 0.5 - org[0], j + 0.5 - org[1], k + 0.5 - org[2]];
      // inverse rotation = transpose
      const q = [0, 1, 2].map(c => R[0][c] * p[0] + R[1][c] * p[1] + R[2][c] * p[2] + org[c]);
      if ([0, 1, 2].every(c => Math.abs(q[c] - mid[c]) <= half[c])) put(i, j, k);
    }
  }
  if (skipped) warnings.push(`${skipped} non-cube element(s) skipped`);
  if (!b.cells.size) throw new Error('no cubes in .bbmodel');
  b.layers.forEach((l, i) => { l.color = ramp(i); });
  return { grid: b.build(), warnings };
}
