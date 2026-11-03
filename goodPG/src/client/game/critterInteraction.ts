// Fase 7.5 (fauna): qué objetos sirven con las criaturas sueltas (el cliente decide si manda 'interact';
// el servidor resuelve): tijeras, cuenco y cubo con la champiñaca adulta, y las flores del estofado
// sospechoso con la marrón.
import { SHEARS, BOWL, BUCKET } from '../../shared/items';
import { MOB_MOOSHROOM, EF_BROWN_MOOSHROOM } from '../../shared/mobs';
import { EF_BABY } from '../../shared/protocol';
import { SUSPICIOUS_FLOWERS } from '../../shared/decorFood';
import type { ClientEntity } from './ClientEntities';

/** ¿Sirve este objeto con esta criatura nueva? (undefined: que decida la regla común). */
export function critterCanInteract(e: ClientEntity, item: number): boolean | undefined {
  if (e.type !== MOB_MOOSHROOM || e.flags & EF_BABY) return undefined;
  if (item === SHEARS || item === BOWL || item === BUCKET) return true;
  if (SUSPICIOUS_FLOWERS.some(([f]) => f === item)) return (e.flags & EF_BROWN_MOOSHROOM) !== 0;
  return undefined;
}
