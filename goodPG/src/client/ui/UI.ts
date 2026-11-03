// Interfaz de usuario en DOM: menú principal, HUD, chat, inventario, pausa, ajustes y carga.
import { isBundle, bagWeight, BUNDLE_CAPACITY } from '../../shared/bundles'; // Fase 6.5 (remate)
import { ago, type RecentWorld } from './recentWorlds';
import { KEY_ACTIONS, assignKey, defaultKeybinds, keyLabel } from '../game/keybinds';
import { itemTooltipHtml } from './itemTooltip';
import { ChatCompletion } from './chatCompletion';
import { BLOCKS, INVENTORY_ORDER, type BlockCategory } from '../../shared/blocks';
import { CREATIVE_ITEMS, ITEMS, type ItemStack } from '../../shared/items';
import { REDSTONE } from '../../shared/items'; // Fase 7 (redstone)
import type { GameMode } from '../../shared/protocol';
import { applyPreset, saveSettings, type Settings } from '../game/settings';
import type { PresetName } from '../render/Renderer';
import type { HudIcons } from './hudIcons';
import { stackIconUrl } from './bannerIcons'; // Fase 6.5 (libros y estandartes)
import { CREATIVE_POTIONS, CREATIVE_BREWING, stackName } from '../../shared/potions'; // Fase 7 (pociones)
// Fase 7 (encantamientos): brillo de lo encantado y libros encantados en el creativo.
import { paintGlint, glintAttrs } from './glint';
import { ENCHANTS, ENCHANT_IDS, enchantName, enchantedBook } from '../../shared/enchantments';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface NameTagInfo {
  id: string;
  name: string;
  pos: [number, number] | null;
  /** Chat de voz: está hablando (y si susurra). */
  talking?: boolean;
  whisper?: boolean;
}

type InvCategory = BlockCategory | 'todo' | 'objetos' | 'pociones'; // Fase 7 (pociones)

const CATEGORIES: { id: InvCategory; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'construccion', label: 'Construcción' },
  { id: 'naturaleza', label: 'Naturaleza' },
  { id: 'decoracion', label: 'Decoración' },
  { id: 'minerales', label: 'Minerales' },
  { id: 'colores', label: 'Colores' },
  { id: 'objetos', label: 'Objetos' },
  { id: 'pociones', label: 'Pociones' }, // Fase 7 (pociones): alambique, ingredientes y pociones
  { id: 'redstone', label: 'Redstone' }, // Fase 7 (redstone): el polvo y los componentes
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class UI {
  icons: Map<number, string> = new Map();
  /** Asistente del chat (sugerencias de comandos). */
  private chatAssist: ChatCompletion | null = null;
  hudIcons: HudIcons | null = null;
  onRespawn: (() => void) | null = null;
  onPlay: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  onChatSubmit: ((text: string) => void) | null = null;
  /** Nombres de los jugadores conectados (para autocompletar en el chat). */
  playerNames: () => string[] = () => [];
  onChatClosed: (() => void) | null = null;
  /** Fase 7: `stack`, la pila con su tipo o sus datos (pociones, flechas con efecto, libros encantados). */
  onInventoryPick: ((id: number, slot: number | null, stack?: ItemStack) => void) | null = null;
  onInventorySelectSlot: ((slot: number) => void) | null = null;
  onSettingsChanged: ((s: Settings) => void) | null = null;
  /** Chat de voz: jugadores con la voz activada ahora (para su volumen en los ajustes). */
  voicePlayers: (() => string[]) | null = null;
  onFullscreen: (() => void) | null = null;
  onUiSound: ((kind: 'click' | 'open' | 'close') => void) | null = null;
  /** Petición de cerrar el inventario desde la propia UI (Escape en el buscador). */
  onCloseInventory: (() => void) | null = null;
  getInviteLink: () => string = () => location.href;

  private settings: Settings | null = null;
  private chatOpen = false;
  private nameTags = new Map<string, HTMLDivElement>();
  private blockNameTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private invCategory: InvCategory = 'todo';
  private hoveredItem: number | null = null;
  /** Fase 7: la pila señalada si lleva tipo o datos (una poción, un libro encantado). */
  private hoveredStack: ItemStack | undefined;
  private tooltip: HTMLDivElement;
  private settingsReturn: 'menu' | 'pause' = 'menu';
  hotbar: (ItemStack | null)[] = [];
  selected = 0;
  private hudKey = '';

  constructor() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    document.body.appendChild(this.tooltip);

    $('btn-play').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.onPlay?.();
    });
    $('btn-random').addEventListener('click', () => {
      this.onUiSound?.('click');
      $<HTMLInputElement>('in-room').value = randomRoom();
    });
    $('btn-copy').addEventListener('click', () => {
      this.onUiSound?.('click');
      const room = sanitizeRoomInput($<HTMLInputElement>('in-room').value);
      this.copy(`${location.origin}/?mundo=${encodeURIComponent(room)}`);
    });
    $('btn-settings').addEventListener('click', () => {
      this.onUiSound?.('open');
      this.openSettings('menu');
    });
    $('btn-settings2').addEventListener('click', () => {
      this.onUiSound?.('open');
      this.openSettings('pause');
    });
    $('btn-keys-reset').addEventListener('click', () => {
      if (!this.settings) return;
      this.onUiSound?.('click');
      this.settings.keys = defaultKeybinds();
      this.changed();
      this.renderKeys();
    });
    $('btn-settings-close').addEventListener('click', () => {
      this.onUiSound?.('close');
      this.closeSettings();
    });
    $('btn-resume').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.onResume?.();
    });
    $('btn-fullscreen').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.onFullscreen?.();
    });
    $('btn-invite').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.copy(this.getInviteLink());
    });
    $('btn-quit').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.onQuit?.();
    });
    $('btn-respawn').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.onRespawn?.();
    });
    $('btn-death-quit').addEventListener('click', () => {
      this.onUiSound?.('click');
      this.hideDeath();
      this.onQuit?.();
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>('#mode-seg button')) {
      b.addEventListener('click', () => {
        this.onUiSound?.('click');
        this.setMenuMode(b.dataset.mode === 'c' ? 'c' : 's');
      });
    }
    const chatInput = $<HTMLInputElement>('chatinput');
    const completion = new ChatCompletion(chatInput, () => this.playerNames(), () => this.icons);
    this.chatAssist = completion;
    chatInput.addEventListener('keydown', (e) => {
      if (completion.onKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Enter') {
        const v = chatInput.value.trim();
        chatInput.value = '';
        if (v) {
          completion.sent(v);
          this.onChatSubmit?.(v);
        }
        this.closeChat();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        chatInput.value = '';
        this.closeChat();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    $<HTMLInputElement>('invsearch').addEventListener('input', () => this.renderInventoryGrid());
    $<HTMLInputElement>('invsearch').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.onCloseInventory?.();
      }
      e.stopPropagation();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isInventoryOpen() || !this.hoveredItem) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        this.onInventoryPick?.(this.hoveredItem, n - 1, this.hoveredStack);
        this.renderInvHotbar();
      }
    });
    // Enter en los campos del menú = jugar.
    for (const id of ['in-name', 'in-room']) {
      $(id).addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') this.onPlay?.();
      });
    }
  }

  // ------------------------------------------------------------------ menú

  private menuMode: GameMode = 's';

  initMenu(name: string, room: string, shirt: string, mode: GameMode = 's', offline = false): void {
    $<HTMLInputElement>('in-name').value = name;
    $<HTMLInputElement>('in-room').value = room;
    $<HTMLInputElement>('in-color').value = shirt;
    $<HTMLInputElement>('in-offline').checked = offline;
    this.setMenuMode(mode);
  }

  private setMenuMode(m: GameMode): void {
    this.menuMode = m;
    for (const b of document.querySelectorAll<HTMLButtonElement>('#mode-seg button')) b.classList.toggle('active', b.dataset.mode === m);
  }

  menuValues(): { name: string; room: string; shirt: string; mode: GameMode; offline: boolean; seed: string } {
    return {
      seed: $<HTMLInputElement>('in-seed').value,
      name: $<HTMLInputElement>('in-name').value.trim(),
      room: sanitizeRoomInput($<HTMLInputElement>('in-room').value),
      shirt: $<HTMLInputElement>('in-color').value,
      mode: this.menuMode,
      offline: $<HTMLInputElement>('in-offline').checked,
    };
  }

  /** Mundos recientes bajo el nombre del mundo: clic para elegirlo, × para quitarlo de la lista. */
  renderRecentWorlds(list: RecentWorld[], onForget: (w: RecentWorld) => void): void {
    const box = $('recent-worlds');
    box.classList.toggle('hidden', list.length === 0);
    box.innerHTML = '<span class="recent-title">Recientes</span>';
    for (const w of list) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.title = `${w.offline ? 'Sin conexión' : 'En línea'} · ${ago(w.at)}`;
      chip.innerHTML = `<span>${escapeHtml(w.room)}</span>${w.offline ? '<i>local</i>' : ''}<b title="Quitar de la lista">×</b>`;
      chip.addEventListener('click', (e) => {
        this.onUiSound?.('click');
        if ((e.target as HTMLElement).tagName === 'B') {
          onForget(w);
          return;
        }
        $<HTMLInputElement>('in-room').value = w.room;
        $<HTMLInputElement>('in-offline').checked = w.offline;
      });
      box.appendChild(chip);
    }
  }

  showMenu(): void {
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    this.hidePause();
    this.hideInventory();
  }

  hideMenu(): void {
    $('menu').classList.add('hidden');
  }

  setMenuError(msg: string): void {
    $('menu-error').textContent = msg;
  }

  /** Portada: mundos activos y jugadores conectados (null: sin datos, se oculta). */
  setLiveStats(stats: { servers: number; players: number } | null): void {
    const box = $('live-stats');
    box.classList.toggle('hidden', !stats);
    if (!stats) return;
    box.classList.toggle('idle', stats.players === 0);
    $('stat-servers').textContent = String(stats.servers);
    $('stat-servers-label').textContent = stats.servers === 1 ? 'servidor activo' : 'servidores activos';
    $('stat-players').textContent = String(stats.players);
    $('stat-players-label').textContent = stats.players === 1 ? 'conectado' : 'conectados';
  }

  setPlayEnabled(on: boolean): void {
    const b = $('btn-play') as HTMLButtonElement;
    b.disabled = !on;
    b.textContent = on ? 'Jugar' : 'Preparando gráficos…';
  }

  // ------------------------------------------------------------------ carga

  showLoading(text: string, progress: number): void {
    $('loading').classList.remove('hidden');
    $('loading-text').textContent = text;
    $('loading-bar').style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }

  hideLoading(): void {
    $('loading').classList.add('hidden');
  }

  // ------------------------------------------------------------------ HUD

  showHud(): void {
    $('hud').classList.remove('hidden');
  }

  hideHud(): void {
    $('hud').classList.add('hidden');
  }

  setHudVisible(v: boolean): void {
    for (const id of ['crosshair', 'hotbar', 'blockname', 'chat', 'survival-hud']) $(id).style.visibility = v ? '' : 'hidden';
  }

  setHotbar(stacks: (ItemStack | null)[], selected: number): void {
    this.hotbar = stacks;
    this.selected = selected;
    const bar = $('hotbar');
    if (bar.querySelectorAll('.slot.hb').length !== 9) {
      bar.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const s = document.createElement('div');
        s.className = 'slot hb';
        s.innerHTML = `<span class="num">${i + 1}</span><div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>`;
        bar.appendChild(s);
      }
    }
    const hb = bar.querySelectorAll<HTMLDivElement>('.slot.hb');
    for (let i = 0; i < 9; i++) {
      const s = hb[i];
      s.classList.toggle('sel', i === selected);
      paintSlot(s, stacks[i] ?? null, this.icons);
    }
    this.paintHeldDurability();
    if (this.isInventoryOpen()) this.renderInvHotbar();
  }

  private offhandStack: ItemStack | null = null;

  /**
   * Usos que le quedan a lo que se lleva en la mano (o, si no gasta, a lo de la mano secundaria): una barrita con
   * el número al lado de la barra de objetos, en verde, amarillo o rojo, y parpadeando cuando está a punto de romperse.
   */
  private paintHeldDurability(): void {
    const bar = $('hotbar');
    let el = bar.querySelector<HTMLDivElement>('.held-dur');
    if (!el) {
      el = document.createElement('div');
      el.className = 'held-dur';
      el.innerHTML = '<div class="hd-bar"><i></i></div><span class="hd-num"></span>';
      bar.appendChild(el);
    }
    const wear = (s: ItemStack | null | undefined) => (s && ITEMS[s.id]?.tool?.durability ? s : null);
    const s = wear(this.hotbar[this.selected]) ?? wear(this.offhandStack);
    if (!s) {
      el.classList.add('hidden');
      return;
    }
    const max = ITEMS[s.id]!.tool!.durability;
    const left = Math.max(0, max - (s.dmg ?? 0));
    const f = left / max;
    el.classList.remove('hidden');
    el.classList.toggle('low', f <= 0.1 || left <= 5);
    const fill = el.querySelector('i') as HTMLElement;
    fill.style.height = `${Math.round(f * 100)}%`;
    fill.style.background = `hsl(${Math.round(f * 120)}, 85%, 52%)`;
    el.querySelector('.hd-num')!.textContent = String(left);
    el.title = `${ITEMS[s.id]!.name}: ${left} de ${max} usos`;
  }

  /** Mano secundaria: un hueco a la izquierda de la barra (sólo si lleva algo). */
  setOffhand(stack: ItemStack | null): void {
    const bar = $('hotbar');
    let el = bar.querySelector<HTMLDivElement>('.slot.offhand');
    if (!el) {
      el = document.createElement('div');
      el.className = 'slot offhand';
      el.innerHTML = '<div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>';
      bar.appendChild(el);
    }
    el.classList.toggle('hidden', !stack);
    paintSlot(el, stack, this.icons);
    this.offhandStack = stack;
    this.paintHeldDurability();
  }

  /** Corazones, hambre y aire (sólo en supervivencia). */
  setSurvival(
    show: boolean, health: number, food: number, air: number, flash: boolean, absorption = 0, poisoned = false, hungry = false,
    maxHealth = 20, withered = false, // Fase 7 (efectos): Salud mejorada y Marchitamiento
  ): void {
    const el = $('survival-hud');
    el.classList.toggle('hidden', !show);
    const icons = this.hudIcons;
    if (!show || !icons) return;
    const bubbles = air >= 14.9 ? 10 : Math.ceil((air / 15) * 10);
    const key = `${health}|${food}|${air >= 14.9 ? 'full' : bubbles}|${flash}|${absorption}|${poisoned}|${hungry}|${maxHealth}|${withered}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const row = (n: number, full: string, half: string, empty: string, from = 0, count = 10) => {
      let h = '';
      for (let i = from; i < from + count; i++) {
        const v = n - i * 2;
        h += `<i style="background-image:url(${v >= 2 ? full : v === 1 ? half : empty})"></i>`;
      }
      return h;
    };
    const hp = Math.ceil(health);
    const hearts = $('hearts');
    // Fase 7 (efectos): con Marchitamiento, negros; con Salud mejorada, más corazones en filas de 10 hacia arriba.
    const [hFull, hHalf] = withered ? [icons.heartWither, icons.heartWitherHalf]
      : poisoned ? [icons.heartPoison, icons.heartPoisonHalf] : [icons.heart, icons.heartHalf];
    const hEmpty = flash ? icons.heartFlash : icons.heartEmpty;
    const slots = Math.max(10, Math.ceil(maxHealth / 2));
    const rows = Math.ceil(slots / 10);
    if (rows === 1) hearts.innerHTML = row(hp, hFull, hHalf, hEmpty);
    else {
      let h = '';
      for (let r = 0; r < rows; r++) h += `<span class="hrow">${row(hp, hFull, hHalf, hEmpty, r * 10, Math.min(10, slots - r * 10))}</span>`;
      hearts.innerHTML = h;
    }
    el.classList.toggle('hp-rows-2', rows === 2);
    el.classList.toggle('hp-rows-3', rows >= 3);
    hearts.classList.toggle('low', hp <= 4);
    $('hunger').innerHTML = hungry
      ? row(Math.ceil(food), icons.foodHunger, icons.foodHungerHalf, icons.foodEmpty)
      : row(Math.ceil(food), icons.food, icons.foodHalf, icons.foodEmpty);
    // Absorción: una fila de corazones dorados encima (la barra de armadura sube).
    const ab = Math.ceil(absorption);
    let gold = '';
    for (let i = 0; i < 10 && i * 2 < ab; i++) {
      gold += `<i style="background-image:url(${ab - i * 2 >= 2 ? icons.heartGold : icons.heartGoldHalf})"></i>`;
    }
    $('absorb').innerHTML = gold;
    el.classList.toggle('absorbing', ab > 0);
    const airEl = $('air');
    if (air >= 14.9) airEl.innerHTML = '';
    else {
      let h = '';
      for (let i = 0; i < 10; i++) h += `<i style="background-image:url(${icons.bubble});opacity:${i < bubbles ? 1 : 0}"></i>`;
      airEl.innerHTML = h;
    }
  }

  /** Destello rojo al recibir daño. */
  flashHurt(strength = 1): void {
    const el = $('hurt-overlay');
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(0.85, 0.35 + strength * 0.1));
    void el.offsetWidth;
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = '0';
  }

  /** Capa de dormir: null la quita; si no, oscuridad 0..1. */
  setSleep(dark: number | null): void {
    const el = $('sleep-overlay');
    el.classList.toggle('on', dark !== null);
    el.style.opacity = dark === null ? '0' : '1';
    el.style.background = `rgba(5, 6, 12, ${dark === null ? 0 : Math.max(0, Math.min(0.97, dark))})`;
  }

  showDeath(message: string): void {
    $('death').classList.remove('hidden');
    $('death-msg').textContent = message;
  }

  hideDeath(): void {
    $('death').classList.add('hidden');
  }

  isDeathOpen(): boolean {
    return !$('death').classList.contains('hidden');
  }

  showBlockName(name: string): void {
    const el = $('blockname');
    el.textContent = name;
    el.classList.add('show');
    if (this.blockNameTimer) clearTimeout(this.blockNameTimer);
    this.blockNameTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  setDebug(text: string | null): void {
    const el = $('debug');
    if (text === null) el.classList.add('hidden');
    else {
      el.classList.remove('hidden');
      el.textContent = text;
    }
  }

  setStatus(text: string | null): void {
    const el = $('status');
    if (!text) el.classList.remove('show');
    else {
      el.textContent = text;
      el.classList.add('show');
    }
  }

  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Enlace copiado: compártelo con tus amigos');
    } catch {
      window.prompt('Copia este enlace:', text);
    }
  }

  // ------------------------------------------------------------------ chat

  addChat(name: string | null, text: string, color?: string): void {
    const log = $('chatlog');
    const div = document.createElement('div');
    div.className = 'msg' + (name === null ? ' sys' : '');
    if (name === null) div.textContent = text;
    else {
      div.innerHTML = `<span class="who" style="color:${color ?? '#9fd8ff'}">${escapeHtml(name)}</span>${escapeHtml(text)}`;
    }
    log.appendChild(div);
    while (log.children.length > 80) log.removeChild(log.firstChild!);
    setTimeout(() => div.classList.add('old'), 10000);
    log.scrollTop = log.scrollHeight;
  }

  openChat(prefill = ''): void {
    this.chatOpen = true;
    $('chat').classList.add('open');
    const input = $<HTMLInputElement>('chatinput');
    input.value = prefill;
    setTimeout(() => {
      input.focus();
      this.chatAssist?.refresh();
    }, 0);
  }

  closeChat(): void {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    $('chat').classList.remove('open');
    $<HTMLInputElement>('chatinput').blur();
    this.onChatClosed?.();
  }

  isChatOpen(): boolean {
    return this.chatOpen;
  }

  // ------------------------------------------------------------------ jugadores

  updateNameTags(tags: NameTagInfo[]): void {
    const container = $('nametags');
    const seen = new Set<string>();
    for (const t of tags) {
      seen.add(t.id);
      let el = this.nameTags.get(t.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'nametag';
        container.appendChild(el);
        this.nameTags.set(t.id, el);
      }
      if (el.textContent !== t.name) el.textContent = t.name;
      el.classList.toggle('talking', !!t.talking);
      el.classList.toggle('whisper', !!t.whisper);
      if (t.pos) {
        el.style.display = '';
        el.style.left = `${t.pos[0]}px`;
        el.style.top = `${t.pos[1]}px`;
      } else el.style.display = 'none';
    }
    for (const [id, el] of this.nameTags) {
      if (!seen.has(id)) {
        el.remove();
        this.nameTags.delete(id);
      }
    }
  }

  showPlayerList(players: { name: string; color: string; me: boolean }[], room: string, ping: number | null, server: string | null = null): void {
    const el = $('playerlist');
    el.classList.remove('hidden');
    el.innerHTML =
      `<h4>Mundo «${escapeHtml(room)}» · ${players.length} jugador${players.length === 1 ? '' : 'es'}${ping !== null ? ` · ${Math.round(ping)} ms` : ''}</h4>` +
      (server ? `<div class="pl-server">Servidor en ${escapeHtml(server)}</div>` : '') +
      players
        .map((p) => `<div class="p"><span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}${p.me ? ' <span style="color:var(--muted)">(tú)</span>' : ''}</div>`)
        .join('');
  }

  hidePlayerList(): void {
    $('playerlist').classList.add('hidden');
  }

  // ------------------------------------------------------------------ pausa

  showPause(info: string): void {
    $('pause').classList.remove('hidden');
    $('pause-info').textContent = info;
  }

  hidePause(): void {
    $('pause').classList.add('hidden');
  }

  isPauseOpen(): boolean {
    return !$('pause').classList.contains('hidden');
  }

  // ------------------------------------------------------------------ inventario

  showInventory(): void {
    $('inventory').classList.remove('hidden');
    this.renderInventoryTabs();
    this.renderInventoryGrid();
    this.renderInvHotbar();
  }

  hideInventory(): void {
    $('inventory').classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.hoveredItem = null;
  }

  isInventoryOpen(): boolean {
    return !$('inventory').classList.contains('hidden');
  }

  private renderInventoryTabs(): void {
    const tabs = $('invtabs');
    tabs.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.className = c.id === this.invCategory ? 'active' : '';
      b.addEventListener('click', () => {
        this.invCategory = c.id;
        this.onUiSound?.('click');
        this.renderInventoryTabs();
        this.renderInventoryGrid();
      });
      tabs.appendChild(b);
    }
  }

  /** Pinta los iconos de la cuadrícula del inventario creativo cuando se ven (cada uno se dibuja al pedirlo). */
  private gridObserver: IntersectionObserver | null = null;

  private renderInventoryGrid(): void {
    const grid = $('invgrid');
    grid.innerHTML = '';
    this.gridObserver?.disconnect();
    const fills = new Map<Element, () => void>();
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          fills.get(e.target)?.();
          fills.delete(e.target);
          observer?.unobserve(e.target);
        }
      }, { root: grid, rootMargin: '240px' })
      : null;
    this.gridObserver = observer;
    const q = $<HTMLInputElement>('invsearch').value.trim().toLowerCase();
    const ids: number[] = [];
    if (this.invCategory !== 'objetos' && this.invCategory !== 'pociones') {
      for (const id of INVENTORY_ORDER) {
        if (this.invCategory === 'todo' || BLOCKS[id].category === this.invCategory) ids.push(id);
      }
    }
    if (this.invCategory === 'redstone') ids.unshift(REDSTONE); // Fase 7 (redstone): el polvo, el primero
    if (this.invCategory === 'todo' || this.invCategory === 'objetos') ids.push(...CREATIVE_ITEMS);
    // Fase 7 (pociones): su pestaña (alambique, frascos e ingredientes) y cada poción con su tipo.
    if (this.invCategory === 'pociones') ids.push(...CREATIVE_BREWING);
    const stacks: ItemStack[] = ids.map((id) => ({ id, count: 1 }));
    if (this.invCategory === 'todo' || this.invCategory === 'pociones') stacks.push(...CREATIVE_POTIONS);
    // Fase 7 (encantamientos): un libro encantado por cada encantamiento y nivel (como en Minecraft).
    if (this.invCategory === 'todo' || this.invCategory === 'objetos') {
      for (const e of ENCHANT_IDS) for (let l = 1; l <= ENCHANTS[e].max; l++) stacks.push(enchantedBook([[e, l]]));
    }
    for (const st of stacks) {
      const id = st.id;
      const extra = st.data?.stored ? ' ' + st.data.stored.map(([e, l]) => enchantName(e, l)).join(' ') : '';
      if (!ITEMS[id]) continue;
      const name = stackName(st) + extra;
      if (q && !name.toLowerCase().includes(q)) continue;
      const item = document.createElement('div');
      item.className = 'invitem';
      item.innerHTML = '<div class="ico"></div>';
      const fill = () => {
        const url = stackIconUrl(st, this.icons) ?? '';
        const gl = glintAttrs(st, url);
        const ico = item.firstElementChild as HTMLElement;
        ico.className = `ico${gl.cls}`;
        ico.setAttribute('style', `background-image:url(${url})${gl.style}`);
      };
      if (observer) {
        fills.set(item, fill);
        observer.observe(item);
      } else fill();
      const stack = st.data || st.dmg ? st : undefined;
      item.addEventListener('click', () => {
        this.onUiSound?.('click');
        this.onInventoryPick?.(id, null, stack);
        this.renderInvHotbar();
      });
      item.addEventListener('mouseenter', () => {
        this.hoveredItem = id;
        this.hoveredStack = stack;
        this.tooltip.innerHTML = itemTooltipHtml(st);
        this.tooltip.classList.remove('hidden');
      });
      item.addEventListener('mousemove', (e) => {
        this.tooltip.style.left = `${e.clientX + 14}px`;
        this.tooltip.style.top = `${e.clientY + 14}px`;
      });
      item.addEventListener('mouseleave', () => {
        this.hoveredItem = null;
        this.tooltip.classList.add('hidden');
      });
      grid.appendChild(item);
    }
  }

  private renderInvHotbar(): void {
    const bar = $('invhotbar');
    bar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot' + (i === this.selected ? ' sel' : '');
      s.innerHTML = `<span class="num">${i + 1}</span><div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>`;
      paintSlot(s, this.hotbar[i] ?? null, this.icons);
      s.addEventListener('click', () => {
        this.onInventorySelectSlot?.(i);
        this.renderInvHotbar();
      });
      bar.appendChild(s);
    }
  }

  // ------------------------------------------------------------------ ajustes

  bindSettings(s: Settings, gpu: string): void {
    this.settings = s;
    $('gpu-info').textContent = `GPU: ${gpu}`;
  }

  openSettings(from: 'menu' | 'pause'): void {
    this.settingsReturn = from;
    $('settings').classList.remove('hidden');
    if (from === 'pause') this.hidePause();
    this.renderSettings();
  }

  closeSettings(): void {
    $('settings').classList.add('hidden');
    if (this.settingsReturn === 'pause') this.onResume?.();
  }

  isSettingsOpen(): boolean {
    return !$('settings').classList.contains('hidden');
  }

  /** Guarda los ajustes cambiados desde fuera de la pantalla de ajustes (p. ej. con /voz). */
  commitSettings(): void {
    this.changed();
  }

  private changed(): void {
    if (!this.settings) return;
    saveSettings(this.settings);
    this.onSettingsChanged?.(this.settings);
  }

  private renderSettings(): void {
    const s = this.settings;
    if (!s) return;
    const presets = $('presets');
    presets.innerHTML = '';
    const names: [PresetName, string][] = [['bajo', 'Bajo'], ['medio', 'Medio'], ['alto', 'Alto'], ['ultra', 'Ultra']];
    for (const [p, label] of names) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = s.preset === p ? 'active' : '';
      b.addEventListener('click', () => {
        applyPreset(s, p);
        this.changed();
        this.renderSettings();
      });
      presets.appendChild(b);
    }
    const custom = () => {
      s.preset = 'personalizado';
      presets.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    };
    const r = s.render;
    const render = $('settings-render');
    render.innerHTML = '';
    render.append(
      this.slider('Distancia de visión', r.renderDistance, 4, 16, 1, (v) => `${v} chunks`, (v) => { r.renderDistance = v; custom(); }),
      this.slider('Escala de resolución', r.renderScale, 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { r.renderScale = v; custom(); }),
      this.select('Sombras', r.shadowSize, [[0, 'Desactivadas'], [1024, 'Bajas'], [2048, 'Altas'], [4096, 'Ultra']], (v) => { r.shadowSize = v; custom(); }),
      this.slider('Distancia de sombras', r.shadowDistance, 48, 256, 16, (v) => `${v} bloques`, (v) => { r.shadowDistance = v; custom(); }),
      this.slider('Suavizado de sombras', r.pcfSamples, 1, 16, 1, (v) => `${v} muestras`, (v) => { r.pcfSamples = v; custom(); }),
      this.slider('Calidad de nubes', r.cloudSteps, 12, 72, 4, (v) => `${v} pasos`, (v) => { r.cloudSteps = v; custom(); }),
      this.slider('Reflejos del agua (SSR)', r.ssrSteps, 0, 48, 4, (v) => (v === 0 ? 'Sólo cielo' : `${v} pasos`), (v) => { r.ssrSteps = v; custom(); }),
      this.slider('Rayos de luz volumétricos', r.volumetricSteps, 4, 32, 2, (v) => `${v} pasos`, (v) => { r.volumetricSteps = v; custom(); }),
      this.toggle('Nubes volumétricas', r.clouds, (v) => { r.clouds = v; custom(); }),
      this.toggle('Luz volumétrica', r.volumetric, (v) => { r.volumetric = v; custom(); }),
      this.toggle('Antialiasing temporal (TAA)', r.taa, (v) => { r.taa = v; custom(); }),
      this.toggle('Resplandor (bloom)', r.bloom, (v) => { r.bloom = v; custom(); }),
      this.toggle('Relieve de texturas (POM)', r.pom, (v) => { r.pom = v; custom(); }),
    );
    const controls = $('settings-controls');
    controls.innerHTML = '';
    controls.append(
      this.slider('Campo de visión', r.fov, 50, 110, 1, (v) => `${v}°`, (v) => { r.fov = v; }),
      this.slider('Brillo', r.brightness, -2, 2, 0.1, (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)), (v) => { r.brightness = v; }),
      this.slider('Sensibilidad del ratón', s.sensitivity, 0.2, 3, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { s.sensitivity = v; }),
      this.toggle('Invertir eje Y', s.invertY, (v) => { s.invertY = v; }),
      this.toggle('Balanceo de la cámara', s.viewBobbing, (v) => { s.viewBobbing = v; }),
      this.toggle('Agacharse con una pulsación (alternar)', s.toggleSneak, (v) => { s.toggleSneak = v; }),
      this.toggle('Correr con una pulsación (alternar)', s.toggleSprint, (v) => { s.toggleSprint = v; }),
    );
    this.renderKeys();
    const audio = $('settings-audio');
    audio.innerHTML = '';
    audio.append(
      this.slider('Volumen general', s.master, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { s.master = v; }),
      this.slider('Música', s.music, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { s.music = v; }),
      this.slider('Ambiente', s.ambient, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { s.ambient = v; }),
      this.toggle('Chat de voz por proximidad', s.voiceEnabled, (v) => { s.voiceEnabled = v; }),
      this.select('Micrófono', s.voiceMode === 'vad' ? 1 : 0, [[0, `Pulsar para hablar (${keyLabel(s.keys.voice)})`], [1, 'Se abre al hablar']], (v) => { s.voiceMode = v === 1 ? 'vad' : 'ptt'; }),
      this.slider('Sensibilidad (al hablar)', 1 - s.voiceThreshold, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { s.voiceThreshold = 1 - v; }),
      this.slider('Volumen de las voces', s.voiceVolume, 0, 2, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { s.voiceVolume = v; }),
    );
    // Volumen de cada jugador con voz que haya ahora (0 = silenciado).
    for (const name of this.voicePlayers?.() ?? []) {
      const key = name.toLowerCase();
      const cur = s.voicePlayers[key] ?? 1;
      audio.append(this.slider(`Voz de ${escapeHtml(name)}`, cur, 0, 2, 0.05, (v) => (v === 0 ? 'Silenciado' : `${Math.round(v * 100)}%`), (v) => {
        if (v === 1) delete s.voicePlayers[key];
        else s.voicePlayers[key] = v;
      }));
    }
  }

  /** Teclas: un botón por acción; al pulsarlo espera la tecla nueva (Esc cancela). */
  private renderKeys(): void {
    const s = this.settings;
    if (!s) return;
    const box = $('settings-keys');
    box.innerHTML = '';
    for (const [action, label] of KEY_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'keyrow';
      row.innerHTML = `<span>${label}</span><button class="btn small key"></button>`;
      const btn = row.querySelector('button')!;
      btn.textContent = keyLabel(s.keys[action]);
      btn.addEventListener('click', () => {
        this.onUiSound?.('click');
        btn.textContent = 'Pulsa una tecla…';
        btn.classList.add('waiting');
        const onKey = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          if (e.code !== 'Escape' && assignKey(s.keys, action, e.code)) this.changed();
          this.renderKeys();
        };
        window.addEventListener('keydown', onKey, true);
      });
      box.appendChild(row);
    }
  }

  private slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, set: (v: number) => void): HTMLElement {
    const el = document.createElement('label');
    el.className = 'opt';
    el.innerHTML = `<span class="lbl"><span>${label}</span><b></b></span><input type="range" min="${min}" max="${max}" step="${step}">`;
    const input = el.querySelector('input')!;
    const out = el.querySelector('b')!;
    input.value = String(value);
    out.textContent = fmt(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      set(v);
      this.changed();
    });
    return el;
  }

  private toggle(label: string, value: boolean, set: (v: boolean) => void): HTMLElement {
    const el = document.createElement('label');
    el.className = 'toggle';
    el.innerHTML = `<span>${label}</span><input type="checkbox"><span class="sw"></span>`;
    const input = el.querySelector('input')!;
    input.checked = value;
    input.addEventListener('change', () => {
      set(input.checked);
      this.changed();
    });
    return el;
  }

  private select(label: string, value: number, options: [number, string][], set: (v: number) => void): HTMLElement {
    const idx = Math.max(0, options.findIndex((o) => o[0] === value));
    return this.slider(label, idx, 0, options.length - 1, 1, (i) => options[i][1], (i) => set(options[i][0]));
  }
}

/** Pinta una ranura (icono, cantidad y barra de desgaste). */
export function paintSlot(el: HTMLElement, s: ItemStack | null, icons: Map<number, string>): void {
  const ico = el.querySelector('.ico') as HTMLElement;
  const cnt = el.querySelector('.cnt') as HTMLElement | null;
  const dur = el.querySelector('.dur') as HTMLElement | null;
  const url = stackIconUrl(s, icons); // Fase 6.5 (libros y estandartes): estandartes con dibujos
  ico.style.backgroundImage = url ? `url(${url})` : '';
  paintGlint(ico, s, url); // Fase 7 (encantamientos)
  if (cnt) cnt.textContent = s && s.count > 1 ? String(s.count) : '';
  if (dur) {
    const tool = s ? ITEMS[s.id]?.tool : undefined;
    if (s && tool && s.dmg) {
      const f = Math.max(0, 1 - s.dmg / tool.durability);
      dur.style.display = 'block'; // '' dejaría el display: none de la hoja de estilos
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    } else if (s && isBundle(s.id) && s.bag?.length) {
      // Fase 6.5 (remate): lo lleno que está el saco.
      const f = Math.min(1, bagWeight(s.bag) / BUNDLE_CAPACITY);
      dur.style.display = 'block'; // '' dejaría el display: none de la hoja de estilos
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = f >= 1 ? '#e8503a' : '#6aa8ff';
    } else dur.style.display = 'none';
  }
}

export function sanitizeRoomInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'mundo';
}

export function randomRoom(): string {
  const words = ['bosque', 'montana', 'isla', 'valle', 'pradera', 'cueva', 'costa', 'aldea', 'cumbre', 'rio'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(1000 + Math.random() * 9000)}`;
}
