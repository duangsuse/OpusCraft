// Fase 8.7: la textura del Wither, pintada aquí (nada copiado del juego): huesos negros de carbón con las aristas
// gris ceniza, costillas y espina con sus vértebras, y tres cráneos con las cuencas hundidas, un brillo pálido en el
// fondo de los ojos y los dientes. La variante 1 es la de invulnerable (al nacer y en las calaveras azules): los
// mismos huesos en un azul grisáceo que brilla un poco.
import type { Texel, Paint, Painter, RGB } from './mobTextures';
import { PX, NX, TOP, BOTTOM, FRONT, glow, rnd } from './mobTextures';

const BONE: RGB[] = [[20, 20, 22], [36, 36, 38], [54, 54, 56], [76, 76, 78], [104, 104, 106], [136, 136, 136]];
const BLUE: RGB[] = [[42, 54, 86], [62, 78, 116], [84, 104, 146], [110, 134, 176], [142, 166, 204], [182, 204, 232]];
const pick = (pal: readonly RGB[], k: number): RGB => pal[Math.max(0, Math.min(pal.length - 1, k))];

/** Cara de un cráneo (8 × 8 el del centro y la calavera, 6 × 6 los de los lados): cuencas, nariz y dientes. */
function skullFace(t: Texel, pal: readonly RGB[], blue: boolean, size: number): Paint | null {
  if (t.f !== FRONT) return null;
  const i = t.i, j = t.j;
  const s = size / 8;
  const eyeY = Math.round(3 * s), eyeL = Math.round(1 * s), eyeR = size - 1 - Math.round(2 * s);
  // Ceja: una franja oscura encima de las cuencas.
  if (j === eyeY - 1 && i >= eyeL && i <= eyeR + 1) return pick(pal, 0);
  // Cuencas de 2 × 2: negras con un punto de luz pálida en el fondo.
  const inEye = (x0: number) => i >= x0 && i <= x0 + 1 && j >= eyeY && j <= eyeY + 1;
  if (inEye(eyeL) || inEye(eyeR)) {
    if (j === eyeY + 1 && (i === eyeL + 1 || i === eyeR)) return blue ? glow([200, 230, 255]) : glow([188, 188, 170]);
    return [2, 2, 3];
  }
  // Nariz: un agujero en el centro.
  const mid = size / 2 - 0.5;
  if (j === eyeY + 2 && Math.abs(i - mid) < 0.6) return [6, 6, 8];
  // Dientes: fila de abajo, alternando claros y rendijas.
  if (j === size - 2) return i % 2 === 0 ? pick(pal, 4) : pick(pal, 0);
  if (j === size - 1) return pick(pal, 1);
  return null;
}

export function witherPainter(variant: number): Painter {
  const blue = variant === 1;
  const pal = blue ? BLUE : BONE;
  return (t: Texel): Paint => {
    const r = rnd(t, 9907);
    const head = t.part === 'center_head' || t.part === 'right_head' || t.part === 'left_head' || t.part === 'skull';
    let k = 2;
    if (head) {
      const face = skullFace(t, pal, blue, t.part === 'center_head' || t.part === 'skull' ? 8 : 6);
      if (face) return face;
      // Cráneo: la coronilla más clara, las mejillas en sombra y grietas sueltas.
      k = t.f === TOP ? 3 : t.f === BOTTOM ? 1 : 2;
      if ((t.f === PX || t.f === NX) && t.j > t.h - 3) k -= 1;
      if (r > 0.93) k -= 1;
      else if (r > 0.82) k += 1;
    } else if (t.part === 'shoulders') {
      // Clavícula: aristas claras arriba y un surco en el centro.
      k = t.f === TOP ? 3 : 2;
      if (t.f !== TOP && t.f !== BOTTOM && t.j === 0) k = 4;
      if (Math.abs(t.x - t.w / 2) < 1) k = 1;
    } else if (t.part === 'ribcage' || t.part === 'tail') {
      // Espina: vértebras cada 2 píxeles.
      k = Math.floor(t.y) % 2 === 0 ? 3 : 1;
      if (t.f === TOP || t.f === BOTTOM) k = 2;
    } else if (t.part.startsWith('rib')) {
      // Costillas: arista de arriba clara, las puntas más oscuras.
      k = t.f === TOP ? 4 : t.j === 0 ? 3 : 2;
      if (t.x < 1.5 || t.x > t.w - 1.5) k -= 1;
    }
    if (r > 0.97) k += 1;
    if (r < 0.05) k -= 1;
    const c = pick(pal, k);
    return blue && r > 0.9 ? glow(c) : c;
  };
}
