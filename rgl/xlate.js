// 宿主 → goodGL 的转换层（layout.md §2 的 GLID / padded）。宿主差异只放在表里，别处不写 if (host === …)。
import { SH } from '../vendor/gl/shared.js';

// 宿主 A（VoxelCraft.html，B.* 26 个）→ goodGL 方块名。ids 按 B 的键名查，不写数字。
//   ⚠ TNT / GOLD_BLOCK：goodGL 没有（render.md §3 的 ADD 行：要给 SH 追加方块定义和贴图，属于供体补丁，R3 先不做）。
//   暂代：TNT → bricks（红砖）、GOLD_BLOCK → yellow_terracotta（黄色），画面上能区分即可；cls 是以后阴影分类用的（render.md §4.2）
export const GLID_A = {
  AIR: 'air', GRASS: 'grass_block', DIRT: 'dirt', STONE: 'stone', COBBLE: 'cobblestone', LOG: 'oak_log', LEAVES: 'oak_leaves', PLANKS: 'oak_planks',
  SAND: 'sand', WATER: 'water', COAL_ORE: 'coal_ore', IRON_ORE: 'iron_ore', GOLD_ORE: 'gold_ore', DIAMOND_ORE: 'diamond_ore', BEDROCK: 'bedrock',
  GLASS: 'glass', TABLE: 'crafting_table', FURNACE: 'furnace', TORCH: 'torch', TALL_GRASS: 'short_grass', POPPY: 'poppy', DANDELION: 'dandelion',
  SNOW: 'snow_block', STONE_BRICKS: 'stone_bricks', TNT: 'bricks' /* 暂代 */, GOLD_BLOCK: 'yellow_terracotta' /* 暂代 */,
};

/** 宿主方块 id → goodGL id 的 256 项查找表。B = 宿主的 { 名字: id }；表里没有的 id 一律当石头（可见、不崩） */
export function idLUT(B, table = GLID_A) {
  const lut = new Uint8Array(256).fill(SH.BID.stone);
  for (const [k, id] of Object.entries(B)) {
    const name = table[k]; if (name == null) continue;
    const g = SH.BID[name]; if (g == null) throw new Error('GLID: goodGL 没有方块 ' + name);
    lut[id] = g;
  }
  return lut;
}

// 宿主区块布局：blocks[(lx*16+lz)*H + y]，sky / blk 各一个 0..15 的数组；goodGL padded：18³，p = (y+1)*324 + (z+1)*18 + (x+1)
// 区块缺失（邻块还没建）按 goodGL 的做法：石头 + 无光，把朝向它的面挡掉。y < 0 基岩，y ≥ H 空气 + 满天空光。
export function padded(source, lut, H, cx, cz, s) {
  const pb = new Uint8Array(5832), pm = new Uint8Array(5832), pl = new Uint8Array(5832);
  const y0 = s * 16, cs = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(source.getChunk(cx + dx, cz + dz));
  const bedrock = SH.BID.bedrock;
  for (let z = -1; z <= 16; z++) {
    const czi = z < 0 ? 0 : z > 15 ? 2 : 1, lz = z & 15;
    for (let x = -1; x <= 16; x++) {
      const cxi = x < 0 ? 0 : x > 15 ? 2 : 1, lx = x & 15, ch = cs[czi * 3 + cxi];
      let p = (z + 1) * 18 + (x + 1);
      if (!ch) { for (let y = -1; y <= 16; y++, p += 324) { pb[p] = 1; pl[p] = 0; } continue; }
      const col = (lx * 16 + lz) * H, B = ch.blocks, S = ch.sky, K = ch.blk;
      for (let y = -1; y <= 16; y++, p += 324) {
        const wy = y0 + y;
        if (wy < 0) { pb[p] = bedrock; pl[p] = 0; continue; }
        if (wy >= H) { pb[p] = 0; pl[p] = 0xF0; continue; }
        pb[p] = lut[B[col + wy]]; pl[p] = (S[col + wy] << 4) | K[col + wy];
      }
    }
  }
  return { pb, pm, pl };
}

/** 段 s 里有没有方块（空段不用网格化） */
export function sectionHasBlocks(blocks, H, s) {
  const y0 = s * 16, y1 = Math.min(H, y0 + 16);
  for (let c = 0; c < 256; c++) { const o = c * H; for (let y = y0; y < y1; y++) if (blocks[o + y]) return true; }
  return false;
}
