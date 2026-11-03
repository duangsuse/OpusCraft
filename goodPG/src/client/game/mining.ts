// Tiempo de minado de un bloque según la herramienta (fórmula de Minecraft).
import { BLOCKS, ALL_LEAVES, isVine, COBWEB } from '../../shared/blocks';
import { ITEMS } from '../../shared/items';
import { isBamboo } from '../../shared/blocks'; // Fase 6.5 (maderas)
import { efficiencyBonus } from '../../shared/enchantEffects'; // Fase 7 (encantamientos)

const LEAVES = new Set(ALL_LEAVES);

/** ¿Suelta algo este bloque con esta herramienta? */
export function canHarvest(block: number, toolId: number): boolean {
  const b = BLOCKS[block];
  if (!b) return false;
  if (b.tier <= 0) return true;
  const t = toolId > 0 ? ITEMS[toolId]?.tool : undefined;
  return !!t && t.kind === 'pickaxe' && t.tier >= b.tier;
}

/** Multiplicador de velocidad de la herramienta sobre el bloque. */
export function toolSpeed(block: number, toolId: number): number {
  const b = BLOCKS[block];
  const t = toolId > 0 ? ITEMS[toolId]?.tool : undefined;
  if (!b || !t) return 1;
  if (t.kind === 'shears') {
    if (LEAVES.has(block) || block === COBWEB) return 15;
    if (isVine(block)) return 2;
    if (b.sound === 'wool') return 5;
    return 1;
  }
  if (t.kind === 'sword' && isBamboo(block)) return 60; // Fase 6.5 (maderas): la espada corta el bambú al momento
  if (t.kind === 'sword') return block === COBWEB ? 15 : LEAVES.has(block) ? 1.5 : 1;
  return b.tool === t.kind ? t.speed : 1;
}

/**
 * Segundos para romper el bloque (0 = instantáneo, Infinity = irrompible).
 * Bajo el agua y en el aire se mina cinco veces más despacio. `effects`: multiplicador de los efectos
 * (Fase 7: Prisa y Fatiga minera).
 */
export function breakTime(block: number, toolId: number, underwater: boolean, onGround: boolean, efficiency = 0, effects = 1): number {
  const b = BLOCKS[block];
  if (!b || !b.breakable || b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0;
  let speed = toolSpeed(block, toolId);
  // Fase 7 (encantamientos): Eficiencia suma nivel² + 1, sólo con la herramienta adecuada.
  if (speed > 1) speed += efficiencyBonus(efficiency);
  speed *= effects;
  if (underwater) speed /= 5;
  if (!onGround) speed /= 5;
  const perTick = speed / b.hardness / (canHarvest(block, toolId) ? 30 : 100);
  if (perTick >= 1) return 0;
  return Math.ceil(1 / perTick) / 20;
}
