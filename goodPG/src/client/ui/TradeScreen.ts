// Pantalla de comercio con un aldeano (fase 6): nombre de la profesión, nivel y barra de experiencia,
// y la lista de ofertas (lo que pide → lo que da). Clic en una oferta: comerciar una vez; con
// mayúsculas, todas las veces que se pueda. Las ofertas agotadas se tachan y las que no se pueden
// pagar se ven apagadas. La lógica (pagar, recibir) la pone el controlador (game/trading.ts).
import './tradeScreen.css';
import { itemName, EMERALD } from '../../shared/items';
import { LEVEL_NAMES, LEVEL_XP, MAX_LEVEL, villagerTitle, type TradeWire } from '../../shared/villagers';
// Fase 7 (encantamientos): libros y equipo encantados en las ofertas.
import type { ItemStack } from '../../shared/items';
import { stackIconUrl } from './bannerIcons';
import { glintAttrs } from './glint';
import { enchantName, enchantsOf, storedOf } from '../../shared/enchantments';

/** Nombre de lo que se recibe con sus encantamientos («Libro encantado (Reparación)»). */
function stackLabel(s: ItemStack): string {
  const list = [...enchantsOf(s), ...storedOf(s)];
  return list.length ? `${itemName(s.id)} (${list.map(([e, l]) => enchantName(e, l)).join(', ')})` : itemName(s.id);
}

export interface TradeScreenHost {
  icons(): Map<number, string>;
  /** Cuántos objetos de ese tipo tiene el jugador (`water`: sólo frascos de agua). */
  have(id: number, water?: boolean): number;
  /** Comerciar con la oferta i (all: tantas veces como se pueda). */
  trade(i: number, all: boolean): void;
  /** El jugador cierra la pantalla (Esc, E o el botón). */
  close(): void;
}

export interface TradeView {
  prof: number;
  level: number;
  xp: number;
  trader: boolean;
  offers: TradeWire[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class TradeScreen {
  private root: HTMLElement;
  private list: HTMLElement;
  private title: HTMLElement;
  private level: HTMLElement;
  private bar: HTMLElement;
  private barFill: HTMLElement;
  private wallet: HTMLElement;
  private view: TradeView | null = null;
  private openFlag = false;

  constructor(private host: TradeScreenHost, private keys: () => { inventory: string }) {
    this.root = document.createElement('div');
    this.root.id = 'trade-screen';
    this.root.className = 'hidden';
    this.root.innerHTML =
      '<div class="trade-panel panel">' +
      '<div class="trade-head"><h2></h2><span class="trade-level"></span></div>' +
      '<div class="trade-xp"><i></i></div>' +
      '<div class="trade-list"></div>' +
      '<div class="trade-foot"><span class="trade-wallet"></span><button type="button">Salir</button></div>' +
      '<p class="trade-hint">Clic: comerciar · Mayús + clic: todas las veces que puedas · Esc: salir</p>' +
      '</div>';
    this.list = this.root.querySelector('.trade-list')!;
    this.title = this.root.querySelector('h2')!;
    this.level = this.root.querySelector('.trade-level')!;
    this.bar = this.root.querySelector('.trade-xp')!;
    this.barFill = this.root.querySelector('.trade-xp i')!;
    this.wallet = this.root.querySelector('.trade-wallet')!;
    this.list.addEventListener('mousedown', (e) => {
      const row = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (!row || e.button !== 0) return;
      e.preventDefault();
      this.host.trade(Number(row.dataset.i), e.shiftKey);
    });
    this.root.querySelector('button')!.addEventListener('click', () => this.host.close());
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!this.openFlag) return;
      if (e.code === 'Escape' || e.code === this.keys().inventory) {
        e.preventDefault();
        e.stopPropagation();
        this.host.close();
      }
    }, true);
    document.body.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.openFlag;
  }

  open(view: TradeView): void {
    this.openFlag = true;
    this.root.classList.remove('hidden');
    this.set(view);
  }

  close(): void {
    this.openFlag = false;
    this.view = null;
    this.root.classList.add('hidden');
  }

  /** Nuevas ofertas del servidor (tras abrir o tras cada trato). */
  set(view: TradeView): void {
    this.view = view;
    this.render();
  }

  /** Vuelve a dibujar (también cuando cambia el inventario: qué se puede pagar). */
  render(): void {
    const v = this.view;
    if (!v || !this.openFlag) return;
    this.title.textContent = villagerTitle(v.prof, v.trader);
    const lvl = Math.max(1, Math.min(MAX_LEVEL, v.level));
    this.level.textContent = v.trader ? '' : LEVEL_NAMES[lvl - 1];
    this.bar.classList.toggle('hidden', v.trader);
    if (!v.trader) {
      const lo = LEVEL_XP[lvl - 1], hi = lvl < MAX_LEVEL ? LEVEL_XP[lvl] : lo;
      const f = lvl >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (v.xp - lo) / Math.max(1, hi - lo)));
      this.barFill.style.width = `${Math.round(f * 100)}%`;
    }
    const icons = this.host.icons();
    // Fase 7 (encantamientos): lo que se recibe puede llevar datos (libro o equipo encantado): brillo y nombre. Los
    // iconos, los de la pila (el color de la poción, el cuero teñido). Si el precio cambió (demanda, reputación o
    // Héroe de la aldea), el de antes se ve tachado, como en Java.
    const slot = (st: ItemStack | null, base?: number) => {
      if (!st) return '<span class="tslot empty"></span>';
      const url = stackIconUrl(st, icons) ?? '';
      const gl = glintAttrs(st, url);
      const n = st.count;
      const count = base !== undefined && base !== n
        ? `<b class="${n < base ? 'cheaper' : 'dearer'}"><s>${base}</s> ${n}</b>`
        : n > 1 ? `<b>${n}</b>` : '';
      return `<span class="tslot" title="${esc(stackLabel(st))}"><i class="${gl.cls.trim()}" style="background-image:url(${url})${gl.style}"></i>${count}</span>`;
    };
    const html = v.offers.map((o, i) => {
      const [c1, n1, c2, n2, r, rn, uses, max, rdata, x] = o;
      const give: ItemStack = { id: r, count: rn, ...(x.rd ? { dmg: x.rd } : {}), ...(rdata ? { data: rdata } : {}) };
      const out = uses >= max;
      const poor = c2 === c1
        ? this.host.have(c1, !!x.w) < n1 + n2
        : this.host.have(c1, !!x.w) < n1 || (!!c2 && this.host.have(c2) < n2);
      const first = x.w ? 'Frasco de agua' : itemName(c1);
      const tip = `${n1} × ${first}${c2 ? ` + ${n2} × ${itemName(c2)}` : ''} → ${rn} × ${stackLabel(give)}` +
        (out ? ' (agotada)' : ` · quedan ${max - uses}`);
      return `<div class="trade-row${out ? ' out' : ''}${poor ? ' poor' : ''}" data-i="${i}" title="${esc(tip)}">` +
        `${slot({ id: c1, count: n1 }, x.b ?? n1)}${slot(c2 ? { id: c2, count: n2 } : null)}<span class="tarrow"></span>${slot(give)}` +
        `<span class="tname">${esc(stackLabel(give))}</span>` +
        `<span class="tstock">${out ? 'Agotada' : `${max - uses}/${max}`}</span></div>`;
    }).join('');
    const key = html;
    if (this.list.dataset.key !== key) {
      this.list.dataset.key = key;
      this.list.innerHTML = html || '<p class="trade-empty">No tiene nada que ofrecer.</p>';
    }
    const em = this.host.have(EMERALD);
    this.wallet.textContent = `Tienes ${em} esmeralda${em === 1 ? '' : 's'}`;
  }
}

