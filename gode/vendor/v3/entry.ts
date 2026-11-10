// gode/vendor/v3/entry.ts —— 打包入口（手写）。bun build 生成同目录 terrain.mjs；页面只 import terrain.mjs，不 import 本文件。
// 供体：goodPG（VoxelCraft v3）的 src/shared/world/terrain.ts，零改动；生成物见 tools/build-v3.mjs。
export { TerrainGenerator } from '../../../goodPG/src/shared/world/terrain';
export { BLOCKS } from '../../../goodPG/src/shared/blocks';
export { MIN_Y, MAX_Y, SEA_LEVEL } from '../../../goodPG/src/shared/constants';
export { BIOME_NAMES } from '../../../goodPG/src/shared/world/biomeIds';
