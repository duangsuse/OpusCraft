// Combate cuerpo a cuerpo de Minecraft 1.9+: daño y velocidad de ataque de lo que se lleva en la mano
// y la barra de recarga (un golpe antes de tiempo hace menos daño).
import { ITEMS } from './items';

/** Sin arma (o con un objeto que no es un arma): 1 de daño y 4 golpes por segundo. */
export const HAND_DAMAGE = 1;
export const HAND_ATTACK_SPEED = 4;

export function attackDamage(item: number): number {
  return ITEMS[item]?.tool?.damage ?? HAND_DAMAGE;
}

export function attackSpeed(item: number): number {
  return ITEMS[item]?.tool?.attackSpeed ?? HAND_ATTACK_SPEED;
}

/** Segundos para que la barra de ataque se llene. */
export function attackCooldown(item: number): number {
  return 1 / attackSpeed(item);
}

/** Multiplicador del daño según lo cargado (0..1): 0,2 + 0,8·carga² (Minecraft). */
export function chargeFactor(charge: number): number {
  const c = Math.max(0, Math.min(1, charge));
  return 0.2 + 0.8 * c * c;
}
