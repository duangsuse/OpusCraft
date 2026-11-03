// Generadores de plantas: plantas en cruz (ancladas a la fila inferior y centradas
// porque se dibujan sobre dos quads diagonales) y cactus.

import { Tex, clamp, gray, idx, lerp, mix, scale, stamp, type Generator, type RGB } from './texCore';

/** Tinta de sprite: color y canales opcionales. */
export interface Ink {
  c: RGB;
  h?: number;
  smooth?: number;
  sss?: number;
  emit?: number;
  f0?: number;
}

/** Lienzo transparente para recortes que no se repiten (plantas, antorcha). */
export function cutoutCanvas(t: Tex, smooth: number, sss: number): void {
  t.alpha.fill(0);
  t.height.fill(0.5);
  t.fillSpec(smooth, 10, sss, 0);
  t.tiling = false;
  t.clampTransparent = true;
  t.depth = 1;
}

/** Dibuja un sprite en texto con su tabla de tintas. */
export function sprite(t: Tex, rows: readonly string[], inks: Readonly<Record<string, Ink>>, ox = 0, oy = 0): void {
  stamp(rows, ox, oy, (x, y, ch) => {
    const ink = inks[ch];
    if (!ink) throw new Error(`Tinta desconocida '${ch}' en ${t.name}`);
    const i = t.paint(x, y, ink.c, ink.h ?? 1, ink.smooth, ink.sss, ink.emit);
    if (ink.f0 !== undefined) t.f0[i] = ink.f0;
  });
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < 16 && y < 16;
}

// ---------------------------------------------------------------------------
// Hierba corta y helecho (escala de grises: se tintan con el color del bioma)
// ---------------------------------------------------------------------------

function shortGrass(t: Tex): void {
  cutoutCanvas(t, 62, 230);
  const r = t.rng();
  interface Blade {
    x0: number;
    len: number;
    lean: number;
    base: number;
    tip: number;
  }
  const blades: Blade[] = [];
  for (let x0 = 3; x0 <= 12; x0++) {
    if (r.chance(0.18)) continue;
    const center = 1 - Math.abs(x0 - 7.5) / 6;
    blades.push({
      x0,
      len: Math.round(lerp(5, 13, center * 0.7 + r.next() * 0.3)),
      lean: (x0 - 7.5) * 0.45 + r.range(-1.4, 1.4),
      base: r.range(118, 146),
      tip: r.range(188, 226),
    });
  }
  // Las briznas más oscuras detrás, las claras delante.
  blades.sort((a, b) => a.tip - b.tip);
  for (const b of blades) {
    for (let s = 0; s < b.len; s++) {
      const p = s / Math.max(1, b.len - 1);
      const y = 15 - s;
      const x = Math.round(b.x0 + b.lean * Math.pow(p, 1.6));
      if (!inBounds(x, y)) continue;
      t.paint(x, y, gray(lerp(b.base, b.tip, p)), 0.7 + 0.3 * p);
      if (s < 2 && Math.abs(b.lean) > 1) {
        const x2 = x + (b.lean > 0 ? 1 : -1);
        if (inBounds(x2, y)) t.paint(x2, y, gray(b.base * 0.95), 0.65);
      }
    }
  }
}

function fern(t: Tex): void {
  cutoutCanvas(t, 60, 230);
  // Frondes como curvas de Bézier cuadráticas (base → control → punta) que se abren
  // en abanico y caen un poco al final; pinnas a ambos lados inclinadas hacia la punta.
  const fronds: readonly (readonly [number, number, number, number, number, number])[] = [
    [7.3, 15.5, 2.5, 8.5, 0.4, 10.5],
    [7.5, 15.5, 4.5, 3.5, 3.2, 1.2],
    [8.5, 15.5, 10.5, 2.5, 12.2, 0.6],
    [8.7, 15.5, 13.5, 7.5, 15.6, 9.5],
  ];
  for (const [x0, y0, cx, cy, x1, y1] of fronds) {
    let last = -1;
    let n = 0;
    for (let s = 0; s <= 48; s++) {
      const p = s / 48;
      const q = 1 - p;
      const bx = q * q * x0 + 2 * q * p * cx + p * p * x1;
      const by = q * q * y0 + 2 * q * p * cy + p * p * y1;
      const x = Math.floor(bx);
      const y = Math.floor(by);
      if (!inBounds(x, y) || y * 16 + x === last) continue;
      last = y * 16 + x;
      n++;
      t.paint(x, y, gray(lerp(134, 160, p)), 0.85);
      if (n % 2 !== 0 || p < 0.14 || p > 0.93) continue;
      let tx = 2 * q * (cx - x0) + 2 * p * (x1 - cx);
      let ty = 2 * q * (cy - y0) + 2 * p * (y1 - cy);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const len = p < 0.62 ? 2 : 1;
      for (const side of [-1, 1]) {
        let dx = -ty * side + tx * 0.8;
        let dy = tx * side + ty * 0.8;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl;
        dy /= dl;
        for (let k = 1; k <= len; k++) {
          const lx = Math.floor(bx + dx * k);
          const ly = Math.floor(by + dy * k);
          if (!inBounds(lx, ly) || t.isOpaque(lx, ly)) continue;
          t.paint(lx, ly, gray(lerp(210, 184, k / 2) - (side > 0 ? 14 : 0)), 0.95);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Flores
// ---------------------------------------------------------------------------

const STEM: Record<string, Ink> = {
  g: { c: [92, 146, 56], h: 0.8 },
  G: { c: [66, 112, 40], h: 0.75 },
  l: { c: [98, 158, 62], h: 0.85 },
  L: { c: [70, 122, 44], h: 0.8 },
};

function poppy(t: Tex): void {
  cutoutCanvas(t, 70, 210);
  sprite(
    t,
    [
      '................',
      '................',
      '................',
      '......p..r......',
      '.....ppr.rR.....',
      '....pprkKrrR....',
      '....prrkkrrR....',
      '....rrrrrrrR....',
      '.....rrrrrR.....',
      '......RrrR......',
      '.......gG.......',
      '.......gG..l....',
      '...l...gG.lL....',
      '...Ll..gGlL.....',
      '....LllgG.......',
      '.......gG.......',
    ],
    {
      ...STEM,
      p: { c: [232, 80, 62], h: 1 },
      r: { c: [198, 40, 34], h: 0.95 },
      R: { c: [140, 24, 22], h: 0.9 },
      k: { c: [44, 38, 30], h: 0.7, smooth: 40 },
      K: { c: [74, 76, 40], h: 0.75, smooth: 40 },
    },
  );
}

function dandelion(t: Tex): void {
  cutoutCanvas(t, 60, 210);
  sprite(
    t,
    [
      '................',
      '................',
      '................',
      '................',
      '......yYYy......',
      '.....yYWYYy.....',
      '.....YWYYWY.....',
      '.....yYYYYo.....',
      '......oYYo......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '..l....gG....l..',
      '..Ll...gG...lL..',
      '...LllggGGllL...',
      '....LllgGllL....',
    ],
    {
      ...STEM,
      y: { c: [230, 186, 38], h: 0.95 },
      Y: { c: [246, 212, 58], h: 1 },
      W: { c: [255, 240, 132], h: 1 },
      o: { c: [204, 148, 26], h: 0.9 },
    },
  );
}

function cornflower(t: Tex): void {
  cutoutCanvas(t, 60, 210);
  sprite(
    t,
    [
      '................',
      '................',
      '................',
      '.....b....b.....',
      '....bB.bb.Bb....',
      '.....BBbbBB.....',
      '...bBBkKKkBBb...',
      '....bBBkkBBb....',
      '.....bBgGBb.....',
      '.......gG.......',
      '.......gG.......',
      '.......gG..l....',
      '....l..gG.l.....',
      '.....l.gGl......',
      '......lgG.......',
      '.......gG.......',
    ],
    {
      ...STEM,
      l: { c: [104, 150, 80], h: 0.85 },
      b: { c: [112, 148, 234], h: 0.95 },
      B: { c: [64, 96, 204], h: 1 },
      k: { c: [52, 44, 120], h: 0.8 },
      K: { c: [88, 62, 152], h: 0.85 },
    },
  );
}

// ---------------------------------------------------------------------------
// Arbusto seco
// ---------------------------------------------------------------------------

function deadBush(t: Tex): void {
  cutoutCanvas(t, 30, 200);
  const r = t.rng();
  const cols: RGB[] = [
    [98, 68, 38],
    [122, 87, 50],
    [140, 104, 62],
    [156, 120, 74],
  ];
  const plot = (x: number, y: number, depth: number): void => {
    if (!inBounds(x, y)) return;
    t.paint(x, y, cols[clamp(depth, 0, 3)], 1 - depth * 0.05);
  };
  const branch = (x: number, y: number, ang: number, len: number, depth: number): void => {
    let fx = x;
    let fy = y;
    for (let s = 0; s < len; s++) {
      fx += Math.sin(ang);
      fy -= Math.cos(ang);
      plot(Math.round(fx), Math.round(fy), depth + (s > len * 0.6 ? 1 : 0));
      if (depth < 2 && len >= 4 && s === Math.floor(len * 0.45)) {
        const side = r.chance(0.5) ? 1 : -1;
        branch(fx, fy, ang + side * r.range(0.55, 0.9), Math.floor(len * 0.55), depth + 1);
      }
    }
    // Horquilla en la punta.
    if (depth < 3) plot(Math.round(fx + Math.sin(ang - 0.8)), Math.round(fy - Math.cos(ang - 0.8)), 3);
  };
  // Tronco corto de 2 px.
  for (let y = 13; y <= 15; y++) {
    plot(7, y, 0);
    plot(8, y, 0);
  }
  const angles = [-1.0, -0.42, 0.12, 0.55, 1.05];
  for (const a of angles) branch(7.5, 12.5, a + r.range(-0.12, 0.12), r.int(7, 10), 0);
}

// ---------------------------------------------------------------------------
// Caña de azúcar
// ---------------------------------------------------------------------------

function sugarCane(t: Tex): void {
  cutoutCanvas(t, 70, 200);
  const stalks = [
    { x: 3, joints: [1, 6, 11] },
    { x: 7, joints: [3, 9, 14] },
    { x: 11, joints: [0, 5, 10] },
  ];
  for (const s of stalks) {
    for (let y = 0; y < 16; y++) {
      const joint = s.joints.includes(y);
      const below = s.joints.includes((y + 15) % 16);
      let a: RGB = [166, 206, 114];
      let b: RGB = [134, 178, 90];
      if (joint) {
        a = [210, 230, 162];
        b = [182, 208, 132];
      } else if (below) {
        a = [118, 162, 78];
        b = [102, 142, 66];
      }
      t.paint(s.x, y, a, joint ? 1 : 0.9, 80);
      t.paint(s.x + 1, y, b, joint ? 0.95 : 0.85, 80);
    }
  }
  // Hojas que brotan de algunos nudos.
  const leaf = (pts: readonly (readonly [number, number])[]): void => {
    pts.forEach(([x, y], k) => t.paint(x, y, k === 0 ? [96, 146, 62] : [120, 170, 78], 0.8, 70, 220));
  };
  leaf([
    [2, 5],
    [1, 4],
    [0, 3],
  ]);
  leaf([
    [9, 8],
    [10, 7],
  ]);
  leaf([
    [6, 13],
    [5, 12],
    [4, 11],
  ]);
  leaf([
    [13, 4],
    [14, 3],
    [15, 2],
  ]);
}

// ---------------------------------------------------------------------------
// Champiñones
// ---------------------------------------------------------------------------

const STALK: Record<string, Ink> = {
  s: { c: [226, 216, 196], h: 0.85, smooth: 40 },
  S: { c: [184, 172, 150], h: 0.8, smooth: 40 },
  u: { c: [214, 196, 170], h: 0.8, smooth: 30 },
  U: { c: [170, 150, 126], h: 0.75, smooth: 30 },
};

function redMushroom(t: Tex): void {
  cutoutCanvas(t, 90, 200);
  sprite(
    t,
    [
      '......hrrR......',
      '.....hrwrrR.....',
      '....hwrrrwrR....',
      '....rrrrwrRR....',
      '.....UuuuuU.....',
      '.......sS.......',
      '.......sS.......',
      '......ssSS......',
    ],
    {
      ...STALK,
      h: { c: [232, 86, 70], h: 1, smooth: 110 },
      r: { c: [196, 38, 32], h: 1, smooth: 100 },
      R: { c: [140, 24, 22], h: 0.95, smooth: 90 },
      w: { c: [240, 234, 224], h: 1.05, smooth: 60 },
    },
    0,
    8,
  );
}

function brownMushroom(t: Tex): void {
  cutoutCanvas(t, 60, 200);
  sprite(
    t,
    [
      '......hbbB......',
      '....hhbbbbBB....',
      '...hbbbbbbbBB...',
      '....UuuuuuuU....',
      '.......sS.......',
      '.......sS.......',
      '......ssSS......',
    ],
    {
      ...STALK,
      h: { c: [184, 146, 112], h: 1 },
      b: { c: [154, 116, 86], h: 1 },
      B: { c: [118, 86, 62], h: 0.95 },
    },
    0,
    9,
  );
}

// ---------------------------------------------------------------------------
// Cactus
// ---------------------------------------------------------------------------

const CACTUS_COLS = 'GrRRrGrRRrGrRRrG';

function cactusSide(t: Tex): void {
  const r = t.rng();
  t.fillSpec(84, 10, 60, 0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const k = CACTUS_COLS[x];
      let c: RGB;
      let h: number;
      if (k === 'G') {
        c = [54, 90, 34];
        h = 0.3;
      } else if (k === 'r') {
        c = r.chance(0.2) ? [70, 112, 42] : [76, 120, 46];
        h = 0.75;
      } else {
        c = r.chance(0.25) ? [106, 154, 66] : [92, 140, 56];
        h = 1;
      }
      const i = idx(x, y);
      t.setI(i, c);
      t.height[i] = h;
    }
  }
  // Espinas en la cresta de cada costilla, escalonadas, con su areola oscura debajo.
  const spines: readonly (readonly [number, number])[] = [
    [2, 2],
    [3, 7],
    [2, 12],
    [7, 4],
    [8, 9],
    [7, 14],
    [12, 1],
    [13, 6],
    [12, 11],
  ];
  for (const [x, y] of spines) {
    let i = idx(x, y);
    t.setI(i, [228, 224, 184]);
    t.height[i] = 1.1;
    t.smooth[i] = 60;
    t.sss[i] = 20;
    i = idx(x, y + 1);
    t.setI(i, [58, 88, 36]);
    t.height[i] = 0.85;
  }
  t.depth = 1.4;
}

function cactusEnd(t: Tex, bottom: boolean): void {
  t.tiling = false;
  t.clampTransparent = true;
  t.fillSpec(bottom ? 60 : 80, 10, bottom ? 50 : 60, 0);
  const k = bottom ? 0.72 : 1;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      if (x === 0 || y === 0 || x === 15 || y === 15) {
        t.alpha[i] = 0;
        continue;
      }
      const ring = Math.min(x - 1, y - 1, 14 - x, 14 - y);
      let c: RGB;
      let h: number;
      if (ring === 0) {
        // Borde: los extremos de las costillas asoman más claros.
        const along = x === 1 || x === 14 ? y : x;
        const crest = CACTUS_COLS[along] === 'R';
        c = crest ? [84, 128, 50] : [56, 92, 34];
        h = crest ? 0.85 : 0.7;
      } else if (ring === 1) {
        c = [88, 132, 52];
        h = 0.9;
      } else if (ring === 3) {
        c = [84, 126, 50];
        h = 0.92;
      } else if (ring >= 6) {
        c = [134, 176, 88];
        h = 1;
      } else {
        c = ring === 5 ? [112, 156, 68] : [100, 146, 60];
        h = 0.96;
      }
      t.setI(i, scale(c, k));
      t.height[i] = h;
    }
  }
  if (!bottom) {
    for (const [x, y] of [
      [7, 4],
      [11, 7],
      [8, 11],
      [4, 8],
    ] as const) {
      const i = idx(x, y);
      t.setI(i, [224, 220, 178]);
      t.height[i] = 1.05;
      t.smooth[i] = 60;
    }
  } else {
    // Centro de la base: cicatriz algo más clara y reseca.
    for (const [x, y] of [
      [7, 7],
      [8, 8],
    ] as const) {
      const i = idx(x, y);
      t.setI(i, mix(t.getI(i), [150, 140, 96], 0.5));
    }
  }
  t.depth = 1.2;
}

export const PLANT_GENERATORS: Record<string, Generator> = {
  short_grass: shortGrass,
  fern,
  poppy,
  dandelion,
  cornflower,
  dead_bush: deadBush,
  sugar_cane: sugarCane,
  red_mushroom: redMushroom,
  brown_mushroom: brownMushroom,
  cactus_side: cactusSide,
  cactus_top: (t) => cactusEnd(t, false),
  cactus_bottom: (t) => cactusEnd(t, true),
};
