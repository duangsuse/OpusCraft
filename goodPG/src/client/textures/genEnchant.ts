// Fase 7 (encantamientos): texturas de la mesa de encantamientos, los yunques y el hielo escarchado.
// - Mesa: obsidiana con esquinas de diamante y un paño de terciopelo rojo con un bordado dorado encima
//   (la cara lateral muestra las filas 4..15: el paño cae 3 px sobre la obsidiana).
// - Yunque: hierro forjado oscuro, con la tabla de arriba más pulida; el dañado y el muy dañado tienen
//   cada vez más grietas y desconchones.
// - Hielo escarchado: el hielo de siempre con grietas blancas que crecen con la edad (0..3).
import { Tex, N, idx, mix, scale, pixelNoise, Noise, field, type Generator, type RGB } from './texCore';
import { obsidian } from './genStone';
import { ice } from './genSoil';

const VELVET: readonly RGB[] = [[112, 18, 30], [138, 26, 38], [162, 34, 46], [188, 52, 60]];
const GOLD: RGB = [226, 184, 72];
const DIAMOND: RGB = [98, 222, 214];
const IRON_DARK: RGB = [46, 46, 50];
const IRON_LIGHT: RGB = [94, 94, 100];

/** Terciopelo: rampa de rojos con pelusa por píxel. */
function velvet(t: Tex, i: number, px: number, n: number): void {
  const k = Math.min(3, Math.max(0, Math.floor((0.55 * n + 0.45 * px) * 4)));
  t.setI(i, VELVET[k]);
  t.height[i] = 0.92 + 0.08 * px;
  t.smooth[i] = 40;
  t.f0[i] = 8;
  t.sss[i] = 30;
}

function tableTop(t: Tex): void {
  obsidian(t);
  const r = t.rng('paño');
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (x < 2 || x > 13 || y < 2 || y > 13) continue;
    velvet(t, i, px[i], n.at(x, y));
    // Bordado dorado: un rombo con un punto en el centro y el ribete del paño.
    const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
    if ((d > 4.6 && d < 5.6) || d < 1.1 || x === 2 || x === 13 || y === 2 || y === 13) {
      t.setI(i, scale(GOLD, 0.82 + 0.3 * px[i]));
      t.height[i] = 1;
      t.smooth[i] = 150;
      t.f0[i] = 200;
    }
  }
  // Esquinas de diamante.
  for (const [cx, cy] of [[0, 0], [14, 0], [0, 14], [14, 14]]) {
    for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) {
      const i = idx(x, y);
      t.setI(i, (x + y) & 1 ? DIAMOND : scale(DIAMOND, 1.18));
      t.smooth[i] = 230;
      t.f0[i] = 40;
      t.height[i] = 1;
    }
  }
}

function tableSide(t: Tex): void {
  obsidian(t);
  const r = t.rng('paño');
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    // El paño cae por las filas 4..6 con el borde en picos; debajo, un ribete dorado.
    const hang = 6 + ((x & 3) === 1 || (x & 3) === 2 ? 1 : 0);
    if (y >= 4 && y <= hang) {
      velvet(t, i, px[i], n.at(x, y));
      if (y === hang) t.setI(i, scale(VELVET[0], 0.85));
    }
    // Esquinas de diamante en los bordes, bajo el paño.
    if ((x < 2 || x > 13) && y >= 8 && y <= 13) {
      t.setI(i, (x + y) & 1 ? DIAMOND : scale(DIAMOND, 1.15));
      t.smooth[i] = 230;
      t.f0[i] = 40;
      t.height[i] = 1;
    }
  }
  for (let x = 0; x < 16; x++) {
    const i = idx(x, 4);
    t.setI(i, scale(GOLD, 0.9 + 0.2 * px[i]));
    t.f0[i] = 200;
    t.smooth[i] = 150;
  }
}

function tableBottom(t: Tex): void {
  obsidian(t);
}

/** Hierro forjado: manchas amplias, grano fino y martillazos. */
function forged(t: Tex, polish: number): void {
  const r = t.rng('hierro');
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.2 * px[i]);
  for (let i = 0; i < N; i++) {
    t.setI(i, mix(IRON_DARK, IRON_LIGHT, v[i] * (0.8 + 0.2 * polish)));
    t.height[i] = 0.86 + 0.14 * n8.at(i & 15, i >> 4);
    t.smooth[i] = 110 + 70 * polish;
    t.f0[i] = 232;
  }
}

function anvilBody(t: Tex): void {
  forged(t, 0.2);
  // Remaches y bordes de las piezas.
  for (let x = 0; x < 16; x++) {
    for (const y of [0, 15]) {
      const i = idx(x, y);
      t.setI(i, scale(t.getI(i), 0.72));
      t.height[i] = 0.75;
    }
  }
}

/** Tabla del yunque: franja pulida en el centro (el hueco del cuerno queda en los extremos); `cracks` 0..2. */
function anvilTop(cracks: number): Generator {
  return (t) => {
    forged(t, 1);
    const r = t.rng('grietas');
    for (let i = 0; i < N; i++) {
      const x = i & 15;
      // La tabla va de x 3 a 12 (se ve de canto en el modelo): el centro, más brillante y liso.
      if (x >= 5 && x <= 10) {
        t.setI(i, scale(t.getI(i), 1.22));
        t.smooth[i] = 205;
        t.height[i] = 1;
      }
      if (x === 3 || x === 12) {
        t.setI(i, scale(t.getI(i), 0.7));
        t.height[i] = 0.8;
      }
    }
    // Grietas: trazos oscuros que avanzan en zigzag; los desconchones dejan ver hierro más claro.
    const walks = cracks === 0 ? 0 : cracks === 1 ? 3 : 6;
    for (let k = 0; k < walks; k++) {
      let x = r.int(4, 11), y = r.int(0, 15);
      const len = r.int(3, 5 + cracks * 2);
      for (let s = 0; s < len; s++) {
        if (x < 3 || x > 12 || y < 0 || y > 15) break;
        const i = idx(x, y);
        t.setI(i, [22, 22, 24]);
        t.height[i] = 0.55;
        t.smooth[i] = 60;
        const m = r.next();
        if (m < 0.45) y++;
        else if (m < 0.7) x++;
        else if (m < 0.95) x--;
        else y--;
      }
    }
    for (let k = 0; k < cracks * 3; k++) {
      const x = r.int(4, 11), y = r.int(1, 14);
      const i = idx(x, y);
      t.setI(i, scale(IRON_LIGHT, 1.35));
      t.height[i] = 0.7;
    }
  };
}

/** Hielo escarchado de edad `age`: grietas blancas que crecen y lo vuelven más opaco. */
function frostedIce(age: number): Generator {
  return (t) => {
    ice(t);
    const r = t.rng('escarcha');
    const walks = 2 + age * 3;
    for (let k = 0; k < walks; k++) {
      let x = r.int(0, 15), y = r.int(0, 15);
      const len = r.int(3, 4 + age * 2);
      for (let s = 0; s < len; s++) {
        const i = idx(x & 15, y & 15);
        t.setI(i, mix([226, 240, 252], [255, 255, 255], age / 3));
        t.alpha[i] = 200 + age * 12;
        t.height[i] = 0.7;
        t.smooth[i] = 120;
        x += r.chance(0.5) ? 1 : -1;
        if (r.chance(0.6)) y += 1;
      }
    }
    // Escarcha por los bordes.
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const edge = Math.min(x, y, 15 - x, 15 - y);
      if (edge === 0 && r.chance(0.35 + age * 0.15)) {
        t.setI(i, [236, 246, 255]);
        t.alpha[i] = Math.max(t.alpha[i], 210);
      }
    }
  };
}

/** Tapas del libro de la mesa: cuero violeta con un canto dorado. */
function bookCover(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = x === 0 || x === 15 || y === 0 || y === 15;
    t.setI(i, edge ? scale(GOLD, 0.8 + 0.2 * px[i]) : mix([74, 30, 96], [120, 58, 142], px[i]));
    t.smooth[i] = edge ? 150 : 70;
    t.f0[i] = edge ? 200 : 12;
  }
}

/** Hojas del libro: papel claro con renglones. */
function bookPages(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    t.setI(i, (y & 3) === 2 ? [196, 186, 160] : mix([236, 228, 206], [250, 246, 230], px[i]));
    t.smooth[i] = 40;
  }
}

export const ENCHANT_GENERATORS: Readonly<Record<string, Generator>> = {
  enchanting_table_top: tableTop,
  enchanting_table_side: tableSide,
  enchanting_table_bottom: tableBottom,
  anvil: anvilBody,
  anvil_top: anvilTop(0),
  chipped_anvil_top: anvilTop(1),
  damaged_anvil_top: anvilTop(2),
  frosted_ice_0: frostedIce(0),
  frosted_ice_1: frostedIce(1),
  frosted_ice_2: frostedIce(2),
  frosted_ice_3: frostedIce(3),
  enchanting_book_cover: bookCover,
  enchanting_book_pages: bookPages,
};
