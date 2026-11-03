// Texturas procedurales de las criaturas acuáticas (fase 6). Mismo esquema que mobTextures.ts
// (que las registra): cada pintor recibe un téxel de una cara con su posición 3D sobre la caja y
// devuelve su color; los { c, glow } son emisivos (manchas del calamar brillante).
import {
  MOB_COD, MOB_SALMON, MOB_TROPICAL_FISH, MOB_PUFFERFISH, MOB_DOLPHIN, MOB_TURTLE, MOB_AXOLOTL, MOB_FROG, MOB_TADPOLE,
  MOB_GLOW_SQUID,
} from '../../shared/mobs';

type RGB = readonly [number, number, number];

/** Téxel de una cara (ver Texel en mobTextures.ts). */
interface AquaTexel {
  g: string;
  f: number;
  i: number;
  j: number;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

type Paint = RGB | { c: RGB; glow: true };

// Caras (orden de boxFaces).
const PX = 0;
const NX = 1;
const TOP = 2;
const BOTTOM = 3;
const FRONT = 4;
const BACK = 5;

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

/** Valor aleatorio por téxel. */
function rnd(t: AquaTexel, seed: number): number {
  return hash3(Math.round(t.x * 2), Math.round(t.y * 2), Math.round(t.z * 2) + t.f * 131, seed);
}

/** Ruido de valor 3D suave con celdas de lado `s`. */
function vnoise(x: number, y: number, z: number, s: number, seed: number): number {
  const fx = x / s, fy = y / s, fz = z / s;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const sm = (v: number) => v * v * (3 - 2 * v);
  const tx = sm(fx - x0), ty = sm(fy - y0), tz = sm(fz - z0);
  const c = (dx: number, dy: number, dz: number) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), tx), l(c(0, 1, 0), c(1, 1, 0), tx), ty),
    l(l(c(0, 0, 1), c(1, 0, 1), tx), l(c(0, 1, 1), c(1, 1, 1), tx), ty),
    tz,
  );
}

function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const side = (t: AquaTexel): boolean => t.f === PX || t.f === NX || t.f === FRONT || t.f === BACK;
const flank = (t: AquaTexel): boolean => t.f === PX || t.f === NX;

/** Tono con grano: color base con una variación suave y otra fina. */
function grain(c: RGB, t: AquaTexel, seed: number, amount = 0.12): RGB {
  const v = 0.6 * vnoise(t.x, t.y, t.z, 2.2, seed) + 0.4 * rnd(t, seed + 1);
  return scale(c, 1 + (v - 0.5) * amount * 2);
}

/** Degradado de lomo oscuro a vientre claro según la altura del téxel en la caja. */
function countershade(t: AquaTexel, back: RGB, flankC: RGB, belly: RGB): RGB {
  if (t.f === TOP) return back;
  if (t.f === BOTTOM) return belly;
  const k = t.h > 0 ? t.y / t.h : 0.5;
  return k > 0.62 ? mix(flankC, back, (k - 0.62) / 0.38) : k < 0.3 ? mix(belly, flankC, k / 0.3) : flankC;
}

/** Ojo en los costados de una cabeza: pupila oscura con un brillo (a `ez` del frente, a `ey` de altura). */
function eyeAt(t: AquaTexel, ez: number, ey: number, iris: RGB = [20, 18, 16]): Paint | null {
  if (!flank(t)) return null;
  if (Math.abs(t.z - ez) < 0.6 && Math.abs(t.y - ey) < 0.6) return iris;
  return null;
}

// ---------------------------------------------------------------------------
// Peces
// ---------------------------------------------------------------------------

interface FishStyle {
  back: RGB;
  flank: RGB;
  belly: RGB;
  fin: RGB;
  spot: RGB;
  spots: number;
  seed: number;
  /** Línea lateral clara. */
  line?: RGB;
}

const COD_STYLE: FishStyle = {
  back: [112, 98, 74], flank: [170, 148, 108], belly: [224, 214, 188], fin: [150, 128, 92], spot: [96, 80, 58], spots: 0.78,
  seed: 3001, line: [214, 204, 176],
};
const SALMON_STYLE: FishStyle = {
  back: [74, 92, 88], flank: [188, 84, 74], belly: [232, 188, 168], fin: [150, 62, 58], spot: [40, 48, 46], spots: 0.8, seed: 3101,
};

function fishLike(t: AquaTexel, s: FishStyle): Paint {
  switch (t.g) {
    case 'head': {
      const e = eyeAt(t, 1, t.h - 1.2);
      if (e) return e;
      return grain(countershade(t, s.back, s.flank, s.belly), t, s.seed);
    }
    case 'nose':
      return grain(countershade(t, s.back, s.flank, s.belly), t, s.seed + 1);
    case 'fin':
    case 'finTop':
      return grain(t.y > t.h * 0.6 || t.f === TOP ? scale(s.fin, 0.85) : s.fin, t, s.seed + 2);
    case 'tail':
      return grain(t.z > t.d - 1.2 ? scale(s.fin, 0.8) : s.fin, t, s.seed + 3);
    default: {
      let c = countershade(t, s.back, s.flank, s.belly);
      if (s.line && flank(t) && Math.abs(t.y - t.h * 0.55) < 0.5) c = s.line;
      else if (t.f !== BOTTOM && t.y > t.h * 0.45 && vnoise(t.x, t.y, t.z, 1.3, s.seed + 4) > s.spots) c = s.spot;
      return grain(c, t, s.seed + 5);
    }
  }
}

const TROPICAL_ORANGE: RGB = [240, 128, 34];
const TROPICAL_WHITE: RGB = [246, 244, 236];
const TROPICAL_BLACK: RGB = [28, 24, 26];

/** Pez tropical: naranja con dos franjas blancas ribeteadas de negro (como un pez payaso). */
function tropical(t: AquaTexel): Paint {
  const band = (z: number): Paint | null => {
    for (const c of [1.6, 4.1]) {
      const d = Math.abs(z - c);
      if (d < 0.5) return TROPICAL_WHITE;
      if (d < 1) return TROPICAL_BLACK;
    }
    return null;
  };
  switch (t.g) {
    case 'body': {
      const e = t.z < 1.2 && flank(t) && Math.abs(t.y - (t.h - 1.5)) < 0.6 ? TROPICAL_BLACK : null;
      if (e) return e;
      if (t.f !== FRONT && t.f !== BACK) {
        const b = band(t.z);
        if (b) return b;
      }
      return grain(t.f === BOTTOM ? mix(TROPICAL_ORANGE, TROPICAL_WHITE, 0.3) : TROPICAL_ORANGE, t, 3201, 0.08);
    }
    case 'tail':
      return t.z > t.d - 1 ? TROPICAL_BLACK : grain(TROPICAL_ORANGE, t, 3202, 0.08);
    default:
      // Aletas: naranja con el borde negro.
      return (t.g === 'finTop' ? t.y > t.h - 1 : t.y < 1) && side(t) ? TROPICAL_BLACK : grain(TROPICAL_ORANGE, t, 3203, 0.08);
  }
}

const PUFFER_YELLOW: RGB = [224, 192, 58];
const PUFFER_CREAM: RGB = [242, 232, 180];
const PUFFER_BROWN: RGB = [150, 118, 46];

function puffer(t: AquaTexel): Paint {
  switch (t.g) {
    case 'body': {
      if (t.f === FRONT) {
        // Ojos grandes arriba y boquita abajo.
        if (t.j >= 2 && t.j < 4 && (t.i === 1 || t.i === 2 || t.i === 5 || t.i === 6)) return t.j === 2 && (t.i === 2 || t.i === 5) ? [236, 236, 230] : [20, 18, 14];
        if (t.j === 6 && t.i >= 3 && t.i <= 4) return [120, 70, 40];
      }
      if (t.f === BOTTOM) return grain(PUFFER_CREAM, t, 3301, 0.06);
      if (side(t) && t.y < 2.5) return grain(mix(PUFFER_CREAM, PUFFER_YELLOW, t.y / 2.5), t, 3302, 0.06);
      if (vnoise(t.x, t.y, t.z, 1.5, 3303) > 0.72) return PUFFER_BROWN;
      return grain(PUFFER_YELLOW, t, 3304, 0.08);
    }
    case 'spike':
      return t.y > 1 ? [246, 240, 214] : [214, 196, 132];
    default:
      return grain(mix(PUFFER_YELLOW, [214, 150, 40], 0.4), t, 3305, 0.08);
  }
}

// ---------------------------------------------------------------------------
// Delfín
// ---------------------------------------------------------------------------

const DOLPHIN_BACK: RGB = [96, 110, 128];
const DOLPHIN_FLANK: RGB = [140, 152, 168];
const DOLPHIN_BELLY: RGB = [224, 228, 232];

function dolphin(t: AquaTexel): Paint {
  const skin = (): RGB => grain(countershade(t, DOLPHIN_BACK, DOLPHIN_FLANK, DOLPHIN_BELLY), t, 3401, 0.05);
  switch (t.g) {
    case 'head': {
      const e = eyeAt(t, 1.5, 3.2);
      if (e) return e;
      // Mancha oscura alrededor del ojo.
      if (flank(t) && Math.abs(t.z - 1.5) < 1.3 && Math.abs(t.y - 3.2) < 1.1) return scale(DOLPHIN_BACK, 0.8);
      return skin();
    }
    case 'nose':
      return t.f === BOTTOM ? DOLPHIN_BELLY : grain(t.f === TOP ? DOLPHIN_BACK : DOLPHIN_FLANK, t, 3402, 0.05);
    case 'fin':
    case 'finTop':
    case 'tailFin':
      return grain(scale(DOLPHIN_BACK, 0.9), t, 3403, 0.06);
    default:
      return skin();
  }
}

// ---------------------------------------------------------------------------
// Tortuga
// ---------------------------------------------------------------------------

const SHELL: RGB[] = [[46, 86, 42], [62, 108, 52], [80, 128, 62], [98, 144, 72]];
const TURTLE_SKIN: RGB = [104, 146, 82];
const TURTLE_BELLY: RGB = [206, 196, 128];

function turtle(t: AquaTexel): Paint {
  switch (t.g) {
    case 'body': {
      if (t.f === BOTTOM) return grain(TURTLE_BELLY, t, 3501, 0.06);
      // Escudos: celdas hexagonales aproximadas con surcos oscuros y centro claro.
      const cx = t.x / 5, cz = t.z / 5 + (Math.floor(t.x / 5) % 2) * 0.5;
      const fx = cx - Math.floor(cx), fz = cz - Math.floor(cz);
      const edge = Math.min(fx, 1 - fx, fz, 1 - fz);
      if (t.f === TOP) {
        if (edge < 0.1) return SHELL[0];
        return grain(edge > 0.3 ? SHELL[3] : SHELL[2], t, 3502, 0.08);
      }
      // Borde del caparazón.
      if (t.y < 1.2) return grain(TURTLE_BELLY, t, 3503, 0.06);
      return grain(Math.floor(t.x + t.z) % 4 === 0 ? SHELL[0] : SHELL[1], t, 3504, 0.08);
    }
    case 'belly':
      return grain(TURTLE_BELLY, t, 3505, 0.06);
    case 'head': {
      const e = eyeAt(t, 1.5, 3.3);
      if (e) return e;
      if (t.f === FRONT && t.j === 3) return scale(TURTLE_SKIN, 0.6);
      if (t.f === BOTTOM) return mix(TURTLE_SKIN, TURTLE_BELLY, 0.6);
      return grain(vnoise(t.x, t.y, t.z, 1.2, 3506) > 0.7 ? scale(TURTLE_SKIN, 0.8) : TURTLE_SKIN, t, 3507, 0.06);
    }
    default:
      return grain(vnoise(t.x, t.y, t.z, 1.2, 3508) > 0.7 ? scale(TURTLE_SKIN, 0.8) : TURTLE_SKIN, t, 3509, 0.06);
  }
}

// ---------------------------------------------------------------------------
// Ajolote (rosa)
// ---------------------------------------------------------------------------

const AXO_PINK: RGB = [236, 164, 186];
const AXO_LIGHT: RGB = [248, 204, 216];
const AXO_GILL: RGB = [206, 64, 116];

function axolotl(t: AquaTexel): Paint {
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        // Ojos negros a los lados y una sonrisa.
        if (t.j === 1 && (t.i === 0 || t.i === 7)) return [20, 16, 20];
        if (t.j === 3 && t.i >= 2 && t.i <= 5) return [170, 90, 110];
      }
      return grain(t.f === BOTTOM ? AXO_LIGHT : AXO_PINK, t, 3601, 0.06);
    case 'gill':
    case 'gillTop':
      return grain(t.y > t.h - 1.5 ? scale(AXO_GILL, 0.85) : AXO_GILL, t, 3602, 0.1);
    case 'legFR':
      return grain(t.y < 1 ? AXO_LIGHT : AXO_PINK, t, 3603, 0.06);
    case 'tail':
      return grain(t.y > t.h - 1 || t.y < 1 ? AXO_LIGHT : AXO_PINK, t, 3604, 0.06);
    default:
      if (t.f === BOTTOM) return grain(AXO_LIGHT, t, 3605, 0.05);
      return grain(vnoise(t.x, t.y, t.z, 1.6, 3606) > 0.74 ? scale(AXO_PINK, 0.9) : AXO_PINK, t, 3607, 0.06);
  }
}

// ---------------------------------------------------------------------------
// Rana y renacuajo
// ---------------------------------------------------------------------------

/** Las tres variedades: [piel, manchas, panza]: templada (naranja), cálida (blanca con motas ocres) y fría (verde). */
const FROG_COLORS: readonly (readonly [RGB, RGB, RGB])[] = [
  [[192, 118, 62], [140, 78, 40], [230, 212, 160]],
  [[226, 214, 190], [196, 150, 96], [246, 238, 222]],
  [[96, 146, 72], [58, 98, 48], [206, 220, 170]],
];

/** La rana de la variedad `v` (la lengua, rosa). */
export function frogPainter(v: number): (t: AquaTexel) => Paint {
  return (t) => (t.g === 'tongue' ? [222, 110, 128] : frog(t, v));
}

function frog(t: AquaTexel, v = 0): Paint {
  const [FROG_SKIN, FROG_DARK, FROG_BELLY] = FROG_COLORS[v] ?? FROG_COLORS[0];
  const skin = (seed: number): RGB => grain(vnoise(t.x, t.y, t.z, 1.4, seed) > 0.68 ? FROG_DARK : FROG_SKIN, t, seed + 1, 0.07);
  switch (t.g) {
    case 'eye':
      // Ojo saltón: iris dorado con pupila negra hacia fuera y por delante.
      if (t.f === FRONT || flank(t)) {
        if (Math.abs(t.y - 1) < 0.6 && (t.f === FRONT ? Math.abs(t.x - 1.5) < 0.6 : Math.abs(t.z - 1) < 0.6)) return [18, 16, 14];
        if (t.y > 0.4) return [214, 176, 70];
      }
      return skin(3701);
    case 'head':
      if (t.f === BOTTOM) return FROG_BELLY;
      if (t.f === FRONT && t.j === 1) return scale(FROG_SKIN, 0.55);
      return skin(3703);
    case 'arm':
    case 'leg':
      return t.f === BOTTOM ? FROG_BELLY : skin(3705);
    default:
      if (t.f === BOTTOM || (side(t) && t.y < 1)) return grain(FROG_BELLY, t, 3707, 0.05);
      return skin(3708);
  }
}

function tadpole(t: AquaTexel): Paint {
  if (t.g === 'body') {
    if (flank(t) && t.z < 1 && t.y > 1) return [12, 10, 10];
    return grain(t.f === BOTTOM ? [96, 80, 66] : [62, 50, 42], t, 3801, 0.08);
  }
  return grain(t.z > t.d - 1.5 ? [110, 94, 78] : [78, 64, 54], t, 3802, 0.08);
}

// ---------------------------------------------------------------------------
// Calamar brillante
// ---------------------------------------------------------------------------

const GLOW_BODY: RGB[] = [[18, 60, 76], [24, 80, 96], [32, 100, 116], [44, 122, 136], [62, 146, 156]];
const GLOW_LIGHT: RGB = [120, 244, 226];

function glowSquid(t: AquaTexel): Paint {
  const r = rnd(t, 3901);
  const n = vnoise(t.x, t.y, t.z, 2.2, 3902);
  if (t.g === 'tent') {
    // Tentáculos con anillos luminosos y la punta brillante.
    if (t.y < 2) return { c: GLOW_LIGHT, glow: true };
    if (Math.floor(t.y) % 5 === 0) return { c: mix(GLOW_LIGHT, GLOW_BODY[3], 0.4), glow: true };
    return GLOW_BODY[r > 0.8 ? 2 : 1];
  }
  if (t.f === BOTTOM) {
    const dx = Math.abs(t.x - 6), dz = Math.abs(t.z - 6);
    if (dx < 1 && dz < 1) return [10, 30, 36];
    return GLOW_BODY[r > 0.7 ? 3 : 4];
  }
  // Ojos grandes y luminosos en los costados.
  if (flank(t) && t.j >= 8 && t.j < 12 && t.i >= 4 && t.i < 8) {
    const ci = t.i - 5.5, cj = t.j - 9.5;
    if (Math.abs(ci) < 0.6 && Math.abs(cj) < 0.6) return [8, 20, 24];
    return { c: [200, 255, 244], glow: true };
  }
  // Manchas luminosas sobre el manto.
  if (n > 0.66 && r > 0.25) return { c: mix(GLOW_BODY[4], GLOW_LIGHT, (n - 0.66) * 3), glow: true };
  let k = 2 + (n < 0.3 ? -1 : 0);
  if (t.y < 4) k += 1;
  if (t.f === TOP) k -= 1;
  return GLOW_BODY[Math.max(0, Math.min(GLOW_BODY.length - 1, k))];
}

/** Pintores por id de criatura (mobTextures.ts los añade a los suyos). */
export const AQUATIC_PAINTERS: Readonly<Record<number, (t: AquaTexel) => Paint>> = {
  [MOB_COD]: (t) => fishLike(t, COD_STYLE),
  [MOB_SALMON]: (t) => fishLike(t, SALMON_STYLE),
  [MOB_TROPICAL_FISH]: tropical,
  [MOB_PUFFERFISH]: puffer,
  [MOB_DOLPHIN]: dolphin,
  [MOB_TURTLE]: turtle,
  [MOB_AXOLOTL]: axolotl,
  [MOB_FROG]: frog,
  [MOB_TADPOLE]: tadpole,
  [MOB_GLOW_SQUID]: glowSquid,
};
