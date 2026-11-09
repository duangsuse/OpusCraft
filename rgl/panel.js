// rgl/panel.js —— Tweakpane 面板：直接由 P.panelSpec（vars.js 从各 Ref 的 meta 生成）建，一行 = 一个 Ref；写值走 ref.set（hooks 统一路由副作用）。
//   声明在 vars 的 metas 里（root / folder / label / min / max / step），这里不再有第二份面板描述。F4 开关（宿主已有：VR.togglePanel / VR.panelVisible）。
//   root = 顶层 Pane：meta.root 相同的行进同一个 Pane，各 Pane 并排（各自标题条、折叠、重置）；F4 一起开关。缺省 root = 'v3'。
export function createPanel(P, { title = 'rgl', roots = { v2: 'v2 · goodGL', v3: 'v3 · remix' }, defaults = {} } = {}) {
  const panes = new Map(); let hidden = true, wrap = null;
  // tweakpane 在 vendor/npm/（本地化，见该目录 README）；用相对 import.meta.url 的路径而不是 importmap，别的页面也能用本文件
  const paneReady = typeof document === 'undefined' ? Promise.resolve(null)
    : import(new URL('../vendor/npm/tweakpane.js', import.meta.url).href).then(({ Pane }) => {
      wrap = document.createElement('div');
      Object.assign(wrap.style, { position: 'fixed', top: '8px', right: '8px', zIndex: 1000, display: hidden ? 'none' : 'flex', gap: '8px', alignItems: 'flex-start' });
      wrap.addEventListener('keydown', e => { if (e.code !== 'F4') e.stopPropagation(); });        // 面板里的键盘输入不传给游戏（F4 例外）
      document.body.appendChild(wrap);
      const byRoot = new Map();
      for (const row of P.panelSpec) { const r = row.root || 'v3'; if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(row); }
      const order = [...Object.keys(roots), ...[...byRoot.keys()].filter(r => !(r in roots))];
      for (const r of order) {
        const rows = byRoot.get(r); if (!rows) continue;
        const box = document.createElement('div'); box.style.width = '280px'; wrap.appendChild(box);
        const pane = new Pane({ title: roots[r] || r, expanded: false, container: box });
        const folders = new Map(), refs = [];
        for (const row of rows) {
          const ref = P.refs.get(row.path); if (!ref || row.hidden) continue;
          const name = row.folder || row.path.split('.').slice(0, -1).join('.') || '其他';
          let f = folders.get(name); if (!f) { f = pane.addFolder({ title: name, expanded: false }); folders.set(name, f); }
          const pt = { get v() { return ref.owner[ref.key]; }, set v(x) { ref.set(x); } };
          const o = { label: row.label || row.key };
          if (row.color) o.view = 'color'; else if (typeof row.value === 'number') Object.assign(o, { min: row.min, max: row.max, step: row.step });
          if (row.options) o.options = row.options;
          if (row.pair) {                                                                   // 向量行：两个键并成一个 point2d（x = 本键，y = pair 键），各轴自带范围
            const ref2 = P.refs.get(row.path.replace(/[^.]*$/, row.pair)), p2 = { get v() { return { x: ref.owner[ref.key], y: ref2.owner[ref2.key] }; }, set v(q) { ref.set(q.x); ref2.set(q.y); } };
            f.addBinding(p2, 'v', { label: row.label || row.key, x: { min: row.min, max: row.max, step: row.step }, y: { min: row.min2, max: row.max2, step: row.step2 } }); refs.push(ref, ref2); continue;
          }
          f.addBinding(pt, 'v', o); refs.push(ref);
        }
        pane.addButton({ title: '重置默认' }).on('click', () => { for (const x of refs) if (x.key in defaults) x.set(defaults[x.key]); pane.refresh(); });
        panes.set(r, pane);
      }
      return panes;
    }).catch(e => { console.warn(`[${title}] Tweakpane 加载失败，面板不可用`, e); return null; });
  return {
    paneReady,
    panelVisible: () => !!wrap && !hidden,
    togglePanel(show) {
      hidden = show === undefined ? !hidden : !show;
      if (!wrap) return;
      wrap.style.display = hidden ? 'none' : 'flex';
      if (!hidden) { for (const p of panes.values()) p.expanded = true; if (document.pointerLockElement) document.exitPointerLock(); }
    },
    refresh: () => { for (const p of panes.values()) p.refresh(); },
  };
}
