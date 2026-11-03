// Fase 7 (encantamientos): las runas de la mesa de encantamientos. Un alfabeto propio de 26 signos de
// 5×7 píxeles (trazos rectos y puntos, generados de forma determinista por letra) con el que se escriben
// palabras sueltas de una lista; se dibujan en un lienzo y se usan como imagen en los botones de las
// ofertas. No dicen nada útil: como en Minecraft, sólo dan ambiente.

/** Palabras que salen en las ofertas (mezcladas de tres en tres). */
const WORDS = [
  'eter', 'ascua', 'runa', 'velo', 'niebla', 'abismo', 'cenit', 'brasa', 'umbral', 'susurro', 'cobalto', 'eco', 'lumbre',
  'marea', 'orbe', 'sello', 'sombra', 'vigilia', 'astro', 'caliz', 'ceniza', 'escarcha', 'hierro', 'jade', 'lazo', 'nudo',
  'oraculo', 'pluma', 'quietud', 'raiz', 'savia', 'trueno', 'vacio', 'yermo', 'zafiro', 'alba', 'bruma', 'cripta', 'destello',
  'espiral', 'fulgor', 'grieta', 'halo', 'indigo', 'llama', 'mito', 'nocturno', 'onda', 'pozo', 'rastro', 'sigilo', 'tinta',
  'vertice', 'yunque', 'arcano', 'lapis', 'libro', 'glifo', 'aurora', 'cristal', 'ambar',
];

/** Signo de cada letra: 7 filas de 5 bits (se generan una vez). */
const GLYPHS: number[][] = (() => {
  const out: number[][] = [];
  for (let c = 0; c < 26; c++) {
    let s = (c + 1) * 2654435761 >>> 0;
    const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
    const g = new Array(7).fill(0);
    const hline = (y: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) g[y] |= 1 << (4 - x); };
    const vline = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) g[y] |= 1 << (4 - x); };
    // Un palo principal y dos o tres trazos más (barras, ganchos, puntos o una diagonal).
    const main = rnd() < 0.5 ? 0 : rnd() < 0.5 ? 2 : 4;
    vline(main, rnd() < 0.3 ? 2 : 0, rnd() < 0.3 ? 4 : 6);
    const strokes = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < strokes; k++) {
      const r = rnd();
      if (r < 0.35) {
        const y = [0, 3, 6][Math.floor(rnd() * 3)];
        hline(y, rnd() < 0.5 ? 0 : 1, rnd() < 0.5 ? 4 : 3);
      } else if (r < 0.6) {
        const x = [0, 2, 4][Math.floor(rnd() * 3)];
        vline(x, rnd() < 0.5 ? 0 : 3, rnd() < 0.5 ? 3 : 6);
      } else if (r < 0.8) {
        g[Math.floor(rnd() * 7)] |= 1 << (4 - Math.floor(rnd() * 5));
      } else {
        const up = rnd() < 0.5;
        for (let i = 0; i < 5; i++) g[up ? 5 - i : 1 + i] |= 1 << (4 - i);
      }
    }
    out.push(g);
  }
  return out;
})();

/** `n` textos de una a tres palabras, siempre los mismos para la misma semilla. */
export function runeWords(seed: number, n: number): string[] {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 13), 0x5bd1e995) + 0x6d2b79f5) >>> 0) / 4294967296);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = 1 + Math.floor(rnd() * 3);
    const words: string[] = [];
    for (let j = 0; j < k; j++) words.push(WORDS[Math.floor(rnd() * WORDS.length)]);
    // Que no pase de lo que cabe en el botón (unas 14 letras).
    let text = words.join(' ');
    while (text.length > 14 && words.length > 1) text = (words.pop(), words.join(' '));
    out.push(text.slice(0, 14));
  }
  return out;
}

const cache = new Map<string, string>();

/** Imagen (URL de datos) con el texto escrito en runas; `on`: color de la oferta que se puede coger. */
export function runeWordUrl(text: string, on: boolean): string {
  const key = `${on ? 1 : 0}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 2;
  const w = Math.max(1, text.length * 6 * S);
  const h = 8 * S;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  // Sombra y tinta (violeta claro si se puede coger; apagada si no).
  const layers: [string, number][] = [[on ? '#2a1638' : '#1c1c22', S], [on ? '#c9a8ff' : '#6e6878', 0]];
  for (const [color, off] of layers) {
    ctx.fillStyle = color;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i) - 97;
      if (c < 0 || c >= 26) continue;
      const g = GLYPHS[c];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        if (g[y] & (1 << (4 - x))) ctx.fillRect((i * 6 + x) * S + off / 2, y * S + off / 2, S, S);
      }
    }
  }
  const url = cv.toDataURL();
  if (cache.size > 256) cache.clear();
  cache.set(key, url);
  return url;
}
