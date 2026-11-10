// Smooth Voxels settings as plain strings: parsing, writing, planar/colour helpers and material presets.
// No DOM, no Smooth Voxels dependency: used by the SVOX emitter, the importer and the tweak UI.
// Values stay in SVOX syntax ("3 1 0.8"), keys are lower-cased; the library is case-insensitive.

// 'a = 1 2, b = x' -> { a: '1 2', b: 'x' } (later duplicates win, trailing commas ignored)
export function parseProps(text) {
  const out = {};
  for (const part of String(text || '').split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export const stringifyProps = props => Object.entries(props).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k} = ${v}`).join(', ');

export const nums = (s, n = 0) => {
  const a = String(s ?? '').trim().split(/\s+/).filter(Boolean).map(Number).filter(v => !Number.isNaN(v));
  while (a.length < n) a.push(a.length ? a[a.length - 1] : 0);
  return a;
};
export const fmt = v => String(+Number(v).toFixed(4));

// '#RGB' | '#RRGGBB' -> '#rrggbb' (undefined when not a colour)
export function hex6(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map(ch => ch + ch).join('') : m[1];
  return '#' + h.toLowerCase();
}

// ---------- planar sets: '-x >y +z', 'none' ----------
export const AXES = ['x', 'y', 'z'];
export function parsePlanar(s) {
  const out = { x: '', y: '', z: '' };
  for (const t of String(s || '').trim().split(/\s+/)) {
    const m = /^([-+<>]?)([xyz])$/.exec(t);
    if (m) out[m[2]] = m[1] || '=';        // '=' = unsigned (both sides)
  }
  return out;
}
export function stringifyPlanar(p) {
  const t = AXES.filter(a => p[a]).map(a => (p[a] === '=' ? '' : p[a]) + a);
  return t.join(' ');
}

// ---------- colour ids ----------
// SVOX colour ids are [A-Z][a-z]*. A layer keeps its own name when it is a legal id, so imported models round-trip
// and `atvoxel` / `shell` can refer to layers by name.
export const isColorId = s => /^[A-Z][a-z]*$/.test(s);
const generatedId = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String.fromCharCode(96 + Math.floor(i / 26)) : '');

// layer names -> { name: colourId }, unique
export function assignColorIds(names) {
  const map = new Map(), used = new Set(names.filter(isColorId));
  let n = 0;
  for (const name of names) {
    if (isColorId(name)) { map.set(name, name); continue; }
    let id;
    do id = generatedId(n++); while (used.has(id));
    used.add(id);
    map.set(name, id);
  }
  return map;
}

// ---------- material presets (taken from reference-ents/) ----------
export const MATERIAL_PRESETS = {
  'Flat clay':        'type = lambert, lighting = flat, deform = 1',
  'Smooth low-poly':  'type = lambert, lighting = both, deform = 2 1 0.8',
  'Plastic':          'lighting = smooth, roughness = 0.2, deform = 1',
  'Metal':            'lighting = both, roughness = 0.4, metalness = 1, deform = 1',
  'Foliage':          'type = basic, lighting = quad, deform = 2, scatter = 0.2, warp = 1 0.2, fade = true',
  'Glow':             'lighting = smooth, emissive = #FC0, fog = false, deform = 1 0.75',
  'Gem':              'type = phong, lighting = flat, shininess = 1000, deform = 1 1.5, refractionratio = 0.5, combine = multiply, envmap = env',
  'Fire (additive)':  'lighting = smooth, opacity = 0.99, deform = 20, blending = additive',
};

// ---------- UI spec ----------
// Hand-tuned widgets for the properties the reference models use; everything else falls back to the kind derived
// from the library's own format string (see kindOf).
export const SPEC = {
  type:        { kind: 'enum', core: true },
  lighting:    { kind: 'enum', core: true },
  deform:      { kind: 'deform', core: true },
  scatter:     { kind: 'float', min: 0, max: 3, step: 0.01, def: 0, core: true },
  warp:        { kind: 'warp', core: true },
  clamp:       { kind: 'planar', core: true },
  roughness:   { kind: 'float', min: 0, max: 1, step: 0.01, def: 1, core: true },
  metalness:   { kind: 'float', min: 0, max: 1, step: 0.01, def: 0, core: true },
  opacity:     { kind: 'float', min: 0, max: 1, step: 0.01, def: 1, core: true },
  fade:        { kind: 'bool', def: false, core: true },
  shininess:   { kind: 'float', min: 1, max: 2000, step: 1, def: 30 },
  reflectivity: { kind: 'float', min: 0, max: 1, step: 0.01, def: 0.5 },
  refractionratio: { kind: 'float', min: 0, max: 2, step: 0.01, def: 1 },
  emissiveintensity: { kind: 'float', min: 0, max: 5, step: 0.01, def: 1 },
  envmapintensity: { kind: 'float', min: 0, max: 5, step: 0.01, def: 1 },
  bumpscale:   { kind: 'float', min: 0, max: 5, step: 0.01, def: 1 },
  clearcoat:   { kind: 'float', min: 0, max: 1, step: 0.01, def: 0 },
  clearcoatroughness: { kind: 'float', min: 0, max: 1, step: 0.01, def: 0 },
  transmission: { kind: 'float', min: 0, max: 1, step: 0.01, def: 1 },
  ior:         { kind: 'float', min: 1, max: 2.333, step: 0.01, def: 1.5 },
  thickness:   { kind: 'float', min: 0, max: 10, step: 0.01, def: 0 },
  alphatest:   { kind: 'float', min: 0, max: 1, step: 0.01, def: 0 },
  ao:          { kind: 'ao' },
  quickao:     { kind: 'text' },
  shell:       { kind: 'text' },
  group:       { kind: 'group' },
  flatten:     { kind: 'planar' },
  skip:        { kind: 'planar' },
  hide:        { kind: 'planar' },
  // model + group
  scale:       { kind: 'scale' },
  rotation:    { kind: 'vec3', min: -360, max: 360, step: 1 },
  position:    { kind: 'vec3', min: -50, max: 50, step: 0.05 },
  translation: { kind: 'vec3', min: -50, max: 50, step: 0.05 },
  origin:      { kind: 'text' },
  tile:        { kind: 'planar' },
  aosides:     { kind: 'planar' },
  aosamples:   { kind: 'float', min: 10, max: 500, step: 10, def: 50 },
  randomseed:  { kind: 'float', min: 0, max: 10000, step: 1 },
  // light
  color:       { kind: 'color' },
  intensity:   { kind: 'float', min: 0, max: 3, step: 0.01, def: 1 },
  direction:   { kind: 'vec3', min: -1, max: 1, step: 0.05 },
  distance:    { kind: 'float', min: 0, max: 50, step: 0.5 },
  size:        { kind: 'float', min: 0, max: 10, step: 0.05 },
  detail:      { kind: 'enum', values: ['0', '1', '2', '3'] },
  atvoxel:     { kind: 'layer' },
};

// Widget kind for a property given the library definition { format, values, ... } and our SPEC.
export function kindOf(key, def) {
  const s = SPEC[key];
  if (s) return s;
  if (def) {
    if (def.values && def.values.length) {
      return def.values.length === 2 && def.values.includes('true') ? { kind: 'bool' } : { kind: 'enum' };
    }
    const f = def.format || '';
    if (/^\{ true \| false \}$/.test(f)) return { kind: 'bool' };
    if (/textureid/.test(f)) return { kind: 'texture' };
    if (f === '<#RGB|#RRGGBB>') return { kind: 'color' };
    if (f === '<float>') return { kind: 'float', min: 0, max: 10, step: 0.01 };
    if (f === '<int>' || f === '<integer>') return { kind: 'float', min: 0, max: 1000, step: 1 };
    if (/^\{ -x/.test(f)) return { kind: 'planar' };
  }
  return { kind: 'text' };
}
