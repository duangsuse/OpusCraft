// Fase 7.5 (abismo): lo que hace el sculk en el servidor.
// - Catalizadores: cuando muere algo a menos de 8 bloques (que dé experiencia), se comen su experiencia
//   (no salen orbes), florecen un momento y la convierten en cargas que extienden el sculk (sculkSpread.ts).
// - Venas: al quitar el bloque que cubren, pierden esa cara (y desaparecen si no les queda ninguna).
// - Chilladores: chillan 90 ticks cuando los pisa un jugador (sin ir agachado) o les llega el chasquido
//   de un sensor que activó un jugador. Los generados por el mundo (`can_summon`) suben el nivel de aviso
//   de los jugadores cercanos (con 10 s de espera; baja uno cada 10 minutos sin avisos) y, al terminar de
//   chillar, contestan con el sonido del warden acercándose y Oscuridad a 40 bloques; en el cuarto aviso
//   invocan un warden (si no hay otro a 48 bloques), que sale del suelo.
import {
  AIR, SCULK_CATALYST, BLOCK_SOLID, BLOCK_COLLIDE, BLOCK_FLUID, stateOf, stateProps, isCatalyst, isSculkVein, isShrieker,
  veinFaces, veinWith, veinCanStick, VEIN_DIRS, shriekerProps, shriekerWith, isWaterlogged, WATER,
} from '../../blocks';
import { MOB_WARDEN } from '../../mobs';
import { EFFECT_DARKNESS } from '../../effects';
import { mobXp } from '../../experience';
import { STATE_DEAD } from '../../protocol';
import { registerRedstone, type RedstoneApi } from '../../redstone/api';
import { addCursors, updateCursors, type Cursor, type SculkWorld } from '../../sculkSpread';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { Entity } from '../entities';
import type { ServerContext } from './context';
import { registerShriekerTick, type Vibrations } from './vibrations';

/** Alcance del catalizador (bloques). */
export const CATALYST_RANGE = 8;
/** Ticks que florece el catalizador. */
const BLOOM_TICKS = 8;
/** Ticks que chilla un chillador. */
export const SHRIEK_TICKS = 90;
/** Nivel de aviso con el que sale el warden, espera entre avisos y ticks para que baje uno. */
export const MAX_WARNING = 4;
export const WARNING_COOLDOWN = 200;
export const WARNING_DECAY = 12000;
/** Distancias (bloques): jugadores que comparten el aviso, warden que ya está cerca y alcance de la Oscuridad. */
const WARN_PLAYERS = 16;
const WARDEN_NEAR = 48;
const SHRIEK_DARKNESS = 40;
/** Oscuridad: 13 s (260 ticks); no se renueva si al jugador aún le quedan 10 s (200 ticks). */
export const DARKNESS_SECONDS = 13;
const DARKNESS_RENEW_TICKS = 60;

/** Nivel de aviso del warden de cada jugador (WardenSpawnTracker de Minecraft). */
export interface WardenTracker {
  level: number;
  /** Ticks desde el último aviso y espera que queda. */
  since: number;
  cooldown: number;
}

const chunkKey = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);
const SYSTEMS = new WeakMap<RedstoneApi, Sculk>();

export class Sculk {
  /** Catalizadores por chunk (claves de posición). */
  private catalysts = new Map<number, Set<number>>();
  /** Cargas en marcha de cada catalizador. */
  private cursors = new Map<number, Cursor[]>();
  /** Nivel de aviso de cada chillador que está chillando (lo usa al contestar). */
  private shrieks = new Map<number, number>();
  /** Nivel de aviso por jugador (nombre en minúsculas). */
  readonly trackers = new Map<string, WardenTracker>();
  /** Último tick en que se dio Oscuridad a cada jugador (id de sesión). */
  private darkAt = new Map<string, number>();
  /** Un warden sale del suelo (lo pone en marcha la IA del warden). */
  onSummon: ((e: Entity) => void) | null = null;
  /** Cambió algo que se guarda (niveles de aviso). */
  dirty = false;

  constructor(private ctx: ServerContext, private redstone: RedstoneApi, private vibrations: Vibrations) {
    SYSTEMS.set(redstone, this);
    vibrations.onShriekerHeard = (x, y, z, player) => this.tryShriek(x, y, z, player);
  }

  // ------------------------------------------------------------------ catalizadores

  addCatalyst(x: number, y: number, z: number): void {
    const ck = chunkKey(Math.floor(x / 16), Math.floor(z / 16));
    let set = this.catalysts.get(ck);
    if (!set) this.catalysts.set(ck, (set = new Set()));
    set.add(posKey(x, y, z));
  }

  removeCatalyst(x: number, y: number, z: number): void {
    const ck = chunkKey(Math.floor(x / 16), Math.floor(z / 16));
    const set = this.catalysts.get(ck);
    const k = posKey(x, y, z);
    if (set?.delete(k) && set.size === 0) this.catalysts.delete(ck);
    this.cursors.delete(k);
  }

  /** Catalizador más cercano a menos de 8 bloques de (x, y, z), o null. */
  private catalystNear(x: number, y: number, z: number): number | null {
    let best: number | null = null, bd = Infinity;
    const w = this.ctx.world;
    for (let cz = Math.floor((z - CATALYST_RANGE) / 16); cz <= Math.floor((z + CATALYST_RANGE) / 16); cz++) {
      for (let cx = Math.floor((x - CATALYST_RANGE) / 16); cx <= Math.floor((x + CATALYST_RANGE) / 16); cx++) {
        const set = this.catalysts.get(chunkKey(cx, cz));
        if (!set) continue;
        for (const k of set) {
          const bx = keyX(k), by = keyY(k), bz = keyZ(k);
          const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
          if (d > CATALYST_RANGE || d >= bd || !isCatalyst(w.getBlock(bx, by, bz))) continue;
          bd = d;
          best = k;
        }
      }
    }
    return best;
  }

  /**
   * Muere algo que da `xp` puntos en (x, y, z): si hay un catalizador cerca, se la come (devuelve true: no
   * salen orbes), florece y empieza a extender el sculk.
   */
  consumeXp(x: number, y: number, z: number, xp: number): boolean {
    if (xp <= 0 || this.catalysts.size === 0) return false;
    const k = this.catalystNear(x, y, z);
    if (k === null) return false;
    const list = this.cursors.get(k) ?? [];
    addCursors(list, Math.floor(x), Math.floor(y + 0.5), Math.floor(z), xp);
    this.cursors.set(k, list);
    const cx = keyX(k), cy = keyY(k), cz = keyZ(k);
    this.redstone.setBlock(cx, cy, cz, stateOf(SCULK_CATALYST, { bloom: 1 }));
    this.redstone.schedule(cx, cy, cz, BLOOM_TICKS);
    this.ctx.fx('sculk_bloom', cx + 0.5, cy + 1.15, cz + 0.5);
    return true;
  }

  /** Una criatura muere (con botín): experiencia que le daría a quien la matase. */
  onMobKilled(e: Entity): boolean {
    if (!e.ai) return false;
    return this.consumeXp(e.x, e.y, e.z, mobXp(e.type, (e.growAge ?? 0) > 0, () => this.ctx.rand()));
  }

  private world: SculkWorld = {
    get: (x, y, z) => this.ctx.world.getBlock(x, y, z),
    set: (x, y, z, id) => {
      const cur = this.ctx.world.getBlock(x, y, z);
      if (cur < 0 || cur === id) return;
      this.ctx.world.setBlock(x, y, z, id);
      if (id !== AIR && !isSculkVein(id)) this.ctx.fx('sculk_spread', x + 0.5, y + 0.5, z + 0.5);
    },
    rand: () => this.ctx.rand(),
  };

  // ------------------------------------------------------------------ chilladores y avisos

  private tracker(name: string): WardenTracker {
    const k = name.toLowerCase();
    let t = this.trackers.get(k);
    if (!t) this.trackers.set(k, (t = { level: 0, since: 0, cooldown: 0 }));
    return t;
  }

  /** Un jugador (id de sesión) hace chillar al chillador de (x, y, z). */
  tryShriek(x: number, y: number, z: number, player: string): void {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isShrieker(id)) return;
    const { shrieking, canSummon } = shriekerProps(id);
    if (shrieking) return;
    let warning = 0;
    if (canSummon && this.ctx.difficulty > 0) {
      warning = this.tryWarn(x, y, z, player);
      if (warning <= 0) return;
    }
    this.shrieks.set(posKey(x, y, z), warning);
    this.redstone.setBlock(x, y, z, shriekerWith(id, true));
    this.redstone.schedule(x, y, z, SHRIEK_TICKS);
    this.ctx.fx('shriek', x + 0.5, y + 1, z + 0.5);
    this.vibrations.emit('shriek', x + 0.5, y + 0.5, z + 0.5, { who: player });
  }

  /** Sube el aviso de los jugadores cercanos (tryWarn de Minecraft): el nuevo nivel, o 0 si no se puede. */
  private tryWarn(x: number, y: number, z: number, player: string): number {
    for (const e of this.ctx.entities.list.values()) {
      if (e.type === MOB_WARDEN && !e.dead && Math.hypot(e.x - x, e.y - y, e.z - z) <= WARDEN_NEAR) return 0;
    }
    const names: string[] = [];
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.mode === 'c' || s.s & STATE_DEAD) continue;
      if (s.id === player || Math.hypot(s.p[0] - x - 0.5, s.p[1] - y - 0.5, s.p[2] - z - 0.5) <= WARN_PLAYERS) names.push(s.name);
    }
    if (names.length === 0) return 0;
    const ts = names.map((n) => this.tracker(n));
    if (ts.some((t) => t.cooldown > 0)) return 0;
    const top = ts.reduce((a, b) => (b.level > a.level ? b : a));
    const level = Math.min(MAX_WARNING, top.level + 1);
    for (const t of ts) {
      t.level = level;
      t.since = 0;
      t.cooldown = WARNING_COOLDOWN;
    }
    this.dirty = true;
    return level;
  }

  /** Termina de chillar: contesta (sonido del warden, Oscuridad o el warden en persona). */
  endShriek(x: number, y: number, z: number, id: number): void {
    this.redstone.setBlock(x, y, z, shriekerWith(id, false));
    const k = posKey(x, y, z);
    const warning = this.shrieks.get(k) ?? 0;
    this.shrieks.delete(k);
    if (!shriekerProps(id).canSummon || this.ctx.difficulty === 0 || warning <= 0) return;
    if (warning < MAX_WARNING || !this.summonWarden(x, y, z)) {
      const a = this.ctx.rand() * Math.PI * 2, r = 5 + this.ctx.rand() * 5;
      this.ctx.fx('warden_warning', x + 0.5 + Math.cos(a) * r, y + 1, z + 0.5 + Math.sin(a) * r, Math.min(3, warning));
    }
    this.darkness(x + 0.5, y + 0.5, z + 0.5, SHRIEK_DARKNESS);
  }

  /** Invoca un warden cerca (20 intentos a ±5 bloques y ±6 de altura, sobre algo sólido). */
  summonWarden(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    for (let i = 0; i < 20; i++) {
      const sx = x + Math.floor(this.ctx.rand() * 11) - 5, sz = z + Math.floor(this.ctx.rand() * 11) - 5;
      for (let sy = y + 6; sy >= y - 6; sy--) {
        const below = w.getBlock(sx, sy - 1, sz);
        if (below <= 0 || BLOCK_COLLIDE[below] !== 1 || BLOCK_FLUID[below]) continue;
        let free = true;
        for (let dy = 0; dy < 3 && free; dy++) {
          for (let dz = -1; dz <= 1 && free; dz++) {
            for (let dx = -1; dx <= 1 && free; dx++) {
              if (Math.abs(dx) + Math.abs(dz) > 1) continue;
              const b = w.getBlock(sx + dx, sy + dy, sz + dz);
              if (b < 0 || (b > 0 && BLOCK_SOLID[b] === 1) || (b > 0 && BLOCK_FLUID[b] === 2)) free = false;
            }
          }
        }
        if (!free) continue;
        const e = this.ctx.entities.spawnMob(MOB_WARDEN, sx + 0.5, sy, sz + 0.5);
        if (!e) return false;
        this.onSummon?.(e);
        return true;
      }
    }
    return false;
  }

  /** Oscuridad (13 s) a los jugadores a menos de `radius` bloques de (x, y, z). */
  darkness(x: number, y: number, z: number, radius: number): void {
    const now = this.ctx.tickCount;
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      if (Math.hypot(s.p[0] - x, s.p[1] - y, s.p[2] - z) > radius) continue;
      const last = this.darkAt.get(s.id);
      if (last !== undefined && now - last < DARKNESS_RENEW_TICKS) continue;
      this.darkAt.set(s.id, now);
      this.ctx.entities.host.effectPlayer?.(s.id, EFFECT_DARKNESS, DARKNESS_SECONDS, 0);
    }
  }

  // ------------------------------------------------------------------ bucle y avisos

  tick(): void {
    // Cargas de los catalizadores (las de los que ya no están, o sin cargar, se quedan quietas).
    for (const [k, list] of this.cursors) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = this.ctx.world.getBlock(x, y, z);
      if (id < 0) continue;
      if (!isCatalyst(id)) {
        this.cursors.delete(k);
        continue;
      }
      const next = updateCursors(this.world, list, x, y, z);
      if (next.length) this.cursors.set(k, next);
      else this.cursors.delete(k);
    }
    // Avisos de los jugadores: esperas y el que baja cada 10 minutos.
    if (this.ctx.tickCount % 20 === 0) {
      for (const t of this.trackers.values()) {
        if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - 20);
        if (t.level <= 0) continue;
        t.since += 20;
        if (t.since >= WARNING_DECAY) {
          t.level--;
          t.since = 0;
          this.dirty = true;
        }
      }
    }
  }

  /** Cargas en marcha (para las pruebas). */
  get activeCursors(): number {
    let n = 0;
    for (const l of this.cursors.values()) n += l.length;
    return n;
  }

  /** Un bloque cambió: las venas que cubrían un bloque que ya no está pierden esa cara. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (old <= 0 || !veinCanStick(old) || veinCanStick(id)) return;
    const w = this.ctx.world;
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = VEIN_DIRS[f];
      const nx = x - dx, ny = y - dy, nz = z - dz;
      const n = w.getBlock(nx, ny, nz);
      if (!isSculkVein(n) || !(veinFaces(n) & (1 << f))) continue;
      const mask = veinFaces(n) & ~(1 << f);
      w.setBlock(nx, ny, nz, veinWith(mask) || (isWaterlogged(n) ? WATER : AIR));
    }
  }
}

// El catalizador se apunta (al colocarlo o cargar su chunk) y deja de florecer a los 8 ticks; el chillador
// termina de chillar a los 90.
registerRedstone(SCULK_CATALYST, {
  changed: (api, x, y, z, old, id) => {
    const s = SYSTEMS.get(api);
    if (!s) return;
    if (isCatalyst(id)) {
      s.addCatalyst(x, y, z);
      if (old === -1 && stateProps(id)?.bloom) api.schedule(x, y, z, 1);
    } else s.removeCatalyst(x, y, z);
  },
  tick: (api, x, y, z, id) => {
    if (stateProps(id)?.bloom) api.setBlock(x, y, z, stateOf(SCULK_CATALYST, { bloom: 0 }));
  },
});
registerShriekerTick((api, x, y, z, id) => {
  const s = SYSTEMS.get(api);
  if (s) s.endShriek(x, y, z, id);
  else api.setBlock(x, y, z, shriekerWith(id, false));
});
