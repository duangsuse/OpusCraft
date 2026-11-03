// Física de lo que no son criaturas: objetos tirados (se fusionan, se recogen, arden en lava),
// flechas (vuelan, se clavan, hieren) y bloques que caen (arena y grava).
import { clipSegment, CLIP_CELL } from '../../collide'; // choque contra la forma real de los bloques
import { MOBS, ENT_ITEM, ENT_ARROW, isRaider , MOB_ENDER_DRAGON } from '../../mobs';
import { ITEMS, ARROW, maxStack, sameKind, type ItemStack } from '../../items';
import { AIR, BLOCK_SOLID, BLOCK_FLUID } from '../../blocks';
import { EF_PICKABLE, EF_FIRE } from '../../protocol';
import { FLAME_SECONDS } from '../../enchantEffects'; // Fase 7 (encantamientos)
import { moveBody, boxCollides } from '../physics';
import { GRAVITY, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
import { potionStack, SPECTRAL_ARROW_TYPE } from '../../potions'; // Fase 7 (pociones): flechas con efecto; 8.3: la espectral
import { SPECTRAL_ARROW, FIRE_RESISTANT_ITEMS } from '../../items';

export class ItemPhysics {
  private itemGrid = new Map<string, Entity[]>();

  constructor(private m: Entities) {}

  fallingTick(e: Entity, dt: number): void {
    e.vy = Math.max(-40, e.vy - GRAVITY * dt);
    moveBody(e, this.m.w, dt);
    if (e.onGround || e.age > 30) {
      this.m.remove(e.id);
      if (this.m.fallingLanded?.(e) === false) return; // Fase 7 (encantamientos): el yunque aplasta y se deteriora
      this.m.host.landBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z), e.block ?? AIR);
    }
    e.flags = 0;
  }

  // ------------------------------------------------------------------ objetos


  buildItemGrid(): void {
    this.itemGrid.clear();
    for (const e of this.m.list.values()) {
      if (e.type !== ENT_ITEM || e.dead) continue;
      const k = `${Math.floor(e.x)},${Math.floor(e.y)},${Math.floor(e.z)}`;
      const l = this.itemGrid.get(k);
      if (l) l.push(e);
      else this.itemGrid.set(k, [e]);
    }
  }

  itemTick(e: Entity, dt: number, _players: PlayerView[]): void {
    if (e.pickupDelay! > 0) e.pickupDelay! -= dt;
    e.flags = e.pickupDelay! <= 0 ? EF_PICKABLE : 0;
    if (e.age > 300) {
      this.m.remove(e.id);
      return;
    }
    // Fase 8.5: lo que no arde (la netherita) flota en la lava como en el agua.
    const fireproof = !!e.stack && FIRE_RESISTANT_ITEMS.has(e.stack.id);
    if (e.inWater || (e.inLava && fireproof)) {
      e.vy += (1.5 - e.vy) * Math.min(1, dt * 3);
      e.vx *= 1 - Math.min(1, dt * 2);
      e.vz *= 1 - Math.min(1, dt * 2);
    } else {
      e.vy -= 18 * dt;
      const fr = e.onGround ? 8 : 0.5;
      e.vx *= 1 - Math.min(1, dt * fr);
      e.vz *= 1 - Math.min(1, dt * fr);
    }
    if (e.inLava && !fireproof) {
      this.m.remove(e.id);
      this.m.host.fx('burn_item', e.x, e.y, e.z);
      return;
    }
    // Si quedó dentro de un bloque, empujarlo hacia arriba.
    if (boxCollides(this.m.w, e.x - 0.12, e.y, e.z - 0.12, e.x + 0.12, e.y + 0.24, e.z + 0.12)) {
      e.y += 3 * dt;
      e.vy = 0;
      e.onGround = false;
    } else moveBody(e, this.m.w, dt);
    // Fusionar pilas iguales cercanas (sólo se miran las celdas vecinas).
    if (((e.id + Math.floor(e.age * 4)) & 7) === 0) {
      const near: Entity[] = [];
      const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const l = this.itemGrid.get(`${bx + dx},${by + dy},${bz + dz}`);
        if (l) near.push(...l);
      }
      for (const o of near) {
        if (o === e || o.type !== ENT_ITEM || o.dead || !o.stack || !e.stack || !this.m.list.has(o.id)) continue;
        if (!sameKind(o.stack, e.stack)) continue; // Fase 6.5 (libros y estandartes): también con los mismos datos
        if (Math.abs(o.x - e.x) > 0.6 || Math.abs(o.y - e.y) > 0.6 || Math.abs(o.z - e.z) > 0.6) continue;
        const room = maxStack(e.stack.id) - e.stack.count;
        if (room <= 0) continue;
        const n = Math.min(room, o.stack.count);
        e.stack.count += n;
        o.stack.count -= n;
        e.age = Math.min(e.age, o.age);
        if (o.stack.count <= 0) this.m.remove(o.id);
      }
    }
  }

  /** Un jugador pide recoger un objeto: devuelve la pila si es válido. */
  tryPickup(id: number, p: PlayerView): ItemStack | null {
    const e = this.m.list.get(id);
    if (!e || e.dead) return null;
    if (e.type === ENT_ARROW) {
      if (!e.stuck || typeof e.shooter !== 'string' || e.noPickup) return null; // Fase 7: Infinidad
      if (Math.hypot(e.x - p.x, e.y - (p.y + 0.9), e.z - p.z) > 3.5) return null;
      this.m.remove(e.id, p.id);
      if (e.arrowPotion === SPECTRAL_ARROW_TYPE) return { id: SPECTRAL_ARROW, count: 1 }; // Fase 8.3
      return e.arrowPotion !== undefined ? potionStack('arrow', e.arrowPotion) : { id: ARROW, count: 1 }; // Fase 7 (pociones)
    }
    if (e.type !== ENT_ITEM || !e.stack) return null;
    if (e.pickupDelay! > 0 && e.owner === p.id) return null;
    if (e.pickupDelay! > 0.3 && e.owner !== p.id) return null;
    const dx = e.x - p.x, dy = e.y - (p.y + 0.9), dz = e.z - p.z;
    if (dx * dx + dy * dy + dz * dz > 3.5 * 3.5) return null;
    const s = e.stack;
    this.m.remove(e.id, p.id);
    return s;
  }

  // ------------------------------------------------------------------ flechas

  arrowTick(e: Entity, dt: number, players: PlayerView[]): void {
    if (e.stuck) {
      if (e.age > 30) this.m.remove(e.id);
      return;
    }
    if (e.age > 20) {
      this.m.remove(e.id);
      return;
    }
    e.vy -= 20 * dt;
    const drag = e.inWater ? 0.6 : 0.99;
    e.vx *= Math.pow(drag, dt * 20);
    e.vy *= Math.pow(drag, dt * 20);
    e.vz *= Math.pow(drag, dt * 20);
    const speed = Math.hypot(e.vx, e.vy, e.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
    for (let s = 0; s < steps; s++) {
      const nx = e.x + (e.vx * dt) / steps, ny = e.y + (e.vy * dt) / steps, nz = e.z + (e.vz * dt) / steps;
      // Choca con la forma de colisión (como en Java): pasa por encima de una losa o por una puerta abierta.
      const hit = clipSegment(this.m.w, e.x, e.y, e.z, nx, ny, nz);
      if (hit >= 0) {
        // Se queda clavada en el punto del choque, un poco hacia atrás.
        const back = Math.max(0, hit - 0.05 / Math.max(1e-6, Math.hypot(nx - e.x, ny - e.y, nz - e.z)));
        e.x += (nx - e.x) * back;
        e.y += (ny - e.y) * back;
        e.z += (nz - e.z) * back;
        e.stuck = true;
        e.age = 0;
        e.vx = e.vy = e.vz = 0;
        e.flags = typeof e.shooter === 'string' && !e.noPickup ? EF_PICKABLE : 0;
        this.m.host.fx('arrow_hit', e.x, e.y, e.z);
        this.m.host.projectileHit?.('arrow', CLIP_CELL[0], CLIP_CELL[1], CLIP_CELL[2], e.x, e.y, e.z, !!e.arrowFire || e.fire > 0); // Fase 7 (redstone y mecanismos)
        return;
      }
      e.x = nx;
      e.y = ny;
      e.z = nz;
      // Daño proporcional a la velocidad (bloques por tick × daño base), como en Minecraft.
      const dmg = Math.max(1, Math.ceil((speed / 20) * (e.arrowDamage ?? 2)));
      // Fase 6 (asaltos): los virotes de los asaltantes no hieren a los suyos.
      const shooter = typeof e.shooter === 'number' ? this.m.list.get(e.shooter) : undefined;
      const raiderShot = !!shooter && isRaider(shooter.type);
      // Fase 8.6: las partes del dragón (posado, rebotan) y los cristales del End.
      if (this.m.dragon.arrowHit(e, dmg)) return;
      for (const m of this.m.list.values()) {
        if (!m.ai || m.dead || m.id === e.shooter || MOBS[m.type].inert || (raiderShot && isRaider(m.type)) || m.type === MOB_ENDER_DRAGON) continue;
        const hw = m.width / 2 + 0.1;
        if (Math.abs(m.x - e.x) < hw && Math.abs(m.z - e.z) < hw && e.y > m.y - 0.1 && e.y < m.y + m.height + 0.1) {
          // Fase 7 (encantamientos): Retroceso empuja más, Fuego prende y Perforación sigue de largo.
          if (e.pierced?.includes(m.id)) continue;
          // Fase 8.6: al shulker cerrado le rebotan (ProjectileDeflection.REVERSE).
          if (this.m.shulkers.deflectsArrow(m) || this.m.wither.deflectsArrow(m)) { // 8.7: el Wither blindado
            e.vx *= -0.1;
            e.vy *= -0.1;
            e.vz *= -0.1;
            e.shooter = m.id;
            this.m.host.fx('arrow_hit', e.x, e.y, e.z);
            return;
          }
          this.m.damage(m, dmg, e.x - e.vx, e.z - e.vz, e.shooter ?? null, 0.6 * (e.arrowKnock ?? 1));
          if (e.arrowFire && !m.dead) m.fire = Math.max(m.fire, FLAME_SECONDS);
          if (e.arrowPotion !== undefined && !m.dead) this.m.potions.tippedHit(e, m, null); // Fase 7 (pociones)
          this.m.host.fx('arrow_hit', e.x, e.y, e.z);
          if ((e.pierce ?? 0) > 1) {
            e.pierce!--;
            (e.pierced ??= []).push(m.id);
            continue;
          }
          this.m.remove(e.id);
          return;
        }
      }
      // Las flechas de jugadores no hieren a otros jugadores (juego cooperativo).
      if (typeof e.shooter !== 'string') for (const p of players) {
        if (!p.alive || p.creative) continue;
        if (Math.abs(p.x - e.x) < 0.4 && Math.abs(p.z - e.z) < 0.4 && e.y > p.y - 0.1 && e.y < p.y + 1.9) {
          const d = Math.hypot(e.vx, e.vz) || 1;
          this.m.host.hurtPlayer(p.id, dmg * this.m.difficultyScale(), (e.vx / d) * 3, 3, (e.vz / d) * 3, 'arrow');
          if (e.arrowPotion !== undefined) this.m.potions.tippedHit(e, null, p); // Fase 7 (pociones)
          this.m.host.fx('arrow_hit', e.x, e.y, e.z);
          this.m.remove(e.id);
          return;
        }
      }
    }
    e.yaw = Math.atan2(-e.vx, -e.vz);
    e.pitch = Math.atan2(e.vy, Math.hypot(e.vx, e.vz));
    const b = this.m.w.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    e.inWater = b > 0 && BLOCK_FLUID[b] === 1;
    if (e.inWater) e.arrowFire = false; // Fase 7: el agua apaga la flecha con Fuego
    e.flags = e.arrowFire ? EF_FIRE : 0;
  }
}
