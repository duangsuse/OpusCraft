// goodMob · SVOX view for Blockbench. Classic script; uses only Blockbench's public globals (no core changes).
//   Mode  "SVOX"           : replaces the cube view with the Smooth Voxels result of the current project
//   Tool  "Magic wand"     : click a voxel -> flood-fill selection; Shift adds, Ctrl/Cmd subtracts
//   Panel "SVOX"           : wand options + a lil-gui tweak panel (model, materials, layers, lights, groups)
//   File > Import          : MagicaVoxel .vox, and Smooth Voxels text from the clipboard (new tab)
// Layers = outliner groups, overridden per voxel by wand assignments (cubes are never modified).
// Project data (see src/svox.js) is stored in the .bbmodel under `goodmob_svox`.
(() => {
  'use strict';
  const PLUGIN = new URL('./', document.currentScript.src).href;     // .../goodMob/hacks/plugin/
  const ROOT = new URL('../../', document.currentScript.src).href;   // .../goodMob/

  const until = async (test, ms = 60000) => {
    const t0 = Date.now();
    while (!test()) {
      if (Date.now() - t0 > ms) throw new Error('Blockbench did not finish booting');
      await new Promise(r => setTimeout(r, 100));
    }
  };
  main().catch(e => { console.error('[goodMob svox]', e); window.goodmobSvoxError = e; });

  async function main() {
    await until(() => window.Blockbench && Blockbench.setup_successful && window.Toolbars && Toolbars.tools && window.ModelProject && window.Mode);
    const [{ parseBbmodel }, { toSvox, newData, migrate, ensureLayers, modelScale }, { ramp }, { parseVox }, { gridToBoxes }, { importSvox }, R, { createGui }] = await Promise.all([
      import(ROOT + 'src/bbmodel.js'), import(ROOT + 'src/svox.js'), import(ROOT + 'src/grid.js'),
      import(ROOT + 'src/vox.js'), import(ROOT + 'src/boxes.js'), import(ROOT + 'src/svoximport.js'),
      import(PLUGIN + 'svox-render.js'), import(PLUGIN + 'svox-gui.js'),
    ]);
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = ROOT + 'vendor/lil-gui/lil-gui.min.css';
    document.head.append(css);

    // Smooth Voxels runs in a worker (see hacks/plugin/svox-worker.js for why it can't share Blockbench's realm).
    const worker = new Worker(PLUGIN + 'svox-worker.js');
    const pending = new Map();
    let jobId = 0;
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (p) data.error ? p.reject(new Error(data.error)) : p.resolve(data);
    };
    let dead = null;
    worker.onerror = e => {
      dead = e.message || 'worker error';
      for (const p of pending.values()) p.reject(new Error(dead));
      pending.clear();
    };
    const job = (op, payload = {}) => new Promise((resolve, reject) => {
      if (dead) return reject(new Error(dead));
      const id = ++jobId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, lib: ROOT + 'vendor/smoothvoxels.three.js', ...payload });
    });
    const generate = svox => job('generate', { svox });
    const schema = await job('schema');
    const allowed = new Map(schema.material.map(d => [d.key, d.types]));

    // the single built-in image behind every SVOX texture id, and the default environment for metals
    const ENV = R.makeEnvImage();
    let envTex = null;
    const env = () => {
      if (!envTex) {
        envTex = new THREE.TextureLoader().load(ENV, () => render());
        envTex.mapping = THREE.EquirectangularReflectionMapping;
        envTex.colorSpace = THREE.SRGBColorSpace;
      }
      return envTex;
    };

    // ---------- per-project data ----------
    new Property(ModelProject, 'object', 'goodmob_svox', { exposed: false });
    const data = () => {
      const d = Project.goodmob_svox;
      return d && d.v === 2 ? d : (Project.goodmob_svox = migrate(d));
    };

    // voxel key = packed authoring-frame coordinate (x right, y forward, z up); same packing as src/grid.js
    const OFF = 512, W = 1024;
    const key = (x, y, z) => (x + OFF) + W * ((y + OFF) + W * (z + OFF));
    const unkey = k => [(k % W) - OFF, (Math.floor(k / W) % W) - OFF, Math.floor(k / (W * W)) - OFF];

    // overrides: persisted as { layer: [[startKey, runLength], ...] }, in memory as Map(key -> layer)
    const ovCache = new WeakMap();
    function overrides() {
      const d = data();
      let m = ovCache.get(d);
      if (!m) {
        m = new Map();
        for (const [layer, runs] of Object.entries(d.overrides)) for (const [k0, n] of runs) for (let i = 0; i < n; i++) m.set(k0 + i, layer);
        ovCache.set(d, m);
      }
      return m;
    }
    function persistOverrides() {
      const d = data(), by = {};
      for (const [k, layer] of overrides()) (by[layer] ||= []).push(k);
      d.overrides = {};
      for (const [layer, ks] of Object.entries(by)) {
        ks.sort((a, b) => a - b);
        const runs = [];
        for (const k of ks) {
          const last = runs[runs.length - 1];
          if (last && last[0] + last[1] === k) last[1]++; else runs.push([k, 1]);
        }
        d.overrides[layer] = runs;
      }
    }

    // ---------- project -> grid ----------
    function bbLike() {
      const elements = [];
      for (const c of Cube.all) {
        if (c.export === false || c.visibility === false) continue;
        elements.push({ uuid: c.uuid, type: 'cube', from: c.from.slice(), to: c.to.slice(), origin: c.origin.slice(), rotation: c.rotation.slice() });
      }
      const walk = nodes => nodes.map(n => n instanceof Group ? { name: n.name, rotation: n.rotation.slice(), children: walk(n.children) } : n.uuid);
      return { elements, outliner: walk(Outliner.root) };
    }

    function buildGrid() {
      const { grid, warnings } = parseBbmodel(bbLike());
      const d = data(), ov = overrides();
      const idOf = name => {
        let i = grid.layers.findIndex(l => l.name === name);
        if (i < 0) { grid.layers.push({ name, color: ramp(grid.layers.length) }); i = grid.layers.length - 1; }
        return i + 1;
      };
      const [mx, my, mz] = grid.min, [sx, sy, sz] = grid.size;
      for (const [k, name] of ov) {
        const [x, y, z] = unkey(k), lx = x - mx, ly = y - my, lz = z - mz;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= sx || ly >= sy || lz >= sz) continue;
        const idx = grid.index(lx, ly, lz);
        if (grid.data[idx]) grid.data[idx] = idOf(name);
      }
      for (const l of grid.layers) if (!d.layers[l.name]) l.color = l.color || ramp(grid.layers.indexOf(l));
      ensureLayers(d, grid);
      return { grid, warnings };
    }

    // ---------- state ----------
    const ui = Vue.observable({
      active: false, error: '', stats: '', rows: [], sel: 0, target: '',
      bypass: false, wire: false,
      match: 'layer', conn: 6, surface: true, global: false,
    });
    let cur = null;                  // { grid, mesh, inner, root, overlay }
    let selection = new Set();       // voxel keys
    let timer = 0, token = 0;

    const scene = Canvas.scene;
    const render = () => Preview.all.forEach(p => p.render());
    const schedule = (ms = 120) => { clearTimeout(timer); timer = setTimeout(rebuild, ms); };

    function loadUi() {
      const d = data();
      ui.bypass = !!d.bypass; ui.wire = !!d.wire;
    }
    function saveUi() {
      const d = data();
      d.bypass = ui.bypass; d.wire = ui.wire;
    }

    // ---------- undo: whole-data snapshots on the history entry ----------
    let guiHost = null, gui = null, editBefore = null;
    const snap = () => JSON.stringify(data());
    function recordUndo(label, before) {
      if (snap() === before) return;
      Undo.initEdit({ elements: [] });
      Undo.finishEdit(label);
      const entry = Undo.history[Undo.index - 1];
      if (entry) entry.goodmobData = { before, after: snap() };
    }
    function restoreData(json) { Project.goodmob_svox = JSON.parse(json); refreshGui(); }
    const guiApi = {
      data, schema,
      rows: () => ui.rows,
      begin() { if (editBefore === null) editBefore = snap(); },
      changed() { schedule(); },
      finish(label) { if (editBefore === null) return; const b = editBefore; editBefore = null; recordUndo(label, b); },
      structure(label, fn) {
        const b = editBefore ?? snap();
        editBefore = null;
        fn();
        recordUndo(label, b);
        refreshGui();
        schedule(0);
      },
      selectLayer: name => selectLayer(name),
    };
    function refreshGui() {
      if (!guiHost || !Project) return;
      if (gui) gui.rebuild(); else gui = createGui(guiHost, guiApi);
    }

    // ---------- mesh ----------
    function disposeCur() {
      if (!cur) return;
      scene.remove(cur.root);
      R.disposeObject(cur.root, envTex);
      cur = null;
    }

    async function rebuild() {
      if (!ui.active || !Project) return;
      const my = ++token;
      try {
        const { grid, warnings } = buildGrid();
        const d = data();
        const svox = toSvox(grid, d, { view: true, envImage: ENV });
        const out = await generate(svox);
        if (my !== token || !ui.active) return;

        const mesh = R.makeMesh(out, { allowed, env: env(), onLoad: () => render(), wireframe: d.wire });
        // SVOX frame -> element frame (see README): origin = bottom centre, scale 1, svox z = element z
        const [sx, sy] = grid.size, [mx, my_, mz] = grid.min;
        mesh.position.set(sx / 2 + mx, mz, -sy / 2 - my_);

        disposeCur();
        const root = new THREE.Group();
        const m3 = Project.model_3d;
        root.position.copy(m3.position); root.quaternion.copy(m3.quaternion); root.scale.copy(m3.scale);
        // the model's own (non-uniform) voxel scale, relative to x
        const sc = modelScale(d), inner = new THREE.Group();
        if (sc[0] > 0) inner.scale.set(1, sc[1] / sc[0], sc[2] / sc[0]);
        inner.add(mesh);
        root.add(inner);
        scene.add(root);
        cur = { grid, mesh, inner, root, overlay: null };
        Project.model_3d.visible = false;

        const counts = new Uint32Array(grid.layers.length + 1);
        for (const v of grid.data) counts[v]++;
        ui.rows = grid.layers.map((l, i) => ({ name: l.name, count: counts[i + 1], color: d.layers[l.name].color })).filter(r => r.count);
        ui.error = warnings.join('\n');
        ui.stats = `${(out.indices.length / 3).toLocaleString()} tris · ${(out.positions.length / 3).toLocaleString()} verts · ${[...counts].reduce((a, b) => a + b, 0) - counts[0]} voxels`;
        updateOverlay();
        render();
      } catch (e) {
        ui.error = String(e.message || e);
        ui.stats = '';
        console.error('[goodMob svox]', e);
      }
    }

    // ---------- selection overlay ----------
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    function updateOverlay() {
      if (!cur) return;
      if (cur.overlay) { cur.inner.remove(cur.overlay); cur.overlay.geometry.dispose(); cur.overlay.material.dispose(); cur.overlay = null; }
      ui.sel = selection.size;
      if (!selection.size) return;
      const { grid } = cur, [sx, sy, sz] = grid.size, [mx, my, mz] = grid.min, e = 0.04, pos = [];
      const filled = (x, y, z) => { x -= mx; y -= my; z -= mz; return x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && grid.data[grid.index(x, y, z)] !== 0; };
      for (const k of selection) {
        const [x, y, z] = unkey(k);
        if (!filled(x, y, z)) continue;
        const cell = [x, z, -y - 1];                                  // element-frame cell (i, j, k)
        for (const [dx, dy, dz] of DIRS) {
          if (filled(x + dx, y + dy, z + dz)) continue;
          const axis = dx ? 0 : dz ? 1 : 2, sign = dx ? dx : dz ? dz : -dy;
          const fixed = cell[axis] + (sign > 0 ? 1 : 0) + sign * e;
          const [u, v] = [0, 1, 2].filter(a => a !== axis);
          const c = (a, b) => { const p = [0, 0, 0]; p[axis] = fixed; p[u] = cell[u] + a; p[v] = cell[v] + b; return p; };
          pos.push(...c(0, 0), ...c(1, 0), ...c(1, 1), ...c(0, 0), ...c(1, 1), ...c(0, 1));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.MeshBasicMaterial({ color: 0xffa530, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      cur.overlay = new THREE.Mesh(g, m);
      cur.overlay.renderOrder = 10;
      cur.inner.add(cur.overlay);
    }

    // ---------- magic wand ----------
    function pickVoxel(P, N) {
      const { grid } = cur, [sx, sy, sz] = grid.size, [mx, my, mz] = grid.min;
      const q = P.clone().addScaledVector(N, -0.35);
      const i0 = Math.floor(q.x), j0 = Math.floor(q.y), k0 = Math.floor(q.z);
      let best = null, bd = Infinity;
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = i0 + di, j = j0 + dj, k = k0 + dk;
        const lx = i - mx, ly = (-k - 1) - my, lz = j - mz;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= sx || ly >= sy || lz >= sz) continue;
        if (!grid.data[grid.index(lx, ly, lz)]) continue;
        const dist = (i + 0.5 - P.x) ** 2 + (j + 0.5 - P.y) ** 2 + (k + 0.5 - P.z) ** 2;
        if (dist < bd) { bd = dist; best = [lx, ly, lz]; }
      }
      return best;
    }

    function fill(seed) {
      const { grid } = cur, [sx, sy, sz] = grid.size, [mx, my, mz] = grid.min, d = grid.data, layers = data().layers;
      const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) ? 0 : d[grid.index(x, y, z)];
      const seedLayer = at(...seed), colorOf = l => layers[grid.layers[l - 1].name].color;
      const exposed = (x, y, z) => DIRS.some(([a, b, c]) => !at(x + a, y + b, z + c));
      const ok = (x, y, z) => {
        const v = at(x, y, z);
        if (!v) return false;
        if (ui.match === 'layer' && v !== seedLayer) return false;
        if (ui.match === 'color' && colorOf(v) !== colorOf(seedLayer)) return false;
        return !ui.surface || exposed(x, y, z);
      };
      const out = new Set();
      const add = (x, y, z) => out.add(key(x + mx, y + my, z + mz));
      if (ui.global) {
        for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) if (ok(x, y, z)) add(x, y, z);
        return out;
      }
      const nb = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        if ((a || b || c) && (ui.conn === 26 || Math.abs(a) + Math.abs(b) + Math.abs(c) === 1)) nb.push([a, b, c]);
      }
      const seen = new Uint8Array(sx * sy * sz), stack = [seed];
      seen[grid.index(...seed)] = 1;
      while (stack.length) {
        const [x, y, z] = stack.pop();
        if (!ok(x, y, z)) continue;
        add(x, y, z);
        for (const [a, b, c] of nb) {
          const X = x + a, Y = y + b, Z = z + c;
          if (X < 0 || Y < 0 || Z < 0 || X >= sx || Y >= sy || Z >= sz) continue;
          const i = grid.index(X, Y, Z);
          if (!seen[i]) { seen[i] = 1; stack.push([X, Y, Z]); }
        }
      }
      return out;
    }

    function applySelection(set, event) {
      if (event.shiftKey) for (const k of set) selection.add(k);
      else if (event.ctrlKey || event.metaKey) for (const k of set) selection.delete(k);
      else selection = set;
      updateOverlay(); render();
    }

    function onCanvasClick(hitData) {
      const event = hitData && hitData.event;
      if (!cur || !event) return;
      const prev = Preview.selected || Preview.all[0];
      const r = prev.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, prev.camera);
      const hit = rc.intersectObject(cur.mesh, false)[0];
      if (!hit) {
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) { selection = new Set(); updateOverlay(); render(); }
        return;
      }
      cur.inner.updateWorldMatrix(true, false);
      const P = cur.inner.worldToLocal(hit.point.clone());
      const N = hit.face.normal.clone();
      const seed = pickVoxel(P, N);
      if (seed) applySelection(fill(seed), event);
    }

    // ---------- actions used by the panel ----------
    function selectLayer(name) {
      if (!cur) return;
      const { grid } = cur, [sx, sy, sz] = grid.size, [mx, my, mz] = grid.min, li = grid.layers.findIndex(l => l.name === name) + 1, out = new Set();
      for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) if (grid.data[grid.index(x, y, z)] === li) out.add(key(x + mx, y + my, z + mz));
      selection = out; updateOverlay(); render();
    }
    function editOverrides(label, mutate) {
      const before = snap();
      mutate(overrides());
      persistOverrides();
      recordUndo(label, before);
    }
    function assign(name) {
      name = (name || '').trim();
      if (!name || !selection.size) return;
      editOverrides('Assign voxels to layer', ov => { for (const k of selection) ov.set(k, name); });
      afterAssign();
    }
    // new layers / counts: rebuild the mesh first (it refreshes ui.rows and creates the layer), then the tweak panel
    const afterAssign = () => rebuild().then(refreshGui);
    function unassign() {
      editOverrides('Reset voxel layers', ov => { for (const k of selection) ov.delete(k); });
      afterAssign();
    }
    function clearSelection() { selection = new Set(); updateOverlay(); render(); }

    // ---------- Blockbench integration ----------
    const mode = new Mode('svox', {
      name: 'SVOX', icon: 'grain', category: 'navigate', default_tool: 'goodmob_wand', selectElements: false,
      condition: () => !!Project,
      onSelect() { ui.active = true; loadUi(); rebuild().then(refreshGui); },
      onUnselect() {
        ui.active = false; token++;
        disposeCur();
        for (const p of ModelProject.all) p.model_3d.visible = true;
        render();
      },
    });

    const wand = new Tool('goodmob_wand', {
      name: 'Magic Wand (SVOX voxels)', description: 'Click a voxel to select connected voxels. Shift: add, Ctrl/Cmd: subtract.',
      icon: 'auto_fix_high', category: 'tools', selectElements: false, cursor: 'crosshair', transformerMode: 'hidden',
      modes: ['svox'], onCanvasClick,
    });
    Toolbars.tools.add(wand);

    new Panel('goodmob_svox', {
      name: 'SVOX', icon: 'grain', condition: { modes: ['svox'] },
      default_position: { slot: 'left_bar', float_position: [0, 0], float_size: [340, 520], height: 520 },
      growable: true, resizable: true,
      component: {
        data() { return { ui }; },
        mounted() { gui?.destroy(); gui = null; guiHost = this.$refs.gui; refreshGui(); },
        beforeDestroy() { gui?.destroy(); gui = null; guiHost = null; },
        methods: {
          viewChanged() { saveUi(); schedule(0); },
          importClipboard: () => importFromClipboard(),
          copySvox: () => copySvox(),
          assign() { assign(ui.target); },
          unassign, clearSelection,
        },
        template: `
          <div style="padding:8px;display:flex;flex-direction:column;gap:8px;font-size:13px">
            <div v-if="ui.error" style="color:#ff7b72;white-space:pre-wrap">{{ ui.error }}</div>
            <div style="opacity:.7">{{ ui.stats }}</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <label><input type="checkbox" v-model="ui.bypass" @change="viewChanged"> raw voxels (filter off)</label>
              <label><input type="checkbox" v-model="ui.wire" @change="viewChanged"> wireframe</label>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button @click="importClipboard" title="Paste a Smooth Voxels model from the clipboard into a new tab">Import SVOX (clipboard)</button>
              <button @click="copySvox" title="Copy the model as SVOX text (textures as %ENVIRONMENT%)">Copy SVOX</button>
            </div>

            <details open>
            <summary style="font-weight:600;cursor:pointer">Magic wand</summary>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
              <label>match <select v-model="ui.match"><option value="layer">same layer</option><option value="color">same colour</option><option value="any">any voxel</option></select></label>
              <label>connect <select v-model.number="ui.conn"><option :value="6">6</option><option :value="26">26</option></select></label>
              <label><input type="checkbox" v-model="ui.surface"> surface only</label>
              <label><input type="checkbox" v-model="ui.global"> whole model</label>
            </div>
            <div style="opacity:.7">Shift adds · Ctrl/Cmd subtracts · click empty space clears</div>

            <div style="font-weight:600;margin-top:4px">Selection: {{ ui.sel }} voxels</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <input type="text" list="goodmob_layers" v-model="ui.target" placeholder="layer name" spellcheck="false" style="flex:1;min-width:100px">
              <datalist id="goodmob_layers"><option v-for="r in ui.rows" :value="r.name"></option></datalist>
              <button @click="assign" :disabled="!ui.sel || !ui.target.trim()">Assign</button>
              <button @click="unassign" :disabled="!ui.sel" title="Back to the voxel's group layer">Reset</button>
              <button @click="clearSelection" :disabled="!ui.sel">Clear</button>
            </div>
            </details>

            <div ref="gui" class="goodmob-gui"></div>
          </div>`,
      },
    });

    // ---------- imports: voxels -> cubes, one outliner group per layer ----------
    function makeCubes(grid, label) {
      const boxes = gridToBoxes(grid);
      Undo.initEdit({ elements: [], outliner: true });
      const groups = new Map(), added = [];
      for (const b of boxes) {
        let g = groups.get(b.layer);
        if (!g) { g = new Group({ name: b.layer, origin: [0, 0, 0] }).init(); groups.set(b.layer, g); }
        // authoring (x,y,z) -> element frame (x, z, -y):  box [x0,x1)x[y0,y1)x[z0,z1) -> from (x0,z0,-y1) to (x1,z1,-y0)
        const c = new Cube({ name: b.layer, from: [b.min[0], b.min[2], -b.max[1]], to: [b.max[0], b.max[2], -b.min[1]] }).addTo(groups.get(b.layer)).init();
        added.push(c);
      }
      Undo.finishEdit(label, { elements: added, outliner: true });
      Canvas.updateAll();
      return { cubes: boxes.length, groups: groups.size };
    }

    function importVox(file) {
      const { grid, warnings } = parseVox(file.content);
      if (!Project) newProject('free');
      const r = makeCubes(grid, 'Import .vox');
      const d = data();
      for (const l of grid.layers) d.layers[l.name] = { color: l.color, material: d.defaultMaterial };   // keep the palette colours
      if (warnings.length) Blockbench.showQuickMessage(warnings.join(' · '), 4000);
      Blockbench.showQuickMessage(`Imported ${r.cubes} cubes in ${r.groups} groups`, 2500);
    }

    // front-left three-quarter view of the SVOX mesh (forward = element -z)
    function frameModel() {
      if (!cur) return;
      const prev = Preview.selected || Preview.all[0];
      cur.root.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(cur.mesh), c = box.getCenter(new THREE.Vector3()), r = Math.max(...box.getSize(new THREE.Vector3()).toArray());
      if (!isFinite(r) || r <= 0) return;
      prev.camera.position.set(c.x - r * 1.1, c.y + r * 0.7, c.z - r * 1.5);
      if (prev.controls) { prev.controls.target.copy(c); prev.controls.update(); }
      prev.camera.updateProjectionMatrix();
      render();
    }

    // Smooth Voxels text -> a new project (new tab): cubes from the voxels, materials / groups / lights from the text.
    async function importSvoxText(text, name = 'svox') {
      const p = await job('parse', { svox: text.replace(/%ENVIRONMENT%/g, ENV) });
      const { grid, data: nd } = importSvox(p);
      newProject('free');
      Project.name = name;
      const r = makeCubes(grid, 'Import SVOX');
      Project.goodmob_svox = nd;
      Modes.options.svox.select();
      await rebuild();
      refreshGui();
      frameModel();
      Blockbench.showQuickMessage(`Imported ${r.cubes} cubes · ${Object.keys(nd.materials).length} materials · ${nd.groups.length} groups · ${nd.lights.length} lights`, 3500);
      return r;
    }
    const looksLikeSvox = t => /^\s*(model|material|voxels)\b/m.test(t || '') && /\bvoxels\b/.test(t);
    async function importFromClipboard() {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch (e) { /* no permission: fall back to the paste dialog */ }
      const run = t => importSvoxText(t).catch(e => { console.error('[goodMob svox]', e); Blockbench.showMessageBox({ title: 'SVOX import failed', message: String(e.message || e) }); });
      if (looksLikeSvox(text)) return run(text);
      new Dialog({
        id: 'goodmob_svox_paste', title: 'Import SVOX', width: 640,
        form: { text: { type: 'textarea', label: 'Paste a Smooth Voxels model (clipboard was empty or unreadable)', height: 320 } },
        onConfirm(form) { run(form.text); },
      }).show();
    }
    async function copySvox() {
      if (!cur) return;
      const text = toSvox(cur.grid, data(), { view: false, envImage: '%ENVIRONMENT%' });
      try { await navigator.clipboard.writeText(text); Blockbench.showQuickMessage('SVOX copied', 1500); } catch (e) { console.log(text); Blockbench.showQuickMessage('Clipboard blocked: SVOX logged to the console', 3000); }
    }

    MenuBar.addAction(new Action('goodmob_import_vox', {
      name: 'Import MagicaVoxel .vox (goodMob)', icon: 'grain', category: 'file',
      click() { Blockbench.import({ extensions: ['vox'], type: 'MagicaVoxel', readtype: 'buffer', resource_id: 'vox' }, files => files[0] && importVox(files[0])); },
    }), 'file.import');
    MenuBar.addAction(new Action('goodmob_import_svox', {
      name: 'Import Smooth Voxels from clipboard (goodMob)', icon: 'content_paste', category: 'file',
      click: importFromClipboard,
    }), 'file.import');

    // rebuild while the mode is open
    const touch = () => { if (ui.active) schedule(); };
    for (const ev of ['finished_edit', 'undo', 'redo']) Blockbench.on(ev, touch);
    Blockbench.on('undo', ({ entry }) => { if (entry && entry.goodmobData) restoreData(entry.goodmobData.before); });
    Blockbench.on('redo', ({ entry }) => { if (entry && entry.goodmobData) restoreData(entry.goodmobData.after); });
    Blockbench.on('select_project', () => { if (ui.active) { selection = new Set(); loadUi(); schedule(0); refreshGui(); } });

    window.goodmobSvox = { frameModel, importVox, importSvoxText, copySvox, job, schema, importFromClipboard, ui, mode, wand, rebuild, data, get cur() { return cur; }, get selection() { return selection; }, fill, pickVoxel, assign, unassign, selectLayer };
    console.log('[goodMob svox] ready');
  }
})();
