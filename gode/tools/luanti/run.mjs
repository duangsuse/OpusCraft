#!/usr/bin/env node
/* gode/tools/luanti/run.mjs —— 起 Luanti 参考服务器，把某个 mapgen 在某区域的真实输出导出成二进制，给 JS 移植对拍。
   用法：node tools/luanti/run.mjs --mg v7|valleys --seed 12345 [--region x0,z0,x1,z1] [--nodeco] [--y 0,255 = 原生 y 范围，默认 -64..191] [--out /tmp/gode-lt/<mg>-<seed>.bin]
   机制：临时目录 /tmp/gode-lt/ 下拼出游戏（ref-game + 群系表）、世界、配置；`luanti --server` 跑到导出完自行关服。需要本机装了 luanti。 */
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const a = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const mg = a('mg', 'v7'), seed = a('seed', '12345'), region = a('region', '-48,-48,47,47').split(',').map(Number), [y0, y1] = a('y', '-64,191').split(',').map(Number);
const T = '/tmp/gode-lt', out = a('out', `${T}/${mg}-${seed}.bin`), world = `${T}/world-${mg}-${seed}`;
fs.mkdirSync(T, { recursive: true });
fs.rmSync(`${T}/games`, { recursive: true, force: true }); fs.rmSync(world, { recursive: true, force: true });
fs.cpSync(path.join(HERE, 'ref-game'), `${T}/games/gode_ref`, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'defl/g/lt/biomes.tsv'), `${T}/games/gode_ref/mods/gode_ref/biomes.tsv`);
fs.mkdirSync(world, { recursive: true });
fs.writeFileSync(`${world}/world.mt`, 'gameid = gode_ref\nbackend = sqlite3\nplayer_backend = sqlite3\nauth_backend = sqlite3\nmod_storage_backend = sqlite3\nload_mod_gode_ref = true\n');
const deco = !process.argv.includes('--nodeco');
if (deco) {   // 装饰 + schematic → Lua（schematic 的 data 按参考的 mts 布局：x 最快，然后 y，然后 z）
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'defl/g/lt/decorations.json'), 'utf8')).decorations, S = JSON.parse(fs.readFileSync(path.join(ROOT, 'defl/g/lt/schematics.json'), 'utf8'));
  const lua = (v) => v === null || v === undefined ? 'nil' : typeof v === 'string' ? JSON.stringify(v) : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? '{' + v.map(lua).join(',') + '}' : '{' + Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}]=${lua(x)}`).join(',') + '}';
  const node = (n) => (n === 'air' ? 'air' : 'gode_ref:' + n);
  const out = D.map(d => {
    const o = { name: d.name, deco_type: d.type, place_on: d.place_on.map(node), sidelen: d.sidelen, biomes: d.biomes, y_min: d.y_min, y_max: d.y_max, flags: d.flags, rotation: d.rotation, place_offset_y: d.place_offset_y };
    if (d.noise) o.noise_params = { offset: d.noise.offset, scale: d.noise.scale, spread: { x: d.noise.spread, y: d.noise.spread, z: d.noise.spread }, seed: d.noise.seed, octaves: d.noise.octaves, persist: d.noise.persist, lacunarity: 2 }; else o.fill_ratio = d.fill_ratio;
    if (d.type === 'schematic') {
      const s = S[d.schematic], sy = s.layers.length, sz = s.layers[0].length, sx = s.layers[0][0].length, data = [];
      for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) { const ch = s.layers[y][z][x]; data.push(ch === '.' || ch === ' ' ? { name: 'ignore', prob: 255 } : { name: node(s.legend[ch]), prob: 255, param2: 0 }); }
      o.schematic = { size: { x: sx, y: sy, z: sz }, data };
    }
    return o;
  });
  fs.writeFileSync(`${T}/games/gode_ref/mods/gode_ref/decos.lua`, 'return ' + lua(out) + '\n');
}
const extra = a('conf', '');   // 额外 k=v，分号分隔（值里可以有逗号）
fs.writeFileSync(`${T}/${mg}.conf`, [
  `mg_name = ${mg}`, `fixed_map_seed = ${seed}`, 'water_level = 1', 'chunksize = 5',
  `mg_flags = caves,nodungeons,nolight,${deco ? '' : 'no'}decorations,biomes,noores`,   // 地形 + 群系 + 噪声洞 + 装饰；地牢 / 光照 / 矿关（--nodeco 连装饰也关）
  `mg${mg === 'v7' ? 'v7' : 'valleys'}_large_cave_num_max = 0`, `mg${mg === 'v7' ? 'v7' : 'valleys'}_large_cave_num_min = 0`,
  `gode_dump_region = ${region[0]},${region[1]},${region[2]},${region[3]},${y0},${y1}`, `gode_emerge_pad = ${deco ? 96 : 0}`,
  'liquid_update = 86400', 'liquid_loop_max = 0', 'max_block_generate_distance = 8', 'server_announce = false', 'enable_damage = false', ...extra.split(';').filter(Boolean)].join('\n') + '\n');
const r = spawnSync('luanti', ['--server', '--world', world, '--gameid', 'gode_ref', '--config', `${T}/${mg}.conf`, '--quiet', '--port', String(30000 + Math.floor(Math.random() * 9000))],
  { env: { ...process.env, MINETEST_GAME_PATH: `${T}/games`, LUANTI_GAME_PATH: `${T}/games` }, encoding: 'utf8', timeout: 180000 });
if (!fs.existsSync(`${world}/dump.bin`)) { console.error(r.stdout, r.stderr); process.exit(1); }
fs.copyFileSync(`${world}/dump.bin`, out); fs.copyFileSync(`${world}/dump.bin.cols`, out + '.cols');
console.log(`wrote ${out} (${fs.statSync(out).size} B) + ${out}.cols`);
