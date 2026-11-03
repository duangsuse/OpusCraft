// Qué bloques arrastra el agua o la lava al pasar (se rompen y sueltan su objeto), como la etiqueta
// washed_away_by_fluids de Java 26.3 (FlowingFluid.canHoldAnyFluid). Los que se pueden anegar (raíles, velas,
// corales, andamios, liquen, raíces colgantes, pepinos de mar…) no están: el agua que corre no entra en ellos.
// Todo lo demás (cubos, losas, vallas, puertas, carteles, escaleras de mano, caña de azúcar…) la detiene.
import { BLOCKS, BLOCK_BASE } from '../blocks';
import { MAX_BLOCK_ID } from '../constants';

const WASHED_KEYS = new Set([
  'acacia_button', 'acacia_sapling', 'allium', 'attached_melon_stem', 'attached_pumpkin_stem', 'azalea',
  'azure_bluet', 'bamboo_button', 'bamboo_sapling', 'beetroots', 'birch_button', 'birch_sapling', 'black_carpet',
  'blue_carpet', 'blue_orchid', 'brown_carpet', 'brown_mushroom', 'bush', 'cactus_flower', 'carrots', 'cave_vines',
  'cave_vines_plant', 'cherry_button', 'cherry_sapling', 'chorus_flower', 'chorus_plant', 'closed_eyeblossom',
  'cobweb', 'cocoa', 'comparator', 'copper_torch', 'copper_wall_torch', 'cornflower', 'creeper_head',
  'creeper_wall_head', 'crimson_button', 'crimson_fungus', 'crimson_roots', 'cyan_carpet', 'dandelion',
  'dark_oak_button', 'dark_oak_sapling', 'dead_bush', 'dragon_head', 'dragon_wall_head', 'end_rod', 'fern', 'fire',
  'firefly_bush', 'flower_pot', 'flowering_azalea', 'frogspawn', 'golden_dandelion', 'gray_carpet', 'green_carpet',
  'jungle_button', 'jungle_sapling', 'large_fern', 'leaf_litter', 'lever', 'light_blue_carpet', 'light_gray_carpet',
  'lilac', 'lily_of_the_valley', 'lily_pad', 'lime_carpet', 'magenta_carpet', 'mangrove_button', 'melon_stem',
  'moss_carpet', 'nether_sprouts', 'nether_wart', 'oak_button', 'oak_sapling', 'open_eyeblossom', 'orange_carpet',
  'orange_tulip', 'oxeye_daisy', 'pale_hanging_moss', 'pale_moss_carpet', 'pale_oak_button', 'pale_oak_sapling',
  'peony', 'piglin_head', 'piglin_wall_head', 'pink_carpet', 'pink_petals', 'pink_tulip', 'pitcher_crop',
  'pitcher_plant', 'player_head', 'player_wall_head', 'polished_blackstone_button', 'poplar_button',
  'poplar_sapling', 'poppy', 'potatoes', 'potted_acacia_sapling', 'potted_allium', 'potted_azalea_bush',
  'potted_azure_bluet', 'potted_bamboo', 'potted_birch_sapling', 'potted_blue_orchid', 'potted_brown_mushroom',
  'potted_cactus', 'potted_cherry_sapling', 'potted_closed_eyeblossom', 'potted_cornflower', 'potted_crimson_fungus',
  'potted_crimson_roots', 'potted_dandelion', 'potted_dark_oak_sapling', 'potted_dead_bush', 'potted_fern',
  'potted_flowering_azalea_bush', 'potted_golden_dandelion', 'potted_jungle_sapling', 'potted_lily_of_the_valley',
  'potted_mangrove_propagule', 'potted_oak_sapling', 'potted_open_eyeblossom', 'potted_orange_tulip',
  'potted_oxeye_daisy', 'potted_pale_oak_sapling', 'potted_pink_tulip', 'potted_poplar_sapling', 'potted_poppy',
  'potted_red_mushroom', 'potted_red_tulip', 'potted_spruce_sapling', 'potted_torchflower', 'potted_warped_fungus',
  'potted_warped_roots', 'potted_white_tulip', 'potted_wither_rose', 'powder_snow', 'pumpkin_stem', 'purple_carpet',
  'red_carpet', 'red_mushroom', 'red_shrub', 'red_tulip', 'redstone_torch', 'redstone_wall_torch', 'redstone_wire',
  'repeater', 'rose_bush', 'shelf_mushroom', 'short_dry_grass', 'short_grass', 'skeleton_skull',
  'skeleton_wall_skull', 'snow', 'soul_fire', 'soul_torch', 'soul_wall_torch', 'spore_blossom', 'spruce_button',
  'spruce_sapling', 'stone_button', 'straw_bed', 'sunflower', 'sweet_berry_bush', 'tall_dry_grass', 'tall_grass',
  'torch', 'torchflower', 'torchflower_crop', 'tripwire', 'tripwire_hook', 'twisting_vines', 'twisting_vines_plant',
  'vine', 'wall_torch', 'warped_button', 'warped_fungus', 'warped_roots', 'weeping_vines', 'weeping_vines_plant',
  'wheat', 'white_carpet', 'white_tulip', 'wildflowers', 'wither_rose', 'wither_skeleton_skull',
  'wither_skeleton_wall_skull', 'yellow_carpet', 'zombie_head', 'zombie_wall_head',
  // Nombres propios de VoxelCraft para los mismos bloques.
  'snow_layer', 'wheat_crop',
]);

let table: Uint8Array | null = null;

/** 1 si el fluido entra en el bloque (y lo arrastra). */
export function washedByFluids(): Uint8Array {
  if (table) return table;
  table = new Uint8Array(MAX_BLOCK_ID);
  for (const b of BLOCKS) {
    if (!b) continue;
    const base = BLOCKS[BLOCK_BASE[b.id]]?.key;
    if (WASHED_KEYS.has(b.key) || (base !== undefined && WASHED_KEYS.has(base))) table[b.id] = 1;
  }
  return table;
}
