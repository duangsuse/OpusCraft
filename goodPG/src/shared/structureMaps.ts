// Fase 7.5 (océano): mapas de estructura. Un mapa que apunta a la estructura de un tipo más cercana, con
// su marca (X roja, monumento o mansión) y su nombre, como los mapas del tesoro y de explorador de
// Minecraft. Es un mapa normal (FILLED_MAP, que muestra la celda de 128×128 bloques que contiene el
// objetivo) con los datos `smap` = { k: tipo, x, z: objetivo }; el cliente dibuja la marca y el nombre.
//
// API (la usan el botín de las ruinas y los naufragios y el cartógrafo):
//   structureMap(kind, gen, x, z)   → el mapa del objetivo más cercano a (x, z), o un mapa vacío si no hay.
//   structureMapLoot(kind)          → función de botín: pone en el cofre un mapa «pendiente» de ese tipo.
//   resolveStructureMaps(stacks, gen, x, z) → resuelve los pendientes desde la posición del cofre (lo
//                                     hace ContainerSystem.fillLoot al llenar los cofres de un chunk).
//   structureMapOf(stack)           → tipo, objetivo y definición de un mapa de estructura (o null).
import { FILLED_MAP, EMPTY_MAP, type ItemStack } from './items';
import { mapKeyAt } from './maps';
import { locateStructure } from './world/structures';
import { villageKind } from './world/villages';
import type { TerrainGenerator } from './world/terrain';
import type { LootFn } from './loot';
import { STRUCTURE_MAPS, isStructureMapKind, type StructureMapKind, type StructureMapDef } from './structureMapData';

export { STRUCTURE_MAPS, type StructureMapKind, type StructureMapDef } from './structureMapData';

/** Mapa ya resuelto que apunta a (tx, tz). */
export function structureMapAt(kind: StructureMapKind, tx: number, tz: number): ItemStack {
  return { id: FILLED_MAP, count: 1, dmg: mapKeyAt(tx, tz), data: { smap: { k: kind, x: tx, z: tz } } };
}

/** Mapa del `kind` más cercano a (x, z); si no hay ninguno al alcance, un mapa vacío (como en Minecraft). */
export function structureMap(kind: StructureMapKind, gen: TerrainGenerator, x: number, z: number): ItemStack {
  const def = STRUCTURE_MAPS[kind];
  // Las aldeas, sólo las de su clase (según el bioma de su centro, el mismo que decide su estilo).
  const accept = def.village ? (sx: number, sz: number) => villageKind(gen.columnInfo(sx, sz).biome) === def.village : undefined;
  const p = locateStructure(gen, def.structure, Math.floor(x), Math.floor(z), def.search, accept);
  return p ? structureMapAt(kind, p[0], p[2]) : { id: EMPTY_MAP, count: 1 };
}

/** Mapa sin resolver (sólo el tipo): lo resuelve resolveStructureMaps al llenar el cofre. */
export function pendingStructureMap(kind: StructureMapKind): ItemStack {
  return { id: FILLED_MAP, count: 1, data: { smap: { k: kind } } };
}

/** Función de botín que convierte la entrada en un mapa pendiente del tipo dado. */
export function structureMapLoot(kind: StructureMapKind): LootFn {
  return () => pendingStructureMap(kind);
}

/** Resuelve (en el sitio) los mapas pendientes de una lista, desde la posición (x, z) del cofre. */
export function resolveStructureMaps(stacks: (ItemStack | null)[], gen: TerrainGenerator, x: number, z: number): void {
  for (let i = 0; i < stacks.length; i++) {
    const s = stacks[i];
    const sm = s?.data?.smap;
    if (!s || !sm || sm.x !== undefined) continue;
    stacks[i] = structureMap(sm.k, gen, x, z);
  }
}

/** Datos de un mapa de estructura resuelto: tipo, objetivo y definición. */
export function structureMapOf(s: ItemStack | null | undefined): { kind: StructureMapKind; x: number; z: number; def: StructureMapDef } | null {
  const sm = s?.id === FILLED_MAP ? s.data?.smap : undefined;
  if (!sm || !isStructureMapKind(sm.k) || sm.x === undefined || sm.z === undefined) return null;
  return { kind: sm.k, x: sm.x, z: sm.z, def: STRUCTURE_MAPS[sm.k] };
}
