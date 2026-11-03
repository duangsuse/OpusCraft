// Reparte cada mensaje de un jugador a su sistema. Cada entrada dice cuánto gasta del ritmo del
// jugador (`cost`, fichas de allow: 0 si no se limita) y quién lo atiende. Los mensajes antes de
// entrar al mundo (hello, ping) los atiende GameServer.
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { ENT_END_CRYSTAL } from '../../mobs'; // Fase 8.6
import type { ServerContext, Session } from './context';
import type { ServerSystems } from './systems';

type Msg<T extends ClientMsg['t']> = Extract<ClientMsg, { t: T }>;

/** Lo que el reparto necesita de GameServer (lo demás lo tienen los sistemas). */
export interface RouterHost {
  ctx: ServerContext;
  sys: ServerSystems;
  onPos(s: Session, msg: Msg<'pos'>): void;
  onState(s: Session, d: unknown): void;
  onChat(s: Session, m: unknown): void;
}

interface Route {
  cost: number;
  run(h: RouterHost, s: Session, msg: never): void;
}

const route = <T extends ClientMsg['t']>(cost: number, run: (h: RouterHost, s: Session, msg: Msg<T>) => void): Route => ({ cost, run: run as Route['run'] });

const ROUTES: { [T in ClientMsg['t']]?: Route } = {
  pos: route<'pos'>(0.2, (h, s, m) => h.onPos(s, m)),
  set: route<'set'>(0, (h, s, m) => h.sys.edits.onSet(s, m)),
  place: route<'place'>(0, (h, s, m) => h.sys.edits.onPlace(s, m)),
  use: route<'use'>(1, (h, s, m) => h.sys.edits.onUse(s, m)),
  wake: route<'wake'>(0, (h, s) => h.sys.beds.wake(s)),
  interact: route<'interact'>(1, (h, s, m) => h.sys.farming.onInteract(s, m)),
  trample: route<'trample'>(1, (h, s, m) => {
    const x = Number(m.x), y = Number(m.y), z = Number(m.z);
    if ([x, y, z].every(Number.isInteger) && h.ctx.reachOk(s, x, y, z, 3)) h.sys.farming.trample(x, y, z);
  }),
  chat: route<'chat'>(0, (h, s, m) => h.onChat(s, m.m)),
  // Chat de voz: activarla y las señales de WebRTC entre jugadores.
  voice: route<'voice'>(1, (h, s, m) => h.sys.voice.onVoice(s, m)),
  rtc: route<'rtc'>(0.25, (h, s, m) => h.sys.voice.onRtc(s, m)),
  swing: route<'swing'>(0.5, (h, s) => h.ctx.broadcast({ t: 'swing', id: s.id }, s)),
  // Los golpes a cuadros, marcos, soportes, barcas y vagonetas los atiende su sistema.
  attack: route<'attack'>(1, (h, s, m) => {
    const e = Number(m.e);
    // Fase 8.3: un golpe a una bola de fuego del ghast la devuelve hacia donde mira el jugador.
    const fb = h.ctx.entities.list.get(e);
    if (fb && Math.hypot(fb.x - s.p[0], fb.y - s.p[1], fb.z - s.p[2]) < 7 && h.ctx.entities.mobs.nether.flyers.deflect(fb, s.id, s.r[0], s.r[1])) return;
    // Fase 8.6: el cristal del End estalla con cualquier golpe.
    const ent = h.ctx.entities.list.get(e);
    if (ent?.type === ENT_END_CRYSTAL && Math.hypot(ent.x - s.p[0], ent.y + 1 - s.p[1] - 1.6, ent.z - s.p[2]) < 8) {
      h.ctx.entities.dragon.crystalHit(ent, s.id);
      return;
    }
    // Fase 8.6: la bala del shulker se deshace con un golpe.
    if (ent && Math.hypot(ent.x - s.p[0], ent.y - s.p[1] - 1.6, ent.z - s.p[2]) < 7 && h.ctx.entities.shulkers.hitBullet(ent)) return;
    if (!h.sys.hangings.onAttack(s, e) && !h.sys.stands.onAttack(s, e) && !h.sys.transport.onAttack(s, e, Number(m.item))) h.sys.actions.onAttack(s, m);
  }),
  pickup: route<'pickup'>(0.5, (h, s, m) => h.sys.actions.onPickup(s, Number(m.e))),
  drop: route<'drop'>(0, (h, s, m) => h.sys.actions.onDrop(s, m)),
  shoot: route<'shoot'>(3, (h, s, m) => h.sys.actions.onShoot(s, m)),
  // El tridente y los cohetes los lanza el equipo.
  throw: route<'throw'>(1, (h, s, m) => {
    if (!h.sys.equipment.onThrow(s, m)) h.sys.actions.onThrow(s, m);
  }),
  fish: route<'fish'>(1, (h, s, m) => h.sys.fishing.onFish(s, m)),
  // Fase 8.6: el frasco en el aliento del dragón (la nube pierde medio bloque; el frasco lo cambia el cliente).
  breath: route<'breath'>(1, (h, s, m) => {
    const c = h.ctx.entities.list.get(Number(m.e));
    if (!c?.dragonBreath || Math.hypot(c.x - s.p[0], c.z - s.p[2]) > (c.cloudRadius ?? 0) + 4) return;
    h.ctx.entities.dragon.bottleBreath(c.id);
  }),
  sign: route<'sign'>(2, (h, s, m) => h.sys.signs.onSign(s, m)),
  open: route<'open'>(1, (h, s, m) => h.sys.containers.onOpen(s, m)),
  close: route<'close'>(0, (h, s) => h.sys.containers.close(s)), // los cofres trampa cuentan quién mira
  cclick: route<'cclick'>(0, (h, s, m) => h.sys.containers.onOp(s, m)),
  cput: route<'cput'>(0, (h, s, m) => h.sys.containers.onOp(s, m)),
  ctake: route<'ctake'>(0, (h, s, m) => h.sys.containers.onOp(s, m)),
  look: route<'look'>(0.2, (h, s, m) => {
    if (!Number.isInteger(m.e)) return;
    s.lookAt = m.e;
    s.lookUntil = h.ctx.now() + 700;
  }),
  state: route<'state'>(2, (h, s, m) => h.onState(s, m.d)),
  // Al morir: n entero 1..100 (7 por nivel, como mucho 100), junto al jugador ya muerto.
  dropxp: route<'dropxp'>(0, (h, s, m) => {
    const n = Number(m.n);
    const p = Array.isArray(m.p) && m.p.length === 3 ? m.p.map(Number) : [];
    if (!Number.isInteger(n) || n < 1 || n > 100 || p.length !== 3 || !p.every(Number.isFinite)) return;
    if (!(s.s & STATE_DEAD) || s.mode === 'c' || Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) > 4) return;
    // Fase 7.5 (abismo): junto a un catalizador de sculk, se la come él.
    if (h.ctx.allow(s, 5) && !h.sys.deepDark.playerXp(p[0], p[1], p[2], n)) h.ctx.entities.xp.playerDrop(s.id, n, p[0], p[1], p[2], h.ctx.now());
  }),
  // Fase 6 (aldeanos): comercio.
  topen: route<'topen'>(1, (h, s, m) => h.sys.trading.onOpen(s, m)),
  trade: route<'trade'>(0, (h, s, m) => h.sys.trading.onTrade(s, m)),
  tclose: route<'tclose'>(0, (h, s) => h.sys.trading.onClose(s)),
  died: route<'died'>(0, (h, s, m) => {
    h.sys.onDied(s);
    if (typeof m.m === 'string' && h.ctx.allow(s, 5)) {
      const text = m.m.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
      if (text) h.ctx.broadcast({ t: 'chat', id: null, name: '', m: `☠ ${s.name} ${text}.` });
    }
  }),
  omen: route<'omen'>(1, (h, s, m) => h.sys.raids.onOmen(s, m.a)), // Fase 6 (asaltos)
  // Fase 6 (monturas)
  mount: route<'mount'>(1, (h, s, m) => {
    h.sys.transport.leave(s.id); // Fase 7 (transporte): se baja de la barca o vagoneta
    h.sys.riding.onMount(s, m);
  }),
  dismount: route<'dismount'>(0, (h, s) => h.sys.riding.dismount(s.id)),
  mpos: route<'mpos'>(0.2, (h, s, m) => h.sys.riding.onMove(s, m)),
  // Fase 6.5 (decoración, remate, libros, colecciones y equipo).
  hang: route<'hang'>(1, (h, s, m) => h.sys.hangings.onHang(s, m)),
  frame: route<'frame'>(1, (h, s, m) => h.sys.hangings.onFrame(s, m)),
  stand: route<'stand'>(1, (h, s, m) => h.sys.stands.onPlace(s, m)),
  leash: route<'leash'>(1, (h, s, m) => h.sys.leashes.onFence(s, m)),
  shelf: route<'shelf'>(1, (h, s, m) => h.sys.shelves.onShelf(s, m)),
  lectern: route<'lectern'>(1, (h, s, m) => h.sys.lecterns.onLectern(s, m)),
  jukebox: route<'jukebox'>(1, (h, s, m) => h.sys.collections.onJukebox(s, m)),
  ignite: route<'ignite'>(1, (h, s, m) => h.sys.equipment.onIgnite(s, m)),
  horn: route<'horn'>(1, (h, s, m) => h.sys.equipment.onHorn(s, m)),
  boost: route<'boost'>(1, (h, s, m) => h.sys.equipment.onBoost(s, m)),
  // Fase 7 (transporte): poner, subirse, bajarse y mover la que lleva el jugador.
  vplace: route<'vplace'>(1, (h, s, m) => h.sys.transport.onPlace(s, m)),
  vride: route<'vride'>(1, (h, s, m) => h.sys.transport.onRide(s, m)),
  vleave: route<'vleave'>(0, (h, s) => h.sys.transport.leave(s.id)),
  vpos: route<'vpos'>(0.2, (h, s, m) => h.sys.transport.onMove(s, m)),
  // Fase 7 (encantamientos)
  work: route<'work'>(2, (h, s, m) => h.sys.enchantWork.onWork(s, m)),
  beacon: route<'beacon'>(2, (h, s, m) => h.sys.netherGoods.onBeacon(s, m)), // Fase 8.5: el faro
  frost: route<'frost'>(0.2, (h, s, m) => h.sys.enchantWork.onFrost(s, m)),
};

/** Reparte un mensaje de un jugador que ya está en el mundo. */
export function routeMessage(h: RouterHost, s: Session, msg: ClientMsg): void {
  const r = ROUTES[msg.t];
  if (!r || (r.cost > 0 && !h.ctx.allow(s, r.cost))) return;
  r.run(h, s, msg as never);
}
