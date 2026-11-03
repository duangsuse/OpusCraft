// Comandos del chat (/modo, /dificultad, /time, /invocar, /dar, /matar, /seed, /lista, /ayuda).
// /tp lo resuelve el cliente.
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
import { enchantByName, MAX_ENCHANT_LEVEL } from '../../enchantments'; // Fase 7 (encantamientos)
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

export class Commands {
  /** Fase 6 (asaltos): para /asalto y /patrulla. */
  raids: Raids | null = null;
  /** Fase 6.5 (colecciones): para /invocar rayo. */
  lightning: ((x: number, y: number, z: number) => void) | null = null;

  constructor(private ctx: ServerContext) {}

  run(s: Session, line: string): void {
    const ctx = this.ctx;
    const [cmdRaw, ...args] = line.slice(1).split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const reply = (m: string) => ctx.tell(s, m);
    const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    switch (cmd) {
      case 'time':
      case 'hora': {
        const sub = norm(args[0] ?? '');
        const val = norm(args[1] ?? args[0] ?? '');
        const presets = new Map<string, number>([
          ['day', 0.05], ['dia', 0.05], ['noon', 0.25], ['mediodia', 0.25], ['sunset', 0.47], ['atardecer', 0.47],
          ['night', 0.55], ['noche', 0.55], ['midnight', 0.75], ['medianoche', 0.75], ['sunrise', 0.98], ['amanecer', 0.98],
        ]);
        const now = ctx.worldTime();
        const day = Math.floor(now);
        let target: number | null = null;
        if (presets.has(val)) target = presets.get(val)!;
        else if (/^\d+(\.\d+)?$/.test(val)) target = (Number(val) % 24000) / 24000;
        if (target === null || !Number.isFinite(target) || (sub !== 'set' && !presets.has(sub) && !/^\d/.test(sub))) {
          reply('Uso: /time set <dia|mediodia|atardecer|noche|medianoche|amanecer|0-24000>');
          return;
        }
        ctx.setTime(day + (target < now - day ? 1 : 0) + target);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} cambió la hora del día.` });
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
          if (v.startsWith('~')) return base[i % 3] + (v.length > 1 ? Number(v.slice(1)) : 0);
          return Number(v);
        };
        const c = args.slice(0, n).map((v, i) => coord(v, i));
        const key = norm(args[n] ?? '');
        const block = BLOCKS.findIndex((b) => b && (b.key === key || norm(b.name).replace(/ /g, '_') === key));
        if (c.length !== n || !c.every(Number.isInteger) || block < 0 || !isValidBlockId(block)) {
          reply(fill ? 'Uso: /fill <x1> <y1> <z1> <x2> <y2> <z2> <bloque>' : 'Uso: /setblock <x> <y> <z> <bloque>');
          return;
        }
        const [x0, y0, z0] = c;
        const [x1, y1, z1] = fill ? c.slice(3) : c;
        const lo = [Math.min(x0, x1), Math.max(MIN_Y, Math.min(y0, y1)), Math.min(z0, z1)];
        const hi = [Math.max(x0, x1), Math.min(MAX_Y - 1, Math.max(y0, y1)), Math.max(z0, z1)];
        const count = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
        if (count > MAX_FILL || Math.max(Math.abs(lo[0]), Math.abs(hi[0]), Math.abs(lo[2]), Math.abs(hi[2])) > WORLD_LIMIT) {
          reply(`Demasiados bloques (como mucho ${MAX_FILL}).`);
          return;
        }
        for (let cz = Math.floor(lo[2] / CHUNK_SIZE); cz <= Math.floor(hi[2] / CHUNK_SIZE); cz++) {
          for (let cx = Math.floor(lo[0] / CHUNK_SIZE); cx <= Math.floor(hi[0] / CHUNK_SIZE); cx++) ctx.world.ensureChunk(cx, cz, ctx.now());
        }
        ctx.asActor(s.id, () => {
          for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) ctx.world.setBlock(x, y, z, block);
        });
        reply(fill ? `${count} bloques cambiados.` : 'Bloque cambiado.');
        return;
      }
      // Fase 8: ir a otra dimensión (a su punto de aparición, o a x y z si se dan).
      case 'dimension':
      case 'dimensión': {
        const d = dimensionByKey(norm(args[0] ?? ''));
        const names = allDimensions().map((dd) => dd.key).join('|');
        if (d < 0) {
          reply(`Uso: /dimension <${names}> [x y z]`);
          return;
        }
        if (d === ctx.dim) {
          reply(`Ya estás en ${dimensionDef(d).name}.`);
          return;
        }
        const [x, y, z] = args.slice(1, 4).map(Number);
        const at = [x, y, z].every(Number.isFinite) ? { x, y, z } : {};
        if (!ctx.travel(s, d, { kind: 'pos', ...at })) reply('Aquí no se puede cambiar de dimensión.');
        return;
      }
      case 'gamemode':
      case 'modo': {
        const v = norm(args[0] ?? '');
        const mode: GameMode | null = ['s', '0', 'survival', 'supervivencia'].includes(v) ? 's'
          : ['c', '1', 'creative', 'creativo'].includes(v) ? 'c' : null;
        if (!mode) {
          reply('Uso: /modo <supervivencia|creativo>');
          return;
        }
        s.mode = mode;
        ctx.savePlayer(s);
        ctx.send(s, { t: 'gm', m: mode });
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} pasó al modo ${mode === 's' ? 'supervivencia' : 'creativo'}.` });
        return;
      }
      case 'difficulty':
      case 'dificultad': {
        const v = norm(args[0] ?? '');
        const map: Record<string, number> = {
          pacifico: 0, peaceful: 0, '0': 0, facil: 1, easy: 1, '1': 1, normal: 2, '2': 2, dificil: 3, hard: 3, '3': 3,
        };
        if (!(v in map)) {
          reply('Uso: /dificultad <pacifico|facil|normal|dificil>');
          return;
        }
        ctx.setDifficulty(map[v]);
        const names = ['pacífica', 'fácil', 'normal', 'difícil'];
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `Dificultad: ${names[ctx.difficulty]}.` });
        return;
      }
      case 'bosses':
      case 'jefes': {
        // Jefes reforzados (bossRules.ts): auto (en difícil), java (como en Java) o duros (siempre).
        const v = norm(args[0] ?? '');
        if (!(BOSS_MODES as readonly string[]).includes(v)) {
          const now = hardBosses(ctx.bossMode, ctx.difficulty) ? 'reforzados' : 'como en Java';
          reply(`Jefes: ${ctx.bossMode} (ahora, ${now}). Uso: /jefes <auto|java|duros> (auto: reforzados en difícil)`);
          return;
        }
        ctx.setBossMode(v as BossMode);
        const now = hardBosses(ctx.bossMode, ctx.difficulty);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `Jefes: ${v}${now ? ' — el dragón gana vida por cada jugador y se enfurece al final.' : ' — como en Java.'}` });
        return;
      }
      case 'effect':
      case 'efecto': {
        // /efecto <efecto> [segundos] [nivel] · /efecto quitar
        const v = norm(args[0] ?? '');
        if (v === 'quitar' || v === 'clear') {
          ctx.send(s, { t: 'effect', id: 0, s: 0, a: 0 });
          return;
        }
        const def = effectByName(args[0] ?? '');
        if (!def) {
          reply('Uso: /efecto <' + Object.values(EFFECTS).map((e) => e.key).join('|') + '> [segundos] [nivel] · /efecto quitar');
          return;
        }
        const secs = Math.max(1, Math.min(MAX_EFFECT_SECONDS, Math.floor(Number(args[1]) || 30)));
        const amp = Math.max(0, Math.min(MAX_EFFECT_AMP, Math.floor(Number(args[2]) || 1) - 1));
        ctx.send(s, { t: 'effect', id: def.id, s: secs, a: amp });
        return;
      }
      case 'kill':
      case 'matar': {
        // Fase 8.6: /matar <criatura> (como /kill @e[type=…]): las de ese tipo a menos de 256 bloques; el dragón muere
        // como en el combate (va al podio y se consume).
        const v = norm(args.join('_'));
        if (v) {
          const def = MOB_TYPES.map((t) => MOBS[t]).find((m) => m.key === v || norm(m.name) === v || norm(m.name).replace(/\s+/g, '_') === v);
          if (!def) {
            reply('No conozco esa criatura.');
            return;
          }
          let n = 0;
          for (const e of [...ctx.entities.list.values()]) {
            if (e.type !== def.id || e.dead || Math.hypot(e.x - s.p[0], e.z - s.p[2]) > 256) continue;
            if (e.type === MOB_ENDER_DRAGON) ctx.entities.dragon.hurt(e, 0, 1e6, s.id);
            else ctx.entities.kill(e, true);
            n++;
          }
          reply(n ? `Eliminadas: ${n}.` : 'No hay ninguna cerca.');
          return;
        }
        ctx.send(s, { t: 'hurt', a: 1000, k: [0, 0, 0], c: 'kill' });
        return;
      }
      case 'summon':
      case 'invocar': {
        const v = norm(args[0] ?? '');
        // Fase 6.5 (colecciones): /invocar rayo (a 3 bloques delante, en lo alto de la columna).
        if ((v === 'rayo' || v === 'lightning_bolt') && this.lightning) {
          const lx = Math.floor(s.p[0] - Math.sin(s.r[0]) * 3), lz = Math.floor(s.p[2] - Math.cos(s.r[0]) * 3);
          this.lightning(lx + 0.5, ctx.world.skyTop(lx, lz) + 1, lz + 0.5);
          return;
        }
        // Fase 6: también con guiones bajos en vez de espacios (como sugiere el autocompletado: gólem_de_hierro).
        const def = MOB_TYPES.map((t) => MOBS[t]).find((m) => m.key === v || norm(m.name) === v || norm(m.name).replace(/\s+/g, '_') === v);
        if (!def) {
          reply('Uso: /invocar <' + MOB_TYPES.map((t) => norm(MOBS[t].name)).join('|') + '>');
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
        if (mob && def.id === MOB_CREEPER && norm(args[1] ?? '') === 'cargado') mob.charged = true;
        // Fase 8.3: como /summon, con su equipo al aparecer (armas de los piglins, tamaño del cubo de magma, jinetes…).
        if (mob) ctx.entities.mobs.nether.finalizeSpawn(mob, 'egg');
        return;
      }
      case 'give':
      case 'dar': {
        const v = norm(args[0] ?? '');
        const item = ITEMS.find((it) => it && (it.key === v || norm(it.name) === v.replace(/_/g, ' ')));
        if (!item) {
          reply('Uso: /dar <objeto> [cantidad] (por ejemplo: /dar diamond 5, /dar iron_pickaxe)');
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
      case 'locate':
      case 'localizar': {
        // /localizar <estructura>: la más cercana de ese tipo.
        const want = norm(args.join('_'));
        const key = Object.keys(STRUCTURE_ALIASES).find((a) => a === want);
        if (!key) {
          reply('Uso: /localizar <templo_del_desierto|templo_de_la_jungla|naufragio|portal_en_ruinas|iglu|pozo|mina|aldea|puesto|monumento|ruinas|tesoro|cabana_de_bruja|fosil|mansion|ciudad_antigua|fortaleza|bastion|ciudad_del_end>');
          return;
        }
        // Fase 8.6: en el End, sólo las ciudades del End.
        if (ctx.dim === DIM_END || STRUCTURE_ALIASES[key] === 'end_city') {
          const gen = ctx.world.gen;
          if (ctx.dim !== DIM_END || !(gen instanceof EndGenerator) || (key !== 'ciudad' && STRUCTURE_ALIASES[key] !== 'end_city')) {
            reply(`En ${dimensionDef(ctx.dim).name} no hay estructuras de ese tipo.`);
            return;
          }
          const q = gen.locateCity(Math.floor(s.p[0]), Math.floor(s.p[2]), LOCATE_REGIONS);
          if (!q) reply('No hay ninguna ciudad del End cerca.');
          else reply(`Ciudad del End más cercana: x ${q[0]}, y ${q[1]}, z ${q[2]} (a ${Math.round(Math.hypot(q[0] - s.p[0], q[2] - s.p[2]))} bloques).`);
          return;
        }
        // Fase 8.4: en el Nether, «fosil» y «portal_en_ruinas» son los suyos.
        // Fase 8.6: en el mundo normal, «fortaleza» es la del portal del End.
        const type = ctx.dim === DIM_NETHER ? NETHER_STRUCTURE_OF[STRUCTURE_ALIASES[key]] ?? STRUCTURE_ALIASES[key]
          : key === 'fortaleza' ? 'stronghold' : STRUCTURE_ALIASES[key];
        // Fase 8.4: en el Nether, las suyas (fortalezas, bastiones…); en el mundo normal, las demás.
        const netherType = NETHER_STRUCTURE_NAMES[type] !== undefined;
        if (netherType !== (ctx.dim === DIM_NETHER) || (ctx.dim !== DIM_OVERWORLD && ctx.dim !== DIM_NETHER)) {
          reply(`En ${dimensionDef(ctx.dim).name} no hay estructuras de ese tipo.`);
          return;
        }
        if (netherType) {
          const q = locateNetherStructure(ctx.world.gen, type, Math.floor(s.p[0]), Math.floor(s.p[2]), LOCATE_REGIONS);
          const name = NETHER_STRUCTURE_NAMES[type];
          const fem = type === 'fortress'; // «ninguna fortaleza», «ningún bastión / fósil / portal»
          if (!q) reply(`No hay ${fem ? 'ninguna' : 'ningún'} ${name.toLowerCase()} cerca.`);
          else reply(`${name} más ${fem ? 'cercana' : 'cercano'}: x ${q[0]}, y ${q[1]}, z ${q[2]} (a ${Math.round(Math.hypot(q[0] - s.p[0], q[2] - s.p[2]))} bloques).`);
          return;
        }
        const p = locateStructure(ctx.world.gen, type, Math.floor(s.p[0]), Math.floor(s.p[2]), LOCATE_REGIONS); // Fase 7.5: como en Minecraft
        // Fase 7.5 (mansión): con el género del nombre («ninguna mansión», «aldea más cercana»).
        const fem = /^(Aldea|Mina|Mansión|Fortaleza)/.test(STRUCTURE_NAMES[type]);
        if (!p) reply(`No hay ${fem ? 'ninguna' : 'ningún'} ${STRUCTURE_NAMES[type].toLowerCase()} cerca.`);
        else reply(`${STRUCTURE_NAMES[type]} más ${fem ? 'cercana' : 'cercano'}: x ${p[0]}, y ${p[1]}, z ${p[2]} (a ${Math.round(Math.hypot(p[0] - s.p[0], p[2] - s.p[2]))} bloques).`);
        return;
      }
      // Fase 6 (asaltos): lanzar un asalto en la aldea más cercana (hasta 200 bloques) o una patrulla.
      case 'asalto':
      case 'raid': {
        if (!this.raids) return;
        const v = locateStructure(ctx.world.gen, 'village', Math.floor(s.p[0]), Math.floor(s.p[2]), 1);
        if (!v || Math.hypot(v[0] - s.p[0], v[2] - s.p[2]) > 200) {
          reply('No hay ninguna aldea cerca (a menos de 200 bloques).');
          return;
        }
        if (ctx.difficulty === 0) {
          reply('En dificultad pacífica no hay asaltos.');
          return;
        }
        this.raids.start(v[0], v[1], v[2]);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} desató un asalto en la aldea de x ${v[0]}, z ${v[2]}.` });
        return;
      }
      case 'patrulla':
      case 'patrol': {
        if (!this.raids) return;
        const n = this.raids.spawnPatrol(s.p[0], s.p[2]).length;
        reply(n ? `Aparece una patrulla de ${n} saqueadores cerca.` : 'No hay sitio para una patrulla aquí.');
        return;
      }
      // Fase 7 (encantamientos): /encantar <encantamiento> [nivel] (al objeto de la mano; lo aplica el cliente)
      // y /experiencia <cantidad> [niveles|puntos].
      case 'enchant':
      case 'encantar': {
        const def = enchantByName(args[0] ?? '');
        if (!def) {
          reply('Uso: /encantar <encantamiento> [nivel] (por ejemplo: /encantar filo 5, /encantar toque_de_seda)');
          return;
        }
        const lvl = Math.max(1, Math.min(MAX_ENCHANT_LEVEL, Math.floor(Number(args[1]) || 1)));
        ctx.send(s, { t: 'ench', e: [[def.id, lvl]] });
        return;
      }
      case 'xp':
      case 'experiencia': {
        const n = Math.floor(Number(args[0]));
        const unit = norm(args[1] ?? 'puntos');
        if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
          reply('Uso: /experiencia <cantidad> [puntos|niveles]');
          return;
        }
        if (unit.startsWith('nivel') || unit === 'levels' || unit === 'l') ctx.send(s, { t: 'xp', n: 0, l: Math.min(n, 10_000) });
        else ctx.send(s, { t: 'xp', n });
        return;
      }
      case 'seed':
      case 'semilla':
        reply(`Semilla del mundo: ${ctx.seed}`);
        return;
      case 'list':
      case 'lista':
        reply('Jugadores: ' + [...ctx.sessions()].filter((o) => o.joined).map((o) => o.name).join(', '));
        return;
      case 'help':
      case 'ayuda':
        reply(
          'Comandos: /modo <supervivencia|creativo>, /dificultad <pacifico|facil|normal|dificil>, /jefes <auto|java|duros>, ' +
          '/time set <dia|noche|...>, /invocar <criatura>, /dar <objeto> [n], /efecto <efecto> [s] [nivel], /matar [criatura], ' +
          '/seed, /lista, /tp <jugador>, /localizar <estructura>, /asalto, /patrulla, /encantar <encantamiento> [nivel], ' +
          '/experiencia <n> [puntos|niveles], /dimension <overworld|nether> [x y z], /setblock, /fill, ' +
          '/voz [on|off|silenciar|activar|volumen], /grupo <nombre|salir> (chat de voz: V para hablar, B para susurrar)',
        );
        return;
      default:
        if (cmd !== 'tp') reply(`Comando desconocido: /${cmdRaw}. Escribe /ayuda.`);
    }
  }
}
