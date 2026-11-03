// Fase 7.5 (mansión): marcas de destino de los mapas de estructura, pintadas a mano en 16×16 (como las
// de Minecraft, pero propias): la X roja del tesoro, una mansión de roble oscuro con el tejado a dos
// aguas y ventanas encendidas, y un monumento oceánico escalonado de prismarina.
import type { StructureMapMarker } from '../../shared/structureMapData';

const cache = new Map<string, string>();

/** Tejado, pared y marco de la casita de cada clase de aldea. */
const VILLAGE_COLORS: Record<string, [string, string, string]> = {
  village_plains: ['#6b4a2b', '#b08c56', '#5a3f24'],
  village_desert: ['#c9a86a', '#e3d3a0', '#b5703a'],
  village_savanna: ['#a8542c', '#c9763f', '#6d5a4a'],
  village_snowy: ['#f2f6f8', '#6d5234', '#3f2f1f'],
  village_taiga: ['#3f2c1b', '#6d5234', '#2e2014'],
};

/** Imagen (data URL) de la marca de un mapa de estructura. */
export function structureMarkIcon(marker: StructureMapMarker): string {
  let url = cache.get(marker);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  if (marker === 'x') {
    // X roja de dos trazos gruesos, con un borde oscuro.
    for (let k = 1; k < 15; k++) {
      px(k - 1, k - 1, 3, 3, '#4a0d0a');
      px(14 - k, k - 1, 3, 3, '#4a0d0a');
    }
    for (let k = 2; k < 14; k++) {
      px(k, k, 2, 2, '#c8261c');
      px(14 - k, k, 2, 2, '#c8261c');
    }
  } else if (marker === 'mansion') {
    // Silueta negra, tejado oscuro, fachada marrón y ventanas amarillas.
    for (let k = 0; k < 5; k++) px(8 - k, 1 + k, 2 * k + 1, 1, '#1c120b');
    px(1, 5, 14, 1, '#1c120b');
    for (let k = 0; k < 4; k++) px(7 - k, 2 + k, 2 + 2 * k, 1, '#3d281a');
    px(1, 6, 14, 9, '#1c120b');
    px(2, 6, 12, 8, '#5b3b22');
    px(2, 10, 12, 1, '#3d281a');
    for (const x of [3, 6, 9, 12]) {
      px(x, 7, 1, 2, '#f0d878');
      px(x, 11, 1, 2, '#f0d878');
    }
    px(7, 11, 2, 3, '#2a1a0e');
  } else if (marker.startsWith('village_')) {
    // Casita de la aldea con los colores de su clase: tejado, pared y marco.
    const [roof, wall, frame] = VILLAGE_COLORS[marker] ?? VILLAGE_COLORS.village_plains;
    for (let k = 0; k < 6; k++) px(7 - k, 2 + k, 2 + 2 * k, 1, '#1c120b');
    for (let k = 0; k < 5; k++) px(7 - k, 3 + k, 2 + 2 * k, 1, roof);
    px(2, 8, 12, 7, '#1c120b');
    px(3, 8, 10, 6, wall);
    px(3, 8, 1, 6, frame);
    px(12, 8, 1, 6, frame);
    px(7, 10, 2, 4, '#2a1a0e');
    px(4, 9, 2, 2, '#f0d878');
    px(10, 9, 2, 2, '#f0d878');
  } else if (marker === 'swamp_hut') {
    // Cabaña de la bruja sobre pilotes: tejado de abeto, paredes oscuras y una ventana verde.
    for (let k = 0; k < 5; k++) px(7 - k, 1 + k, 2 + 2 * k, 1, '#1b1410');
    for (let k = 0; k < 4; k++) px(7 - k, 2 + k, 2 + 2 * k, 1, '#3f2c1b');
    px(2, 6, 12, 6, '#1b1410');
    px(3, 6, 10, 5, '#4e3a24');
    px(5, 7, 2, 2, '#7fd26a');
    px(9, 7, 2, 4, '#1b1410');
    for (const x of [3, 7, 12]) px(x, 12, 1, 3, '#2b1f14');
    px(1, 14, 14, 1, '#2f4a2c');
  } else if (marker === 'jungle_temple') {
    // Templo de piedra musgosa escalonado con la entrada oscura.
    const steps: [number, number][] = [[5, 2], [3, 6], [1, 10]];
    for (const [x, y] of steps) px(x, y, 16 - 2 * x, 4, '#2b3326');
    for (const [x, y] of steps) px(x + 1, y + 1, 14 - 2 * x, 3, '#7c8a6a');
    for (const [x, y] of [[4, 8], [9, 11], [7, 4], [12, 12]] as const) px(x, y, 2, 1, '#4f7a38');
    px(6, 11, 4, 4, '#141a10');
  } else if (marker === 'trial_chambers') {
    // Cámara de toba y cobre: bloque ancho con una rejilla de cobre.
    px(1, 3, 14, 12, '#2c2a28');
    px(2, 4, 12, 10, '#6b6964');
    px(2, 4, 12, 2, '#c07a4e');
    for (const x of [4, 7, 10]) px(x, 7, 2, 5, '#b86b3f');
    px(6, 11, 4, 3, '#1d1b1a');
  } else {
    // Pirámide escalonada verde azulada con la entrada oscura.
    const steps: [number, number][] = [[7, 2], [5, 5], [3, 8], [1, 11]];
    for (const [x, y] of steps) px(x, y, 16 - 2 * x, 3, '#16403d');
    for (const [x, y] of steps) px(x + 1, y + 1, 14 - 2 * x, 2, '#46a89c');
    px(1, 14, 14, 1, '#16403d');
    px(6, 11, 4, 3, '#0d2624');
    px(7, 3, 2, 1, '#9fe3d8');
  }
  url = c.toDataURL();
  cache.set(marker, url);
  return url;
}
