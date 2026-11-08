/* gode/vendor/old/blocks.js —— 宿主 B 的方块 id 表（index.html:706 BLOCK_DEFS 的名字顺序，id = 下标）与 gen.js 用到的分类。
   只抽名字：生成器只需要 id；硬度 / 掉落 / 贴图留在宿主。宿主改了 BLOCK_DEFS 顺序时，对拍脚本比对 gg.Blocks.byId 名字会报错。 */
export const NAMES = ['air', 'stone', 'granite', 'diorite', 'andesite', 'grass_block', 'dirt', 'cobblestone', 'mossy_cobblestone', 'stone_bricks',
  'sand', 'gravel', 'sandstone', 'bedrock', 'oak_log', 'oak_planks', 'oak_leaves', 'oak_sapling', 'birch_log', 'birch_planks', 'birch_leaves',
  'birch_sapling', 'spruce_log', 'spruce_planks', 'spruce_leaves', 'spruce_sapling', 'glass', 'water', 'lava', 'coal_ore', 'iron_ore', 'gold_ore',
  'lapis_ore', 'diamond_ore', 'emerald_ore', 'coal_block', 'iron_block', 'gold_block', 'diamond_block', 'lapis_block', 'emerald_block',
  'crafting_table', 'furnace', 'furnace_lit', 'chest', 'torch', 'ladder', 'white_wool', 'orange_wool', 'magenta_wool', 'light_blue_wool',
  'yellow_wool', 'lime_wool', 'pink_wool', 'gray_wool', 'light_gray_wool', 'cyan_wool', 'purple_wool', 'blue_wool', 'brown_wool', 'green_wool',
  'red_wool', 'black_wool', 'glowstone', 'obsidian', 'tnt', 'bookshelf', 'farmland', 'dirt_path', 'snow', 'snow_block', 'ice', 'cactus',
  'dead_bush', 'short_grass', 'fern', 'dandelion', 'poppy', 'cornflower', 'oxeye_daisy', 'wheat', 'pumpkin', 'jack_o_lantern', 'spawner', 'fire',
  'netherrack', 'end_stone', 'oak_door'];
export const B = {};
NAMES.forEach((n, i) => { B[n] = i; });
export const AIR = 0;
export const isLeaves = (id) => id === B.oak_leaves || id === B.birch_leaves || id === B.spruce_leaves;
