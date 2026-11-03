// Fase 7.5 (océano): lo que un mapa de estructura lleva en sus datos (ItemData.smap) y cómo se valida.
// Va aparte de structureMaps.ts para que itemData.ts pueda validarlo sin cargar el generador del mundo.
import { WORLD_LIMIT } from './constants';

/**
 * Tipos de mapa de estructura: tesoro enterrado, los de explorador (oceánico y de bosques) y los del cartógrafo de
 * 26.3 (aldeas de cada clase, cabaña de la bruja, templo de la jungla y cámaras de desafío enterradas).
 */
export type StructureMapKind = 'buried_treasure' | 'monument' | 'mansion' | 'village_desert' | 'village_plains' | 'village_savanna'
  | 'village_snowy' | 'village_taiga' | 'swamp_hut' | 'jungle_temple' | 'trial_chambers';

/** Marca que se dibuja en el objetivo (MapDecorationTypes). */
export type StructureMapMarker = 'x' | 'monument' | 'mansion' | 'village_desert' | 'village_plains' | 'village_savanna' | 'village_snowy'
  | 'village_taiga' | 'swamp_hut' | 'jungle_temple' | 'trial_chambers';

export interface StructureMapDef {
  /** Clave de la estructura (la de locateStructure y /localizar). */
  structure: string;
  /** Aldeas: sólo las de esta clase (desert, plains, savanna, snowy o taiga). */
  village?: string;
  marker: StructureMapMarker;
  /** Nombre del objeto (el del mapa de Minecraft en español). */
  name: string;
  /** Regiones de la rejilla de estructuras en las que se busca (Minecraft: 50 chunks el tesoro, 100 los de explorador). */
  search: number;
  /**
   * Fase 7.5 (mansión): bloques por píxel del mapa (Minecraft: 1:2 el del tesoro, 1:4 los de explorador);
   * se dibuja con el estilo de exploración (tierra anaranjada y agua a rayas donde aún no se ha estado).
   */
  scale: number;
}

export const STRUCTURE_MAPS: Readonly<Record<StructureMapKind, StructureMapDef>> = {
  buried_treasure: { structure: 'buried_treasure', marker: 'x', name: 'Mapa del tesoro enterrado', search: 13, scale: 2 },
  // Fase 7.5 (mansión): los de explorador buscan en 100 regiones, como en Minecraft (el del tesoro, 50 chunks:
  // 13 regiones de 4 chunks).
  monument: { structure: 'monument', marker: 'monument', name: 'Mapa de explorador oceánico', search: 100, scale: 4 },
  mansion: { structure: 'mansion', marker: 'mansion', name: 'Mapa de explorador de bosques', search: 100, scale: 4 },
  // Los del cartógrafo de 26.3 (exploration_map con search_radius 100; escala 1:4, como los de explorador).
  village_desert: { structure: 'village', village: 'desert', marker: 'village_desert', name: 'Mapa de aldea del desierto', search: 100, scale: 4 },
  village_plains: { structure: 'village', village: 'plains', marker: 'village_plains', name: 'Mapa de aldea de llanura', search: 100, scale: 4 },
  village_savanna: { structure: 'village', village: 'savanna', marker: 'village_savanna', name: 'Mapa de aldea de sabana', search: 100, scale: 4 },
  village_snowy: { structure: 'village', village: 'snowy', marker: 'village_snowy', name: 'Mapa de aldea nevada', search: 100, scale: 4 },
  village_taiga: { structure: 'village', village: 'taiga', marker: 'village_taiga', name: 'Mapa de aldea de taiga', search: 100, scale: 4 },
  swamp_hut: { structure: 'swamp_hut', marker: 'swamp_hut', name: 'Mapa de explorador de pantanos', search: 100, scale: 4 },
  jungle_temple: { structure: 'jungle_temple', marker: 'jungle_temple', name: 'Mapa de explorador de junglas', search: 100, scale: 4 },
  // Aún no hay cámaras de desafío: el mapa nunca encuentra una y la oferta no sale (como en Java sin ninguna cerca).
  trial_chambers: { structure: 'trial_chambers', marker: 'trial_chambers', name: 'Mapa de cámaras de desafío', search: 100, scale: 4 },
};

/**
 * Fase 7.5 (mansión): zona que muestra un mapa de estructura: esquina noroeste y escala. Como en Minecraft,
 * la rejilla de mapas de su escala (128·escala bloques) en la celda que contiene el objetivo.
 */
export function structureMapArea(kind: StructureMapKind, x: number, z: number): { x0: number; z0: number; scale: number; span: number } {
  const scale = STRUCTURE_MAPS[kind].scale, span = 128 * scale;
  const cell = (v: number) => Math.floor((v + 64) / span) * span - 64;
  return { x0: cell(x), z0: cell(z), scale, span };
}

/** Datos de un mapa de estructura: tipo y, ya resuelto, la posición del objetivo. */
export interface StructureMapData {
  k: StructureMapKind;
  x?: number;
  z?: number;
}

export function isStructureMapKind(k: unknown): k is StructureMapKind {
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(STRUCTURE_MAPS, k);
}

/** Datos válidos de un mapa de estructura (tipo conocido y objetivo dentro del mundo), o undefined. */
export function sanitizeStructureMap(raw: unknown): StructureMapData | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isStructureMapKind(r.k)) return undefined;
  const x = Number(r.x), z = Number(r.z);
  if (!Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return { k: r.k };
  return { k: r.k, x, z };
}
