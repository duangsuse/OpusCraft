// Fase 7.5 (océano): texturas procedurales del guardián y del guardián anciano (mobTextures.ts las
// registra). Cuerpo de escamas en losetas (verde azulado el guardián, hueso pálido el anciano), placas
// laterales con el borde oscuro y remaches, un ojo claro con la pupila, púas con la punta clara y la cola
// que se aclara hacia la aleta.
import { MOB_GUARDIAN, MOB_ELDER_GUARDIAN } from '../../shared/mobs';
import { vnoise, rnd, scale, TOP, BOTTOM, FRONT, type Texel, type Paint, type MobRGB } from './mobTextures';

type RGB = MobRGB;

interface GuardianStyle {
  body: RGB;
  dark: RGB;
  light: RGB;
  plate: RGB;
  rim: RGB;
  spike: RGB;
  tip: RGB;
  fin: RGB;
  seed: number;
}

const GUARDIAN: GuardianStyle = {
  body: [84, 138, 122], dark: [52, 96, 90], light: [132, 184, 160], plate: [104, 164, 150], rim: [44, 78, 76],
  spike: [206, 118, 52], tip: [244, 206, 138], fin: [214, 142, 76], seed: 7301,
};
const ELDER: GuardianStyle = {
  body: [204, 198, 176], dark: [150, 144, 124], light: [232, 228, 210], plate: [158, 156, 184], rim: [100, 96, 122],
  spike: [220, 212, 190], tip: [250, 246, 232], fin: [166, 150, 176], seed: 7401,
};

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Escamas en losetas de 3×3 con la juntura oscura y un brillo suave. */
function scales(t: Texel, s: GuardianStyle, seed: number): RGB {
  const u = t.f === TOP || t.f === BOTTOM ? t.x : t.f === FRONT || t.f === 5 ? t.x : t.z;
  const v = t.f === TOP || t.f === BOTTOM ? t.z : t.y;
  const seam = Math.floor(u) % 3 === 0 || Math.floor(v + (Math.floor(u / 3) % 2) * 1.5) % 3 === 0;
  const n = vnoise(t.x, t.y, t.z, 2.5, seed);
  let c = mix(s.body, n > 0.6 ? s.light : s.body, Math.max(0, n - 0.6) * 2.5);
  if (seam) c = mix(c, s.dark, 0.55);
  return scale(c, 0.94 + rnd(t, seed + 3) * 0.12);
}

function guardian(t: Texel, s: GuardianStyle): Paint {
  switch (t.g) {
    case 'eye': {
      // Ojo claro con la pupila en medio de la cara de delante.
      if (t.f === FRONT && t.i === 1 && t.j === 1) return [58, 20, 34];
      return t.f === FRONT ? [244, 234, 226] : [200, 186, 180];
    }
    case 'spike': {
      // Púa: la punta (lo más alejado del cuerpo, arriba en la caja) clara; la base, del color de la púa.
      const k = t.h > 0 ? t.y / t.h : 0.5;
      return scale(k > 0.8 ? s.tip : mix(s.spike, s.tip, Math.max(0, k - 0.5)), 0.92 + rnd(t, s.seed + 11) * 0.12);
    }
    case 'plate':
    case 'plateTop':
    case 'plateBottom': {
      // Placa: borde oscuro, remaches en las esquinas y el centro algo más claro.
      const face = t.f === TOP || t.f === BOTTOM || (t.fw > 4 && t.fh > 4);
      if (face) {
        const edge = t.i === 0 || t.j === 0 || t.i === t.fw - 1 || t.j === t.fh - 1;
        if (edge) return s.rim;
        const corner = (t.i === 1 || t.i === t.fw - 2) && (t.j === 1 || t.j === t.fh - 2);
        if (corner) return s.tip;
        const cx = Math.abs(t.i - (t.fw - 1) / 2) / t.fw, cy = Math.abs(t.j - (t.fh - 1) / 2) / t.fh;
        return scale(mix(s.plate, s.light, Math.max(0, 0.3 - Math.max(cx, cy)) * 2), 0.95 + rnd(t, s.seed + 5) * 0.1);
      }
      return s.rim;
    }
    case 'tail':
      return scale(mix(scales(t, s, s.seed + 7), s.light, Math.min(0.4, t.z / Math.max(1, t.d) * 0.4)), 1);
    case 'fin': {
      // Aleta: membrana con radios más oscuros.
      const ray = Math.floor(t.y) % 3 === 0;
      return scale(ray ? mix(s.fin, s.rim, 0.4) : s.fin, 0.94 + rnd(t, s.seed + 9) * 0.1);
    }
    default: {
      // Cuerpo: en la cara de delante, la cuenca del ojo más oscura.
      if (t.f === FRONT && Math.abs(t.x - t.w / 2) < 2.5 && Math.abs(t.y - t.h / 2) < 2.5) return mix(s.dark, s.rim, 0.5);
      return scales(t, s, s.seed);
    }
  }
}

/** Pintores por id de criatura. */
export const OCEAN_PAINTERS: Readonly<Record<number, (t: Texel) => Paint>> = {
  [MOB_GUARDIAN]: (t) => guardian(t, GUARDIAN),
  [MOB_ELDER_GUARDIAN]: (t) => guardian(t, ELDER),
};

/** Colores del guardián anciano para la aparición fantasmal (cara, placas, ojo, púas). */
export const ELDER_FACE_COLORS = { body: ELDER.body, dark: ELDER.dark, plate: ELDER.plate, rim: ELDER.rim, spike: ELDER.spike };
