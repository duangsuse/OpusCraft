// Fase 6.5 (materiales): materiales y suelos del mundo normal que faltaban. Bloques de hierro y de oro
// en bruto, de carbón, de lapislázuli, de huesos (orientable por ejes, como los troncos) y de slime
// (rebota y frena); hielo azul (el más resbaladizo); suelos: tierra gruesa, podsol, tierra enraizada y
// camino de tierra (15/16 de alto); nieve polvo (no sostiene: se hunde quien la pisa y congela);
// ladrillos de piedra agrietados, musgosos y cincelados y pizarra profunda infestados; tartas con vela
// (una por cada una de las 17 velas, encendidas o apagadas) y huevos de rana (planos sobre el agua).
// Se registran al final de index.ts para no mover ningún id guardado.
import {
  family, defs, L, BLOCK_SOLID, BLOCK_RENDER, BLOCK_FLUID, BLOCK_FLUID_LEVEL, R_CROSS, R_MODEL, R_TRANSLUCENT,
  type NeighborGet, type Opts,
} from './registry';
import { GRASS, DIRT, SNOWY_GRASS } from './classic';
import { MYCELIUM } from './biomes';
import { CAKE } from './farm';
import { DEEPSLATE } from './underground';
import { MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS } from './structures';
import { CHISELED_STONE_BRICKS } from './stoneBlocks';
import { CANDLE, CANDLES, DYE_COLORS, COLOR_NAMES, isCandle } from './colors';
import { addInfested } from './monsterBlocks';
import { addAxisLogs } from './logAxis';
import { mbox, flatBoxes, unionBox, type ModelBox } from '../blockModels';

const block = (key: string, name: string, o: Opts): number => family(key, name, [], () => o);
const mineral = (tex: string, hardness: number, tier: number, o: Opts = {}): Opts => ({
  all: tex, hardness, tool: 'pickaxe', tier, sound: 'stone', category: 'minerales', ...o,
});

// ------------------------------------------------------------------ bloques de almacenamiento

export const RAW_IRON_BLOCK = block('raw_iron_block', 'Bloque de hierro en bruto', mineral('raw_iron_block', 5, 2));
export const RAW_GOLD_BLOCK = block('raw_gold_block', 'Bloque de oro en bruto', mineral('raw_gold_block', 5, 3));
export const COAL_BLOCK = block('coal_block', 'Bloque de carbón', mineral('coal_block', 5, 1));
export const LAPIS_BLOCK = block('lapis_block', 'Bloque de lapislázuli', mineral('lapis_block', 3, 2));
/** Bloque de huesos: de pie; tumbado a lo largo de X o de Z con BONE_BLOCK_AXIS (como los troncos). */
export const BONE_BLOCK = block('bone_block', 'Bloque de huesos', {
  top: 'bone_block_top', side: 'bone_block_side', hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone', category: 'construccion',
});
export const BONE_BLOCK_AXIS = addAxisLogs('bone_block', 'Bloque de huesos', BONE_BLOCK, 'bone_block_top', 'bone_block_side', undefined, {
  hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone',
});
/** Bloque de slime: translúcido; rebota a quien cae encima (sin daño) y frena al caminar por él. */
export const SLIME_BLOCK = block('slime_block', 'Bloque de slime', {
  all: 'slime_block', render: R_TRANSLUCENT, lightOpacity: 1, hardness: 0, sound: 'wool', category: 'decoracion',
});

// ------------------------------------------------------------------ hielo

/** Hielo azul: nueve de hielo compacto; más resbaladizo aún y no se derrite. */
export const BLUE_ICE = block('blue_ice', 'Hielo azul', {
  all: 'blue_ice', hardness: 2.8, tool: 'pickaxe', sound: 'glass', category: 'naturaleza',
});

// ------------------------------------------------------------------ suelos

const soil = (o: Opts): Opts => ({ hardness: 0.5, tool: 'shovel', sound: 'dirt', category: 'naturaleza', ...o });
/** Tierra gruesa: la hierba no se extiende por ella; con la azada se vuelve tierra. */
export const COARSE_DIRT = block('coarse_dirt', 'Tierra gruesa', soil({ all: 'coarse_dirt', sound: 'gravel' }));
/** Podsol: el suelo de las taigas; suelta tierra. */
export const PODZOL = block('podzol', 'Podsol', soil({ top: 'podzol_top', side: 'podzol_side', bottom: 'dirt' }));
/** Tierra enraizada: bajo las azaleas; con la azada se vuelve tierra y suelta raíces colgantes. */
export const ROOTED_DIRT = block('rooted_dirt', 'Tierra enraizada', soil({ all: 'rooted_dirt' }));
/** Camino de tierra: 15/16 de alto; vuelve a ser tierra si se pone un bloque sólido encima. Suelta tierra. */
export const DIRT_PATH = family('dirt_path', 'Camino de tierra', [], () => {
  const top = L('dirt_path_top'), side = L('dirt_path_side'), bottom = L('dirt');
  return {
    render: R_MODEL, top: 'dirt_path_top', side: 'dirt_path_side', bottom: 'dirt', hardness: 0.65, tool: 'shovel', sound: 'grass',
    category: 'naturaleza', lightOpacity: 15,
    model: [mbox(0, 0, 0, 16, 15, 16, [side, side, top, bottom, side, side])],
    collision: [0, 0, 0, 1, 15 / 16, 1],
  };
});
/** Suelos que la pala convierte en camino de tierra (con aire encima). */
export const PATHABLE: ReadonlySet<number> = new Set([GRASS, SNOWY_GRASS, DIRT, COARSE_DIRT, PODZOL, MYCELIUM, ROOTED_DIRT]);

/**
 * Nieve polvo: parece un bloque de nieve, pero no sostiene (no es sólida): quien entra se hunde
 * despacio y, si se queda, se congela. Con botas de cuero se puede andar por encima. No es objeto: se
 * recoge y se pone con el cubo.
 */
export const POWDER_SNOW = block('powder_snow', 'Nieve polvo', {
  all: 'powder_snow', solid: false, hardness: 0.25, tool: 'shovel', sound: 'snow', category: null, noItem: true,
});

// ------------------------------------------------------------------ infestados

const infested = (key: string, name: string, mimics: number, hardness: number): number => {
  const b = defs[mimics];
  const id = family(key, name, [], () => ({ tex: b.tex, hardness, tool: 'pickaxe', sound: 'stone', category: 'naturaleza' }));
  addInfested(id, mimics);
  return id;
};
export const INFESTED_CRACKED_STONE_BRICKS = infested('infested_cracked_stone_bricks', 'Ladrillos de piedra agrietados infestados', CRACKED_STONE_BRICKS, 0.75);
export const INFESTED_MOSSY_STONE_BRICKS = infested('infested_mossy_stone_bricks', 'Ladrillos de piedra musgosos infestados', MOSSY_STONE_BRICKS, 0.75);
export const INFESTED_CHISELED_STONE_BRICKS = infested('infested_chiseled_stone_bricks', 'Ladrillos de piedra cincelados infestados', CHISELED_STONE_BRICKS, 0.75);
export const INFESTED_DEEPSLATE = infested('infested_deepslate', 'Pizarra profunda infestada', DEEPSLATE, 1.5);

// ------------------------------------------------------------------ tartas con vela

const onFloor = (get: NeighborGet): boolean => {
  const b = get(0, -1, 0);
  return b < 0 || (BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS);
};

/** Vela (su estado base) → tarta con esa vela (`lit` 0 apagada, 1 encendida). */
export const CANDLE_CAKES: ReadonlyMap<number, number> = new Map<number, number>();
const CANDLE_OF_CAKE = new Map<number, number>();

function candleCake(candle: number, key: string, name: string, bodyTex: string): number {
  const id = family(key, name, [['lit', 2]], (st) => {
    const top = L('cake_top'), side = L('cake_side'), bottom = L('cake_bottom');
    const body = L(bodyTex), wick = L('black_concrete'), flame = L('candle_flame');
    const boxes: ModelBox[] = [
      mbox(1, 0, 1, 15, 8, 15, [side, side, top, bottom, side, side]),
      mbox(7, 8, 7, 9, 13, 9, body),
      mbox(7, 13, 7, 8, 14, 8, wick),
    ];
    if (st.lit) boxes.push(mbox(7, 14, 7, 8, 16, 8, flame));
    return {
      render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.5, sound: 'wool', top: 'cake_top', side: 'cake_side',
      bottom: 'cake_bottom', category: null, base: CAKE, emission: st.lit ? 3 : 0,
      model: boxes, collision: [1 / 16, 0, 1 / 16, 15 / 16, 0.5, 15 / 16], selection: unionBox(flatBoxes(boxes.slice(0, 3))),
      support: onFloor,
    };
  });
  (CANDLE_CAKES as Map<number, number>).set(candle, id);
  CANDLE_OF_CAKE.set(id, candle);
  CANDLE_OF_CAKE.set(id + 1, candle);
  return id;
}
candleCake(CANDLE, 'candle_cake', 'Tarta con vela', 'candle');
for (const c of DYE_COLORS) candleCake(CANDLES[c], `${c}_candle_cake`, `Tarta con vela ${COLOR_NAMES[c][1]}`, `${c}_concrete`);

/** ¿Tarta con vela (encendida o no)? */
export const isCandleCake = (id: number): boolean => CANDLE_OF_CAKE.has(id);
/** Vela (objeto) de una tarta con vela (0 si no lo es). */
export const candleOfCake = (id: number): number => CANDLE_OF_CAKE.get(id) ?? 0;
export const isLitCandleCake = (id: number): boolean => isCandleCake(id) && id !== CANDLE_CAKES.get(candleOfCake(id));
/** La tarta con la vela `candle` (encendida o no); 0 si `candle` no es una vela. */
export function candleCakeOf(candle: number, lit: boolean): number {
  const base = isCandle(candle) ? CANDLE_CAKES.get(candle) : undefined;
  return base === undefined ? 0 : base + (lit ? 1 : 0);
}

// ------------------------------------------------------------------ huevos de rana

/** Huevos de rana: planos sobre una fuente de agua (como el nenúfar); se atraviesan y eclosionan en renacuajos. */
export const FROGSPAWN = family('frogspawn', 'Huevos de rana', [], () => {
  const t = L('frogspawn');
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'grass', category: 'naturaleza',
    flatItem: 'frogspawn', walkThrough: true,
    model: [mbox(0, 0, 0, 16, 0.25, 16, [-1, -1, t, t, -1, -1])],
    collision: [], selection: [0, 0, 0, 1, 1.5 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || (BLOCK_FLUID[b] === 1 && BLOCK_FLUID_LEVEL[b] === 0);
    },
  };
});

// ------------------------------------------------------------------ inventario

/** Bloques nuevos en el orden del inventario creativo. */
export const MATERIAL_INVENTORY: readonly number[] = [
  RAW_IRON_BLOCK, RAW_GOLD_BLOCK, COAL_BLOCK, LAPIS_BLOCK, BONE_BLOCK, SLIME_BLOCK, BLUE_ICE,
  COARSE_DIRT, PODZOL, ROOTED_DIRT, DIRT_PATH,
  INFESTED_CRACKED_STONE_BRICKS, INFESTED_MOSSY_STONE_BRICKS, INFESTED_CHISELED_STONE_BRICKS, INFESTED_DEEPSLATE,
  FROGSPAWN,
];
