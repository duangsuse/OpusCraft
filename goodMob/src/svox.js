// Grid + SVOX project data -> Smooth Voxels model text (https://www.smoothdev.nl/smoothvoxels).
// Authoring frame (x right, y forward, z up) -> SVOX frame (x right, y up, z = back): forward ends up at -z.
//
// Project data (what the Blockbench plugin stores under `goodmob_svox`):
//   materials: { id: { name, props } }     props = SVOX material settings as strings ({ lighting: 'smooth', deform: '3 1 .8' })
//   layers:    { name: { color, material } }  one layer = one colour; layers sharing a material share one `material` line,
//                                             which is what lets `fade` blend between their colours
//   model:     { props }                    model-level settings (scale, ao, shape, clamp, ...)
//   groups:    [ { props } ]                SVOX `group ...` lines, in order (prefabs and clones)
//   lights:    [ { props } ]                SVOX `light ...` lines
//   textures:  [ id ]                       texture ids; every one is backed by the single built-in image
//   overrides: { layer: [[startKey, run]] } per-voxel layer assignments (see the plugin)
import { parseProps, stringifyProps, assignColorIds, MATERIAL_PRESETS } from './svoxprops.js';

export const DEFAULT_PRESET = 'Flat clay';
export const DEFAULT_MATERIAL_PROPS = parseProps(MATERIAL_PRESETS[DEFAULT_PRESET]);

export function newData() {
  return {
    v: 2, bypass: false, wire: false,
    model: { props: {} },
    materials: { m1: { name: DEFAULT_PRESET, props: { ...DEFAULT_MATERIAL_PROPS } } },
    defaultMaterial: 'm1',
    layers: {}, groups: [], lights: [], textures: [], overrides: {},
  };
}

// v1 = { base, styles: { layer: { color, mat } }, bypass, wire, overrides } -> v2. Layers with the same props share a material.
export function dataFromStyles(styles, { base = '', bypass = false, wire = false, overrides = {} } = {}) {
  const d = newData();
  d.bypass = bypass; d.wire = wire; d.overrides = overrides;
  d.materials = {};
  const byKey = new Map();
  for (const [name, st] of Object.entries(styles || {})) {
    const props = parseProps([base, st.mat].filter(s => s && s.trim()).join(', '));
    const k = JSON.stringify(props);
    let id = byKey.get(k);
    if (!id) {
      id = `m${byKey.size + 1}`;
      byKey.set(k, id);
      d.materials[id] = { name: byKey.size === 1 ? 'Base' : `Material ${byKey.size}`, props };
    }
    d.layers[name] = { color: st.color, material: id };
  }
  if (!byKey.size) d.materials.m1 = { name: DEFAULT_PRESET, props: { ...DEFAULT_MATERIAL_PROPS } };
  d.defaultMaterial = Object.keys(d.materials)[0];
  return d;
}

export function migrate(d) {
  if (d && d.v === 2) return d;
  if (d && d.styles) return dataFromStyles(d.styles, { base: d.base, bypass: d.bypass, wire: d.wire, overrides: d.overrides });
  return newData();
}

// Make sure every grid layer has a style entry (colour from the grid, default material).
export function ensureLayers(data, grid) {
  if (!data.materials[data.defaultMaterial]) data.defaultMaterial = Object.keys(data.materials)[0];
  for (const l of grid.layers) {
    const cur = data.layers[l.name];
    if (!cur) data.layers[l.name] = { color: l.color || '#888888', material: data.defaultMaterial };
    else if (!data.materials[cur.material]) cur.material = data.defaultMaterial;
  }
}

// model `scale` -> [x, y, z] in world units per voxel
export function modelScale(data) {
  const s = (data.model.props.scale || '1').trim().split(/\s+/).map(Number).filter(v => !Number.isNaN(v));
  return s.length >= 3 ? s.slice(0, 3) : s.length ? [s[0], s[0], s[0]] : [1, 1, 1];
}

const RAW_PROPS = { type: 'lambert', lighting: 'flat' };

// opts.view: geometry in editor units (1 voxel = 1 unit, origin bottom centre, no model rotation/position);
//            otherwise the model's own scale/origin/rotation/position are written (for Copy SVOX / the Playground).
// opts.envImage: data: URL used for every texture.
export function toSvox(grid, data, { view = true, bypass = data.bypass, envImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' } = {}) {
  const [sx, sy, sz] = grid.size;
  const names = [...new Set([...grid.layers.map(l => l.name), ...Object.keys(data.layers)])];
  const ids = assignColorIds(names);                       // layer name -> colour id
  const gridId = grid.layers.map(l => ids.get(l.name));    // grid layer index -> colour id
  const tr = list => list.split(/\s+/).map((t, i) => (i % 2 === 0 && ids.has(t) ? ids.get(t) : t)).join(' ');

  const lines = [];
  for (const t of data.textures) lines.push(`texture id = ${t}, image = ${envImage}`);
  for (const l of data.lights) {
    const p = { ...l.props };
    if (p.atvoxel && ids.has(p.atvoxel)) p.atvoxel = ids.get(p.atvoxel);
    lines.push(`light ${stringifyProps(p)}`);
  }

  const model = { ...data.model.props };
  if (view) {
    model.scale = '1'; model.origin = '-y';
    delete model.rotation; delete model.position;
  } else {
    model.scale = model.scale || '0.0625';
  }
  lines.push('model', `size = ${sx} ${sz} ${sy}`);
  for (const [k, v] of Object.entries(model)) if (v !== '' && v !== undefined) lines.push(`${k} = ${v}`);

  for (const g of data.groups) lines.push(`group ${stringifyProps(g.props)}`);

  const byMat = new Map();
  for (const name of names) {
    const l = data.layers[name] || { color: grid.layers.find(x => x.name === name)?.color, material: data.defaultMaterial };
    const mid = bypass ? '_raw' : (data.materials[l.material] ? l.material : data.defaultMaterial);
    if (!byMat.has(mid)) byMat.set(mid, []);
    byMat.get(mid).push(`${ids.get(name)}:${l.color || '#888888'}`);
  }
  for (const [mid, colors] of byMat) {
    const props = bypass ? RAW_PROPS : { ...data.materials[mid].props };
    if (props.shell) props.shell = tr(props.shell);
    lines.push(`material ${stringifyProps(props)}`, `  colors = ${colors.join(' ')}`);
  }

  // x fastest, then svox-y (= authoring z), then svox-z (= authoring -y)
  const out = [], { data: cells } = grid;
  let run = 0, prev = -1;
  const flush = () => { if (run) out.push((run > 1 ? run : '') + (prev ? gridId[prev - 1] : '-')); };
  for (let z = 0; z < sy; z++) {
    const gy = sy - 1 - z;
    for (let y = 0; y < sz; y++) for (let x = 0; x < sx; x++) {
      const v = cells[x + sx * (gy + sy * y)];
      if (v === prev) run++; else { flush(); prev = v; run = 1; }
    }
  }
  flush();
  lines.push('voxels = ' + out.join(''));
  return lines.join('\n');
}
