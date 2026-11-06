// Item registry: every placeable block has an item with the same numeric id; item-only ids start at 1024.
import { BLOCKS, ID, FLOWERS, WOODS, COLORS } from '../world/blocks.js';

export const ITEMS = [];
export const IID = Object.create(null);
const ITEM_BASE = 1024;

const TIERS = {
  wooden: { level: 0, speed: 2, dur: 59, dmg: 0 }, stone: { level: 1, speed: 4, dur: 131, dmg: 1 }, iron: { level: 2, speed: 6, dur: 250, dmg: 2 },
  golden: { level: 0, speed: 12, dur: 32, dmg: 0 }, diamond: { level: 3, speed: 8, dur: 1561, dmg: 3 },
};
const TOOL_DMG = { sword: 4, axe: 7, pickaxe: 2, shovel: 2.5, hoe: 1 };
const AXE_DMG = { wooden: 7, stone: 9, iron: 9, golden: 7, diamond: 9 };
const ATTACK_SPEED = { sword: 1.6, axe: 0.8, pickaxe: 1.2, shovel: 1.0, hoe: 1.0 };

// Blocks whose item is drawn as a flat sprite (vanilla "generated" item models)
const FLAT_BLOCK_ITEMS = new Set([
  'torch', 'redstone_torch', 'rail', 'powered_rail', 'ladder', 'vine', 'lily_pad', 'dead_bush', 'short_grass', 'fern', 'cobweb', 'iron_bars', 'glass_pane',
  'brown_mushroom', 'red_mushroom', 'seagrass', 'pink_petals', 'tall_grass', 'large_fern', 'sunflower', 'lilac', 'rose_bush', 'peony', 'tall_seagrass',
  ...FLOWERS, ...WOODS.map(w => w + '_sapling'),
]);
const SPRITE_OVERRIDE = { oak_door: 'oak_door', sugar_cane: 'sugar_cane', lantern: 'lantern', kelp: 'kelp', tall_grass: 'tall_grass_top', large_fern: 'large_fern_top', sunflower: 'sunflower_front', lilac: 'lilac_top', rose_bush: 'rose_bush_top', peony: 'peony_top', glass_pane: 'glass', tall_seagrass: 'seagrass', oak_trapdoor: null };

function addBlockItems() {
  for (const b of BLOCKS) {
    if (!b.item || b.id === 0) { ITEMS[b.id] = null; continue; }
    const it = { id: b.id, name: b.name, displayName: b.displayName, maxStack: 64, block: b.id, category: 'building' };
    if (SPRITE_OVERRIDE[b.name] !== undefined && SPRITE_OVERRIDE[b.name] !== null) {
      it.icon = { type: SPRITE_OVERRIDE[b.name] === b.name && !['lantern'].includes(b.name) ? 'item' : (['oak_door', 'sugar_cane', 'kelp', 'lantern'].includes(b.name) ? 'item' : 'blocktex'), tex: SPRITE_OVERRIDE[b.name] };
    } else if (FLAT_BLOCK_ITEMS.has(b.name)) it.icon = { type: 'blocktex', tex: b.texFaces[0], tint: b.tint };
    else it.icon = { type: 'block' };
    ITEMS[b.id] = it; IID[b.name] = b.id;
  }
}
addBlockItems();
for (let i = BLOCKS.length; i < ITEM_BASE; i++) ITEMS[i] = null;

function item(name, props = {}) {
  const id = ITEMS.length;
  const it = { id, name, displayName: props.displayName || name.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' '), maxStack: 64, icon: { type: 'item', tex: name }, category: 'ingredients', ...props };
  ITEMS.push(it); IID[name] = id;
  return id;
}

for (const [tier, t] of Object.entries(TIERS)) {
  for (const tool of ['sword', 'shovel', 'pickaxe', 'axe', 'hoe']) {
    const dmg = tool === 'axe' ? AXE_DMG[tier] : TOOL_DMG[tool] + t.dmg;
    item(`${tier}_${tool}`, {
      maxStack: 1, durability: t.dur, tool: { type: tool, level: t.level, speed: t.speed }, attackDamage: tool === 'hoe' ? 1 : dmg,
      attackSpeed: tool === 'hoe' ? [1, 2, 3, 1, 4][Object.keys(TIERS).indexOf(tier)] : ATTACK_SPEED[tool] - (tool === 'axe' && tier === 'iron' ? -0.1 : 0),
      category: tool === 'sword' ? 'combat' : 'tools',
    });
  }
}
const simple = ['stick', 'coal', 'charcoal', 'raw_iron', 'raw_gold', 'raw_copper', 'iron_ingot', 'gold_ingot', 'copper_ingot', 'iron_nugget', 'gold_nugget', 'diamond', 'emerald',
  'lapis_lazuli', 'quartz', 'flint', 'bone', 'bone_meal', 'string', 'gunpowder', 'feather', 'leather', 'paper', 'book', 'clay_ball', 'brick', 'wheat', 'sugar', 'bowl', 'glowstone_dust'];
for (const n of simple) item(n);
item('redstone', { displayName: 'Redstone Dust', category: 'redstone' });
item('wheat_seeds', { place: ID.wheat, category: 'natural' });
item('snowball', { maxStack: 16, category: 'combat' });
item('egg', { maxStack: 16 });
item('arrow', { category: 'combat' });
item('bow', { maxStack: 1, durability: 384, category: 'combat' });
item('fishing_rod', { maxStack: 1, durability: 64, category: 'tools' });
item('flint_and_steel', { maxStack: 1, durability: 64, category: 'tools' });
item('shears', { maxStack: 1, durability: 238, tool: { type: 'shears', level: 0, speed: 1.5 }, category: 'tools' });
item('bucket', { maxStack: 16, category: 'tools' });
item('water_bucket', { maxStack: 1, category: 'tools' });
item('lava_bucket', { maxStack: 1, category: 'tools' });
item('milk_bucket', { maxStack: 1, category: 'food' });
item('compass', { maxStack: 64, category: 'tools' });
item('clock', { maxStack: 64, category: 'tools' });
item('glass_bottle', { category: 'ingredients' });
item('minecart', { maxStack: 1, category: 'transport' });
for (const w of WOODS) item(`${w}_boat`, { maxStack: 1, category: 'transport', boat: w });
const FOODS = {
  apple: [4, 0.3], golden_apple: [4, 1.2], bread: [5, 0.6], porkchop: [3, 0.3], cooked_porkchop: [8, 0.8], beef: [3, 0.3], cooked_beef: [8, 0.8],
  chicken: [2, 0.3], cooked_chicken: [6, 0.6], mutton: [2, 0.3], cooked_mutton: [6, 0.8], rotten_flesh: [4, 0.1], carrot: [3, 0.6], potato: [1, 0.3],
  baked_potato: [5, 0.6], melon_slice: [2, 0.3], pumpkin_pie: [8, 0.3], cookie: [2, 0.1], mushroom_stew: [6, 0.6],
};
for (const [n, [h, s]] of Object.entries(FOODS)) item(n, { food: { hunger: h, saturation: s }, maxStack: n === 'mushroom_stew' ? 1 : 64, category: 'food', displayName: n === 'cooked_beef' ? 'Steak' : undefined });
ITEMS[IID.cooked_beef].displayName = 'Steak';
const ARMOR = { leather: [1, 3, 2, 1, 5], golden: [2, 5, 3, 1, 7], iron: [2, 6, 5, 2, 15], diamond: [3, 8, 6, 3, 33] };
['helmet', 'chestplate', 'leggings', 'boots'].forEach((slot, si) => {
  for (const [m, a] of Object.entries(ARMOR)) item(`${m}_${slot}`, { maxStack: 1, armor: { slot: si, value: a[si] }, durability: a[4] * [11, 16, 15, 13][si], category: 'combat' });
});

// fix up block item icons that reference item sprites
for (const n of ['oak_door', 'sugar_cane', 'lantern', 'kelp']) if (IID[n] !== undefined) ITEMS[IID[n]].icon = { type: 'item', tex: n };
if (IID.redstone_torch !== undefined) ITEMS[IID.redstone_torch].icon = { type: 'blocktex', tex: 'redstone_torch' };
ITEMS[IID.wheat_seeds].icon = { type: 'item', tex: 'wheat_seeds' };

// Creative categories for blocks
const NATURAL = /(_log|_leaves|_sapling|_ore|^dirt|^grass|^stone$|sand$|gravel|^clay|snow|ice|obsidian|cactus|sugar_cane|pumpkin|melon|lily|vine|seagrass|kelp|mushroom|bedrock|netherrack|soul_sand|deepslate$|tuff|granite$|diorite$|andesite$|podzol|coarse|petals|bush|fern|short_grass|tall_grass)/;
for (const it of ITEMS) {
  if (!it || it.block === undefined) continue;
  const n = it.name;
  if (FLOWERS.includes(n) || ['sunflower', 'lilac', 'rose_bush', 'peony'].includes(n) || NATURAL.test(n)) it.category = 'natural';
  else if (/wool|carpet|terracotta/.test(n)) it.category = 'colored';
  else if (/rail|tnt|redstone/.test(n)) it.category = 'redstone';
  else if (/crafting|furnace|chest|torch|lantern|ladder|bookshelf|glowstone|sea_lantern|jack|door|trapdoor|glass_pane|iron_bars/.test(n)) it.category = 'functional';
  else it.category = 'building';
  if (n === 'farmland' || n === 'dirt_path' || n === 'nether_portal') it.category = 'hidden';
}
for (const n of ['minecart', ...WOODS.map(w => `${w}_boat`)]) ITEMS[IID[n]].category = 'tools';

export function itemDef(id) { return ITEMS[id] || null; }
export function itemByName(n) { const id = IID[n]; return id === undefined ? null : ITEMS[id]; }
export const stack = (name, count = 1, damage = 0) => ({ id: IID[name], count, damage });

// ---- Mining ------------------------------------------------------------------------------------------
export function isCorrectTool(tool, b) {
  if (!tool) return false;
  if (tool.type === 'shears') return b.name.endsWith('leaves') || b.name.endsWith('wool') || b.name === 'cobweb' || b.name === 'vine';
  if (tool.type === 'sword') return b.name === 'cobweb';
  return b.tool === tool.type && tool.level >= (b.level || 0);
}
export function canHarvest(heldItem, b) {
  if (!b.requiresTool) return true;
  const t = heldItem && heldItem.tool;
  return !!t && t.type === b.tool && t.level >= (b.level || 0);
}
export function toolSpeed(heldItem, b) {
  const t = heldItem && heldItem.tool;
  if (!t) return 1;
  if (t.type === 'sword') { if (b.name === 'cobweb') return 15; if (b.mat === 2 || b.model === 'cross' || b.name === 'pumpkin' || b.name === 'melon') return 1.5; return 1; }
  if (t.type === 'shears') { if (b.name === 'cobweb' || b.name.endsWith('leaves')) return 15; if (b.name.endsWith('wool')) return 5; if (b.name === 'vine') return 2; return 1; }
  if (b.tool === t.type) return t.speed;
  return 1;
}
// fraction of the block broken per tick (Player.getDestroySpeed / BlockState.getDestroyProgress)
export function destroyProgress(player, heldItem, b) {
  if (b.hardness < 0) return 0;
  if (b.hardness === 0) return 1;
  let speed = toolSpeed(heldItem, b);
  if (player.eyeFluid() === 1) speed /= 5;
  if (!player.onGround && !player.flying) speed /= 5;
  return speed / b.hardness / (canHarvest(heldItem, b) ? 30 : 100);
}

// ---- Drops -------------------------------------------------------------------------------------------
export function blockDrops(v, heldItem, rng = Math.random) {
  const b = BLOCKS[v & 0xfff], meta = v >>> 12;
  if (b.requiresTool && !canHarvest(heldItem, b)) return [];
  const shears = heldItem && heldItem.tool && heldItem.tool.type === 'shears';
  let d = b.drops;
  if (b.model === 'double_plant' && (meta & 1)) return [];
  if (b.model === 'door' && (meta & 8)) return [];
  if (b.model === 'slab' && meta === 2) return [{ id: b.id, count: 2 }];
  if (shears && (b.name.endsWith('leaves') || b.name === 'short_grass' || b.name === 'fern' || b.name === 'vine' || b.name === 'tall_grass' || b.name === 'seagrass' || b.name === 'dead_bush')) return [{ id: IID[b.name] ?? b.id, count: 1 }];
  if (d === undefined) return b.item ? [{ id: b.id, count: 1 }] : [];
  if (d === null) return [];
  if (typeof d === 'string') {
    if (d.startsWith('leaves:')) {
      const w = d.slice(7), res = [];
      if (rng() < (w === 'jungle' ? 1 / 40 : 1 / 20)) res.push({ id: IID[w + '_sapling'], count: 1 });
      if ((w === 'oak' || w === 'dark_oak') && rng() < 1 / 200) res.push({ id: IID.apple, count: 1 });
      if (rng() < 1 / 50) res.push({ id: IID.stick, count: 1 + (rng() < 0.5 ? 1 : 0) });
      return res;
    }
    if (d === 'seeds') return rng() < 0.125 ? [{ id: IID.wheat_seeds, count: 1 }] : [];
    if (d === 'wheat_crop') {
      if ((meta & 7) >= 7) return [{ id: IID.wheat, count: 1 }, { id: IID.wheat_seeds, count: 1 + Math.floor(rng() * 3) }];
      return [{ id: IID.wheat_seeds, count: 1 }];
    }
    return [{ id: IID[d], count: 1 }];
  }
  if (Array.isArray(d)) {
    const [n, a, bb] = d;
    const count = bb === undefined ? a : a + Math.floor(rng() * (bb - a + 1));
    return count > 0 ? [{ id: IID[n], count }] : [];
  }
  return [];
}

// Fuel burn times (ticks)
export function fuelTime(id) {
  const it = ITEMS[id]; if (!it) return 0;
  const n = it.name;
  if (n === 'coal' || n === 'charcoal') return 1600;
  if (n === 'coal_block') return 16000;
  if (n === 'lava_bucket') return 20000;
  if (n === 'blaze_rod') return 2400;
  if (n.endsWith('_boat')) return 1200;
  if (n.endsWith('_slab') && WOODS.some(w => n.startsWith(w))) return 150;
  if (/_(planks|log|stairs|fence)$/.test(n) && WOODS.some(w => n.startsWith(w))) return 300;
  if (['crafting_table', 'chest', 'bookshelf', 'ladder', 'bow', 'fishing_rod', 'oak_door', 'oak_trapdoor'].includes(n)) return 300;
  if (n.startsWith('wooden_')) return 200;
  if (n === 'stick' || n.endsWith('_sapling') || n.endsWith('_wool') || n === 'bowl' || n === 'dead_bush') return 100;
  if (n.endsWith('_carpet')) return 67;
  return 0;
}
