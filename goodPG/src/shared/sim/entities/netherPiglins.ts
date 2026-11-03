// Fase 8.3 (criaturas del Nether): piglin, piglin bruto y piglin zombificado, como PiglinAi, PiglinBruteAi y
// ZombifiedPiglin de Java 26.3.
//
// Piglin (cerebro por actividades, en este orden de prioridad): ADMIRAR (el oro que coge o le dan: 119 ticks con
// él en la mano izquierda; si es un lingote, al acabar lanza el trueque hacia el jugador que vea), LUCHAR (a quien
// le enfada, al esqueleto wither y al jugador sin ninguna pieza de oro), HUIR (de los zombificados a menos de 6,
// de los hoglins si le superan en número; la cría, de quien le hiere), CELEBRAR (300 ticks tras matar a su
// presa; un 10 % baila si era un hoglin), MONTAR (las crías, en hoglins crías) y PASEAR (se aparta de las cosas de
// alma, caza hoglins cada 30–120 s, mira a quien lleva oro).
// Se enfada si le hieren (y avisa a los adultos cercanos), si abren delante suyo un cofre o rompen oro a menos
// de 16 bloques. Coge pepitas, oro, chuletas y equipo mejor; con ballesta guarda la distancia y dispara.
// Fuera del Nether, a los 300 ticks se convierte en piglin zombificado (con su equipo).
//
// Piglin bruto: ataca a cualquier jugador que vea (a 12 bloques) y al esqueleto wither, pasea cerca de donde
// apareció y sólo coge hachas de oro. Piglin zombificado: neutral; si le hieren se enfada 20–39 s, avisa a los
// suyos (y cada 4–6 s mientras ve a su presa) y corre algo más; lleva espada de oro.
import {
  MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_HOGLIN, MOB_WITHER_SKELETON, EF_PIGLIN_DANCING,
  PIGLIN_ADMIRE_TICKS, PIGLIN_ANGER_TICKS, PIGLIN_HUNT_WAIT, PIGLIN_ANGER_RANGE, REPELLENT_RANGE_H, REPELLENT_RANGE_V,
  isPiglin, isZombifiedType, isPiglinLoved, isBarterCurrency, isPiglinFood, isPiglinRepellentItem, isGoldArmor,
  isPiglinRepellentBlock, rollBarter, packGear, gearMain, gearOff, gearArmor, GOLD_ARMOR_PIECES,
} from '../../netherMobs';
import { MOBS, ENT_ITEM } from '../../mobs';
import { ITEMS, TOOLS, GOLD_NUGGET, CROSSBOW, CROSSBOW_CHARGED, LEATHER, BOOK, type ItemStack } from '../../items';
import { EF_ACTION } from '../../protocol';
import { applyEnchants } from '../../enchanting';
import { SOUL_SPEED, ENCHANTS } from '../../enchantments';
import { PT_FIRE_RESISTANCE, PT_WATER } from '../../potions';
import { DT, type NetherAI, type NState, type Tgt, type TargetId } from './netherMobs';
import type { Entity, InteractResult, PlayerView } from './types';

type Activity = 'idle' | 'fight' | 'avoid' | 'admire' | 'celebrate' | 'ride';

interface PiglinState {
  act: Activity;
  /** ANGRY_AT: con quién está enfadado (600 ticks desde el último motivo). */
  angry: TargetId | null;
  angryT: number;
  /** AVOID_TARGET: de quién huye y ticks. */
  avoid: TargetId | null;
  avoidT: number;
  /** Admirando (ticks), sin poder admirar (herido por un jugador, 400), sin ir a por el oro (200) y ticks intentándolo. */
  admire: number;
  admireOff: number;
  walkOff: number;
  tryReach: number;
  /** HUNTED_RECENTLY y ATE_RECENTLY (ticks). */
  hunted: number;
  ate: number;
  /** Celebración: ticks, dónde y si baila. */
  celebrate: number;
  celebrateAt: [number, number, number] | null;
  dance: boolean;
  /** Cría: hoglin (o piglin) cría al que se quiere subir, ticks del recuerdo y espera hasta volver a intentarlo. */
  ride: number | null;
  rideT: number;
  rideWait: number;
  /** Lo que vio en el último vistazo. */
  repellent: [number, number, number] | null;
  wanted: number | null;
  nemesis: number | null;
  huntable: number | null;
  babyHoglin: number | null;
  zombified: number | null;
  noGold: string | null;
  holdsLoved: string | null;
  anyPlayer: string | null;
  adultPiglins: number;
  adultHoglins: number;
  /** Ballesta: 0 descargada, 1 cargando (ticks en `cb`), 2 cargada (espera en `cbDelay`). */
  cbState: number;
  cb: number;
  cbDelay: number;
  /** Piglin bruto: donde apareció (su casa). */
  home: [number, number, number] | null;
  /** Piglin zombificado: primer gruñido de enfado, siguiente aviso a los suyos y fin del enfado (ticks). */
  zSound: number;
  zAlert: number;
  zAnger: number;
}

/** Tipos de voz (el cliente elige el sonido): los de PiglinAi.getSoundForActivity y los de las demás. */
export const PV_AMBIENT = 0;
export const PV_ANGRY = 1;
export const PV_RETREAT = 2;
export const PV_ADMIRING = 3;
export const PV_JEALOUS = 4;
export const PV_CELEBRATE = 5;

/** Velocidad del piglin (0,35; la cría un 20 % más). */
function baseSpeed(e: Entity): number {
  return (e.type === MOB_ZOMBIFIED_PIGLIN ? 0.23 : 0.35) * ((e.growAge ?? 0) > 0 ? (e.type === MOB_ZOMBIFIED_PIGLIN ? 1.5 : 1.2) : 1);
}

const range = (r: readonly [number, number], rand: () => number) => r[0] + Math.floor(rand() * (r[1] - r[0] + 1));

/** Daño extra del arma (el modificador de ataque de Java: el daño del objeto menos el de la mano). */
function weaponBonus(id: number): number {
  const t = ITEMS[id]?.tool;
  if (!t || (t.kind !== 'sword' && t.kind !== 'axe' && t.kind !== 'pickaxe' && t.kind !== 'shovel' && t.kind !== 'hoe')) return 0;
  return Math.max(0, (t.damage ?? 1) - 1);
}

export class PiglinAI {
  private states = new WeakMap<Entity, PiglinState>();

  constructor(private ai: NetherAI) {}

  private get m() {
    return this.ai.m;
  }

  pstate(e: Entity): PiglinState {
    let p = this.states.get(e);
    if (!p) {
      p = {
        act: 'idle', angry: null, angryT: 0, avoid: null, avoidT: 0, admire: 0, admireOff: 0, walkOff: 0, tryReach: -1, hunted: 0, ate: 0,
        celebrate: 0, celebrateAt: null, dance: false, ride: null, rideT: 0, rideWait: 200 + Math.floor(this.m.rand() * 600),
        repellent: null, wanted: null, nemesis: null, huntable: null, babyHoglin: null, zombified: null, noGold: null, holdsLoved: null,
        anyPlayer: null, adultPiglins: 0, adultHoglins: 0, cbState: 0, cb: 0, cbDelay: 0, home: null, zSound: 0, zAlert: 0, zAnger: 0,
      };
      this.states.set(e, p);
    }
    return p;
  }

  // ------------------------------------------------------------------ aparición

  finalizeSpawn(e: Entity, reason: string): void {
    const r = this.m.rand;
    const p = this.pstate(e);
    if (e.type === MOB_PIGLIN) {
      if (reason !== 'structure') {
        if (r() < 0.2) this.m.animals.setBaby(e, Infinity);
        else {
          // Ballesta (50 %) o espada de oro (la lanza de oro, una de cada diez, llega con las lanzas en la fase 9).
          e.gear = packGear(r() < 0.5 ? CROSSBOW : TOOLS.golden.sword, 0, 0);
        }
      }
      // Cada pieza de armadura de oro con un 10 %.
      if ((e.growAge ?? 0) <= 0) {
        let armor = 0;
        for (let i = 0; i < 4; i++) if (r() < 0.1) armor |= 1 << i;
        e.gear = packGear(gearMain(e.gear), 0, armor);
      }
      p.hunted = range(PIGLIN_HUNT_WAIT, r);
    } else if (e.type === MOB_PIGLIN_BRUTE) {
      e.gear = packGear(TOOLS.golden.axe, 0, 0);
      p.home = [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
    } else if (e.type === MOB_ZOMBIFIED_PIGLIN) {
      // Como el zombi: un 5 % cría (la lanza de oro, una de cada veinte, llega con las lanzas).
      if (reason !== 'jockey' && r() < 0.05) this.m.animals.setBaby(e, Infinity);
      e.gear = packGear(TOOLS.golden.sword, 0, 0);
    }
  }

  // ------------------------------------------------------------------ tick

  tick(e: Entity, s: NState, players: PlayerView[]): void {
    if (e.type === MOB_ZOMBIFIED_PIGLIN) {
      this.zombifiedTick(e, s, players);
      return;
    }
    const p = this.pstate(e);
    // Fuera del Nether se convierte (el piglin suelta antes lo que admira y su inventario).
    if (this.ai.zombify(e, s, MOB_ZOMBIFIED_PIGLIN, false, () => this.beforeConversion(e, p))) return;
    this.timers(p);
    if (s.sense === 20) this.sense(e, s, p, players);
    if (e.type === MOB_PIGLIN_BRUTE) {
      this.bruteTick(e, s, p, players);
      return;
    }
    this.core(e, s, p, players);
    const before = p.act;
    p.act = p.admire > 0 ? 'admire' : s.target !== null ? 'fight' : p.avoid !== null ? 'avoid' : p.celebrate > 0 ? 'celebrate' : p.ride !== null ? 'ride' : 'idle';
    if (p.act !== before) this.ai.voice(e, this.soundFor(e, s, p));
    if (p.act !== 'celebrate') p.dance = false;
    switch (p.act) {
      case 'admire':
        this.admireActivity(e, s, p);
        break;
      case 'fight':
        this.fight(e, s, p, players);
        break;
      case 'avoid':
        this.avoidActivity(e, s, p, players);
        break;
      case 'celebrate':
        this.celebrateActivity(e, s, p, players);
        break;
      case 'ride':
        this.rideActivity(e, s, p, players);
        break;
      default:
        this.idle(e, s, p, players);
    }
    this.pickUpNearby(e, s, p);
    // Sonido ambiente (sólo paseando, como AbstractPiglin.playAmbientSound).
    this.ai.ambient(e, s, () => (p.act === 'idle' ? this.soundFor(e, s, p) : -1));
  }

  private timers(p: PiglinState): void {
    if (p.angryT > 0 && --p.angryT === 0) p.angry = null;
    if (p.avoidT > 0 && --p.avoidT === 0) p.avoid = null;
    if (p.admire > 0) p.admire--;
    if (p.admireOff > 0) p.admireOff--;
    if (p.walkOff > 0) p.walkOff--;
    if (p.hunted > 0) p.hunted--;
    if (p.ate > 0) p.ate--;
    if (p.celebrate > 0 && --p.celebrate === 0) p.celebrateAt = null;
    if (p.rideT > 0 && --p.rideT === 0) p.ride = null;
    if (p.rideWait > 0) p.rideWait--;
  }

  /** PiglinSpecificSensor (cada 20 ticks): repelentes, némesis, hoglins, zombificados, jugadores y cuántos adultos ve. */
  private sense(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    p.repellent = this.ai.nearestBlock(e, REPELLENT_RANGE_H, REPELLENT_RANGE_V, isPiglinRepellentBlock);
    p.nemesis = p.huntable = p.babyHoglin = p.zombified = null;
    let piglins = 0, hoglins = 0;
    for (const o of s.seen) {
      const baby = (o.growAge ?? 0) > 0;
      if (o.type === MOB_HOGLIN) {
        if (baby) p.babyHoglin ??= o.id;
        else {
          hoglins++;
          if (p.huntable === null && this.ai.beasts.canBeHunted(o)) p.huntable = o.id;
        }
      } else if (o.type === MOB_PIGLIN_BRUTE) piglins++;
      else if (o.type === MOB_PIGLIN) {
        if (!baby) piglins++;
      } else if (o.type === MOB_WITHER_SKELETON) p.nemesis ??= o.id;
      else if (isZombifiedType(o.type)) p.zombified ??= o.id;
    }
    p.adultPiglins = piglins;
    p.adultHoglins = hoglins;
    p.noGold = s.players.find((q) => !this.wearsGold(q))?.id ?? null;
    p.holdsLoved = s.players.find((q) => isPiglinLoved(q.held ?? 0) || isPiglinLoved(q.offhand ?? 0))?.id ?? null;
    p.anyPlayer = s.players[0]?.id ?? players.find((q) => q.alive && Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z) < 16)?.id ?? null;
    p.wanted = this.nearestWantedItem(e, p);
  }

  /** ¿Lleva alguna pieza de armadura de oro? */
  private wearsGold(q: PlayerView): boolean {
    return (q.armor ?? []).some((id: number) => isGoldArmor(id));
  }

  // ------------------------------------------------------------------ comportamientos de base (CORE)

  private core(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    const baby = (e.growAge ?? 0) > 0;
    // La cría huye del esqueleto wither; todos, de los zombificados a menos de 6 bloques.
    if (baby && p.nemesis !== null && p.avoid === null) this.setAvoid(p, p.nemesis, range([100, 140], this.m.rand));
    if (this.nearZombified(e, p) && p.avoid === null) this.setAvoid(p, p.zombified!, range([100, 140], this.m.rand));
    // Deja de admirar: suelta (o lanza el trueque de) lo que tenía en la mano izquierda.
    if (p.admire === 0 && gearOff(e.gear)) this.stopHoldingOffhand(e, s, p, true, players);
    // Ve oro en el suelo: se pone a admirarlo (y va a por él).
    if (p.admire === 0 && p.admireOff === 0 && p.walkOff === 0 && p.wanted !== null) {
      const it = this.m.list.get(p.wanted);
      if (it?.stack && isPiglinLoved(it.stack.id)) p.admire = PIGLIN_ADMIRE_TICKS;
    }
    // Su presa murió: celebra (y quizá baila, si era un hoglin) y se le pasa el enfado.
    if (s.target !== null) {
      const t = this.targetEntity(s.target);
      if (t && t.dead) {
        p.celebrateAt = [t.x, t.y, t.z];
        p.celebrate = 300;
        if (t.type === MOB_HOGLIN) {
          p.dance = this.m.rand() < 0.1;
          p.hunted = range(PIGLIN_HUNT_WAIT, this.m.rand);
        }
        s.target = null;
      }
    }
    if (p.angry !== null && typeof p.angry === 'number') {
      const t = this.m.list.get(p.angry);
      if (!t || t.dead) p.angry = null;
    }
    void players;
  }

  private targetEntity(id: TargetId): Entity | undefined {
    return typeof id === 'number' ? this.m.list.get(id) : undefined;
  }

  private nearZombified(e: Entity, p: PiglinState): boolean {
    if (p.zombified === null) return false;
    const z = this.m.list.get(p.zombified);
    return !!z && !z.dead && Math.hypot(z.x - e.x, z.y - e.y, z.z - e.z) < 6;
  }

  private setAvoid(p: PiglinState, id: TargetId, ticks: number): void {
    p.avoid = id;
    p.avoidT = ticks;
  }

  // ------------------------------------------------------------------ objetivos

  /** PiglinAi.findNearestValidAttackTarget (el bruto, PiglinBruteAi: cualquier jugador que vea). */
  private nearestValidTarget(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): TargetId | null {
    if (e.type === MOB_PIGLIN && this.nearZombified(e, p)) return null;
    if (p.angry !== null) {
      const t = this.ai.resolve(p.angry, players);
      if (t && (!t.p || this.ai.attackable(e, t.p, 16))) return p.angry;
    }
    if (e.type === MOB_PIGLIN_BRUTE) return s.players[0]?.id ?? p.nemesis;
    if (p.nemesis !== null) return p.nemesis;
    if (p.noGold !== null) return p.noGold;
    return null;
  }

  /** Enfada al piglin con `target` (ANGRY_AT 600 ticks); si es un hoglin, no volverá a cazar hasta dentro de un rato. */
  setAngerTarget(e: Entity, target: TargetId): void {
    const p = this.pstate(e);
    p.angry = target;
    p.angryT = PIGLIN_ANGER_TICKS;
    if (typeof target === 'number' && this.m.list.get(target)?.type === MOB_HOGLIN && e.type === MOB_PIGLIN) p.hunted = range(PIGLIN_HUNT_WAIT, this.m.rand);
  }

  /** Piglins adultos (y brutos) a menos de 16 bloques: NEARBY_ADULT_PIGLINS. */
  private adultsNear(e: Entity): Entity[] {
    const out: Entity[] = [];
    for (const o of this.m.list.values()) {
      if (o === e || o.dead || !o.ai || !isPiglin(o.type) || (o.growAge ?? 0) > 0) continue;
      if (Math.abs(o.x - e.x) <= 16 && Math.abs(o.y - e.y) <= 16 && Math.abs(o.z - e.z) <= 16) out.push(o);
    }
    return out;
  }

  /** Avisa a los adultos cercanos (el más cercano de los dos objetivos gana; a los hoglins, sólo los que cazan). */
  private broadcastAnger(e: Entity, target: TargetId): void {
    const t = this.targetEntity(target);
    for (const o of this.adultsNear(e)) {
      if (t?.type === MOB_HOGLIN && (o.type !== MOB_PIGLIN || !this.ai.beasts.canBeHunted(t))) continue;
      const op = this.pstate(o);
      if (op.angry === null) this.setAngerTarget(o, target);
      else {
        const cur = this.ai.resolve(op.angry, this.m.host.players());
        const nt = this.ai.resolve(target, this.m.host.players());
        if (!cur || (nt && Math.hypot(nt.x - o.x, nt.z - o.z) < Math.hypot(cur.x - o.x, cur.z - o.z))) this.setAngerTarget(o, target);
      }
    }
  }

  /** PiglinAi.angerNearbyPiglins: el jugador abrió un cofre o rompió oro guardado por los piglins. */
  angerNearby(playerId: string, px: number, py: number, pz: number, onlyIfSeen: boolean): void {
    const players = this.m.host.players();
    const pl = players.find((q) => q.id === playerId);
    if (!pl || !pl.alive || pl.creative) return;
    for (const o of this.m.list.values()) {
      if (o.type !== MOB_PIGLIN || o.dead || !o.ai) continue;
      if (Math.abs(o.x - px) > PIGLIN_ANGER_RANGE || Math.abs(o.y - py) > PIGLIN_ANGER_RANGE || Math.abs(o.z - pz) > PIGLIN_ANGER_RANGE) continue;
      if (this.pstate(o).act !== 'idle') continue;
      if (onlyIfSeen && !this.ai.canSee(o, { id: playerId, x: pl.x, y: pl.y, z: pl.z, w: 0.6, h: 1.8, p: pl })) continue;
      this.setAngerTarget(o, playerId);
    }
  }

  // ------------------------------------------------------------------ actividades

  private idle(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    const adult = (e.growAge ?? 0) <= 0;
    // Empezar a atacar (sólo los adultos).
    if (adult) {
      const t = this.nearestValidTarget(e, s, p, players);
      if (t !== null) {
        s.target = t;
        s.targetT = -1;
        return;
      }
      // Caza de hoglins: si nadie de los suyos cazó hace poco.
      if (p.huntable !== null && p.angry === null && p.hunted === 0 && e.type === MOB_PIGLIN) {
        const others = s.seen.filter((o) => isPiglin(o.type) && (o.growAge ?? 0) <= 0);
        if (!others.some((o) => this.pstate(o).hunted > 0)) {
          this.setAngerTarget(e, p.huntable);
          this.broadcastAnger(e, p.huntable);
          for (const o of others) this.pstate(o).hunted = range(PIGLIN_HUNT_WAIT, this.m.rand);
          return;
        }
      }
    }
    // Se aparta de las cosas de alma.
    if (p.repellent && this.awayFromRepellent(e, s, p)) return;
    // La cría, de vez en cuando, se sube a un hoglin cría.
    if (!adult && p.babyHoglin !== null && p.rideWait === 0) {
      p.rideWait = range([200, 800], this.m.rand);
      p.ride = p.babyHoglin;
      p.rideT = range([200, 600], this.m.rand);
    }
    // Mira a quien lleva oro en la mano (a 14 bloques) y, si no, pasea.
    const lover = p.holdsLoved !== null ? this.ai.resolve(p.holdsLoved, players) : null;
    if (lover) {
      this.ai.lookAt(e, lover.x, lover.y + 1.62, lover.z);
      this.ai.walk(e, 0, 0, 0);
      return;
    }
    this.wander(e, s, players, 0.6);
  }

  /** RunOne de paseo: pasear (2), acercarse a otro piglin (2), ir hacia lo que mira (2) o quedarse quieto (1). */
  private wander(e: Entity, s: NState, players: PlayerView[], mod: number): void {
    const sp = baseSpeed(e) * mod;
    if (s.walk) {
      if (this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], sp, 1, { avoidFire: true }) || e.ai!.stuck > 60) s.walk = null;
      this.lookAround(e, s, players);
      return;
    }
    this.ai.walk(e, 0, 0, 0);
    this.lookAround(e, s, players);
    if (s.idle > 0) {
      s.idle--;
      return;
    }
    const r = this.m.rand() * 7;
    if (r < 2) s.walk = this.ai.landPos(e, 10, 7, { avoidFire: true });
    else if (r < 4) {
      const friend = s.seen.find((o) => o.type === MOB_PIGLIN && Math.hypot(o.x - e.x, o.z - e.z) < 8);
      if (friend) s.walk = [friend.x, friend.y, friend.z];
    } else if (r < 6) {
      const look = this.ai.resolve(s.look, players);
      if (look) s.walk = [look.x, look.y, look.z];
    }
    if (!s.walk) s.idle = 30 + Math.floor(this.m.rand() * 31);
  }

  /** Mira a un jugador, a un piglin o a cualquiera cercano (y a veces a nada). */
  private lookAround(e: Entity, s: NState, players: PlayerView[]): void {
    if (s.look === null && this.m.rand() < 1 / 40) {
      const r = this.m.rand();
      const near = (o: { x: number; z: number }) => Math.hypot(o.x - e.x, o.z - e.z) < 8;
      if (r < 0.25) s.look = s.players.find(near)?.id ?? null;
      else if (r < 0.5) s.look = s.seen.find((o) => o.type === MOB_PIGLIN && near(o))?.id ?? null;
      else if (r < 0.75) s.look = s.seen.find(near)?.id ?? null;
      if (s.look !== null) s.lookT = 40 + Math.floor(this.m.rand() * 40);
    }
    const t = this.ai.resolve(s.look, players);
    if (t) this.ai.lookAt(e, t.x, t.y + (t.p ? 1.62 : t.h * 0.85), t.z);
    else this.ai.relaxLook(e);
  }

  private awayFromRepellent(e: Entity, s: NState, p: PiglinState): boolean {
    const [rx, ry, rz] = p.repellent!;
    if (Math.hypot(rx + 0.5 - e.x, rz + 0.5 - e.z) > 8) return false;
    if (!s.walk || Math.hypot(s.walk[0] - rx, s.walk[2] - rz) < 8) s.walk = this.ai.awayPos(e, rx + 0.5, rz + 0.5, 16, 7, { avoidFire: true });
    if (!s.walk) return false;
    if (this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], baseSpeed(e), 1, { avoidFire: true })) s.walk = null;
    return true;
  }

  private fight(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    // Deja de atacar si ya no es su objetivo más válido o si tiene un zombificado cerca.
    const t = this.ai.resolve(s.target, players);
    if (!t || this.nearestValidTarget(e, s, p, players) !== s.target || this.nearZombified(e, p)) {
      s.target = null;
      p.cbState = p.cbState === 1 ? 0 : p.cbState;
      this.ai.walk(e, 0, 0, 0);
      return;
    }
    const main = gearMain(e.gear);
    const crossbow = main === CROSSBOW || main === CROSSBOW_CHARGED;
    const dist = Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z); // en 3D, como en Java
    const sees = this.ai.canSee(e, t);
    this.ai.lookAt(e, t.x, t.y + (t.p ? 1.62 : t.h * 0.85), t.z);
    if (crossbow) {
      // Con ballesta: retrocede si lo tiene a menos de 5 (a 0,75), se acerca si está a más de 8 o no lo ve.
      if (dist < 5 && sees) {
        const d = dist || 1;
        this.ai.walk(e, -(t.x - e.x) / d, -(t.z - e.z) / d, baseSpeed(e) * 0.75);
      } else if (dist > 8 || !sees) this.ai.goTo(e, t.x, t.y, t.z, baseSpeed(e), 1, { avoidFire: true }, true);
      else this.ai.walk(e, 0, 0, 0);
      this.ai.face(e, t.x, t.z);
      this.crossbow(e, t, p, sees);
      return;
    }
    // Cuerpo a cuerpo: se acerca y golpea cada 20 ticks.
    if (!this.ai.inReach(e, t) || !sees) this.ai.goTo(e, t.x, t.y, t.z, baseSpeed(e), 0.5, { avoidFire: true }, true);
    else {
      this.ai.walk(e, 0, 0, 0);
      this.ai.face(e, t.x, t.z);
      if (s.cool === 0) {
        s.cool = 20;
        this.meleeHit(e, t);
      }
    }
  }

  private meleeHit(e: Entity, t: Tgt): void {
    const dmg = MOBS[e.type].damage + weaponBonus(gearMain(e.gear));
    this.ai.hit(e, t, dmg, MOBS[e.type].key);
  }

  /** CrossbowAttack: carga 25 ticks, espera 20–39 y dispara a 1,6 con la imprecisión de la dificultad. */
  private crossbow(e: Entity, t: Tgt, p: PiglinState, sees: boolean): void {
    if (p.cbState === 0) {
      if (!sees) return;
      p.cbState = 1;
      p.cb = 0;
      this.m.host.fx('nether_crossbow', e.x, e.y + 1.4, e.z, 0);
    } else if (p.cbState === 1) {
      if (++p.cb >= 25) {
        p.cbState = 2;
        p.cbDelay = 20 + Math.floor(this.m.rand() * 20);
        e.gear = packGear(CROSSBOW_CHARGED, gearOff(e.gear), gearArmor(e.gear));
        this.m.host.fx('nether_crossbow', e.x, e.y + 1.4, e.z, 1);
      }
    } else if (--p.cbDelay <= 0 && sees) {
      this.shoot(e, t);
      p.cbState = 0;
      e.gear = packGear(CROSSBOW, gearOff(e.gear), gearArmor(e.gear));
    }
  }

  /** CrossbowAttackMob.shootCrossbowProjectile: apunta un poco por encima (0,2 por bloque) y dispara a 1,6. */
  private shoot(e: Entity, t: Tgt): void {
    const sx = e.x, sy = e.y + 1.79 - 0.1, sz = e.z;
    const dx = t.x - sx, dz = t.z - sz;
    const horiz = Math.hypot(dx, dz) || 1e-3;
    const dy = t.y + t.h / 3 - sy + horiz * 0.2;
    const len = Math.hypot(dx, dy, dz) || 1;
    const inacc = (14 - this.m.host.difficulty() * 4) * 0.0075;
    const g = () => (this.m.rand() + this.m.rand() + this.m.rand() - 1.5) * 0.5 * inacc;
    const v = 1.6 * 20;
    const ax = (dx / len + g()) * v, ay = (dy / len + g()) * v, az = (dz / len + g()) * v;
    this.m.spawnArrow(sx + (dx / horiz) * 0.5, sy, sz + (dz / horiz) * 0.5, ax, ay, az, e.id, 2);
    this.m.host.fx('nether_crossbow', sx, sy, sz, 2);
  }

  private avoidActivity(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    const t = this.ai.resolve(p.avoid, players);
    if (!t || this.wantsToStopFleeing(p, t)) {
      p.avoid = null;
      return;
    }
    if (Math.hypot(t.x - e.x, t.z - e.z) < 12) {
      if (!s.walk || Math.hypot(s.walk[0] - t.x, s.walk[2] - t.z) < 12) s.walk = this.ai.awayPos(e, t.x, t.z, 16, 7, { avoidFire: true });
      if (s.walk && this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], baseSpeed(e), 1, { avoidFire: true })) s.walk = null;
      if (!s.walk) this.ai.walk(e, 0, 0, 0);
    } else this.wander(e, s, players, 0.6);
  }

  /** PiglinAi.wantsToStopFleeing: de un hoglin, cuando ya no le superan; de un zombificado, cuando deja de verlo. */
  private wantsToStopFleeing(p: PiglinState, t: Tgt): boolean {
    if (t.e?.type === MOB_HOGLIN) return p.adultHoglins <= p.adultPiglins + 1;
    if (t.e && isZombifiedType(t.e.type)) return p.zombified !== t.e.id;
    return false;
  }

  private admireActivity(e: Entity, s: NState, p: PiglinState): void {
    const off = gearOff(e.gear);
    this.ai.walk(e, 0, 0, 0);
    if (off && isPiglinLoved(off)) {
      // Con el oro en la mano: quieto, mirándolo (la cabeza baja).
      e.pitch = 0.5;
      return;
    }
    // Aún no lo tiene: va a por él (a menos de 9); si está lejos o tarda más de 200 ticks, lo deja.
    const it = p.wanted !== null ? this.m.list.get(p.wanted) : undefined;
    if (!it || Math.hypot(it.x - e.x, it.y - e.y, it.z - e.z) > 9) {
      p.admire = 0;
      return;
    }
    if (p.tryReach < 0) p.tryReach = 0;
    else if (++p.tryReach > 200) {
      p.admire = 0;
      p.tryReach = -1;
      p.walkOff = 200;
      return;
    }
    this.ai.goTo(e, it.x, it.y, it.z, baseSpeed(e), 0.5, { avoidFire: true }, true);
    void s;
  }

  private celebrateActivity(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    if (p.repellent && this.awayFromRepellent(e, s, p)) return;
    if ((e.growAge ?? 0) <= 0) {
      const t = this.nearestValidTarget(e, s, p, players);
      if (t !== null) {
        s.target = t;
        return;
      }
    }
    const at = p.celebrateAt!;
    const d = Math.hypot(at[0] - e.x, at[2] - e.z);
    const near = p.dance ? 4 : 2;
    if (d > near) this.ai.goTo(e, at[0], at[1], at[2], baseSpeed(e) * (p.dance ? 0.6 : 1), near, { avoidFire: true });
    else this.wander(e, s, players, 0.6);
  }

  private rideActivity(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    const v = p.ride !== null ? this.m.list.get(p.ride) : undefined;
    if (!v || v.dead) {
      p.ride = null;
      if (e.mountId !== undefined) this.ai.dismount(e);
      return;
    }
    if (e.mountId === v.id) {
      // Se baja si la montura crece, muere o alguno de los dos recibe un golpe.
      if ((v.growAge ?? 0) <= 0 || s.hurtBy !== null || this.ai.state(v).hurtBy !== null) {
        this.ai.dismount(e);
        p.ride = null;
        return;
      }
      this.wander(e, s, players, 0.6);
      return;
    }
    if (Math.hypot(v.x - e.x, v.z - e.z) > 8) {
      p.ride = null;
      return;
    }
    // Se acerca (a 0,8) y se sube (sobre el piglin cría de más arriba si ya va alguno, hasta tres).
    if (this.ai.goTo(e, v.x, v.y, v.z, baseSpeed(e) * 0.8, 1, { avoidFire: true }, true)) {
      let top = v;
      for (let n = 1; n < 3; n++) {
        const up = this.ai.state(top).riders.map((id) => this.m.list.get(id)).find((r) => r && r.type === MOB_PIGLIN);
        if (!up) break;
        top = up;
      }
      if (this.ai.state(top).riders.length === 0) this.ai.mount(e, top);
      else p.ride = null;
    }
  }

  // ------------------------------------------------------------------ objetos

  /** Objeto del suelo que quiere coger (el más cercano que vea a menos de 32 bloques). */
  private nearestWantedItem(e: Entity, p: PiglinState): number | null {
    let best: number | null = null;
    let bd = 32 * 32;
    for (const it of this.m.list.values()) {
      if (it.type !== ENT_ITEM || !it.stack || (it.pickupDelay ?? 0) > 0.5) continue;
      const d2 = (it.x - e.x) ** 2 + (it.y - e.y) ** 2 + (it.z - e.z) ** 2;
      if (d2 >= bd || Math.abs(it.y - e.y) > 16) continue;
      if (!this.wantsToPickUp(e, p, it.stack)) continue;
      if (!this.ai.canSee(e, { id: it.id, x: it.x, y: it.y, z: it.z, w: 0.25, h: 0.25 })) continue;
      bd = d2;
      best = it.id;
    }
    return best;
  }

  /** PiglinAi.wantsToPickup (con el bruto, sólo hachas de oro). */
  private wantsToPickUp(e: Entity, p: PiglinState, st: ItemStack): boolean {
    const id = st.id;
    if (e.type === MOB_PIGLIN_BRUTE) return id === TOOLS.golden.axe && this.canReplace(e, id);
    const baby = (e.growAge ?? 0) > 0;
    if (baby && id === LEATHER) return false;
    if (isPiglinRepellentItem(id)) return false;
    if (p.admireOff > 0 && this.ai.state(e).target !== null) return false;
    const offLoved = isPiglinLoved(gearOff(e.gear));
    if (isBarterCurrency(id)) return !offLoved;
    const space = this.invRoom(e, st);
    if (id === GOLD_NUGGET) return space;
    if (isPiglinFood(id)) return p.ate === 0 && space;
    if (isPiglinLoved(id)) return !offLoved && space;
    return this.canReplace(e, id);
  }

  /** ¿Cambiaría lo que lleva por esto? (lo que adora o su arma preferida gana; si no, el mejor del mismo tipo). */
  private canReplace(e: Entity, id: number): boolean {
    const it = ITEMS[id];
    if (!it) return false;
    const armorSlot = it.armor?.slot;
    if (armorSlot !== undefined) {
      if (!isGoldArmor(id)) return false;
      return (gearArmor(e.gear) & (1 << armorSlot)) === 0;
    }
    const cur = gearMain(e.gear);
    const preferred = (x: number) => (e.growAge ?? 0) <= 0 && (x === CROSSBOW || x === CROSSBOW_CHARGED);
    const wanted = isPiglinLoved(id) || preferred(id);
    const curWanted = isPiglinLoved(cur) || preferred(cur);
    if (wanted && !curWanted) return true;
    if (!wanted && curWanted) return false;
    if (!it.tool) return false;
    if (!cur) return true;
    const ct = ITEMS[cur]?.tool;
    return !!ct && ct.kind === it.tool.kind && (it.tool.damage ?? 0) > (ct.damage ?? 0);
  }

  private invRoom(e: Entity, st: ItemStack): boolean {
    const inv = e.pinv ?? [];
    if (inv.length < 8) return true;
    const max = ITEMS[st.id]?.stack ?? 64;
    return inv.some((s) => s.id === st.id && s.count < max && !s.data && !s.dmg);
  }

  /** Mete en el inventario (8 huecos); lo que no cabe lo tira al suelo cerca. */
  private putInInventory(e: Entity, st: ItemStack): void {
    const inv = (e.pinv ??= []);
    let left = st.count;
    const max = ITEMS[st.id]?.stack ?? 64;
    if (!st.data && !st.dmg) {
      for (const s of inv) {
        if (s.id !== st.id || s.data || s.dmg || s.count >= max) continue;
        const n = Math.min(left, max - s.count);
        s.count += n;
        left -= n;
        if (left === 0) break;
      }
    }
    while (left > 0 && inv.length < 8) {
      const n = Math.min(left, max);
      inv.push({ ...st, count: n });
      left -= n;
    }
    if (left > 0) this.throwToRandom(e, [{ ...st, count: left }]);
  }

  private throwToRandom(e: Entity, stacks: ItemStack[]): void {
    const pos = this.ai.landPos(e, 4, 2) ?? [e.x, e.y, e.z];
    this.ai.throwItems(e, stacks, pos[0], pos[1], pos[2]);
  }

  /** Coge lo que tenga al alcance (Mob.aiStep: objetos a 1 bloque de su caja). */
  private pickUpNearby(e: Entity, s: NState, p: PiglinState): void {
    if (e.dead || (e.growAge ?? 0) > 0 && e.type === MOB_PIGLIN_BRUTE) return;
    for (const it of this.m.list.values()) {
      if (it.type !== ENT_ITEM || !it.stack || (it.pickupDelay ?? 0) > 0) continue;
      if (Math.abs(it.x - e.x) > e.width / 2 + 1 || Math.abs(it.z - e.z) > e.width / 2 + 1 || it.y < e.y - 0.5 || it.y > e.y + e.height + 0.5) continue;
      if (!this.wantsToPickUp(e, p, it.stack)) continue;
      this.pickUp(e, s, p, it);
      return;
    }
  }

  /** PiglinAi.pickUpItem: las pepitas enteras; lo demás, de una en una. */
  private pickUp(e: Entity, s: NState, p: PiglinState, it: Entity): void {
    const st = it.stack!;
    let taken: ItemStack;
    if (st.id === GOLD_NUGGET || e.type === MOB_PIGLIN_BRUTE) {
      taken = { ...st };
      this.m.remove(it.id, '');
    } else {
      taken = { ...st, count: 1 };
      if (st.count > 1) st.count--;
      else this.m.remove(it.id, '');
    }
    s.walk = null;
    this.m.host.fx('pickup_mob', e.x, e.y + 1, e.z);
    if (e.type === MOB_PIGLIN_BRUTE) {
      e.gear = packGear(taken.id, 0, 0);
      e.persist = true;
      return;
    }
    if (isPiglinLoved(taken.id)) {
      p.tryReach = -1;
      this.holdInOffhand(e, taken);
      p.admire = PIGLIN_ADMIRE_TICKS;
    } else if (isPiglinFood(taken.id) && p.ate === 0) {
      p.ate = 200;
    } else if (!this.equip(e, taken)) this.putInInventory(e, taken);
  }

  /** Lo pone en la mano izquierda (si ya llevaba algo, lo suelta); lo que no es el lingote lo hace persistente. */
  private holdInOffhand(e: Entity, st: ItemStack): void {
    const cur = gearOff(e.gear);
    if (cur) this.ai.drop(e, cur);
    e.gear = packGear(gearMain(e.gear), st.id, gearArmor(e.gear));
    if (!isBarterCurrency(st.id)) e.persist = true;
  }

  /** Se lo pone si es mejor que lo que lleva (armadura de oro o arma). */
  private equip(e: Entity, st: ItemStack): boolean {
    const it = ITEMS[st.id];
    if (!it || !this.canReplace(e, st.id)) return false;
    if (it.armor?.slot !== undefined) {
      e.gear = packGear(gearMain(e.gear), gearOff(e.gear), gearArmor(e.gear) | (1 << it.armor.slot));
      e.persist = true;
      return true;
    }
    if (it.tool) {
      const old = gearMain(e.gear);
      if (old) this.putInInventory(e, { id: old === CROSSBOW_CHARGED ? CROSSBOW : old, count: 1 });
      e.gear = packGear(st.id, gearOff(e.gear), gearArmor(e.gear));
      e.persist = true;
      return true;
    }
    return false;
  }

  /**
   * PiglinAi.stopHoldingOffHandItem: el adulto, si era un lingote (y comercia), lanza el trueque hacia el jugador
   * que vea; si no, se lo pone o lo guarda. La cría se lo queda en la mano.
   */
  private stopHoldingOffhand(e: Entity, s: NState, p: PiglinState, barter: boolean, players: PlayerView[]): void {
    const off = gearOff(e.gear);
    e.gear = packGear(gearMain(e.gear), 0, gearArmor(e.gear));
    if (!off) return;
    const st: ItemStack = { id: off, count: 1 };
    if ((e.growAge ?? 0) <= 0) {
      if (isBarterCurrency(off)) {
        if (barter) this.throwBarter(e, p, players);
      } else if (!this.equip(e, st)) this.putInInventory(e, st);
      return;
    }
    if (!this.equip(e, st)) {
      const main = gearMain(e.gear);
      if (main) {
        if (isPiglinLoved(main)) this.putInInventory(e, { id: main, count: 1 });
        else this.throwItemsTo(e, [{ id: main, count: 1 }], players);
      }
      e.gear = packGear(off, 0, gearArmor(e.gear));
    }
    void s;
  }

  /** Lanza hacia el jugador que vea (o a un sitio cercano al azar). */
  private throwItemsTo(e: Entity, stacks: ItemStack[], players: PlayerView[]): void {
    const p = this.pstate(e);
    const t = p.anyPlayer !== null ? players.find((q) => q.id === p.anyPlayer) : undefined;
    if (t) this.ai.throwItems(e, stacks, t.x, t.y, t.z);
    else this.throwToRandom(e, stacks);
    this.m.host.fx('nether_throw', e.x, e.y + 1.3, e.z, e.type);
  }

  /** Una tirada del trueque (loot_table/gameplay/piglin_bartering.json). */
  private throwBarter(e: Entity, p: PiglinState, players: PlayerView[]): void {
    const [entry, n] = rollBarter(this.m.rand);
    let st: ItemStack = { id: entry.id, count: n };
    if (entry.mod === 'soul_speed') st = applyEnchants({ id: entry.id, count: 1 }, [[SOUL_SPEED, 1 + Math.floor(this.m.rand() * ENCHANTS[SOUL_SPEED].max)]]);
    else if (entry.mod === 'fire_resistance') st = { id: entry.id, count: 1, dmg: PT_FIRE_RESISTANCE };
    else if (entry.mod === 'water') st = { id: entry.id, count: 1, dmg: PT_WATER };
    if (st.id === BOOK) st = applyEnchants(st, []);
    this.throwItemsTo(e, [st], players);
    void p;
  }

  /** Antes de convertirse: suelta lo que admira y su inventario (Piglin.finishConversion). */
  private beforeConversion(e: Entity, p: PiglinState): void {
    if (p.admire > 0 && gearOff(e.gear)) {
      this.ai.drop(e, gearOff(e.gear));
      e.gear = packGear(gearMain(e.gear), 0, gearArmor(e.gear));
    }
    for (const st of e.pinv ?? []) this.m.dropStacks([st], e.x, e.y + 0.3, e.z);
    e.pinv = undefined;
  }

  // ------------------------------------------------------------------ interacción

  /** Un jugador le da un lingote de oro (PiglinAi.mobInteract): lo coge y se pone a admirarlo. */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult | null {
    void creative;
    void who;
    if (e.type !== MOB_PIGLIN) return null;
    const p = this.pstate(e);
    if (p.admireOff > 0 || p.admire > 0 || (e.growAge ?? 0) > 0 || !isBarterCurrency(item)) return null;
    this.holdInOffhand(e, { id: item, count: 1 });
    p.admire = PIGLIN_ADMIRE_TICKS;
    this.ai.state(e).walk = null;
    this.ai.voice(e, PV_ADMIRING);
    return { ok: true, take: 1 };
  }

  // ------------------------------------------------------------------ daño y muerte

  onDamaged(e: Entity, s: NState, attacker: TargetId | null): void {
    if (e.type === MOB_ZOMBIFIED_PIGLIN) {
      this.zombifiedHurt(e, s, attacker);
      return;
    }
    if (attacker === null) return;
    const atk = typeof attacker === 'number' ? this.m.list.get(attacker) : undefined;
    if (atk && isPiglin(atk.type)) return;
    const p = this.pstate(e);
    const players = this.m.host.players();
    if (e.type === MOB_PIGLIN_BRUTE) {
      this.maybeRetaliate(e, s, p, attacker, players);
      return;
    }
    if (gearOff(e.gear)) this.stopHoldingOffhand(e, s, p, false, players);
    p.celebrate = 0;
    p.celebrateAt = null;
    p.dance = false;
    p.admire = 0;
    if (typeof attacker === 'string') p.admireOff = 400;
    if (p.avoid !== null) {
      const cur = this.ai.resolve(p.avoid, players);
      if (cur?.e?.type !== atk?.type || (typeof attacker === 'string') !== !!cur?.p) p.avoid = null;
    }
    if ((e.growAge ?? 0) > 0) {
      this.setAvoid(p, attacker, 100);
      this.broadcastAnger(e, attacker);
    } else if (atk?.type === MOB_HOGLIN && p.adultHoglins > p.adultPiglins + 1) {
      this.retreatFrom(e, s, p, attacker);
      for (const o of s.seen) if (o.type === MOB_PIGLIN && (o.growAge ?? 0) <= 0) this.retreatFrom(o, this.ai.state(o), this.pstate(o), attacker);
    } else this.maybeRetaliate(e, s, p, attacker, players);
  }

  /** Huye de un hoglin (y deja de cazar un rato). */
  private retreatFrom(e: Entity, s: NState, p: PiglinState, from: TargetId): void {
    p.angry = null;
    s.target = null;
    s.walk = null;
    this.setAvoid(p, from, range([100, 400], this.m.rand));
    p.hunted = range(PIGLIN_HUNT_WAIT, this.m.rand);
  }

  /** PiglinAi.maybeRetaliate: si no está huyendo, se enfada con quien le hirió y avisa a los adultos cercanos. */
  private maybeRetaliate(e: Entity, s: NState, p: PiglinState, attacker: TargetId, players: PlayerView[]): void {
    if (p.act === 'avoid') return;
    const t = this.ai.resolve(attacker, players);
    if (!t || (t.p && !this.ai.attackable(e, t.p, 64))) return;
    // Si ya ataca a alguien mucho más cerca (a 4 bloques de diferencia), no cambia.
    const cur = this.ai.resolve(s.target, players);
    if (cur && Math.hypot(t.x - e.x, t.z - e.z) > Math.hypot(cur.x - e.x, cur.z - e.z) + 4) return;
    this.setAngerTarget(e, attacker);
    this.broadcastAnger(e, attacker);
  }

  onKilled(e: Entity, killer: TargetId | null): void {
    void killer;
    // Lo que lleva en las manos y puesto: con Saqueo nivel L, un 8,5 % + 1 % por nivel cada pieza (lo que cogió, siempre).
    const chance = 0.085 + this.m.looting * 0.01;
    const main = gearMain(e.gear), off = gearOff(e.gear), armor = gearArmor(e.gear);
    const picked = !!e.persist;
    if (main && (picked || this.m.rand() < chance)) this.ai.drop(e, main === CROSSBOW_CHARGED ? CROSSBOW : main, 1, this.worn(main));
    if (off) this.ai.drop(e, off);
    for (let i = 0; i < 4; i++) if (armor & (1 << i) && (picked || this.m.rand() < chance)) this.ai.drop(e, GOLD_ARMOR_PIECES[i], 1, this.worn(GOLD_ARMOR_PIECES[i]));
    for (const st of e.pinv ?? []) this.m.dropStacks([st], e.x, e.y + 0.3, e.z);
    // Piglin zombificado muerto por un jugador: un 2,5 % (3,5 % + 1 % por nivel de Saqueo) suelta un lingote.
    if (e.type === MOB_ZOMBIFIED_PIGLIN && typeof killer === 'string') {
      const c = this.m.looting > 0 ? 0.035 + (this.m.looting - 1) * 0.01 : 0.025;
      if (this.m.rand() < c) this.ai.drop(e, ITEMS.find((it) => it?.key === 'gold_ingot')!.id);
    }
  }

  /** Desgaste al azar del equipo que suelta una criatura (Mob.dropCustomDeathLoot). */
  private worn(id: number): number | undefined {
    const max = ITEMS[id]?.tool?.durability ?? ITEMS[id]?.armor?.durability ?? 0;
    if (max <= 1) return undefined;
    const k = Math.max(0, max - 3 - Math.floor(this.m.rand() * Math.max(1, max - 3)));
    return Math.max(0, max - Math.max(1, k)) || undefined;
  }

  // ------------------------------------------------------------------ voces y bits

  /** PiglinAi.getSoundForActivity. */
  private soundFor(e: Entity, s: NState, p: PiglinState): number {
    if (e.type === MOB_PIGLIN_BRUTE) return s.target !== null ? PV_ANGRY : PV_AMBIENT;
    if (p.act === 'fight') return PV_ANGRY;
    if (s.zombify > 0) return PV_RETREAT;
    if (p.act === 'avoid') {
      const t = this.ai.resolve(p.avoid, this.m.host.players());
      if (t && Math.hypot(t.x - e.x, t.z - e.z) < 12) return PV_RETREAT;
    }
    if (p.act === 'admire') return PV_ADMIRING;
    if (p.act === 'celebrate') return PV_CELEBRATE;
    if (p.holdsLoved !== null) return PV_JEALOUS;
    return p.repellent ? PV_RETREAT : PV_AMBIENT;
  }

  flags(e: Entity, s: NState): number {
    if (e.type === MOB_ZOMBIFIED_PIGLIN) return 0;
    const p = this.pstate(e);
    let f = p.dance ? EF_PIGLIN_DANCING : 0;
    if (p.cbState === 1) f |= EF_ACTION;
    void s;
    return f;
  }

  // ------------------------------------------------------------------ piglin bruto

  private bruteTick(e: Entity, s: NState, p: PiglinState, players: PlayerView[]): void {
    p.home ??= [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
    if (p.angry !== null && typeof p.angry === 'number') {
      const t = this.m.list.get(p.angry);
      if (!t || t.dead) p.angry = null;
    }
    const before = s.target;
    if (s.target !== null) {
      const t = this.ai.resolve(s.target, players);
      if (!t || this.nearestValidTarget(e, s, p, players) !== s.target) s.target = null;
    }
    if (s.target === null) {
      const t = this.nearestValidTarget(e, s, p, players);
      if (t !== null) {
        s.target = t;
        s.targetT = -1;
      }
    }
    if (s.target !== before && s.target !== null) this.ai.voice(e, PV_ANGRY);
    if (s.target !== null && this.m.rand() < 0.0125) this.ai.voice(e, PV_ANGRY);
    const t = this.ai.resolve(s.target, players);
    if (t) {
      const sees = this.ai.canSee(e, t);
      this.ai.lookAt(e, t.x, t.y + (t.p ? 1.62 : t.h * 0.85), t.z);
      if (!this.ai.inReach(e, t) || !sees) this.ai.goTo(e, t.x, t.y, t.z, 0.35, 0.5, { avoidFire: true }, true);
      else {
        this.ai.walk(e, 0, 0, 0);
        this.ai.face(e, t.x, t.z);
        if (s.cool === 0) {
          s.cool = 20;
          this.meleeHit(e, t);
        }
      }
    } else {
      // Pasea sin alejarse de su casa: vuelve si está a más de 100 y ronda a 5 de ella.
      const h = p.home;
      if (!s.walk && s.idle <= 0 && this.m.rand() < 0.4) {
        const far = Math.hypot(h[0] - e.x, h[2] - e.z);
        if (far > 100 || this.m.rand() < 0.3) s.walk = [h[0] + 0.5 + (this.m.rand() - 0.5) * 10, h[1], h[2] + 0.5 + (this.m.rand() - 0.5) * 10];
      }
      this.wander(e, s, players, 0.6);
    }
    this.pickUpNearby(e, s, p);
    this.ai.ambient(e, s, () => (s.target === null ? PV_AMBIENT : -1));
  }

  // ------------------------------------------------------------------ piglin zombificado

  /** Un tick del piglin zombificado (Zombie + NeutralMob). */
  private zombifiedTick(e: Entity, s: NState, players: PlayerView[]): void {
    const p = this.pstate(e);
    if (p.zAnger > 0 && --p.zAnger === 0) s.target = null;
    let t = this.ai.resolve(s.target, players);
    if (!t) s.target = null;
    else if (t.p && !this.ai.attackable(e, t.p, 35)) {
      s.target = null;
      t = null;
    }
    const angry = s.target !== null;
    // El primer gruñido de enfado llega 0–1 s después.
    if (angry && p.zSound > 0 && --p.zSound === 0) this.ai.voice(e, PV_ANGRY);
    const sp = baseSpeed(e) + (angry && (e.growAge ?? 0) <= 0 ? 0.05 : 0);
    if (t) {
      // Avisa a los suyos cada 4–6 s si lo ve.
      if (p.zAlert > 0) p.zAlert--;
      else {
        if (this.ai.canSee(e, t)) this.alertOthers(e, s.target!);
        p.zAlert = 80 + Math.floor(this.m.rand() * 41);
      }
      this.ai.lookAt(e, t.x, t.y + (t.p ? 1.62 : t.h * 0.85), t.z);
      if (!this.ai.inReach(e, t)) this.ai.goTo(e, t.x, t.y, t.z, sp, 0.5, { avoidFire: false }, true);
      else {
        this.ai.walk(e, 0, 0, 0);
        this.ai.face(e, t.x, t.z);
        if (s.cool === 0 && this.ai.canSee(e, t)) {
          s.cool = 20;
          this.meleeHit(e, t);
        }
      }
    } else {
      // WaterAvoidingRandomStrollGoal: uno de cada 120 ticks elige un sitio a 10 bloques.
      if (s.walk) {
        if (this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], sp, 1) || e.ai!.stuck > 60) s.walk = null;
      } else {
        this.ai.walk(e, 0, 0, 0);
        if (this.m.rand() < 1 / 120) s.walk = this.ai.landPos(e, 10, 7);
      }
      this.lookAround(e, s, players);
    }
    this.ai.ambient(e, s, () => (angry ? PV_ANGRY : PV_AMBIENT));
  }

  /** HurtByTargetGoal (con aviso) y NeutralMob: se enfada 20–39 s con quien le hirió. */
  private zombifiedHurt(e: Entity, s: NState, attacker: TargetId | null): void {
    if (attacker === null) return;
    const atk = typeof attacker === 'number' ? this.m.list.get(attacker) : undefined;
    if (atk?.type === MOB_ZOMBIFIED_PIGLIN) return;
    this.setZombifiedTarget(e, s, attacker);
    this.alertOthers(e, attacker);
  }

  private setZombifiedTarget(e: Entity, s: NState, target: TargetId): void {
    const p = this.pstate(e);
    if (s.target === null) {
      p.zSound = 1 + Math.floor(this.m.rand() * 20);
      p.zAlert = 80 + Math.floor(this.m.rand() * 41);
    }
    s.target = target;
    s.targetT = -1;
    p.zAnger = 400 + Math.floor(this.m.rand() * 381);
  }

  /** Los demás zombificados a su alcance (16 en horizontal, 10 en vertical) sin objetivo se unen. */
  private alertOthers(e: Entity, target: TargetId): void {
    for (const o of this.m.list.values()) {
      if (o === e || o.type !== MOB_ZOMBIFIED_PIGLIN || o.dead || !o.ai) continue;
      if (Math.abs(o.x - e.x) > 16 || Math.abs(o.z - e.z) > 16 || Math.abs(o.y - e.y) > 10) continue;
      const os = this.ai.state(o);
      if (os.target === null) this.setZombifiedTarget(o, os, target);
    }
  }
}
