// Bloques de trabajo de los aldeanos (fase 6): cada uno da una profesión al aldeano libre más cercano.
// Atril (bibliotecario), mesa de cartografía (cartógrafo), mesa de flechas (flechero), barril
// (pescador; guarda cosas como un cofre), telar (pastor), afiladora (herrero de armas), mesa de
// herrería (herrero) y caldero (peletero). Se registran al final (ids guardados).
import { family, L, R_MODEL, type BlockDef } from './registry';
import { mbox } from '../blockModels';

type Tex = BlockDef['tex'];

/** Cubo con arriba, abajo, lados (+X/-X), frente (-Z) y espalda (+Z). */
function sides(top: string, bottom: string, side: string, front = side, back = front): Tex {
  return [side, side, top, bottom, back, front];
}

/** Atril: base, poste y tablero inclinado para el libro. */
export const LECTERN = family('lectern', 'Atril', [], () => {
  const top = L('lectern_top'), side = L('lectern_side'), front = L('lectern_front'), base = L('oak_planks');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 2.5, tool: 'axe', sound: 'wood', category: 'decoracion',
    top: 'lectern_top', side: 'lectern_side', bottom: 'oak_planks',
    model: [
      mbox(0, 0, 0, 16, 2, 16, [base, base, base, base, base, base]),
      mbox(4, 2, 4, 12, 13, 12, [front, front, -1, -1, front, front]),
      mbox(0, 13, 1, 16, 16, 15, [side, side, top, base, side, side]),
    ],
    collision: [0, 0, 0, 1, 2 / 16, 1, 4 / 16, 2 / 16, 4 / 16, 12 / 16, 1, 12 / 16],
    selection: [0, 0, 0, 1, 1, 1],
  };
});

/** Mesa de cartografía: tablero con un mapa y una brújula. */
export const CARTOGRAPHY_TABLE = family('cartography_table', 'Mesa de cartografía', [], () => ({
  tex: ['cartography_table_side1', 'cartography_table_side1', 'cartography_table_top', 'dark_oak_planks',
    'cartography_table_side2', 'cartography_table_side2'] as Tex,
  hardness: 2.5, tool: 'axe', sound: 'wood', category: 'decoracion',
}));

/** Mesa de flechas: abedul con plumas y pedernal. */
export const FLETCHING_TABLE = family('fletching_table', 'Mesa de flechas', [], () => ({
  tex: sides('fletching_table_top', 'birch_planks', 'fletching_table_side', 'fletching_table_front'),
  hardness: 2.5, tool: 'axe', sound: 'wood', category: 'decoracion',
}));

/** Barril: guarda 27 pilas como un cofre (y da trabajo de pescador). */
export const BARREL = family('barrel', 'Barril', [], () => ({
  tex: sides('barrel_top', 'barrel_bottom', 'barrel_side'),
  hardness: 2.5, tool: 'axe', sound: 'wood', category: 'decoracion',
}));

/** Telar: bastidor con hilos. */
export const LOOM = family('loom', 'Telar', [], () => ({
  tex: sides('loom_top', 'oak_planks', 'loom_side', 'loom_front'),
  hardness: 2.5, tool: 'axe', sound: 'wood', category: 'decoracion',
}));

/** Afiladora: rueda de piedra entre dos patas de madera. */
export const GRINDSTONE = family('grindstone', 'Afiladora', [], () => {
  const face = L('grindstone_side'), round = L('grindstone_round'), leg = L('dark_oak_planks');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 2, tool: 'pickaxe', sound: 'stone', category: 'decoracion',
    side: 'grindstone_side', top: 'grindstone_round', bottom: 'dark_oak_planks',
    model: [
      mbox(1, 0, 6, 3, 10, 10, leg), mbox(13, 0, 6, 15, 10, 10, leg),
      mbox(3, 6, 6, 4, 10, 10, leg), mbox(12, 6, 6, 13, 10, 10, leg),
      mbox(4, 4, 2, 12, 16, 14, [face, face, round, round, round, round]),
    ],
    collision: [1 / 16, 0, 2 / 16, 15 / 16, 1, 14 / 16],
    selection: [1 / 16, 0, 2 / 16, 15 / 16, 1, 14 / 16],
  };
});

/** Mesa de herrería: plancha de hierro sobre madera oscura. */
export const SMITHING_TABLE = family('smithing_table', 'Mesa de herrería', [], () => ({
  tex: sides('smithing_table_top', 'dark_oak_planks', 'smithing_table_side', 'smithing_table_front'),
  hardness: 2.5, tool: 'axe', sound: 'wood', category: 'decoracion',
}));

/** Caldero: olla de hierro hueca sobre cuatro patas. */
export const CAULDRON = family('cauldron', 'Caldero', [], () => {
  const out = L('cauldron_side'), inner = L('cauldron_inner'), top = L('cauldron_top'), bottom = L('cauldron_bottom');
  // Paredes: la cara que da al interior usa la textura de dentro.
  const wx0 = [inner, out, top, bottom, out, out]; // pared oeste (su +X mira dentro)
  const wx1 = [out, inner, top, bottom, out, out];
  const wz0 = [out, out, top, bottom, inner, out]; // pared norte (su +Z mira dentro)
  const wz1 = [out, out, top, bottom, out, inner];
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 2, tool: 'pickaxe', sound: 'metal', category: 'decoracion',
    side: 'cauldron_side', top: 'cauldron_top', bottom: 'cauldron_bottom',
    model: [
      mbox(0, 3, 0, 2, 16, 16, wx0), mbox(14, 3, 0, 16, 16, 16, wx1),
      mbox(2, 3, 0, 14, 16, 2, wz0), mbox(2, 3, 14, 14, 16, 16, wz1),
      mbox(2, 3, 2, 14, 4, 14, [-1, -1, inner, bottom, -1, -1]),
      mbox(0, 0, 0, 4, 3, 2, out), mbox(0, 0, 2, 2, 3, 4, out),
      mbox(12, 0, 0, 16, 3, 2, out), mbox(14, 0, 2, 16, 3, 4, out),
      mbox(0, 0, 14, 4, 3, 16, out), mbox(0, 0, 12, 2, 3, 14, out),
      mbox(12, 0, 14, 16, 3, 16, out), mbox(14, 0, 12, 16, 3, 14, out),
    ],
    collision: [0, 0, 0, 1, 4 / 16, 1, 0, 0, 0, 2 / 16, 1, 1, 14 / 16, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 2 / 16, 0, 0, 14 / 16, 1, 1, 1],
    selection: [0, 0, 0, 1, 1, 1],
  };
});

/** Todos los bloques de trabajo nuevos (para el inventario creativo y las aldeas). */
export const VILLAGER_BLOCKS: readonly number[] = [
  LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE, SMITHING_TABLE, CAULDRON,
];

export const isBarrel = (id: number): boolean => id === BARREL;
