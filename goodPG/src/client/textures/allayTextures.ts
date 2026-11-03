// Fase 7.5 (mansión): textura procedural del alay. Todo él brilla (se ve igual de noche): cuerpo azul
// celeste que se oscurece hacia el faldón, cara de un azul más hondo con dos ojos claros y alas de velo
// casi blanco con nervios. Como illagerTextures.ts, se importa mutuamente con mobTextures.ts: aquí sólo
// hay funciones y constantes propias.
import { MOB_ALLAY } from '../../shared/allay';
import { FRONT, TOP, BOTTOM, glow, rnd, vnoise, type Texel, type Paint, type Painter, type RGB } from './mobTextures';

const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const SKIN_TOP: RGB = [150, 234, 255];
const SKIN_LOW: RGB = [52, 150, 240];
const FACE: RGB = [36, 84, 196];
const EYE: RGB = [226, 250, 255];

function allay(t: Texel): Paint {
  const n = vnoise(t.x, t.y, t.z, 1.6, 7676);
  const r = rnd(t, 7676);
  const lift = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const sparkle = r > 0.93 ? 1.12 : 1 - (n - 0.5) * 0.12;
  switch (t.part) {
    case 'head': {
      if (t.f === FRONT) {
        // Cara: un óvalo más oscuro con los ojos arriba, en los téxeles 1 y 3 de la tercera fila.
        const face = t.i >= 1 && t.i <= 3 && t.j >= 1 && t.j <= 3;
        if (face && t.j === 2 && (t.i === 1 || t.i === 3)) return glow(EYE);
        if (face) return glow(lift(FACE, sparkle));
      }
      const k = t.f === TOP ? 0 : t.f === BOTTOM ? 0.55 : 0.2 + (1 - t.y / t.h) * 0.35;
      return glow(lift(mix(SKIN_TOP, SKIN_LOW, k), sparkle));
    }
    case 'body': {
      // Más oscuro hacia abajo (el faldón), con una franja clara por delante.
      const k = 1 - t.y / t.h;
      let c = mix(SKIN_TOP, SKIN_LOW, 0.25 + k * 0.7);
      if (t.f === FRONT && t.i === 1) c = mix(c, SKIN_TOP, 0.45);
      return glow(lift(c, sparkle));
    }
    case 'armR':
    case 'armL':
      return glow(lift(mix(SKIN_TOP, SKIN_LOW, 0.35 + (1 - t.y / t.h) * 0.3), sparkle));
    case 'wingR':
    case 'wingL': {
      // Velo pálido con nervios que salen de la base y el borde más claro.
      const vein = Math.abs(((t.z * 0.9 + t.y * 0.5) % 2.6) - 1.3) < 0.25;
      const edge = t.y < 0.9 || t.z > t.d - 1;
      return glow(edge ? [236, 250, 255] : vein ? [206, 238, 255] : lift([164, 214, 250], 1 + (r - 0.5) * 0.08));
    }
    default:
      return glow(SKIN_LOW);
  }
}

export const ALLAY_PAINTERS: Readonly<Record<number, Painter>> = {
  [MOB_ALLAY]: allay,
};
