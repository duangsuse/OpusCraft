// Generadores de los bloques de trabajo de la fase 4: ahumador y alto horno (variantes del horno),
// fogata (troncos con brasas, llamas, brasas y ceniza) y cortapiedras (base, laterales y sierra).

import { Tex, N, clamp, idx, mix, scale, pixelNoise, type Generator, type RGB } from './texCore';
import { cutoutCanvas } from './genPlants';
import { furnaceFront, furnaceSide, furnaceTop } from './genSurvival';
import { WOOD_GENERATORS } from './genWood';

/** Tiñe una textura ya generada (sin tocar lo que brilla: la boca encendida). */
function tint(t: Tex, k: RGB): void {
  for (let i = 0; i < N; i++) {
    if (t.emit[i] > 0) continue;
    const c = t.getI(i);
    t.setI(i, [c[0] * k[0], c[1] * k[1], c[2] * k[2]]);
  }
}

/** Banda de hierro (filas y0..y1) con remaches. */
function ironBand(t: Tex, y0: number, y1: number, base: RGB): void {
  const r = t.rng('band');
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      const edge = y === y0 ? 1.15 : y === y1 ? 0.75 : 1;
      t.setI(i, scale(base, edge * (0.95 + 0.1 * r.next())));
      t.height[i] = 1;
      t.smooth[i] = 150;
      t.f0[i] = 200;
    }
  }
  for (const x of [2, 7, 13]) t.set(x, Math.round((y0 + y1) / 2), scale(base, 1.35));
}

// ---------------------------------------------------------------------------
// Ahumador: piedra oscura con madera ahumada; alto horno: piedra gris azulada con hierro
// ---------------------------------------------------------------------------

const SMOKE_TINT: RGB = [0.72, 0.66, 0.6];
const BLAST_TINT: RGB = [0.72, 0.76, 0.84];
const IRON: RGB = [150, 154, 162];
const SOOT: RGB = [70, 60, 52];

function smokerSide(t: Tex): void {
  furnaceSide(t);
  tint(t, SMOKE_TINT);
  // Tablas de madera ahumada en el centro, atadas con dos bandas.
  const r = t.rng('smoker');
  for (let y = 4; y <= 11; y++) {
    for (let x = 1; x <= 14; x++) {
      const i = idx(x, y);
      const seam = x % 5 === 0;
      t.setI(i, seam ? scale(SOOT, 0.7) : mix([96, 70, 48], [118, 88, 60], r.next()));
      t.height[i] = seam ? 0.4 : 0.9;
      t.smooth[i] = 40;
    }
  }
  ironBand(t, 4, 5, scale(IRON, 0.7));
  ironBand(t, 10, 11, scale(IRON, 0.7));
}

function smokerTop(t: Tex): void {
  furnaceTop(t);
  tint(t, SMOKE_TINT);
  // Chimenea: rejilla oscura en el centro.
  for (let y = 5; y <= 10; y++) {
    for (let x = 5; x <= 10; x++) {
      const bar = (x + y) % 2 === 0;
      t.set(x, y, bar ? [40, 36, 34] : [18, 16, 16]);
      t.height[idx(x, y)] = bar ? 0.5 : 0.1;
    }
  }
}

function smokerFront(lit: boolean): Generator {
  return (t) => {
    furnaceFront(t, lit);
    tint(t, SMOKE_TINT);
    ironBand(t, 0, 1, scale(IRON, 0.7));
  };
}

function blastSide(t: Tex): void {
  furnaceSide(t);
  tint(t, BLAST_TINT);
  ironBand(t, 0, 2, IRON);
  ironBand(t, 13, 15, scale(IRON, 0.85));
}

function blastTop(t: Tex): void {
  furnaceTop(t);
  tint(t, BLAST_TINT);
  // Boca de carga: cuadro de hierro con el interior oscuro.
  for (let y = 4; y <= 11; y++) {
    for (let x = 4; x <= 11; x++) {
      const rim = x === 4 || x === 11 || y === 4 || y === 11;
      t.set(x, y, rim ? IRON : [26, 26, 30]);
      t.height[idx(x, y)] = rim ? 1 : 0.1;
      t.smooth[idx(x, y)] = rim ? 150 : 20;
    }
  }
}

function blastFront(lit: boolean): Generator {
  return (t) => {
    furnaceFront(t, lit);
    tint(t, BLAST_TINT);
    ironBand(t, 0, 2, IRON);
  };
}

// ---------------------------------------------------------------------------
// Fogata
// ---------------------------------------------------------------------------

/** Tronco con grietas de brasas encendidas. */
/** Fase 8.5: colores del fuego de la fogata: el normal y el de alma (turquesa). */
const FLAME = {
  hot: [[255, 170, 60], [236, 96, 30]] as RGB[], core: [[255, 246, 170], [255, 214, 90]] as RGB[], edge: [[255, 170, 50], [220, 70, 20]] as RGB[],
  ember: [[255, 120, 30], [255, 190, 70]] as RGB[],
};
const SOUL_FLAME = {
  hot: [[120, 250, 255], [40, 190, 220]] as RGB[], core: [[220, 255, 255], [140, 246, 255]] as RGB[], edge: [[70, 220, 240], [20, 130, 170]] as RGB[],
  ember: [[40, 200, 230], [130, 250, 255]] as RGB[],
};

function campfireLogLit(t: Tex, fl = FLAME): void {
  WOOD_GENERATORS.oak_log_side(t);
  const r = t.rng('embers');
  for (let k = 0; k < 16; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    const hot: RGB = r.chance(0.5) ? fl.hot[0] : fl.hot[1];
    t.paint(x, y, hot, 0.4, 60, 0, 200);
    if (r.chance(0.5) && x < 15) t.paint(x + 1, y, scale(hot, 0.85), 0.4, 60, 0, 150);
  }
}

/** Llamas: lenguas anchas abajo, amarillas en el centro y naranjas en los bordes. */
function campfireFire(t: Tex, fl = FLAME): void {
  cutoutCanvas(t, 30, 0);
  const r = t.rng();
  const tongues = [
    { x: 3, h: 9 }, { x: 6, h: 14 }, { x: 9, h: 12 }, { x: 12, h: 10 },
  ];
  for (const { x, h } of tongues) {
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      const p = k / h;
      const w = Math.max(0, Math.round((1 - p) * 2.2));
      for (let dx = -w; dx <= w; dx++) {
        const xx = x + dx + (k > h * 0.6 && r.chance(0.3) ? 1 : 0);
        if (xx < 0 || xx > 15) continue;
        const core = Math.abs(dx) < w * 0.5 && p < 0.7;
        const c: RGB = core ? mix(fl.core[0], fl.core[1], p) : mix(fl.edge[0], fl.edge[1], p);
        t.paint(xx, y, c, 1, 20, 0, 255);
      }
    }
  }
}

function campfireGround(ash: boolean, fl = FLAME): Generator {
  return (t) => {
    const r = t.rng();
    const px = pixelNoise(r);
    for (let i = 0; i < N; i++) {
      let c: RGB = mix([56, 52, 50], [92, 88, 84], px[i]);
      t.setI(i, c);
      t.height[i] = 0.5 + 0.5 * px[i];
      t.smooth[i] = 20;
      if (!ash && px[i] > 0.72) {
        c = mix(fl.ember[0], fl.ember[1], r.next());
        t.setI(i, c);
        t.emit[i] = 220;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Cortapiedras
// ---------------------------------------------------------------------------

const STONE: RGB[] = [[112, 112, 116], [126, 126, 130], [138, 138, 142], [152, 152, 156]];

function stonecutterBase(t: Tex, top: boolean): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = x === 0 || x === 15 || y === 0 || y === 15;
    const c = STONE[clamp(Math.floor(px[i] * 4), 0, 3)];
    t.setI(i, edge ? scale(c, 0.8) : c);
    t.height[i] = edge ? 0.85 : 0.95;
    t.smooth[i] = top ? 90 : 60;
  }
}

function stonecutterSide(t: Tex): void {
  stonecutterBase(t, false);
  // Sólo se ven las 9 filas de abajo: banda de hierro arriba y ranura para el serrín.
  ironBand(t, 7, 8, IRON);
  for (let x = 3; x <= 12; x++) {
    t.set(x, 11, [44, 44, 48]);
    t.height[idx(x, 11)] = 0.2;
  }
}

/** Sierra circular: sólo se ven las filas de arriba (medio disco con dientes). */
function stonecutterSaw(t: Tex): void {
  cutoutCanvas(t, 170, 0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.2) continue;
      const tooth = d > 6.2;
      if (tooth && (Math.floor(Math.atan2(y - 7.5, x - 7.5) * 4) & 1)) continue;
      const c: RGB = tooth ? [210, 212, 218] : d < 1.5 ? [90, 92, 98] : mix([170, 172, 180], [140, 142, 150], d / 7);
      const i = t.paint(x, y, c, 1, 190, 0, 0);
      t.f0[i] = 230;
    }
  }
}

export const WORKSTATION_GENERATORS: Record<string, Generator> = {
  smoker_front: smokerFront(false),
  smoker_front_lit: smokerFront(true),
  smoker_side: smokerSide,
  smoker_top: smokerTop,
  blast_furnace_front: blastFront(false),
  blast_furnace_front_lit: blastFront(true),
  blast_furnace_side: blastSide,
  blast_furnace_top: blastTop,
  campfire_log_lit: campfireLogLit,
  campfire_fire: campfireFire,
  campfire_embers: campfireGround(false),
  // Fase 8.5 (lo que da el Nether): la fogata de almas, con el fuego turquesa.
  soul_campfire_log_lit: (t) => campfireLogLit(t, SOUL_FLAME),
  soul_campfire_fire: (t) => campfireFire(t, SOUL_FLAME),
  soul_campfire_embers: campfireGround(false, SOUL_FLAME),
  campfire_ash: campfireGround(true),
  stonecutter_top: (t) => stonecutterBase(t, true),
  stonecutter_side: stonecutterSide,
  stonecutter_bottom: (t) => stonecutterBase(t, false),
  stonecutter_saw: stonecutterSaw,
};
