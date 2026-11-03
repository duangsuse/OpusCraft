// Fase 8.7: la rosa marchita, dibujada aquí (nada copiado del juego): una rosa de pétalos casi negros con los bordes
// gris ceniza, un poco de rojo muy oscuro en el centro y el tallo y las hojas secos, pardos casi negros.
import { type Generator, type Tex } from './texCore';
import { cutoutCanvas, sprite, type Ink } from './genPlants';

const ROSE: { rows: string[]; inks: Record<string, Ink> } = {
  rows: [
    '................',
    '................',
    '.....aAAa.......',
    '....aPppPa......',
    '...aPprRpPa.....',
    '...APprRpPA.....',
    '....aPppPa......',
    '.....aPPa.......',
    '.......s........',
    '...ll..s........',
    '...LlL.s..l.....',
    '....LL.s.lL.....',
    '.......slL......',
    '.......s........',
    '.......S........',
    '.......S........',
  ],
  inks: {
    a: { c: [86, 84, 82], h: 0.9 }, A: { c: [62, 60, 60], h: 0.88 },
    p: { c: [34, 30, 32], h: 1 }, P: { c: [22, 20, 22], h: 0.95 },
    r: { c: [70, 18, 20], h: 1.05 }, R: { c: [96, 26, 26], h: 1.1 },
    s: { c: [44, 36, 28], h: 0.8 }, S: { c: [34, 28, 22], h: 0.75 },
    l: { c: [52, 46, 34], h: 0.85 }, L: { c: [36, 32, 24], h: 0.8 },
  },
};

export const WITHER_GENERATORS: Record<string, Generator> = {
  wither_rose: (t: Tex) => {
    cutoutCanvas(t, 60, 200);
    sprite(t, ROSE.rows, ROSE.inks);
  },
};
