// Fase 7 (redstone): lo que sueltan los bloques de redstone que no son su propio objeto: el polvo suelta
// polvo de redstone, la cuerda tendida suelta cuerda y la mena encendida, lo mismo que la apagada.
import { isWire, isTripwire, isLitRedstoneOre, redstoneOreLit } from '../blocks';
import { REDSTONE, STRING, type ItemStack } from '../items';

/** null si el bloque no es de éstos. `drops` es blockDrops (para la mena). */
export function redstoneDrops(
  block: number, toolId: number, rand: () => number, drops: (block: number, toolId: number, rand: () => number) => ItemStack[],
): ItemStack[] | null {
  if (isWire(block)) return [{ id: REDSTONE, count: 1 }];
  if (isTripwire(block)) return [{ id: STRING, count: 1 }];
  if (isLitRedstoneOre(block)) return drops(redstoneOreLit(block, false), toolId, rand);
  return null;
}
