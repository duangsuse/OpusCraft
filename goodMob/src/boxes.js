// Grid -> integer boxes (greedy merge, per layer). Inverse of GridBuilder.box; used to turn .vox into Blockbench cubes.
// Returns [{ layer: name, min: [x,y,z], max: [x,y,z] }] in authoring coordinates (grid.min applied), half-open.
export function gridToBoxes(grid) {
  const [sx, sy, sz] = grid.size, [mx, my, mz] = grid.min, d = grid.data;
  const done = new Uint8Array(d.length), boxes = [];
  const at = (x, y, z) => d[x + sx * (y + sy * z)];
  const free = (x, y, z, l) => at(x, y, z) === l && !done[x + sx * (y + sy * z)];
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    const l = at(x, y, z);
    if (!l || done[x + sx * (y + sy * z)]) continue;
    let x1 = x + 1;
    while (x1 < sx && free(x1, y, z, l)) x1++;
    let y1 = y + 1;
    grow: while (y1 < sy) { for (let i = x; i < x1; i++) if (!free(i, y1, z, l)) break grow; y1++; }
    let z1 = z + 1;
    grow: while (z1 < sz) { for (let j = y; j < y1; j++) for (let i = x; i < x1; i++) if (!free(i, j, z1, l)) break grow; z1++; }
    for (let k = z; k < z1; k++) for (let j = y; j < y1; j++) for (let i = x; i < x1; i++) done[i + sx * (j + sy * k)] = 1;
    boxes.push({ layer: grid.layers[l - 1].name, min: [x + mx, y + my, z + mz], max: [x1 + mx, y1 + my, z1 + mz] });
  }
  return boxes;
}
