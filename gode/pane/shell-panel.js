// gode/pane/shell-panel.js —— 独立面板页的外壳：左侧竖向图标标签条（P-11），🔍 全局搜索（Tab，P-12）。只有 panel.html 用
import { $, icon, presetBar, RootView, Search } from './view.js'
import { plain } from './lib.js'

// ── 独立面板页的外壳：左侧竖向图标标签条（P-11），🔍 全局搜索（Tab，P-12）
export function mountPanelWindow(el, ctx, { code } = {}) {
  el.className = 'pw'
  const strip = $('nav', 'strip'), main = $('main'), head = $('header'), body = $('div', 'body'), wait = $('div', 'wait')
  main.append(head, body, wait); el.replaceChildren(strip, main)
  let headBar, kids = [], active = ctx.store.load('gg_tab.panel', null), wide = ctx.store.load('gg_strip.wide', false), pending = null, prev = null, searchUI
  strip.classList.toggle('wide', wide)
  const show = id => {
    if (id !== 'search') prev = id
    active = id; ctx.store.save('gg_tab.panel', id)
    for (const k of body.children) k.hidden = k.dataset.id !== id
    for (const t of strip.querySelectorAll('.tab[data-id]')) t.classList.toggle('on', t.dataset.id === id)
    head.replaceChildren()
    const root = ctx.schema.roots.find(r => r.id === id)
    if (id === 'search') { head.append($('h1', '', '🔍 搜索')); searchUI.focus() }
    else if (root) {
      head.append($('h1', '', root.title)); headBar?.destroy(); headBar = presetBar(ctx, root.id); head.append(headBar.el)
      const mv = $('button', 'mv', '↙ 移回游戏窗口'); mv.title = '把这个 root 交还给游戏窗口（右上）'; mv.onclick = () => ctx.io.home(root.id, 'game:tr'); head.append(mv)
      ctx.each(v => { if (v.id === id) v.refresh() })
    }
  }
  const go = hit => {
    const r = ctx.schema.roots.find(x => x.id === hit.root.id)
    if (r.home !== 'panel') { pending = hit; return ctx.io.home(r.id, 'panel') }
    show(r.id); const v = kids.find(k => k.id === r.id); v?.reveal(hit)
  }
  const build = () => {
    kids.forEach(k => k.destroy()); searchUI?.destroy(); kids = []; strip.replaceChildren(); body.replaceChildren()
    const mine = ctx.schema.roots.filter(r => r.home === 'panel'), other = ctx.schema.roots.filter(r => r.home !== 'panel')
    const tab = (id, ic, tip, fn, cls = '') => { const t = $('button', 'tab ' + cls); t.dataset.id = id ?? ''; t.append($('span', 'ic', ic), $('span', 'nm', tip.name ?? '')); t.title = tip.tip; t.onclick = fn; strip.append(t); return t }
    tab('search', '🔍', { name: '搜索', tip: '全局搜索（Tab）' }, () => show('search'))
    for (const r of mine) tab(r.id, icon(r.title), { name: plain(r.title), tip: r.title }, () => show(r.id))
    strip.append($('div', 'sp'))
    if (other.length) strip.append($('div', 'grp', '游戏窗口'))
    for (const r of other) tab(null, icon(r.title), { name: plain(r.title), tip: `${r.title}\n在游戏窗口（${r.home}）。点击：拉到这个窗口` }, () => { pending = { root: r, kind: 'root' }; ctx.io.home(r.id, 'panel') }, 'dim')
    const w = $('button', 'tab wd', wide ? '«' : '»'); w.title = '展开 / 收起标签名'; w.onclick = () => { wide = !wide; ctx.store.save('gg_strip.wide', wide); strip.classList.toggle('wide', wide); w.textContent = wide ? '«' : '»' }; strip.append(w)
    for (const r of mine) { const s = $('section'); s.dataset.id = r.id; body.append(s); kids.push(new RootView(ctx, s, r.id)) }
    const ss = $('section', 'searchpane'); ss.dataset.id = 'search'; body.append(ss); searchUI = new Search(ctx, ss, go); searchUI.onEsc = () => show(prev ?? mine[0]?.id)
    if (!mine.length) body.append($('div', 'empty', '这个窗口还没有 root。点左侧下方「游戏窗口」里的图标，把它拉过来。'))
    const want = pending?.kind === 'root' ? pending.root.id : pending?.root?.id
    show(mine.some(r => r.id === want) ? want : mine.some(r => r.id === active) || active === 'search' ? active : mine[0]?.id ?? 'search')
    if (pending?.kind === 'root') pending = null; else if (pending) { const h = pending; pending = null; setTimeout(() => go(h)) }
  }
  const view = { render: build, refresh() {}, alive(b) { el.classList.toggle('gone', !b) }, dead: false, panel() {} }
  ctx.views.add(view)
  wait.textContent = `等待游戏窗口…（配对码 ${code ?? '?'}）`
  addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && ctx.schema) {
      const inSearch = document.activeElement === searchUI?.input
      if (!inSearch && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return
      e.preventDefault(); inSearch ? show(prev ?? 'search') : show('search')
    }
  })
  return { show, ready() { el.classList.add('ready') } }
}
