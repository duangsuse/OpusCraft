// Fase 6.5 (colecciones): texturas de las cabezas, del tocadiscos y del marco brillante.
//
// Cada cara de una cabeza es el cuadrado central de 8×8 de su capa (el trozo que toma el cubo de la
// cabeza, ver blocks/collections.ts). Las de zombi, esqueleto y creeper se copian de la cabeza de la
// textura de la propia criatura (así son idénticas); la de jugador es un dibujo propio. Alrededor del
// cuadrado va el color medio de la cara, para que las partículas al romperla tengan su color.
import { DRAGON_HEAD_GENERATORS } from './genEnd'; // Fase 8.6
import { N, clamp, pixelNoise, scale, type Generator, type RGB, type Tex } from './texCore';
import { OAK_PLANKS } from './genWood';
import { generateMobTexture, type MobTexture } from './mobTextures';
import { MOBS, boxFaces, MOB_ZOMBIE, MOB_SKELETON, MOB_CREEPER, MOB_WITHER_SKELETON, MOB_PIGLIN } from '../../shared/mobs';
import { SKULL_FACES, skullTexture, type SkullFace, type SkullKind } from '../../shared/blocks';

/** Una cara de 8×8 (fila 0 arriba). */
type Face8 = RGB[];

/** Índice de la cara de boxFaces (+X, −X, arriba, abajo, frente −Z, espalda +Z) de cada cara de cabeza. */
const MOB_FACE: Record<SkullFace, number> = { right: 0, left: 1, top: 2, bottom: 3, front: 4, back: 5 };

const mobCache = new Map<number, MobTexture>();

/** Cara de la cabeza de una criatura, orientada como la toma el cubo de la cabeza. */
function mobHeadFace(mob: number, face: SkullFace): Face8 {
  let tex = mobCache.get(mob);
  if (!tex) mobCache.set(mob, (tex = generateMobTexture(mob)));
  const head = MOBS[mob].parts.find((p) => p.name === 'head')!;
  const [w, h, d] = head.size;
  const [u, v, fw, fh] = boxFaces(head.uv[0], head.uv[1], w, h, d)[MOB_FACE[face]];
  const out: Face8 = [];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      // La tapa de arriba de las criaturas va girada media vuelta respecto a la del bloque.
      const si = face === 'top' ? fw - 1 - Math.floor((i * fw) / 8) : Math.floor((i * fw) / 8);
      const sj = face === 'top' ? fh - 1 - Math.floor((j * fh) / 8) : Math.floor((j * fh) / 8);
      const o = ((v + sj) * tex.width + u + si) * 4;
      out.push([tex.rgba[o], tex.rgba[o + 1], tex.rgba[o + 2]]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ cabeza de jugador (dibujo propio)

const HAIR: RGB = [82, 56, 34];
const HAIR_DARK: RGB = [62, 42, 26];
const SKIN: RGB = [218, 166, 124];
const SKIN_SHADE: RGB = [196, 144, 104];

/** Filas de 8 caracteres: h pelo, H pelo oscuro, s piel, S piel en sombra, w blanco, e iris, m boca, n nariz. */
const PLAYER_ROWS: Record<SkullFace, string[]> = {
  front: ['hhhhhhhh', 'hHhhhhHh', 'hsssssss', 'ssssssss', 'swessews', 'sssnnsss', 'ssmmmmss', 'SSSSSSSS'],
  // Costados: el frente queda a la derecha en el derecho y a la izquierda en el izquierdo.
  right: ['hhhhhhhh', 'hhhhhHhh', 'hhhhhsss', 'hhhhssss', 'hhhSssss', 'hhhsssss', 'Hhhsssss', 'HHSSSSSS'],
  left: ['hhhhhhhh', 'hhHhhhhh', 'ssshhhhh', 'sssshhhh', 'sssssShh', 'ssssshhh', 'ssssshhH', 'SSSSSSHH'],
  back: ['hhhhhhhh', 'hhHhhhhh', 'hhhhhHhh', 'hhhhhhhh', 'hHhhhhhh', 'hhhhhhHh', 'Hhhhhhhh', 'HHHHHHHH'],
  top: ['hhhhhhhh', 'hhhHhhhh', 'hhhhhhHh', 'hHhhhhhh', 'hhhhhhhh', 'hhhhHhhh', 'hhHhhhhh', 'hhhhhhhh'],
  bottom: ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS'],
};
const PLAYER_INKS: Record<string, RGB> = {
  h: HAIR, H: HAIR_DARK, s: SKIN, S: SKIN_SHADE, w: [238, 238, 236], e: [58, 92, 168], m: [150, 88, 78], n: [204, 150, 110],
};

function playerHeadFace(face: SkullFace): Face8 {
  return PLAYER_ROWS[face].join('').split('').map((ch) => PLAYER_INKS[ch]);
}

/** Pinta una cara de 8×8 en el centro de la capa y el color medio alrededor. */
function headLayer(face: () => Face8): Generator {
  return (t: Tex) => {
    const px = face();
    const avg = [0, 0, 0];
    for (const c of px) for (let k = 0; k < 3; k++) avg[k] += c[k] / px.length;
    const noise = pixelNoise(t.rng());
    t.tiling = false;
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const inside = x >= 4 && x < 12 && y >= 4 && y < 12;
      t.setI(i, inside ? px[(y - 4) * 8 + (x - 4)] : scale([avg[0], avg[1], avg[2]], 0.92 + noise[i] * 0.16));
      t.height[i] = 1;
      t.smooth[i] = 45;
    }
  };
}

const HEAD_SOURCES: Record<Exclude<SkullKind, 'piglin' | 'dragon'>, (face: SkullFace) => Face8> = {
  zombie: (f) => mobHeadFace(MOB_ZOMBIE, f),
  skeleton: (f) => mobHeadFace(MOB_SKELETON, f),
  creeper: (f) => mobHeadFace(MOB_CREEPER, f),
  player: playerHeadFace,
  wither_skeleton: (f) => mobHeadFace(MOB_WITHER_SKELETON, f), // Fase 8.3 (criaturas del Nether)
};

// ------------------------------------------------------------------ Fase 8.3: cabeza de piglin

/**
 * Una cara de la cabeza del piglin a su tamaño (10 × 8 delante, detrás, arriba y abajo; 8 × 8 a los lados), sacada
 * de la textura del piglin y centrada en la capa (como la toma la caja de 10 de ancho de la cabeza de piglin).
 */
function piglinHeadLayer(face: SkullFace): Generator {
  return (t: Tex) => {
    let tex = mobCache.get(MOB_PIGLIN);
    if (!tex) mobCache.set(MOB_PIGLIN, (tex = generateMobTexture(MOB_PIGLIN)));
    const head = MOBS[MOB_PIGLIN].parts.find((p) => p.name === 'head')!;
    const [w, h, d] = head.size;
    const [u, v, fw, fh] = boxFaces(head.uv[0], head.uv[1], w, h, d)[MOB_FACE[face]];
    const px: RGB[] = [];
    const avg = [0, 0, 0];
    for (let j = 0; j < fh; j++) {
      for (let i = 0; i < fw; i++) {
        const si = face === 'top' ? fw - 1 - i : i, sj = face === 'top' ? fh - 1 - j : j;
        const o = ((v + sj) * tex.width + u + si) * 4;
        const c: RGB = [tex.rgba[o], tex.rgba[o + 1], tex.rgba[o + 2]];
        px.push(c);
        for (let k = 0; k < 3; k++) avg[k] += c[k] / (fw * fh);
      }
    }
    const x0 = (16 - fw) >> 1, y0 = (16 - fh) >> 1;
    const noise = pixelNoise(t.rng());
    t.tiling = false;
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const inside = x >= x0 && x < x0 + fw && y >= y0 && y < y0 + fh;
      t.setI(i, inside ? px[(y - y0) * fw + (x - x0)] : scale([avg[0], avg[1], avg[2]], 0.92 + noise[i] * 0.16));
      t.height[i] = 1;
      t.smooth[i] = 45;
    }
  };
}

/** Hocico de la cabeza de piglin: rosado, con las fosas y, a los lados, los colmillos. */
function piglinSnout(t: Tex): void {
  const noise = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let c: RGB = scale([240, 172, 150], 0.94 + noise[i] * 0.1);
    if (y === 10 && (x === 6 || x === 9)) c = [120, 64, 56];
    if ((x === 5 || x === 10) && (y === 10 || y === 11)) c = [238, 228, 198];
    t.setI(i, c);
    t.height[i] = 1;
    t.smooth[i] = 40;
  }
}

/** Oreja de la cabeza de piglin: la piel, algo más clara. */
function piglinEar(t: Tex): void {
  const noise = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, scale([226, 166, 130], 0.9 + noise[i] * 0.16));
    t.height[i] = 1;
    t.smooth[i] = 40;
  }
}

// ------------------------------------------------------------------ tocadiscos

/** Madera oscura del tocadiscos (roble oscurecido). */
const DARK = (c: RGB): RGB => scale(c, 0.62);

/** Costado: tablones oscuros con un marco de madera más clara (como una caja de música). */
function jukeboxSide(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = x === 0 || x === 15 || y === 0 || y === 15;
    const inner = x === 1 || x === 14 || y === 1 || y === 14;
    const seam = !edge && !inner && y % 4 === 1;
    const c = edge ? DARK(OAK_PLANKS.seam) : inner ? OAK_PLANKS.dark : seam ? DARK(OAK_PLANKS.seam) : DARK(px[i] > 0.8 ? OAK_PLANKS.grain : OAK_PLANKS.base);
    t.setI(i, scale(c, 1 + (px[i] - 0.5) * 0.08));
    t.height[i] = edge ? 1 : inner ? 0.95 : seam ? 0.7 : 0.85;
    t.smooth[i] = inner ? 90 : OAK_PLANKS.smooth;
  }
}

/** Tapa: la misma madera con la ranura del disco en medio. */
function jukeboxTop(t: Tex): void {
  jukeboxSide(t);
  const px = pixelNoise(t.rng('slot'));
  for (let x = 3; x <= 12; x++) {
    for (const y of [7, 8]) {
      const i = y * 16 + x;
      t.setI(i, scale([22, 16, 12], 0.9 + px[i] * 0.2));
      t.height[i] = 0.2;
      t.smooth[i] = 20;
    }
    const lip = 6 * 16 + x;
    t.setI(lip, scale(OAK_PLANKS.light, 0.8));
  }
}

function jukeboxBottom(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    const seam = y % 4 === 3;
    t.setI(i, scale(DARK(seam ? OAK_PLANKS.seam : OAK_PLANKS.base), 0.94 + px[i] * 0.12));
    t.height[i] = seam ? 0.7 : 1;
    t.smooth[i] = OAK_PLANKS.smooth;
  }
}

// ------------------------------------------------------------------ marco brillante

/** Como el marco (item_frame), con el borde de madera clara y un fondo de tinta que brilla un poco. */
function glowItemFrame(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.min(x, y, 15 - x, 15 - y);
    let c: RGB;
    if (d <= 1) c = d === 0 ? [104, 84, 52] : x === 1 || y === 1 ? [214, 188, 120] : [170, 140, 88];
    else {
      // Fondo teñido de tinta brillante: turquesa, con vetas más claras.
      const k = 0.85 + px[i] * 0.3;
      c = scale([62, 150, 142], clamp(k + (((x + y) % 5) === 0 ? 0.25 : 0), 0, 2));
    }
    t.setI(i, c);
    t.height[i] = d <= 1 ? 1 : 0.6;
    t.smooth[i] = d <= 1 ? 50 : 80;
    t.emit[i] = d <= 1 ? 0 : 16;
  }
}

export const COLLECTION_GENERATORS: Record<string, Generator> = {
  ...Object.fromEntries((Object.keys(HEAD_SOURCES) as Exclude<SkullKind, 'piglin' | 'dragon'>[]).flatMap((kind) =>
    SKULL_FACES.map((f) => [skullTexture(kind, f), headLayer(() => HEAD_SOURCES[kind](f))]))),
  ...Object.fromEntries(SKULL_FACES.map((f) => [skullTexture('piglin', f), piglinHeadLayer(f)])), // Fase 8.3
  ...DRAGON_HEAD_GENERATORS, // Fase 8.6
  piglin_head_snout: piglinSnout,
  piglin_head_ear: piglinEar,
  jukebox_side: jukeboxSide,
  jukebox_top: jukeboxTop,
  jukebox_bottom: jukeboxBottom,
  glow_item_frame: glowItemFrame,
};
