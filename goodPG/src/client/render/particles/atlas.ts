// Atlas procedural de las partículas: 8×8 celdas de 64 px (512×512), con alfa premultiplicado para
// que las mipmaps no dejen bordes oscuros. Todo se dibuja por código (nada de imágenes externas):
// humo con ruido fractal, brillos gaussianos, estrellas, corazones, llamas animadas, gotas, burbujas,
// pétalos, hojas, copos, salpicaduras y anillos. Los sprites grises se tiñen en el sombreador.

export const CELL = 64;
export const GRID = 8;
export const ATLAS = CELL * GRID;

/** Índice de cada sprite en el atlas. */
export const SPRITE = {
  smoke: 0, // 0..3: cuatro nubecillas distintas
  glow: 4,
  star: 5,
  twinkle: 6,
  heart: 7,
  flame: 8, // 8..11: cuatro fotogramas
  drop: 12,
  bubble: 13,
  petal: 14, // 14..15
  leaf: 16, // 16..19
  snow: 20,
  splash: 21,
  ring: 22,
  dust: 23,
  streak: 24,
  note: 25,
  cloud: 26, // nube de enfado (aldeano que dice que no)
  spark: 27,
  glyph: 40, // 40..47: Fase 7 (encantamientos), runas que vuelan de las librerías a la mesa
} as const;

type RGBA = [number, number, number, number];
type Shader = (u: number, v: number) => RGBA;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, s: number, oct = 4): number {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, y * f, s + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

// ------------------------------------------------------------------ sprites (u, v ∈ [-1, 1], v hacia arriba)

function smoke(seed: number): Shader {
  return (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 2.2 + 10, v * 2.2 + 10, seed, 5);
    // Borde irregular y densidad que cae hacia fuera.
    const edge = 0.62 + (n - 0.5) * 0.55;
    const a = smooth(edge, edge - 0.45, r) * (0.55 + 0.45 * n);
    // Algo de volumen: más claro arriba a la izquierda.
    const shade = 0.78 + 0.22 * clamp01(0.5 - (u - v) * 0.35) + (n - 0.5) * 0.2;
    return [shade, shade, shade, a];
  };
}

const glow: Shader = (u, v) => {
  const r2 = u * u + v * v;
  const a = Math.exp(-r2 * 5) * (1 - smooth(0.85, 1, Math.sqrt(r2)));
  return [1, 1, 1, a];
};

const star: Shader = (u, v) => {
  const au = Math.abs(u), av = Math.abs(v);
  // Cuatro puntas finas y un núcleo brillante.
  const rays = Math.max(Math.exp(-au * 18) * (1 - av), Math.exp(-av * 18) * (1 - au));
  const core = Math.exp(-(u * u + v * v) * 14);
  const a = clamp01(rays * 1.2 + core);
  return [1, 1, 1, a];
};

const twinkle: Shader = (u, v) => {
  const au = Math.abs(u), av = Math.abs(v);
  const cross = Math.max(Math.exp(-au * 26) * smooth(1, 0.2, av), Math.exp(-av * 26) * smooth(1, 0.2, au));
  const d1 = Math.abs(u - v) / Math.SQRT2, d2 = Math.abs(u + v) / Math.SQRT2;
  const diag = Math.max(Math.exp(-d1 * 30), Math.exp(-d2 * 30)) * smooth(0.7, 0.1, Math.hypot(u, v)) * 0.6;
  const core = Math.exp(-(u * u + v * v) * 22);
  return [1, 1, 1, clamp01(cross + diag + core)];
};

const heart: Shader = (u, v) => {
  // Curva del corazón ((x² + y² − 1)³ − x²y³ ≤ 0), con contorno oscuro y brillo arriba.
  const x = u * 1.25, y = v * 1.25 + 0.15;
  const f = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
  const inside = smooth(0.02, -0.02, f);
  const outline = smooth(-0.02, -0.12, f);
  const hl = Math.exp(-((u + 0.35) ** 2 + (v - 0.3) ** 2) * 18);
  const base: [number, number, number] = [0.95, 0.12, 0.2];
  const k = outline;
  const rgb = [base[0] * (0.35 + 0.65 * k) + hl * 0.6, base[1] * (0.35 + 0.65 * k) + hl * 0.5, base[2] * (0.35 + 0.65 * k) + hl * 0.5];
  return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2]), inside];
};

function flame(frame: number): Shader {
  return (u, v) => {
    const t = frame * 0.9;
    // Lágrima que se estrecha hacia arriba, con lenguas de ruido que suben.
    const y = (v + 1) / 2;
    const width = 0.55 * Math.pow(1 - y, 0.7) * (0.8 + 0.2 * Math.sin(y * 9 + t * 2));
    const n = fbm(u * 3 + t, v * 2.5 - t * 1.8, 77, 4);
    const dx = Math.abs(u + (n - 0.5) * 0.35 * y);
    const body = smooth(width + 0.08, width - 0.12, dx) * smooth(-1, -0.75, v) * smooth(1, 0.35 + n * 0.3, v);
    const core = smooth(width * 0.6, 0, dx) * smooth(0.5, -0.4, v);
    const a = clamp01(body * (0.75 + n * 0.5));
    // Blanco amarillento en el centro, naranja y rojo hacia fuera.
    const heat = clamp01(core * 1.2 + (1 - y) * 0.3);
    const r = 1, g = clamp01(0.35 + heat * 0.65), b = clamp01(0.08 + heat * heat * 0.7);
    return [r, g, b, a];
  };
}

const drop: Shader = (u, v) => {
  // Gota: círculo abajo y punta arriba; brillo a un lado.
  const y = v + 0.25;
  const r = Math.hypot(u, y);
  const tip = smooth(0.02, -0.04, Math.abs(u) - Math.max(0, (0.75 - y) * 0.42)) * smooth(0.95, 0.6, y) * (y > 0 ? 1 : 0);
  const a = Math.max(smooth(0.52, 0.46, r), tip);
  const hl = Math.exp(-((u + 0.18) ** 2 + (y - 0.1) ** 2) * 40);
  const s = 0.75 + 0.25 * clamp01(0.5 - u) + hl * 0.5;
  return [clamp01(s), clamp01(s), clamp01(s), a];
};

const bubble: Shader = (u, v) => {
  const r = Math.hypot(u, v);
  const ring = smooth(0.1, 0, Math.abs(r - 0.7)) * 0.9 + smooth(0.7, 0, r) * 0.12;
  const hl = Math.exp(-((u + 0.3) ** 2 + (v - 0.3) ** 2) * 30);
  return [1, 1, 1, clamp01(ring + hl * 0.9)];
};

function petal(variant: number): Shader {
  return (u, v) => {
    // Pétalo redondeado con una muesca en la punta (como el de cerezo), en rosa.
    const x = u * (variant ? 1.1 : 1), y = v * 1.05 - 0.05;
    const body = (x * x) / 0.42 + (y * y) / 0.8;
    const notch = Math.hypot(x, y - 0.85) < 0.22 ? 1 : 0;
    const a = smooth(1.02, 0.9, body) * (1 - notch);
    const vein = Math.exp(-x * x * 90) * smooth(-0.9, 0.5, y) * 0.18;
    const edge = smooth(0.6, 1, body);
    const n = fbm(u * 3, v * 3, 91 + variant, 3);
    const r = 0.97 - edge * 0.08 - vein * 0.4;
    const g = 0.56 - edge * 0.14 - vein + (n - 0.5) * 0.1 - variant * 0.05;
    const b = 0.72 - edge * 0.1 - vein * 0.6;
    return [clamp01(r), clamp01(g), clamp01(b), a];
  };
}

function leaf(variant: number): Shader {
  return (u, v) => {
    // Hoja lanceolada u ovalada (según la variante), con nervio central y laterales; gris para teñir.
    const rot = [0.3, -0.5, 0.9, -0.1][variant];
    const c = Math.cos(rot), s = Math.sin(rot);
    const x = u * c - v * s, y = u * s + v * c;
    const len = [0.95, 0.85, 0.9, 0.8][variant], wid = [0.42, 0.5, 0.34, 0.55][variant];
    const t = clamp01((y + len) / (2 * len));
    const halfW = wid * Math.sin(Math.PI * Math.pow(t, 0.8));
    const a = smooth(0.03, -0.03, Math.abs(x) - halfW) * (y > -len && y < len ? 1 : 0);
    const stem = Math.exp(-x * x * 400) * 0.5;
    const side = Math.exp(-(((Math.abs(x) * 1.6 - (y - 0.1) * 0.8) % 0.35) ** 2) * 900) * smooth(halfW, 0, Math.abs(x)) * 0.25;
    const n = fbm(u * 4, v * 4, 131 + variant, 3);
    const shade = 0.82 + (n - 0.5) * 0.25 - stem * 0.5 - side * 0.5 + (x > 0 ? -0.06 : 0.04);
    return [clamp01(shade), clamp01(shade), clamp01(shade), a];
  };
}

const snow: Shader = (u, v) => {
  const r = Math.hypot(u, v);
  const ang = Math.atan2(v, u);
  const sector = Math.PI / 3;
  const m = ((((ang + sector / 2) % sector) + sector) % sector) - sector / 2;
  const arm = Math.exp(-(m * m) * r * r * 120) * smooth(0.95, 0.5, r);
  const core = smooth(0.25, 0.05, r);
  return [1, 1, 1, clamp01(arm + core)];
};

const splash: Shader = (u, v) => {
  // Racimo de gotitas.
  let a = 0;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.3;
    const d = i === 0 ? 0 : 0.35 + hash(i, 3, 5) * 0.35;
    const cx = Math.cos(ang) * d, cy = Math.sin(ang) * d * 0.8 + 0.1;
    const rr = i === 0 ? 0.22 : 0.12 + hash(i, 7, 9) * 0.08;
    a = Math.max(a, smooth(rr, rr * 0.6, Math.hypot(u - cx, v - cy)));
  }
  return [1, 1, 1, a];
};

const ring: Shader = (u, v) => {
  const r = Math.hypot(u, v);
  return [1, 1, 1, smooth(0.12, 0, Math.abs(r - 0.8)) * 0.9];
};

const dust: Shader = (u, v) => {
  const r = Math.hypot(u, v);
  return [1, 1, 1, smooth(0.9, 0.2, r) * 0.8];
};

const streak: Shader = (u, v) => {
  // Trazo horizontal (chispas estiradas en la dirección de su velocidad).
  const a = Math.exp(-v * v * 30) * smooth(1, 0.2, Math.abs(u)) * (0.6 + 0.4 * clamp01(0.5 - u * 0.5));
  return [1, 1, 1, a];
};

const note: Shader = (u, v) => {
  // Corchea (por si algún día hay bloques musicales).
  const head = smooth(0.24, 0.18, Math.hypot((u + 0.15) * 1.3, v + 0.45));
  const stem = Math.abs(u - 0.12) < 0.06 && v > -0.45 && v < 0.6 ? 1 : 0;
  const flag = u > 0.12 && u < 0.45 && v > 0.3 && v < 0.6 && v - 0.3 > (u - 0.12) * 0.6 ? 1 : 0;
  return [1, 1, 1, Math.max(head, stem, flag)];
};

const cloud: Shader = (u, v) => {
  // Nube oscura de tormenta con un rayito (enfado).
  const n = fbm(u * 2 + 3, v * 2 + 3, 211, 4);
  const blob = smooth(0.75, 0.55, Math.hypot(u * 0.8, (v - 0.15) * 1.3) - (n - 0.5) * 0.25);
  const bolt = Math.abs(u - (v < -0.3 ? -0.1 : 0.05) - (v + 0.3) * -0.4) < 0.07 && v < 0 && v > -0.85 ? 1 : 0;
  const g = bolt ? 1 : 0.28 + n * 0.12;
  return [g, g, bolt ? 0.4 : g * 1.05, Math.max(blob, bolt)];
};

const spark: Shader = (u, v) => {
  const r2 = u * u + v * v;
  return [1, 1, 1, clamp01(Math.exp(-r2 * 22) * 1.3)];
};

// ------------------------------------------------------------------ montaje

const SHADERS: [number, Shader][] = [
  [SPRITE.smoke, smoke(11)], [SPRITE.smoke + 1, smoke(23)], [SPRITE.smoke + 2, smoke(37)], [SPRITE.smoke + 3, smoke(51)],
  [SPRITE.glow, glow], [SPRITE.star, star], [SPRITE.twinkle, twinkle], [SPRITE.heart, heart],
  [SPRITE.flame, flame(0)], [SPRITE.flame + 1, flame(1)], [SPRITE.flame + 2, flame(2)], [SPRITE.flame + 3, flame(3)],
  [SPRITE.drop, drop], [SPRITE.bubble, bubble], [SPRITE.petal, petal(0)], [SPRITE.petal + 1, petal(1)],
  [SPRITE.leaf, leaf(0)], [SPRITE.leaf + 1, leaf(1)], [SPRITE.leaf + 2, leaf(2)], [SPRITE.leaf + 3, leaf(3)],
  [SPRITE.snow, snow], [SPRITE.splash, splash], [SPRITE.ring, ring], [SPRITE.dust, dust], [SPRITE.streak, streak],
  [SPRITE.note, note], [SPRITE.cloud, cloud], [SPRITE.spark, spark],
];

// Fase 7 (encantamientos): ocho runas (trazos de 5×7 celdas con los bordes suaves y un halo).
const GLYPH_BITS: readonly (readonly number[])[] = [
  [0b11111, 0b00100, 0b00100, 0b01110, 0b00100, 0b00100, 0b00100],
  [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  [0b01110, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  [0b10101, 0b10101, 0b10101, 0b01110, 0b00100, 0b00100, 0b00100],
  [0b00100, 0b01010, 0b10001, 0b00000, 0b10001, 0b01010, 0b00100],
  [0b11100, 0b00100, 0b00100, 0b00111, 0b00100, 0b00100, 0b11100],
  [0b10000, 0b10000, 0b11111, 0b00001, 0b00001, 0b00001, 0b00001],
  [0b00001, 0b00010, 0b00100, 0b11111, 0b00100, 0b01000, 0b10000],
];

function glyph(bits: readonly number[]): Shader {
  return (u, v) => {
    // La runa ocupa el centro (5×7 celdas en [-0.62, 0.62] × [-0.86, 0.86]).
    const gx = (u + 0.62) / 0.248, gy = (0.86 - v) / 0.2457;
    let a = 0;
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        if (!(bits[y] & (1 << (4 - x)))) continue;
        const dx = Math.max(0, Math.abs(gx - (x + 0.5)) - 0.38), dy = Math.max(0, Math.abs(gy - (y + 0.5)) - 0.38);
        a = Math.max(a, smooth(0.35, 0, Math.hypot(dx, dy)), 0.35 * smooth(1.4, 0, Math.hypot(dx, dy)));
      }
    }
    return [1, 1, 1, a];
  };
}

GLYPH_BITS.forEach((bits, i) => SHADERS.push([SPRITE.glyph + i, glyph(bits)]));

/** RGBA de 512×512 con alfa premultiplicado. */
export function generateParticleAtlas(): Uint8Array {
  const out = new Uint8Array(ATLAS * ATLAS * 4);
  for (const [index, sh] of SHADERS) {
    const cx = (index % GRID) * CELL, cy = Math.floor(index / GRID) * CELL;
    for (let j = 0; j < CELL; j++) {
      for (let i = 0; i < CELL; i++) {
        // Supermuestreo 2×2 para bordes suaves; un margen de 2 px evita que se mezclen las celdas.
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const u = ((i + 0.25 + sx * 0.5) / CELL) * 2 - 1, v = 1 - ((j + 0.25 + sy * 0.5) / CELL) * 2;
            const k = 1.08; // margen
            const [cr, cg, cb, ca] = sh(u * k, v * k);
            const aa = clamp01(ca);
            r += cr * aa;
            g += cg * aa;
            b += cb * aa;
            a += aa;
          }
        }
        const o = ((cy + j) * ATLAS + cx + i) * 4;
        out[o] = Math.round(clamp01(r / 4) * 255);
        out[o + 1] = Math.round(clamp01(g / 4) * 255);
        out[o + 2] = Math.round(clamp01(b / 4) * 255);
        out[o + 3] = Math.round(clamp01(a / 4) * 255);
      }
    }
  }
  return out;
}
