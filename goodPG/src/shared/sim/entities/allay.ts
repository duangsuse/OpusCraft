// Fase 7.5 (mansión): comportamiento del alay en el servidor.
// - Con la mano llena, se le da el objeto (se queda con uno) y pasa a seguir a quien se lo dio; con la
//   mano vacía, lo devuelve (y suelta lo que había recogido) y se olvida del jugador.
// - Con un objeto, busca a 32 bloques los objetos tirados iguales (el mismo, y en las pociones y las
//   flechas con efecto, del mismo tipo), los recoge (hasta una pila) y se los lleva a su jugador, o al
//   bloque musical que oyó en los últimos 30 segundos; se los lanza al llegar y no vuelve a coger lo
//   que lanzó.
// - Junto a un tocadiscos que suena (a 10 bloques) baila; bailando, un fragmento de amatista lo duplica
//   (una vez cada 5 minutos, los dos).
// - Vuela, no desaparece nunca, recupera vida sola y su jugador no le hace daño. Al morir suelta lo que
//   lleva.
import { MOB_ALLAY, ALLAY_SEARCH, ALLAY_FOLLOW, ALLAY_NOTE_RANGE, ALLAY_NOTE_MEMORY, ALLAY_DUPLICATE_COOLDOWN,
  ALLAY_PICKUP_COOLDOWN, ALLAY_JUKEBOX_RANGE, EF_ALLAY_DANCING } from '../../allay';
import { ENT_ITEM, MOBS } from '../../mobs';
import { AMETHYST_SHARD, TIPPED_ARROW, maxStack, type ItemStack } from '../../items';
import { potionKind } from '../../potions';
import { sanitizeStack } from '../../containers';
import { lineOfSight } from '../physics';
import { flyToward, hover } from './flight';
import type { PlayerView, InteractResult, Entity } from './types';
import type { Entities } from './Entities';

interface AllayState {
  /** Lo que le dieron (una unidad) y lo que ha recogido. */
  held: ItemStack | null;
  inv: ItemStack | null;
  /** Jugador al que sirve (nombre en minúsculas). */
  liked: string | null;
  /** Bloque musical que oyó y segundos que lo recordará. */
  note: [number, number, number] | null;
  noteT: number;
  dancing: boolean;
  danceCheck: number;
  /** Esperas: para volver a duplicarse y para recoger después de lanzar. */
  dupCd: number;
  pickCd: number;
  /** Objeto tirado al que va (id de entidad) y cuándo vuelve a buscar. */
  target: number;
  search: number;
  regen: number;
  goal: [number, number, number] | null;
  goalT: number;
  anchor: [number, number, number] | null;
}

/** ¿Recoge el alay que lleva `held` el objeto `s`? (En las pociones y flechas con efecto cuenta el tipo.) */
export function allayWants(held: ItemStack, s: ItemStack): boolean {
  if (held.id !== s.id) return false;
  if (potionKind(s.id) || s.id === TIPPED_ARROW) return (held.dmg ?? 0) === (s.dmg ?? 0);
  return true;
}

export class AllayLife {
  private states = new WeakMap<Entity, AllayState>();
  /** Objetos que lanzó un alay (no los vuelve a coger ninguno). */
  private thrown = new WeakSet<Entity>();
  /** ¿Suena un tocadiscos a `r` bloques de (x, y, z)? (Lo pone el sistema de los alays del servidor.) */
  jukeboxNear: ((x: number, y: number, z: number, r: number) => boolean) | null = null;

  constructor(private m: Entities) {}

  state(e: Entity): AllayState {
    let s = this.states.get(e);
    if (!s) {
      s = {
        held: null, inv: null, liked: null, note: null, noteT: 0, dancing: false, danceCheck: 0, dupCd: 0, pickCd: 0,
        target: -1, search: 0, regen: 0, goal: null, goalT: 0, anchor: null,
      };
      this.states.set(e, s);
    }
    return s;
  }

  /** Al crearse: el alay no desaparece nunca (ni lejos de todos ni al llenarse el mundo de animales). */
  init(e: Entity): void {
    if (e.type === MOB_ALLAY) e.persist = true;
  }

  // ------------------------------------------------------------------ usar objetos

  /** Clic derecho con `stack` en la mano (null: la mano vacía) de `who` (su nombre). */
  interact(e: Entity, stack: ItemStack | null, creative: boolean, who: string): InteractResult | null {
    if (e.type !== MOB_ALLAY || e.dead) return null;
    const s = this.state(e);
    const m = this.m;
    // Bailando, el fragmento de amatista lo duplica.
    if (stack?.id === AMETHYST_SHARD && s.dancing && s.dupCd <= 0) {
      const twin = m.spawnMob(MOB_ALLAY, e.x, e.y, e.z);
      if (!twin) return { ok: false };
      s.dupCd = ALLAY_DUPLICATE_COOLDOWN;
      this.state(twin).dupCd = ALLAY_DUPLICATE_COOLDOWN;
      twin.vy = 2;
      m.host.fx('allay_dup', e.x, e.y + e.height, e.z);
      return { ok: true, take: creative ? 0 : 1 };
    }
    if (!s.held && stack) {
      const clean = sanitizeStack({ ...stack, count: 1 });
      if (!clean) return { ok: false };
      s.held = clean;
      s.liked = who.toLowerCase();
      s.pickCd = 0;
      e.gear = clean.id;
      m.host.fx('allay_give', e.x, e.y + e.height / 2, e.z);
      return { ok: true, take: creative ? 0 : 1 };
    }
    if (s.held && !stack) {
      const give = s.held;
      this.dropInventory(e, s);
      s.held = null;
      s.liked = null;
      e.gear = undefined;
      m.host.fx('allay_take', e.x, e.y + e.height / 2, e.z);
      return { ok: true, give };
    }
    return null;
  }

  /** Suena un bloque musical en (x, y, z): los alays con objeto a 16 bloques lo recuerdan 30 segundos. */
  heardNote(x: number, y: number, z: number): void {
    for (const e of this.m.list.values()) {
      if (e.type !== MOB_ALLAY || e.dead) continue;
      const s = this.state(e);
      if (!s.held || Math.hypot(e.x - x, e.y - y, e.z - z) > ALLAY_NOTE_RANGE) continue;
      s.note = [Math.floor(x), Math.floor(y), Math.floor(z)];
      s.noteT = ALLAY_NOTE_MEMORY;
    }
  }

  /** ¿No le hace daño este atacante? (Su jugador no puede herirlo.) */
  immune(e: Entity, attacker: string | number | null): boolean {
    if (e.type !== MOB_ALLAY || typeof attacker !== 'string') return false;
    const liked = this.states.get(e)?.liked;
    if (!liked) return false;
    return this.m.host.players().some((p) => p.id === attacker && p.name.toLowerCase() === liked);
  }

  /** Muere: suelta lo que le dieron y lo que había recogido. */
  onKilled(e: Entity): void {
    if (e.type !== MOB_ALLAY) return;
    const s = this.state(e);
    if (s.held) this.m.dropStacks([s.held], e.x, e.y + 0.3, e.z);
    s.held = null;
    this.dropInventory(e, s);
    e.gear = undefined;
  }

  private dropInventory(e: Entity, s: AllayState): void {
    if (s.inv) this.m.dropStacks([s.inv], e.x, e.y + 0.3, e.z);
    s.inv = null;
  }

  /** Bits de estado para los clientes. */
  flags(e: Entity): number {
    return this.states.get(e)?.dancing ? EF_ALLAY_DANCING : 0;
  }

  // ------------------------------------------------------------------ tick

  /** Tick propio del alay (true si era un alay: ya se movió). */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (e.type !== MOB_ALLAY) return false;
    const s = this.state(e);
    const def = MOBS[MOB_ALLAY];
    const w = this.m.w;
    e.fallStart = e.y; // no le hacen daño las caídas
    s.regen += dt;
    if (s.regen >= 0.5) {
      s.regen = 0;
      if (e.health < e.maxHealth) e.health = Math.min(e.maxHealth, e.health + 1);
    }
    s.dupCd = Math.max(0, s.dupCd - dt);
    s.pickCd = Math.max(0, s.pickCd - dt);
    if (s.noteT > 0 && (s.noteT -= dt) <= 0) s.note = null;
    s.danceCheck -= dt;
    if (s.danceCheck <= 0) {
      s.danceCheck = 1;
      s.dancing = !!this.jukeboxNear?.(e.x, e.y, e.z, ALLAY_JUKEBOX_RANGE);
    }
    if (!s.anchor) s.anchor = [e.x, e.y, e.z];
    const liked = s.liked ? players.find((p) => p.alive && p.name.toLowerCase() === s.liked && Math.hypot(p.x - e.x, p.z - e.z) < ALLAY_FOLLOW) : undefined;
    if (s.held) {
      // 1) Ir a por un objeto igual al suyo.
      const item = this.wantedItem(e, s, dt);
      if (item) {
        const d = flyToward(w, e, item.x, item.y + 0.3, item.z, def.run * 0.8, dt);
        if (d < 1.3) this.pickUp(e, s, item);
        return true;
      }
      // 2) Llevar lo recogido a su bloque musical o a su jugador.
      if (s.inv) {
        const to: [number, number, number] | null = s.note ? [s.note[0] + 0.5, s.note[1] + 1, s.note[2] + 0.5] : liked ? [liked.x, liked.y + 1, liked.z] : null;
        if (to) {
          const d = flyToward(w, e, to[0], to[1] + 1, to[2], def.run * 0.8, dt);
          if (d < 3.2) this.throwTo(e, s, to);
          return true;
        }
      }
      // 3) Quedarse cerca de su jugador.
      if (liked) {
        s.anchor = [liked.x, liked.y, liked.z];
        if (Math.hypot(liked.x - e.x, liked.z - e.z) > 3 || Math.abs(liked.y + 1.5 - e.y) > 3) {
          flyToward(w, e, liked.x, liked.y + 1.6, liked.z, def.walk * 1.3, dt);
          return true;
        }
      }
    }
    if (s.dancing) {
      hover(w, e, dt);
      e.yaw = e.bodyYaw = e.bodyYaw + dt * 4;
      return true;
    }
    this.wander(e, s, dt);
    return true;
  }

  /** Objeto tirado igual al suyo más cercano (a 32 bloques en horizontal y a la vista). */
  private wantedItem(e: Entity, s: AllayState, dt: number): Entity | null {
    if (s.pickCd > 0 || !s.held || (s.inv && s.inv.count >= maxStack(s.inv.id))) return null;
    const cur = s.target >= 0 ? this.m.list.get(s.target) : undefined;
    if (cur && !cur.dead && cur.stack && allayWants(s.held, cur.stack)) return cur;
    s.target = -1;
    s.search -= dt;
    if (s.search > 0) return null;
    s.search = 0.5;
    let best: Entity | null = null, bd = ALLAY_SEARCH;
    for (const o of this.m.list.values()) {
      if (o.type !== ENT_ITEM || o.dead || !o.stack || (o.pickupDelay ?? 0) > 0 || this.thrown.has(o)) continue;
      if (Math.abs(o.x - e.x) > ALLAY_SEARCH || Math.abs(o.y - e.y) > 16 || Math.abs(o.z - e.z) > ALLAY_SEARCH) continue;
      if (!allayWants(s.held, o.stack)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y, o.z - e.z);
      if (d >= bd || !lineOfSight(this.m.w, e.x, e.y + 0.4, e.z, o.x, o.y + 0.2, o.z)) continue;
      bd = d;
      best = o;
    }
    s.target = best ? best.id : -1;
    return best;
  }

  /** Recoge lo que quepa del objeto tirado (hasta una pila). */
  private pickUp(e: Entity, s: AllayState, item: Entity): void {
    const st = item.stack!;
    const have = s.inv?.count ?? 0;
    const n = Math.min(st.count, maxStack(st.id) - have);
    if (n <= 0) return;
    s.inv = s.inv ? { ...s.inv, count: have + n } : { ...st, count: n };
    if (n >= st.count) this.m.remove(item.id);
    else item.stack = { ...st, count: st.count - n };
    s.target = -1;
    this.m.host.fx('allay_pickup', e.x, e.y + 0.3, e.z);
  }

  /** Lanza lo recogido hacia (x, y, z) y no lo vuelve a coger. */
  private throwTo(e: Entity, s: AllayState, to: [number, number, number]): void {
    if (!s.inv) return;
    const dx = to[0] - e.x, dz = to[2] - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(4, d * 1.6);
    const it = this.m.spawnItem(s.inv, e.x, e.y + 0.2, e.z, (dx / d) * sp, 3, (dz / d) * sp, undefined, 0.25);
    this.thrown.add(it);
    s.inv = null;
    s.pickCd = ALLAY_PICKUP_COOLDOWN;
    this.m.host.fx('allay_throw', e.x, e.y + 0.3, e.z);
  }

  /**
   * Revolotear por su zona: vuela a un punto al azar que vea (así no intenta salir de una jaula o de una
   * celda), se queda un rato flotando y vuelve a empezar.
   */
  private wander(e: Entity, s: AllayState, dt: number): void {
    const w = this.m.w;
    if (!s.goal || s.goalT <= 0) {
      s.goal = this.m.rand() < 0.35 ? null : this.wanderPoint(e, s);
      s.goalT = 3 + this.m.rand() * 5;
    }
    s.goalT -= dt;
    if (!s.goal) {
      hover(w, e, dt);
      return;
    }
    const d = flyToward(w, e, s.goal[0], s.goal[1], s.goal[2], MOBS[MOB_ALLAY].walk * 0.6, dt);
    if (d < 0.6) s.goal = null;
  }

  /** Punto libre y a la vista, cerca de su zona (null si no encuentra ninguno). */
  private wanderPoint(e: Entity, s: AllayState): [number, number, number] | null {
    const w = this.m.w, r = this.m.rand;
    const [ax, , az] = s.anchor!;
    for (let k = 0; k < 8; k++) {
      const a = r() * Math.PI * 2, d = 1 + r() * 4;
      const x = ax + Math.cos(a) * d, y = e.y + (r() - 0.4) * 2.5, z = az + Math.sin(a) * d;
      const b = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)), up = w.getBlock(Math.floor(x), Math.floor(y + 0.6), Math.floor(z));
      if (b !== 0 || up !== 0) continue;
      if (lineOfSight(w, e.x, e.y + 0.3, e.z, x, y + 0.3, z)) return [x, y, z];
    }
    return null;
  }

  // ------------------------------------------------------------------ guardado

  save(e: Entity): { allay: { h?: ItemStack; i?: ItemStack; l?: string; d?: number } } | null {
    if (e.type !== MOB_ALLAY) return null;
    const s = this.states.get(e);
    if (!s) return { allay: {} };
    return {
      allay: {
        ...(s.held ? { h: s.held } : {}), ...(s.inv ? { i: s.inv } : {}), ...(s.liked ? { l: s.liked } : {}),
        ...(s.dupCd > 0 ? { d: Math.round(s.dupCd) } : {}),
      },
    };
  }

  restore(e: Entity, row: unknown[]): void {
    if (e.type !== MOB_ALLAY) return;
    const c = row.find((v) => !!v && typeof v === 'object' && !Array.isArray(v) && 'allay' in (v as object)) as { allay?: Record<string, unknown> } | undefined;
    const a = c?.allay;
    if (!a || typeof a !== 'object') return;
    const s = this.state(e);
    s.held = a.h ? sanitizeStack({ ...(a.h as ItemStack), count: 1 }) : null;
    s.inv = a.i ? sanitizeStack(a.i) : null;
    s.liked = s.held && typeof a.l === 'string' ? a.l.slice(0, 32).toLowerCase() : null;
    const d = Number(a.d);
    s.dupCd = Number.isFinite(d) ? Math.max(0, Math.min(ALLAY_DUPLICATE_COOLDOWN, d)) : 0;
    e.gear = s.held?.id;
  }
}
