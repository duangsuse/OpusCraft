// Fase 6.5 (colecciones): los discos de música del mundo normal. Cada uno tiene su propia composición
// original, sintetizada en el cliente (client/audio/discs.ts); aquí sólo va lo que comparten el
// servidor y el cliente: la clave, el título que se ve en la descripción y cuánto dura. El índice es
// el que viaja por la red y el orden fija los ids de los objetos: sólo se añaden al final.

export interface DiscDef {
  key: string;
  /** Título (en la descripción del objeto y al ponerlo a sonar). */
  title: string;
  /** Duración en segundos. */
  seconds: number;
}

export const DISCS: readonly DiscDef[] = [
  { key: '13', title: '13', seconds: 150 },
  { key: 'cat', title: 'cat', seconds: 124 },
  { key: 'blocks', title: 'blocks', seconds: 168 },
  { key: 'chirp', title: 'chirp', seconds: 118 },
  { key: 'far', title: 'far', seconds: 152 },
  { key: 'mall', title: 'mall', seconds: 140 },
  { key: 'mellohi', title: 'mellohi', seconds: 98 },
  { key: 'stal', title: 'stal', seconds: 128 },
  { key: 'strad', title: 'strad', seconds: 112 },
  { key: 'ward', title: 'ward', seconds: 172 },
  { key: '11', title: '11', seconds: 71 },
  { key: 'wait', title: 'wait', seconds: 160 },
  { key: 'otherside', title: 'otherside', seconds: 134 },
  { key: '5', title: '5', seconds: 178 }, // Fase 7.5 (abismo): de nueve fragmentos de las ciudades antiguas
  { key: 'tears', title: 'Tears', seconds: 175 }, // Fase 8.3 (criaturas del Nether): del ghast muerto por su propia bola de fuego
  { key: 'pigstep', title: 'Pigstep', seconds: 148 }, // Fase 8.4 (estructuras del Nether): de los cofres de los bastiones
];

/** Índice del disco por su clave (-1 si no existe). */
export function discIndexOfKey(key: string): number {
  return DISCS.findIndex((d) => d.key === key);
}
