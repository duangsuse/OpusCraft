// Fase 7 (pociones): texturas del alambique alquímico.
// - Pies: piedra oscura pulida con el borde algo más claro.
// - Vara y brazos: vara de blaze (amarillo anaranjado con anillos más oscuros y un brillo propio suave).
// - Frascos: los lados van por franjas de altura (las cajas toman la UV de su posición y sólo la altura
//   cambia): el cuello de cristal arriba y el cuerpo con el líquido azulado abajo, con un reflejo claro.
import { N, clamp, mix, scale, pixelNoise, type Generator, type RGB, type Tex } from './texCore';

function standBase(t: Tex): void {
  const px = pixelNoise(t.rng());
  const STONE: RGB = [96, 92, 90];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const rim = x === 0 || y === 0 || x === 15 || y === 15;
    const c = scale(STONE, (rim ? 1.18 : 0.92) + px[i] * 0.16);
    t.setI(i, c);
    t.height[i] = rim ? 1 : 0.85 + px[i] * 0.1;
    t.smooth[i] = 90;
  }
}

function standRod(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    // Anillos cada 4 píxeles y una veta clara en el centro de cada cara.
    const ring = y % 4 === 3;
    const core = x % 2 === 0;
    const heat = clamp(0.55 + (core ? 0.25 : 0) - (ring ? 0.35 : 0) + (px[i] - 0.5) * 0.2, 0, 1);
    const c: RGB = heat > 0.5 ? mix([236, 150, 30], [255, 222, 90], (heat - 0.5) * 2) : mix([150, 72, 12], [236, 150, 30], heat * 2);
    t.setI(i, c);
    t.height[i] = ring ? 0.6 : 1;
    t.smooth[i] = 120;
    t.emit[i] = ring ? 0 : 12 + heat * 18;
  }
}

/** Filas (v = 16 − y) del cristal y del líquido de un frasco del alambique (cuerpo 2..7, cuello 7..10). */
function standBottle(t: Tex): void {
  const GLASS: RGB = [200, 222, 236];
  const LIQ: RGB = [70, 110, 214];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let c: RGB;
    let smooth = 210;
    if (y >= 11) {
      // Líquido, más oscuro abajo, con un reflejo vertical claro.
      const k = (y - 11) / 4;
      c = mix(scale(LIQ, 1.15), scale(LIQ, 0.72), k);
      if (x % 4 === 1 && y < 14) c = mix(c, [220, 236, 255], 0.55);
    } else if (y >= 9) {
      // Hombros del frasco (cristal con algo de líquido al fondo).
      c = mix(GLASS, LIQ, y === 10 ? 0.35 : 0.1);
      if (x % 4 === 1) c = [245, 250, 255];
    } else {
      // Cuello: cristal claro con el borde de arriba más brillante.
      c = scale(GLASS, y === 6 ? 1.1 : 0.96);
      if (x % 2 === 1) c = mix(c, [255, 255, 255], 0.35);
      smooth = 230;
    }
    t.setI(i, c);
    t.height[i] = 1;
    t.smooth[i] = smooth;
    t.f0[i] = 40;
  }
}

function standBottleTop(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, mix([196, 218, 234], [236, 246, 252], px[i]));
    t.height[i] = 1;
    t.smooth[i] = 220;
    t.f0[i] = 40;
  }
}

export const BREWING_GENERATORS: Record<string, Generator> = {
  brewing_stand_base: standBase,
  brewing_stand_rod: standRod,
  brewing_stand_bottle: standBottle,
  brewing_stand_bottle_top: standBottleTop,
};
