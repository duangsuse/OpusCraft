// Mapas (fase 5): cada mapa muestra una celda fija de 128×128 bloques del mundo, como los de
// Minecraft a escala 1:1 (centrados en múltiplos de 128). La celda se guarda en el campo `dmg` del
// montón del mapa, así viaja con el inventario, los cofres y la red sin datos nuevos.

/** Lado de un mapa en bloques (1 píxel = 1 bloque). */
export const MAP_SIZE = 128;
const OFF = 8000;
const SPAN = 16001;

/** Celda del mapa que contiene (x, z): su clave (siempre > 0). */
export function mapKeyAt(x: number, z: number): number {
  const gx = Math.floor((x + MAP_SIZE / 2) / MAP_SIZE), gz = Math.floor((z + MAP_SIZE / 2) / MAP_SIZE);
  return (gx + OFF) * SPAN + (gz + OFF) + 1;
}

/** Esquina noroeste (x, z) de la celda de un mapa. */
export function mapOrigin(key: number): [number, number] {
  const k = key - 1;
  const gx = Math.floor(k / SPAN) - OFF, gz = (k % SPAN) - OFF;
  return [gx * MAP_SIZE - MAP_SIZE / 2, gz * MAP_SIZE - MAP_SIZE / 2];
}

/** Mayor clave posible (para validar montones). */
export const MAX_MAP_KEY = SPAN * SPAN;
