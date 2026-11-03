// Cobre (fase 6.5) en el cliente: encerar con panal y raspar con un hacha (se predice el cambio; el
// servidor lo confirma y manda las partículas y el sonido), y los efectos que llegan del servidor.
import { copperInfo, copperVariant, scrapedCopper, waxedCopper, isDoor } from '../../shared/blocks';
import { ITEMS, HONEYCOMB, type ItemStack } from '../../shared/items';
import { partnerOf } from '../../shared/placement';
import type { RayHit } from './raycast';
import type { Interaction } from './interaction';
import type { Game } from './Game';

/** Clic derecho con un panal o un hacha sobre un bloque de cobre. true si se usó. */
export function useOnCopper(g: Game, ia: Interaction, hit: RayHit, held: ItemStack): boolean {
  if (!copperInfo(hit.id)) return false;
  const axe = ITEMS[held.id]?.tool?.kind === 'axe';
  if (!axe && held.id !== HONEYCOMB) return false;
  const next = axe ? scrapedCopper(hit.id) : waxedCopper(hit.id);
  if (!next) return false;
  const world = g.world!;
  world.setBlock(hit.x, hit.y, hit.z, next);
  // La otra mitad de una puerta cambia con ella.
  const p = isDoor(hit.id) ? partnerOf(hit.x, hit.y, hit.z, hit.id) : null;
  const other = p ? world.getBlock(p[0], p[1], p[2]) : 0;
  if (p && isDoor(other) && copperInfo(other)) {
    const info = copperInfo(next)!;
    world.setBlock(p[0], p[1], p[2], copperVariant(other, info.stage, info.waxed));
  }
  g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: held.id });
  if (axe) ia.wearHeld(1);
  else if (!g.creative) g.inv.consume(g.selected, 1);
  g.swing(true);
  return true;
}

/** Efectos del cobre que manda el servidor; false si no es uno de éstos. */
export function copperFx(g: Game, kind: string, p: [number, number, number]): boolean {
  if (kind !== 'copper_wax' && kind !== 'copper_unwax' && kind !== 'copper_scrape') return false;
  const x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]);
  g.renderer.entities.pfx.copperFlakes(x, y, z, kind === 'copper_wax' ? 'wax' : kind === 'copper_unwax' ? 'unwax' : 'scrape');
  g.audio.playCopperSfx(kind === 'copper_wax' ? 'wax' : 'scrape', p);
  return true;
}
