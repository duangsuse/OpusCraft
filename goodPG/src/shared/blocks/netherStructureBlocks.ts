// Fase 8.4 (estructuras del Nether): la verruga del Nether plantada (NetherWartBlock): cuatro edades que crecen
// sólo sobre arena de alma (una de cada diez veces que le toca un tick aleatorio, sin polvo de hueso) y mide
// 5, 8, 11 y 14 píxeles; se dibuja con tres texturas (la segunda sirve a las edades 1 y 2). Crece en las salas
// de cultivo de las fortalezas y se planta con la verruga.
import { family, R_CROP, type NeighborGet } from './registry';
import { SOUL_SAND } from './deepDarkBlocks';

/** Edad máxima de la verruga del Nether. */
export const NETHER_WART_MAX_AGE = 3;

export const NETHER_WART_CROP = family('nether_wart', 'Verruga del Nether', [['age', 4]], (st) => ({
  render: R_CROP, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, category: null, noItem: true,
  all: `nether_wart_stage${st.age === 0 ? 0 : st.age < 3 ? 1 : 2}`, selection: [0, 0, 0, 1, (5 + st.age * 3) / 16, 1],
  support: (get: NeighborGet) => get(0, -1, 0) === SOUL_SAND,
}));

/** ¿Es la verruga del Nether plantada (cualquier edad)? */
export function isNetherWartCrop(id: number): boolean {
  return id >= NETHER_WART_CROP && id <= NETHER_WART_CROP + NETHER_WART_MAX_AGE;
}
