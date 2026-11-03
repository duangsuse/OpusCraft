// Fase 8.6 (el End): texturas dibujadas aquí (nada copiado del juego):
// - piedra del End: amarillo pálido con picaduras y cráteres pequeños (y sus ladrillos);
// - púrpura: baldosas lilas con su bisel (bloque) y el pilar, acanalado de lado y con anillos arriba;
// - vara del End: blanca y encendida, con la base más apagada;
// - coro: el tallo violeta con motas claras, la flor (pétalos lilas plegados) y la flor muerta, gris y seca.
import { clamp, mix, scale, idx, N, Noise, pixelNoise, type Generator, type RGB, type Tex } from './texCore';

const END: readonly RGB[] = [[240, 244, 184], [226, 230, 168], [210, 214, 152], [188, 190, 132], [160, 160, 110]];

/** Piedra del End: base pálida con picaduras oscuras y alguna mota clara. */
function endStoneBase(t: Tex, pits = true): Float32Array {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    const k = clamp(Math.floor(v * 3.2), 0, 3);
    t.setI(i, END[k]);
    t.height[i] = 0.8 + v * 0.2;
    t.smooth[i] = 45 + px[i] * 20;
  }
  if (pits) {
    // Cráteres: un píxel hondo con su borde algo más oscuro abajo a la derecha.
    for (let k = 0; k < 9; k++) {
      const x = r.int(0, 15), y = r.int(0, 15);
      t.setI(idx(x, y), END[4]);
      t.height[idx(x, y)] = 0.35;
      if (x < 15) t.setI(idx(x + 1, y), mix(t.get(x + 1, y), END[3], 0.6));
      if (y < 15) t.setI(idx(x, y + 1), mix(t.get(x, y + 1), END[3], 0.5));
      if (x > 0 && y > 0) t.setI(idx(x - 1, y - 1), mix(t.get(x - 1, y - 1), END[0], 0.6));
    }
  }
  t.depth = 1.3;
  return px;
}

function endStoneBricks(t: Tex): void {
  endStoneBase(t, false);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const off = (y >> 3) & 1 ? 4 : 0;
      const joint = y % 8 === 7 || (x + off) % 8 === 7;
      const lit = y % 8 === 0 || (x + off) % 8 === 0;
      const i = idx(x, y);
      if (joint) {
        t.setI(i, END[4]);
        t.height[i] = 0.55;
        t.smooth[i] = 30;
      } else if (lit) t.setI(i, mix(t.getI(i), END[0], 0.5));
    }
  }
}

// ------------------------------------------------------------------ púrpura

const PUR: readonly RGB[] = [[204, 164, 204], [180, 136, 180], [164, 118, 164], [140, 96, 140], [104, 66, 106]];

function purpurBase(t: Tex): Float32Array {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, mix(PUR[2], PUR[1], px[i]));
    t.height[i] = 0.9 + px[i] * 0.1;
    t.smooth[i] = 90 + px[i] * 30;
  }
  return px;
}

/** Bloque de púrpura: cuatro baldosas biseladas. */
function purpurBlock(t: Tex): void {
  purpurBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const lx = x & 7, ly = y & 7;
    if (lx === 7 || ly === 7) {
      t.setI(i, PUR[4]);
      t.height[i] = 0.6;
    } else if (lx === 0 || ly === 0) t.setI(i, PUR[0]);
    else if (lx === 6 || ly === 6) t.setI(i, PUR[3]);
  }
  t.depth = 1.2;
}

function purpurPillarSide(t: Tex): void {
  purpurBase(t);
  for (let y = 0; y < 16; y++) {
    for (const x of [0, 15]) t.setI(idx(x, y), PUR[4]);
    for (const x of [1, 8]) t.setI(idx(x, y), PUR[0]);
    for (const x of [7, 14]) t.setI(idx(x, y), PUR[3]);
  }
  t.depth = 1.2;
}

function purpurPillarTop(t: Tex): void {
  purpurBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    if (ring === 0) t.setI(i, PUR[4]);
    else if (ring === 1 || ring === 5) t.setI(i, PUR[0]);
    else if (ring === 4) t.setI(i, PUR[3]);
    else if (ring >= 6) t.setI(i, PUR[2]);
  }
  t.depth = 1.2;
}

// ------------------------------------------------------------------ vara del End

function endRod(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    // Arriba el asta encendida; la fila de abajo, la base (su cara, más apagada).
    const base = y >= 14;
    t.setI(i, base ? mix([168, 150, 176], [196, 180, 204], px[i]) : mix([250, 248, 255], [236, 230, 250], px[i]));
    t.emit[i] = base ? 60 : 245;
    t.smooth[i] = 160;
    t.height[i] = 1;
  }
}

// ------------------------------------------------------------------ coro

function chorusPlant(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    t.setI(i, mix([74, 44, 76], [118, 80, 120], v));
    t.height[i] = 0.7 + v * 0.3;
    t.smooth[i] = 60;
    t.sss[i] = 40;
  }
  for (let k = 0; k < 12; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    t.setI(idx(x, y), [168, 134, 170]);
    t.height[idx(x, y)] = 1;
  }
  t.depth = 1.1;
}

function chorusFlower(dead: boolean): Generator {
  return (t) => {
    const r = t.rng();
    const px = pixelNoise(r);
    const light: RGB = dead ? [128, 112, 124] : [222, 190, 226], dark: RGB = dead ? [72, 58, 70] : [140, 96, 150];
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      // Pétalos plegados: rombos concéntricos desde el centro.
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      const fold = (Math.floor(d / 2.5) & 1) === 0;
      const c = mix(fold ? light : scale(light, 0.86), dark, clamp(d / 18, 0, 1) * 0.6 + px[i] * 0.15);
      t.setI(i, c);
      t.height[i] = fold ? 1 : 0.8;
      t.smooth[i] = dead ? 30 : 80;
      t.sss[i] = dead ? 10 : 70;
    }
    if (!dead) t.setI(idx(7, 7), [250, 236, 250]);
    t.depth = 1.2;
  };
}

// ------------------------------------------------------------------ portal del End

const FRAME: readonly RGB[] = [[88, 130, 110], [70, 108, 92], [54, 86, 74], [40, 64, 56], [24, 40, 36]];

/** Piedra del marco: verde grisácea y lisa, con motas; `inlay` la baldosa de arriba con su marco claro. */
function frameStone(t: Tex): Float32Array {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.55 + px[i] * 0.45;
    t.setI(i, mix(FRAME[2], FRAME[1], v));
    t.height[i] = 0.85 + v * 0.15;
    t.smooth[i] = 110 + px[i] * 40;
  }
  return px;
}

/** Arriba: la baldosa con su bisel, un anillo de runas turquesas y el hueco del ojo en el centro. */
function endPortalFrameTop(t: Tex): void {
  frameStone(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = Math.min(x, y, 15 - x, 15 - y);
    if (edge === 0) {
      t.setI(i, FRAME[4]);
      t.height[i] = 0.5;
    } else if (edge === 1) t.setI(i, mix(t.getI(i), FRAME[0], 0.6));
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    // El hueco del ojo (4..11): hondo y oscuro.
    if (d < 4) {
      t.setI(i, mix(FRAME[4], [16, 30, 30], 0.5));
      t.height[i] = 0.3;
      t.smooth[i] = 60;
    } else if (d < 5) t.setI(i, FRAME[3]);
    // Runas: marcas sueltas en el anillo entre el hueco y el bisel, algo encendidas.
    if (d >= 5.5 && edge >= 2 && ((x * 7 + y * 13) % 5 === 0 || (x * 3 + y * 11) % 7 === 0)) {
      t.setI(i, [96, 214, 186]);
      t.emit[i] = 70;
      t.height[i] = 0.7;
    }
  }
  t.depth = 1.4;
}

/** De lado: la piedra con una franja de piedra del End abajo y los dientes de la losa arriba. */
function endPortalFrameSide(t: Tex): void {
  const px = frameStone(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (y < 3) {
      // La tapa: 3 píxeles (lo que se ve de la losa de 13/16) con bisel.
      t.setI(i, y === 0 ? FRAME[0] : y === 2 ? FRAME[3] : mix(FRAME[1], FRAME[0], px[i]));
      t.height[i] = y === 2 ? 0.6 : 1;
    } else if (y >= 12) {
      t.setI(i, mix(END[1], END[3], px[i]));
      t.height[i] = 0.8 + px[i] * 0.2;
      t.smooth[i] = 45;
    } else if (y === 11) {
      t.setI(i, FRAME[4]);
      t.height[i] = 0.5;
    } else if ((x === 3 || x === 12) && y >= 5 && y <= 9) {
      // Dos ranuras con un brillo turquesa al fondo.
      t.setI(i, y === 7 ? [80, 196, 170] : FRAME[4]);
      if (y === 7) t.emit[i] = 60;
      t.height[i] = 0.4;
    }
  }
  t.depth = 1.3;
}

/** El ojo de ender engastado: verde turquesa, con el iris oscuro y un brillo. */
function endPortalFrameEye(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const dx = (x - 7.5) / 7.5, dy = (y - 7.5) / 7.5;
    const r = Math.hypot(dx, dy);
    let c: RGB = mix([30, 88, 74], [16, 52, 46], r + px[i] * 0.2);
    if (Math.abs(dx) < 0.22 && Math.abs(dy) < 0.75) c = [6, 20, 18]; // la pupila rasgada
    else if (r < 0.55) c = mix([96, 190, 150], [40, 120, 96], r / 0.55);
    t.setI(i, c);
    t.emit[i] = r < 0.55 ? 45 : 10;
    t.smooth[i] = 200;
    t.height[i] = 1 - r * 0.3;
  }
  t.setI(idx(5, 4), [200, 240, 220]);
  t.setI(idx(6, 4), [150, 210, 190]);
  t.depth = 0.8;
}

/** El velo (para el objeto y de respaldo): casi negro, con motas; en el mundo lo pinta el shader (estrellas). */
function endPortal(t: Tex): void {
  const r = t.rng();
  for (let i = 0; i < N; i++) {
    t.setI(i, [6, 14, 18]);
    t.emit[i] = 20;
    t.height[i] = 1;
  }
  for (let k = 0; k < 14; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    const specks: readonly RGB[] = [[80, 200, 190], [120, 150, 220], [150, 230, 170]];
    t.setI(i, specks[k % 3]);
    t.emit[i] = 200;
  }
}

/** Huevo de dragón: negro violáceo con escamas y motas moradas que brillan un poco. */
function dragonEgg(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    // Escamas: filas desplazadas con el borde de abajo más claro.
    const sy = y % 3, sx = (x + (Math.floor(y / 3) & 1) * 2) % 4;
    let c: RGB = mix([12, 6, 18], [30, 14, 42], v);
    if (sy === 2 && sx !== 0) c = mix(c, [58, 26, 78], 0.6);
    t.setI(i, c);
    t.height[i] = sy === 2 ? 1 : 0.75 + v * 0.2;
    t.smooth[i] = 150;
  }
  for (let k = 0; k < 10; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [150, 70, 200]);
    t.emit[i] = 90;
  }
  t.depth = 1.1;
}

// ------------------------------------------------------------------ cajas de shulker y cofre de ender

/** Color de cada caja de shulker (la normal, morada; las teñidas, del tono de su tinte, algo apagado como en Java). */
const BOX_RGB: Record<string, RGB> = {
  '': [150, 100, 150], white: [214, 218, 220], orange: [226, 110, 22], magenta: [176, 58, 168], light_blue: [58, 170, 210],
  yellow: [242, 190, 40], lime: [104, 172, 30], pink: [226, 124, 156], gray: [62, 66, 70], light_gray: [134, 134, 126],
  cyan: [22, 128, 138], purple: [112, 46, 156], blue: [48, 50, 146], brown: [110, 70, 40], green: [80, 104, 32],
  red: [150, 36, 32], black: [30, 30, 34],
};

/** Rampa de un color: de la sombra al brillo. */
function boxRamp(c: RGB): RGB[] {
  return [scale(c, 0.45), scale(c, 0.68), c, mix(c, [255, 255, 255], 0.18), mix(c, [255, 255, 255], 0.36)];
}

/** Techo de la tapa: el marco, un anillo hundido y escamas finas en el centro. */
function shulkerTop(c: RGB): Generator {
  return (t) => {
    const k = boxRamp(c);
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const ring = Math.min(x, y, 15 - x, 15 - y);
      let col = mix(k[2], k[3], px[i] * 0.6);
      let h = 0.9 + px[i] * 0.08;
      if (ring === 0) { col = k[1]; h = 0.75; }
      else if (ring === 1) col = k[4];
      else if (ring === 4) { col = k[1]; h = 0.7; }
      else if (ring === 5) col = k[3];
      else if (ring > 5 && (x + y) % 3 === 0) col = mix(col, k[1], 0.4);
      t.setI(i, col);
      t.height[i] = h;
      t.smooth[i] = 110 + px[i] * 40;
    }
    t.depth = 1.2;
  };
}

/** Lado de la tapa (las 12 filas de arriba): acanalado en vertical con el labio claro abajo. */
function shulkerLid(c: RGB): Generator {
  return (t) => {
    const k = boxRamp(c);
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      let col = mix(k[2], k[3], px[i] * 0.5);
      let h = 0.9;
      if (y === 0) col = k[4];
      else if (y >= 11) { col = y === 11 ? k[4] : k[3]; h = 1; }
      else if (x % 4 === 0) { col = k[1]; h = 0.75; }
      else if (x % 4 === 1) col = k[3];
      else if (y % 3 === 0 && x % 2 === 1) col = mix(col, k[1], 0.3);
      if (x === 0 || x === 15) col = k[1];
      t.setI(i, col);
      t.height[i] = h;
      t.smooth[i] = 110 + px[i] * 40;
    }
    t.depth = 1.1;
  };
}

/** Lado de la base (las 4 filas de abajo): la junta oscura y escamas en rombo. */
function shulkerBase(c: RGB): Generator {
  return (t) => {
    const k = boxRamp(c);
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      let col = (x + y) % 4 < 2 ? k[1] : k[2];
      let h = 0.85 + px[i] * 0.1;
      if (y === 12) { col = k[0]; h = 0.55; }
      else if (y === 15) col = k[1];
      if (x === 0 || x === 15) col = k[0];
      t.setI(i, mix(col, k[3], px[i] * 0.15));
      t.height[i] = h;
      t.smooth[i] = 100 + px[i] * 30;
    }
    t.depth = 1.1;
  };
}

/** Fondo: la base vista desde abajo, con su marco y el centro liso. */
function shulkerBottom(c: RGB): Generator {
  return (t) => {
    const k = boxRamp(c);
    const px = pixelNoise(t.rng());
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const ring = Math.min(x, y, 15 - x, 15 - y);
      t.setI(i, ring === 0 ? k[0] : ring === 1 ? k[2] : mix(k[1], k[2], px[i] * 0.5));
      t.height[i] = ring === 0 ? 0.7 : 0.9;
      t.smooth[i] = 90;
    }
  };
}

const OBS: readonly RGB[] = [[6, 8, 10], [14, 18, 22], [22, 30, 34], [34, 48, 52], [60, 90, 88]];

/** Obsidiana del cofre de ender: casi negra, con vetas verdosas y alguna mota violeta que brilla. */
function enderBase(t: Tex): Float32Array {
  const r = t.rng();
  const n = new Noise(r, 3);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.7 + px[i] * 0.3;
    t.setI(i, v > 0.78 ? OBS[3] : v > 0.55 ? OBS[2] : v > 0.3 ? OBS[1] : OBS[0]);
    t.height[i] = 0.85 + v * 0.15;
    t.smooth[i] = 200;
    t.f0[i] = 30;
  }
  for (let k = 0; k < 5; k++) {
    const i = idx(r.int(1, 14), r.int(1, 14));
    t.setI(i, [120, 70, 170]);
    t.emit[i] = 60;
  }
  return px;
}

function enderSide(t: Tex): void {
  enderBase(t);
  // La junta de la tapa (a 10 de 14: fila 5) y el borde.
  for (let x = 0; x < 16; x++) {
    t.setI(idx(x, 5), OBS[4]);
    t.setI(idx(x, 6), OBS[0]);
    t.height[idx(x, 6)] = 0.5;
  }
  t.depth = 1.3;
}

function enderTop(t: Tex): void {
  enderBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    if (ring === 1) t.setI(i, OBS[3]);
  }
  t.depth = 1.3;
}

function enderLock(t: Tex): void {
  // El cerrojo: el ojo de ender verde claro encendido.
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.hypot(x - 7.5, y - 7.5);
    t.setI(i, d < 3 ? [30, 60, 50] : d < 6 ? [120, 230, 200] : [70, 170, 150]);
    t.emit[i] = d < 6 ? 120 : 40;
    t.smooth[i] = 220;
  }
}

// Cabeza de dragón: escamas casi negras en hileras con reflejo violeta (como el dragón), los ojos morados encendidos
// en los costados de delante, el hocico más liso, los orificios hundidos y los cuernos de hueso.
const DRAGON_SCALE: readonly RGB[] = [[12, 10, 16], [22, 18, 30], [36, 28, 48], [58, 44, 76]];

function dragonScales(t: Tex, seed = ''): Float32Array {
  const px = pixelNoise(t.rng(seed));
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const sy = y % 4, sx = (x + (Math.floor(y / 4) & 1) * 2) % 4;
    let c = mix(DRAGON_SCALE[1], DRAGON_SCALE[2], px[i]);
    if (sy === 3) c = DRAGON_SCALE[0];
    else if (sy === 0 && sx !== 3) c = mix(c, DRAGON_SCALE[3], 0.5);
    t.setI(i, c);
    t.height[i] = sy === 3 ? 0.55 : 0.85 + px[i] * 0.15;
    t.smooth[i] = 150 + px[i] * 40;
  }
  t.depth = 1.3;
  return px;
}

function dragonHeadFace(face: string): Generator {
  return (t) => {
    dragonScales(t, face);
    // Los ojos: una rendija morada encendida en los costados, cerca de delante (la derecha y la izquierda).
    if (face === 'right' || face === 'left') {
      const x0 = face === 'right' ? 2 : 10;
      for (let x = x0; x < x0 + 4; x++) {
        t.setI(idx(x, 7), [204, 90, 255]);
        t.emit[idx(x, 7)] = 200;
        t.setI(idx(x, 8), [150, 50, 200]);
        t.emit[idx(x, 8)] = 140;
      }
    }
    // Delante (la frente sobre el hocico): una cresta de hueso en el centro.
    if (face === 'front') for (let y = 0; y < 6; y++) t.setI(idx(7, y), [150, 140, 150]), t.setI(idx(8, y), [120, 110, 124]);
    if (face === 'top') for (let y = 2; y < 16; y += 3) t.setI(idx(7, y), [170, 160, 170]), t.setI(idx(8, y), [140, 130, 146]);
  };
}

function dragonSnout(t: Tex): void {
  const px = dragonScales(t, 'snout');
  for (let i = 0; i < N; i++) if (px[i] > 0.9) t.setI(i, DRAGON_SCALE[3]);
}

function dragonHorn(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    t.setI(i, mix([206, 198, 206], [150, 140, 152], y / 15 * 0.7 + px[i] * 0.3));
    t.smooth[i] = 170;
  }
}

function dragonNostril(t: Tex): void {
  dragonScales(t, 'nostril');
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (Math.hypot(x - 7.5, y - 7.5) < 4) {
      t.setI(i, [4, 2, 6]);
      t.height[i] = 0.3;
    }
  }
}

/** La cabeza de dragón (van con las demás cabezas, en genCollections). */
export const DRAGON_HEAD_GENERATORS: Record<string, Generator> = {
  ...Object.fromEntries(['right', 'left', 'top', 'bottom', 'back', 'front'].map((f) => [`dragon_head_${f}`, dragonHeadFace(f)])),
  dragon_head_snout: dragonSnout,
  dragon_head_horn: dragonHorn,
  dragon_head_nostril: dragonNostril,
};

const SHULKER_GENERATORS: Record<string, Generator> = {};
for (const [c, rgb] of Object.entries(BOX_RGB)) {
  const p = c ? `${c}_` : '';
  SHULKER_GENERATORS[`${p}shulker_box_top`] = shulkerTop(rgb);
  SHULKER_GENERATORS[`${p}shulker_box_lid`] = shulkerLid(rgb);
  SHULKER_GENERATORS[`${p}shulker_box_base`] = shulkerBase(rgb);
  SHULKER_GENERATORS[`${p}shulker_box_bottom`] = shulkerBottom(rgb);
}

export const END_GENERATORS: Record<string, Generator> = {
  ...SHULKER_GENERATORS,
  ender_chest_side: enderSide,
  ender_chest_top: enderTop,
  ender_chest_front: enderSide,
  ender_chest_lock: enderLock,
  dragon_egg: dragonEgg,
  end_portal_frame_top: endPortalFrameTop,
  end_portal_frame_side: endPortalFrameSide,
  end_portal_frame_eye: endPortalFrameEye,
  end_portal: endPortal,
  end_stone: (t) => void endStoneBase(t),
  end_stone_bricks: endStoneBricks,
  purpur_block: purpurBlock,
  purpur_pillar: purpurPillarSide,
  purpur_pillar_top: purpurPillarTop,
  end_rod: endRod,
  chorus_plant: chorusPlant,
  chorus_flower: chorusFlower(false),
  chorus_flower_dead: chorusFlower(true),
};
