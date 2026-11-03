// Ofertas de los aldeanos y del comerciante ambulante de Java 26.3, tal cual están en sus datos (villager_trade,
// tags/villager_trade y trade_set). Generado desde el JAR: cada oficio tiene 5 niveles, y de cada nivel se eligen al
// azar `amount` ofertas distintas (si una no sale —no es para su tipo de aldeano, no hay estructura para el mapa—, se
// prueba otra). Las claves son las de los objetos de Java (las nuestras); faltan sólo las ofertas de objetos que
// todavía no existen (álamo, azufre, flores de ojo, musgo pálido colgante y en bloque, flores silvestres, hierba
// seca alta, arbusto de luciérnagas, diente de león dorado y seta de repisa, del comerciante ambulante).
//
// Campos: w / w2 lo que pide ([clave, cantidad]), g lo que da, max usos antes de reponer, xp que gana el aldeano,
// disc cuánto le afectan la demanda y la reputación al precio (reputation_discount). Modificadores de lo que da:
// enchant [mín, máx] niveles de encantamiento (su precio sube tantas esmeraldas como niveles), book un libro con un
// encantamiento al azar (su precio, el del encantamiento), dye teñido al azar, stew un efecto al azar del estofado
// [efecto, segundos], tipped una poción al azar de la flecha, potion la poción fija, map el mapa de explorador de esa
// estructura, types sólo para esos tipos de aldeano y water: lo que pide es un frasco de agua.

/** Una oferta de la tabla. */
export interface TradeDef {
  w: readonly [string, number];
  w2?: readonly [string, number];
  g: readonly [string, number];
  max: number;
  xp: number;
  disc: number;
  enchant?: readonly [number, number];
  book?: true;
  dye?: true;
  stew?: readonly (readonly [string, number])[];
  tipped?: true;
  potion?: string;
  map?: string;
  types?: readonly string[];
  water?: true;
}

/** Un nivel de un oficio (o un grupo del comerciante): cuántas ofertas se eligen y entre cuáles. */
export interface TradeLevel {
  amount: number;
  trades: readonly TradeDef[];
}

/** Pociones que pueden llevar las flechas con efecto del flechero (tags/potion/tradeable, las que existen). */
export const TRADEABLE_POTIONS: readonly string[] = [
  'night_vision', 'long_night_vision', 'invisibility', 'long_invisibility', 'fire_resistance', 'long_fire_resistance', 'leaping',
  'long_leaping', 'strong_leaping', 'slowness', 'long_slowness', 'strong_slowness', 'turtle_master', 'long_turtle_master',
  'strong_turtle_master', 'swiftness', 'long_swiftness', 'strong_swiftness', 'water_breathing', 'long_water_breathing', 'healing',
  'strong_healing', 'harming', 'strong_harming', 'poison', 'long_poison', 'strong_poison', 'regeneration', 'long_regeneration',
  'strong_regeneration', 'strength', 'long_strength', 'strong_strength', 'weakness', 'long_weakness', 'slow_falling', 'long_slow_falling',
];

export const VILLAGER_TRADES: Readonly<Record<string, readonly TradeLevel[]>> = {
  farmer: [
    { amount: 2, trades: [
      { w: ['wheat', 20], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['potato', 26], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['carrot', 22], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['beetroot', 15], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['bread', 6], max: 16, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['pumpkin', 6], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['pumpkin_pie', 4], max: 12, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['apple', 4], max: 16, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 3], g: ['cookie', 18], max: 12, xp: 10, disc: 0.05 },
      { w: ['melon', 4], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 3], g: ['cake', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['suspicious_stew', 1], max: 12, xp: 15, disc: 0.05, stew: [['night_vision', 5], ['jump_boost', 8], ['weakness', 7], ['blindness', 6], ['poison', 14], ['saturation', 7]] },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 3], g: ['golden_carrot', 3], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 4], g: ['glistering_melon_slice', 3], max: 12, xp: 30, disc: 0.05 },
    ] },
  ],
  fisherman: [
    { amount: 2, trades: [
      { w: ['string', 20], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['coal', 10], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['cod', 6], w2: ['emerald', 1], g: ['cooked_cod', 6], max: 16, xp: 1, disc: 0.05 },
      { w: ['emerald', 3], g: ['cod_bucket', 1], max: 16, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['cod', 15], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['salmon', 6], w2: ['emerald', 1], g: ['cooked_salmon', 6], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 2], g: ['campfire', 1], max: 12, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['salmon', 13], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['emerald', 3], g: ['fishing_rod', 1], max: 3, xp: 10, disc: 0.2, enchant: [5, 19] },
    ] },
    { amount: 2, trades: [
      { w: ['tropical_fish', 6], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['pufferfish', 4], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['oak_boat', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05, types: ['plains'] },
      { w: ['spruce_boat', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05, types: ['taiga', 'snow'] },
      { w: ['jungle_boat', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05, types: ['desert', 'jungle'] },
      { w: ['acacia_boat', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05, types: ['savanna'] },
      { w: ['dark_oak_boat', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05, types: ['swamp'] },
    ] },
  ],
  shepherd: [
    { amount: 2, trades: [
      { w: ['white_wool', 18], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['brown_wool', 18], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['gray_wool', 18], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['black_wool', 18], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 2], g: ['shears', 1], max: 12, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['white_dye', 12], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['gray_dye', 12], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['black_dye', 12], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['light_blue_dye', 12], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['lime_dye', 12], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['white_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['orange_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['magenta_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_blue_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['yellow_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['lime_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['pink_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['gray_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_gray_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['cyan_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['purple_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['blue_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['brown_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['green_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['red_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['black_wool', 1], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['white_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['orange_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['magenta_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_blue_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['yellow_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['lime_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['pink_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['gray_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_gray_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['cyan_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['purple_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['blue_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['brown_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['green_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['red_carpet', 4], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['black_carpet', 4], max: 16, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['yellow_dye', 12], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['light_gray_dye', 12], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['orange_dye', 12], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['red_dye', 12], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['pink_dye', 12], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['emerald', 3], g: ['white_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['orange_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['magenta_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['light_blue_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['yellow_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['lime_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['pink_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['gray_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['light_gray_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['cyan_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['purple_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['blue_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['brown_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['green_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['red_bed', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 3], g: ['black_bed', 1], max: 12, xp: 10, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['brown_dye', 12], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['purple_dye', 12], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['blue_dye', 12], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['green_dye', 12], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['magenta_dye', 12], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['cyan_dye', 12], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['emerald', 3], g: ['white_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['orange_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['magenta_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['light_blue_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['yellow_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['lime_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['pink_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['gray_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['light_gray_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['cyan_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['purple_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['blue_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['brown_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['green_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['red_banner', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 3], g: ['black_banner', 1], max: 12, xp: 15, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 2], g: ['painting', 3], max: 12, xp: 30, disc: 0.05 },
    ] },
  ],
  fletcher: [
    { amount: 2, trades: [
      { w: ['stick', 32], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['arrow', 16], max: 12, xp: 1, disc: 0.05 },
      { w: ['gravel', 10], w2: ['emerald', 1], g: ['flint', 10], max: 12, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['flint', 26], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 2], g: ['bow', 1], max: 12, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['string', 14], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['emerald', 3], g: ['crossbow', 1], max: 12, xp: 10, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['feather', 24], g: ['emerald', 1], max: 16, xp: 30, disc: 0.05 },
      { w: ['emerald', 2], g: ['bow', 1], max: 3, xp: 15, disc: 0.05, enchant: [5, 19] },
    ] },
    { amount: 2, trades: [
      { w: ['tripwire_hook', 8], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 3], g: ['crossbow', 1], max: 3, xp: 15, disc: 0.05, enchant: [5, 19] },
      { w: ['emerald', 2], w2: ['arrow', 5], g: ['tipped_arrow', 5], max: 12, xp: 30, disc: 0.05, tipped: true },
    ] },
  ],
  librarian: [
    { amount: 2, trades: [
      { w: ['paper', 24], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 0], w2: ['book', 1], g: ['enchanted_book', 1], max: 12, xp: 1, disc: 0.2, book: true },
      { w: ['emerald', 9], g: ['bookshelf', 1], max: 12, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['book', 4], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 0], w2: ['book', 1], g: ['enchanted_book', 1], max: 12, xp: 5, disc: 0.2, book: true },
      { w: ['emerald', 1], g: ['lantern', 1], max: 12, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['ink_sac', 5], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
      { w: ['emerald', 0], w2: ['book', 1], g: ['enchanted_book', 1], max: 12, xp: 10, disc: 0.2, book: true },
      { w: ['emerald', 1], g: ['glass', 4], max: 12, xp: 10, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['writable_book', 2], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 0], w2: ['book', 1], g: ['enchanted_book', 1], max: 12, xp: 15, disc: 0.2, book: true },
      { w: ['emerald', 5], g: ['clock', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 4], g: ['compass', 1], max: 12, xp: 15, disc: 0.05 },
    ] },
    { amount: 3, trades: [
      { w: ['emerald', 3], g: ['yellow_candle', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 3], g: ['red_candle', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
  ],
  cartographer: [
    { amount: 2, trades: [
      { w: ['paper', 24], g: ['emerald', 1], max: 12, xp: 2, disc: 0.05 },
      { w: ['emerald', 7], g: ['map', 1], max: 12, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['glass_pane', 11], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'village_taiga', types: ['swamp', 'snow', 'plains'] },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'swamp_hut', types: ['taiga', 'snow', 'jungle'] },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'village_snowy', types: ['taiga', 'swamp'] },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'village_savanna', types: ['plains', 'jungle', 'desert'] },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'village_plains', types: ['taiga', 'snow', 'savanna', 'desert'] },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'jungle_temple', types: ['swamp', 'savanna', 'desert'] },
      { w: ['emerald', 8], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 5, disc: 0.2, map: 'village_desert', types: ['savanna', 'jungle'] },
    ] },
    { amount: 2, trades: [
      { w: ['compass', 1], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
      { w: ['emerald', 13], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 10, disc: 0.2, map: 'monument' },
      { w: ['emerald', 12], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 10, disc: 0.2, map: 'trial_chambers' },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 7], g: ['item_frame', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 2], g: ['white_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['snow', 'plains'] },
      { w: ['emerald', 2], g: ['orange_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['savanna', 'desert'] },
      { w: ['emerald', 2], g: ['magenta_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['savanna'] },
      { w: ['emerald', 2], g: ['blue_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['snow', 'taiga'] },
      { w: ['emerald', 2], g: ['light_blue_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['snow', 'swamp'] },
      { w: ['emerald', 2], g: ['yellow_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['plains', 'jungle'] },
      { w: ['emerald', 2], g: ['lime_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['desert', 'taiga'] },
      { w: ['emerald', 2], g: ['pink_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['taiga', 'plains'] },
      { w: ['emerald', 2], g: ['gray_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['desert'] },
      { w: ['emerald', 2], g: ['cyan_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['desert', 'snow'] },
      { w: ['emerald', 2], g: ['purple_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['taiga', 'swamp'] },
      { w: ['emerald', 2], g: ['brown_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['plains', 'jungle'] },
      { w: ['emerald', 2], g: ['green_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['desert', 'savanna', 'jungle'] },
      { w: ['emerald', 2], g: ['red_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['snow', 'savanna'] },
      { w: ['emerald', 2], g: ['black_banner', 1], max: 12, xp: 15, disc: 0.05, types: ['swamp'] },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 8], g: ['globe_banner_pattern', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 14], w2: ['compass', 1], g: ['filled_map', 1], max: 12, xp: 30, disc: 0.2, map: 'mansion' },
    ] },
  ],
  cleric: [
    { amount: 2, trades: [
      { w: ['rotten_flesh', 32], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['redstone', 2], max: 12, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['gold_ingot', 3], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['lapis_lazuli', 1], max: 12, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['rabbit_foot', 2], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
      { w: ['emerald', 4], g: ['glowstone', 1], max: 12, xp: 10, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['turtle_scute', 4], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['glass_bottle', 9], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 5], g: ['ender_pearl', 1], max: 12, xp: 15, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['nether_wart', 22], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 3], g: ['experience_bottle', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
  ],
  armorer: [
    { amount: 2, trades: [
      { w: ['coal', 15], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 7], g: ['iron_leggings', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 4], g: ['iron_boots', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 5], g: ['iron_helmet', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 9], g: ['iron_chestplate', 1], max: 12, xp: 1, disc: 0.2 },
    ] },
    { amount: 2, trades: [
      { w: ['iron_ingot', 4], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 36], g: ['bell', 1], max: 12, xp: 5, disc: 0.2 },
      { w: ['emerald', 1], g: ['chainmail_boots', 1], max: 12, xp: 5, disc: 0.2 },
      { w: ['emerald', 3], g: ['chainmail_leggings', 1], max: 12, xp: 5, disc: 0.2 },
    ] },
    { amount: 2, trades: [
      { w: ['lava_bucket', 1], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
      { w: ['emerald', 1], g: ['chainmail_helmet', 1], max: 12, xp: 10, disc: 0.2 },
      { w: ['emerald', 4], g: ['chainmail_chestplate', 1], max: 12, xp: 10, disc: 0.2 },
      { w: ['emerald', 5], g: ['shield', 1], max: 12, xp: 10, disc: 0.2 },
      { w: ['diamond', 1], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 14], g: ['diamond_leggings', 1], max: 3, xp: 15, disc: 0.2, enchant: [5, 19] },
      { w: ['emerald', 8], g: ['diamond_boots', 1], max: 3, xp: 15, disc: 0.2, enchant: [5, 19] },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 8], g: ['diamond_helmet', 1], max: 3, xp: 30, disc: 0.2, enchant: [5, 19] },
      { w: ['emerald', 16], g: ['diamond_chestplate', 1], max: 3, xp: 30, disc: 0.2, enchant: [5, 19] },
    ] },
  ],
  weaponsmith: [
    { amount: 2, trades: [
      { w: ['coal', 15], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 3], g: ['iron_axe', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 2], g: ['iron_sword', 1], max: 12, xp: 1, disc: 0.2, enchant: [5, 19] },
    ] },
    { amount: 2, trades: [
      { w: ['iron_ingot', 4], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 36], g: ['bell', 1], max: 12, xp: 5, disc: 0.2 },
    ] },
    { amount: 2, trades: [
      { w: ['flint', 24], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 12], g: ['diamond_axe', 1], max: 3, xp: 15, disc: 0.2, enchant: [5, 19] },
      { w: ['diamond', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 8], g: ['diamond_sword', 1], max: 3, xp: 30, disc: 0.2, enchant: [5, 19] },
    ] },
  ],
  toolsmith: [
    { amount: 2, trades: [
      { w: ['coal', 15], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['stone_axe', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 1], g: ['stone_shovel', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 1], g: ['stone_pickaxe', 1], max: 12, xp: 1, disc: 0.2 },
      { w: ['emerald', 1], g: ['stone_hoe', 1], max: 12, xp: 1, disc: 0.2 },
    ] },
    { amount: 2, trades: [
      { w: ['iron_ingot', 4], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 36], g: ['bell', 1], max: 12, xp: 5, disc: 0.2 },
    ] },
    { amount: 2, trades: [
      { w: ['flint', 30], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
      { w: ['emerald', 1], g: ['iron_axe', 1], max: 3, xp: 10, disc: 0.2, enchant: [5, 19] },
      { w: ['emerald', 2], g: ['iron_shovel', 1], max: 3, xp: 10, disc: 0.2, enchant: [5, 19] },
      { w: ['emerald', 3], g: ['iron_pickaxe', 1], max: 3, xp: 10, disc: 0.2, enchant: [5, 19] },
      { w: ['emerald', 4], g: ['diamond_hoe', 1], max: 3, xp: 10, disc: 0.2 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 12], g: ['diamond_axe', 1], max: 3, xp: 15, disc: 0.2, enchant: [5, 19] },
      { w: ['emerald', 5], g: ['diamond_shovel', 1], max: 3, xp: 15, disc: 0.2, enchant: [5, 19] },
      { w: ['diamond', 1], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 13], g: ['diamond_pickaxe', 1], max: 3, xp: 30, disc: 0.2, enchant: [5, 19] },
    ] },
  ],
  butcher: [
    { amount: 2, trades: [
      { w: ['raw_chicken', 14], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['raw_porkchop', 7], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['raw_rabbit', 4], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['rabbit_stew', 1], max: 12, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['coal', 15], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['cooked_porkchop', 5], max: 16, xp: 5, disc: 0.05 },
      { w: ['emerald', 1], g: ['cooked_chicken', 8], max: 16, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['raw_mutton', 7], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['raw_beef', 10], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['dried_kelp_block', 10], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['sweet_berries', 10], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
  ],
  leatherworker: [
    { amount: 2, trades: [
      { w: ['leather', 6], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 3], g: ['leather_leggings', 1], max: 12, xp: 1, disc: 0.2, dye: true },
      { w: ['emerald', 7], g: ['leather_chestplate', 1], max: 12, xp: 1, disc: 0.2, dye: true },
    ] },
    { amount: 2, trades: [
      { w: ['flint', 26], g: ['emerald', 1], max: 12, xp: 10, disc: 0.05 },
      { w: ['emerald', 5], g: ['leather_helmet', 1], max: 12, xp: 5, disc: 0.2, dye: true },
      { w: ['emerald', 4], g: ['leather_boots', 1], max: 12, xp: 5, disc: 0.2, dye: true },
    ] },
    { amount: 2, trades: [
      { w: ['rabbit_hide', 9], g: ['emerald', 1], max: 12, xp: 20, disc: 0.05 },
      { w: ['emerald', 7], g: ['leather_chestplate', 1], max: 12, xp: 1, disc: 0.2, dye: true },
    ] },
    { amount: 2, trades: [
      { w: ['turtle_scute', 4], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 6], g: ['leather_horse_armor', 1], max: 12, xp: 15, disc: 0.2, dye: true },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 6], g: ['saddle', 1], max: 12, xp: 30, disc: 0.2 },
      { w: ['emerald', 5], g: ['leather_helmet', 1], max: 12, xp: 5, disc: 0.2, dye: true },
    ] },
  ],
  mason: [
    { amount: 2, trades: [
      { w: ['clay_ball', 10], g: ['emerald', 1], max: 16, xp: 2, disc: 0.05 },
      { w: ['emerald', 1], g: ['brick', 10], max: 16, xp: 1, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['stone', 20], g: ['emerald', 1], max: 16, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['chiseled_stone_bricks', 4], max: 16, xp: 5, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['granite', 16], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['andesite', 16], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['diorite', 16], g: ['emerald', 1], max: 16, xp: 20, disc: 0.05 },
      { w: ['emerald', 1], g: ['dripstone_block', 4], max: 16, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['polished_andesite', 4], max: 16, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['polished_diorite', 4], max: 16, xp: 10, disc: 0.05 },
      { w: ['emerald', 1], g: ['polished_granite', 4], max: 16, xp: 10, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['quartz', 12], g: ['emerald', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 1], g: ['white_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['orange_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['magenta_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_blue_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['yellow_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['lime_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['pink_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['gray_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_gray_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['cyan_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['purple_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['blue_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['brown_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['green_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['red_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['black_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['white_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['orange_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['magenta_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_blue_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['yellow_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['lime_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['pink_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['gray_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['light_gray_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['cyan_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['purple_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['blue_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['brown_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['green_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['red_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
      { w: ['emerald', 1], g: ['black_glazed_terracotta', 1], max: 12, xp: 15, disc: 0.05 },
    ] },
    { amount: 2, trades: [
      { w: ['emerald', 1], g: ['quartz_pillar', 1], max: 12, xp: 30, disc: 0.05 },
      { w: ['emerald', 1], g: ['quartz_block', 1], max: 12, xp: 30, disc: 0.05 },
    ] },
  ],
};

/** El comerciante ambulante: 2 de «buying», 2 de «uncommon» y 5 de «common» (en ese orden). */
export const WANDERING_TRADES: readonly TradeLevel[] = [
  { amount: 2, trades: [ // buying
    { w: ['potion', 1], g: ['emerald', 1], max: 2, xp: 1, disc: 0.05, water: true },
    { w: ['water_bucket', 1], g: ['emerald', 2], max: 2, xp: 1, disc: 0.05 },
    { w: ['milk_bucket', 1], g: ['emerald', 2], max: 2, xp: 1, disc: 0.05 },
    { w: ['fermented_spider_eye', 1], g: ['emerald', 3], max: 2, xp: 1, disc: 0.05 },
    { w: ['baked_potato', 4], g: ['emerald', 1], max: 2, xp: 1, disc: 0.05 },
    { w: ['hay_bale', 1], g: ['emerald', 1], max: 2, xp: 1, disc: 0.05 },
  ] },
  { amount: 2, trades: [ // uncommon
    { w: ['emerald', 1], g: ['packed_ice', 1], max: 6, xp: 1, disc: 0.05 },
    { w: ['emerald', 6], g: ['blue_ice', 1], max: 6, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['gunpowder', 4], max: 2, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['podzol', 3], max: 6, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['acacia_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['birch_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['dark_oak_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['jungle_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['oak_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['spruce_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['cherry_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['mangrove_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['pale_oak_log', 8], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['iron_pickaxe', 1], max: 1, xp: 1, disc: 0.2, enchant: [5, 19] },
    { w: ['emerald', 5], g: ['potion', 1], max: 1, xp: 1, disc: 0.05, potion: 'long_invisibility' },
  ] },
  { amount: 5, trades: [ // common
    { w: ['emerald', 1], g: ['white_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['orange_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['magenta_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['light_blue_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['yellow_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['lime_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['pink_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['gray_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['light_gray_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['cyan_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['purple_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['blue_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['brown_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['green_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['red_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['black_dye', 3], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['tropical_fish_bucket', 1], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['pufferfish_bucket', 1], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 2], g: ['sea_pickle', 1], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 4], g: ['slime_ball', 1], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 2], g: ['glowstone', 1], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['nautilus_shell', 1], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['fern', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['sugar_cane', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['pumpkin', 1], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['kelp', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['cactus', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['dandelion', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['poppy', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['blue_orchid', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['allium', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['azure_bluet', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['red_tulip', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['orange_tulip', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['white_tulip', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['pink_tulip', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['oxeye_daisy', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['cornflower', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['lily_of_the_valley', 1], max: 7, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['wheat_seeds', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['beetroot_seeds', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['pumpkin_seeds', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['melon_seeds', 1], max: 12, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['acacia_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['birch_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['dark_oak_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['jungle_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['oak_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['spruce_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['cherry_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['pale_oak_sapling', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 5], g: ['mangrove_propagule', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['brain_coral_block', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['bubble_coral_block', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['fire_coral_block', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['horn_coral_block', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 3], g: ['tube_coral_block', 1], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['vine', 3], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['brown_mushroom', 3], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['red_mushroom', 3], max: 4, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['lily_pad', 5], max: 2, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['small_dripleaf', 2], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['sand', 8], max: 8, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['red_sand', 4], max: 6, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['pointed_dripstone', 2], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['rooted_dirt', 2], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['moss_block', 2], max: 5, xp: 1, disc: 0.05 },
    { w: ['emerald', 1], g: ['name_tag', 1], max: 5, xp: 1, disc: 0.05 },
  ] },
];
