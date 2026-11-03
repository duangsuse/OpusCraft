// Fase 7.5 (abismo): textura procedural del warden. Piel de un verde azulado muy oscuro con manchas más
// claras, el costillar de hueso pálido (con huecos) delante del pecho, almas turquesa que brillan en el
// pecho y los hombros, el corazón (una lámina emisiva que la animación hace latir), la cara sin ojos con
// la boca y los dientes, y los zarcillos de la cabeza (láminas recortadas con el interior claro que brilla).
// Como illagerTextures.ts, este módulo y mobTextures.ts se importan mutuamente: aquí arriba sólo hay
// funciones y constantes propias.
import { MOB_WARDEN } from '../../shared/mobs';
import { PX, NX, TOP, BOTTOM, FRONT, glow, rnd, vnoise, CLEAR, type Texel, type Paint, type Painter, type RGB } from './mobTextures';

const SKIN: RGB[] = [[8, 26, 32], [12, 36, 44], [18, 48, 56], [26, 62, 70], [38, 80, 88]];
const BONE: RGB[] = [[96, 122, 118], [132, 158, 150], [168, 190, 180]];
const SOUL: RGB = [64, 214, 222];
const SOUL_HOT: RGB = [180, 255, 250];

const pick = (pal: readonly RGB[], k: number): RGB => pal[Math.max(0, Math.min(pal.length - 1, k))];

/** Piel con pliegues y manchas claras sueltas. */
function skin(t: Texel, seed: number): RGB {
  const n = vnoise(t.x, t.y, t.z, 2.6, seed) * 0.7 + rnd(t, seed + 3) * 0.3;
  let k = n < 0.3 ? 1 : n > 0.75 ? 3 : 2;
  if (t.f === BOTTOM) k -= 1;
  if (t.f === TOP) k += 1;
  if (rnd(t, seed + 9) > 0.93) k = 4;
  return pick(SKIN, k);
}

/** Almas: motas turquesa emisivas en el pecho y los hombros. */
function soulSpot(t: Texel, seed: number, density: number): Paint | null {
  const v = vnoise(t.x * 1.3, t.y * 1.3, t.z * 1.3, 1.6, seed);
  if (v > 1 - density) return glow(v > 1 - density * 0.35 ? SOUL_HOT : SOUL);
  return null;
}

function body(t: Texel): Paint {
  // En el pecho, bajo el costillar, las almas; en la espalda, alguna suelta.
  if (t.f === FRONT) return soulSpot(t, 71, 0.22) ?? pick(SKIN, 0);
  if (t.f !== BOTTOM && t.y > t.h - 4) return soulSpot(t, 73, 0.12) ?? skin(t, 70);
  return skin(t, 70);
}

/** Costillar: costillas horizontales de hueso con huecos (transparentes) entre ellas. */
function ribs(t: Texel): Paint {
  const row = Math.floor(t.y);
  const col = Math.floor(t.x);
  const rib = row % 4 === 1 || row % 4 === 2;
  // El esternón: una columna de hueso en el borde interior.
  const spine = t.part === 'ribR' ? col === 0 : col === 8;
  if (!rib && !spine) return CLEAR;
  if (row < 2 || row > 18) return spine ? pick(BONE, 1) : CLEAR;
  return pick(BONE, (row % 4 === 1 ? 2 : 1) - (rnd(t, 81) > 0.85 ? 1 : 0));
}

/** Corazón: una mancha turquesa que brilla (con el centro casi blanco). */
function heart(t: Texel): Paint {
  const d = Math.hypot(t.x - 3.5, t.y - 3.8);
  if (d > 3.3) return CLEAR;
  return glow(d < 1.2 ? SOUL_HOT : d < 2.3 ? SOUL : [30, 150, 160]);
}

function head(t: Texel): Paint {
  if (t.f === FRONT) {
    // Sin ojos: una boca ancha y oscura con dientes arriba y abajo, y almas en las mejillas.
    const mx = t.x, my = t.y;
    if (my > 3 && my < 8 && mx > 2 && mx < 14) {
      const teeth = (my < 4.6 || my > 6.4) && Math.floor(mx) % 2 === 0;
      return teeth ? pick(BONE, 2) : [4, 10, 12];
    }
    if (my > 9 && (mx < 3 || mx > 13)) return soulSpot(t, 91, 0.35) ?? skin(t, 90);
    return skin(t, 90);
  }
  if (t.f === TOP) return soulSpot(t, 93, 0.14) ?? skin(t, 90);
  return skin(t, 90);
}

/** Zarcillos: una banda curva (de la base, junto a la cabeza, hacia arriba y afuera) con el interior claro. */
function tendril(t: Texel): Paint {
  // Coordenadas de la lámina: u = 0 junto a la cabeza (lado derecho: x; izquierdo: w − x), v de abajo arriba.
  const u = t.part === 'tendrilR' ? t.x : t.w - t.x;
  const v = t.y;
  const center = 2 + (u / 16) ** 1.6 * 12;
  const width = 3.2 - u * 0.12;
  const d = Math.abs(v - center);
  if (d > width || u > 15.5) return CLEAR;
  if (d < width * 0.45) return glow(u > 11 ? SOUL_HOT : [40, 170, 180]);
  return pick(SKIN, d > width * 0.8 ? 1 : 3);
}

function limb(t: Texel): Paint {
  // Franjas de hueso en los antebrazos y rodillas, almas sueltas en los hombros.
  const band = t.g === 'arm' ? t.y > 6 && t.y < 9 : t.y > 8 && t.y < 10;
  if (band && t.f !== TOP && t.f !== BOTTOM) return pick(BONE, 0);
  if (t.g === 'arm' && t.y > t.h - 5 && (t.f === PX || t.f === NX || t.f === TOP)) return soulSpot(t, 101, 0.2) ?? skin(t, 100);
  return skin(t, 100);
}

const warden: Painter = (t) => {
  switch (t.part) {
    case 'body': return body(t);
    case 'ribR':
    case 'ribL': return ribs(t);
    case 'heart': return heart(t);
    case 'head': return head(t);
    case 'tendrilR':
    case 'tendrilL': return tendril(t);
    default: return limb(t);
  }
};

export const WARDEN_PAINTERS: Record<number, Painter> = { [MOB_WARDEN]: warden };
