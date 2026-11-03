// 方块分类（goodGL id 空间；render.md §4.2）。网格器、阴影、水、之后的实体合成都按这里的类别走，不再各处写 id 表。
//   不透明整块 / 树叶 / 植物（草、花）/ 镂空 / 半透明 / 液体。
//   阴影的规则（bench.md §7）：树叶进软阴影图；植物进锐阴影图；草不接收锐阴影，花接收（含自己的）。
import { SH } from '../vendor/gl/shared.js';

const { RT, RT_CUBE, RT_CROSS, RT_CROP, RT_LIQUID, MAT, OCC, LEAVES, BID } = SH;
// 草类：矮、密、一片一片的，自遮挡会把整片草压黑；其余植物（花、树苗、蘑菇、甘蔗…）是单株，自遮挡才好看
const GRASS = ['short_grass', 'fern', 'dead_bush', 'wheat'].map(k => BID[k]).filter(id => id != null);
const GRASS_SET = new Set(GRASS);

export const isLiquid = id => RT[id] === RT_LIQUID;
export const isLeaf = id => !!LEAVES[id];
export const isPlant = id => RT[id] === RT_CROSS || RT[id] === RT_CROP;
export const isGrass = id => GRASS_SET.has(id);
export const isFlower = id => isPlant(id) && !isGrass(id);
export const isCutout = id => id !== 0 && MAT[id] === 1;
export const isTranslucent = id => MAT[id] >= 2 && !isLiquid(id);
export const isOpaqueCube = id => RT[id] === RT_CUBE && !!OCC[id] && MAT[id] === 0;

// 阴影类别：'soft' 进软阴影图 / 'sharp' 进锐阴影图 / null 不投影（液体、半透明）
export const shadowClass = id => id === 0 || isLiquid(id) || isTranslucent(id) ? null : isPlant(id) ? 'sharp' : 'soft';

// 顶点 flags 的额外位（meshSection 的 CLS 参数）：8192 = 不接收锐阴影（草）；16384 = 花
export const NO_SHARP = 8192, FLOWER = 16384;   // FLOWER：着色器里花的高度明暗（体积感）
export function flagTable() {
  const t = new Uint16Array(256);
  for (let id = 1; id < 256; id++) { if (isGrass(id)) t[id] |= NO_SHARP; else if (isFlower(id)) t[id] |= FLOWER; }
  // 额外位不得与供体 FLAGS 的位重叠（256 = 岩浆 UV 滚动、512 / 1024 / 2048 / 4096 在着色器里另有用途）；曾经因常量写错让花贴图随时间上飘
  for (let id = 0; id < 256; id++) if (t[id] & ~(NO_SHARP | FLOWER) || (t[id] & SH.FLAGS[id])) throw new Error('blockclass: flags 位冲突 id=' + id);
  if ((NO_SHARP & 8191) || (FLOWER & 16383) || NO_SHARP === FLOWER) throw new Error('blockclass: NO_SHARP / FLOWER 必须是 8192 / 16384');
  return t;
}
