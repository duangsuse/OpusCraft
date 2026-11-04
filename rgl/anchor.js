// rgl/anchor.js —— firefly / fire 共用：锚点 + 参数解析 + 实例池（生命周期）。两边只管各自的渲染和各自的参数表。
//   锚点   { mob } | { ent } | { at: [x, y, z] }：anchorValid 检查，anchorPose 写世界矩阵（false = 锚点没了：dead / removed / mesh 离开场景）。
//   参数   spec 里每个字段 = (值, 当前值) => 新值，不合法就 throw；add / set 都走同一条 parse（set 只处理出现的字段），
//          公共字段 life / fadeIn / fadeOut 由池自带；解析出的整套参数放 fx.p，set 时整体替换（check 不过则原样保留）。
//   生命周期  alive → fading（life 到期 / 锚点没了 / remove）→ dead；onLost = 'fade'（停在最后位姿淡出）| 'remove'（立即删）| 'stay'（停在最后位姿留到 life）；
//          onEnd(handle, reason)，reason = 'life' | 'lost' | 'removed'。
export const anchorValid = a => !!a && !!(a.mob || a.ent || (Array.isArray(a.at) && a.at.length >= 3 && a.at.every(Number.isFinite)));

export function anchorPose(a, out) {
  if (a.at) { out.makeTranslation(a.at[0], a.at[1], a.at[2]); return true; }
  const o = a.mob || a.ent;
  if (!o || o.dead || o.removed) return false;
  if (o.mesh) { if (!o.mesh.parent) return false; o.mesh.updateWorldMatrix(true, false); out.copy(o.mesh.matrixWorld); return true; }
  const x = o.x ?? (o.pos && o.pos.x), y = o.ry ?? o.y ?? (o.pos && o.pos.y), z = o.z ?? (o.pos && o.pos.z);
  if (![x, y, z].every(Number.isFinite)) return false;
  out.makeRotationY(o.ryaw ?? o.yaw ?? 0).setPosition(x, y, z);   // 无 mesh 的宿主对象：只有朝向角（rotation.y 约定）
  return true;
}

// ---- 字段解析器工厂（抛出的错误由池加上 `${name}: ` 前缀）
export const P = {
  num: (label, lo, hi) => v => { const n = +v; if (!Number.isFinite(n) || n < lo || n > hi) throw new TypeError(`${label} 必须在 ${lo}..${hi} 之间`); return n; },
  int: (label, lo, hi) => { const f = P.num(label, lo, hi); return v => Math.round(f(v)); },
  vec3: label => v => { if (!Array.isArray(v) || v.length < 3 || !v.slice(0, 3).every(Number.isFinite)) throw new TypeError(`${label} 必须是 [x, y, z]`); return [v[0], v[1], v[2]]; },
  bool: v => !!v,
};
const COMMON = {
  life: v => { const l = v ?? Infinity; if (typeof l !== 'number' || Number.isNaN(l)) throw new TypeError('life 必须是数字（秒，可为 Infinity）'); return l; },
  fadeIn: P.num('fadeIn', 0, 600), fadeOut: P.num('fadeOut', 0, 600),
};

// opts: { name, spec, defaults(o) → 参数对象, finalize?(p, fx) 跨字段校验 / 规整（可改 p，可 throw）, onAdd?(fx), onDead?(fx), handleProps?(fx) → 追加到句柄的属性, immutable?: [字段名] }
// add(o, extra)：o = 用户参数（含 anchor / onLost / onEnd）；extra = 创建时就确定、之后不变的 fx 字段（type / 分组…）。返回句柄。
export function createPool(THREE, { name, spec, defaults, finalize, onAdd, onDead, handleProps, immutable = [] }) {
  const fields = { ...COMMON, ...spec }, live = new Set(), _m = new THREE.Matrix4();
  let nextId = 1;
  const wrap = e => { throw new e.constructor(`${name}: ${e.message}`); };
  function parse(o, p, fx) {
    const q = { ...p };
    try { for (const k in fields) if (k in o) q[k] = fields[k](o[k], p[k]); if (finalize) finalize(q, fx); } catch (e) { wrap(e); }
    return q;
  }
  function finish(fx, reason, fade) {
    if (fx.state === 'dead') return;
    if (fade && fx.p.fadeOut > 0) { if (fx.state === 'alive') { fx.state = 'fading'; fx.fadeT = 0; fx.reason = reason; } return; }
    fx.state = 'dead'; live.delete(fx); if (onDead) onDead(fx);
    if (fx.onEnd) { try { fx.onEnd(fx.handle, reason); } catch (e) { console.error(name + ' onEnd', e); } }
  }
  return {
    live,
    add(o, extra) {
      if (!o || !anchorValid(o.anchor)) throw new TypeError(`${name}: anchor 必须是 { mob } / { ent } / { at: [x, y, z] }`);
      const fx = { id: nextId++, anchor: o.anchor, p: null, age: 0, state: 'alive', fadeT: 0, last: new THREE.Matrix4(), ...extra,
        onLost: o.onLost === 'remove' || o.onLost === 'stay' ? o.onLost : 'fade', onEnd: typeof o.onEnd === 'function' ? o.onEnd : null };
      let base; try { base = defaults(o); } catch (e) { wrap(e); }
      fx.p = parse(o, base, fx);
      if (!anchorPose(fx.anchor, fx.last)) throw new TypeError(`${name}: anchor 已经失效（dead / removed / 不在场景里）`);
      live.add(fx); if (onAdd) onAdd(fx);
      const h = {
        id: fx.id,
        get alive() { return fx.state !== 'dead'; }, get age() { return fx.age; },
        set(q) {
          if (fx.state === 'dead') return h;
          for (const k of immutable) if (k in q) throw new TypeError(`${name}: ${k} 不可修改，删了重建`);
          fx.p = parse(q, fx.p, fx); return h;
        },
        remove(opt) { finish(fx, 'removed', !opt || opt.fade !== false); return h; },
      };
      if (handleProps) Object.defineProperties(h, Object.getOwnPropertyDescriptors(handleProps(fx)));
      fx.handle = h;
      return h;
    },
    // 寿命 / 锚点跟随 / 淡出收尾（与是否在画无关）
    tick(sec) {
      for (const fx of [...live]) {
        fx.age += sec;
        if (fx.state === 'alive') {
          if (fx.age >= fx.p.life) finish(fx, 'life', true);
          else if (!anchorPose(fx.anchor, _m)) {
            if (fx.onLost === 'remove') finish(fx, 'lost', false);
            else if (fx.onLost === 'fade') finish(fx, 'lost', true);   // 停在 fx.last
          } else fx.last.copy(_m);
        }
        if (fx.state === 'fading') { fx.fadeT += sec; if (fx.fadeT >= fx.p.fadeOut) finish(fx, fx.reason, false); }
      }
    },
    fade: fx => (fx.p.fadeIn > 0 ? Math.min(1, fx.age / fx.p.fadeIn) : 1) * (fx.state === 'fading' ? 1 - fx.fadeT / fx.p.fadeOut : 1),
    remove(h) { for (const fx of live) if (fx.id === (h && h.id)) finish(fx, 'removed', true); },
    clear() { for (const fx of [...live]) finish(fx, 'removed', false); },
  };
}
