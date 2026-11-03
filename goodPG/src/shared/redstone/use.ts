// Fase 7 (redstone): lo que hace el clic derecho sobre los componentes, como función pura. El cliente
// lo usa para predecir el bloque nuevo y el servidor para aplicarlo (y luego hace el resto: sonidos,
// ticks programados, avisos a los vecinos).
import {
  isLever, isButton, mountedPowered, mountedWithPowered, isRepeater, REPEATER, repeaterDelay, isComparator, COMPARATOR,
  isDaylightDetector, daylightInverted, daylightWith, isNoteBlock, noteOf, noteBlockWith, isWire, wireDot, wirePower,
  wireState, wireConnections, redstoneOreLit, DAYLIGHT_DETECTOR, NOTE_BLOCK,
} from '../blocks/redstoneBlocks';
import type { NeighborGet } from '../blocks/registry';

const conn = [0, 0, 0, 0];

/**
 * Bloque que queda tras el clic derecho sobre `id` (el mismo si el clic se atiende sin cambiar nada,
 * como un botón ya pulsado); null si no es un componente que se use con la mano. `get` da los vecinos.
 */
export function redstoneUseState(id: number, get: NeighborGet): number | null {
  if (id <= 0) return null;
  if (isLever(id)) return mountedWithPowered(id, !mountedPowered(id));
  if (isButton(id)) return mountedPowered(id) ? id : mountedWithPowered(id, true);
  if (isRepeater(id)) return id - (repeaterDelay(id) << 2) + (((repeaterDelay(id) + 1) & 3) << 2);
  if (isComparator(id)) return COMPARATOR + (((id - COMPARATOR) ^ 4) & 15);
  if (isDaylightDetector(id)) return daylightWith(DAYLIGHT_DETECTOR, id - DAYLIGHT_DETECTOR, !daylightInverted(id));
  if (isNoteBlock(id)) return noteBlockWith(noteOf(id) + 1, id - NOTE_BLOCK >= 25);
  // Polvo suelto (sin nada a lo que unirse): alterna entre cruz y punto.
  if (isWire(id)) return wireConnections(get, wireDot(id), conn) === 0 ? wireState(wirePower(id), !wireDot(id)) : null;
  // La mena de redstone se enciende al tocarla.
  const ore = redstoneOreLit(id, true);
  return ore ? ore : null;
}
