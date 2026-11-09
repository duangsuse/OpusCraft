// gode/pane/shell-game.js —— 游戏窗口的外壳：任务栏（左上）+ 三处停靠（左上 / 右上 / 暂停菜单，IDEA L90）+ 内嵌面板 iframe。只有游戏页用
import { $, icon, presetBar, RootView, Search } from './view.js'

// ── 游戏窗口的外壳：任务栏（左下）+ 三处停靠（左上 / 右上 / 暂停菜单，IDEA L90）
export function mountGame(el, ctx, { popOut, panelUrl } = {}) {
  const docks = { 'game:tl': $('div', 'dock tl'), 'game:tr': $('div', 'dock tr'), 'game:pause': $('div', 'dock pause') }
  const pop = $('button', 'popbtn', '↗'), bar = $('nav', 'taskbar'), over = $('div', 'searchover'), sbox = $('div', 'sbox'); over.append(sbox); over.hidden = true
  pop.title = '弹出独立面板窗口（内嵌面板会关掉）'; const inl = $('aside', 'inline'), grip = $('div', 'grip'); inl.append(grip); el.append(...Object.values(docks), inl, bar, over)
  const saved = ctx.store.load('gg_open.game', null); let inited = false, open = new Set(saved ?? []), kids = [], bars = [], wins = new Map(), searchUI, uiOn = ctx.store.load('gg_ui.game', true)
  // 内嵌面板（默认行为）：独立面板页放进 iframe 停靠在右侧，拖左边缘改宽；用 ↗ 弹出独立窗口时它关掉（不自动回来，刷新即可）
  let inlineOn = ctx.store.load('gg_inline', true), suppressed = false, frame = null, inlW = ctx.store.load('gg_inline.w', 420), inlBtn = null
  const syncInline = () => {
    const vis = inlineOn && !suppressed; inl.hidden = !vis; inl.style.width = inlW + 'px'; el.style.setProperty('--inl-w', vis ? inlW + 'px' : '0px')
    if (vis && !frame) { frame = document.createElement('iframe'); frame.src = panelUrl?.(); inl.append(frame) }
    if (!vis && frame) { frame.remove(); frame = null }
    inlBtn?.classList.toggle('on', vis)
  }
  grip.onpointerdown = e => { try { grip.setPointerCapture(e.pointerId) } catch {} inl.classList.add('drag'); grip.onpointermove = ev => { inlW = Math.round(Math.max(300, Math.min(innerWidth * .7, innerWidth - ev.clientX))); inl.style.width = inlW + 'px'; el.style.setProperty('--inl-w', inlW + 'px') } }
  grip.onpointerup = () => { grip.onpointermove = null; inl.classList.remove('drag'); ctx.store.save('gg_inline.w', inlW) }
  addEventListener('message', e => { if (e.origin === location.origin && e.data?.gode === 'F3') showUi(!uiOn) })   // 内嵌面板里按 F3 转发过来
  const showUi = on => { uiOn = on; ctx.store.save('gg_ui.game', on); el.classList.toggle('ui-off', !on) }; showUi(uiOn)       // F3：任务栏、停靠窗口、↗ 一起开关（也解决指针锁定时面板挡视线）
  const persist = () => ctx.store.save('gg_open.game', [...open])
  const keep = e => { if (e.code !== 'Backquote' && e.code !== 'F3' && e.code !== 'F4' && e.code !== 'Escape' && !(e.code === 'Space' && e.ctrlKey)) e.stopPropagation() }
  const toggle = (id, on = !open.has(id)) => { on ? open.add(id) : open.delete(id); persist(); sync() }
  const sync = () => { for (const [id, w] of wins) w.hidden = !open.has(id); for (const t of bar.querySelectorAll('.tab[data-id]')) t.classList.toggle('on', open.has(t.dataset.id)) }
  const go = hit => {
    const r = ctx.schema.roots.find(x => x.id === hit.root.id); closeSearch()
    const run = () => { open.add(r.id); persist(); sync(); kids.find(k => k.id === r.id)?.reveal(hit) }
    if (r.home === 'panel') { ctx.io.home(r.id, 'game:tr'); open.add(r.id); persist(); setTimeout(run, 60) } else run()
  }
  const openSearch = () => { over.hidden = false; searchUI.input.value = ''; searchUI.run(); searchUI.focus() }
  const closeSearch = () => { over.hidden = true }
  const build = () => {
    kids.forEach(k => k.destroy()); bars.forEach(b => b.destroy()); searchUI?.destroy(); kids = []; bars = []; wins.clear(); bar.replaceChildren(); sbox.replaceChildren()
    for (const d of Object.values(docks)) d.replaceChildren()
    const mine = ctx.schema.roots.filter(r => r.home !== 'panel')
    const tab = (id, ic, tip, fn, cls = '') => { const t = $('button', 'tab ' + cls); if (id) t.dataset.id = id; t.append($('span', 'ic', ic)); t.title = tip; t.onclick = fn; bar.append(t); return t }
    tab(null, '🔍', `全局搜索（Ctrl+Space）`, openSearch)
    for (const r of mine) {
      tab(r.id, icon(r.title), `${r.title}（${r.home}）`, () => toggle(r.id))
      const w = $('section', 'win'), h = $('header'), b = $('div', 'wb'), mv = $('button', '', '↗'), x = $('button', '', '×')
      h.append($('span', 't', r.title), mv, x); mv.title = '移到独立面板窗口'; mv.onclick = () => { ctx.io.home(r.id, 'panel'); if (!ctx.panelUp) popOut?.() }; x.title = '收起'; x.onclick = () => toggle(r.id, false)
      const pb = presetBar(ctx, r.id); bars.push(pb); w.append(h, pb.el, b); w.addEventListener('keydown', keep); w.addEventListener('keyup', keep)
      docks[r.home]?.append(w); wins.set(r.id, w); kids.push(new RootView(ctx, b, r.id))
    }
    inlBtn = tab(null, '▥', '内嵌面板（拖左边缘改宽）', () => { if (suppressed) { suppressed = false; inlineOn = true } else inlineOn = !inlineOn; ctx.store.save('gg_inline', inlineOn); syncInline() })
    bar.append(pop); pop.onclick = () => { if (popOut?.()) { suppressed = true; syncInline() } else fallback.hidden = false }
    const fallback = $('a', 'fallback', '被拦截了：点这里打开面板'); fallback.href = panelUrl?.(); fallback.target = 'gode-panel'; fallback.hidden = true; fallback.onclick = () => { fallback.hidden = true }; bar.append(fallback)
    searchUI = new Search(ctx, sbox, go); searchUI.onEsc = closeSearch
    if (!inited && saved === null) for (const r of mine) if (r.home === 'game:tr') open.add(r.id)
    inited = true
    pop.classList.toggle('up', ctx.panelUp); sync(); syncInline()
  }
  over.addEventListener('pointerdown', e => { if (e.target === over) closeSearch() })
  const view = { render: build, refresh() {}, dead: false, panel() { pop.classList.toggle('up', ctx.panelUp) } }
  ctx.views.add(view)
  addEventListener('keydown', e => {
    if (e.code === 'F3') { e.preventDefault(); showUi(!uiOn) }
    else if (e.code === 'Space' && e.ctrlKey) { e.preventDefault(); over.hidden ? openSearch() : closeSearch() }
    else if (e.code === 'Backquote' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) { const r = ctx.schema?.roots.find(x => x.home === 'game:tr'); if (r) { e.preventDefault(); toggle(r.id) } }
  })
  return { toggle }
}
