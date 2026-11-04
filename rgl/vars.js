// rgl/vars.js —— 参数表 + Ref 核心（render.md §4.1 第 2 条；panify §2 的最小实现，以后并进公共库）
//   vars(defaults, metas?)：返回 defaults 的深拷贝（bench 契约的 `P`：读写值照旧）；每张表（根和嵌套表）上挂一个不可枚举的 `it`，
//   `table.it.key` 返回 (table, key) 对应的 Ref —— 一个 getter 函数，调用即读当前值，同一 (owner, key) 总是同一个 Ref。
//   用法（每个 pass 局部取别名）：  const ao = c_.Gl.ao.it;  `${ao.strength}`   ≡ Tweakpane 的 pane.addBinding(c_.Gl.ao, 'strength')
//   `it` 只认声明过的 key：拼错直接抛错（声明式，不靠运行时猜）。
const RefProto = Object.create(Function.prototype);
Object.assign(RefProto, {
  set(v) { this.owner[this.key] = v; for (const h of this.root.hooks) h(this, v); return this; },     // 副作用（宏切换、重建）统一从 hooks 路由
  As(meta) { Object.assign(this.meta, meta); return this; },
});
Object.defineProperty(RefProto, 'glslType', { get() { return glslTypeOf(this.owner[this.key], this.meta); } });

export function glslTypeOf(v, meta = {}) {
  if (v && v.glslType) return v.glslType;                                  // 纹理：构造函数打在对象上
  if (meta.glsl) return meta.glsl;                                         // 显式声明优先：uint / ivecN / uvecN / mat2 / mat3 等推不出的类型（上传见 pass.js upload）
  if (typeof v === 'number') return 'float';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v) || ArrayBuffer.isView(v)) {
    if (v.length === 16 && v instanceof Float32Array) return 'mat4';
    if (v.length >= 2 && v.length <= 4 && v instanceof Int32Array) return 'ivec' + v.length;
    if (v.length >= 2 && v.length <= 4 && v instanceof Uint32Array) return 'uvec' + v.length;
    if (v.length >= 2 && v.length <= 4) return 'vec' + v.length;
  }
  throw new Error(`vars: 推不出 GLSL 类型：${String(v)}`);
}

export function vars(defaults, metas = {}) {
  const root = { hooks: [], refs: new Map(), tables: [] };
  const build = (src, path) => {
    const o = {};
    for (const k of Object.keys(src)) {
      const v = src[k];
      o[k] = v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) && !v.glslType ? build(v, path.concat(k)) : (Array.isArray(v) || ArrayBuffer.isView(v) ? v.slice() : v);
    }
    const refs = new Map(), where = path.join('.');
    Object.defineProperty(o, 'it', { enumerable: false, value: new Proxy({}, {
      get: (_, k) => {
        if (typeof k !== 'string') return undefined;
        if (!(k in o) || (o[k] && typeof o[k] === 'object' && o[k].it && !Array.isArray(o[k]) && !ArrayBuffer.isView(o[k]))) throw new Error(`vars: ${where || '(root)'} 没有参数 '${k}'`);
        let r = refs.get(k);
        if (!r) {
          r = Object.setPrototypeOf(() => o[k], RefProto);
          const pk = path.concat(k).join('.');
          Object.defineProperties(r, { owner: { value: o }, key: { value: k }, path: { value: pk }, root: { value: root }, meta: { value: { ...(metas[pk] || {}) } } });
          refs.set(k, r); root.refs.set(pk, r);
        }
        return r;
      },
    }) });
    root.tables.push({ path: where, table: o });
    return o;
  };
  const P = build(defaults, []);
  Object.defineProperty(P, 'hooks', { enumerable: false, value: root.hooks });
  Object.defineProperty(P, 'refs', { enumerable: false, value: root.refs });     // path → Ref（面板按 panelSpec 行的 path 取）
  // panelSpec：从各 Ref 的 meta 生成面板行（文件夹 = 路径前缀）；只列叶子
  Object.defineProperty(P, 'panelSpec', { enumerable: false, get() {
    const out = [];
    for (const { path, table } of root.tables) for (const k of Object.keys(table)) {
      const v = table[k]; if (v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) && v.it) continue;
      const ref = (path ? path.split('.').reduce((a, x) => a[x], P) : P).it[k];
      out.push({ path: ref.path, folder: path, key: k, value: v, ...ref.meta });   // meta.folder 覆盖路径前缀（扁平的 P 靠它分文件夹）
    }
    return out;
  } });
  return P;
}
