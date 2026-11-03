// Fase 6.5 (remate): clic derecho con la etiqueta y la correa.
// - Etiqueta sobre una criatura: se abre la ventana del nombre y, al aceptar, se le pone.
// - Correa sobre un animal: queda atado al jugador. Sobre uno que ya lleva: se suelta.
// - Clic en una valla llevando animales atados: quedan atados a la valla.
// - Fase 7 (remate): la barca también: atada a mí se suelta; con la correa en la mano se ata (o pasa de la
//   valla a mi mano); si no, el clic derecho sube a ella (vehicleClient).
import type { RayHit } from './raycast';
import type { ClientEntity } from './ClientEntities';
import type { Interaction } from './interaction';
import type { Game } from './Game';
import { isFence } from '../../shared/blocks';
import { NAME_TAG, LEAD, type ItemStack } from '../../shared/items';
import { MOBS, MOB_VILLAGER, MOB_WANDERING_TRADER } from '../../shared/mobs';
import { isBoatType } from '../../shared/vehicles'; // Fase 7 (remate)

/** Lo mismo que decide el servidor (leashable), con lo que sabe el cliente. */
function canLeash(e: ClientEntity): boolean {
  const def = MOBS[e.type];
  return !!def && !def.hostile && !def.aquatic && e.type !== MOB_VILLAGER && e.type !== MOB_WANDERING_TRADER && e.deathT < 0;
}

export function leashUse(
  g: Game, ia: Interaction, pressed: boolean, hit: RayHit | null, target: ClientEntity | null, held: ItemStack | null,
): boolean {
  if (!pressed) return false;
  const heldId = held?.id ?? 0;
  const me = g.net?.id ?? null;
  // Fase 7 (remate): barcas.
  if (target && isBoatType(target.type) && !target.gone) {
    const mine = target.leash === me;
    if (mine || (heldId === LEAD && (!target.leash || Array.isArray(target.leash)))) {
      ia.interactEntity(target, heldId);
      return true;
    }
    return false;
  }
  if (target && MOBS[target.type] && target.deathT < 0) {
    if (heldId === NAME_TAG) {
      // Fase 7 (encantamientos): la etiqueta renombrada en el yunque pone su nombre directamente.
      if (held?.data?.name) {
        ia.interactEntity(target, NAME_TAG, held.data.name);
        return true;
      }
      g.openNamePrompt(target.name ?? '', (name) => {
        if (name) ia.interactEntity(target, NAME_TAG, name);
      });
      return true;
    }
    // Atada a mí (se suelta) o a una valla (pasa a mi mano).
    if (target.leash && (target.leash === me || Array.isArray(target.leash))) {
      ia.interactEntity(target, heldId);
      return true;
    }
    if (heldId === LEAD && !target.leash && canLeash(target)) {
      ia.interactEntity(target, LEAD);
      return true;
    }
    return false;
  }
  if (hit && isFence(hit.id) && me) {
    for (const e of g.ents.list.values()) {
      if (e.leash !== me || e.gone) continue;
      g.net?.send({ t: 'leash', x: hit.x, y: hit.y, z: hit.z });
      g.swing(true);
      return true;
    }
  }
  return false;
}
