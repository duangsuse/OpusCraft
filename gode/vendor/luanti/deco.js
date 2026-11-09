/* gode/vendor/luanti/deco.js —— Luanti 装饰（decoration）的独立重写：simple / schematic，沿 mapchunk 放置；参考：mg_decoration.cpp、mg_schematic.cpp。
   本模块只含算法与数据结构，不含任何装饰内容（装饰与 schematic 是声明式 json，见 defl/g/lt/）。
   与参考一致：每个 mapchunk 按注册顺序逐个装饰跑 placeDeco（块种子 + i，PCG 种子 = blockseed + i + 53）、sidelen 分格、noise / fill_ratio 决定数量、
   高度图（raw 地形块内最高可行走格）+ biomemap + place_on + spawn_by 判定、schematic 的居中 / 旋转 / 强制放置、仅放进空气。
   差异：schematic 里的「概率」参考用全局 myrand（不可复现），这里用位置哈希（可复现）；对拍用的 schematic 概率恒 255。
   不支持（加载时报错）：all_floors / all_ceilings / liquid_surface。 */
import { Pcg32 } from './pcg.js';
import { fractal2d, np } from './noise.js';

export const IGNORE = 0xffff, NONE_Y = -31007;

// 参考：Mapgen::getBlockSeed2（u32 回绕）
export function blockSeed2(x, y, z, seed) {
  let n = (Math.imul(1619, x) + Math.imul(31337, y) + Math.imul(52591, z) + Math.imul(1013, seed)) >>> 0;
  n = ((n >>> 13) ^ n) >>> 0;
  const m = (Math.imul(Math.imul(n, n), 60493) + 19990303) | 0;
  return (Math.imul(n, m) + 1376312589) >>> 0;
}
const rand255 = (x, y, z) => 1 + (blockSeed2(x, y, z, 0xc0de) % 255);   // 1…255，代替参考的全局 myrand_range(1, 255)

// ── schematic ──
export class Schematic {
  // cells：Uint16Array（节点 id，IGNORE = 不放），下标 = z·(sx·sy) + y·sx + x（参考的 mts 布局）；probs / force 可选，slice 每层概率可选
  constructor(size, cells, { probs = null, force = null, slice = null } = {}) { this.size = size; this.cells = cells; this.probs = probs; this.force = force; this.slice = slice; }
  // 声明（legend + layers）→ Schematic。idOf(name) 把节点名变成 id；'air' 必须是 0。
  static fromAscii(def, idOf) {
    const layers = def.layers, sy = layers.length, sz = layers[0].length, sx = layers[0][0].length;
    const cells = new Uint16Array(sx * sy * sz).fill(IGNORE), probs = new Uint8Array(sx * sy * sz).fill(255), force = new Uint8Array(sx * sy * sz);
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
      const ch = layers[y][z][x]; if (ch === '.' || ch === ' ') continue;
      const name = def.legend[ch]; if (name === undefined) throw new Error(`schematic：字符 ${ch} 不在 legend 里`);
      const i = z * sx * sy + y * sx + x;
      cells[i] = idOf(name);
      if (def.probs?.[ch] !== undefined) probs[i] = def.probs[ch];
      if (def.force?.includes(ch)) force[i] = 1;
    }
    return new Schematic([sx, sy, sz], cells, { probs, force, slice: def.slice ?? null });
  }
  // 参考：Schematic::blitToVManip。ctx：{ inArea(x,y,z), get(x,y,z), set(x,y,z,id,force) }；rot 0…3（0 / 90 / 180 / 270）
  blit(ctx, px, py, pz, rot, forcePlace) {
    const [SX, SY, SZ] = this.size, xs = 1, ys = SX, zs = SX * SY;
    let sx = SX, sz = SZ, i0, dx, dz;
    switch (rot) {
      case 1: i0 = sx - 1; dx = zs; dz = -xs; [sx, sz] = [sz, sx]; break;
      case 2: i0 = zs * (sz - 1) + sx - 1; dx = -xs; dz = -zs; break;
      case 3: i0 = zs * (sz - 1); dx = -zs; dz = xs; [sx, sz] = [sz, sx]; break;
      default: i0 = 0; dx = xs; dz = zs;
    }
    let ym = py;
    for (let y = 0; y < SY; y++, ym++) {
      if (this.slice && this.slice[y] !== 255 && this.slice[y] <= rand255(px, ym, pz)) continue;
      for (let z = 0; z < sz; z++) {
        let i = z * dz + y * ys + i0;
        for (let x = 0; x < sx; x++, i += dx) {
          const wx = px + x, wz = pz + z;
          if (!ctx.inArea(wx, ym, wz)) continue;
          const id = this.cells[i]; if (id === IGNORE) continue;
          const pr = this.probs ? this.probs[i] : 255, fn = this.force ? this.force[i] : 0;
          if (pr === 0) continue;
          if (!forcePlace && !fn && ctx.get(wx, ym, wz) !== 0) continue;
          if (pr !== 255 && pr <= rand255(wx, ym, wz)) continue;
          ctx.set(wx, ym, wz, id, forcePlace || fn);
        }
      }
    }
  }
}

// ── 装饰 ──
const FLAGS = { place_center_x: 1, place_center_y: 2, place_center_z: 4, force_placement: 8, liquid_surface: 16, all_floors: 32, all_ceilings: 64 };
const parseDecoFlags = (s) => { let m = 0; for (const f of String(s ?? '').split(',').map(t => t.trim()).filter(Boolean)) { if (!(f in FLAGS)) throw new Error('未知装饰 flag ' + f); m |= FLAGS[f]; } if (m & (16 | 32 | 64)) throw new Error('装饰 flag liquid_surface / all_floors / all_ceilings 未实现'); return m; };

/* d：声明 JSON；env：{ idOf(nodeName), biomeIndex(name), schematic(name) → Schematic }。
   noise 与 fill_ratio 二选一；biomes 空 = 任意；spawn_by / num_spawn_by / check_offset 同参考。 */
export function makeDeco(d, env) {
  const o = { name: d.name, type: d.type, flags: parseDecoFlags(d.flags), sidelen: d.sidelen ?? 8, ymin: d.y_min ?? -31000, ymax: d.y_max ?? 31000, offY: d.place_offset_y ?? 0,
    fill: d.fill_ratio ?? 0.0, noise: d.noise ? np({ lacunarity: 2, ...d.noise }) : null,
    placeOn: new Set((d.place_on ?? []).map(env.idOf)), biomes: new Set((d.biomes ?? []).map(env.biomeIndex)), spawnBy: new Set((d.spawn_by ?? []).map(env.idOf)),
    nspawn: d.num_spawn_by ?? -1, checkOff: d.check_offset ?? -1, rotation: d.rotation ?? '0' };
  if (d.type === 'schematic') o.schem = env.schematic(d.schematic);
  else if (d.type === 'simple') { o.decos = (Array.isArray(d.decoration) ? d.decoration : [d.decoration]).map(env.idOf); o.h = d.height ?? 1; o.hmax = d.height_max ?? 0; }
  else throw new Error('装饰 type 必须是 simple | schematic：' + d.name);
  if (o.spawnBy.size === 0) o.nspawn = -1;
  return o;
}

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [-1, -1], [1, -1]];
function canPlace(ctx, deco, x, y, z) {
  if (!deco.placeOn.has(ctx.get(x, y, z))) return false;
  if (deco.nspawn === -1) return true;
  let n = 0;
  for (const [dx, dz] of DIRS) if (ctx.inArea(x + dx, y + 1, z + dz) && deco.spawnBy.has(ctx.get(x + dx, y + 1, z + dz))) n++;
  if (deco.checkOff !== 0) for (const [dx, dz] of DIRS) if (ctx.inArea(x + dx, y + 1 + deco.checkOff, z + dz) && deco.spawnBy.has(ctx.get(x + dx, y + 1 + deco.checkOff, z + dz))) n++;
  return n >= deco.nspawn;
}

function generate(ctx, deco, ps, x, y, z) {
  if (!canPlace(ctx, deco, x, y, z)) return false;
  const force = !!(deco.flags & FLAGS.force_placement);
  if (deco.type === 'simple') {
    if (!deco.decos.length) return false;
    if (y + deco.offY + Math.max(deco.h, deco.hmax) > ctx.maxY) return false;
    if (y + 1 + deco.offY < ctx.minY) return false;
    const id = deco.decos[ps.range(0, deco.decos.length - 1)], h = deco.hmax > 0 ? ps.range(deco.h, deco.hmax) : deco.h;
    let yy = y + deco.offY;
    for (let i = 0; i < h; i++) { yy++; if (ctx.get(x, yy, z) !== 0 && !force) break; ctx.set(x, yy, z, id, force); }
    return true;
  }
  const S = deco.schem, [SX, SY, SZ] = S.size;
  if (deco.flags & FLAGS.place_center_y) y -= (SY - 1) >> 1; else y += deco.offY;
  if (y + SY - 1 > ctx.maxY || y < ctx.minY) return false;
  const rot = deco.rotation === 'random' ? ps.range(0, 3) : Math.max(0, ['0', '90', '180', '270'].indexOf(String(deco.rotation)));
  if (deco.flags & FLAGS.place_center_x) { if (rot === 0 || rot === 2) x -= (SX - 1) >> 1; else z -= (SX - 1) >> 1; }
  if (deco.flags & FLAGS.place_center_z) { if (rot === 0 || rot === 2) z -= (SZ - 1) >> 1; else x -= (SZ - 1) >> 1; }
  S.blit(ctx, x, y, z, rot, force);
  return true;
}

/* 参考：Decoration::placeDeco（装饰噪声用的 mapseed 在参考里恒为 0——没有任何地方给它赋值——所以装饰噪声只受 np.seed 影响，不随世界种子变）。ctx：{ nmin:[x,y,z], nmax, minY, maxY（vm 区域的 y 边界）, inArea, get, set, heightmap(x,z), biomeAt(x,z), mapseed }；ps 每个装饰新建（blockseed + 53）。 */
export function placeDeco(ctx, deco, blockseed) {
  const [nx, ny, nz] = ctx.nmin, [mx, my] = ctx.nmax;
  if (my < deco.ymin || deco.ymax < ny) return;
  const ps = new Pcg32((blockseed + 53) >>> 0), carea = mx - nx + 1;
  let side = deco.sidelen; if (carea % side !== 0) side = carea;
  const area = side * side;
  for (let z0 = 0; z0 < carea; z0 += side) for (let x0 = 0; x0 < carea; x0 += side) {
    const xmin = nx + x0, zmin = nz + z0, xmax = xmin + side - 1, zmax = zmin + side - 1;
    let cover = false;
    const nval = (deco.noise ? fractal2d(deco.noise, xmin + (side >> 1), zmin + (side >> 1), ctx.mapseed) : deco.fill) * (ctx.dens ?? 1);   // ctx.dens = knob 乘子（默认 1，与参考相同）
    let count = 0;
    if (nval >= 10) { cover = true; count = area; }
    else {
      const cf = Math.fround(area * nval);
      if (cf >= 1) count = Math.trunc(cf);
      else if (cf > 0 && ps.next() <= cf * 4294967295) count = 1;
    }
    let x = xmin - 1, z = zmin;
    for (let i = 0; i < count; i++) {
      if (!cover) { x = ps.range(xmin, xmax); z = ps.range(zmin, zmax); }
      else { x++; if (x === xmax + 1) { z++; x = xmin; } }
      const y = ctx.heightmap(x, z);
      if (y < deco.ymin || y > deco.ymax || y < ny || y > my) continue;
      if (deco.biomes.size && !deco.biomes.has(ctx.biomeAt(x, z))) continue;
      const placed = generate(ctx, deco, ps, x, y, z);
      ctx.trace?.(deco.name, x, z, y, placed);
    }
  }
}
