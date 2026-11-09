/* gode/defl/g/lt/core.js —— Luanti 系生成器（v7 / valleys）的装配：群系表 + 地形 + 列式收尾 + 装饰 + 尘。纯函数式，Worker 适配器（./adapter.js）与对拍工具（tools/luanti/cmp.mjs）共用。
   算法在 vendor/luanti/（独立重写，Luanti 源码只作参考；许可证边界见 vendor/luanti/NOTICE.md），群系 / 装饰 / schematic 都是声明式数据（./biomes.tsv ./decorations.json ./schematics.json）。
   装饰按参考的 mapchunk（80³，原点偏移 −32）放：请求一个 16×16 列时，把「vm 区域（块 ± 16）覆盖到这些列」的相邻块的装饰结果（带缓存）写进来，所以树冠跨块不需要 outside。 */
import { parseTsv, BiomeSet, heatHumid } from '../../../vendor/luanti/biome.js';
import { finishColumn, dustColumn } from '../../../vendor/luanti/mapgen.js';
import { makeV7, V7_KNOBS } from '../../../vendor/luanti/v7.js';
import { makeValleys, VALLEYS_KNOBS } from '../../../vendor/luanti/valleys.js';
import { Schematic, makeDeco, placeDeco, blockSeed2, NONE_Y } from '../../../vendor/luanti/deco.js';
import { resolveParams } from '../../../w/params.js';

export const DY = 64;               // 规范 y = 原生 y + DY（同 liq）
export const MAKERS = { v7: makeV7, valleys: makeValleys };
// 装饰相关 knobs（两个 mapgen 共用）：树密度乘子（同名同义于其它生成器）、先生成的相邻块的可见性递推层数（越大越接近参考、越慢）
const DECO_KNOBS = [
  { k: 'tree.dens', key: 'treeDens', def: 1, min: 0, max: 4, note: '装饰（树）密度乘子（乘 noise / fill_ratio），0 = 无树' },
  { k: 'deco.depth', key: 'decoDepth', def: 2, min: 0, max: 3, note: '相邻块树冠可见性的递推层数（0 = 各块独立；2 与参考 ≈ 99.96% 一致；越大越慢）' },
];
export const KNOBS = { v7: [...V7_KNOBS, ...DECO_KNOBS], valleys: [...VALLEYS_KNOBS, ...DECO_KNOBS] };

// 种子：十进制 / 0x 十六进制整数按 u64 取低 32 位（s32），其余字符串走 MurmurHash64A（种子 0x1337，UTF-8 字节），与参考的 read_seed 一致
const M = 0xc6a4a7935bd1e995n, U64 = (1n << 64n) - 1n;
function murmur64(bytes, seed) {
  let h = (BigInt(seed) ^ (BigInt(bytes.length) * M)) & U64, i = 0;
  for (; i + 8 <= bytes.length; i += 8) {
    let k = 0n; for (let j = 7; j >= 0; j--) k = (k << 8n) | BigInt(bytes[i + j]);
    k = (k * M) & U64; k ^= k >> 47n; k = (k * M) & U64; h ^= k; h = (h * M) & U64;
  }
  const r = bytes.length & 7;
  if (r) { for (let j = r - 1; j >= 0; j--) h ^= BigInt(bytes[i + j]) << BigInt(8 * j); h = (h * M) & U64; }
  h ^= h >> 47n; h = (h * M) & U64; h ^= h >> 47n;
  return h;
}
export function seedOf(seed) {
  const s = String(seed ?? '').trim();
  const u64 = /^-?\d+$/.test(s) ? BigInt.asUintN(64, BigInt(s)) : /^0x[0-9a-f]+$/i.test(s) ? BigInt.asUintN(64, BigInt(s)) : murmur64(new TextEncoder().encode(s), 0x1337);
  return Number(BigInt.asIntN(32, u64));
}

const CH = 80, OFF = 32, MARGIN = 16;     // mapchunk 边长 / 原点偏移 / vm 区域的过生成边（一个 mapblock）
const kOf = (v) => Math.floor((v + OFF) / CH);
const ck = (x, z) => x * 4194304 + z;
// 字典序 (kz, ky, kx)：a 是否在 b 之后生成
const later = (az, ay, ax, bz, by, bx) => az !== bz ? az > bz : ay !== by ? ay > by : ax > bx;

/* decoText：{ decorations: json 文本, schematics: json 文本 }；缺省 = 不放装饰（对拍旧路径 / 单测用）。 */
export async function createGen(mg, seed, { biomesText, decoText = null, kw = {}, ymin = -DY, ymax = 255 - DY, trace = null, bounds = null } = {}) {   // bounds：{x0,z0,x1,z1,y0,y1} = 参考服务器 emerge 过的范围（只有对拍用；缺省 = 世界无限）
  const make = MAKERS[mg]; if (!make) throw new Error('lt: 未知 mapgen ' + mg + '（' + Object.keys(MAKERS).join(' ') + '）');
  const rows = parseTsv(biomesText), sd = seedOf(seed);
  const names = ['air', 'stone', 'water', 'river_water'], idOf = (n) => { if (!n) return 0; let i = names.indexOf(n); if (i < 0) { i = names.length; names.push(n); } return i; };
  const ids = { stone: 1, water: 2, river: 3 };
  const biomes = new BiomeSet(rows, idOf, ids);
  const eff = resolveParams(KNOBS[mg], kw), k = {}; for (const p of KNOBS[mg]) k[p.key] = eff[p.k];   // 校验（未知键抛错）+ 补默认
  const terrain = make(sd, { k }), preDepth = k.decoDepth, treeDens = k.treeDens;   // preDepth：先生成的块的可见性只递推有限层（否则整个世界连成一条依赖链）
  const wl = terrain.P.waterLevel;

  // 装饰：schematic 先建（会往 names 里加节点名），再建 decos
  const schems = {}, decos = [];
  if (decoText) {
    const S = JSON.parse(decoText.schematics), D = JSON.parse(decoText.decorations).decorations;
    for (const n in S) if (n !== '#') schems[n] = Schematic.fromAscii(S[n], idOf);
    const env = { idOf, biomeIndex: (n) => { const b = biomes.list.find(b => b.name === n); if (!b) throw new Error('装饰引用了未知群系 ' + n); return b.index; },
      schematic: (n) => { if (!schems[n]) throw new Error('未知 schematic ' + n); return schems[n]; } };
    for (const d of D) decos.push(makeDeco(d, env));
  }
  const nn = names.length + 8;
  const solid = new Uint8Array(Math.max(256, nn)), walkable = new Uint8Array(Math.max(256, nn));
  names.forEach((n, i) => { const nat = i && !/^(water|river_water|snow)$/.test(n); walkable[i] = nat ? 1 : 0; solid[i] = nat && !/_(log|leaves)$/.test(n) ? 1 : 0; });   // 洞穴只挖「地面内容」，树不算

  const hh = [0, 0], colOf = (x, z) => heatHumid(sd, x, z, hh);
  const baseCache = new Map();           // (x,z) → { col（装饰与尘之前）, segs, biome }
  const chunkCache = new Map();          // 'kx,ky,kz' → Map((x,z) → [[y, id, force], …])
  const args = (bhFor, bh, t, y0, y1) => ({ biomes, ids, bhFor, fillerNoise: 0, waterLevel: wl, ymin: y0, ymax: y1, seed: sd, caves: terrain.cave, solidGround: solid, cavern: terrain.cavern });

  // 一列（装饰与尘之前）；col 下标 = y − y0
  function column(x, z, col, y0 = ymin, y1 = ymax) {
    const bh = colOf(x, z), t = terrain.fill(x, z, col, y0, y1, ids, bh), h0 = [bh[0], bh[1]];
    const a = args(t.adjust ? (raw, lo, hi) => t.adjust(raw, lo, hi) : () => h0, bh, t, y0, y1);
    a.fillerNoise = terrain.fillerNoise(x, z);
    const r = finishColumn(col, x, z, a);
    return { biome: r.biome, segs: r.segs, surface: t.surface, top: t.top };
  }
  function baseCol(x, z) {
    const key = ck(x, z); let c = baseCache.get(key);
    if (!c) {
      if (baseCache.size > 140000) baseCache.clear();
      const col = new Uint16Array(ymax - ymin + 1), r = column(x, z, col); c = { col, segs: r.segs, biome: r.biome }; baseCache.set(key, c);
    }
    return c;
  }

  /* 一个 mapchunk 的装饰：按注册顺序逐个 placeDeco，返回按列索引的写入表。
     生成顺序按参考的 emerge_area（z 最外、y、x 最内）：(kz, ky, kx) 字典序。先生成的相邻块（vm 区域重叠）的树冠对后生成的块**可见**：
     它们的树叶 / 树干让高度图抬高（叶子可行走）、让 place_on 判定失败，所以后一个块在树冠下不再种树——这会改变后一个块的 RNG 序列，不模拟就对不上。
     （前驱只递推 deco.depth 层；没模拟的：先到的树冠写进「还没生成的块」时会顶替地形，以及树冠下的群系 / 洞穴处理。） */
  const exists = (kx, ky, kz) => !bounds || (kx * CH - OFF + CH - 1 >= bounds.x0 && kx * CH - OFF <= bounds.x1 && kz * CH - OFF + CH - 1 >= bounds.z0 && kz * CH - OFF <= bounds.z1 && ky * CH - OFF + CH - 1 >= bounds.y0 && ky * CH - OFF <= bounds.y1);
  function chunkDeco(kx, ky, kz, depth = preDepth) {
    const key = kx + ',' + ky + ',' + kz + '|' + depth; let res = chunkCache.get(key); if (res) return res;
    if (chunkCache.size > 2400) chunkCache.clear();
    res = new Map();
    const pres = [];
    if (depth > 0) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dz > 0 || (dz === 0 && (dy > 0 || (dy === 0 && dx >= 0)))) continue;     // 只要字典序更小的
      if (bounds && !exists(kx + dx, ky + dy, kz + dz)) continue;                  // 参考服务器没生成过的块不存在
      pres.push([kz + dz, ky + dy, kx + dx]);
    }
    pres.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const preRes = pres.map(([z, y, x]) => chunkDeco(x, y, z, depth - 1));
    const nmin = [kx * CH - OFF, ky * CH - OFF, kz * CH - OFF], nmax = [nmin[0] + CH - 1, nmin[1] + CH - 1, nmin[2] + CH - 1];
    const over = new Map(), ok = (x, y, z) => ((x * 4194304 + z) * 1024 + (y + 512));
    const preAt = (x, y, z) => { const c = ck(x, z); for (const r of preRes) { const l = r.get(c); if (l) for (const w of l) if (w[0] === y) return w[1]; } return undefined; };
    const ctx = {
      nmin, nmax, mapseed: 0, dens: treeDens, minY: nmin[1] - MARGIN, maxY: nmax[1] + MARGIN,
      inArea: (x, y, z) => x >= nmin[0] - MARGIN && x <= nmax[0] + MARGIN && z >= nmin[2] - MARGIN && z <= nmax[2] + MARGIN && y >= nmin[1] - MARGIN && y <= nmax[1] + MARGIN,
      get(x, y, z) {
        const v = over.get(ok(x, y, z)); if (v !== undefined) return v;
        const p = preAt(x, y, z); if (p !== undefined) return p;
        // 区域内属于「还没生成的块」的格子（vm 里是 ignore）：可以写，写了会顶替之后的地形
        if (later(kOf(z), kOf(y), kOf(x), kz, ky, kx)) return 0;
        if (y > ymax) return 0; if (y < ymin) return 1;
        return baseCol(x, z).col[y - ymin];
      },
      set(x, y, z, id, force) {
        over.set(ok(x, y, z), id);
        if (y < ymin || y > ymax) return;
        const c = ck(x, z); let l = res.get(c); if (!l) res.set(c, l = []);
        l.push([y, id, force ? 1 : 0]);
      },
      trace: trace && ((...a) => trace(kx, ky, kz, ...a)),
      heightmap(x, z) {
        const s = baseCol(x, z).segs.find(s => s.k === ky); let h = s ? s.rawTop : NONE_Y;
        const c = ck(x, z);
        for (const r of preRes) { const l = r.get(c); if (l) for (const [y, id] of l) if (walkable[id] && y >= nmin[1] && y <= nmax[1] && y > h) h = y; }
        return h;
      },
      biomeAt(x, z) { const s = baseCol(x, z).segs.find(s => s.k === ky); return s ? s.biome : 0; },
    };
    const bs = blockSeed2(nmin[0] - MARGIN, nmin[1] - MARGIN, nmin[2] - MARGIN, sd);
    decos.forEach((d, i) => placeDeco(ctx, d, (bs + i) >>> 0));
    chunkCache.set(key, res);
    return res;
  }

  // 最终一列：地形 + 群系 + 洞 + 相邻块的装饰 + 尘
  function finalColumn(x, z, out = new Uint16Array(ymax - ymin + 1), depth = preDepth) {
    const b = baseCol(x, z); out.set(b.col);
    if (decos.length) {
      const c = ck(x, z);
      for (let kz = kOf(z - MARGIN); kz <= kOf(z + MARGIN); kz++) for (let ky = kOf(ymin - MARGIN); ky <= kOf(ymax + MARGIN); ky++) for (let kx = kOf(x - MARGIN); kx <= kOf(x + MARGIN); kx++) {
          const w = chunkDeco(kx, ky, kz, depth).get(c); if (!w) continue;
          for (const [y, id, force] of w) { const i = y - ymin; if (force || out[i] === 0 || later(kOf(z), kOf(y), kOf(x), kz, ky, kx)) out[i] = id; }
        }
    }
    dustColumn(out, { biomes, ymin, ymax, waterLevel: wl, walkable }, b.segs);
    return out;
  }

  return {
    names, ids, biomes, terrain, seed: sd, waterLevel: wl, decos, schems, ymin, ymax, walkable,
    heatHumid: (x, z) => heatHumid(sd, x, z, [0, 0]),
    biomeAt: (x, z, y) => { const t = heatHumid(sd, x, z, [0, 0]); return biomes.at(t[0], t[1], y).name; },
    column, finalColumn, baseCol,
    clear() { baseCache.clear(); chunkCache.clear(); },
  };
}
