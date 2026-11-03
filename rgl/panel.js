// rgl/panel.js —— Tweakpane 面板：直接由 P.panelSpec（vars.js 从各 Ref 的 meta 生成）建，一行 = 一个 Ref；写值走 ref.set（hooks 统一路由副作用）。
//   声明在 vars 的 metas 里（folder / label / min / max / step），这里不再有第二份面板描述。F4 开关（宿主已有：VR.togglePanel / VR.panelVisible）。
export function createPanel(P, { title = 'rgl (goodGL)', defaults = {} } = {}) {
  let pane = null, hidden = true, tweak = null;
  const paneReady = typeof document === 'undefined' ? Promise.resolve(null)
    : import('https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.js').then(({ Pane }) => {
      pane = new Pane({ title, expanded: false });
      const host = pane.element.parentElement || pane.element;
      Object.assign(host.style, { zIndex: 1000, width: '280px' }); host.style.display = hidden ? 'none' : '';
      host.addEventListener('keydown', e => { if (e.code !== 'F4') e.stopPropagation(); });        // 面板里的键盘输入不传给游戏（F4 例外）
      const folders = new Map(), refs = [];
      for (const row of P.panelSpec) {
        const ref = P.refs.get(row.path); if (!ref) continue;
        const name = row.folder || row.path.split('.').slice(0, -1).join('.') || '其他';
        let f = folders.get(name); if (!f) { f = pane.addFolder({ title: name, expanded: false }); folders.set(name, f); }
        const pt = { get v() { return ref.owner[ref.key]; }, set v(x) { ref.set(x); } };
        const o = { label: row.label || row.key };
        if (typeof row.value === 'number') Object.assign(o, { min: row.min, max: row.max, step: row.step });
        if (row.options) o.options = row.options;
        f.addBinding(pt, 'v', o); refs.push(ref);
      }
      pane.addButton({ title: '重置默认' }).on('click', () => { for (const r of refs) if (r.key in defaults) r.set(defaults[r.key]); pane.refresh(); });
      tweak = { refresh: () => pane.refresh() };
      return pane;
    }).catch(e => { console.warn('[rgl] Tweakpane 加载失败，面板不可用', e); return null; });
  return {
    paneReady,
    panelVisible: () => !!pane && !hidden,
    togglePanel(show) {
      hidden = show === undefined ? !hidden : !show;
      if (!pane) return;
      const host = pane.element.parentElement || pane.element; host.style.display = hidden ? 'none' : '';
      if (!hidden) { pane.expanded = true; if (document.pointerLockElement) document.exitPointerLock(); }
    },
    refresh: () => tweak && tweak.refresh(),
  };
}
