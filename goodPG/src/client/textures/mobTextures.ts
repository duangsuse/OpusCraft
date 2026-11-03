// Texturas procedurales de las criaturas (atlas estilo «caja» de Minecraft).
//
// Cada parte del modelo es una caja con su rectángulo UV; boxFaces() da el
// rectángulo de cada cara (+X, -X, arriba, abajo, frente -Z, espalda +Z). Aquí
// se recorre cada téxel de cada cara y se le asigna su posición 3D sobre la caja
// (misma convención de esquinas que buildBox() en PlayerSkin.ts), de modo que
// los patrones de ruido (manchas de la vaca, camuflaje del creeper, lana…) son
// continuos entre caras. Las partes que comparten UV (patas) se pintan una vez.
//
// Salida: RGBA8 sRGB, fila 0 = arriba. Píxeles de cara opacos (alpha 255) salvo
// los emisivos (ojos de araña y enderman), marcados con alpha 200 (el renderer
// trata alpha 128–250 como brillo propio). Las zonas del atlas sin uso quedan
// transparentes (alpha 0).

import { witherPainter } from './witherTextures'; // Fase 8.7
import { MOB_WITHER } from '../../shared/witherMobs';
import { frogPainter } from './aquaticMobTextures'; // las variedades de rana
import { MOB_FROG } from '../../shared/mobs';
import {
  MOBS, boxFaces, MOB_PIG, MOB_COW, MOB_SHEEP, MOB_CHICKEN, MOB_ZOMBIE, MOB_HUSK, MOB_SKELETON, MOB_STRAY, MOB_CREEPER, MOB_SPIDER, MOB_ENDERMAN, MOB_SQUID,
  MOB_FOX, MOB_GOAT, MOB_POLAR_BEAR, MOB_RABBIT, MOB_WOLF,
  MOB_HORSE, MOB_DONKEY, MOB_MULE, MOB_LLAMA, MOB_CAMEL, // Fase 6 (monturas)
  isVillagerType, // Fase 6 (aldeanos)
} from '../../shared/mobs';
import { villagerPainter } from './villagerTextures'; // Fase 6 (aldeanos)
import { MONSTER_PAINTERS } from './monsterTextures'; // Fase 6 (monstruos)
import { AQUATIC_PAINTERS } from './aquaticMobTextures'; // Fase 6 (acuáticos)
import { faunaPainter } from './faunaTextures'; // Fase 6 (fauna)
import { ILLAGER_PAINTERS } from './illagerTextures'; // Fase 6 (asaltos)
import { OCEAN_PAINTERS } from './oceanMobTextures'; // Fase 7.5 (océano)
import { WARDEN_PAINTERS } from './wardenTextures'; // Fase 7.5 (abismo)
import { critterTexture } from './critterTextures'; // Fase 7.5 (fauna)
import { ALLAY_PAINTERS } from './allayTextures'; // Fase 7.5 (mansión)
import { netherTexture } from './netherMobTextures'; // Fase 8.3 (criaturas del Nether)

export interface MobTexture {
  width: number;
  height: number;
  /** width · height · 4 bytes, sRGB, fila 0 = arriba. */
  rgba: Uint8Array;
}

type RGB = readonly [number, number, number];

/** Alpha de los píxeles emisivos. */
const EMISSIVE_ALPHA = 200;

// Índices de cara (orden de boxFaces).
const PX = 0;
const NX = 1;
const TOP = 2;
const BOTTOM = 3;
const FRONT = 4;
const BACK = 5;

/** Un téxel de una cara con su posición en la caja. */
interface Texel {
  /** Nombre de la parte (el de la primera parte que usa esa UV). */
  part: string;
  /** Grupo: nombre sin sufijo de lado/índice ('leg0' → 'leg', 'armR' → 'arm'). */
  g: string;
  f: number;
  /** Coordenadas dentro de la cara: i → derecha de la imagen, j → abajo. */
  i: number;
  j: number;
  fw: number;
  fh: number;
  /** Posición del centro del téxel en la caja: x ∈ [0, w] (w = lado derecho +X),
   *  y ∈ [0, h] (h = arriba), z ∈ [0, d] (0 = frente). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

interface Glow {
  c: RGB;
  glow: true;
}

/** Fase 7.5 (abismo): téxel transparente (costillar y zarcillos del warden). */
interface Clear {
  clear: true;
}

type Paint = RGB | Glow | Clear;
type Painter = (t: Texel) => Paint;

// ---------------------------------------------------------------------------
// Utilidades de color y ruido
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function glow(c: RGB): Glow {
  return { c, glow: true };
}

/** Hash entero → [0, 1). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed | 0;
  h ^= Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Valor aleatorio por téxel (posición 3D a media unidad). */
function rnd(t: Texel, seed: number): number {
  return hash3(Math.round(t.x * 2), Math.round(t.y * 2), Math.round(t.z * 2) + t.f * 131, seed);
}

/** Ruido de valor 3D suave con celdas de lado `s`. */
function vnoise(x: number, y: number, z: number, s: number, seed: number): number {
  const fx = x / s;
  const fy = y / s;
  const fz = z / s;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  let tx = fx - x0;
  let ty = fy - y0;
  let tz = fz - z0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  tz = tz * tz * (3 - 2 * tz);
  const c = (dx: number, dy: number, dz: number): number => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  const a = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * tx;
  const b = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * tx;
  const e = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * tx;
  const f = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * tx;
  const g = a + (b - a) * ty;
  const k = e + (f - e) * ty;
  return g + (k - g) * tz;
}

/**
 * Ruido celular 3D: distancia al punto de rasgo más cercano (d1) y al segundo
 * (d2), y altura del téxel respecto al punto más cercano (oy, en unidades).
 */
function cells(x: number, y: number, z: number, s: number, seed: number): { d1: number; d2: number; oy: number } {
  const fx = x / s;
  const fy = y / s;
  const fz = z / s;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const cz = Math.floor(fz);
  let d1 = Infinity;
  let d2 = Infinity;
  let oy = 0;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const px = cx + dx + hash3(cx + dx, cy + dy, cz + dz, seed);
        const py = cy + dy + hash3(cx + dx, cy + dy, cz + dz, seed + 1);
        const pz = cz + dz + hash3(cx + dx, cy + dy, cz + dz, seed + 2);
        const d = Math.hypot(px - fx, py - fy, pz - fz) * s;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          oy = (fy - py) * s;
        } else if (d < d2) d2 = d;
      }
  return { d1, d2, oy };
}

/** Mapa de caracteres sobre una cara: devuelve la tinta del téxel o null ('.'). */
function mapAt(rows: readonly string[], t: Texel, inks: Readonly<Record<string, Paint>>): Paint | null {
  const row = rows[t.j];
  if (!row) return null;
  const ch = row[t.i];
  if (ch === undefined || ch === '.') return null;
  const p = inks[ch];
  if (!p) throw new Error(`Tinta de criatura desconocida '${ch}'`);
  return p;
}

/** Tono de una paleta ordenada de oscuro a claro para un valor en [0, 1). */
function tone(pal: readonly RGB[], v: number): RGB {
  return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];
}

/** ¿Es una cara lateral (vertical)? */
function side(t: Texel): boolean {
  return t.f === PX || t.f === NX || t.f === FRONT || t.f === BACK;
}

// ---------------------------------------------------------------------------
// Pintado genérico del atlas
// ---------------------------------------------------------------------------

function groupOf(name: string): string {
  return name.replace(/\d+$/, '').replace(/(?<=[a-z])[RL]$/, '');
}

function paintMob(mobId: number, painter: Painter): MobTexture {
  const mob = MOBS[mobId];
  const [W, H] = mob.atlas;
  const rgba = new Uint8Array(W * H * 4);
  const done = new Set<string>();
  for (const p of mob.parts) {
    const [w, h, d] = p.size;
    const key = `${p.uv[0]},${p.uv[1]},${w},${h},${d}`;
    if (done.has(key)) continue;
    done.add(key);
    const g = groupOf(p.name);
    const faces = boxFaces(p.uv[0], p.uv[1], w, h, d);
    for (let f = 0; f < 6; f++) {
      const [fu, fv, fw, fh] = faces[f];
      for (let j = 0; j < fh; j++) {
        for (let i = 0; i < fw; i++) {
          const u = fu + i;
          const v = fv + j;
          if (u < 0 || v < 0 || u >= W || v >= H) continue;
          const a = i + 0.5;
          const b = j + 0.5;
          let x: number;
          let y: number;
          let z: number;
          switch (f) {
            case PX:
              x = w;
              y = h - b;
              z = d - a;
              break;
            case NX:
              x = 0;
              y = h - b;
              z = a;
              break;
            case TOP:
              x = w - a;
              y = h;
              z = d - b;
              break;
            case BOTTOM:
              x = a;
              y = 0;
              z = d - b;
              break;
            case FRONT:
              x = w - a;
              y = h - b;
              z = 0;
              break;
            default:
              x = a;
              y = h - b;
              z = d;
          }
          const out = painter({ part: p.name, g, f, i, j, fw, fh, x, y, z, w, h, d });
          if ('clear' in out) continue; // Fase 7.5 (abismo): se queda transparente
          const o = (v * W + u) * 4;
          const c = 'glow' in out ? out.c : out;
          rgba[o] = Math.max(0, Math.min(255, Math.round(c[0])));
          rgba[o + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
          rgba[o + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
          rgba[o + 3] = 'glow' in out ? EMISSIVE_ALPHA : 255;
        }
      }
    }
  }
  return { width: W, height: H, rgba };
}

// ---------------------------------------------------------------------------
// Cerdo
// ---------------------------------------------------------------------------

const PIG_SKIN: RGB[] = [
  [206, 124, 126],
  [226, 146, 146],
  [240, 166, 162],
  [250, 186, 180],
];
const PIG_FACE = [
  '........',
  '........',
  '.WE..WE.',
  '.EE..EE.',
  '..ssss..',
  '..ssss..',
  '..ssss..',
  '...mm...',
];
const PIG_SNOUT = ['slls', 'NllN', 'ssss'];

function pig(t: Texel): Paint {
  const seed = 101;
  const n = 0.6 * vnoise(t.x, t.y, t.z, 3.2, seed) + 0.25 * vnoise(t.x, t.y, t.z, 1.4, seed + 7) + 0.15 * rnd(t, seed);
  let lv = n < 0.3 ? 1 : n > 0.74 ? 3 : 2;
  if (t.f === TOP) lv = Math.min(3, lv + (n > 0.5 ? 1 : 0));
  if (t.f === BOTTOM) lv = Math.max(0, lv - 1);
  if (side(t) && t.y < 1.2 && t.g !== 'snout') lv = Math.max(0, lv - 1);
  let c = PIG_SKIN[lv];
  if (t.g === 'head' && t.f === FRONT) {
    const m = mapAt(PIG_FACE, t, {
      W: [248, 248, 244],
      E: [34, 24, 28],
      s: PIG_SKIN[1],
      m: [176, 96, 102],
    });
    if (m) return m;
  }
  if (t.g === 'snout') {
    const s: RGB = [230, 130, 136];
    if (t.f === FRONT) {
      const m = mapAt(PIG_SNOUT, t, { l: [238, 146, 150], s, N: [120, 56, 66] });
      if (m) return m;
    }
    return t.f === BOTTOM ? scale(s, 0.9) : s;
  }
  if (t.g === 'body' && t.f === BACK) {
    // Cola enroscada.
    const m = mapAt(['..........', '....tt....', '...t..t...', '....tT....'], t, { t: [210, 118, 122], T: [188, 100, 106] });
    if (m) return m;
  }
  if (t.g === 'leg') {
    // Pezuñas algo más oscuras.
    if (t.f === BOTTOM || t.y < 1.5) c = t.f === BOTTOM ? [150, 94, 96] : [178, 110, 112];
  }
  return c;
}

// ---------------------------------------------------------------------------
// Vaca
// ---------------------------------------------------------------------------

const COW_WHITE: RGB[] = [
  [214, 210, 204],
  [230, 227, 221],
  [242, 240, 235],
];
const COW_DARK: RGB[] = [
  [44, 32, 26],
  [60, 44, 35],
  [80, 60, 46],
];
const COW_FACE = [
  'DDD..DDD',
  'DD....DD',
  'D......D',
  'WE....EW',
  '........',
  '.pppppp.',
  '.pNppNp.',
  '.pppppp.',
];

function cowPatch(t: Texel, seed: number): boolean {
  const n = vnoise(t.x + t.w * 3, t.y * 1.1, t.z, 4.2, seed) + 0.22 * (vnoise(t.x, t.y, t.z, 1.6, seed + 3) - 0.5);
  return n > 0.56;
}

function cow(t: Texel): Paint {
  const seed = 202;
  const r = rnd(t, seed);
  const n = vnoise(t.x, t.y, t.z, 2.5, seed + 9);
  const white = (): RGB => {
    let k = n > 0.5 ? 2 : n < 0.22 ? 0 : 1;
    if (t.f === BOTTOM || (side(t) && t.y < 1.5)) k = Math.max(0, k - 1);
    return COW_WHITE[k];
  };
  const dark = (): RGB => COW_DARK[r > 0.9 ? 2 : n > 0.55 ? 1 : 0];
  if (t.g === 'horn') {
    if (t.y > 2 || t.f === TOP) return [236, 234, 226];
    return t.y < 1 ? [170, 166, 156] : [206, 204, 196];
  }
  if (t.g === 'head' && t.f === FRONT) {
    const m = mapAt(COW_FACE, t, {
      D: dark(),
      W: [246, 244, 240],
      E: [24, 18, 16],
      p: n > 0.6 ? [238, 176, 170] : [228, 162, 158],
      N: [150, 84, 86],
    });
    if (m) return m;
    return white();
  }
  if (t.g === 'leg') {
    if (t.f === BOTTOM || t.y < 2) return t.y < 1 || t.f === BOTTOM ? [46, 40, 36] : [64, 56, 50];
    if (t.y > 6 && cowPatch(t, seed)) return dark();
    return white();
  }
  if (t.g === 'body' && t.f === BOTTOM) {
    // Ubre rosada hacia la parte trasera del vientre (filas altas de la imagen).
    const m = mapAt(['............', '............', '............', '....pppp....', '...pppppp...', '...pPppPp...', '....pppp....'], t, {
      p: [236, 172, 170],
      P: [206, 132, 134],
    });
    if (m) return m;
  }
  if (t.g === 'head' && (t.f === PX || t.f === NX)) {
    // Oreja oscura junto al cuerno.
    const nearFront = t.z > 1 && t.z < 3;
    if (nearFront && t.y > 4.5 && t.y < 6.5) return COW_DARK[1];
  }
  return cowPatch(t, seed) ? dark() : white();
}

// ---------------------------------------------------------------------------
// Oveja
// ---------------------------------------------------------------------------

const WOOL: RGB[] = [
  [206, 200, 188],
  [222, 218, 207],
  [235, 232, 223],
  [244, 242, 235],
  [251, 250, 245],
];
const SHEEP_SKIN: RGB = [226, 200, 170];
const SHEEP_SKIN_D: RGB = [204, 176, 146];
const SHEEP_FACE = [
  'wwwwww',
  'w.ww.w',
  'WE..EW',
  '......',
  '..nn..',
  '..mm..',
];

/** Lana: vellones (celdas) iluminados desde arriba, con pliegues finos entre ellos. */
function wool(t: Texel, seed: number): RGB {
  const c = cells(t.x, t.y, t.z, 2.4, seed);
  const tuft = 1 - clamp01(c.d1 / 1.9);
  let v = 0.42 + 0.3 * tuft + 0.22 * clamp01(0.5 + c.oy / 1.6) - 0.11 + 0.1 * (rnd(t, seed + 5) - 0.5);
  if (c.d2 - c.d1 < 0.3) v -= 0.28;
  if (t.f === TOP) v += 0.08;
  if (t.f === BOTTOM) v -= 0.3;
  else if (side(t)) v -= 0.1 * (1 - t.y / Math.max(1, t.h));
  return tone(WOOL, clamp01(v));
}

function sheep(t: Texel): Paint {
  const seed = 303;
  if (t.g === 'wool') return wool(t, seed);
  if (t.g === 'body') {
    // Piel rosada que se ve al esquilarla, con restos de lana corta.
    if (rnd(t, seed + 7) > 0.82) return tone(WOOL, 0.35);
    return rnd(t, seed + 8) > 0.7 ? SHEEP_SKIN_D : SHEEP_SKIN;
  }
  if (t.g === 'leg') {
    if (t.f === BOTTOM) return [104, 88, 76];
    if (t.y < 1.2) return [124, 104, 88];
    if (t.f === TOP || t.y > 7 + (rnd(t, seed) > 0.6 ? 1 : 0)) return wool(t, seed);
    return rnd(t, seed + 1) > 0.8 ? SHEEP_SKIN_D : SHEEP_SKIN;
  }
  // Cabeza: cara beige asomando de la lana.
  if (t.f === FRONT) {
    const m = mapAt(SHEEP_FACE, t, {
      w: wool(t, seed),
      W: [248, 246, 240],
      E: [34, 28, 26],
      n: [182, 128, 118],
      m: [158, 112, 100],
    });
    if (m) return m;
    return rnd(t, seed + 2) > 0.85 ? SHEEP_SKIN_D : SHEEP_SKIN;
  }
  if (t.f === PX || t.f === NX) {
    // Hocico beige cerca del frente; oreja justo detrás; el resto, lana.
    if (t.z < 3 && t.y < 4.6) return rnd(t, seed + 3) > 0.85 ? SHEEP_SKIN_D : SHEEP_SKIN;
    if (t.z > 3 && t.z < 4.2 && t.y > 3 && t.y < 5) return [196, 164, 134];
    return wool(t, seed);
  }
  if (t.f === BOTTOM) return t.z < 4.5 ? SHEEP_SKIN_D : wool(t, seed);
  return wool(t, seed);
}

// ---------------------------------------------------------------------------
// Gallina
// ---------------------------------------------------------------------------

const FEATHER: RGB[] = [
  [204, 204, 198],
  [226, 226, 220],
  [242, 242, 236],
  [252, 252, 248],
];

function feathers(t: Texel, seed: number): RGB {
  // Hileras de plumas: escamas desplazadas cada dos filas.
  const row = Math.floor(t.y);
  const along = Math.floor((t.f === PX || t.f === NX ? t.z : t.x) + (row % 2) * 1.5);
  let v = 0.55 + 0.25 * vnoise(t.x, t.y, t.z, 2.2, seed) + 0.1 * rnd(t, seed);
  if (side(t) && row % 2 === 0 && along % 3 === 0) v -= 0.25;
  if (t.f === BOTTOM) v -= 0.3;
  return tone(FEATHER, clamp01(v));
}

function chicken(t: Texel): Paint {
  const seed = 404;
  switch (t.g) {
    case 'beak': {
      const top: RGB = [244, 186, 56];
      const low: RGB = [214, 142, 34];
      if (t.f === TOP) return top;
      if (t.f === BOTTOM) return low;
      if (t.f === FRONT && t.j === 0) return [232, 170, 46];
      return t.y > 1 ? top : low;
    }
    case 'wattle':
      return t.y > 1 && t.f !== BOTTOM ? [214, 44, 40] : [168, 28, 28];
    case 'leg': {
      // Muslo emplumado arriba; pata fina (columna central clara) y dedos abajo.
      if (t.f === TOP || t.y > 4) return FEATHER[t.f === TOP ? 2 : 1];
      if (t.f === BOTTOM) return [214, 132, 36];
      if (t.y < 1) return t.i === 1 ? [240, 166, 52] : [228, 148, 42];
      if (t.i === 1) return Math.floor(t.y) % 2 === 0 ? [244, 170, 56] : [234, 156, 46];
      return [200, 118, 30];
    }
    case 'wing': {
      // Plumas remeras con puntas grises hacia atrás.
      if (t.z > 4.2 && t.y < 3) return t.y < 1 ? [176, 176, 172] : [200, 200, 194];
      if (t.y < 1) return FEATHER[1];
      return feathers(t, seed + 1);
    }
    case 'head': {
      if (t.f === FRONT && t.j === 0 && (t.i === 0 || t.i === 3)) return [22, 20, 20];
      if ((t.f === PX || t.f === NX) && t.j === 1 && t.z > 0.9 && t.z < 2) return [22, 20, 20];
      if (t.f === TOP && t.z < 1.5 && t.x > 1 && t.x < 3) return [214, 44, 40]; // cresta
      return feathers(t, seed + 2);
    }
    default: {
      if (t.f === BACK) return tone(FEATHER, 0.2 + 0.5 * vnoise(t.x, t.y, t.z, 1.5, seed + 3));
      return feathers(t, seed);
    }
  }
}

// ---------------------------------------------------------------------------
// Zombi y zombi momificado
// ---------------------------------------------------------------------------

interface ZombieStyle {
  skin: RGB[];
  hair: RGB[];
  eye: RGB;
  eyeLow: RGB;
  mouth: RGB;
  shirt: RGB[];
  pants: RGB[];
  shoes: RGB[];
  seed: number;
}

const ZOMBIE_STYLE: ZombieStyle = {
  skin: [
    [66, 108, 52],
    [84, 132, 66],
    [100, 150, 78],
    [118, 168, 92],
  ],
  hair: [
    [40, 66, 32],
    [52, 84, 40],
    [64, 100, 48],
  ],
  eye: [18, 26, 16],
  eyeLow: [40, 62, 34],
  mouth: [42, 64, 34],
  shirt: [
    [30, 98, 108],
    [42, 124, 134],
    [54, 146, 156],
    [70, 166, 174],
  ],
  pants: [
    [46, 42, 102],
    [60, 56, 128],
    [74, 70, 150],
    [88, 84, 168],
  ],
  shoes: [
    [68, 68, 70],
    [92, 92, 94],
    [112, 112, 114],
  ],
  seed: 505,
};

const HUSK_STYLE: ZombieStyle = {
  skin: [
    [176, 150, 104],
    [200, 176, 128],
    [216, 194, 148],
    [230, 212, 170],
  ],
  hair: [
    [84, 64, 44],
    [102, 80, 54],
    [120, 96, 66],
  ],
  eye: [40, 26, 16],
  eyeLow: [96, 70, 44],
  mouth: [110, 82, 52],
  shirt: [
    [88, 66, 42],
    [108, 82, 52],
    [128, 98, 62],
    [148, 116, 76],
  ],
  pants: [
    [62, 50, 38],
    [78, 64, 48],
    [94, 78, 58],
    [110, 92, 70],
  ],
  shoes: [
    [52, 42, 32],
    [68, 56, 44],
    [84, 70, 56],
  ],
  seed: 606,
};

const ZOMBIE_FACE = [
  'HHHHHHHH',
  'HH.HHH.H',
  '........',
  '.KK..KK.',
  '.Kk..kK.',
  '...dd...',
  '..mmmm..',
  '........',
];

function zombieLike(t: Texel, st: ZombieStyle): Paint {
  const seed = st.seed;
  const r = rnd(t, seed);
  const n = vnoise(t.x, t.y, t.z, 2.4, seed + 1);
  const skin = (): RGB => {
    let k = n < 0.3 ? 1 : n > 0.72 ? 3 : 2;
    if (r > 0.95) k = Math.max(0, k - 1);
    return st.skin[k];
  };
  // Tela: tono casi liso con pliegues suaves (ruido grande) y costados más oscuros.
  const cloth = (pal: RGB[]): RGB => {
    const fold = vnoise(t.x * 0.8, t.y * 1.6, t.z * 0.8, 2.2, seed + 6);
    let k = fold < 0.3 ? 1 : fold > 0.72 ? 3 : 2;
    if (t.f === PX || t.f === NX) k -= 1;
    if (t.f === BOTTOM) k -= 1;
    if (r > 0.96) k -= 1;
    return pal[Math.max(0, Math.min(pal.length - 1, k))];
  };
  switch (t.g) {
    case 'head': {
      if (t.f === FRONT) {
        const m = mapAt(ZOMBIE_FACE, t, {
          H: st.hair[r > 0.7 ? 2 : 1],
          K: st.eye,
          k: st.eyeLow,
          d: st.skin[0],
          m: st.mouth,
        });
        if (m) return m;
        return skin();
      }
      if (t.f === TOP) return st.hair[r > 0.75 ? 2 : r < 0.2 ? 0 : 1];
      if (t.f === BACK) return t.y > 3 + (r > 0.5 ? 1 : 0) ? st.hair[r > 0.7 ? 2 : 1] : skin();
      if (t.f === PX || t.f === NX) {
        if (t.y > 5.5 + (r > 0.6 ? 1 : 0) || (t.y > 3.5 && t.z > 5)) return st.hair[r > 0.7 ? 2 : 1];
        if (t.y > 2.5 && t.y < 4.5 && t.z > 3.5 && t.z < 4.5) return st.skin[0]; // oreja
        return skin();
      }
      return skin();
    }
    case 'body': {
      // Camisa rota: bajo irregular, agujeros y cuello abierto; cintura del pantalón abajo.
      const hem = 2 + (hash3(Math.floor(t.x * 2), Math.floor(t.z * 2), t.f, seed + 3) > 0.5 ? 1 : 0);
      if (t.f === BOTTOM || t.y < 1.5) return cloth(st.pants);
      if (t.y < hem) return skin();
      if (t.f === TOP && t.x > 2.5 && t.x < 5.5 && t.z > 0.9 && t.z < 3.1) return skin();
      if (t.f === FRONT && t.j === 0 && t.i >= 3 && t.i <= 4) return skin();
      if (t.f === FRONT && t.j === 1 && t.i === 3) return skin();
      // Agujeros.
      const hole = vnoise(t.x * 1.3, t.y, t.z * 1.3, 1.7, seed + 4) > 0.8;
      if (hole && t.y < 10) return skin();
      return cloth(st.shirt);
    }
    case 'arm': {
      // Manga desgarrada arriba, brazo desnudo y mano.
      const cut = 8 + (hash3(Math.floor(t.x * 2), Math.floor(t.z * 2), t.f, seed + 5) > 0.5 ? 1 : 0);
      if (t.f === TOP || t.y > cut) return cloth(st.shirt);
      if (t.f === BOTTOM || t.y < 2) return st.skin[t.f === BOTTOM ? 0 : 1];
      return skin();
    }
    default: {
      // Piernas: pantalón (con un roto en la derecha) y zapatos.
      if (t.f === BOTTOM) return st.shoes[0];
      if (t.y < 2) return st.shoes[t.y < 1 ? 1 : 2];
      if (t.part === 'legR' && t.f === FRONT && t.j >= 5 && t.j <= 6 && t.i >= 1 && t.i <= 2) return skin();
      return cloth(st.pants);
    }
  }
}

// ---------------------------------------------------------------------------
// Esqueleto y esqueleto errante
// ---------------------------------------------------------------------------

interface BoneStyle {
  bone: RGB[];
  hole: RGB;
  gap: RGB;
  cloth?: RGB[];
  frost?: RGB;
  seed: number;
}

const SKELETON_STYLE: BoneStyle = {
  bone: [
    [132, 132, 128],
    [166, 166, 160],
    [196, 196, 190],
    [220, 220, 214],
    [236, 236, 232],
  ],
  hole: [30, 30, 32],
  gap: [52, 52, 54],
  seed: 707,
};

const STRAY_STYLE: BoneStyle = {
  bone: [
    [112, 130, 138],
    [148, 166, 174],
    [178, 196, 204],
    [202, 218, 224],
    [224, 236, 240],
  ],
  hole: [24, 34, 42],
  gap: [44, 58, 68],
  cloth: [
    [64, 122, 156],
    [90, 150, 184],
    [120, 180, 210],
    [156, 206, 228],
  ],
  frost: [246, 252, 255],
  seed: 808,
};

const SKULL_FACE = [
  '........',
  '........',
  '........',
  '.KK..KK.',
  '.KK..KK.',
  '...NN...',
  '.tTtTtT.',
  '........',
];

// Caja torácica vista de frente (8×12): 'b' hueso, 's' columna, 'k' hueco oscuro.
const RIBS_FRONT = [
  'bbbbbbbb',
  'kkkssskk',
  'bbbssbbb',
  'kkksskkk',
  'kbbssbbk',
  'kkksskkk',
  'kkbssbkk',
  'kkksskkk',
  'kkksskkk',
  'kkksskkk',
  'bbbbbbbb',
  'bkbbbbkb',
];
const RIBS_BACK = [
  'bbbbbbbb',
  'kkksbkkk',
  'bbbsbbbb',
  'kkksbkkk',
  'kbbsbbbk',
  'kkksbkkk',
  'kkbsbbkk',
  'kkksbkkk',
  'kkksbkkk',
  'kkksbkkk',
  'bbbbbbbb',
  'bkbbbbkb',
];

function skeletonLike(t: Texel, st: BoneStyle): Paint {
  const seed = st.seed;
  const r = rnd(t, seed);
  const n = vnoise(t.x, t.y, t.z, 2.2, seed + 1);
  const bone = (bias = 0): RGB => {
    let k = 2 + (n > 0.7 ? 1 : n < 0.22 ? -1 : 0) + bias;
    if (r > 0.95) k -= 1;
    k = Math.max(0, Math.min(st.bone.length - 1, k));
    if (st.frost && r > 0.965 && k >= 2) return st.frost;
    return st.bone[k];
  };
  const cl = st.cloth;
  const clothAt = (): RGB => (cl ? cl[Math.min(cl.length - 1, (n > 0.55 ? 2 : 1) + (r > 0.85 ? 1 : 0) - (r < 0.1 ? 1 : 0))] : bone());
  switch (t.g) {
    case 'head': {
      if (t.f === FRONT) {
        const m = mapAt(SKULL_FACE, t, { K: st.hole, N: st.hole, t: st.gap, T: st.bone[4] });
        if (m) return m;
        return bone(t.j === 7 ? -1 : 0);
      }
      // Capucha raída del errante: tapa y nuca.
      if (cl && (t.f === TOP || (t.f === BACK && t.y > 2 + (r > 0.5 ? 1 : 0)) || ((t.f === PX || t.f === NX) && t.y > 5 + (r > 0.55 ? 1 : 0) && t.z > 1.5))) {
        return clothAt();
      }
      if (t.f === BOTTOM) return bone(-1);
      // Sutura del cráneo.
      if (t.f === TOP && Math.abs(t.x - 4) < 0.6 && r > 0.3) return bone(-1);
      return bone();
    }
    case 'body': {
      // Harapo cruzado del errante (del hombro derecho a la cadera izquierda).
      if (cl && (t.f === FRONT || t.f === BACK)) {
        const u = t.f === FRONT ? t.i : 7 - t.i;
        const diag = t.j - u * 1.2;
        if (diag > -2.2 && diag < 0.6 + (r > 0.6 ? 1 : 0) && t.j < 11) return clothAt();
      }
      if (t.f === FRONT || t.f === BACK) {
        const m = mapAt(t.f === FRONT ? RIBS_FRONT : RIBS_BACK, t, { b: bone(), s: bone(1), k: st.gap });
        if (m) return m;
      }
      if (t.f === PX || t.f === NX) {
        // Costillas en los costados: franjas alternas.
        if (t.j === 0 || t.j >= 10) return bone();
        return t.j % 2 === 0 && t.j < 8 ? bone(-1) : st.gap;
      }
      if (t.f === TOP) return t.x > 3 && t.x < 5 ? bone(1) : bone();
      return bone(-1);
    }
    default: {
      // Huesos largos (2×12×2): articulación central más clara, extremos algo más oscuros.
      if (cl && t.f !== TOP && t.f !== BOTTOM && t.y > 7 && t.y < 9.5 + (r > 0.5 ? 1 : 0)) return clothAt();
      if (t.f === BOTTOM) return bone(-1);
      if (t.y > 5.5 && t.y < 7) return bone(1);
      if (t.y < 1) return bone(-1);
      // Sombreado cilíndrico: la columna derecha de cada cara, más oscura.
      if (side(t) && t.i === t.fw - 1) return bone(-1);
      return bone();
    }
  }
}

// ---------------------------------------------------------------------------
// Creeper
// ---------------------------------------------------------------------------

const CREEPER_GREEN: RGB[] = [
  [30, 84, 28],
  [44, 112, 38],
  [62, 140, 50],
  [84, 166, 64],
  [112, 188, 88],
];
const CREEPER_FACE = [
  '........',
  '........',
  '.KK..KK.',
  '.Kk..kK.',
  '...KK...',
  '..KKKK..',
  '..KkkK..',
  '..K..K..',
];

function creeper(t: Texel): Paint {
  const seed = 909;
  const r = rnd(t, seed);
  if (t.g === 'head' && t.f === FRONT) {
    const m = mapAt(CREEPER_FACE, t, { K: [14, 22, 12], k: [30, 44, 26] });
    if (m) return m;
  }
  let v = 0.5 * vnoise(t.x, t.y, t.z, 2.6, seed + 1) + 0.3 * vnoise(t.x, t.y, t.z, 1.2, seed + 2) + 0.2 * r;
  if (t.g === 'leg' && t.y < 1.5) v -= 0.18;
  if (t.f === BOTTOM) v -= 0.15;
  if (r > 0.975) return [178, 210, 160]; // motas pálidas
  return tone(CREEPER_GREEN, clamp01((v - 0.2) / 0.62));
}

// ---------------------------------------------------------------------------
// Araña
// ---------------------------------------------------------------------------

const SPIDER_BODY: RGB[] = [
  [22, 18, 18],
  [32, 26, 25],
  [44, 36, 33],
  [62, 51, 46],
  [90, 76, 68],
];
// Dos ojos grandes (con brillo arriba a la izquierda) y cuatro pequeños.
const SPIDER_FACE = [
  '........',
  '..e..e..',
  '........',
  '.rR..rR.',
  '.RR..RR.',
  'e......e',
  '........',
  '..ff.ff.',
];

function spider(t: Texel): Paint {
  const seed = 1010;
  const r = rnd(t, seed);
  const n = vnoise(t.x, t.y, t.z, 2, seed + 1);
  const hairy = (bias = 0): RGB => {
    let k = 1 + (n > 0.6 ? 1 : 0) + bias;
    if (r > 0.8) k += 1;
    if (r > 0.95) k += 1;
    if (r < 0.12) k -= 1;
    return SPIDER_BODY[Math.max(0, Math.min(SPIDER_BODY.length - 1, k))];
  };
  if (t.g === 'head' && t.f === FRONT) {
    const m = mapAt(SPIDER_FACE, t, {
      R: glow([226, 34, 30]),
      r: glow([255, 132, 112]),
      e: glow([176, 22, 24]),
      f: [84, 62, 52],
    });
    if (m) return m;
  }
  if (t.g === 'leg') {
    // Patas: articulaciones claras simétricas (sirven para ambos lados).
    const xi = Math.floor(t.x);
    if (t.f === PX || t.f === NX) return SPIDER_BODY[0];
    if (xi === 5 || xi === 10) return r > 0.5 ? SPIDER_BODY[4] : SPIDER_BODY[3];
    if (xi === 4 || xi === 11) return SPIDER_BODY[2];
    return hairy(t.f === BOTTOM ? -1 : 0);
  }
  if (t.g === 'abdomen' && t.f === TOP) {
    // Dibujo en punta de flecha sobre el abdomen.
    const cx = Math.abs(t.x - 5);
    const zz = t.z - 2;
    if (zz > 0 && Math.abs(cx - zz * 0.45) < 0.55 && zz < 9) return [74, 46, 38];
  }
  return hairy(t.f === BOTTOM ? -1 : 0);
}

// ---------------------------------------------------------------------------
// Enderman
// ---------------------------------------------------------------------------

const ENDER_FACE = [
  '........',
  '........',
  '........',
  '........',
  'pMP..PMp',
  '.q....q.',
  '........',
  '........',
];

function enderman(t: Texel): Paint {
  const seed = 1111;
  const r = rnd(t, seed);
  if (t.g === 'head' && t.f === FRONT) {
    // Ojos: dos franjas de 3 px separadas por 2 px oscuros.
    const m = mapAt(ENDER_FACE, t, {
      p: glow([150, 40, 190]),
      P: glow([214, 86, 240]),
      M: glow([250, 196, 255]),
      q: glow([96, 24, 124]),
    });
    if (m) return m;
  }
  const n = vnoise(t.x, t.y, t.z, 2.4, seed + 1);
  if (r > 0.975) return [62, 38, 82];
  if (n > 0.72 && r > 0.4) return [34, 22, 44];
  if (n > 0.55) return [24, 18, 30];
  return r > 0.8 ? [22, 17, 26] : [15, 12, 19];
}

// ---------------------------------------------------------------------------
// Calamar
// ---------------------------------------------------------------------------

const SQUID_BODY: RGB[] = [
  [30, 42, 62],
  [40, 56, 80],
  [52, 70, 98],
  [66, 86, 116],
  [92, 114, 144],
  [118, 140, 168],
];
const SQUID_EYE = ['.ww.', 'wEPw', 'wPPw', '.ww.'];

function squid(t: Texel): Paint {
  const seed = 1212;
  const r = rnd(t, seed);
  const n = vnoise(t.x, t.y, t.z, 3, seed + 1);
  if (t.g === 'tent') {
    // Tentáculos oscuros; anillos tenues y punta más oscura.
    if (t.f === BOTTOM || t.y < 3) return SQUID_BODY[0];
    if (Math.floor(t.y) % 4 === 0) return SQUID_BODY[2];
    return SQUID_BODY[r > 0.8 ? 2 : 1];
  }
  if (t.f === BOTTOM) {
    // Vientre claro con la boca en el centro.
    const dx = Math.abs(t.x - 6);
    const dz = Math.abs(t.z - 6);
    if (dx < 1 && dz < 1) return [26, 24, 34];
    if (dx < 2 && dz < 2) return SQUID_BODY[3];
    return SQUID_BODY[r > 0.8 ? 4 : 5];
  }
  if ((t.f === PX || t.f === NX) && t.j >= 8 && t.j < 12 && t.i >= 4 && t.i < 8) {
    const m = mapAt(SQUID_EYE, { ...t, i: t.i - 4, j: t.j - 8 }, {
      w: [196, 204, 214],
      E: [236, 240, 246],
      P: [14, 18, 28],
    });
    if (m) return m;
  }
  // Manto: más claro hacia abajo (contrasombreado) y motas oscuras.
  let k = 2 + (n > 0.62 ? 1 : n < 0.3 ? -1 : 0);
  if (t.y < 4) k += 1;
  if (t.f === TOP) k -= 1;
  if (r > 0.9) k -= 1;
  return SQUID_BODY[Math.max(0, Math.min(SQUID_BODY.length - 1, k))];
}

// ---------------------------------------------------------------------------
// Animales salvajes (fase 6): pelaje común
// ---------------------------------------------------------------------------

/** Pelaje: ruido suave más grano fino, lomo algo más claro y vientre/bajos más oscuros. */
function fur(t: Texel, pal: readonly RGB[], seed: number, streak = 1): RGB {
  let v = 0.55 * vnoise(t.x * streak, t.y / streak, t.z * streak, 2.4, seed) + 0.25 * vnoise(t.x, t.y, t.z, 1.1, seed + 1) + 0.2 * rnd(t, seed + 2);
  if (t.f === TOP) v += 0.1;
  if (t.f === BOTTOM) v -= 0.2;
  else if (side(t) && t.y < 1.2) v -= 0.1;
  return tone(pal, clamp01((v - 0.15) / 0.7));
}

// ---------------------------------------------------------------------------
// Zorro
// ---------------------------------------------------------------------------

const FOX_ORANGE: RGB[] = [
  [184, 88, 32],
  [204, 106, 42],
  [222, 124, 54],
  [234, 142, 70],
];
const FOX_WHITE: RGB = [238, 230, 216];
const FOX_WHITE_D: RGB = [214, 204, 190];
const FOX_DARK: RGB = [50, 36, 32];
const FOX_FACE = [
  '........',
  '........',
  '.KK..KK.',
  'ww....ww',
  'wwwwwwww',
  'wwwwwwww',
];

function fox(t: Texel): Paint {
  const seed = 1313;
  const orange = (): RGB => fur(t, FOX_ORANGE, seed);
  const white = (): RGB => (rnd(t, seed + 3) > 0.8 ? FOX_WHITE_D : FOX_WHITE);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(FOX_FACE, t, { K: FOX_DARK, w: white() }) ?? orange();
      if (t.f === BOTTOM) return white();
      if ((t.f === PX || t.f === NX) && t.y < 3) return white();
      return orange();
    case 'snout':
      if (t.f === FRONT) return mapAt(['.KK.', 'wwww'], t, { K: FOX_DARK, w: white() }) ?? orange();
      if (t.f === BOTTOM || ((t.f === PX || t.f === NX) && t.y < 1)) return white();
      return orange();
    case 'ear':
      if (t.y > 1.2 || t.f === TOP) return FOX_DARK;
      return t.f === FRONT ? [60, 44, 40] : orange();
    case 'tail':
      // Punta blanca de la cola.
      if (t.z > 6.5 + (rnd(t, seed + 4) > 0.5 ? 0.6 : 0)) return white();
      return orange();
    case 'leg':
      // Calcetines oscuros.
      if (t.f === BOTTOM) return [34, 26, 24];
      if (t.y < 3.5 + (rnd(t, seed + 5) > 0.6 ? 0.6 : 0)) return FOX_DARK;
      return orange();
    default:
      if (t.f === BOTTOM) return white();
      if (t.f === FRONT && t.y < 4) return white(); // pecho
      return orange();
  }
}

// ---------------------------------------------------------------------------
// Lobo
// ---------------------------------------------------------------------------

const WOLF_GREY: RGB[] = [
  [112, 106, 100],
  [138, 132, 126],
  [164, 158, 152],
  [190, 186, 180],
  [212, 208, 202],
];
const WOLF_DARK: RGB = [44, 40, 38];
const WOLF_LIGHT: RGB = [214, 208, 198];
const WOLF_FACE = [
  '......',
  '......',
  'EK..KE',
  '......',
  'll..ll',
  '......',
];

function wolf(t: Texel): Paint {
  const seed = 1717;
  const grey = (k = 1): RGB => scale(fur(t, WOLF_GREY, seed), k);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(WOLF_FACE, t, { E: [236, 232, 224], K: WOLF_DARK, l: WOLF_LIGHT }) ?? grey();
      if (t.f === BOTTOM) return WOLF_LIGHT;
      return grey();
    case 'snout':
      if (t.f === FRONT) return mapAt(['.K.'], t, { K: WOLF_DARK }) ?? WOLF_LIGHT;
      if (t.f === TOP) return grey(0.95);
      return WOLF_LIGHT;
    case 'ear':
      return t.y > 1.2 || t.f === TOP ? grey(0.75) : grey();
    case 'tail':
      return t.z > 6.5 ? grey(0.7) : grey();
    case 'collar':
      // Fase 6 (gólems/domesticar): collar rojo con una hebilla.
      return t.f === FRONT && t.i >= 3 && t.i <= 5 && t.j >= 3 && t.j <= 4 ? [214, 200, 90] : rnd(t, seed + 11) > 0.8 ? [150, 28, 30] : [182, 36, 36];
    case 'leg':
      if (t.f === BOTTOM || t.y < 1) return [96, 90, 86];
      return side(t) && t.i === t.fw - 1 ? grey(0.92) : grey(1.04);
    case 'mane': {
      // Melena desgreñada: mechones verticales y el cuello claro por delante.
      if (t.f === FRONT && t.y < 3) return WOLF_LIGHT;
      const c = fur(t, WOLF_GREY, seed + 9, 1.8);
      return t.f === TOP ? scale(c, 0.92) : c;
    }
    default:
      // Lomo más oscuro (silla) sobre el cuerpo.
      if (t.f === TOP) return grey(0.8);
      if (t.f === BOTTOM) return WOLF_LIGHT;
      if (side(t) && t.y > 4.5) return grey(0.88);
      return grey();
  }
}

// ---------------------------------------------------------------------------
// Cabra
// ---------------------------------------------------------------------------

const GOAT_FUR: RGB[] = [
  [178, 170, 156],
  [204, 198, 184],
  [224, 220, 208],
  [238, 236, 226],
  [248, 246, 238],
];
const GOAT_FACE = [
  '.....',
  'YK.KY',
  '.....',
  '.....',
  '.nnn.',
  '.nNn.',
];

function goat(t: Texel): Paint {
  const seed = 1414;
  // Pelo largo: vetas verticales.
  const hair = (): RGB => fur(t, GOAT_FUR, seed, 2.2);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        return mapAt(GOAT_FACE, t, { Y: [206, 170, 60], K: [30, 26, 22], n: [196, 184, 170], N: [120, 96, 90] }) ?? hair();
      }
      return hair();
    case 'horn': {
      // Cuerno estriado, más claro hacia la punta.
      const ring = Math.floor(t.y) % 2 === 0 ? 0.92 : 1;
      const base: RGB = t.y > 3.5 ? [196, 186, 164] : [150, 140, 122];
      return scale(base, ring);
    }
    case 'beard':
      return tone(GOAT_FUR, 0.3 + 0.3 * rnd(t, seed + 3));
    case 'ear':
      if (t.f === FRONT || t.f === BOTTOM) return [212, 168, 156];
      return hair();
    case 'leg':
      if (t.f === BOTTOM) return [52, 46, 42];
      if (t.y < 1.5) return [74, 66, 60];
      return hair();
    default:
      if (t.f === BOTTOM) return tone(GOAT_FUR, 0.15);
      // Faldón de pelo más largo y oscuro en los bajos.
      if (side(t) && t.y < 2.5 + (rnd(t, seed + 4) > 0.5 ? 1 : 0)) return tone(GOAT_FUR, 0.1 + 0.2 * rnd(t, seed + 5));
      return hair();
  }
}

// ---------------------------------------------------------------------------
// Oso polar
// ---------------------------------------------------------------------------

const BEAR_FUR: RGB[] = [
  [204, 204, 196],
  [222, 222, 214],
  [236, 236, 230],
  [246, 246, 240],
  [252, 252, 248],
];
const BEAR_MUZZLE: RGB = [226, 222, 208];
const BEAR_FACE = [
  '........',
  '........',
  '........',
  '.KK..KK.',
  '........',
  '........',
  '........',
  '........',
];

function polarBear(t: Texel): Paint {
  const seed = 1515;
  const white = (): RGB => fur(t, BEAR_FUR, seed);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(BEAR_FACE, t, { K: [24, 22, 24] }) ?? white();
      return white();
    case 'snout':
      if (t.f === FRONT) return mapAt(['.KKK.', '..K..', '.....'], t, { K: [30, 28, 30] }) ?? BEAR_MUZZLE;
      return t.f === TOP ? white() : BEAR_MUZZLE;
    case 'ear':
      return t.f === FRONT ? [190, 186, 180] : white();
    case 'leg':
      // Fase 6 (fauna): planta de las patas gris clara (antes casi negra: al andar, la zancada la
      // enseñaba como una mancha negra) y garras claras por delante.
      if (t.f === BOTTOM) return [168, 164, 156];
      if (t.f === FRONT && t.y < 1 && t.i % 2 === 1) return [120, 116, 110];
      return white();
    default:
      return white();
  }
}

// ---------------------------------------------------------------------------
// Conejo
// ---------------------------------------------------------------------------

const RABBIT_BROWN: RGB[] = [
  [104, 76, 52],
  [124, 92, 64],
  [146, 110, 78],
  [166, 130, 94],
];
const RABBIT_CREAM: RGB = [222, 204, 176];
const RABBIT_FACE = ['....', 'K..K', '.nn.', 'cccc'];

function rabbit(t: Texel): Paint {
  const seed = 1616;
  const brown = (): RGB => fur(t, RABBIT_BROWN, seed);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(RABBIT_FACE, t, { K: [26, 20, 18], n: [214, 136, 140], c: RABBIT_CREAM }) ?? brown();
      if (t.f === BOTTOM) return RABBIT_CREAM;
      return brown();
    case 'ear':
      // Interior rosado en la cara delantera.
      if (t.f === FRONT && t.x > 0.5 && t.x < 1.5 && t.y < 3.5) return [218, 150, 150];
      return t.y > 3 ? scale(brown(), 0.85) : brown();
    case 'tail':
      return t.f === BOTTOM ? [226, 222, 214] : [246, 244, 238];
    case 'leg':
      return t.f === BOTTOM || t.y < 1 ? RABBIT_CREAM : brown();
    default:
      if (t.f === BOTTOM) return RABBIT_CREAM;
      return brown();
  }
}

// ---------------------------------------------------------------------------
// Fase 6 (monturas): caballo (7 colores × 5 marcas), burro, mula, llama (4 colores), camello y la
// silla de montar (también la del cerdo).
// ---------------------------------------------------------------------------

const SADDLE_LEATHER: RGB[] = [
  [84, 46, 24],
  [102, 58, 30],
  [120, 70, 38],
  [138, 84, 46],
];
const SADDLE_BLANKET: RGB[] = [
  [164, 44, 36],
  [214, 150, 48],
  [48, 84, 150],
];

/** Silla de cuero con el borde cosido más oscuro, estribos de hierro y, si es alta (camello), manta. */
function saddlePaint(t: Texel): RGB {
  if (t.g === 'stirrup') {
    if (t.y < 2) return t.f === BOTTOM || t.f === TOP ? [120, 120, 126] : [168, 168, 176];
    return [66, 38, 20];
  }
  const c = tone(SADDLE_LEATHER, clamp01(0.25 + 0.5 * vnoise(t.x, t.y, t.z, 2, 4242) + 0.25 * rnd(t, 4243)));
  if (t.h >= 5 && side(t) && t.y < t.h - 3) {
    // Manta bajo la silla del camello: franjas de colores.
    return scale(SADDLE_BLANKET[Math.floor(t.y) % SADDLE_BLANKET.length], 0.9 + 0.15 * rnd(t, 4244));
  }
  const edge = t.f === TOP ? t.x < 1 || t.x > t.w - 1 || t.z < 1 || t.z > t.d - 1 : t.y < 1;
  if (edge) return scale(c, 0.68);
  if (t.f === TOP && t.z > t.d * 0.25 && t.z < t.d * 0.75) return scale(c, 0.85); // asiento
  return c;
}

const HORSE_COATS: RGB[][] = [
  [[206, 204, 198], [222, 220, 214], [234, 232, 228], [244, 243, 240]],
  [[186, 150, 104], [204, 170, 122], [218, 186, 138], [230, 202, 156]],
  [[126, 70, 36], [146, 84, 44], [164, 98, 54], [180, 112, 64]],
  [[92, 60, 36], [108, 72, 44], [124, 84, 52], [138, 96, 60]],
  [[26, 24, 26], [36, 34, 36], [46, 44, 46], [58, 56, 58]],
  [[98, 96, 96], [116, 114, 114], [134, 132, 132], [150, 148, 148]],
  [[56, 38, 26], [66, 46, 32], [78, 56, 38], [90, 66, 46]],
];
const HORSE_MANES: RGB[] = [[204, 202, 196], [150, 112, 70], [84, 44, 22], [48, 32, 20], [18, 16, 18], [58, 56, 56], [34, 24, 18]];
const HORSE_WHITE: RGB = [236, 234, 228];
const HORSE_BLACK: RGB = [30, 26, 24];

interface HorseStyle {
  coat: readonly RGB[];
  mane: RGB;
  /** 0 sin marcas, 1 calcetines y lucero, 2 manchas blancas, 3 lunares blancos, 4 lunares negros. */
  marks: number;
  seed: number;
  /** Hocico más claro (burros y mulas). */
  muzzle?: RGB;
  /** Raya oscura en el lomo (burro). */
  dorsal?: boolean;
}

function horseLike(t: Texel, st: HorseStyle): Paint {
  const base = (): RGB => fur(t, st.coat, st.seed, 0.8);
  const coated = (c: RGB): RGB => {
    switch (st.marks) {
      case 1:
        if (t.g === 'leg' && t.y < 4.5 + (rnd(t, st.seed + 6) > 0.6 ? 0.6 : 0)) return HORSE_WHITE;
        if (t.g === 'mouth' && t.f === TOP && Math.abs(t.x - t.w / 2) < 1) return HORSE_WHITE;
        if (t.g === 'head' && (t.f === TOP || t.f === FRONT) && Math.abs(t.x - t.w / 2) < 1) return HORSE_WHITE;
        return c;
      case 2:
        return vnoise(t.x, t.y, t.z + (t.g === 'body' ? 0 : 40), 4, st.seed + 7) > 0.62 ? HORSE_WHITE : c;
      case 3:
        return t.g !== 'mouth' && rnd(t, st.seed + 8) > 0.9 ? HORSE_WHITE : c;
      case 4:
        return t.g !== 'mouth' && rnd(t, st.seed + 9) > 0.9 ? HORSE_BLACK : c;
      default:
        return c;
    }
  };
  switch (t.g) {
    case 'saddle':
    case 'stirrup':
      return saddlePaint(t);
    case 'mane':
      return scale(st.mane, 0.85 + 0.3 * rnd(t, st.seed + 3));
    case 'tail':
      return scale(st.mane, 0.8 + 0.35 * vnoise(t.x, t.y * 0.4, t.z, 1.2, st.seed + 4));
    case 'leg':
      if (t.y < 1.5) return t.f === BOTTOM ? [40, 36, 34] : [62, 56, 50]; // cascos
      return coated(base());
    case 'mouth': {
      if (t.f === FRONT) {
        const n = mapAt(['....', 'N..N', '....', '.mm.'], t, { N: [22, 18, 18], m: scale(st.muzzle ?? base(), 0.7) });
        if (n) return n;
      }
      const c = st.muzzle ? scale(st.muzzle, 0.9 + 0.15 * rnd(t, st.seed + 5)) : base();
      return coated(t.y < 1 ? scale(c, 0.85) : c);
    }
    case 'head':
      // Ojos a los lados, cerca del hocico; flequillo de la crin arriba.
      if ((t.f === PX || t.f === NX) && Math.abs(t.z - 1.5) < 0.6 && Math.abs(t.y - 2.5) < 0.6) return [18, 14, 14];
      if (t.f === TOP && Math.abs(t.x - t.w / 2) < 1 && t.z > t.d * 0.4) return st.mane;
      return coated(base());
    case 'ear':
      if (t.f === FRONT) return scale(base(), 0.7);
      return t.y > t.h - 1.5 && st.dorsal ? HORSE_BLACK : scale(base(), 0.92);
    default:
      if (st.dorsal && t.g === 'body' && t.f === TOP && Math.abs(t.x - t.w / 2) < 1) return scale(st.mane, 1.1);
      if (st.muzzle && t.f === BOTTOM) return scale(st.muzzle, 0.95);
      return coated(base());
  }
}

function horsePainter(variant: number): Painter {
  const n = HORSE_COATS.length;
  const color = ((variant % n) + n) % n;
  const marks = Math.floor(Math.max(0, variant) / n) % 5;
  const st: HorseStyle = { coat: HORSE_COATS[color], mane: HORSE_MANES[color], marks, seed: 2525 + color };
  return (t) => horseLike(t, st);
}

const DONKEY_STYLE: HorseStyle = {
  coat: [[98, 88, 78], [116, 106, 94], [132, 122, 110], [146, 136, 124]], mane: [52, 44, 38], marks: 0, seed: 2626,
  muzzle: [196, 188, 176], dorsal: true,
};
const MULE_STYLE: HorseStyle = {
  coat: [[78, 50, 32], [92, 60, 38], [106, 70, 46], [120, 82, 54]], mane: [38, 26, 18], marks: 0, seed: 2727,
  muzzle: [150, 120, 96],
};

const LLAMA_COATS: RGB[][] = [
  [[196, 176, 136], [212, 194, 154], [224, 208, 170], [236, 222, 186]],
  [[214, 212, 204], [228, 226, 220], [238, 236, 232], [248, 247, 244]],
  [[106, 74, 48], [122, 88, 58], [138, 100, 68], [154, 114, 80]],
  [[118, 114, 108], [136, 132, 126], [152, 148, 142], [168, 164, 158]],
];

function llama(t: Texel, coat: readonly RGB[]): Paint {
  const wool = (): RGB => fur(t, coat, 2828, 1.6);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(['........', '........', '.K....K.', '........', '........', '........'], t, { K: [20, 16, 14] }) ?? wool();
      return wool();
    case 'snout':
      if (t.f === FRONT) return mapAt(['....', 'N..N', '....', '.mm.'], t, { N: [30, 24, 20], m: scale(coat[0], 0.6) }) ?? scale(wool(), 1.04);
      return scale(wool(), 1.04);
    case 'ear':
      return t.f === FRONT ? scale(coat[0], 0.75) : scale(wool(), 0.92);
    case 'leg':
      if (t.y < 1) return t.f === BOTTOM ? [46, 40, 36] : [70, 60, 52];
      return wool();
    default:
      return wool();
  }
}

const CAMEL_FUR: RGB[] = [
  [170, 128, 78],
  [188, 146, 92],
  [204, 162, 108],
  [216, 176, 122],
];

function camel(t: Texel): Paint {
  const hair = (k = 1): RGB => scale(fur(t, CAMEL_FUR, 2929, 1), k);
  switch (t.g) {
    case 'saddle':
    case 'stirrup':
      return saddlePaint(t);
    case 'head':
      if ((t.f === PX || t.f === NX) && Math.abs(t.z - 4.5) < 0.6 && Math.abs(t.y - 3.5) < 0.6) return [22, 16, 12];
      if (t.f === FRONT) return mapAt(['......', '.N..N.', '......', '.mmmm.', '......'], t, { N: [40, 28, 18], m: [96, 70, 44] }) ?? hair(1.05);
      return t.z < 3 ? hair(1.05) : hair();
    case 'hump':
      return scale(fur(t, CAMEL_FUR, 2930, 1.8), 0.92);
    case 'ear':
      return hair(0.85);
    case 'tail':
      return t.y < 2.5 ? [88, 64, 40] : hair(0.95);
    case 'leg':
      if (t.y < 1.5) return t.f === BOTTOM ? [96, 74, 50] : [120, 94, 64]; // almohadillas
      if (t.y > 7 && t.y < 9.5) return hair(0.82); // rodillas
      return hair();
    default:
      if (t.f === BOTTOM) return hair(0.85);
      return hair();
  }
}

/** Pintores con varios pelajes: reciben el número de pelaje. */
const VARIANT_PAINTERS: Record<number, (variant: number) => Painter> = {
  [MOB_HORSE]: horsePainter,
  [MOB_LLAMA]: (v) => (t) => llama(t, LLAMA_COATS[((v % LLAMA_COATS.length) + LLAMA_COATS.length) % LLAMA_COATS.length]),
  [MOB_FROG]: (v) => frogPainter(v) as Painter, // las tres variedades de rana
  [MOB_WITHER]: (v) => witherPainter(v), // Fase 8.7: el Wither (1: invulnerable)
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const PAINTERS: Record<number, Painter> = {
  [MOB_PIG]: (t) => (t.g === 'saddle' ? saddlePaint(t) : pig(t)), // Fase 6 (monturas): con silla
  [MOB_COW]: cow,
  [MOB_SHEEP]: sheep,
  [MOB_CHICKEN]: chicken,
  [MOB_ZOMBIE]: (t) => zombieLike(t, ZOMBIE_STYLE),
  [MOB_HUSK]: (t) => zombieLike(t, HUSK_STYLE),
  [MOB_SKELETON]: (t) => skeletonLike(t, SKELETON_STYLE),
  [MOB_STRAY]: (t) => skeletonLike(t, STRAY_STYLE),
  [MOB_CREEPER]: creeper,
  [MOB_SPIDER]: spider,
  [MOB_ENDERMAN]: enderman,
  [MOB_SQUID]: squid,
  [MOB_FOX]: fox,
  [MOB_GOAT]: goat,
  [MOB_POLAR_BEAR]: polarBear,
  [MOB_RABBIT]: rabbit,
  [MOB_WOLF]: wolf,
  // Fase 6 (monturas)
  [MOB_DONKEY]: (t) => horseLike(t, DONKEY_STYLE),
  [MOB_MULE]: (t) => horseLike(t, MULE_STYLE),
  [MOB_CAMEL]: camel,
  // Fase 6 (acuáticos).
  ...AQUATIC_PAINTERS,
};

/** Genera el atlas de una criatura (tamaño MOBS[id].atlas); `variant`: pelaje o profesión. */
export function generateMobTexture(mobId: number, variant = 0): MobTexture {
  // Fase 6 (fauna): abejas, pandas, loros y armadillos; la variante es el color del loro o la abeja
  // enfadada o con néctar.
  const fauna = faunaPainter(mobId, variant);
  if (fauna) return paintMob(mobId, fauna);
  // Fase 7.5 (fauna): murciélago, ocelote, champiñaca (roja o marrón), llama de comerciante y caballos no muertos.
  const critter = critterTexture(mobId, variant);
  if (critter) return critter;
  const nether = netherTexture(mobId, variant); // Fase 8.3 (criaturas del Nether)
  if (nether) return nether;
  const mob = MOBS[mobId];
  // Fase 6 (aldeanos): el aldeano y el comerciante se pintan según su profesión (villagerTextures.ts).
  if (mob && isVillagerType(mobId)) return paintMob(mobId, villagerPainter(mobId, variant));
  const painter = VARIANT_PAINTERS[mobId]?.(variant) ?? PAINTERS[mobId] ?? MONSTER_PAINTERS[mobId] ?? ILLAGER_PAINTERS[mobId] ?? OCEAN_PAINTERS[mobId] // Fase 6 (monturas): pelajes
    ?? ALLAY_PAINTERS[mobId] ?? WARDEN_PAINTERS[mobId]; // Fase 7.5 (mansión, abismo)
  if (!mob || !painter) throw new Error('Criatura sin textura: ' + mobId);
  return paintMob(mobId, painter);
}

// Fase 6: utilidades de pintado para villagerTextures.ts (aldeanos), monsterTextures.ts (monstruos) y
// companionTextures.ts (gólems y gatos).
export {
  paintMob, mapAt, vnoise, rnd, glow, zombieLike, fur, side, tone, clamp01, scale, scale as scaleRGB,
  PX, NX, TOP, BOTTOM, FRONT, BACK,
  saddlePaint, llama, LLAMA_COATS, // Fase 7.5 (fauna): llama de comerciante y caballos no muertos
};
export type { Texel, Paint, Painter, RGB, RGB as MobRGB, ZombieStyle };
/** Fase 7.5 (abismo): téxel transparente. */
export const CLEAR: Clear = { clear: true };
