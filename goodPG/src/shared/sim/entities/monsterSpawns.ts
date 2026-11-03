// Fase 6 (monstruos): aparición natural de los monstruos nuevos.
// - En la oscuridad normal (Spawner.spawnHostiles elige el tipo y aquí se cambia): brujas y slimes en
//   los pantanos, alguna bruja suelta en cualquier sitio y un 5 % de los zombis son aldeanos zombi.
// - Aparte: slimes en los "chunks de slime" bajo y = 40 (aunque haya luz) y ahogados en ríos y
//   océanos (agua honda, de noche o a oscuras).
// Los phantoms salen sobre los jugadores que no duermen (server/monsters.ts) y las lepismas, de los
// bloques infestados.
import { MOBS, MOB_ZOMBIE, MOB_ZOMBIE_VILLAGER, MOB_WITCH, MOB_SLIME, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL, MOB_DROWNED } from '../../mobs';
import { BLOCK_FLUID, BLOCK_OPAQUE } from '../../blocks';
import { BIOME_SWAMP, baseBiome } from '../../world/biomeIds';
import { isSlimeChunk, SLIME_CHUNK_MAX_Y } from '../../world/infested';
import { SEA_LEVEL, MIN_Y } from '../../constants';
import { standable } from '../pathfind';
import { roomFor } from './monsterAi';
import type { PlayerView } from './types';
import type { Entities } from './Entities';
import { locateStructure } from '../../world/structures'; // Fase 7.5 (océano)
import { inMonumentBox } from '../../world/monument';

/** Límite de monstruos cerca de un jugador (el mismo que usa Spawner). */
export function hostileCap(difficulty: number, playerCount: number): number {
  const d = difficulty;
  return (d <= 1 ? 6 : d === 2 ? 8 : 10) + (d <= 1 ? 3 : d === 2 ? 4 : 5) * Math.min(4, playerCount);
}

/** Slime del tamaño más grande (al azar) que quepa en (x, y, z); 0 si no cabe ninguno. */
export function slimeThatFits(m: Entities, x: number, y: number, z: number): number {
  const sizes = [MOB_SLIME, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL];
  const get = (bx: number, by: number, bz: number) => m.w.getBlock(bx, by, bz);
  for (let i = Math.floor(m.rand() * 3); i < 3; i++) {
    if (roomFor(get, x, y, z, MOBS[sizes[i]].width)) return sizes[i];
  }
  return 0;
}

/** Cambia el monstruo elegido por Spawner según el bioma y el sitio (devuelve el tipo final). */
export function pickMonster(m: Entities, type: number, biome: number, x: number, y: number, z: number): number {
  const r = m.rand();
  if (baseBiome(biome) === BIOME_SWAMP && r < 0.3) {
    if (r < 0.1) return MOB_WITCH;
    return slimeThatFits(m, x, y, z) || type;
  }
  if (r < 0.015) return MOB_WITCH;
  if (type === MOB_ZOMBIE && m.rand() < 0.05) return MOB_ZOMBIE_VILLAGER;
  return type;
}

/** Slimes en chunks de slime y ahogados en el agua, cerca del jugador `p`. */
export function spawnExtraMonsters(m: Entities, p: PlayerView, playerCount: number): void {
  if (m.counts(p.x, p.z, 96).hostile >= hostileCap(m.host.difficulty(), playerCount)) return;
  const w = m.w;
  const [x, z] = m.spawner.ring(p, 22, 48);
  if (m.rand() < 0.5) {
    // Slimes: bajo y = 40 en uno de cada diez chunks (según la semilla), con cualquier luz.
    if (!isSlimeChunk(w.seed, Math.floor(x / 16), Math.floor(z / 16))) return;
    let y = Math.min(SLIME_CHUNK_MAX_Y - 1, Math.floor(p.y + (m.rand() - 0.5) * 32));
    for (let k = 0; k < 12; k++, y--) {
      if (y <= MIN_Y + 1) return;
      const floor = w.getBlock(x, y - 1, z);
      if (floor <= 0 || !BLOCK_OPAQUE[floor] || !standable(w, x, y, z, 1)) continue;
      const feet = w.getBlock(x, y, z);
      if (feet > 0 && BLOCK_FLUID[feet]) return;
      const type = slimeThatFits(m, x, y, z);
      if (type && standable(w, x, y, z, Math.ceil(MOBS[type].height))) m.spawnMob(type, x + 0.5, y, z + 0.5);
      return;
    }
    return;
  }
  // Ahogados: agua de al menos tres bloques de hondo, de noche o a más de 10 bloques bajo la superficie.
  if (m.rand() > 0.35) return;
  const y = SEA_LEVEL - 3 - Math.floor(m.rand() * 12);
  for (let dy = 0; dy < 3; dy++) {
    const b = w.getBlock(x, y + dy, z);
    if (!(b > 0 && BLOCK_FLUID[b] === 1)) return;
  }
  const night = m.host.sunHeight() < -0.02;
  if (!night && y > SEA_LEVEL - 12) return;
  if (w.isLitByBlocks(x, y, z)) return;
  // Fase 7.5 (océano): dentro de un monumento sólo aparecen guardianes (server/monuments.ts).
  const mon = locateStructure(w.gen, 'monument', x, z, 1);
  if (mon && inMonumentBox(mon[0], mon[2], x, y, z)) return;
  m.spawnMob(MOB_DROWNED, x + 0.5, y, z + 0.5);
}
