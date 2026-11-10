// Tweak UI (lil-gui) for the SVOX project data: Model, Materials, Layers, Lights, Groups.
// Every control edits the string props of src/svox.js's data model; the plugin rebuilds the mesh on change and records
// one undo step per finished edit.
import GUI from '../../vendor/lil-gui/lil-gui.esm.min.js';
import { kindOf, SPEC, parseProps, stringifyProps, parsePlanar, stringifyPlanar, hex6, nums, fmt, MATERIAL_PRESETS } from '../../src/svoxprops.js';

const AXIS_LABEL = { x: 'x (left / right)', y: 'y (bottom / top)', z: 'z (front / back)' };
const SIGN = { '': 'off', '-': '− (low side)', '>': '> (all but ends, low)', '=': 'both sides', '<': '< (all but ends, high)', '+': '+ (high side)' };

const MATERIAL_CORE = ['type', 'lighting', 'deform', 'scatter', 'warp', 'clamp', 'roughness', 'metalness', 'opacity', 'fade'];
const MODEL_CORE = ['scale', 'ao', 'shape', 'resize', 'clamp', 'skip', 'aosides'];
const LIGHT_CORE = ['color', 'intensity'];
const GROUP_CORE = ['position', 'rotation', 'scale', 'shape', 'resize'];

// api: { data(), schema, begin(), changed(), finish(label), structure(label, fn), rows(), selectLayer(name) }
export function createGui(host, api) {
  const open = new Map();                     // folder key -> bool, survives rebuilds
  let gui = null;

  const tables = () => {
    const s = api.schema;
    const by = t => Object.fromEntries((s[t] || []).map(d => [d.key, d]));
    return { material: by('material'), model: by('model'), light: by('light'), group: { ...by('model'), ...by('group') } };
  };

  function folder(parent, title, key, dflt = false) {
    const f = parent.addFolder(title);
    const k = (parent._k || '') + '/' + key;
    f._k = k;
    open.set(k, open.has(k) ? open.get(k) : dflt);
    if (open.get(k)) f.open(); else f.close();
    f.onOpenClose(c => { if (c === f) open.set(k, !c._closed); });   // the callback also fires for descendants
    return f;
  }
  const tip = (ctrl, def) => { if (def && def.doc) ctrl.domElement.title = `${def.doc}\n${def.format || ''}`.trim(); return ctrl; };
  const addRemove = (ctrl, onRemove) => {
    const x = document.createElement('span');
    x.textContent = ' ✕'; x.title = 'remove this property'; x.style.cssText = 'cursor:pointer;opacity:.6;margin-left:4px';
    x.onclick = e => { e.stopPropagation(); onRemove(); };
    (ctrl.$name || ctrl.$title).append(x);
  };

  // ---------- one property ----------
  // ctx: { layers: [names], textures: [ids], groups: [ids], table: {key: def}, type }
  function field(f, props, key, def, ctx, removable) {
    const spec = kindOf(key, def);
    const set = v => { api.begin(); if (v === undefined) delete props[key]; else props[key] = v; api.changed(); };
    const fin = () => api.finish(`Edit ${key}`);
    const remove = () => api.structure(`Remove ${key}`, () => { delete props[key]; });
    let made = null;                                   // the controller (or sub-folder) for the remove button
    const raw = props[key];
    const label = key + (def?.types && ctx.type && !def.types.includes(ctx.type) ? ' (n/a)' : '');

    switch (spec.kind) {
      case 'float': {
        const o = { v: raw !== undefined ? parseFloat(raw) : (spec.def ?? def?.def ?? 0) };
        made = f.add(o, 'v', spec.min, spec.max, spec.step).name(label).onChange(v => set(!removable && v === spec.def ? undefined : fmt(v))).onFinishChange(fin);
        break;
      }
      case 'bool': {
        const o = { v: raw === undefined ? !!spec.def : raw === 'true' };
        made = f.add(o, 'v').name(label).onChange(v => set(!removable && v === !!spec.def ? undefined : String(v))).onFinishChange(fin);
        break;
      }
      case 'enum': {
        const values = spec.values || def?.values || [];
        const cur = raw ?? def?.def ?? values[0];
        const opts = [...new Set([...values, cur].filter(v => v !== undefined))].map(String);
        const o = { v: String(cur) };
        made = f.add(o, 'v', opts).name(label);
        if (key === 'type') made.onChange(v => api.structure('Edit type', () => { props[key] = v; }));
        else made.onChange(v => set(!removable && v === String(def?.def) ? undefined : v)).onFinishChange(fin);
        break;
      }
      case 'color': {
        const o = { v: hex6(raw) || '#ffffff' };
        made = f.addColor(o, 'v').name(label).onChange(set).onFinishChange(fin);
        break;
      }
      case 'texture': case 'group': case 'layer': {
        const list = spec.kind === 'texture' ? ctx.textures : spec.kind === 'group' ? ctx.groups : ctx.layers;
        const opts = { '(none)': '' };
        for (const v of new Set([...list, raw].filter(Boolean))) opts[v] = v;
        const o = { v: raw ?? '' };
        made = f.add(o, 'v', opts).name(label).onChange(v => set(v === '' ? undefined : v)).onFinishChange(fin);
        break;
      }
      case 'text': {
        const o = { v: raw ?? '' };
        made = f.add(o, 'v').name(label).onFinishChange(v => { set(v.trim() === '' ? undefined : v.trim()); fin(); });
        break;
      }
      case 'planar': {
        const unsigned = key === 'tile' || key === 'aosides';
        const p = parsePlanar(raw);
        const sub = f.addFolder(label + (raw ? `: ${raw}` : ''));
        sub.close();
        for (const a of ['x', 'y', 'z']) {
          const signs = unsigned ? ['', '-', '=', '+'] : ['', '-', '>', '=', '<', '+'];
          const o = { v: p[a] };
          const opts = {}; for (const s of signs) opts[SIGN[s]] = s;
          sub.add(o, 'v', opts).name(AXIS_LABEL[a]).onChange(v => {
            p[a] = v;
            const s = stringifyPlanar(p);
            set(s || undefined);
            sub.title(label + (s ? `: ${s}` : ''));
          }).onFinishChange(fin);
        }
        made = sub;
        break;
      }
      case 'vec3': case 'scale': {
        const isScale = spec.kind === 'scale';
        const v = nums(raw, 3);
        const a = v.length >= 3 ? v : isScale ? [v[0] ?? 1, v[0] ?? 1, v[0] ?? 1] : [0, 0, 0];
        const sub = f.addFolder(label + (raw ? `: ${raw}` : ''));
        sub.close();
        const o = { x: a[0], y: a[1], z: a[2] };
        const write = () => {
          const s = isScale && o.x === o.y && o.y === o.z ? fmt(o.x) : `${fmt(o.x)} ${fmt(o.y)} ${fmt(o.z)}`;
          set(s); sub.title(`${label}: ${s}`);
        };
        for (const c of ['x', 'y', 'z']) sub.add(o, c, spec.min, spec.max, spec.step ?? 0.005).onChange(write).onFinishChange(fin);
        made = sub;
        break;
      }
      case 'deform': {
        const a = nums(raw, 3);
        const o = { count: raw ? a[0] : 0, strength: raw ? a[1] ?? 1 : 1, damping: raw ? a[2] ?? 1 : 1 };
        if (raw && String(raw).trim().split(/\s+/).length === 1) { o.strength = 1; o.damping = 1; }
        const write = () => set(o.count <= 0 ? undefined : (o.strength === 1 && o.damping === 1 ? String(o.count) : `${o.count} ${fmt(o.strength)} ${fmt(o.damping)}`));
        const sub = f.addFolder(label); sub.open();
        sub.add(o, 'count', 0, 50, 1).name('deform count').onChange(write).onFinishChange(fin);
        sub.add(o, 'strength', 0, 3, 0.05).onChange(write).onFinishChange(fin);
        sub.add(o, 'damping', 0, 1.5, 0.05).onChange(write).onFinishChange(fin);
        tip(sub, def);
        made = sub;
        break;
      }
      case 'warp': {
        const a = nums(raw, 0);
        if (a.length >= 3) {                         // amplitude per axis: keep as text
          const o = { v: raw };
          made = f.add(o, 'v').name(label).onFinishChange(v => { set(v.trim() || undefined); fin(); });
          break;
        }
        const o = { amplitude: a[0] ?? 0, frequency: a[1] ?? 0.2 };
        const write = () => set(o.amplitude <= 0 ? undefined : (o.frequency === 0.2 ? fmt(o.amplitude) : `${fmt(o.amplitude)} ${fmt(o.frequency)}`));
        const sub = f.addFolder(label); sub.open();
        sub.add(o, 'amplitude', 0, 8, 0.05).onChange(write).onFinishChange(fin);
        sub.add(o, 'frequency', 0.02, 2, 0.01).onChange(write).onFinishChange(fin);
        tip(sub, def);
        made = sub;
        break;
      }
      case 'ao': {
        const t = String(raw || '').trim().split(/\s+/).filter(Boolean);
        const hasColor = t[0] && t[0].startsWith('#');
        const n = (hasColor ? t.slice(1) : t).map(Number);
        const o = { on: raw !== undefined, color: hex6(hasColor ? t[0] : '#000') || '#000000', distance: n[0] ?? 5, intensity: n[1] ?? 1 };
        const extra = n.slice(2).map(String);
        const write = () => set(o.on ? [o.color, fmt(o.distance), fmt(o.intensity), ...extra].join(' ') : undefined);
        const sub = f.addFolder(label); sub.close();
        sub.add(o, 'on').name('enabled').onChange(write).onFinishChange(fin);
        sub.addColor(o, 'color').onChange(write).onFinishChange(fin);
        sub.add(o, 'distance', 0, 20, 0.1).onChange(write).onFinishChange(fin);
        sub.add(o, 'intensity', -5, 5, 0.05).onChange(write).onFinishChange(fin);
        tip(sub, def);
        made = sub;
        break;
      }
    }
    if (made) {
      tip(made, def);
      if (removable) addRemove(made, remove);
    }
  }

  const initialValue = (key, def, ctx) => {
    const spec = kindOf(key, def);
    if (spec.kind === 'group') return ctx.groups[0] || undefined;
    if (spec.kind === 'layer') return ctx.layers[0];
    if (spec.kind === 'texture') return ctx.textures[0] || 'env';
    if (def?.completion !== undefined && def.completion !== '') return String(def.completion === true ? 'true' : def.completion);
    switch (spec.kind) {
      case 'float': return fmt(spec.def ?? def?.def ?? spec.min ?? 1);
      case 'bool': return 'true';
      case 'enum': return (spec.values || def?.values || [''])[0];
      case 'color': return '#ffffff';
      case 'planar': return '-y';
      case 'vec3': return '0 0 0';
      case 'scale': return '1';
      case 'deform': return '1';
      case 'warp': return '1 0.2';
      case 'ao': return '#000000 5 1';
      default: return def?.def !== undefined ? String(def.def) : 'none';
    }
  };

  // ---------- a props object: core controls, set extras, "add property" ----------
  function propsEditor(f, props, { table, core, ctx, skip = [], addable = null }) {
    const defs = Object.values(table);
    const visible = d => !ctx.type || !d || !d.types || d.types.includes(ctx.type);
    for (const key of core) if (visible(table[key])) field(f, props, key, table[key], ctx, false);

    const extras = Object.keys(props).filter(k => !core.includes(k) && !skip.includes(k));
    if (extras.length) {
      const ef = f.addFolder('more properties'); ef.open();
      for (const k of extras) field(ef, props, k, table[k], ctx, true);
    }

    const list = (addable ? defs.filter(d => addable.includes(d.key)) : defs)
      .filter(d => !core.includes(d.key) && !skip.includes(d.key) && !(d.key in props) && visible(d));
    if (list.length) {
      const opts = { '+ add property…': '' };
      for (const d of list) opts[`${(d.section || '').replace(/ properties$/i, '')} · ${d.key}`] = d.key;
      const o = { add: '' };
      f.add(o, 'add', opts).name('').onChange(k => {
        if (!k) return;
        api.structure(`Add ${k}`, () => {
          const v = initialValue(k, table[k], ctx);
          if (v === undefined) return;
          props[k] = v;
          const d = api.data();
          if (kindOf(k, table[k]).kind === 'texture' && !d.textures.includes(v)) d.textures.push(v);
        });
      });
    }
  }

  // ---------- sections ----------
  function build() {
    gui?.destroy();
    gui = new GUI({ container: host, autoPlace: false, title: 'SVOX tweaks', width: 330 });
    gui._k = '';
    const d = api.data(), T = tables();
    const rows = new Map(api.rows().map(r => [r.name, r.count]));
    const layerNames = Object.keys(d.layers);
    const groupIds = d.groups.map(g => g.props.id).filter(Boolean);
    const ctxBase = { layers: layerNames, textures: d.textures, groups: groupIds };

    // Layers
    const lf = folder(gui, 'Layers', 'layers', true);
    const matOpts = {};
    for (const [id, m] of Object.entries(d.materials)) matOpts[matLabel(d, id)] = id;
    for (const name of layerNames) {
      const l = d.layers[name], n = rows.get(name) || 0;
      const f = folder(lf, `${name}  ·  ${n}`, 'layer:' + name);
      const sw = document.createElement('span');
      sw.style.cssText = `display:inline-block;width:10px;height:10px;margin-right:6px;border:1px solid #0008;background:${l.color}`;
      f.$title.prepend(sw);
      const o = { color: hex6(l.color) || '#888888', material: l.material };
      f.addColor(o, 'color').onChange(v => { api.begin(); l.color = v; sw.style.background = v; api.changed(); }).onFinishChange(() => api.finish('Edit layer colour'));
      f.add(o, 'material', matOpts).onChange(v => api.structure('Change layer material', () => { l.material = v; }));
      f.add({ select: () => api.selectLayer(name) }, 'select').name('select voxels');
    }

    // Materials
    const mf = folder(gui, 'Materials', 'materials', true);
    for (const [id, m] of Object.entries(d.materials)) {
      const users = layerNames.filter(n => d.layers[n].material === id).length;
      const f = folder(mf, `${m.name}  ·  ${users} layer${users === 1 ? '' : 's'}`, 'mat:' + id, Object.keys(d.materials).length === 1);
      const o = { name: m.name, preset: '' };
      f.add(o, 'name').onFinishChange(v => api.structure('Rename material', () => { m.name = v.trim() || m.name; }));
      f.add(o, 'preset', { 'apply preset…': '', ...Object.fromEntries(Object.keys(MATERIAL_PRESETS).map(k => [k, k])) }).onChange(k => {
        if (!k) return;
        api.structure('Apply preset', () => {
          m.props = parseProps(MATERIAL_PRESETS[k]);
          if (m.props.envmap && !d.textures.includes(m.props.envmap)) d.textures.push(m.props.envmap);
        });
      });
      const type = m.props.type || 'standard';
      propsEditor(f, m.props, { table: T.material, core: MATERIAL_CORE, ctx: { ...ctxBase, type }, skip: ['colors', 'group', 'name'] });
      const g = d.groups.length ? { v: m.props.group || '' } : null;
      if (g) f.add(g, 'v', { '(no group)': '', ...Object.fromEntries(groupIds.map(x => [x, x])) }).name('group').onChange(v => api.structure('Set group', () => { if (v) m.props.group = v; else delete m.props.group; }));
      f.add({ dup: () => api.structure('Duplicate material', () => {
        const nid = 'm' + (Math.max(0, ...Object.keys(d.materials).map(k => +k.slice(1) || 0)) + 1);
        d.materials[nid] = { name: m.name + ' copy', props: { ...m.props } };
      }) }, 'dup').name('duplicate');
      if (Object.keys(d.materials).length > 1) {
        f.add({ del: () => api.structure('Delete material', () => {
          delete d.materials[id];
          if (d.defaultMaterial === id) d.defaultMaterial = Object.keys(d.materials)[0];
          for (const l of Object.values(d.layers)) if (l.material === id) l.material = d.defaultMaterial;
        }) }, 'del').name('delete (layers move to the default)');
      }
    }
    const np = { preset: '' };
    mf.add(np, 'preset', { '+ new material from preset…': '', ...Object.fromEntries(Object.keys(MATERIAL_PRESETS).map(k => [k, k])) }).name('').onChange(k => {
      if (!k) return;
      api.structure('New material', () => {
        const nid = 'm' + (Math.max(0, ...Object.keys(d.materials).map(x => +x.slice(1) || 0)) + 1);
        const props = parseProps(MATERIAL_PRESETS[k]);
        d.materials[nid] = { name: k, props };
        if (props.envmap && !d.textures.includes(props.envmap)) d.textures.push(props.envmap);
      });
    });

    // Model
    const mdf = folder(gui, 'Model', 'model');
    propsEditor(mdf, d.model.props, { table: T.model, core: MODEL_CORE, ctx: ctxBase, skip: ['size'] });
    const tx = { ids: d.textures.join(' ') };
    mdf.add(tx, 'ids').name('texture ids').onFinishChange(v => api.structure('Edit textures', () => { d.textures = [...new Set(v.split(/\s+/).filter(Boolean))]; }))
      .domElement.title = 'Every texture id is backed by the single built-in image';

    // Lights
    const lgf = folder(gui, 'Lights', 'lights');
    d.lights.forEach((l, i) => {
      const f = folder(lgf, `light ${i + 1}${l.props.atvoxel ? ' @' + l.props.atvoxel : l.props.direction ? ' (directional)' : ''}`, 'light:' + i);
      propsEditor(f, l.props, { table: T.light, core: LIGHT_CORE, ctx: ctxBase });
      f.add({ del: () => api.structure('Remove light', () => { d.lights.splice(i, 1); }) }, 'del').name('remove light');
    });
    lgf.add({ add: () => api.structure('Add light', () => { d.lights.push({ props: { color: '#ffffff', intensity: '0.5', direction: '1 1 0' } }); }) }, 'add').name('+ add light');

    // Groups
    const gf = folder(gui, 'Groups', 'groups');
    d.groups.forEach((g, i) => {
      const f = folder(gf, g.props.clone ? `clone of ${g.props.clone}` : (g.props.id || `group ${i + 1}`) + (g.props.prefab === 'true' ? ' (prefab)' : ''), 'group:' + i);
      propsEditor(f, g.props, { table: T.group, core: GROUP_CORE, ctx: ctxBase, addable: ['id', 'clone', 'prefab', 'group', 'origin', 'translation', 'swap', 'recolor'] });
      f.add({ del: () => api.structure('Remove group', () => { d.groups.splice(i, 1); }) }, 'del').name('remove group');
    });
    gf.add({ add: () => api.structure('Add group', () => { d.groups.push({ props: { id: `G${d.groups.length + 1}` } }); }) }, 'add').name('+ add group');
  }

  const matLabel = (d, id) => {
    const m = d.materials[id];
    const dup = Object.values(d.materials).filter(x => x.name === m.name).length > 1;
    return dup ? `${m.name} (${id})` : m.name;
  };

  build();
  return { rebuild: build, destroy: () => gui?.destroy() };
}
