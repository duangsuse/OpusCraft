// Fase 6.5 (materiales): reglas de colocación y de uso de los bloques nuevos, compartidas por el
// cliente (las predice) y el servidor (las aplica): una vela sobre una tarta sin empezar la convierte
// en tarta con vela, los huevos de rana van sobre el agua (como el nenúfar), la pala abre caminos, la
// azada labra la tierra gruesa, la enraizada y el camino, y la tarta con vela se enciende, se apaga o
// se come.
import { MAX_Y } from './constants';
import {
  AIR, CAKE, DIRT, FARMLAND, BLOCK_FLUID, BLOCK_FLUID_LEVEL, FROGSPAWN, COARSE_DIRT, ROOTED_DIRT, DIRT_PATH, PATHABLE,
  isCandle, candleCakeOf, isCandleCake, isLitCandleCake, candleOfCake,
} from './blocks';
import { ITEMS } from './items';
import type { Edit, GetBlock, PlaceHit } from './placement';

/** Colocación de los bloques nuevos: undefined si no es asunto de este módulo; null si no se puede. */
export function planMaterial(get: GetBlock, hit: PlaceHit, base: number): Edit[] | null | undefined {
  // Vela sobre una tarta entera: tarta con vela (encendida, como se ponen las velas).
  if (isCandle(base) && hit.id === CAKE) return [[hit.x, hit.y, hit.z, candleCakeOf(base, true)]];
  // Huevos de rana: sobre una fuente de agua (el rayo del cliente se detiene en ella).
  if (base === FROGSPAWN) {
    if (BLOCK_FLUID[hit.id] !== 1 || BLOCK_FLUID_LEVEL[hit.id] !== 0 || hit.y + 1 >= MAX_Y) return null;
    return get(hit.x, hit.y + 1, hit.z) === AIR ? [[hit.x, hit.y + 1, hit.z, FROGSPAWN]] : null;
  }
  return undefined;
}

/** Resultado de usar una herramienta sobre un suelo: el bloque nuevo y lo que suelta (0 si nada). */
export interface SoilUse {
  block: number;
  drop: number;
}

/**
 * Pala o azada sobre un suelo (necesita aire encima): la pala abre un camino de tierra; la azada
 * vuelve tierra la tierra gruesa y la enraizada (que suelta raíces colgantes) y labra el camino.
 * null si no hace nada.
 */
export function soilUse(get: GetBlock, x: number, y: number, z: number, item: number, hangingRoots: number): SoilUse | null {
  const kind = ITEMS[item]?.tool?.kind;
  if (kind !== 'shovel' && kind !== 'hoe') return null;
  const id = get(x, y, z);
  if (get(x, y + 1, z) !== AIR) return null;
  if (kind === 'shovel') return PATHABLE.has(id) ? { block: DIRT_PATH, drop: 0 } : null;
  if (id === COARSE_DIRT) return { block: DIRT, drop: 0 };
  if (id === ROOTED_DIRT) return { block: DIRT, drop: hangingRoots };
  if (id === DIRT_PATH) return { block: FARMLAND, drop: 0 };
  return null;
}

/**
 * Clic derecho sobre una tarta con vela. `h` es la altura del clic dentro del bloque (0..1): en la
 * vela (arriba) se enciende o se apaga; en la tarta se come una porción y la vela cae.
 */
export function candleCakeUse(id: number, h: number): { block: number; eat: boolean; drop: number } | null {
  if (!isCandleCake(id)) return null;
  const candle = candleOfCake(id);
  if (h > 0.5) return { block: candleCakeOf(candle, !isLitCandleCake(id)), eat: false, drop: 0 };
  return { block: CAKE + 1, eat: true, drop: candle };
}
