// Luces de rana (FroglightBlock de Java 26.3): las suelta el cubo de magma pequeño que se come una rana, de un color
// según la rana (ocre la templada, perlada la cálida y verdosa la fría). Dan luz 15, se colocan orientadas como un
// tronco y se rompen enseguida con cualquier cosa (dureza 0,3).
// Registradas al final (export * al final de index.ts): no mueven ningún id guardado.
import { family } from './registry';
import { addAxisLogs } from './logAxis';

const FROGLIGHT = { hardness: 0.3, emission: 15, sound: 'shroomlight' as const, category: 'decoracion' as const };

function froglight(key: string, name: string): number {
  const id = family(`${key}_froglight`, name, [], () => ({ ...FROGLIGHT, top: `${key}_froglight_top`, side: `${key}_froglight_side` }));
  addAxisLogs(`${key}_froglight`, name, id, `${key}_froglight_top`, `${key}_froglight_side`, undefined, { ...FROGLIGHT, category: null });
  return id;
}

export const OCHRE_FROGLIGHT = froglight('ochre', 'Luz de rana ocre');
export const VERDANT_FROGLIGHT = froglight('verdant', 'Luz de rana verdosa');
export const PEARLESCENT_FROGLIGHT = froglight('pearlescent', 'Luz de rana perlada');

/** Su sitio en el inventario creativo. */
export const FROG_INVENTORY: readonly number[] = [OCHRE_FROGLIGHT, VERDANT_FROGLIGHT, PEARLESCENT_FROGLIGHT];
