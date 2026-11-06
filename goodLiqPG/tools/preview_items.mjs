// Contact sheet of the procedurally painted item sprites (src/textures/itemtex.js).
// Usage: node tools/preview_items.mjs [out.png] [scale] [filter-substring]
//   writes /tmp/items.png by default (5x), prints the grid index -> name map and any authoring problems.
import { writePNG, sheet } from './png.mjs';
import { paintItemTextures, itemTextureProblems } from '../src/textures/itemtex.js';

const out = process.argv[2] || '/tmp/items.png';
const scale = Number(process.argv[3] || 5);
const filter = process.argv[4] || '';

const REQUIRED = `wooden_pickaxe stone_pickaxe iron_pickaxe golden_pickaxe diamond_pickaxe wooden_axe stone_axe iron_axe golden_axe diamond_axe
wooden_shovel stone_shovel iron_shovel golden_shovel diamond_shovel wooden_sword stone_sword iron_sword golden_sword diamond_sword
wooden_hoe stone_hoe iron_hoe golden_hoe diamond_hoe stick coal charcoal raw_iron raw_gold raw_copper iron_ingot gold_ingot copper_ingot
iron_nugget gold_nugget diamond emerald redstone lapis_lazuli quartz flint flint_and_steel shears bucket water_bucket lava_bucket milk_bucket
apple golden_apple bread wheat wheat_seeds porkchop cooked_porkchop beef cooked_beef chicken cooked_chicken mutton cooked_mutton rotten_flesh
carrot potato baked_potato melon_slice pumpkin_pie cookie sugar egg bowl mushroom_stew bone bone_meal string gunpowder feather leather paper
book clay_ball brick snowball arrow bow fishing_rod compass clock glass_bottle minecart oak_boat spruce_boat birch_boat jungle_boat
acacia_boat dark_oak_boat cherry_boat oak_door sugar_cane lantern redstone_torch_item kelp leather_helmet leather_chestplate
leather_leggings leather_boots iron_helmet iron_chestplate iron_leggings iron_boots diamond_helmet diamond_chestplate diamond_leggings
diamond_boots golden_helmet golden_chestplate golden_leggings golden_boots`.split(/\s+/);

const tex = paintItemTextures();
const missing = REQUIRED.filter(n => !tex[n]);
const problems = itemTextureProblems();

// sanity: correct size, binary alpha
for (const [n, t] of Object.entries(tex)) {
  if (t.w !== 16 || t.h !== 16 || t.data.length !== 1024) problems.push(`${n}: bad size`);
  for (let i = 3; i < t.data.length; i += 4) if (t.data[i] !== 0 && t.data[i] !== 255) { problems.push(`${n}: non-binary alpha`); break; }
}

const names = Object.keys(tex).filter(n => n.includes(filter));
const cols = 10;
const s = sheet(names.map(n => tex[n]), cols, scale, 6, [139, 139, 139, 255]); // vanilla inventory slot grey
writePNG(out, s.w, s.h, s.data, 1);

console.log(`${names.length} sprites -> ${out} (${s.w}x${s.h})`);
names.forEach((n, i) => { if (i % cols === 0) process.stdout.write(`\nrow ${i / cols | 0}: `); process.stdout.write(n + '  '); });
console.log('\n');
console.log(missing.length ? `MISSING: ${missing.join(', ')}` : 'all required names present');
console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'no authoring problems');
