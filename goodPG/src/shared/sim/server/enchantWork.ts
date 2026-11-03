// Fase 7 (encantamientos): lo que el servidor hace con los encantamientos fuera del combate.
// - Mesa de encantamientos, yunque y afiladora: el inventario y la experiencia los lleva el cliente; el
//   servidor comprueba el bloque y el alcance, avisa a todos (sonido y partículas), deteriora el yunque
//   (12 % por uso; el muy dañado se rompe) y suelta en orbes la experiencia que devuelve la afiladora.
// - Yunques que caen como la arena: hieren a lo que pillan (2 por bloque de caída desde el segundo, como
//   mucho 40) y se pueden deteriorar al caer (5 % más 5 % por bloque).
// - Paso helado: convierte en hielo escarchado el agua quieta alrededor del jugador; el hielo envejece
//   (cuatro edades) y se vuelve agua.
// - Espinas: las piezas de armadura con Espinas devuelven parte de los golpes cuerpo a cuerpo.
import {
  AIR, WATER, BLOCK_FLUID, BLOCK_FLUID_LEVEL, ENCHANTING_TABLE, GRINDSTONE, FROSTED_ICE, FROSTED_ICE_AGES, isAnvil,
  damagedAnvil, isFrostedIce, frostedIceAge, familyBase, isWaterlogged, SMITHING_TABLE,
} from '../../blocks';
import { stackFromWire, STATE_DEAD, type ClientMsg } from '../../protocol';
import { sanitizeStack } from '../../containers';
import { THORNS, MAX_ENCHANT_LEVEL, enchLevel } from '../../enchantments';
import { frostWalkerRadius, thornsChance, thornsDamage } from '../../enchantEffects';
import { ANVIL_BREAK_CHANCE } from '../../anvil';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { Entity } from '../entities';
import type { Nature } from './nature';
import type { ServerContext, Session } from './context';

/** Experiencia que puede devolver la afiladora de una vez (dos objetos con todo encantado de sobra). */
const MAX_GRIND_XP = 400;
/** Ticks entre dos envejecimientos del hielo escarchado (Minecraft: de 20 a 40). */
const FROST_TICKS: readonly [number, number] = [20, 40];
/** Daño del yunque que cae: por bloque (desde el segundo) y como mucho. */
const ANVIL_FALL_DAMAGE = 2;
const ANVIL_FALL_MAX = 40;

export class EnchantWork {
  /** Hielo escarchado → tick en que le toca envejecer. */
  private frost = new Map<number, number>();

  constructor(private ctx: ServerContext, nature: Nature) {
    // Hielo escarchado que quedó sin programar (al cargar el mundo): lo recoge un tick aleatorio.
    nature.addRandomTickHandler((id, x, y, z) => {
      if (!isFrostedIce(id)) return false;
      this.schedule(x, y, z);
      return true;
    });
  }

  // ------------------------------------------------------------------ mesa, yunque y afiladora

  /** El jugador usó la mesa, el yunque o la afiladora de (x, y, z). */
  onWork(s: Session, msg: Extract<ClientMsg, { t: 'work' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 6)) return;
    const id = ctx.world.getBlock(x, y, z);
    const cx = x + 0.5, cz = z + 0.5;
    if (msg.k === 'enchant' && id === ENCHANTING_TABLE) {
      ctx.fx('enchant', cx, y + 0.9, cz);
    } else if (msg.k === 'anvil' && isAnvil(id)) {
      // En creativo no se gasta; si no, un 12 % de las veces baja un grado (el muy dañado se rompe).
      if (s.mode !== 'c' && ctx.rand() < ANVIL_BREAK_CHANCE) {
        const next = damagedAnvil(id);
        ctx.world.setBlock(x, y, z, next || AIR);
        ctx.fx(next ? 'anvil_use' : 'anvil_destroy', cx, y + 0.5, cz, familyBase(id));
      } else ctx.fx('anvil_use', cx, y + 0.5, cz);
    } else if (msg.k === 'grind' && familyBase(id) === GRINDSTONE) {
      const n = Number(msg.n);
      if (Number.isInteger(n) && n > 0) ctx.entities.xp.spawn(Math.min(MAX_GRIND_XP, n), cx, y + 0.5, cz);
      ctx.fx('grindstone', cx, y + 0.5, cz);
    } else if (msg.k === 'smith' && familyBase(id) === SMITHING_TABLE) {
      ctx.fx('smithing', cx, y + 1, cz); // Fase 8.5: la mesa de herrería
    }
  }

  // ------------------------------------------------------------------ yunques que caen

  /**
   * Un bloque que caía toca el suelo. El yunque aplasta a lo que haya debajo y puede deteriorarse (o
   * romperse). Devuelve false si el bloque desaparece (no hay que ponerlo).
   */
  fallingLanded(e: Entity): boolean {
    const block = e.block ?? AIR;
    if (!isAnvil(block)) return true;
    const ctx = this.ctx;
    const fall = Math.ceil((e.fallFrom ?? e.y) - e.y - 1);
    if (fall <= 0) {
      ctx.fx('anvil_land', e.x, e.y, e.z);
      return true;
    }
    const dmg = Math.min(ANVIL_FALL_MAX, Math.floor(fall * ANVIL_FALL_DAMAGE));
    const hit = (x: number, y: number, z: number, hw: number, h: number) =>
      Math.abs(x - e.x) < hw + 0.49 && Math.abs(z - e.z) < hw + 0.49 && y < e.y + 1 && y + h > e.y;
    for (const o of ctx.entities.list.values()) {
      if (o.ai && !o.dead && hit(o.x, o.y, o.z, o.width / 2, o.height)) ctx.entities.damage(o, dmg, o.x, o.z, null, 0);
    }
    for (const s of ctx.sessions()) {
      if (s.joined && !(s.s & STATE_DEAD) && hit(s.p[0], s.p[1], s.p[2], 0.3, 1.8)) ctx.entities.host.hurtPlayer(s.id, dmg, 0, 0, 0, 'anvil');
    }
    if (ctx.rand() < 0.05 + fall * 0.05) {
      const next = damagedAnvil(block);
      if (!next) {
        ctx.fx('anvil_destroy', e.x, e.y, e.z, familyBase(block));
        return false;
      }
      e.block = next;
    }
    ctx.fx('anvil_land', e.x, e.y, e.z);
    return true;
  }

  // ------------------------------------------------------------------ Paso helado

  /** El jugador, en el suelo, con Paso helado de nivel `l`: hielo escarchado en el agua de alrededor. */
  onFrost(s: Session, msg: Extract<ClientMsg, { t: 'frost' }>): void {
    const l = Number(msg.l);
    if (!Number.isInteger(l) || l < 1 || l > MAX_ENCHANT_LEVEL || s.s & STATE_DEAD) return;
    const w = this.ctx.world;
    const r = frostWalkerRadius(l);
    const px = s.p[0], pz = s.p[2], y = Math.floor(s.p[1] + 0.01) - 1;
    for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++) {
      for (let z = Math.floor(pz - r); z <= Math.floor(pz + r); z++) {
        if ((x + 0.5 - px) ** 2 + (z + 0.5 - pz) ** 2 > r * r) continue;
        const id = w.getBlock(x, y, z);
        if (id !== WATER && !(id > 0 && BLOCK_FLUID[id] === 1 && BLOCK_FLUID_LEVEL[id] === 0 && !isWaterlogged(id))) continue;
        if (w.getBlock(x, y + 1, z) !== AIR) continue;
        w.setBlock(x, y, z, FROSTED_ICE);
        this.schedule(x, y, z);
      }
    }
  }

  private schedule(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    const k = posKey(x, y, z);
    if (!this.frost.has(k)) this.frost.set(k, ctx.tickCount + FROST_TICKS[0] + Math.floor(ctx.rand() * (FROST_TICKS[1] - FROST_TICKS[0])));
  }

  /** Cada tick: el hielo escarchado envejece (1/3 de las veces, o siempre si le quedan pocos vecinos) y se derrite. */
  tick(): void {
    if (this.frost.size === 0) return;
    const ctx = this.ctx, w = ctx.world;
    for (const [k, due] of this.frost) {
      if (due > ctx.tickCount) continue;
      this.frost.delete(k);
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = w.getBlock(x, y, z);
      if (!isFrostedIce(id)) continue;
      if (ctx.rand() < 1 / 3 || this.frostNeighbours(x, y, z) < 4) {
        const age = frostedIceAge(id);
        if (age + 1 >= FROSTED_ICE_AGES) w.setBlock(x, y, z, WATER);
        else w.setBlock(x, y, z, FROSTED_ICE + age + 1);
      }
      if (isFrostedIce(w.getBlock(x, y, z))) this.schedule(x, y, z);
    }
  }

  private frostNeighbours(x: number, y: number, z: number): number {
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isFrostedIce(this.ctx.world.getBlock(x + dx, y, z + dz))) n++;
    return n;
  }

  // ------------------------------------------------------------------ Espinas

  /**
   * Golpe cuerpo a cuerpo de `attacker` al jugador: cada pieza con Espinas salta con un 15 % por nivel,
   * hiere al atacante (de 1 a 4) y se desgasta 2 más. Devuelve las piezas que saltaron (bit 0 cabeza…).
   */
  thorns(s: Session, attacker: Entity): number {
    const armor = s.save?.armor;
    if (!armor || attacker.dead || !attacker.ai || s.mode === 'c') return 0;
    const ctx = this.ctx;
    let bits = 0, dmg = 0;
    for (let slot = 0; slot < 4; slot++) {
      const st = sanitizeStack(stackFromWire(armor[slot]));
      const lvl = enchLevel(st, THORNS);
      if (lvl <= 0 || ctx.rand() >= thornsChance(lvl)) continue;
      bits |= 1 << slot;
      dmg += thornsDamage(() => ctx.rand());
    }
    if (dmg > 0) {
      ctx.entities.damage(attacker, dmg, s.p[0], s.p[2], s.id, 0.3);
      ctx.fx('thorns', attacker.x, attacker.y + attacker.height * 0.6, attacker.z);
    }
    return bits;
  }
}
