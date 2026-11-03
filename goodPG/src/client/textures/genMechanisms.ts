// Fase 7 (mecanismos): texturas de los mecanismos, todas dibujadas aquí (nada copiado):
// - pistón: la cara de tablones (con la capa de slime el adhesivo), la base de piedra con su placa de
//   hierro, el hueco de delante cuando está extendido y el lateral (banda de madera arriba y cuerpo de
//   piedra con el refuerzo de hierro);
// - observador: la cara con dos ojos y la boca, los lados, la flecha que apunta a la salida y la parte de
//   atrás con el punto rojo (encendido, brilla);
// - tolva: hierro por fuera, el cuenco oscuro por dentro y el borde;
// - dispensador (boca redonda) y soltador (boca cuadrada), de frente y hacia arriba o abajo;
// - dinamita: los cartuchos rojos con la banda, y los extremos (con la mecha arriba).
// El lateral del pistón y la flecha del observador se generan también girados (ver TURNED_TEXTURES de
// shared/blocks/mechanismBlocks.ts): la UV de cada cara es fija y así la banda queda siempre hacia delante.
import { N, S, Tex, Noise, clamp, idx, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { cobblestone } from './genStone';
import { furnaceSide, furnaceTop } from './genSurvival';
import { WOOD_GENERATORS } from './genWood';
import { STONES_GENERATORS } from './genStones';

const IRON: RGB[] = [[92, 94, 100], [128, 130, 138], [168, 170, 178], [206, 208, 214]];
const HOPPER_METAL: RGB[] = [[44, 44, 48], [64, 64, 70], [84, 84, 90], [112, 112, 120]];

/** Copia la textura `gen` (con su nombre, para que salga igual) en `t`. */
function copy(t: Tex, gen: Generator, name: string): void {
  const src = new Tex(name);
  gen(src);
  t.col.set(src.col);
  t.alpha.set(src.alpha);
  t.height.set(src.height);
  t.smooth.set(src.smooth);
  t.f0.set(src.f0);
  t.sss.set(src.sss);
  t.emit.set(src.emit);
  t.depth = src.depth;
}

/** La textura `gen` girada `turns` cuartos de vuelta en el sentido de las agujas del reloj. */
function turned(gen: Generator, name: string, turns: number): Generator {
  return (t) => {
    const src = new Tex(name);
    gen(src);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Un giro: el píxel (x, y) sale de (y, 15 − x).
        let sx = x, sy = y;
        for (let k = 0; k < turns; k++) [sx, sy] = [sy, 15 - sx];
        const i = y * S + x, j = sy * S + sx;
        t.setI(i, src.getI(j));
        t.alpha[i] = src.alpha[j];
        t.height[i] = src.height[j];
        t.smooth[i] = src.smooth[j];
        t.f0[i] = src.f0[j];
        t.sss[i] = src.sss[j];
        t.emit[i] = src.emit[j];
      }
    }
    t.depth = src.depth;
  };
}

/** Placa de metal pulido (x0..x1, y0..y1) con bisel: claro arriba y a la izquierda, oscuro abajo y a la derecha. */
function plate(t: Tex, x0: number, y0: number, x1: number, y1: number, pal: RGB[], h = 1): void {
  const px = pixelNoise(t.rng('plate' + x0 + y0));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tl = x === x0 || y === y0, br = x === x1 || y === y1;
      const c = tl && !br ? pal[3] : br && !tl ? pal[0] : pal[2];
      t.paint(x, y, scale(c, 0.96 + px[y * S + x] * 0.08), h, 150, 0);
      t.f0[idx(x, y)] = 180;
    }
  }
}

/** Remache (un píxel claro con sombra debajo). */
function rivet(t: Tex, x: number, y: number, pal: RGB[]): void {
  t.paint(x, y, pal[3], 1.1, 170);
  t.paint(x, y + 1, pal[0], 0.85, 90);
}

// ------------------------------------------------------------------ pistón

function pistonSide(t: Tex): void {
  cobblestone(t, false);
  // Banda de tablones arriba (la cabeza) y una junta oscura debajo.
  const wood = new Tex('oak_planks');
  WOOD_GENERATORS.oak_planks(wood);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < S; x++) {
      const j = (y + 4) * S + x;
      t.paint(x, y, scale(wood.getI(j), y === 0 ? 1.08 : y === 3 ? 0.86 : 1), wood.height[j], wood.smooth[j]);
    }
  }
  for (let x = 0; x < S; x++) t.paint(x, 4, [58, 56, 54], 0.15, 30);
  // Refuerzo de hierro por el centro del cuerpo.
  plate(t, 6, 5, 9, 15, IRON, 0.95);
  rivet(t, 7, 7, IRON);
  rivet(t, 8, 12, IRON);
  t.depth = 1.4;
}

function pistonTop(sticky: boolean): Generator {
  return (t) => {
    copy(t, WOOD_GENERATORS.oak_planks, 'oak_planks');
    // Marco oscuro de la cara y esquinas de hierro.
    for (let k = 0; k < S; k++) {
      for (const [x, y] of [[k, 0], [k, 15], [0, k], [15, k]] as const) t.paint(x, y, scale(t.get(x, y), 0.62), 0.8);
    }
    for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15], [1, 1], [14, 1], [1, 14], [14, 14]] as const) t.paint(x, y, IRON[2], 1.05, 150);
    if (!sticky) return;
    // Capa de slime: una mancha verde brillante que casi cubre la cara.
    const r = t.rng('slime');
    const n = new Noise(r, 4);
    const px = pixelNoise(r);
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5) / 7 + (n.at(x, y) - 0.5) * 0.35;
        if (d > 0.95) continue;
        const edge = d > 0.8;
        const c: RGB = edge ? [84, 150, 58] : mix([118, 196, 88], [150, 226, 120], px[y * S + x]);
        t.paint(x, y, c, 1.15, 220, 90);
      }
    }
    for (const [x, y] of [[5, 4], [6, 4], [4, 5], [10, 9], [9, 10]] as const) t.paint(x, y, [214, 255, 196], 1.2, 240);
  };
}

function pistonBottom(t: Tex): void {
  cobblestone(t, false);
  plate(t, 5, 5, 10, 10, IRON, 1.1);
  for (const [x, y] of [[6, 6], [9, 6], [6, 9], [9, 9]] as const) t.paint(x, y, IRON[1], 1.05, 140);
}

/** Frente de la base extendida: el hueco oscuro por el que sale el brazo de madera. */
function pistonInner(t: Tex): void {
  cobblestone(t, false);
  const px = pixelNoise(t.rng());
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      const rim = x === 2 || y === 2 || x === 13 || y === 13;
      t.paint(x, y, scale(rim ? [70, 70, 74] : [38, 38, 42], 0.94 + px[y * S + x] * 0.1), rim ? 0.4 : 0.1, 30);
    }
  }
  const wood = new Tex('oak_planks');
  WOOD_GENERATORS.oak_planks(wood);
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.paint(x, y, scale(wood.getI(y * S + x), x === 6 || y === 6 ? 1.1 : 0.92), 0.6, 60);
  t.depth = 1.6;
}

// ------------------------------------------------------------------ observador

/** Panel de piedra lisa con bisel (la base de todas las caras del observador). */
function panel(t: Tex): void {
  copy(t, STONES_GENERATORS.smooth_stone, 'smooth_stone');
  for (let i = 0; i < N; i++) t.setI(i, scale(t.getI(i), 0.84));
}

function observerFront(t: Tex): void {
  panel(t);
  const dark: RGB = [34, 34, 38];
  // Dos ojos (rendijas) y una boca con dientes.
  for (const x0 of [3, 10]) {
    for (let y = 4; y <= 6; y++) for (let x = x0; x < x0 + 3; x++) t.paint(x, y, dark, 0.2, 20);
    t.paint(x0 + 1, 5, [92, 94, 104], 0.35, 120);
  }
  for (let x = 3; x <= 12; x++) {
    t.paint(x, 10, dark, 0.2, 20);
    t.paint(x, 11, (x & 1) === 0 ? [150, 150, 156] : dark, (x & 1) === 0 ? 0.6 : 0.2, 40);
    t.paint(x, 12, dark, 0.2, 20);
  }
  for (let x = 2; x <= 13; x++) {
    t.paint(x, 9, scale(t.get(x, 9), 0.8), 0.7);
    t.paint(x, 13, scale(t.get(x, 13), 1.12), 1);
  }
  t.depth = 1.6;
}

function observerSide(t: Tex): void {
  panel(t);
  // Rejilla de ventilación en el centro (igual girada) y remaches en las esquinas.
  for (let y = 5; y <= 10; y++) {
    for (let x = 5; x <= 10; x++) {
      const slot = (x + y) % 2 === 0;
      t.paint(x, y, slot ? [52, 52, 58] : [118, 118, 124], slot ? 0.3 : 0.8, 60);
    }
  }
  for (const [x, y] of [[2, 2], [13, 2], [2, 12], [13, 12]] as const) rivet(t, x, y, IRON);
  t.depth = 1.2;
}

/** Lado con la flecha grabada que apunta hacia arriba (hacia la salida del observador, al girarla). */
function observerTop(t: Tex): void {
  panel(t);
  const dark: RGB = [54, 54, 60], light: RGB = [176, 176, 182];
  const arrow = [
    '.......##.......',
    '......####......',
    '.....######.....',
    '....###..###....',
    '.......##.......',
    '.......##.......',
    '.......##.......',
    '.......##.......',
    '.......##.......',
    '.......##.......',
  ];
  arrow.forEach((row, k) => {
    for (let x = 0; x < S; x++) {
      if (row[x] !== '#') continue;
      const y = k + 3;
      t.paint(x, y, dark, 0.3, 40);
      if (arrow[k + 1]?.[x] !== '#' && y + 1 < 15) t.paint(x, y + 1, light, 1.05);
    }
  });
  t.depth = 1.3;
}

function observerBack(on: boolean): Generator {
  return (t) => {
    panel(t);
    for (let y = 4; y <= 11; y++) {
      for (let x = 4; x <= 11; x++) {
        const rim = x === 4 || y === 4 || x === 11 || y === 11;
        t.paint(x, y, rim ? [70, 70, 76] : [30, 30, 34], rim ? 0.5 : 0.2, 30);
      }
    }
    // El punto rojo: apagado, granate; encendido, brilla.
    const cells: [number, number, number][] = [[7, 7, 1], [8, 7, 0.9], [7, 8, 0.85], [8, 8, 0.75]];
    for (const [x, y, k] of cells) {
      const c: RGB = on ? scale([255, 72, 40], k) : scale([110, 24, 18], k);
      const i = t.paint(x, y, c, 0.7, 120);
      if (on) t.emit[i] = 240;
    }
    if (on) for (const [x, y] of [[6, 7], [9, 8], [7, 6], [8, 9]] as const) {
      const i = t.paint(x, y, [150, 34, 22], 0.4, 60);
      t.emit[i] = 120;
    }
    t.depth = 1.5;
  };
}

// ------------------------------------------------------------------ tolva

function hopperMetal(t: Tex, pal: RGB[]): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.6 * n.at(x, y) + 0.4 * px[i];
    t.setI(i, pal[clamp(Math.floor(v * 3) + 1, 1, 2)]);
    t.height[i] = 0.9 + 0.1 * v;
    t.smooth[i] = 110 + 30 * px[i];
    t.f0[i] = 150;
  }
}

function hopperOutside(t: Tex): void {
  hopperMetal(t, HOPPER_METAL);
  // Uniones de las chapas y remaches.
  for (let k = 0; k < S; k++) {
    t.paint(k, 0, HOPPER_METAL[3], 1);
    t.paint(k, 15, HOPPER_METAL[0], 0.8);
    t.paint(0, k, HOPPER_METAL[3], 1);
    t.paint(15, k, HOPPER_METAL[0], 0.8);
    t.paint(k, 7, HOPPER_METAL[0], 0.7);
  }
  for (const [x, y] of [[3, 3], [12, 3], [3, 11], [12, 11]] as const) rivet(t, x, y, HOPPER_METAL);
  t.depth = 1.2;
}

function hopperInside(t: Tex): void {
  hopperMetal(t, HOPPER_METAL.map((c) => scale(c, 0.62)));
  for (let k = 0; k < S; k += 4) for (let j = 0; j < S; j++) t.paint(k, j, scale(HOPPER_METAL[0], 0.5), 0.8);
}

function hopperTop(t: Tex): void {
  hopperMetal(t, HOPPER_METAL);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      if (ring >= 2) t.paint(x, y, [28, 28, 32], 0.2, 20);
      else t.paint(x, y, ring === 0 ? HOPPER_METAL[3] : HOPPER_METAL[2], 1, 150);
    }
  }
}

// ------------------------------------------------------------------ dispensador y soltador

/** Boca del dispensador (redonda) o del soltador (cuadrada, más pequeña) sobre la piedra. */
function mouth(round: boolean): (t: Tex) => void {
  return (t) => {
    const cx = 7.5, cy = 8.5;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = round ? Math.hypot(x - cx, y - cy) : Math.max(Math.abs(x - cx), Math.abs(y - cy));
        const r = round ? 4.2 : 3.2;
        if (d > r + 1) continue;
        if (d > r) t.paint(x, y, x + y < cx + cy ? [150, 150, 150] : [84, 84, 86], 1.05, 70); // borde
        else if (d > r - 1) t.paint(x, y, [52, 52, 54], 0.4, 30);
        else t.paint(x, y, round ? [22, 20, 20] : d < 1.2 ? [16, 16, 16] : [40, 40, 42], 0.1, 20);
      }
    }
    t.depth = 1.6;
  };
}

const dispenserFront = (round: boolean, vertical: boolean): Generator => (t) => {
  if (vertical) furnaceTop(t);
  else furnaceSide(t);
  mouth(round)(t);
};

// ------------------------------------------------------------------ dinamita

const TNT_RED: RGB[] = [[140, 26, 20], [182, 40, 30], [214, 58, 42], [236, 96, 76]];

function tntSide(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Cartuchos de 4 píxeles: claro a la izquierda, sombra a la derecha.
      const k = x & 3;
      const c = k === 0 ? TNT_RED[3] : k === 3 ? TNT_RED[0] : TNT_RED[k === 1 ? 2 : 1];
      t.paint(x, y, scale(c, 0.95 + px[y * S + x] * 0.08), k === 3 ? 0.7 : 1, 50);
    }
  }
  // Banda de papel con las letras.
  for (let y = 5; y <= 10; y++) for (let x = 0; x < S; x++) t.paint(x, y, y === 5 || y === 10 ? [196, 188, 170] : [232, 226, 206], 1.1, 40);
  const letters = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'];
  letters.forEach((row, k) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') t.paint(i + 2, k + 6, [30, 26, 24], 1.05, 30);
  });
  t.depth = 1.1;
}

function tntEnd(fuse: boolean): Generator {
  return (t) => {
    const px = pixelNoise(t.rng());
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Cuatro cartuchos vistos desde arriba (anillos de papel con la pólvora dentro).
        const cx = (x & 7) - 3.5, cy = (y & 7) - 3.5;
        const d = Math.hypot(cx, cy);
        const c: RGB = d > 3.4 ? [120, 22, 18] : d > 2.4 ? TNT_RED[2] : d > 1.2 ? [226, 214, 192] : [58, 52, 48];
        t.paint(x, y, scale(c, 0.94 + px[y * S + x] * 0.1), d > 3.4 ? 0.5 : d > 1.2 ? 1 : 0.6, 40);
      }
    }
    if (!fuse) return;
    // La mecha: una cuerda gris que sale del centro.
    for (const [x, y] of [[7, 7], [8, 8], [8, 7], [7, 8], [9, 6], [10, 5]] as const) t.paint(x, y, [96, 92, 86], 1.3, 30);
    t.paint(11, 4, [180, 170, 150], 1.35, 40);
  };
}

// ------------------------------------------------------------------ registro

export const MECHANISM_GENERATORS: Record<string, Generator> = {
  piston_top: pistonTop(false),
  piston_top_sticky: pistonTop(true),
  piston_bottom: pistonBottom,
  piston_inner: pistonInner,
  observer_front: observerFront,
  observer_side: observerSide,
  observer_back: observerBack(false),
  observer_back_on: observerBack(true),
  hopper_outside: hopperOutside,
  hopper_inside: hopperInside,
  hopper_top: hopperTop,
  dispenser_front: dispenserFront(true, false),
  dispenser_front_vertical: dispenserFront(true, true),
  dropper_front: dispenserFront(false, false),
  dropper_front_vertical: dispenserFront(false, true),
  tnt_side: tntSide,
  tnt_top: tntEnd(true),
  tnt_bottom: tntEnd(false),
};
for (const [name, gen] of [['piston_side', pistonSide], ['observer_top', observerTop]] as const) {
  MECHANISM_GENERATORS[name] = gen;
  for (let r = 1; r < 4; r++) MECHANISM_GENERATORS[`${name}_r${r}`] = turned(gen, name, r);
}
