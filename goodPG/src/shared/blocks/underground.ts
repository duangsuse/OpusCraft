// Bloques del subsuelo (fase 5): pizarra profunda y sus menas, tufo, cobre y esmeralda, cuevas
// frondosas (musgo, azaleas y enredaderas luminosas con bayas), cuevas de goteo (espeleotemas) y
// geodas de amatista (basalto liso, calcita, amatista que crece). Se registran después de los
// bloques de los biomas (ids guardados).
import { family, L, BLOCK_OPAQUE, BLOCK_SOLID, R_CROSS, R_MODEL, R_TRANSLUCENT, type Opts } from './registry';
import { COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE } from './classic';
import { addMaterialShapes } from './building';
import { mbox } from '../blockModels';

const rock = (tex: string, hardness: number, o: Opts = {}): Opts => ({
  all: tex, hardness, tool: 'pickaxe', tier: 1, category: 'naturaleza', ...o,
});

// ------------------------------------------------------------------ pizarra profunda y rocas

export const DEEPSLATE = family('deepslate', 'Pizarra profunda', [], () => rock('deepslate', 3, { top: 'deepslate_top', side: 'deepslate' }));
export const COBBLED_DEEPSLATE = family('cobbled_deepslate', 'Pizarra profunda rocosa', [], () => rock('cobbled_deepslate', 3.5, { category: 'construccion' }));
export const TUFF = family('tuff', 'Toba', [], () => rock('tuff', 1.5));
export const CALCITE = family('calcite', 'Calcita', [], () => rock('calcite', 0.75));
export const SMOOTH_BASALT = family('smooth_basalt', 'Basalto liso', [], () => rock('smooth_basalt', 1.25));
export const DRIPSTONE_BLOCK = family('dripstone_block', 'Bloque de espeleotema', [], () => rock('dripstone_block', 1.5));
addMaterialShapes({
  key: 'cobbled_deepslate', name: 'de pizarra profunda rocosa', block: COBBLED_DEEPSLATE, hardness: 3.5, tool: 'pickaxe', tier: 1,
  sound: 'stone',
});

// ------------------------------------------------------------------ menas

const ore = (tex: string, hardness: number, tier: number): Opts => ({ all: tex, hardness, tool: 'pickaxe', tier, category: 'minerales' });
export const COPPER_ORE = family('copper_ore', 'Mena de cobre', [], () => ore('copper_ore', 3, 2));
export const EMERALD_ORE = family('emerald_ore', 'Mena de esmeralda', [], () => ore('emerald_ore', 3, 3));

/** Menas de pizarra profunda: la mena normal → su versión en pizarra (y al revés). */
export const DEEPSLATE_ORE: Record<number, number> = {};
export const SURFACE_ORE: Record<number, number> = {};
const DEEP_ORES: [number, string, string, number][] = [
  [COAL_ORE, 'coal', 'carbón', 1], [IRON_ORE, 'iron', 'hierro', 2], [COPPER_ORE, 'copper', 'cobre', 2],
  [GOLD_ORE, 'gold', 'oro', 3], [REDSTONE_ORE, 'redstone', 'redstone', 3], [LAPIS_ORE, 'lapis', 'lapislázuli', 2],
  [DIAMOND_ORE, 'diamond', 'diamante', 3], [EMERALD_ORE, 'emerald', 'esmeralda', 3],
];
for (const [base, key, name, tier] of DEEP_ORES) {
  const id = family(`deepslate_${key}_ore`, `Mena de ${name} de pizarra profunda`, [], () => ore(`deepslate_${key}_ore`, 4.5, tier));
  DEEPSLATE_ORE[base] = id;
  SURFACE_ORE[id] = base;
}
export const EMERALD_BLOCK = family('emerald_block', 'Bloque de esmeralda', [], () => ({
  all: 'emerald_block', hardness: 5, tool: 'pickaxe', tier: 3, sound: 'metal', category: 'minerales',
}));

// ------------------------------------------------------------------ cuevas frondosas

const needsFloor = (get: (dx: number, dy: number, dz: number) => number): boolean => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1;
};

export const MOSS_BLOCK = family('moss_block', 'Bloque de musgo', [], () => ({
  all: 'moss_block', hardness: 0.1, tool: 'axe', sound: 'grass', category: 'naturaleza',
}));
export const MOSS_CARPET = family('moss_carpet', 'Alfombra de musgo', [], () => {
  const t = L('moss_block');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.1, sound: 'grass', all: 'moss_block', category: 'naturaleza',
    model: [mbox(0, 0, 0, 16, 1, 16, t)], collision: [0, 0, 0, 1, 1 / 16, 1], support: needsFloor,
  };
});
const plant = (tex: string): Opts => ({
  render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, all: tex, category: 'naturaleza',
});
export const AZALEA = family('azalea', 'Azalea', [], () => plant('azalea'));
export const FLOWERING_AZALEA = family('flowering_azalea', 'Azalea florida', [], () => plant('flowering_azalea'));

/** Enredaderas de cueva: cuelgan del techo o de otra, y con bayas dan luz. */
export const CAVE_VINES = family('cave_vines', 'Enredaderas de cueva', [['berries', 2]], (st) => ({
  ...plant(st.berries ? 'cave_vines_lit' : 'cave_vines'),
  emission: st.berries ? 14 : 0,
  climbable: true,
  noItem: true,
  support: (get) => {
    const above = get(0, 1, 0);
    return above < 0 || BLOCK_OPAQUE[above] === 1 || isCaveVines(above);
  },
}));
export const isCaveVines = (id: number): boolean => id === CAVE_VINES || id === CAVE_VINES + 1;

// ------------------------------------------------------------------ cuevas de goteo

/**
 * Espeleotema puntiagudo: `dir` 0 hacia arriba (estalagmita) o 1 hacia abajo (estalactita);
 * `part` 0 punta, 1 tramo medio, 2 base.
 */
export const POINTED_DRIPSTONE = family('pointed_dripstone', 'Espeleotema puntiagudo', [['dir', 2], ['part', 3]], (st) => {
  const t = L('pointed_dripstone');
  const w = [3, 5, 6][st.part];
  const a = 8 - w / 2, b = 8 + w / 2;
  const box = st.part === 0 ? (st.dir === 0 ? mbox(a, 0, a, b, 11, b, t) : mbox(a, 5, a, b, 16, b, t)) : mbox(a, 0, a, b, 16, b, t);
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 1.5, tool: 'pickaxe', sound: 'stone', category: 'naturaleza',
    all: 'pointed_dripstone', model: [box],
    collision: [a / 16, box.y0 / 16, a / 16, b / 16, box.y1 / 16, b / 16],
    flatItem: 'pointed_dripstone',
    support: (get) => {
      const n = get(0, st.dir === 0 ? -1 : 1, 0);
      return n < 0 || BLOCK_SOLID[n] === 1;
    },
  };
});

// ------------------------------------------------------------------ geodas de amatista

export const AMETHYST_BLOCK = family('amethyst_block', 'Bloque de amatista', [], () => ({
  all: 'amethyst_block', hardness: 1.5, tool: 'pickaxe', sound: 'glass', category: 'minerales',
}));
export const BUDDING_AMETHYST = family('budding_amethyst', 'Amatista con brotes', [], () => ({
  all: 'budding_amethyst', hardness: 1.5, tool: 'pickaxe', sound: 'glass', category: 'minerales',
}));
/** Brotes de amatista que crecen sobre la amatista con brotes: 0 pequeño, 1 mediano, 2 grande, 3 racimo. */
export const AMETHYST_BUD = family('amethyst_bud', 'Racimo de amatista', [['stage', 4]], (st) => ({
  ...plant(['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'][st.stage]),
  sound: 'glass', hardness: 1.5, tool: 'pickaxe', category: 'minerales', emission: [1, 2, 4, 5][st.stage],
  support: needsFloor,
}));

/** Cristal tintado: deja ver a través pero no pasa la luz. */
export const TINTED_GLASS = family('tinted_glass', 'Cristal tintado', [], () => ({
  all: 'tinted_glass', render: R_TRANSLUCENT, lightOpacity: 15, hardness: 0.3, sound: 'glass',
}));
