// Pociones que se rompen, nubes de efecto y flechas con efecto.
// Fase 6 (monstruos): las brujas lanzaban pociones arrojadizas de daño, lentitud y veneno.
// Fase 7 (pociones): todas. La arrojadiza afecta a lo que esté a menos de 4 bloques, con más fuerza
// cuanto más cerca (en la que da de lleno, entera); la de agua apaga el fuego y hace daño a quien no
// soporta el agua. La persistente deja una nube de 3 bloques de radio que dura 30 s (se encoge con el
// tiempo y cada vez que afecta a alguien) y da la cuarta parte de su efecto, como mucho una vez por
// segundo a cada uno. Las flechas con efecto dan la octava parte al acertar.
import { MOBS, MOB_WITCH, MOB_ENDERMAN, MOB_SNOW_GOLEM } from '../../mobs';
import { AIR, isFire } from '../../blocks';
import { EFFECTS, EFFECT_INSTANT_DAMAGE, instantHarm, packColor } from '../../effects';
import {
  potionKind, potionType, potionEffects, potionColor, isPotionType, isInstantPotion, PT_WATER, ENT_EFFECT_CLOUD, type PotionKind,
} from '../../potions';
import { SPECTRAL_ARROW_TYPE, SPECTRAL_GLOW_SECONDS } from '../../potions'; // Fase 8.3: la flecha espectral
import { EFFECT_GLOWING } from '../../effects';
import type { Entity, PlayerView } from './types';
import type { Entities } from './Entities';

/** Radio de la salpicadura (bloques). */
export const SPLASH_RADIUS = 4;
/** Nube persistente: radio inicial, lo que dura (s), espera antes de empezar y lo que encoge al afectar a alguien. */
export const CLOUD_RADIUS = 3;
export const CLOUD_SECONDS = 30;
const CLOUD_WAIT = 0.5;
const CLOUD_SHRINK_ON_USE = 0.5;
/** Cada cuánto mira la nube quién está dentro (s) y cada cuánto puede volver a afectar a alguien. */
const CLOUD_CHECK = 0.25;
const CLOUD_REAPPLY = 1;

export function isSplashPotion(id: number | undefined): boolean {
  const k = potionKind(id);
  return k === 'splash' || k === 'lingering';
}

export class PotionLife {
  constructor(private m: Entities) {}

  /**
   * Efectos de una poción sobre un jugador: `dur` escala la duración y `inst`, la fuerza de los
   * instantáneos (el daño llega como un golpe de magia, que atraviesa la armadura).
   */
  private onPlayer(p: PlayerView, type: number, kind: PotionKind, dur: number, inst: number, attacker: string | number | null): void {
    for (const [id, secs, amp] of potionEffects(type, kind)) {
      if (id === EFFECT_INSTANT_DAMAGE) {
        const n = Math.round(instantHarm(amp) * inst);
        const witch = typeof attacker === 'number' && this.m.list.get(attacker)?.type === MOB_WITCH;
        if (n > 0) this.m.host.hurtPlayer(p.id, n, 0, 0, 0, witch ? 'witch' : 'magic');
      } else if (EFFECTS[id].instant) this.m.host.effectPlayer?.(p.id, id, inst, amp, true);
      else if (secs * dur >= 1) this.m.host.effectPlayer?.(p.id, id, Math.round(secs * dur * 10) / 10, amp, true);
    }
  }

  /** Efectos de una poción sobre una criatura (como onPlayer). */
  private onMob(c: Entity, type: number, kind: PotionKind, dur: number, inst: number, attacker: string | number | null): void {
    for (const [id, secs, amp] of potionEffects(type, kind)) {
      if (EFFECTS[id].instant) {
        // Las brujas resisten la magia de los demás (un 85 % menos de daño).
        this.m.effects.add(c, id, 0, amp, c.type === MOB_WITCH && attacker !== c.id ? inst * 0.15 : inst, attacker);
      } else if (secs * dur >= 1) this.m.effects.add(c, id, secs * dur, amp, 1, attacker);
    }
  }

  /**
   * La poción lanzada `e` se rompe donde está; `direct` es la criatura (o `directPlayer` el jugador) a
   * la que dio de lleno: a ésa le llega entera y a las demás, menos cuanto más lejos.
   */
  shatter(e: Entity, direct: Entity | null, directPlayer: PlayerView | null = null): void {
    const s = e.stack!;
    const kind = potionKind(s.id)!;
    const type = potionType(s);
    this.m.host.fx('potion_break', e.x, e.y, e.z, packColor(potionColor(type)), (kind === 'lingering' ? 1 : 0) | (isInstantPotion(type) ? 2 : 0));
    if (kind === 'lingering') {
      this.spawnCloud(type, e.x, e.y, e.z, e.shooter);
      return;
    }
    if (type === PT_WATER) {
      this.splashWater(e);
      return;
    }
    const attacker = e.shooter ?? null;
    for (const p of this.m.host.players()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (p.id !== directPlayer?.id && d >= SPLASH_RADIUS) continue;
      const k = p.id === directPlayer?.id ? 1 : 1 - d / SPLASH_RADIUS;
      this.onPlayer(p, type, 'splash', k, k, attacker);
    }
    for (const c of this.m.list.values()) {
      if (!c.ai || c.dead || MOBS[c.type].inert) continue;
      const d = Math.hypot(c.x - e.x, c.y - e.y, c.z - e.z);
      if (c !== direct && d >= SPLASH_RADIUS) continue;
      const k = c === direct ? 1 : 1 - d / SPLASH_RADIUS;
      this.onMob(c, type, 'splash', k, k, attacker);
    }
  }

  /** Frasco de agua arrojadizo: apaga lo que arde, moja a quien no soporta el agua y apaga el fuego. */
  private splashWater(e: Entity): void {
    for (const c of this.m.list.values()) {
      if (!c.ai || c.dead || Math.hypot(c.x - e.x, c.y - e.y, c.z - e.z) >= SPLASH_RADIUS) continue;
      c.fire = 0;
      if (c.type === MOB_ENDERMAN || c.type === MOB_SNOW_GOLEM) {
        c.invuln = 0;
        this.m.damage(c, 1, e.x, e.z, e.shooter ?? null, 0.3);
      }
    }
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
      if (isFire(this.m.w.getBlock(bx + dx, by + dy, bz + dz))) this.m.w.setBlock(bx + dx, by + dy, bz + dz, AIR);
    }
  }

  // ------------------------------------------------------------------ nube persistente

  spawnCloud(type: number, x: number, y: number, z: number, owner?: string | number): Entity {
    const e = this.m.spawnBare(ENT_EFFECT_CLOUD, x, y, z, CLOUD_RADIUS * 2, 0.5);
    e.cloudPotion = isPotionType(type) ? type : PT_WATER;
    e.cloudRadius = CLOUD_RADIUS;
    e.cloudWait = CLOUD_WAIT;
    e.cloudVictims = new Map();
    e.shooter = owner;
    e.swirl = 0;
    return e;
  }

  /** La nube encoge, afecta a quien esté dentro y desaparece al acabarse (o al quedarse sin radio). */
  cloudTick(e: Entity, dt: number, players: PlayerView[]): void {
    e.flags = 0;
    if (e.age >= CLOUD_SECONDS + CLOUD_WAIT || (e.cloudRadius ?? 0) < 0.5) {
      this.m.remove(e.id);
      return;
    }
    if (e.age < (e.cloudWait ?? 0)) return;
    e.cloudRadius = (e.cloudRadius ?? CLOUD_RADIUS) - (CLOUD_RADIUS / CLOUD_SECONDS) * dt;
    e.swirl = (e.swirl ?? 0) - dt;
    if (e.swirl > 0) return;
    e.swirl = CLOUD_CHECK;
    const type = e.cloudPotion ?? PT_WATER;
    if (potionEffects(type, 'lingering').length === 0) return;
    const victims = e.cloudVictims ??= new Map();
    const inside = (x: number, y: number, z: number, h: number) =>
      Math.hypot(x - e.x, z - e.z) <= e.cloudRadius! && y <= e.y + 0.5 && y + h >= e.y;
    const due = (key: string | number) => (victims.get(key) ?? -1) <= e.age;
    for (const p of players) {
      if (!p.alive || !inside(p.x, p.y, p.z, 1.8) || !due(p.id)) continue;
      victims.set(p.id, e.age + CLOUD_REAPPLY);
      this.onPlayer(p, type, 'lingering', 1, 0.5, e.shooter ?? null);
      e.cloudRadius! -= CLOUD_SHRINK_ON_USE;
    }
    for (const c of this.m.list.values()) {
      if (!c.ai || c.dead || MOBS[c.type].inert || !inside(c.x, c.y, c.z, c.height) || !due(c.id)) continue;
      victims.set(c.id, e.age + CLOUD_REAPPLY);
      this.onMob(c, type, 'lingering', 1, 0.5, e.shooter ?? null);
      e.cloudRadius! -= CLOUD_SHRINK_ON_USE;
    }
    if (e.cloudRadius! < 0.5) this.m.remove(e.id);
  }

  // ------------------------------------------------------------------ flechas con efecto

  /** Una flecha con efecto acierta a una criatura o a un jugador. */
  tippedHit(arrow: Entity, mob: Entity | null, player: PlayerView | null): void {
    const type = arrow.arrowPotion;
    // Fase 8.3: la flecha espectral da Brillo 10 s a lo que alcanza.
    if (type === SPECTRAL_ARROW_TYPE) {
      if (mob) this.m.effects.add(mob, EFFECT_GLOWING, SPECTRAL_GLOW_SECONDS, 0, 1, arrow.shooter ?? null);
      if (player) this.m.host.effectPlayer?.(player.id, EFFECT_GLOWING, SPECTRAL_GLOW_SECONDS, 0);
      return;
    }
    if (type === undefined || !isPotionType(type)) return;
    if (mob) this.onMob(mob, type, 'arrow', 1, 1, arrow.shooter ?? null);
    if (player) this.onPlayer(player, type, 'arrow', 1, 1, arrow.shooter ?? null);
  }
}
