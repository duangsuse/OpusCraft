// Generadores de monstruos (mazmorras y minas): con un jugador a 16 bloques o menos, cada 10–40 s
// invocan de 1 a 4 criaturas alrededor, salvo que ya haya 6 cerca, que esté iluminado por bloques
// (una antorcha encima lo apaga, como en Minecraft) o que la dificultad sea pacífica.
import { AIR, COBWEB, MOB_SPAWNER, NETHER_BRICKS, isEndPortalFrame } from '../../blocks';
import { MOB_BLAZE, MOB_MAGMA_CUBE } from '../../netherMobs'; // Fase 8.4
import { DIM_NETHER } from '../../dimensions';
import { MOBS, MOB_ZOMBIE, MOB_SKELETON, MOB_SPIDER, MOB_CAVE_SPIDER, MOB_SILVERFISH } from '../../mobs';
import { CHUNK_SIZE, hash3, indexY } from '../../constants';
import { posKey } from '../posKey';
import { standable } from '../pathfind';
import { SIM_RADIUS, TICK_RATE, type ServerContext } from './context';

const TYPES = [MOB_ZOMBIE, MOB_SKELETON, MOB_SPIDER, MOB_ZOMBIE];

export class Spawners {
  /** Próximo tick en que puede actuar cada generador (clave de posición). */
  private next = new Map<number, number>();

  constructor(private ctx: ServerContext) {}

  /** Criatura de un generador: arañas de cueva si hay telarañas alrededor (minas); si no, según la posición. */
  mobOf(x: number, y: number, z: number): number {
    const w = this.ctx.world;
    // Fase 8.4: en el Nether, el del trono de la fortaleza (entre ladrillos del Nether) es de blazes; el de la sala
    // del tesoro de los bastiones, de cubos de magma.
    if (this.ctx.dim === DIM_NETHER) {
      for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (w.getBlock(x + dx, y + dy, z + dz) === NETHER_BRICKS) return MOB_BLAZE;
      }
      return MOB_MAGMA_CUBE;
    }
    // Fase 8.6: el de la sala del portal de la fortaleza (delante de los marcos del portal del End), de lepismas.
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (isEndPortalFrame(w.getBlock(x + dx, y, z + dz))) return MOB_SILVERFISH;
    }
    for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (w.getBlock(x + dx, y + dy, z + dz) === COBWEB) return MOB_CAVE_SPIDER; // Fase 6 (monstruos)
    }
    return TYPES[hash3(x, y, z, 0x5be) % TYPES.length];
  }

  /** Llamar una vez por segundo. */
  tick(): void {
    const ctx = this.ctx;
    if (ctx.difficulty === 0) return;
    const players = [...ctx.sessions()].filter((s) => s.joined && !(s.s & 8));
    if (players.length === 0) return;
    const seen = new Set<string>();
    for (const s of players) {
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const key = `${pcx + dx},${pcz + dz}`;
          if (seen.has(key) || Math.max(Math.abs(dx), Math.abs(dz)) > SIM_RADIUS) continue;
          seen.add(key);
          const c = ctx.world.getChunk(pcx + dx, pcz + dz);
          if (!c) continue;
          for (const idx of c.spawners) {
            const x = c.cx * 16 + (idx & 15), y = indexY(idx), z = c.cz * 16 + ((idx >> 4) & 15);
            this.tryAt(x, y, z, players);
          }
        }
      }
    }
  }

  private tryAt(x: number, y: number, z: number, players: { p: [number, number, number] }[]): void {
    const ctx = this.ctx;
    const w = ctx.world;
    if (w.getBlock(x, y, z) !== MOB_SPAWNER) return;
    const near = players.some((s) => Math.hypot(s.p[0] - x - 0.5, s.p[1] - y, s.p[2] - z - 0.5) <= 16);
    if (!near) return;
    const k = posKey(x, y, z);
    const due = this.next.get(k) ?? 0;
    if (ctx.tickCount < due) return;
    this.next.set(k, ctx.tickCount + TICK_RATE * (10 + Math.floor(ctx.rand() * 30)));
    const type = this.mobOf(x, y, z);
    // La antorcha apaga los de monstruos normales; los blazes, los cubos de magma y las lepismas
    // (checkAnyLightMonsterSpawnRules) salen con cualquier luz.
    if (type !== MOB_BLAZE && type !== MOB_MAGMA_CUBE && type !== MOB_SILVERFISH && w.isLitByBlocks(x, y + 1, z)) return;
    let nearby = 0;
    for (const e of ctx.entities.list.values()) {
      if (e.type === type && Math.abs(e.x - x) < 9 && Math.abs(e.y - y) < 5 && Math.abs(e.z - z) < 9) nearby++;
    }
    const h = Math.ceil(MOBS[type].height);
    let spawned = 0;
    const want = 1 + Math.floor(ctx.rand() * 4);
    for (let t = 0; t < 12 && spawned < want && nearby + spawned < 6; t++) {
      const sx = x + Math.floor((ctx.rand() - 0.5) * 9), sz = z + Math.floor((ctx.rand() - 0.5) * 9);
      const sy = y + Math.floor(ctx.rand() * 3) - 1;
      if (w.getBlock(sx, sy, sz) !== AIR || !standable(w, sx, sy, sz, h)) continue;
      if (ctx.entities.spawnMob(type, sx + 0.5, sy, sz + 0.5)) {
        spawned++;
        ctx.fx('spawner', sx + 0.5, sy + 0.5, sz + 0.5);
      }
    }
  }
}
