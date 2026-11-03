// Fase 8.5 (lo que da el Nether): texturas dibujadas aquí (nada copiado del juego):
// - escombros ancestrales: roca parda y violácea con anillos concéntricos de metal que asoman (de lado, en capas
//   curvadas; arriba, los anillos enteros alrededor de un núcleo);
// - bloque de netherita: planchas de metal oscuro pulido con un reflejo violáceo y juntas marcadas;
// - cuarzo: ladrillos, pilar (acanaladuras y anillos arriba), cincelado (marco con volutas) y liso;
// - magnetita: piedra tallada con un fleje de hierro y, arriba, el imán en el centro;
// - nexo de reaparición: obsidiana llorosa con el indicador de cargas de piedra luminosa y, arriba, el remolino
//   del portal que se enciende al cargarlo;
// - faro: el núcleo de la estrella del Nether, blanco azulado y encendido.
import { clamp, mix, scale, idx, N, Noise, pixelNoise, type Generator, type RGB, type Tex } from './texCore';
import { polished, type PolishStyle } from './genMisc';
import { obsidian } from './genStone';

/** Rampa de la roca de los escombros: de la grieta honda al canto claro. */
const DEBRIS: readonly RGB[] = [[34, 22, 24], [56, 38, 38], [80, 56, 52], [104, 76, 68], [132, 104, 92]];
/** Metal de los anillos (más claro y pulido). */
const DEBRIS_METAL: readonly RGB[] = [[86, 70, 74], [108, 92, 94], [132, 116, 114], [156, 142, 136]];

/** Escombros ancestrales: `top` los anillos enteros; si no, las capas curvadas del lado. */
function ancientDebris(top: boolean): Generator {
  return (t: Tex) => {
    const r = t.rng();
    const n = new Noise(r, 4);
    const fine = new Noise(r, 8);
    t.f0.fill(12);
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      // Distancia «de anillo»: arriba, al centro; de lado, bandas que se curvan hacia abajo por el centro.
      const d = top
        ? Math.hypot(x - 7.5, y - 7.5) + (n.at(x, y) - 0.5) * 2.2
        : y + Math.cos(((x - 7.5) / 8) * Math.PI) * 2.4 + (n.at(x, y) - 0.5) * 2.6;
      const band = Math.sin(d * (top ? 1.55 : 1.35));
      const grain = fine.at(x, y);
      if (band > 0.8) {
        // Canto de metal que asoma (brilla y sobresale).
        const k = clamp(Math.floor((band - 0.8) / 0.05 + grain * 1.5), 0, 3);
        t.setI(i, DEBRIS_METAL[k]);
        t.height[i] = 1;
        t.smooth[i] = 150 + k * 18;
        t.f0[i] = 150;
      } else {
        const k = clamp(Math.floor((band + 1) * 1.6 + grain * 1.4 - 0.4), 0, 4);
        t.setI(i, scale(DEBRIS[k], 0.94 + grain * 0.12));
        t.height[i] = 0.45 + k * 0.1;
        t.smooth[i] = 40 + k * 8;
      }
    }
    // Arriba, un núcleo más oscuro y apretado en el centro.
    if (top) for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) t.setI(idx(x, y), mix(DEBRIS[1], DEBRIS_METAL[0], 0.3));
    t.depth = 1.6;
  };
}

const NETHERITE: PolishStyle = {
  base: [70, 64, 70],
  light: [118, 108, 118],
  dark: [46, 42, 48],
  edge: [28, 26, 30],
  smooth: 196,
  f0: 205,
};

/** Bloque de netherita: el pulido de los bloques de metal, en oscuro, con una junta en cruz y reflejo violáceo. */
function netheriteBlock(t: Tex): void {
  polished(t, NETHERITE);
  const r = t.rng('plancha');
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (Math.min(x, y, 15 - x, 15 - y) < 2) continue;
    // Juntas de las cuatro planchas.
    if (x === 7 || y === 7) {
      t.setI(i, NETHERITE.edge);
      t.height[i] = 0.7;
      t.smooth[i] = 150;
    } else if (x === 8 || y === 8) {
      t.setI(i, mix(t.getI(i), NETHERITE.light, 0.25));
    } else if (r.chance(0.08)) {
      // Motas violáceas del temple.
      t.setI(i, mix(t.getI(i), [104, 84, 118], 0.4));
    }
  }
}

// ------------------------------------------------------------------ cuarzo

const Q: readonly RGB[] = [[240, 236, 229], [232, 227, 219], [222, 216, 207], [204, 196, 187], [182, 173, 164]];

/** Base del cuarzo: casi liso, con un grano muy fino. */
function quartzBase(t: Tex, smooth = 150): Float32Array {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, mix(Q[1], Q[0], px[i] * 0.8));
    t.height[i] = 1;
    t.smooth[i] = smooth + 14 * px[i];
    t.f0[i] = 14;
  }
  return px;
}

/** Surco: tono oscuro y hundido. */
function groove(t: Tex, x: number, y: number, k = 3): void {
  const i = idx(x, y);
  t.setI(i, Q[k]);
  t.height[i] = 0.7;
  t.smooth[i] = 110;
}
/** Canto claro. */
function ridge(t: Tex, x: number, y: number): void {
  t.setI(idx(x, y), Q[0]);
}

function quartzBricks(t: Tex): void {
  quartzBase(t);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const off = (y >> 2) & 1 ? 4 : 0;
      if (y % 4 === 3 || (x + off) % 8 === 7) groove(t, x, y);
      else if (y % 4 === 0 || (x + off) % 8 === 0) ridge(t, x, y);
    }
  }
  t.depth = 1.1;
}

function quartzPillarSide(t: Tex): void {
  quartzBase(t);
  for (let y = 0; y < 16; y++) {
    for (const x of [0, 15]) groove(t, x, y, 4);
    for (const x of [3, 12]) groove(t, x, y);
    for (const x of [1, 4, 13]) ridge(t, x, y);
  }
  t.depth = 1.1;
}

function quartzPillarTop(t: Tex): void {
  quartzBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    if (ring === 0) groove(t, x, y, 4);
    else if (ring === 3 || ring === 6) groove(t, x, y);
    else if (ring === 1 || ring === 4) ridge(t, x, y);
  }
  t.depth = 1.1;
}

function chiseledQuartzSide(t: Tex): void {
  quartzBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    if (ring === 0 || (ring === 2 && (y < 3 || y > 12))) groove(t, x, y, 4);
    else if (ring === 1) ridge(t, x, y);
  }
  // Volutas talladas: dos ondas enfrentadas en el paño.
  for (let y = 4; y <= 11; y++) {
    const w = Math.round(Math.sin(((y - 4) / 7) * Math.PI * 2) * 1.5);
    groove(t, 6 + w, y);
    groove(t, 9 - w, y);
    ridge(t, 7 + w, y);
  }
  t.depth = 1.2;
}

function chiseledQuartzTop(t: Tex): void {
  quartzBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    if (ring === 0 || ring === 4) groove(t, x, y, ring === 0 ? 4 : 3);
    else if (ring === 2) groove(t, x, y, 2);
    else if (ring === 1 || ring === 5) ridge(t, x, y);
  }
  t.depth = 1.2;
}

function smoothQuartz(t: Tex): void {
  const px = quartzBase(t, 190);
  for (let i = 0; i < N; i++) t.setI(i, mix(Q[1], Q[0], 0.4 + px[i] * 0.3));
  t.depth = 0.5;
}

// ------------------------------------------------------------------ magnetita

const STONE: readonly RGB[] = [[154, 154, 156], [134, 134, 136], [116, 116, 118], [92, 92, 96], [66, 66, 70]];
const IRON: readonly RGB[] = [[196, 196, 202], [150, 150, 158], [108, 108, 116], [64, 64, 72]];

function lodestoneStone(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    const k = ring === 0 ? 3 : ring === 1 && (x === 1 || y === 1) ? 0 : clamp(Math.floor(1 + px[i] * 2), 1, 2);
    t.setI(i, STONE[k]);
    t.height[i] = ring === 0 ? 0.7 : 0.9 + px[i] * 0.1;
    t.smooth[i] = 60;
  }
}

function lodestoneSide(t: Tex): void {
  lodestoneStone(t);
  // Fleje de hierro de lado a lado con dos remaches.
  for (let x = 0; x < 16; x++) {
    for (let y = 6; y <= 9; y++) {
      const i = idx(x, y);
      t.setI(i, IRON[y === 6 ? 0 : y === 9 ? 3 : 1 + ((x + y) & 1)]);
      t.height[i] = 1;
      t.smooth[i] = 170;
      t.f0[i] = 200;
    }
  }
  for (const x of [3, 12]) t.setI(idx(x, 7), IRON[0]);
}

function lodestoneTop(t: Tex): void {
  lodestoneStone(t);
  // El imán: un marco de hierro con el polo oscuro en el centro.
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (ring > 4.5) continue;
    t.setI(i, ring > 3.5 ? IRON[ring > 4 ? 3 : 1] : ring > 1.5 ? IRON[2] : [40, 40, 50]);
    t.height[i] = ring > 3.5 ? 1 : 0.8;
    t.smooth[i] = 170;
    t.f0[i] = ring > 1.5 ? 200 : 40;
  }
}

// ------------------------------------------------------------------ nexo de reaparición

const GLOW: readonly RGB[] = [[255, 238, 150], [252, 204, 90], [226, 156, 50]];
const PORTAL: readonly RGB[] = [[236, 170, 255], [182, 92, 250], [120, 40, 210], [70, 16, 140]];

/** Obsidiana llorosa de base (con sus lágrimas violetas). */
function cryingBase(t: Tex): void {
  obsidian(t);
  const r = t.rng('lagrimas');
  for (let k = 0; k < 5; k++) {
    const x = r.int(0, 15);
    let y = r.int(0, 15);
    const len = r.int(2, 4);
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, s === 0 ? [214, 120, 255] : [140, 50, 220]);
      t.emit[i] = s === 0 ? 240 : 160;
      y = Math.min(15, y + 1);
    }
  }
}

/** Lado: el indicador de cuatro piedras luminosas en una ranura; `charges` encendidas de abajo arriba. */
function anchorSide(charges: number): Generator {
  return (t) => {
    cryingBase(t);
    for (let seg = 0; seg < 4; seg++) {
      const y1 = 14 - seg * 3, lit = seg < charges;
      for (let y = y1 - 1; y <= y1; y++) {
        for (let x = 6; x <= 9; x++) {
          const i = idx(x, y);
          t.setI(i, lit ? GLOW[(x + y) % 3] : [26, 20, 30]);
          t.emit[i] = lit ? 255 : 0;
          t.height[i] = lit ? 0.9 : 0.55;
          t.smooth[i] = lit ? 90 : 160;
        }
      }
    }
    // Marco de la ranura.
    for (let y = 2; y <= 15; y++) for (const x of [5, 10]) t.setI(idx(x, y), [16, 12, 22]);
  };
}

function anchorTop(on: boolean): Generator {
  return (t) => {
    cryingBase(t);
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d > 5.5) continue;
      t.emit[i] = 0;
      if (d > 4.6) {
        t.setI(i, [18, 12, 24]);
        t.height[i] = 1;
        continue;
      }
      t.height[i] = 0.5;
      if (!on) {
        t.setI(i, [22, 16, 30]);
        continue;
      }
      // Remolino del portal: bandas en espiral.
      const a = Math.atan2(dy, dx) + d * 0.9;
      const k = clamp(Math.floor((Math.sin(a * 2) * 0.5 + 0.5) * 3.2 + (d / 5) * 0.8), 0, 3);
      t.setI(i, PORTAL[k]);
      t.emit[i] = 255 - k * 40;
      t.smooth[i] = 200;
    }
  };
}

// ------------------------------------------------------------------ faro

function beaconCore(t: Tex): void {
  const n = new Noise(t.rng(), 4);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.hypot(x - 7.5, y - 7.5) / 8;
    const star = Math.max(0, 1 - Math.min(Math.abs(x - 7.5), Math.abs(y - 7.5)) / 2.2) * (1 - d);
    const v = clamp(0.55 + star * 0.6 - d * 0.35 + (n.at(x, y) - 0.5) * 0.15, 0, 1);
    t.setI(i, mix([96, 196, 214], [242, 255, 255], v));
    t.emit[i] = 150 + v * 105;
    t.smooth[i] = 200;
    t.height[i] = 0.9;
  }
}

export const NETHER_GOODS_GENERATORS: Record<string, Generator> = {
  ancient_debris_side: ancientDebris(false),
  ancient_debris_top: ancientDebris(true),
  netherite_block: netheriteBlock,
  quartz_bricks: quartzBricks,
  quartz_pillar: quartzPillarSide,
  quartz_pillar_top: quartzPillarTop,
  chiseled_quartz_block: chiseledQuartzSide,
  chiseled_quartz_block_top: chiseledQuartzTop,
  smooth_quartz: smoothQuartz,
  lodestone_side: lodestoneSide,
  lodestone_top: lodestoneTop,
  respawn_anchor_top_off: anchorTop(false),
  respawn_anchor_top: anchorTop(true),
  respawn_anchor_bottom: cryingBase,
  ...Object.fromEntries([0, 1, 2, 3, 4].map((c) => [`respawn_anchor_side${c}`, anchorSide(c)])),
  beacon: beaconCore,
};
