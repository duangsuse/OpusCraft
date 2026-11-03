// Fase 6.5 (decoración): clic derecho sobre bloques de decoración y huevos generadores. Plantar en una
// maceta (o sacar la planta), tocar la campana y hacer aparecer criaturas con un huevo. El cliente ya
// gastó el objeto (plantas y huevos en supervivencia); aquí se valida y se aplica.
import { BLOCK_COLLIDE, FLOWER_POT, familyBase, isBell, pottedPlant, potWith } from '../../blocks';
import { ITEMS, spawnEggMob } from '../../items';
import { MOBS, MOB_TYPES } from '../../mobs';
import type { ServerContext, Session } from './context';

const MOB_BY_KEY = new Map<string, number>();
for (const t of MOB_TYPES) MOB_BY_KEY.set(MOBS[t].key, t);

/** Id de la criatura de un huevo generador (0 si no lo es). */
export function spawnEggType(item: number): number {
  const key = spawnEggMob(item);
  return key ? MOB_BY_KEY.get(key) ?? 0 : 0;
}

/** ¿Cabe de pie una criatura de `h` bloques de alto en (x, y, z)? (sin colisión en esas celdas). */
function roomFor(ctx: ServerContext, x: number, y: number, z: number, h: number): boolean {
  for (let dy = 0; dy < h; dy++) {
    const b = ctx.world.getBlock(x, y + dy, z);
    if (b < 0 || BLOCK_COLLIDE[b]) return false;
  }
  return true;
}

/** Hace aparecer la criatura del huevo sobre el bloque (x, y, z) o en el primer hueco de encima. */
export function useSpawnEgg(ctx: ServerContext, item: number, x: number, y: number, z: number): boolean {
  const type = spawnEggType(item);
  const def = MOBS[type];
  if (!def) return false;
  const h = Math.max(1, Math.ceil(def.height));
  const clicked = ctx.world.getBlock(x, y, z);
  // Encima de un bloque con colisión; en el agua o en una planta, en su misma celda.
  let sy = clicked > 0 && BLOCK_COLLIDE[clicked] ? y + 1 : y;
  let tries = 0;
  while (!roomFor(ctx, x, sy, z, h) && tries++ < 4) sy++;
  if (!roomFor(ctx, x, sy, z, h)) return false;
  const e = ctx.entities.spawnMob(type, x + 0.5, sy + 0.01, z + 0.5);
  if (e) ctx.entities.mobs.nether.finalizeSpawn(e, 'egg'); // Fase 8.3: armas de los piglins, tamaño del cubo de magma, jinetes…
  return !!e;
}

/** Clic derecho sobre un bloque de decoración (o con un huevo generador). Devuelve si lo atendió. */
export function useDecor(ctx: ServerContext, s: Session, x: number, y: number, z: number, id: number, item: number): boolean {
  const held = Number.isInteger(item) && item > 0 ? item : 0;
  // Campana: suena (con cualquier cosa en la mano).
  if (isBell(id)) {
    ctx.fx('bell', x + 0.5, y + 0.5, z + 0.5);
    return true;
  }
  if (familyBase(id) === FLOWER_POT) {
    const plant = pottedPlant(id);
    if (!plant && held) {
      const pot = potWith(ITEMS[held]?.block ?? 0);
      if (pot) ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, pot));
      else ctx.reject(s, x, y, z);
      return true;
    }
    if (plant && !held) {
      // Sacar la planta: vuelve la maceta vacía y la planta sale hacia el jugador.
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, FLOWER_POT));
      ctx.entities.spawnItem({ id: plant, count: 1 }, s.p[0], s.p[1] + 0.5, s.p[2], 0, 0, 0, undefined, 0);
      return true;
    }
    ctx.reject(s, x, y, z);
    return true;
  }
  if (held && spawnEggType(held)) {
    useSpawnEgg(ctx, held, x, y, z);
    return true;
  }
  return false;
}
