// Fase 7.6 (sistemas sueltos): la escala de los mapas y la mesa de cartografía, como en Minecraft.
// - Escala: un mapa normal (1:1, 128×128 bloques) se amplía hasta 4 veces (1:2, 1:4, 1:8, 1:16); cada vez
//   cubre el doble de lado, con la celda de la escala nueva que contiene el centro de la de antes. La
//   escala va en los datos del mapa (`mz`); la celda base sigue en `dmg`.
// - Mesa de cartografía: mapa + papel lo amplía, + mapa vacío lo copia (2 iguales), + panel de cristal lo
//   bloquea (`lock`: el dibujo ya no cambia). Los mapas bloqueados no se amplían; los de estructura
//   (tesoro, explorador) tampoco, pero se copian y se bloquean.
// - Mesa de trabajo: el mapa rodeado de 8 papeles también lo amplía.
import { FILLED_MAP, EMPTY_MAP, PAPER, type ItemStack } from './items';
import { GLASS_PANE } from './blocks';
import { MAP_SIZE, mapOrigin } from './maps';

/** Escala máxima (1:16). */
export const MAX_MAP_ZOOM = 4;

/** Nivel de escala de un mapa normal (0 = 1:1). */
export function mapZoom(s: ItemStack | null | undefined): number {
  return s?.id === FILLED_MAP ? s.data?.mz ?? 0 : 0;
}

export function mapLocked(s: ItemStack | null | undefined): boolean {
  return s?.id === FILLED_MAP && s.data?.lock === 1;
}

/** Zona de un mapa con celda base `key` a escala `zoom`: esquina noroeste, bloques por píxel y lado. */
export function mapArea(key: number, zoom: number): { x0: number; z0: number; scale: number; span: number } {
  const scale = 1 << Math.max(0, Math.min(MAX_MAP_ZOOM, zoom));
  const span = MAP_SIZE * scale;
  const [bx, bz] = mapOrigin(key);
  // Celdas alineadas como las de Minecraft (desplazadas medio mapa de 1:1): la que contiene el centro.
  const cell = (v: number) => Math.floor((v + MAP_SIZE / 2) / span) * span - MAP_SIZE / 2;
  return { x0: cell(bx + MAP_SIZE / 2), z0: cell(bz + MAP_SIZE / 2), scale, span };
}

/** Copia del mapa con los datos cambiados por `patch`. */
function withData(map: ItemStack, count: number, patch: { mz?: number; lock?: 1 }): ItemStack {
  const data = { ...(map.data ?? {}), ...patch };
  return { id: FILLED_MAP, count, dmg: map.dmg, data };
}

/** Salida de la mesa de cartografía con el mapa `map` y el material `mat` (null si no hay receta). */
export function cartographyResult(map: ItemStack | null, mat: ItemStack | null): ItemStack | null {
  if (!map || map.id !== FILLED_MAP || !map.dmg || !mat) return null;
  if (mat.id === EMPTY_MAP) return withData(map, 2, {});
  if (mapLocked(map)) return null;
  if (mat.id === GLASS_PANE) return withData(map, 1, { lock: 1 });
  if (mat.id === PAPER && !map.data?.smap && mapZoom(map) < MAX_MAP_ZOOM) return withData(map, 1, { mz: mapZoom(map) + 1 });
  return null;
}

/**
 * Clonar un mapa en la cuadrícula (map_cloning: crafting_transmute con add_material_count_to_result): un mapa lleno y
 * de 1 a 8 mapas vacíos dan tantos mapas iguales como mapas había (null si no es esta receta).
 */
export function mapCloneCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  let map: ItemStack | null = null, empties = 0;
  for (const s of grid) {
    if (!s) continue;
    if (s.id === FILLED_MAP && s.dmg && !map) map = s;
    else if (s.id === EMPTY_MAP) empties++;
    else return null;
  }
  if (!map || empties < 1 || empties > 8) return null;
  return withData(map, empties + 1, {});
}

/** Mesa de trabajo: un mapa en el centro rodeado de 8 papeles lo amplía (null si no es esta receta). */
export function mapExtendCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  if (grid.length !== 9) return null;
  for (let i = 0; i < 9; i++) if (i !== 4 && grid[i]?.id !== PAPER) return null;
  return cartographyResult(grid[4], { id: PAPER, count: 1 });
}
