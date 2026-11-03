// Fase 6.5 (remate): soporte para armadura. Es una entidad sin comportamiento (como los cuadros): el
// servidor la guarda aparte y el cliente dibuja la peana, los palos de madera y la armadura puesta.
// Este módulo no importa nada del juego: lo usan el servidor y el cliente.

/** Entidad del soporte (extra en el alta: ids de la armadura [cabeza, pecho, piernas, pies]). */
export const ENT_ARMOR_STAND = 109;
/** Alto y medio ancho de su caja (para apuntarle). */
export const STAND_HEIGHT = 1.975;
export const STAND_HALF = 0.25;

/** Caja del soporte en (x, y, z) (pies en el centro de la peana). */
export function standBox(x: number, y: number, z: number): number[] {
  return [x - STAND_HALF, y, z - STAND_HALF, x + STAND_HALF, y + STAND_HEIGHT, z + STAND_HALF];
}

/** Orientación al colocarlo: mirando al jugador, en pasos de 45°. */
export function standYaw(playerYaw: number): number {
  const step = Math.PI / 4;
  return Math.round((playerYaw + Math.PI) / step) * step;
}
