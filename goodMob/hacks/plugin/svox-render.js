// Worker mesh output -> THREE.Mesh with one real material per SVOX material (roughness, metalness, opacity, emissive,
// blending, env maps, ...). Port of SvoxToThreejsMeshConverter that uses Blockbench's THREE (global) and one built-in
// image for every SVOX texture id.

// A small studio-style equirect image: bright sky, soft boxes, dark floor. Used as env map and as "the" texture.
export function makeEnvImage() {
  const w = 256, h = 128, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#9fc4ee'); sky.addColorStop(0.42, '#f4f7fb'); sky.addColorStop(0.5, '#c9ccd1');
  sky.addColorStop(0.62, '#555960'); sky.addColorStop(1, '#23262b');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (const [x, y, r] of [[0.2, 0.26, 0.16], [0.68, 0.22, 0.2], [0.93, 0.34, 0.09]]) {
    const rg = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  }
  return c.toDataURL('image/png');
}

const SIDE = () => ({ front: THREE.FrontSide, back: THREE.BackSide, double: THREE.DoubleSide });
const COMBINE = () => ({ multiply: THREE.MultiplyOperation, mix: THREE.MixOperation, add: THREE.AddOperation });
const BLENDING = () => ({ no: THREE.NoBlending, normal: THREE.NormalBlending, additive: THREE.AdditiveBlending, subtractive: THREE.SubtractiveBlending, multiply: THREE.MultiplyBlending });
const CTOR = () => ({ standard: THREE.MeshStandardMaterial, basic: THREE.MeshBasicMaterial, lambert: THREE.MeshLambertMaterial, phong: THREE.MeshPhongMaterial, physical: THREE.MeshPhysicalMaterial, matcap: THREE.MeshMatcapMaterial, toon: THREE.MeshToonMaterial, normal: THREE.MeshNormalMaterial });
const SRGB_MAPS = ['map', 'emissiveMap', 'specularColorMap'];

// ctx: { allowed: Map(lowercase prop -> types[] | null), env: THREE.Texture, onLoad }
export function makeMaterial(desc, ctx) {
  const m = { ...desc };
  m.side = SIDE()[m.side] ?? THREE.FrontSide;
  delete m.shadowSide;
  if (m.combine) m.combine = COMBINE()[m.combine];
  if (m.blending) m.blending = BLENDING()[m.blending];
  for (const k of Object.keys(m)) {
    const v = m[k];
    if (v && typeof v === 'object' && 'r' in v && 'g' in v && 'b' in v) m[k] = new THREE.Color(v.r, v.g, v.b);
  }
  if (m.normalScale) m.normalScale = new THREE.Vector2(m.normalScale.x, m.normalScale.y);

  const load = (image, space, t) => {
    const tex = new THREE.TextureLoader().load(image, ctx.onLoad);
    tex.colorSpace = space;
    if (t) {
      tex.repeat.set(1 / t.uscale, 1 / t.vscale);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.offset = new THREE.Vector2(t.uoffset, t.voffset);
      tex.rotation = t.rotation * Math.PI / 180;
    }
    return tex;
  };
  for (const k of Object.keys(m)) {
    const v = m[k];
    if (!v || typeof v !== 'object' || !('image' in v)) continue;
    if (k === 'envMap') {
      m.envMap = load(v.image, THREE.SRGBColorSpace);
      m.envMap.mapping = (m.ior || m.refractionRatio) ? THREE.EquirectangularRefractionMapping : THREE.EquirectangularReflectionMapping;
    } else if (k === 'matcap') m.matcap = load(v.image, THREE.SRGBColorSpace);
    else if (k === 'map' || k.endsWith('Map')) m[k] = load(v.image, SRGB_MAPS.includes(k) ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace, v);
  }

  const type = m.type;
  delete m.index; delete m.type; delete m.hasAtlas;
  for (const k of Object.keys(m)) {
    const types = ctx.allowed.get(k.toLowerCase());
    if (m[k] === undefined || (types && !types.includes(type))) delete m[k];
  }
  if ((type === 'standard' || type === 'physical') && !m.envMap) m.envMap = ctx.env;
  if (ctx.wireframe) m.wireframe = true;
  const C = CTOR()[type];
  if (!C) throw new Error(`Unknown material type '${type}'`);
  return new C(m);
}

export function makeMesh(out, ctx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(out.normals, 3));
  if (out.colors) g.setAttribute('color', new THREE.BufferAttribute(out.colors, 3));
  if (out.uvs) g.setAttribute('uv', new THREE.BufferAttribute(out.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(out.indices, 1));
  for (const grp of out.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  g.computeBoundingBox();
  return new THREE.Mesh(g, out.materials.map(d => makeMaterial(d, ctx)));
}

export function disposeObject(root, keep) {
  root.traverse(o => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v && v.isTexture && v !== keep) v.dispose();
      m.dispose?.();
    }
  });
}
