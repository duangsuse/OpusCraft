// Fase 8: las dimensiones. Cada una es un mundo aparte (su generador, sus chunks guardados, sus criaturas y
// sus sistemas) con sus reglas de cielo, luz, clima y física. Es un registro de datos a propósito: el
// Nether y el End son dos entradas más, y lo serán también los lugares a los que se llegue de otra manera
// (un cohete a la Luna, por ejemplo). Viajar es siempre lo mismo: llevar al jugador a la dimensión D, a un
// punto P (ver sim/Multiverse.ts).
//
// Los ids se guardan (en el registro de cada jugador y como prefijo de lo guardado de cada dimensión):
// sólo se añaden al final.

export const DIM_OVERWORLD = 0;
export const DIM_NETHER = 1;
/** Fase 8.6. */
export const DIM_END = 2;

/** Ticks dentro de un portal del Nether para viajar en supervivencia (4 s; en creativo, al momento). */
export const PORTAL_TICKS = 80;

export interface DimensionDef {
  id: number;
  key: string;
  /** Nombre para mostrar. */
  name: string;
  /** Bloques del mundo normal por cada bloque de esta dimensión (el Nether, 8). */
  scale: number;
  /** ¿Llega la luz del cielo? (sin ella la luz sólo sale de los bloques y de `ambient`). */
  skyLight: boolean;
  /** ¿Hay sol, luna, estrellas, nubes y ciclo de día? */
  sky: boolean;
  /** ¿Llueve y nieva? */
  weather: boolean;
  /** Luz mínima de todo (0..1): la penumbra rojiza del Nether. */
  ambient: number;
  /** Color de la niebla y del fondo cuando no hay cielo (sRGB 0..255). */
  fog: [number, number, number];
  /** Distancia de la niebla (fracción del radio de visión; 1 = la normal). */
  fogDistance: number;
  /** Gravedad relativa (1 = la del mundo normal). */
  gravity: number;
  /** ¿Se puede respirar? (sin aire, la barra de aire baja como bajo el agua). */
  breathable: boolean;
  /** ¿Se evapora el agua que se vierte? */
  evaporatesWater: boolean;
  /** Fase 8.2: ¿corre la lava rápido? (FAST_LAVA de Java: avanza 7 bloques y se actualiza cada 10 ticks). */
  fastLava: boolean;
  /** ¿Se puede dormir? (si no, la cama explota). */
  beds: boolean;
  /** ¿Se puede reaparecer aquí al morir? (si no, se vuelve al mundo normal). */
  respawn: boolean;
  /** ¿Van las brújulas y los relojes? */
  compass: boolean;
  /** Fase 8.5: ¿funciona el nexo de reaparición? (si no, explota al usarlo cargado). */
  anchors: boolean;
  /**
   * Fase 8.6: el cielo que se dibuja sin sol ('end': el vacío del End con sus nebulosas y sus destellos; sin él, el
   * color de la niebla). La luz del cielo sigue existiendo aparte (skyLight: en el End sí, en el Nether no).
   */
  skybox?: 'end';
  /** Fase 8.6: color de la penumbra (visual/ambient_light_color; sin él, el tono de la niebla). */
  ambientColor?: [number, number, number];
  /** Fase 8 (entorno): altura de la superficie de su mar de lava (la niebla se enciende y el aire ondula encima). */
  lavaSea?: number;
}

const DEFS: DimensionDef[] = [
  {
    id: DIM_OVERWORLD, key: 'overworld', name: 'Mundo normal', scale: 1, skyLight: true, sky: true, weather: true,
    ambient: 0, fog: [192, 216, 255], fogDistance: 1, gravity: 1, breathable: true, evaporatesWater: false, fastLava: false,
    beds: true, respawn: true, compass: true, anchors: false,
  },
  {
    id: DIM_NETHER, key: 'nether', name: 'El Nether', scale: 8, skyLight: false, sky: false, weather: false,
    ambient: 0.1, fog: [51, 8, 8], fogDistance: 0.5, gravity: 1, breathable: true, evaporatesWater: true, fastLava: true,
    beds: false, respawn: false, compass: false, anchors: true, lavaSea: 31 + 8 / 9,
  },
  // Fase 8.6: el End (dimension_type the_end de la 26.3): hay luz del cielo pero no sol, ni tiempo, ni clima; luz
  // ambiental 0,25 en gris verdoso (#3f473f), niebla #181318 y su propio cielo con los destellos.
  {
    id: DIM_END, key: 'end', name: 'El End', scale: 1, skyLight: true, sky: false, weather: false,
    ambient: 0.25, ambientColor: [63, 71, 63], fog: [24, 19, 24], fogDistance: 1, gravity: 1, breathable: true, evaporatesWater: false,
    fastLava: false, beds: false, respawn: false, compass: false, anchors: false, skybox: 'end',
  },
];

/** Definición de una dimensión (la del mundo normal si el id no existe). */
export function dimensionDef(id: number): DimensionDef {
  return DEFS[id] ?? DEFS[DIM_OVERWORLD];
}

export function isDimension(id: unknown): id is number {
  return Number.isInteger(id) && DEFS[id as number] !== undefined;
}

/** Dimensión por su clave o su nombre (para los comandos), o -1. */
export function dimensionByKey(key: string): number {
  const k = key.trim().toLowerCase();
  const d = DEFS.find((d) => d.key === k || d.name.toLowerCase() === k || d.name.toLowerCase().replace(/^el /, '') === k);
  return d ? d.id : -1;
}

export function allDimensions(): readonly DimensionDef[] {
  return DEFS;
}
