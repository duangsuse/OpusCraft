// Semilla escrita por el jugador al crear un mundo: un número se usa tal cual y un texto se convierte
// en número (como en Minecraft, con el hash de Java).

/** Semilla de 32 bits a partir de lo escrito; null si está vacío. */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^-?\d{1,10}$/.test(t)) return Number(t) | 0;
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return h;
}
