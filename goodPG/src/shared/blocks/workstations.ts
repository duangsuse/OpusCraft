// Bloques de trabajo de la fase 4: mitades del cofre doble, ahumador y alto horno (hornos rápidos
// para comida y para minerales), fogata (cocina y alumbra) y cortapiedras.
// (Se registran después de la decoración para no mover los ids guardados.)
import { family, L, R_MODEL, type BlockDef, type Opts } from './registry';
import { CHEST } from './classic';
import { mbox, rotateBoxes, rotateFlat, DIR_FACE } from '../blockModels';

// ------------------------------------------------------------------ cofre doble

/**
 * Mitad de un cofre doble: `facing` como el cofre y `side` 0 = mitad izquierda (vista de frente; su
 * pareja está a su derecha) y 1 = mitad derecha. El frente y la trasera se dibujan unidos.
 */
export const CHEST_DOUBLE = family('chest_double', 'Cofre', [['facing', 4], ['side', 2]], (st) => {
  const tex: BlockDef['tex'] = ['chest_side', 'chest_side', 'chest_top', 'chest_top', 'chest_side', 'chest_side'];
  tex[DIR_FACE[st.facing]] = st.side === 0 ? 'chest_front_seam_right' : 'chest_front_seam_left';
  tex[DIR_FACE[(st.facing + 2) & 3]] = st.side === 0 ? 'chest_side_seam_left' : 'chest_side_seam_right';
  return { tex, hardness: 2.5, tool: 'axe', sound: 'wood', category: null, base: CHEST };
});

/** Dirección (0..3) en la que está la pareja de una mitad de cofre doble. */
export function chestPartnerDir(facing: number, side: number): number {
  // Mirando el frente, la derecha del que mira es (facing + 3) & 3.
  return side === 0 ? (facing + 3) & 3 : (facing + 1) & 3;
}

// ------------------------------------------------------------------ ahumador y alto horno

function fastFurnace(key: string, name: string): number {
  return family(key, name, [['facing', 4], ['lit', 2]], (st) => {
    const tex: BlockDef['tex'] = [`${key}_side`, `${key}_side`, `${key}_top`, `${key}_top`, `${key}_side`, `${key}_side`];
    tex[DIR_FACE[st.facing]] = st.lit ? `${key}_front_lit` : `${key}_front`;
    return { tex, hardness: 3.5, tool: 'pickaxe', tier: 1, sound: 'stone', emission: st.lit ? 13 : 0, category: 'decoracion' };
  });
}
/** Ahumador: sólo comida, el doble de rápido. */
export const SMOKER = fastFurnace('smoker', 'Ahumador');
/** Alto horno: sólo minerales y metal, el doble de rápido. */
export const BLAST_FURNACE = fastFurnace('blast_furnace', 'Alto horno');

// ------------------------------------------------------------------ fogata

/** Fogata: cuatro troncos cruzados, brasas y llamas si está encendida. */
export const CAMPFIRE = family('campfire', 'Fogata', [['lit', 2]], (st) => campfireOpts(st.lit === 1, false));

/** Fase 8.5: la fogata y la de almas (fuego turquesa, luz 10) son el mismo modelo con otras texturas. */
export function campfireOpts(lit: boolean, soul: boolean): Opts {
  const p = soul ? 'soul_campfire' : 'campfire';
  const log = L('oak_log_side'), end = L('oak_log_top'), litLog = L(lit ? `${p}_log_lit` : 'oak_log_side');
  const fire = L(`${p}_fire`), ash = L(lit ? `${p}_embers` : 'campfire_ash');
  // Troncos de abajo a lo largo de X y de arriba a lo largo de Z; brasas en el centro.
  const along = [end, end, log, log, litLog, litLog];
  const across = [litLog, litLog, log, log, end, end];
  const model = [
    mbox(0, 0, 1, 16, 4, 5, along), mbox(0, 0, 11, 16, 4, 15, along),
    mbox(1, 3, 0, 5, 7, 16, across), mbox(11, 3, 0, 15, 7, 16, across),
    mbox(5, 0, 5, 11, 1, 11, [-1, -1, ash, -1, -1, -1]),
  ];
  if (lit) {
    // Llamas: dos planos cruzados.
    model.push(mbox(8, 1, 2, 8, 16, 14, [fire, fire, -1, -1, -1, -1]), mbox(2, 1, 8, 14, 16, 8, [-1, -1, -1, -1, fire, fire]));
  }
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, emission: lit ? (soul ? 10 : 15) : 0, hardness: 2, tool: 'axe', sound: 'wood',
    category: 'decoracion', side: 'oak_log_side', top: 'oak_log_top', model,
    collision: [0, 0, 0, 1, 7 / 16, 1], selection: [0, 0, 0, 1, 7 / 16, 1],
  };
}

// ------------------------------------------------------------------ cortapiedras

/** Cortapiedras: base de piedra y la sierra girada según hacia dónde mira. */
export const STONECUTTER = family('stonecutter', 'Cortapiedras', [['facing', 4]], (st) => {
  const side = L('stonecutter_side'), top = L('stonecutter_top'), bottom = L('stonecutter_bottom'), saw = L('stonecutter_saw');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 3.5, tool: 'pickaxe', tier: 1, sound: 'stone',
    category: 'decoracion', side: 'stonecutter_side', top: 'stonecutter_top', bottom: 'stonecutter_bottom',
    model: [
      mbox(0, 0, 0, 16, 9, 16, [side, side, top, bottom, side, side]),
      ...rotateBoxes([mbox(8, 9, 1, 8, 16, 15, [saw, saw, -1, -1, -1, -1])], st.facing),
    ],
    collision: [0, 0, 0, 1, 9 / 16, 1],
    selection: rotateFlat([0, 0, 0, 1, 9 / 16, 1], st.facing),
  };
});
