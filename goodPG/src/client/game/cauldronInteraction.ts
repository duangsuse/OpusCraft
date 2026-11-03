// Fase 6.5 (calderos): clic derecho sobre un caldero con un cubo (llenarlo o vaciarlo) o con un estandarte
// con dibujos (lavar la última capa). Se predice aquí (bloque y mano) y lo confirma el servidor.
import type { RayHit } from './raycast';
import type { Game } from './Game';
import { cauldronUse } from '../../shared/cauldronUse';
import type { ItemStack } from '../../shared/items';

export function cauldronClick(g: Game, pressed: boolean, hit: RayHit | null, held: ItemStack | null): boolean {
  if (!pressed || !hit || !held || g.player.sneaking) return false;
  const r = cauldronUse(hit.id, held);
  if (!r) return false;
  g.world!.setBlock(hit.x, hit.y, hit.z, r.block);
  // En creativo los cubos no cambian; lavar un estandarte, sí.
  if (r.held !== undefined && (!g.creative || r.sound === 'wash')) {
    g.inv.set(g.selected, r.held);
    g.inv.changed();
  }
  // Fase 7 (pociones): el frasco lleno sale aparte (los frascos vacíos se apilan); en creativo no se gasta.
  if (r.give) {
    if (!g.creative && r.take) g.inv.consume(g.selected, r.take);
    if (!g.inv.get(g.selected)) g.inv.set(g.selected, r.give);
    else {
      const rest = g.inv.add(r.give);
      if (rest) g.interaction.throwStack(rest, false);
    }
    g.inv.changed();
  }
  g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: held.id });
  g.swing(true);
  return true;
}
