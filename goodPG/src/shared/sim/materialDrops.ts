// Fase 6.5 (materiales): lo que sueltan las menas de hierro y oro (el mineral en bruto, como en
// Minecraft 1.17+) y los bloques nuevos que no se sueltan a sí mismos. drops.ts lo consulta antes de
// sus reglas; null = no es asunto de este módulo.
import {
  IRON_ORE, GOLD_ORE, DIRT, BLUE_ICE, PODZOL, DIRT_PATH, POWDER_SNOW, FROGSPAWN, isCandleCake, candleOfCake,
} from '../blocks';
import { RAW_IRON, RAW_GOLD, type ItemStack } from '../items';

export function materialDrops(block: number): ItemStack[] | null {
  switch (block) {
    case IRON_ORE:
      return [{ id: RAW_IRON, count: 1 }];
    case GOLD_ORE:
      return [{ id: RAW_GOLD, count: 1 }];
    // Podsol y camino de tierra: tierra (sin toque de seda).
    case PODZOL:
    case DIRT_PATH:
      return [{ id: DIRT, count: 1 }];
    // Hielo azul (sólo con toque de seda), nieve polvo (se recoge con el cubo) y huevos de rana.
    case BLUE_ICE:
    case POWDER_SNOW:
    case FROGSPAWN:
      return [];
  }
  // La tarta con vela suelta sólo la vela (la tarta se pierde).
  if (isCandleCake(block)) return [{ id: candleOfCake(block), count: 1 }];
  return null;
}
