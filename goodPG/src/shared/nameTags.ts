// Fase 6.5 (remate): nombres de las etiquetas (los usan el servidor y la ventana del cliente).

/** Largo máximo del nombre de una criatura. */
export const MAX_NAME = 32;

/** Limpia un nombre de etiqueta (sin caracteres de control, recortado); '' si no queda nada. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}
