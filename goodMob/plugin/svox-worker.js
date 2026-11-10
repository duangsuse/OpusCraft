// Runs Smooth Voxels in a worker: Blockbench adds enumerable methods to Array.prototype, which breaks
// Smooth Voxels' `for ... in` voxel loops on the main thread (and its top-level classes would shadow Blockbench globals).
// The library URL arrives with the first job (absolute): some hosts run workers from blob: URLs, which can't resolve relative paths.
//
// Jobs ({ id, op, lib, ... } -> { id, ... } or { id, error }):
//   schema   -> the library's own property tables (names, docs, formats, allowed material types) for the tweak UI
//   parse    { svox } -> { header, size, voxels: Int32Array [x,y,z,colourIndex]*, ids }   header = canonical text without voxels
//   generate { svox } -> { positions, normals, colors, uvs, indices, materials, groups }   (default op)
let loaded = false;

const TYPES = ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon', 'matcap', 'normal'];

function table(defs) {
  const out = [];
  let section = '';
  for (const [name, d] of Object.entries(defs)) {
    if (d.title) { section = d.title; continue; }
    if (name.startsWith('_') || d.hide || d.meta) continue;
    const types = TYPES.filter(t => d[t]);
    const def = typeof d.defaultValue === 'object' ? undefined : d.defaultValue;
    out.push({ key: name.toLowerCase(), name, section, doc: d.doc || '', format: d.format || '', values: d.values || null, types: types.length ? types : null, def, completion: d.completion });
  }
  return out;
}

function parse(svox) {
  const model = ModelReader.readFromString(svox, 'goodmob');
  const text = ModelWriter.writeToString(model);
  const header = text.slice(0, text.indexOf('\nvoxels'));
  const ids = [], at = new Map(), buf = [];
  model.voxels.forEach(v => {
    let i = at.get(v.color.id);
    if (i === undefined) { i = ids.length; ids.push(v.color.id); at.set(v.color.id, i); }
    buf.push(v.x, v.y, v.z, i);
  });
  return { header, size: { x: model.size.x, y: model.size.y, z: model.size.z }, voxels: Int32Array.from(buf), ids };
}

onmessage = ({ data: { id, op, svox, lib } }) => {
  try {
    if (!loaded) {
      importScripts(lib);
      SVOX.colorManagement = false;       // Blockbench's renderer is linear-out; show hex colours as authored
      loaded = true;
    }
    if (op === 'schema') {
      postMessage({ id, material: table(SVOX.MATERIALDEFINITIONS), model: table(SVOX.MODELDEFINITIONS), group: table(SVOX.GROUPDEFINITIONS), light: table(SVOX.LIGHTDEFINITIONS) });
    } else if (op === 'parse') {
      const r = parse(svox);
      postMessage({ id, ...r }, [r.voxels.buffer]);
    } else {
      const m = SvoxMeshGenerator.generate(ModelReader.readFromString(svox, 'goodmob'));
      const msg = { id, positions: m.positions, normals: m.normals, colors: m.colors, uvs: m.uvs, indices: m.indices, materials: m.materials, groups: m.groups };
      postMessage(msg, [m.positions.buffer, m.normals.buffer, m.indices.buffer, ...(m.colors ? [m.colors.buffer] : []), ...(m.uvs ? [m.uvs.buffer] : [])]);
    }
  } catch (e) {
    postMessage({ id, error: e && e.message ? `${e.name || 'Error'}: ${e.message}` : String(e) });
  }
};
