// Interacción del jugador con la fauna de la fase 6: cosechar nidos y colmenas llenos (tijeras →
// panal, lo suelta el servidor; frasco de cristal → frasco de miel), cepillar armadillos, beber
// miel (quita el veneno y devuelve el frasco) y el veneno de las picaduras de abeja.
import { isBeeHome, honeyLevel, withHoney, HONEY_MAX } from '../../shared/blocks';
import { SHEARS, GLASS_BOTTLE, HONEY_BOTTLE, BRUSH, type ItemStack } from '../../shared/items';
import { MOB_ARMADILLO } from '../../shared/mobs';
import { EF_BABY } from '../../shared/protocol';
import { EFFECT_POISON } from '../../shared/effects';
import { BEE_POISON_SECONDS, BEE_STING_CAUSE } from '../../shared/fauna';
import type { RayHit } from './raycast';
import type { ClientEntity } from './ClientEntities';
import type { Interaction } from './interaction';
import type { Game } from './Game';

/** Mete un objeto en la ranura (si quedó vacía) o en el inventario; si no cabe, lo tira. */
function give(g: Game, ia: Interaction, slot: number, stack: ItemStack): void {
  if (!g.inv.get(slot)) g.inv.set(slot, stack);
  else {
    const rest = g.inv.add(stack);
    if (rest) ia.throwStack(rest, false);
  }
}

/**
 * Clic derecho con tijeras o con un frasco de cristal sobre un nido o colmena llenos: se vacía (el
 * servidor suelta el panal y decide si las abejas se enfadan). true si se usó.
 */
export function useOnBeeHome(g: Game, ia: Interaction, hit: RayHit, held: ItemStack): boolean {
  if (!isBeeHome(hit.id) || (held.id !== SHEARS && held.id !== GLASS_BOTTLE) || honeyLevel(hit.id) < HONEY_MAX) return false;
  g.world!.setBlock(hit.x, hit.y, hit.z, withHoney(hit.id, 0));
  g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: held.id });
  if (held.id === SHEARS) ia.wearHeld(1);
  else {
    if (!g.creative) g.inv.consume(g.selected, 1);
    give(g, ia, g.selected, { id: HONEY_BOTTLE, count: 1 });
  }
  g.swing(true);
  return true;
}

/** ¿Sirve este objeto con esta criatura de la fauna nueva? (undefined: que decida la regla común). */
export function faunaCanInteract(e: ClientEntity, item: number): boolean | undefined {
  if (item === BRUSH) return e.type === MOB_ARMADILLO && !(e.flags & EF_BABY);
  return undefined;
}

/** Después de comer o beber: el frasco de miel quita el veneno y deja el frasco vacío. */
export function faunaAfterEat(g: Game, ia: Interaction, item: number, slot: number): void {
  if (item !== HONEY_BOTTLE) return;
  g.statusEffects.remove(EFFECT_POISON, g.survival);
  if (!g.creative) give(g, ia, slot, { id: GLASS_BOTTLE, count: 1 });
}

/** Golpe recibido: la picadura de abeja envenena (en normal y difícil). */
export function faunaOnHurt(g: Game, cause: string): void {
  if (cause !== BEE_STING_CAUSE) return;
  const secs = BEE_POISON_SECONDS[g.difficulty] ?? 0;
  if (secs > 0) g.statusEffects.add(EFFECT_POISON, secs, 0, g.survival);
}
