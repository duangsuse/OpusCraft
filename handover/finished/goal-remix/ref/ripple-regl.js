// 参照物（用户 2026-11-03 贴的片段，原样保存；不是本仓库代码，不要 import）：
//   ① Pass 工厂 + tagged template：${} 里的箭头函数按源码里的 `.xxx` 取 uniform 名，声明和用处在同一处
//      → render.md §4.1 的 pass.js 的参照（我们的版本多了：位置决定种类 / 类型取自默认值 / 宏通道 / 编译缓存）
//   ② Eulerian 高度场：波方程 + Verlet（S = {h, 上一帧 h}，ping-pong），边界遮罩 B.a 决定阻尼
//      → water.md §0.1 的水面波纹参照（B.a = 实心格遮罩，正好是岸线 2D 场）
//   ③ 线段 SDF 连续笔刷：上一帧到这一帧的鼠标（我们这里是：实体 / 玩家 / 落水点）线段，沿线连续注入，快速移动不断点
//   ④ 光学渲染：法线（高度差分）+ 折射色散 + Fresnel + 高光 + 虹彩

// Pass 工厂
const Pass = ({tag, ...kws} = {}) => (code, ...argFns) => {
    let
        frag_std = `precision highp float; uniform sampler2D S, B; uniform vec2 R, M, pM; varying vec2 u;`,
        U = { S: regl.prop('S'), B: () => bg, R: () => R, M: () => M, pM: () => pM },
        A = argFns,
        frag = frag_std + code.reduce((s, t, i) => s + t + (!A[i] ? "" : (U[A[i].k = (A[i] + '').match(/\.(\w+)/)[1]] = A[i], A[i].k)), "");
    return regl({ ...kws, uniforms: U, ...(tag && { framebuffer: regl.prop(tag) }), frag });
};

// 模拟核心（波方程 + Verlet + 连续笔刷）
const sim = Pass({ ...wide, tag: 'N' })`
uniform float ${_ => C.bru}, ${_ => C.frc}, ${_ => C.dmp}, ${_ => C.Ajel ? 1.0 : 0.0};

float sd(vec2 p, vec2 a, vec2 B) {
    vec2 pa = p - a, ba = B - a;
    return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
void main() {
    vec3 e = vec3(1.0 / R, 0.0);
    vec4 st = texture2D(S, u);

    // 拉普拉斯 + Verlet
    float n = (texture2D(S, u + e.xz).r + texture2D(S, u - e.xz).r +
               texture2D(S, u + e.zy).r + texture2D(S, u - e.zy).r) * 0.5 - st.t;

    float px = texture2D(B, vec2(u.x, 1.0 - u.y)).a;
    n *= (px >= 0.999) ? dmp : mix((Ajel > .5) ? .87 : .75, .99, px);

    // 连续线段笔刷
    if (M.x > -0.5) {
        vec2 A = vec2(R.x / R.y, 1.0);
        float dist = sd(u * A, M * A, pM * A);
        if (dist < bru) n += frc * (1.0 - smoothstep(0.0, bru, dist));
    }
    gl_FragColor = vec4(n, st.s, 0., 0.);
}`;

// 光学渲染核心（法线 + 折射色散 + Fresnel + 高光 + 虹彩）
const draw = Pass(wide)`
uniform float ${_ => C.ref}, ${_ => C.chr}, ${_ => C.shi}, ${_ => C.lgt}, ${_ => C.iri}, ${_ => C.frs}, ${_ => C.bld ? 1.0 : 0.0};

vec3 pal(float t) { return 0.5 + 0.5 * cos(6.283 * (vec3(1.0) * t + vec3(0.0, 0.33, 0.67))); }
void main() {
    vec3 e = vec3(1.0 / R, 0.0);
    vec2 P = vec2(u.x, 1.0 - u.y);

    float h = texture2D(S, u).r;
    vec2 hxy = vec2(texture2D(S, u + e.xz).r, texture2D(S, u + e.zy).r);
    vec3 n = normalize(vec3(hxy - h, 0.012));
    vec3 vDir = vec3(0, 0, 1);
    vec3 lDir = normalize(vec3(0.5, 0.5, 0.8));

    // 折射 + 色散
    vec2 off = n.xy * ref;
    vec2 uB = P + off;
    vec3 bg = vec3(
        texture2D(B, uB - off * chr).r,
        texture2D(B, uB).g,
        texture2D(B, uB + off * chr).b
    );

    // Fresnel + 高光 + 虹彩
    float f = pow(1.0 - max(dot(n, vDir), 0.0), 2.5);
    float spec = pow(max(dot(n, normalize(lDir + vDir)), 0.0), shi);
    vec3 cIri = pal(dot(n.xy, vec2(0.5)) + h * frs);
    vec3 rip = spec * lgt * mix(vec3(1), cIri, 0.5) + f * cIri * iri;

    gl_FragColor = mix(
        vec4(rip, max(max(rip.r, rip.g), rip.b)),
        vec4(rip + bg, ceil(texture2D(B, P).a)),
        bld
    );
}`;

// 帧循环
regl.frame(() => {
    const prev = F[t % 2], next = F[++t % 2];
    sim({ S: prev, N: next });
    if (M[0] >= 0) pM = M;
    draw({ S: next });
});
