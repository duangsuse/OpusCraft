// gode/mock/data.js —— mock 参数与面板声明：一段脚本，gg / c_ 由 mock.js 注入（s16 K-9：不写 export / import）。每种控件至少一个，用来测面板 UIUX。
//   c_.主题 = { 键: [默认, 最小, 最大, 标签?, { step, log, doc, fx … }?] }   数值；一参数一行，面板 ✎ 落盘就是按「文件:行:列 + 键名」改这里的字面量
//                { 键: [默认, [选项…], 标签?, { … }?] }                       枚举（默认是选项之一）
//                { 键: [默认, 标签?, { color / multiline / ro … }?] }         布尔 / 字符串 / #hex / 向量 / rgb
//                嵌套对象 = 嵌套表（$Gl.bloom.on）。循环 / Object.fromEntries 生成的声明能用，只是不能 ✎ 落盘（没有各自的字面量可改）
//   gg.pane(root, rows, { home }) 行 = 纯数据：[路径, 选项?] / [[路径, 路径]] / { act } / { pick, fields } / [文件夹名, 行, { open? }]

// ── ⚡ 快调（s09 §5）
c_.Time = {
  hour:   [10, 5, 29, '时间', { step: .1, doc: '5…29，24 = 日出', fx: 'sky' }],
  tpause: ['不暂停', ['不暂停', '暂停菜单', '暂停生物', '暂停模拟', '锁 1 帧'], '暂停', { doc: '暂停菜单时 Esc 屏的行为' }],
}
c_.Weather = {
  state:  ['晴', ['晴', '雨', '雷'], '天气'],
}
c_.Motion = {
  flySpeed: [12, 1, 200, '航速', { step: 1, log: true, doc: '对数区间' }],
}
c_.Cam = {
  fov:    [70, 30, 120, 'FOV', { step: 1 }],
}
c_.R = {
  rd:     [8, 2, 32, '视距', { step: 1, fx: 'regen', doc: '改后重生成视野内区块' }],
  scale:  [1, .25, 2, '渲染 scale', { step: .05 }],
  shadow: ['软', ['关', '软', '软 + 锐'], '阴影质量', { fx: 'gl_wtf' }],
}
c_.Sun = {
  azOff:  [0, -180, 180, '方位', { step: 1 }],
  elOff:  [0, -30, 30, '仰角', { step: 1 }],
}
c_.Water = {
  shoreSurge:  [.4, 0, 1, '岸边涌浪', { step: .01 }],
  rippleSurge: [.2, 0, 1, '水体涌浪', { step: .01 }],
  height:      [62.5, 55, 70, '水面高度', { step: .1 }],
  caustics:    [true, '焦散'],
  scatter:     [.3, 0, 1, '水散射', { step: .01 }],
}

// ── 🎨 渲染
c_.Shadow = {
  q:          ['软', ['关', '软', '软 + 锐', 'PCSS', '光追'], '阴影档', { doc: '前 3 项会在文件夹标题行显示成链接（R7）' }],
  sharpDist:  [24, 4, 96, '锐图距离', { step: 1 }],
  sharpSoft:  [.3, 0, 1, '锐图柔化', { step: .01 }],
}
c_.Gl = {
  taa:      [true, 'TAA', { doc: '切换后 2 s 稳定，显示前后 fps 差（R6）' }],
  bloom: {
    on:       [true, 'Bloom'],
    strength: [.35, 0, 2, '强度', { step: .01 }],
  },
  exposure: [1, .1, 4, '曝光', { step: .01, log: true }],
  aces:     [true, 'ACES'],
}
c_.Sky = {
  stars:  [true, '满天星'],
  night:  ['Bliss', ['Bliss', 'HDRI', '纯黑'], '夜空风格'],
  tint:   ['#6fa8ff', '天顶色', { color: true }],
}
c_.Cloud = {
  cover:  [.5, 0, 1, '云量', { step: .01 }],
  speed:  [1, 0, 10, '云速', { step: .1 }],
  color:  [[1, .95, .9], '云色', { color: true }],
}
c_.Fog = {
  density:       [.02, 0, .2, '距离雾', { step: .001 }],
  color:         ['#c8d8ee', '雾色', { color: true }],
  godrays:       [false, '云隙光'],
  godrayStrength: [.5, 0, 2, '强度', { step: .01 }],
  morning:       [0, 0, 1, '晨雾', { step: .01, doc: '默认 0（sky-fog 计划）' }],
}
c_.Post = {
  saturation: [1, 0, 2, '饱和度', { step: .01 }],
  vignette:   [.15, 0, 1, '暗角', { step: .01 }],
  lut:        ['neutral\nwarm 0.3\ncool 0.1', 'LUT 配方', { multiline: true }],
}

// ── 🧪 控件全集
c_.Ctl = {
  float:  [.5, 0, 1, '强度', { step: .01, doc: '与渲染里的「强度」同名，测搜索' }],
  int:    [3, 0, 10, '整数', { step: 1 }],
  neg:    [-5, -20, 20, '负区间', { step: .5 }],
  tiny:   [.001, 0, .01, '极小步长', { step: .0001 }],
  log:    [10, .01, 10000, '对数滑块', { step: .01, log: true }],
  angle:  [90, 0, 360, '角度 °', { step: 1 }],
  long:   [1, 0, 2, '很长很长很长的标签用来测试溢出与省略号显示', { step: .1, doc: '标签溢出：悬停应显示全名' }],
  bool:   [false, '布尔'],
  timeit: [false, '布尔 + timeit'],
  enum2:  ['A', ['A', 'B'], '二选一'],
  enum8:  ['三', ['一', '二', '三', '四', '五', '六', '七', '八'], '八选一'],
  tabs:   ['fp', ['fp', 'orbit', 'back'], '相机', { doc: 'CAMS 只有这三个（用 tabs）' }],
  hex:    ['#ff8800', '颜色 #hex', { color: true }],
  rgb:    [[.2, .6, 1], '颜色 rgb 0..1', { color: true }],
  str:    ['hello', '文本'],
  text:   ['line 1\nline 2\nline 3', '多行文本', { multiline: true }],
  roStr:  ['只读文字', '只读文本', { ro: true }],
  px:     [8, 0, 32, '距离', { step: 1 }],
  py:     [20, 0, 90, '角度', { step: 1 }],
  v2:     [[3, 4], '向量 v2'],
  v3:     [[1, 2, 3], '向量 v3'],
  deep:   [7, 0, 10, '深层参数', { step: 1 }],
}
// 生成出来的声明：24 行滚动用；没有各自的字面量，所以 ✎ 落盘会跳过它们（并说明原因）
c_.Many = Object.fromEntries(Array.from({ length: 24 }, (_, i) => ['k' + String(i + 1).padStart(2, '0'), [(i + 1) % 7, 0, 10, `第 ${i + 1} 项`, { step: 1 }]]))

gg.acts({
  pause:   { label: '暂停', keys: 'Esc' },
  camHome: { label: '相机回家', keys: 'F4 长按' },
  regen:   { label: '重生成视野', keys: '' },
})

// ── 面板
gg.pane('⚡ 快调', [
  ['$Time.hour'], ['$Time.tpause', { tabs: true }], ['$Weather.state', { tabs: true }], ['$Motion.flySpeed'],
  [['$Cam.fov', '$R.rd'], { label: 'FOV→视距' }], ['$R.scale'], ['$R.shadow', { tabs: true }],
  [['$Sun.azOff', '$Sun.elOff']], [['$Water.shoreSurge', '$Water.rippleSurge']],
  { act: 'pause' }, { act: '/time 7' },
], { home: 'game:tr' })

gg.pane('🎨 渲染', [
  ['💡 光影', [['$Shadow.q', { tabs: true }], [['$Shadow.sharpDist', '$Shadow.sharpSoft']], ['$Gl.taa', { timeit: 'taa' }], ['$Gl.aces']], { open: true }],
  ['🌌 天空', [['$Sky.stars'], ['$Sky.night', { tabs: true }], ['$Sky.tint']]],
  ['☁ 云', [['$Cloud.cover'], ['$Cloud.speed'], ['$Cloud.color']]],
  ['🌫 雾与云隙光', [['$Fog.density'], ['$Fog.color'], ['$Fog.godrays', { timeit: 'godrays' }], ['$Fog.godrayStrength'], ['$Fog.morning']]],
  ['🌊 水', [['$Water.height'], ['$Water.caustics', { timeit: 'caustics' }], ['$Water.scatter']]],
  ['✨ 后期', [['$Gl.bloom.on'], ['$Gl.bloom.strength'], ['$Gl.exposure'], ['色调', [['$Post.saturation'], ['$Post.vignette'], ['$Post.lut']]]]],
], { home: 'game:pause' })

gg.pane('🧱 数据表', [
  ['📦 方块 blk', [{ pick: 'blk', fields: ['gravity', 'hardness', 'light', 'solid', 'tint'] }], { open: true }],
  ['🐷 生物 mob', [{ pick: 'mob', fields: ['HP', 'ATK', 'speed', 'hostile'] }]],
], { home: 'game:tl' })

gg.pane('🧪 控件全集', [
  ['📏 数值', [['$Ctl.float'], ['$Ctl.int'], ['$Ctl.neg'], ['$Ctl.tiny'], ['$Ctl.log'], ['$Ctl.angle'], ['$Ctl.long'], ['$Ctl.float', { label: '覆盖标签' }]], { open: true }],
  ['☑ 布尔与枚举', [['$Ctl.bool'], ['$Ctl.timeit', { timeit: 'ctl' }], ['$Ctl.enum2'], ['$Ctl.enum8'], ['$Ctl.tabs', { tabs: true }]]],
  ['🎨 颜色', [['$Ctl.hex'], ['$Ctl.rgb']]],
  ['✏ 文本', [['$Ctl.str'], ['$Ctl.text'], ['$Ctl.roStr']]],
  ['📐 向量', [[['$Ctl.px', '$Ctl.py']], ['$Ctl.v2'], ['$Ctl.v3']]],
  ['📈 只读', [['$Stat.fps'], ['$Stat.pos']]],
  ['🔘 动作', [{ act: 'pause' }, { act: 'camHome' }, { act: '/time 7' }, { act: 'regen', label: '⟳ 重生成视野' }]],
  ['🪆 嵌套', [['二层', [['三层', [['🕳 四层', [['$Ctl.deep']]]]]]]]],
  ['📚 很多行', Array.from({ length: 24 }, (_, i) => ['$Many.k' + String(i + 1).padStart(2, '0')])],
  ['无 emoji 的文件夹', [['$Ctl.bool'], ['$Ctl.str']]],
], { home: 'panel' })

// ── 数据表（真游戏里是 defl/*.tsv；mock 先给内存里的初值，tsv 在就以 tsv 为准）
{
  const NAMES = 'stone dirt grass sand gravel clay snow ice water lava oak_log oak_planks oak_leaves birch_log spruce_log cobble mossy_cobble coal_ore iron_ore gold_ore diamond_ore redstone_ore glass sandstone bricks torch glowstone obsidian bedrock netherrack soul_sand wool_white wool_red tnt cactus pumpkin'.split(' ')
  const rnd = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x) }
  const hex = i => '#' + [0, 1, 2].map(k => Math.floor(rnd(i * 3 + k) * 200 + 40).toString(16).padStart(2, '0')).join('')
  gg.table('blk', {
    cols: [{ k: 'name', type: 'str' }, { k: 'gravity', type: 'num', min: 0, max: 2, step: .05 }, { k: 'hardness', type: 'num', min: 0, max: 50, step: .5 }, { k: 'light', type: 'num', min: 0, max: 15, step: 1 }, { k: 'solid', type: 'bool' }, { k: 'tint', type: 'hex' }],
    rows: NAMES.map((n, i) => ({ id: ':' + n, name: n, gravity: /sand|gravel/.test(n) ? 1 : 0, hardness: +(rnd(i) * 10).toFixed(1), light: /torch|glow|lava/.test(n) ? 14 : 0, solid: !/water|torch/.test(n), tint: hex(i) })),
  })
  gg.table('mob', {
    cols: [{ k: 'name', type: 'str' }, { k: 'HP', type: 'num', min: 1, max: 200, step: 1 }, { k: 'ATK', type: 'num', min: 0, max: 20, step: .5 }, { k: 'speed', type: 'num', min: 0, max: 3, step: .05 }, { k: 'hostile', type: 'bool' }],
    rows: ['zombie', 'skeleton', 'creeper', 'spider', 'pig', 'cow', 'sheep', 'chicken'].map((n, i) => ({ id: n, name: n, HP: 10 + i * 6, ATK: [3, 2, 0, 2, 0, 0, 0, 0][i], speed: +(.4 + rnd(i) * .6).toFixed(2), hostile: i < 4 })),
  })
}
