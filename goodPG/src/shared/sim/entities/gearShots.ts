// Fase 6.5 (equipo): proyectiles del equipo nuevo en el servidor.
// - Tridente: vuela como una flecha pesada (el agua casi no lo frena), hace 8 de daño a la primera
//   criatura que toca y rebota; al clavarse en un bloque lo puede recoger cualquier jugador (el de un
//   ahogado no se recoge: desaparece al golpear).
// - Cohete de fuegos artificiales: sube acelerando y, al acabarse la mecha (o al chocar), estalla con
//   los colores de sus estrellas (el cliente pone las partículas y el sonido).
import { clipSegment, CLIP_CELL } from '../../collide'; // choque contra la forma real de los bloques
import { ITEMS, type ItemStack } from '../../items';
import { BLOCK_SOLID, BLOCK_FLUID } from '../../blocks';
import { MOBS, isRaider } from '../../mobs';
import { EF_PICKABLE } from '../../protocol';
import {
  ENT_TRIDENT, ENT_FIREWORK, TRIDENT_THROW_DAMAGE, fireworkFlight, fireworkColors, fireworkLife, colorList,
} from '../../equipment';
import { MAX_ARROWS, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
// Fase 7 (encantamientos): Lealtad (vuelve a su dueño), Empalamiento (más daño a los acuáticos) y
// Conductividad (con tormenta, un rayo sobre la criatura alcanzada a cielo abierto).
import { LOYALTY, CHANNELING, enchLevel, enchantsOf } from '../../enchantments';
import { meleeBonus, loyaltySpeed } from '../../enchantEffects';

/** Segundos que un tridente clavado espera a que lo recojan. */
const TRIDENT_STUCK_LIFE = 300;
/** Estrellas de un cohete con colores (nuestros cohetes llevan una: sus colores van juntos). */
const FIREWORK_STARS = 1;
/** Velocidad máxima del cohete (bloques/s). */
const FIREWORK_MAX_SPEED = 36;

export class GearShots {
  /** Fase 7 (encantamientos): rayo (Conductividad) y si hay tormenta; los pone el servidor. */
  lightning: ((x: number, y: number, z: number) => void) | null = null;
  thundering: () => boolean = () => false;

  constructor(private m: Entities) {}

  /** Tridente lanzado por un jugador (id de sesión) o por un ahogado (id de entidad). */
  spawnTrident(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: string | number, stack: ItemStack): Entity {
    this.m.makeRoom(ENT_TRIDENT, MAX_ARROWS);
    const e = this.m.spawnBare(ENT_TRIDENT, x, y, z, 0.3, 0.3);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.shooter = shooter;
    e.stack = { id: stack.id, count: 1, ...(stack.dmg ? { dmg: stack.dmg } : {}), ...(stack.data ? { data: stack.data } : {}) };
    e.arrowDamage = TRIDENT_THROW_DAMAGE;
    e.yaw = Math.atan2(-vx, -vz);
    e.pitch = Math.atan2(vy, Math.hypot(vx, vz));
    return e;
  }

  /** Cohete que sale de (x, y, z) hacia arriba. */
  spawnFirework(x: number, y: number, z: number, stack: ItemStack, owner: string): Entity {
    this.m.makeRoom(ENT_FIREWORK, 64);
    const e = this.m.spawnBare(ENT_FIREWORK, x, y, z, 0.25, 0.25);
    e.stack = { id: stack.id, count: 1, ...(stack.dmg ? { dmg: stack.dmg } : {}) };
    e.owner = owner;
    e.fuse = fireworkLife(fireworkFlight(stack.dmg), this.m.rand());
    e.vx = (this.m.rand() - 0.5) * 0.04;
    e.vz = (this.m.rand() - 0.5) * 0.04;
    e.vy = 1;
    e.yaw = 0;
    e.pitch = Math.PI / 2;
    return e;
  }

  /** Fase 8.6: cohete pegado al jugador `owner`, que planea (lo empuja su cliente); estalla a los `life` segundos. */
  attachFirework(owner: string, x: number, y: number, z: number, stack: ItemStack, life: number): Entity {
    const e = this.spawnFirework(x, y, z, stack, owner);
    e.attached = owner;
    e.fuse = life;
    e.vx = e.vy = e.vz = 0;
    return e;
  }

  /** Reparto del tick de Entities: true si la entidad era de este módulo. */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (e.type === ENT_TRIDENT) this.tridentTick(e, dt, players);
    else if (e.type === ENT_FIREWORK) this.fireworkTick(e, dt, players);
    else return false;
    return true;
  }

  // ------------------------------------------------------------------ tridente

  private tridentTick(e: Entity, dt: number, players: PlayerView[]): void {
    const m = this.m;
    const fromMob = typeof e.shooter !== 'string';
    if (e.returning && this.returnTick(e, dt, players)) return; // Fase 7 (encantamientos): Lealtad
    if (e.stuck) {
      // Fase 7: con Lealtad no se queda clavado: vuelve.
      if (!fromMob && enchLevel(e.stack, LOYALTY) > 0 && players.some((p) => p.id === e.shooter && p.alive)) {
        e.returning = true;
        e.stuck = false;
        return;
      }
      e.flags = fromMob ? 0 : EF_PICKABLE;
      if (e.age > (fromMob ? 5 : TRIDENT_STUCK_LIFE)) m.remove(e.id);
      return;
    }
    if (e.age > 30) {
      m.remove(e.id);
      return;
    }
    e.vy -= 20 * dt;
    // Minecraft: el tridente apenas se frena en el agua (0,99 en vez del 0,6 de la flecha).
    const drag = Math.pow(0.99, dt * 20);
    e.vx *= drag;
    e.vy *= drag;
    e.vz *= drag;
    const speed = Math.hypot(e.vx, e.vy, e.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
    for (let s = 0; s < steps; s++) {
      const nx = e.x + (e.vx * dt) / steps, ny = e.y + (e.vy * dt) / steps, nz = e.z + (e.vz * dt) / steps;
      if (clipSegment(m.w, e.x, e.y, e.z, nx, ny, nz) >= 0) {
        e.stuck = true;
        e.age = 0;
        e.vx = e.vy = e.vz = 0;
        m.host.fx('trident_hit', nx, ny, nz);
        m.host.projectileHit?.('trident', CLIP_CELL[0], CLIP_CELL[1], CLIP_CELL[2], e.x, e.y, e.z); // Fase 7 (redstone)
        return;
      }
      e.x = nx;
      e.y = ny;
      e.z = nz;
      if ((e.arrowDamage ?? 0) <= 0) continue; // ya golpeó: cae sin hacer daño
      const shooter = typeof e.shooter === 'number' ? m.list.get(e.shooter) : undefined;
      for (const o of m.list.values()) {
        if (!o.ai || o.dead || o.id === e.shooter || MOBS[o.type].inert || (shooter && isRaider(shooter.type) && isRaider(o.type))) continue;
        const hw = o.width / 2 + 0.15;
        if (Math.abs(o.x - e.x) < hw && Math.abs(o.z - e.z) < hw && e.y > o.y - 0.1 && e.y < o.y + o.height + 0.1) {
          // Fase 7 (encantamientos): Empalamiento contra los acuáticos y Conductividad con tormenta.
          m.damage(o, e.arrowDamage! + meleeBonus(enchantsOf(e.stack), o.type), e.x - e.vx, e.z - e.vz, e.shooter ?? null, 0.6);
          if (enchLevel(e.stack, CHANNELING) > 0 && this.lightning && this.thundering() && m.w.skyTop(Math.floor(o.x), Math.floor(o.z)) <= Math.floor(o.y + o.height)) {
            this.lightning(o.x, o.y, o.z);
          }
          this.bounce(e);
          if (!fromMob && enchLevel(e.stack, LOYALTY) > 0) e.returning = true;
          return;
        }
      }
      // Los tridentes de los jugadores no hieren a otros jugadores (juego cooperativo).
      if (fromMob) for (const p of players) {
        if (!p.alive || p.creative) continue;
        if (Math.abs(p.x - e.x) < 0.45 && Math.abs(p.z - e.z) < 0.45 && e.y > p.y - 0.1 && e.y < p.y + 1.9) {
          const d = Math.hypot(e.vx, e.vz) || 1;
          m.host.hurtPlayer(p.id, e.arrowDamage! * m.difficultyScale(), (e.vx / d) * 3, 3, (e.vz / d) * 3, 'trident');
          m.host.fx('trident_hit', e.x, e.y, e.z);
          m.remove(e.id);
          return;
        }
      }
    }
    if (Math.hypot(e.vx, e.vz) > 0.3 || Math.abs(e.vy) > 0.3) {
      e.yaw = Math.atan2(-e.vx, -e.vz);
      e.pitch = Math.atan2(e.vy, Math.hypot(e.vx, e.vz));
    }
    const b = m.w.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    e.inWater = b > 0 && BLOCK_FLUID[b] === 1;
    e.flags = 0;
  }

  /**
   * Fase 7 (encantamientos): el tridente con Lealtad vuelve volando (atraviesa los bloques) hacia su dueño,
   * que lo recoge al tocarlo. Si el dueño se fue o murió, cae donde esté. Devuelve si lo atendió.
   */
  private returnTick(e: Entity, dt: number, players: PlayerView[]): boolean {
    const owner = players.find((p) => p.id === e.shooter && p.alive);
    if (!owner) {
      e.returning = false;
      return false;
    }
    const tx = owner.x - e.x, ty = owner.y + 1.2 - e.y, tz = owner.z - e.z;
    const d = Math.hypot(tx, ty, tz) || 1;
    const sp = Math.min(d / dt, loyaltySpeed(enchLevel(e.stack, LOYALTY)) + e.age * 2);
    e.vx = (tx / d) * sp;
    e.vy = (ty / d) * sp;
    e.vz = (tz / d) * sp;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.z += e.vz * dt;
    e.yaw = Math.atan2(-e.vx, -e.vz);
    e.pitch = Math.atan2(e.vy, Math.hypot(e.vx, e.vz));
    e.age = Math.min(e.age, 20);
    e.arrowDamage = 0;
    // Cerca del dueño se puede recoger (el cliente lo pide al tocarlo).
    e.flags = d < 3 ? EF_PICKABLE : 0;
    return true;
  }

  /** Tras golpear a una criatura: rebota hacia atrás y cae (el de un ahogado desaparece). */
  private bounce(e: Entity): void {
    this.m.host.fx('trident_hit', e.x, e.y, e.z);
    if (typeof e.shooter !== 'string') {
      this.m.remove(e.id);
      return;
    }
    e.arrowDamage = 0;
    e.vx *= -0.1;
    e.vz *= -0.1;
    e.vy = Math.min(e.vy * -0.1, 2);
  }

  /** Un jugador pide recoger un tridente clavado: devuelve la pila si puede. */
  tryPickup(id: number, p: PlayerView): ItemStack | null | undefined {
    const e = this.m.list.get(id);
    if (!e || e.type !== ENT_TRIDENT) return undefined;
    // Fase 7 (encantamientos): el que vuelve con Lealtad sólo lo recoge su dueño.
    if (e.returning) {
      if (p.id !== e.shooter || !e.stack || Math.hypot(e.x - p.x, e.y - (p.y + 0.9), e.z - p.z) > 3.5) return null;
      this.m.remove(e.id, p.id);
      return { ...e.stack };
    }
    if (!e.stuck || typeof e.shooter !== 'string' || !e.stack || !ITEMS[e.stack.id]) return null;
    if (Math.hypot(e.x - p.x, e.y - (p.y + 0.9), e.z - p.z) > 3.5) return null;
    this.m.remove(e.id, p.id);
    return { ...e.stack };
  }

  // ------------------------------------------------------------------ cohete

  private fireworkTick(e: Entity, dt: number, players: PlayerView[]): void {
    const m = this.m;
    e.flags = 0;
    e.fuse = (e.fuse ?? 1) - dt;
    if (e.attached) {
      // Pegado al que planea: va con él (si se va o muere, estalla ya).
      const p = players.find((q) => q.id === e.attached && q.alive);
      if (!p || e.fuse <= 0) {
        this.explode(e, players);
        return;
      }
      e.x = p.x;
      e.y = p.y + 0.3;
      e.z = p.z;
      return;
    }
    // Como en Minecraft: cada tick sube 0,04 bloques por tick más deprisa y lo que se desvía de lado crece un 15 %.
    const k = dt * 20;
    const grow = Math.pow(1.15, k);
    e.vx *= grow;
    e.vz *= grow;
    e.vy = Math.min(FIREWORK_MAX_SPEED, e.vy + 0.8 * k);
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt, nz = e.z + e.vz * dt;
    const id = m.w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (id < 0 || BLOCK_SOLID[id] || e.fuse <= 0) {
      this.explode(e, players);
      return;
    }
    e.x = nx;
    e.y = ny;
    e.z = nz;
  }

  /**
   * El cohete estalla: sus colores en `a` y cuántos son en `b` (sin colores, se apaga con un chasquido).
   * Fase 8.6 (FireworkRocketEntity.dealExplosionDamage): con estrella hace 5 + 2 por estrella al que lo lleva pegado y,
   * a los que ve a menos de 5 bloques, eso por √((5 − d) / 5).
   */
  explode(e: Entity, players: PlayerView[] = []): void {
    const m = this.m;
    const colors = fireworkColors(e.stack?.dmg);
    if (colors) m.host.fx('firework_burst', e.x, e.y, e.z, colors, colorList(colors).length);
    else m.host.fx('firework_fizzle', e.x, e.y, e.z);
    m.remove(e.id);
    if (!colors) return;
    const dmg = 5 + 2 * FIREWORK_STARS;
    if (e.attached) m.host.hurtPlayer(e.attached, dmg, 0, 0, 0, 'fireworks');
    const share = (x: number, y: number, z: number): number => {
      const d = Math.hypot(x - e.x, y - e.y, z - e.z);
      return d > 5 || !this.sees(e, x, y, z) ? 0 : dmg * Math.sqrt((5 - d) / 5);
    };
    for (const p of players) {
      if (!p.alive || p.id === e.attached) continue;
      const k = share(p.x, p.y + 0.9, p.z);
      if (k > 0) m.host.hurtPlayer(p.id, k, 0, 0, 0, 'fireworks');
    }
    for (const o of m.list.values()) {
      if (!o.ai || o.dead || MOBS[o.type].inert) continue;
      const k = share(o.x, o.y + o.height / 2, o.z);
      if (k > 0) m.damage(o, k, e.x, e.z, e.owner ?? null, 0);
    }
  }

  /** ¿Se ve (x, y, z) desde el cohete sin bloques sólidos en medio? */
  private sees(e: Entity, x: number, y: number, z: number): boolean {
    const d = Math.hypot(x - e.x, y - e.y, z - e.z);
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const id = this.m.w.getBlock(Math.floor(e.x + (x - e.x) * t), Math.floor(e.y + (y - e.y) * t), Math.floor(e.z + (z - e.z) * t));
      if (id > 0 && BLOCK_SOLID[id]) return false;
    }
    return true;
  }
}
