// Efectos de estado del jugador (los lleva el cliente, como la vida y el hambre): duración y nivel de
// cada uno, sus reglas por tick (curar, envenenar, dar hambre) y lo que cambian en movimiento,
// daño, fuego, aire y visión. Se guardan con el jugador.
import {
  EFFECTS, EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_STRENGTH, EFFECT_WEAKNESS, EFFECT_REGENERATION, EFFECT_POISON,
  EFFECT_HUNGER, EFFECT_FIRE_RESISTANCE, EFFECT_NIGHT_VISION, EFFECT_WATER_BREATHING, EFFECT_ABSORPTION,
  MAX_EFFECT_AMP, MAX_EFFECT_SECONDS, speedMultiplier, meleeBonus, regenInterval, poisonInterval, hungerExhaustion,
} from '../../shared/effects';
import { EFFECT_CONDUIT_POWER } from '../../shared/effects'; // Fase 6.5 (equipo)
// Fase 7 (pociones): curación y daño instantáneos, supersalto, caída lenta, invisibilidad y el color de
// los remolinos.
import {
  EFFECT_INSTANT_HEALTH, EFFECT_INSTANT_DAMAGE, EFFECT_JUMP_BOOST, EFFECT_SLOW_FALLING, EFFECT_INVISIBILITY, instantHeal,
  instantHarm, mixEffectColor,
} from '../../shared/effects';
// Fase 7 (efectos): Prisa, Fatiga minera, Náuseas, Ceguera, Saturación, Brillo, Gracia del delfín, Salud
// mejorada, Oscuridad, Marchitamiento y Levitación.
import {
  EFFECT_HASTE, EFFECT_MINING_FATIGUE, EFFECT_NAUSEA, EFFECT_BLINDNESS, EFFECT_SATURATION, EFFECT_GLOWING, EFFECT_DOLPHINS_GRACE,
  EFFECT_HEALTH_BOOST, EFFECT_DARKNESS, EFFECT_WITHER, EFFECT_LEVITATION, SATURATION_TICK, miningSpeedFactor, attackSpeedFactor,
  witherInterval, maxHealthWith,
} from '../../shared/effects';

export interface ActiveEffect {
  /** Nivel (0 = I). */
  amp: number;
  /** Segundos restantes. */
  time: number;
  /** Duración total (para el parpadeo del icono al acabarse). */
  total: number;
  /** Acumulador del efecto periódico (regeneración, veneno). */
  acc: number;
}

/** Lo que los efectos necesitan de la supervivencia. */
export interface EffectTarget {
  health: number;
  heal(n: number): void;
  damage(amount: number, cause: string, bypass?: boolean): number;
  addExhaustion(n: number): void;
  /** Corazones dorados (absorción). */
  absorption: number;
  /** Fase 7 (efectos): comer sin comida (Saturación) y la vida máxima (Salud mejorada). */
  eat?(hunger: number, saturation: number): void;
  maxHealth?: number;
}

export class StatusEffects {
  readonly list = new Map<number, ActiveEffect>();
  /** Aumenta con cada cambio (para guardar y refrescar el HUD). */
  version = 0;

  /**
   * Da un efecto como Minecraft: si ya lo tiene, gana el de más nivel; con el mismo nivel, el que
   * dura más.
   */
  add(id: number, seconds: number, amp: number, target?: EffectTarget): void {
    // Fase 7 (pociones): los instantáneos se aplican ya (`seconds` es su fuerza, 0..1).
    if (EFFECTS[id]?.instant) {
      if (target) this.instant(id, seconds, amp, target);
      return;
    }
    if (!EFFECTS[id] || !(seconds > 0)) return;
    amp = Math.max(0, Math.min(MAX_EFFECT_AMP, amp | 0));
    seconds = Math.min(MAX_EFFECT_SECONDS, seconds);
    const cur = this.list.get(id);
    if (cur && (cur.amp > amp || (cur.amp === amp && cur.time >= seconds))) return;
    this.list.set(id, { amp, time: seconds, total: seconds, acc: 0 });
    // Absorción: corazones dorados (2 por nivel) que se gastan antes que la vida.
    if (id === EFFECT_ABSORPTION && target) target.absorption = Math.max(target.absorption, 4 * (amp + 1));
    this.version++;
  }

  remove(id: number, target?: EffectTarget): void {
    if (!this.list.delete(id)) return;
    if (id === EFFECT_ABSORPTION && target) target.absorption = 0;
    this.version++;
  }

  /** Quita todos (leche, muerte). */
  clear(target?: EffectTarget): void {
    if (this.list.size === 0) return;
    this.list.clear();
    if (target) target.absorption = 0;
    this.version++;
  }

  /** Nivel del efecto (0 = I) o −1 si no lo tiene. */
  amp(id: number): number {
    return this.list.get(id)?.amp ?? -1;
  }

  has(id: number): boolean {
    return this.list.has(id);
  }

  /** Multiplicador de la velocidad al andar (Velocidad y Lentitud). */
  get speed(): number {
    return speedMultiplier(this.amp(EFFECT_SPEED), this.amp(EFFECT_SLOWNESS));
  }

  /** Daño extra cuerpo a cuerpo (Fuerza y Debilidad). */
  get melee(): number {
    return meleeBonus(this.amp(EFFECT_STRENGTH), this.amp(EFFECT_WEAKNESS));
  }

  get fireResistant(): boolean {
    return this.has(EFFECT_FIRE_RESISTANCE);
  }

  get waterBreathing(): boolean {
    return this.has(EFFECT_WATER_BREATHING) || this.has(EFFECT_CONDUIT_POWER); // Fase 6.5 (equipo): conducto
  }

  /** Fase 7 (pociones): curación o daño instantáneos (4 y 6 de vida, el doble por nivel; el daño es magia). */
  instant(id: number, strength: number, amp: number, target: EffectTarget): void {
    const k = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 1;
    if (id === EFFECT_INSTANT_HEALTH) {
      const n = Math.round(instantHeal(Math.max(0, amp | 0)) * k);
      if (n > 0) target.heal(n);
    } else if (id === EFFECT_INSTANT_DAMAGE) {
      const n = Math.round(instantHarm(Math.max(0, amp | 0)) * k);
      if (n > 0) target.damage(n, 'magic', true);
    }
  }

  /** Fase 7 (pociones): nivel de Supersalto (−1 sin él). */
  get jumpAmp(): number {
    return this.amp(EFFECT_JUMP_BOOST);
  }

  get slowFalling(): boolean {
    return this.has(EFFECT_SLOW_FALLING);
  }

  get invisible(): boolean {
    return this.has(EFFECT_INVISIBILITY);
  }

  // ---------------------------------------------------------------- Fase 7 (efectos)

  /** Multiplicador de la velocidad de minado (Prisa o el Poder del conducto, y Fatiga minera). */
  get miningSpeed(): number {
    return miningSpeedFactor(Math.max(this.amp(EFFECT_HASTE), this.amp(EFFECT_CONDUIT_POWER)), this.amp(EFFECT_MINING_FATIGUE));
  }

  /** Multiplicador de la velocidad de ataque (Prisa y Fatiga minera). */
  get attackSpeed(): number {
    return attackSpeedFactor(this.amp(EFFECT_HASTE), this.amp(EFFECT_MINING_FATIGUE));
  }

  /** Vida máxima (Salud mejorada). */
  get maxHealth(): number {
    return maxHealthWith(this.amp(EFFECT_HEALTH_BOOST));
  }

  /** Ciego: niebla negra cerca, sin correr ni críticos. */
  get blind(): boolean {
    return this.has(EFFECT_BLINDNESS);
  }

  /**
   * Cuánto se cierra la vista (0..1) con la Ceguera: se abre en el último segundo y, al empezar, se
   * cierra en uno (como en Minecraft).
   */
  get blindness(): number {
    const e = this.list.get(EFFECT_BLINDNESS);
    return e ? Math.max(0, Math.min(1, e.time, e.total - e.time)) : 0;
  }

  /** Oscuridad (0..1; entra y sale en un segundo). */
  get darkness(): number {
    const e = this.list.get(EFFECT_DARKNESS);
    return e ? Math.max(0, Math.min(1, e.time, e.total - e.time)) : 0;
  }

  /** Náuseas: sólo retuercen la vista mientras les quedan más de 3 s (como en Minecraft). */
  get nauseous(): boolean {
    return (this.list.get(EFFECT_NAUSEA)?.time ?? 0) > 3;
  }

  get glowing(): boolean {
    return this.has(EFFECT_GLOWING);
  }

  get dolphinsGrace(): boolean {
    return this.has(EFFECT_DOLPHINS_GRACE);
  }

  /** Nivel de Levitación (−1 sin ella). */
  get levitation(): number {
    return this.amp(EFFECT_LEVITATION);
  }

  /** Fase 7 (pociones): color de los remolinos (mezcla de los efectos; null sin efectos). */
  get swirlColor(): [number, number, number] | null {
    return mixEffectColor([...this.list].map(([id, e]) => [id, e.amp] as const));
  }

  /** Visión nocturna (0..1; parpadea los últimos 10 s como en Minecraft). */
  get nightVision(): number {
    const e = this.list.get(EFFECT_NIGHT_VISION);
    if (!e) return this.has(EFFECT_CONDUIT_POWER) ? 1 : 0; // Fase 6.5 (equipo): el conducto (sólo se da en el agua)
    if (e.time > 10) return 1;
    return 0.7 + 0.3 * Math.sin(e.time * 20 * Math.PI * 0.2);
  }

  /** Avanza el tiempo: curar, envenenar, dar hambre y retirar lo que se acaba. */
  tick(dt: number, target: EffectTarget): void {
    if (this.list.size === 0) return;
    for (const [id, e] of this.list) {
      e.time -= dt;
      if (id === EFFECT_REGENERATION) {
        e.acc += dt;
        const iv = regenInterval(e.amp);
        while (e.acc >= iv) {
          e.acc -= iv;
          if (target.health < (target.maxHealth ?? 20)) target.heal(1);
        }
      } else if (id === EFFECT_POISON) {
        e.acc += dt;
        const iv = poisonInterval(e.amp);
        while (e.acc >= iv) {
          e.acc -= iv;
          // El veneno nunca mata: se queda en medio corazón.
          if (target.health > 1) target.damage(1, 'poison', true);
        }
      } else if (id === EFFECT_HUNGER) {
        target.addExhaustion(hungerExhaustion(e.amp) * dt);
      } else if (id === EFFECT_SATURATION) {
        // Fase 7 (efectos): cada tick, 1 de comida y 2 de saturación por nivel (el último tick también).
        e.acc += Math.min(dt, e.time + dt);
        while (e.acc >= SATURATION_TICK - 1e-9) {
          e.acc -= SATURATION_TICK;
          target.eat?.(e.amp + 1, 2 * (e.amp + 1));
        }
      } else if (id === EFFECT_WITHER) {
        // Fase 7 (efectos): el marchitamiento, a diferencia del veneno, sí mata.
        e.acc += dt;
        const iv = witherInterval(e.amp);
        while (e.acc >= iv) {
          e.acc -= iv;
          target.damage(1, 'wither', true);
        }
      }
      if (e.time <= 0) {
        this.list.delete(id);
        if (id === EFFECT_ABSORPTION) target.absorption = 0;
        this.version++;
      }
    }
    // La absorción se acaba también cuando se gastan los corazones dorados.
    if (this.list.has(EFFECT_ABSORPTION) && target.absorption <= 0) this.remove(EFFECT_ABSORPTION);
  }

  /** Para el guardado: [efecto, nivel, segundos]. */
  toWire(): [number, number, number][] {
    return [...this.list].map(([id, e]) => [id, e.amp, Math.round(e.time * 10) / 10]);
  }

  fromWire(w: unknown, target?: EffectTarget): void {
    this.list.clear();
    if (Array.isArray(w)) {
      for (const f of w) {
        if (!Array.isArray(f)) continue;
        const [id, amp, secs] = f.map(Number);
        this.add(id, secs, amp, target);
      }
    }
    this.version++;
  }
}
