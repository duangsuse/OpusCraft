// Fase 7 (mecanismos): dinamita y explosiones en el servidor, como en Minecraft.
// - La dinamita se enciende con potencia de redstone, un mechero, el fuego, una flecha en llamas, un
//   dispensador o una explosión (ésta, con una mecha más corta): el bloque pasa a ser una entidad que cae
//   con la gravedad, parpadea y explota a los 4 s (potencia 4).
// - Explosiones (las de la dinamita, las vagonetas con dinamita y los creepers): rompen bloques según su
//   resistencia (shared/explosions.ts; bajo el agua, ninguno) y sueltan uno de cada «potencia»; hieren y
//   empujan según la distancia y lo que tapa (la parte de la entidad que ve el centro); destruyen los
//   objetos tirados que pillan de lleno; encienden la dinamita que alcanzan y rompen barcas y vagonetas
//   (la vagoneta con dinamita se enciende).
import { AIR, TNT, BLOCK_SOLID } from '../../blocks';
import { TOOLS, EXPLOSION_RESISTANT_ITEMS, type ItemStack } from '../../items';
import { ENT_ITEM, ENT_DISPLAY } from '../../mobs';
import { isHangingType } from '../../paintings';
import { ENT_ARMOR_STAND } from '../../armorStands';
import { isVehicleType, ENT_TNT_MINECART } from '../../vehicles';
import { ENT_TNT, TNT_FUSE, TNT_POWER, TNT_SIZE } from '../../mechanisms';
import { explodedBlocks } from '../../explosions';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { blockDrops } from '../drops';
import { moveBody, lineOfSight } from '../physics';
import type { Entity } from '../entities';
import type { Redstone } from './redstone';
import type { Transport, Vehicle } from './vehicles';
import { ENT_END_CRYSTAL } from '../../mobs'; // Fase 8.6
import type { ServerContext } from './context';

/** Gravedad y rozamiento de la dinamita encendida (Minecraft: 0,04 por tick² y 0,98 por tick). */
const TNT_GRAVITY = 16;
const BEST_PICKAXE = () => TOOLS.diamond?.pickaxe ?? 0;

const SYSTEMS = new WeakMap<RedstoneApi, Explosives>();

registerRedstone(TNT, {
  // Con potencia se enciende (neighborChanged), también al ponerla junto a una fuente (onPlace).
  neighbor: (api, x, y, z) => {
    if (api.isPowered(x, y, z)) SYSTEMS.get(api)?.prime(x, y, z);
  },
  placed: (api, x, y, z, old) => {
    if (old >= 0 && old !== TNT && api.isPowered(x, y, z)) SYSTEMS.get(api)?.prime(x, y, z);
  },
});

export interface BlastOptions {
  /** Creeper cargado (su víctima suelta la cabeza). */
  charged?: boolean;
  /** Fase 8.5: sin romper bloques (el nexo de reaparición con agua al lado). */
  noBlocks?: boolean;
  /** Fase 8.7: quien la causa (el Wither: sus explosiones no le hieren y lo que matan cuenta como suyo). */
  source?: number;
  /** Fase 8.7: resistencia a medida de cada bloque (la calavera azul del Wither rompe hasta lo que resiste 0,8). */
  resist?: (id: number, r: number) => number;
}

export class Explosives {
  /** Vagonetas con dinamita que explotan al acabar el tick (no se rompen en mitad del del transporte). */
  private pending: [Vehicle, number][] = [];

  constructor(private ctx: ServerContext, rs: Redstone, private transport: Transport) {
    SYSTEMS.set(rs, this);
    ctx.entities.custom.set(ENT_TNT, (e, dt) => this.tickPrimed(e, dt));
    ctx.entities.explosion = (x, y, z, power, charged, breakBlocks = true, extra = {}) => this.explode(x, y, z, power, { charged, noBlocks: !breakBlocks, ...extra });
  }

  /** Enciende la dinamita de (x, y, z) con la mecha dada (ticks); true si había dinamita. */
  prime(x: number, y: number, z: number, fuse = TNT_FUSE): boolean {
    const w = this.ctx.world;
    if (w.getBlock(x, y, z) !== TNT) return false;
    w.setBlock(x, y, z, AIR);
    this.spawnPrimed(x + 0.5, y, z + 0.5, fuse);
    return true;
  }

  /** Dinamita encendida en (x, y, z) (los pies de la entidad) con un pequeño salto. */
  spawnPrimed(x: number, y: number, z: number, fuse = TNT_FUSE): Entity {
    const e = this.ctx.entities.spawnBare(ENT_TNT, x, y, z, TNT_SIZE, TNT_SIZE);
    const a = this.ctx.rand() * Math.PI * 2;
    e.vx = -Math.sin(a) * 0.4;
    e.vy = 4;
    e.vz = -Math.cos(a) * 0.4;
    e.yaw = 0;
    e.block = TNT;
    e.fuse = fuse;
    this.ctx.fx('tnt_primed', x, y + 0.5, z);
    return e;
  }

  /** Cada tick de una dinamita encendida: cae, frena en el suelo y, al acabarse la mecha, explota. */
  private tickPrimed(e: Entity, dt: number): void {
    e.vy -= TNT_GRAVITY * dt;
    moveBody(e, this.ctx.world, dt);
    const drag = Math.pow(0.98, dt * 20);
    e.vx *= drag;
    e.vy *= drag;
    e.vz *= drag;
    if (e.onGround) {
      e.vx *= 0.7;
      e.vz *= 0.7;
    }
    e.flags = 0;
    e.fuse = (e.fuse ?? TNT_FUSE) - dt * 20;
    if (e.fuse <= 0) {
      this.ctx.entities.remove(e.id);
      this.explode(e.x, e.y + 0.0625, e.z, TNT_POWER);
    }
  }

  /** La vagoneta con dinamita `v` explota al terminar el tick; iba a `speed` bloques/s. */
  queueCart(v: Vehicle, speed: number): void {
    this.pending.push([v, speed]);
  }

  /** Mecha corta (ticks) de la vagoneta con dinamita que enciende una explosión o que se rompe corriendo (0 a 38). */
  shortCartFuse(): number {
    return Math.floor(this.ctx.rand() * 20) + Math.floor(this.ctx.rand() * 20);
  }

  /** La vagoneta con dinamita `v` se enciende. */
  primedCart(v: Vehicle): void {
    this.ctx.fx('tnt_primed', v.e.x, v.e.y + 0.5, v.e.z);
  }

  tick(): void {
    if (this.pending.length === 0) return;
    const list = this.pending;
    this.pending = [];
    for (const [v, speed] of list) {
      const { x, y, z } = v.e;
      if (this.transport.vehicleOf(v.e.id) === v) this.transport.destroy(v, false, false);
      // Minecraft: 4 más hasta 1,5 por cada bloque por tick de velocidad (como mucho 5).
      this.explode(x, y + 0.35, z, 4 + this.ctx.rand() * 1.5 * Math.min(5, speed / 20));
    }
  }

  // ------------------------------------------------------------------ explosiones

  /** Explosión de potencia `power` en (x, y, z). */
  explode(x: number, y: number, z: number, power: number, opts: BlastOptions = {}): void {
    const ctx = this.ctx, w = ctx.world, ents = ctx.entities;
    const rand = () => ctx.rand();
    ctx.fx('explode', x, y, z, power);
    // Los bloques se calculan con el mundo entero (antes de herir a nadie ni romper nada).
    const blocks = opts.noBlocks ? [] : explodedBlocks((a, b, c) => w.getBlock(a, b, c), x, y, z, power, rand, opts.resist);
    const reach = power * 2;
    ents.chargedBlast = opts.charged ? { dropped: false } : null;
    try {
      for (const e of [...ents.list.values()]) {
        if (e.dead || e.type === ENT_DISPLAY || e.type === ENT_ARMOR_STAND || isHangingType(e.type)) continue;
        const dist = Math.hypot(e.x - x, e.y - y, e.z - z) / reach;
        if (dist > 1) continue;
        const ey = e.type === ENT_TNT ? e.y : e.y + e.height * 0.85;
        let dx = e.x - x, dy = ey - y, dz = e.z - z;
        const len = Math.hypot(dx, dy, dz);
        if (len === 0) continue;
        dx /= len;
        dy /= len;
        dz /= len;
        const hw = e.width / 2;
        const impact = (1 - dist) * this.exposure(x, y, z, e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.height, e.z + hw);
        const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * reach + 1);
        if (isVehicleType(e.type)) {
          this.hitVehicle(e, dmg);
          continue;
        }
        // Fase 8.6: el cristal del End que alcanza una explosión se rompe (sin estallar: no hay cadena).
        if (e.type === ENT_END_CRYSTAL) {
          ents.dragon.crystalHit(e, null, true);
          continue;
        }
        if (e.type === ENT_ITEM) {
          // Los objetos tirados que pilla de lleno se destruyen (Fase 8.5: la estrella del Nether, no).
          if (dmg >= 5 && !(e.stack && EXPLOSION_RESISTANT_ITEMS.has(e.stack.id))) ents.remove(e.id);
          continue;
        }
        if (e.ai) ents.damage(e, dmg, x, z, opts.source ?? null, 0);
        e.vx += dx * impact * 20;
        e.vy += dy * impact * 20;
        e.vz += dz * impact * 20;
        if (e.ai) e.onGround = false;
      }
    } finally {
      ents.chargedBlast = null;
    }
    for (const p of ents.host.players()) {
      if (!p.alive || p.creative) continue;
      const dist = Math.hypot(p.x - x, p.y - y, p.z - z) / reach;
      if (dist > 1) continue;
      let dx = p.x - x, dy = p.y + 1.62 - y, dz = p.z - z;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      const impact = (1 - dist) * this.exposure(x, y, z, p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + 1.8, p.z + 0.3);
      const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * reach + 1) * ents.difficultyScale();
      const k = impact * 20;
      ents.host.hurtPlayer(p.id, dmg, dx * k, Math.max(dy * k, impact * 4), dz * k, 'explosion');
    }
    // Se rompen los bloques (en orden aleatorio): la dinamita se enciende; lo demás, a veces, se suelta.
    const order: number[] = [];
    for (let i = 0; i < blocks.length; i += 3) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const drops: [ItemStack[], number, number, number][] = [];
    for (const i of order) {
      const bx = blocks[i], by = blocks[i + 1], bz = blocks[i + 2];
      const id = w.getBlock(bx, by, bz);
      if (id <= 0) continue;
      if (id === TNT) {
        // Encendida por la explosión: mecha más corta (de medio segundo a un segundo y medio).
        this.prime(bx, by, bz, 10 + Math.floor(rand() * 20));
        continue;
      }
      const stacks = rand() < 1 / power ? blockDrops(id, BEST_PICKAXE(), rand) : [];
      w.setBlock(bx, by, bz, AIR);
      if (stacks.length) drops.push([stacks, bx, by, bz]);
    }
    for (const [stacks, bx, by, bz] of drops) ents.dropStacks(stacks, bx + 0.5, by + 0.3, bz + 0.5);
  }

  /**
   * Parte (0..1) de la caja que ve el centro de la explosión: puntos repartidos por la caja con la vista
   * libre hasta el centro (getSeenPercent de Minecraft).
   */
  private exposure(cx: number, cy: number, cz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
    const sx = 1 / ((x1 - x0) * 2 + 1), sy = 1 / ((y1 - y0) * 2 + 1), sz = 1 / ((z1 - z0) * 2 + 1);
    const ox = (1 - Math.floor(1 / sx) * sx) / 2, oz = (1 - Math.floor(1 / sz) * sz) / 2;
    const w = this.ctx.world;
    let seen = 0, total = 0;
    for (let a = 0; a <= 1; a += sx) {
      for (let b = 0; b <= 1; b += sy) {
        for (let c = 0; c <= 1; c += sz) {
          const px = x0 + (x1 - x0) * a + ox, py = y0 + (y1 - y0) * b, pz = z0 + (z1 - z0) * c + oz;
          const id = w.getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
          if ((id <= 0 || !BLOCK_SOLID[id]) && lineOfSight(w, px, py, pz, cx, cy, cz)) seen++;
          total++;
        }
      }
    }
    return total ? seen / total : 0;
  }

  /** Una explosión alcanza una barca o una vagoneta: la de dinamita se enciende; las demás se rompen si es fuerte. */
  private hitVehicle(e: Entity, dmg: number): void {
    const v = this.transport.vehicleOf(e.id);
    if (!v) return;
    if (e.type === ENT_TNT_MINECART) {
      const x = (v.extra ??= {});
      if (typeof x.fuse !== 'number' || x.fuse < 0) x.fuse = this.shortCartFuse() + 1;
      return;
    }
    if (dmg >= 4) this.transport.destroy(v, true, true);
  }
}
