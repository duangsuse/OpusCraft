// Pantallas de inventario de supervivencia: inventario con armadura y fabricación 2x2, mesa de
// trabajo (3x3), cofre (y cofre grande), horno (y ahumador y alto horno) y cortapiedras. Reglas de clic de Minecraft: clic izquierdo coge/deja/intercambia,
// derecho reparte o deja de uno en uno, mayúsculas mueve rápido, 1–9 intercambia con la barra,
// F con la mano secundaria y Q suelta. Arrastrar con una pila la reparte (izquierdo a partes
// iguales, derecho de uno en uno) y el doble clic junta en el cursor los objetos iguales. Los cofres y hornos son del servidor: los clics se predicen y se confirman.
import { isBundle, fitsInBundle, bundleInsert, bundleTake, bagWeight, BUNDLE_CAPACITY } from '../../shared/bundles'; // Fase 6.5 (remate)
import { ITEMS, itemName, maxStack, sameKind, type ItemStack } from '../../shared/items';
import { matchRecipe, CRAFT_REMAINDER } from '../../shared/recipes';
import { fireworkCraft } from '../../shared/recipes'; // Fase 6.5 (equipo)
import {
  clickSlot, cloneStack, COOK_TIME, FURNACE_FUEL, FURNACE_IN, FURNACE_OUT, type ContainerState,
} from '../../shared/containers';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { Inventory } from '../game/Inventory';
import { armorSilhouettes } from './armorBar';
import { stonecutterOptions } from '../../shared/stonecutting';
import './workstations.css';
import { keyLabel, type Keybinds } from '../game/keybinds';
import { itemTooltipHtml } from './itemTooltip';
// Fase 6.5 (libros y estandartes): telar, copia de libros escritos e iconos de estandartes con dibujos.
import { LoomPanel, LOOM_HTML } from './loomScreen';
import { bookCopy } from '../../shared/books';
import { stackIconUrl } from './bannerIcons';
// Fase 7 (pociones): alambique y flechas con efecto.
import { BREWING_HTML, renderBrewing } from './brewingScreen';
import { tippedArrowCraft } from '../../shared/potions';
import { paintGlint } from './glint'; // Fase 7 (encantamientos)
import { EnchantPanel, AnvilPanel, GrindstonePanel, type WorkHost, type WorkPanel } from './enchantScreens';
import { SmithingPanel } from './smithingScreen'; // Fase 8.5 (lo que da el Nether)
import { BeaconPanel } from './beaconScreen'; // Fase 8.5
// Fase 7.6: mesa de cartografía, ampliar mapas en la mesa de trabajo, reparar juntando dos y escudo con estandarte.
import { cartographyResult, mapExtendCraft, mapCloneCraft } from '../../shared/mapOps';
import { FILLED_MAP, EMPTY_MAP, PAPER } from '../../shared/items';
import { GLASS_PANE } from '../../shared/blocks';
import { repairCraft, shieldDecorCraft, shulkerDyeCraft, bannerCopyCraft } from '../../shared/craftSpecials';
import { dyeArmorCraft } from '../../shared/dyedColor';
// Fase 9: libro de recetas.
import { RecipeBook, BOOK_BUTTON, type BookHost } from './recipeBook';
import { planFill, stockOf, type BookKind, type BookRecipe } from '../../shared/recipeBook';

export type ScreenKind = 'player' | 'table' | 'chest' | 'furnace' | 'stonecutter' | 'loom'
  | 'brewing' // Fase 7 (pociones): alambique
  | 'enchant' | 'anvil' | 'grindstone' // Fase 7 (encantamientos)
  | 'cartography' // Fase 7.6: mesa de cartografía
  | 'smithing' // Fase 8.5: mesa de herrería
  | 'beacon'; // Fase 8.5: faro

export interface ScreenHost {
  icons: Map<number, string>;
  send(msg: ClientMsg): void;
  /** Tira una pila al suelo delante del jugador. */
  drop(stack: ItemStack): void;
  sound(kind: 'click' | 'craft'): void;
  /** Teclas configuradas (tirar, cambiar de mano). */
  keys(): Keybinds;
  /** Fase 7 (encantamientos): experiencia, semilla y avisos de la mesa, el yunque y la afiladora. */
  work?: WorkHost;
  /** Fase 9 (libro de recetas): qué recetas tiene desbloqueadas. */
  recipes?: Pick<BookHost, 'has' | 'version'>;
}

type SlotRef =
  | { kind: 'inv'; i: number } | { kind: 'grid'; i: number } | { kind: 'out' } | { kind: 'cont'; i: number }
  | { kind: 'armor'; i: number } | { kind: 'off'; i: number };

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

export class InventoryScreen {
  private host: ScreenHost;
  private inv: Inventory;
  kind: ScreenKind | null = null;
  /** Contenedor abierto (copia local, predicha) y su posición. */
  container: ContainerState | null = null;
  containerPos: [number, number, number] | null = null;
  private grid: (ItemStack | null)[] = [];
  private gridSize = 2;
  /** Título de la pantalla del horno (horno, ahumador o alto horno). */
  private title = '';
  /** Huecos del cofre dibujados (27 o 54 en el cofre grande). */
  private chestSlots = 27;
  /** Cortapiedras: opción elegida y la piedra para la que se eligió. */
  private cut = -1;
  private cutInput = 0;
  /** Fase 6.5 (libros y estandartes): telar (dibujo elegido). */
  private loom = new LoomPanel();
  /** Fase 7 (encantamientos): mesa de encantamientos, yunque o afiladora abiertos. */
  private work: WorkPanel | null = null;
  private root: HTMLElement;
  private panel: HTMLElement;
  private cursorEl: HTMLElement;
  private tooltip: HTMLElement;
  private slotEls = new Map<string, HTMLElement>();
  private hovered: SlotRef | null = null;
  /** Operación de contenedor esperando respuesta (bloquea los clics mientras la pantalla está abierta). */
  private busy = 0;
  private busyAt = 0;
  private seq = 1;
  /**
   * Operaciones enviadas al servidor por número de secuencia. Su respuesta se aplica aunque la
   * pantalla ya se haya cerrado (así cerrar deprisa no pierde ni duplica objetos).
   */
  private pending = new Map<number, { kind: 'click' | 'put' | 'take'; at: number; slot: number; stack: ItemStack | null }>();
  private mouse = [0, 0];
  /** Arrastre con una pila en el cursor: botón y huecos por los que pasa (inventario y fabricación). */
  private drag: { btn: number; keys: string[] } | null = null;
  /** Último clic (para el doble clic). */
  private lastClick = { key: '', at: 0 };
  /** Fase 7 (encantamientos): la descripción flotante muestra la pista de una oferta de la mesa. */
  private workTip = false;
  /** Fase 9 (libro de recetas): el panel de al lado y lo que espera a que el servidor devuelva algo del horno. */
  private book: RecipeBook | null = null;
  private resume = new Map<number, () => void>();

  constructor(host: ScreenHost, inv: Inventory) {
    this.host = host;
    this.inv = inv;
    this.root = $('#invscreen');
    this.panel = $('#invscreen .inv2');
    this.cursorEl = $('#cursor-stack');
    if (host.recipes) {
      const rec = host.recipes;
      this.book = new RecipeBook(this.root, { icons: host.icons, has: rec.has, version: rec.version, sound: () => host.sound('click') },
        () => stockOf(this.inv.slots), () => this.inv.version, (r, many) => this.pickRecipe(r, many));
    }
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    document.body.appendChild(this.tooltip);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root && this.inv.cursor) {
        // Clic fuera del panel: tirar lo que hay en el cursor (derecho: sólo uno).
        const c = this.inv.cursor;
        if (e.button === 2 && c.count > 1) {
          this.host.drop({ ...c, count: 1 });
          c.count--;
        } else {
          this.host.drop(c);
          this.inv.cursor = null;
        }
        this.inv.changed();
        this.render();
      }
    });
    // Cortapiedras: elegir qué cortar (los botones se rehacen al cambiar la piedra).
    this.panel.addEventListener('mousedown', (e) => {
      const b = (e.target as HTMLElement).closest('[data-cut]') as HTMLElement | null;
      if (!b || this.kind !== 'stonecutter') return;
      e.preventDefault();
      this.cut = Number(b.dataset.cut);
      this.host.sound('click');
      this.render();
    });
    // Fase 7 (encantamientos): ofertas de la mesa de encantamientos.
    this.panel.addEventListener('mousedown', (e) => {
      const t = e.target as HTMLElement;
      if (!this.work || !t.closest('[data-work]') || this.isBusy()) return;
      e.preventDefault();
      if (this.work.click(t, this.grid)) {
        this.inv.changed();
        this.render();
      }
    });
    // Fase 7 (encantamientos): la pista de las ofertas de la mesa, en la misma descripción flotante que los
    // objetos (dentro del panel no valdría `position: fixed`: el desenfoque del fondo lo recoloca).
    this.panel.addEventListener('mousemove', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      const html = this.work && !this.inv.cursor ? b?.dataset.tip : undefined;
      if (!html) {
        if (this.workTip) this.tooltip.classList.add('hidden');
        this.workTip = false;
        return;
      }
      this.workTip = true;
      if (this.tooltip.innerHTML !== html) this.tooltip.innerHTML = html;
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = `${e.clientX + 14}px`;
      this.tooltip.style.top = `${e.clientY + 14}px`;
    });
    this.panel.addEventListener('mouseleave', () => {
      if (this.workTip) this.tooltip.classList.add('hidden');
      this.workTip = false;
    });
    // Fase 6.5 (libros y estandartes): telar, elegir el dibujo.
    this.panel.addEventListener('mousedown', (e) => {
      const b = (e.target as HTMLElement).closest('[data-loom]') as HTMLElement | null;
      if (!b || this.kind !== 'loom') return;
      e.preventDefault();
      if (this.loom.pick(Number(b.dataset.loom), this.grid)) this.host.sound('click');
      this.render();
    });
    // Fase 9: el botón del libro de recetas.
    this.panel.addEventListener('mousedown', (e) => {
      if (!(e.target as HTMLElement).closest('[data-rb]')) return;
      e.preventDefault();
      this.book?.toggle();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouse = [e.clientX, e.clientY];
      if (this.kind) this.placeCursor();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('mouseup', () => this.endDrag());
  }

  isOpen(): boolean {
    return this.kind !== null;
  }

  open(kind: ScreenKind, pos: [number, number, number] | null = null, title = ''): void {
    this.kind = kind;
    this.containerPos = pos;
    this.container = null;
    this.title = title;
    this.chestSlots = 27;
    this.cut = -1;
    this.loom.reset();
    this.work = this.makeWork(kind, pos); // Fase 7 (encantamientos)
    this.gridSize = kind === 'table' ? 3 : kind === 'stonecutter' ? 1 : 2;
    this.grid = new Array(this.gridSize * this.gridSize).fill(null);
    this.busy = 0;
    this.build();
    this.book?.setContext(this.bookContext());
    this.root.classList.remove('hidden');
    this.render();
  }

  /** Fase 9: el libro que toca en esta pantalla (null: ninguno). */
  private bookContext(): { kind: BookKind; size: number } | null {
    if (this.kind === 'player') return { kind: 'craft', size: 2 };
    if (this.kind === 'table') return { kind: 'craft', size: 3 };
    if (this.kind !== 'furnace') return null;
    return { kind: this.title === 'Ahumador' ? 'smoker' : this.title === 'Alto horno' ? 'blast' : 'furnace', size: 1 };
  }

  /** Fase 7 (encantamientos): panel de la mesa, el yunque o la afiladora (null en las demás pantallas). */
  private makeWork(kind: ScreenKind, pos: [number, number, number] | null): WorkPanel | null {
    const host = this.host.work;
    if (!host || !pos) return null;
    if (kind === 'enchant') return new EnchantPanel(host, pos);
    if (kind === 'anvil') return new AnvilPanel(host, pos, () => this.render());
    if (kind === 'grindstone') return new GrindstonePanel(host, pos);
    if (kind === 'smithing') return new SmithingPanel(host, pos); // Fase 8.5
    if (kind === 'beacon') return new BeaconPanel(host, pos); // Fase 8.5
    return null;
  }

  /** Cierra y devuelve al inventario lo que quedó en la cuadrícula y el cursor. */
  close(): void {
    if (!this.kind) return;
    this.busy = 0;
    if (this.container) this.host.send({ t: 'close' });
    for (const s of this.grid) this.giveOrDrop(s);
    this.grid = [];
    this.giveOrDrop(this.inv.cursor);
    this.inv.cursor = null;
    this.inv.changed();
    this.kind = null;
    this.container = null;
    this.containerPos = null;
    this.root.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.cursorEl.classList.add('hidden');
    this.book?.setContext(null);
    this.resume.clear();
  }

  private giveOrDrop(s: ItemStack | null): void {
    if (!s) return;
    const rest = this.inv.add(s);
    if (rest) this.host.drop(rest);
  }

  // ---------------------------------------------------------------- mensajes del servidor

  onServer(msg: ServerMsg): void {
    if (msg.t === 'cres') {
      const p = this.pending.get(msg.q);
      if (!p) return;
      this.pending.delete(msg.q);
      const give = cloneStack(msg.give);
      if (p.kind === 'click') {
        // El cursor del servidor manda (si la pantalla sigue abierta con ese clic en curso).
        if (this.kind && this.busy === msg.q && msg.cur !== undefined) this.inv.cursor = cloneStack(msg.cur);
      } else if (p.kind === 'put') {
        // Lo que no cupo vuelve a su ranura (o a donde quepa).
        if (give && !this.inv.slots[p.slot]) this.inv.slots[p.slot] = give;
        else this.giveOrDrop(give);
      } else this.giveOrDrop(give);
      if (this.busy === msg.q) this.busy = 0;
      this.inv.changed();
      this.render();
      const next = this.resume.get(msg.q);
      if (next) {
        this.resume.delete(msg.q);
        if (this.kind) next();
      }
    } else if (msg.t === 'cclose') {
      if (this.kind === 'chest' || this.kind === 'furnace' || this.kind === 'brewing') this.close();
    }
  }

  /** Contenido autoritativo del contenedor abierto. */
  setContainer(c: ContainerState): void {
    // Esperando la confirmación de un clic: el servidor envía el estado nuevo justo después.
    if (this.isBusy()) return;
    this.container = c;
    // El cofre grande tiene el doble de huecos: se vuelve a montar la pantalla.
    if (this.kind === 'chest' && c.slots.length !== this.chestSlots) {
      this.chestSlots = c.slots.length;
      this.build();
    }
    this.render();
  }

  // ---------------------------------------------------------------- construcción

  private build(): void {
    this.slotEls.clear();
    const kind = this.kind!;
    let top = '';
    if (kind === 'player' || kind === 'table') {
      const n = this.gridSize;
      top = `<h3>${kind === 'table' ? 'Mesa de trabajo' : 'Fabricación'}</h3><div class="craft">${this.book ? BOOK_BUTTON : ''}` +
        `<div class="grid g${n}">${Array.from({ length: n * n }, (_, i) => `<div class="slot2" data-s="grid:${i}"></div>`).join('')}</div>` +
        `<div class="arrow"></div><div class="slot2 big" data-s="out"></div></div>`;
      // Inventario del jugador: la armadura en columna (cabeza arriba) a la izquierda.
      if (kind === 'player') {
        top = `<div class="armor-col">${Array.from({ length: 4 }, (_, i) => `<div class="slot2 armor-slot" data-s="armor:${i}"></div>`).join('')}` +
          `<div class="slot2 off-slot" data-s="off:0" title="Mano secundaria (F)"></div></div>` +
          `<div class="armor-craft">${top}</div>`;
      }
    } else if (kind === 'chest') {
      const n = this.chestSlots;
      const cols = n === 9 ? 3 : n === 5 ? 5 : 9; // Fase 7 (mecanismos): dispensador y soltador (3×3) y tolva (5)
      top = `<h3>${n > 27 ? 'Cofre grande' : this.title || 'Cofre'}</h3><div class="grid g${cols}">${Array.from({ length: n }, (_, i) => `<div class="slot2" data-s="cont:${i}"></div>`).join('')}</div>`;
    } else if (kind === 'loom') {
      top = LOOM_HTML;
    } else if (kind === 'brewing') {
      top = BREWING_HTML; // Fase 7 (pociones)
    } else if (this.work) {
      top = this.work.html(); // Fase 7 (encantamientos)
    } else if (kind === 'cartography') {
      // Fase 7.6: el mapa arriba y el material debajo (papel, mapa vacío o panel de cristal).
      top = `<h3>Mesa de cartografía</h3><div class="cutter carto"><div class="carto-in">` +
        `<div class="slot2" data-s="grid:0" title="Mapa"></div><div class="slot2" data-s="grid:1" title="Papel, mapa vacío o panel de cristal"></div></div>` +
        `<div class="arrow"></div><div class="slot2 big" data-s="out"></div></div>`;
    } else if (kind === 'stonecutter') {
      top = `<h3>Cortapiedras</h3><div class="cutter"><div class="slot2" data-s="grid:0"></div>` +
        `<div class="cut-list"></div><div class="arrow"></div><div class="slot2 big" data-s="out"></div></div>`;
    } else {
      top = `<h3>${this.title || 'Horno'}</h3><div class="furnace">${this.book ? BOOK_BUTTON : ''}` +
        `<div class="fcol"><div class="slot2" data-s="cont:${FURNACE_IN}"></div><div class="flame"><i></i></div>` +
        `<div class="slot2" data-s="cont:${FURNACE_FUEL}"></div></div>` +
        `<div class="arrow prog"><i></i></div><div class="slot2 big" data-s="cont:${FURNACE_OUT}"></div></div>`;
    }
    const keys = this.host.keys();
    this.panel.innerHTML =
      `<div class="inv2-top${kind === 'player' ? ' with-armor' : ''}">${top}</div>` +
      `<h3>Inventario</h3>` +
      `<div class="grid g9">${Array.from({ length: 27 }, (_, i) => `<div class="slot2" data-s="inv:${i + 9}"></div>`).join('')}</div>` +
      `<div class="grid g9 hotrow">${Array.from({ length: 9 }, (_, i) => `<div class="slot2" data-s="inv:${i}"></div>`).join('')}</div>` +
      `<p class="hint">Clic: coger/dejar · Clic derecho: la mitad / de uno en uno · Mayús + clic: mover rápido · 1–9: a la barra · ${keyLabel(keys.swapHands)}: a la otra mano · ${keyLabel(keys.drop)}: tirar · ${keyLabel(keys.inventory)}: cerrar</p>`;
    this.panel.querySelectorAll<HTMLElement>('[data-s]').forEach((el) => {
      const key = el.dataset.s!;
      this.slotEls.set(key, el);
      el.innerHTML = '<div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>';
      if (key.startsWith('armor:')) el.style.setProperty('--sil', `url(${armorSilhouettes()[Number(key.slice(6))]})`);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ref = this.parseRef(key);
        const btn = e.button === 2 ? 1 : 0;
        if (btn === 0 && !e.shiftKey && this.collect(key)) return;
        // Con algo en el cursor sobre el inventario o la fabricación: puede ser un arrastre.
        if (this.inv.cursor && !e.shiftKey && (ref.kind === 'inv' || (ref.kind === 'grid' && !this.work)) && !this.isBusy()) {
          this.drag = { btn, keys: [key] };
          el.classList.add('drag');
          return;
        }
        this.onSlotClick(ref, btn, e.shiftKey);
        this.lastClick = { key, at: performance.now() };
      });
      el.addEventListener('mouseenter', () => {
        this.hovered = this.parseRef(key);
        this.extendDrag(key, el);
        this.showTooltip();
      });
      el.addEventListener('mouseleave', () => {
        this.hovered = null;
        this.tooltip.classList.add('hidden');
      });
    });
  }

  private parseRef(key: string): SlotRef {
    if (key === 'out') return { kind: 'out' };
    const [k, n] = key.split(':');
    return { kind: k as 'inv' | 'grid' | 'cont' | 'armor' | 'off', i: Number(n) };
  }

  // ---------------------------------------------------------------- lectura de ranuras

  private stackAt(r: SlotRef): ItemStack | null {
    switch (r.kind) {
      case 'inv':
        return this.inv.slots[r.i];
      case 'grid':
        return this.grid[r.i];
      case 'out':
        return this.result();
      case 'cont':
        return this.container?.slots[r.i] ?? null;
      case 'armor':
        return this.inv.armor[r.i];
      case 'off':
        return this.inv.offhand;
    }
  }

  private result(): ItemStack | null {
    if (this.kind === 'stonecutter') {
      const opt = this.cutOptions()[this.cut];
      return opt ? { ...opt } : null;
    }
    if (this.kind === 'loom') return this.loom.result(this.grid);
    if (this.work) return this.work.result(this.grid); // Fase 7 (encantamientos)
    if (this.kind === 'cartography') return cartographyResult(this.grid[0], this.grid[1]); // Fase 7.6
    if (this.kind !== 'player' && this.kind !== 'table') return null;
    // Fase 7.6: ampliar un mapa con papel, reparar juntando dos objetos y el escudo con estandarte.
    const special = (this.kind === 'table' ? mapExtendCraft(this.grid) : null) ?? repairCraft(this.grid) ?? shieldDecorCraft(this.grid) ?? shulkerDyeCraft(this.grid) // Fase 8.6: teñir la caja de shulker
      ?? mapCloneCraft(this.grid) ?? bannerCopyCraft(this.grid)?.out ?? dyeArmorCraft(this.grid) ?? null; // clonar un mapa, copiar un estandarte y teñir el cuero
    if (special) return special;
    // Fase 6.5 (equipo): los fuegos artificiales miran las pilas (los colores de las estrellas).
    const fw = fireworkCraft(this.grid);
    if (fw) return fw;
    const tipped = tippedArrowCraft(this.grid); // Fase 7 (pociones): flechas con efecto
    if (tipped) return tipped;
    const m = matchRecipe(this.grid.map((s) => (s ? s.id : 0)), this.gridSize);
    return m ? m.out : bookCopy(this.grid)?.out ?? null; // Fase 6.5: copias de un libro escrito
  }

  // ---------------------------------------------------------------- clics

  private isBusy(): boolean {
    this.expirePending();
    return this.busy !== 0;
  }

  /**
   * Operaciones sin respuesta tras 5 s (conexión perdida): lo enviado al contenedor vuelve al
   * inventario. Llamar a menudo (también con la pantalla cerrada).
   */
  expirePending(): void {
    if (this.pending.size === 0) return;
    const now = performance.now();
    for (const [q, p] of this.pending) {
      if (now - p.at < 5000) continue;
      this.pending.delete(q);
      if (p.kind === 'put' && p.stack) {
        if (!this.inv.slots[p.slot]) this.inv.slots[p.slot] = p.stack;
        else this.giveOrDrop(p.stack);
        this.inv.changed();
      }
      if (this.busy === q) this.busy = 0;
    }
  }

  private track(q: number, kind: 'click' | 'put' | 'take', slot = -1, stack: ItemStack | null = null): void {
    this.busy = q;
    this.busyAt = performance.now();
    this.pending.set(q, { kind, at: this.busyAt, slot, stack });
  }

  private onSlotClick(r: SlotRef, btn: number, shift: boolean): void {
    if (this.isBusy()) return;
    this.host.sound('click');
    if (r.kind === 'out') this.clickOutput(shift);
    else if (r.kind === 'cont') this.clickContainer(r.i, btn, shift);
    else if (r.kind === 'off') {
      // Mano secundaria: coge/deja como un hueco más; con mayúsculas vuelve al inventario.
      if (shift) this.inv.offhand = this.inv.add(this.inv.offhand);
      else {
        const fake: ContainerState = { kind: 'chest', slots: [this.inv.offhand], burn: 0, burnMax: 0, cook: 0 };
        this.inv.cursor = clickSlot(fake, 0, btn, this.inv.cursor);
        this.inv.offhand = fake.slots[0];
      }
    } else if (r.kind === 'armor') {
      // Fase 7 (encantamientos): la Maldición de ligamiento no deja quitarse la pieza (salvo en creativo).
      if (this.inv.armorBound(r.i) && !this.host.work?.creative()) return;
      // Mayúsculas: devolver la pieza al inventario; si no, coger, dejar o intercambiar.
      if (shift) this.inv.unequip(r.i);
      else this.inv.clickArmor(r.i);
    } else if (shift) this.quickMove(r);
    else if (r.kind === 'grid' && this.work) this.clickWorkSlot(r.i, btn); // Fase 7 (encantamientos)
    else {
      const arr = r.kind === 'inv' ? this.inv.slots : this.grid;
      // Fase 6.5 (remate): clic derecho con sacos (meter o sacar).
      if (btn === 1 && this.bundleClick(arr, r.i)) {
        this.inv.changed();
        this.render();
        return;
      }
      const fake: ContainerState = { kind: 'chest', slots: arr, burn: 0, burnMax: 0, cook: 0 };
      this.inv.cursor = clickSlot(fake, r.i, btn, this.inv.cursor);
    }
    this.inv.changed();
    this.render();
  }

  /**
   * Fase 6.5 (remate): clic derecho con sacos. Con un saco en el cursor, se mete en él la pila del hueco
   * (o, si el hueco está vacío, sale al hueco la última pila del saco). Sobre un saco: se mete la pila
   * del cursor o, con el cursor vacío, sale la última. Devuelve si hizo algo.
   */
  private bundleClick(arr: (ItemStack | null)[], i: number): boolean {
    const slot = arr[i], cur = this.inv.cursor;
    if (cur && isBundle(cur.id)) {
      if (slot && fitsInBundle(slot)) {
        const rest = bundleInsert(cur, slot);
        if (rest && rest.count === slot.count) return false;
        arr[i] = rest;
        return true;
      }
      if (!slot) {
        const out = bundleTake(cur);
        if (!out) return false;
        arr[i] = out;
        return true;
      }
      return false;
    }
    if (slot && isBundle(slot.id)) {
      if (cur && fitsInBundle(cur)) {
        const rest = bundleInsert(slot, cur);
        if (rest && rest.count === cur.count) return false;
        this.inv.cursor = rest;
        return true;
      }
      if (!cur) {
        const out = bundleTake(slot);
        if (!out) return false;
        this.inv.cursor = out;
        return true;
      }
    }
    return false;
  }

  /**
   * Fase 7 (encantamientos): clic en un hueco de la mesa, el yunque o la afiladora: sólo admite lo que
   * toca y hasta su límite (el objeto de la mesa, de uno en uno; el lapislázuli, en pila).
   */
  private clickWorkSlot(i: number, btn: number): void {
    const cur = this.inv.cursor, slot = this.grid[i];
    if (!cur) {
      if (!slot) return;
      const n = btn === 1 ? Math.ceil(slot.count / 2) : slot.count;
      this.inv.cursor = { ...slot, count: n };
      this.grid[i] = slot.count > n ? { ...slot, count: slot.count - n } : null;
      return;
    }
    const limit = Math.min(maxStack(cur.id), this.work!.accepts(i, cur));
    if (limit <= 0) return;
    if (!slot) {
      const n = Math.min(limit, btn === 1 ? 1 : cur.count);
      this.grid[i] = { ...cur, count: n };
      this.inv.cursor = cur.count > n ? { ...cur, count: cur.count - n } : null;
    } else if (sameKind(slot, cur)) {
      const n = Math.min(limit - slot.count, btn === 1 ? 1 : cur.count);
      if (n <= 0) return;
      this.grid[i] = { ...slot, count: slot.count + n };
      this.inv.cursor = cur.count > n ? { ...cur, count: cur.count - n } : null;
    } else if (cur.count <= limit) {
      this.grid[i] = cur;
      this.inv.cursor = slot;
    }
  }

  /** Fase 7 (encantamientos): coger la salida del yunque o de la afiladora (con mayúsculas, al inventario). */
  private takeWork(shift: boolean): void {
    const res = this.result();
    if (!res || !this.work) return;
    const cur = this.inv.cursor;
    if (shift ? this.inv.room(res) < res.count : !!cur) return;
    if (!this.work.take(this.grid)) return;
    if (shift) this.inv.add(res);
    else this.inv.cursor = { ...res };
  }

  private clickOutput(shift: boolean): void {
    if (this.work) {
      this.takeWork(shift); // Fase 7 (encantamientos)
      return;
    }
    const res = this.result();
    if (!res) return;
    if (shift) {
      // Fabricar todo lo posible directamente al inventario.
      for (let n = 0; n < 64; n++) {
        const r = this.result();
        if (!r || this.inv.room(r) < r.count) break;
        this.inv.add(r);
        this.consumeCraft();
      }
      this.host.sound('craft');
      return;
    }
    // Fase 6.5 (remate): al teñir un saco, se queda con lo que llevaba.
    if (isBundle(res.id)) {
      const old = this.grid.find((g) => g && isBundle(g.id) && g.bag?.length);
      if (old) res.bag = cloneStack(old)!.bag;
    }
    const cur = this.inv.cursor;
    if (!cur) this.inv.cursor = { ...res };
    else if (sameKind(cur, res) && cur.count + res.count <= maxStack(res.id)) cur.count += res.count;
    else return;
    this.consumeCraft();
    this.host.sound('craft');
  }

  /**
   * Fase 6.5 (libros y estandartes): gasta lo usado al coger la salida. El telar gasta el estandarte y el
   * tinte (no el diseño); la copia de un libro escrito deja el original en su hueco.
   */
  private consumeCraft(): void {
    if (this.kind === 'loom') {
      this.loom.consume(this.grid);
      return;
    }
    const copy = matchRecipe(this.grid.map((s) => (s ? s.id : 0)), this.gridSize) ? null : bookCopy(this.grid);
    const original = copy ? cloneStack(this.grid[copy.original]) : null;
    // La copia de un estandarte también deja el original.
    const banner = bannerCopyCraft(this.grid);
    const bannerOriginal = banner ? cloneStack(this.grid[banner.keep]) : null;
    this.consumeGrid();
    if (copy && original) this.grid[copy.original] = original;
    if (banner && bannerOriginal) this.grid[banner.keep] = bannerOriginal;
  }

  private consumeGrid(): void {
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (!s) continue;
      s.count--;
      if (s.count <= 0) {
        const rest = CRAFT_REMAINDER[s.id];
        this.grid[i] = rest ? { id: rest, count: 1 } : null;
      }
    }
  }

  /** Mayúsculas + clic sobre el inventario o la cuadrícula. */
  private quickMove(r: SlotRef): void {
    const s = this.stackAt(r);
    if (!s) return;
    if (r.kind === 'grid') {
      this.grid[r.i] = this.inv.add(s);
      return;
    }
    if (r.kind !== 'inv') return;
    // En el inventario del jugador, una pieza de armadura va a su ranura si está libre.
    if (this.kind === 'player' && this.inv.equipFromSlot(r.i, false)) return;
    // Fase 7 (encantamientos): a la mesa, el yunque o la afiladora, al primer hueco que lo admita.
    if (this.work) {
      for (let i = 0; i < 2; i++) {
        const limit = Math.min(maxStack(s.id), this.work.accepts(i, s));
        const g = this.grid[i];
        if (limit <= 0 || (g && (!sameKind(g, s) || g.count >= limit))) continue;
        const n = Math.min(limit - (g?.count ?? 0), s.count);
        this.grid[i] = { ...s, count: (g?.count ?? 0) + n };
        this.inv.slots[r.i] = s.count > n ? { ...s, count: s.count - n } : null;
        return;
      }
    }
    // Fase 7.6: a la mesa de cartografía, el mapa arriba y el material (papel, mapa vacío, cristal) abajo.
    if (this.kind === 'cartography') {
      const i = s.id === FILLED_MAP ? 0 : s.id === PAPER || s.id === EMPTY_MAP || s.id === GLASS_PANE ? 1 : -1;
      const g = i >= 0 ? this.grid[i] : null;
      if (i >= 0 && (!g || (sameKind(g, s) && g.count < maxStack(s.id)))) {
        const n = Math.min(maxStack(s.id) - (g?.count ?? 0), s.count);
        this.grid[i] = { ...s, count: (g?.count ?? 0) + n };
        this.inv.slots[r.i] = s.count > n ? { ...s, count: s.count - n } : null;
        return;
      }
    }
    if (this.container && this.containerPos) {
      // Del inventario al contenedor (lo confirma el servidor).
      const q = this.seq++;
      this.track(q, 'put', r.i, s);
      this.inv.slots[r.i] = null;
      const [x, y, z] = this.containerPos;
      this.host.send({ t: 'cput', x, y, z, stack: s, q });
      return;
    }
    this.inv.slots[r.i] = null;
    const rest = r.i < 9 ? this.inv.addRange(s, 9, 36) : this.inv.addRange(s, 0, 9);
    if (rest) this.inv.slots[r.i] = rest;
  }

  private clickContainer(i: number, btn: number, shift: boolean): void {
    if (!this.container || !this.containerPos) return;
    const [x, y, z] = this.containerPos;
    const q = this.seq++;
    if (shift) {
      const s = this.container.slots[i];
      if (!s) return;
      const max = this.inv.room(s);
      if (max <= 0) return;
      this.track(q, 'take');
      this.host.send({ t: 'ctake', x, y, z, slot: i, max, q });
      return;
    }
    const before = cloneStack(this.inv.cursor);
    // Predicción local con las mismas reglas que el servidor.
    this.inv.cursor = clickSlot(this.container, i, btn, this.inv.cursor);
    this.track(q, 'click');
    this.host.send({ t: 'cclick', x, y, z, slot: i, btn, cur: before, q });
  }

  /** Pila de un hueco local del inventario o de la fabricación (para arrastrar). */
  private localArray(r: SlotRef): (ItemStack | null)[] | null {
    return r.kind === 'inv' ? this.inv.slots : r.kind === 'grid' ? this.grid : null;
  }

  /** El arrastre pasa por otro hueco: se añade si acepta la pila del cursor. */
  private extendDrag(key: string, el: HTMLElement): void {
    const d = this.drag, cur = this.inv.cursor;
    if (!d || !cur || d.keys.includes(key)) return;
    const r = this.parseRef(key);
    const arr = this.localArray(r);
    if (!arr || r.kind === 'out' || (r.kind === 'grid' && this.work)) return; // Fase 7: los huecos de trabajo, no
    const s = arr[r.i];
    if (s && !(sameKind(s, cur) && s.count < maxStack(s.id))) return;
    if (d.keys.length >= cur.count && d.btn === 0) return;
    d.keys.push(key);
    el.classList.add('drag');
  }

  /** Suelta el arrastre: un solo hueco es un clic normal; varios, el reparto. */
  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    for (const k of d.keys) this.slotEls.get(k)?.classList.remove('drag');
    if (d.keys.length === 1 || !this.inv.cursor) {
      this.onSlotClick(this.parseRef(d.keys[0]), d.btn, false);
      this.lastClick = { key: d.keys[0], at: performance.now() };
      return;
    }
    const cur = this.inv.cursor;
    const per = d.btn === 0 ? Math.floor(cur.count / d.keys.length) : 1;
    for (const key of d.keys) {
      if (cur.count <= 0) break;
      const r = this.parseRef(key);
      const arr = this.localArray(r)!;
      const i = (r as { i: number }).i;
      const s = arr[i];
      const n = Math.min(per, cur.count, maxStack(cur.id) - (s?.count ?? 0));
      if (n <= 0) continue;
      arr[i] = s ? { ...s, count: s.count + n } : { ...cur, count: n };
      cur.count -= n;
    }
    this.inv.cursor = cur.count > 0 ? cur : null;
    this.host.sound('click');
    this.inv.changed();
    this.render();
  }

  /** Doble clic con una pila en el cursor: junta en ella los objetos iguales del inventario. */
  private collect(key: string): boolean {
    const cur = this.inv.cursor;
    const dbl = this.lastClick.key === key && performance.now() - this.lastClick.at < 300;
    this.lastClick = { key: '', at: 0 };
    if (!dbl || !cur || this.isBusy()) return false;
    const max = maxStack(cur.id);
    for (const arr of [this.inv.slots, this.grid]) {
      for (let i = 0; i < arr.length && cur.count < max; i++) {
        const s = arr[i];
        if (!s || !sameKind(s, cur)) continue;
        const n = Math.min(max - cur.count, s.count);
        cur.count += n;
        arr[i] = s.count - n > 0 ? { ...s, count: s.count - n } : null;
      }
    }
    this.host.sound('click');
    this.inv.changed();
    this.render();
    return true;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.kind || !this.hovered || this.isBusy()) return;
    // Fase 7 (encantamientos): escribiendo el nombre en el yunque, las teclas son del campo.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const r = this.hovered;
    if (r.kind !== 'inv' && (r.kind !== 'grid' || this.work)) return;
    const arr = r.kind === 'inv' ? this.inv.slots : this.grid;
    const n = Number(e.key);
    const keys = this.host.keys();
    if (e.code === keys.swapHands && r.kind === 'inv') this.inv.swapOffhand(r.i);
    else if (n >= 1 && n <= 9) {
      const h = n - 1;
      if (r.kind === 'inv' && r.i === h) return;
      const tmp = arr[r.i];
      arr[r.i] = this.inv.slots[h];
      this.inv.slots[h] = tmp;
    } else if (e.code === keys.drop) {
      const s = arr[r.i];
      if (!s) return;
      if (e.ctrlKey || s.count === 1) {
        this.host.drop(s);
        arr[r.i] = null;
      } else {
        this.host.drop({ ...s, count: 1 });
        s.count--;
      }
    } else return;
    this.inv.changed();
    this.render();
  }

  // ---------------------------------------------------------------- dibujo

  render(): void {
    if (!this.kind) return;
    for (const [key, el] of this.slotEls) {
      const s = this.stackAt(this.parseRef(key));
      this.paint(el, s);
      if (key.startsWith('armor:')) el.classList.toggle('empty', !s);
    }
    if (this.kind === 'furnace') {
      const c = this.container;
      const flame = this.panel.querySelector('.flame i') as HTMLElement | null;
      const prog = this.panel.querySelector('.prog i') as HTMLElement | null;
      if (flame) flame.style.height = `${c && c.burnMax > 0 ? Math.round((c.burn / c.burnMax) * 100) : 0}%`;
      if (prog) prog.style.width = `${c ? Math.round((c.cook / COOK_TIME) * 100) : 0}%`;
    }
    if (this.kind === 'stonecutter') this.renderCuts();
    if (this.kind === 'loom') this.loom.render(this.panel, this.grid);
    if (this.kind === 'brewing') renderBrewing(this.panel, this.container); // Fase 7 (pociones)
    this.work?.render(this.panel, this.grid, this.host.icons); // Fase 7 (encantamientos)
    const out = this.slotEls.get('out');
    if (out) out.classList.toggle('ready', !!this.result());
    this.book?.render();
    this.placeCursor();
    if (this.hovered) this.showTooltip();
  }

  // ---------------------------------------------------------------- Fase 9: libro de recetas

  /** Un clic en una receta del libro: la coloca en la cuadrícula o, en un horno, en su entrada. */
  private pickRecipe(r: BookRecipe, many: boolean): void {
    if (!this.kind || this.isBusy() || this.work) return;
    if (r.kind === 'craft') this.fillGrid(r, many);
    else this.fillFurnace(r, many);
  }

  /** Quita hasta `n` de este objeto del inventario (de la mochila y la barra) y lo devuelve como una pila. */
  private takeFromInventory(id: number, n: number): ItemStack | null {
    let out = null as ItemStack | null;
    for (let i = 0; i < this.inv.slots.length && n > 0; i++) {
      const s = this.inv.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n, s.count);
      out = out ? { ...out, count: out.count + k } : { ...cloneStack(s)!, count: k };
      this.inv.slots[i] = s.count > k ? { ...s, count: s.count - k } : null;
      n -= k;
    }
    return out;
  }

  /** Vacía la cuadrícula hacia el inventario y coloca la receta (con Mayús, las veces que dé el material). */
  private fillGrid(r: BookRecipe, many: boolean): void {
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (s) this.grid[i] = this.inv.add(s);
    }
    if (this.grid.some((s) => s)) {
      this.host.sound('click'); // la mochila está llena: no hay dónde guardar lo que había
      this.inv.changed();
      this.render();
      return;
    }
    const plan = planFill(r, this.gridSize, stockOf(this.inv.slots), many);
    if (plan) {
      plan.cells.forEach((id, i) => {
        if (id) this.grid[i] = this.takeFromInventory(id, plan.n);
      });
    }
    this.host.sound('click');
    this.inv.changed();
    this.render();
  }

  /**
   * Coloca en la entrada del horno lo que se funde en la receta. Si ya hay otra cosa en la entrada, primero la
   * devuelve al inventario (el servidor contesta) y luego pone lo nuevo.
   */
  private fillFurnace(r: BookRecipe, many: boolean): void {
    const pos = this.containerPos;
    if (!this.container || !pos) return;
    const plan = planFill(r, 1, stockOf(this.inv.slots), many);
    if (!plan) return;
    const id = plan.cells[0];
    const cur = this.container.slots[FURNACE_IN];
    const put = () => {
      const stack = this.takeFromInventory(id, plan.n);
      if (!stack) return;
      const slot = this.inv.slots.findIndex((x) => x === null);
      const q = this.seq++;
      this.track(q, 'put', slot < 0 ? 0 : slot, stack);
      this.host.send({ t: 'cput', x: pos[0], y: pos[1], z: pos[2], stack, q });
      this.inv.changed();
      this.render();
    };
    if (cur && cur.id !== id) {
      const room = this.inv.room(cur);
      if (room < cur.count) return; // no cabe lo que hay: no se cambia
      const q = this.seq++;
      this.track(q, 'take');
      this.resume.set(q, put);
      this.host.send({ t: 'ctake', x: pos[0], y: pos[1], z: pos[2], slot: FURNACE_IN, max: room, q });
      return;
    }
    put();
  }

  /** Opciones del cortapiedras para la piedra puesta (si cambia la piedra, se deselecciona). */
  private cutOptions(): readonly ItemStack[] {
    const id = this.grid[0]?.id ?? 0;
    if (id !== this.cutInput) {
      this.cutInput = id;
      this.cut = -1;
    }
    return id ? stonecutterOptions(id) : [];
  }

  /** Botones de lo que se puede cortar (se eligen con clic). */
  private renderCuts(): void {
    const list = this.panel.querySelector('.cut-list') as HTMLElement | null;
    if (!list) return;
    const opts = this.cutOptions();
    const key = opts.map((o) => o.id).join(',') + '|' + this.cut;
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.innerHTML = opts.map((o, i) => {
      const url = this.host.icons.get(o.id);
      return `<div class="cut${i === this.cut ? ' sel' : ''}" data-cut="${i}" title="${itemName(o.id)}">` +
        `<i style="background-image:url(${url ?? ''})"></i>${o.count > 1 ? `<span>${o.count}</span>` : ''}</div>`;
    }).join('');
  }

  private paint(el: HTMLElement, s: ItemStack | null): void {
    const ico = el.firstElementChild as HTMLElement;
    const cnt = el.children[1] as HTMLElement;
    const dur = el.children[2] as HTMLElement;
    const url = stackIconUrl(s, this.host.icons); // Fase 6.5: estandartes con dibujos
    ico.style.backgroundImage = url ? `url(${url})` : '';
    paintGlint(ico, s, url); // Fase 7 (encantamientos)
    cnt.textContent = s && s.count > 1 ? String(s.count) : '';
    const max = s ? ITEMS[s.id]?.tool?.durability ?? ITEMS[s.id]?.armor?.durability : undefined;
    if (s && max && s.dmg) {
      const f = Math.max(0, 1 - s.dmg / max);
      dur.style.display = '';
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    } else if (s && isBundle(s.id) && s.bag?.length) {
      // Fase 6.5 (remate): lo lleno que está el saco (azul; rojo si no cabe más).
      const f = Math.min(1, bagWeight(s.bag) / BUNDLE_CAPACITY);
      dur.style.display = '';
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = f >= 1 ? '#e8503a' : '#6aa8ff';
    } else dur.style.display = 'none';
  }

  private placeCursor(): void {
    const c = this.inv.cursor;
    const el = this.cursorEl;
    if (!c || !this.kind) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const url = stackIconUrl(c, this.host.icons);
    (el.firstElementChild as HTMLElement).style.backgroundImage = url ? `url(${url})` : '';
    paintGlint(el.firstElementChild as HTMLElement, c, url); // Fase 7 (encantamientos)
    (el.children[1] as HTMLElement).textContent = c.count > 1 ? String(c.count) : '';
    el.style.left = `${this.mouse[0]}px`;
    el.style.top = `${this.mouse[1]}px`;
  }

  private showTooltip(): void {
    const s = this.hovered ? this.stackAt(this.hovered) : null;
    if (!s || this.inv.cursor) {
      this.tooltip.classList.add('hidden');
      return;
    }
    this.tooltip.innerHTML = itemTooltipHtml(s);
    this.tooltip.classList.remove('hidden');
    this.tooltip.style.left = `${this.mouse[0] + 14}px`;
    this.tooltip.style.top = `${this.mouse[1] + 14}px`;
  }
}
