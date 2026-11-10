// Worker `parse` result (canonical SVOX header + voxel list) -> { grid, data } in the authoring frame.
// Every SVOX colour id becomes a layer of the same name; every `material` line becomes a material shared by its colours.
import { Grid } from './grid.js';
import { newData } from './svox.js';
import { parseProps, hex6 } from './svoxprops.js';

export function importSvox({ header, size, voxels, ids }) {
  const data = newData();
  data.materials = {};
  data.textures = [];

  const colors = new Map();                     // colour id -> { hex, material }
  let section = '', mat = null, n = 0;
  for (const raw of header.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const word = line.split(/\s+/, 1)[0];
    if (word === 'model') { section = 'model'; continue; }
    if (word === 'texture') { const p = parseProps(line.slice(word.length)); if (p.id) data.textures.push(p.id); section = ''; continue; }
    if (word === 'light') { data.lights.push({ props: parseProps(line.slice(word.length)) }); section = ''; continue; }
    if (word === 'group') { data.groups.push({ props: parseProps(line.slice(word.length)) }); section = ''; continue; }
    const addColors = text => {
      for (const m of text.matchAll(/([A-Za-z]+)(?:\(\d+\))?:(#[0-9A-Fa-f]{3,6})/g)) colors.set(m[1], { hex: hex6(m[2]) || '#888888', material: mat.id });
    };
    if (word === 'material') {
      const props = parseProps(line.slice(word.length));
      mat = { id: `m${++n}` };
      if (props.colors) { addColors(props.colors); delete props.colors; }   // a material without other props has `colors` on its own line
      data.materials[mat.id] = { name: '', props };
      section = 'material';
      continue;
    }
    if (word === 'colors' && mat) { addColors(line); continue; }
    if (section === 'model') {
      const k = word.toLowerCase();
      if (k !== 'size') data.model.props = { ...data.model.props, ...parseProps(line) };
    }
  }

  // material names: its SVOX group, else its colour ids; made unique
  const taken = new Set();
  for (const [id, m] of Object.entries(data.materials)) {
    const base = m.props.group || colorsOf(id).slice(0, 3).join(' ') || 'Material';
    let name = base, i = 2;
    while (taken.has(name)) name = `${base} ${i++}`;
    taken.add(name);
    m.name = name;
  }
  function colorsOf(id) { return [...colors].filter(([, c]) => c.material === id).map(([k]) => k); }

  data.defaultMaterial = Object.keys(data.materials)[0] || 'm1';
  if (!Object.keys(data.materials).length) data.materials.m1 = { name: 'Flat clay', props: { type: 'lambert', lighting: 'flat' } };

  // layers: every declared colour (unused ones too: `shell` and `atvoxel` refer to them)
  for (const [cid, c] of colors) data.layers[cid] = { color: c.hex, material: c.material };

  // svox (x, y up, z back) -> authoring (x, y = sz-1-z forward, z = y up)
  const sx = size.x, sy = size.z, sz = size.y;
  const layers = ids.map(id => ({ name: id, color: colors.get(id)?.hex || '#888888' }));
  const grid = new Grid([0, 0, 0], [sx, sy, sz], layers);
  for (let i = 0; i < voxels.length; i += 4) {
    grid.data[grid.index(voxels[i], sy - 1 - voxels[i + 2], voxels[i + 1])] = voxels[i + 3] + 1;
  }
  return { grid, data };
}
