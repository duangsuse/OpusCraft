// Los ids de bloque y de objeto se guardan en los mundos (ediciones de chunks, cofres, inventarios):
// no pueden cambiar entre versiones. Las familias y los objetos nuevos se añaden siempre al final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, WALL_TORCH, RED_BED, FARMLAND, WHEAT_CROP,
  CARROTS, POTATOES, BEETROOTS, CAKE, CHEST, FURNACE, OAK_SAPLING, SPRUCE_SAPLING, MELON, PUMPKIN_STEM, MELON_STEM,
  ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER, WALLS, BEDS, SIGNS, WALL_SIGNS,
  CHEST_DOUBLE, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER, JUNGLE_LOG, ACACIA_LOG, DARK_OAK_LOG, CHERRY_LOG, CHERRY_SAPLING,
  VINE, LILY_PAD, MYCELIUM, RED_SAND, COLORED_TERRACOTTA, PACKED_ICE, FLOWERS, PINK_PETALS, DEEPSLATE, COPPER_ORE, DEEPSLATE_ORE,
  COAL_ORE, EMERALD_BLOCK, MOSS_BLOCK, CAVE_VINES, POINTED_DRIPSTONE, AMETHYST_BUD, TINTED_GLASS, MOB_SPAWNER, COBWEB,
  NETHERRACK, CRYING_OBSIDIAN, SNOW_LAYER,
  TURTLE_EGG, LECTERN, CAULDRON, INFESTED_STONE, INFESTED_STONE_BRICKS, BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK,
} from '../src/shared/blocks';
import {
  STICK, BREAD, BUCKET, SHEARS, TOOLS, WHEAT_SEEDS, SUGAR, ARMOR, GOLDEN_APPLE, SPIDER_EYE, SHIELD, PUMPKIN_SEEDS, FISHING_ROD,
  PUFFERFISH, COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES, COMPASS, EMPTY_MAP, FILLED_MAP, SNOWBALL,
  SADDLE, SLIME_BALL, SPLASH_POISON, COD_BUCKET, TADPOLE_BUCKET, GLASS_BOTTLE, HONEY_BOTTLE, RAW_RABBIT, RABBIT_HIDE, BRUSH,
  OMINOUS_BOTTLE, TOTEM_OF_UNDYING,
} from '../src/shared/items';
import {
  MOB_FOX, MOB_WOLF, MOB_VILLAGER, MOB_WANDERING_TRADER, MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT, MOB_HORSE, MOB_CAMEL,
  MOB_COD, MOB_GLOW_SQUID, MOB_DROWNED, MOB_SLIME, MOB_ZOMBIE_VILLAGER, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL,
  MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO, MOB_PILLAGER, MOB_EVOKER_FANGS,
} from '../src/shared/mobs';

const NEW_WOODS = ['jungle', 'acacia', 'dark_oak', 'cherry', 'cobbled_deepslate'];
NEW_WOODS.push('mangrove', 'pale_oak', 'bamboo', 'bamboo_mosaic'); // Fase 6.5 (maderas): ids nuevos, sin fijar
// Fase 6.5 (piedras): las losas y escaleras de las piedras nuevas tampoco son de la fase 3.
import { SMOOTH_STONE } from '../src/shared/blocks';
NEW_WOODS.push(...Object.keys(SLABS).filter((k) => SLABS[k] > SMOOTH_STONE));
NEW_WOODS.push('prismarine', 'prismarine_brick', 'dark_prismarine'); // Fase 6.5 (océano y plantas): formas nuevas, sin fijar

test('los ids de bloques guardados no cambian', () => {
  // Bloques clásicos (0..255).
  assert.deepEqual([CHEST, FURNACE, OAK_SAPLING, SPRUCE_SAPLING], [89, 81, 93, 95]);
  // Familias con estados (fase 3), en el orden en que se registraron.
  const old = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([k]) => !NEW_WOODS.includes(k)));
  assert.deepEqual(old(SLABS), { oak: 1024, birch: 1035, spruce: 1046, cobblestone: 1057, stone: 1068, stone_brick: 1079, brick: 1090, sandstone: 1101 });
  assert.deepEqual(old(STAIRS), { oak: 1027, birch: 1038, spruce: 1049, cobblestone: 1060, stone: 1071, stone_brick: 1082, brick: 1093, sandstone: 1104 });
  assert.deepEqual([FENCES.oak, FENCE_GATES.oak, DOORS.oak, TRAPDOORS.oak], [1112, 1113, 1121, 1153]);
  assert.deepEqual([FENCES.spruce, FENCE_GATES.spruce, DOORS.spruce, TRAPDOORS.spruce], [1226, 1227, 1235, 1267]);
  assert.deepEqual([LADDER, GLASS_PANE, WALL_TORCH, RED_BED], [1283, 1287, 1288, 1292]);
  // Granja (fase 4).
  assert.deepEqual([FARMLAND, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, CAKE], [1300, 1302, 1310, 1318, 1326, 1330]);
  // Calabazas, sandías y compostador (fase 4).
  assert.deepEqual(
    [MELON, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER],
    [1337, 1338, 1346, 1354, 1358, 1362, 1366, 1370],
  );
  // Muros, camas de colores, carteles y bloques de trabajo (fase 4).
  assert.deepEqual([WALLS.cobblestone, WALLS.andesite, BEDS.white, BEDS.purple, SIGNS.oak, WALL_SIGNS.oak, WALL_SIGNS.spruce], [1379, 1386, 1387, 1435, 1443, 1447, 1463]);
  assert.deepEqual([CHEST_DOUBLE, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER], [1467, 1475, 1483, 1491, 1493]);
  // Maderas y biomas (fase 5).
  assert.deepEqual([JUNGLE_LOG, SLABS.jungle, DOORS.jungle, SIGNS.jungle, ACACIA_LOG, DARK_OAK_LOG, CHERRY_LOG, CHERRY_SAPLING], [1497, 1501, 1521, 1569, 1577, 1657, 1737, 1740]);
  assert.deepEqual([VINE, LILY_PAD, MYCELIUM, RED_SAND, COLORED_TERRACOTTA.white, PACKED_ICE, FLOWERS.blue_orchid, PINK_PETALS], [1817, 1821, 1822, 1826, 1828, 1834, 1835, 1844]);
  // Subsuelo (fase 5).
  assert.deepEqual([DEEPSLATE, SLABS.cobbled_deepslate, COPPER_ORE, DEEPSLATE_ORE[COAL_ORE], EMERALD_BLOCK, MOSS_BLOCK, CAVE_VINES, POINTED_DRIPSTONE, AMETHYST_BUD, TINTED_GLASS], [1845, 1851, 1862, 1864, 1872, 1873, 1877, 1879, 1887, 1891]);
  // Estructuras (fase 5).
  assert.deepEqual([MOB_SPAWNER, COBWEB, NETHERRACK, CRYING_OBSIDIAN], [1892, 1893, 1898, 1899]);
  // Clima (fase 5).
  assert.equal(SNOW_LAYER, 1900);
  // Fase 6: huevo de tortuga, bloques de trabajo, bloques infestados y colmenas.
  assert.deepEqual([TURTLE_EGG, LECTERN, CAULDRON, INFESTED_STONE, INFESTED_STONE_BRICKS], [1908, 1920, 1927, 1928, 1930]);
  assert.deepEqual([BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK], [1931, 1955, 1979, 1980]);
});

test('los ids de objetos guardados no cambian', () => {
  // Hasta la fase 3 (desplegados).
  assert.deepEqual([STICK, BREAD, BUCKET, SHEARS], [256, 285, 286, 291]);
  assert.deepEqual([TOOLS.wooden.pickaxe, TOOLS.diamond.sword], [292, 311]);
  // Granja (fase 4): añadidos al final.
  assert.deepEqual([WHEAT_SEEDS, SUGAR, TOOLS.wooden.hoe, TOOLS.diamond.hoe], [312, 322, 323, 327]);
  // Armaduras (fase 4).
  assert.deepEqual([ARMOR.leather.helmet, ARMOR.iron.helmet, ARMOR.golden.helmet, ARMOR.diamond.boots], [328, 332, 336, 343]);
  // Efectos y escudo (fase 4).
  assert.deepEqual([GOLDEN_APPLE, SPIDER_EYE, SHIELD], [344, 345, 346]);
  // Calabazas, sandías y pesca (fase 4).
  assert.deepEqual([PUMPKIN_SEEDS, FISHING_ROD, PUFFERFISH], [347, 351, 357]);
  // Subsuelo (fase 5).
  assert.deepEqual([COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES], [358, 359, 360, 361]);
  // Mapas, brújula y nieve (fase 5).
  assert.deepEqual([COMPASS, EMPTY_MAP, FILLED_MAP, SNOWBALL], [362, 363, 364, 365]);
  // Fase 6: silla, botín de monstruos, cubos con criatura y fauna.
  assert.deepEqual([SADDLE, SLIME_BALL, SPLASH_POISON, COD_BUCKET, TADPOLE_BUCKET], [366, 367, 371, 372, 377]);
  assert.deepEqual([GLASS_BOTTLE, HONEY_BOTTLE, RAW_RABBIT, RABBIT_HIDE, BRUSH], [378, 379, 381, 383, 385]);
  // Asaltos (fase 6).
  assert.deepEqual([OMINOUS_BOTTLE, TOTEM_OF_UNDYING], [386, 387]);
});

// Fase 6.5 (catálogo del mundo normal): además de algunos ids a mano, una huella de todas las claves en
// orden hasta el último id de la fase (si algo se inserta en medio o cambia de sitio, la huella cambia).
import {
  BLOCKS, BLOCK_COUNT, MANGROVE_LOG, CARPETS, CANDLE, BANNERS, POLISHED_GRANITE, CINNABAR, RAW_COPPER_BLOCK, FLOWER_POT, LANTERN,
  SCAFFOLDING, DECORATED_POT, CORALS, KELP, PRISMARINE, SPONGE, SUNFLOWER, SWEET_BERRY_BUSH, SPORE_BLOSSOM,
} from '../src/shared/blocks';
import { ITEMS, ITEM_COUNT, DYES, RAW_COPPER, BOWL, SPAWN_EGGS, CLOCK, DRIED_KELP, PRISMARINE_CRYSTALS, INK_SAC } from '../src/shared/items';

function keyPrint(keys: (string | undefined)[], from: number, to: number): number {
  let h = 2166136261;
  for (let i = from; i < to; i++) {
    const s = `${i}:${keys[i] ?? ''}`;
    for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619) >>> 0;
  }
  return h;
}

test('los ids de la fase 6.5 no cambian', () => {
  assert.ok(BLOCK_COUNT >= 3986 && ITEM_COUNT >= 488);
  assert.equal(INK_SAC, 487);
  assert.deepEqual(
    [MANGROVE_LOG, CARPETS.white, CANDLE, BANNERS.white, POLISHED_GRANITE, CINNABAR, RAW_COPPER_BLOCK, FLOWER_POT, LANTERN],
    [1995, 2323, 2531, 2667, 2797, 2817, 3114, 3671, 3738],
  );
  assert.deepEqual(
    [SCAFFOLDING, DECORATED_POT, CORALS.tube.block, KELP, PRISMARINE, SPONGE, SUNFLOWER, SWEET_BERRY_BUSH, SPORE_BLOSSOM],
    [3749, 3750, 3766, 3896, 3912, 3949, 3951, 3968, 3985],
  );
  assert.deepEqual(
    [DYES.white, RAW_COPPER, TOOLS.copper.pickaxe, DRIED_KELP, PRISMARINE_CRYSTALS, BOWL, CLOCK, Object.values(SPAWN_EGGS)[0]],
    [388, 404, 406, 415, 418, 419, 431, 434],
  );
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 3986), 3546737497, 'huella de los bloques');
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 256, 487), 2003609854, 'huella de los objetos');
});

// Remate de la fase 6.5: carteles colgantes, estantería cincelada, etiqueta, correa, sacos y soporte.
import { HANGING_SIGNS } from '../src/shared/blocks';
import { NAME_TAG, LEAD, BUNDLE, DYED_BUNDLES, ARMOR_STAND } from '../src/shared/items';
import { CHISELED_BOOKSHELF } from '../src/shared/blocks';

test('los ids del remate de la fase 6.5 no cambian', () => {
  assert.deepEqual([HANGING_SIGNS.oak, HANGING_SIGNS.bamboo, CHISELED_BOOKSHELF], [3986, 4058, 4066]);
  assert.deepEqual([NAME_TAG, LEAD, BUNDLE, DYED_BUNDLES.red, ARMOR_STAND], [488, 489, 490, 505, 507]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 4322), 3111528934, 'huella de los bloques');
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 256, 508), 2692556884, 'huella de los objetos');
});

// Cierre de la fase 6.5: libros y estandartes, materiales, colecciones y equipo.
import { LECTERN_BOOK, RAW_IRON_BLOCK, FROGSPAWN, SKULLS, JUKEBOX, CONDUIT } from '../src/shared/blocks';
import { ENT_ARMOR_STAND } from '../src/shared/armorStands';
import { ENT_TRIDENT, ENT_FIREWORK } from '../src/shared/equipment';
import { ENT_GLOW_FRAME } from '../src/shared/paintings';
import { WRITABLE_BOOK, RAW_IRON, GLOW_ITEM_FRAME, MUSIC_DISCS, FLINT_AND_STEEL, FIREWORK_ROCKET } from '../src/shared/items';

test('los ids del cierre de la fase 6.5 no cambian', () => {
  assert.deepEqual([LECTERN_BOOK, RAW_IRON_BLOCK, FROGSPAWN, SKULLS.zombie, JUKEBOX, CONDUIT], [4322, 4323, 4375, 4376, 4456, 4475]);
  assert.deepEqual([WRITABLE_BOOK, RAW_IRON, GLOW_ITEM_FRAME, MUSIC_DISCS[0], FLINT_AND_STEEL, FIREWORK_ROCKET], [508, 517, 521, 522, 535, 557]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 4479), 2196960239, 'huella de los bloques');
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 256, 559), 3860640922, 'huella de los objetos');
  // Entidades: soporte para armadura, tridente, cohete y marco brillante.
  assert.deepEqual([ENT_ARMOR_STAND, ENT_TRIDENT, ENT_FIREWORK, ENT_GLOW_FRAME], [109, 110, 111, 120]);
});

// Calderos con agua, lava y nieve polvo (lo último de la fase 6.5).
import { WATER_CAULDRON, LAVA_CAULDRON, POWDER_SNOW_CAULDRON } from '../src/shared/blocks';
test('los ids de los calderos no cambian', () => {
  assert.deepEqual([WATER_CAULDRON, LAVA_CAULDRON, POWDER_SNOW_CAULDRON], [4479, 4482, 4483]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 4486), 2085594669, 'huella de los bloques');
});

// Fase 7 (magia y tecnología): soporte para pociones, raíles, mesa de encantamientos, yunques, redstone y
// mecanismos; pociones, barcas y vagonetas. También los encantamientos (en `data`), los tipos de poción
// (en `dmg`), los efectos nuevos y las entidades que se guardan.
import {
  BREWING_STAND, RAIL, ENCHANTING_TABLE, ANVIL, REDSTONE_WIRE, LEVER, REPEATER, COMPARATOR, REDSTONE_LAMP,
  PISTON, STICKY_PISTON, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT,
} from '../src/shared/blocks';
import { ENCHANTED_BOOK, POTION, TIPPED_ARROW, DRAGON_BREATH, MINECART, TNT_MINECART } from '../src/shared/items';
import { ENCHANTS, PROTECTION, SHARPNESS, MENDING, VANISHING_CURSE } from '../src/shared/enchantments';
import { POTIONS, PT_WATER, PT_AWKWARD, PT_SLOW_FALLING, PT_LONG_SLOW_FALLING, ENT_EFFECT_CLOUD } from '../src/shared/potions';
import { EFFECT_JUMP_BOOST, EFFECT_INSTANT_DAMAGE } from '../src/shared/effects';
import { ENT_BOAT, ENT_MINECART, ENT_HOPPER_MINECART, ENT_TNT_MINECART } from '../src/shared/vehicles';
import { ENT_TNT } from '../src/shared/mechanisms';

test('los ids de la fase 7 no cambian', () => {
  assert.deepEqual([BREWING_STAND, RAIL, ENCHANTING_TABLE, ANVIL, REDSTONE_WIRE, LEVER, REPEATER, COMPARATOR, REDSTONE_LAMP],
    [4486, 4494, 4540, 4541, 4557, 4599, 4941, 5005, 5022]);
  assert.deepEqual([PISTON, STICKY_PISTON, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT],
    [5336, 5348, 5373, 5385, 5395, 5407, 5419]);
  assert.deepEqual([ENCHANTED_BOOK, POTION, TIPPED_ARROW, DRAGON_BREATH, MINECART, TNT_MINECART], [559, 561, 564, 572, 593, 598]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 5420), 3875630682, 'huella de los bloques');
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 256, 599), 75337293, 'huella de los objetos');
  assert.deepEqual([PROTECTION, SHARPNESS, MENDING, VANISHING_CURSE], [1, 12, 36, 37]);
  assert.equal(keyPrint(ENCHANTS.map((e) => e?.key), 0, 38), 2567232971, 'huella de los encantamientos');
  assert.deepEqual([PT_WATER, PT_AWKWARD, PT_SLOW_FALLING, PT_LONG_SLOW_FALLING], [0, 3, 40, 41]);
  assert.equal(keyPrint(POTIONS.map((p) => p?.key), 0, 42), 3441642034, 'huella de las pociones');
  assert.deepEqual([EFFECT_JUMP_BOOST, EFFECT_INSTANT_DAMAGE], [16, 22]);
  assert.deepEqual([ENT_EFFECT_CLOUD, ENT_BOAT, ENT_MINECART, ENT_HOPPER_MINECART, ENT_TNT_MINECART, ENT_TNT], [150, 160, 162, 165, 166, 180]);
});

// El estado de la maceta es el índice de su planta en esta lista (se guarda): sólo se añaden al final.
import { pottablePlants } from '../src/shared/blocks';
test('las plantas de maceta no cambian de índice', () => {
  const keys = pottablePlants().map((id) => BLOCKS[id]?.key);
  assert.deepEqual(keys.slice(0, 29), [
    'cactus', 'fern', 'poppy', 'dandelion', 'cornflower', 'dead_bush', 'red_mushroom', 'brown_mushroom', 'oak_sapling',
    'birch_sapling', 'spruce_sapling', 'jungle_sapling', 'acacia_sapling', 'dark_oak_sapling', 'cherry_sapling', 'blue_orchid',
    'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'lily_of_the_valley',
    'azalea', 'flowering_azalea', 'mangrove_propagule', 'pale_oak_sapling', 'torchflower',
  ]);
});

test('los ids de criatura guardados no cambian', () => {
  assert.deepEqual([MOB_FOX, MOB_WOLF, MOB_VILLAGER, MOB_WANDERING_TRADER], [13, 17, 18, 19]);
  assert.deepEqual([MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT, MOB_HORSE, MOB_CAMEL], [20, 21, 22, 25, 29]);
  assert.deepEqual([MOB_COD, MOB_GLOW_SQUID], [30, 39]);
  assert.deepEqual([MOB_DROWNED, MOB_SLIME, MOB_ZOMBIE_VILLAGER, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL], [40, 42, 46, 47, 48]);
  assert.deepEqual([MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO], [50, 51, 52, 53]);
  assert.deepEqual([MOB_PILLAGER, MOB_EVOKER_FANGS], [60, 65]);
});

// Fase 7 (efectos): los efectos que faltaban (se guardan con el jugador) y el orden de las flores del
// estofado sospechoso (la flor va en el `dmg` de la pila).
import { EFFECTS, EFFECT_HASTE, EFFECT_LEVITATION } from '../src/shared/effects';
import { SUSPICIOUS_FLOWERS } from '../src/shared/decorFood';
test('los efectos de estado y las flores del estofado no cambian', () => {
  assert.deepEqual([EFFECT_HASTE, EFFECT_LEVITATION], [23, 33]);
  assert.deepEqual(Object.values(EFFECTS).map((e) => `${e.id}:${e.key}`), [
    '1:speed', '2:slowness', '3:strength', '4:weakness', '5:regeneration', '6:poison', '7:hunger', '8:fire_resistance',
    '9:night_vision', '10:water_breathing', '11:absorption', '12:bad_omen', '13:hero_of_the_village', '14:resistance',
    '15:conduit_power', '16:jump_boost', '17:invisibility', '18:slow_falling', '19:luck', '20:unluck', '21:instant_health',
    '22:instant_damage', '23:haste', '24:mining_fatigue', '25:nausea', '26:blindness', '27:saturation', '28:glowing',
    '29:dolphins_grace', '30:health_boost', '31:darkness', '32:wither', '33:levitation',
  ]);
  assert.deepEqual(SUSPICIOUS_FLOWERS.map(([f]) => BLOCKS[f]?.key), [
    'poppy', 'dandelion', 'cornflower', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip',
    'pink_tulip', 'oxeye_daisy', 'lily_of_the_valley', 'torchflower', 'wither_rose', // Fase 8.7
  ]);
});

// Los bits de las entidades que se añadieron en la fase 7 no pisan a los anteriores ni entre sí.
import { EF_CAPTAIN, EF_GLINT_ARMOR_SHIFT, EF_VARIANT_MASK } from '../src/shared/protocol';
import { EF_INVISIBLE, STATE_INVISIBLE } from '../src/shared/potions';
import { EF_GLOWING, STATE_GLOWING } from '../src/shared/effects';
test('los bits de estado de la fase 7 no se pisan', () => {
  const glint = 15 << EF_GLINT_ARMOR_SHIFT;
  const bits = [EF_VARIANT_MASK, EF_CAPTAIN, glint, EF_INVISIBLE, EF_GLOWING];
  for (let i = 0; i < bits.length; i++) for (let k = i + 1; k < bits.length; k++) assert.equal(bits[i] & bits[k], 0, `${i} y ${k}`);
  assert.equal(STATE_INVISIBLE & STATE_GLOWING, 0);
});

// Fase 7.5 (estructuras y criaturas del mundo normal): Deep Dark (sculk, pizarra reforzada, bloques de
// alma), huevos de las criaturas nuevas, eco, brújula de recuperación y disco 5; Sigilo rápido y las
// criaturas nuevas.
import { SCULK, REINFORCED_DEEPSLATE, SOUL_LANTERN } from '../src/shared/blocks';
import { ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5 } from '../src/shared/items';
import { SWIFT_SNEAK } from '../src/shared/enchantments';
import {
  MOB_WARDEN, MOB_GUARDIAN, MOB_ELDER_GUARDIAN, MOB_ALLAY, MOB_BAT, MOB_OCELOT, MOB_MOOSHROOM, MOB_TRADER_LLAMA,
  MOB_SKELETON_HORSE, MOB_ZOMBIE_HORSE,
} from '../src/shared/mobs';
test('los ids de la fase 7.5 no cambian', () => {
  assert.deepEqual([SCULK, REINFORCED_DEEPSLATE, SOUL_LANTERN], [5420, 5525, 5534]);
  assert.deepEqual([SPAWN_EGGS.guardian, SPAWN_EGGS.allay, ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5], [599, 608, 609, 610, 611, 612]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 5536), 488954500, 'huella de los bloques');
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 256, 613), 1924479586, 'huella de los objetos');
  assert.equal(SWIFT_SNEAK, 38);
  assert.equal(keyPrint(ENCHANTS.map((e) => e?.key), 0, 39), 1062139658, 'huella de los encantamientos');
  assert.deepEqual([MOB_WARDEN, MOB_GUARDIAN, MOB_ELDER_GUARDIAN, MOB_ALLAY], [70, 73, 74, 76]);
  assert.deepEqual([MOB_BAT, MOB_OCELOT, MOB_MOOSHROOM, MOB_TRADER_LLAMA, MOB_SKELETON_HORSE, MOB_ZOMBIE_HORSE], [78, 79, 80, 81, 82, 83]);
});

// Fase 8 (Nether y End), 8.1 dimensiones: portal del Nether, menas del Nether y magma; el primer bioma del
// Nether; las dimensiones (el registro de cada jugador guarda la suya).
import { NETHER_PORTAL, NETHER_QUARTZ_ORE, NETHER_GOLD_ORE, MAGMA_BLOCK } from '../src/shared/blocks';
import { BIOME_NETHER_WASTES } from '../src/shared/world/biomeIds';
import { DIM_OVERWORLD, DIM_NETHER } from '../src/shared/dimensions';
test('los ids de la fase 8 no cambian', () => {
  assert.deepEqual([NETHER_PORTAL, NETHER_QUARTZ_ORE, NETHER_GOLD_ORE, MAGMA_BLOCK], [5536, 5538, 5539, 5540]);
  assert.deepEqual([BIOME_NETHER_WASTES, DIM_OVERWORLD, DIM_NETHER], [52, 0, 1]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 0, 5541), 536826002, 'huella de los bloques');
});

// Fase 8.2 (biomas del Nether): maderas carmesí y distorsionada, necelio, hongos, enredaderas, verrugas, luz de
// hongo, basalto, piedra negra, ladrillos del Nether, la lava rápida (niveles impares), el ladrillo del Nether
// y los cuatro biomas nuevos.
import {
  CRIMSON_STEM, WARPED_STEM, CRIMSON_NYLIUM, WEEPING_VINES, TWISTING_VINES, SHROOMLIGHT, BASALT, BLACKSTONE, NETHER_BRICKS,
  NETHER_BRICK_FENCE, LAVA_FLOW_ODD,
} from '../src/shared/blocks';
import { NETHER_BRICK } from '../src/shared/items';
import { BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS } from '../src/shared/world/biomeIds';
test('los ids de la fase 8.2 no cambian', () => {
  assert.deepEqual(
    [CRIMSON_STEM, WARPED_STEM, CRIMSON_NYLIUM, WEEPING_VINES, TWISTING_VINES, SHROOMLIGHT, BASALT, BLACKSTONE, NETHER_BRICKS, NETHER_BRICK_FENCE, LAVA_FLOW_ODD],
    [5541, 5660, 5779, 5786, 5813, 5842, 5843, 5849, 5855, 5919, 5946],
  );
  assert.equal(NETHER_BRICK, 613);
  assert.deepEqual([BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS], [53, 54, 55, 56]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 5541, 5950), 3919161501, 'huella de los bloques');
});

// Fase 8.3 (criaturas del Nether): cráneo de esqueleto wither y cabeza de piglin; caña con hongo distorsionado,
// carga de fuego, flecha espectral, disco «Tears» y los huevos; velocidad de alma y las criaturas del Nether.
import { WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW, MUSIC_DISC_TEARS } from '../src/shared/items';
import { SOUL_SPEED } from '../src/shared/enchantments';
import {
  MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM,
  MOB_MAGMA_CUBE_SMALL, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER, MOB_WITHER_SKELETON, ENT_LARGE_FIREBALL, ENT_SMALL_FIREBALL,
} from '../src/shared/netherMobs';
test('los ids de la fase 8.3 no cambian', () => {
  assert.deepEqual([SKULLS.wither_skeleton, SKULLS.piglin], [5950, 5970]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 5950, 5990), 154072549, 'huella de los bloques');
  assert.deepEqual([WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW, MUSIC_DISC_TEARS, SPAWN_EGGS.piglin, SPAWN_EGGS.wither_skeleton], [614, 615, 616, 617, 618, 627]);
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 613, 628), 3729579747, 'huella de los objetos');
  assert.equal(SOUL_SPEED, 39);
  assert.equal(keyPrint(ENCHANTS.map((e) => e?.key), 0, 40), 3433229987, 'huella de los encantamientos');
  assert.deepEqual(
    [MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER, MOB_WITHER_SKELETON],
    [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
  );
  assert.deepEqual([ENT_LARGE_FIREBALL, ENT_SMALL_FIREBALL], [121, 122]);
});

// Fase 8.4 (estructuras del Nether): la verruga del Nether plantada, el disco «Pigstep» y el diseño del hocico.
import { NETHER_WART_CROP } from '../src/shared/blocks';
import { MUSIC_DISC_PIGSTEP, PIGLIN_BANNER_PATTERN } from '../src/shared/items';
import { BANNER_PATTERNS } from '../src/shared/bannerPatterns';
test('los ids de la fase 8.4 no cambian', () => {
  assert.equal(NETHER_WART_CROP, 5990);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 5990, 5994), 2559539490, 'huella de los bloques');
  assert.deepEqual([MUSIC_DISC_PIGSTEP, PIGLIN_BANNER_PATTERN], [628, 629]);
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 628, 630), 620859315, 'huella de los objetos');
  assert.equal(BANNER_PATTERNS.findIndex((p) => p.key === 'piglin'), 39);
});

// Fase 8.5 (lo que da el Nether): escombros ancestrales, netherita, cuarzo, magnetita, fogata de almas, nexo de
// reaparición, faro y columna de burbujas; la netherita, su plantilla y la estrella del Nether.
import { ANCIENT_DEBRIS, BEACON, BUBBLE_COLUMN } from '../src/shared/blocks';
import { NETHERITE_SCRAP, NETHER_STAR } from '../src/shared/items';
test('los ids de la fase 8.5 no cambian', () => {
  assert.deepEqual([ANCIENT_DEBRIS, BEACON, BUBBLE_COLUMN], [5994, 6032, 6033]);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 5994, 6035), 2306374435, 'huella de los bloques');
  assert.deepEqual([NETHERITE_SCRAP, NETHER_STAR], [630, 643]);
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 630, 644), 1535299870, 'huella de los objetos');
});

// Fase 8.6 (el End): piedra del End, púrpura, vara del End, coro, marco y portal del End, puerta del End, huevo de
// dragón, cajas de shulker, cofre de ender y cabeza de dragón; la fruta de coro, el ojo de ender, los huevos
// generadores, el cristal del End, el caparazón de shulker y los élitros; endermita, dragón y shulker.
import { END_STONE, END_PORTAL_FRAME, END_GATEWAY, DRAGON_EGG, ENDER_CHEST, SHULKER_BOXES, BLOCK_COUNT } from '../src/shared/blocks';
import { CHORUS_FRUIT, ENDER_EYE, END_CRYSTAL, SHULKER_SHELL, ELYTRA, ITEM_COUNT } from '../src/shared/items';
import { MOB_ENDERMITE, MOB_ENDER_DRAGON, MOB_SHULKER, ENT_END_CRYSTAL, ENT_DRAGON_FIREBALL, ENT_SHULKER_BULLET } from '../src/shared/mobs';
test('los ids de la fase 8.6 no cambian', () => {
  assert.deepEqual([END_STONE, END_PORTAL_FRAME, END_GATEWAY, DRAGON_EGG, SHULKER_BOXES[''], SHULKER_BOXES.black, ENDER_CHEST, SKULLS.dragon], [6035, 6077, 6086, 6087, 6088, 6184, 6190, 6194]);
  assert.ok(BLOCK_COUNT >= 6214);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 6035, 6214), 446005006, 'huella de los bloques');
  assert.deepEqual([CHORUS_FRUIT, ENDER_EYE, SPAWN_EGGS.endermite, SPAWN_EGGS.ender_dragon, SPAWN_EGGS.shulker, END_CRYSTAL, SHULKER_SHELL, ELYTRA], [644, 646, 647, 648, 649, 650, 651, 652]);
  assert.ok(ITEM_COUNT >= 653);
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 644, 653), 216528252, 'huella de los objetos');
  assert.deepEqual([MOB_ENDERMITE, MOB_ENDER_DRAGON, MOB_SHULKER, ENT_END_CRYSTAL, ENT_DRAGON_FIREBALL, ENT_SHULKER_BULLET], [96, 97, 98, 123, 124, 125]);
});

// Correcciones (tras la 8.6): las tres luces de rana y los brotes de amatista de lado y colgando.
import { OCHRE_FROGLIGHT, VERDANT_FROGLIGHT, PEARLESCENT_FROGLIGHT, AMETHYST_BUD_SIDE } from '../src/shared/blocks';
test('los ids de las correcciones no cambian', () => {
  assert.deepEqual([OCHRE_FROGLIGHT, VERDANT_FROGLIGHT, PEARLESCENT_FROGLIGHT, AMETHYST_BUD_SIDE], [6214, 6217, 6220, 6223]);
  assert.ok(BLOCK_COUNT >= 6243);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 6214, 6243), 3187600550, 'huella de los bloques');
});

// Fase 8.7 (el Wither): el Wither y su calavera, la rosa marchita y el huevo del Wither.
import { WITHER_ROSE } from '../src/shared/blocks';
import { MOB_WITHER, ENT_WITHER_SKULL } from '../src/shared/mobs';
test('los ids de la fase 8.7 no cambian', () => {
  assert.deepEqual([MOB_WITHER, ENT_WITHER_SKULL, WITHER_ROSE, SPAWN_EGGS.wither], [99, 126, 6243, 653]);
  assert.ok(BLOCK_COUNT >= 6244 && ITEM_COUNT >= 654);
  assert.equal(keyPrint(BLOCKS.map((b) => b?.key), 6243, 6244), 4091054837, 'huella de los bloques');
  assert.equal(keyPrint(ITEMS.map((it) => it?.key), 653, 654), 817234804, 'huella de los objetos');
});
