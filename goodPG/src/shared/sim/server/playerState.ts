// Lo que manda cada cliente de su jugador, validado: la posición (con lo que se ve de él: manos,
// armadura, brillo, efectos) y el estado que se guarda (inventario, vida, hambre, efectos…). El
// inventario y la vida los lleva el navegador (confianza entre amigos), pero nada llega sin acotar.
import { isDyeable, sanitizeDyeColor } from '../../dyedColor'; // el cuero teñido
import {
  STATE_MASK, STATE_GLIDE, stackFromWire, stackToWire, type ClientMsg, type PlayerInfo, type PlayerSave, type WireStack,
} from '../../protocol';
import { WORLD_LIMIT, VOID_Y } from '../../constants';
import { sanitizeStack } from '../../containers';
import { ITEMS, SHIELD, isValidItem } from '../../items';
import { EFFECTS, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS, STATE_GLOWING, MAX_HEALTH_CAP } from '../../effects';
import { STATE_INVISIBLE, potionKind, isPotionType } from '../../potions';
import { effectColorFrom } from './potionPlayers';
import { r2, type Session } from './context';

/** Fase 7 (remate): tipo de poción válido del objeto `item` en la mano (0 si no es una poción o no vale). */
function heldPotionType(item: number, raw: unknown): number {
  const t = Number(raw);
  return potionKind(item) && Number.isInteger(t) && isPotionType(t) ? t : 0;
}

/** Fase 7.6: decoración del escudo de una mano ('fondo:dibujo.color,...'), sólo si lleva un escudo. */
const SHIELD_DECOR = /^\d{1,2}(:(\d{1,2}\.\d{1,2}(,\d{1,2}\.\d{1,2}){0,5})?)?$/;
function shieldDecor(item: number, raw: unknown): string | undefined {
  if (isDyeable(item) && typeof raw === 'string' && DYE_DECOR.test(raw)) return raw; // el cuero teñido: 'd' y su color
  return item === SHIELD && typeof raw === 'string' && raw.length <= 40 && SHIELD_DECOR.test(raw) ? raw : undefined;
}
const DYE_DECOR = /^d[0-9a-f]{6}$/;

/** Fase 7 (remate): campos hp y op de un jugador (sólo los que no son agua). Fase 7.6: y los escudos decorados. */
export function handPotions(s: Session): { hp?: number; op?: number; hs?: string; os?: string; ac?: number[] } {
  return { ...(s.hp ? { hp: s.hp } : {}), ...(s.op ? { op: s.op } : {}), ...(s.hs ? { hs: s.hs } : {}), ...(s.os ? { os: s.os } : {}), ...(s.ac ? { ac: s.ac } : {}) };
}

/** Lo que los demás saben de un jugador. */
export function playerInfo(s: Session): PlayerInfo {
  return { id: s.id, name: s.name, shirt: s.shirt, p: s.p, r: s.r, s: s.s, h: s.h, o: s.o, a: s.a, ...(s.g ? { g: s.g } : {}), ...handPotions(s), ...(s.voice ? { v: 1 as const } : {}) }; // Fase 7: g; v, la voz
}

/** Aplica al jugador la posición que manda su cliente; devuelve false si el mensaje no vale. */
export function applyPos(s: Session, msg: Extract<ClientMsg, { t: 'pos' }>): boolean {
  if (!Array.isArray(msg.p) || !Array.isArray(msg.r) || msg.p.length !== 3 || msg.r.length !== 2) return false;
  const p = msg.p.map(Number);
  const r = msg.r.map(Number);
  if (!p.every(Number.isFinite) || !r.every(Number.isFinite)) return false;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const TAU = Math.PI * 2;
  const yaw = ((r[0] % TAU) + TAU) % TAU;
  s.p = [r2(clamp(p[0], -WORLD_LIMIT, WORLD_LIMIT)), r2(clamp(p[1], VOID_Y - 64, 1024)), r2(clamp(p[2], -WORLD_LIMIT, WORLD_LIMIT))];
  s.r = [Math.round(yaw * 1000) / 1000, Math.round(clamp(r[1], -Math.PI / 2, Math.PI / 2) * 1000) / 1000];
  s.s = (Number(msg.s) | 0) & (STATE_MASK | STATE_INVISIBLE | STATE_GLOWING | STATE_GLIDE); // Fase 8.6: planeando // Fase 7 (pociones y efectos): invisible y brillo
  s.ec = effectColorFrom(msg.ec);
  const h = Number(msg.h), o = Number(msg.o);
  s.h = Number.isInteger(h) && isValidItem(h) ? h : 0;
  s.o = Number.isInteger(o) && isValidItem(o) ? o : 0;
  // Fase 7 (remate): el tipo de poción de cada mano, sólo si lleva una poción o una flecha con efecto.
  s.hp = heldPotionType(s.h, msg.hp);
  s.op = heldPotionType(s.o, msg.op);
  s.hs = shieldDecor(s.h, msg.hs); // Fase 7.6
  s.os = shieldDecor(s.o, msg.os);
  // Armadura visible: cada ranura sólo admite su pieza (cabeza, pecho, piernas, pies); lo demás es 0.
  const a = Array.isArray(msg.a) ? msg.a : [];
  s.a = [0, 1, 2, 3].map((slot) => {
    const id = Number(a[slot]);
    return Number.isInteger(id) && isValidItem(id) && ITEMS[id]?.armor?.slot === slot ? id : 0;
  });
  // El color de cada pieza teñida (sólo las que se pueden teñir); nada si ninguna lo está.
  const ac = Array.isArray(msg.ac) ? s.a.map((id, i) => (isDyeable(id) ? sanitizeDyeColor(msg.ac![i]) ?? -1 : -1)) : [];
  s.ac = ac.some((c) => c >= 0) ? ac : undefined;
  // Fase 7 (encantamientos): qué brilla (mano, mano secundaria y cada pieza de armadura).
  const g = Number(msg.g);
  s.g = Number.isInteger(g) ? g & 0x3f : 0;
  return true;
}

/** El estado que se guarda del jugador, acotado; null si el mensaje no vale. */
export function sanitizeSave(d: unknown): PlayerSave | null {
  if (!d || typeof d !== 'object') return null;
  const raw = d as Partial<PlayerSave>;
  const num = (v: unknown, lo: number, hi: number, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  const inv: (WireStack | null)[] = [];
  if (Array.isArray(raw.inv)) {
    for (let i = 0; i < Math.min(46, raw.inv.length); i++) {
      const st = sanitizeStack(stackFromWire(raw.inv[i]));
      inv.push(stackToWire(st)); // Fase 6.5: con el contenido de los sacos
    }
  }
  const save: PlayerSave = {
    inv,
    hp: num(raw.hp, 0, MAX_HEALTH_CAP, 20), // Fase 7 (efectos): con Salud mejorada pasa de 20
    food: num(raw.food, 0, 20, 20),
    sat: num(raw.sat, 0, 20, 5),
    air: num(raw.air, 0, 15, 15),
    sel: num(raw.sel, 0, 8, 0) | 0,
    fly: !!raw.fly,
    dead: !!raw.dead,
    xp: Math.floor(num(raw.xp, 0, 10_000_000, 0)),
    abs: num(raw.abs, 0, 20, 0),
  };
  // Fase 7 (encantamientos): semilla de encantamiento (entero de 32 bits).
  const es = Number(raw.es);
  if (Number.isInteger(es)) save.es = es | 0;
  // Fase 9 (libro de recetas): claves de 32 bits de las recetas desbloqueadas.
  if (Array.isArray(raw.rb)) save.rb = raw.rb.slice(0, 4096).map(Number).filter((n) => Number.isInteger(n)).map((n) => n | 0);
  if (Array.isArray(raw.fx)) {
    // Efectos activos: sólo los conocidos, con nivel y duración acotados.
    save.fx = raw.fx.slice(0, 16).flatMap((f) => {
      if (!Array.isArray(f)) return [];
      const [id, amp, secs] = f.map(Number);
      if (!EFFECTS[id] || !Number.isFinite(secs) || secs <= 0) return [];
      return [[id, Math.max(0, Math.min(MAX_EFFECT_AMP, amp | 0)), Math.min(MAX_EFFECT_SECONDS, Math.round(secs * 10) / 10)] as [number, number, number]];
    });
  }
  if (raw.off !== undefined) {
    const st = sanitizeStack(stackFromWire(raw.off));
    save.off = stackToWire(st);
  }
  if (Array.isArray(raw.armor)) {
    // Cada ranura sólo admite su pieza (cabeza, pecho, piernas, pies).
    save.armor = [0, 1, 2, 3].map((slot) => {
      const st = sanitizeStack(stackFromWire(raw.armor![slot]));
      return st && ITEMS[st.id]?.armor?.slot === slot ? stackToWire({ ...st, count: 1 }) : null; // Fase 7: con sus encantamientos
    });
  }
  if (Array.isArray(raw.pos) && raw.pos.length === 3 && raw.pos.map(Number).every(Number.isFinite)) {
    save.pos = [r2(Number(raw.pos[0])), r2(Number(raw.pos[1])), r2(Number(raw.pos[2]))];
  }
  if (Array.isArray(raw.rot) && raw.rot.length === 2 && raw.rot.map(Number).every(Number.isFinite)) {
    save.rot = [r2(Number(raw.rot[0])), r2(Number(raw.rot[1]))];
  }
  return save;
}
