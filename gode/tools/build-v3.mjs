#!/usr/bin/env node
/**
 * build-v3 —— 生成 gode/vendor/v3/terrain.mjs（goodPG v3 生成器的自包含 ESM 包）。
 *
 *   node gode/tools/build-v3.mjs           重新生成
 *   node gode/tools/build-v3.mjs --check   只比对（与已提交的生成物不一致时退出码 1）
 *
 * 为什么用 bun：本机 goodPG/node_modules 的 esbuild 二进制作业时会 SIGSEGV（node 26 / CachyOS）；
 * bun build 18 ms 出同样的包（96 模块，≈0.67 MB）。生成物是 vendored 代码，不手改。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GODE = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(GODE, 'vendor/v3/entry.ts');
const OUT = join(GODE, 'vendor/v3/terrain.mjs');
const TMP = '/tmp/gode-v3-terrain.mjs';

execFileSync('bun', ['build', ENTRY, '--target=browser', '--format=esm', '--outfile', TMP], { stdio: 'inherit' });
const body = readFileSync(TMP, 'utf8');
const sha = createHash('sha256').update(body).digest('hex').slice(0, 16);
const head = `/* gode/vendor/v3/terrain.mjs —— 生成物，勿手改（goodPG v3 生成器，96 模块打包）。
   重新生成：node gode/tools/build-v3.mjs   来源：goodPG/src/shared/world/terrain.ts + blocks/ + constants.ts
   包 sha256:${sha}（只对打包产物；对应供体标签不在包内） */
`;
const want = head + body;
if (process.argv.includes('--check')) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== want) { console.error('vendor/v3/terrain.mjs 与供体不一致，跑 node gode/tools/build-v3.mjs'); process.exit(1); }
  console.log('ok', sha);
} else {
  writeFileSync(OUT, want);
  console.log(OUT, (want.length / 1048576).toFixed(2) + ' MB', sha);
}
