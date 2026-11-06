// Crafting (shaped/shapeless) and smelting recipes.
import { IID, ITEMS } from './items.js';
import { WOODS, COLORS } from '../world/blocks.js';

export const RECIPES = [];
export const SMELTING = new Map(); // input id -> {out, count, xp}

function shaped(pattern, key, out, count = 1) {
  const rows = pattern.map(r => [...r]);
  const keyIds = {};
  for (const [k, v] of Object.entries(key)) {
    const names = Array.isArray(v) ? v : [v];
    keyIds[k] = names.map(n => { if (IID[n] === undefined) throw new Error('recipe: unknown item ' + n); return IID[n]; });
  }
  if (IID[out] === undefined) throw new Error('recipe: unknown output ' + out);
  RECIPES.push({ type: 'shaped', w: rows[0].length, h: rows.length, rows, key: keyIds, out: IID[out], count });
}
function shapeless(ins, out, count = 1) {
  const ids = ins.map(n => (Array.isArray(n) ? n : [n]).map(x => { if (IID[x] === undefined) throw new Error('recipe: unknown ' + x); return IID[x]; }));
  RECIPES.push({ type: 'shapeless', ins: ids, out: IID[out], count });
}
function smelt(input, out, xp = 0.1) { const ins = Array.isArray(input) ? input : [input]; for (const i of ins) SMELTING.set(IID[i], { out: IID[out], count: 1, xp }); }

const planks = WOODS.map(w => w + '_planks');
const logs = WOODS.map(w => w + '_log');
for (const w of WOODS) {
  shapeless([w + '_log'], w + '_planks', 4);
  shaped(['P P', 'PPP'], { P: w + '_planks' }, w + '_boat');
  shaped(['PPP'], { P: w + '_planks' }, w + '_slab', 6);
  shaped(['P  ', 'PP ', 'PPP'], { P: w + '_planks' }, w + '_stairs', 4);
  shaped(['PSP', 'PSP'], { P: w + '_planks', S: 'stick' }, w + '_fence', 3);
}
shaped(['P', 'P'], { P: planks }, 'stick', 4);
shaped(['PP', 'PP'], { P: planks }, 'crafting_table');
shaped(['CCC', 'C C', 'CCC'], { C: ['cobblestone', 'cobbled_deepslate'] }, 'furnace');
shaped(['PPP', 'P P', 'PPP'], { P: planks }, 'chest');
shaped(['C', 'S'], { C: ['coal', 'charcoal'], S: 'stick' }, 'torch', 4);
shaped(['R', 'S'], { R: 'redstone', S: 'stick' }, 'redstone_torch');
const mats = { wooden: planks, stone: ['cobblestone', 'cobbled_deepslate'], iron: ['iron_ingot'], golden: ['gold_ingot'], diamond: ['diamond'] };
for (const [t, m] of Object.entries(mats)) {
  shaped(['XXX', ' S ', ' S '], { X: m, S: 'stick' }, t + '_pickaxe');
  shaped(['XX', 'XS', ' S'], { X: m, S: 'stick' }, t + '_axe');
  shaped(['X', 'S', 'S'], { X: m, S: 'stick' }, t + '_shovel');
  shaped(['X', 'X', 'S'], { X: m, S: 'stick' }, t + '_sword');
  shaped(['XX', ' S', ' S'], { X: m, S: 'stick' }, t + '_hoe');
}
const armorMats = { leather: 'leather', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
for (const [t, m] of Object.entries(armorMats)) {
  shaped(['XXX', 'X X'], { X: m }, t + '_helmet');
  shaped(['X X', 'XXX', 'XXX'], { X: m }, t + '_chestplate');
  shaped(['XXX', 'X X', 'X X'], { X: m }, t + '_leggings');
  shaped(['X X', 'X X'], { X: m }, t + '_boots');
}
shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket');
shaped(['I I', 'III'], { I: 'iron_ingot' }, 'minecart');
shaped(['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' }, 'rail', 16);
shaped(['G G', 'GSG', 'GRG'], { G: 'gold_ingot', S: 'stick', R: 'redstone' }, 'powered_rail', 6);
shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3);
shaped(['PP', 'PP', 'PP'], { P: 'oak_planks' }, 'oak_door', 3);
shaped(['PPP', 'PPP'], { P: 'oak_planks' }, 'oak_trapdoor', 2);
const stoneShapes = [['cobblestone', 'cobblestone'], ['stone_brick', 'stone_bricks'], ['mossy_cobblestone', 'mossy_cobblestone'], ['stone', 'stone'], ['sandstone', 'sandstone'], ['brick', 'bricks'], ['polished_andesite', 'polished_andesite'], ['cut_copper', 'cut_copper'], ['oxidized_cut_copper', 'oxidized_cut_copper'], ['cobbled_deepslate', 'cobbled_deepslate']];
for (const [n, base] of stoneShapes) {
  shaped(['XXX'], { X: base }, n + '_slab', 6);
  shaped(['X  ', 'XX ', 'XXX'], { X: base }, n + '_stairs', 4);
}
shaped(['XXX'], { X: 'smooth_stone' }, 'smooth_stone_slab', 6);
shaped(['XX', 'XX'], { X: 'stone' }, 'stone_bricks', 4);
shaped(['XX', 'XX'], { X: 'brick' }, 'bricks');
shaped(['XX', 'XX'], { X: 'sand' }, 'sandstone');
shaped(['XX', 'XX'], { X: 'red_sand' }, 'red_sandstone');
shaped(['XX', 'XX'], { X: 'snowball' }, 'snow_block');
shaped(['XXX'], { X: 'snow_block' }, 'snow', 6);
shaped(['XX', 'XX'], { X: 'clay_ball' }, 'clay');
shaped(['XX', 'XX'], { X: 'granite' }, 'polished_granite', 4);
shaped(['XX', 'XX'], { X: 'diorite' }, 'polished_diorite', 4);
shaped(['XX', 'XX'], { X: 'andesite' }, 'polished_andesite', 4);
shaped(['XX', 'XX'], { X: 'copper_block' }, 'cut_copper', 4);
shaped(['XXX', 'XXX'], { X: 'glass' }, 'glass_pane', 16);
shaped(['XXX', 'XXX'], { X: 'iron_ingot' }, 'iron_bars', 16);
shaped(['XXX', 'XXX'], { X: 'cobblestone' }, 'cobblestone_wall', 6);
shaped(['PPP', 'BBB', 'PPP'], { P: planks, B: 'book' }, 'bookshelf');
shapeless(['paper', 'paper', 'paper', 'leather'], 'book');
shaped(['SSS'], { S: 'sugar_cane' }, 'paper', 3);
shapeless(['sugar_cane'], 'sugar');
shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: ['sand', 'red_sand'] }, 'tnt');
shaped(['SS', 'SS'], { S: 'string' }, 'white_wool');
shaped(['WW'], { W: 'white_wool' }, 'white_carpet', 3);
shaped(['WW'], { W: 'red_wool' }, 'red_carpet', 3);
shaped(['WWW'], { W: 'wheat' }, 'bread');
shaped(['WWW', 'WWW', 'WWW'], { W: 'wheat' }, 'hay_block');
shapeless(['hay_block'], 'wheat', 9);
for (const [blk, it] of [['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'], ['coal_block', 'coal'], ['redstone_block', 'redstone'], ['lapis_block', 'lapis_lazuli'], ['copper_block', 'copper_ingot']]) {
  shaped(['XXX', 'XXX', 'XXX'], { X: it }, blk);
  shapeless([blk], it, 9);
}
shaped(['XXX', 'XXX', 'XXX'], { X: 'iron_nugget' }, 'iron_ingot');
shaped(['XXX', 'XXX', 'XXX'], { X: 'gold_nugget' }, 'gold_ingot');
shapeless(['iron_ingot'], 'iron_nugget', 9);
shapeless(['gold_ingot'], 'gold_nugget', 9);
shapeless(['iron_ingot', 'flint'], 'flint_and_steel');
shaped([' I', 'I '], { I: 'iron_ingot' }, 'shears');
shaped(['P P', ' P '], { P: planks }, 'bowl', 4);
shapeless(['bowl', 'red_mushroom', 'brown_mushroom'], 'mushroom_stew');
shaped(['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'torch' }, 'lantern');
shaped(['P', 'T'], { P: 'carved_pumpkin', T: 'torch' }, 'jack_o_lantern');
shapeless(['cobblestone', 'vine'], 'mossy_cobblestone');
shaped([' IS', 'I S', ' IS'], { I: 'stick', S: 'string' }, 'bow');
shaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4);
shaped([' I ', 'IRI', ' I '], { I: 'iron_ingot', R: 'redstone' }, 'compass');
shaped([' G ', 'GRG', ' G '], { G: 'gold_ingot', R: 'redstone' }, 'clock');
shaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple');
shapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie');
shaped(['WCW'], { W: 'wheat', C: 'cocoa_beans' in IID ? 'cocoa_beans' : 'sugar' }, 'cookie', 8);
shaped(['G G', ' G '], { G: 'glass' }, 'glass_bottle', 3);
shapeless(['bone'], 'bone_meal', 3);
shaped(['XX', 'XX'], { X: 'stone_bricks' }, 'chiseled_stone_bricks', 1);
shaped(['XXX', 'XXX', 'XXX'], { X: 'melon_slice' }, 'melon');
shaped(['XX', 'XX'], { X: 'glowstone_dust' }, 'glowstone');
shapeless(['white_wool', 'lapis_lazuli'], 'blue_wool');
const DYEISH = { red_wool: 'poppy', yellow_wool: 'dandelion', light_blue_wool: 'blue_orchid', magenta_wool: 'allium', light_gray_wool: 'azure_bluet', orange_wool: 'orange_tulip', pink_wool: 'pink_tulip', blue_wool: 'cornflower', white_wool: 'lily_of_the_valley', black_wool: 'coal', green_wool: 'cactus', brown_wool: 'dirt' };
for (const [w, f] of Object.entries(DYEISH)) shapeless(['white_wool', f], w);
void COLORS;

// smelting
smelt('raw_iron', 'iron_ingot', 0.7); smelt('raw_gold', 'gold_ingot', 1); smelt('raw_copper', 'copper_ingot', 0.7);
smelt(['iron_ore', 'deepslate_iron_ore'], 'iron_ingot', 0.7); smelt(['gold_ore', 'deepslate_gold_ore'], 'gold_ingot', 1);
smelt(['sand', 'red_sand'], 'glass'); smelt('cobblestone', 'stone'); smelt('stone', 'smooth_stone'); smelt('cobbled_deepslate', 'deepslate');
smelt('clay_ball', 'brick', 0.3); smelt(logs, 'charcoal', 0.15); smelt('porkchop', 'cooked_porkchop', 0.35); smelt('beef', 'cooked_beef', 0.35);
smelt('chicken', 'cooked_chicken', 0.35); smelt('mutton', 'cooked_mutton', 0.35); smelt('potato', 'baked_potato', 0.35); smelt('cactus', 'green_wool' in IID ? 'cactus' : 'cactus', 1);
smelt(['coal_ore', 'deepslate_coal_ore'], 'coal', 0.1); smelt(['diamond_ore', 'deepslate_diamond_ore'], 'diamond', 1); smelt(['lapis_ore'], 'lapis_lazuli', 0.2);
smelt('stone_bricks', 'cracked_stone_bricks');
SMELTING.delete(IID.cactus);

// Match a crafting grid (array of stacks|null, size n x n) -> {out, count, consumed: indexes} | null
export function matchRecipe(grid, n) {
  // bounding box of non-empty cells
  let minX = n, minY = n, maxX = -1, maxY = -1, filled = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (grid[y * n + x]) { filled++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (!filled) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.type === 'shaped') {
      if (r.w !== w || r.h !== h) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
          const ch = r.rows[y][mirror ? w - 1 - x : x];
          const s = grid[(minY + y) * n + minX + x];
          if (ch === ' ') { if (s) ok = false; }
          else if (!s || !r.key[ch].includes(s.id)) ok = false;
        }
        if (ok) return { out: r.out, count: r.count };
      }
    } else {
      if (r.ins.length !== filled) continue;
      const used = new Array(r.ins.length).fill(false);
      let ok = true;
      for (let i = 0; i < n * n && ok; i++) {
        const s = grid[i]; if (!s) continue;
        let found = false;
        for (let k = 0; k < r.ins.length; k++) if (!used[k] && r.ins[k].includes(s.id)) { used[k] = true; found = true; break; }
        if (!found) ok = false;
      }
      if (ok) return { out: r.out, count: r.count };
    }
  }
  return null;
}
void ITEMS;
