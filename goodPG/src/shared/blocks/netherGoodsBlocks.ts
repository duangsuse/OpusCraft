// Fase 8.5 (lo que da el Nether): bloques nuevos (registrados los últimos: ids nuevos).
// - Escombros ancestrales: la mena de la netherita, enterrada en la rocanegra del Nether (hace falta pico de
//   diamante; dureza 30, resiste las explosiones como la obsidiana y su objeto no arde).
// - Bloque de netherita: nueve lingotes (dureza 50, pico de diamante, base de faro).
// - Cuarzo: ladrillos, pilar (orientado como un tronco), cincelado y liso, y las losas y escaleras del bloque de
//   cuarzo y del liso.
// - Magnetita: la brújula que se usa en ella apunta a ella (en su dimensión).
// - Fogata de almas: la fogata con fuego de alma (turquesa): luz 10, quema el doble y ahuyenta a los piglins.
// - Nexo de reaparición: se carga con piedra luminosa (hasta 4); en el Nether fija el punto de reaparición y cada
//   reaparición gasta una carga; fuera del Nether explota al usarlo. Luz 0, 3, 7, 11 y 15 según las cargas.
// - Faro: cristal con el núcleo de la estrella del Nether sobre obsidiana; con una pirámide debajo, da efectos.
import { family, L, R_MODEL, R_WATER, type SoundMaterial } from './registry';
import { mbox } from '../blockModels';
import { QUARTZ_BLOCK } from './classic';
import { addMaterialShapes } from './building';
import { addAxisLogs } from './logAxis';
import { campfireOpts, CAMPFIRE } from './workstations';
import { familyBase } from './registry';

export const ANCIENT_DEBRIS = family('ancient_debris', 'Escombros ancestrales', [], () => ({
  side: 'ancient_debris_side', top: 'ancient_debris_top', bottom: 'ancient_debris_top',
  hardness: 30, tool: 'pickaxe', tier: 4, sound: 'ancient_debris', category: 'minerales',
}));

export const NETHERITE_BLOCK = family('netherite_block', 'Bloque de netherita', [], () => ({
  all: 'netherite_block', hardness: 50, tool: 'pickaxe', tier: 4, sound: 'netherite', category: 'minerales',
}));

// ------------------------------------------------------------------ cuarzo

const QUARTZ = (hardness: number) => ({ hardness, tool: 'pickaxe' as const, tier: 1, sound: 'stone' as SoundMaterial, category: 'construccion' as const });
export const QUARTZ_BRICKS = family('quartz_bricks', 'Ladrillos de cuarzo', [], () => ({ ...QUARTZ(0.8), all: 'quartz_bricks' }));
export const QUARTZ_PILLAR = family('quartz_pillar', 'Pilar de cuarzo', [], () => ({
  ...QUARTZ(0.8), top: 'quartz_pillar_top', side: 'quartz_pillar',
}));
addAxisLogs('quartz_pillar', 'Pilar de cuarzo', QUARTZ_PILLAR, 'quartz_pillar_top', 'quartz_pillar', undefined, { ...QUARTZ(0.8), category: null });
export const CHISELED_QUARTZ_BLOCK = family('chiseled_quartz_block', 'Bloque de cuarzo cincelado', [], () => ({
  ...QUARTZ(0.8), top: 'chiseled_quartz_block_top', side: 'chiseled_quartz_block',
}));
export const SMOOTH_QUARTZ = family('smooth_quartz', 'Bloque de cuarzo liso', [], () => ({ ...QUARTZ(2), all: 'smooth_quartz' }));
addMaterialShapes({ key: 'quartz', name: 'de cuarzo', block: QUARTZ_BLOCK, hardness: 0.8, tool: 'pickaxe', tier: 1, sound: 'stone' });
addMaterialShapes({ key: 'smooth_quartz', name: 'de cuarzo liso', block: SMOOTH_QUARTZ, hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone' });

// ------------------------------------------------------------------ magnetita

export const LODESTONE = family('lodestone', 'Magnetita', [], () => ({
  top: 'lodestone_top', bottom: 'lodestone_top', side: 'lodestone_side', hardness: 3.5, tool: 'pickaxe', tier: 1, sound: 'lodestone',
  category: 'decoracion',
}));

// ------------------------------------------------------------------ fogata de almas

export const SOUL_CAMPFIRE = family('soul_campfire', 'Fogata de almas', [['lit', 2]], (st) => campfireOpts(st.lit === 1, true));

/** ¿Es una fogata (la normal o la de almas; encendida o no)? (la etiqueta campfires). */
export function isCampfire(id: number): boolean {
  if (id <= 0) return false;
  const b = familyBase(id);
  return b === CAMPFIRE || b === SOUL_CAMPFIRE;
}

// ------------------------------------------------------------------ nexo de reaparición

/** Cargas máximas del nexo de reaparición. */
export const RESPAWN_ANCHOR_MAX_CHARGES = 4;

export const RESPAWN_ANCHOR = family('respawn_anchor', 'Nexo de reaparición', [['charges', 5]], (st) => ({
  side: `respawn_anchor_side${st.charges}`, top: st.charges > 0 ? 'respawn_anchor_top' : 'respawn_anchor_top_off',
  bottom: 'respawn_anchor_bottom', emission: [0, 3, 7, 11, 15][st.charges], hardness: 50, tool: 'pickaxe', tier: 4, sound: 'stone',
  category: 'decoracion',
}));

/** Cargas de un nexo de reaparición (-1 si no lo es). */
export function anchorCharges(id: number): number {
  return id > 0 && familyBase(id) === RESPAWN_ANCHOR ? id - RESPAWN_ANCHOR : -1;
}

// ------------------------------------------------------------------ faro

/** Faro: la caja de cristal, el núcleo de la estrella del Nether y la base de obsidiana. */
export const BEACON = family('beacon', 'Faro', [], () => {
  const glass = L('glass'), core = L('beacon'), obs = L('obsidian');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, emission: 15, hardness: 3, sound: 'glass', category: 'decoracion',
    all: 'glass',
    model: [
      mbox(2, 0.1, 2, 14, 3, 14, obs),
      mbox(3, 3, 3, 13, 14, 13, core),
      mbox(0, 0, 0, 16, 16, 16, glass),
    ],
  };
});

// ------------------------------------------------------------------ columna de burbujas

/**
 * Columna de burbujas (BubbleColumnBlock): agua quieta encima de arena de alma (sube, `drag` 0) o de bloque de
 * magma (tira hacia abajo, `drag` 1). Para los fluidos es una fuente de agua; se forma y se deshace sola.
 */
export const BUBBLE_COLUMN = family('bubble_column', 'Columna de burbujas', [['drag', 2]], () => ({
  all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: null, fluid: 1, level: 0,
  noItem: true,
}));

/** ¿Es una columna de burbujas? */
export function isBubbleColumn(id: number): boolean {
  return id === BUBBLE_COLUMN || id === BUBBLE_COLUMN + 1;
}

/** ¿Tira hacia abajo la columna (sobre magma)? */
export function bubbleColumnDown(id: number): boolean {
  return id === BUBBLE_COLUMN + 1;
}

/** Su sitio en el inventario creativo. */
export const NETHER_GOODS_INVENTORY: number[] = [
  ANCIENT_DEBRIS, NETHERITE_BLOCK, QUARTZ_BRICKS, QUARTZ_PILLAR, CHISELED_QUARTZ_BLOCK, SMOOTH_QUARTZ, LODESTONE, SOUL_CAMPFIRE,
  RESPAWN_ANCHOR, BEACON,
];
