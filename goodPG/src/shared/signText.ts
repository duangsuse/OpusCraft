// Texto de los carteles: cuatro líneas cortas. Lo comparten el cliente (editor) y el servidor (que lo
// valida, lo guarda y lo reenvía a todos).

export const SIGN_LINES = 4;
export const SIGN_LINE_MAX = 15;

/** Cuatro líneas limpias (sin caracteres de control, recortadas); null si no es una lista. */
export function sanitizeSignLines(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (let i = 0; i < SIGN_LINES; i++) {
    const v = raw[i];
    const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, SIGN_LINE_MAX) : '';
    out.push(s);
  }
  return out;
}

/** ¿No dice nada? */
export function signIsBlank(lines: readonly string[]): boolean {
  return lines.every((l) => l.trim() === '');
}
