import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/OrbitControls.js';
import { parseVox } from './vox.js';
import { parseBbmodel } from './bbmodel.js';
import { toSvox, dataFromStyles } from './svox.js';
import { bull } from './bull.js';

// Smooth Voxels is a classic script that expects a global THREE; load it after we publish one.
window.THREE = THREE;
await new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = './vendor/smoothvoxels.three.js';
  s.onload = ok; s.onerror = () => fail(new Error('failed to load smoothvoxels.three.js'));
  document.head.append(s);
});

const $ = id => document.getElementById(id);
const PRESETS = { bull };

// ---------- three.js scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x23262b);
scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 5, 4);
scene.add(sun);
const ground = new THREE.GridHelper(4, 32, 0x555b66, 0x363a42);
scene.add(ground);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---------- state ----------
const state = { grid: null, styles: {}, mesh: null, token: 0, lastSvox: '' };
window.app = { state, render: () => render(), THREE, scene, camera, controls };

const status = (msg, err = false) => { $('status').textContent = msg; $('status').className = err ? 'err' : ''; };

function fitCamera() {
  const box = state.mesh.geometry.boundingBox, size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z);
  controls.target.copy(c);
  camera.position.set(c.x - r * 1.1, c.y + r * 0.7, c.z - r * 1.5);   // front-left, forward is -z
  camera.near = r / 100; camera.far = r * 50; camera.updateProjectionMatrix();
  ground.scale.setScalar(r / 2); ground.position.y = box.min.y;
}

async function render({ fit = false } = {}) {
  if (!state.grid) return;
  const token = ++state.token;
  const svox = toSvox(state.grid, dataFromStyles(state.styles, { base: $('base').value }), { bypass: $('bypass').checked });
  state.lastSvox = svox;
  $('svox').value = svox;
  try {
    const t0 = performance.now();
    const mesh = await SmoothVoxels.createMesh(svox, 'goodMob');
    if (token !== state.token) return;
    if (state.mesh) { scene.remove(state.mesh); state.mesh.geometry.dispose(); [].concat(state.mesh.material).forEach(m => m.dispose()); }
    state.mesh = mesh;
    scene.add(mesh);
    applyViewFlags();
    if (fit) fitCamera();
    const g = mesh.geometry;
    status(`${(g.index.count / 3).toLocaleString()} tris · ${g.attributes.position.count.toLocaleString()} verts · ${[].concat(mesh.material).length} materials · ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (e) {
    status(String(e?.message || e), true);
  }
}

function applyViewFlags() {
  const m = state.mesh; if (!m) return;
  [].concat(m.material).forEach(mat => { mat.wireframe = $('wire').checked; });
  m.children.filter(c => c.userData.edges).forEach(c => { m.remove(c); c.geometry.dispose(); c.material.dispose(); });
  if ($('edges').checked) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    e.userData.edges = true;
    m.add(e);
  }
}

// ---------- layer panel ----------
let timer = 0;
const later = () => { clearTimeout(timer); timer = setTimeout(render, 150); };

function buildLayerPanel() {
  const host = $('layers'); host.textContent = '';
  const counts = new Uint32Array(state.grid.layers.length + 1);
  for (const v of state.grid.data) counts[v]++;
  state.grid.layers.forEach((layer, i) => {
    if (!counts[i + 1]) return;
    const st = (state.styles[layer.name] ||= { color: layer.color, mat: 'deform = 1' });
    st.color ||= layer.color;
    const row = document.createElement('div'); row.className = 'layer';
    const col = Object.assign(document.createElement('input'), { type: 'color', value: st.color });
    const name = document.createElement('b'); name.textContent = layer.name; name.title = `${layer.name} · ${counts[i + 1]} voxels`;
    const mat = Object.assign(document.createElement('input'), { type: 'text', value: st.mat, spellcheck: false, placeholder: '(no filter)' });
    col.oninput = () => { st.color = col.value; later(); };
    mat.oninput = () => { st.mat = mat.value; later(); };
    row.append(col, name, mat);
    host.append(row);
  });
}

function load(grid, styles, warnings = []) {
  state.grid = grid;
  state.styles = styles;
  $('warn').textContent = warnings.join('\n');
  buildLayerPanel();
  render({ fit: true });
}

// ---------- sources ----------
const preset = $('preset');
for (const [k, p] of Object.entries(PRESETS)) preset.add(new Option(p.name, k));
preset.onchange = () => { const p = PRESETS[preset.value]; load(p.build(), structuredClone(p.styles)); };

async function loadFile(file) {
  try {
    const name = file.name.toLowerCase();
    const { grid, warnings } = name.endsWith('.vox') ? parseVox(await file.arrayBuffer()) : parseBbmodel(await file.text());
    load(grid, {}, warnings);
    preset.selectedIndex = -1;
  } catch (e) { status(`${file.name}: ${e.message}`, true); }
}
$('pick').onclick = () => $('file').click();
$('file').onchange = e => e.target.files[0] && loadFile(e.target.files[0]);
const drop = $('drop');
addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
addEventListener('dragleave', () => drop.classList.remove('over'));
addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]); });
window.app.loadFile = loadFile;

$('base').value = 'type = lambert, lighting = flat';
$('base').oninput = later;
$('bypass').onchange = () => render();
$('edges').onchange = $('wire').onchange = applyViewFlags;

preset.onchange();
