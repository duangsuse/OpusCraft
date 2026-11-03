// Fase 6.5 (calderos): caldero con agua (3 niveles), con lava y con nieve polvo (3 niveles). Se llenan y
// vacían con los cubos, la lluvia llena poco a poco el de agua (y la nieve, el de nieve polvo), y en el de
// agua se lava la última capa de un estandarte. Todos sueltan el caldero vacío.
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import { family, defs, L, familyBase, stateOf, stateProps, R_MODEL } from './registry';
import { mbox, type ModelBox } from '../blockModels';
import { CAULDRON } from './villagerBlocks';

/** Contenido de un caldero. */
export const CAULDRON_EMPTY = 0, CAULDRON_WATER = 1, CAULDRON_LAVA = 2, CAULDRON_SNOW = 3;

/** Cajas del caldero vacío más la superficie del contenido a la altura de su nivel. */
function filled(surface: string, level: number): ModelBox[] {
  const base = (defs[CAULDRON].model ?? []) as ModelBox[];
  const top = 6 + level * 3; // en dieciseisavos: 9, 12 y 15, como en Minecraft
  const s = L(surface);
  return [...base, mbox(2, 4, 2, 14, top, 14, [-1, -1, s, -1, -1, -1])];
}

function cauldronOpts(surface: string, level: number) {
  const d = defs[CAULDRON];
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 2, tool: 'pickaxe' as const, sound: 'metal' as const,
    category: null, side: 'cauldron_side', top: 'cauldron_top', bottom: 'cauldron_bottom', base: CAULDRON,
    model: filled(surface, level), collision: d.collision, selection: d.selection,
  };
}

export const WATER_CAULDRON = family('water_cauldron', 'Caldero con agua', [['level', 3]], (st) => cauldronOpts('water', st.level + 1));
export const LAVA_CAULDRON = family('lava_cauldron', 'Caldero con lava', [], () => ({ ...cauldronOpts('lava', 3), emission: 15 }));
export const POWDER_SNOW_CAULDRON = family('powder_snow_cauldron', 'Caldero con nieve polvo', [['level', 3]], (st) =>
  cauldronOpts('powder_snow', st.level + 1));

/** Qué lleva un caldero y hasta dónde (0 si no es un caldero; nivel 0..3). */
export function cauldronFill(id: number): { kind: number; level: number } | null {
  const b = familyBase(id);
  if (b === CAULDRON) return { kind: CAULDRON_EMPTY, level: 0 };
  if (b === WATER_CAULDRON) return { kind: CAULDRON_WATER, level: stateProps(id)!.level + 1 };
  if (b === LAVA_CAULDRON) return { kind: CAULDRON_LAVA, level: 3 };
  if (b === POWDER_SNOW_CAULDRON) return { kind: CAULDRON_SNOW, level: stateProps(id)!.level + 1 };
  return null;
}

/** El bloque de caldero con ese contenido y nivel (nivel 0: vacío). */
export function cauldronOf(kind: number, level: number): number {
  if (level <= 0 || kind === CAULDRON_EMPTY) return CAULDRON;
  if (kind === CAULDRON_LAVA) return LAVA_CAULDRON;
  const l = Math.min(3, level) - 1;
  return kind === CAULDRON_WATER ? stateOf(WATER_CAULDRON, { level: l }) : stateOf(POWDER_SNOW_CAULDRON, { level: l });
}

export function isCauldron(id: number): boolean {
  return cauldronFill(id) !== null;
}

/** Altura (en bloques) de la superficie del contenido; 0 si está vacío. */
export function cauldronSurface(id: number): number {
  const f = cauldronFill(id);
  return f && f.level > 0 ? (6 + f.level * 3) / 16 : 0;
}
