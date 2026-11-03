// Fase 6.5 (materiales): texturas procedurales de los materiales y suelos nuevos. Bloques de hierro y
// de oro en bruto (grumos de mineral con grietas), de carbón (facetas negras con brillos), de
// lapislázuli (azul con vetas claras), de huesos (lados con estrías y la sección de los huesos arriba),
// de slime (verde translúcido con el núcleo más denso), hielo azul, tierra gruesa (con grava), podsol
// (agujas pardas), tierra enraizada (raíces pálidas), camino de tierra, nieve polvo y huevos de rana.
import {
  N, Noise, clamp, field, idx, mix, pixelNoise, rankLevels, scale, scatter, type Generator, type RGB, type Tex,
} from './texCore';
import { dirtBase } from './genSoil';

// ---------------------------------------------------------------------------
// Bloques de mineral en bruto
// ---------------------------------------------------------------------------

/** Grumos de mineral: `ramp` de claro a oscuro (4 tonos) y el color de las grietas. */
function rawBlock(ramp: readonly RGB[], crack: RGB, f0: number): Generator {
  return (t) => {
    const r = t.rng();
    const lumps = new Noise(r, 4);
    const n8 = new Noise(r, 8);
    const px = pixelNoise(r);
    const v = field((x, y, i) => 0.6 * lumps.at(x, y) + 0.25 * n8.at(x, y) + 0.15 * px[i]);
    const lv = rankLevels(v, [12, 18, 30, 26, 14]);
    for (let i = 0; i < N; i++) {
      const k = lv[i];
      const c = k === 0 ? crack : ramp[4 - k];
      t.setI(i, scale(c, 0.96 + px[i] * 0.08));
      t.height[i] = k === 0 ? 0.35 : 0.55 + k * 0.11;
      t.smooth[i] = k === 0 ? 30 : 70 + k * 18;
      t.f0[i] = k === 0 ? 10 : f0;
    }
    t.depth = 1.3;
  };
}

// ---------------------------------------------------------------------------
// Carbón y lapislázuli
// ---------------------------------------------------------------------------

/** Bloque de carbón: facetas casi negras separadas por aristas, con destellos. */
function coalBlock(t: Tex): void {
  const r = t.rng();
  const sites = scatter(r, 11, 3.2, 0.8, 1.3);
  const px = pixelNoise(r);
  const shade = sites.map(() => r.range(0.75, 1.25));
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let best = 0, d1 = Infinity, d2 = Infinity;
    sites.forEach((s, k) => {
      let dx = Math.abs(x + 0.5 - s.x), dy = Math.abs(y + 0.5 - s.y);
      dx = Math.min(dx, 16 - dx);
      dy = Math.min(dy, 16 - dy);
      const d = Math.hypot(dx, dy) / s.w;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        best = k;
      } else if (d < d2) d2 = d;
    });
    const edge = d2 - d1 < 0.55;
    const base: RGB = scale([34, 34, 38], shade[best]);
    t.setI(i, edge ? [16, 16, 18] : scale(base, 0.94 + px[i] * 0.12));
    t.height[i] = edge ? 0.5 : 0.8 + 0.15 * shade[best];
    t.smooth[i] = edge ? 40 : 150;
    t.f0[i] = 30;
  }
  for (let k = 0; k < 9; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [96, 96, 108]);
    t.smooth[i] = 220;
  }
  t.depth = 1.1;
}

/** Bloque de lapislázuli: azul intenso, moteado, con vetas claras y alguna chispa dorada (pirita). */
function lapisBlock(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const pal: RGB[] = [[20, 44, 118], [30, 64, 154], [38, 84, 186], [58, 110, 214], [96, 146, 236]];
  const v = field((x, y, i) => 0.5 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.2 * px[i]);
  const lv = rankLevels(v, [10, 28, 34, 20, 8]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.7 + lv[i] * 0.07;
    t.smooth[i] = 110 + lv[i] * 12;
  }
  for (let k = 0; k < 4; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [214, 186, 92]);
    t.smooth[i] = 200;
    t.f0[i] = 200;
  }
  t.depth = 0.9;
}

// ---------------------------------------------------------------------------
// Huesos
// ---------------------------------------------------------------------------

const BONE: RGB[] = [[236, 232, 214], [222, 216, 194], [204, 197, 172], [178, 170, 144]];

/** Lado del bloque de huesos: huesos verticales con estrías y juntas más oscuras. */
function boneSide(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const groove = x % 4 === 3;
    const band = (y + (x >> 2) * 5) % 16 === 0;
    const k = groove ? 3 : band ? 2 : px[i] > 0.85 ? 1 : x % 4 === 0 ? 0 : 1;
    t.setI(i, scale(BONE[k], 0.97 + px[i] * 0.06));
    t.height[i] = groove ? 0.45 : band ? 0.7 : x % 4 === 1 ? 1 : 0.9;
    t.smooth[i] = 90;
  }
  t.depth = 1.2;
}

/** Cara de arriba: la sección de los huesos (anillos claros con el tuétano oscuro). */
function boneTop(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const centers: [number, number][] = [[4, 4], [11, 4], [4, 11], [11, 11]];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let d = Infinity;
    for (const [cx, cy] of centers) d = Math.min(d, Math.hypot(x - cx + 0.5, y - cy + 0.5));
    const marrow = d < 1.3, ring = d < 3.1;
    const c = marrow ? [150, 128, 96] as RGB : ring ? BONE[d < 2.2 ? 1 : 0] : BONE[3];
    t.setI(i, scale(c, 0.96 + px[i] * 0.08));
    t.height[i] = marrow ? 0.5 : ring ? 1 : 0.6;
    t.smooth[i] = marrow ? 40 : 90;
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Slime, hielo azul y nieve polvo
// ---------------------------------------------------------------------------

/** Bloque de slime: gelatina verde translúcida con el borde y el núcleo más densos. */
function slimeBlock(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const border = x === 0 || x === 15 || y === 0 || y === 15;
    const core = x >= 3 && x <= 12 && y >= 3 && y <= 12;
    const coreEdge = core && (x === 3 || x === 12 || y === 3 || y === 12);
    const c: RGB = border ? [84, 160, 60] : coreEdge ? [100, 178, 72] : core ? [126, 204, 96] : [142, 222, 112];
    t.setI(i, scale(c, 0.96 + px[i] * 0.08));
    t.alpha[i] = border ? 225 : coreEdge ? 205 : core ? 180 : 140;
    t.height[i] = border ? 1 : core ? 0.9 : 0.8;
    t.smooth[i] = 215;
  }
  // Brillos de la superficie.
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [5, 5], [6, 5]]) {
    const i = idx(x, y);
    t.setI(i, [214, 255, 196]);
    t.alpha[i] = 210;
  }
  t.sss.fill(90);
  t.depth = 0.6;
}

/** Hielo azul: opaco, más azul y más liso que el compacto, con grietas claras. */
function blueIce(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const pal: RGB[] = [[84, 134, 226], [100, 150, 238], [116, 166, 246], [136, 184, 252]];
  const v = field((x, y) => 0.6 * n4.at(x, y) + 0.4 * n8.at(x, y));
  const lv = rankLevels(v, [15, 35, 35, 15]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 1;
    t.smooth[i] = 240;
  }
  t.f0.fill(8);
  t.sss.fill(60);
  const crack = (x: number, y: number, len: number, sx: number): void => {
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, [190, 222, 255]);
      t.height[i] = 0.75;
      t.smooth[i] = 170;
      const m = r.next();
      if (m < 0.5) {
        x += sx;
        y += 1;
      } else if (m < 0.8) y += 1;
      else x += sx;
    }
  };
  crack(2, 1, 8, 1);
  crack(11, 3, 6, -1);
  crack(7, 9, 6, 1);
  t.depth = 0.7;
}

/**
 * Nieve polvo: nieve muy fina, algo más azulada y granulada que el bloque de nieve (para distinguirla
 * a tiempo), con motas azules y muchos destellos.
 */
function powderSnow(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const pal: RGB[] = [[200, 216, 238], [218, 230, 246], [234, 241, 251], [248, 251, 255]];
  const v = field((x, y, i) => 0.6 * n4.at(x, y) + 0.4 * px[i]);
  const lv = rankLevels(v, [10, 25, 40, 25]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.85 + 0.05 * lv[i];
    t.smooth[i] = 60 + 8 * lv[i];
    t.sss[i] = 140;
  }
  for (let k = 0; k < 14; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, k % 2 ? [255, 255, 255] : [182, 202, 234]);
    t.smooth[i] = k % 2 ? 200 : 80;
  }
  t.depth = 0.5;
}

// ---------------------------------------------------------------------------
// Suelos
// ---------------------------------------------------------------------------

const DIRT_DARK: RGB = [96, 67, 45];

/** Tierra gruesa: la tierra con más grava (piedrecitas grises en relieve). */
function coarseDirt(t: Tex): void {
  dirtBase(t);
  const r = t.rng('stones');
  const sites = scatter(r, 16, 2.6);
  const greys: RGB[] = [[138, 132, 126], [118, 112, 108], [158, 152, 146]];
  for (const s of sites) {
    const x = Math.floor(s.x), y = Math.floor(s.y);
    const c = r.pick(greys);
    for (const [dx, dy] of r.chance(0.5) ? [[0, 0], [1, 0]] : r.chance(0.5) ? [[0, 0], [0, 1]] : [[0, 0]]) {
      const i = idx(x + dx, y + dy);
      t.setI(i, scale(c, dy ? 0.85 : 1));
      t.height[i] = 1.1;
      t.smooth[i] = 50;
    }
    t.setI(idx(x, y + 1), DIRT_DARK);
  }
}

const PODZOL: RGB[] = [[74, 50, 24], [92, 62, 30], [110, 76, 38], [132, 92, 46]];

/** Cara de arriba del podsol: tierra parda cubierta de agujas de abeto secas. */
function podzolTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.6 * n4.at(x, y) + 0.4 * px[i]);
  const lv = rankLevels(v, [20, 35, 30, 15]);
  for (let i = 0; i < N; i++) {
    t.setI(i, PODZOL[lv[i]]);
    t.height[i] = 0.6 + lv[i] * 0.08;
    t.smooth[i] = 20;
  }
  // Agujas: trazos cortos en diagonal, claros con la sombra debajo.
  for (let k = 0; k < 22; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    const sx = r.chance(0.5) ? 1 : -1;
    const len = r.int(2, 3);
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, r.chance(0.3) ? [150, 104, 52] : [128, 88, 40]);
      t.height[i] = 1;
      t.setI(idx(x, y + 1), mix(t.get(x, y + 1), [60, 40, 20], 0.5));
      x += sx;
      y += s % 2;
    }
  }
  t.depth = 1.1;
}

/** Lado del podsol: tierra con la capa de agujas colgando por arriba. */
function podzolSide(t: Tex): void {
  dirtBase(t);
  const r = t.rng();
  const drip = Array.from({ length: 16 }, () => r.int(2, 4));
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y <= drip[x]; y++) {
      const i = idx(x, y);
      t.setI(i, y === drip[x] ? [70, 46, 22] : PODZOL[(x * 7 + y * 3) % 4]);
      t.height[i] = y === drip[x] ? 0.7 : 1;
      t.smooth[i] = 20;
    }
  }
  t.tiling = false;
}

/** Tierra enraizada: tierra algo más clara con raíces pálidas que la cruzan. */
function rootedDirt(t: Tex): void {
  dirtBase(t);
  const r = t.rng();
  for (let i = 0; i < N; i++) t.setI(i, mix(t.getI(i), [150, 112, 80], 0.12));
  for (let k = 0; k < 5; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    const len = r.int(5, 9);
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, r.chance(0.4) ? [196, 166, 128] : [176, 144, 106]);
      t.height[i] = 1.05;
      t.smooth[i] = 40;
      const m = r.next();
      if (m < 0.45) y++;
      else if (m < 0.75) x++;
      else x--;
    }
  }
}

const PATH: RGB[] = [[112, 88, 46], [128, 102, 54], [144, 116, 62], [160, 130, 72]];

/** Cara de arriba del camino de tierra: tierra apisonada, lisa y clara, con alguna piedrecita. */
function pathTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * n4.at(x, y) + 0.5 * px[i]);
  const lv = rankLevels(v, [12, 30, 38, 20]);
  for (let i = 0; i < N; i++) {
    t.setI(i, PATH[lv[i]]);
    t.height[i] = 0.9 + lv[i] * 0.03;
    t.smooth[i] = 35;
  }
  for (let k = 0; k < 6; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [150, 142, 128]);
    t.height[i] = 1;
  }
  t.depth = 0.6;
}

/** Lado del camino: la fila de arriba no se ve (el bloque mide 15/16); debajo, un borde apisonado y tierra. */
function pathSide(t: Tex): void {
  dirtBase(t);
  const r = t.rng();
  for (let x = 0; x < 16; x++) {
    const d = r.int(2, 3);
    for (let y = 0; y <= d; y++) {
      const i = idx(x, y);
      t.setI(i, y === d ? [98, 74, 40] : PATH[(x + y) % 4]);
      t.height[i] = y === d ? 0.7 : 1;
      t.smooth[i] = 35;
    }
  }
  t.tiling = false;
}

// ---------------------------------------------------------------------------
// Huevos de rana
// ---------------------------------------------------------------------------

/** Huevos de rana: bolitas gelatinosas grises con el embrión negro en el centro (recorte). */
function frogspawn(t: Tex): void {
  const r = t.rng();
  t.alpha.fill(0);
  const sites = scatter(r, 12, 3.4, 1, 1, false);
  for (const s of sites) {
    const cx = clamp(Math.floor(s.x), 1, 14), cy = clamp(Math.floor(s.y), 1, 14);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) === 2 && r.chance(0.6)) continue;
        const i = t.paint(cx + dx, cy + dy, dx === 0 && dy === 0 ? [34, 32, 30] : [196, 200, 186], dx === 0 && dy === 0 ? 0.8 : 1, 190);
        t.sss[i] = 120;
      }
    }
  }
  t.tiling = false;
  t.clampTransparent = true;
}

export const MATERIAL_GENERATORS: Record<string, Generator> = {
  raw_iron_block: rawBlock([[232, 196, 170], [212, 170, 140], [182, 140, 110], [146, 108, 84]], [96, 70, 54], 170),
  raw_gold_block: rawBlock([[255, 236, 120], [242, 200, 60], [214, 160, 32], [170, 116, 20]], [110, 70, 14], 220),
  coal_block: coalBlock,
  lapis_block: lapisBlock,
  bone_block_side: boneSide,
  bone_block_top: boneTop,
  slime_block: slimeBlock,
  blue_ice: blueIce,
  powder_snow: powderSnow,
  coarse_dirt: coarseDirt,
  podzol_top: podzolTop,
  podzol_side: podzolSide,
  rooted_dirt: rootedDirt,
  dirt_path_top: pathTop,
  dirt_path_side: pathSide,
  frogspawn,
};
