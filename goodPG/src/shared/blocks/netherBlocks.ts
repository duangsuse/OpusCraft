// Fase 8 (dimensiones): el portal del Nether y los bloques de los desiertos del Nether.
// - Portal del Nether: el velo violeta que llena un marco de obsidiana encendido (`axis` 0 a lo largo de
//   x, 1 a lo largo de z). No se pica ni choca; se deshace cuando se rompe el marco (sim/server/portals.ts).
// - Menas de cuarzo y de oro del Nether y bloque de magma (quema a quien lo pisa sin agacharse).
// Se registran los últimos (export * al final de index.ts): no mueven ids.
import { family, familyBase, L, R_MODEL } from './registry';
import { mbox } from '../blockModels';

const INVENTORY: number[] = [];

/** Portal del Nether (una lámina de 4/16 de grueso en el plano de su marco). */
export const NETHER_PORTAL = family('nether_portal', 'Portal del Nether', [['axis', 2]], (st) => {
  const t = L('nether_portal');
  const box = st.axis === 0 ? mbox(0, 0, 6, 16, 16, 10, t) : mbox(6, 0, 0, 10, 16, 16, t);
  return {
    render: R_MODEL, all: 'nether_portal', model: [box], solid: false, opaque: false, lightOpacity: 0, emission: 11,
    hardness: -1, breakable: false, sound: 'glass', noItem: true, category: null, walkThrough: true,
  };
});

export const NETHER_QUARTZ_ORE = family('nether_quartz_ore', 'Mena de cuarzo del Nether', [], () => ({
  all: 'nether_quartz_ore', hardness: 3, tool: 'pickaxe', tier: 1, category: 'minerales', sound: 'nether_ore',
}));
export const NETHER_GOLD_ORE = family('nether_gold_ore', 'Mena de oro del Nether', [], () => ({
  all: 'nether_gold_ore', hardness: 3, tool: 'pickaxe', tier: 1, category: 'minerales', sound: 'nether_ore',
}));
export const MAGMA_BLOCK = family('magma_block', 'Bloque de magma', [], () => ({
  all: 'magma', hardness: 0.5, tool: 'pickaxe', tier: 1, emission: 3, category: 'naturaleza',
}));
INVENTORY.push(NETHER_QUARTZ_ORE, NETHER_GOLD_ORE, MAGMA_BLOCK);

/** Bloques de esta fase en el orden del inventario creativo. */
export const NETHER_INVENTORY: readonly number[] = INVENTORY;

export function isNetherPortal(id: number): boolean {
  return familyBase(id) === NETHER_PORTAL;
}

/** Eje del portal (0 a lo largo de x, 1 a lo largo de z). */
export function portalAxis(id: number): number {
  return id - NETHER_PORTAL;
}
