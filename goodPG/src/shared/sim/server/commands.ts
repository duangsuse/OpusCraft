// Comandos del chat. Nombres canónicos en español (se aceptan tal cual) más alias en inglés y en chino,
// con tolerancia a mayúsculas, tildes, guiones y erratas (prefijo / subcadena / distancia de edición).
// /tp lo resuelve el cliente (/voz y /grupo también); aquí sólo se reconocen para no responder «no existe».
import { hardBosses, BOSS_MODES, type BossMode } from '../../bossRules'; // jefes reforzados
import { MOB_ENDER_DRAGON } from '../../mobs'; // Fase 8.6
import type { GameMode } from '../../protocol';
import { ITEMS, maxStack } from '../../items';
import { MOBS, MOB_TYPES } from '../../mobs';
import { MOB_CREEPER } from '../../mobs'; // Fase 6.5 (colecciones)
import { standable } from '../pathfind';
import { EFFECTS, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS, effectByName } from '../../effects';
import type { ServerContext, Session } from './context';
import type { Raids } from './raids'; // Fase 6 (asaltos)
import { locateStructure, STRUCTURE_NAMES, LOCATE_REGIONS } from '../../world/structures';
import { locateNetherStructure, NETHER_STRUCTURE_NAMES, NETHER_STRUCTURE_OF } from '../../world/netherStructures'; // Fase 8.4
import { enchantByName, ENCHANTS, ENCHANT_IDS, MAX_ENCHANT_LEVEL } from '../../enchantments'; // Fase 7 (encantamientos)
import { EndGenerator } from '../../world/end'; // Fase 8.6
import { DIM_OVERWORLD, DIM_NETHER, DIM_END, dimensionByKey, dimensionDef, allDimensions } from '../../dimensions'; // Fase 8 (dimensiones)
import { BLOCKS, isValidBlockId } from '../../blocks';
import { MIN_Y, MAX_Y, WORLD_LIMIT, CHUNK_SIZE } from '../../constants';

/** Bloques como máximo en un /fill (como en Minecraft). */
const MAX_FILL = 32768;

/** Nombres que acepta /localizar (sin tildes, en minúsculas). */
export const STRUCTURE_ALIASES: Readonly<Record<string, string>> = {
  templo_del_desierto: 'desert_pyramid', templo_desierto: 'desert_pyramid', piramide: 'desert_pyramid',
  templo_de_la_jungla: 'jungle_temple', templo_jungla: 'jungle_temple', naufragio: 'shipwreck',
  portal_en_ruinas: 'ruined_portal', portal: 'ruined_portal', iglu: 'igloo', pozo_del_desierto: 'desert_well',
  pozo: 'desert_well', mina_abandonada: 'mineshaft', mina: 'mineshaft',
  aldea: 'village',
  puesto: 'pillager_outpost', puesto_de_saqueadores: 'pillager_outpost', puesto_saqueador: 'pillager_outpost', // Fase 6 (asaltos)
  ciudad_antigua: 'ancient_city', ciudad: 'ancient_city', // Fase 7.5 (abismo)
  // Fase 7.5 (océano)
  monumento: 'monument', monumento_oceanico: 'monument', ruinas: 'ocean_ruins', ruinas_oceanicas: 'ocean_ruins',
  tesoro: 'buried_treasure', tesoro_enterrado: 'buried_treasure',
  cabana_de_bruja: 'swamp_hut', cabana: 'swamp_hut', choza_de_bruja: 'swamp_hut', fosil: 'fossil', fosiles: 'fossil', // Fase 7.5 (fauna)
  mansion: 'mansion', mansion_del_bosque: 'mansion', // Fase 7.5 (mansión)
  // Fase 8.4 (estructuras del Nether)
  fortaleza: 'fortress', fortaleza_del_nether: 'fortress', bastion: 'bastion_remnant', bastion_en_ruinas: 'bastion_remnant',
  ciudad_del_end: 'end_city', ciudad_end: 'end_city', // Fase 8.6 (en el End, «ciudad» también)
};

/** Comandos: nombre canónico + alias (español, inglés y chino). */
const COMMANDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['ayuda', ['help', '帮助', '命令']],
  ['modo', ['gamemode', '模式', '游戏模式']],
  ['dificultad', ['difficulty', '难度']],
  ['jefes', ['bosses', '首领']],
  ['hora', ['time', '时间']],
  ['invocar', ['summon', '召唤']],
  ['dar', ['give', '给予', '给']],
  ['efecto', ['effect', '效果']],
  ['matar', ['kill', '杀死', '杀']],
  ['voz', ['语音']],
  ['grupo', ['组队', '队伍']],
  ['tp', ['传送']],
  ['noclip', ['穿墙', '无碰撞']],
  ['localizar', ['locate', '定位', '寻找']],
  ['asalto', ['raid', '袭击']],
  ['patrulla', ['patrol', '巡逻']],
  ['encantar', ['enchant', '附魔']],
  ['experiencia', ['xp', '经验']],
  ['semilla', ['seed', '种子']],
  ['lista', ['list', '列表', '玩家列表']],
  ['dimension', ['dimensión', '维度']],
  ['setblock', ['放置方块', '设块']],
  ['fill', ['填充']],
];

/** Ayuda corta de cada comando (la usa /ayuda y la devuelven los errores de uso). */
const USAGE: Readonly<Record<string, string>> = {
  ayuda: '用法：/帮助 [命令] —— 不加参数时列出全部命令。',
  modo: '用法：/模式 <生存|创造>',
  dificultad: '用法：/难度 <和平|简单|普通|困难>',
  jefes: '用法：/首领 <自动|原版|强化>（自动：困难时强化）',
  hora: '用法：/时间 <白天|正午|日落|夜晚|午夜|日出|0-24000>',
  invocar: '用法：/召唤 <生物> [充能] · /召唤 闪电',
  dar: '用法：/给予 <物品> [1-576]（例如 /给予 diamond 5、/给予 钻石 5）',
  efecto: '用法：/效果 <效果> [秒] [等级] · /效果 清除',
  matar: '用法：/杀死 [生物]（不带参数：直接死亡）',
  voz: '用法：/语音 [on|off|静音 <玩家>|取消静音 <玩家>|音量 <玩家> <0-200>]',
  grupo: '用法：/组队 [名称|退出]',
  tp: '用法：/传送 <玩家>',
  noclip: '用法：/穿墙 [开|关]（忽略方块碰撞，空格/Shift 上下移动；仅自己可见）',
  localizar: '用法：/定位 <结构>（例如 /定位 村庄、/定位 要塞）',
  asalto: '用法：/袭击（在最近的村庄发起袭击）',
  patrulla: '用法：/巡逻（在附近生成掠夺者巡逻队）',
  encantar: '用法：/附魔 <附魔> [等级]（作用于手上的物品）',
  experiencia: '用法：/经验 <数量> [点数|等级]',
  semilla: '用法：/种子',
  lista: '用法：/列表',
  dimension: '用法：/维度 <主世界|下界|末地> [x y z]',
  setblock: '用法：/放置方块 <x> <y> <z> <方块>（坐标可用 ~ 表示相对位置）',
  fill: '用法：/填充 <x1> <y1> <z1> <x2> <y2> <z2> <方块>（最多 32768 块）',
};

/** Texto sin tildes ni mayúsculas. */
const strip = (v: string): string => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Forma de comparación: sin tildes, sin mayúsculas y con «_»/«-» como espacio. */
const keyify = (v: string): string => strip(v).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

interface Candle<T> {
  value: T;
  names: string[];
}

/** Distancia de Levenshtein (sólo para textos cortos de comandos y nombres). */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Busca la mejor coincidencia entre `raw` y los nombres de cada candidato. */
function fuzzy<T>(raw: string, cands: Candle<T>[]): T | Candle<T>[] | null {
  const q = keyify(raw);
  if (!q) return null;
  const exact = cands.filter((c) => c.names.some((n) => keyify(n) === q));
  if (exact.length === 1) return exact[0].value;
  if (exact.length > 1) return exact;
  const starts = cands.filter((c) => c.names.some((n) => keyify(n).startsWith(q)));
  if (starts.length === 1) return starts[0].value;
  if (starts.length > 1) {
    // El nombre más corto es el más concreto (p. ej. «村庄» antes que «村庄_…»).
    const size = (c: Candle<T>) => Math.min(...c.names.filter(Boolean).map((n) => keyify(n).length));
    starts.sort((a, b) => size(a) - size(b));
    if (size(starts[0]) !== size(starts[1])) return starts[0].value;
    return starts.slice(0, 5);
  }
  const inside = cands.filter((c) => c.names.some((n) => keyify(n).includes(q)));
  if (inside.length === 1) return inside[0].value;
  if (inside.length > 1) return inside.slice(0, 5);
  const max = q.length <= 3 ? 1 : q.length <= 6 ? 2 : 3;
  let best: Candle<T>[] = [];
  let bestD = Infinity;
  for (const c of cands) {
    for (const n of c.names) {
      if (!n) continue;
      const d = distance(q, keyify(n));
      if (d < bestD) {
        bestD = d;
        best = [c];
      } else if (d === bestD && !best.includes(c)) best.push(c);
    }
  }
  if (bestD > max) return null;
  if (best.length === 1) return best[0].value;
  return best.slice(0, 5);
}

const isList = <T,>(v: T | Candle<T>[] | null): v is Candle<T>[] => Array.isArray(v);

/** Nombre legible de un candidato: prefiere el chino (el key es sólo para escribir). */
export const prettyName = (names: string[]): string => names.find((n) => /[\u4e00-\u9fff]/.test(n)) ?? names.find(Boolean) ?? '';

/** Lista corta de nombres para «有多个…符合…». */
const namesOf = <T,>(cands: Candle<T>[]): string => [...new Set(cands.map((c) => prettyName(c.names)))].slice(0, 5).join('、');

export class Commands {
  /** Fase 6 (asaltos): para /asalto y /patrulla. */
  raids: Raids | null = null;
  /** Fase 6.5 (colecciones): para /invocar rayo. */
  lightning: ((x: number, y: number, z: number) => void) | null = null;

  constructor(private ctx: ServerContext) {}

  /** Etiqueta corta de un comando: su alias chino si lo tiene. */
  private static label(names: string[]): string {
    return names.find((n) => /[\u4e00-\u9fff]/.test(n)) ?? names[0];
  }

  /** Resuelve el nombre escrito a un comando canónico o a un mensaje de error con sugerencias. */
  private resolve(raw: string): { cmd: string } | { error: string } {
    const q = keyify(raw);
    const cands: Candle<string>[] = COMMANDS.map(([name, aliases]) => ({ value: name, names: [name, ...aliases] }));
    const listOf = (cs: Candle<string>[]): string => cs.map((c) => '/' + Commands.label(c.names)).join('、');
    const exact = cands.filter((c) => c.names.some((n) => keyify(n) === q));
    if (exact.length === 1) return { cmd: exact[0].value };
    const starts = cands.filter((c) => c.names.some((n) => keyify(n).startsWith(q)));
    if (starts.length === 1) return { cmd: starts[0].value };
    if (starts.length > 1) return { error: `「/${raw}」对应多个命令：${listOf(starts)}。请写得更具体。` };
    const inside = cands.filter((c) => c.names.some((n) => keyify(n).includes(q)));
    if (inside.length === 1) return { cmd: inside[0].value };
    if (inside.length > 1) return { error: `「/${raw}」对应多个命令：${listOf(inside)}。请写得更具体。` };
    // Errata: si hay un único comando a la distancia mínima y es corta, se acepta tal cual.
    const max = q.length <= 3 ? 1 : q.length <= 6 ? 2 : 3;
    let best: Candle<string>[] = [];
    let bestD = Infinity;
    for (const c of cands) {
      for (const n of c.names) {
        const d = distance(q, keyify(n));
        if (d < bestD) {
          bestD = d;
          best = [c];
        } else if (d === bestD && !best.includes(c)) best.push(c);
      }
    }
    if (bestD <= max) {
      if (best.length === 1) return { cmd: best[0].value };
      return { error: `未知命令：/${raw}。你是不是想用：${listOf(best.slice(0, 3))}？用 /帮助 查看命令列表。` };
    }
    return { error: `未知命令：/${raw}。用 /帮助 查看命令列表。` };
  }

  run(s: Session, line: string): void {
    const ctx = this.ctx;
    const [cmdRaw, ...args] = line.slice(1).split(/\s+/);
    const reply = (m: string) => ctx.tell(s, m);
    const usage = (cmd: string): void => reply(USAGE[cmd] ?? USAGE.ayuda);
    const resolved = this.resolve(cmdRaw.toLowerCase());
    if ('error' in resolved) {
      reply(resolved.error);
      return;
    }
    const cmd = resolved.cmd;
    // /tp, /voz, /grupo y /noclip los resuelve el cliente: aquí sólo se reconocen.
    if (cmd === 'tp' || cmd === 'voz' || cmd === 'grupo' || cmd === 'noclip') return;

    switch (cmd) {
      case 'hora': {
        const sub = keyify(args[0] ?? '');
        const val = keyify(args[1] ?? args[0] ?? '');
        const presets: Record<string, number> = {
          day: 0.05, dia: 0.05, 白天: 0.05, 清晨: 0.05, 早晨: 0.08,
          noon: 0.25, mediodia: 0.25, 正午: 0.25,
          sunset: 0.47, atardecer: 0.47, 日落: 0.47, 黄昏: 0.47, 傍晚: 0.47,
          night: 0.55, noche: 0.55, 夜晚: 0.55, 深夜: 0.62,
          midnight: 0.75, medianoche: 0.75, 午夜: 0.75,
          sunrise: 0.98, amanecer: 0.98, 日出: 0.98, 黎明: 0.98,
        };
        const now = ctx.worldTime();
        const day = Math.floor(now);
        let target: number | null = null;
        if (presets[val] !== undefined) target = presets[val];
        else if (/^\d+(\.\d+)?$/.test(val)) target = (Number(val) % 24000) / 24000;
        const setWord = sub === 'set' || sub === '设置';
        if (target === null || !Number.isFinite(target) || (!setWord && presets[sub] === undefined && !/^\d/.test(sub))) {
          usage('hora');
          return;
        }
        ctx.setTime(day + (target < now - day ? 1 : 0) + target);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} 改变了时间。` });
        return;
      }
      // Fase 8: /setblock y /fill (coordenadas absolutas o relativas con ~), como en Minecraft.
      case 'setblock':
      case 'fill': {
        const fill = cmd === 'fill';
        const n = fill ? 6 : 3;
        const base = [Math.floor(s.p[0]), Math.floor(s.p[1]), Math.floor(s.p[2])];
        const coord = (v: string | undefined, i: number): number => {
          if (v === undefined) return NaN;
          const clean = v.replace(/,/g, '');
          if (clean.startsWith('~')) return base[i % 3] + (clean.length > 1 ? Number(clean.slice(1)) : 0);
          return Number(clean);
        };
        const c = args.slice(0, n).map((v, i) => coord(v, i));
        const key = args[n] ?? '';
        const blockCands: Candle<number>[] = BLOCKS.map((b, id) => (b ? { value: id, names: [b.key, b.name] } : null))
          .filter((v): v is Candle<number> => v !== null);
        const found = fuzzy(key, blockCands);
        const block = typeof found === 'number' ? found : -1;
        if (isList(found)) {
          reply(`有多个方块符合「${key}」：${namesOf(found)}。`);
          return;
        }
        if (c.length !== n || !c.every(Number.isInteger) || block < 0 || !isValidBlockId(block)) {
          usage(cmd);
          return;
        }
        const [x0, y0, z0] = c;
        const [x1, y1, z1] = fill ? c.slice(3) : c;
        const lo = [Math.min(x0, x1), Math.max(MIN_Y, Math.min(y0, y1)), Math.min(z0, z1)];
        const hi = [Math.max(x0, x1), Math.min(MAX_Y - 1, Math.max(y0, y1)), Math.max(z0, z1)];
        const count = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
        if (count > MAX_FILL || Math.max(Math.abs(lo[0]), Math.abs(hi[0]), Math.abs(lo[2]), Math.abs(hi[2])) > WORLD_LIMIT) {
          reply(`方块太多（最多 ${MAX_FILL} 块）。`);
          return;
        }
        for (let cz = Math.floor(lo[2] / CHUNK_SIZE); cz <= Math.floor(hi[2] / CHUNK_SIZE); cz++) {
          for (let cx = Math.floor(lo[0] / CHUNK_SIZE); cx <= Math.floor(hi[0] / CHUNK_SIZE); cx++) ctx.world.ensureChunk(cx, cz, ctx.now());
        }
        ctx.asActor(s.id, () => {
          for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) ctx.world.setBlock(x, y, z, block);
        });
        reply(fill ? `已改变 ${count} 个方块。` : '方块已改变。');
        return;
      }
      // Fase 8: ir a otra dimensión (a su punto de aparición, o a x y z si se dan).
      case 'dimension': {
        const dimNames: Record<string, string> = { overworld: '主世界', nether: '下界', end: '末地' };
        const cands: Candle<string>[] = allDimensions().map((d) => ({ value: d.key, names: [d.key, d.name, dimNames[d.key] ?? ''] }));
        const hit = fuzzy(args[0] ?? '', cands);
        if (isList(hit)) {
          reply(`有多个维度符合「${args[0]}」：${namesOf(hit)}。`);
          return;
        }
        const d = typeof hit === 'string' ? dimensionByKey(hit) : -1;
        if (d < 0) {
          usage('dimension');
          return;
        }
        if (d === ctx.dim) {
          reply(`你已经在${dimensionDef(d).name}了。`);
          return;
        }
        const [x, y, z] = args.slice(1, 4).map((v) => Number(v.replace(/,/g, '')));
        const at = [x, y, z].every(Number.isFinite) ? { x, y, z } : {};
        if (!ctx.travel(s, d, { kind: 'pos', ...at })) reply('这里不能切换维度。');
        return;
      }
      case 'modo': {
        const v = keyify(args[0] ?? '');
        const mode: GameMode | null = ['s', '0', 'survival', 'supervivencia', '生存', '生存模式'].includes(v) ? 's'
          : ['c', '1', 'creative', 'creativo', '创造', '创造模式'].includes(v) ? 'c' : null;
        if (!mode) {
          usage('modo');
          return;
        }
        s.mode = mode;
        ctx.savePlayer(s);
        ctx.send(s, { t: 'gm', m: mode });
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} 切换到了${mode === 's' ? '生存' : '创造'}模式。` });
        return;
      }
      case 'dificultad': {
        const v = keyify(args[0] ?? '');
        const map: Record<string, number> = {
          pacifico: 0, peaceful: 0, '0': 0, 和平: 0,
          facil: 1, easy: 1, '1': 1, 简单: 1,
          normal: 2, '2': 2, 普通: 2,
          dificil: 3, hard: 3, '3': 3, 困难: 3,
        };
        if (!(v in map)) {
          usage('dificultad');
          return;
        }
        ctx.setDifficulty(map[v]);
        const names = ['和平', '简单', '普通', '困难'];
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `难度：${names[ctx.difficulty]}。` });
        return;
      }
      case 'jefes': {
        // Jefes reforzados (bossRules.ts): auto (en difícil), java (como en Java) o duros (siempre).
        const zh: Record<string, BossMode> = { 自动: 'auto', 原版: 'java', 强化: 'duros' };
        const v = keyify(args[0] ?? '');
        const mode = zh[v] ?? ((BOSS_MODES as readonly string[]).includes(v) ? (v as BossMode) : null);
        if (!mode) {
          const now = hardBosses(ctx.bossMode, ctx.difficulty) ? '强化' : '原版';
          reply(`首领：${ctx.bossMode}（当前为${now}）。${USAGE.jefes}`);
          return;
        }
        ctx.setBossMode(mode);
        const now = hardBosses(ctx.bossMode, ctx.difficulty);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `首领：${mode}${now ? ' —— 龙会按玩家数量增加生命，并在最后狂暴。' : ' —— 与原版一致。'}` });
        return;
      }
      case 'efecto': {
        // /efecto <efecto> [segundos] [nivel] · /efecto quitar
        const v = keyify(args[0] ?? '');
        if (['quitar', 'clear', '清除', '移除', '清空'].includes(v)) {
          ctx.send(s, { t: 'effect', id: 0, s: 0, a: 0 });
          return;
        }
        const cands: Candle<number>[] = Object.values(EFFECTS).map((e) => ({ value: e.id, names: [e.key, e.name] }));
        const hit = fuzzy(args[0] ?? '', cands);
        if (isList(hit)) {
          reply(`有多个效果符合「${args[0]}」：${namesOf(hit)}。`);
          return;
        }
        const def = typeof hit === 'number' ? { id: hit } : effectByName(args[0] ?? '');
        if (!def) {
          usage('efecto');
          return;
        }
        const secs = Math.max(1, Math.min(MAX_EFFECT_SECONDS, Math.floor(Number(args[1]) || 30)));
        const amp = Math.max(0, Math.min(MAX_EFFECT_AMP, Math.floor(Number(args[2]) || 1) - 1));
        ctx.send(s, { t: 'effect', id: def.id, s: secs, a: amp });
        return;
      }
      case 'matar': {
        // Fase 8.6: /matar <criatura> (como /kill @e[type=…]): las de ese tipo a menos de 256 bloques; el dragón muere
        // como en el combate (va al podio y se consume).
        const raw = args.join(' ');
        if (raw) {
          const cands: Candle<number>[] = MOB_TYPES.map((t) => ({ value: t, names: [MOBS[t].key, MOBS[t].name] }));
          const hit = fuzzy(raw, cands);
          if (isList(hit)) {
            reply(`有多个生物符合「${raw}」：${namesOf(hit)}。`);
            return;
          }
          const def = typeof hit === 'number' ? MOBS[hit] : null;
          if (!def) {
            reply(`没有找到生物「${raw}」。${USAGE.matar}`);
            return;
          }
          let n = 0;
          for (const e of [...ctx.entities.list.values()]) {
            if (e.type !== def.id || e.dead || Math.hypot(e.x - s.p[0], e.z - s.p[2]) > 256) continue;
            if (e.type === MOB_ENDER_DRAGON) ctx.entities.dragon.hurt(e, 0, 1e6, s.id);
            else ctx.entities.kill(e, true);
            n++;
          }
          reply(n ? `已清除 ${n} 个。` : '附近没有这种生物。');
          return;
        }
        ctx.send(s, { t: 'hurt', a: 1000, k: [0, 0, 0], c: 'kill' });
        return;
      }
      case 'invocar': {
        const v = keyify(args[0] ?? '');
        // Fase 6.5 (colecciones): /invocar rayo (a 3 bloques delante, en lo alto de la columna).
        if (['rayo', 'lightning bolt', '闪电', '雷', '雷电'].includes(v) && this.lightning) {
          const lx = Math.floor(s.p[0] - Math.sin(s.r[0]) * 3), lz = Math.floor(s.p[2] - Math.cos(s.r[0]) * 3);
          this.lightning(lx + 0.5, ctx.world.skyTop(lx, lz) + 1, lz + 0.5);
          return;
        }
        const cands: Candle<number>[] = MOB_TYPES.map((t) => ({ value: t, names: [MOBS[t].key, MOBS[t].name] }));
        const hit = fuzzy(v, cands);
        if (isList(hit)) {
          reply(`有多个生物符合「${args[0]}」：${namesOf(hit)}。`);
          return;
        }
        const def = typeof hit === 'number' ? MOBS[hit] : null;
        if (!def) {
          usage('invocar');
          return;
        }
        // Delante del jugador, en el primer hueco donde quepa de pie.
        const a = s.r[0];
        const tx = Math.floor(s.p[0] - Math.sin(a) * 3), tz = Math.floor(s.p[2] - Math.cos(a) * 3);
        ctx.world.ensureChunk(Math.floor(tx / 16), Math.floor(tz / 16), ctx.now());
        const h = Math.ceil(def.height);
        let y = Math.floor(s.p[1]);
        let found = false;
        for (let dy = 0; dy <= 12 && !found; dy++) {
          for (const cand of [y + dy, y - dy]) {
            if (standable(ctx.world, tx, cand, tz, h)) {
              y = cand;
              found = true;
              break;
            }
          }
        }
        const mob = found ? ctx.entities.spawnMob(def.id, tx + 0.5, y, tz + 0.5) : ctx.entities.spawnMob(def.id, s.p[0], s.p[1] + 0.1, s.p[2]);
        // Fase 6.5 (colecciones): /invocar creeper cargado.
        if (mob && def.id === MOB_CREEPER && ['cargado', 'charged', '充能', '带电'].includes(keyify(args[1] ?? ''))) mob.charged = true;
        // Fase 8.3: como /summon, con su equipo al aparecer (armas de los piglins, tamaño del cubo de magma, jinetes…).
        if (mob) ctx.entities.mobs.nether.finalizeSpawn(mob, 'egg');
        return;
      }
      case 'dar': {
        const v = keyify(args[0] ?? '');
        const cands: Candle<number>[] = ITEMS.map((it) => (it ? { value: it.id, names: [it.key, it.name] } : null))
          .filter((x): x is Candle<number> => x !== null);
        const hit = fuzzy(v, cands);
        if (isList(hit)) {
          reply(`有多个物品符合「${args[0]}」：${namesOf(hit)}。`);
          return;
        }
        const item = typeof hit === 'number' ? ITEMS[hit] : null;
        if (!item) {
          usage('dar');
          return;
        }
        let n = Math.max(1, Math.min(64 * 9, Number(args[1]) || 1));
        while (n > 0) {
          const c = Math.min(n, maxStack(item.id));
          ctx.entities.spawnItem({ id: item.id, count: c }, s.p[0], s.p[1] + 0.5, s.p[2], 0, 0, 0, undefined, 0);
          n -= c;
        }
        return;
      }
      case 'localizar': {
        // /localizar <estructura>: la más cercana de ese tipo.
        const cands: Candle<string>[] = Object.entries(STRUCTURE_ALIASES).map(([alias, type]) => ({
          value: alias,
          names: [alias, STRUCTURE_NAMES[type] ?? '', NETHER_STRUCTURE_NAMES[type] ?? ''],
        }));
        const hit = fuzzy(args.join(' '), cands);
        let key: string | null = typeof hit === 'string' ? hit : null;
        if (isList(hit)) {
          // Varias alias del mismo tipo (aldea/aldea_x/…) no son ambigüedad: cuentan como una.
          const types = new Set(hit.map((c) => STRUCTURE_ALIASES[String(c.value)]));
          if (types.size === 1) key = String(hit[0].value);
          else {
            reply(`有多个结构符合「${args.join(' ')}」：${namesOf(hit)}。`);
            return;
          }
        }
        if (!key) {
          usage('localizar');
          return;
        }
        // Fase 8.6: en el End, sólo las ciudades del End.
        if (ctx.dim === DIM_END || STRUCTURE_ALIASES[key] === 'end_city') {
          const gen = ctx.world.gen;
          if (ctx.dim !== DIM_END || !(gen instanceof EndGenerator) || (key !== 'ciudad' && STRUCTURE_ALIASES[key] !== 'end_city')) {
            reply(`${dimensionDef(ctx.dim).name}没有这种结构。`);
            return;
          }
          const q = gen.locateCity(Math.floor(s.p[0]), Math.floor(s.p[2]), LOCATE_REGIONS);
          if (!q) reply('附近没有末地城。');
          else reply(`最近的末地城：x ${q[0]}, y ${q[1]}, z ${q[2]}（距离 ${Math.round(Math.hypot(q[0] - s.p[0], q[2] - s.p[2]))} 格）。`);
          return;
        }
        // Fase 8.4: en el Nether, «fosil» y «portal_en_ruinas» son los suyos.
        // Fase 8.6: en el mundo normal, «fortaleza» es la del portal del End.
        const type = ctx.dim === DIM_NETHER ? NETHER_STRUCTURE_OF[STRUCTURE_ALIASES[key]] ?? STRUCTURE_ALIASES[key]
          : key === 'fortaleza' ? 'stronghold' : STRUCTURE_ALIASES[key];
        // Fase 8.4: en el Nether, las suyas (fortalezas, bastiones…); en el mundo normal, las demás.
        const netherType = NETHER_STRUCTURE_NAMES[type] !== undefined;
        if (netherType !== (ctx.dim === DIM_NETHER) || (ctx.dim !== DIM_OVERWORLD && ctx.dim !== DIM_NETHER)) {
          reply(`${dimensionDef(ctx.dim).name}没有这种结构。`);
          return;
        }
        if (netherType) {
          const q = locateNetherStructure(ctx.world.gen, type, Math.floor(s.p[0]), Math.floor(s.p[2]), LOCATE_REGIONS);
          const name = NETHER_STRUCTURE_NAMES[type];
          if (!q) reply(`附近没有${name}。`);
          else reply(`最近的${name}：x ${q[0]}, y ${q[1]}, z ${q[2]}（距离 ${Math.round(Math.hypot(q[0] - s.p[0], q[2] - s.p[2]))} 格）。`);
          return;
        }
        const p = locateStructure(ctx.world.gen, type, Math.floor(s.p[0]), Math.floor(s.p[2]), LOCATE_REGIONS); // Fase 7.5: como en Minecraft
        const name = STRUCTURE_NAMES[type];
        if (!p) reply(`附近没有${name}。`);
        else reply(`最近的${name}：x ${p[0]}, y ${p[1]}, z ${p[2]}（距离 ${Math.round(Math.hypot(p[0] - s.p[0], p[2] - s.p[2]))} 格）。`);
        return;
      }
      // Fase 6 (asaltos): lanzar un asalto en la aldea más cercana (hasta 200 bloques) o una patrulla.
      case 'asalto': {
        if (!this.raids) return;
        const v = locateStructure(ctx.world.gen, 'village', Math.floor(s.p[0]), Math.floor(s.p[2]), 1);
        if (!v || Math.hypot(v[0] - s.p[0], v[2] - s.p[2]) > 200) {
          reply('附近没有村庄（200 格内）。');
          return;
        }
        if (ctx.difficulty === 0) {
          reply('和平难度下不会发生袭击。');
          return;
        }
        this.raids.start(v[0], v[1], v[2]);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} 在 x ${v[0]}, z ${v[2]} 的村庄发动了袭击。` });
        return;
      }
      case 'patrulla': {
        if (!this.raids) return;
        const n = this.raids.spawnPatrol(s.p[0], s.p[2]).length;
        reply(n ? `附近出现了 ${n} 名掠夺者组成的巡逻队。` : '这里没有空间生成巡逻队。');
        return;
      }
      // Fase 7 (encantamientos): /encantar <encantamiento> [nivel] (al objeto de la mano; lo aplica el cliente)
      // y /experiencia <cantidad> [niveles|puntos].
      case 'encantar': {
        const cands: Candle<number>[] = ENCHANT_IDS.map((id) => ({ value: id, names: [ENCHANTS[id].key, ENCHANTS[id].name] }));
        const hit = fuzzy(args[0] ?? '', cands);
        if (isList(hit)) {
          reply(`有多个附魔符合「${args[0]}」：${namesOf(hit)}。`);
          return;
        }
        const def = typeof hit === 'number' ? { id: hit } : enchantByName(args[0] ?? '');
        if (!def) {
          usage('encantar');
          return;
        }
        const lvl = Math.max(1, Math.min(MAX_ENCHANT_LEVEL, Math.floor(Number(args[1]) || 1)));
        ctx.send(s, { t: 'ench', e: [[def.id, lvl]] });
        return;
      }
      case 'experiencia': {
        const n = Math.floor(Number(String(args[0] ?? '').replace(/,/g, '')));
        const unit = keyify(args[1] ?? 'puntos');
        if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
          usage('experiencia');
          return;
        }
        if (['nivel', 'niveles', 'levels', 'l', '级', '等级'].includes(unit)) ctx.send(s, { t: 'xp', n: 0, l: Math.min(n, 10_000) });
        else ctx.send(s, { t: 'xp', n });
        return;
      }
      case 'semilla':
        reply(`世界种子：${ctx.seed}`);
        return;
      case 'lista':
        reply('玩家：' + [...ctx.sessions()].filter((o) => o.joined).map((o) => o.name).join('，'));
        return;
      case 'ayuda': {
        const asked = args[0];
        if (asked) {
          const r = this.resolve(asked.toLowerCase());
          if ('cmd' in r && USAGE[r.cmd]) {
            reply(USAGE[r.cmd]);
            return;
          }
        }
        reply(
          '命令：/帮助 /模式 /难度 /首领 /时间 /召唤 /给予 /效果 /杀死 /传送 /定位 /袭击 /巡逻 /附魔 /经验 /种子 /列表 /维度 /放置方块 /填充 /穿墙' +
          '（用 /帮助 <命令> 看用法；也接受西语原名，如 /modo、/give）',
        );
        return;
      }
      default:
        usage(cmd);
    }
  }
}
