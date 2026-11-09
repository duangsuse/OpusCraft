/* gode/vendor/luanti/mapgen.js —— Luanti MapgenBasic 的列式重写：地形回调 → 群系顶 / 填充 / 水 / 河床 → 噪声交线洞（tunnels）→ 洞穴（caverns）→ 雪 / 尘。
   参考：mapgen.cpp generateBiomes / dustTopNodes、cavegen.cpp CavesNoiseIntersection / CavernsNoise；这里按 **整列**（y 从 ymax 到 ymin 一次扫完）而不是 80³ 区块，
   所以参考里「区块顶 / 底的过生成」造成的竖直接缝在这里不存在（对拍时竖直区块边界附近的格子允许不同）。随机游走洞 / 地牢 / 装饰 / 矿 不在本模块（依赖整块 + 区块种子）。
   节点 id 由调用者定：air = 0；ids.{stone, water, river} 必须给。 */
import { col3d } from './noise.js';

const contour = (v) => { v = Math.abs(v); return v >= 1 ? 0 : 1 - v; };

/* 一列：col = Uint16Array(ymax − ymin + 1)（下标 = y − ymin），terrain 已填好 stone / water / river / air。
   args：{ biomes: BiomeSet, ids, bhFor(raw, lo, top) → [heat, humid]（按块给，valleys 的海拔修正依赖块内最高石面）, fillerNoise（np_filler_depth 在本列的值）, waterLevel, ymin, ymax, seed, caves: {np1, np2, width} | null, solidGround: Uint8Array(id → 可被洞穴挖掉) , cavern: {np, limit, taper, threshold}|null }
   返回 { biome（第一个石面处的群系下标，没有石面则取水面的）, near } */
// 参考的 mapchunk = 5 个 mapblock = 80 格，原点偏移 −32：竖直方向的块从 y = −32 + 80k 起。
const SEG = 80, SEG_OFF = 32;
const segTop = (y) => Math.floor((y + SEG_OFF) / SEG) * SEG - SEG_OFF + SEG - 1;      // y 所在块的最高格

/* 一列：col = Uint16Array(ymax − ymin + 1)（下标 = y − ymin），terrain 已填好 stone / water / river / air。
   args：{ biomes: BiomeSet, ids, bhFor(raw, lo, top) → [heat, humid]（按块给，valleys 的海拔修正依赖块内最高石面）, fillerNoise（np_filler_depth 在本列的值）, waterLevel, ymin, ymax, seed, caves: {np1, np2, width} | null, solidGround: Uint8Array(id → 可被洞穴挖掉) , cavern: {np, limit, taper, threshold}|null }
   竖直方向按参考的 80 格块分段处理（每块内状态重置，块顶之上的节点取原始地形的 空气 / 水 / 其它），所以「地表正好落在块底」时下面的填充层被截断——这是参考的既有行为，保留。
   返回 { biome（最上面一个有石面的块里，第一个石面处的群系下标；没有石面取水面的）} */
export function finishColumn(col, x, z, a) {
  const { biomes, ids, ymin, ymax } = a, stone = ids.stone, water = ids.water, river = ids.river;
  const AIR = 0, U16 = 0xffff, wl = a.waterLevel, raw = col.slice();
  let topBiome = 0; const segs = [];
  for (let top = Math.min(ymax, segTop(ymax)); top >= ymin; top = segTop(top) - SEG) {
    const lo = Math.max(ymin, -SEG_OFF + Math.floor((top + SEG_OFF) / SEG) * SEG);
    const hm = a.bhFor(raw, lo, top), seg = bioPass(col, raw, x, z, a, top, lo, hm);
    let rawTop = NONE_Y; for (let y = top; y >= lo; y--) if (raw[y - ymin] === stone) { rawTop = y; break; }   // 块内 raw 地形最高的可行走格（参考的 heightmap，生成于群系 / 洞之前）
    segs.push({ k: Math.floor((top + SEG_OFF) / SEG), lo, top, biome: seg, rawTop });
    if (!topBiome) topBiome = seg;
    if (a.caves) tunnels(col, x, z, a, top, lo, seg, hm);
  }
  // ── 洞穴（CavernsNoise）──
  const cn = a.cavern;
  if (cn) for (let y = ymax; y >= ymin; y--) {
    const amp = Math.min((cn.limit - y) / cn.taper, 1);
    if (amp <= 0) continue;   // |noise|·amp ≤ 0 不可能超过阈值
    const v = Math.abs((a._cv ??= col3d(cn.np, x, z, a.seed)).at(y)) * amp;
    if (v > cn.threshold && a.solidGround[col[y - ymin]]) col[y - ymin] = AIR;
  }
  return { biome: topBiome, segs };
}

export const NONE_Y = -31007;

/* ── dustTopNodes（装饰之后）：列最高的非空气格若是可行走的实心方块，上面盖一层尘。
   参考：列顶（块顶 + 16）必须是空气才落尘；尘节点用「该格所在块」的群系（segs 里 k 对应的 biome）。walkable：id → 0 / 1。 */
export function dustColumn(col, a, segs) {
  const { biomes, ymin, ymax, waterLevel: wl } = a;
  if (ymax < wl || col[ymax - ymin] !== 0) return;
  let y = ymax - 1;
  while (y >= ymin && col[y - ymin] === 0) y--;
  if (y < ymin || y >= ymax) return;
  const seg = segs.find(s => y >= s.lo && y <= s.top) ?? segs[0], b = biomes.list[seg.biome];
  if (b.dust && a.walkable[col[y - ymin]] && col[y - ymin] !== b.dust) col[y + 1 - ymin] = b.dust;
}

// ── generateBiomes：一个块（[lo, top]）内的一列；返回该块的 biomemap 值 ──
function bioPass(col, raw, x, z, a, top, lo, hm) {
  const { biomes, ids, ymin, ymax } = a, stone = ids.stone, water = ids.water, river = ids.river, AIR = 0, U16 = 0xffff, wl = a.waterLevel;
  const above = top + 1 <= ymax ? raw[top + 1 - ymin] : raw[ymax - ymin] === stone ? stone : AIR;   // 列顶被裁时，顶格是石头就当山还在往上长
  let biome = null, biomeY = biomes.nextTransitionY(top);
  let airAbove = above === AIR, riverAbove = above === river, waterAbove = above === water || riverAbove;
  let nplaced = airAbove || waterAbove ? 0 : U16;
  let colBiome = 0, waterBiome = 0, dtop = 0, baseFiller = 0, dwtop = 0, driver = 0;
  for (let y = top; y >= lo; y--) {
    const i = y - ymin, c = col[i], outdated = !biome || y <= biomeY;
    const stoneSurf = c === stone && (airAbove || waterAbove || outdated);
    const waterSurf = (c === water || c === river) && (airAbove || outdated);
    if (stoneSurf || waterSurf) {
      if (outdated) { biome = biomes.at(hm[0], hm[1], y); biomeY = biomes.nextTransitionY(y); }
      if (colBiome === 0 && stoneSurf) colBiome = biome.index;
      if (waterBiome === 0 && waterSurf) waterBiome = biome.index;
      dtop = biome.dtop; baseFiller = Math.trunc(Math.max(dtop + biome.dfiller + a.fillerNoise, 0)); dwtop = biome.dwtop; driver = biome.driverbed;   // 参考：浮点 → u16 截断
    }
    if (c === stone) {
      const below = y > ymin ? raw[i - 1] : stone;
      if (below === AIR || below === water || below === river) nplaced = U16;
      if (riverAbove) { if (nplaced < driver) { col[i] = biome.riverbed; nplaced++; } else { nplaced = U16; riverAbove = false; } }
      else if (nplaced < dtop) { col[i] = biome.top; nplaced++; }
      else if (nplaced < baseFiller) { col[i] = biome.filler; nplaced++; }
      else { col[i] = biome.stone; nplaced = U16; }
      airAbove = false; waterAbove = false;
    } else if (c === water) {
      col[i] = y > wl - dwtop ? biome.wtop : biome.water; nplaced = 0; airAbove = false; waterAbove = true;
    } else if (c === river) {
      col[i] = biome.river; nplaced = 0; airAbove = false; waterAbove = true; riverAbove = true;
    } else if (c === AIR) { nplaced = 0; airAbove = true; waterAbove = false; }
    else { nplaced = U16; airAbove = false; waterAbove = false; }
  }
  return colBiome || waterBiome;
}

// ── 噪声交线洞（CavesNoiseIntersection）：块 [lo, top] 内一列；segBiome = 该块的 biomemap 值 ──
function tunnels(col, x, z, a, top, lo, segBiome, hm) {
  const { biomes, ymin } = a, cv = a.caves, AIR = 0;
  let open = false, underRiver = false, underTunnel = false, tfAbove = false, placed = 0, bY = biomes.nextTransitionY(top);
  let b = biomes.list[segBiome], dT = b.dtop, bF = dT + b.dfiller, dR = b.driverbed;
  for (let y = top; y >= lo; y--) {
    const i = y - ymin;
    if (y <= bY) { b = biomes.at(hm[0], hm[1], y); bY = biomes.nextTransitionY(y); }
    const c = col[i];
    if (c === AIR || c === b.wtop || c === b.water) { open = true; tfAbove = false; continue; }
    if (c === b.river) { open = true; underRiver = true; tfAbove = false; continue; }
    const d1 = contour((a._c1 ??= col3d(cv.np1, x, z, a.seed)).at(y)), d2 = d1 ? contour((a._c2 ??= col3d(cv.np2, x, z, a.seed)).at(y)) : 0;
    if (d1 * d2 > cv.width && a.solidGround[c]) {
      col[i] = AIR; underTunnel = true;
      if (tfAbove && i + 1 < col.length) col[i + 1] = b.stone;
      tfAbove = false;
    } else if (open && underTunnel && (c === b.stone || c === b.filler)) {
      if (underRiver) {
        if (placed < dR) { col[i] = b.riverbed; tfAbove = true; placed++; } else { open = false; underRiver = false; underTunnel = false; }
      } else if (placed < dT) { col[i] = b.top; tfAbove = true; placed++; }
      else if (placed < bF) { col[i] = b.filler; tfAbove = true; placed++; }
      else { open = false; underTunnel = false; }
    } else { if (c === b.top || c === b.filler) tfAbove = true; open = false; }
  }
}
