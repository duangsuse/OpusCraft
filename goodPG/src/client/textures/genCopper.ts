// Texturas del cobre (fase 6.5). Cada dibujo (bloque pulido, cortado, grabado, rejilla, puerta,
// trampilla, barras, cadena y farol) se hace una sola vez como «relieve»: un tono por píxel (0 claro,
// 1 base, 2 oscuro, 3 arista), altura, suciedad (las ranuras acumulan más verdín) y huecos. Después
// se colorea con la paleta de cada fase de oxidación:
//  - normal: cobre anaranjado y muy metálico;
//  - expuesto: pardo rosado, con alguna mota verde;
//  - degradado: verde, con restos pardos y alguna mancha turquesa;
//  - oxidado: verdín turquesa mate.
// El verdín sale de un mismo ruido en las cuatro fases (sembrado por el dibujo, no por la fase), así
// que las manchas crecen en el mismo sitio a medida que el cobre envejece. Las enceradas usan las
// mismas texturas.

import { N, Noise, Rng, Tex, clamp, lerp, pixelNoise, type Generator, type RGB } from './texCore';

interface Pal {
  /** 0 claro, 1 base, 2 oscuro, 3 arista. */
  ramp: readonly [RGB, RGB, RGB, RGB];
  smooth: number;
  f0: number;
}

const PALS: readonly Pal[] = [
  { ramp: [[238, 162, 122], [206, 120, 84], [170, 92, 62], [128, 64, 42]], smooth: 195, f0: 234 },
  { ramp: [[200, 150, 124], [168, 121, 99], [136, 95, 77], [100, 67, 55]], smooth: 150, f0: 190 },
  { ramp: [[132, 182, 134], [104, 154, 112], [80, 122, 90], [57, 89, 67]], smooth: 95, f0: 36 },
  { ramp: [[110, 200, 168], [82, 166, 136], [61, 130, 106], [42, 95, 78]], smooth: 62, f0: 12 },
];

/** Luz del farol (no se oxida). */
const GLOW: readonly RGB[] = [[255, 238, 176], [255, 212, 110], [236, 160, 64]];

function rampAt(p: Pal, lv: number): RGB {
  const l = clamp(lv, 0, 3);
  const a = Math.floor(l), b = Math.min(3, a + 1), f = l - a;
  const ca = p.ramp[a], cb = p.ramp[b];
  return [lerp(ca[0], cb[0], f), lerp(ca[1], cb[1], f), lerp(ca[2], cb[2], f)];
}

/** Relieve de un dibujo de cobre, independiente de la fase. */
export class Relief { // Fase 7 (redstone): también lo usan la bombilla y el pararrayos (genRedstone.ts)
  readonly lv = new Float32Array(N).fill(1);
  readonly h = new Float32Array(N).fill(1);
  /** 0..1: cuánto verdín extra acumula (ranuras, juntas). */
  readonly grime = new Float32Array(N);
  /** Brillo extra (suavidad) por píxel. */
  readonly shine = new Float32Array(N);
  readonly hole = new Uint8Array(N);
  /** Luz del farol: 0 nada, 1..3 tono de GLOW (1 el más claro). */
  readonly glow = new Uint8Array(N);
  depth = 1.2;

  set(x: number, y: number, lv: number, h: number, grime = 0): void {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = y * 16 + x;
    this.lv[i] = lv;
    this.h[i] = h;
    this.grime[i] = grime;
    this.hole[i] = 0;
  }

  cut(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) this.hole[y * 16 + x] = 1;
  }
}

/** Colorea un relieve con la paleta de una fase (0..3). */
export function paint(t: Tex, d: Relief, stage: number, seed: string): void {
  const r = new Rng('copper_patina/' + seed);
  const noise = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (d.hole[i]) {
      t.alpha[i] = 0;
      continue;
    }
    t.alpha[i] = 255;
    t.height[i] = d.h[i];
    if (d.glow[i]) {
      t.setI(i, GLOW[d.glow[i] - 1]);
      t.emit[i] = d.glow[i] === 1 ? 255 : 220;
      t.smooth[i] = 180;
      t.f0[i] = 20;
      continue;
    }
    const p = 0.65 * noise.at(x, y) + 0.35 * px[i] + 0.3 * d.grime[i];
    let pal = PALS[stage];
    let lv = d.lv[i];
    if (stage === 0 && d.grime[i] > 0.5) lv += 0.25;
    else if (stage === 1 && p > 0.78) pal = PALS[2];
    else if (stage === 2) pal = p < 0.3 ? PALS[1] : p > 0.9 ? PALS[3] : PALS[2];
    else if (stage === 3 && p > 0.95) lv -= 0.45;
    t.setI(i, rampAt(pal, lv));
    t.smooth[i] = clamp(pal.smooth + d.shine[i] - d.grime[i] * 30, 10, 240);
    t.f0[i] = pal.f0;
  }
  t.depth = d.depth;
}

// ---------------------------------------------------------------------------
// Dibujos
// ---------------------------------------------------------------------------

/** Bisel de dos anillos en el recuadro [x0, x1] × [y0, y1]: arriba e izquierda claros, abajo y derecha oscuros. */
export function bevel(d: Relief, x0: number, y0: number, x1: number, y1: number, rings = 2): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      if (ring >= rings) continue;
      const top = y - y0 === ring || x - x0 === ring;
      const bot = y1 - y === ring || x1 - x === ring;
      if (ring === 0) d.set(x, y, top && bot ? 1 : top ? 0.1 : 2.9, 0.55, 0.6);
      else d.set(x, y, top && bot ? 1 : top ? 0.55 : bot ? 1.6 : 1, 0.85, 0.2);
    }
  }
}

/** Relleno cepillado con algún arañazo y un reflejo en diagonal (bloque de cobre). */
export function brushed(d: Relief, r: Rng, x0: number, y0: number, x1: number, y1: number, diagonal: boolean): void {
  const brush = new Noise(r, 2, 16);
  const n4 = new Noise(r, 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let lv = 1 + 0.2 * (brush.at(x, y) - 0.5) + 0.2 * (n4.at(x, y) - 0.5);
      if (diagonal) {
        const dg = x + y;
        if (dg >= 7 && dg <= 9) lv -= 0.35;
        else if (dg === 10) lv -= 0.15;
      }
      d.set(x, y, lv, 1);
      d.shine[y * 16 + x] = 16 * (brush.at(x, y) - 0.5);
    }
  }
}

function scratches(d: Relief, r: Rng, n: number): void {
  const dirs: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [1, -1], [0, 1]];
  for (let k = 0; k < n; k++) {
    let x = r.int(3, 12), y = r.int(3, 12);
    const [dx, dy] = r.pick(dirs);
    const len = r.int(2, 4);
    const light = r.chance(0.6);
    for (let s = 0; s < len; s++) {
      if (x < 2 || y < 2 || x > 13 || y > 13) break;
      const i = y * 16 + x;
      d.lv[i] += light ? -0.35 : 0.35;
      d.shine[i] = -25;
      x += dx;
      y += dy;
    }
  }
}

function rivet(d: Relief, x: number, y: number): void {
  d.set(x, y, 0, 1.1);
  d.set(x + 1, y, 1.3, 1);
  d.set(x, y + 1, 1.3, 1);
  d.set(x + 1, y + 1, 2.2, 0.8, 0.4);
}

/** Bloque de cobre: chapa pulida con bisel, como el de siempre. */
function block(): Relief {
  const d = new Relief();
  const r = new Rng('copper_design/block');
  brushed(d, r, 0, 0, 15, 15, true);
  bevel(d, 0, 0, 15, 15);
  scratches(d, r, 5);
  d.depth = 1.3;
  return d;
}

/** Cobre cortado: cuatro placas de 8×8 con su bisel. */
function cut(): Relief {
  const d = new Relief();
  const r = new Rng('copper_design/cut');
  for (const [x0, y0] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
    brushed(d, r, x0, y0, x0 + 7, y0 + 7, false);
    bevel(d, x0, y0, x0 + 7, y0 + 7, 1);
  }
  scratches(d, r, 3);
  return d;
}

/** Cobre grabado: marco biselado y cuadrados concéntricos grabados, con remaches en las esquinas. */
function chiseled(): Relief {
  const d = new Relief();
  const r = new Rng('copper_design/chiseled');
  brushed(d, r, 0, 0, 15, 15, false);
  bevel(d, 0, 0, 15, 15);
  for (let y = 2; y <= 13; y++) {
    for (let x = 2; x <= 13; x++) {
      const ring = Math.min(x - 2, y - 2, 13 - x, 13 - y);
      const topLeft = x - 2 === ring || y - 2 === ring;
      if (ring === 1) d.set(x, y, topLeft ? 2.6 : 2.3, 0.35, 1); // surco exterior
      else if (ring === 2) d.set(x, y, topLeft ? 1.5 : 0.4, 0.6, 0.3); // labio (luz abajo a la derecha: está hundido)
      else if (ring === 4) d.set(x, y, 2.5, 0.4, 1); // surco interior
      else if (ring >= 5) d.set(x, y, 0.3, 1.05); // botón central
    }
  }
  for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) {
    d.set(x, y, 0.2, 1);
    d.set(x + 1, y + 1, 2, 0.8, 0.5);
  }
  return d;
}

/** Rejilla: marco fino y una malla de agujeros de 2×2. */
function grate(): Relief {
  const d = new Relief();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const hx = (x & 3) === 1 || (x & 3) === 2, hy = (y & 3) === 1 || (y & 3) === 2;
      if (hx && hy) {
        d.cut(x, y);
        continue;
      }
      // Barrotes: la cara de arriba/izquierda de cada barrote, clara; la de abajo/derecha, oscura.
      const lx = (x & 3) === 3 ? 0.4 : (x & 3) === 0 ? 1.6 : 1;
      const ly = (y & 3) === 3 ? 0.4 : (y & 3) === 0 ? 1.6 : 1;
      const lv = hx ? ly : hy ? lx : (lx + ly) / 2;
      d.set(x, y, lv, hx || hy ? 0.8 : 1, hx || hy ? 0.3 : 0.1);
    }
  }
  return d;
}

/** Puerta: largueros de 2 px, ventanas arriba y un panel con remaches abajo (con el tirador). */
function door(top: boolean): Relief {
  const d = new Relief();
  const r = new Rng('copper_design/door');
  brushed(d, r, 0, 0, 15, 15, false);
  bevel(d, 0, top ? 0 : -2, 15, top ? 17 : 15);
  if (top) {
    // Cuatro ventanas de 4×4 con su junquillo.
    for (const [x0, y0] of [[3, 3], [9, 3], [3, 9], [9, 9]]) {
      for (let y = y0 - 1; y <= y0 + 4; y++) {
        for (let x = x0 - 1; x <= x0 + 4; x++) {
          if (x >= x0 && x < x0 + 4 && y >= y0 && y < y0 + 4) d.cut(x, y);
          else d.set(x, y, x < x0 || y < y0 ? 2.4 : 0.5, 0.7, 0.5);
        }
      }
    }
  } else {
    bevel(d, 3, 2, 12, 12, 1);
    for (let y = 3; y <= 11; y++) for (let x = 4; x <= 11; x++) d.set(x, y, 0.8 + 0.2 * ((x + y) & 1), 1.05);
    for (const [x, y] of [[4, 3], [10, 3], [4, 10], [10, 10]]) rivet(d, x, y);
    // Tirador.
    d.set(12, 0, 3, 0.9, 0.3);
    d.set(13, 0, 2.2, 1.2);
    d.set(13, 1, 2.6, 1.2);
    d.set(12, 1, 3, 0.9, 0.3);
  }
  return d;
}

/** Trampilla: marco de 2 px, cruz en medio y cuatro huecos. */
function trapdoor(): Relief {
  const d = new Relief();
  const r = new Rng('copper_design/trapdoor');
  brushed(d, r, 0, 0, 15, 15, false);
  bevel(d, 0, 0, 15, 15);
  for (let y = 2; y <= 13; y++) {
    for (let x = 2; x <= 13; x++) {
      const barX = x === 7 || x === 8, barY = y === 7 || y === 8;
      if (!barX && !barY) d.cut(x, y);
      else d.set(x, y, barX && barY ? 1 : barX ? (x === 7 ? 0.5 : 1.7) : y === 7 ? 0.5 : 1.7, 0.9, 0.2);
    }
  }
  for (const [x, y] of [[1, 1], [13, 1], [1, 13], [13, 13]]) rivet(d, x, y);
  return d;
}

/** Barras: barrotes verticales de 2 px (el del centro es el poste). */
function bars(): Relief {
  const d = new Relief();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = (x + 1) & 3; // 0..1 barrote, 2..3 hueco
      if (c >= 2 && !(y === 0 || y === 15)) {
        d.cut(x, y);
        continue;
      }
      const lv = y === 0 ? 0.3 : y === 15 ? 2.4 : c === 0 ? 0.5 : 1.7;
      d.set(x, y, lv + ((y & 3) === 0 ? 0.25 : 0), 1, (y & 3) === 0 ? 0.4 : 0.1);
    }
  }
  return d;
}

/**
 * Cadena: eslabones de 4 px (de frente, un anillo; de canto, una barra) en una cruz: vertical en las
 * columnas 6..9 y horizontal en las filas 6..9. Los planos del modelo sólo muestran su brazo, y en
 * el cruce los dos coinciden (un anillo).
 */
function chain(): Relief {
  const d = new Relief();
  d.hole.fill(1);
  // along: posición a lo largo de la cadena; across: 0..3 a lo ancho.
  const link = (along: number, across: number): number => {
    const seg = Math.floor(((along + 2) & 15) / 4), k = (along + 2) & 3;
    if (seg % 2 === 0) {
      // De frente: anillo de 4×4 con el hueco de 2×2 en medio.
      if ((k === 1 || k === 2) && (across === 1 || across === 2)) return -1;
      return k === 0 || across === 0 ? 0.4 : k === 3 || across === 3 ? 2.2 : 1;
    }
    // De canto: barra de 2 px.
    if (across === 0 || across === 3) return -1;
    return across === 1 ? 0.6 : 1.8;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 6; x <= 9; x++) {
      const lv = link(y, x - 6);
      if (lv >= 0) d.set(x, y, lv, 1, lv > 1.5 ? 0.5 : 0);
    }
  }
  for (let x = 0; x < 16; x++) {
    for (let y = 6; y <= 9; y++) {
      const lv = link(x, y - 6);
      if (lv >= 0) d.set(x, y, lv, 1, lv > 1.5 ? 0.5 : 0);
    }
  }
  return d;
}

/**
 * Farol, dibujado donde lo muestran sus cajas: cadena o asa en las columnas 7..8 (filas 0..6), tapa
 * en las columnas 6..9 (filas 6..8) y el cuerpo en las columnas 5..10 (filas 8..15), con el cristal
 * encendido en medio.
 */
function lantern(): Relief {
  const d = new Relief();
  d.hole.fill(1);
  for (let y = 0; y <= 6; y++) {
    const edge = (y & 1) === 0;
    d.set(7, y, edge ? 0.6 : 1.4, 1, 0.3);
    d.set(8, y, edge ? 1.4 : 2.4, 1, 0.3);
  }
  for (let y = 6; y <= 8; y++) for (let x = 6; x <= 9; x++) d.set(x, y, y === 6 ? 0.3 : x === 9 ? 2 : 1, 1, 0.2);
  for (let y = 8; y <= 15; y++) {
    for (let x = 5; x <= 10; x++) {
      const frame = x === 5 || x === 10 || y <= 9 || y === 15;
      if (frame) d.set(x, y, y === 8 ? 0.2 : y === 15 ? 2.6 : x === 10 ? 2.1 : x === 5 ? 0.6 : 1, 1, 0.4);
      else {
        d.set(x, y, 1, 0.9);
        d.glow[y * 16 + x] = (x === 7 || x === 8) && y >= 11 && y <= 13 ? 1 : y === 14 ? 3 : 2;
      }
    }
  }
  d.depth = 0.8;
  return d;
}

/** Bloque de cobre en bruto: grumos de mineral con grietas oscuras y alguna mota de verdín. */
function rawBlock(t: Tex): void {
  const r = t.rng();
  const lumps = new Noise(r, 4);
  const fine = pixelNoise(r);
  const d = new Relief();
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = lumps.at(x, y) * 0.7 + fine[i] * 0.3;
    const crack = v < 0.3;
    d.set(x, y, crack ? 2.8 : v > 0.72 ? 0.3 : 1 + (0.5 - v) * 1.2, crack ? 0.3 : 0.6 + v * 0.5, crack ? 0.8 : 0);
  }
  paint(t, d, 0, 'raw_copper_block');
  for (let i = 0; i < N; i++) {
    t.smooth[i] = 90 + 40 * fine[i];
    t.f0[i] = 150;
    if (d.grime[i] > 0.5 && fine[i] > 0.8) {
      t.setI(i, [96, 150, 118]);
      t.f0[i] = 20;
    }
  }
}

/** Antorcha de cobre: el palo con una abrazadera de cobre y la llama verde (como la antorcha normal). */
function torch(t: Tex): void {
  t.alpha.fill(0);
  t.smooth.fill(45);
  for (let y = 8; y <= 15; y++) {
    const k = (15 - y) / 7;
    const c: RGB = [lerp(92, 146, k), lerp(64, 108, k), lerp(36, 64, k)];
    t.paint(7, y, [c[0] * 1.06, c[1] * 1.06, c[2] * 1.06], 1, 45);
    t.paint(8, y, [c[0] * 0.88, c[1] * 0.88, c[2] * 0.88], 1, 45);
  }
  // Abrazadera de cobre bajo la llama.
  t.paint(7, 8, PALS[0].ramp[0], 1, 190);
  t.paint(8, 8, PALS[0].ramp[2], 1, 190);
  t.f0[8 * 16 + 7] = t.f0[8 * 16 + 8] = 234;
  // Llama verde: núcleo casi blanco, emisión máxima.
  t.paint(7, 6, [226, 255, 236], 1, 0, 0, 255);
  t.paint(8, 6, [170, 255, 204], 1, 0, 0, 255);
  t.paint(7, 7, [118, 238, 160], 1, 0, 0, 255);
  t.paint(8, 7, [76, 206, 128], 1, 0, 0, 255);
}

// ---------------------------------------------------------------------------
// Registro: cuatro fases por dibujo
// ---------------------------------------------------------------------------

const PREFIX = ['', 'exposed_', 'weathered_', 'oxidized_'];

/** Nombre de la textura de un dibujo en una fase (el bloque de cobre normal conserva su nombre). */
function texName(base: string, stage: number): string {
  if (base === 'copper_block') return stage === 0 ? 'copper_block' : `${PREFIX[stage]}copper`;
  return PREFIX[stage] + base;
}

const DESIGNS: Record<string, () => Relief> = {
  copper_block: block,
  cut_copper: cut,
  chiseled_copper: chiseled,
  copper_grate: grate,
  copper_door_top: () => door(true),
  copper_door_bottom: () => door(false),
  copper_trapdoor: trapdoor,
  copper_bars: bars,
  copper_chain: chain,
  copper_lantern: lantern,
};

export const COPPER_GENERATORS: Record<string, Generator> = { raw_copper_block: rawBlock, copper_torch: torch };
for (const [base, design] of Object.entries(DESIGNS)) {
  let relief: Relief | null = null;
  for (let stage = 0; stage < 4; stage++) {
    COPPER_GENERATORS[texName(base, stage)] = (t) => paint(t, (relief ??= design()), stage, base);
  }
}
