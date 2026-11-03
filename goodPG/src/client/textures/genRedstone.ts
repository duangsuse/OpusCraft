// Fase 7 (redstone): texturas de la redstone, todas dibujadas aquí (nada copiado):
// - polvo de redstone en 16 tonos (el color de Minecraft según la potencia: de granate a rojo vivo);
// - antorcha de redstone encendida y apagada, y los trozos de antorcha de repetidores y comparadores;
// - tapas del repetidor y del comparador (piedra lisa con sus pistas de polvo) giradas a cada lado;
// - palanca, bloque de redstone, lámpara, sensor de luz solar (normal e invertido), diana, bloque
//   musical, cuerda, frente del cofre trampa, puerta y trampilla de hierro;
// - pararrayos y bombilla de cobre en las cuatro fases de oxidación (con el relieve de genCopper).
import { N, Noise, Rng, Tex, clamp, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { STONES_GENERATORS } from './genStones';
import { SURVIVAL_GENERATORS } from './genSurvival';
import { Relief, paint, bevel, brushed } from './genCopper';

/** Color del polvo con potencia p (0..15), como en Minecraft. */
export function dustColor(p: number): RGB {
  const f = p / 15;
  const r = f * 0.6 + (f > 0 ? 0.4 : 0.3);
  const g = clamp(f * f * 0.7 - 0.5, 0, 1);
  const b = clamp(f * f * 0.6 - 0.7, 0, 1);
  return [r * 255, g * 255, b * 255];
}

const ON: RGB = [236, 48, 24];
const OFF: RGB = [96, 18, 12];

/** Lienzo transparente (recortes que no se repiten). */
function clear(t: Tex): void {
  t.alpha.fill(0);
  t.tiling = false;
  t.clampTransparent = true;
}

// ------------------------------------------------------------------ polvo

function dust(p: number): Generator {
  return (t) => {
    const r = new Rng('redstone_dust');
    const grains = new Noise(r, 8);
    const px = pixelNoise(r);
    const base = dustColor(p);
    t.alpha.fill(0);
    for (let i = 0; i < N; i++) {
      const v = 0.55 * grains.at(i & 15, i >> 4) + 0.45 * px[i];
      if (v < 0.2) continue; // granos sueltos: algún hueco
      t.alpha[i] = 255;
      const k = 0.72 + 0.5 * v + (px[i] > 0.93 ? 0.25 : 0);
      t.setI(i, [Math.min(255, base[0] * k), Math.min(255, base[1] * k + (px[i] > 0.93 ? 30 * (p / 15) : 0)), base[2] * k]);
      t.height[i] = 0.6 + 0.4 * v;
      t.smooth[i] = 70 + 60 * v;
      t.emit[i] = p > 0 ? 18 + p * 5 : 0;
    }
    t.depth = 0.8;
  };
}

// ------------------------------------------------------------------ antorchas

function torch(on: boolean): Generator {
  return (t) => {
    clear(t);
    t.smooth.fill(45);
    for (let y = 8; y <= 15; y++) {
      const c = mix([92, 64, 36], [146, 108, 64], (15 - y) / 7);
      t.paint(7, y, scale(c, 1.06), 1, 45);
      t.paint(8, y, scale(c, 0.88), 1, 45);
    }
    // Cabeza de redstone: brasa roja (encendida) o granate apagado.
    const hot: RGB[] = on ? [[255, 150, 110], [255, 70, 40], [214, 30, 16], [160, 18, 10]] : [[132, 42, 32], [110, 30, 22], [88, 22, 16], [70, 16, 12]];
    const e = on ? 255 : 0;
    t.paint(7, 6, hot[0], 1, 60, 0, e);
    t.paint(8, 6, hot[1], 1, 60, 0, e);
    t.paint(7, 7, hot[1], 1, 60, 0, e);
    t.paint(8, 7, hot[2], 1, 60, 0, e);
    if (on) {
      // Resplandor alrededor de la cabeza (sólo encendida).
      for (const [x, y] of [[7, 5], [8, 5], [6, 6], [9, 6], [6, 7], [9, 7]] as const) t.paint(x, y, hot[3], 0.8, 40, 0, 150);
    }
  };
}

/** Lados de los trozos de antorcha de repetidores y comparadores: cabeza arriba (filas 0–10) y palo. */
function torchSide(on: boolean): Generator {
  return (t) => {
    const r = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const y = i >> 4;
      if (y <= 10) {
        t.setI(i, scale(on ? [226, 44, 22] : [98, 26, 18], 0.9 + 0.2 * r[i]));
        t.emit[i] = on ? 230 : 0;
      } else t.setI(i, scale([128, 92, 54], 0.85 + 0.25 * r[i]));
      t.smooth[i] = 50;
    }
  };
}

function torchTop(on: boolean): Generator {
  return (t) => {
    const r = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      t.setI(i, scale(on ? [250, 80, 50] : [110, 30, 22], 0.9 + 0.2 * r[i]));
      t.emit[i] = on ? 255 : 0;
      t.smooth[i] = 60;
    }
  };
}

// ------------------------------------------------------------------ repetidor y comparador

/** Pinta las pistas de un diodo (dibujadas mirando al norte) giradas `f` cuartos de vuelta. */
function diodeTop(kind: 'repeater' | 'comparator', on: boolean, f: number): Generator {
  return (t) => {
    STONES_GENERATORS.smooth_stone(t);
    const put = (x: number, y: number, c: RGB, e: number) => {
      let rx = x, ry = y;
      for (let k = 0; k < f; k++) [rx, ry] = [15 - ry, rx];
      t.paint(rx, ry, c, 0.7, 90, 0, e);
    };
    const c = on ? ON : OFF, e = on ? 120 : 0;
    const dim = scale(c, 0.8);
    if (kind === 'repeater') {
      // Pista central de la entrada a la salida y una flecha grabada junto a la salida.
      for (let y = 3; y <= 14; y++) {
        put(7, y, c, e);
        put(8, y, dim, e);
      }
      for (const [x, y] of [[7, 1], [8, 1], [6, 2], [9, 2]] as const) put(x, y, dim, e * 0.5);
    } else {
      // Dos pistas desde las antorchas de atrás que se juntan y siguen hasta la de delante.
      for (let y = 8; y <= 13; y++) {
        put(4, y, c, e);
        put(5, y, dim, e);
        put(10, y, c, e);
        put(11, y, dim, e);
      }
      for (let x = 4; x <= 11; x++) put(x, 8, c, e);
      for (let y = 3; y <= 8; y++) {
        put(7, y, c, e);
        put(8, y, dim, e);
      }
    }
  };
}

// ------------------------------------------------------------------ bloques

function redstoneBlock(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.6 * n.at(x, y) + 0.4 * px[i];
    // Trama de vetas oscuras en diagonal y chispas claras.
    const vein = (x + y) % 5 === 0 || (x - y + 16) % 7 === 0;
    let c: RGB = mix([150, 16, 8], [214, 34, 18], v);
    if (vein) c = scale(c, 0.72);
    if (px[i] > 0.94) c = [255, 96, 70];
    t.setI(i, c);
    t.height[i] = vein ? 0.8 : 1;
    t.smooth[i] = 110 + 50 * v;
  }
}

function lamp(on: boolean): Generator {
  return (t) => {
    const r = t.rng();
    const n = new Noise(r, 4);
    const px = pixelNoise(r);
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const frame = x === 0 || y === 0 || x === 15 || y === 15 || x === 5 || x === 10 || y === 5 || y === 10;
      const v = 0.6 * n.at(x, y) + 0.4 * px[i];
      if (frame) {
        t.setI(i, scale(on ? [150, 104, 56] : [74, 50, 32], 0.9 + 0.2 * px[i]));
        t.height[i] = 1;
        t.smooth[i] = 70;
        continue;
      }
      // Cristal: apagado, pardo anaranjado turbio; encendido, amarillo cálido que alumbra.
      const c: RGB = on ? mix([255, 196, 96], [255, 244, 196], v) : mix([112, 64, 36], [150, 92, 50], v);
      t.setI(i, c);
      t.height[i] = 0.85;
      t.smooth[i] = 160;
      t.emit[i] = on ? 200 + 55 * v : 0;
    }
  };
}

function daylightTop(inverted: boolean): Generator {
  return (t) => {
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const rim = x === 0 || y === 0 || x === 15 || y === 15;
      const line = x % 5 === 0 || y % 5 === 0;
      let c: RGB;
      if (rim) c = [150, 112, 70];
      else if (line) c = [44, 50, 62];
      else c = inverted ? mix([96, 130, 196], [150, 184, 236], px[i]) : mix([218, 206, 170], [246, 238, 210], px[i]);
      t.setI(i, c);
      t.height[i] = rim ? 1 : line ? 0.8 : 0.9;
      t.smooth[i] = rim ? 60 : 170;
    }
  };
}

function daylightSide(t: Tex): void {
  const r = t.rng();
  const grain = new Noise(r, 2, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.6 * grain.at(x, y) + 0.4 * px[i];
    // La caja ocupa las filas de abajo (6 de alto): borde de arriba más oscuro.
    t.setI(i, y === 10 ? [70, 52, 34] : mix([128, 94, 58], [168, 128, 82], v));
    t.smooth[i] = 55;
  }
}

function target(top: boolean): Generator {
  return (t) => {
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const d = Math.hypot(x - 7.5, y - 7.5);
      const red = d < 1.6 || (d > 3.4 && d < 5) || d > 6.6;
      const back: RGB = top ? mix([214, 186, 108], [236, 212, 140], px[i]) : mix([226, 220, 206], [246, 242, 232], px[i]);
      t.setI(i, red ? mix([176, 30, 26], [212, 48, 38], px[i]) : back);
      t.height[i] = red ? 0.92 : 1;
      t.smooth[i] = 40;
    }
  };
}

function noteBlock(t: Tex): void {
  const r = t.rng();
  const grain = new Noise(r, 2, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.6 * grain.at(x, y) + 0.4 * px[i];
    let c: RGB = mix([92, 58, 38], [124, 82, 54], v);
    let h = 1;
    if (x === 0 || y === 0 || x === 15 || y === 15) c = scale(c, 0.7);
    // Rejilla del altavoz: un círculo oscuro con agujeros en damero.
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 5.2) {
      c = (x + y) % 2 === 0 ? [34, 24, 18] : scale(c, 0.6);
      h = 0.7;
    } else if (d < 6) c = scale(c, 0.8);
    t.setI(i, c);
    t.height[i] = h;
    t.smooth[i] = 50;
  }
}

function tripwire(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, px[i] > 0.9 ? [150, 150, 146] : mix([206, 206, 200], [236, 236, 232], px[i]));
    t.smooth[i] = 40;
  }
}

function leverHandle(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    t.setI(i, scale(mix([112, 80, 46], [150, 110, 64], px[i]), x % 2 ? 0.92 : 1.04));
    t.smooth[i] = 45;
  }
}

/** Frente del cofre trampa: el del cofre con el pestillo teñido de rojo (la señal de que es trampa). */
function trappedFront(base: string, x0: number, x1: number): Generator {
  return (t) => {
    SURVIVAL_GENERATORS[base](t);
    for (let y = 3; y <= 8; y++) {
      for (let x = x0; x <= x1; x++) {
        const [r, g, b] = t.get(x, y);
        if (r + g + b > 240) t.set(x, y, [Math.min(255, r * 1.25 + 20), g * 0.5, b * 0.45]);
      }
    }
  };
}

// ------------------------------------------------------------------ hierro

const IRON: readonly RGB[] = [[236, 236, 236], [206, 206, 208], [168, 168, 172], [110, 112, 118]];

function ironDoor(top: boolean): Generator {
  return (t) => {
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      let c = mix(IRON[1], IRON[0], px[i] * 0.4);
      let h = 1;
      const frame = x <= 1 || x >= 14 || (top ? y <= 1 : y >= 14);
      if (frame) c = IRON[2];
      else if (top && y >= 3 && y <= 12 && (x >= 3 && x <= 6 || x >= 9 && x <= 12)) {
        // Dos ventanucos oscuros.
        c = y === 3 || x === 3 || x === 9 ? IRON[3] : [70, 74, 82];
        h = 0.6;
      } else if (!top && y >= 2 && y <= 12 && (x >= 3 && x <= 6 || x >= 9 && x <= 12)) {
        // Dos cuarterones hundidos.
        c = x === 3 || x === 9 || y === 2 ? IRON[2] : x === 6 || x === 12 || y === 12 ? IRON[0] : IRON[1];
        h = 0.85;
      }
      if (frame && (x + y) % 6 === 0) c = IRON[3]; // remaches
      t.setI(i, c);
      t.height[i] = h;
      t.smooth[i] = 150;
      t.f0[i] = 230;
    }
    // Tirador en la mitad de abajo.
    if (!top) for (const [x, y] of [[12, 1], [12, 2], [13, 2]] as const) t.paint(x, y, IRON[3], 1, 120);
  };
}

function ironTrapdoor(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const hole = x % 5 !== 0 && y % 5 !== 0 && ((x % 5) + (y % 5)) % 2 === 0 && x > 0 && y > 0 && x < 15 && y < 15;
    const bar = x % 5 === 0 || y % 5 === 0;
    const c = hole ? [58, 60, 66] as RGB : bar ? mix(IRON[1], IRON[0], px[i] * 0.5) : IRON[2];
    t.setI(i, c);
    t.height[i] = hole ? 0.5 : bar ? 1 : 0.85;
    t.smooth[i] = 150;
    t.f0[i] = hole ? 10 : 230;
  }
}

// ------------------------------------------------------------------ cobre

/** Pararrayos: cobre cepillado (el modelo toma trozos pequeños). */
function rodRelief(): Relief {
  const d = new Relief();
  brushed(d, new Rng('lightning_rod'), 0, 0, 15, 15, false);
  d.depth = 0.8;
  return d;
}

/** Bombilla: marco biselado y cuatro cristales en cruz; encendida, con la luz dentro. */
function bulbRelief(lit: boolean): Relief {
  const d = new Relief();
  brushed(d, new Rng('copper_bulb'), 0, 0, 15, 15, false);
  bevel(d, 0, 0, 15, 15, 2);
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      if (x === 7 || x === 8 || y === 7 || y === 8) {
        d.set(x, y, x === 8 || y === 8 ? 2.2 : 1.6, 0.9, 0.3);
        continue;
      }
      d.set(x, y, 2.7, 0.7, 0.5);
      if (lit) d.glow[y * 16 + x] = (x === 5 || x === 10) && (y === 5 || y === 10) ? 1 : x === 3 || y === 3 || x === 12 || y === 12 ? 3 : 2;
    }
  }
  return d;
}

function rodOn(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, mix([255, 214, 170], [255, 250, 236], px[i]));
    t.emit[i] = 220;
    t.smooth[i] = 200;
    t.f0[i] = 200;
  }
}

// ------------------------------------------------------------------ registro

const PREFIX = ['', 'exposed_', 'weathered_', 'oxidized_'];

export const REDSTONE_GENERATORS: Record<string, Generator> = {
  redstone_torch: torch(true),
  redstone_torch_off: torch(false),
  redstone_torch_side_on: torchSide(true),
  redstone_torch_side_off: torchSide(false),
  redstone_torch_top_on: torchTop(true),
  redstone_torch_top_off: torchTop(false),
  lever_handle: leverHandle,
  redstone_block: redstoneBlock,
  redstone_lamp: lamp(false),
  redstone_lamp_on: lamp(true),
  daylight_detector_top: daylightTop(false),
  daylight_detector_inverted_top: daylightTop(true),
  daylight_detector_side: daylightSide,
  target_side: target(false),
  target_top: target(true),
  note_block: noteBlock,
  tripwire,
  trapped_chest_front: trappedFront('chest_front', 6, 9),
  trapped_chest_front_seam_left: trappedFront('chest_front_seam_left', 0, 1),
  trapped_chest_front_seam_right: trappedFront('chest_front_seam_right', 14, 15),
  lightning_rod_on: rodOn,
  iron_door_top: ironDoor(true),
  iron_door_bottom: ironDoor(false),
  iron_trapdoor: ironTrapdoor,
};
for (let p = 0; p < 16; p++) REDSTONE_GENERATORS[`redstone_dust_${p}`] = dust(p);
for (const kind of ['repeater', 'comparator'] as const) {
  for (const on of [false, true]) for (let f = 0; f < 4; f++) REDSTONE_GENERATORS[`${kind}_${on ? 'on' : 'off'}_${f}`] = diodeTop(kind, on, f);
}
for (let s = 0; s < 4; s++) {
  let rod: Relief | null = null, bulb: Relief | null = null, bulbLit: Relief | null = null;
  REDSTONE_GENERATORS[PREFIX[s] + 'lightning_rod'] = (t) => paint(t, (rod ??= rodRelief()), s, 'lightning_rod');
  REDSTONE_GENERATORS[PREFIX[s] + 'copper_bulb'] = (t) => paint(t, (bulb ??= bulbRelief(false)), s, 'copper_bulb');
  REDSTONE_GENERATORS[PREFIX[s] + 'copper_bulb_lit'] = (t) => paint(t, (bulbLit ??= bulbRelief(true)), s, 'copper_bulb');
}
