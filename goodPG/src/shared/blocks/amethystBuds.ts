// Brotes de amatista en las seis caras (AmethystClusterBlock de Java 26.3). Los de siempre (familia `amethyst_bud`)
// apuntan hacia arriba; aquí, los que apuntan hacia abajo (colgados del techo) y hacia los lados. Cada tamaño es su
// propio objeto (brote pequeño, mediano y grande, y racimo), como en Java, y cualquiera de ellos se pone en la cara
// que se toque. Se sostienen de la cara de detrás (si se quita, caen).
// Registrados al final (export * al final de index.ts): no mueven ningún id guardado.
import { family, defs, L, R_MODEL, stateOf, familyBase, BLOCK_SOLID, type NeighborGet } from './registry';
import { AMETHYST_BUD } from './underground';
import { mbox, type ModelBox } from '../blockModels';
import { pointTo } from './redstoneBlocks';

const STAGE_TEX = ['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'] as const;
const STAGE_NAMES = ['Brote de amatista pequeño', 'Brote de amatista mediano', 'Brote de amatista grande', 'Racimo de amatista'] as const;
/** [alto, margen] de cada tamaño (AmethystClusterBlock(height, aabbOffset)). */
const SHAPE: readonly (readonly [number, number])[] = [[3, 4], [4, 3], [5, 3], [7, 3]];
/** Direcciones de Java (get3DDataValue): 0 abajo, 1 arriba, 2 norte, 3 sur, 4 oeste, 5 este. */
export const DIR_VEC: readonly (readonly [number, number, number])[] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
/** Las cinco de esta familia (todas menos arriba) y su cara para pointTo (0 +x, 1 −x, 2 arriba, 3 abajo, 4 +z, 5 −z). */
const SIDE_DIRS = [0, 2, 3, 4, 5] as const;
const POINT_FACE: Readonly<Record<number, number>> = { 0: 3, 2: 5, 3: 4, 4: 1, 5: 0 };

// Cada tamaño de la familia de siempre, su propio bloque base (y así su propio objeto) con su nombre.
for (let s = 0; s < 4; s++) {
  defs[AMETHYST_BUD + s].base = AMETHYST_BUD + s;
  defs[AMETHYST_BUD + s].name = STAGE_NAMES[s];
}

/** El cristal como dos planos cruzados (se ven por las dos caras), de pie. */
function crossBoxes(t: number): ModelBox[] {
  return [mbox(8, 0, 0.5, 8, 16, 15.5, [t, t, -1, -1, -1, -1]), mbox(0.5, 0, 8, 15.5, 16, 8, [-1, -1, -1, -1, t, t])];
}

export const AMETHYST_BUD_SIDE = family('amethyst_bud_side', 'Brote de amatista', [['stage', 4], ['facing', 5]], (st) => {
  const dir = SIDE_DIRS[st.facing];
  const face = POINT_FACE[dir];
  const [h, o] = SHAPE[st.stage];
  const [b] = pointTo([mbox(o, 0, o, 16 - o, h, 16 - o, 0)], face);
  const box = [b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16];
  const [dx, dy, dz] = DIR_VEC[dir];
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, sound: 'glass', hardness: 1.5, tool: 'pickaxe', category: null,
    emission: [1, 2, 4, 5][st.stage], all: STAGE_TEX[st.stage], model: pointTo(crossBoxes(L(STAGE_TEX[st.stage])), face),
    selection: box, collision: [], walkThrough: true,
    support: (get: NeighborGet) => {
      const back = get(-dx, -dy, -dz);
      return back < 0 || BLOCK_SOLID[back] === 1;
    },
  };
});
for (let s = 0; s < 4; s++) {
  for (let f = 0; f < 5; f++) {
    const id = stateOf(AMETHYST_BUD_SIDE, { stage: s, facing: f });
    defs[id].base = AMETHYST_BUD + s; // lo que suelta y lo que se coge: el objeto de su tamaño
    defs[id].name = STAGE_NAMES[s];
  }
}

/** El brote de tamaño `stage` (0..3) que apunta hacia `dir` (dirección de Java, 0..5). */
export function amethystBudAt(stage: number, dir: number): number {
  if (dir === 1) return AMETHYST_BUD + stage;
  return stateOf(AMETHYST_BUD_SIDE, { stage, facing: SIDE_DIRS.indexOf(dir as 0) });
}

/** Tamaño y dirección de un brote de amatista (de cualquiera de las dos familias), o null. */
export function amethystBudInfo(id: number): { stage: number; dir: number } | null {
  if (id <= 0) return null;
  const b = familyBase(id);
  if (b === AMETHYST_BUD) return { stage: id - AMETHYST_BUD, dir: 1 };
  if (b !== AMETHYST_BUD_SIDE) return null;
  for (let s = 0; s < 4; s++) for (let f = 0; f < 5; f++) if (stateOf(AMETHYST_BUD_SIDE, { stage: s, facing: f }) === id) return { stage: s, dir: SIDE_DIRS[f] };
  return null;
}

/** ¿Es el objeto de un brote de amatista (de cualquier tamaño)? */
export function isAmethystBudItem(id: number): boolean {
  return id >= AMETHYST_BUD && id < AMETHYST_BUD + 4;
}

/** Nombres de los objetos de cada tamaño (claves de Java). */
export const AMETHYST_BUD_ITEM_KEYS = ['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'] as const;
