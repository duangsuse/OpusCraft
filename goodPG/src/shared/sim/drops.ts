// Qué suelta cada bloque al romperse en supervivencia (según la herramienta usada).
import { amethystBudInfo } from '../blocks'; // los brotes de amatista
import { NETHER_WART_CROP, NETHER_WART_MAX_AGE, isNetherWartCrop } from '../blocks'; // Fase 8.4
import { isEnderChest, OBSIDIAN } from '../blocks'; // Fase 8.6
import { NETHER_WART, CHORUS_FRUIT } from '../items';
import {
  BLOCKS, STONE, COBBLESTONE, GRASS, SNOWY_GRASS, DIRT, COAL_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, GRAVEL,
  CLAY, GLASS, ICE, OAK_LEAVES, DARK_OAK_LEAVES, JUNGLE_LEAVES, isLeaves, isVine, woodOf, MYCELIUM, PACKED_ICE,
  RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, RED_MUSHROOM, BROWN_MUSHROOM, DEEPSLATE, COBBLED_DEEPSLATE, SURFACE_ORE,
  EMERALD_ORE, BUDDING_AMETHYST, CAVE_VINES, COBWEB, MOB_SPAWNER, SNOW_LAYER, SNOW_BLOCK, isSnowLayer,
  SHORT_GRASS, FERN, DEAD_BUSH, BOOKSHELF, BLOCK_FLUID, GLASS_PANE, baseBlock, stateProps, isDoor, isBed, isSlab,
  WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, familyBase, isCrop, isMatureCrop, isFarmland, isCake, MELON, COMPOSTER,
  PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM, CAMPFIRE, SOUL_CAMPFIRE, SOUL_SOIL, CHORUS_PLANT, CHORUS_FLOWER, isChorusFlower,
} from '../blocks';
// Fase 6 (monstruos): los bloques infestados no sueltan nada (sale una lepisma).
import { isInfested } from '../blocks';
import { colorBlockDrops } from '../blocks'; // Fase 6.5 (colores)
// Fase 6.5 (cobre): la mena de cobre suelta cobre en bruto.
import { COPPER_ORE } from '../blocks';
import { RAW_COPPER } from '../items';
import { FLOWER_POT, pottedPlant } from '../blocks'; // Fase 6.5 (decoración)
import { isWaterlogged } from '../blocks'; // Fase 6.5 (océano y plantas)
import { plantDrops65 } from './plantDrops'; // Fase 6.5 (océano y plantas)
import { materialDrops } from './materialDrops'; // Fase 6.5 (materiales)
import { redstoneDrops } from './redstoneDrops'; // Fase 7 (redstone)
import { deepDarkDrops } from './deepDarkDrops'; // Fase 7.5 (abismo)
import { netherBiomeDrops } from './netherDrops'; // Fase 8.2 (biomas del Nether)
import { POISONOUS_POTATO } from '../items'; // Fase 6.5 (equipo)
import { NETHER_QUARTZ_ORE, NETHER_GOLD_ORE } from '../blocks'; // Fase 8 (dimensiones)
import { QUARTZ, GOLD_NUGGET } from '../items';
import {
  ITEMS, COAL, DIAMOND, LAPIS, REDSTONE, FLINT, CLAY_BALL, APPLE, STICK, BOOK, WHEAT_SEEDS, WHEAT, CARROT, POTATO,
  BEETROOT, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, BONE_MEAL, CHARCOAL, EMERALD, AMETHYST_SHARD,
  GLOW_BERRIES, STRING, SNOWBALL, type ItemStack,
} from '../items';

/** Botín de un bloque roto con la herramienta `toolId` (0 = mano). */
export function blockDrops(block: number, toolId: number, rand: () => number = Math.random): ItemStack[] {
  const b = BLOCKS[block];
  if (!b || b.hardness < 0 || (BLOCK_FLUID[block] && !isWaterlogged(block))) return [];
  if (isInfested(block)) return []; // Fase 6 (monstruos)
  // Fase 6.5 (colores): el cristal de color no se recoge; las velas sueltan todas las que hay.
  const colored = colorBlockDrops(block);
  if (colored) return colored;
  const tool = toolId > 0 ? ITEMS[toolId]?.tool : undefined;
  // Bloques que exigen un pico de cierto nivel.
  if (b.tier > 0 && !(tool && tool.kind === 'pickaxe' && tool.tier >= b.tier)) return [];
  // Fase 6.5 (océano y plantas): corales, plantas marinas, pepinos, bayas y plantas de dos bloques.
  const plant65 = plantDrops65(block, toolId, rand);
  if (plant65) return plant65;
  const mat = materialDrops(block); // Fase 6.5 (materiales): hierro y oro en bruto, podsol, tartas con vela…
  if (mat) return mat;
  const rs = redstoneDrops(block, toolId, rand, blockDrops); // Fase 7 (redstone): polvo, cuerda y mena encendida
  if (rs) return rs;
  const dd = deepDarkDrops(block); // Fase 7.5 (abismo): sculk (sólo con Toque de seda) y pizarra reforzada
  if (dd) return dd;
  const nb = netherBiomeDrops(block, toolId, rand); // Fase 8.2: necelio, brotes, enredaderas, piedra negra dorada
  if (nb) return nb;
  const one = (id: number, n = 1): ItemStack[] => [{ id, count: n }];
  const rnd = (a: number, c: number) => a + Math.floor(rand() * (c - a + 1));
  // Puertas y camas sueltan el objeto una sola vez (por la mitad de abajo / los pies).
  if (isDoor(block)) return stateProps(block)!.half === 0 ? one(baseBlock(block)) : [];
  if (isBed(block)) return stateProps(block)!.part === 0 ? one(baseBlock(block)) : [];
  if (isSlab(block)) return one(baseBlock(block), stateProps(block)!.type === 2 ? 2 : 1);
  if (block === GLASS_PANE || isCake(block)) return [];
  if (isFarmland(block)) return one(DIRT);
  if (isLeaves(block)) {
    if (tool?.kind === 'shears') return one(block);
    const out: ItemStack[] = [];
    // Brote al 5 % (jungla, 2,5 %); manzana al 0,5 % en roble y roble oscuro; palos al 2 %.
    if (rand() < (block === JUNGLE_LEAVES ? 0.025 : 0.05)) out.push({ id: woodOf(block)!.sapling, count: 1 });
    if ((block === OAK_LEAVES || block === DARK_OAK_LEAVES) && rand() < 0.005) out.push({ id: APPLE, count: 1 });
    if (rand() < 0.02) out.push({ id: STICK, count: rnd(1, 2) });
    return out;
  }
  // Las enredaderas sólo se recogen con tijeras.
  if (isVine(block)) return tool?.kind === 'shears' ? one(baseBlock(block)) : [];
  // Champiñones gigantes: de 0 a 2 champiñones (como en Minecraft, casi siempre ninguno).
  if (block === RED_MUSHROOM_BLOCK || block === BROWN_MUSHROOM_BLOCK) {
    const n = Math.max(0, rnd(-7, 2));
    return n > 0 ? one(block === RED_MUSHROOM_BLOCK ? RED_MUSHROOM : BROWN_MUSHROOM, n) : [];
  }
  if (block === MYCELIUM) return one(DIRT);
  // Telaraña: con tijeras, la propia telaraña; con espada, hilo.
  if (block === COBWEB) return tool?.kind === 'shears' ? one(COBWEB) : tool?.kind === 'sword' ? one(STRING) : [];
  if (block === MOB_SPAWNER) return [];
  // Nieve: sólo con pala; una bola por capa y cuatro por bloque (como en Minecraft).
  if (isSnowLayer(block)) return tool?.kind === 'shovel' ? one(SNOWBALL, block - SNOW_LAYER + 1) : [];
  if (block === SNOW_BLOCK) return tool?.kind === 'shovel' ? one(SNOWBALL, 4) : [];
  // Pizarra profunda: como la piedra; sus menas sueltan lo mismo que las normales.
  if (block === DEEPSLATE) return one(COBBLED_DEEPSLATE);
  if (SURFACE_ORE[block] !== undefined) {
    const same = blockDrops(SURFACE_ORE[block], toolId, rand);
    return same.length === 1 && same[0].id === SURFACE_ORE[block] ? one(block) : same;
  }
  if (block === EMERALD_ORE) return one(EMERALD);
  if (block === COPPER_ORE) return one(RAW_COPPER, rnd(2, 5)); // Fase 6.5 (cobre), como en Minecraft
  // Fase 8 (dimensiones): menas del Nether.
  if (block === NETHER_QUARTZ_ORE) return one(QUARTZ);
  if (block === NETHER_GOLD_ORE) return one(GOLD_NUGGET, rnd(2, 6));
  // La amatista con brotes no se puede recoger (como sin toque de seda).
  if (block === BUDDING_AMETHYST) return [];
  // Brotes de amatista: sólo el racimo suelta fragmentos (4 con pico, 2 a mano).
  const bud = amethystBudInfo(block); // (en cualquiera de las seis caras)
  if (bud) {
    if (bud.stage < 3) return [];
    return one(AMETHYST_SHARD, tool?.kind === 'pickaxe' ? 4 : 2);
  }
  if (familyBase(block) === CAVE_VINES) return block === CAVE_VINES + 1 ? one(GLOW_BERRIES) : [];
  // El hielo compacto sólo se consigue con toque de seda.
  if (block === PACKED_ICE) return [];
  // Fase 8.4: la verruga del Nether madura suelta de 2 a 4 (la fortuna se suma en enchantDrops); si no, una.
  if (isNetherWartCrop(block)) return one(NETHER_WART, block - NETHER_WART_CROP >= NETHER_WART_MAX_AGE ? 2 + Math.floor(rand() * 3) : 1);
  if (isCrop(block)) {
    // Cosecha como en Minecraft: tres intentos al 57 % de sacar una semilla o fruto más.
    const extra = () => (rand() < 4 / 7 ? 1 : 0) + (rand() < 4 / 7 ? 1 : 0) + (rand() < 4 / 7 ? 1 : 0);
    const ripe = isMatureCrop(block);
    // Tallos: tres intentos de sacar una semilla, más probables cuanto más crecido (el unido, como maduro).
    const stemSeeds = (age: number) => [0, 1, 2].reduce((n) => n + (rand() < (age + 1) / 15 ? 1 : 0), 0);
    switch (familyBase(block)) {
      case PUMPKIN_STEM:
      case MELON_STEM:
      case ATTACHED_PUMPKIN_STEM:
      case ATTACHED_MELON_STEM: {
        const pumpkin = familyBase(block) === PUMPKIN_STEM || familyBase(block) === ATTACHED_PUMPKIN_STEM;
        const age = familyBase(block) === PUMPKIN_STEM || familyBase(block) === MELON_STEM ? block - familyBase(block) : 7;
        const n = stemSeeds(age);
        return n > 0 ? one(pumpkin ? PUMPKIN_SEEDS : MELON_SEEDS, n) : [];
      }
      case WHEAT_CROP:
        return ripe ? [{ id: WHEAT, count: 1 }, { id: WHEAT_SEEDS, count: 1 + extra() }] : one(WHEAT_SEEDS);
      case CARROTS:
        return one(CARROT, ripe ? 2 + extra() : 1);
      case POTATOES:
        // Fase 6.5 (equipo): a veces (2 %) sale además una patata venenosa.
        if (ripe && rand() < 0.02) return [{ id: POTATO, count: 2 + extra() }, { id: POISONOUS_POTATO, count: 1 }];
        return one(POTATO, ripe ? 2 + extra() : 1);
      case BEETROOTS:
        return ripe ? [{ id: BEETROOT, count: 1 }, { id: BEETROOT_SEEDS, count: 1 + extra() }] : one(BEETROOT_SEEDS);
    }
    return [];
  }
  switch (block) {
    case STONE:
      return one(COBBLESTONE);
    case GRASS:
    case SNOWY_GRASS:
      return one(DIRT);
    case COAL_ORE:
      return one(COAL);
    case DIAMOND_ORE:
      return one(DIAMOND);
    case LAPIS_ORE:
      return one(LAPIS, rnd(4, 8));
    case REDSTONE_ORE:
      return one(REDSTONE, rnd(4, 5));
    case GRAVEL:
      return rand() < 0.1 ? one(FLINT) : one(GRAVEL);
    case CLAY:
      return one(CLAY_BALL, 4);
    case GLASS:
    case ICE:
      return [];
    case BOOKSHELF:
      return one(BOOK, 3);
    case MELON:
      return one(MELON_SLICE, rnd(3, 7));
    case SHORT_GRASS:
    case FERN:
      // Semillas de trigo con un 12,5 % de probabilidad.
      return rand() < 0.125 ? one(WHEAT_SEEDS) : [];
    case DEAD_BUSH:
      return rnd(0, 2) > 0 ? one(STICK, rnd(1, 2)) : [];
  }
  // La fogata suelta carbón vegetal (como en Minecraft sin toque de seda).
  if (familyBase(block) === CAMPFIRE) return one(CHARCOAL, 2);
  if (isEnderChest(block)) return one(OBSIDIAN, 8); // Fase 8.6: sin Toque de seda, 8 de obsidiana
  if (familyBase(block) === SOUL_CAMPFIRE) return one(SOUL_SOIL, 1); // Fase 8.5: la de almas suelta tierra de alma
  // Fase 8.6: la planta de coro suelta 0 o 1 fruta de coro; la flor, a sí misma (joven o muerta).
  if (block === CHORUS_PLANT) return rnd(0, 1) ? one(CHORUS_FRUIT) : [];
  if (isChorusFlower(block)) return one(CHORUS_FLOWER);
  // El compostador lleno suelta también su polvo de hueso.
  if (familyBase(block) === COMPOSTER && block - COMPOSTER === 8) return [{ id: COMPOSTER, count: 1 }, { id: BONE_MEAL, count: 1 }];
  // Fase 6.5 (decoración): la maceta suelta también su planta.
  const plant = pottedPlant(block);
  if (plant) return [{ id: FLOWER_POT, count: 1 }, { id: plant, count: 1 }];
  // Fase 6.5 (equipo): lo que no es objeto (el fuego) no suelta nada.
  return ITEMS[baseBlock(block)] ? one(baseBlock(block)) : [];
}

/** Botín de las hojas al descomponerse solas (sin herramienta). */
export function leafDecayDrops(block: number, rand: () => number = Math.random): ItemStack[] {
  return blockDrops(block, 0, rand);
}
