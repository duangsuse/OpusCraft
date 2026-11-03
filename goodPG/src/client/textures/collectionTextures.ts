// Fase 6.5 (colecciones): textura del aura del creeper cargado. Franjas diagonales de energía azul
// (píxeles emisivos, alpha 200) con huecos transparentes; cada fotograma las desplaza un poco, así el
// aura parece girar alrededor del cuerpo.

/** Fotogramas de la animación del aura. */
export const AURA_FRAMES = 8;

export function chargedAuraTexture(width: number, height: number, frame: number): { width: number; height: number; rgba: Uint8Array } {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const band = (x + y * 2 + frame * 2) % 12;
      const o = (y * width + x) * 4;
      if (band > 1) continue;
      // Oscuro a propósito: el shader multiplica los píxeles emisivos (brillan igual de noche).
      const k = band === 0 ? 1 : 0.75;
      rgba[o] = Math.round(42 * k);
      rgba[o + 1] = Math.round(86 * k);
      rgba[o + 2] = Math.round(176 * k);
      rgba[o + 3] = 200;
    }
  }
  return { width, height, rgba };
}
