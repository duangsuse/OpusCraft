// Fase 7.5 (fauna): texturas procedurales de las criaturas sueltas (mismo pintado por téxel que
// mobTextures.ts): murciélago, ocelote, champiñaca roja y marrón (con sus champiñones recortados),
// llama de comerciante (cuatro pelajes y la manta del comerciante), caballo esqueleto y caballo zombi.
// Las partes planas (alas del murciélago, champiñones, crin del esqueleto) se recortan después de
// pintar: lo que no es de la silueta queda transparente (el sombreador lo descarta).
import {
  MOBS, boxFaces, MOB_SKELETON, MOB_BAT, MOB_OCELOT, MOB_MOOSHROOM, MOB_TRADER_LLAMA, MOB_SKELETON_HORSE, MOB_ZOMBIE_HORSE,
  type MobDef,
} from '../../shared/mobs';
import { ARMOR } from '../../shared/items';
import {
  paintMob, fur, mapAt, tone, side, rnd, vnoise, scale, clamp01, saddlePaint, llama, LLAMA_COATS,
  PX, NX, TOP, BOTTOM, FRONT, type Texel, type Paint, type RGB, type MobTexture,
} from './mobTextures';

/** Textura de una criatura nueva (null si no es de las nuevas). `variant`: color de la champiñaca o pelaje. */
export function critterTexture(mobId: number, variant: number): MobTexture | null {
  switch (mobId) {
    case MOB_BAT:
      return cutout(mobId, paintMob(mobId, bat), batHole);
    case MOB_OCELOT:
      return paintMob(mobId, ocelot);
    case MOB_MOOSHROOM: {
      const brown = variant === 1;
      return cutout(mobId, paintMob(mobId, (t) => mooshroom(t, brown)), (part, x, y, face) => mushroomHole(part, x, y, face, brown));
    }
    case MOB_TRADER_LLAMA: {
      const coats = LLAMA_COATS;
      const coat = coats[((variant % coats.length) + coats.length) % coats.length];
      return cutout(mobId, paintMob(mobId, (t) => (t.g === 'decor' ? traderDecor(t) : llama(t, coat))), decorHole);
    }
    case MOB_SKELETON_HORSE:
      return cutout(mobId, paintMob(mobId, skeletonHorse), (part, _x, y) => part === 'mane' && Math.floor(y) % 3 === 2);
    case MOB_ZOMBIE_HORSE:
      return paintMob(mobId, zombieHorse);
    default:
      return null;
  }
}

/**
 * Recorta una textura: los téxeles de las caras laterales para los que `hole(parte, x, y)` es true quedan
 * transparentes (x, y: posición en la caja, como en el pintado).
 */
function cutout(mobId: number, tex: MobTexture, hole: (part: string, x: number, y: number, face: number) => boolean): MobTexture {
  const mob = MOBS[mobId];
  const [W] = mob.atlas;
  for (const p of mob.parts) {
    const [w, h, d] = p.size;
    boxFaces(p.uv[0], p.uv[1], w, h, d).forEach(([fu, fv, fw, fh], f) => {
      if (f === TOP || f === BOTTOM) return;
      for (let j = 0; j < fh; j++) {
        for (let i = 0; i < fw; i++) {
          const a = i + 0.5, b = j + 0.5;
          const x = f === FRONT ? w - a : f === PX ? d - a : a;
          if (!hole(p.name, x, h - b, f)) continue;
          tex.rgba[((fv + j) * W + fu + i) * 4 + 3] = 0;
        }
      }
    });
  }
  return tex;
}

// ---------------------------------------------------------------------------
// Murciélago
// ---------------------------------------------------------------------------

const BAT_FUR: RGB[] = [
  [42, 32, 26],
  [56, 43, 34],
  [70, 54, 42],
  [84, 66, 50],
];
const BAT_SKIN: RGB[] = [
  [34, 28, 26],
  [46, 38, 34],
  [58, 48, 42],
];

function bat(t: Texel): Paint {
  const seed = 7878;
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        const m = mapAt(['....', '.EE.', '.nn.'], t, { E: [12, 10, 10], n: [96, 64, 58] });
        if (m) return m;
      }
      return fur(t, BAT_FUR, seed);
    case 'ear':
      return t.f === FRONT ? [98, 70, 62] : tone(BAT_SKIN, 0.5);
    case 'wing':
    case 'wingTip': {
      // Membrana oscura con los «dedos» algo más claros en abanico.
      const finger = t.g === 'wing' ? Math.abs(t.y - (t.h - 0.5) + t.x * 0.35) < 0.5 : Math.abs(t.y - t.x * 0.6 - 1) < 0.5 || t.y > t.h - 1;
      if (finger) return tone(BAT_SKIN, 0.99);
      return tone(BAT_SKIN, clamp01(0.3 * vnoise(t.x, t.y, 0, 2, seed + 3) + 0.2 * rnd(t, seed + 4)));
    }
    case 'feet':
      return [30, 24, 20];
    default:
      return t.f === FRONT ? scale(fur(t, BAT_FUR, seed + 1), 1.12) : fur(t, BAT_FUR, seed + 1);
  }
}

/** Borde de abajo de las alas en festón (entre los dedos). */
function batHole(part: string, x: number, y: number): boolean {
  if (part.startsWith('wingTip')) return y < 1.2 - 0.9 * Math.abs(Math.sin(x * 1.6)) || y < (x - 2.5) * 0.9;
  if (part.startsWith('wing')) return y < 0.9 - 0.9 * Math.abs(Math.sin(x * 1.3));
  return false;
}

// ---------------------------------------------------------------------------
// Ocelote
// ---------------------------------------------------------------------------

const OCELOT_COAT: RGB[] = [
  [196, 150, 74],
  [214, 170, 88],
  [228, 190, 108],
  [238, 206, 128],
];
const OCELOT_SPOT: RGB = [66, 48, 30];
const OCELOT_BELLY: RGB = [240, 226, 184];

function ocelot(t: Texel): Paint {
  const seed = 7979;
  // Manchas (rosetas): anillos oscuros alrededor de un centro algo más claro.
  const coat = (): RGB => {
    const c = fur(t, OCELOT_COAT, seed);
    if (t.f === BOTTOM) return OCELOT_BELLY;
    const n = vnoise(t.x * 1.3, t.y * 1.3, t.z * 1.3, 1.7, seed + 1);
    if (n > 0.72) return OCELOT_SPOT;
    if (n > 0.64) return scale(c, 0.8);
    return c;
  };
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        const m = mapAt(['.....', '.E.E.', '.....', '.....'], t, { E: [96, 176, 52] });
        if (m) return m;
      }
      if (t.f === TOP && Math.abs(t.x - t.w / 2) < 1.2 && t.z > 1) return OCELOT_SPOT; // raya de la frente
      return t.f === BOTTOM ? OCELOT_BELLY : coat();
    case 'snout':
      if (t.f === FRONT) return mapAt(['.n.'], t, { n: [180, 100, 96] }) ?? OCELOT_BELLY;
      return OCELOT_BELLY;
    case 'ear':
      return t.f === FRONT ? [196, 140, 120] : scale(fur(t, OCELOT_COAT, seed), 0.85);
    case 'tail':
      // Anillos oscuros y punta negra.
      if (t.z > t.d - 1.5 || Math.floor(t.z) % 3 === 1) return OCELOT_SPOT;
      return fur(t, OCELOT_COAT, seed);
    case 'leg':
      if (t.f === BOTTOM) return [184, 130, 110];
      return t.y < 1.5 ? OCELOT_BELLY : coat();
    default:
      if (t.f === FRONT) return OCELOT_BELLY;
      return coat();
  }
}

// ---------------------------------------------------------------------------
// Champiñaca
// ---------------------------------------------------------------------------

interface MooStyle {
  base: RGB[];
  patch: RGB[];
  cap: RGB;
  capDark: RGB;
  dot: RGB;
}

const RED_MOO: MooStyle = {
  base: [[130, 20, 16], [152, 28, 22], [172, 38, 28]],
  patch: [[206, 200, 194], [224, 220, 214], [238, 236, 232]],
  cap: [196, 36, 30], capDark: [150, 22, 20], dot: [240, 236, 226],
};
const BROWN_MOO: MooStyle = {
  base: [[110, 74, 44], [128, 88, 54], [146, 104, 66]],
  patch: [[196, 178, 150], [214, 198, 172], [228, 214, 190]],
  cap: [150, 108, 76], capDark: [118, 82, 56], dot: [150, 108, 76],
};

/** Champiñón de frente (8 × 8): sombrero ancho con motas y un pie claro. */
const RED_MUSHROOM_MAP = ['........', '..rrrr..', '.rrdrrr.', 'rrrrrdrr', 'rdrrrrrr', '...ss...', '...ss...', '...ss...'];
const BROWN_MUSHROOM_MAP = ['........', '........', '........', '.rrrrrr.', 'rrrrrrrr', '...ss...', '...ss...', '...ss...'];

function mooshroom(t: Texel, brown: boolean): Paint {
  const st = brown ? BROWN_MOO : RED_MOO;
  const seed = 8080;
  if (t.part.startsWith('mush')) {
    const m = mapAt(brown ? BROWN_MUSHROOM_MAP : RED_MUSHROOM_MAP, t, { r: st.cap, d: st.dot, s: [226, 218, 196] });
    return m ?? st.capDark;
  }
  const n = vnoise(t.x, t.y, t.z, 2.5, seed);
  const patch = vnoise(t.x + t.w * 3, t.y * 1.1, t.z, 4, seed + 1) > 0.6;
  const base = (): RGB => st.base[n > 0.55 ? 2 : n < 0.25 ? 0 : 1];
  const white = (): RGB => st.patch[n > 0.5 ? 2 : 1];
  switch (t.g) {
    case 'horn':
      return t.y > 2 || t.f === TOP ? [236, 234, 226] : [196, 192, 184];
    case 'head':
      if (t.f === FRONT) {
        const m = mapAt(['........', '........', '........', 'WE....EW', '........', '.pppppp.', '.pNppNp.', '.pppppp.'], t, {
          W: [246, 244, 240], E: [24, 18, 16], p: [214, 170, 164], N: [120, 70, 70],
        });
        if (m) return m;
        return patch ? white() : base();
      }
      return patch ? white() : base();
    case 'leg':
      if (t.f === BOTTOM || t.y < 1.5) return [58, 46, 40];
      return t.y < 6 ? white() : patch ? white() : base();
    default:
      if (t.f === BOTTOM) return scale(base(), 0.85);
      return patch ? white() : base();
  }
}

/** Lo que no es champiñón en los planos de los champiñones queda transparente. */
function mushroomHole(part: string, x: number, y: number, face: number, brown: boolean): boolean {
  if (!part.startsWith('mush')) return false;
  const map = brown ? BROWN_MUSHROOM_MAP : RED_MUSHROOM_MAP;
  const row = map[Math.floor(8 - y)];
  const i = face === FRONT ? Math.floor(8 - x) : Math.floor(x);
  return !row || row[i] === '.' || row[i] === undefined;
}

// ---------------------------------------------------------------------------
// Llama de comerciante: la manta azul del comerciante con bordes dorados y rombos
// ---------------------------------------------------------------------------

const DECOR_BLUE: RGB[] = [
  [30, 52, 116],
  [40, 66, 140],
  [52, 82, 160],
];
const DECOR_GOLD: RGB = [226, 176, 54];
const DECOR_RED: RGB = [178, 44, 40];

function traderDecor(t: Texel): Paint {
  const blue = tone(DECOR_BLUE, clamp01(0.5 * vnoise(t.x, t.y, t.z, 2, 8181) + 0.4 * rnd(t, 8182)));
  if (t.f === TOP) {
    // Rombos alternos rojos y dorados en el lomo, con un ribete dorado.
    if (t.x < 1 || t.x > t.w - 1 || t.z < 1 || t.z > t.d - 1) return DECOR_GOLD;
    const u = Math.abs(((t.z + 2) % 6) - 3) + Math.abs(t.x - t.w / 2);
    if (u < 1.5) return Math.floor((t.z + 2) / 6) % 2 ? DECOR_RED : DECOR_GOLD;
    return blue;
  }
  if (t.f === BOTTOM) return blue;
  // Caída de los lados: franja dorada abajo y flecos en zigzag.
  if (t.y < 1) return Math.floor(t.x + t.z) % 2 ? DECOR_GOLD : DECOR_RED;
  if (t.y < 2) return DECOR_GOLD;
  if (t.y > t.h - 1.5) return DECOR_GOLD;
  const zig = Math.abs(((side(t) ? t.x + t.z : 0) % 4) - 2);
  if (Math.abs(t.y - 3 - zig * 0.5) < 0.5) return DECOR_RED;
  return blue;
}

/** Los flecos de abajo de la manta: uno sí y otro no. */
function decorHole(part: string, x: number, y: number, face: number): boolean {
  return part === 'decor' && face !== TOP && y < 1 && Math.floor(x) % 2 === 1;
}

// ---------------------------------------------------------------------------
// Caballos no muertos
// ---------------------------------------------------------------------------

const BONE: RGB[] = [
  [150, 150, 140],
  [186, 184, 172],
  [212, 210, 198],
  [232, 230, 220],
];
const BONE_GAP: RGB = [40, 38, 36];

function skeletonHorse(t: Texel): Paint {
  const seed = 8282;
  const bone = (k = 0): RGB => tone(BONE, clamp01(0.45 + 0.35 * vnoise(t.x, t.y, t.z, 2.2, seed) + 0.2 * rnd(t, seed + 1) + k));
  switch (t.g) {
    case 'saddle':
    case 'stirrup':
      return saddlePaint(t);
    case 'body':
      // Costillas en los costados (bandas de hueso y huecos oscuros), columna arriba y pelvis atrás.
      if (t.f === TOP) return Math.abs(t.x - t.w / 2) < 1.5 ? bone(0.2) : bone(-0.1);
      if (t.f === PX || t.f === NX) {
        if (t.z > t.d - 5) return t.y > 3 ? bone() : BONE_GAP; // cadera
        if (t.y > t.h - 2) return bone(0.1);
        return Math.floor(t.z) % 3 === 0 ? bone(-0.1) : BONE_GAP;
      }
      if (t.f === BOTTOM) return Math.abs(t.x - t.w / 2) < 1 ? bone(-0.2) : BONE_GAP;
      return t.y > 2 ? bone() : BONE_GAP;
    case 'neck':
      return t.f === TOP || Math.floor(t.y) % 2 === 0 ? bone() : BONE_GAP;
    case 'head':
      if ((t.f === PX || t.f === NX) && Math.abs(t.z - 1.5) < 1 && Math.abs(t.y - 2.5) < 1) return [20, 18, 18]; // cuencas
      return bone();
    case 'mouth':
      if (t.f === FRONT) return mapAt(['....', 'N..N', '....', 'tttt'], t, { N: [26, 24, 22], t: [240, 238, 228] }) ?? bone(0.05);
      if ((t.f === PX || t.f === NX) && t.y < 1.5) return Math.floor(t.z) % 2 ? [240, 238, 228] : BONE_GAP; // dientes
      return bone();
    case 'mane':
      return bone(-0.15);
    case 'tail':
      return Math.floor(t.y) % 2 ? bone() : BONE_GAP;
    case 'ear':
      return bone(-0.05);
    case 'leg':
      if (t.y < 1.5) return t.f === BOTTOM ? [96, 94, 88] : bone(-0.25);
      if (t.y > 5 && t.y < 6.5) return bone(0.2); // rodilla
      return side(t) && t.i === t.fw - 1 ? bone(-0.15) : bone();
    default:
      return bone();
  }
}

const ROT: RGB[] = [
  [52, 78, 50],
  [66, 96, 62],
  [82, 114, 74],
  [98, 128, 86],
];
const ROT_DARK: RGB = [34, 46, 32];
const ROT_MANE: RGB = [44, 52, 34];

function zombieHorse(t: Texel): Paint {
  const seed = 8383;
  const hide = (): RGB => fur(t, ROT, seed, 0.8);
  // Llagas: calvas con el hueso a la vista.
  const sore = vnoise(t.x, t.y, t.z + (t.g === 'body' ? 0 : 30), 3, seed + 1) > 0.7;
  switch (t.g) {
    case 'saddle':
    case 'stirrup':
      return saddlePaint(t);
    case 'mane':
      return scale(ROT_MANE, 0.8 + 0.4 * rnd(t, seed + 2));
    case 'tail':
      return scale(ROT_MANE, 0.75 + 0.35 * vnoise(t.x, t.y * 0.4, t.z, 1.2, seed + 3));
    case 'leg':
      if (t.y < 1.5) return t.f === BOTTOM ? [38, 34, 30] : [58, 52, 44];
      return sore && t.y > 4 ? [196, 190, 170] : hide();
    case 'mouth':
      if (t.f === FRONT) return mapAt(['....', 'N..N', '....', '.mm.'], t, { N: [20, 18, 16], m: ROT_DARK }) ?? hide();
      return hide();
    case 'head':
      if ((t.f === PX || t.f === NX) && Math.abs(t.z - 1.5) < 0.6 && Math.abs(t.y - 2.5) < 0.6) return [140, 20, 16];
      return sore ? [180, 174, 154] : hide();
    case 'body':
      // Costillas al aire en un costado.
      if ((t.f === PX || t.f === NX) && sore) return Math.floor(t.z) % 2 ? [206, 200, 178] : ROT_DARK;
      return hide();
    default:
      return sore && t.f !== TOP ? [184, 178, 158] : hide();
  }
}

// ---------------------------------------------------------------------------
// Casco de hierro del jinete esqueleto (se dibuja como las armaduras de los animales)
// ---------------------------------------------------------------------------

const HELMET: RGB[] = [
  [120, 120, 128],
  [166, 166, 174],
  [206, 206, 214],
  [236, 236, 242],
];

/** Textura del casco `gear` del esqueleto `def` (null si no es un esqueleto con casco de hierro). */
export function helmetTexture(def: MobDef, gear: number): MobTexture | null {
  if (def.id !== MOB_SKELETON || gear !== ARMOR.iron.helmet) return null;
  const [W, H] = def.atlas;
  const rgba = new Uint8Array(W * H * 4);
  const head = def.parts.find((p) => p.name === 'head');
  if (!head) return null;
  const [w, h, d] = head.size;
  boxFaces(head.uv[0], head.uv[1], w, h, d).forEach(([fu, fv, fw, fh], f) => {
    for (let j = 0; j < fh; j++) {
      for (let i = 0; i < fw; i++) {
        // La cara queda al descubierto salvo la visera y los lados; el resto del casco cubre la cabeza.
        const on = f === TOP || (f === FRONT ? j < 2 || i === 0 || i === fw - 1 : f !== BOTTOM && j < 6);
        if (!on) continue;
        const edge = j === 0 || (f !== TOP && (f === FRONT ? j === 1 : j === 5));
        const k = edge ? 1 : (i * 7 + j * 3) % 5 === 0 ? 3 : 2;
        const o = ((fv + j) * W + fu + i) * 4;
        const c = HELMET[k];
        rgba.set([c[0], c[1], c[2], 255], o);
      }
    }
  });
  return { width: W, height: H, rgba };
}
