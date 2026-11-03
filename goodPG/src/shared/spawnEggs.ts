// Fase 6.5 (decoración): huevos generadores de todas las criaturas. Sólo datos (clave de la criatura,
// nombre en minúsculas para «Huevo generador de …» y los dos colores del huevo); no importa nada para
// que items.ts pueda usarlo sin dependencias circulares (mobs.ts importa items.ts).
// Los huevos nuevos se añaden siempre al final (los ids de objeto se guardan).

type RGB = readonly [number, number, number];

export interface SpawnEggDef {
  /** Clave de la criatura (MobDef.key). */
  mob: string;
  /** Nombre para «Huevo generador de …». */
  name: string;
  /** Color de fondo y de las manchas. */
  base: RGB;
  spots: RGB;
}

const egg = (mob: string, name: string, base: RGB, spots: RGB): SpawnEggDef => ({ mob, name, base, spots });

export const SPAWN_EGG_DEFS: readonly SpawnEggDef[] = [
  egg('pig', 'cerdo', [240, 160, 156], [219, 99, 94]),
  egg('cow', 'vaca', [68, 54, 37], [161, 161, 161]),
  egg('sheep', 'oveja', [231, 231, 231], [255, 181, 181]),
  egg('chicken', 'gallina', [161, 161, 161], [230, 30, 30]),
  egg('zombie', 'zombi', [0, 175, 175], [121, 156, 101]),
  egg('husk', 'zombi momificado', [121, 118, 87], [230, 204, 148]),
  egg('skeleton', 'esqueleto', [193, 193, 193], [73, 73, 73]),
  egg('stray', 'esqueleto errante', [97, 118, 118], [221, 234, 234]),
  egg('creeper', 'creeper', [13, 168, 0], [20, 20, 20]),
  egg('spider', 'araña', [52, 45, 39], [163, 0, 0]),
  egg('enderman', 'enderman', [22, 22, 22], [60, 20, 70]),
  egg('squid', 'calamar', [34, 61, 77], [112, 131, 145]),
  egg('fox', 'zorro', [213, 178, 138], [202, 102, 34]),
  egg('goat', 'cabra', [165, 148, 125], [85, 73, 62]),
  egg('polar_bear', 'oso polar', [242, 242, 242], [149, 149, 148]),
  egg('rabbit', 'conejo', [153, 93, 60], [115, 84, 59]),
  egg('wolf', 'lobo', [215, 211, 211], [206, 173, 145]),
  egg('villager', 'aldeano', [86, 60, 50], [189, 139, 114]),
  egg('wandering_trader', 'comerciante ambulante', [69, 97, 145], [234, 169, 69]),
  egg('iron_golem', 'gólem de hierro', [219, 205, 193], [116, 168, 83]),
  egg('snow_golem', 'gólem de nieve', [217, 242, 242], [129, 166, 166]),
  egg('cat', 'gato', [239, 197, 142], [149, 120, 83]),
  egg('horse', 'caballo', [192, 158, 127], [238, 229, 0]),
  egg('donkey', 'burro', [83, 69, 57], [134, 117, 102]),
  egg('mule', 'mula', [27, 2, 0], [81, 51, 29]),
  egg('llama', 'llama', [194, 165, 120], [153, 83, 52]),
  egg('camel', 'camello', [252, 174, 76], [204, 137, 56]),
  egg('cod', 'bacalao', [193, 167, 100], [229, 196, 138]),
  egg('salmon', 'salmón', [161, 0, 0], [14, 131, 119]),
  egg('tropical_fish', 'pez tropical', [239, 112, 19], [255, 249, 239]),
  egg('pufferfish', 'pez globo', [246, 178, 15], [55, 194, 240]),
  egg('dolphin', 'delfín', [34, 58, 74], [249, 249, 249]),
  egg('turtle', 'tortuga', [231, 231, 231], [0, 175, 175]),
  egg('axolotl', 'ajolote', [251, 193, 227], [166, 19, 145]),
  egg('frog', 'rana', [213, 120, 70], [255, 197, 108]),
  egg('tadpole', 'renacuajo', [109, 83, 65], [22, 17, 13]),
  egg('glow_squid', 'calamar brillante', [9, 93, 105], [133, 241, 188]),
  egg('drowned', 'ahogado', [143, 241, 215], [121, 156, 101]),
  egg('witch', 'bruja', [52, 0, 0], [81, 160, 50]),
  egg('slime', 'slime', [81, 160, 50], [126, 191, 110]),
  egg('phantom', 'phantom', [67, 81, 138], [136, 255, 0]),
  egg('silverfish', 'lepisma', [110, 110, 110], [48, 48, 48]),
  egg('cave_spider', 'araña de cueva', [12, 66, 77], [163, 0, 0]),
  egg('zombie_villager', 'aldeano zombi', [86, 60, 50], [121, 156, 101]),
  egg('bee', 'abeja', [237, 193, 57], [67, 36, 27]),
  egg('panda', 'panda', [231, 231, 231], [27, 27, 27]),
  egg('parrot', 'loro', [13, 168, 0], [255, 0, 0]),
  egg('armadillo', 'armadillo', [173, 113, 108], [130, 71, 72]),
  egg('pillager', 'saqueador', [83, 47, 54], [149, 154, 151]),
  egg('vindicator', 'vindicador', [149, 154, 151], [39, 93, 96]),
  egg('evoker', 'evocador', [149, 154, 151], [30, 30, 30]),
  egg('vex', 'vex', [122, 144, 164], [232, 237, 241]),
  egg('ravager', 'devastador', [117, 114, 110], [91, 80, 74]),
];

/** Criaturas sin huevo propio: los slimes pequeños salen al dividirse y los colmillos, del evocador. */
// Fase 8.3: los cubos de magma mediano y pequeño tampoco (el huevo del cubo de magma elige el tamaño al azar).
export const NO_SPAWN_EGG: ReadonlySet<string> = new Set(['slime_medium', 'slime_small', 'evoker_fangs', 'magma_cube_medium', 'magma_cube_small']);

/**
 * Fase 7.5: huevos de las criaturas nuevas. Van en otra lista porque sus objetos se registran al final de
 * items.ts (añadirlos a la de arriba movería los ids de todo lo registrado después).
 */
export const LATE_SPAWN_EGG_DEFS: readonly SpawnEggDef[] = [
  egg('guardian', 'guardián', [90, 130, 114], [241, 125, 48]), // Fase 7.5 (océano)
  egg('elder_guardian', 'guardián anciano', [206, 205, 186], [116, 118, 147]),
  egg('warden', 'warden', [15, 70, 73], [57, 214, 224]), // Fase 7.5 (abismo)
  // Fase 7.5 (fauna)
  egg('bat', 'murciélago', [76, 62, 48], [15, 15, 15]),
  egg('ocelot', 'ocelote', [239, 222, 125], [86, 68, 52]),
  egg('mooshroom', 'champiñaca', [160, 15, 16], [183, 183, 183]),
  egg('trader_llama', 'llama de comerciante', [234, 164, 48], [69, 98, 150]),
  egg('skeleton_horse', 'caballo esqueleto', [104, 104, 79], [229, 229, 216]),
  egg('zombie_horse', 'caballo zombi', [49, 82, 52], [151, 194, 132]),
  egg('allay', 'alay', [0, 218, 255], [0, 173, 255]), // Fase 7.5 (mansión)
];

/** Fase 8.3 (criaturas del Nether): huevos de las criaturas del Nether (se registran al final de items.ts). */
export const NETHER_SPAWN_EGG_DEFS: readonly SpawnEggDef[] = [
  egg('piglin', 'piglin', [153, 93, 59], [249, 243, 164]),
  egg('piglin_brute', 'piglin bruto', [89, 40, 5], [249, 243, 164]),
  egg('zombified_piglin', 'piglin zombificado', [234, 147, 147], [76, 112, 48]),
  egg('ghast', 'ghast', [249, 249, 249], [188, 188, 188]),
  egg('blaze', 'blaze', [246, 178, 0], [255, 249, 127]),
  egg('magma_cube', 'cubo de magma', [52, 0, 0], [252, 252, 0]),
  egg('hoglin', 'hoglin', [198, 131, 101], [95, 102, 102]),
  egg('zoglin', 'zoglin', [198, 131, 101], [230, 230, 230]),
  egg('strider', 'strider', [156, 61, 62], [77, 73, 77]),
  egg('wither_skeleton', 'esqueleto wither', [20, 20, 20], [71, 77, 77]),
];

/** Fase 8.6 (el End): huevos de las criaturas del End (se registran al final de items.ts). */
export const END_SPAWN_EGG_DEFS: readonly SpawnEggDef[] = [
  egg('endermite', 'endermita', [22, 22, 22], [110, 110, 110]),
  egg('ender_dragon', 'dragón de ender', [28, 28, 28], [224, 121, 250]),
  egg('shulker', 'shulker', [148, 103, 148], [77, 56, 82]),
];

/** Fase 8.7: el huevo del Wither (se registra al final de items.ts). */
export const WITHER_SPAWN_EGG_DEFS: readonly SpawnEggDef[] = [
  egg('wither', 'wither', [21, 21, 21], [79, 84, 94]),
];
