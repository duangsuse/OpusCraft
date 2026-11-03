// Lista de texturas de bloques. El índice en este array es la capa (layer) de la
// TEXTURE_2D_ARRAY en la GPU. Las propiedades describen cómo las trata el shader.
//
// tint:    0 = sin tinte, 1 = tinte de hierba del bioma (textura en escala de grises),
//          2 = tinte de hierba sólo donde alpha = 255 (máscara en el canal alpha; bloque opaco),
//          3 = tinte de follaje del bioma (textura en escala de grises).
// wave:    0 = estático, 1 = hojas (oscilación suave de todo el bloque),
//          2 = planta (los vértices superiores se mueven con el viento).
// sss:     0..1 cantidad de dispersión subsuperficial (luz que atraviesa hojas/plantas).
// special: 0 = normal, 1 = agua, 2 = lava, 3 = hielo (translúcido),
//          4 = cristal de color (translúcido, sin la absorción azulada del hielo; Fase 6.5).
// cutout:  true si la textura usa alpha 0/255 como recorte (hojas, plantas, cristal...).

import { PAINTING_TEXTURES } from './paintings'; // Fase 6.5 (decoración)

export interface TextureDef {
  name: string;
  tint?: 0 | 1 | 2 | 3;
  wave?: 0 | 1 | 2;
  sss?: number;
  special?: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Fase 6.5 (equipo): 5 = fuego (llamas que suben y ondulan). Fase 8.6: 6 = portal del End (estrellas)
  cutout?: boolean;
}

// Fase 6.5 (colores): los 16 colores de Minecraft (en su orden) y los que ya tenían lana o terracota.
const COLOR_KEYS_65 = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black',
];
const OLD_WOOL_65 = ['white', 'black', 'red', 'orange', 'yellow', 'lime', 'blue', 'purple'];
const OLD_TERRACOTTA_65 = ['white', 'orange', 'yellow', 'brown', 'red', 'light_gray'];

export const TEXTURE_DEFS: readonly TextureDef[] = [
  // Piedras
  { name: 'stone' },
  { name: 'cobblestone' },
  { name: 'mossy_cobblestone' },
  { name: 'stone_bricks' },
  { name: 'granite' },
  { name: 'diorite' },
  { name: 'andesite' },
  { name: 'bedrock' },
  { name: 'obsidian' },
  // Suelos
  { name: 'dirt' },
  { name: 'grass_top', tint: 1 },
  { name: 'grass_side', tint: 2 },
  { name: 'grass_side_snowy' },
  { name: 'snow', sss: 0.25 },
  { name: 'ice', special: 3 },
  { name: 'sand' },
  { name: 'gravel' },
  { name: 'clay' },
  { name: 'sandstone_top' },
  { name: 'sandstone_side' },
  { name: 'sandstone_bottom' },
  { name: 'terracotta' },
  // Madera
  { name: 'oak_log_side' },
  { name: 'oak_log_top' },
  { name: 'oak_planks' },
  { name: 'oak_leaves', tint: 3, wave: 1, sss: 0.85, cutout: true },
  { name: 'birch_log_side' },
  { name: 'birch_log_top' },
  { name: 'birch_planks' },
  { name: 'birch_leaves', wave: 1, sss: 0.85, cutout: true },
  { name: 'spruce_log_side' },
  { name: 'spruce_log_top' },
  { name: 'spruce_planks' },
  { name: 'spruce_leaves', wave: 1, sss: 0.7, cutout: true },
  // Plantas
  { name: 'short_grass', tint: 1, wave: 2, sss: 0.8, cutout: true },
  { name: 'fern', tint: 1, wave: 2, sss: 0.8, cutout: true },
  { name: 'poppy', wave: 2, sss: 0.7, cutout: true },
  { name: 'dandelion', wave: 2, sss: 0.7, cutout: true },
  { name: 'cornflower', wave: 2, sss: 0.7, cutout: true },
  { name: 'dead_bush', wave: 2, sss: 0.3, cutout: true },
  { name: 'sugar_cane', sss: 0.5, cutout: true },
  { name: 'red_mushroom', sss: 0.3, cutout: true },
  { name: 'brown_mushroom', sss: 0.3, cutout: true },
  { name: 'cactus_side', sss: 0.2 },
  { name: 'cactus_top', sss: 0.2, cutout: true },
  { name: 'cactus_bottom', cutout: true },
  // Líquidos
  { name: 'water', special: 1 },
  { name: 'lava', special: 2 },
  // Minerales
  { name: 'coal_ore' },
  { name: 'iron_ore' },
  { name: 'gold_ore' },
  { name: 'diamond_ore' },
  { name: 'lapis_ore' },
  { name: 'redstone_ore' },
  // Luz
  { name: 'torch', cutout: true },
  { name: 'glowstone' },
  { name: 'sea_lantern' },
  // Construcción
  { name: 'bricks' },
  { name: 'glass', cutout: true },
  { name: 'bookshelf' },
  { name: 'crafting_table_top' },
  { name: 'crafting_table_side' },
  { name: 'crafting_table_front' },
  { name: 'pumpkin_top' },
  { name: 'pumpkin_side' },
  { name: 'hay_bale_top' },
  { name: 'hay_bale_side' },
  { name: 'quartz_block' },
  { name: 'gold_block' },
  { name: 'iron_block' },
  { name: 'diamond_block' },
  { name: 'copper_block' },
  // Lana
  { name: 'white_wool' },
  { name: 'black_wool' },
  { name: 'red_wool' },
  { name: 'orange_wool' },
  { name: 'yellow_wool' },
  { name: 'lime_wool' },
  { name: 'blue_wool' },
  { name: 'purple_wool' },
  // Supervivencia
  { name: 'furnace_front' },
  { name: 'furnace_front_lit' },
  { name: 'furnace_side' },
  { name: 'furnace_top' },
  { name: 'chest_front' },
  { name: 'chest_side' },
  { name: 'chest_top' },
  { name: 'oak_sapling', wave: 2, sss: 0.75, cutout: true },
  { name: 'birch_sapling', wave: 2, sss: 0.75, cutout: true },
  { name: 'spruce_sapling', wave: 2, sss: 0.7, cutout: true },
  // Grietas al picar (10 fases, se dibujan superpuestas al bloque).
  { name: 'destroy_0', cutout: true },
  { name: 'destroy_1', cutout: true },
  { name: 'destroy_2', cutout: true },
  { name: 'destroy_3', cutout: true },
  { name: 'destroy_4', cutout: true },
  { name: 'destroy_5', cutout: true },
  { name: 'destroy_6', cutout: true },
  { name: 'destroy_7', cutout: true },
  { name: 'destroy_8', cutout: true },
  { name: 'destroy_9', cutout: true },
  // Construcción: puertas (mitad superior e inferior), trampillas y escalera de mano.
  { name: 'oak_door_top', cutout: true },
  { name: 'oak_door_bottom', cutout: true },
  { name: 'birch_door_top', cutout: true },
  { name: 'birch_door_bottom', cutout: true },
  { name: 'spruce_door_top', cutout: true },
  { name: 'spruce_door_bottom', cutout: true },
  { name: 'oak_trapdoor', cutout: true },
  { name: 'birch_trapdoor', cutout: true },
  { name: 'spruce_trapdoor', cutout: true },
  { name: 'ladder', cutout: true },
  // Granja: tierra de cultivo, etapas de los cultivos y tarta.
  { name: 'farmland_dry' },
  { name: 'farmland_wet' },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((s): TextureDef => ({ name: `wheat_stage${s}`, wave: 2, sss: 0.5, cutout: true })),
  ...['carrots', 'potatoes', 'beetroots'].flatMap((c) =>
    [0, 1, 2, 3].map((s): TextureDef => ({ name: `${c}_stage${s}`, wave: 2, sss: 0.55, cutout: true })),
  ),
  { name: 'cake_top' },
  { name: 'cake_side' },
  { name: 'cake_inner' },
  { name: 'cake_bottom' },
  // Calabazas, sandías y compostador (fase 4).
  { name: 'melon_side' },
  { name: 'melon_top' },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((s): TextureDef => ({ name: `stem_stage${s}`, wave: 2, sss: 0.5, cutout: true })),
  { name: 'stem_attached', wave: 2, sss: 0.5, cutout: true },
  { name: 'carved_pumpkin' },
  { name: 'jack_o_lantern' },
  { name: 'composter_side' },
  { name: 'composter_top' },
  { name: 'composter_bottom' },
  { name: 'compost' },
  { name: 'compost_ready' },
  // Cofre doble, ahumador, alto horno, fogata y cortapiedras (fase 4).
  { name: 'chest_front_seam_right' },
  { name: 'chest_front_seam_left' },
  { name: 'chest_side_seam_right' },
  { name: 'chest_side_seam_left' },
  ...['smoker', 'blast_furnace'].flatMap((k): TextureDef[] => [
    { name: `${k}_front` }, { name: `${k}_front_lit` }, { name: `${k}_side` }, { name: `${k}_top` },
  ]),
  { name: 'campfire_log_lit' },
  { name: 'campfire_fire', wave: 2, cutout: true },
  { name: 'campfire_embers' },
  { name: 'campfire_ash' },
  { name: 'stonecutter_top' },
  { name: 'stonecutter_side' },
  { name: 'stonecutter_bottom' },
  { name: 'stonecutter_saw', cutout: true },
  // Maderas de la fase 5 (jungla, acacia, roble oscuro y cerezo).
  ...['jungle', 'acacia', 'dark_oak', 'cherry'].flatMap((k): TextureDef[] => [
    { name: `${k}_log_side` },
    { name: `${k}_log_top` },
    { name: `${k}_planks` },
    k === 'cherry'
      ? { name: `${k}_leaves`, wave: 1, sss: 0.9, cutout: true }
      : { name: `${k}_leaves`, tint: 3, wave: 1, sss: 0.85, cutout: true },
    { name: `${k}_sapling`, wave: 2, sss: 0.75, cutout: true },
    { name: `${k}_door_top`, cutout: true },
    { name: `${k}_door_bottom`, cutout: true },
    { name: `${k}_trapdoor`, cutout: true },
  ]),
  // Biomas de la fase 5.
  { name: 'vine', tint: 3, wave: 1, sss: 0.8, cutout: true },
  { name: 'lily_pad', sss: 0.5, cutout: true },
  { name: 'mycelium_top' },
  { name: 'mycelium_side' },
  { name: 'red_mushroom_block' },
  { name: 'brown_mushroom_block' },
  { name: 'mushroom_stem' },
  { name: 'mushroom_block_inside' },
  { name: 'red_sand' },
  { name: 'red_sandstone_top' },
  { name: 'red_sandstone_side' },
  { name: 'red_sandstone_bottom' },
  ...['white', 'orange', 'yellow', 'brown', 'red', 'light_gray'].map((c): TextureDef => ({ name: `${c}_terracotta` })),
  { name: 'packed_ice' },
  ...['blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy',
    'lily_of_the_valley'].map((k): TextureDef => ({ name: k, wave: 2, sss: 0.7, cutout: true })),
  { name: 'pink_petals', sss: 0.6, cutout: true },
  // Subsuelo de la fase 5: pizarra profunda, menas, cuevas frondosas y de goteo, geodas.
  { name: 'deepslate' },
  { name: 'deepslate_top' },
  { name: 'cobbled_deepslate' },
  { name: 'tuff' },
  { name: 'calcite' },
  { name: 'smooth_basalt' },
  { name: 'dripstone_block' },
  { name: 'pointed_dripstone' },
  { name: 'copper_ore' },
  { name: 'emerald_ore' },
  ...['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'diamond', 'emerald'].map((k): TextureDef => ({ name: `deepslate_${k}_ore` })),
  { name: 'emerald_block' },
  { name: 'moss_block', sss: 0.3 },
  { name: 'azalea', wave: 2, sss: 0.7, cutout: true },
  { name: 'flowering_azalea', wave: 2, sss: 0.7, cutout: true },
  { name: 'cave_vines', wave: 2, sss: 0.7, cutout: true },
  { name: 'cave_vines_lit', wave: 2, sss: 0.7, cutout: true },
  { name: 'amethyst_block' },
  { name: 'budding_amethyst' },
  ...['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'].map((k): TextureDef => ({ name: k, sss: 0.4, cutout: true })),
  { name: 'tinted_glass', special: 3 },
  // Estructuras de la fase 5.
  { name: 'spawner', cutout: true },
  { name: 'cobweb', cutout: true },
  { name: 'chiseled_sandstone' },
  { name: 'cut_sandstone' },
  { name: 'mossy_stone_bricks' },
  { name: 'cracked_stone_bricks' },
  { name: 'netherrack' },
  { name: 'crying_obsidian' },
  // Fase 6 (aldeanos): bloques de trabajo de los aldeanos.
  ...['lectern_top', 'lectern_side', 'lectern_front', 'cartography_table_top', 'cartography_table_side1',
    'cartography_table_side2', 'fletching_table_top', 'fletching_table_side', 'fletching_table_front', 'barrel_top',
    'barrel_side', 'barrel_bottom', 'loom_top', 'loom_side', 'loom_front', 'grindstone_side', 'grindstone_round',
    'smithing_table_top', 'smithing_table_side', 'smithing_table_front', 'cauldron_side', 'cauldron_top', 'cauldron_inner',
    'cauldron_bottom'].map((name): TextureDef => ({ name })),
  // Fase 6 (acuáticos): huevos de tortuga (enteros, algo agrietados y muy agrietados).
  { name: 'turtle_egg' },
  { name: 'turtle_egg_slightly_cracked' },
  { name: 'turtle_egg_very_cracked' },
  // Fase 6 (fauna): nido de abejas, colmena, bloque de miel y bloque de panal.
  ...['bee_nest_top', 'bee_nest_bottom', 'bee_nest_side', 'bee_nest_front', 'bee_nest_front_honey', 'beehive_end', 'beehive_side',
    'beehive_front', 'beehive_front_honey', 'honey_block', 'honeycomb_block'].map((name): TextureDef => ({ name })),
  // Fase 6.5 (maderas): mangle, roble pálido y bambú; troncos sin corteza de todas las maderas.
  ...['mangrove', 'pale_oak'].flatMap((k): TextureDef[] => [
    { name: `${k}_log_side` },
    { name: `${k}_log_top` },
    { name: `${k}_planks` },
    k === 'mangrove'
      ? { name: `${k}_leaves`, tint: 3, wave: 1, sss: 0.85, cutout: true }
      : { name: `${k}_leaves`, wave: 1, sss: 0.8, cutout: true },
    { name: k === 'mangrove' ? 'mangrove_propagule' : `${k}_sapling`, wave: 2, sss: 0.75, cutout: true },
    { name: `${k}_door_top`, cutout: true },
    { name: `${k}_door_bottom`, cutout: true },
    { name: `${k}_trapdoor`, cutout: true },
  ]),
  { name: 'mangrove_roots', sss: 0.2, cutout: true },
  { name: 'muddy_mangrove_roots_top' },
  { name: 'muddy_mangrove_roots_side' },
  { name: 'bamboo_stalk', sss: 0.4, cutout: true },
  { name: 'bamboo_small_leaves', sss: 0.8, cutout: true },
  { name: 'bamboo_large_leaves', sss: 0.8, cutout: true },
  ...['bamboo_block_side', 'bamboo_block_top', 'stripped_bamboo_block_side', 'stripped_bamboo_block_top', 'bamboo_planks',
    'bamboo_mosaic'].map((name): TextureDef => ({ name })),
  { name: 'bamboo_door_top', cutout: true },
  { name: 'bamboo_door_bottom', cutout: true },
  { name: 'bamboo_trapdoor', cutout: true },
  ...['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove', 'pale_oak'].flatMap((k): TextureDef[] => [
    { name: `stripped_${k}_log_side` },
    { name: `stripped_${k}_log_top` },
  ]),
  // Fase 6.5 (colores): lanas y terracotas que faltaban, hormigón, hormigón en polvo, cristal de color,
  // terracota esmaltada y velas (las alfombras, camas y estandartes reutilizan la lana).
  ...COLOR_KEYS_65.filter((c) => !OLD_WOOL_65.includes(c)).map((c): TextureDef => ({ name: `${c}_wool` })),
  ...COLOR_KEYS_65.filter((c) => !OLD_TERRACOTTA_65.includes(c)).map((c): TextureDef => ({ name: `${c}_terracotta` })),
  ...COLOR_KEYS_65.map((c): TextureDef => ({ name: `${c}_concrete` })),
  ...COLOR_KEYS_65.map((c): TextureDef => ({ name: `${c}_concrete_powder` })),
  ...COLOR_KEYS_65.map((c): TextureDef => ({ name: `${c}_stained_glass`, special: 4 })),
  ...COLOR_KEYS_65.map((c): TextureDef => ({ name: `${c}_glazed_terracotta` })),
  { name: 'candle' },
  { name: 'candle_flame' },
  // Fase 6.5 (piedras): piedras del mundo normal (piedra lisa, pulidas, pizarra profunda, toba, areniscas,
  // barro, cinabrio y azufre).
  ...['smooth_stone', 'smooth_stone_slab_side', 'chiseled_stone_bricks', 'polished_granite', 'polished_diorite',
    'polished_andesite', 'polished_deepslate', 'deepslate_bricks', 'cracked_deepslate_bricks', 'deepslate_tiles',
    'cracked_deepslate_tiles', 'chiseled_deepslate', 'polished_tuff', 'tuff_bricks', 'chiseled_tuff', 'chiseled_tuff_top',
    'chiseled_tuff_bricks', 'chiseled_tuff_bricks_top', 'cut_red_sandstone', 'chiseled_red_sandstone', 'mud', 'packed_mud',
    'mud_bricks', 'cinnabar', 'polished_cinnabar', 'cinnabar_bricks', 'chiseled_cinnabar', 'sulfur', 'polished_sulfur',
    'sulfur_bricks', 'chiseled_sulfur'].map((name): TextureDef => ({ name })),
  // Fase 6.5 (cobre): bloque de cobre en bruto y las fases expuesta, degradada y oxidada de cada textura
  // de cobre (la normal del bloque de cobre ya estaba). Las cuatro fases salen de un mismo dibujo (genCopper.ts).
  { name: 'raw_copper_block' },
  { name: 'copper_torch', cutout: true },
  ...['', 'exposed_', 'weathered_', 'oxidized_'].flatMap((p): TextureDef[] => [
    ...(p ? [{ name: `${p}copper` }] : []),
    { name: `${p}cut_copper` },
    { name: `${p}chiseled_copper` },
    ...['copper_grate', 'copper_door_top', 'copper_door_bottom', 'copper_trapdoor', 'copper_bars', 'copper_chain', 'copper_lantern']
      .map((n): TextureDef => ({ name: p + n, cutout: true })),
  ]),
  // Fase 6.5 (decoración): maceta, farol, cadena, barrotes, campana, andamio, vasija, marco y cuadros.
  ...['flower_pot', 'flower_pot_top', 'flower_pot_soil', 'lantern', 'lantern_top', 'chain', 'chain_h', 'iron_bars',
    'scaffolding_top', 'scaffolding_side'].map((name): TextureDef => ({ name, cutout: true })),
  ...['bell', 'decorated_pot_side', 'decorated_pot_top', 'item_frame', ...PAINTING_TEXTURES].map((name): TextureDef => ({ name })),
  // Fase 6.5 (océano y plantas): corales (vivos y muertos), algas, plantas marinas, pepinos de mar,
  // prismarina y esponjas; flores altas, hierba alta, bayas dulces, azaleas, plantaformas, liquen,
  // raíces colgantes y flor de esporas.
  ...['tube', 'brain', 'bubble', 'fire', 'horn'].flatMap((c): TextureDef[] => ['', 'dead_'].flatMap((d): TextureDef[] => [
    { name: `${d}${c}_coral_block` },
    { name: `${d}${c}_coral`, wave: 2, sss: 0.4, cutout: true },
    { name: `${d}${c}_coral_fan`, wave: 2, sss: 0.4, cutout: true },
  ])),
  { name: 'kelp', wave: 2, sss: 0.6, cutout: true },
  { name: 'kelp_plant', sss: 0.6, cutout: true },
  { name: 'dried_kelp_top' },
  { name: 'dried_kelp_side' },
  { name: 'seagrass', wave: 2, sss: 0.7, cutout: true },
  { name: 'tall_seagrass_bottom', sss: 0.7, cutout: true },
  { name: 'tall_seagrass_top', wave: 2, sss: 0.7, cutout: true },
  { name: 'sea_pickle', sss: 0.5 },
  { name: 'prismarine' },
  { name: 'prismarine_bricks' },
  { name: 'dark_prismarine' },
  { name: 'sponge' },
  { name: 'wet_sponge' },
  ...['sunflower', 'lilac', 'rose_bush', 'peony', 'pitcher_plant', 'small_dripleaf'].flatMap((k): TextureDef[] => [
    { name: `${k}_bottom`, sss: 0.7, cutout: true },
    { name: `${k}_top`, wave: 2, sss: 0.7, cutout: true },
  ]),
  ...['tall_grass', 'large_fern'].flatMap((k): TextureDef[] => [
    { name: `${k}_bottom`, tint: 1, sss: 0.8, cutout: true },
    { name: `${k}_top`, tint: 1, wave: 2, sss: 0.8, cutout: true },
  ]),
  { name: 'torchflower', wave: 2, sss: 0.7, cutout: true },
  ...[0, 1, 2, 3].map((s): TextureDef => ({ name: `sweet_berry_bush_stage${s}`, wave: 2, sss: 0.7, cutout: true })),
  { name: 'azalea_leaves', wave: 1, sss: 0.8, cutout: true },
  { name: 'flowering_azalea_leaves', wave: 1, sss: 0.8, cutout: true },
  { name: 'big_dripleaf_top', sss: 0.6, cutout: true },
  { name: 'big_dripleaf_stem', sss: 0.6, cutout: true },
  { name: 'glow_lichen', sss: 0.4, cutout: true },
  { name: 'hanging_roots', sss: 0.5, cutout: true },
  { name: 'spore_blossom', sss: 0.6, cutout: true },
  // Fase 6.5 (remate): estantería cincelada.
  { name: 'chiseled_bookshelf_empty' },
  { name: 'chiseled_bookshelf_occupied' },
  { name: 'chiseled_bookshelf_top' },
  { name: 'chiseled_bookshelf_side' },
  // Fase 6.5 (libros y estandartes): libro abierto sobre el atril.
  { name: 'lectern_book' },
  // Fase 6.5 (materiales): bloques en bruto, de carbón, lapislázuli, huesos y slime; hielo azul; suelos;
  // nieve polvo y huevos de rana.
  ...['raw_iron_block', 'raw_gold_block', 'coal_block', 'lapis_block', 'bone_block_side', 'bone_block_top', 'blue_ice',
    'coarse_dirt', 'podzol_top', 'podzol_side', 'rooted_dirt', 'dirt_path_top', 'dirt_path_side'].map((name): TextureDef => ({ name })),
  { name: 'powder_snow', sss: 0.3 },
  { name: 'slime_block', special: 4, sss: 0.3 },
  { name: 'frogspawn', sss: 0.4, cutout: true },
  // Fase 6.5 (colecciones): caras de las cabezas (como skullTexture en blocks/collections.ts), tocadiscos y
  // marco brillante.
  // Fase 8.3 (criaturas del Nether): cráneo de esqueleto wither y cabeza de piglin (con hocico y orejas).
  ...['zombie', 'skeleton', 'creeper', 'player', 'wither_skeleton', 'piglin', 'dragon'].flatMap((k) =>
    ['right', 'left', 'top', 'bottom', 'back', 'front'].map((f): TextureDef => ({ name: `${k}_head_${f}` }))),
  { name: 'piglin_head_snout' },
  { name: 'piglin_head_ear' },
  { name: 'dragon_head_snout' }, { name: 'dragon_head_horn' }, { name: 'dragon_head_nostril' }, // Fase 8.6
  { name: 'jukebox_side' },
  { name: 'jukebox_top' },
  { name: 'jukebox_bottom' },
  { name: 'glow_item_frame' },
  // Fase 6.5 (equipo): fuego (animado) y conducto.
  { name: 'fire', special: 5, cutout: true },
  { name: 'conduit_closed' },
  { name: 'conduit_open' },
  // Fase 7 (pociones): alambique alquímico (pies, vara y frascos).
  { name: 'brewing_stand_base' },
  { name: 'brewing_stand_rod' },
  { name: 'brewing_stand_bottle' },
  { name: 'brewing_stand_bottle_top' },
  // Fase 7 (transporte): raíles (recortes).
  ...['rail', 'rail_corner', 'powered_rail', 'powered_rail_on', 'detector_rail', 'detector_rail_on', 'activator_rail',
    'activator_rail_on'].map((name): TextureDef => ({ name, cutout: true })),
  // Fase 7 (encantamientos): mesa de encantamientos, yunques y hielo escarchado.
  { name: 'enchanting_table_top' },
  { name: 'enchanting_table_side' },
  { name: 'enchanting_table_bottom' },
  { name: 'anvil' },
  { name: 'anvil_top' },
  { name: 'chipped_anvil_top' },
  { name: 'damaged_anvil_top' },
  ...[0, 1, 2, 3].map((a): TextureDef => ({ name: `frosted_ice_${a}`, special: 3 })),
  // Fase 7 (encantamientos): el libro que flota sobre la mesa (tapas y hojas).
  { name: 'enchanting_book_cover' },
  { name: 'enchanting_book_pages' },
  // Fase 7 (redstone): polvo (un color por potencia), antorchas, repetidor y comparador (la textura de
  // arriba va girada con cada orientación), palanca, lámpara, sensor, diana, bloque musical, cuerda,
  // cofre trampa, pararrayos y bombilla de cobre (por fase) y la puerta y la trampilla de hierro.
  ...Array.from({ length: 16 }, (_, p): TextureDef => ({ name: `redstone_dust_${p}`, cutout: true })),
  { name: 'redstone_torch', cutout: true },
  { name: 'redstone_torch_off', cutout: true },
  ...['redstone_torch_side_on', 'redstone_torch_side_off', 'redstone_torch_top_on', 'redstone_torch_top_off'].map((name): TextureDef => ({ name })),
  ...['repeater', 'comparator'].flatMap((k) => ['off', 'on'].flatMap((m) => [0, 1, 2, 3].map((f): TextureDef => ({ name: `${k}_${m}_${f}` })))),
  ...['lever_handle', 'redstone_block', 'redstone_lamp', 'redstone_lamp_on', 'daylight_detector_top', 'daylight_detector_inverted_top',
    'daylight_detector_side', 'target_side', 'target_top', 'note_block', 'tripwire', 'trapped_chest_front', 'trapped_chest_front_seam_left',
    'trapped_chest_front_seam_right', 'lightning_rod_on', 'iron_door_top', 'iron_door_bottom', 'iron_trapdoor'].map((name): TextureDef => ({ name })),
  ...['', 'exposed_', 'weathered_', 'oxidized_'].flatMap((p) => ['lightning_rod', 'copper_bulb', 'copper_bulb_lit'].map((k): TextureDef => ({ name: p + k }))),
  // Fase 7 (mecanismos): pistón (el lateral y la flecha del observador, también girados: ver
  // blocks/mechanismBlocks.ts), observador, tolva, dispensador, soltador y dinamita.
  ...['piston_top', 'piston_top_sticky', 'piston_bottom', 'piston_inner', 'observer_front', 'observer_side', 'observer_back',
    'observer_back_on', 'hopper_outside', 'hopper_inside', 'hopper_top', 'dispenser_front', 'dispenser_front_vertical', 'dropper_front',
    'dropper_front_vertical', 'tnt_side', 'tnt_top', 'tnt_bottom'].map((name): TextureDef => ({ name })),
  ...['piston_side', 'observer_top'].flatMap((k) => ['', '_r1', '_r2', '_r3'].map((r): TextureDef => ({ name: k + r }))),
  // Fase 7.5 (abismo): sculk, catalizador, sensores (los zarcillos y la amatista, con recorte), chillador,
  // pizarra reforzada y los bloques de alma (el fuego de alma, animado como el fuego).
  ...['sculk', 'sculk_catalyst_top', 'sculk_catalyst_side', 'sculk_catalyst_bottom', 'sculk_catalyst_top_bloom',
    'sculk_catalyst_side_bloom', 'sculk_sensor_top', 'sculk_sensor_side', 'sculk_sensor_bottom', 'calibrated_sculk_sensor_top',
    'calibrated_sculk_sensor_side', 'calibrated_sculk_sensor_input_side', 'sculk_shrieker_top', 'sculk_shrieker_side',
    'sculk_shrieker_bottom', 'sculk_shrieker_inner_top', 'sculk_shrieker_can_summon_inner_top', 'reinforced_deepslate_top',
    'reinforced_deepslate_side', 'reinforced_deepslate_bottom', 'soul_sand', 'soul_soil', 'soul_lantern'].map((name): TextureDef => ({ name })),
  ...['sculk_vein', 'sculk_sensor_tendril', 'sculk_sensor_tendril_active', 'calibrated_sculk_sensor_amethyst',
    'calibrated_sculk_sensor_amethyst_active', 'soul_torch'].map((name): TextureDef => ({ name, cutout: true })),
  { name: 'soul_fire', special: 5, cutout: true },
  // Fase 8 (dimensiones): el velo del portal (translúcido y emisivo), las menas del Nether y el magma.
  { name: 'nether_portal', special: 4 },
  ...['nether_quartz_ore', 'nether_gold_ore', 'magma'].map((name): TextureDef => ({ name })),
  // Fase 8.2 (biomas del Nether): maderas carmesí y distorsionada (puertas y trampillas con recorte), necelio,
  // plantas (con recorte; las de suelo se mecen), verrugas, luz de hongo, basalto, piedra negra y ladrillos.
  ...['crimson', 'warped'].flatMap((k): TextureDef[] => [
    ...[`${k}_stem_side`, `${k}_stem_top`, `stripped_${k}_stem_side`, `stripped_${k}_stem_top`, `${k}_planks`, `${k}_nylium`,
      `${k}_nylium_side`].map((name): TextureDef => ({ name })),
    ...[`${k}_door_top`, `${k}_door_bottom`, `${k}_trapdoor`].map((name): TextureDef => ({ name, cutout: true })),
    ...[`${k}_fungus`, `${k}_roots`].map((name): TextureDef => ({ name, cutout: true, wave: 2, sss: 0.4 })),
  ]),
  { name: 'nether_sprouts', cutout: true, wave: 2, sss: 0.4 },
  ...['weeping_vines', 'weeping_vines_plant', 'twisting_vines', 'twisting_vines_plant'].map((name): TextureDef => ({ name, cutout: true, sss: 0.4 })),
  ...['nether_wart_block', 'warped_wart_block', 'shroomlight', 'basalt_top', 'basalt_side', 'polished_basalt_top', 'polished_basalt_side',
    'blackstone', 'blackstone_top', 'polished_blackstone', 'polished_blackstone_bricks', 'cracked_polished_blackstone_bricks',
    'chiseled_polished_blackstone', 'gilded_blackstone', 'nether_bricks', 'cracked_nether_bricks', 'chiseled_nether_bricks',
    'red_nether_bricks'].map((name): TextureDef => ({ name })),
  // Fase 8.4 (estructuras del Nether): la verruga del Nether (tres dibujos para sus cuatro edades).
  ...[0, 1, 2].map((s): TextureDef => ({ name: `nether_wart_stage${s}`, sss: 0.35, cutout: true })),
  // Fase 8.5 (lo que da el Nether): escombros ancestrales y netherita.
  ...['ancient_debris_side', 'ancient_debris_top', 'netherite_block', 'quartz_bricks', 'quartz_pillar', 'quartz_pillar_top',
    'chiseled_quartz_block', 'chiseled_quartz_block_top', 'smooth_quartz', 'lodestone_top', 'lodestone_side', 'soul_campfire_log_lit',
    'soul_campfire_embers', 'respawn_anchor_top_off', 'respawn_anchor_top', 'respawn_anchor_bottom', 'beacon',
    ...[0, 1, 2, 3, 4].map((c) => `respawn_anchor_side${c}`)].map((name): TextureDef => ({ name })),
  { name: 'soul_campfire_fire', wave: 2, cutout: true },
  // Fase 8.6 (el End).
  ...['end_stone', 'end_stone_bricks', 'purpur_block', 'purpur_pillar', 'purpur_pillar_top', 'end_rod'].map((name): TextureDef => ({ name })),
  ...['chorus_plant', 'chorus_flower', 'chorus_flower_dead'].map((name): TextureDef => ({ name, sss: 0.3 })),
  ...['end_portal_frame_top', 'end_portal_frame_side', 'end_portal_frame_eye'].map((name): TextureDef => ({ name })),
  { name: 'end_portal', special: 6 },
  { name: 'dragon_egg' },
  // Fase 8.6: las cajas de shulker (la tapa, su techo, la base y el fondo de cada color) y el cofre de ender.
  ...['', 'white_', 'orange_', 'magenta_', 'light_blue_', 'yellow_', 'lime_', 'pink_', 'gray_', 'light_gray_', 'cyan_', 'purple_', 'blue_',
    'brown_', 'green_', 'red_', 'black_'].flatMap((c) => ['top', 'lid', 'base', 'bottom'].map((p): TextureDef => ({ name: `${c}shulker_box_${p}` }))),
  ...['ender_chest_side', 'ender_chest_top', 'ender_chest_front', 'ender_chest_lock'].map((name): TextureDef => ({ name })),
  // Luces de rana.
  ...['ochre', 'verdant', 'pearlescent'].flatMap((k) => ['top', 'side'].map((p): TextureDef => ({ name: `${k}_froglight_${p}`, sss: 0.4 }))),
  { name: 'wither_rose', wave: 2, sss: 0.4, cutout: true }, // Fase 8.7
];

export const TEXTURE_NAMES: readonly string[] = TEXTURE_DEFS.map((t) => t.name);
export const TEXTURE_COUNT = TEXTURE_DEFS.length;

const layerByName = new Map<string, number>();
TEXTURE_DEFS.forEach((t, i) => layerByName.set(t.name, i));

export function textureLayer(name: string): number {
  const layer = layerByName.get(name);
  if (layer === undefined) throw new Error('Textura desconocida: ' + name);
  return layer;
}
