// Ediciones de bloques que piden los jugadores: romper (y recoger fluidos con el cubo), colocar
// (con las reglas compartidas de placement.ts) y usar (puertas, camas, azada, polvo de hueso).
// Todo se valida aquí; si algo no vale, se devuelve al jugador el bloque real.
import {
  AIR, BEDROCK, FURNACE_LIT, BLOCKS, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_HARDNESS, BLOCK_REPLACEABLE, isValidBlockId,
  isBed, familyBase, COMPOSTER, isCampfire,
} from '../../blocks';
import { MIN_Y, MAX_Y, WORLD_LIMIT, CHUNK_SIZE } from '../../constants';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { ITEMS, BONE_MEAL, PLACEABLE_BLOCKS } from '../../items';
import { planPlacement, toggleEdits, isUsable, type Edit } from '../../placement';
import { oreXp } from '../../experience';
import type { BlockRules } from './blockRules';
import type { Farming } from './farming';
import type { Beds } from './beds';
import type { Composters } from './composters';
import type { Campfires } from './campfires';
import type { ServerContext, Session } from './context';
// Fase 6 (fauna): cosechar nidos y colmenas.
import { isBeeHome } from '../../blocks';
import { harvestBeeHome } from '../entities/bees';
import { strippedOf } from '../../blocks'; // Fase 6.5 (maderas)
// Fase 6.5 (cobre): encerar y raspar.
import { copperInfo } from '../../blocks';
import { partnerOf } from '../../placement';
import type { Copper } from './copper';
import { useDecor } from './decorUse'; // Fase 6.5 (decoración)
import { isWaterlogged, emptyAfterPlayerBreak, withWater, WATER } from '../../blocks'; // Fase 6.5 (océano y plantas) y 7
// Fase 7 (encantamientos): Toque de seda y Fortuna.
import { enchantedBlockDrops } from '../enchantDrops';
import { isGuardedByPiglins } from '../../netherMobs'; // Fase 8.3 (criaturas del Nether)
import { sanitizeHeldEnchants, levelIn } from '../../enchantEffects';
import { SILK_TOUCH } from '../../enchantments';
import { sculkXp } from '../../blocks'; // Fase 7.5 (abismo)
import { dimensionDef } from '../../dimensions'; // Fase 8 (dimensiones)

export class BlockEdits {
  /** Fase 6.5 (cobre): panal y hacha sobre los bloques de cobre. */
  copper: Copper | null = null;
  /** Fase 6.5 (océano y plantas): clic derecho que atiende otro sistema (cosechar bayas dulces). */
  extraUse: ((s: Session, x: number, y: number, z: number, id: number) => boolean) | null = null;
  /** Fase 6.5 (libros y estandartes): aviso tras colocar (las capas del estandarte colocado). */
  placed: ((s: Session, msg: Extract<ClientMsg, { t: 'place' }>, edits: readonly Edit[]) => void) | null = null;
  /** Fase 6.5 (materiales): tartas con vela, pala y azada sobre los suelos nuevos (`h`: altura del clic). */
  materials: ((s: Session, x: number, y: number, z: number, id: number, item: number, h: number) => boolean) | null = null;
  /** Fase 8.5 (lo que da el Nether): el nexo de reaparición y demás bloques del Nether. */
  netherGoods: ((s: Session, x: number, y: number, z: number, id: number, item: number) => boolean) | null = null;
  /** Fase 8.6: el ojo de ender en los marcos del portal del End. */
  endGoods: ((s: Session, x: number, y: number, z: number, id: number, item: number) => boolean) | null = null;
  /** Fase 6.5 (calderos): llenar, vaciar y lavar en un caldero. */
  cauldrons: ((s: Session, x: number, y: number, z: number, id: number, item: number) => boolean) | null = null;
  /** Fase 7 (redstone): clic derecho sobre un componente (palanca, botón, repetidor…); devuelve si lo atendió. */
  redstone: ((x: number, y: number, z: number, id: number) => boolean) | null = null;
  /** Fase 7 (redstone): se coloca algo contra (x, y, z) (la mena de redstone se enciende). */
  touched: ((x: number, y: number, z: number) => void) | null = null;
  /** Fase 7 (redstone): justo antes de romper un bloque con la herramienta `tool` (cuerda y tijeras). */
  beforeBreak: ((x: number, y: number, z: number, id: number, tool: number) => void) | null = null;

  constructor(
    private ctx: ServerContext, private rules: BlockRules, private farming: Farming, private beds: Beds,
    private composters: Composters, private campfires: Campfires,
  ) {}

  /** Romper un bloque o usar un cubo (colocar o recoger un fluido). */
  onSet(s: Session, msg: Extract<ClientMsg, { t: 'set' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), b = Number(msg.b);
    if (![x, y, z, b].every(Number.isInteger)) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y <= MIN_Y || y >= MAX_Y) return;
    if (!isValidBlockId(b) || b === BEDROCK || BLOCK_FLUID_LEVEL[b] !== 0 || (b >= FURNACE_LIT && b < FURNACE_LIT + 4)) {
      ctx.reject(s, x, y, z);
      return;
    }
    if (!ctx.allow(s, 1) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) {
      ctx.reject(s, x, y, z);
      return;
    }
    // Sólo ahora (edición válida y al alcance del jugador) se genera el chunk si aún no estaba.
    ctx.world.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), ctx.now());
    const cur = ctx.world.getBlock(x, y, z);
    if (cur < 0) return;
    const creative = s.mode === 'c';
    const tool = Number(msg.tool);
    ctx.asActor(s.id, () => this.rules.withoutDrops(creative, () => {
      if (b === AIR) {
        if (cur === AIR) return;
        const wet = isWaterlogged(cur); // Fase 6.5: una planta anegada se rompe como un bloque y deja el agua
        if (BLOCK_FLUID[cur] && !wet) {
          // Recoger con el cubo: sólo fuentes.
          if (BLOCK_FLUID_LEVEL[cur] !== 0) {
            ctx.reject(s, x, y, z);
            return;
          }
        } else if (BLOCK_HARDNESS[cur] < 0 || !BLOCKS[cur].breakable) {
          ctx.reject(s, x, y, z);
          return;
        }
        const toolId = Number.isInteger(tool) && tool > 0 ? tool : 0;
        const en = toolId ? sanitizeHeldEnchants(toolId, msg.en) : []; // Fase 7 (encantamientos)
        const drops = !creative && (!BLOCK_FLUID[cur] || wet) ? enchantedBlockDrops(cur, toolId, en, () => ctx.rand()) : [];
        this.beforeBreak?.(x, y, z, cur, toolId); // Fase 7 (redstone)
        // Fase 8.3: romper oro, cofres o barriles enfada a los piglins que estén a 16 bloques (lo vean o no).
        if (isGuardedByPiglins(cur)) ctx.entities.mobs.nether.piglins.angerNearby(s.id, s.p[0], s.p[1], s.p[2], false);
        // Fase 7: el hielo escarchado y las plantas anegadas dejan agua; el hielo, si tiene algo debajo.
        const below = ctx.world.getBlock(x, y - 1, z);
        const left = emptyAfterPlayerBreak(cur, below, !creative, levelIn(en, SILK_TOUCH) > 0);
        // Fase 8: en el Nether el hielo roto no deja agua.
        ctx.world.setBlock(x, y, z, left === WATER && dimensionDef(ctx.dim).evaporatesWater ? AIR : left);
        ctx.entities.dropStacks(drops, x + 0.5, y + 0.3, z + 0.5);
        // Menas que sueltan su mineral: experiencia (sólo en supervivencia).
        // Fase 7.5 (abismo): el sculk sin Toque de seda también da experiencia.
        const xp = creative ? 0 : oreXp(cur, drops.map((d) => d.id), () => ctx.rand()) + (levelIn(en, SILK_TOUCH) > 0 ? 0 : sculkXp(cur));
        if (xp > 0) ctx.entities.xp.spawn(xp, x + 0.5, y + 0.3, z + 0.5);
      } else {
        // Fase 8: en el Nether el agua que se vierte se evapora al momento.
        if (b === WATER && dimensionDef(ctx.dim).evaporatesWater) {
          ctx.fx('fire_extinguish', x + 0.5, y + 0.5, z + 0.5);
          ctx.reject(s, x, y, z);
          return;
        }
        // Fase 7: el cubo de agua sobre un bloque que se puede anegar (conducto, corales) lo anega.
        const wet = b === WATER ? withWater(cur, true) : 0;
        if (wet) {
          ctx.world.setBlock(x, y, z, wet);
          if (Number.isInteger(tool) && tool > 0) ctx.entities.aquatic.releaseBucket(tool, x, y, z);
          return;
        }
        // Sólo cubos (fluidos); los bloques se colocan con 'place'.
        if (!BLOCK_FLUID[b] || (!BLOCK_REPLACEABLE[cur] && cur !== b)) {
          ctx.reject(s, x, y, z);
          return;
        }
        ctx.world.setBlock(x, y, z, b);
        // Fase 6 (acuáticos): al vaciar un cubo con criatura, sale la criatura.
        if (Number.isInteger(tool) && tool > 0) ctx.entities.aquatic.releaseBucket(tool, x, y, z);
      }
    }));
  }

  /** Colocar un bloque sobre la cara `n` de la celda golpeada (una o varias celdas). */
  onPlace(s: Session, msg: Extract<ClientMsg, { t: 'place' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), item = Number(msg.item), yaw = Number(msg.yaw);
    const n = Array.isArray(msg.n) ? msg.n.map(Number) : [];
    const p = Array.isArray(msg.p) ? msg.p.map(Number) : [];
    if (![x, y, z, item].every(Number.isInteger) || !Number.isFinite(yaw) || n.length !== 3 || p.length !== 3) return;
    if (!n.every((v) => v === -1 || v === 0 || v === 1) || Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) !== 1) return;
    if (!p.every(Number.isFinite) || Math.abs(p[0] - x - 0.5) > 1 || Math.abs(p[1] - y - 0.5) > 1 || Math.abs(p[2] - z - 0.5) > 1) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y < MIN_Y || y >= MAX_Y) return;
    // Deshacer la predicción del cliente en las celdas que pudo tocar.
    const undo = (): void => {
      const cells = [[0, 0, 0], [n[0], n[1], n[2]], [n[0], n[1] + 1, n[2]]];
      for (let d = 0; d < 4; d++) cells.push([n[0] + [0, 1, 0, -1][d], n[1], n[2] + [-1, 0, 1, 0][d]]);
      for (const [dx, dy, dz] of cells) ctx.reject(s, x + dx, y + dy, z + dz);
    };
    if (!isValidBlockId(item) || !PLACEABLE_BLOCKS.has(item) || BLOCK_FLUID[item] || item === BEDROCK) {
      undo();
      return;
    }
    if (!ctx.allow(s, 1) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) {
      undo();
      return;
    }
    ctx.world.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), ctx.now());
    const hitId = ctx.world.getBlock(x, y, z);
    if (hitId < 0) return;
    const get = (bx: number, by: number, bz: number) => ctx.world.getBlock(bx, by, bz);
    const pitch = Number.isFinite(Number(msg.pi)) ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(msg.pi))) : 0; // Fase 7 (mecanismos)
    const edits = planPlacement(get, { x, y, z, nx: n[0], ny: n[1], nz: n[2], px: p[0], py: p[1], pz: p[2], id: hitId }, item, yaw, pitch);
    if (!edits) {
      undo();
      return;
    }
    ctx.asActor(s.id, () => this.rules.applyEdits(edits));
    this.placed?.(s, msg, edits);
    this.touched?.(x, y, z); // Fase 7 (redstone)
  }

  /** Clic derecho sobre un bloque: objetos (azada, polvo de hueso, tijeras), puertas, tartas, camas y compostadores. */
  onUse(s: Session, msg: Extract<ClientMsg, { t: 'use' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), yaw = Number(msg.yaw);
    if (![x, y, z].every(Number.isInteger) || !Number.isFinite(yaw) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return;
    const id = ctx.world.getBlock(x, y, z);
    if (id < 0) return;
    const item = Number(msg.item);
    // Fase 7 (redstone): palancas, botones, repetidores, comparadores, bloques musicales, sensores y menas.
    const rsUse = this.redstone;
    if (rsUse && ctx.asActor(s.id, () => rsUse(x, y, z, id))) return;
    const ng = this.netherGoods; // Fase 8.5: nexo de reaparición
    if (ng && ctx.asActor(s.id, () => ng(s, x, y, z, id, Number.isInteger(item) ? item : 0))) return;
    const eg = this.endGoods; // Fase 8.6: marcos del portal del End
    if (eg && ctx.asActor(s.id, () => eg(s, x, y, z, id, Number.isInteger(item) ? item : 0))) return;
    // El compostador acepta cualquier objeto (o la mano, para sacar el polvo de hueso).
    if (familyBase(id) === COMPOSTER) {
      this.composters.use(s, x, y, z, Number.isInteger(item) && item > 0 ? item : 0);
      return;
    }
    // Comida cruda sobre una fogata: se pone a asar.
    if (isCampfire(id)) { // Fase 8.5: también la de almas
      if (!(Number.isInteger(item) && this.campfires.use(x, y, z, item))) ctx.reject(s, x, y, z);
      return;
    }
    // Fase 6.5 (calderos): cubos y estandartes sobre un caldero.
    const cauldron = this.cauldrons;
    if (cauldron && ctx.asActor(s.id, () => cauldron(s, x, y, z, id, item))) return;
    // Fase 6.5 (materiales): tartas con vela, caminos de tierra, tierra gruesa y enraizada.
    const mat = this.materials;
    if (mat && ctx.asActor(s.id, () => mat(s, x, y, z, id, item, Number(msg.h)))) return;
    // Fase 6 (fauna): nido o colmena llenos: tijeras (panal) o frasco de cristal (miel).
    if (isBeeHome(id)) {
      const ok = Number.isInteger(item) && ctx.asActor(s.id, () => harvestBeeHome(ctx.entities, x, y, z, item, s.id));
      if (!ok) ctx.reject(s, x, y, z);
      return;
    }
    // Fase 6.5 (cobre): panal (encerar) o hacha (raspar) sobre un bloque de cobre.
    if (this.copper && Number.isInteger(item) && item > 0 && copperInfo(id)) {
      const copper = this.copper;
      const done = ctx.asActor(s.id, () => copper.use(x, y, z, item));
      if (done !== null) {
        if (!done) {
          ctx.reject(s, x, y, z);
          const p = partnerOf(x, y, z, id);
          if (p) ctx.reject(s, p[0], p[1], p[2]);
        }
        return;
      }
    }
    // Fase 6.5 (decoración): macetas, campanas y huevos generadores.
    if (useDecor(ctx, s, x, y, z, id, item)) return;
    // Fase 6.5 (océano y plantas): cosechar un arbusto de bayas dulces (con cualquier cosa salvo polvo de hueso).
    if (item !== BONE_MEAL && this.extraUse && ctx.asActor(s.id, () => this.extraUse!(s, x, y, z, id))) return;
    // Usar un objeto sobre el bloque: azada (labrar), polvo de hueso y tijeras (tallar calabazas).
    if (Number.isInteger(item) && item > 0) {
      const done = ctx.asActor(s.id, () => {
        const kind = ITEMS[item]?.tool?.kind;
        if (kind === 'hoe') return this.farming.till(x, y, z);
        if (kind === 'shears') return this.farming.carve(x, y, z, yaw);
        if (kind === 'axe') { // Fase 6.5 (maderas): descortezar
          const stripped = strippedOf(ctx.world.getBlock(x, y, z));
          if (stripped) ctx.world.setBlock(x, y, z, stripped);
          return stripped > 0;
        }
        if (item === BONE_MEAL) return this.farming.fertilize(x, y, z);
        return false;
      });
      if (!done) ctx.reject(s, x, y, z);
      if (!done && item !== BONE_MEAL) ctx.reject(s, x, y + 1, z);
      return;
    }
    if (!isUsable(id)) {
      ctx.reject(s, x, y, z);
      return;
    }
    if (isBed(id)) {
      this.beds.trySleep(s, x, y, z, id);
      return;
    }
    const edits = toggleEdits((bx, by, bz) => ctx.world.getBlock(bx, by, bz), x, y, z, yaw);
    if (!edits) return;
    ctx.asActor(s.id, () => this.rules.applyEdits(edits));
  }
}
