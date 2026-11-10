/**
 * gode/flow/graph.ts —— 把各模块的 mod 描述拼成两张 markdown 表：模块表、事件矩阵（谁发、多频繁、谁订阅）
 *   node gode/flow/graph.ts            打印两张表
 *   node gode/flow/graph.ts mermaid    打印 mermaid 流程图（模块为点，事件为边）
 *   node gode/flow/graph.ts tsv        打印 defl/mod.tsv（默认模组清单，核心模块不在表里）
 *   node gode/flow/graph.ts doc        打印 defl/doc.tsv 的初值（mod.<id> 行，运行时 Ref mod.<id>.doc 的初值）
 *   node gode/flow/graph.ts readme     打印 README 概览的「轴 × 层」矩阵与模块总表（子系统清单的唯一来源是各模块文件里的 mod 描述）
 *   node gode/flow/graph.ts readme --write   把上面两张表写回 gode/README.md 的 <!-- gen:mods --> … <!-- /gen:mods --> 之间
 * 只读 mod 描述（纯数据），不调用表里的函数。
 */
import { mods as host } from './host.ts'
import { mod as kernel } from './kernel.ts'
import { mod as pane } from './pane.ts'
import { mod as input } from './input.ts'
import { mod as feel } from './feel.ts'
import { mod as audio } from './audio.ts'
import { mod as fx } from './fx.ts'
import { mod as sim } from './sim.ts'
import { mod as weather } from './weather.ts'
import { mod as title } from './title.ts'
import { mod as hud } from './hud.ts'
import { mod as render } from './render.ts'
import { mod as hooks } from './hooks.ts'
import { mod as net } from './net.ts'
import { mod as mesh } from './mesh.ts'

declare const process: { argv: string[]; getBuiltinModule(n: string): any }
type D = { id: string; where: string; catalog: string; layer?: string; axis: string; ms: string; doc: string; off?: string; emit: Record<string, string>; sub: readonly string[]; depends: readonly string[]; tables: readonly string[]; c_: readonly string[]; save: readonly string[] }
const NEW = new Set(['input', 'feel', 'audio', 'fx', 'sim', 'weather', 'title', 'hud', 'hooks', 'net', 'mesh'])   // 11-09 划分的七个模块（输入拆出 feel）+ 11-10 的 hooks；其余是边界与框架
const all: D[] = [...Object.values(host), kernel, pane, render, hooks, net, mesh, input, feel, audio, fx, sim, weather, title, hud]

const ev = new Map<string, { rate: string; from: string; to: string[] }>()
for (const m of all) for (const [e, rate] of Object.entries(m.emit)) ev.set(e, { rate, from: m.id, to: [] })
for (const m of all) for (const e of m.sub) ev.get(e)?.to.push(m.id)

const b = (s: string) => NEW.has(s) ? `**${s}**` : s
const list = (a: readonly string[]) => a.length ? a.join(' ') : '—'

if (process.argv[2] === 'mermaid') {
  console.log('flowchart LR')
  const edges = new Map<string, string[]>()
  for (const [e, { from, to }] of ev) for (const t of to) { const k = `${from}-->${t}`; edges.set(k, [...(edges.get(k) ?? []), e]) }
  for (const [k, es] of edges) { const [f, t] = k.split('-->'); console.log(`  ${f} -->|${es.join(' ')}| ${t}`) }
} else if (process.argv[2] === 'tsv') {
  console.log('# id\tfile\twhere\tdepends\ton')
  for (const m of all) if (m.catalog === 'defl') console.log([m.id, `${m.id}.js`, m.where === 'main' || m.where === 'slicer' ? m.where : 'worker', m.depends.join(' '), 1].join('\t'))
} else if (process.argv[2] === 'readme') {
  const AX = [['play', '玩法'], ['look', '渲染与反馈'], ['ui', 'UI（主屏幕 · 触屏 · 面板 · 命令）']] as const
  const LY = [['kernel', '框架'], ['core', '引擎核心（不可停）'], ['defl', '默认模组（可停可换）'], ['render', '渲染器（可换 `?r=`）']] as const
  const cell = (ly: string, ax: string) => all.filter(m => (m.layer ?? 'defl') === ly && m.axis === ax).map(m => `${m.id}（${m.ms}）`).join('<br>') || '—'
  const out = [
    '| 层 ＼ 轴 | ' + AX.map(a => a[1]).join(' | ') + ' |', '|---|' + AX.map(() => '---|').join(''),
    ...LY.map(([ly, name]) => `| ${name} | ${AX.map(([ax]) => cell(ly, ax)).join(' | ')} |`),
    '', '| 模块 | 目录 | 层 | 轴 | 位置 | 里程碑 | 说明 |', '|---|---|---|---|---|---|---|',
    ...all.map(m => `| ${m.id} | ${m.catalog} | ${m.layer ?? 'defl'} | ${m.axis} | ${m.where} | ${m.ms} | ${m.doc.replace(/\|/g, '\\|')} |`),
    '', `**未排期**（s10 里没有）：${all.filter(m => m.ms === '未排期').map(m => m.id).join(' ')}`,
  ].join('\n')
  if (process.argv[3] !== '--write') console.log(out)
  else {
    const fs = process.getBuiltinModule('node:fs'), f = new URL('../README.md', import.meta.url), t: string = fs.readFileSync(f, 'utf8')
    const a = t.indexOf('<!-- gen:mods -->'), b = t.indexOf('<!-- /gen:mods -->')
    if (a < 0 || b < a) throw new Error('README.md 里没有 <!-- gen:mods --> … <!-- /gen:mods --> 标记')
    fs.writeFileSync(f, t.slice(0, a) + '<!-- gen:mods -->\n' + out + '\n' + t.slice(b))
    console.log('README.md 已更新')
  }
} else if (process.argv[2] === 'doc') {
  for (const m of all) console.log(`mod.${m.id}\t${m.doc}`)
} else {
  console.log('| 模块 | 位置 | 目录 | 发出 | 订阅 | depends | defl/ 表 | c_ | 存档键 |\n|---|---|---|---|---|---|---|---|---|')
  for (const m of all) console.log(`| ${b(m.id)} | ${m.where} | ${m.catalog} | ${list(Object.keys(m.emit))} | ${list(m.sub)} | ${list(m.depends)} | ${list(m.tables)} | ${list(m.c_.map(c => c.slice(1)))} | ${list(m.save)} |`)
  console.log('\n| 事件 | 频率 | 发出 | 订阅 |\n|---|---|---|---|')
  for (const [e, { rate, from, to }] of ev) console.log(`| \`${e}\` | ${rate} | ${b(from)} | ${to.length ? to.map(b).join(' ') : '（模组）'} |`)
}
