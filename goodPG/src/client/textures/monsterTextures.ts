// Fase 6 (monstruos): texturas procedurales de los monstruos nuevos (ahogado, bruja, slimes, phantom,
// lepisma, araña de cueva y aldeano zombi). Usan las utilidades de mobTextures.ts, que las pide aquí
// (MONSTER_PAINTERS). Ojo: este módulo y mobTextures.ts se importan mutuamente, así que aquí arriba
// sólo se declaran funciones y constantes propias; las de mobTextures.ts se usan dentro de funciones.
import {
  MOB_DROWNED, MOB_WITCH, MOB_SLIME, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL, MOB_PHANTOM, MOB_SILVERFISH, MOB_CAVE_SPIDER,
  MOB_ZOMBIE_VILLAGER, MOB_ENDERMITE, MOB_SHULKER,
} from '../../shared/mobs';
import {
  PX, NX, TOP, BOTTOM, FRONT, BACK, glow, rnd, vnoise, mapAt, zombieLike,
  type Texel, type Paint, type Painter, type RGB, type ZombieStyle,
} from './mobTextures';

const pick = (pal: readonly RGB[], k: number): RGB => pal[Math.max(0, Math.min(pal.length - 1, k))];

// ---------------------------------------------------------------------------
// Ahogado: zombi azulado, con algas pegadas y ojos que brillan
// ---------------------------------------------------------------------------

const DROWNED_STYLE: ZombieStyle = {
  skin: [
    [52, 104, 108],
    [66, 124, 126],
    [80, 142, 140],
    [98, 160, 154],
  ],
  hair: [
    [26, 62, 54],
    [34, 80, 66],
    [46, 98, 78],
  ],
  eye: [70, 210, 200],
  eyeLow: [40, 140, 136],
  mouth: [28, 66, 66],
  shirt: [
    [56, 90, 80],
    [70, 110, 96],
    [86, 128, 112],
    [104, 146, 128],
  ],
  pants: [
    [44, 52, 86],
    [56, 66, 104],
    [68, 80, 120],
    [82, 94, 136],
  ],
  shoes: [
    [42, 52, 54],
    [56, 70, 72],
    [72, 86, 88],
  ],
  seed: 4040,
};

function drowned(t: Texel): Paint {
  // Ojos (las mismas celdas que la cara del zombi), con brillo propio.
  if (t.g === 'head' && t.f === FRONT && (t.j === 3 || t.j === 4) && (t.i === 1 || t.i === 2 || t.i === 5 || t.i === 6)) {
    return glow(t.j === 3 && (t.i === 1 || t.i === 6) ? [160, 255, 244] : [70, 214, 204]);
  }
  // Algas: manchas verdes sobre la ropa, el pelo y los hombros.
  if (t.g !== 'leg' || t.y > 5) {
    const n = vnoise(t.x * 1.3, t.y * 0.6, t.z * 1.3, 2, 4141);
    if (n > 0.78) return rnd(t, 4142) > 0.5 ? [34, 88, 48] : [48, 110, 58];
  }
  return zombieLike(t, DROWNED_STYLE);
}

// ---------------------------------------------------------------------------
// Aldeano zombi y bruja: cabeza de aldeano (8×10, con nariz)
// ---------------------------------------------------------------------------

const VILLAGER_FACE = [
  '........',
  '........',
  '........',
  '.bbbbbb.',
  '.WK..KW.',
  '........',
  '........',
  '........',
  '..mmmm..',
  '........',
];

const ZV_STYLE: ZombieStyle = {
  skin: [
    [66, 108, 52],
    [84, 132, 66],
    [100, 150, 78],
    [118, 168, 92],
  ],
  hair: [
    [56, 94, 46],
    [66, 108, 52],
    [78, 122, 60],
  ],
  eye: [18, 26, 16],
  eyeLow: [40, 62, 34],
  mouth: [42, 64, 34],
  // Túnica de aldeano, raída.
  shirt: [
    [74, 52, 34],
    [92, 66, 42],
    [110, 80, 52],
    [128, 96, 64],
  ],
  pants: [
    [62, 44, 30],
    [78, 56, 38],
    [94, 68, 46],
    [108, 80, 56],
  ],
  shoes: [
    [40, 32, 26],
    [54, 44, 36],
    [66, 54, 44],
  ],
  seed: 4646,
};

function zombieVillager(t: Texel): Paint {
  const n = vnoise(t.x, t.y, t.z, 2.4, 4647);
  const r = rnd(t, 4646);
  const skin = (bias = 0): RGB => pick(ZV_STYLE.skin, (n < 0.3 ? 1 : n > 0.72 ? 3 : 2) + bias - (r > 0.95 ? 1 : 0));
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        return mapAt(VILLAGER_FACE, t, { b: skin(-2), W: [40, 58, 32], K: [150, 34, 26], m: [42, 64, 34] }) ?? skin();
      }
      if (t.f === TOP) return skin(-1);
      return skin();
    case 'nose':
      return t.f === BOTTOM ? skin(-2) : skin(-1);
    default:
      return zombieLike(t, ZV_STYLE);
  }
}

const WITCH_SKIN: RGB[] = [
  [140, 124, 98],
  [160, 142, 112],
  [180, 162, 130],
  [198, 180, 148],
];
const WITCH_ROBE: RGB[] = [
  [36, 22, 40],
  [50, 30, 56],
  [64, 40, 72],
  [80, 52, 88],
];
const WITCH_HAT: RGB[] = [
  [20, 16, 24],
  [30, 24, 36],
  [42, 34, 50],
  [56, 46, 64],
];

function witch(t: Texel): Paint {
  const r = rnd(t, 4141);
  const n = vnoise(t.x, t.y, t.z, 2.2, 4142);
  const skin = (bias = 0): RGB => pick(WITCH_SKIN, (n < 0.3 ? 1 : n > 0.7 ? 3 : 2) + bias - (r > 0.94 ? 1 : 0));
  const cloth = (pal: RGB[], bias = 0): RGB => {
    const fold = vnoise(t.x * 0.8, t.y * 1.6, t.z * 0.8, 2.2, 4143);
    let k = (fold < 0.3 ? 1 : fold > 0.72 ? 3 : 2) + bias;
    if (t.f === PX || t.f === NX) k -= 1;
    if (t.f === BOTTOM) k -= 1;
    if (r > 0.96) k -= 1;
    return pick(pal, k);
  };
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        const m = mapAt(VILLAGER_FACE, t, { b: [58, 44, 36], W: [226, 222, 206], K: [60, 140, 60], m: [96, 70, 56] });
        if (m) return m;
        // Mechones oscuros bajo el sombrero.
        return t.j === 0 ? [48, 36, 32] : skin();
      }
      if (t.f === TOP) return [48, 36, 32];
      if (t.y > 8.5 || (t.f === BACK && t.y > 5)) return r > 0.5 ? [48, 36, 32] : [62, 46, 40];
      return skin();
    case 'nose':
      // Verruga verde en la nariz.
      if (t.f === FRONT && t.i === 1 && t.j === 2) return [74, 118, 54];
      return t.f === BOTTOM ? skin(-2) : skin(-1);
    case 'hat':
      // Cinta verde en la base de la parte alta, con hebilla.
      if (t.part === 'hat2' && t.f !== TOP && t.f !== BOTTOM && t.y < 1.2) return t.f === FRONT && t.i === 3 ? [200, 190, 120] : [70, 128, 58];
      return cloth(WITCH_HAT, t.f === TOP ? 1 : 0);
    case 'body':
      // Túnica con cinturón y un colgante.
      if (t.y > 5 && t.y < 6.5 && t.f !== TOP && t.f !== BOTTOM) return [28, 20, 22];
      if (t.f === FRONT && t.j >= 2 && t.j <= 3 && t.i >= 3 && t.i <= 4) return t.j === 3 ? [110, 200, 90] : [150, 140, 100];
      return cloth(WITCH_ROBE);
    case 'arm':
      if (t.y < 2.5 || t.f === BOTTOM) return skin(t.f === BOTTOM ? -1 : 0);
      return cloth(WITCH_ROBE, t.y < 3.5 ? -1 : 0);
    default:
      if (t.f === BOTTOM || t.y < 1.2) return [30, 22, 20];
      return cloth(WITCH_ROBE, -1);
  }
}

// ---------------------------------------------------------------------------
// Slime
// ---------------------------------------------------------------------------

const SLIME_GREEN: RGB[] = [
  [58, 122, 46],
  [78, 150, 60],
  [98, 176, 76],
  [124, 200, 98],
  [162, 224, 136],
];
const SLIME_FACE = [
  '........',
  '........',
  '.KK..KK.',
  '.Kk..kK.',
  '........',
  '.....m..',
  '........',
  '........',
];

function slime(t: Texel): Paint {
  if (t.f === FRONT) {
    const m = mapAt(SLIME_FACE, t, { K: [20, 44, 18], k: [44, 86, 36], m: [32, 66, 28] });
    if (m) return m;
  }
  const r = rnd(t, 4242);
  // Piel translúcida: borde claro y, dentro, el núcleo algo más oscuro.
  const edge = t.i === 0 || t.j === 0 || t.i === t.fw - 1 || t.j === t.fh - 1;
  const core = t.i >= 2 && t.i <= t.fw - 3 && t.j >= 2 && t.j <= t.fh - 3;
  let k = edge ? 3 : core ? 1 : 2;
  if (r > 0.93) k += 1;
  if (r < 0.06) k -= 1;
  if (t.f === TOP) k += 1;
  if (t.f === BOTTOM) k -= 1;
  return pick(SLIME_GREEN, k);
}

// ---------------------------------------------------------------------------
// Phantom
// ---------------------------------------------------------------------------

const PHANTOM_BODY: RGB[] = [
  [30, 36, 66],
  [40, 50, 86],
  [52, 66, 106],
  [66, 84, 128],
  [88, 108, 152],
];
const PHANTOM_SKIN: RGB[] = [
  [80, 90, 128],
  [100, 112, 150],
  [122, 134, 170],
  [144, 158, 190],
];

function phantom(t: Texel): Paint {
  const r = rnd(t, 4343);
  const n = vnoise(t.x, t.y, t.z, 2, 4344);
  const body = (bias = 0): RGB => pick(PHANTOM_BODY, 2 + (n > 0.62 ? 1 : n < 0.3 ? -1 : 0) + bias + (r > 0.94 ? 1 : 0));
  const skin = (bias = 0): RGB => pick(PHANTOM_SKIN, 1 + (n > 0.6 ? 1 : 0) + bias - (r < 0.1 ? 1 : 0));
  switch (t.g) {
    case 'head':
      if (t.f === FRONT) {
        if (t.j === 1 && (t.i <= 1 || t.i >= t.fw - 2)) return glow(t.i === 0 || t.i === t.fw - 1 ? [206, 255, 170] : [130, 240, 96]);
        if (t.j === 2 && t.i >= 2 && t.i <= t.fw - 3) return [16, 18, 34];
      }
      return t.f === BOTTOM ? skin() : body();
    case 'wing':
    case 'wingTip':
      // Hueso a lo largo del borde delantero; el resto, membrana (con el borde trasero raído).
      if (t.z < 1.2) return body(t.f === TOP ? 1 : 0);
      if (t.g === 'wingTip' && t.z > t.d - 1.2 && r > 0.55) return body(-2);
      return skin(t.f === BOTTOM ? -1 : 0);
    case 'tail':
    case 'tailTip':
      return body(t.f === BOTTOM ? -1 : 0);
    default:
      if (t.f === TOP && Math.abs(t.x - t.w / 2) < 0.6) return body(2);
      return t.f === BOTTOM ? skin() : body();
  }
}

// ---------------------------------------------------------------------------
// Lepisma
// ---------------------------------------------------------------------------

const SILVER: RGB[] = [
  [86, 88, 96],
  [110, 112, 120],
  [134, 136, 144],
  [158, 160, 168],
  [184, 186, 194],
];

function silverfish(t: Texel): Paint {
  const r = rnd(t, 4444);
  if (t.part === 'seg0' && t.f === FRONT && t.j === 0 && (t.i === 0 || t.i === t.fw - 1)) return [22, 22, 26];
  let k = t.f === TOP ? 3 : t.f === BOTTOM ? 1 : 2;
  // Escamas: el borde trasero de cada segmento, más oscuro.
  if (t.f !== FRONT && t.f !== BACK && t.z > t.d - 0.8) k -= 1;
  if (r > 0.9) k += 1;
  if (r < 0.08) k -= 1;
  return pick(SILVER, k);
}

// ---------------------------------------------------------------------------
// Fase 8.6: endermita: placas casi negras con reflejos morados, las juntas más oscuras y motas violetas que brillan
// ---------------------------------------------------------------------------

const MITE: RGB[] = [
  [12, 10, 16],
  [22, 18, 28],
  [34, 28, 44],
  [52, 40, 66],
  [78, 56, 98],
];

function endermite(t: Texel): Paint {
  const r = rnd(t, 9696);
  // Los ojos: dos puntos violetas encendidos en la cara del primer segmento.
  if (t.part === 'seg0' && t.f === FRONT && t.j === 1 && (t.i === 0 || t.i === t.fw - 1)) return glow([204, 120, 255]);
  let k = t.f === TOP ? 2 : t.f === BOTTOM ? 0 : 1;
  if (t.f !== FRONT && t.f !== BACK && t.z > t.d - 0.8) k -= 1;
  if (t.f === TOP && Math.abs(t.x - t.w / 2) < 0.6) k += 1;
  if (r > 0.93) return glow([150, 84, 200]);
  if (r > 0.8) k += 1;
  return pick(MITE, k);
}

// ---------------------------------------------------------------------------
// Fase 8.6: shulker: la concha de púrpura en escamas (la tapa con el lomo acanalado y un anillo en el techo, la base
// con su franja), por dentro oscura y violeta, y la cabeza de la criatura, amarillo verdosa con ojos negros brillantes
// ---------------------------------------------------------------------------

const SHELL: RGB[] = [
  [74, 46, 80],
  [102, 66, 108],
  [132, 90, 136],
  [160, 114, 160],
  [190, 146, 186],
];
const INSIDE: RGB[] = [
  [26, 14, 34],
  [40, 22, 50],
  [58, 34, 70],
];
const FLESH: RGB[] = [
  [150, 150, 84],
  [184, 182, 106],
  [214, 210, 132],
  [236, 232, 162],
];

function shulker(t: Texel): Paint {
  const r = rnd(t, 9898);
  if (t.part === 'head') {
    // Ojos negros con un brillo y la boca, en la cara de delante.
    if (t.f === FRONT && t.j === 2 && (t.i === 1 || t.i === 4)) return [18, 14, 20];
    if (t.f === FRONT && t.j === 1 && (t.i === 1 || t.i === 4)) return [60, 52, 60];
    if (t.f === FRONT && t.j === 4 && t.i >= 2 && t.i <= 3) return [104, 90, 52];
    let k = t.f === TOP ? 3 : t.f === BOTTOM ? 0 : 2;
    if (r > 0.85) k -= 1;
    return pick(FLESH, k);
  }
  const lid = t.part === 'lid';
  // Por dentro (la cara de abajo de la tapa y la de arriba de la base): oscura, con motas violetas que brillan.
  if ((lid && t.f === BOTTOM) || (!lid && t.f === TOP)) {
    const cx = Math.abs(t.x - t.w / 2), cz = Math.abs(t.z - t.d / 2);
    if (Math.max(cx, cz) > t.w / 2 - 1) return pick(SHELL, 1);
    if (r > 0.94) return glow([150, 96, 190]);
    return pick(INSIDE, r > 0.6 ? 2 : r > 0.25 ? 1 : 0);
  }
  let k = 2;
  if (lid) {
    if (t.f === TOP) {
      // Techo: escamas y un anillo más oscuro alrededor del centro.
      const d = Math.max(Math.abs(t.x - t.w / 2), Math.abs(t.z - t.d / 2));
      k = d > 6.5 ? 3 : Math.abs(d - 4) < 0.6 ? 1 : 2;
      if ((Math.floor(t.x / 2) + Math.floor(t.z / 2)) % 2 === 0) k += 1;
    } else {
      // Lados: acanalados en vertical y el borde de abajo (el labio) más claro.
      const u = t.f === PX || t.f === NX ? t.z : t.x;
      k = Math.floor(u) % 4 === 0 ? 1 : 2;
      if (t.y < 1) k = 4;
      else if (t.y > t.h - 1) k = 3;
      else if (Math.floor(t.y) % 3 === 0 && Math.floor(u) % 2 === 1) k += 1;
    }
  } else {
    // Base: la franja clara de arriba (el borde que asoma) y escamas en rombo abajo.
    if (t.y > t.h - 1.5) k = 4;
    else if (t.y > t.h - 2.5) k = 1;
    else k = (Math.floor(t.y) + Math.floor((t.f === PX || t.f === NX ? t.z : t.x) / 2)) % 2 === 0 ? 2 : 3;
    if (t.f === BOTTOM) k = 1;
  }
  if (r > 0.9) k += 1;
  if (r < 0.08) k -= 1;
  return pick(SHELL, k);
}

// ---------------------------------------------------------------------------
// Araña de cueva: la araña, azul verdosa
// ---------------------------------------------------------------------------

const CAVE_SPIDER_BODY: RGB[] = [
  [10, 24, 30],
  [16, 36, 44],
  [24, 52, 60],
  [36, 72, 80],
  [60, 100, 106],
];
const CAVE_SPIDER_FACE = [
  '........',
  '..e..e..',
  '........',
  '.rR..rR.',
  '.RR..RR.',
  'e......e',
  '........',
  '..ff.ff.',
];

function caveSpider(t: Texel): Paint {
  const r = rnd(t, 4545);
  const n = vnoise(t.x, t.y, t.z, 2, 4546);
  const hairy = (bias = 0): RGB => {
    let k = 1 + (n > 0.6 ? 1 : 0) + bias;
    if (r > 0.8) k += 1;
    if (r > 0.95) k += 1;
    if (r < 0.12) k -= 1;
    return pick(CAVE_SPIDER_BODY, k);
  };
  if (t.g === 'head' && t.f === FRONT) {
    const m = mapAt(CAVE_SPIDER_FACE, t, { R: glow([226, 34, 30]), r: glow([255, 132, 112]), e: glow([176, 22, 24]), f: [40, 70, 76] });
    if (m) return m;
  }
  if (t.g === 'leg') {
    const xi = Math.floor(t.x);
    if (t.f === PX || t.f === NX) return CAVE_SPIDER_BODY[0];
    if (xi === 5 || xi === 10) return r > 0.5 ? CAVE_SPIDER_BODY[4] : CAVE_SPIDER_BODY[3];
    if (xi === 4 || xi === 11) return CAVE_SPIDER_BODY[2];
    return hairy(t.f === BOTTOM ? -1 : 0);
  }
  if (t.g === 'abdomen' && t.f === TOP) {
    // Manchas claras en el lomo.
    const cx = Math.abs(t.x - 5);
    if ((Math.abs(t.z - 3) < 1 || Math.abs(t.z - 7) < 1) && cx > 1 && cx < 3.5) return [78, 124, 128];
  }
  return hairy(t.f === BOTTOM ? -1 : 0);
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export const MONSTER_PAINTERS: Readonly<Record<number, Painter>> = {
  [MOB_DROWNED]: drowned,
  [MOB_WITCH]: witch,
  [MOB_SLIME]: slime,
  [MOB_SLIME_MEDIUM]: slime,
  [MOB_SLIME_SMALL]: slime,
  [MOB_PHANTOM]: phantom,
  [MOB_SILVERFISH]: silverfish,
  [MOB_ENDERMITE]: endermite, // Fase 8.6
  [MOB_SHULKER]: shulker,
  [MOB_CAVE_SPIDER]: caveSpider,
  [MOB_ZOMBIE_VILLAGER]: zombieVillager,
};
