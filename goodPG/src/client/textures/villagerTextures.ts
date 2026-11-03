// Texturas de los aldeanos (fase 6): la misma cara (piel tostada, cejijunto, ojos verdes y nariz
// grande) y una ropa distinta por profesión: color de la túnica, ribete, delantal, cinturón y
// sombrero o cinta, sobre la ropa del tipo de aldeano (la de su bioma). El comerciante ambulante lleva túnica y capucha
// azules.
import { MOB_WANDERING_TRADER } from '../../shared/mobs';
import {
  PROF_FARMER, PROF_BUTCHER, PROF_ARMORER, PROF_MASON, PROF_LIBRARIAN, PROF_CARTOGRAPHER, PROF_FLETCHER, PROF_FISHERMAN,
  PROF_SHEPHERD, PROF_WEAPONSMITH, PROF_TOOLSMITH, PROF_LEATHERWORKER, PROF_CLERIC,
} from '../../shared/villagers';
import { variantProf, variantType, VT_DESERT, VT_JUNGLE, VT_PLAINS, VT_SAVANNA, VT_SNOW, VT_SWAMP, VT_TAIGA } from '../../shared/villagerTypes';
import {
  mapAt, vnoise, rnd, scaleRGB as scale, PX, NX, TOP, BOTTOM, FRONT, BACK, type Texel, type Paint, type Painter,
  type MobRGB as RGB,
} from './mobTextures';

interface Outfit {
  robe: RGB;
  trim: RGB;
  /** Delantal (parte delantera de la túnica). */
  apron?: RGB;
  /** Manchas del delantal (carnicero). */
  stain?: RGB;
  belt?: RGB;
  /** Sombrero (arriba de la cabeza y el borde) o cinta (una franja alrededor). */
  hat?: RGB;
  band?: RGB;
  /** Capucha: cubre arriba, detrás y los lados de la cabeza. */
  hood?: RGB;
  /** Parche en el ojo (herrero de armas). */
  patch?: boolean;
}

const BROWN: RGB = [104, 74, 52];

const OUTFITS: Record<number, Outfit> = {
  0: { robe: BROWN, trim: [84, 58, 40] },
  [PROF_FARMER]: { robe: [120, 92, 58], trim: [96, 70, 44], hat: [206, 178, 96], belt: [74, 52, 34] },
  [PROF_BUTCHER]: { robe: BROWN, trim: [150, 40, 36], apron: [232, 230, 224], stain: [170, 44, 40], band: [170, 44, 40] },
  [PROF_ARMORER]: { robe: [66, 66, 72], trim: [40, 40, 44], apron: [46, 46, 50], band: [30, 30, 34] },
  [PROF_MASON]: { robe: BROWN, trim: [70, 50, 36], apron: [150, 150, 152], belt: [60, 44, 30] },
  [PROF_LIBRARIAN]: { robe: [220, 210, 180], trim: [150, 40, 38], hat: [150, 40, 38] },
  [PROF_CARTOGRAPHER]: { robe: [58, 68, 108], trim: [204, 172, 64], belt: [204, 172, 64] },
  [PROF_FLETCHER]: { robe: [72, 110, 60], trim: [46, 76, 38], hat: [72, 110, 60], belt: [110, 80, 48] },
  [PROF_FISHERMAN]: { robe: [96, 112, 128], trim: [66, 80, 96], hat: [150, 160, 170] },
  [PROF_SHEPHERD]: { robe: [150, 112, 74], trim: [240, 236, 226], apron: [240, 236, 226], hat: [240, 236, 226] },
  [PROF_WEAPONSMITH]: { robe: [50, 48, 54], trim: [150, 40, 38], belt: [150, 40, 38], patch: true },
  [PROF_TOOLSMITH]: { robe: BROWN, trim: [60, 60, 66], apron: [70, 52, 36], belt: [40, 40, 44] },
  [PROF_LEATHERWORKER]: { robe: BROWN, trim: [150, 104, 60], apron: [150, 104, 60], belt: [90, 62, 36] },
  // El clérigo: túnica morada con ribete dorado.
  [PROF_CLERIC]: { robe: [104, 56, 132], trim: [214, 176, 72], belt: [214, 176, 72] },
};

/**
 * Ropa de cada tipo de aldeano (la de su bioma, VillagerType): la del parado y, debajo de la del oficio, la túnica (si
 * el oficio no la cambia) y lo que lleva en la cabeza (si el oficio no lleva sombrero).
 */
const TYPE_OUTFITS: Record<number, Outfit> = {
  [VT_PLAINS]: { robe: BROWN, trim: [84, 58, 40] },
  [VT_DESERT]: { robe: [196, 168, 116], trim: [168, 64, 44], hood: [214, 190, 140], belt: [168, 64, 44] },
  [VT_JUNGLE]: { robe: [96, 116, 58], trim: [70, 52, 34], band: [72, 150, 52], belt: [110, 80, 48] },
  [VT_SAVANNA]: { robe: [170, 84, 46], trim: [220, 180, 70], band: [60, 120, 150], belt: [220, 180, 70] },
  [VT_SNOW]: { robe: [70, 98, 150], trim: [236, 236, 232], hood: [236, 236, 232], belt: [52, 72, 116] },
  [VT_SWAMP]: { robe: [58, 78, 52], trim: [40, 54, 36], hat: [70, 128, 50], belt: [80, 60, 40] },
  [VT_TAIGA]: { robe: [92, 66, 44], trim: [150, 120, 90], hood: [120, 90, 62], belt: [60, 44, 30] },
};

/** Oficios cuya ropa tapa la túnica de su tipo (en los demás se ve la de su bioma con el delantal o el sombrero encima). */
const OWN_ROBE = new Set([PROF_LIBRARIAN, PROF_CARTOGRAPHER, PROF_CLERIC, PROF_WEAPONSMITH]);

/** La ropa de un aldeano: la del oficio sobre la de su tipo. */
function outfitFor(prof: number, type: number): Outfit {
  const base = TYPE_OUTFITS[type] ?? TYPE_OUTFITS[VT_PLAINS];
  if (!prof || !OUTFITS[prof]) return base;
  const o = OUTFITS[prof];
  const head = o.hat || o.band || o.hood ? {} : { hat: base.hat, band: base.band, hood: base.hood };
  return { ...o, ...(OWN_ROBE.has(prof) ? {} : { robe: base.robe, trim: base.trim, belt: o.belt ?? base.belt }), ...head };
}
const TRADER: Outfit = { robe: [40, 72, 146], trim: [230, 226, 214], hood: [32, 58, 120], belt: [110, 80, 48] };

const SKIN: RGB[] = [
  [140, 96, 70],
  [162, 114, 84],
  [180, 130, 98],
  [194, 144, 110],
];
const BROW: RGB = [58, 40, 30];
const EYE_WHITE: RGB = [236, 236, 230];
const EYE: RGB = [40, 118, 64];
const PANTS: RGB = [62, 50, 40];
const SHOES: RGB = [40, 32, 26];

/** Cara (8 × 10): cejijunto, ojos verdes y la barbilla un poco más oscura. */
const FACE = [
  '........',
  '........',
  '........',
  '.BBBBBB.',
  '.WE..EW.',
  '........',
  '........',
  '........',
  'dddddddd',
  'dddddddd',
];

export function villagerPainter(mobId: number, variant: number): Painter {
  const o = mobId === MOB_WANDERING_TRADER ? TRADER : outfitFor(variantProf(variant), variantType(variant));
  const seed = 1800 + variant * 17 + (mobId === MOB_WANDERING_TRADER ? 500 : 0);
  return (t: Texel): Paint => {
    const r = rnd(t, seed);
    const n = vnoise(t.x, t.y, t.z, 2.4, seed + 1);
    const skin = (): RGB => SKIN[Math.min(3, Math.max(0, (n < 0.3 ? 1 : n > 0.72 ? 3 : 2) - (r > 0.95 ? 1 : 0)))];
    // Tela: pliegues verticales suaves y costados más oscuros.
    const cloth = (c: RGB): RGB => {
      const fold = vnoise(t.x * 1.6, t.y * 0.5, t.z * 1.6, 2, seed + 6);
      let k = 0.9 + fold * 0.2 + (r > 0.96 ? -0.08 : 0);
      if (t.f === PX || t.f === NX) k *= 0.88;
      if (t.f === BOTTOM) k *= 0.8;
      return scale(c, k);
    };
    switch (t.g) {
      case 'head': {
        if (o.hood && (t.f === TOP || t.f === BACK || ((t.f === PX || t.f === NX) && (t.y > 3 || t.z > 5)) || (t.f === FRONT && t.j < 2))) {
          return cloth(o.hood);
        }
        if (o.hat && (t.f === TOP || (t.f !== BOTTOM && t.y > 8))) return cloth(o.hat);
        if (o.band && t.f !== TOP && t.f !== BOTTOM && t.y > 7 && t.y < 9) return o.band;
        if (t.f === FRONT) {
          if (o.patch && t.j >= 3 && t.j <= 5 && t.i >= 1 && t.i <= 3) return [24, 22, 24];
          if (o.patch && t.j + t.i === 6 && t.j < 3) return [24, 22, 24];
          return mapAt(FACE, t, { B: BROW, W: EYE_WHITE, E: EYE, d: SKIN[1] }) ?? skin();
        }
        if ((t.f === PX || t.f === NX) && t.y > 3.5 && t.y < 5.5 && t.z > 3.5 && t.z < 4.5) return SKIN[0]; // oreja
        return skin();
      }
      case 'nose':
        return t.f === BOTTOM ? SKIN[0] : SKIN[t.f === FRONT ? 2 : 1];
      case 'body': {
        // Túnica: ribete abajo y en el cuello, cinturón, delantal delante.
        if (t.f === TOP) return t.x > 2 && t.x < 6 && t.z > 1 && t.z < 5 ? skin() : cloth(o.robe);
        if (t.y < 1.5) return o.trim;
        if (o.belt && t.y > 9 && t.y < 11 && t.f !== BOTTOM) return o.belt;
        if (o.apron && t.f === FRONT && t.x > 0.9 && t.x < 7.1 && t.y > 2 && t.y < 16) {
          if (o.stain && vnoise(t.x, t.y, 0, 1.6, seed + 9) > 0.72) return o.stain;
          return cloth(o.apron);
        }
        if (t.f === FRONT && t.y > 16.5 && t.x > 2.5 && t.x < 5.5) return o.trim; // cuello
        return cloth(o.robe);
      }
      case 'arms':
        // Antebrazos cruzados: mangas y las manos asomando por los lados.
        if (t.f === PX || t.f === NX || t.x < 1.5 || t.x > 6.5) return skin();
        return cloth(o.robe);
      case 'arm':
        return t.f === BOTTOM ? skin() : cloth(o.robe);
      default:
        // Piernas: pantalón y zapatos.
        if (t.f === BOTTOM || t.y < 1.5) return SHOES;
        return scale(PANTS, 0.92 + 0.16 * n);
    }
  };
}
