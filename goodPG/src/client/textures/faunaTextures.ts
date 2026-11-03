// Texturas procedurales de la fauna de la fase 6 (mismo sistema de cajas que mobTextures.ts):
// abeja (normal, enfadada, con polen), panda, loro (cinco colores) y armadillo.
import { MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO } from '../../shared/mobs';
import {
  fur, mapAt, tone, side, rnd, vnoise, scale, clamp01, PX, NX, TOP, BOTTOM, FRONT, BACK, type Texel, type Paint, type Painter, type RGB,
} from './mobTextures';

// ---------------------------------------------------------------------------
// Abeja
// ---------------------------------------------------------------------------

const BEE_YELLOW: RGB[] = [
  [214, 160, 28],
  [232, 182, 36],
  [244, 200, 52],
  [252, 216, 76],
];
const BEE_BLACK: RGB = [44, 30, 20];
const BEE_BROWN: RGB = [86, 58, 30];
const BEE_FACE = [
  '.......',
  'KK...KK',
  'KE...EK',
  'KK...KK',
  '.......',
  '.......',
  '.......',
];

/** Variante: bit 1 = enfadada (ojos rojos), bit 2 = cargada de polen. */
function bee(variant: number): Painter {
  const angry = (variant & 1) !== 0;
  const pollen = (variant & 2) !== 0;
  return (t) => {
    const seed = 5050;
    const yellow = (): RGB => fur(t, BEE_YELLOW, seed);
    switch (t.g) {
      case 'body': {
        if (t.f === FRONT) {
          return mapAt(BEE_FACE, t, { K: BEE_BLACK, E: angry ? [220, 40, 30] : [250, 250, 250] }) ?? yellow();
        }
        if (t.f === BACK) return yellow();
        // Franjas negras a lo largo del cuerpo (la cara queda amarilla).
        const stripe = (t.z > 3 && t.z < 4.6) || (t.z > 6.2 && t.z < 7.8);
        let c: RGB = stripe ? BEE_BLACK : yellow();
        if (t.f === BOTTOM) c = scale(c, 0.85);
        // Granos de polen pegados al pelo.
        if (pollen && t.f !== BOTTOM && rnd(t, seed + 7) > 0.82) c = rnd(t, seed + 8) > 0.5 ? [255, 226, 96] : [250, 170, 40];
        return c;
      }
      case 'stinger':
        return t.z > 1 ? [150, 140, 120] : [70, 60, 50];
      case 'antenna':
        return BEE_BLACK;
      case 'wing': {
        // Alas claras con nervios.
        const vein = t.i % 3 === 0 || t.j === 2;
        return vein ? [178, 200, 214] : [222, 236, 244];
      }
      case 'leg':
        return t.f === BOTTOM ? BEE_BLACK : BEE_BROWN;
      default:
        return yellow();
    }
  };
}

// ---------------------------------------------------------------------------
// Panda
// ---------------------------------------------------------------------------

const PANDA_WHITE: RGB[] = [
  [214, 212, 204],
  [230, 228, 222],
  [242, 240, 234],
  [250, 250, 246],
];
const PANDA_BLACK: RGB[] = [
  [22, 20, 22],
  [32, 30, 32],
  [42, 40, 42],
  [54, 52, 54],
];
const PANDA_FACE = [
  '...........',
  '...........',
  '.PP.....PP.',
  'PPEP...PEPP',
  'PPPP...PPPP',
  '.PP.....PP.',
  '...........',
  '...........',
  '...........',
];

function panda(t: Texel): Paint {
  const seed = 5151;
  const white = (): RGB => fur(t, PANDA_WHITE, seed);
  const black = (): RGB => fur(t, PANDA_BLACK, seed + 1);
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) return mapAt(PANDA_FACE, t, { P: black(), E: [70, 66, 70] }) ?? white();
      return white();
    case 'nose':
      if (t.f === FRONT) return mapAt(['.KKK.', '..K..', '.....'], t, { K: [20, 18, 20] }) ?? [236, 234, 228];
      return t.f === TOP ? white() : [228, 226, 220];
    case 'ear':
      return black();
    case 'leg':
      if (t.f === BOTTOM) return [70, 66, 66];
      return black();
    case 'tail':
      return white();
    default: {
      // Banda negra sobre los hombros que da la vuelta al cuerpo; el resto, blanco.
      const band = t.z < 8 - (rnd(t, seed + 5) > 0.6 ? 0.5 : 0);
      if (t.f === FRONT) return black();
      return band ? black() : white();
    }
  }
}

// ---------------------------------------------------------------------------
// Loro
// ---------------------------------------------------------------------------

interface ParrotColors {
  body: RGB;
  head: RGB;
  wing: RGB;
  tip: RGB;
  crest: RGB;
  cheek?: RGB;
}

/** Rojo, azul, verde, cian y gris (el orden de parrotVariant). */
const PARROTS: ParrotColors[] = [
  { body: [196, 30, 24], head: [214, 44, 32], wing: [40, 110, 204], tip: [250, 208, 40], crest: [214, 44, 32] },
  { body: [40, 86, 214], head: [60, 108, 228], wing: [28, 58, 170], tip: [236, 204, 48], crest: [60, 108, 228] },
  { body: [96, 184, 40], head: [132, 206, 58], wing: [58, 136, 28], tip: [40, 92, 182], crest: [226, 64, 40] },
  { body: [48, 190, 214], head: [240, 216, 60], wing: [28, 144, 184], tip: [36, 80, 170], crest: [240, 216, 60] },
  { body: [168, 168, 170], head: [236, 236, 236], wing: [118, 118, 122], tip: [70, 70, 76], crest: [196, 196, 198], cheek: [236, 140, 60] },
];

function shade(c: RGB, t: Texel, seed: number): RGB {
  const v = 0.6 * vnoise(t.x, t.y, t.z, 1.6, seed) + 0.4 * rnd(t, seed + 1);
  let k = 0.86 + 0.22 * v;
  if (t.f === BOTTOM) k *= 0.82;
  return scale(c, k);
}

function parrot(variant: number): Painter {
  const col = PARROTS[variant % PARROTS.length];
  return (t) => {
    const seed = 5252 + variant;
    switch (t.g) {
      case 'head': {
        // Ojos a los lados de la cabeza, con un anillo claro.
        if ((t.f === PX || t.f === NX) && t.z < 1 && t.y > 1 && t.y < 2) return [16, 14, 14];
        if ((t.f === PX || t.f === NX) && t.z < 1.2 && t.y > 0.8 && t.y < 2.4) return [236, 232, 220];
        if (col.cheek && (t.f === PX || t.f === NX) && t.y < 1) return col.cheek;
        return shade(col.head, t, seed);
      }
      case 'beak':
        return t.y < 1 ? [52, 48, 46] : [84, 78, 74];
      case 'crest':
        return shade(col.crest, t, seed + 2);
      case 'wing':
        // Puntas de las plumas de otro color.
        if (t.y < 1.6) return shade(col.tip, t, seed + 3);
        return side(t) && t.y < 2.6 && rnd(t, seed + 4) > 0.5 ? shade(col.tip, t, seed + 3) : shade(col.wing, t, seed + 5);
      case 'tail':
        return t.y < 1.2 ? shade(col.tip, t, seed + 6) : shade(col.wing, t, seed + 7);
      case 'leg':
        return t.f === BOTTOM ? [80, 74, 70] : [112, 104, 98];
      default:
        return shade(col.body, t, seed + 8);
    }
  };
}

// ---------------------------------------------------------------------------
// Armadillo
// ---------------------------------------------------------------------------

const SHELL: RGB[] = [
  [140, 84, 70],
  [166, 104, 86],
  [188, 124, 102],
  [206, 144, 120],
];
const ARMADILLO_SKIN: RGB = [222, 170, 150];
const ARMADILLO_SKIN_D: RGB = [196, 142, 124];

function armadillo(t: Texel): Paint {
  const seed = 5353;
  /** Caparazón: bandas transversales (juntas oscuras cada 2 px) y placas con relieve. */
  const shell = (): RGB => {
    const v = 0.5 * vnoise(t.x, t.y, t.z, 1.3, seed) + 0.5 * rnd(t, seed + 1);
    // Bandas transversales que alternan tono; el borde de abajo, más oscuro.
    if (side(t) && t.y < 1) return scale(SHELL[0], 0.9);
    const band = Math.floor(t.z / 1.5) % 2 === 0;
    return band ? tone(SHELL, clamp01(0.05 + v * 0.35)) : tone(SHELL, clamp01(0.55 + v * 0.45));
  };
  switch (t.g) {
    case 'body':
      if (t.f === BOTTOM) return rnd(t, seed + 2) > 0.7 ? ARMADILLO_SKIN_D : ARMADILLO_SKIN;
      if (t.f === BACK && t.j > 1 && t.i > 1 && t.i < t.fw - 2) return tone(SHELL, 0.1 + 0.3 * rnd(t, seed + 6));
      // Borde del caparazón más oscuro en los extremos.
      if ((t.f === FRONT || t.f === BACK) && (t.j === 0 || t.i === 0 || t.i === t.fw - 1)) return SHELL[0];
      if (t.f === FRONT || t.f === BACK) return tone(SHELL, 0.2 + 0.4 * rnd(t, seed + 3));
      return shell();
    case 'head':
      if ((t.f === PX || t.f === NX) && t.z > 0.8 && t.z < 2 && t.y > 2 && t.y < 3) return [24, 18, 18];
      if (t.f === FRONT && t.y < 1) return [150, 96, 88];
      return t.f === TOP ? tone(SHELL, 0.6) : ARMADILLO_SKIN;
    case 'ear':
      return t.f === FRONT ? [178, 110, 102] : ARMADILLO_SKIN_D;
    case 'tail':
      return Math.floor(t.z) % 2 === 0 ? SHELL[1] : SHELL[2];
    case 'leg':
      if (t.f === BOTTOM || t.y < 0.8) return [96, 70, 60];
      return ARMADILLO_SKIN_D;
    default:
      return ARMADILLO_SKIN;
  }
}

/** Pintor de una criatura de la fauna nueva (null si no es de las suyas). */
export function faunaPainter(mobId: number, variant: number): Painter | null {
  switch (mobId) {
    case MOB_BEE:
      return bee(variant);
    case MOB_PANDA:
      return panda;
    case MOB_PARROT:
      return parrot(variant);
    case MOB_ARMADILLO:
      return armadillo;
    default:
      return null;
  }
}
