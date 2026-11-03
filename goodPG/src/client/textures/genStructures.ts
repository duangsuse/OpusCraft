// Texturas de las estructuras (fase 5): generador de monstruos, telaraña, arenisca cincelada y
// cortada, ladrillos de piedra musgosos y agrietados, rocanegra y obsidiana llorosa.

import { N, Noise, Tex, clamp, idx, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { stoneBricks, obsidian } from './genStone';
import { sandstoneTop } from './genSoil';
import { cutoutCanvas } from './genPlants';

/** Jaula de hierro oscuro: barrotes cada 4 píxeles con un marco, y huecos transparentes. */
function spawner(t: Tex): void {
  cutoutCanvas(t, 150, 0);
  t.tiling = false;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const frame = x === 0 || y === 0 || x === 15 || y === 15;
      const bar = x % 5 === 0 || y % 5 === 0;
      if (!frame && !bar) continue;
      const k = frame ? 0.9 : 0.7;
      t.paint(x, y, scale([74, 78, 92], k + (((x + y) & 1) ? 0.08 : 0)), frame ? 1 : 0.8, 150);
      t.f0[idx(x, y)] = 230;
    }
  }
  t.depth = 0.8;
}

/** Telaraña: hilos blancos radiales y en espiral sobre fondo transparente. */
function cobweb(t: Tex): void {
  cutoutCanvas(t, 60, 120);
  const r = t.rng();
  const c: RGB = [226, 228, 232];
  // Radios desde el centro.
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + r.range(-0.15, 0.15);
    for (let d = 0; d < 9; d++) {
      const x = Math.round(7.5 + Math.cos(ang) * d), y = Math.round(7.5 + Math.sin(ang) * d);
      if (x >= 0 && x < 16 && y >= 0 && y < 16) t.paint(x, y, c, 0.8);
    }
  }
  // Anillos.
  for (const rad of [2.5, 4.5, 6.5]) {
    for (let a = 0; a < 64; a++) {
      if (r.chance(0.2)) continue;
      const ang = (a / 64) * Math.PI * 2;
      const x = Math.round(7.5 + Math.cos(ang) * rad), y = Math.round(7.5 + Math.sin(ang) * rad);
      if (x >= 0 && x < 16 && y >= 0 && y < 16) t.paint(x, y, scale(c, 0.9), 0.7);
    }
  }
  t.depth = 0.3;
}

const SST: RGB[] = [[196, 181, 132], [206, 192, 143], [214, 201, 152], [221, 209, 161], [228, 217, 171]];

/** Arenisca cortada: lisa, con dos franjas finas arriba y abajo. */
function cutSandstone(t: Tex): void {
  sandstoneTop(t);
  for (let x = 0; x < 16; x++) {
    for (const y of [0, 15]) t.setI(idx(x, y), SST[4]);
    for (const y of [1, 14]) {
      t.setI(idx(x, y), [184, 168, 120]);
      t.height[idx(x, y)] = 0.6;
    }
  }
}

/** Arenisca cincelada: marco y un dibujo tallado en el centro (como un glifo). */
function chiseledSandstone(t: Tex): void {
  cutSandstone(t);
  const glyph = [
    '..######..',
    '.#......#.',
    '#..####..#',
    '#.#....#.#',
    '#.#.##.#.#',
    '#.#.##.#.#',
    '#.#....#.#',
    '#..####..#',
    '.#......#.',
    '..######..',
  ];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (glyph[y][x] !== '#') continue;
      const i = idx(x + 3, y + 3);
      t.setI(i, [176, 158, 110]);
      t.height[i] = 0.55;
    }
  }
}

function mossyBricks(t: Tex): void {
  stoneBricks(t);
  const r = t.rng('moss');
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const v = 0.65 * n4.at(x, y) + 0.35 * px[i];
    if (v < 0.58) continue;
    t.setI(i, mix([70, 100, 42], [104, 132, 58], px[i]));
    t.height[i] += 0.08;
    t.smooth[i] = 30;
  }
}

function crackedBricks(t: Tex): void {
  stoneBricks(t);
  const r = t.rng('cracks');
  for (let k = 0; k < 5; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < r.int(3, 6); s++) {
      const i = idx(x, y);
      t.setI(i, [58, 58, 62]);
      t.height[i] = 0.3;
      x += r.chance(0.5) ? 1 : -1;
      y += r.chance(0.6) ? 1 : 0;
    }
  }
}

export function netherrack(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const pal: RGB[] = [[86, 30, 30], [106, 40, 38], [124, 50, 46], [142, 62, 56], [160, 78, 70]];
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const v = 0.4 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.25 * px[i];
    const l = clamp(Math.floor(v * 5), 0, 4);
    t.setI(i, pal[l]);
    t.height[i] = 0.5 + 0.1 * l;
    t.smooth[i] = 40;
  }
  t.depth = 1.2;
}

/** Obsidiana llorosa: obsidiana con vetas violetas que brillan. */
function cryingObsidian(t: Tex): void {
  obsidian(t);
  const r = t.rng('tears');
  for (let k = 0; k < 7; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < r.int(2, 5); s++) {
      const i = idx(x, y);
      t.setI(i, s === 0 ? [214, 120, 255] : [140, 50, 220]);
      t.emit[i] = s === 0 ? 255 : 180;
      y++;
      if (r.chance(0.3)) x += r.chance(0.5) ? 1 : -1;
    }
  }
}

export const STRUCTURE_GENERATORS: Record<string, Generator> = {
  spawner,
  cobweb,
  cut_sandstone: cutSandstone,
  chiseled_sandstone: chiseledSandstone,
  mossy_stone_bricks: mossyBricks,
  cracked_stone_bricks: crackedBricks,
  netherrack,
  crying_obsidian: cryingObsidian,
};
