// Fase 6.5 (remate): texturas de la estantería cincelada. El frente tiene 6 huecos (columnas de 5, 6 y
// 5 píxeles; dos filas de 8) y se dibuja con una caja por hueco que toma su trozo de la textura vacía
// o de la llena, así que los marcos de las dos coinciden píxel a píxel.
import { N, clamp, pixelNoise, scale, type Generator, type RGB, type Tex } from './texCore';
import { OAK_PLANKS } from './genWood';

/** ¿Píxel del marco de roble del frente? (bordes de cada hueco). */
function frameAt(x: number, y: number): boolean {
  return x === 0 || x === 4 || x === 5 || x === 10 || x === 11 || x === 15 || y === 0 || y === 7 || y === 8 || y === 15;
}

/** Marco de roble (con la luz arriba a la izquierda de cada hueco) y el fondo del hueco en sombra. */
function shelfFront(t: Tex, fillHole: (x: number, y: number, i: number) => void): void {
  const px = pixelNoise(t.rng('frame'));
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (frameAt(x, y)) {
      const lit = y === 0 || y === 8 || x === 0 || x === 5 || x === 11;
      t.setI(i, scale(lit ? OAK_PLANKS.light : OAK_PLANKS.dark, 1 + (px[i] - 0.5) * 0.08));
      t.height[i] = 1;
      t.smooth[i] = OAK_PLANKS.smooth;
    } else fillHole(x, y, i);
  }
}

const BOOK_COLORS: RGB[] = [
  [142, 48, 42], [48, 66, 128], [58, 104, 56], [118, 78, 44], [176, 142, 58], [98, 58, 112], [46, 108, 108], [150, 70, 40],
];

function shelfEmpty(t: Tex): void {
  const px = pixelNoise(t.rng());
  shelfFront(t, (x, y, i) => {
    // Hueco vacío: fondo oscuro, más claro abajo (la balda).
    const floor = y === 6 || y === 14;
    t.setI(i, scale(floor ? [58, 42, 28] : [30, 22, 15], 0.9 + px[i] * 0.2));
    t.height[i] = floor ? 0.35 : 0.1;
    t.smooth[i] = 20;
  });
}

function shelfOccupied(t: Tex): void {
  const r = t.rng('books');
  // Un lomo por columna del hueco (de 1 píxel), con alturas y colores al azar y una franja clara.
  const spine: { c: RGB; top: number }[] = [];
  for (let x = 0; x < 16; x++) spine.push({ c: BOOK_COLORS[r.int(0, BOOK_COLORS.length - 1)], top: r.int(0, 2) });
  const px = pixelNoise(t.rng());
  shelfFront(t, (x, y, i) => {
    const row0 = y < 8 ? 1 : 9;
    const s = spine[(x + (y < 8 ? 0 : 7)) & 15];
    if (y - row0 < s.top) {
      t.setI(i, scale([30, 22, 15], 0.9 + px[i] * 0.2));
      t.height[i] = 0.1;
      t.smooth[i] = 20;
      return;
    }
    const band = y - row0 === s.top + 1 || y - row0 === 5;
    t.setI(i, scale(band ? scale(s.c, 1.45) : s.c, clamp(0.88 + px[i] * 0.2, 0, 2)));
    t.height[i] = 0.6 + (x % 2) * 0.1;
    t.smooth[i] = 70;
  });
}

/** Tapa y costados: tablones de roble con un borde más oscuro. */
function shelfPlanks(sideBand: boolean): Generator {
  return (t) => {
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const edge = x === 0 || x === 15 || y === 0 || y === 15 || (sideBand && (y === 7 || y === 8));
      const seam = !edge && y % 4 === 3;
      const c = edge ? OAK_PLANKS.dark : seam ? OAK_PLANKS.seam : px[i] > 0.8 ? OAK_PLANKS.grain : OAK_PLANKS.base;
      t.setI(i, scale(c, 1 + (px[i] - 0.5) * 0.06));
      t.height[i] = seam ? 0.7 : edge ? 0.95 : 1;
      t.smooth[i] = OAK_PLANKS.smooth;
    }
  };
}

export const FINISHING_GENERATORS: Record<string, Generator> = {
  chiseled_bookshelf_empty: shelfEmpty,
  chiseled_bookshelf_occupied: shelfOccupied,
  chiseled_bookshelf_top: shelfPlanks(false),
  chiseled_bookshelf_side: shelfPlanks(true),
};
