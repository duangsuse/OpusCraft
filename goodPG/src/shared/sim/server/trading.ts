// Comercio con los aldeanos (fase 6), con el servidor como autoridad: abrir la pantalla de un aldeano
// (sólo si tiene oficio y está cerca), validar cada trato (la oferta existe, no está agotada y lo que
// paga el jugador cubre el precio), sumar usos y experiencia al aldeano (sube de nivel y desbloquea
// ofertas), aldeanos nuevos al generarse una aldea y el comerciante ambulante que aparece de vez en cuando.
import { MOB_VILLAGER, MOB_WANDERING_TRADER, isVillagerType } from '../../mobs';
import { BLOCK_FLUID } from '../../blocks';
import { maxStack, type ItemStack } from '../../items';
import {
  pickLevelOffers, pickTraderOffers, storeOffer, offerFromStore, offerPrice, specialPrice, offerToWire, offerResult, PROF_NONE,
  type Offer, type TradeContext,
} from '../../villagers';
import { addGossip } from '../../villagerGossip';
import { potionType, PT_WATER } from '../../potions';
import { sanitizeStack } from '../../containers';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { sunHeightAt } from '../../weather';
import { standable } from '../pathfind';
import type { Entity } from '../entities';
import type { VillagerSpawn } from '../../world/villages';
import type { ServerContext, Session } from './context';
import { ExplorerTrades } from './explorerTrades'; // Fase 7.5 (mansión)
import { mapKeyAt } from '../../maps';

/** Distancia máxima para comerciar (bloques). */
const TRADE_RANGE = 6;
/** Segundos entre intentos de traer un comerciante ambulante. */
const TRADER_EVERY = 600;

export class Trading {
  /** Aldeano con el que comercia cada jugador (id de sesión → id de la entidad). */
  private open = new Map<string, number>();
  private traderTimer = TRADER_EVERY;

  /** Fase 6 (asaltos): nivel del efecto Héroe de la aldea de un jugador (null si no lo tiene). */
  heroAmp: (name: string) => number | null = () => null;
  /** Fase 7.5 (fauna): acaba de llegar un comerciante ambulante (trae sus llamas). */
  onTraderSpawn: ((trader: Entity) => void) | null = null;
  /** Fase 7.5 (mansión): mapas de explorador del cartógrafo. */
  readonly explorer: ExplorerTrades;

  constructor(private ctx: ServerContext) {
    this.explorer = new ExplorerTrades(ctx);
  }

  /**
   * Elige las ofertas que le falten (AbstractVillager.updateTrades): las de cada nivel al llegar a él (el comerciante,
   * todas de una vez). Se quedan fijas y se guardan con el aldeano.
   */
  private ensureOffers(e: Entity): void {
    const v = this.ctx.entities.villagers.data(e);
    const trader = e.type === MOB_WANDERING_TRADER;
    const target = trader ? 1 : v.prof === PROF_NONE ? 0 : v.level;
    if (v.offerLevels >= target) return;
    const prof = trader ? PROF_NONE : v.prof;
    const tc: TradeContext = { type: v.type, rand: () => this.ctx.rand(), map: (kind) => this.explorer.mapData(e, kind) };
    for (let l = v.offerLevels + 1; l <= target; l++) {
      const list = trader ? pickTraderOffers(tc) : pickLevelOffers(prof, l, tc);
      v.offers.push(...list.map((o) => storeOffer(prof, o)));
    }
    v.offerLevels = target;
  }

  /**
   * Ofertas actuales de un aldeano o comerciante, con el precio de ahora: la demanda y, para el jugador `s`, su
   * reputación y el Héroe de la aldea (Villager.updateSpecialPrices; el comerciante no los tiene en cuenta).
   */
  offers(e: Entity, s?: Session): { offer: Offer; price: number }[] {
    this.ensureOffers(e);
    const v = this.ctx.entities.villagers.data(e);
    const trader = e.type === MOB_WANDERING_TRADER;
    const rep = s && !trader ? this.ctx.entities.villagers.reputationOf(e, s.name) : 0;
    const hero = s && !trader ? this.heroAmp(s.name) : null;
    const out: { offer: Offer; price: number }[] = [];
    for (const so of v.offers) {
      const o = offerFromStore(trader ? PROF_NONE : v.prof, so);
      if (!o) continue;
      const price = trader ? o.cost[1] : offerPrice(o, v.demand[o.key] ?? 0, specialPrice(o, rep, hero));
      out.push({ offer: o, price });
    }
    return out;
  }

  /** Aldeano vivo y al alcance del jugador (o null). */
  private villagerFor(s: Session, id: number): Entity | null {
    const e = this.ctx.entities.list.get(id);
    if (!e || e.dead || !e.ai || !isVillagerType(e.type)) return null;
    if (!this.ctx.local && Math.hypot(e.x - s.p[0], e.y - s.p[1], e.z - s.p[2]) > TRADE_RANGE) return null;
    return e;
  }

  onOpen(s: Session, msg: Extract<ClientMsg, { t: 'topen' }>): void {
    const ctx = this.ctx;
    const e = s.s & STATE_DEAD ? null : this.villagerFor(s, Number(msg.e));
    if (!e) {
      ctx.send(s, { t: 'tclose' });
      return;
    }
    const v = ctx.entities.villagers.data(e);
    if (e.type === MOB_VILLAGER && v.prof === PROF_NONE) {
      ctx.send(s, { t: 'tclose' });
      ctx.tell(s, 'Este aldeano aún no tiene oficio: necesita un bloque de trabajo libre cerca.');
      ctx.fx('villager_no', e.x, e.y + e.height, e.z, e.type);
      return;
    }
    if (v.trading && v.trading !== s.id && [...this.open.entries()].some(([sid, eid]) => sid === v.trading && eid === e.id)) {
      ctx.send(s, { t: 'tclose' });
      ctx.tell(s, 'Este aldeano está comerciando con otro jugador.');
      return;
    }
    this.close(s, false);
    v.trading = s.id;
    this.open.set(s.id, e.id);
    this.sendOffers(s, e);
  }

  private sendOffers(s: Session, e: Entity): void {
    const v = this.ctx.entities.villagers.data(e);
    this.ctx.send(s, {
      t: 'trades', e: e.id, p: v.prof, lvl: v.level, xp: v.xp, tr: e.type === MOB_WANDERING_TRADER,
      o: this.offers(e, s).map(({ offer, price }) => offerToWire(offer, v.uses[offer.key] ?? 0, price)),
    });
  }

  onTrade(s: Session, msg: Extract<ClientMsg, { t: 'trade' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q) | 0;
    const pay = (Array.isArray(msg.pay) ? msg.pay.slice(0, 4) : []).map((p) => sanitizeStack(p)).filter((p): p is ItemStack => !!p);
    const fail = (m?: string) => ctx.send(s, { t: 'tres', q, ok: false, back: pay, ...(m ? { m } : {}) });
    const id = Number(msg.e);
    if (this.open.get(s.id) !== id || !ctx.allow(s, 1)) return fail();
    const e = this.villagerFor(s, id);
    if (!e) {
      this.close(s, true);
      return fail();
    }
    const list = this.offers(e, s);
    const i = Number(msg.i);
    const entry = Number.isInteger(i) ? list[i] : undefined;
    if (!entry) return fail();
    const { offer: o, price } = entry;
    const v = ctx.entities.villagers.data(e);
    const used = v.uses[o.key] ?? 0;
    if (used >= o.max) return fail('Esta oferta está agotada: el aldeano repondrá más tarde.');
    // Lo pagado tiene que cubrir el precio (el de ahora); lo que sobre se devuelve. El frasco de agua tiene que serlo.
    const rest = pay.map((p) => ({ ...p }));
    const costs: [number, number, boolean][] = [[o.cost[0], price, !!o.water]];
    if (o.cost2) costs.push([o.cost2[0], o.cost2[1], false]);
    for (const [cid, n, water] of costs) {
      let need = n;
      for (const p of rest) {
        if (need <= 0) break;
        if (p.id !== cid || p.count <= 0 || (water && potionType(p) !== PT_WATER)) continue;
        const take = Math.min(need, p.count);
        p.count -= take;
        need -= take;
      }
      if (need > 0) return fail();
    }
    const back: ItemStack[] = rest.filter((p) => p.count > 0).flatMap((p) => {
      const out: ItemStack[] = [];
      for (let r = p.count; r > 0; r -= maxStack(p.id)) out.push({ ...p, count: Math.min(r, maxStack(p.id)) });
      return out;
    });
    v.uses[o.key] = used + 1;
    // Villager.rewardTradeXp: experiencia para el aldeano (sube un nivel como mucho) y 3 a 6 orbes (+5 si sube).
    const up = ctx.entities.villagers.addXp(e, o.xp);
    ctx.entities.xp.spawn(3 + Math.floor(ctx.rand() * 4) + (up ? 5 : 0), e.x, e.y + 0.5, e.z);
    // ReputationEventType.TRADE: +2 de «trading» para quien comercia.
    if (e.type !== MOB_WANDERING_TRADER) addGossip(v.gossip, s.name.toLowerCase(), 'trading', 2);
    ctx.fx('villager_yes', e.x, e.y + e.height, e.z, e.type);
    // Fase 7.5 (mansión): el mapa de explorador, con su celda como los demás mapas de estructura.
    const give = offerResult(o);
    const sm = o.data?.smap;
    if (sm && sm.x !== undefined && sm.z !== undefined) give.dmg = mapKeyAt(sm.x, sm.z);
    ctx.send(s, { t: 'tres', q, ok: true, give, back });
    this.sendOffers(s, e);
  }

  onClose(s: Session): void {
    this.close(s, false);
  }

  /** Un jugador se va: deja libre al aldeano. */
  onLeave(s: Session): void {
    this.close(s, false);
  }

  private close(s: Session, notify: boolean): void {
    const id = this.open.get(s.id);
    if (id === undefined) return;
    this.open.delete(s.id);
    const e = this.ctx.entities.list.get(id);
    if (e?.villager?.trading === s.id) e.villager.trading = null;
    if (notify) this.ctx.send(s, { t: 'tclose' });
  }

  /** Una vez por segundo: cierra los comercios con aldeanos que se alejaron o murieron; trae comerciantes. */
  tick(dt: number): void {
    for (const s of this.ctx.sessions()) {
      const id = this.open.get(s.id);
      if (id === undefined) continue;
      const e = this.villagerFor(s, id);
      if (!e || s.s & STATE_DEAD || Math.hypot(e.x - s.p[0], e.z - s.p[2]) > TRADE_RANGE + 2) this.close(s, true);
    }
    this.traderTimer -= dt;
    if (this.traderTimer <= 0) {
      this.traderTimer = TRADER_EVERY;
      if (this.ctx.rand() < 0.35) this.spawnTrader();
    }
  }

  /** Comerciante ambulante de día cerca de un jugador al azar (si no hay ya uno). */
  spawnTrader(): Entity | null {
    const ctx = this.ctx;
    if (sunHeightAt(ctx.worldTime()) < 0.1) return null;
    for (const e of ctx.entities.list.values()) if (e.type === MOB_WANDERING_TRADER && !e.dead) return null;
    const players = [...ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD));
    if (players.length === 0) return null;
    const p = players[Math.floor(ctx.rand() * players.length)];
    const w = ctx.world;
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = ctx.rand() * Math.PI * 2, r = 16 + ctx.rand() * 16;
      const x = Math.floor(p.p[0] + Math.cos(a) * r), z = Math.floor(p.p[2] + Math.sin(a) * r);
      const y = w.skyTop(x, z) + 1;
      if (y < -60 || !standable(w, x, y, z, 2)) continue;
      const floor = w.getBlock(x, y - 1, z);
      if (floor <= 0 || BLOCK_FLUID[floor]) continue;
      const trader = ctx.entities.villagers.spawn(x + 0.5, y, z + 0.5, null, [x, y, z], MOB_WANDERING_TRADER);
      if (trader) this.onTraderSpawn?.(trader); // Fase 7.5 (fauna): sus dos llamas
      return trader;
    }
    return null;
  }

  /** Aldeanos de una aldea recién generada (una sola vez por aldea). */
  spawnVillagers(list: VillagerSpawn[]): void {
    for (const sp of list) this.ctx.entities.villagers.spawn(sp.x + 0.5, sp.y, sp.z + 0.5, sp.home, sp.meet);
  }
}
