// Fase 6.5 (maderas): clic derecho con un hacha sobre un tronco, un leño o un bloque de bambú lo
// descorteza (mantiene la orientación). El cliente lo predice y el servidor lo aplica ('use').
import { strippedOf } from '../../shared/blocks';
import { ITEMS, type ItemStack } from '../../shared/items';
import type { RayHit } from './raycast';
import type { Interaction } from './interaction';
import type { Game } from './Game';

/** true si se descortezó (el clic ya está usado). */
export function useAxeOnWood(g: Game, ia: Interaction, hit: RayHit, held: ItemStack): boolean {
  if (ITEMS[held.id]?.tool?.kind !== 'axe') return false;
  const stripped = strippedOf(hit.id);
  if (!stripped) return false;
  g.world!.setBlock(hit.x, hit.y, hit.z, stripped);
  g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: held.id });
  g.audio.playPlace('wood', [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
  g.swing(false);
  ia.wearHeld(1);
  return true;
}
