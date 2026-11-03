// Bloques del clima (fase 5): capas de nieve que se acumulan cuando nieva en los biomas fríos y que
// se pueden apilar a mano (hasta 8 capas = un bloque). Se registran después de los de estructuras.
import { family, L, BLOCK_OPAQUE, R_MODEL } from './registry';
import { isLeaves } from './biomes';
import { mbox } from '../blockModels';

/** Capa de nieve: `layers` 0..7 = de 1 a 8 capas de 2/16 de alto. */
export const SNOW_LAYER = family('snow_layer', 'Capa de nieve', [['layers', 8]], (st) => {
  const n = st.layers + 1;
  const t = L('snow');
  return {
    render: R_MODEL, opaque: false, lightOpacity: n >= 8 ? 15 : 0, hardness: 0.1, tool: 'shovel', sound: 'snow', all: 'snow',
    category: 'naturaleza', replaceable: n === 1, solid: n > 1, walkThrough: n === 1,
    model: [mbox(0, 0, 0, 16, n * 2, 16, t)],
    // Como en Minecraft: con una capa se pasa a través; con más, se pisa una capa por debajo.
    collision: n === 1 ? [] : [0, 0, 0, 1, ((n - 1) * 2) / 16, 1],
    selection: [0, 0, 0, 1, (n * 2) / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_OPAQUE[b] === 1 || isLeaves(b) || b === SNOW_LAYER + 7;
    },
  };
});
export const isSnowLayer = (id: number): boolean => id >= SNOW_LAYER && id < SNOW_LAYER + 8;
