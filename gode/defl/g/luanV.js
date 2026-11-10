/* gode/defl/g/luanV.js —— `?g=luanV` 生成器 Worker：Luanti valleys 的列式重写（vendor/luanti/，装配与适配见 lt/）。群系表 lt/biomes.tsv（声明式）。 */
import { serve } from '../../w/slicer.js';
import { adapter } from './lt/adapter.js';

const A = adapter('luanV');
export const meta = A.meta;
export const onkwarg = (a) => A.onkwarg(a);
export const gen = (a, out) => A.gen(a, out);
export const sample = (a) => A.sample(a);
export const col = (a) => A.col(a);
export const spawn = () => A.spawn();

serve(import.meta.url);
