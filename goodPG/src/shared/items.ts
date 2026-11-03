// Registro de objetos. Los objetos de bloque comparten id con su bloque (1..255 y, para las familias
// con estados como losas o puertas, el estado base a partir de 1024); el resto va de 256 a 1023 y usa
// un sprite 16x16 del atlas de objetos.
import { AMETHYST_BUD, AMETHYST_BUD_ITEM_KEYS } from './blocks'; // los brotes de amatista
import { SHULKER_BOXES, SHULKER_BOX_COLORS } from './blocks'; // Fase 8.6
import { NETHER_WART_CROP } from './blocks'; // Fase 8.4
import { ARMOR_MATERIALS, ARMOR_PIECES, ARMOR_STATS, type ArmorInfo, type ArmorSlot } from './armor';
import {
  EFFECT_HUNGER, EFFECT_POISON, EFFECT_REGENERATION, EFFECT_ABSORPTION, EFFECT_BAD_OMEN, BAD_OMEN_SECONDS, type FoodEffect,
} from './effects';
import {
  BLOCKS, BLOCK_COUNT, R_NONE, WATER, LAVA, FURNACE, CHEST, OAK_LOG, BIRCH_LOG, SPRUCE_LOG, OAK_PLANKS,
  BIRCH_PLANKS, SPRUCE_PLANKS, CRAFTING_TABLE, BOOKSHELF, SAND, GLASS, COBBLESTONE, STONE, IRON_ORE, GOLD_ORE,
  WOOD_TYPES, ALL_LOGS, ALL_PLANKS, ALL_SAPLINGS, RED_SAND, CACTUS, LIME_WOOL, CLAY, TERRACOTTA, DOORS, RED_BED, FENCES,
  FENCE_GATES, TRAPDOORS, SLABS, STAIRS, LADDER, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, CAKE, baseBlock,
  PUMPKIN_STEM, MELON_STEM, BEDS, SIGNS, familyBase, CAVE_VINES, COPPER_ORE, DEEPSLATE_ORE, COBBLED_DEEPSLATE, DEEPSLATE,
  HAY_BALE, // Fase 6 (monturas)
} from './blocks';
import { SUGAR_CANE } from './blocks'; // Fase 6 (fauna)
import { COAL_ORE, DIAMOND_ORE, EMERALD_ORE, LAPIS_ORE, REDSTONE_ORE, SEA_PICKLE } from './blocks'; // Fase 7.6 (auditoría de recetas)
import { BAMBOO, BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_MOSAIC } from './blocks'; // Fase 6.5 (maderas)
// Fase 6.5 (colores)
import { DYE_COLORS, COLOR_NAMES, COLORED_TERRACOTTA, GLAZED_TERRACOTTA, CARPETS, BANNERS, type DyeColor } from './blocks';
import { // Fase 6.5 (piedras)
  STONE_BRICKS, SANDSTONE, RED_SANDSTONE, SMOOTH_STONE, CRACKED_STONE_BRICKS, DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS,
  DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES, SMOOTH_SANDSTONE, SMOOTH_RED_SANDSTONE,
} from './blocks';
import { COPPER, copperTexture } from './blocks'; // Fase 6.5 (cobre)
import { COPPER_ARMOR } from './armor'; // Fase 6.5 (cobre)
// Fase 6.5 (equipo)
import { CHAINMAIL_ARMOR, TURTLE_ARMOR, NETHERITE_ARMOR, ELYTRA_ARMOR } from './armor';
import { EFFECT_RESISTANCE, EFFECT_FIRE_RESISTANCE } from './effects';
import { EFFECT_NAUSEA } from './effects'; // Fase 7 (efectos)
import { WOLF_ARMOR_DURABILITY } from './equipment';
import { SPAWN_EGG_DEFS, LATE_SPAWN_EGG_DEFS, NETHER_SPAWN_EGG_DEFS, END_SPAWN_EGG_DEFS, WITHER_SPAWN_EGG_DEFS } from './spawnEggs'; // Fase 6.5 (decoración); 8.3: los del Nether
import { SWEET_BERRY_BUSH, KELP, WET_SPONGE, SPONGE, DRIED_KELP_BLOCK, isWaterlogged } from './blocks'; // Fase 6.5 (océano y plantas)
import type { ItemData } from './itemData'; // Fase 6.5 (libros y estandartes)
import { POWDER_SNOW, COAL_BLOCK } from './blocks'; // Fase 6.5 (materiales)
import { SKULLS, ALL_SKULL_KINDS } from './blocks'; // Fase 6.5 (colecciones); 8.3: y las del Nether
import { DISCS } from './discs'; // Fase 6.5 (colecciones)
import { BREWING_STAND } from './blocks'; // Fase 7 (pociones)
import { REDSTONE_WIRE, TRIPWIRE, IRON_DOOR } from './blocks'; // Fase 7 (redstone)
import { HOPPER } from './blocks'; // Fase 7 (mecanismos)
import { // Fase 8.2 (biomas del Nether)
  isNetherWood, NETHERRACK, NETHER_BRICKS, CRACKED_NETHER_BRICKS, POLISHED_BLACKSTONE_BRICKS, CRACKED_POLISHED_BLACKSTONE_BRICKS, BASALT,
  SMOOTH_BASALT,
} from './blocks';
import { NETHER_QUARTZ_ORE, NETHER_GOLD_ORE } from './blocks'; // Fase 8 (dimensiones)
import { WARPED_FUNGUS, CRIMSON_FUNGUS } from './blocks'; // Fase 8.3 (criaturas del Nether): comida del strider y del hoglin
import { ANCIENT_DEBRIS, SMOOTH_QUARTZ, QUARTZ_BLOCK } from './blocks'; // Fase 8.5 (lo que da el Nether)

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'shears' | 'bow' | 'hoe' | 'shield' | 'fishing_rod'
  | 'brush' // Fase 6 (fauna): cepillo (escamas de armadillo)
  // Fase 6.5 (equipo): ballesta, tridente, mechero, caña con zanahoria y armadura para lobo (se desgastan).
  | 'crossbow' | 'trident' | 'lighter' | 'carrot_stick' | 'body_armor';

export interface ToolInfo {
  kind: ToolType;
  /** Nivel de cosecha: 1 madera/oro, 2 piedra, 3 hierro, 4 diamante. */
  tier: number;
  /** Multiplicador de velocidad de minado con la herramienta correcta. */
  speed: number;
  durability: number;
  /** Daño al golpear (medios corazones). */
  damage: number;
  /** Golpes por segundo con la barra de ataque llena (Minecraft 1.9+; sin él, 4 como la mano). */
  attackSpeed?: number;
}

export interface FoodInfo {
  hunger: number;
  saturation: number;
  /** Efectos al comerlo: [efecto, segundos, nivel (0 = I), probabilidad]. */
  effects?: FoodEffect[];
  /** Se puede comer aunque no haya hambre (manzana dorada). */
  always?: boolean;
}

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  stack: number;
  /** Bloque que coloca (objetos de bloque; los cubos colocan su fluido). */
  block?: number;
  /** Sprite del atlas de objetos (objetos que no son bloque). */
  sprite?: string;
  tool?: ToolInfo;
  food?: FoodInfo;
  /** Segundos que arde en un horno. */
  fuel?: number;
  /** Resultado al fundirlo en un horno. */
  smelt?: number;
  /** Se bebe (en cualquier momento, aunque no haya hambre): cubo de leche. */
  drink?: boolean;
  /** Pieza de armadura. */
  armor?: ArmorInfo;
}

export const ITEMS: ItemDef[] = [];

// ------------------------------------------------------------------ objetos de bloque
for (let id = 1; id < BLOCK_COUNT; id++) {
  const b = BLOCKS[id];
  // Sin variantes (fluidos en movimiento, hornos encendidos u orientados): sólo el bloque base es objeto.
  if (!b || b.render === R_NONE || b.level !== 0 || baseBlock(id) !== id || b.noItem) continue;
  ITEMS[id] = { id, key: b.key, name: b.name, stack: 64, block: id };
}
// Los brotes de amatista: cada tamaño, su objeto con la clave de Java.
AMETHYST_BUD_ITEM_KEYS.forEach((k, s) => {
  if (ITEMS[AMETHYST_BUD + s]) ITEMS[AMETHYST_BUD + s].key = k;
});
// Puertas y camas se ven como un dibujo plano (como en Minecraft); la cama no se apila.
for (const [wood, id] of Object.entries(DOORS)) ITEMS[id].sprite = `${wood}_door`;
// Camas y carteles también se ven planos; las camas no se apilan y los carteles, de 16 en 16.
for (const [color, id] of Object.entries(BEDS)) {
  ITEMS[id].sprite = `${color}_bed`;
  ITEMS[id].stack = 1;
}
for (const [wood, id] of Object.entries(SIGNS)) {
  ITEMS[id].sprite = `${wood}_sign`;
  ITEMS[id].stack = 16;
}

// ------------------------------------------------------------------ objetos
let nextId = 256;
function item(key: string, name: string, o: Partial<ItemDef> = {}): number {
  const id = nextId++;
  ITEMS[id] = { id, key, name, stack: 64, sprite: key, ...o };
  return id;
}

export const STICK = item('stick', 'Palo', { fuel: 5 });
export const COAL = item('coal', 'Carbón', { fuel: 80 });
export const CHARCOAL = item('charcoal', 'Carbón vegetal', { fuel: 80 });
export const IRON_INGOT = item('iron_ingot', 'Lingote de hierro');
export const GOLD_INGOT = item('gold_ingot', 'Lingote de oro');
export const DIAMOND = item('diamond', 'Diamante');
export const LAPIS = item('lapis_lazuli', 'Lapislázuli');
export const REDSTONE = item('redstone', 'Polvo de redstone');
export const FLINT = item('flint', 'Pedernal');
export const CLAY_BALL = item('clay_ball', 'Bola de arcilla');
export const BRICK = item('brick', 'Ladrillo');
export const BONE = item('bone', 'Hueso');
export const STRING = item('string', 'Cuerda');
export const FEATHER = item('feather', 'Pluma');
export const GUNPOWDER = item('gunpowder', 'Pólvora');
export const LEATHER = item('leather', 'Cuero');
export const ROTTEN_FLESH = item('rotten_flesh', 'Carne podrida', { food: { hunger: 4, saturation: 0.8 } });
export const PAPER = item('paper', 'Papel');
export const BOOK = item('book', 'Libro');
export const ENDER_PEARL = item('ender_pearl', 'Perla de ender', { stack: 16 });
export const APPLE = item('apple', 'Manzana', { food: { hunger: 4, saturation: 2.4 } });
export const RAW_PORKCHOP = item('raw_porkchop', 'Chuleta de cerdo cruda', { food: { hunger: 3, saturation: 1.8 } });
export const COOKED_PORKCHOP = item('cooked_porkchop', 'Chuleta de cerdo cocinada', { food: { hunger: 8, saturation: 12.8 } });
export const RAW_BEEF = item('raw_beef', 'Filete crudo', { food: { hunger: 3, saturation: 1.8 } });
export const STEAK = item('steak', 'Filete', { food: { hunger: 8, saturation: 12.8 } });
export const RAW_CHICKEN = item('raw_chicken', 'Pollo crudo', { food: { hunger: 2, saturation: 1.2 } });
export const COOKED_CHICKEN = item('cooked_chicken', 'Pollo asado', { food: { hunger: 6, saturation: 7.2 } });
export const RAW_MUTTON = item('raw_mutton', 'Cordero crudo', { food: { hunger: 2, saturation: 1.2 } });
export const COOKED_MUTTON = item('cooked_mutton', 'Cordero asado', { food: { hunger: 6, saturation: 9.6 } });
export const BREAD = item('bread', 'Pan', { food: { hunger: 5, saturation: 6 } });
export const BUCKET = item('bucket', 'Cubo', { stack: 16 });
export const WATER_BUCKET = item('water_bucket', 'Cubo de agua', { stack: 1, block: WATER });
export const LAVA_BUCKET = item('lava_bucket', 'Cubo de lava', { stack: 1, block: LAVA, fuel: 1000 });
export const BOW = item('bow', 'Arco', { stack: 1, fuel: 15, tool: { kind: 'bow', tier: 0, speed: 1, durability: 384, damage: 1 } });
export const ARROW = item('arrow', 'Flecha');
export const SHEARS = item('shears', 'Tijeras', { stack: 1, tool: { kind: 'shears', tier: 0, speed: 1.5, durability: 238, damage: 1 } });

/** Materiales de herramienta: [prefijo, nombre, nivel, velocidad de minado, durabilidad]. */
const MATERIALS: [string, string, number, number, number][] = [
  ['wooden', 'de madera', 1, 2, 59],
  ['stone', 'de piedra', 2, 4, 131],
  ['iron', 'de hierro', 3, 6, 250],
  ['golden', 'de oro', 1, 12, 32],
  ['diamond', 'de diamante', 4, 8, 1561],
];
const KINDS: [ToolType, string][] = [['pickaxe', 'Pico'], ['axe', 'Hacha'], ['shovel', 'Pala'], ['sword', 'Espada']];
/**
 * Daño por golpe y velocidad de ataque de Minecraft Java por tipo y material (madera, piedra,
 * hierro, oro, diamante): la espada es rápida, el hacha pega fuerte pero lenta.
 */
const COMBAT: Record<string, [damage: number[], speed: number[]]> = {
  sword: [[4, 5, 6, 4, 7], [1.6, 1.6, 1.6, 1.6, 1.6]],
  axe: [[7, 9, 9, 7, 9], [0.8, 0.8, 0.9, 1, 1]],
  pickaxe: [[2, 3, 4, 2, 5], [1.2, 1.2, 1.2, 1.2, 1.2]],
  shovel: [[2.5, 3.5, 4.5, 2.5, 5.5], [1, 1, 1, 1, 1]],
  hoe: [[1, 1, 1, 1, 1], [1, 2, 3, 1, 4]],
};
/** TOOLS[material][tipo] → id. */
export const TOOLS: Record<string, Record<string, number>> = {};
MATERIALS.forEach(([mat, matName, tier, speed, dur], m) => {
  TOOLS[mat] = {};
  for (const [kind, kindName] of KINDS) {
    TOOLS[mat][kind] = item(`${mat}_${kind}`, `${kindName} ${matName}`, {
      stack: 1,
      fuel: mat === 'wooden' ? 10 : undefined,
      tool: { kind, tier, speed, durability: dur, damage: COMBAT[kind][0][m], attackSpeed: COMBAT[kind][1][m] },
    });
  }
});

// ------------------------------------------------------------------ granja
// (Van al final para no cambiar los ids de los objetos guardados en inventarios y cofres.)
export const WHEAT_SEEDS = item('wheat_seeds', 'Semillas de trigo', { block: WHEAT_CROP });
export const WHEAT = item('wheat', 'Trigo');
export const CARROT = item('carrot', 'Zanahoria', { block: CARROTS, food: { hunger: 3, saturation: 3.6 } });
export const POTATO = item('potato', 'Patata', { block: POTATOES, food: { hunger: 1, saturation: 0.6 } });
export const BAKED_POTATO = item('baked_potato', 'Patata asada', { food: { hunger: 5, saturation: 6 } });
export const BEETROOT = item('beetroot', 'Remolacha', { food: { hunger: 1, saturation: 1.2 } });
export const BEETROOT_SEEDS = item('beetroot_seeds', 'Semillas de remolacha', { block: BEETROOTS });
export const BONE_MEAL = item('bone_meal', 'Polvo de hueso');
export const EGG = item('egg', 'Huevo', { stack: 16 });
export const MILK_BUCKET = item('milk_bucket', 'Cubo de leche', { stack: 1, drink: true });
export const SUGAR = item('sugar', 'Azúcar');
MATERIALS.forEach(([mat, matName, tier, speed, dur], m) => {
  TOOLS[mat].hoe = item(`${mat}_hoe`, `Azada ${matName}`, {
    stack: 1,
    fuel: mat === 'wooden' ? 10 : undefined,
    tool: { kind: 'hoe', tier, speed, durability: dur, damage: COMBAT.hoe[0][m], attackSpeed: COMBAT.hoe[1][m] },
  });
});
ITEMS[CAKE].stack = 1;

// ------------------------------------------------------------------ armaduras (fase 4)
const ARMOR_NAMES: Record<string, [string, string]> = {
  leather: ['de cuero', 'de cuero'], golden: ['de oro', 'de oro'], iron: ['de hierro', 'de hierro'], diamond: ['de diamante', 'de diamante'],
};
const PIECE_NAMES = ['Casco', 'Peto', 'Grebas', 'Botas'];
/** ARMOR[material][pieza] → id (materiales: leather, iron, golden, diamond). */
export const ARMOR: Record<string, Record<string, number>> = {};
for (const mat of ARMOR_MATERIALS) {
  ARMOR[mat] = {};
  const st = ARMOR_STATS[mat];
  ARMOR_PIECES.forEach((piece, slot) => {
    ARMOR[mat][piece] = item(`${mat}_${piece}`, `${PIECE_NAMES[slot]} ${ARMOR_NAMES[mat][0]}`, {
      stack: 1,
      armor: { slot: slot as ArmorSlot, material: mat, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] },
    });
  });
}

// ------------------------------------------------------------------ combate y estado (fase 4)
export const GOLDEN_APPLE = item('golden_apple', 'Manzana dorada', {
  food: { hunger: 4, saturation: 9.6, always: true, effects: [[EFFECT_REGENERATION, 5, 1, 1], [EFFECT_ABSORPTION, 120, 0, 1]] },
});
export const SPIDER_EYE = item('spider_eye', 'Ojo de araña', {
  food: { hunger: 2, saturation: 3.2, effects: [[EFFECT_POISON, 5, 0, 1]] },
});
/** Escudo: se levanta con clic derecho mantenido y bloquea lo que llega de frente. */
export const SHIELD = item('shield', 'Escudo', {
  stack: 1, fuel: 15, tool: { kind: 'shield', tier: 0, speed: 1, durability: 336, damage: 1 },
});

// ------------------------------------------------------------------ calabazas, sandías y pesca (fase 4)
export const PUMPKIN_SEEDS = item('pumpkin_seeds', 'Semillas de calabaza', { block: PUMPKIN_STEM });
export const MELON_SEEDS = item('melon_seeds', 'Semillas de sandía', { block: MELON_STEM });
export const MELON_SLICE = item('melon_slice', 'Rodaja de sandía', { food: { hunger: 2, saturation: 1.2 } });
export const PUMPKIN_PIE = item('pumpkin_pie', 'Tarta de calabaza', { food: { hunger: 8, saturation: 4.8 } });
export const FISHING_ROD = item('fishing_rod', 'Caña de pescar', {
  stack: 1, fuel: 15, tool: { kind: 'fishing_rod', tier: 0, speed: 1, durability: 64, damage: 1 },
});
export const COD = item('cod', 'Bacalao crudo', { food: { hunger: 2, saturation: 0.4 } });
export const COOKED_COD = item('cooked_cod', 'Bacalao cocinado', { food: { hunger: 5, saturation: 6 } });
export const SALMON = item('salmon', 'Salmón crudo', { food: { hunger: 2, saturation: 0.4 } });
export const COOKED_SALMON = item('cooked_salmon', 'Salmón cocinado', { food: { hunger: 6, saturation: 9.6 } });
export const TROPICAL_FISH = item('tropical_fish', 'Pez tropical', { food: { hunger: 1, saturation: 0.2 } });
/** Pez globo: Hambre III, Veneno II y (Fase 7: efectos) Náuseas I, como en Minecraft Java. */
export const PUFFERFISH = item('pufferfish', 'Pez globo', {
  food: { hunger: 1, saturation: 0.2, effects: [[EFFECT_HUNGER, 15, 2, 1], [EFFECT_POISON, 60, 1, 1], [EFFECT_NAUSEA, 15, 0, 1]] },
});

// ------------------------------------------------------------------ subsuelo (fase 5)
export const COPPER_INGOT = item('copper_ingot', 'Lingote de cobre');
export const EMERALD = item('emerald', 'Esmeralda');
export const AMETHYST_SHARD = item('amethyst_shard', 'Fragmento de amatista');
/** Bayas luminosas: se comen o se plantan bajo un techo (enredaderas de cueva). */
export const GLOW_BERRIES = item('glow_berries', 'Bayas luminosas', { block: CAVE_VINES, food: { hunger: 2, saturation: 0.4 } });

// ------------------------------------------------------------------ mapas, brújula y nieve (fase 5)
export const COMPASS = item('compass', 'Brújula');
export const EMPTY_MAP = item('map', 'Mapa vacío');
/** Mapa de una zona: la celda de 128×128 bloques va en `dmg` (ver maps.ts). */
export const FILLED_MAP = item('filled_map', 'Mapa');
export const SNOWBALL = item('snowball', 'Bola de nieve', { stack: 16 });

// ------------------------------------------------------------------ Fase 6 (monturas): silla de montar
export const SADDLE = item('saddle', 'Silla de montar', { stack: 1 });
// ------------------------------------------------------------------ Fase 6 (monstruos): botín y pociones de bruja
export const SLIME_BALL = item('slime_ball', 'Bola de slime');
export const PHANTOM_MEMBRANE = item('phantom_membrane', 'Membrana de phantom');
/** Pociones arrojadizas que lanzan las brujas (al romperse dan su efecto alrededor). */
export const SPLASH_HARMING = item('splash_potion_harming', 'Poción arrojadiza de daño', { stack: 1 });
export const SPLASH_SLOWNESS = item('splash_potion_slowness', 'Poción arrojadiza de lentitud', { stack: 1 });
export const SPLASH_POISON = item('splash_potion_poison', 'Poción arrojadiza de veneno', { stack: 1 });
// ------------------------------------------------------------------ Fase 6 (acuáticos): cubos con criatura
// Se llenan usando un cubo de agua sobre la criatura; al vaciarlos sale el agua y la criatura.
export const COD_BUCKET = item('cod_bucket', 'Cubo con bacalao', { stack: 1, block: WATER });
export const SALMON_BUCKET = item('salmon_bucket', 'Cubo con salmón', { stack: 1, block: WATER });
export const TROPICAL_FISH_BUCKET = item('tropical_fish_bucket', 'Cubo con pez tropical', { stack: 1, block: WATER });
export const PUFFERFISH_BUCKET = item('pufferfish_bucket', 'Cubo con pez globo', { stack: 1, block: WATER });
export const AXOLOTL_BUCKET = item('axolotl_bucket', 'Cubo con ajolote', { stack: 1, block: WATER });
export const TADPOLE_BUCKET = item('tadpole_bucket', 'Cubo con renacuajo', { stack: 1, block: WATER });
// ------------------------------------------------------------------ fauna (fase 6)
export const GLASS_BOTTLE = item('glass_bottle', 'Frasco de cristal', { stack: 16 });
/** Frasco de miel: se bebe aunque no haya hambre, quita el veneno y devuelve el frasco vacío. */
export const HONEY_BOTTLE = item('honey_bottle', 'Frasco de miel', { stack: 16, food: { hunger: 6, saturation: 1.2, always: true } });
export const HONEYCOMB = item('honeycomb', 'Panal');
export const RAW_RABBIT = item('raw_rabbit', 'Conejo crudo', { food: { hunger: 3, saturation: 1.8 } });
export const COOKED_RABBIT = item('cooked_rabbit', 'Conejo cocinado', { food: { hunger: 5, saturation: 6 } });
export const RABBIT_HIDE = item('rabbit_hide', 'Piel de conejo');
export const ARMADILLO_SCUTE = item('armadillo_scute', 'Escama de armadillo');
/** Cepillo: saca escamas a los armadillos (16 de desgaste por escama). */
export const BRUSH = item('brush', 'Cepillo', { stack: 1, tool: { kind: 'brush', tier: 0, speed: 1, durability: 64, damage: 1 } });
// ------------------------------------------------------------------ Fase 6 (asaltos)
/** Botella ominosa: la suelta el capitán de una patrulla; al beberla da Mal presagio. */
export const OMINOUS_BOTTLE = item('ominous_bottle', 'Botella ominosa', { food: { hunger: 0, saturation: 0, always: true } });
/** Tótem de inmortalidad: en la mano (o la secundaria), salva de una muerte segura. */
export const TOTEM_OF_UNDYING = item('totem_of_undying', 'Tótem de inmortalidad', { stack: 1 });
// ------------------------------------------------------------------ Fase 6.5 (colores): tintes
/** Tinte de cada uno de los 16 colores. */
export const DYES = {} as Record<DyeColor, number>;
for (const c of DYE_COLORS) DYES[c] = item(`${c}_dye`, `Tinte ${COLOR_NAMES[c][0]}`);
// Los estandartes se apilan de 16 en 16 y arden como la madera; las alfombras, un poco.
for (const c of DYE_COLORS) {
  ITEMS[BANNERS[c]].stack = 16;
  ITEMS[BANNERS[c]].fuel = 15;
  ITEMS[CARPETS[c]].fuel = 3.35;
}
// ------------------------------------------------------------------ Fase 6.5 (cobre)
/** Cobre en bruto: lo sueltan las menas de cobre; se funde en lingotes. */
export const RAW_COPPER = item('raw_copper', 'Cobre en bruto');
export const COPPER_NUGGET = item('copper_nugget', 'Pepita de cobre');
// Herramientas de cobre (la «Edad del cobre»): cosechan como las de piedra, algo más rápidas y duraderas.
TOOLS.copper = {};
for (const [kind, kindName, damage, attackSpeed] of [
  ['pickaxe', 'Pico', 3, 1.2], ['axe', 'Hacha', 9, 0.8], ['shovel', 'Pala', 3.5, 1], ['sword', 'Espada', 5, 1.6], ['hoe', 'Azada', 1, 2],
] as const) {
  TOOLS.copper[kind] = item(`copper_${kind}`, `${kindName} de cobre`, {
    stack: 1, tool: { kind, tier: 2, speed: 5, durability: 190, damage, attackSpeed },
  });
}
// Armadura de cobre: entre la de cuero y la de hierro.
ARMOR[COPPER_ARMOR] = {};
ARMOR_PIECES.forEach((piece, slot) => {
  const st = ARMOR_STATS[COPPER_ARMOR];
  ARMOR[COPPER_ARMOR][piece] = item(`copper_${piece}`, `${PIECE_NAMES[slot]} de cobre`, {
    stack: 1,
    armor: { slot: slot as ArmorSlot, material: COPPER_ARMOR, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] },
  });
});
// Las puertas de cobre se ven planas, con el color de su fase (las enceradas, como las otras).
COPPER.door.forEach((row) => row.forEach((id, stage) => (ITEMS[id].sprite = copperTexture('copper_door', stage))));
// ------------------------------------------------------------------ Fase 6.5 (océano y plantas)
/** Algas secas: comida rápida (el alga se seca en el horno). */
export const DRIED_KELP = item('dried_kelp', 'Algas secas', { food: { hunger: 1, saturation: 0.6 } });
/** Bayas dulces: se comen o se plantan (arbusto de bayas dulces). */
export const SWEET_BERRIES = item('sweet_berries', 'Bayas dulces', { block: SWEET_BERRY_BUSH, food: { hunger: 2, saturation: 0.4 } });
export const PRISMARINE_SHARD = item('prismarine_shard', 'Fragmento de prismarina');
export const PRISMARINE_CRYSTALS = item('prismarine_crystals', 'Cristales de prismarina');
ITEMS[KELP].smelt = DRIED_KELP;
ITEMS[WET_SPONGE].smelt = SPONGE;
ITEMS[DRIED_KELP_BLOCK].fuel = 200;

// Comida con efectos (valores de Minecraft).
ITEMS[OMINOUS_BOTTLE].food!.effects = [[EFFECT_BAD_OMEN, BAD_OMEN_SECONDS, 0, 1]]; // Fase 6 (asaltos)
ITEMS[ROTTEN_FLESH].food!.effects = [[EFFECT_HUNGER, 30, 0, 0.8]];
ITEMS[RAW_CHICKEN].food!.effects = [[EFFECT_HUNGER, 30, 0, 0.3]];

/** Comida que acepta cada animal para criar (y que le hace seguir al jugador). */
export const BREED_FOOD: Readonly<Record<string, readonly number[]>> = {
  cow: [WHEAT],
  sheep: [WHEAT],
  pig: [CARROT, POTATO, BEETROOT],
  chicken: [WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS],
  goat: [WHEAT],
  rabbit: [CARROT],
  fox: [GLOW_BERRIES],
  // Fase 6 (monturas): caballos y burros (domados) con manzanas doradas o trigo; llamas con heno;
  // camellos con cactus. Las mulas no crían.
  horse: [GOLDEN_APPLE, WHEAT],
  donkey: [GOLDEN_APPLE, WHEAT],
  llama: [HAY_BALE],
  camel: [CACTUS],
  // Fase 6 (fauna): los armadillos comen ojos de araña. Fase 6.5 (maderas): los pandas, bambú.
  panda: [BAMBOO],
  armadillo: [SPIDER_EYE],
};
// Fase 6.5 (océano y plantas): los zorros también crían con bayas dulces.
(BREED_FOOD.fox as number[]).push(SWEET_BERRIES);

// ------------------------------------------------------------------ Fase 6.5 (decoración)
// Comida (valores de Minecraft), pepitas, cuenco, catalejo, reloj, cuadros, marcos y huevos generadores.
export const BOWL = item('bowl', 'Cuenco', { fuel: 5 });
export const IRON_NUGGET = item('iron_nugget', 'Pepita de hierro');
export const GOLD_NUGGET = item('gold_nugget', 'Pepita de oro');
export const COCOA_BEANS = item('cocoa_beans', 'Granos de cacao');
export const COOKIE = item('cookie', 'Galleta', { food: { hunger: 2, saturation: 0.4 } });
/** Estofados y sopas: no se apilan y devuelven el cuenco al comerlos. */
export const MUSHROOM_STEW = item('mushroom_stew', 'Estofado de champiñones', { stack: 1, food: { hunger: 6, saturation: 7.2 } });
export const RABBIT_STEW = item('rabbit_stew', 'Estofado de conejo', { stack: 1, food: { hunger: 10, saturation: 12 } });
export const BEETROOT_SOUP = item('beetroot_soup', 'Sopa de remolacha', { stack: 1, food: { hunger: 6, saturation: 7.2 } });
/** Estofado sospechoso: el efecto depende de la flor con que se hizo (va en `dmg`, ver decorFood.ts). */
export const SUSPICIOUS_STEW = item('suspicious_stew', 'Estofado sospechoso', { stack: 1, food: { hunger: 6, saturation: 7.2, always: true } });
export const GOLDEN_CARROT = item('golden_carrot', 'Zanahoria dorada', { food: { hunger: 6, saturation: 14.4 } });
export const GLISTERING_MELON_SLICE = item('glistering_melon_slice', 'Rodaja de sandía reluciente');
/** Catalejo: con el clic derecho mantenido se mira de lejos. */
export const SPYGLASS = item('spyglass', 'Catalejo', { stack: 1 });
/** Reloj: en la mano muestra la hora del mundo. */
export const CLOCK = item('clock', 'Reloj');
/** Cuadro y marco: se cuelgan en una pared (entidades). */
export const PAINTING = item('painting', 'Cuadro');
export const ITEM_FRAME = item('item_frame', 'Marco');
/** Huevos generadores por clave de criatura: al usarlos sobre un bloque aparece la criatura. */
export const SPAWN_EGGS: Record<string, number> = {};
for (const e of SPAWN_EGG_DEFS) SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `Huevo generador de ${e.name}`);
/** Clave de la criatura de un huevo generador ('' si no lo es). */
export function spawnEggMob(id: number): string {
  const k = ITEMS[id]?.key ?? '';
  return k.endsWith('_spawn_egg') && SPAWN_EGGS[k.slice(0, -10)] === id ? k.slice(0, -10) : '';
}

/** Bolsa de tinta: la suelta el calamar; da el tinte negro. */
export const INK_SAC = item('ink_sac', 'Saco de tinta');
// Fase 6.5 (remate): etiqueta (pone nombre a una criatura) y correa (la ata al jugador o a una valla).
export const NAME_TAG = item('name_tag', 'Etiqueta');
export const LEAD = item('lead', 'Correa');
/** Saco: guarda varios objetos distintos en una ranura (hasta 64 de peso). Liso y de los 16 colores. */
export const BUNDLE = item('bundle', 'Saco', { stack: 1 });
export const DYED_BUNDLES = {} as Record<DyeColor, number>;
for (const c of DYE_COLORS) DYED_BUNDLES[c] = item(`${c}_bundle`, `Saco ${COLOR_NAMES[c][0]}`, { stack: 1 });
/** Soporte para armadura: se pone sobre un bloque y se le viste con clic derecho. */
export const ARMOR_STAND = item('armor_stand', 'Soporte para armadura', { stack: 16 });
// ------------------------------------------------------------------ Fase 6.5 (libros y estandartes)
/** Libro y pluma: se escribe (sus páginas van en los datos de la pila) y se firma. */
export const WRITABLE_BOOK = item('writable_book', 'Libro y pluma', { stack: 1 });
/** Libro escrito: firmado (título, autor y generación); se lee y se copia. */
export const WRITTEN_BOOK = item('written_book', 'Libro escrito', { stack: 16 });
/** Diseños de estandarte: dibujos del telar que necesitan su diseño (no se gastan). */
export const BANNER_PATTERN_ITEMS = {
  flower: item('flower_banner_pattern', 'Diseño de estandarte (Flor)', { stack: 1 }),
  creeper: item('creeper_banner_pattern', 'Diseño de estandarte (Creeper)', { stack: 1 }),
  skull: item('skull_banner_pattern', 'Diseño de estandarte (Calavera)', { stack: 1 }),
  thing: item('thing_banner_pattern', 'Diseño de estandarte (Cosa)', { stack: 1 }),
  globe: item('globe_banner_pattern', 'Diseño de estandarte (Globo)', { stack: 1 }),
  curly_border: item('bordure_indented_banner_pattern', 'Diseño de estandarte (Bordura dentada)', { stack: 1 }),
  bricks: item('field_masoned_banner_pattern', 'Diseño de estandarte (Campo de ladrillos)', { stack: 1 }),
} as const;
// ------------------------------------------------------------------ Fase 6.5 (materiales)
/** Hierro y oro en bruto: los sueltan sus menas; se funden en lingotes. */
export const RAW_IRON = item('raw_iron', 'Hierro en bruto');
export const RAW_GOLD = item('raw_gold', 'Oro en bruto');
/** Cubo de nieve polvo: un cubo vacío sobre la nieve polvo la recoge; al vaciarlo, la pone y queda el cubo. */
export const POWDER_SNOW_BUCKET = item('powder_snow_bucket', 'Cubo de nieve polvo', { stack: 1, block: POWDER_SNOW });
// ------------------------------------------------------------------ Fase 6.5 (colecciones)
/** Saco de tinta brillante: lo suelta el calamar brillante; con un marco se hace el marco brillante. */
export const GLOW_INK_SAC = item('glow_ink_sac', 'Saco de tinta brillante');
/** Marco brillante: como el marco, pero el objeto que muestra se ve a plena luz aunque esté a oscuras. */
export const GLOW_ITEM_FRAME = item('glow_item_frame', 'Marco brillante');
/** Discos de música, en el orden de DISCS (discs.ts); el título va en la descripción. */
// Fase 7.5 (abismo): el disco 5 se registra al final (su objeto no puede ir aquí sin mover los ids de detrás).
export const MUSIC_DISCS: readonly number[] = DISCS.filter((d) => d.key !== '5' && d.key !== 'tears' && d.key !== 'pigstep').map((d) => item(`music_disc_${d.key}`, 'Disco de música', { stack: 1 }));
// Las cabezas se llevan en el hueco del casco (sin puntos de armadura ni desgaste).
for (const k of ALL_SKULL_KINDS) ITEMS[SKULLS[k]].armor = { slot: 0, material: 'leather', points: 0, toughness: 0, durability: 0 };

// ------------------------------------------------------------------ Fase 6.5 (equipo)
/** Mechero: enciende fuego en la cara tocada, velas y fogatas (64 usos). */
export const FLINT_AND_STEEL = item('flint_and_steel', 'Mechero', {
  stack: 1, tool: { kind: 'lighter', tier: 0, speed: 1, durability: 64, damage: 1 },
});
// Armadura de cota de malla: no se fabrica (botín y comercio con el armero).
ARMOR[CHAINMAIL_ARMOR] = {};
ARMOR_PIECES.forEach((piece, slot) => {
  const st = ARMOR_STATS[CHAINMAIL_ARMOR];
  ARMOR[CHAINMAIL_ARMOR][piece] = item(`chainmail_${piece}`, `${PIECE_NAMES[slot]} de cota de malla`, {
    stack: 1,
    armor: { slot: slot as ArmorSlot, material: CHAINMAIL_ARMOR, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] },
  });
});
/** Ballesta y ballesta cargada (la misma, con un virote puesto: se cambia al cargarla y al disparar). */
export const CROSSBOW = item('crossbow', 'Ballesta', { stack: 1, tool: { kind: 'crossbow', tier: 0, speed: 1, durability: 465, damage: 1 } });
export const CROSSBOW_CHARGED = item('crossbow_charged', 'Ballesta', { stack: 1, tool: { kind: 'crossbow', tier: 0, speed: 1, durability: 465, damage: 1 } });
/** Tridente: 9 de daño cuerpo a cuerpo; con el clic derecho mantenido se lanza. */
export const TRIDENT = item('trident', 'Tridente', { stack: 1, tool: { kind: 'trident', tier: 0, speed: 1, durability: 250, damage: 9, attackSpeed: 1.1 } });
export const TURTLE_SCUTE = item('turtle_scute', 'Escama de tortuga');
/** Caparazón de tortuga: casco que da respiración acuática al sacar la cabeza del agua. */
export const TURTLE_HELMET = item('turtle_helmet', 'Caparazón de tortuga', {
  stack: 1, armor: { slot: 0, material: TURTLE_ARMOR, points: 2, toughness: 0, durability: ARMOR_STATS[TURTLE_ARMOR].durability[0] },
});
/** Armaduras para caballo por material (leather, iron, golden, diamond). */
export const HORSE_ARMOR: Record<string, number> = {};
for (const [mat, name] of [['leather', 'de cuero'], ['iron', 'de hierro'], ['golden', 'de oro'], ['diamond', 'de diamante']] as const) {
  HORSE_ARMOR[mat] = item(`${mat}_horse_armor`, `Armadura ${name} para caballo`, { stack: 1 });
}
/** Armadura para lobo: absorbe el daño del lobo domesticado y se desgasta. */
export const WOLF_ARMOR = item('wolf_armor', 'Armadura para lobo', {
  stack: 1, tool: { kind: 'body_armor', tier: 0, speed: 1, durability: WOLF_ARMOR_DURABILITY, damage: 1 },
});
/** Caña con zanahoria: guía al cerdo ensillado que se monta (y le da un acelerón). */
export const CARROT_ON_A_STICK = item('carrot_on_a_stick', 'Caña con zanahoria', {
  stack: 1, tool: { kind: 'carrot_stick', tier: 0, speed: 1, durability: 25, damage: 1 },
});
/** Cuerno de cabra: la tonada va en el desgaste de la pila (1..8). */
export const GOAT_HORN = item('goat_horn', 'Cuerno de cabra', { stack: 1 });
export const RABBIT_FOOT = item('rabbit_foot', 'Pata de conejo');
export const POISONOUS_POTATO = item('poisonous_potato', 'Patata venenosa', {
  food: { hunger: 2, saturation: 1.2, effects: [[EFFECT_POISON, 5, 0, 0.6]] },
});
/** Manzana de oro encantada: sólo en el botín de las estructuras. */
export const ENCHANTED_GOLDEN_APPLE = item('enchanted_golden_apple', 'Manzana de oro encantada', {
  food: {
    hunger: 4, saturation: 9.6, always: true,
    effects: [[EFFECT_REGENERATION, 20, 1, 1], [EFFECT_ABSORPTION, 120, 3, 1], [EFFECT_RESISTANCE, 300, 0, 1], [EFFECT_FIRE_RESISTANCE, 300, 0, 1]],
  },
});
export const HEART_OF_THE_SEA = item('heart_of_the_sea', 'Corazón del mar');
export const NAUTILUS_SHELL = item('nautilus_shell', 'Concha de nautilo');
/** Cohete y estrella de fuegos artificiales (su vuelo y sus colores van en el desgaste; ver equipment.ts). */
export const FIREWORK_ROCKET = item('firework_rocket', 'Cohete de fuegos artificiales');
export const FIREWORK_STAR = item('firework_star', 'Estrella de fuegos artificiales');
// ------------------------------------------------------------------ Fase 7 (encantamientos)
/** Libro encantado: guarda encantamientos (`data.stored`) para ponerlos con el yunque. */
export const ENCHANTED_BOOK = item('enchanted_book', 'Libro encantado', { stack: 1 });
/** Botella con experiencia: se lanza y al romperse suelta orbes (de 3 a 11 puntos). */
export const EXPERIENCE_BOTTLE = item('experience_bottle', 'Botella con experiencia');

// ------------------------------------------------------------------ Fase 7 (pociones)
/**
 * Pociones: el tipo va en `dmg` (0 = agua; ver potions.ts). El frasco se bebe; las arrojadizas y las
 * persistentes se lanzan; las flechas con efecto se disparan con el arco y la ballesta.
 */
export const POTION = item('potion', 'Poción', { stack: 1, drink: true });
export const SPLASH_POTION = item('splash_potion', 'Poción arrojadiza', { stack: 1 });
export const LINGERING_POTION = item('lingering_potion', 'Poción persistente', { stack: 1 });
export const TIPPED_ARROW = item('tipped_arrow', 'Flecha con efecto');
/** Ingredientes de destilación que faltaban. Los del Nether y el End, de momento sólo en creativo y en el botín. */
export const FERMENTED_SPIDER_EYE = item('fermented_spider_eye', 'Ojo de araña fermentado');
export const GLOWSTONE_DUST = item('glowstone_dust', 'Polvo de piedra luminosa');
export const NETHER_WART = item('nether_wart', 'Verruga del Nether', { block: NETHER_WART_CROP }); // Fase 8.4: se planta en arena de alma
export const BLAZE_ROD = item('blaze_rod', 'Vara de blaze', { fuel: 120 });
export const BLAZE_POWDER = item('blaze_powder', 'Polvo de blaze');
export const MAGMA_CREAM = item('magma_cream', 'Crema de magma');
export const GHAST_TEAR = item('ghast_tear', 'Lágrima de ghast');
export const DRAGON_BREATH = item('dragon_breath', 'Aliento de dragón');
// El alambique se ve plano en el inventario y en la mano (como en Minecraft).
ITEMS[BREWING_STAND].sprite = 'brewing_stand';
// ------------------------------------------------------------------ Fase 7 (transporte)
/** Barcas y barcas con cofre por madera (la de bambú es una balsa), en el orden de BOAT_WOODS. */
const BOAT_NAMES: [string, string][] = [
  ['oak', 'de roble'], ['spruce', 'de abeto'], ['birch', 'de abedul'], ['jungle', 'de jungla'], ['acacia', 'de acacia'],
  ['dark_oak', 'de roble oscuro'], ['mangrove', 'de mangle'], ['cherry', 'de cerezo'], ['pale_oak', 'de roble pálido'],
  ['bamboo', 'de bambú'],
];
export const BOAT_ITEMS: Record<string, number> = {};
export const CHEST_BOAT_ITEMS: Record<string, number> = {};
for (const [wood, name] of BOAT_NAMES) {
  const raft = wood === 'bamboo';
  BOAT_ITEMS[wood] = item(raft ? 'bamboo_raft' : `${wood}_boat`, raft ? 'Balsa de bambú' : `Barca ${name}`, { stack: 1, fuel: 60 });
  CHEST_BOAT_ITEMS[wood] = item(raft ? 'bamboo_chest_raft' : `${wood}_chest_boat`, raft ? 'Balsa de bambú con cofre' : `Barca ${name} con cofre`, { stack: 1 });
}
export const MINECART = item('minecart', 'Vagoneta', { stack: 1 });
export const CHEST_MINECART = item('chest_minecart', 'Vagoneta con cofre', { stack: 1 });
export const FURNACE_MINECART = item('furnace_minecart', 'Vagoneta con horno', { stack: 1 });
// ------------------------------------------------------------------ Fase 7 (redstone)
// El polvo de redstone pone el polvo en el suelo y la cuerda, la cuerda tendida (como las semillas
// plantan su cultivo); la puerta de hierro se ve plana en la mano, como las de madera. El cuarzo del
// Nether (comparador y sensor de luz solar) sólo sale en el Nether (fase 8): de momento, en creativo.
ITEMS[REDSTONE].block = REDSTONE_WIRE;
ITEMS[STRING].block = TRIPWIRE;
ITEMS[IRON_DOOR].sprite = 'iron_door';
export const QUARTZ = item('quartz', 'Cuarzo del Nether');
// ------------------------------------------------------------------ Fase 7 (mecanismos)
// La tolva se ve plana en el inventario y en la mano (como en Minecraft); las vagonetas con tolva y con
// dinamita las registra el transporte (vehicleItems.ts).
ITEMS[HOPPER].sprite = 'hopper';
export const HOPPER_MINECART = item('hopper_minecart', 'Vagoneta con tolva', { stack: 1 });
export const TNT_MINECART = item('tnt_minecart', 'Vagoneta con dinamita', { stack: 1 });
// Fase 7.5: huevos generadores de las criaturas nuevas (océano: guardianes; fauna: murciélago, ocelote…; abismo: warden).
for (const e of LATE_SPAWN_EGG_DEFS) SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `Huevo generador de ${e.name}`);

// ------------------------------------------------------------------ Fase 7.5 (abismo)
/** Fragmento de eco (sólo en las ciudades antiguas): ocho alrededor de una brújula dan la de recuperación. */
export const ECHO_SHARD = item('echo_shard', 'Fragmento de eco');
/** Brújula de recuperación: apunta a donde murió el jugador por última vez (gira sin rumbo si no hay). */
export const RECOVERY_COMPASS = item('recovery_compass', 'Brújula de recuperación');
/** Fragmento del disco 5: nueve hacen el disco. */
export const DISC_FRAGMENT_5 = item('disc_fragment_5', 'Fragmento de disco');
export const MUSIC_DISC_5 = item('music_disc_5', 'Disco de música', { stack: 1 });
(MUSIC_DISCS as number[]).push(MUSIC_DISC_5);
// ------------------------------------------------------------------ Fase 8.2 (biomas del Nether)
/** Ladrillo del Nether: sale de fundir rocanegra; cuatro hacen un bloque de ladrillos del Nether. */
export const NETHER_BRICK = item('nether_brick', 'Ladrillo del Nether');
// ------------------------------------------------------------------ Fase 8.3 (criaturas del Nether)
/** Caña con hongo distorsionado: guía al strider ensillado que se monta; cada acelerón gasta 1 de sus 100 usos. */
export const WARPED_FUNGUS_ON_A_STICK = item('warped_fungus_on_a_stick', 'Caña con hongo distorsionado', {
  stack: 1, tool: { kind: 'carrot_stick', tier: 0, speed: 1, durability: 100, damage: 1 },
});
/** Carga de fuego: enciende fuego donde se usa (se gasta) y el dispensador la lanza como bola de fuego pequeña. */
export const FIRE_CHARGE = item('fire_charge', 'Carga de fuego');
/** Flecha espectral: lo que alcanza brilla 10 s (se ve a través de las paredes). */
export const SPECTRAL_ARROW = item('spectral_arrow', 'Flecha espectral');
/** Disco «Tears»: lo suelta el ghast al que mata su propia bola de fuego devuelta por un jugador. */
export const MUSIC_DISC_TEARS = item('music_disc_tears', 'Disco de música', { stack: 1 });
(MUSIC_DISCS as number[]).push(MUSIC_DISC_TEARS);
for (const e of NETHER_SPAWN_EGG_DEFS) SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `Huevo generador de ${e.name}`);
// Fase 8.4 (estructuras del Nether): el disco «Pigstep» y el diseño de estandarte del hocico, sólo en los cofres de
// los bastiones.
export const MUSIC_DISC_PIGSTEP = item('music_disc_pigstep', 'Disco de música', { stack: 1 });
(MUSIC_DISCS as number[]).push(MUSIC_DISC_PIGSTEP);
export const PIGLIN_BANNER_PATTERN = item('piglin_banner_pattern', 'Diseño de estandarte (Hocico)', { stack: 1 });
(BANNER_PATTERN_ITEMS as Record<string, number>).piglin = PIGLIN_BANNER_PATTERN;
// Fase 8.5 (lo que da el Nether): la netherita (chatarra de los escombros ancestrales, lingote, las herramientas,
// la armadura y la armadura para caballo, que se mejoran desde el diamante en la mesa de herrería con la plantilla)
// y la estrella del Nether (la del Wither, para el faro).
export const NETHERITE_SCRAP = item('netherite_scrap', 'Chatarra de netherita');
export const NETHERITE_INGOT = item('netherite_ingot', 'Lingote de netherita');
export const NETHERITE_UPGRADE_SMITHING_TEMPLATE = item('netherite_upgrade_smithing_template', 'Plantilla de herrería (Mejora de netherita)');
TOOLS.netherite = {};
for (const [kind, kindName, damage, attackSpeed] of [
  ['sword', 'Espada', 8, 1.6], ['pickaxe', 'Pico', 6, 1.2], ['axe', 'Hacha', 10, 1], ['shovel', 'Pala', 6.5, 1], ['hoe', 'Azada', 1, 4],
] as const) {
  TOOLS.netherite[kind] = item(`netherite_${kind}`, `${kindName} de netherita`, {
    stack: 1, tool: { kind, tier: 4, speed: 9, durability: 2031, damage, attackSpeed },
  });
}
ARMOR[NETHERITE_ARMOR] = {};
ARMOR_PIECES.forEach((piece, slot) => {
  const st = ARMOR_STATS[NETHERITE_ARMOR];
  ARMOR[NETHERITE_ARMOR][piece] = item(`netherite_${piece}`, `${PIECE_NAMES[slot]} de netherita`, {
    stack: 1,
    armor: { slot: slot as ArmorSlot, material: NETHERITE_ARMOR, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] },
  });
});
HORSE_ARMOR.netherite = item('netherite_horse_armor', 'Armadura de netherita para caballo', { stack: 1 });
export const NETHER_STAR = item('nether_star', 'Estrella del Nether');
/** Fase 8.5: objetos que no arden (flotan en la lava y el fuego no los quema): los de netherita y sus escombros. */
export const FIRE_RESISTANT_ITEMS: ReadonlySet<number> = new Set([
  NETHERITE_SCRAP, NETHERITE_INGOT, ...Object.values(TOOLS.netherite), ...Object.values(ARMOR[NETHERITE_ARMOR]), HORSE_ARMOR.netherite,
]);
/** Fase 8.5: objetos que las explosiones no destruyen (la estrella del Nether). */
export const EXPLOSION_RESISTANT_ITEMS: ReadonlySet<number> = new Set([NETHER_STAR]);
// Fase 8.6 (el End): la fruta de coro (se come aunque no haya hambre y teletransporta) y la reventada (del horno,
// para la púrpura y las varas del End).
export const CHORUS_FRUIT = item('chorus_fruit', 'Fruta de coro', { food: { hunger: 4, saturation: 2.4, always: true } });
export const POPPED_CHORUS_FRUIT = item('popped_chorus_fruit', 'Fruta de coro reventada');
/** El ojo de ender: lanzado, vuela hacia la fortaleza más cercana; puesto en un marco del portal del End, lo completa. */
export const ENDER_EYE = item('ender_eye', 'Ojo de ender');
for (const e of END_SPAWN_EGG_DEFS) SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `Huevo generador de ${e.name}`);
/** El cristal del End: se pone sobre obsidiana o lecho de roca y estalla al golpearlo; cuatro en el portal de salida traen otro dragón. */
export const END_CRYSTAL = item('end_crystal', 'Cristal del End');
// Fase 8.6: las cajas de shulker no se apilan (llevan dentro lo suyo).
for (const c of SHULKER_BOX_COLORS) if (ITEMS[SHULKER_BOXES[c]]) ITEMS[SHULKER_BOXES[c]].stack = 1;
/** La concha de shulker (la suelta el shulker): para las cajas de shulker. */
export const SHULKER_SHELL = item('shulker_shell', 'Caparazón de shulker');
/** Los élitros (del barco del End): en el pecho, planean al saltar en el aire; se gastan 1 cada segundo de vuelo. */
export const ELYTRA = item('elytra', 'Élitros', {
  stack: 1, armor: { slot: 1, material: ELYTRA_ARMOR, points: 0, toughness: 0, durability: ARMOR_STATS[ELYTRA_ARMOR].durability[1] },
});

// Fase 8.7 (el Wither): su huevo generador (id nuevo, el último).
for (const e of WITHER_SPAWN_EGG_DEFS) SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `Huevo generador de ${e.name}`);

export const ITEM_COUNT = nextId;
if (ITEM_COUNT > 1024) throw new Error('Demasiados objetos: el rango 256..1023 está lleno');

// ------------------------------------------------------------------ combustibles y fundición
const fuel = (id: number, s: number) => {
  if (ITEMS[id]) ITEMS[id].fuel = s;
};
for (const id of [...ALL_LOGS, ...ALL_PLANKS, CRAFTING_TABLE, BOOKSHELF, CHEST]) fuel(id, 15);
for (const id of ALL_SAPLINGS) fuel(id, 5);
// Bloques de madera con forma (como en Minecraft: vallas, portillos y escaleras 15 s; losas 7,5 s…).
for (const { key: wood } of WOOD_TYPES) {
  for (const id of [FENCES[wood], FENCE_GATES[wood], STAIRS[wood], TRAPDOORS[wood]]) fuel(id, 15);
  fuel(SLABS[wood], 7.5);
  fuel(DOORS[wood], 10);
}
fuel(LADDER, 15);
for (const id of Object.values(SIGNS)) fuel(id, 10);

const smelt = (from: number, to: number) => {
  if (ITEMS[from]) ITEMS[from].smelt = to;
};
smelt(SAND, GLASS);
smelt(COBBLESTONE, STONE);
smelt(IRON_ORE, IRON_INGOT);
smelt(GOLD_ORE, GOLD_INGOT);
for (const log of ALL_LOGS) smelt(log, CHARCOAL);
smelt(RED_SAND, GLASS);
smelt(COPPER_ORE, COPPER_INGOT);
smelt(DEEPSLATE_ORE[IRON_ORE], IRON_INGOT);
smelt(DEEPSLATE_ORE[GOLD_ORE], GOLD_INGOT);
smelt(DEEPSLATE_ORE[COPPER_ORE], COPPER_INGOT);
smelt(COBBLED_DEEPSLATE, DEEPSLATE);
smelt(CLAY_BALL, BRICK);
smelt(CLAY, TERRACOTTA);
smelt(CACTUS, LIME_WOOL);
smelt(RAW_PORKCHOP, COOKED_PORKCHOP);
smelt(RAW_BEEF, STEAK);
smelt(RAW_CHICKEN, COOKED_CHICKEN);
smelt(RAW_MUTTON, COOKED_MUTTON);
smelt(POTATO, BAKED_POTATO);
smelt(COD, COOKED_COD);
smelt(SALMON, COOKED_SALMON);
smelt(RAW_RABBIT, COOKED_RABBIT); // Fase 6 (fauna)
// Fase 6.5 (cobre): el cobre en bruto da lingotes; las herramientas y armaduras de cobre, pepitas.
smelt(RAW_COPPER, COPPER_INGOT);
for (const id of [...Object.values(TOOLS.copper), ...Object.values(ARMOR[COPPER_ARMOR])]) smelt(id, COPPER_NUGGET);

// Los hornos y cofres se apilan hasta 64 como bloque base.
void FURNACE;

/** Nombres de sprite del atlas de objetos (en orden de capa). */
export const ITEM_SPRITES: readonly string[] = ITEMS.filter((i) => i && i.sprite).map((i) => i.sprite!);
const spriteIndex = new Map<string, number>();
ITEM_SPRITES.forEach((n, i) => spriteIndex.set(n, i));
export function itemSpriteIndex(id: number): number {
  const s = ITEMS[id]?.sprite;
  return s ? spriteIndex.get(s) ?? -1 : -1;
}

/**
 * Objeto que corresponde a un bloque del mundo (clic central): el propio bloque, su estado base
 * (hornos encendidos, carteles de pared, cofres dobles) o lo que lo planta (semillas, zanahorias…).
 */
export function itemForBlock(block: number): number {
  if (block <= 0 || (BLOCKS[block]?.fluid && !isWaterlogged(block))) return 0;
  const base = baseBlock(block);
  if (ITEMS[base]?.block === base) return base;
  const fam = familyBase(block);
  const planter = ITEMS.find((i) => i && i.block === fam && !i.tool);
  return planter ? planter.id : 0;
}

export function isValidItem(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id < ITEMS.length && ITEMS[id] !== undefined;
}

export function itemName(id: number): string {
  return ITEMS[id]?.name ?? '?';
}

export function maxStack(id: number): number {
  return ITEMS[id]?.stack ?? 64;
}

/** Una pila de objetos. `dmg` es el desgaste acumulado (herramientas). */
export interface ItemStack {
  id: number;
  count: number;
  dmg?: number;
  /** Fase 6.5 (remate): lo que lleva dentro un saco (el primero es el último que entró). */
  bag?: ItemStack[];
  /** Fase 6.5 (libros y estandartes): páginas de un libro o capas de un estandarte (ver itemData.ts). */
  data?: ItemData;
}

export function sameKind(a: ItemStack | null, b: ItemStack | null): boolean {
  return !!a && !!b && a.id === b.id && (a.dmg ?? 0) === (b.dmg ?? 0) && !ITEMS[a.id]?.tool && !a.bag && !b.bag && sameData(a, b);
}

/** Fase 6.5 (libros y estandartes): ¿llevan las dos pilas los mismos datos? (no se apilan si no). */
function sameData(a: ItemStack, b: ItemStack): boolean {
  if (a.data === b.data) return true;
  return !!a.data && !!b.data && JSON.stringify(a.data) === JSON.stringify(b.data);
}

/** Objetos del inventario creativo que no son bloques. */
export const CREATIVE_ITEMS: readonly number[] = [
  STICK, COAL, CHARCOAL, IRON_INGOT, GOLD_INGOT, DIAMOND, LAPIS, REDSTONE, FLINT, CLAY_BALL, BRICK, BONE, STRING,
  FEATHER, GUNPOWDER, LEATHER, ROTTEN_FLESH, PAPER, BOOK, ENDER_PEARL, APPLE, BREAD, RAW_PORKCHOP, COOKED_PORKCHOP,
  RAW_BEEF, STEAK, RAW_CHICKEN, COOKED_CHICKEN, RAW_MUTTON, COOKED_MUTTON, BUCKET, WATER_BUCKET, LAVA_BUCKET, BOW,
  ARROW, SHEARS, WHEAT_SEEDS, WHEAT, CARROT, POTATO, BAKED_POTATO, BEETROOT, BEETROOT_SEEDS, BONE_MEAL, EGG, SUGAR,
  MILK_BUCKET,
  ...Object.values(TOOLS).flatMap((t) => Object.values(t)),
  ...Object.values(ARMOR).flatMap((a) => Object.values(a)),
  GOLDEN_APPLE, SPIDER_EYE, SHIELD, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, PUMPKIN_PIE, FISHING_ROD, COD, COOKED_COD,
  SALMON, COOKED_SALMON, TROPICAL_FISH, PUFFERFISH, COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES, COMPASS, EMPTY_MAP,
  SNOWBALL,
  SADDLE, // Fase 6 (monturas)
  // Fase 6 (monstruos)
  SLIME_BALL, PHANTOM_MEMBRANE,
  // Fase 6 (acuáticos).
  COD_BUCKET, SALMON_BUCKET, TROPICAL_FISH_BUCKET, PUFFERFISH_BUCKET, AXOLOTL_BUCKET, TADPOLE_BUCKET,
  // Fase 6 (fauna).
  GLASS_BOTTLE, HONEY_BOTTLE, HONEYCOMB, RAW_RABBIT, COOKED_RABBIT, RABBIT_HIDE, ARMADILLO_SCUTE, BRUSH,
  OMINOUS_BOTTLE, TOTEM_OF_UNDYING, // Fase 6 (asaltos)
  ...DYE_COLORS.map((c) => DYES[c]), // Fase 6.5 (colores)
  RAW_COPPER, COPPER_NUGGET, // Fase 6.5 (cobre)
  // Fase 6.5 (decoración).
  BOWL, IRON_NUGGET, GOLD_NUGGET, COCOA_BEANS, COOKIE, MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW, GOLDEN_CARROT,
  GLISTERING_MELON_SLICE, SPYGLASS, CLOCK, PAINTING, ITEM_FRAME, ...Object.values(SPAWN_EGGS),
  DRIED_KELP, SWEET_BERRIES, PRISMARINE_SHARD, PRISMARINE_CRYSTALS, // Fase 6.5 (océano y plantas)
  INK_SAC, NAME_TAG, LEAD, BUNDLE, ...DYE_COLORS.map((c) => DYED_BUNDLES[c]), ARMOR_STAND,
  WRITABLE_BOOK, ...Object.values(BANNER_PATTERN_ITEMS), // Fase 6.5 (libros y estandartes)
  GLOW_INK_SAC, GLOW_ITEM_FRAME, ...MUSIC_DISCS, // Fase 6.5 (colecciones)
];
// Fase 6.5 (equipo): la cota de malla ya entra con ARMOR; la ballesta cargada no está en el creativo.
(CREATIVE_ITEMS as number[]).push(
  FLINT_AND_STEEL, CROSSBOW, TRIDENT, TURTLE_SCUTE, TURTLE_HELMET, ...Object.values(HORSE_ARMOR), WOLF_ARMOR, CARROT_ON_A_STICK,
  GOAT_HORN, RABBIT_FOOT, POISONOUS_POTATO, ENCHANTED_GOLDEN_APPLE, HEART_OF_THE_SEA, NAUTILUS_SHELL, FIREWORK_ROCKET, FIREWORK_STAR,
);

/** Bloques que algún objeto sabe colocar (el servidor sólo acepta éstos en 'place'). */
export const PLACEABLE_BLOCKS: ReadonlySet<number> = new Set(
  ITEMS.filter((i) => i && i.block !== undefined && !i.tool).map((i) => i.block!),
);

// ------------------------------------------------------------------ Fase 6.5 (maderas)
// Combustible del bambú (como en Minecraft: el tallo arde poco; los bloques y las formas, como la
// madera). Los troncos sin corteza, leños y tablones nuevos ya arden por ALL_LOGS y ALL_PLANKS.
fuel(BAMBOO, 2.5);
for (const id of [BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_MOSAIC, STAIRS.bamboo_mosaic]) fuel(id, 15);
fuel(SLABS.bamboo_mosaic, 7.5);
for (const id of [FENCES.bamboo, FENCE_GATES.bamboo, STAIRS.bamboo, TRAPDOORS.bamboo]) fuel(id, 15);
fuel(SLABS.bamboo, 7.5);
fuel(DOORS.bamboo, 10);
// Fase 6.5 (colores): el cactus se funde en tinte verde (antes, a falta de tintes, daba lana verde
// lima) y la terracota de color, en terracota esmaltada.
smelt(CACTUS, DYES.green);
for (const c of DYE_COLORS) smelt(COLORED_TERRACOTTA[c], GLAZED_TERRACOTTA[c]);
// Fase 6.5 (piedras): fundición de piedras (como en Minecraft).
smelt(STONE, SMOOTH_STONE);
smelt(STONE_BRICKS, CRACKED_STONE_BRICKS);
smelt(DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS);
smelt(DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES);
smelt(SANDSTONE, SMOOTH_SANDSTONE);
smelt(RED_SANDSTONE, SMOOTH_RED_SANDSTONE);
// Fase 6.5 (materiales): el hierro y el oro en bruto se funden en lingotes (horno y alto horno); el bloque
// de carbón arde como 9 de carbón (80 objetos); las ranas crían con bolas de slime (y ponen huevos).
smelt(RAW_IRON, IRON_INGOT);
smelt(RAW_GOLD, GOLD_INGOT);
// Fase 7.6 (auditoría de recetas): menas sacadas con Toque de seda, herramientas y armaduras de hierro y oro
// (dan una pepita) y el pepino de mar (tinte lima), como en Minecraft.
for (const [ore, out] of [[COAL_ORE, COAL], [DIAMOND_ORE, DIAMOND], [EMERALD_ORE, EMERALD], [LAPIS_ORE, LAPIS], [REDSTONE_ORE, REDSTONE]] as const) {
  smelt(ore, out);
  smelt(DEEPSLATE_ORE[ore], out);
}
for (const id of [...Object.values(TOOLS.iron), ...Object.values(ARMOR.iron), ...Object.values(ARMOR.chainmail), HORSE_ARMOR.iron]) smelt(id, IRON_NUGGET);
for (const id of [...Object.values(TOOLS.golden), ...Object.values(ARMOR.golden), HORSE_ARMOR.golden]) smelt(id, GOLD_NUGGET);
smelt(SEA_PICKLE, DYES.lime);
fuel(COAL_BLOCK, 800);
(BREED_FOOD as Record<string, readonly number[]>).frog = [SLIME_BALL];
// Fase 7.5 (fauna): el ocelote con bacalao o salmón crudos (confianza y cría), la champiñaca con trigo y la
// llama de comerciante con heno, como la llama.
Object.assign(BREED_FOOD as Record<string, readonly number[]>, { ocelot: [COD, SALMON], mooshroom: [WHEAT], trader_llama: [HAY_BALE] });
(CREATIVE_ITEMS as number[]).push(RAW_IRON, RAW_GOLD, POWDER_SNOW_BUCKET);
// Fase 7 (pociones): los ingredientes (las pociones, con cada tipo, las añade el inventario creativo).
(CREATIVE_ITEMS as number[]).push(
  FERMENTED_SPIDER_EYE, GLOWSTONE_DUST, NETHER_WART, BLAZE_ROD, BLAZE_POWDER, MAGMA_CREAM, GHAST_TEAR, DRAGON_BREATH,
);
// Fase 7 (transporte): barcas, balsas y vagonetas en el creativo.
(CREATIVE_ITEMS as number[]).push(
  ...Object.values(BOAT_ITEMS).flatMap((b, i) => [b, Object.values(CHEST_BOAT_ITEMS)[i]]), MINECART, CHEST_MINECART, FURNACE_MINECART,
);
(CREATIVE_ITEMS as number[]).push(EXPERIENCE_BOTTLE); // Fase 7 (encantamientos): los libros, aparte (uno por encantamiento)

// ------------------------------------------------------------------ Fase 7 (redstone)
(CREATIVE_ITEMS as number[]).push(QUARTZ);
(CREATIVE_ITEMS as number[]).push(HOPPER_MINECART, TNT_MINECART); // Fase 7 (mecanismos)
(CREATIVE_ITEMS as number[]).push(...LATE_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob])); // Fase 7.5 (océano)

// ------------------------------------------------------------------ Fase 7.5 (abismo)
(CREATIVE_ITEMS as number[]).push(ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5);

// ------------------------------------------------------------------ Fase 8 (dimensiones)
// Las menas del Nether se funden como las demás (sacadas con Toque de seda).
smelt(NETHER_QUARTZ_ORE, QUARTZ);
smelt(NETHER_GOLD_ORE, GOLD_INGOT);

// ------------------------------------------------------------------ Fase 8.2 (biomas del Nether)
// La madera del Nether no arde: ni sus tablones, tallos, formas ni carteles sirven de combustible.
for (const it of ITEMS) if (it && isNetherWood(it.key)) delete it.fuel;
smelt(NETHERRACK, NETHER_BRICK);
smelt(NETHER_BRICKS, CRACKED_NETHER_BRICKS);
smelt(POLISHED_BLACKSTONE_BRICKS, CRACKED_POLISHED_BLACKSTONE_BRICKS);
smelt(BASALT, SMOOTH_BASALT);
(CREATIVE_ITEMS as number[]).push(NETHER_BRICK);

// ------------------------------------------------------------------ Fase 8.3 (criaturas del Nether)
// El strider se cría con hongos distorsionados y el hoglin con hongos carmesíes (y los siguen).
Object.assign(BREED_FOOD as Record<string, readonly number[]>, { strider: [WARPED_FUNGUS], hoglin: [CRIMSON_FUNGUS] });
(CREATIVE_ITEMS as number[]).push(WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW, MUSIC_DISC_TEARS, ...NETHER_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob]));

// ------------------------------------------------------------------ Fase 8.4 (estructuras del Nether)
(CREATIVE_ITEMS as number[]).push(MUSIC_DISC_PIGSTEP, PIGLIN_BANNER_PATTERN);

// ------------------------------------------------------------------ Fase 8.5 (lo que da el Nether)
// Los escombros ancestrales se funden (horno o alto horno) en chatarra de netherita.
smelt(ANCIENT_DEBRIS, NETHERITE_SCRAP);
smelt(QUARTZ_BLOCK, SMOOTH_QUARTZ); // el bloque de cuarzo, en cuarzo liso
(CREATIVE_ITEMS as number[]).push(
  NETHERITE_SCRAP, NETHERITE_INGOT, NETHERITE_UPGRADE_SMITHING_TEMPLATE, ...Object.values(TOOLS.netherite), ...Object.values(ARMOR[NETHERITE_ARMOR]),
  HORSE_ARMOR.netherite, NETHER_STAR,
);

// ------------------------------------------------------------------ Fase 8.6 (el End)
smelt(CHORUS_FRUIT, POPPED_CHORUS_FRUIT);
(CREATIVE_ITEMS as number[]).push(CHORUS_FRUIT, POPPED_CHORUS_FRUIT, ENDER_EYE, END_CRYSTAL, ELYTRA, SHULKER_SHELL, ...END_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob]));
(CREATIVE_ITEMS as number[]).push(...WITHER_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob])); // Fase 8.7
