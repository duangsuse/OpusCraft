// Fase 6 (gólems/domesticar): texturas procedurales del gólem de hierro, del gólem de nieve y de los
// gatos (cinco pieles). Usan el mismo pintado por téxel que mobTextures.ts.
//
// Las pieles se piden con una clave: id de la criatura + piel · 1000 (ver skinKey); la piel 0 es el id.
import { MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT } from '../../shared/mobs';
import { CAT_SKINS, skinKey } from '../../shared/companions';
import {
  paintMob, fur, rnd, vnoise, mapAt, scale, side, tone, clamp01, TOP, BOTTOM, FRONT, BACK,
  type Texel, type Paint, type RGB, type MobTexture,
} from './mobTextures';

export { skinKey };

/** Textura de un gólem o de un gato (clave de skinKey); null si la criatura no es de este módulo. */
export function companionTexture(key: number): MobTexture | null {
  const type = key % 1000, variant = Math.floor(key / 1000);
  if (type === MOB_IRON_GOLEM) return paintMob(type, ironGolem);
  if (type === MOB_SNOW_GOLEM) return paintMob(type, snowGolem);
  if (type === MOB_CAT) return paintMob(type, (t) => cat(t, CAT_STYLES[variant % CAT_STYLES.length]));
  return null;
}

// ---------------------------------------------------------------------------
// Gólem de hierro
// ---------------------------------------------------------------------------

const IRON: RGB[] = [
  [128, 124, 118],
  [152, 148, 140],
  [176, 172, 164],
  [198, 194, 186],
  [216, 212, 204],
];
const IRON_SEAM: RGB = [98, 94, 90];
const VINE: RGB[] = [
  [52, 92, 34],
  [70, 118, 44],
  [92, 142, 56],
];
const RUST: RGB = [150, 104, 70];
const GOLEM_FACE = [
  '........',
  '........',
  'bbbbbbbb',
  '.KR..RK.',
  '.KK..KK.',
  '........',
  '........',
  '..mmmm..',
  '........',
  '........',
];

function metal(t: Texel, seed: number): RGB {
  const v = 0.6 * vnoise(t.x, t.y, t.z, 3, seed) + 0.4 * rnd(t, seed + 1);
  let c = tone(IRON, clamp01((v - 0.1) / 0.8));
  if (t.f === TOP) c = scale(c, 1.06);
  if (t.f === BOTTOM) c = scale(c, 0.8);
  if (rnd(t, seed + 2) > 0.988) c = RUST;
  return c;
}

/** Enredaderas: franjas verdes que bajan por el cuerpo y las piernas. */
function vine(t: Texel, seed: number): RGB | null {
  if (!side(t)) return null;
  const n = vnoise(t.x * 2.5, t.y * 0.35, t.z * 2.5, 2, seed);
  return n > 0.72 ? VINE[Math.min(2, Math.floor((n - 0.72) * 11))] : null;
}

function ironGolem(t: Texel): Paint {
  const seed = 2020;
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(GOLEM_FACE, t, { b: scale(metal(t, seed), 0.72), K: [40, 36, 34], R: [170, 30, 26], m: IRON_SEAM }) ?? metal(t, seed);
      return metal(t, seed);
    case 'nose':
      return scale(metal(t, seed + 5), 1.05);
    case 'body': {
      // Placas del pecho con juntas y enredaderas por los lados.
      const v = vine(t, seed + 7);
      if (v) return v;
      if (t.f === FRONT && (Math.abs(t.x - t.w / 2) < 0.6 || Math.abs(t.y - 6) < 0.5)) return IRON_SEAM;
      return metal(t, seed + 3);
    }
    case 'waist':
      return scale(metal(t, seed + 4), 0.9);
    case 'arm':
      if (t.y < 2.5) return scale(metal(t, seed + 6), 0.82); // manos
      if (Math.abs(t.y - 20) < 0.5) return IRON_SEAM; // codo
      return metal(t, seed + 6);
    default: {
      // Piernas.
      const v = vine(t, seed + 9);
      if (v) return v;
      if (t.f === BOTTOM) return IRON_SEAM;
      return metal(t, seed + 8);
    }
  }
}

// ---------------------------------------------------------------------------
// Gólem de nieve
// ---------------------------------------------------------------------------

const SNOW: RGB[] = [
  [206, 216, 228],
  [222, 230, 240],
  [236, 242, 248],
  [248, 250, 252],
];
const PUMPKIN: RGB[] = [
  [178, 94, 18],
  [206, 116, 24],
  [228, 138, 34],
  [240, 156, 46],
];
const PUMPKIN_FACE = [
  '........',
  '.KK..KK.',
  '.KK..KK.',
  '........',
  '.KKKKKK.',
  '.K.KK.K.',
  '........',
  '........',
];

function snowGolem(t: Texel): Paint {
  const seed = 2121;
  switch (t.g) {
    case 'head': {
      if (t.f === FRONT) {
        const face = mapAt(PUMPKIN_FACE, t, { K: [58, 30, 10] });
        if (face) return face;
      }
      if (t.f === TOP) {
        // Tallo en el centro de la tapa.
        if (Math.abs(t.x - 4) < 1 && Math.abs(t.z - 4) < 1) return [92, 70, 30];
        return tone(PUMPKIN, clamp01(0.4 + rnd(t, seed) * 0.3));
      }
      // Gajos verticales.
      const ridge = side(t) ? (Math.floor((t.f === FRONT || t.f === BACK ? t.x : t.z) / 2) % 2) * 0.25 : 0;
      return tone(PUMPKIN, clamp01(0.35 + ridge + rnd(t, seed + 1) * 0.3 - (t.f === BOTTOM ? 0.3 : 0)));
    }
    case 'arm':
      return rnd(t, seed + 2) > 0.7 ? [74, 50, 28] : [98, 68, 38];
    default: {
      const v = 0.55 * vnoise(t.x, t.y, t.z, 2.5, seed + 3) + 0.45 * rnd(t, seed + 4);
      let c = tone(SNOW, clamp01(v));
      if (t.f === BOTTOM) c = scale(c, 0.86);
      return c;
    }
  }
}

// ---------------------------------------------------------------------------
// Gato
// ---------------------------------------------------------------------------

interface CatStyle {
  pal: RGB[];
  /** Rayas (atigrado) o nada. */
  stripe: RGB | null;
  /** Vientre, pecho y hocico. */
  belly: RGB;
  eye: RGB;
  /** Siamés: cara, orejas, patas y cola oscuras. */
  points?: RGB;
}

const CAT_STYLES: CatStyle[] = [
  // atigrado
  { pal: [[120, 104, 84], [142, 124, 100], [162, 144, 118]], stripe: [70, 58, 46], belly: [214, 204, 186], eye: [120, 180, 60] },
  // pelirrojo
  { pal: [[204, 118, 48], [224, 140, 62], [238, 160, 80]], stripe: [176, 88, 34], belly: [244, 222, 190], eye: [196, 170, 40] },
  // negro
  { pal: [[26, 24, 28], [36, 34, 38], [48, 46, 52]], stripe: null, belly: [44, 42, 48], eye: [150, 200, 60] },
  // siamés
  { pal: [[216, 204, 178], [230, 220, 198], [240, 232, 214]], stripe: null, belly: [244, 238, 226], eye: [80, 140, 220], points: [78, 58, 46] },
  // blanco
  { pal: [[218, 216, 212], [232, 230, 226], [244, 242, 238]], stripe: null, belly: [248, 246, 242], eye: [90, 150, 230] },
];
if (CAT_STYLES.length !== CAT_SKINS.length) throw new Error('Pieles de gato desalineadas');

function cat(t: Texel, st: CatStyle): Paint {
  const seed = 2222;
  const coat = (): RGB => {
    const c = fur(t, st.pal, seed);
    // Rayas transversales (lomo y costados) en los atigrados.
    if (st.stripe && t.f !== BOTTOM && (Math.floor(t.z * 0.9 + vnoise(t.x, t.y, t.z, 2, seed + 1) * 1.5) % 3 === 0)) return st.stripe;
    return c;
  };
  const point = (base: () => RGB): RGB => st.points ?? base();
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        const face = mapAt(['.....', '.E.E.', '.....', '.....'], t, { E: st.eye });
        if (face) return face;
        return st.points ? scale(st.points, 1.1) : coat();
      }
      if (t.f === BOTTOM) return st.belly;
      return point(coat);
    case 'snout':
      if (t.f === FRONT) return mapAt(['.n.'], t, { n: [214, 130, 140] }) ?? (st.points ? scale(st.points, 1.25) : st.belly);
      return st.points ?? st.belly;
    case 'ear':
      if (t.f === FRONT) return [206, 140, 146];
      return point(coat);
    case 'tail':
      if (st.stripe && Math.floor(t.z) % 2 === 0) return st.stripe;
      return point(coat);
    case 'leg':
      if (t.f === BOTTOM) return [200, 150, 150];
      if (st.points) return st.points;
      return t.y < 1.5 ? st.belly : coat();
    case 'collar':
      return rnd(t, seed + 5) > 0.8 ? [150, 28, 30] : [182, 36, 36];
    default:
      if (t.f === BOTTOM) return st.belly;
      if (t.f === FRONT) return st.belly; // pecho
      return coat();
  }
}
