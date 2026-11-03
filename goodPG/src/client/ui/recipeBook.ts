// Fase 9 (libro de recetas): el panel del libro junto a la mesa de trabajo, el inventario y los hornos. Lista las
// recetas desbloqueadas (una casilla por objeto) con buscador, pestañas, «sólo lo que puedes hacer» y páginas;
// las que se pueden hacer con lo que se lleva salen resaltadas. Un clic coloca la receta (con Mayús, tantas veces
// como dé el material); pasar el ratón enseña sus ingredientes. Lo que se hace al colocar es de la pantalla que
// lo abre (`onPick`): aquí sólo se elige.
import { itemName, type ItemStack } from '../../shared/items';
import { CRAFTING_TABLE, BRICKS, FURNACE, STONE } from '../../shared/blocks';
import { REDSTONE, TOOLS, LAVA_BUCKET, COOKED_PORKCHOP, IRON_INGOT } from '../../shared/items';
import {
  recipeGroups, planFill, tabsFor, matchesQuery, TAB_LABEL, type BookKind, type BookRecipe, type BookTab, type RecipeGroup,
} from '../../shared/recipeBook';
import './recipeBook.css';

export interface BookHost {
  icons: Map<number, string>;
  /** ¿Está desbloqueada? */
  has(r: BookRecipe): boolean;
  /** Cambia con cada receta nueva. */
  version(): number;
  sound(): void;
}

export interface BookContext {
  kind: BookKind;
  /** Lado de la cuadrícula donde se coloca (2, 3, o 1 en los hornos). */
  size: number;
}

const PAGE = 20;
const KEY = 'vc-recipebook-open';

/** El botón del libro (va junto a la cuadrícula de fabricación o a la del horno). */
export const BOOK_BUTTON =
  '<button class="rb-btn" data-rb title="Libro de recetas" type="button"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">' +
  '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H6a2 2 0 0 0-2 2z" fill="#3f8f2a"/><path d="M4 20a2 2 0 0 1 2-2h13v3H6a2 2 0 0 1-2-1z" fill="#e8dfc4"/>' +
  '<path d="M8 7h7M8 10h5" stroke="#dff2c9" stroke-width="1.6" stroke-linecap="round"/></svg></button>';

function loadOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY, open ? '1' : '0');
  } catch {
    // Sin almacenamiento: se olvida al recargar.
  }
}

export class RecipeBook {
  private el: HTMLElement;
  private search: HTMLInputElement;
  private tabsEl: HTMLElement;
  private grid: HTMLElement;
  private pageEl: HTMLElement;
  private onlyEl: HTMLElement;
  private tip: HTMLElement;
  private ctx: BookContext | null = null;
  private open = loadOpen();
  private tab: BookTab | 'all' = 'all';
  private only = false;
  private query = '';
  private page = 0;
  private drawn = '';
  /** Lo que enseña cada casilla de la página (para el clic y la descripción). */
  private cells: { group: RecipeGroup; recipe: BookRecipe }[] = [];
  private mouse = [0, 0];

  constructor(parent: HTMLElement, private host: BookHost, private stock: () => Map<number, number>, private version: () => number, private onPick: (r: BookRecipe, many: boolean) => void) {
    this.el = document.createElement('aside');
    this.el.className = 'panel rbook hidden';
    this.el.innerHTML =
      `<div class="rb-head"><input type="search" class="rb-search" placeholder="Buscar receta…" maxlength="40" autocomplete="off" spellcheck="false">` +
      `<button class="rb-only" type="button" title="Sólo lo que puedes hacer ahora">Hacer ya</button></div>` +
      `<div class="rb-tabs"></div><div class="rb-grid"></div>` +
      `<div class="rb-foot"><button class="rb-prev" type="button" aria-label="Página anterior">‹</button><span class="rb-page"></span>` +
      `<button class="rb-next" type="button" aria-label="Página siguiente">›</button></div>` +
      `<p class="rb-hint">Clic: colocar · Mayús + clic: tantas como puedas</p>`;
    parent.insertBefore(this.el, parent.firstChild);
    this.search = this.el.querySelector('.rb-search') as HTMLInputElement;
    this.tabsEl = this.el.querySelector('.rb-tabs') as HTMLElement;
    this.grid = this.el.querySelector('.rb-grid') as HTMLElement;
    this.pageEl = this.el.querySelector('.rb-page') as HTMLElement;
    this.onlyEl = this.el.querySelector('.rb-only') as HTMLElement;
    this.tip = document.createElement('div');
    this.tip.className = 'tooltip rb-tip hidden';
    document.body.appendChild(this.tip);

    this.search.addEventListener('input', () => {
      this.query = this.search.value;
      this.page = 0;
      this.render();
    });
    this.onlyEl.addEventListener('click', () => {
      this.only = !this.only;
      this.page = 0;
      this.host.sound();
      this.render();
    });
    this.el.querySelector('.rb-prev')!.addEventListener('click', () => this.turn(-1));
    this.el.querySelector('.rb-next')!.addEventListener('click', () => this.turn(1));
    this.tabsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (!b) return;
      this.tab = b.dataset.tab as BookTab | 'all';
      this.page = 0;
      this.host.sound();
      this.render();
    });
    this.grid.addEventListener('mousedown', (e) => {
      const c = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (!c) return;
      e.preventDefault();
      const cell = this.cells[Number(c.dataset.i)];
      if (cell) this.onPick(cell.recipe, e.shiftKey);
    });
    this.grid.addEventListener('mousemove', (e) => {
      this.mouse = [e.clientX, e.clientY];
      const c = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      const cell = c ? this.cells[Number(c.dataset.i)] : null;
      if (!cell) {
        this.tip.classList.add('hidden');
        return;
      }
      this.showTip(cell.recipe);
    });
    this.grid.addEventListener('mouseleave', () => this.tip.classList.add('hidden'));
    // La rueda pasa de página.
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.turn(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  isOpen(): boolean {
    return this.open && !!this.ctx;
  }

  /** Qué libro toca (null: esta pantalla no tiene). */
  setContext(ctx: BookContext | null): void {
    this.ctx = ctx;
    this.tab = 'all';
    this.page = 0;
    this.drawn = '';
    this.el.classList.toggle('hidden', !this.isOpen());
    if (!ctx) this.tip.classList.add('hidden');
    this.render();
  }

  toggle(): void {
    if (!this.ctx) return;
    this.open = !this.open;
    saveOpen(this.open);
    this.el.classList.toggle('hidden', !this.isOpen());
    this.tip.classList.add('hidden');
    this.host.sound();
    this.render();
  }

  private turn(d: number): void {
    this.page = Math.max(0, this.page + d);
    this.render();
  }

  /** Dibuja el libro (sólo si algo cambió: inventario, recetas, pestaña, búsqueda o página). */
  render(): void {
    const ctx = this.ctx;
    if (!ctx || !this.open) return;
    const key = `${ctx.kind}|${ctx.size}|${this.tab}|${this.only}|${this.query}|${this.page}|${this.version()}|${this.host.version()}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.renderTabs(ctx);
    this.onlyEl.classList.toggle('on', this.only);
    const stock = this.stock();
    const rows: { group: RecipeGroup; recipe: BookRecipe; can: boolean }[] = [];
    for (const g of recipeGroups(ctx.kind)) {
      if (this.tab !== 'all' && g.tab !== this.tab) continue;
      if (!matchesQuery(g.out, this.query)) continue;
      // La primera que se pueda hacer con lo que hay; si no, la primera que quepa y esté desbloqueada.
      let recipe: BookRecipe | null = null, can = false;
      for (const r of g.recipes) {
        if (!this.host.has(r) || !fits(r, ctx.size)) continue;
        if (!recipe) recipe = r;
        if (planFill(r, ctx.size, stock)) {
          recipe = r;
          can = true;
          break;
        }
      }
      if (!recipe || (this.only && !can)) continue;
      rows.push({ group: g, recipe, can });
    }
    // Lo que se puede hacer va delante.
    rows.sort((a, b) => Number(b.can) - Number(a.can));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * PAGE, this.page * PAGE + PAGE);
    this.cells = shown;
    this.grid.innerHTML = shown.length
      ? shown.map((r, i) => `<div class="rb-cell ${r.can ? 'can' : 'no'}" data-i="${i}"><i style="background-image:url(${this.host.icons.get(r.group.out) ?? ''})"></i></div>`).join('')
      : `<p class="rb-empty">${this.query ? 'Nada con ese nombre.' : this.only ? 'Ahora no puedes hacer nada.' : 'Aún no conoces ninguna receta: coge materiales.'}</p>`;
    this.pageEl.textContent = `${this.page + 1} / ${pages}`;
    (this.el.querySelector('.rb-prev') as HTMLButtonElement).disabled = this.page === 0;
    (this.el.querySelector('.rb-next') as HTMLButtonElement).disabled = this.page >= pages - 1;
  }

  private renderTabs(ctx: BookContext): void {
    const tabs = tabsFor(ctx.kind);
    if (tabs.length === 0) {
      this.tabsEl.innerHTML = '';
      this.tabsEl.classList.add('hidden');
      return;
    }
    this.tabsEl.classList.remove('hidden');
    const all: (BookTab | 'all')[] = ['all', ...tabs];
    this.tabsEl.innerHTML = all.map((t) => {
      const id = tabIcon(ctx.kind, t);
      return `<button type="button" class="rb-tab${t === this.tab ? ' sel' : ''}" data-tab="${t}" title="${t === 'all' ? 'Todas' : TAB_LABEL[t]}">` +
        `<i style="background-image:url(${this.host.icons.get(id) ?? ''})"></i></button>`;
    }).join('');
  }

  private showTip(r: BookRecipe): void {
    const stock = this.stock();
    const rows = r.needs.map((n) => {
      const have = n.alts.some((id) => (stock.get(id) ?? 0) >= n.n);
      const first = n.alts.find((id) => (stock.get(id) ?? 0) > 0) ?? n.alts[0];
      const many = n.alts.length > 1 ? ' (o similar)' : '';
      return `<div class="rb-ing${have ? '' : ' miss'}"><i style="background-image:url(${this.host.icons.get(first) ?? ''})"></i>${n.n}× ${itemName(first)}${many}</div>`;
    }).join('');
    const out: ItemStack = r.out;
    this.tip.innerHTML = `<b>${itemName(out.id)}${out.count > 1 ? ` ×${out.count}` : ''}</b>${rows}`;
    this.tip.classList.remove('hidden');
    this.tip.style.left = `${this.mouse[0] + 14}px`;
    this.tip.style.top = `${this.mouse[1] + 14}px`;
  }
}

function fits(r: BookRecipe, size: number): boolean {
  return r.shapeless ? r.cells.length <= size * size : r.w <= size && r.h <= size;
}

/** El objeto que hace de icono de cada pestaña. */
function tabIcon(kind: BookKind, t: BookTab | 'all'): number {
  if (kind === 'craft') return t === 'all' ? CRAFTING_TABLE : t === 'building' ? BRICKS : t === 'redstone' ? REDSTONE : t === 'equipment' ? TOOLS.iron.sword : LAVA_BUCKET;
  return t === 'all' ? FURNACE : t === 'food' ? COOKED_PORKCHOP : t === 'blocks' ? STONE : IRON_INGOT;
}

