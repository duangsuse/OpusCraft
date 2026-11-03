// Fase 6.5 (equipo): texturas del fuego y del conducto.
// - Fuego: lenguas de llama verticales que se repiten arriba y abajo (el shader las hace subir y
//   recorta su borde de arriba), del rojo de los bordes al amarillo casi blanco del centro, emisivas.
// - Conducto: el cubo mide 6 px y toma el centro de la textura (píxeles 5..10): un armazón de color
//   arena con listones oscuros (apagado) o con el ojo azul encendido (activo).
import { N, clamp, mix, scale, pixelNoise, type Generator, type RGB, type Tex } from './texCore';
import { cutoutCanvas } from './genPlants';

const TAU = Math.PI * 2;

function fire(t: Tex): void {
  cutoutCanvas(t, 20, 0);
  t.tiling = true;
  const r = t.rng();
  const ph = [r.next() * TAU, r.next() * TAU, r.next() * TAU, r.next() * TAU];
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const u = (x / 16) * TAU, v = (y / 16) * TAU;
    // Lenguas: mucha variación de lado a lado y poca de arriba abajo (se repite en los dos sentidos).
    const n = 0.52 + 0.3 * Math.sin(u * 2 + ph[0] + Math.sin(v + ph[1]) * 1.3) + 0.16 * Math.sin(u * 3 - v + ph[2]) +
      0.08 * Math.sin(u * 5 + v * 2 + ph[3]) + 0.14 * (px[i] - 0.5);
    if (n < 0.3) continue;
    const heat = clamp((n - 0.3) / 0.62, 0, 1);
    let c: RGB;
    // Colores muy saturados (sin apenas azul): con la luz del propio fuego y la exposición de noche, los
    // tonos claros se ven blancos.
    if (heat > 0.82) c = mix([250, 176, 34], [255, 214, 90], (heat - 0.82) / 0.18);
    else if (heat > 0.42) c = mix([214, 76, 8], [246, 140, 20], (heat - 0.42) / 0.4);
    else c = mix([140, 22, 4], [200, 52, 8], heat / 0.42);
    // Brillo propio moderado (con el máximo las llamas se ven blancas): más en el centro caliente.
    t.paint(x, y, c, 1, 20, 0, 24 + heat * 40);
  }
}

/** Armazón del conducto: borde claro, listones oscuros en cruz y remaches (centro de 6×6). */
function conduitShell(t: Tex, open: boolean): void {
  const px = pixelNoise(t.rng());
  const SAND: RGB = [178, 150, 104], DARK: RGB = [92, 72, 50], EDGE: RGB = [212, 188, 140];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    // Fuera del cubo (no se ve): el mismo color de arena.
    const lx = x - 5, ly = y - 5;
    let c: RGB = scale(SAND, 0.9 + px[i] * 0.2);
    let h = 0.8, emit = 0, smooth = 70;
    if (lx >= 0 && lx < 6 && ly >= 0 && ly < 6) {
      const rim = lx === 0 || ly === 0 || lx === 5 || ly === 5;
      if (rim) {
        c = lx === 0 || ly === 0 ? EDGE : scale(SAND, 0.82);
        h = 1;
      } else if (open) {
        // Ojo: iris azul y la pupila en el centro.
        const pupil = (lx === 2 || lx === 3) && (ly === 2 || ly === 3);
        c = pupil ? [20, 40, 60] : mix([60, 200, 230], [150, 245, 255], px[i]);
        emit = pupil ? 40 : 220;
        h = 0.5;
        smooth = 200;
      } else {
        // Listones cruzados y huecos oscuros entre ellos.
        const slat = lx === ly || lx + ly === 5;
        c = slat ? scale(SAND, 0.95) : scale(DARK, 0.9 + px[i] * 0.2);
        h = slat ? 0.9 : 0.35;
      }
    }
    t.setI(i, c);
    t.height[i] = h;
    t.smooth[i] = smooth;
    t.emit[i] = emit;
  }
}

export const EQUIPMENT_GENERATORS: Record<string, Generator> = {
  fire,
  conduit_closed: (t) => conduitShell(t, false),
  conduit_open: (t) => conduitShell(t, true),
};
