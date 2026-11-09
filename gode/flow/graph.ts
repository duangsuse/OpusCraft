/**
 * gode/flow/graph.ts —— 把各模块的 mod 描述拼成两张 markdown 表：模块表、事件矩阵（谁发、多频繁、谁订阅）
 *   node gode/flow/graph.ts            打印两张表
 *   node gode/flow/graph.ts mermaid    打印 mermaid 流程图（模块为点，事件为边）
 *   node gode/flow/graph.ts tsv        打印 defl/mod.tsv（默认模组清单，核心模块不在表里）
 *   node gode/flow/graph.ts doc        打印 defl/doc.tsv 的初值（mod.<id> 行，运行时 Ref mod.<id>.doc 的初值）
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

declare const process: { argv: string[] }
type D = { id: string; where: string; doc: string; core?: boolean; off?: string; emit: Record<string, string>; sub: readonly string[]; depends: readonly string[]; tables: readonly string[]; c_: readonly string[]; save: readonly string[] }
const NEW = new Set(['input', 'feel', 'audio', 'fx', 'sim', 'weather', 'title', 'hud'])   // 11-09 划分的七个模块（输入拆出 feel）；其余是边界与框架
const all: D[] = [...Object.values(host), kernel, pane, render, input, feel, audio, fx, sim, weather, title, hud]

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
  for (const m of all) if (!m.core) console.log([m.id, `${m.id}.js`, m.where === 'main' ? 'main' : 'worker', m.depends.join(' '), 1].join('\t'))
} else if (process.argv[2] === 'doc') {
  for (const m of all) console.log(`mod.${m.id}\t${m.doc}`)
} else {
  console.log('| 模块 | 位置 | 核心 | 发出 | 订阅 | depends | defl/ 表 | c_ | 存档键 |\n|---|---|---|---|---|---|---|---|---|')
  for (const m of all) console.log(`| ${b(m.id)} | ${m.where} | ${m.core ? '✔' : '可停'} | ${list(Object.keys(m.emit))} | ${list(m.sub)} | ${list(m.depends)} | ${list(m.tables)} | ${list(m.c_.map(c => c.slice(1)))} | ${list(m.save)} |`)
  console.log('\n| 事件 | 频率 | 发出 | 订阅 |\n|---|---|---|---|')
  for (const [e, { rate, from, to }] of ev) console.log(`| \`${e}\` | ${rate} | ${b(from)} | ${to.length ? to.map(b).join(' ') : '（模组）'} |`)
}
