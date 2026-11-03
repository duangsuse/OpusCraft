// Troncos tumbados: cada madera tiene, además de su tronco de pie, uno a lo largo del eje X y otro a
// lo largo del Z (anillos en los extremos y corteza con la veta a lo largo). Se colocan al poner un
// tronco contra la cara lateral de un bloque (como en Minecraft) y los usan las ramas de los árboles.
// Sueltan el tronco normal y no son objeto propio. Se registran los últimos: no mueven ningún id.
import { family, type BlockDef, type Opts } from './registry';
import { WOOD_TYPES, addLogVariant, type WoodType } from './biomes';

/** Estado del tronco tumbado: 0 a lo largo de X, 1 a lo largo de Z. */
export const AXIS_X = 0;
export const AXIS_Z = 1;

/** Familia de troncos tumbados de cada madera (por la clave de la madera). */
export const LOG_AXIS: Record<string, number> = {};
const LOG_OF = new Map<number, number>();
const AXIS_OF_LOG = new Map<number, number>();

// Caras en el orden de BlockDef.tex: +X, −X, arriba, abajo, +Z, −Z.
const PX = 1, NX = 2, UP = 4, DN = 8, PZ = 16, NZ = 32;

for (const w of WOOD_TYPES) {
  const top = `${w.key}_log_top`, side = `${w.key}_log_side`;
  const base = family(`${w.key}_log_axis`, `Tronco ${w.name}`, [['axis', 2]], (st) => {
    const alongX = st.axis === AXIS_X;
    const tex: BlockDef['tex'] = alongX ? [top, top, side, side, side, side] : [side, side, side, side, top, top];
    return {
      tex, texRot: alongX ? UP | DN | PZ | NZ : PX | NX, sound: 'wood', hardness: 2, tool: 'axe', category: null, base: w.log,
    };
  });
  LOG_AXIS[w.key] = base;
  for (const a of [AXIS_X, AXIS_Z]) {
    LOG_OF.set(base + a, w.log);
    addLogVariant(base + a, w);
  }
  AXIS_OF_LOG.set(w.log, base);
}

/** Tronco tumbado de un tronco de pie a lo largo de un eje (el mismo tronco si no hay variante). */
export function horizontalLog(log: number, axis: number): number {
  const b = AXIS_OF_LOG.get(log);
  return b === undefined ? log : b + axis;
}

/** Tronco de pie de un tronco tumbado (0 si no lo es). */
export function uprightLog(id: number): number {
  return LOG_OF.get(id) ?? 0;
}

// Fase 6.5 (maderas): troncos tumbados de los troncos que se registran después (maderas nuevas,
// troncos sin corteza, bloques de bambú). Registra la familia `${key}_log_axis` y devuelve su base.
// Fase 6.5 (materiales): `extra` cambia el material (el bloque de huesos se pica y suena a piedra).
export function addAxisLogs(key: string, name: string, log: number, top: string, side: string, wood?: WoodType, extra: Opts = {}): number {
  const base = family(`${key}_log_axis`, name, [['axis', 2]], (st) => {
    const alongX = st.axis === AXIS_X;
    const tex: BlockDef['tex'] = alongX ? [top, top, side, side, side, side] : [side, side, side, side, top, top];
    return {
      tex, texRot: alongX ? UP | DN | PZ | NZ : PX | NX, sound: 'wood', hardness: 2, tool: 'axe', category: null, base: log,
      ...extra,
    };
  });
  LOG_AXIS[key] = base;
  for (const a of [AXIS_X, AXIS_Z]) {
    LOG_OF.set(base + a, log);
    if (wood) addLogVariant(base + a, wood);
  }
  AXIS_OF_LOG.set(log, base);
  return base;
}
