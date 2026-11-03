// Bloques clásicos (ids 0..95): cubos, plantas, fluidos, antorchas, hornos y cofres orientados,
// brotes, y la dureza y herramienta de cada uno (valores de Minecraft).
import {
  def, defs, R_NONE, R_CUTOUT, R_CROSS, R_WATER, R_TRANSLUCENT, R_TORCH, R_CACTUS, R_LAVA,
  type BlockDef, type Opts, type ToolKind,
} from './registry';

export const AIR = 0;
export const STONE = 1;
export const GRASS = 2;
export const DIRT = 3;
export const COBBLESTONE = 4;
export const OAK_PLANKS = 5;
export const BEDROCK = 6;
export const SAND = 7;
export const GRAVEL = 8;
export const OAK_LOG = 9;
export const OAK_LEAVES = 10;
export const GLASS = 11;
export const WATER = 12;
export const COAL_ORE = 13;
export const IRON_ORE = 14;
export const GOLD_ORE = 15;
export const DIAMOND_ORE = 16;
export const LAPIS_ORE = 17;
export const REDSTONE_ORE = 18;
export const SANDSTONE = 19;
export const SNOWY_GRASS = 20;
export const SNOW_BLOCK = 21;
export const ICE = 22;
export const CLAY = 23;
export const CACTUS = 24;
export const BIRCH_LOG = 25;
export const BIRCH_LEAVES = 26;
export const SPRUCE_LOG = 27;
export const SPRUCE_LEAVES = 28;
export const SHORT_GRASS = 29;
export const FERN = 30;
export const POPPY = 31;
export const DANDELION = 32;
export const CORNFLOWER = 33;
export const DEAD_BUSH = 34;
export const SUGAR_CANE = 35;
export const RED_MUSHROOM = 36;
export const BROWN_MUSHROOM = 37;
export const TORCH = 38;
export const GLOWSTONE = 39;
export const SEA_LANTERN = 40;
export const LAVA = 41;
export const BRICKS = 42;
export const STONE_BRICKS = 43;
export const MOSSY_COBBLESTONE = 44;
export const OBSIDIAN = 45;
export const BOOKSHELF = 46;
export const CRAFTING_TABLE = 47;
export const PUMPKIN = 48;
export const HAY_BALE = 49;
export const BIRCH_PLANKS = 50;
export const SPRUCE_PLANKS = 51;
export const GRANITE = 52;
export const DIORITE = 53;
export const ANDESITE = 54;
export const TERRACOTTA = 55;
export const QUARTZ_BLOCK = 56;
export const GOLD_BLOCK = 57;
export const IRON_BLOCK = 58;
export const DIAMOND_BLOCK = 59;
export const COPPER_BLOCK = 60;
export const WHITE_WOOL = 61;
export const BLACK_WOOL = 62;
export const RED_WOOL = 63;
export const ORANGE_WOOL = 64;
export const YELLOW_WOOL = 65;
export const LIME_WOOL = 66;
export const BLUE_WOOL = 67;
export const PURPLE_WOOL = 68;
/** Agua fluyendo (niveles 1..7) y cayendo. */
export const WATER_FLOW_1 = 69;
export const WATER_FALL = 76;
/** Lava fluyendo (niveles 1..3, cada uno equivale a 2 niveles de Minecraft) y cayendo. */
export const LAVA_FLOW_1 = 77;
export const LAVA_FALL = 80;
/** Horno orientado (frente hacia N=-Z, E=+X, S=+Z, O=-X) y encendido. */
export const FURNACE = 81;
export const FURNACE_LIT = 85;
/** Cofre orientado. */
export const CHEST = 89;
export const OAK_SAPLING = 93;
export const BIRCH_SAPLING = 94;
export const SPRUCE_SAPLING = 95;

const plant = (o: Opts): Opts => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: 'grass',
  replaceable: false,
  category: 'naturaleza',
  ...o,
});

def(AIR, 'air', 'Aire', { render: R_NONE, solid: false, opaque: false, replaceable: true, all: 'stone', category: null });
def(STONE, 'stone', 'Piedra', { all: 'stone' });
def(GRASS, 'grass_block', 'Bloque de hierba', { top: 'grass_top', bottom: 'dirt', side: 'grass_side', sound: 'grass', category: 'naturaleza' });
def(DIRT, 'dirt', 'Tierra', { all: 'dirt', sound: 'dirt', category: 'naturaleza' });
def(COBBLESTONE, 'cobblestone', 'Roca', { all: 'cobblestone' });
def(OAK_PLANKS, 'oak_planks', 'Tablones de roble', { all: 'oak_planks', sound: 'wood' });
def(BEDROCK, 'bedrock', 'Lecho de roca', { all: 'bedrock', breakable: false, category: null });
def(SAND, 'sand', 'Arena', { all: 'sand', sound: 'sand', category: 'naturaleza' });
def(GRAVEL, 'gravel', 'Grava', { all: 'gravel', sound: 'gravel', category: 'naturaleza' });
def(OAK_LOG, 'oak_log', 'Tronco de roble', { top: 'oak_log_top', side: 'oak_log_side', sound: 'wood', category: 'naturaleza' });
def(OAK_LEAVES, 'oak_leaves', 'Hojas de roble', { all: 'oak_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', category: 'naturaleza' });
def(GLASS, 'glass', 'Cristal', { all: 'glass', render: R_CUTOUT, lightOpacity: 0, sound: 'glass' });
def(WATER, 'water', 'Agua', { all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: 'naturaleza' });
def(COAL_ORE, 'coal_ore', 'Mena de carbón', { all: 'coal_ore', category: 'minerales' });
def(IRON_ORE, 'iron_ore', 'Mena de hierro', { all: 'iron_ore', category: 'minerales' });
def(GOLD_ORE, 'gold_ore', 'Mena de oro', { all: 'gold_ore', category: 'minerales' });
def(DIAMOND_ORE, 'diamond_ore', 'Mena de diamante', { all: 'diamond_ore', category: 'minerales' });
def(LAPIS_ORE, 'lapis_ore', 'Mena de lapislázuli', { all: 'lapis_ore', category: 'minerales' });
def(REDSTONE_ORE, 'redstone_ore', 'Mena de redstone', { all: 'redstone_ore', category: 'minerales' });
def(SANDSTONE, 'sandstone', 'Arenisca', { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' });
def(SNOWY_GRASS, 'snowy_grass_block', 'Hierba nevada', { top: 'snow', bottom: 'dirt', side: 'grass_side_snowy', sound: 'snow', category: 'naturaleza' });
def(SNOW_BLOCK, 'snow_block', 'Bloque de nieve', { all: 'snow', sound: 'snow', category: 'naturaleza' });
def(ICE, 'ice', 'Hielo', { all: 'ice', render: R_TRANSLUCENT, lightOpacity: 2, sound: 'glass', category: 'naturaleza' });
def(CLAY, 'clay', 'Arcilla', { all: 'clay', sound: 'dirt', category: 'naturaleza' });
def(CACTUS, 'cactus', 'Cactus', { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side', render: R_CACTUS, lightOpacity: 0, sound: 'wool', category: 'naturaleza' });
def(BIRCH_LOG, 'birch_log', 'Tronco de abedul', { top: 'birch_log_top', side: 'birch_log_side', sound: 'wood', category: 'naturaleza' });
def(BIRCH_LEAVES, 'birch_leaves', 'Hojas de abedul', { all: 'birch_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', category: 'naturaleza' });
def(SPRUCE_LOG, 'spruce_log', 'Tronco de abeto', { top: 'spruce_log_top', side: 'spruce_log_side', sound: 'wood', category: 'naturaleza' });
def(SPRUCE_LEAVES, 'spruce_leaves', 'Hojas de abeto', { all: 'spruce_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', category: 'naturaleza' });
def(SHORT_GRASS, 'short_grass', 'Hierba', plant({ all: 'short_grass', replaceable: true }));
def(FERN, 'fern', 'Helecho', plant({ all: 'fern', replaceable: true }));
def(POPPY, 'poppy', 'Amapola', plant({ all: 'poppy' }));
def(DANDELION, 'dandelion', 'Diente de león', plant({ all: 'dandelion' }));
def(CORNFLOWER, 'cornflower', 'Aciano', plant({ all: 'cornflower' }));
def(DEAD_BUSH, 'dead_bush', 'Arbusto seco', plant({ all: 'dead_bush', replaceable: true }));
def(SUGAR_CANE, 'sugar_cane', 'Caña de azúcar', plant({ all: 'sugar_cane' }));
def(RED_MUSHROOM, 'red_mushroom', 'Champiñón rojo', plant({ all: 'red_mushroom' }));
def(BROWN_MUSHROOM, 'brown_mushroom', 'Champiñón marrón', plant({ all: 'brown_mushroom' }));
def(TORCH, 'torch', 'Antorcha', { all: 'torch', render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: 'wood', category: 'decoracion' });
def(GLOWSTONE, 'glowstone', 'Piedra luminosa', { all: 'glowstone', emission: 15, sound: 'glass', category: 'decoracion' });
def(SEA_LANTERN, 'sea_lantern', 'Linterna marina', { all: 'sea_lantern', emission: 15, sound: 'glass', category: 'decoracion' });
def(LAVA, 'lava', 'Lava', { all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: 'lava', replaceable: true, category: 'naturaleza' });
def(BRICKS, 'bricks', 'Ladrillos', { all: 'bricks' });
def(STONE_BRICKS, 'stone_bricks', 'Ladrillos de piedra', { all: 'stone_bricks' });
def(MOSSY_COBBLESTONE, 'mossy_cobblestone', 'Roca musgosa', { all: 'mossy_cobblestone' });
def(OBSIDIAN, 'obsidian', 'Obsidiana', { all: 'obsidian' });
def(BOOKSHELF, 'bookshelf', 'Librería', { top: 'oak_planks', side: 'bookshelf', sound: 'wood', category: 'decoracion' });
def(CRAFTING_TABLE, 'crafting_table', 'Mesa de trabajo', {
  tex: ['crafting_table_side', 'crafting_table_side', 'crafting_table_top', 'oak_planks', 'crafting_table_front', 'crafting_table_side'],
  sound: 'wood',
  category: 'decoracion',
});
def(PUMPKIN, 'pumpkin', 'Calabaza', { top: 'pumpkin_top', side: 'pumpkin_side', sound: 'wood', category: 'decoracion' });
def(HAY_BALE, 'hay_bale', 'Fardo de heno', { top: 'hay_bale_top', side: 'hay_bale_side', sound: 'grass', category: 'decoracion' });
def(BIRCH_PLANKS, 'birch_planks', 'Tablones de abedul', { all: 'birch_planks', sound: 'wood' });
def(SPRUCE_PLANKS, 'spruce_planks', 'Tablones de abeto', { all: 'spruce_planks', sound: 'wood' });
def(GRANITE, 'granite', 'Granito', { all: 'granite' });
def(DIORITE, 'diorite', 'Diorita', { all: 'diorite' });
def(ANDESITE, 'andesite', 'Andesita', { all: 'andesite' });
def(TERRACOTTA, 'terracotta', 'Terracota', { all: 'terracotta' });
def(QUARTZ_BLOCK, 'quartz_block', 'Bloque de cuarzo', { all: 'quartz_block' });
def(GOLD_BLOCK, 'gold_block', 'Bloque de oro', { all: 'gold_block', sound: 'metal', category: 'minerales' });
def(IRON_BLOCK, 'iron_block', 'Bloque de hierro', { all: 'iron_block', sound: 'metal', category: 'minerales' });
def(DIAMOND_BLOCK, 'diamond_block', 'Bloque de diamante', { all: 'diamond_block', sound: 'metal', category: 'minerales' });
def(COPPER_BLOCK, 'copper_block', 'Bloque de cobre', { all: 'copper_block', sound: 'metal', category: 'minerales' });
def(WHITE_WOOL, 'white_wool', 'Lana blanca', { all: 'white_wool', sound: 'wool', category: 'colores' });
def(BLACK_WOOL, 'black_wool', 'Lana negra', { all: 'black_wool', sound: 'wool', category: 'colores' });
def(RED_WOOL, 'red_wool', 'Lana roja', { all: 'red_wool', sound: 'wool', category: 'colores' });
def(ORANGE_WOOL, 'orange_wool', 'Lana naranja', { all: 'orange_wool', sound: 'wool', category: 'colores' });
def(YELLOW_WOOL, 'yellow_wool', 'Lana amarilla', { all: 'yellow_wool', sound: 'wool', category: 'colores' });
def(LIME_WOOL, 'lime_wool', 'Lana verde lima', { all: 'lime_wool', sound: 'wool', category: 'colores' });
def(BLUE_WOOL, 'blue_wool', 'Lana azul', { all: 'blue_wool', sound: 'wool', category: 'colores' });
def(PURPLE_WOOL, 'purple_wool', 'Lana morada', { all: 'purple_wool', sound: 'wool', category: 'colores' });

// Fluidos en movimiento (no aparecen en el inventario).
for (let l = 1; l <= 7; l++) {
  def(WATER_FLOW_1 + l - 1, 'water_flow_' + l, 'Agua', {
    all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: null,
    fluid: 1, level: l, hardness: -1,
  });
}
def(WATER_FALL, 'water_fall', 'Agua', {
  all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: null,
  fluid: 1, level: 8, hardness: -1,
});
// Fase 8.2: como en Java, el nivel de la lava es 8 − su cantidad; la del mundo normal baja de 2 en 2 (niveles 2, 4
// y 6) y la del Nether, de 1 en 1 (los impares se registran al final, en fluids.ts de blocks). Toda da luz 15.
for (let l = 1; l <= 3; l++) {
  def(LAVA_FLOW_1 + l - 1, 'lava_flow_' + l, 'Lava', {
    all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: 'lava',
    replaceable: true, category: null, fluid: 2, level: l * 2, hardness: -1,
  });
}
def(LAVA_FALL, 'lava_fall', 'Lava', {
  all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: 'lava',
  replaceable: true, category: null, fluid: 2, level: 8, hardness: -1,
});
defs[WATER].fluid = 1;
defs[LAVA].fluid = 2;
defs[WATER].hardness = -1;
defs[LAVA].hardness = -1;

// Bloques orientados: el frente mira hacia el jugador que los coloca.
const FACING_FACE = [5, 0, 4, 1]; // N (-Z), E (+X), S (+Z), O (-X) -> índice de cara
function oriented(base: number, key: string, name: string, front: string, side: string, top: string, o: Opts): void {
  for (let f = 0; f < 4; f++) {
    const tex: BlockDef['tex'] = [side, side, top, top, side, side];
    tex[FACING_FACE[f]] = front;
    def(base + f, f === 0 ? key : key + '_' + f, name, { ...o, tex, category: f === 0 ? o.category ?? 'decoracion' : null });
  }
}
oriented(FURNACE, 'furnace', 'Horno', 'furnace_front', 'furnace_side', 'furnace_top', { hardness: 3.5, tool: 'pickaxe', tier: 1 });
oriented(FURNACE_LIT, 'furnace_lit', 'Horno', 'furnace_front_lit', 'furnace_side', 'furnace_top', {
  hardness: 3.5, tool: 'pickaxe', tier: 1, emission: 13, category: null,
});
for (let f = 0; f < 4; f++) defs[FURNACE_LIT + f].category = null;
oriented(CHEST, 'chest', 'Cofre', 'chest_front', 'chest_side', 'chest_top', { hardness: 2.5, tool: 'axe', sound: 'wood' });
def(OAK_SAPLING, 'oak_sapling', 'Brote de roble', plant({ all: 'oak_sapling', hardness: 0 }));
def(BIRCH_SAPLING, 'birch_sapling', 'Brote de abedul', plant({ all: 'birch_sapling', hardness: 0 }));
def(SPRUCE_SAPLING, 'spruce_sapling', 'Brote de abeto', plant({ all: 'spruce_sapling', hardness: 0 }));

/** [dureza, herramienta, nivel] por clave de bloque (valores de Minecraft). */
const MINING: Record<string, [number, ToolKind | null, number]> = {
  stone: [1.5, 'pickaxe', 1], cobblestone: [2, 'pickaxe', 1], mossy_cobblestone: [2, 'pickaxe', 1],
  stone_bricks: [1.5, 'pickaxe', 1], bricks: [2, 'pickaxe', 1], granite: [1.5, 'pickaxe', 1],
  diorite: [1.5, 'pickaxe', 1], andesite: [1.5, 'pickaxe', 1], sandstone: [0.8, 'pickaxe', 1],
  terracotta: [1.25, 'pickaxe', 1], quartz_block: [0.8, 'pickaxe', 1], obsidian: [50, 'pickaxe', 4],
  coal_ore: [3, 'pickaxe', 1], iron_ore: [3, 'pickaxe', 2], gold_ore: [3, 'pickaxe', 3],
  diamond_ore: [3, 'pickaxe', 3], lapis_ore: [3, 'pickaxe', 2], redstone_ore: [3, 'pickaxe', 3],
  gold_block: [3, 'pickaxe', 3], iron_block: [5, 'pickaxe', 2], diamond_block: [5, 'pickaxe', 3],
  copper_block: [3, 'pickaxe', 2], ice: [0.5, 'pickaxe', 0],
  grass_block: [0.6, 'shovel', 0], dirt: [0.5, 'shovel', 0], sand: [0.5, 'shovel', 0], gravel: [0.6, 'shovel', 0],
  clay: [0.6, 'shovel', 0], snow_block: [0.2, 'shovel', 0], snowy_grass_block: [0.6, 'shovel', 0],
  oak_log: [2, 'axe', 0], birch_log: [2, 'axe', 0], spruce_log: [2, 'axe', 0], oak_planks: [2, 'axe', 0],
  birch_planks: [2, 'axe', 0], spruce_planks: [2, 'axe', 0], bookshelf: [1.5, 'axe', 0],
  crafting_table: [2.5, 'axe', 0], pumpkin: [1, 'axe', 0],
  oak_leaves: [0.2, null, 0], birch_leaves: [0.2, null, 0], spruce_leaves: [0.2, null, 0], glass: [0.3, null, 0],
  glowstone: [0.3, null, 0], sea_lantern: [0.3, null, 0], hay_bale: [0.5, null, 0], cactus: [0.4, null, 0],
  white_wool: [0.8, null, 0], black_wool: [0.8, null, 0], red_wool: [0.8, null, 0], orange_wool: [0.8, null, 0],
  yellow_wool: [0.8, null, 0], lime_wool: [0.8, null, 0], blue_wool: [0.8, null, 0], purple_wool: [0.8, null, 0],
  torch: [0, null, 0], short_grass: [0, null, 0], fern: [0, null, 0], poppy: [0, null, 0], dandelion: [0, null, 0],
  cornflower: [0, null, 0], dead_bush: [0, null, 0], sugar_cane: [0, null, 0], red_mushroom: [0, null, 0],
  brown_mushroom: [0, null, 0], bedrock: [-1, null, 0], air: [0, null, 0],
};
for (const [key, [h, tool, tier]] of Object.entries(MINING)) {
  const b = defs.find((d) => d && d.key === key);
  if (!b) throw new Error('Bloque desconocido en MINING: ' + key);
  b.hardness = h;
  b.tool = tool;
  b.tier = tier;
}

// Variantes orientadas y encendidas: se obtienen como su bloque base.
for (let f = 0; f < 4; f++) {
  defs[FURNACE + f].base = FURNACE;
  defs[FURNACE_LIT + f].base = FURNACE;
  defs[CHEST + f].base = CHEST;
}
