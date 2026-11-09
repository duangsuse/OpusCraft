/* gode/w/params.js —— 生成器参数（kw）的共用解析（s02 §2.1，s13 V3 的底座；页面与 Worker 都能 import）。
   约定：每个生成器在 meta.knobs 里声明一张**扁平表** [{ k: 'terrain.hillAmp', def: 1, min: 0, max: 3, note }]，键是点号路径；
   默认值必须让生成器的输出与未加参数时逐字节相同（乘子默认 1、偏移默认 0）。kw 可以是嵌套对象 { terrain: { hillAmp: 1.5 } }
   或扁平 { 'terrain.hillAmp': 1.5 }，也就是 c_.Gen 的形状。未知键直接抛错（列出可用键），越界值夹到 min / max。 */

// 嵌套 / 扁平 → 扁平（点号键）
export function flatten(kw, pre = '', out = {}) {
  for (const k in kw ?? {}) {
    const v = kw[k], p = pre ? pre + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out); else out[p] = v;
  }
  return out;
}

// 扁平 → 嵌套（给人看 / 给 c_.Gen）
export function nest(flat) {
  const o = {};
  for (const k in flat) { const ks = k.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]] ??= {}; t[ks[ks.length - 1]] = flat[k]; }
  return o;
}

/* 校验 + 补默认：返回完整的扁平对象（每个声明过的键都有值）。
   strict（默认）：未知键、非数字抛错；生成器没有声明 params 时任何非空 kw 都算未知。 */
export function resolveParams(schema, kw, strict = true) {
  const out = {}, by = new Map((schema ?? []).map(p => [p.k, p]));
  for (const p of by.values()) out[p.k] = p.def;
  const flat = flatten(kw);
  for (const k in flat) {
    const p = by.get(k);
    if (!p) { if (strict) throw new Error(`未知生成器参数 ${k}（可用：${[...by.keys()].join(' ') || '无'}）`); continue; }
    let v = flat[k];
    if (v === null || v === '') v = p.def;     // null = 回到默认
    v = Number(v);
    if (!Number.isFinite(v)) throw new Error(`生成器参数 ${k} 不是数字：${flat[k]}`);
    out[k] = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
  }
  return out;
}

// 只留偏离默认的键（URL / 对比用）
export function diffFromDefault(schema, flat) {
  const out = {};
  for (const p of schema ?? []) if (flat?.[p.k] !== undefined && flat[p.k] !== p.def) out[p.k] = flat[p.k];
  return out;
}

// 'a.b:1.5,c.d:2' ⇄ { 'a.b': 1.5, 'c.d': 2 }（URL kw=）
export function parseKw(s) {
  const o = {};
  for (const part of String(s ?? '').split(',')) { const i = part.lastIndexOf(':'); if (i > 0) { const v = Number(part.slice(i + 1)); if (Number.isFinite(v)) o[part.slice(0, i).trim()] = v; } }
  return o;
}
export const fmtKw = (flat) => Object.keys(flat).sort().map(k => `${k}:${flat[k]}`).join(',');
