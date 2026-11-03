// Los comandos del chat tal como los entiende el servidor (server/commands.ts): nombre, alias,
// descripción y argumentos con sus opciones. Lo usa el asistente del chat para sugerir y explicar.
// Los nombres canónicos siguen en español (son los que ejecuta el servidor); los alias chinos son atajos.
import { EFFECTS } from '../../shared/effects';
import { MOBS, MOB_TYPES } from '../../shared/mobs';
import { ITEMS } from '../../shared/items';
import { STRUCTURE_NAMES } from '../../shared/world/structures';
import { NETHER_STRUCTURE_NAMES } from '../../shared/world/netherStructures'; // Fase 8.4
import { ENCHANTS, ENCHANT_IDS } from '../../shared/enchantments'; // Fase 7 (encantamientos)
import { BLOCKS } from '../../shared/blocks'; // Fase 8: /setblock y /fill
import { allDimensions } from '../../shared/dimensions'; // Fase 8: /dimension

export interface Option {
  /** Lo que se escribe. */
  value: string;
  /** Nombre legible (en chino) que se muestra al lado. */
  label?: string;
  /** Objeto cuyo icono se muestra. */
  item?: number;
}

export interface ArgSpec {
  name: string;
  optional?: boolean;
  desc: string;
  /** Opciones sugeridas (si no hay, sólo se explica el argumento). */
  options?: (players: string[]) => Option[];
}

export interface CommandSpec {
  name: string;
  aliases?: string[];
  desc: string;
  args: ArgSpec[];
}

export const norm = (v: string): string => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const underscore = (s: string) => norm(s).replace(/\s+/g, '_');

// Las listas largas se calculan una vez, la primera vez que se piden.
let mobOptions: Option[] | null = null;
let itemOptions: Option[] | null = null;
let blockOptions: Option[] | null = null;
/** Fase 8: bloques para /setblock y /fill (los que se obtienen como objeto, más el aire). */
const blocks = (): Option[] => (blockOptions ??= [
  { value: 'air', label: '空气' },
  ...BLOCKS.filter((b) => b && b.category !== null && !b.noItem).map((b) => ({ value: b.key, label: b.name, item: b.id })),
]);
const coord = (name: string, optional = false): ArgSpec => ({
  name, optional, desc: '坐标（带 ~ 表示相对自己：~、~1、~-2）', options: () => [{ value: '~' }],
});

const STRUCTURES: [string, string][] = [
  ['aldea', 'village'], ['puesto', 'pillager_outpost'], ['templo_del_desierto', 'desert_pyramid'],
  ['templo_de_la_jungla', 'jungle_temple'], ['naufragio', 'shipwreck'], ['portal_en_ruinas', 'ruined_portal'],
  ['iglu', 'igloo'], ['pozo', 'desert_well'], ['mina', 'mineshaft'],
  ['ciudad_antigua', 'ancient_city'], // Fase 7.5 (abismo)
  ['monumento', 'monument'], ['ruinas', 'ocean_ruins'], ['tesoro', 'buried_treasure'], // Fase 7.5 (océano)
  ['cabana_de_bruja', 'swamp_hut'], ['fosil', 'fossil'], // Fase 7.5 (fauna)
  ['mansion', 'mansion'], // Fase 7.5 (mansión)
  ['fortaleza', 'fortress'], ['bastion', 'bastion_remnant'], // Fase 8.4 (estructuras del Nether)
  ['ciudad_del_end', 'end_city'], // Fase 8.6
];

export const COMMAND_SPECS: CommandSpec[] = [
  { name: 'ayuda', aliases: ['help', '帮助', '命令'], desc: '列出所有命令，或查看某个命令的用法', args: [{ name: '命令', optional: true, desc: '要看用法的命令（不填则列出全部）' }] },
  {
    name: 'modo', aliases: ['gamemode', '模式', '游戏模式'], desc: '切换你的游戏模式',
    args: [{
      name: '模式', desc: '生存或创造',
      options: () => [{ value: '生存', label: '有生命、饥饿和资源' }, { value: '创造', label: '飞行、无限方块' }],
    }],
  },
  {
    name: 'dificultad', aliases: ['difficulty', '难度'], desc: '修改世界难度',
    args: [{
      name: '难度', desc: '怪物造成的伤害（和平：不刷怪）',
      options: () => [
        { value: '和平', label: '没有怪物' }, { value: '简单', label: '伤害更低' },
        { value: '普通', label: '与原版一致' }, { value: '困难', label: '伤害更高、更危险' },
      ],
    }],
  },
  {
    name: 'jefes', aliases: ['bosses', '首领'], desc: '首领强化（龙会按玩家人数增加生命，并在最后狂暴）',
    args: [{
      name: '模式', desc: '何时强化',
      options: () => [
        { value: '自动', label: '困难时强化' }, { value: '原版', label: '与原版一致' },
        { value: '强化', label: '始终强化' },
      ],
    }],
  },
  {
    name: 'hora', aliases: ['time', '时间'], desc: '修改一天中的时间',
    args: [
      { name: 'set', optional: true, desc: '可选的「set」，与 /时间 set 白天 等价', options: () => [{ value: 'set', label: '设置' }] },
      {
        name: '时间', desc: '一天中的时刻，或 0 到 24000 的数字',
        options: () => [
          { value: '白天', label: '清晨' }, { value: '正午', label: '太阳最高' }, { value: '日落', label: '太阳落山' },
          { value: '夜晚', label: '怪物出现' }, { value: '午夜', label: '月亮最高' }, { value: '日出', label: '太阳升起' },
        ],
      },
    ],
  },
  {
    name: 'invocar', aliases: ['summon', '召唤'], desc: '在你面前生成一只生物',
    args: [
      {
        name: '生物', desc: '要生成的生物（「闪电」会召唤雷电）',
        options: () => [{ value: '闪电', label: '落下一道闪电' }, ...(mobOptions ??= MOB_TYPES.filter((t) => !MOBS[t].inert).map((t) => ({ value: underscore(MOBS[t].name), label: MOBS[t].key.replace(/_/g, ' ') })))],
      },
      { name: '状态', optional: true, desc: '只对苦力怕有效：充能', options: () => [{ value: '充能', label: '充能苦力怕' }] },
    ],
  },
  {
    name: 'dar', aliases: ['give', '给予', '给'], desc: '给你一件物品（掉在你脚下）',
    args: [
      {
        name: '物品', desc: '按中文名或英文 key 搜索',
        options: () => (itemOptions ??= ITEMS.filter((i) => i).map((i) => ({ value: i.key, label: i.name, item: i.id }))),
      },
      {
        name: '数量', optional: true, desc: '数量（默认 1，最多 576）',
        options: () => ['1', '8', '16', '32', '64', '576'].map((v) => ({ value: v })),
      },
    ],
  },
  {
    name: 'efecto', aliases: ['effect', '效果'], desc: '施加状态效果（或清除全部效果）',
    args: [
      {
        name: '效果', desc: '效果名称，或「清除」清空所有效果',
        options: () => [{ value: '清除', label: '清除所有效果' }, ...Object.values(EFFECTS).map((e) => ({ value: underscore(e.name), label: e.good ? '增益' : '减益' }))],
      },
      { name: '秒数', optional: true, desc: '持续时间（默认 30 秒，最多 3600）', options: () => ['30', '60', '300', '3600'].map((v) => ({ value: v })) },
      { name: '等级', optional: true, desc: '效果等级（默认 1，最多 5）', options: () => ['1', '2', '3', '4', '5'].map((v) => ({ value: v })) },
    ],
  },
  {
    name: 'matar', aliases: ['kill', '杀死', '杀'], desc: '立即死亡；带生物名时清除 256 格内该生物',
    args: [{
      name: '生物', optional: true, desc: '要清除的生物（不填则自己死亡）',
      options: () => (mobOptions ??= MOB_TYPES.filter((t) => !MOBS[t].inert).map((t) => ({ value: underscore(MOBS[t].name), label: MOBS[t].key.replace(/_/g, ' ') }))),
    }],
  },
  {
    name: 'voz', aliases: ['语音'], desc: '语音聊天：状态、开关，以及静音或调整某个玩家的音量',
    args: [
      {
        name: '操作', optional: true, desc: '做什么（不填则显示当前状态）',
        options: () => [
          { value: 'on', label: '开启语音聊天' }, { value: 'off', label: '关闭语音聊天' },
          { value: '静音', label: '不再听某个玩家' }, { value: '取消静音', label: '重新听到该玩家' },
          { value: '音量', label: '某个玩家的音量（0-200）' },
        ],
      },
      { name: '玩家', optional: true, desc: '对谁', options: (players) => players.map((p) => ({ value: p })) },
      { name: '音量', optional: true, desc: '百分比（100 正常，0 静音，最多 200）' },
    ],
  },
  {
    name: 'grupo', aliases: ['组队', '队伍'], desc: '语音分组：同组的人在任何距离都能互相听到',
    args: [{ name: '名称', optional: true, desc: '组名，或「退出」离开当前组', options: () => [{ value: '退出', label: '离开当前组' }] }],
  },
  {
    name: 'noclip', aliases: ['穿墙', '无碰撞'], desc: '忽略方块碰撞（仅本地；空格/Shift 上下移动）',
    args: [{ name: '状态', optional: true, desc: '开启或关闭（不填则切换）', options: () => [{ value: '开', label: '开启' }, { value: '关', label: '关闭' }] }],
  },
  {
    name: 'tp', aliases: ['传送'], desc: '传送到另一名玩家身边',
    args: [{ name: '玩家', desc: '要去谁那里', options: (players) => players.map((p) => ({ value: p })) }],
  },
  {
    name: 'localizar', aliases: ['locate', '定位', '寻找'], desc: '给出最近的结构的位置',
    args: [{
      name: '结构', desc: '要找什么',
      options: () => STRUCTURES.map(([value, key]) => ({ value, label: key === 'mineshaft' ? '废弃矿井' : STRUCTURE_NAMES[key] ?? NETHER_STRUCTURE_NAMES[key] })),
    }],
  },
  { name: 'asalto', aliases: ['raid', '袭击'], desc: '在最近的村庄发起袭击', args: [] },
  { name: 'patrulla', aliases: ['patrol', '巡逻'], desc: '在附近生成一队掠夺者巡逻队', args: [] },
  // Fase 7 (encantamientos)
  {
    name: 'encantar', aliases: ['enchant', '附魔'], desc: '给手上的物品附魔',
    args: [
      {
        name: '附魔', desc: '按中文名或 key 输入',
        options: () => ENCHANT_IDS.map((id) => ({ value: underscore(ENCHANTS[id].name), label: `最高 ${ENCHANTS[id].max} 级` })),
      },
      { name: '等级', optional: true, desc: '等级（默认 1，最多 10）', options: () => ['1', '2', '3', '4', '5'].map((v) => ({ value: v })) },
    ],
  },
  {
    name: 'experiencia', aliases: ['xp', '经验'], desc: '给你经验（点数或等级）',
    args: [
      { name: '数量', desc: '多少经验', options: () => ['10', '30', '100', '1000'].map((v) => ({ value: v })) },
      { name: '单位', optional: true, desc: '点数（默认）或等级', options: () => [{ value: '点数' }, { value: '等级' }] },
    ],
  },
  { name: 'semilla', aliases: ['seed', '种子'], desc: '显示世界种子', args: [] },
  { name: 'lista', aliases: ['list', '列表', '玩家列表'], desc: '在线玩家', args: [] },
  // Fase 8 (dimensiones)
  {
    name: 'dimension', aliases: ['dimensión', '维度'], desc: '前往另一个维度（出生点，或指定的 x y z）',
    args: [
      {
        name: '维度', desc: '要去哪里',
        options: () => allDimensions().map((d) => ({ value: d.key, label: d.name })),
      },
      coord('x', true), coord('y', true), coord('z', true),
    ],
  },
  {
    name: 'setblock', aliases: ['放置方块', '设块'], desc: '在指定坐标放置一个方块',
    args: [coord('x'), coord('y'), coord('z'), { name: '方块', desc: '方块（可用 key 或中文名）', options: blocks }],
  },
  {
    name: 'fill', aliases: ['填充'], desc: '用方块填满一个长方体（最多 32768 块）',
    args: [coord('x1'), coord('y1'), coord('z1'), coord('x2'), coord('y2'), coord('z2'), { name: '方块', desc: '方块（可用 key 或中文名）', options: blocks }],
  },
];

/** Comando por su nombre o un alias (sin tildes ni mayúsculas). */
export function findCommand(name: string): CommandSpec | undefined {
  const n = norm(name);
  return COMMAND_SPECS.find((c) => c.name === n || c.aliases?.includes(n));
}

/** Alias chino de un comando, si lo tiene (para mostrar la firma). */
const chineseAlias = (c: CommandSpec): string | undefined => c.aliases?.find((a) => /[\u4e00-\u9fff]/.test(a));

/** Firma legible: «/给予 <物品> [数量]». */
export function signature(c: CommandSpec): string {
  const name = chineseAlias(c) ?? c.name;
  return '/' + name + c.args.map((a) => (a.optional ? ` [${a.name}]` : ` <${a.name}>`)).join('');
}
