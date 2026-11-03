// Fase 6.5 (libros y estandartes): textura del libro abierto sobre el atril. La cara de arriba del libro
// toma el trozo x 2..13, z 3..12 de la textura: dos páginas con renglones, el lomo en medio y el canto de
// la tapa alrededor.
import { N, mix, scale, pixelNoise, type Generator, type RGB } from './texCore';

const COVER: RGB = [112, 62, 36];
const PAGE: RGB = [238, 230, 204];
const INK: RGB = [128, 118, 104];

function lecternBook(t: Parameters<Generator>[0]): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = x <= 2 || x >= 13 || y <= 3 || y >= 12;
    const spine = x === 7 || x === 8;
    let c: RGB;
    if (edge) c = scale(COVER, 0.9 + px[i] * 0.2);
    else if (spine) c = scale(PAGE, x === 7 ? 0.78 : 0.86);
    else {
      // Renglones en filas alternas, más cortos al final de cada página.
      const line = (y & 1) === 1 && y < 11 && !((x === 6 || x === 12) && y > 8);
      c = line && (x * 5 + y * 3) % 7 !== 0 ? mix(PAGE, INK, 0.75) : scale(PAGE, 0.96 + px[i] * 0.08);
    }
    t.setI(i, c);
    t.height[i] = edge ? 0.8 : spine ? 0.7 : 1;
    t.smooth[i] = edge ? 90 : 40;
  }
}

export const BOOK_GENERATORS: Readonly<Record<string, Generator>> = {
  lectern_book: lecternBook,
};
