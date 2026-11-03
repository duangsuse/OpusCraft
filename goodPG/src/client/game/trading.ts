// Comercio con los aldeanos en el cliente (fase 6): clic derecho sobre un aldeano pide sus ofertas;
// al elegir una se saca el pago del inventario y se envía al servidor, que responde con lo que se
// recibe (y lo que sobre) o devuelve el pago si el trato no vale.
import { isVillagerType } from '../../shared/mobs';
import { isValidItem, maxStack, type ItemStack } from '../../shared/items';
import type { ServerMsg } from '../../shared/protocol';
import { MAX_OFFER_COUNT, type TradeWire, type TradeExtra } from '../../shared/villagers';
import { potionType, PT_WATER } from '../../shared/potions';
import { TradeScreen, type TradeView } from '../ui/TradeScreen';
import { EF_BABY } from '../../shared/protocol';
import { sanitizeStack } from '../../shared/containers'; // Fase 7 (encantamientos)
import type { ClientEntity } from './ClientEntities';
import type { Game } from './Game';

/** Como mucho, tratos seguidos con mayúsculas + clic. */
const MAX_BATCH = 16;

export class Trading {
  readonly screen: TradeScreen;
  private entity = -1;
  private pendingOpen = -1;
  private q = 0;
  private view: TradeView | null = null;
  private invVersion = -1;

  constructor(private g: Game) {
    this.screen = new TradeScreen({
      icons: () => g.ui.icons,
      have: (id, water) => g.inv.count(id, water ? isWater : undefined),
      trade: (i, all) => this.trade(i, all),
      close: () => this.close(true),
    }, () => g.cfg.settings.keys);
  }

  isOpen(): boolean {
    return this.screen.isOpen();
  }

  /** ¿Abre el clic derecho la pantalla de comercio con esta criatura? */
  canTrade(e: ClientEntity): boolean {
    return isVillagerType(e.type) && e.deathT < 0 && !(e.flags & EF_BABY);
  }

  /** Clic derecho sobre un aldeano: pedir sus ofertas al servidor. */
  open(e: ClientEntity): void {
    this.pendingOpen = e.id;
    this.g.net?.send({ t: 'topen', e: e.id });
    this.g.swing(true);
  }

  onServer(msg: Extract<ServerMsg, { t: 'trades' | 'tres' | 'tclose' }>): void {
    if (msg.t === 'trades') {
      const view: TradeView = { prof: msg.p | 0, level: msg.lvl | 0, xp: msg.xp | 0, trader: !!msg.tr, offers: sanitize(msg.o) };
      if (!this.isOpen()) {
        if (msg.e !== this.pendingOpen) return;
        this.pendingOpen = -1;
        this.entity = msg.e;
        const g = this.g;
        g.interaction.mining = null;
        g.interaction.use = null;
        g.input.gameKeys = false;
        g.input.releaseAll();
        g.input.exitLock();
        g.audio.playUi('open');
        this.view = view;
        this.screen.open(view);
        return;
      }
      if (msg.e !== this.entity) return;
      this.view = view;
      this.screen.set(view);
    } else if (msg.t === 'tres') {
      const inv = this.g.inv;
      const give = (s: ItemStack | null | undefined) => {
        if (!s || !isValidItem(s.id) || !(s.count > 0)) return;
        // Fase 7 (encantamientos): con sus datos (libros y equipo encantados) y su desgaste (el tipo de la flecha con
        // efecto o de la poción, el efecto del estofado, la celda del mapa).
        const clean = sanitizeStack({ ...s, count: 1 });
        const rest = inv.add({ ...(clean ?? { id: s.id }), count: Math.min(maxStack(s.id), s.count | 0) } as ItemStack);
        if (rest) this.g.interaction.throwStack(rest, false);
      };
      if (msg.ok) give(msg.give);
      for (const b of Array.isArray(msg.back) ? msg.back : []) give(b);
      inv.changed();
      if (msg.ok) this.g.audio.playPickup();
      if (msg.m) this.g.ui.toast(msg.m);
      this.screen.render();
    } else if (this.isOpen()) {
      this.close(false);
    } else this.pendingOpen = -1;
  }

  /** Comerciar con la oferta i (una vez o, con `all`, mientras alcance el pago y queden usos). */
  private trade(i: number, all: boolean): void {
    const v = this.view;
    const o = v?.offers[i];
    if (!v || !o || !this.g.net) return;
    const [c1, n1, c2, n2] = o;
    const water = o[9].w ? isWater : undefined; // el frasco de agua: sólo pociones de agua
    const inv = this.g.inv;
    const times = all ? MAX_BATCH : 1;
    let done = 0;
    for (let k = 0; k < times && o[6] < o[7]; k++) {
      if (inv.count(c1, water) < n1 + (c2 === c1 ? n2 : 0) || (c2 && inv.count(c2) < n2)) break;
      const pay: ItemStack[] = [{ id: c1, count: inv.remove(c1, n1, water) }];
      if (c2) pay.push({ id: c2, count: inv.remove(c2, n2) });
      this.g.net.send({ t: 'trade', e: this.entity, i, q: ++this.q, pay });
      o[6]++; // se descuenta ya (el servidor manda las ofertas de verdad tras cada trato)
      done++;
    }
    if (done === 0) {
      this.g.audio.playUi('click');
      this.g.ui.toast(o[6] >= o[7] ? 'Esta oferta está agotada.' : 'No tienes lo que pide.');
    }
    inv.changed();
    this.screen.render();
  }

  close(notify: boolean): void {
    if (!this.isOpen()) return;
    this.screen.close();
    this.view = null;
    this.entity = -1;
    if (notify) this.g.net?.send({ t: 'tclose' });
    this.g.afterScreenClosed();
  }

  /** Cada frame: si cambió el inventario, se repinta qué ofertas se pueden pagar. */
  update(): void {
    if (!this.isOpen() || this.g.inv.version === this.invVersion) return;
    this.invVersion = this.g.inv.version;
    this.screen.render();
  }
}

/** ¿Es un frasco de agua? */
const isWater = (s: ItemStack) => potionType(s) === PT_WATER;

function sanitize(raw: unknown): TradeWire[] {
  if (!Array.isArray(raw)) return [];
  // Fase 7 (encantamientos): el noveno campo son los datos de lo que se recibe (se validan con la pila); el décimo, el
  // precio sin cambios, el desgaste de lo que se recibe y si pide un frasco de agua.
  return raw.slice(0, MAX_OFFER_COUNT).filter((o) => Array.isArray(o) && o.length === 10 && o.slice(0, 8).every(Number.isInteger))
    .map((o) => {
      const w = o.slice(0, 8) as [number, number, number, number, number, number, number, number];
      const data = o[8] ? sanitizeStack({ id: w[4], count: 1, data: o[8] })?.data : undefined;
      const x = o[9] && typeof o[9] === 'object' ? o[9] as Record<string, unknown> : {};
      const extra: TradeExtra = {};
      if (Number.isInteger(x.b) && (x.b as number) > 0) extra.b = x.b as number;
      if (Number.isInteger(x.rd) && (x.rd as number) > 0) extra.rd = x.rd as number;
      if (x.w === 1) extra.w = 1;
      return [...w, data ?? 0, extra] as TradeWire;
    });
}
