// Fase 7 (transporte): texturas de los raíles (recortes que se dibujan pegados al suelo).
// - Recto: dos carriles de metal a lo largo (columnas 2–3 y 12–13) sobre traviesas de madera oscura.
//   Se dibuja de norte a sur (filas = sur); el mallador lo gira para el este-oeste.
// - Curva: los carriles en arco de un cuarto de vuelta desde el borde de abajo (sur) al de la derecha
//   (este), con traviesas radiales. El mallador la gira para las otras tres curvas.
// - Propulsor: carriles de oro y una tira de redstone por el centro (apagada, rojo oscuro; encendida,
//   roja brillante y emisiva). Detector: carriles de hierro y una placa de piedra en el centro con su
//   luz. Activador: carriles oscuros y la tira de redstone con remaches.
import { Tex, clamp, idx, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { cutoutCanvas } from './genPlants';

const TIE: RGB[] = [[58, 40, 24], [78, 56, 34], [98, 72, 44], [116, 88, 56]];
const IRON: RGB[] = [[90, 89, 88], [136, 134, 131], [178, 176, 172], [214, 212, 208]]; // gris neutro (no azulado)
const GOLD: RGB[] = [[132, 90, 18], [192, 140, 34], [236, 190, 60], [255, 230, 128]];
const DARK_IRON: RGB[] = [[62, 58, 60], [96, 90, 92], [128, 122, 124], [164, 158, 160]];
const DUST_OFF: RGB = [92, 16, 12];
const DUST_ON: RGB = [255, 40, 22];

interface RailLook {
  metal: RGB[];
  /** Detalle del centro (sobre las traviesas, entre los carriles). */
  center?: (t: Tex, x: number, y: number, px: number) => boolean;
}

/** Traviesa: madera con vetas a lo largo (horizontal), borde de arriba claro y de abajo oscuro. */
function tie(t: Tex, x: number, y: number, row: number, px: number): void {
  const l = row === 0 ? 2 : row === 2 ? 0 : 1 + (px > 0.72 ? 1 : 0) - (px < 0.12 ? 1 : 0);
  t.paint(x, y, TIE[clamp(l, 0, 3)], 0.55 + row * 0.05, 30, 0);
}

/** Carril de metal de 2 px: el lado de la izquierda con brillo y el de la derecha en sombra. */
function metal(t: Tex, x: number, y: number, left: boolean, look: RailLook, px: number): void {
  const m = look.metal;
  const l = left ? 3 - (px < 0.15 ? 1 : 0) : 1 + (px > 0.8 ? 1 : 0);
  // Metal gastado: menos pulido que un bloque de hierro para que no refleje el cielo como un espejo.
  const i = t.paint(x, y, m[l], 1, 120);
  t.f0[i] = 200;
}

function straight(t: Tex, look: RailLook): void {
  cutoutCanvas(t, 40, 0);
  const px = pixelNoise(t.rng());
  for (let y = 0; y < 16; y++) {
    // Cuatro traviesas de tres filas (1–3, 5–7, 9–11, 13–15) que asoman un píxel fuera de los carriles.
    const row = (y + 3) % 4;
    for (let x = 1; x < 15; x++) {
      if (row < 3) tie(t, x, y, row, px[idx(x, y)]);
      look.center?.(t, x, y, px[idx(x, y)]);
    }
    for (const x of [2, 3, 12, 13]) metal(t, x, y, x === 2 || x === 12, look, px[idx(x, y)]);
  }
}

function corner(t: Tex, look: RailLook): void {
  cutoutCanvas(t, 40, 0);
  const px = pixelNoise(t.rng());
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Distancia y ángulo desde la esquina de abajo a la derecha (centro de la curva).
      const dx = 16 - (x + 0.5), dy = 16 - (y + 0.5);
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx); // 0 en el borde de la derecha, π/2 en el de abajo
      const p = px[idx(x, y)];
      // Traviesas radiales entre los carriles (radio 1,6..14,6): cuatro tablas de 3 px de ancho a lo largo
      // del arco (centradas a 1/8, 3/8, 5/8 y 7/8 del cuarto de vuelta).
      const k = Math.min(3, Math.floor((a / (Math.PI / 2)) * 4));
      const off = d * Math.sin(a - ((k + 0.5) * Math.PI) / 8);
      if (d > 1.6 && d < 14.6 && Math.abs(off) < 1.5) tie(t, x, y, off < -0.5 ? 0 : off > 0.5 ? 2 : 1, p);
      // Carriles: el de fuera a 12,5..14,5 y el de dentro a 2,5..4,5 (salen por las columnas y filas 2–3 y 12–13).
      const outer = d >= 12.5 && d < 14.5, inner = d >= 2.5 && d < 4.5;
      if (outer) metal(t, x, y, d >= 13.5, look, p);
      else if (inner) metal(t, x, y, d >= 3.5, look, p);
    }
  }
}

/** Tira de redstone por el centro de las traviesas (columnas 6–9). */
function dustStrip(on: boolean): RailLook['center'] {
  return (t, x, y, p) => {
    if (x < 6 || x > 9 || (y + 3) % 4 === 3) return false;
    const edge = x === 6 || x === 9;
    const c = on ? mix(DUST_ON, [255, 150, 110], edge ? 0 : p * 0.5) : scale(DUST_OFF, edge ? 0.75 : 0.9 + p * 0.25);
    t.paint(x, y, c, 0.7, on ? 60 : 30, 0, on ? (edge ? 90 : 160) : 0);
    return true;
  };
}

/** Placa de piedra del detector (filas 5–10) con su piloto en el centro. */
function sensorPlate(on: boolean): RailLook['center'] {
  return (t, x, y, p) => {
    if (x < 5 || x > 10 || y < 5 || y > 10) return false;
    const rim = x === 5 || x === 10 || y === 5 || y === 10;
    const eye = x >= 7 && x <= 8 && y >= 7 && y <= 8;
    if (eye) t.paint(x, y, on ? DUST_ON : DUST_OFF, 0.9, 80, 0, on ? 200 : 0);
    else t.paint(x, y, rim ? [96, 96, 98] : scale([140, 140, 142], 0.92 + p * 0.14), rim ? 0.8 : 0.9, 50);
    return true;
  };
}

/** Tira del activador: redstone fina con dos remaches de hierro. */
function activatorStrip(on: boolean): RailLook['center'] {
  const dust = dustStrip(on)!;
  return (t, x, y, p) => {
    if ((x === 6 || x === 9) && (y === 2 || y === 10)) {
      const i = t.paint(x, y, DARK_IRON[3], 1, 150);
      t.f0[i] = 236;
      return true;
    }
    if (x < 7 || x > 8) return false;
    return dust(t, x, y, p);
  };
}

export const TRANSPORT_GENERATORS: Record<string, Generator> = {
  rail: (t) => straight(t, { metal: IRON }),
  rail_corner: (t) => corner(t, { metal: IRON }),
  powered_rail: (t) => straight(t, { metal: GOLD, center: dustStrip(false) }),
  powered_rail_on: (t) => straight(t, { metal: GOLD, center: dustStrip(true) }),
  detector_rail: (t) => straight(t, { metal: IRON, center: sensorPlate(false) }),
  detector_rail_on: (t) => straight(t, { metal: IRON, center: sensorPlate(true) }),
  activator_rail: (t) => straight(t, { metal: DARK_IRON, center: activatorStrip(false) }),
  activator_rail_on: (t) => straight(t, { metal: DARK_IRON, center: activatorStrip(true) }),
};
