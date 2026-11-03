// Fase 7.5 (mansión): el alay en el cliente: qué se le puede dar (cualquier objeto si no lleva nada; la
// mano vacía para que devuelva el suyo; un fragmento de amatista mientras baila). Sus efectos están en
// allayFx.ts.
import { MOB_ALLAY, EF_ALLAY_DANCING } from '../../shared/allay';
import { AMETHYST_SHARD } from '../../shared/items';
import type { ClientEntity } from './ClientEntities';

/** ¿Sirve este objeto (0: la mano vacía) con el alay? undefined si no es un alay. */
export function allayCanInteract(e: ClientEntity, item: number): boolean | undefined {
  if (e.type !== MOB_ALLAY) return undefined;
  if (item === AMETHYST_SHARD && e.flags & EF_ALLAY_DANCING) return true;
  return item ? !e.gear : !!e.gear;
}
