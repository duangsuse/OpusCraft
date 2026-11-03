// Fase 8.3 (criaturas del Nether): la aparición natural en el Nether, como NaturalSpawner de Java 26.3.
//
// Cada tick, en cada chunk simulado alrededor de los jugadores (en orden al azar), mientras no se llegue al tope
// (70 monstruos por cada 289 chunks; los animales, 10, y sólo cada 400 ticks), un intento: un punto al azar de la
// columna (entre el fondo y el techo) y, desde él, tres grupos de hasta cuatro pasos de ±5 bloques. El primer paso
// válido elige la criatura por peso de la lista del bioma (NETHER_SPAWNS) y el tamaño de su grupo; cada paso comprueba
// la distancia (más de 24 bloques del jugador más cercano y, si desaparece lejos, menos de 128), la colocación (en el
// suelo o, el strider, en la lava), las reglas de cada criatura (luz, verrugas, uno de cada veinte para el ghast), que
// quepa y, en el valle de almas y el bosque distorsionado, el coste de aparición (el campo de carga de
// PotentialCalculator). El ghast sale de uno en uno; los demás, hasta 4 por intento.
import { FORTRESS_ENEMIES } from '../../netherMobs'; // Fase 8.4
import { inFortressPiece, inFortressBounds } from '../../world/netherStructures';
import { NETHER_BRICKS } from '../../blocks';
import { MOBS, MOB_SKELETON, MOB_ENDERMAN } from '../../mobs';
import {
  NETHER_SPAWNS, MONSTER_CAP, CREATURE_CAP, CREATURE_SPAWN_PERIOD, MOB_GHAST, MOB_PIGLIN, MOB_HOGLIN, MOB_ZOMBIFIED_PIGLIN,
  MOB_STRIDER, MOB_MAGMA_CUBE, MOB_WITHER_SKELETON, MOB_BLAZE, isNetherMob, type NetherSpawns, type SpawnEntry,
} from '../../netherMobs';
import {
  BLOCK_COLLIDE, BLOCK_FLUID, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_EMISSION, BLOCKS, BEDROCK, MAGMA_BLOCK, NETHER_WART_BLOCK,
  isFire, SOUL_FIRE, familyBase,
} from '../../blocks';
import {
  BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
} from '../../world/biomeIds';
import { CHUNK_SIZE } from '../../constants';
import { isEndBiome } from '../../world/biomeIds'; // Fase 8.6
import { DIM_NETHER, DIM_END } from '../../dimensions';

/** Fase 8.6: lo que sale en los biomas del End. */
const END_SPAWNS: NetherSpawns = { monsters: [[MOB_ENDERMAN, 10, 4, 4]], creatures: [] };
import type { Entity, PlayerView } from './types';
import type { Entities } from './Entities';

/** Chunks alrededor de cada jugador donde se intenta (el radio que simula el servidor). */
const SPAWN_CHUNK_RADIUS = 4;
/** Chunks de referencia del tope (17 × 17 en Java). */
const MAGIC_CHUNKS = 289;

const BIOME_KEYS: Readonly<Record<number, string>> = {
  [BIOME_NETHER_WASTES]: 'nether_wastes',
  [BIOME_SOUL_SAND_VALLEY]: 'soul_sand_valley',
  [BIOME_CRIMSON_FOREST]: 'crimson_forest',
  [BIOME_WARPED_FOREST]: 'warped_forest',
  [BIOME_BASALT_DELTAS]: 'basalt_deltas',
};

/** Criaturas que desaparecen lejos (monstruos; el strider y los animales no). */
function despawns(type: number): boolean {
  return MOBS[type]?.hostile ?? false;
}

/** Máximo por intento (getMaxSpawnClusterSize): el ghast 1, los demás 4. */
function maxCluster(type: number): number {
  return type === MOB_GHAST ? 1 : 4;
}

export class NetherSpawner {
  private ticks = 0;

  constructor(private m: Entities) {}

  /** Qué sale en un bioma (por su id). Fase 8.6: en el End, sólo enderman (10, de 4 en 4, en sus cinco biomas). */
  spawnsAt(biome: number): NetherSpawns {
    if (isEndBiome(biome)) return END_SPAWNS;
    return NETHER_SPAWNS[BIOME_KEYS[biome] ?? 'nether_wastes'];
  }

  tick(players: PlayerView[]): void {
    this.ticks++;
    const live = players.filter((p) => p.alive);
    if (live.length === 0) return;
    const enemies = this.m.host.difficulty() > 0;
    const persistent = this.ticks % CREATURE_SPAWN_PERIOD === 0;
    if (!enemies && !persistent) return;
    const w = this.m.w;
    const chunks: [number, number][] = [];
    const seen = new Set<string>();
    for (const p of live) {
      const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);
      for (let dz = -SPAWN_CHUNK_RADIUS; dz <= SPAWN_CHUNK_RADIUS; dz++) {
        for (let dx = -SPAWN_CHUNK_RADIUS; dx <= SPAWN_CHUNK_RADIUS; dx++) {
          const cx = pcx + dx, cz = pcz + dz, k = `${cx},${cz}`;
          if (seen.has(k) || !w.isLoaded(cx, cz)) continue;
          seen.add(k);
          chunks.push([cx, cz]);
        }
      }
    }
    if (chunks.length === 0) return;
    // Recuento de las criaturas que no son persistentes (las que llevan nombre o son de estructura no cuentan).
    let monsters = 0, creatures = 0;
    for (const e of this.m.list.values()) {
      if (!e.ai || e.dead || e.persist || e.customName) continue;
      const def = MOBS[e.type];
      if (!def || def.aquatic) continue;
      if (def.hostile) monsters++;
      else if (e.type === MOB_STRIDER || !isNetherMob(e.type)) creatures++;
    }
    const monsterCap = (MONSTER_CAP * chunks.length) / MAGIC_CHUNKS;
    const creatureCap = (CREATURE_CAP * chunks.length) / MAGIC_CHUNKS;
    // En orden al azar (Java baraja la lista de chunks cada tick).
    for (let i = chunks.length - 1; i > 0; i--) {
      const j = Math.floor(this.m.rand() * (i + 1));
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    for (const [cx, cz] of chunks) {
      if (enemies && monsters < monsterCap) monsters += this.spawnInChunk('monster', cx, cz, live);
      if (persistent && creatures < creatureCap) creatures += this.spawnInChunk('creature', cx, cz, live);
    }
  }

  /** Un intento en un chunk (spawnCategoryForChunk): devuelve cuántas criaturas salieron. */
  private spawnInChunk(cat: 'monster' | 'creature', cx: number, cz: number, players: PlayerView[]): number {
    const w = this.m.w;
    const r = this.m.rand;
    const sx = cx * CHUNK_SIZE + Math.floor(r() * CHUNK_SIZE), sz = cz * CHUNK_SIZE + Math.floor(r() * CHUNK_SIZE);
    const top = w.skyTop(sx, sz) + 1;
    const y = Math.floor(r() * (top + 1));
    if (y < 1) return 0;
    const start = w.getBlock(sx, y, sz);
    if (start < 0 || (BLOCK_SOLID[start] && BLOCK_OPAQUE[start])) return 0;
    let cluster = 0;
    for (let group = 0; group < 3; group++) {
      let x = sx, z = sz;
      let entry: SpawnEntry | null = null;
      let max = Math.ceil(r() * 4);
      let groupSize = 0;
      for (let step = 0; step < max; step++) {
        x += Math.floor(r() * 6) - Math.floor(r() * 6);
        z += Math.floor(r() * 6) - Math.floor(r() * 6);
        const px = x + 0.5, pz = z + 0.5;
        let d2 = Infinity;
        for (const p of players) d2 = Math.min(d2, (p.x - px) ** 2 + (p.y - y) ** 2 + (p.z - pz) ** 2);
        if (d2 <= 576 || !w.isLoaded(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))) continue;
        const spawns = this.spawnsAt(w.gen.biomeAt(x, z));
        // Fase 8.4: en las fortalezas mandan sus monstruos (dentro de sus piezas, o sobre ladrillos del Nether dentro
        // de su caja: NaturalSpawner.mobsAt).
        const list = cat !== 'monster' ? spawns.creatures : this.fortressList(x, y, z) ?? spawns.monsters;
        if (!entry) {
          entry = this.pick(list);
          if (!entry) break;
          max = entry[2] + Math.floor(r() * (entry[3] - entry[2] + 1));
        }
        const type = entry[0];
        if (!list.includes(entry)) continue;
        if (despawns(type) && d2 > 128 * 128) continue;
        if (!this.placementOk(type, x, y, z) || !this.rulesOk(type, x, y, z) || !this.fits(type, px, y, pz)) continue;
        if (!this.costOk(spawns, type, x, y, z)) continue;
        const e = this.m.spawnMob(type, px, y, pz);
        if (!e) return cluster;
        e.yaw = e.bodyYaw = r() * Math.PI * 2;
        const final = this.m.mobs.nether.finalizeSpawn(e, 'natural');
        void final;
        cluster++;
        groupSize++;
        if (cluster >= maxCluster(type)) return cluster;
        if (groupSize >= maxCluster(type)) break;
      }
    }
    return cluster;
  }

  /** Fase 8.4: la lista de la fortaleza si (x, y, z) está en ella. */
  private fortressList(x: number, y: number, z: number): readonly SpawnEntry[] | null {
    if (this.m.host.world.dim !== DIM_NETHER) return null; // Fase 8.6: fuera del Nether no hay fortalezas
    const gen = this.m.w.gen;
    if (inFortressPiece(gen, x, y, z)) return FORTRESS_ENEMIES;
    if (this.m.w.getBlock(x, y - 1, z) === NETHER_BRICKS && inFortressBounds(gen, x, y, z)) return FORTRESS_ENEMIES;
    return null;
  }

  /** Una entrada de la lista al azar por su peso. */
  private pick(list: readonly SpawnEntry[]): SpawnEntry | null {
    const total = list.reduce((s, e) => s + e[1], 0);
    if (total <= 0) return null;
    let k = Math.floor(this.m.rand() * total);
    for (const e of list) {
      if (k < e[1]) return e;
      k -= e[1];
    }
    return null;
  }

  /** SpawnPlacements.isSpawnPositionOk: en el suelo (ON_GROUND) o en la lava (IN_LAVA, el strider). */
  private placementOk(type: number, x: number, y: number, z: number): boolean {
    const w = this.m.w;
    const at = w.getBlock(x, y, z);
    if (type === MOB_STRIDER) return at > 0 && BLOCK_FLUID[at] === 2;
    const below = w.getBlock(x, y - 1, z);
    if (below <= 0 || !BLOCK_SOLID[below] || !BLOCK_OPAQUE[below] || below === BEDROCK) return false;
    if (familyBase(below) === MAGMA_BLOCK && !MOBS[type]?.fireImmune) return false;
    return this.emptySpawnBlock(type, at) && this.emptySpawnBlock(type, w.getBlock(x, y + 1, z));
  }

  /** NaturalSpawner.isValidEmptySpawnBlock: sin colisión completa, sin líquido y sin nada peligroso. */
  private emptySpawnBlock(type: number, id: number): boolean {
    if (id < 0) return false;
    if (id === 0) return true;
    if (BLOCK_COLLIDE[id] && BLOCK_SOLID[id]) return false;
    if (BLOCK_FLUID[id]) return false;
    const key = BLOCKS[id]?.key ?? '';
    if (/rail$/.test(key)) return false;
    const fireImmune = !!MOBS[type]?.fireImmune;
    if (!fireImmune && (isFire(id) || familyBase(id) === SOUL_FIRE || key === 'magma_block')) return false;
    if (key === 'wither_rose' || key === 'sweet_berry_bush' || key === 'cactus' || key === 'powder_snow') return false;
    return true;
  }

  /** Reglas de cada criatura (SpawnPlacements.checkSpawnRules y Mob.checkSpawnRules). */
  private rulesOk(type: number, x: number, y: number, z: number): boolean {
    const w = this.m.w;
    const below = w.getBlock(x, y - 1, z);
    switch (type) {
      case MOB_GHAST:
        return this.m.rand() < 1 / 20;
      case MOB_PIGLIN:
      case MOB_HOGLIN:
        if (below === NETHER_WART_BLOCK) return false;
        return type === MOB_HOGLIN || !this.lightAbove(x, y, z, 11);
      case MOB_ZOMBIFIED_PIGLIN:
        return below !== NETHER_WART_BLOCK && !this.lightAbove(x, y, z, 11);
      case MOB_MAGMA_CUBE:
        return true;
      case MOB_STRIDER: {
        // Checks de Strider: subiendo desde la lava tiene que llegar a aire.
        let yy = y + 1;
        while (BLOCK_FLUID[Math.max(0, w.getBlock(x, yy, z))] === 2) yy++;
        return w.getBlock(x, yy, z) === 0;
      }
      case MOB_ENDERMAN:
        // Fase 8.6: en el End (monster_spawn_block_light_limit 0), sin ninguna luz de bloque.
        return !this.lightAbove(x, y, z, this.m.host.world.dim === DIM_END ? 0 : 7);
      case MOB_SKELETON:
      case MOB_WITHER_SKELETON:
      case MOB_BLAZE:
        // checkMonsterSpawnRules: luz de bloques como mucho 7 en el Nether (el blaze, cualquiera, pero ≤ 11).
        return type === MOB_BLAZE ? !this.lightAbove(x, y, z, 11) : !this.lightAbove(x, y, z, 7);
      default:
        return true;
    }
  }

  /**
   * ¿Hay más luz de bloques que `level` en (x, y, z)? Como la del servidor (emisión menos la distancia Manhattan,
   * sin paredes), mirando sólo lo que está lo bastante cerca para superar ese nivel.
   */
  private lightAbove(x: number, y: number, z: number, level: number): boolean {
    const w = this.m.w;
    const r = 14 - level;
    for (let dy = -r; dy <= r; dy++) {
      const ry = r - Math.abs(dy);
      for (let dz = -ry; dz <= ry; dz++) {
        const rx = ry - Math.abs(dz);
        for (let dx = -rx; dx <= rx; dx++) {
          const id = w.getBlock(x + dx, y + dy, z + dz);
          if (id > 0 && BLOCK_EMISSION[id] - (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) > level) return true;
        }
      }
    }
    return false;
  }

  /** ¿Cabe? (sin bloques con colisión en su caja ni otras criaturas encima; el zombificado, sin líquidos). */
  private fits(type: number, x: number, y: number, z: number): boolean {
    const def = MOBS[type];
    const hw = def.width / 2;
    const w = this.m.w;
    for (let yy = Math.floor(y); yy < Math.ceil(y + def.height); yy++) {
      for (let zz = Math.floor(z - hw); zz <= Math.floor(z + hw); zz++) {
        for (let xx = Math.floor(x - hw); xx <= Math.floor(x + hw); xx++) {
          const b = w.getBlock(xx, yy, zz);
          if (b < 0 || (b > 0 && BLOCK_COLLIDE[b])) return false;
          if (type === MOB_ZOMBIFIED_PIGLIN && b > 0 && BLOCK_FLUID[b]) return false;
        }
      }
    }
    for (const o of this.m.list.values()) {
      if (!o.ai || o.dead) continue;
      if (Math.abs(o.x - x) < (o.width + def.width) / 2 && Math.abs(o.z - z) < (o.width + def.width) / 2 && o.y < y + def.height && o.y + o.height > y) return false;
    }
    return true;
  }

  /**
   * Coste de aparición (PotentialCalculator): cada criatura con coste crea un campo de carga 1/d alrededor; si la
   * energía que añadiría una más (carga × campo) pasa de su presupuesto, no sale.
   */
  private costOk(spawns: NetherSpawns, type: number, x: number, y: number, z: number): boolean {
    const cost = spawns.costs?.[type];
    if (!cost) return true;
    const [charge, budget] = cost;
    let potential = 0;
    for (const o of this.m.list.values()) {
      if (!o.ai || o.dead || o.persist) continue;
      const c = spawns.costs?.[o.type];
      if (!c) continue;
      const d = Math.hypot(Math.floor(o.x) - x, Math.floor(o.y) - y, Math.floor(o.z) - z);
      potential += d < 1 ? c[0] : c[0] / d;
    }
    return potential * charge <= budget;
  }
}

/** Criaturas de la lista de un bioma (para los tests y el comando de depuración). */
export function netherSpawnTypes(s: NetherSpawns): number[] {
  return [...s.monsters, ...s.creatures].map((e) => e[0]);
}

void (null as unknown as Entity);
