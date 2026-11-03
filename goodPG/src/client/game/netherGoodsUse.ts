// Fase 8.5 (lo que da el Nether): el clic derecho del cliente sobre los bloques nuevos.
// - Nexo de reaparición: con piedra luminosa y hueco, se carga (se gasta una); cargado, se usa (en el Nether fija
//   el punto de reaparición y fuera explota: lo decide el servidor). Agachado con algo en la mano, se coloca.
// - Magnetita: la brújula que se usa en ella queda magnetizada (apunta a ella en su dimensión). De una pila, sale
//   una sola magnetizada y el resto se queda como estaba.
import { GLOWSTONE, LODESTONE, familyBase, anchorCharges, RESPAWN_ANCHOR_MAX_CHARGES } from '../../shared/blocks';
import { COMPASS, type ItemStack } from '../../shared/items';
import type { RayHit } from './raycast';
import type { Game } from './Game';

/** Atiende el clic derecho si es de los suyos (devuelve false si no). */
export function netherGoodsUse(g: Game, pressed: boolean, hit: RayHit | null, held: ItemStack | null): boolean {
  if (!pressed || !hit) return false;
  if (g.player.sneaking && held) return false;
  const charges = anchorCharges(hit.id);
  if (charges >= 0) {
    if (held?.id === GLOWSTONE && charges < RESPAWN_ANCHOR_MAX_CHARGES) {
      g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: GLOWSTONE });
      if (!g.creative) g.inv.consume(g.selected, 1);
      g.swing(true);
      return true;
    }
    if (charges === 0) return false;
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: held?.id ?? 0 });
    g.swing(true);
    return true;
  }
  if (familyBase(hit.id) === LODESTONE && held?.id === COMPASS) {
    const dim = g.world?.dim ?? 0;
    const lode: [number, number, number, number] = [hit.x, hit.y, hit.z, dim];
    // Como en Java: la única de la pila se magnetiza ahí mismo; si hay más (o en creativo), sale otra aparte.
    if (held.count === 1 && !g.creative) held.data = { ...held.data, lode };
    else {
      if (!g.creative) g.inv.consume(g.selected, 1);
      const rest = g.inv.add({ id: COMPASS, count: 1, data: { lode } });
      if (rest) g.interaction.throwStack(rest, false);
    }
    g.inv.changed();
    g.audio.playEnchantSfx('lodestone_lock', [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
    g.swing(true);
    return true;
  }
  return false;
}
