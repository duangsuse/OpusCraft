// Fase 6 (asaltos): texturas procedurales de los illagers (saqueador, vindicador y evocador), el vex,
// el devastador y los colmillos del evocador. Usan las utilidades de mobTextures.ts, que las pide aquí
// (ILLAGER_PAINTERS). Como monsterTextures.ts, este módulo y mobTextures.ts se importan mutuamente:
// aquí arriba sólo hay funciones y constantes propias.
import { MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, MOB_VEX, MOB_RAVAGER, MOB_EVOKER_FANGS } from '../../shared/mobs';
import {
  PX, NX, TOP, BOTTOM, FRONT, BACK, glow, rnd, vnoise, mapAt, type Texel, type Paint, type Painter, type RGB,
} from './mobTextures';

const pick = (pal: readonly RGB[], k: number): RGB => pal[Math.max(0, Math.min(pal.length - 1, k))];

/** Tono de una paleta con pliegues de tela: más oscuro en los costados, abajo y en algún téxel suelto. */
function cloth(t: Texel, pal: readonly RGB[], seed: number, bias = 0): RGB {
  const fold = vnoise(t.x * 0.8, t.y * 1.6, t.z * 0.8, 2.2, seed);
  let k = (fold < 0.3 ? 1 : fold > 0.72 ? 3 : 2) + bias;
  if (t.f === PX || t.f === NX) k -= 1;
  if (t.f === BOTTOM) k -= 1;
  if (rnd(t, seed + 1) > 0.95) k -= 1;
  return pick(pal, k);
}

// ---------------------------------------------------------------------------
// Illagers: cabeza alargada gris, ceja única, ojos verdes y ropa de cada clase
// ---------------------------------------------------------------------------

const ILLAGER_SKIN: RGB[] = [
  [104, 110, 108],
  [122, 128, 126],
  [138, 144, 141],
  [154, 160, 156],
];
const ILLAGER_FACE = [
  '........',
  '........',
  '........',
  'bbbbbbbb',
  '.WK..KW.',
  '........',
  '........',
  '........',
  '..mmmm..',
  '........',
];

interface IllagerStyle {
  /** Túnica o chaqueta (sobre el cuerpo y las piernas) y camisa (mangas). */
  coat: RGB[];
  sleeve: RGB[];
  pants: RGB[];
  /** Adorno del borde de la chaqueta (el evocador lo lleva dorado). */
  trim?: RGB;
  /** Cinturón. */
  belt: RGB;
  seed: number;
}

const PILLAGER: IllagerStyle = {
  coat: [[62, 56, 44], [76, 70, 56], [90, 84, 68], [106, 98, 80]],
  sleeve: [[72, 70, 64], [86, 84, 78], [100, 98, 90], [114, 112, 104]],
  pants: [[38, 38, 42], [48, 48, 54], [58, 58, 64], [70, 70, 76]],
  belt: [58, 38, 22],
  seed: 6060,
};
const VINDICATOR: IllagerStyle = {
  coat: [[30, 44, 48], [38, 56, 60], [48, 68, 72], [60, 82, 86]],
  sleeve: [[34, 36, 40], [44, 46, 52], [54, 56, 62], [66, 68, 74]],
  pants: [[24, 24, 28], [32, 32, 36], [40, 40, 46], [50, 50, 56]],
  belt: [70, 46, 26],
  seed: 6161,
};
const EVOKER: IllagerStyle = {
  coat: [[18, 18, 22], [26, 26, 32], [34, 34, 42], [44, 44, 54]],
  sleeve: [[18, 18, 22], [26, 26, 32], [34, 34, 42], [44, 44, 54]],
  pants: [[18, 18, 22], [26, 26, 32], [34, 34, 42], [44, 44, 54]],
  trim: [206, 166, 58],
  belt: [206, 166, 58],
  seed: 6262,
};

function illager(style: IllagerStyle): Painter {
  return (t: Texel): Paint => {
    const n = vnoise(t.x, t.y, t.z, 2.4, style.seed);
    const r = rnd(t, style.seed);
    const skin = (bias = 0): RGB => pick(ILLAGER_SKIN, (n < 0.3 ? 1 : n > 0.72 ? 3 : 2) + bias - (r > 0.95 ? 1 : 0));
    switch (t.part) {
      case 'head': {
        if (t.f === FRONT) {
          const m = mapAt(ILLAGER_FACE, t, { b: [30, 28, 28], W: [226, 226, 214], K: [44, 122, 68], m: [84, 88, 86] });
          if (m) return m;
          return skin();
        }
        // Pelo oscuro y corto arriba y detrás.
        if (t.f === TOP || (t.f === BACK && t.y > 6) || ((t.f === PX || t.f === NX) && t.y > 8)) return r > 0.5 ? [34, 32, 32] : [44, 40, 40];
        return skin();
      }
      case 'nose':
        return t.f === BOTTOM ? skin(-2) : skin(-1);
      case 'jacket': {
        // Cinturón a la altura de la cintura y borde de la chaqueta (dorado en el evocador).
        if (t.y > 5.5 && t.y < 6.8 && t.f !== TOP && t.f !== BOTTOM) return style.belt;
        if (style.trim && t.f === FRONT && (t.i === 3 || t.i === 5)) return style.trim;
        if (style.trim && t.f !== TOP && t.f !== BOTTOM && t.y < 1) return style.trim;
        return cloth(t, style.coat, style.seed + 3, t.f === TOP ? 1 : 0);
      }
      case 'body':
        return cloth(t, style.coat, style.seed + 4);
      case 'armR':
      case 'armL':
        // Manos de piel y mangas de la camisa.
        if (t.y < 2.5 || t.f === BOTTOM) return skin(t.f === BOTTOM ? -1 : 0);
        return cloth(t, style.sleeve, style.seed + 5);
      case 'legR':
      case 'legL':
        if (t.y < 2 || t.f === BOTTOM) return r > 0.5 ? [30, 22, 18] : [38, 28, 22];
        return cloth(t, style.pants, style.seed + 6);
      case 'crossbow':
        // Culata de madera con la punta de hierro.
        if (t.z < 1.2) return [150, 152, 156];
        return r > 0.6 ? [96, 66, 38] : [112, 78, 46];
      case 'crossbowLimbs':
        return Math.abs(t.x - 5) < 1 ? [80, 56, 32] : r > 0.5 ? [62, 44, 26] : [74, 52, 30];
      case 'axe':
        return r > 0.5 ? [98, 70, 42] : [112, 80, 48];
      case 'axeHead':
        return t.y < 1 ? [206, 208, 212] : r > 0.5 ? [164, 166, 172] : [184, 186, 190];
      case 'bannerPole':
      case 'bannerBar':
        return r > 0.5 ? [72, 50, 30] : [84, 58, 34];
      case 'banner':
        return ominousBanner(t);
      default:
        return skin();
    }
  };
}

/**
 * Estandarte ominoso (a la manera del de Minecraft): fondo blanco, un rombo cian, franja negra
 * con un círculo gris y borde gris. Coordenadas del paño: x ∈ [0, 10], y ∈ [0, 20] (20 = arriba).
 */
function ominousBanner(t: Texel): Paint {
  if (t.f === TOP || t.f === BOTTOM || t.f === PX || t.f === NX) return [210, 210, 206];
  const x = t.x, y = t.y;
  const r = rnd(t, 6363) * 10;
  if (x < 0.9 || x > 9.1 || y < 0.9) return [120, 120, 124];
  const cx = 5, cy = 12.5;
  if (Math.abs(x - cx) + Math.abs(y - cy) * 0.8 < 4.2) {
    // Rombo cian con el "rostro": ojos negros.
    if (Math.abs(y - cy - 0.5) < 0.6 && Math.abs(Math.abs(x - cx) - 1.5) < 0.6) return [20, 20, 22];
    return [22 + r, 150 + r, 150 + r];
  }
  if (y > 4 && y < 8) {
    if (Math.hypot(x - cx, y - 6) < 1.6) return [150, 150, 152];
    return [26 + r, 26 + r, 28 + r];
  }
  if (Math.abs(y - 9.2) < 0.5 || Math.abs(y - 16.6) < 0.5) return [170, 170, 172];
  return [228 + r * 0.5, 228 + r * 0.5, 222 + r * 0.5];
}

// ---------------------------------------------------------------------------
// Vex: pequeño espíritu azulado con alas claras y espada de hierro
// ---------------------------------------------------------------------------

const VEX_BODY: RGB[] = [
  [96, 110, 138],
  [116, 132, 162],
  [138, 154, 184],
  [162, 178, 206],
];

function vex(t: Texel): Paint {
  const n = vnoise(t.x, t.y, t.z, 2, 6464);
  const r = rnd(t, 6464);
  const body = (bias = 0): RGB => pick(VEX_BODY, (n < 0.35 ? 1 : n > 0.7 ? 3 : 2) + bias - (r > 0.94 ? 1 : 0));
  switch (t.part) {
    case 'head':
      if (t.f === FRONT && t.j === 4 && (t.i === 2 || t.i === 5)) return glow([140, 230, 255]);
      if (t.f === FRONT && t.j === 6 && t.i >= 3 && t.i <= 4) return [40, 46, 64];
      return body(t.f === TOP ? 1 : 0);
    case 'wingR':
    case 'wingL': {
      // Alas translúcidas: nervios claros sobre un velo que brilla un poco.
      const vein = Math.abs(((t.x + t.y * 0.6) % 4) - 2) < 0.4;
      return glow(vein ? [214, 236, 255] : [150 + r * 30, 176 + r * 30, 214 + r * 20]);
    }
    case 'sword':
      if (t.z > 11) return [90, 62, 36];
      return t.z < 1 || r > 0.7 ? [226, 228, 232] : [182, 186, 194];
    case 'swordGuard':
      return [120, 122, 128];
    case 'tail':
      return body(-1);
    default:
      return body();
  }
}

// ---------------------------------------------------------------------------
// Devastador: bestia de cuero gris pardo, cuernos claros y fauces rojizas
// ---------------------------------------------------------------------------

const RAVAGER_HIDE: RGB[] = [
  [52, 48, 44],
  [64, 58, 52],
  [76, 70, 62],
  [90, 82, 72],
  [104, 96, 84],
];

function ravager(t: Texel): Paint {
  const n = 0.6 * vnoise(t.x, t.y, t.z, 3, 6565) + 0.4 * vnoise(t.x, t.y, t.z, 1.2, 6566);
  const r = rnd(t, 6565);
  let k = Math.floor(n * 5);
  if (t.f === TOP) k += 1;
  if (t.f === BOTTOM) k -= 2;
  if (r > 0.93) k -= 1;
  const hide = pick(RAVAGER_HIDE, k);
  switch (t.part) {
    case 'head':
      if (t.f === FRONT) {
        // Ojos pequeños y morro con fosas nasales.
        if (t.j >= 4 && t.j <= 5 && (t.i === 2 || t.i === 3 || t.i === 12 || t.i === 13)) return t.j === 4 ? [16, 14, 12] : [60, 54, 46];
        if (t.j >= 10 && t.j <= 11 && (t.i === 5 || t.i === 10)) return [22, 18, 16];
        if (t.j >= 8) return pick(RAVAGER_HIDE, k + 1);
      }
      return hide;
    case 'jaw':
      // Por dentro, encías rojizas y colmillos.
      if (t.f === TOP) return t.j < 1 && t.i % 3 === 0 ? [222, 214, 196] : [128, 56, 52];
      return hide;
    case 'hornR':
    case 'hornL':
      return t.x > 3.5 ? [236, 228, 212] : r > 0.5 ? [196, 186, 166] : [212, 202, 182];
    case 'body':
      // Lomo más oscuro con una franja central.
      if (t.f === TOP && Math.abs(t.x - 7) < 1.5) return pick(RAVAGER_HIDE, k - 1);
      return hide;
    default:
      if (t.part.startsWith('leg') && t.y < 2.2) return r > 0.5 ? [40, 36, 32] : [48, 44, 40];
      return hide;
  }
}

// ---------------------------------------------------------------------------
// Colmillos del evocador: mandíbulas de hueso sobre una base de piedra
// ---------------------------------------------------------------------------

function fangs(t: Texel): Paint {
  const r = rnd(t, 6666);
  if (t.part === 'base') return r > 0.5 ? [70, 68, 64] : [84, 82, 78];
  // Dientes en el borde interior de cada mandíbula.
  if (t.y > 9 && t.x % 2 < 1) return [240, 236, 222];
  if (t.y > 10) return [150, 140, 120];
  return r > 0.5 ? [206, 198, 178] : [222, 214, 196];
}

export const ILLAGER_PAINTERS: Readonly<Record<number, Painter>> = {
  [MOB_PILLAGER]: illager(PILLAGER),
  [MOB_VINDICATOR]: illager(VINDICATOR),
  [MOB_EVOKER]: illager(EVOKER),
  [MOB_VEX]: vex,
  [MOB_RAVAGER]: ravager,
  [MOB_EVOKER_FANGS]: fangs,
};
