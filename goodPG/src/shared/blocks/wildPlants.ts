// Fase 6.5 (océano y plantas): plantas del mundo que faltaban. Flores altas de dos bloques (girasol,
// lila, rosal, peonía y planta odre), hierba alta y helecho grande, anflorcha, arbusto de bayas
// dulces (crece, pincha y frena), hojas de azalea (normales y floridas), plantaformas grande (se
// inclina al pisarla) y pequeña, liquen luminoso, raíces colgantes y flor de esporas.
// Se registran al final de index.ts para no mover ningún id guardado.
import { family, L, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_RENDER, R_CROSS, R_CUTOUT, R_MODEL, type Opts, type NeighborGet } from './registry';
import { GRASS, DIRT, SNOWY_GRASS, SHORT_GRASS, FERN } from './classic';
import { FARMLAND } from './farm';
import { MOSS_BLOCK } from './underground';
import { mbox, rotateBoxes, type ModelBox } from '../blockModels';

const plant = (tex: string, o: Opts = {}): Opts => ({
  render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, all: tex,
  category: 'naturaleza', ...o,
});

/** Suelo de las flores (como las de antes: cualquier bloque sólido que no sea otra planta). */
const onGround = (get: NeighborGet): boolean => {
  const b = get(0, -1, 0);
  return b < 0 || (BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS);
};
const underCeiling = (get: NeighborGet): boolean => {
  const a = get(0, 1, 0);
  return a < 0 || BLOCK_OPAQUE[a] === 1;
};

// ------------------------------------------------------------------ plantas de dos bloques

/** Familias de plantas de dos bloques (`half` 0 abajo, 1 arriba). */
const TALL_BASES = new Set<number>();

/** Planta de dos bloques: la mitad de abajo es el objeto; la de arriba no se suelta. */
function tallPlant(key: string, name: string, o: Opts = {}): number {
  const id: number = family(key, name, [['half', 2]], (st) => ({
    ...plant(st.half ? `${key}_top` : `${key}_bottom`, o),
    flatItem: `${key}_top`,
    support: st.half === 0
      ? (get) => {
        const a = get(0, 1, 0);
        return onGround(get) && (a < 0 || a === id + 1);
      }
      : (get) => {
        const b = get(0, -1, 0);
        return b < 0 || b === id;
      },
  }));
  TALL_BASES.add(id);
  return id;
}

export const SUNFLOWER = tallPlant('sunflower', 'Girasol');
export const LILAC = tallPlant('lilac', 'Lila');
export const ROSE_BUSH = tallPlant('rose_bush', 'Rosal');
export const PEONY = tallPlant('peony', 'Peonía');
export const PITCHER_PLANT = tallPlant('pitcher_plant', 'Planta odre');
export const TALL_GRASS = tallPlant('tall_grass', 'Hierba alta', { replaceable: true });
export const LARGE_FERN = tallPlant('large_fern', 'Helecho grande', { replaceable: true });
export const SMALL_DRIPLEAF = tallPlant('small_dripleaf', 'Plantaforma pequeña');

/** ¿Planta de dos bloques (cualquier mitad)? */
export function isTallPlant(id: number): boolean {
  return TALL_BASES.has(id) || TALL_BASES.has(id - 1);
}

/** Mitad de abajo de una planta de dos bloques (o -1). */
export function tallPlantBase(id: number): number {
  return TALL_BASES.has(id) ? id : TALL_BASES.has(id - 1) ? id - 1 : -1;
}

/** Flores altas de las que el polvo de hueso saca una copia. */
export const TALL_FLOWERS: readonly number[] = [SUNFLOWER, LILAC, ROSE_BUSH, PEONY];

/** Planta pequeña → su versión de dos bloques (polvo de hueso). */
export const GROWS_TALL: ReadonlyMap<number, number> = new Map([[SHORT_GRASS, TALL_GRASS], [FERN, LARGE_FERN]]);

export const TORCHFLOWER = family('torchflower', 'Anflorcha', [], () => plant('torchflower', { support: onGround }));

// ------------------------------------------------------------------ bayas dulces

const BERRY_SOIL = new Set([GRASS, DIRT, SNOWY_GRASS, FARMLAND, FARMLAND + 1, MOSS_BLOCK]);

/** Arbusto de bayas dulces: `age` 0 brote, 1 arbusto, 2 con bayas verdes, 3 maduro. Se planta con las bayas. */
export const SWEET_BERRY_BUSH = family('sweet_berry_bush', 'Arbusto de bayas dulces', [['age', 4]], (st) => ({
  ...plant(`sweet_berry_bush_stage${st.age}`),
  noItem: true,
  walkThrough: true,
  support: (get) => {
    const b = get(0, -1, 0);
    return b < 0 || BERRY_SOIL.has(b);
  },
}));
export const isSweetBerryBush = (id: number): boolean => id >= SWEET_BERRY_BUSH && id < SWEET_BERRY_BUSH + 4;
export const berryAge = (id: number): number => (isSweetBerryBush(id) ? id - SWEET_BERRY_BUSH : -1);
/** ¿Tiene bayas para cosechar (edad 2 o 3)? */
export const isRipeBerryBush = (id: number): boolean => berryAge(id) >= 2;
/** ¿Pincha y frena al atravesarlo? (a partir de arbusto) */
export const isPricklyBush = (id: number): boolean => berryAge(id) >= 1;

// ------------------------------------------------------------------ azaleas

export const AZALEA_LEAVES = family('azalea_leaves', 'Hojas de azalea', [], () => ({
  all: 'azalea_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', hardness: 0.2, category: 'naturaleza',
}));
export const FLOWERING_AZALEA_LEAVES = family('flowering_azalea_leaves', 'Hojas de azalea florida', [], () => ({
  all: 'flowering_azalea_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', hardness: 0.2, category: 'naturaleza',
}));

// ------------------------------------------------------------------ plantaformas

/** Hoja de la plantaforma grande: `tilt` 0 plana, 1 inclinándose, 2 inclinada del todo (no aguanta). */
export const BIG_DRIPLEAF = family('big_dripleaf', 'Plantaforma grande', [['tilt', 3]], (st) => {
  const leaf = L('big_dripleaf_top'), stem = L('big_dripleaf_stem');
  const y = [15, 13, 9][st.tilt];
  const plate: ModelBox = st.tilt < 2
    ? mbox(0, y, 0, 16, y + 1, 16, [-1, -1, leaf, leaf, -1, -1])
    : mbox(0, y, 3, 16, y + 1, 16, [-1, -1, leaf, leaf, -1, -1]);
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.1, tool: 'axe', sound: 'grass', all: 'big_dripleaf_top',
    category: st.tilt === 0 ? 'naturaleza' : null,
    solid: st.tilt < 2, flatItem: 'big_dripleaf_top',
    model: [plate, mbox(7, 0, 7, 9, y, 9, [stem, stem, -1, -1, stem, stem])],
    itemModel: [mbox(0, 15, 0, 16, 16, 16, [-1, -1, leaf, leaf, -1, -1]), mbox(7, 0, 7, 9, 15, 9, [stem, stem, -1, -1, stem, stem])],
    collision: st.tilt < 2 ? [0, (y - 4) / 16, 0, 1, (y + 1) / 16, 1] : [],
    selection: [0, 0, 0, 1, (y + 1) / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || b === BIG_DRIPLEAF_STEM || (BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS && !isBigDripleaf(b));
    },
  };
});
/** Tallo de la plantaforma grande (sólo en el mundo: suelta la plantaforma). */
export const BIG_DRIPLEAF_STEM = family('big_dripleaf_stem', 'Plantaforma grande', [], () => ({
  ...plant('big_dripleaf_stem'),
  noItem: true,
  base: BIG_DRIPLEAF,
  support: (get) => {
    const b = get(0, -1, 0), a = get(0, 1, 0);
    const below = b < 0 || b === BIG_DRIPLEAF_STEM || (BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS);
    return below && (a < 0 || a === BIG_DRIPLEAF_STEM || isBigDripleaf(a));
  },
}));

export const isBigDripleaf = (id: number): boolean => id >= BIG_DRIPLEAF && id < BIG_DRIPLEAF + 3;
export const dripleafTilt = (id: number): number => (isBigDripleaf(id) ? id - BIG_DRIPLEAF : -1);

// ------------------------------------------------------------------ cuevas frondosas

/** Liquen luminoso: `face` es el lado de la celda que cubre (0 N, 1 E, 2 S, 3 O, 4 techo, 5 suelo). */
export const GLOW_LICHEN = family('glow_lichen', 'Liquen luminoso', [['face', 6]], (st) => {
  const t = L('glow_lichen');
  const f = st.face;
  const box = f < 4 ? rotateBoxes([mbox(0, 0, 0, 16, 16, 1, t)], f)[0] : f === 4 ? mbox(0, 15, 0, 16, 16, 16, t) : mbox(0, 0, 0, 16, 1, 16, t);
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0.2, sound: 'grass', all: 'glow_lichen',
    category: 'naturaleza', emission: 7, walkThrough: true, replaceable: true, flatItem: 'glow_lichen',
    model: [box], collision: [],
    selection: [box.x0 / 16, box.y0 / 16, box.z0 / 16, box.x1 / 16, box.y1 / 16, box.z1 / 16],
    support: (get) => {
      const d = LICHEN_DIRS[f];
      const b = get(d[0], d[1], d[2]);
      return b < 0 || BLOCK_OPAQUE[b] === 1;
    },
  };
});
/** Vecino al que se agarra el liquen de cada cara. */
export const LICHEN_DIRS: readonly (readonly [number, number, number])[] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
export const isGlowLichen = (id: number): boolean => id >= GLOW_LICHEN && id < GLOW_LICHEN + 6;

export const HANGING_ROOTS = family('hanging_roots', 'Raíces colgantes', [], () => plant('hanging_roots', { replaceable: true, support: underCeiling }));

/** Flor de esporas: cuelga del techo y suelta esporas verdes. */
export const SPORE_BLOSSOM = family('spore_blossom', 'Flor de esporas', [], () => {
  const t = L('spore_blossom');
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'grass', all: 'spore_blossom',
    category: 'naturaleza', flatItem: 'spore_blossom', walkThrough: true,
    model: [mbox(1, 15, 1, 15, 16, 15, [-1, -1, -1, t, -1, -1]), mbox(4, 13, 4, 12, 14, 12, [-1, -1, t, t, -1, -1])],
    collision: [],
    selection: [2 / 16, 12 / 16, 2 / 16, 14 / 16, 1, 14 / 16],
    support: underCeiling,
  };
});

/** Plantas nuevas en el orden del inventario creativo. */
export const WILD_PLANT_INVENTORY: readonly number[] = [
  SUNFLOWER, LILAC, ROSE_BUSH, PEONY, TORCHFLOWER, PITCHER_PLANT, TALL_GRASS, LARGE_FERN, AZALEA_LEAVES, FLOWERING_AZALEA_LEAVES,
  BIG_DRIPLEAF, SMALL_DRIPLEAF, GLOW_LICHEN, HANGING_ROOTS, SPORE_BLOSSOM,
];
