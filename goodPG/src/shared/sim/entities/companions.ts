// Fase 6 (gólems/domesticar): punto de entrada de los gólems y de los animales domesticados en el
// gestor de entidades. Reparte la decisión de cada tick entre GolemBrain y Tameable, reacciona a los
// golpes (quién es el enemigo de cada uno), aporta los bits de estado y guarda/restaura su estado.
// También tiene la persecución y el golpe cuerpo a cuerpo contra criaturas o jugadores, que usan
// tanto los gólems de hierro como los lobos.
import { canMeleeHit } from './meleeReach'; // alcance y línea de visión de Java
import { MOBS, MOB_WOLF, MOB_CAT, MOB_CREEPER, MOB_IRON_GOLEM, MOB_SNOW_GOLEM } from '../../mobs';
import { EF_TAMED, EF_SITTING, EF_ANGRY, EF_ACTION } from '../../protocol';
import { isGolem, isTameable, variantBits, CAT_SKINS } from '../../companions';
import type { PlayerView, InteractResult, Entity } from './types';
import type { Entities } from './Entities';
import { GolemBrain } from './golemBrain';
import { isFeline } from './critters'; // Fase 7.5 (fauna): los ocelotes también asustan a los creepers
import { Tameable } from './tameable';

/** Enemigo resuelto: una criatura o un jugador, con su posición y tamaño. */
export interface Foe {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  entity?: Entity;
  player?: PlayerView;
}

/** Distancia a la que un gato asusta a un creeper. */
const CAT_SCARE = 6;

export class Companions {
  readonly golems: GolemBrain;
  readonly pets: Tameable;

  constructor(readonly m: Entities) {
    this.golems = new GolemBrain(m, this);
    this.pets = new Tameable(m, this);
  }

  /** ¿Lo gobierna este módulo en vez del cerebro normal? (gólems y animales domesticados). */
  controls(e: Entity): boolean {
    return isGolem(e.type) || (isTameable(e.type) && !!e.tamedBy);
  }

  /** No se reciclan por estar lejos (gólems, gatos y domesticados). */
  keep(e: Entity): boolean {
    return isGolem(e.type) || e.type === MOB_CAT || !!e.tamedBy;
  }

  /**
   * Decisión del tick. Devuelve true si deja en ai.goalDir (y ai.lookAt) lo que hay que hacer; false
   * para que la criatura se comporte como un animal normal (pasear, huir).
   */
  decide(e: Entity, players: PlayerView[], dt: number): boolean {
    if (e.type === MOB_CAT && e.variant === undefined) e.variant = Math.floor(this.m.rand() * CAT_SKINS.length);
    if (e.type === MOB_IRON_GOLEM) return this.golems.iron(e, players, dt);
    if (e.type === MOB_SNOW_GOLEM) return this.golems.snow(e, players, dt);
    if (isTameable(e.type)) return this.pets.decide(e, players, dt);
    return false;
  }

  /** Olvida el enfado y el miedo del cerebro normal (los gólems y los lobos domesticados no huyen). */
  calm(e: Entity, keepPanic = false): void {
    const ai = e.ai!;
    ai.angry = 0;
    ai.target = null;
    if (!keepPanic) ai.panic = 0;
    ai.lookAt = null;
  }

  // ------------------------------------------------------------------ golpes

  /** Una criatura recibe daño: los gólems y los lobos domesticados se vuelven contra quien les pegó. */
  onHurt(e: Entity, attacker: string | number | null): void {
    if (!this.controls(e)) return;
    const ai = e.ai!;
    if (e.type === MOB_IRON_GOLEM) {
      // Resistencia total al empuje.
      e.vx = 0;
      e.vz = 0;
      if (e.vy > 0) e.vy = 0;
    }
    if (e.tamedBy) e.sitting = false;
    if (e.type === MOB_CAT) return; // los gatos huyen (el pánico lo pone Entities.damage)
    ai.panic = 0;
    ai.angry = 0;
    ai.target = null;
    if (attacker === null) return;
    if (typeof attacker === 'string') {
      if (e.tamedBy && this.nameOf(attacker) === e.tamedBy) return; // su dueño
      e.foe = attacker;
      return;
    }
    const src = this.m.list.get(attacker);
    if (src && src !== e && !this.sameSide(e, src)) e.foe = attacker;
  }

  /** Un jugador golpea a una criatura: sus lobos le ayudan. */
  onPlayerAttack(playerId: string, victim: Entity): void {
    const name = this.nameOf(playerId);
    if (!name || victim.type === MOB_CREEPER || victim.tamedBy === name) return;
    for (const o of this.m.list.values()) {
      if (o === victim || o.type !== MOB_WOLF || o.tamedBy !== name || o.sitting || o.dead) continue;
      if (Math.hypot(o.x - victim.x, o.z - victim.z) < 24) o.foe = victim.id;
    }
  }

  /** Una criatura hiere a un jugador: los lobos de ese jugador la atacan. */
  onPlayerHurtBy(playerId: string, mob: Entity): void {
    const name = this.nameOf(playerId);
    if (!name || mob.type === MOB_CREEPER || mob.tamedBy === name) return;
    for (const o of this.m.list.values()) {
      if (o === mob || o.type !== MOB_WOLF || o.tamedBy !== name || o.sitting || o.dead) continue;
      if (Math.hypot(o.x - mob.x, o.z - mob.z) < 24) o.foe = mob.id;
    }
  }

  /** ¿Están del mismo lado? (gólems entre sí, animales del mismo dueño, un gólem y un domesticado). */
  sameSide(a: Entity, b: Entity): boolean {
    const friendly = (e: Entity) => isGolem(e.type) || !!e.tamedBy;
    if (a.tamedBy && b.tamedBy) return a.tamedBy === b.tamedBy;
    return friendly(a) && friendly(b);
  }

  nameOf(playerId: string): string | null {
    const p = this.m.host.players().find((q) => q.id === playerId);
    return p ? p.name.toLowerCase() : null;
  }

  // ------------------------------------------------------------------ persecución y ataque

  /** Enemigo actual de `e` si sigue vivo y a menos de `max` bloques (si no, lo olvida). */
  resolveFoe(e: Entity, players: PlayerView[], max: number): Foe | null {
    const f = e.foe;
    if (f === undefined) return null;
    let foe: Foe | null = null;
    if (typeof f === 'number') {
      const o = this.m.list.get(f);
      if (o && o.ai && !o.dead && o !== e) foe = { x: o.x, y: o.y, z: o.z, width: o.width, height: o.height, entity: o };
    } else {
      const p = players.find((q) => q.id === f && q.alive && !q.creative);
      if (p) foe = { x: p.x, y: p.y, z: p.z, width: 0.6, height: 1.8, player: p };
    }
    if (!foe || Math.hypot(foe.x - e.x, foe.y - e.y, foe.z - e.z) > max) {
      e.foe = undefined;
      return null;
    }
    return foe;
  }

  /** Perseguir al enemigo y golpearlo al alcanzarlo (deja la dirección en ai.goalDir). */
  chaseAndHit(e: Entity, foe: Foe, dt: number, speed: number, damage: number, cooldown: number, launch: number): void {
    const ai = e.ai!;
    const dx = foe.x - e.x, dz = foe.z - e.z;
    const dist = Math.hypot(dx, dz);
    ai.lookAt = [foe.x, foe.y + foe.height * 0.8, foe.z];
    const reach = (e.width + foe.width) / 2 + 0.8;
    if (dist > reach * 0.7) {
      const [mx, mz, jump] = this.m.mobs.followPath(e, viewAt(foe.x, foe.y, foe.z), dt);
      ai.goalDir = [mx, mz, speed, jump ? 1 : 0];
    } else ai.goalDir = [0, 0, 0, 0];
    if (ai.attackCd <= 0 && canMeleeHit(this.m.w, e, foe.x, foe.y, foe.z, foe.width, foe.height, foe.player ? 1.62 : foe.height * 0.85)) {
      ai.attackCd = cooldown;
      this.strike(e, foe, damage, launch);
    }
  }

  /** Golpe cuerpo a cuerpo; `launch` > 0 lanza a la víctima hacia arriba con esa velocidad. */
  strike(e: Entity, foe: Foe, damage: number, launch: number): void {
    const dx = foe.x - e.x, dz = foe.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    if (foe.entity) {
      const died = this.m.damage(foe.entity, damage, e.x, e.z, e.id, 1);
      if (!died && launch > 0) foe.entity.vy = launch;
    } else if (foe.player) {
      this.m.host.hurtPlayer(foe.player.id, damage * this.m.difficultyScale(), (dx / d) * 5, launch > 0 ? launch : 4, (dz / d) * 5, MOBS[e.type].key, e); // Fase 7: e (Espinas)
    }
    this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
  }

  // ------------------------------------------------------------------ otros

  /** Los creepers huyen de los gatos: pone al creeper en pánico si hay uno cerca. */
  scaredOfCat(creeper: Entity): boolean {
    for (const o of this.m.list.values()) {
      if (!isFeline(o.type) || o.dead) continue;
      if (Math.abs(o.x - creeper.x) > CAT_SCARE || Math.abs(o.z - creeper.z) > CAT_SCARE) continue;
      if (Math.hypot(o.x - creeper.x, o.y - creeper.y, o.z - creeper.z) > CAT_SCARE) continue;
      const ai = creeper.ai!;
      ai.panic = Math.max(ai.panic, 1.5);
      ai.panicFrom = [o.x, o.z];
      ai.fuse = 0;
      return true;
    }
    return false;
  }

  /** Clic derecho con un objeto (null: no es cosa de este módulo). */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult | null {
    if (e.type === MOB_IRON_GOLEM) return this.golems.interact(e, item, creative);
    if (isTameable(e.type)) return this.pets.interact(e, item, creative, who);
    return null;
  }

  /** Bits de estado propios (se suman a los de MobBrain.updateFlags). */
  flags(e: Entity): number {
    let f = 0;
    if (e.tamedBy) f |= EF_TAMED;
    if (e.sitting) f |= EF_SITTING;
    if (e.variant) f |= variantBits(e.variant);
    const ai = e.ai;
    if (!ai) return f;
    if (e.foe !== undefined && e.type === MOB_WOLF) f |= EF_ANGRY;
    if (e.type === MOB_IRON_GOLEM && ai.attackCd > 0.75) f |= EF_ACTION;
    if (e.type === MOB_SNOW_GOLEM && ai.shootCd > 0.75) f |= EF_ACTION;
    return f;
  }

  // ------------------------------------------------------------------ persistencia

  /** Datos extra para guardar: [dueño, sentado, piel, hecho por un jugador] o null si no hay. */
  save(e: Entity): (string | number)[] | null {
    if (!isGolem(e.type) && !isTameable(e.type)) return null;
    if (!e.tamedBy && !e.sitting && !e.variant && !e.playerMade) return null;
    return [e.tamedBy ?? '', e.sitting ? 1 : 0, e.variant ?? 0, e.playerMade ? 1 : 0];
  }

  restore(e: Entity, extra: unknown): void {
    if (!Array.isArray(extra)) return;
    const [owner, sitting, variant, made] = extra as unknown[];
    if (typeof owner === 'string' && owner && isTameable(e.type)) this.pets.makeTamed(e, owner);
    if (sitting === 1 && e.tamedBy) e.sitting = true;
    if (Number.isInteger(variant) && (variant as number) >= 0 && (variant as number) < 8) e.variant = variant as number;
    if (made === 1) e.playerMade = true;
  }
}

/** Posición con forma de jugador (lo que pide MobBrain.followPath). */
export function viewAt(x: number, y: number, z: number): PlayerView {
  return { id: '', name: '', x, y, z, alive: true, creative: false, lookingAt: -1 };
}
