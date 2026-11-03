// Fase 8.5 (lo que da el Nether): la mesa de herrería dentro de la pantalla de inventario (como la afiladora): la
// plantilla, el objeto y el material, la flecha (tachada si lo puesto no casa) y el resultado. Cada hueco sólo
// admite lo suyo, de uno en uno; coger la salida gasta uno de cada. Las recetas están en shared/smithing.ts.
import './smithing.css';
import type { ItemStack } from '../../shared/items';
import { smithingAccepts, smithingResult, smithingConsume, SMITH_TEMPLATE, SMITH_BASE, SMITH_ADDITION } from '../../shared/smithing';
import type { WorkHost, WorkPanel } from './enchantScreens';

export class SmithingPanel implements WorkPanel {
  constructor(private host: WorkHost, private pos: [number, number, number]) {}

  html(): string {
    return '<h3>Mejorar equipo</h3><div class="smith">' +
      `<div class="smith-in"><div class="slot2" data-s="grid:${SMITH_TEMPLATE}" data-hint="Plantilla"></div>` +
      `<div class="slot2" data-s="grid:${SMITH_BASE}" data-hint="Objeto"></div>` +
      `<div class="slot2" data-s="grid:${SMITH_ADDITION}" data-hint="Material"></div></div>` +
      '<div class="arrow smith-arrow"></div><div class="slot2 big" data-s="out"></div>' +
      '<p class="smith-hint"></p></div>';
  }

  accepts(i: number, s: ItemStack): number {
    return smithingAccepts(i, s.id) ? 64 : 0;
  }

  result(grid: readonly (ItemStack | null)[]): ItemStack | null {
    return smithingResult(grid[SMITH_TEMPLATE], grid[SMITH_BASE], grid[SMITH_ADDITION]);
  }

  take(grid: (ItemStack | null)[]): boolean {
    if (!this.result(grid)) return false;
    smithingConsume(grid);
    this.host.smithUsed(this.pos);
    return true;
  }

  render(panel: HTMLElement, grid: readonly (ItemStack | null)[]): void {
    const full = !!grid[SMITH_TEMPLATE] && !!grid[SMITH_BASE] && !!grid[SMITH_ADDITION];
    const ok = !!this.result(grid);
    panel.querySelector('.smith-arrow')?.classList.toggle('no', full && !ok);
    const hint = panel.querySelector('.smith-hint') as HTMLElement | null;
    if (hint) {
      hint.textContent = grid[SMITH_TEMPLATE] && !grid[SMITH_BASE]
        ? 'Pon una pieza de diamante'
        : grid[SMITH_TEMPLATE] && !grid[SMITH_ADDITION] ? 'Pon un lingote de netherita' : '';
    }
  }

  click(): boolean {
    return false;
  }
}
