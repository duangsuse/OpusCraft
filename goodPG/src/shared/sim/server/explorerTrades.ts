// Fase 7.5 (mansión): las ofertas de mapas de explorador del cartógrafo. Cada una es el mapa de estructura
// (structureMaps.ts) que apunta a la estructura más cercana de su clase desde donde está el aldeano; si no
// hay ninguna en las 100 regiones de búsqueda, la oferta no sale (como en Minecraft). La búsqueda se hace
// sólo al abrir el comercio (nunca en el tick) y se recuerda por aldeano y, para los demás aldeanos de la
// zona, por chunk: así cada búsqueda larga se hace una sola vez.
import { EMPTY_MAP } from '../../items';
import { structureMap } from '../../structureMaps';
import { isStructureMapKind } from '../../structureMapData';
import type { ItemData } from '../../itemData';
import type { Entity } from '../entities';
import type { ServerContext } from './context';

export class ExplorerTrades {
  private maps = new WeakMap<Entity, Map<string, ItemData | null>>();
  /** Resultados por clase y chunk del aldeano (los comparten los aldeanos de una misma aldea). */
  private byChunk = new Map<string, ItemData | null>();

  constructor(private ctx: ServerContext) {}

  /** Datos del mapa de esa clase para el aldeano (null si no hay estructura al alcance: la oferta no sale). */
  mapData(e: Entity, kind: string): ItemData | null {
    let m = this.maps.get(e);
    if (!m) this.maps.set(e, (m = new Map()));
    if (!m.has(kind)) {
      const key = `${kind}:${Math.floor(e.x / 16)},${Math.floor(e.z / 16)}`;
      let data = this.byChunk.get(key);
      if (data === undefined) {
        const map = isStructureMapKind(kind) ? structureMap(kind, this.ctx.world.gen, e.x, e.z) : null;
        data = map && map.id !== EMPTY_MAP && map.data ? map.data : null;
        if (this.byChunk.size >= 256) this.byChunk.delete(this.byChunk.keys().next().value!);
        this.byChunk.set(key, data);
      }
      m.set(kind, data);
    }
    return m.get(kind)!;
  }
}
