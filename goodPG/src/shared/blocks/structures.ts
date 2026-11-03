// Bloques de las estructuras de la fase 5: generador de monstruos (mazmorras), telarañas (minas),
// arenisca cincelada y cortada (templos del desierto), ladrillos de piedra musgosos y agrietados
// (templos de la jungla y portales en ruinas), rocanegra y obsidiana llorosa (portales en ruinas).
// Se registran después de los del subsuelo (ids guardados).
import { family, R_CROSS, R_CUTOUT } from './registry';

/** Generador de monstruos: una jaula que invoca criaturas cuando hay un jugador cerca. */
export const MOB_SPAWNER = family('spawner', 'Generador de monstruos', [], () => ({
  all: 'spawner', render: R_CUTOUT, lightOpacity: 1, hardness: 5, tool: 'pickaxe', tier: 1, sound: 'metal', category: 'decoracion',
}));
/** Telaraña: frena mucho a quien la atraviesa. */
export const COBWEB = family('cobweb', 'Telaraña', [], () => ({
  all: 'cobweb', render: R_CROSS, solid: false, opaque: false, lightOpacity: 1, hardness: 4, tool: 'axe', sound: 'wool',
  category: 'decoracion', walkThrough: true,
}));
export const CHISELED_SANDSTONE = family('chiseled_sandstone', 'Arenisca cincelada', [], () => ({
  top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'chiseled_sandstone', hardness: 0.8, tool: 'pickaxe', tier: 1,
}));
export const CUT_SANDSTONE = family('cut_sandstone', 'Arenisca cortada', [], () => ({
  top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'cut_sandstone', hardness: 0.8, tool: 'pickaxe', tier: 1,
}));
export const MOSSY_STONE_BRICKS = family('mossy_stone_bricks', 'Ladrillos de piedra musgosos', [], () => ({
  all: 'mossy_stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1,
}));
export const CRACKED_STONE_BRICKS = family('cracked_stone_bricks', 'Ladrillos de piedra agrietados', [], () => ({
  all: 'cracked_stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1,
}));
export const NETHERRACK = family('netherrack', 'Rocanegra', [], () => ({
  all: 'netherrack', hardness: 0.4, tool: 'pickaxe', tier: 1, category: 'naturaleza', sound: 'netherrack',
}));
export const CRYING_OBSIDIAN = family('crying_obsidian', 'Obsidiana llorosa', [], () => ({
  all: 'crying_obsidian', hardness: 50, tool: 'pickaxe', tier: 4, emission: 10, category: 'naturaleza',
}));
