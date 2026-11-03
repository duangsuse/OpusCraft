// Fase 8.3 (criaturas del Nether): texturas procedurales de las criaturas del Nether (mismo pintado por téxel que
// mobTextures.ts), con los colores y el dibujo de las de Java 26.3:
// - Piglin: piel rosada, hocico con fosas, colmillos, orejas caídas; taparrabos de cuero con cinturón de tachuelas
//   de oro y pezuñas oscuras. Piglin bruto: ropa negra con hebilla de oro y cicatrices. Piglin zombificado: piel
//   pálida con musgo, media calavera al aire, costillas, y le falta la oreja derecha.
// - Ghast: blanco con arrugas grises, ojos cerrados con lágrimas y boca pequeña; al disparar (variante 1), ojos
//   rojos que brillan y boca abierta.
// - Blaze: llama amarilla y naranja, ojos negros; varas del mismo fuego.
// - Cubo de magma: costra negra y roja con grietas de lava que brillan, ojos de fuego y núcleo encendido.
// - Hoglin: piel rosada con crin gris azulada, cuernos de marfil, ojos arriba y hocico con fosas. Zoglin: piel
//   podrida con costillas y dientes al aire, musgo y cuernos blancos.
// - Strider: rojo con motas (variante 1: morado, con frío), cara de pena, patas de piedra y cerdas de pelo claro
//   (lo que no es pelo, transparente); silla de cuero con cinchas.
// - Esqueleto wither: huesos casi negros con cuencas y dientes.
// Y la armadura de oro que se ve sobre los piglins (casco, peto, grebas y botas, según lo que lleven).
import { MOBS, boxFaces, type MobDef } from '../../shared/mobs';
import {
  MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER,
  MOB_WITHER_SKELETON, isMagmaCube, isNetherMob, gearArmor,
} from '../../shared/netherMobs';
import {
  paintMob, mapAt, tone, side, rnd, vnoise, scale, clamp01, glow, CLEAR, PX, NX, TOP, BOTTOM, FRONT, BACK,
  type Texel, type Paint, type RGB, type MobTexture,
} from './mobTextures';

/** Textura de una criatura del Nether (null si no lo es). Variante: el strider con frío, el ghast disparando. */
export function netherTexture(mobId: number, variant: number): MobTexture | null {
  switch (mobId) {
    case MOB_PIGLIN:
      return paintMob(mobId, (t) => piglin(t, 'piglin'));
    case MOB_PIGLIN_BRUTE:
      return paintMob(mobId, (t) => piglin(t, 'brute'));
    case MOB_ZOMBIFIED_PIGLIN:
      return paintMob(mobId, (t) => piglin(t, 'zombified'));
    case MOB_GHAST:
      return paintMob(mobId, (t) => ghast(t, variant === 1));
    case MOB_BLAZE:
      return paintMob(mobId, blaze);
    case MOB_HOGLIN:
      return paintMob(mobId, (t) => hoglin(t, false));
    case MOB_ZOGLIN:
      return paintMob(mobId, (t) => hoglin(t, true));
    case MOB_STRIDER:
      return paintMob(mobId, (t) => strider(t, variant === 1));
    case MOB_WITHER_SKELETON:
      return paintMob(mobId, witherSkeleton);
    default:
      return isMagmaCube(mobId) ? paintMob(mobId, magma) : null;
  }
}

const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ---------------------------------------------------------------------------
// Piglins
// ---------------------------------------------------------------------------

const PIGLIN_SKIN: RGB[] = [[178, 114, 88], [204, 138, 106], [222, 160, 124], [236, 180, 142]];
const ZOMBIE_SKIN: RGB[] = [[190, 104, 106], [214, 130, 128], [230, 154, 148], [242, 178, 168]];
const LEATHER: RGB[] = [[92, 56, 30], [118, 74, 40], [142, 92, 52]];
const BRUTE_CLOTH: RGB[] = [[30, 28, 34], [44, 42, 50], [60, 58, 68]];
const GOLD: RGB = [252, 210, 70];
const GOLD_DARK: RGB = [196, 146, 30];
const HOOF: RGB = [56, 40, 34];
const TUSK: RGB = [238, 228, 198];
const MOSS: RGB[] = [[70, 104, 42], [92, 132, 56], [112, 150, 66]];
const BONE_PALE: RGB[] = [[176, 176, 170], [204, 204, 198], [226, 226, 220]];

type PiglinKind = 'piglin' | 'brute' | 'zombified';

/** Cara del piglin (10 × 8): ojos blancos con la pupila hacia dentro; el hocico tapa la mitad de abajo del centro. */
const PIGLIN_FACE = ['ssssssssss', 'ssssssssss', 'sddssssdds', 'sWPssssPWs', 'ssssssssss', 'ssssssssss', 'ssssssssss', 'dssssssssd'];

function piglin(t: Texel, kind: PiglinKind): Paint {
  const zomb = kind === 'zombified';
  const seed = zomb ? 9191 : kind === 'brute' ? 9292 : 9393;
  const pal = zomb ? ZOMBIE_SKIN : PIGLIN_SKIN;
  const skin = (k = 0): RGB => {
    let v = 0.5 * vnoise(t.x, t.y, t.z, 2.2, seed) + 0.3 * rnd(t, seed + 1) + 0.2 + k;
    if (t.f === TOP) v += 0.1;
    if (t.f === BOTTOM) v -= 0.2;
    return tone(pal, clamp01(v - 0.1));
  };
  // Piglin zombificado: manchas de musgo y hueso a la vista.
  const rot = (): Paint | null => {
    if (!zomb) return null;
    const n = vnoise(t.x * 1.4 + t.z * 0.3, t.y * 1.4, t.z * 1.4, 1.6, seed + 7);
    if (n > 0.78) return tone(MOSS, clamp01(rnd(t, seed + 8)));
    return null;
  };
  switch (t.g) {
    case 'head': {
      if (zomb) {
        // Media calavera: el lado derecho de la cara (a la izquierda de la imagen) y parte de la tapa.
        const bone = t.x > t.w * 0.55 && t.y > 2 && (t.f === FRONT || t.f === PX || (t.f === TOP && t.z < 5));
        if (bone) {
          if (t.f === FRONT && t.j >= 2 && t.j <= 4 && t.i >= 1 && t.i <= 2) return [34, 30, 30]; // cuenca
          return tone(BONE_PALE, clamp01(0.4 + 0.4 * rnd(t, seed + 3)));
        }
      }
      if (t.f === FRONT) {
        const m = mapAt(PIGLIN_FACE, t, { s: skin(), d: scale(skin(), 0.82), W: [236, 236, 230], P: [36, 24, 20] });
        if (m) return m;
      }
      if (kind === 'brute' && (t.f === PX || t.f === NX) && Math.abs(t.y - 3.5) < 0.6 && t.z > 2 && t.z < 6) return scale(skin(), 0.7); // cicatriz
      return rot() ?? skin();
    }
    case 'snout':
      if (t.f === FRONT) return mapAt(['pppp', 'pppp', 'NppN', 'pppp'], t, { p: zomb ? [236, 158, 152] : [240, 172, 150], N: [120, 64, 56] }) ?? [230, 160, 140];
      return zomb ? [220, 146, 140] : [226, 156, 134];
    case 'tusk':
      return TUSK;
    case 'ear':
      // Al zombificado le falta la oreja derecha.
      if (zomb && t.part === 'earR') return CLEAR;
      return t.f === PX || t.f === NX ? scale(skin(0.1), t.f === NX ? 0.9 : 1.05) : skin();
    case 'body': {
      if (zomb) {
        // Costillas al aire en el pecho.
        if (t.f === FRONT && t.y > 5 && t.y < 11 && t.x > 1.5 && t.x < 6.5) return Math.floor(t.y) % 2 === 0 ? tone(BONE_PALE, 0.7) : [96, 40, 40];
        if (t.y < 4.5) return tone(LEATHER, clamp01(0.3 + 0.5 * rnd(t, seed + 4)));
        return rot() ?? skin();
      }
      const cloth = kind === 'brute' ? BRUTE_CLOTH : LEATHER;
      // Cinturón a media altura (con la hebilla de oro del bruto delante o tachuelas del piglin).
      if (t.y >= 4.5 && t.y < 6) {
        if (kind === 'brute' && t.f === FRONT && Math.abs(t.x - 4) < 1.5) return Math.abs(t.x - 4) < 0.6 && Math.abs(t.y - 5.25) < 0.4 ? [40, 30, 20] : GOLD;
        if (kind === 'piglin' && side(t) && Math.floor(t.x + t.z) % 3 === 0) return GOLD;
        return scale(tone(cloth, 0.4), 0.8);
      }
      if (t.y < 4.5) return tone(cloth, clamp01(0.3 + 0.4 * vnoise(t.x, t.y, t.z, 1.5, seed + 5) + 0.2 * rnd(t, seed + 6)));
      if (kind === 'brute' && t.f === FRONT && Math.abs(t.x - t.y + 2) < 0.5 && t.y > 7) return scale(skin(), 0.72); // cicatriz
      return skin();
    }
    case 'arm': {
      if (t.f === BOTTOM) return scale(skin(), 0.85);
      // Brazalete a la altura de la muñeca (el del bruto, negro con borde de oro).
      if (t.y >= 2 && t.y < 3.5) {
        if (kind === 'brute') return t.y < 2.5 ? GOLD_DARK : tone(BRUTE_CLOTH, 0.6);
        return tone(LEATHER, 0.5);
      }
      return rot() ?? skin();
    }
    case 'leg': {
      if (t.y < 1.5) return t.f === BOTTOM ? scale(HOOF, 0.8) : HOOF;
      if (t.y > 8) return zomb ? tone(LEATHER, 0.2 + 0.4 * rnd(t, seed + 9)) : tone(kind === 'brute' ? BRUTE_CLOTH : LEATHER, clamp01(0.3 + 0.5 * rnd(t, seed + 10)));
      if (zomb && side(t) && t.y > 3 && t.y < 6 && t.x > 2) return tone(BONE_PALE, 0.6);
      return rot() ?? skin();
    }
    default:
      return skin();
  }
}

// ---------------------------------------------------------------------------
// Ghast
// ---------------------------------------------------------------------------

const GHAST_WHITE: RGB[] = [[208, 208, 208], [224, 224, 224], [238, 238, 238], [248, 248, 248]];
const GHAST_LINE: RGB = [168, 162, 162];

/** Cara del ghast (16 × 16): ojos cerrados con lágrimas y boca pequeña. */
const GHAST_FACE = [
  '................', '................', '................', '................', '................', '................',
  '................', '....LLL..LLL....', '.....T....T.....', '.....T....T.....', '................', '................',
  '......MMMM......', '......MMMM......', '................', '................',
];
/** Disparando: ojos rojos abiertos y la boca abierta. */
const GHAST_FACE_SHOOT = [
  '................', '................', '................', '................', '................', '................',
  '...KKKK..KKKK...', '...KRRK..KRRK...', '...KKKK..KKKK...', '.....T....T.....', '................',
  '.....KKKKKK.....', '.....KDDDDK.....', '.....KDRRDK.....', '.....KDDDDK.....', '.....KKKKKK.....',
];

function ghast(t: Texel, shooting: boolean): Paint {
  const seed = 9494;
  const white = (): RGB => tone(GHAST_WHITE, clamp01(0.45 + 0.3 * vnoise(t.x, t.y, t.z, 3, seed) + 0.25 * rnd(t, seed + 1)));
  if (t.g === 'tent') {
    // Tentáculos: blancos con anillos grises.
    return Math.floor(t.y) % 3 === 0 ? mix(white(), GHAST_LINE, 0.4) : white();
  }
  if (t.f === FRONT) {
    const m = mapAt(shooting ? GHAST_FACE_SHOOT : GHAST_FACE, t, {
      L: GHAST_LINE, T: [196, 194, 194], M: [74, 72, 72], K: [30, 28, 28], R: glow([232, 30, 26]), D: [110, 16, 14],
    });
    if (m) return m;
  }
  // Arrugas: curvas grises en los costados y la espalda.
  if (side(t) && t.f !== FRONT) {
    const c = Math.abs(((t.y + Math.sin((t.f === BACK ? t.x : t.z) * 0.6) * 2) % 5) - 2.5);
    if (c < 0.35 && t.y > 3 && t.y < 13) return GHAST_LINE;
  }
  if (t.f === BOTTOM && Math.abs(t.x - 8) < 5 && Math.abs(t.z - 8) < 5) return mix(white(), GHAST_LINE, 0.25);
  return white();
}

// ---------------------------------------------------------------------------
// Blaze
// ---------------------------------------------------------------------------

const FLAME: RGB[] = [[150, 60, 6], [200, 100, 10], [236, 150, 16], [250, 196, 40], [255, 236, 120]];

function blaze(t: Texel): Paint {
  const seed = 9595;
  const flame = (k: number): RGB => tone(FLAME, clamp01(k + 0.25 * vnoise(t.x, t.y, t.z, 1.6, seed) + 0.2 * rnd(t, seed + 1) - 0.2));
  if (t.g === 'rod') return flame(0.25 + (t.y / t.h) * 0.6);
  if (t.f === FRONT) {
    const m = mapAt(['........', '........', '........', '........', '.KW..WK.', '........', '........', '........'], t, { K: [16, 10, 6], W: [250, 246, 230] });
    if (m) return m;
  }
  // Más claro arriba y más oscuro abajo (el fuego sube).
  return flame(t.f === TOP ? 0.95 : t.f === BOTTOM ? 0.2 : 0.2 + (t.y / t.h) * 0.75);
}

// ---------------------------------------------------------------------------
// Cubo de magma
// ---------------------------------------------------------------------------

const CRUST: RGB[] = [[34, 8, 6], [50, 12, 8], [66, 18, 10], [82, 26, 14]];

function magma(t: Texel): Paint {
  const seed = 9696;
  if (t.g === 'core') {
    const n = vnoise(t.x, t.y, t.z, 1.2, seed + 2);
    return glow(n > 0.6 ? [255, 214, 90] : n > 0.3 ? [250, 150, 30] : [224, 96, 16]);
  }
  const slice = Number(t.part.slice(4)) || 0;
  // Ojos de fuego en la cuarta rodaja (desde arriba), delante.
  if (t.f === FRONT && slice === 3 && (t.i === 1 || t.i === 2 || t.i === 5 || t.i === 6)) return glow(t.i === 2 || t.i === 5 ? [255, 190, 60] : [240, 110, 20]);
  // Grietas de lava que brillan entre la costra.
  const crack = vnoise(t.x * 1.3, (t.y + slice) * 1.3, t.z * 1.3, 1.4, seed);
  if (crack > 0.72) return glow(crack > 0.82 ? [255, 170, 40] : [226, 90, 18]);
  return tone(CRUST, clamp01(0.3 + 0.4 * vnoise(t.x, slice, t.z, 2, seed + 1) + 0.3 * rnd(t, seed + 3)));
}

// ---------------------------------------------------------------------------
// Hoglin y zoglin
// ---------------------------------------------------------------------------

const HOGLIN_SKIN: RGB[] = [[172, 100, 74], [194, 124, 94], [212, 146, 112], [226, 164, 130]];
const ZOGLIN_SKIN: RGB[] = [[196, 106, 106], [218, 132, 128], [234, 158, 150], [242, 176, 166]];
const HOGLIN_MANE: RGB[] = [[40, 48, 58], [58, 70, 82], [80, 96, 108]];
const ZOGLIN_MANE: RGB[] = [[64, 64, 68], [88, 88, 94], [110, 110, 116]];
const HORN: RGB[] = [[196, 184, 156], [220, 210, 184], [236, 228, 206]];
const ZOGLIN_HORN: RGB[] = [[210, 210, 206], [230, 230, 226], [244, 244, 240]];

function hoglin(t: Texel, zoglin: boolean): Paint {
  const seed = zoglin ? 9797 : 9898;
  const skin = (k = 0): RGB => tone(zoglin ? ZOGLIN_SKIN : HOGLIN_SKIN, clamp01(0.3 + 0.35 * vnoise(t.x, t.y, t.z, 2.6, seed) + 0.25 * rnd(t, seed + 1) + k - (t.f === BOTTOM ? 0.25 : 0)));
  const rotten = (): Paint | null => {
    if (!zoglin) return null;
    const n = vnoise(t.x * 1.2, t.y * 1.2, t.z * 1.2, 2, seed + 5);
    if (n > 0.8) return tone(MOSS, clamp01(rnd(t, seed + 6)));
    return null;
  };
  const part = t.part;
  if (part === 'mane') {
    // La crin: un plano de cerdas; lo que no son cerdas, transparente.
    const hair = Math.floor(t.z) % 2 === 0 || t.y > t.h - 3;
    if (!hair || t.y < (Math.sin(t.z * 1.7) * 1.5 + 1.5)) return CLEAR;
    return tone(zoglin ? ZOGLIN_MANE : HOGLIN_MANE, clamp01(0.3 + 0.5 * rnd(t, seed + 2)));
  }
  if (part.startsWith('horn')) return tone(zoglin ? ZOGLIN_HORN : HORN, clamp01((t.y / t.h) * 0.8 + 0.2 * rnd(t, seed + 3)));
  if (part.startsWith('leg')) {
    if (t.y < 2) return t.f === BOTTOM ? [60, 50, 48] : [74, 62, 58];
    return rotten() ?? skin();
  }
  if (part.startsWith('ear')) return skin(-0.1);
  if (part === 'head') {
    if (t.f === FRONT) {
      // Punta del hocico con dos fosas grandes (el zoglin enseña los dientes debajo).
      const m = mapAt(['hhhhhhhhhhhhhh', 'hhhhhhhhhhhhhh', 'hhhNNhhhhNNhhh', 'hhhNNhhhhNNhhh', 'hhhhhhhhhhhhhh', zoglin ? 'hTThTThhTThTTh' : 'hhhhhhhhhhhhhh'], t, {
        h: scale(skin(0.1), 1.05), N: [104, 56, 48], T: [240, 236, 222],
      });
      if (m) return m;
    }
    // Ojos arriba, cerca de donde nace la cabeza (con la cabeza agachada miran al frente).
    if (t.f === TOP && t.z > t.d - 4 && t.z < t.d - 2 && (Math.abs(t.x - 2.5) < 1 || Math.abs(t.x - (t.w - 2.5)) < 1)) {
      return Math.abs(t.x - 2.5) < 0.5 || Math.abs(t.x - (t.w - 2.5)) < 0.5 ? [30, 24, 22] : [236, 236, 230];
    }
    // El zoglin: la mandíbula al descubierto en los costados.
    if (zoglin && (t.f === PX || t.f === NX) && t.y < 2.5 && t.z < 10) return Math.floor(t.z) % 2 ? [236, 232, 220] : [120, 40, 40];
    return rotten() ?? skin();
  }
  // Cuerpo: raya del lomo más oscura y, en el zoglin, costillas al aire en los costados.
  if (zoglin && (t.f === PX || t.f === NX) && t.y > 3 && t.y < 10 && t.z > 8 && t.z < 18) {
    return Math.floor(t.z) % 3 === 0 ? tone(ZOGLIN_HORN, 0.5) : [110, 38, 40];
  }
  if (t.f === TOP && Math.abs(t.x - t.w / 2) < 2) return rotten() ?? skin(-0.15);
  return rotten() ?? skin();
}

// ---------------------------------------------------------------------------
// Strider
// ---------------------------------------------------------------------------

const STRIDER_WARM: RGB[] = [[128, 36, 38], [148, 48, 50], [166, 60, 60], [182, 74, 72]];
const STRIDER_COLD: RGB[] = [[102, 82, 102], [120, 98, 120], [136, 114, 136], [150, 130, 150]];
const STONE_LEG: RGB[] = [[54, 52, 58], [72, 70, 78], [92, 90, 98]];
const LEATHER_SADDLE: RGB[] = [[88, 50, 26], [112, 66, 34], [136, 84, 44]];

/** Cara del strider (16 × 14 de delante): ojos pequeños y boca de pena en la parte de abajo. */
const STRIDER_FACE = [
  '................', '................', '................', '................', '................', '................',
  '................', '................', '....EE....EE....', '....EE....EE....', '................', '......MMMM......',
  '.....M....M.....', '................',
];

function strider(t: Texel, cold: boolean): Paint {
  const seed = cold ? 9999 : 10101;
  const pal = cold ? STRIDER_COLD : STRIDER_WARM;
  const body = (k = 0): RGB => tone(pal, clamp01(0.35 + 0.3 * vnoise(t.x, t.y, t.z, 2.4, seed) + 0.25 * rnd(t, seed + 1) + k));
  const part = t.part;
  if (part === 'saddle') {
    // Asiento de cuero arriba y dos cinchas por los costados; lo demás, transparente.
    if (t.f === TOP) return Math.abs(t.z - 8) < 5 && Math.abs(t.x - 8) < 6 ? tone(LEATHER_SADDLE, clamp01(0.4 + 0.4 * rnd(t, seed + 2))) : CLEAR;
    if ((t.f === PX || t.f === NX) && Math.abs(t.z - 8) < 1.5) return t.y > t.h - 1 ? [60, 34, 18] : tone(LEATHER_SADDLE, 0.3);
    if (t.f === BOTTOM) return CLEAR;
    return CLEAR;
  }
  if (part.startsWith('bristle')) {
    // Cerdas: mechones de pelo claro con la punta rosada; entre mechón y mechón, nada.
    if (t.f !== TOP && t.f !== BOTTOM) return CLEAR;
    const strand = Math.abs(((t.z + t.x * 0.35) % 3) - 1.5) < 0.5;
    if (!strand) return CLEAR;
    return t.x > t.w - 3 ? [228, 150, 150] : [244, 230, 226];
  }
  if (part.startsWith('leg')) {
    // Patas de piedra oscura, con el arranque del color del cuerpo.
    if (t.y > t.h - 3) return body(-0.1);
    return tone(STONE_LEG, clamp01(0.3 + 0.5 * vnoise(t.x, t.y, t.z, 1.5, seed + 3) + 0.2 * rnd(t, seed + 4)));
  }
  if (t.f === FRONT) {
    const m = mapAt(STRIDER_FACE, t, { E: [20, 14, 14], M: [60, 18, 20] });
    if (m) return m;
  }
  // Tapa con un cuadro más oscuro en medio y motas claras sueltas.
  if (t.f === TOP && Math.abs(t.x - 8) < 4 && Math.abs(t.z - 8) < 4) return body(-0.25);
  if (rnd(t, seed + 5) > 0.96) return scale(body(0.2), 1.25);
  if (side(t) && t.y < 1.5) return body(-0.2);
  return body();
}

// ---------------------------------------------------------------------------
// Esqueleto wither
// ---------------------------------------------------------------------------

const WITHER_BONE: RGB[] = [[24, 24, 24], [36, 36, 36], [50, 50, 50], [64, 64, 64]];

function witherSkeleton(t: Texel): Paint {
  const seed = 10202;
  const bone = (k = 0): RGB => tone(WITHER_BONE, clamp01(0.35 + 0.35 * vnoise(t.x, t.y, t.z, 2, seed) + 0.25 * rnd(t, seed + 1) + k));
  if (t.g === 'head') {
    if (t.f === FRONT) {
      const m = mapAt(['........', '........', '........', '.KK..KK.', '.KK..KK.', '...KK...', '.T.T.T..', '........'], t, { K: [8, 8, 8], T: [80, 80, 80] });
      if (m) return m;
    }
    return bone(0.05);
  }
  if (t.g === 'body') {
    // Costillas: bandas de hueso con huecos negros delante y detrás.
    if ((t.f === FRONT || t.f === BACK) && t.y > 3 && t.y < 11) {
      if (Math.abs(t.x - 4) < 0.6) return bone(0.1); // esternón / columna
      return Math.floor(t.y) % 2 === 0 ? bone() : [10, 10, 10];
    }
    if (t.y < 3 && (t.f === FRONT || t.f === BACK) && Math.abs(t.x - 4) > 2.5) return [10, 10, 10];
    return bone();
  }
  return side(t) && t.i === t.fw - 1 ? bone(-0.2) : bone();
}

// ---------------------------------------------------------------------------
// Armadura de oro de los piglins
// ---------------------------------------------------------------------------

const GOLD_RAMP: RGB[] = [[140, 92, 10], [200, 144, 22], [246, 204, 52], [255, 244, 160]];

/**
 * Armadura de oro que se ve sobre un piglin (en su atlas, sobre sus cajas algo más grandes): casco en la cabeza,
 * peto en el cuerpo y la parte de arriba de los brazos, grebas en la cintura y los muslos, botas abajo. Lo que no
 * cubre queda transparente. null si no lleva nada (o no es un piglin).
 */
export function netherGearTexture(def: MobDef, gear: number): MobTexture | null {
  if (!isNetherMob(def.id) || (def.id !== MOB_PIGLIN && def.id !== MOB_PIGLIN_BRUTE && def.id !== MOB_ZOMBIFIED_PIGLIN)) return null;
  const armor = gearArmor(gear);
  if (!armor) return null;
  const [W, H] = def.atlas;
  const rgba = new Uint8Array(W * H * 4);
  const cover = (part: string, y: number, h: number): boolean => {
    if (part === 'head') return (armor & 1) !== 0;
    if (part === 'body') return (armor & 2) !== 0 || ((armor & 4) !== 0 && y < 4.5);
    if (part.startsWith('arm')) return (armor & 2) !== 0 && y > h - 5;
    if (part.startsWith('leg')) return ((armor & 4) !== 0 && y > 4.5) || ((armor & 8) !== 0 && y < 5);
    return false;
  };
  for (const p of def.parts) {
    const [w, h, d] = p.size;
    boxFaces(p.uv[0], p.uv[1], w, h, d).forEach(([fu, fv, fw, fh], f) => {
      for (let j = 0; j < fh; j++) {
        for (let i = 0; i < fw; i++) {
          const y = f === TOP ? h : f === BOTTOM ? 0 : h - (j + 0.5);
          if (!cover(p.name, y, h)) continue;
          const u = fu + i, v = fv + j;
          if (u < 0 || v < 0 || u >= W || v >= H) continue;
          // Placas con juntas cada 4 píxeles, el borde de arriba claro y remaches.
          let k = 2;
          if (i % 4 === 0 || j % 4 === 0) k = 1;
          if (j === 0) k = 3;
          if ((i + j) % 7 === 3 && i % 4 === 2) k = 3;
          const c = GOLD_RAMP[k];
          const o = (v * W + u) * 4;
          rgba[o] = c[0];
          rgba[o + 1] = c[1];
          rgba[o + 2] = c[2];
          rgba[o + 3] = 255;
        }
      }
    });
  }
  return { width: W, height: H, rgba };
}

void MOBS;
