// Fauna de la fase 6 (abejas, pandas, loros y armadillos): lo que comparten el servidor y el cliente.

/**
 * Bits de estado propios de estas especies (van en Entity.flags junto a los de protocol.ts y sólo
 * significan algo para su especie):
 *  - abeja: A = lleva néctar;
 *  - loro: A = posado;
 *  - armadillo: A = enroscado;
 *  - panda: A = sentado comiendo, B = tumbado panza arriba, A + B = rodando.
 */
export const EF_FAUNA_A = 1 << 19;
export const EF_FAUNA_B = 1 << 20;

/** Colores de los loros: rojo, azul, verde, cian y gris. */
export const PARROT_COLORS = 5;

/** Color de un loro (0..4), fijo para cada entidad: sale de su id, que conocen servidor y clientes. */
export function parrotVariant(entityId: number): number {
  let h = Math.imul(entityId | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) % PARROT_COLORS;
}

/** Segundos de veneno de una picadura de abeja según la dificultad (fácil y pacífico: sin veneno). */
export const BEE_POISON_SECONDS: readonly number[] = [0, 0, 10, 18];

/** Causa de daño de la picadura (el cliente añade el veneno). */
export const BEE_STING_CAUSE = 'bee';
