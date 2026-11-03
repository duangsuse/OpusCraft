// Fase 7 (encantamientos): la mesa de encantamientos, el yunque y la afiladora dentro de la pantalla de
// inventario (como el telar). Cada panel dice qué admite cada hueco, qué sale y qué se gasta al cogerlo.
// - Mesa: el objeto y el lapislázuli; tres ofertas con runas, su coste en niveles y cuántos lapislázulis
//   piden; al pasar el ratón, la pista («Filo III…?»). Las ofertas salen de las librerías y de la semilla
//   de encantamiento del jugador, igual que en Minecraft (lo que se ve es lo que sale).
// - Yunque: dos huecos, el nombre y el coste («¡Demasiado caro!» desde 40 niveles).
// - Afiladora: dos huecos; quita los encantamientos (no las maldiciones) y devuelve experiencia.
import './enchantScreens.css';
import { LAPIS, type ItemStack } from '../../shared/items';
import { ENCHANTS, enchantName, enchantsForAnvil, maxDurability, minCost } from '../../shared/enchantments';
import { tableOffers, tableEnchants, applyEnchants, canEnchantAtTable, tableSlotPrice, type TableOffer } from '../../shared/enchanting';
import { anvilResult, anvilRightAfter, grindstoneResult, grindstoneXp, type AnvilResult } from '../../shared/anvil';
import { stackName, sanitizeItemName, ITEM_NAME_CHARS } from '../../shared/itemData';
import { runeWordUrl, runeWords } from './runes';

/** Lo que los paneles necesitan del juego. */
export interface WorkHost {
  /** Nivel de experiencia del jugador. */
  level(): number;
  creative(): boolean;
  /** Quita niveles (como Minecraft: se conserva el progreso hacia el siguiente). */
  spendLevels(n: number): void;
  /** Librerías que alimentan la mesa de (x, y, z). */
  shelves(pos: [number, number, number]): number;
  /** Semilla de encantamiento del jugador. */
  seed(): number;
  /** Se encantó algo en la mesa: semilla nueva y aviso al servidor. */
  enchanted(pos: [number, number, number]): void;
  /** Se cogió el resultado del yunque (el servidor decide si se deteriora). */
  anvilUsed(pos: [number, number, number]): void;
  /** Se cogió el resultado de la afiladora: experiencia que suelta. */
  grindUsed(pos: [number, number, number], xp: number): void;
  /** Fase 8.5: se cogió el resultado de la mesa de herrería. */
  smithUsed(pos: [number, number, number]): void;
  /** Fase 8.5: el faro: nivel de su pirámide, sus efectos elegidos y elegir otros (el pago ya se gastó). */
  beaconLevel(pos: [number, number, number]): number;
  beaconEffects(pos: [number, number, number]): [number, number];
  beaconSet(pos: [number, number, number], primary: number, secondary: number): void;
  sound(kind: 'click' | 'enchant' | 'anvil' | 'grind'): void;
}

export interface WorkPanel {
  html(): string;
  /** Cuántos objetos de la pila admite el hueco i (0: ninguno). */
  accepts(i: number, s: ItemStack): number;
  result(grid: readonly (ItemStack | null)[]): ItemStack | null;
  /** Coger la salida: gasta lo que toque (false si no se puede). */
  take(grid: (ItemStack | null)[]): boolean;
  render(panel: HTMLElement, grid: readonly (ItemStack | null)[], icons: Map<number, string>): void;
  /** Clic en un elemento propio del panel (ofertas); true si lo atendió. */
  click(target: HTMLElement, grid: (ItemStack | null)[]): boolean;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

// ------------------------------------------------------------------ mesa de encantamientos

export const TABLE_ITEM = 0;
export const TABLE_LAPIS = 1;

export class EnchantPanel implements WorkPanel {
  private offers: TableOffer[] = [];
  private words: string[] = ['', '', ''];
  private key = '';

  constructor(private host: WorkHost, private pos: [number, number, number]) {}

  html(): string {
    return '<h3>Encantar</h3><div class="ench">' +
      '<div class="ench-left"><div class="ench-book"><i class="p1"></i><i class="p2"></i><i class="flip"></i></div>' +
      `<div class="ench-in"><div class="slot2" data-s="grid:${TABLE_ITEM}" data-hint="Objeto"></div>` +
      `<div class="slot2 lapis" data-s="grid:${TABLE_LAPIS}" data-hint="Lapislázuli"></div></div></div>` +
      '<div class="ench-offers">' + [0, 1, 2].map((i) => `<button type="button" class="ench-offer" data-work="${i}"></button>`).join('') +
      '</div></div>';
  }

  /** El lapislázuli en su hueco; en el otro, cualquier cosa de una en una (sin ofertas si no se encanta). */
  accepts(i: number, s: ItemStack): number {
    if (i === TABLE_LAPIS) return s.id === LAPIS ? 64 : 0;
    return 1;
  }

  result(): ItemStack | null {
    return null;
  }

  take(): boolean {
    return false;
  }

  /** Ofertas para lo que hay en la mesa (se rehacen si cambia el objeto, las librerías o la semilla). */
  private refresh(grid: readonly (ItemStack | null)[]): void {
    const item = grid[TABLE_ITEM];
    const shelves = this.host.shelves(this.pos);
    const seed = this.host.seed();
    const k = `${item?.id ?? 0}|${item && canEnchantAtTable(item) ? 1 : 0}|${shelves}|${seed}`;
    if (k === this.key) return;
    this.key = k;
    this.offers = item && canEnchantAtTable(item) ? tableOffers(item.id, shelves, seed) : [];
    // Runas: tres palabras al azar para cada oferta (cambian con cada objeto, como en Minecraft).
    this.words = runeWords(seed ^ (item?.id ?? 0) * 131, 3);
  }

  /** ¿Se puede coger la oferta `i` ahora? */
  private affordable(i: number, grid: readonly (ItemStack | null)[]): boolean {
    const o = this.offers[i];
    if (!o || o.cost <= 0) return false;
    if (this.host.creative()) return true;
    const lapis = grid[TABLE_LAPIS]?.count ?? 0;
    return lapis >= tableSlotPrice(i) && this.host.level() >= o.cost;
  }

  render(panel: HTMLElement, grid: readonly (ItemStack | null)[]): void {
    this.refresh(grid);
    const item = grid[TABLE_ITEM];
    panel.querySelector('.ench-book')?.classList.toggle('open', !!item);
    const buttons = panel.querySelectorAll<HTMLButtonElement>('.ench-offer');
    buttons.forEach((b, i) => {
      const o = this.offers[i];
      const on = !!o && o.cost > 0;
      const ok = on && this.affordable(i, grid);
      const lapis = grid[TABLE_LAPIS]?.count ?? 0;
      const levels = this.host.level();
      const key = `${on}|${ok}|${o?.cost}|${o?.ench}|${o?.level}|${this.words[i]}|${lapis >= i + 1}|${levels >= (o?.cost ?? 0)}`;
      if (b.dataset.key === key) return;
      b.dataset.key = key;
      // Sin `disabled`: así se ve la pista al pasar el ratón aunque no se pueda coger.
      b.classList.toggle('off', !ok);
      b.setAttribute('aria-disabled', String(!ok));
      b.classList.toggle('empty', !on);
      if (!on) {
        b.innerHTML = '';
        delete b.dataset.tip;
        return;
      }
      const clue = o.ench >= 0 ? `${enchantName(o.ench, o.level)}…?` : '…?';
      b.innerHTML = `<span class="ench-lapis n${i + 1}"><b>${i + 1}</b></span>` +
        `<img class="ench-runes" alt="" src="${runeWordUrl(this.words[i], ok)}">` +
        `<span class="ench-cost${ok ? '' : ' no'}">${o.cost}</span>`;
      // Vista previa (la pista) y lo que falta, como en Minecraft: la enseña la pantalla al pasar el ratón.
      const need: string[] = [];
      if (!this.host.creative()) {
        if (lapis < i + 1) need.push(`Hace falta${i ? 'n' : ''} ${i + 1} lapislázuli${i ? 's' : ''}`);
        if (levels < o.cost) need.push(`Nivel de experiencia necesario: ${o.cost}`);
      }
      b.dataset.tip = `<b class="tt-ench">${esc(clue)}</b>` +
        `<span class="tt-dim">${i + 1} lapislázuli${i ? 's' : ''} · ${i + 1} nivel${i ? 'es' : ''} de experiencia</span>` +
        need.map((n) => `<span class="tt-bad">${esc(n)}</span>`).join('');
    });
  }

  click(target: HTMLElement, grid: (ItemStack | null)[]): boolean {
    const b = target.closest('[data-work]') as HTMLElement | null;
    if (!b) return false;
    const i = Number(b.dataset.work);
    this.refresh(grid);
    const item = grid[TABLE_ITEM];
    const o = this.offers[i];
    if (!item || !o || !this.affordable(i, grid)) return true;
    const list = tableEnchants(item.id, i, o.cost, this.host.seed());
    if (!list.length) return true;
    grid[TABLE_ITEM] = applyEnchants(item, list);
    if (!this.host.creative()) {
      const lapis = grid[TABLE_LAPIS]!;
      grid[TABLE_LAPIS] = lapis.count > i + 1 ? { ...lapis, count: lapis.count - (i + 1) } : null;
      this.host.spendLevels(i + 1);
    }
    this.host.enchanted(this.pos);
    this.host.sound('enchant');
    this.key = '';
    return true;
  }
}

// ------------------------------------------------------------------ yunque

export const ANVIL_LEFT = 0;
export const ANVIL_RIGHT = 1;

export class AnvilPanel implements WorkPanel {
  /** Texto del nombre (null: no se ha tocado; se usa el nombre del objeto). */
  private name: string | null = null;
  private leftKey = '';
  private cached: { key: string; r: AnvilResult } | null = null;

  constructor(private host: WorkHost, private pos: [number, number, number], private rerender: () => void) {}

  html(): string {
    return '<h3>Reparar y renombrar</h3><div class="anvil">' +
      `<input class="anvil-name" type="text" maxlength="${ITEM_NAME_CHARS}" spellcheck="false" autocomplete="off" disabled placeholder="Nombre">` +
      '<div class="anvil-row">' +
      `<div class="slot2" data-s="grid:${ANVIL_LEFT}"></div><span class="anvil-plus">+</span>` +
      `<div class="slot2" data-s="grid:${ANVIL_RIGHT}"></div><div class="arrow"></div>` +
      '<div class="slot2 big" data-s="out"></div></div><p class="anvil-cost"></p></div>';
  }

  accepts(): number {
    return 64;
  }

  private compute(grid: readonly (ItemStack | null)[]): AnvilResult {
    const left = grid[ANVIL_LEFT], right = grid[ANVIL_RIGHT];
    const key = JSON.stringify([left, right, this.name, this.host.creative()]);
    if (this.cached?.key === key) return this.cached.r;
    const r = anvilResult(left, right, this.name, this.host.creative());
    this.cached = { key, r };
    return r;
  }

  result(grid: readonly (ItemStack | null)[]): ItemStack | null {
    return this.compute(grid).out;
  }

  private affordable(r: AnvilResult): boolean {
    return !!r.out && r.cost > 0 && (this.host.creative() || this.host.level() >= r.cost);
  }

  take(grid: (ItemStack | null)[]): boolean {
    const r = this.compute(grid);
    if (!this.affordable(r)) return false;
    if (!this.host.creative()) this.host.spendLevels(r.cost);
    grid[ANVIL_LEFT] = null;
    grid[ANVIL_RIGHT] = anvilRightAfter(grid[ANVIL_RIGHT], r.material);
    this.name = null;
    this.cached = null;
    this.host.anvilUsed(this.pos);
    this.host.sound('anvil');
    return true;
  }

  render(panel: HTMLElement, grid: readonly (ItemStack | null)[]): void {
    const input = panel.querySelector('.anvil-name') as HTMLInputElement | null;
    const cost = panel.querySelector('.anvil-cost') as HTMLElement | null;
    if (!input || !cost) return;
    if (!input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('input', () => {
        this.name = input.value;
        this.rerender();
      });
      // Enter o Esc sueltan el campo (Esc también cierra, como siempre).
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    }
    const left = grid[ANVIL_LEFT];
    // Al cambiar el objeto de la izquierda, el campo vuelve a su nombre.
    const lk = left ? `${left.id}|${left.data?.name ?? ''}` : '';
    if (lk !== this.leftKey) {
      this.leftKey = lk;
      this.name = null;
      input.value = left ? stackName(left) : '';
    }
    input.disabled = !left;
    const r = this.compute(grid);
    const ok = this.affordable(r);
    panel.querySelector('[data-s="out"]')?.classList.toggle('locked', !!r.out && !ok);
    if (r.tooExpensive) {
      cost.textContent = '¡Demasiado caro!';
      cost.className = 'anvil-cost no';
    } else if (r.out && r.cost > 0) {
      cost.textContent = `Coste de encantamiento: ${r.cost}`;
      cost.className = `anvil-cost${ok ? '' : ' no'}`;
    } else {
      cost.textContent = '';
      cost.className = 'anvil-cost';
    }
  }

  click(): boolean {
    return false;
  }

  /** Nombre válido que se pondría (para las pruebas y el cliente). */
  get typedName(): string | null {
    return this.name === null ? null : sanitizeItemName(this.name);
  }
}

// ------------------------------------------------------------------ afiladora

export class GrindstonePanel implements WorkPanel {
  constructor(private host: WorkHost, private pos: [number, number, number]) {}

  html(): string {
    return '<h3>Afiladora</h3><div class="grind">' +
      '<div class="grind-in"><div class="slot2" data-s="grid:0"></div><div class="slot2" data-s="grid:1"></div></div>' +
      '<div class="grind-wheel"></div><div class="slot2 big" data-s="out"></div><p class="grind-xp"></p></div>';
  }

  /** Sólo lo que se desgasta o está encantado (como en Minecraft), de uno en uno. */
  accepts(_i: number, s: ItemStack): number {
    return maxDurability(s.id) > 0 || enchantsForAnvil(s).length > 0 ? 1 : 0;
  }

  result(grid: readonly (ItemStack | null)[]): ItemStack | null {
    return grindstoneResult(grid[0], grid[1]);
  }

  take(grid: (ItemStack | null)[]): boolean {
    if (!this.result(grid)) return false;
    const xp = grindstoneXp(grid[0], grid[1]);
    grid[0] = null;
    grid[1] = null;
    this.host.grindUsed(this.pos, xp);
    this.host.sound('grind');
    return true;
  }

  render(panel: HTMLElement, grid: readonly (ItemStack | null)[]): void {
    const p = panel.querySelector('.grind-xp') as HTMLElement | null;
    if (!p) return;
    // Cuánta experiencia devuelve (el mínimo y el máximo posibles).
    let sum = 0;
    for (const s of [grid[0], grid[1]]) {
      for (const [id, lvl] of s ? enchantsForAnvil(s) : []) if (!ENCHANTS[id]?.curse) sum += minCost(id, lvl);
    }
    const half = Math.ceil(sum / 2);
    p.textContent = this.result(grid) && sum > 0 ? `Experiencia: ${half}–${Math.max(half, 2 * half - 1)}` : '';
  }

  click(): boolean {
    return false;
  }
}

