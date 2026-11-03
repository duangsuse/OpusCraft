// Fase 6.5 (equipo): el fuego en el servidor, con las reglas de Minecraft (FireBlock.tick).
// Cada fuego se revisa cada 1,5–2 s: se apaga con la lluvia a cielo abierto; envejece; sin nada
// inflamable al lado se apaga pronto (enseguida si no tiene suelo); quema los bloques de alrededor
// (los consume o los prende) y se propaga a huecos junto a madera, hojas, lana… Sobre rocanegra no se
// apaga nunca. La lava prende lo inflamable que tiene cerca y los rayos encienden fuego donde caen.
// Las criaturas que lo tocan se prenden (los jugadores se queman en su cliente) y los objetos arden.
import { Handlers } from './hooks';
import {
  AIR, BLOCK_SOLID, BLOCK_FLUID, NETHERRACK, MAGMA_BLOCK, BEDROCK, NEIGHBORS6, isFire, fireAge, fireWithAge, fireSupport, flammability,
  flameEncouragement, familyBase, stateOf, stateProps, isCampfire, isCandle, isLitCandle, candleState, candleCount,
} from '../../blocks';
import { ENT_ITEM } from '../../mobs';
import { SOUL_FIRE, isSoulGround } from '../../blocks'; // Fase 7.5 (abismo)
import { rainAt } from '../../weather';
import { FIRE_RESISTANT_ITEMS } from '../../items'; // Fase 8.5
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { Nature } from './nature';
import { DIM_END } from '../../dimensions';
import type { ServerContext } from './context';

/** Ticks entre revisiones de un fuego (Minecraft: 30 + azar de 0 a 9). */
const FIRE_DELAY = 30, FIRE_DELAY_RAND = 10;
/** Cada cuántos ticks se miran las criaturas y objetos que tocan el fuego. */
const CONTACT_EVERY = 10;
/** Revisiones de fuego como mucho por tick (protege la CPU en un incendio grande). */
const MAX_PER_TICK = 64;

export class Fire {
  /** Otros sistemas que encienden algo en un bloque (la dinamita); si uno lo hace, no se mira más. */
  readonly igniters = new Handlers<[number, number, number], boolean>();
  /** Fuegos vivos: posición → tick de su próxima revisión. */
  private due = new Map<number, number>();

  /** Fase 7 (mecanismos): el fuego alcanza un bloque inflamable; true si otro sistema se encarga (la dinamita). */
  burned: ((x: number, y: number, z: number, id: number) => boolean) | null = null;

  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  get count(): number {
    return this.due.size;
  }

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    const k = posKey(x, y, z);
    if (isFire(id)) {
      if (!this.due.has(k)) this.due.set(k, this.ctx.tickCount + this.delay());
    } else if (isFire(old)) this.due.delete(k);
  }

  private delay(): number {
    return FIRE_DELAY + Math.floor(this.ctx.rand() * FIRE_DELAY_RAND);
  }

  /** Ticks aleatorios: fuegos de un mundo guardado que aún no se revisan y la lava que prende cosas. */
  private randomTick(id: number, x: number, y: number, z: number): boolean {
    if (isFire(id)) {
      const k = posKey(x, y, z);
      if (!this.due.has(k)) this.due.set(k, this.ctx.tickCount + this.delay());
      return true;
    }
    if (BLOCK_FLUID[id] === 2) {
      this.lavaTick(x, y, z);
      return false; // la lava no es sólo de este sistema
    }
    return false;
  }

  /**
   * Enciende fuego en la celda (x, y, z) si está vacía y el fuego se sostiene ahí (suelo sólido o
   * algo inflamable al lado). Devuelve true si lo encendió.
   */
  ignite(x: number, y: number, z: number, age = 0): boolean {
    const w = this.ctx.world;
    if (w.getBlock(x, y, z) !== AIR) return false;
    // Fase 7.5 (abismo): sobre arena o tierra de alma, fuego de alma (ni se extiende ni se apaga solo).
    if (isSoulGround(w.getBlock(x, y - 1, z))) {
      w.setBlock(x, y, z, SOUL_FIRE);
      return true;
    }
    if (!fireSupport((dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz))) return false;
    w.setBlock(x, y, z, fireWithAge(age));
    return true;
  }

  /**
   * Enciende lo que haya en el bloque (x, y, z): una vela apagada o una fogata apagada. Devuelve true
   * si encendió algo.
   */
  lightBlock(x: number, y: number, z: number): boolean {
    if (this.igniters.first(x, y, z)) return true; // Fase 7 (mecanismos): la dinamita, antes que nada
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    if (isCandle(id) && !isLitCandle(id)) {
      w.setBlock(x, y, z, candleState(id, candleCount(id), true));
      return true;
    }
    if (isCampfire(id) && stateProps(id)?.lit === 0) { // Fase 8.5: también la de almas
      w.setBlock(x, y, z, stateOf(familyBase(id), { ...stateProps(id)!, lit: 1 }));
      return true;
    }
    return false;
  }

  /** Un rayo cae en (x, y, z) (encima del bloque alcanzado): fuego ahí y, a veces, alrededor. */
  lightning(x: number, y: number, z: number): void {
    if (this.ctx.difficulty < 2) return;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    this.ignite(bx, by, bz);
    for (let i = 0; i < 4; i++) {
      if (this.ctx.rand() < 0.5) continue;
      const nx = bx + Math.floor(this.ctx.rand() * 3) - 1, nz = bz + Math.floor(this.ctx.rand() * 3) - 1;
      const top = this.ctx.world.skyTop(nx, nz);
      if (Math.abs(top + 1 - by) <= 2) this.ignite(nx, top + 1, nz);
    }
  }

  tick(): void {
    const ctx = this.ctx;
    if (this.due.size > 0) {
      let budget = MAX_PER_TICK;
      for (const [k, t] of this.due) {
        if (t > ctx.tickCount) continue;
        if (budget-- <= 0) break;
        this.due.delete(k);
        this.fireTick(keyX(k), keyY(k), keyZ(k));
      }
    }
    if (ctx.tickCount % CONTACT_EVERY === 0 && this.due.size > 0) this.contacts();
  }

  /** ¿Llueve sobre la celda o sobre una vecina a cielo abierto? */
  private nearRain(x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    if (rainAt(ctx.worldTime(), ctx.seed) <= 0.2) return false;
    const w = ctx.world;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.skyTop(x + dx, z + dz) < y) return true;
    return false;
  }

  /** ¿Hay algo inflamable junto a la celda? */
  private flammableAround(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    for (const [dx, dy, dz] of NEIGHBORS6) if (flammability(w.getBlock(x + dx, y + dy, z + dz)) > 0) return true;
    return false;
  }

  /** Revisión de un fuego (la regla de Minecraft, con el azar del servidor). */
  fireTick(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const id = w.getBlock(x, y, z);
    if (!isFire(id)) return;
    const rand = () => ctx.rand();
    const int = (n: number) => Math.floor(rand() * n);
    const get = (dx: number, dy: number, dz: number) => w.getBlock(x + dx, y + dy, z + dz);
    if (!fireSupport(get)) {
      this.extinguish(x, y, z, false);
      return;
    }
    const below = get(0, -1, 0);
    // infiniburn_overworld (netherrack y magma); en el End (infiniburn_end), también el lecho de roca (Fase 8.6).
    const infinite = below === NETHERRACK || below === MAGMA_BLOCK || (ctx.dim === DIM_END && below === BEDROCK);
    const age = fireAge(id);
    if (!infinite && this.nearRain(x, y, z) && rand() < 0.2 + age * 0.03) {
      this.extinguish(x, y, z, true);
      return;
    }
    const newAge = Math.min(15, age + Math.floor(int(3) / 2));
    if (newAge !== age) w.setBlock(x, y, z, fireWithAge(newAge));
    this.due.set(posKey(x, y, z), ctx.tickCount + this.delay());
    if (!infinite) {
      if (!this.flammableAround(x, y, z)) {
        // Sin nada que quemar: sin suelo firme o ya viejo, se apaga.
        if (below <= 0 || !BLOCK_SOLID[below] || age > 3) this.extinguish(x, y, z, false);
        return;
      }
      if (age === 15 && int(4) === 0 && flammability(below) === 0) {
        this.extinguish(x, y, z, false);
        return;
      }
    }
    // Quemar los vecinos (arriba y abajo, un poco menos).
    for (const [dx, dy, dz] of NEIGHBORS6) this.burnOut(x + dx, y + dy, z + dz, dy !== 0 ? 250 : 300, age);
    // Propagarse a los huecos de alrededor (hasta 4 bloques por encima) que tengan algo inflamable al lado.
    const diff = ctx.difficulty;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 4; dy++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const px = x + dx, py = y + dy, pz = z + dz;
          const odds = this.igniteOdds(px, py, pz);
          if (odds <= 0) continue;
          const chanceBase = dy > 1 ? 100 + (dy - 1) * 100 : 100;
          const s = Math.floor((odds + 40 + diff * 7) / (age + 30));
          if (s > 0 && int(chanceBase) <= s && !this.nearRain(px, py, pz)) {
            w.setBlock(px, py, pz, fireWithAge(Math.min(15, age + Math.floor(int(5) / 4))));
          }
        }
      }
    }
  }

  /** Facilidad para que prenda un hueco (la mayor de sus vecinos); 0 si no está vacío. */
  private igniteOdds(x: number, y: number, z: number): number {
    const w = this.ctx.world;
    if (w.getBlock(x, y, z) !== AIR) return 0;
    let best = 0;
    for (const [dx, dy, dz] of NEIGHBORS6) best = Math.max(best, flameEncouragement(w.getBlock(x + dx, y + dy, z + dz)));
    return best;
  }

  /** El fuego consume (o prende) un bloque inflamable vecino. */
  private burnOut(x: number, y: number, z: number, chance: number, age: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const id = w.getBlock(x, y, z);
    const burn = flammability(id);
    if (burn <= 0 || Math.floor(ctx.rand() * chance) >= burn) return;
    if (this.burned?.(x, y, z, id)) return; // Fase 7 (mecanismos): la dinamita se enciende
    if (Math.floor(ctx.rand() * (age + 10)) < 5 && !this.nearRain(x, y, z)) {
      w.setBlock(x, y, z, fireWithAge(Math.min(15, age + Math.floor(Math.floor(ctx.rand() * 5) / 4))));
    } else w.setBlock(x, y, z, AIR);
    ctx.fx('fire_burn', x + 0.5, y + 0.5, z + 0.5);
  }

  /** Apaga un fuego (`hiss`: chisporroteo de agua, con la lluvia). */
  extinguish(x: number, y: number, z: number, hiss: boolean): void {
    if (!isFire(this.ctx.world.getBlock(x, y, z))) return;
    this.ctx.world.setBlock(x, y, z, AIR);
    if (hiss) this.ctx.fx('fire_extinguish', x + 0.5, y + 0.3, z + 0.5);
  }

  /** La lava prende lo inflamable que tiene cerca (el tick aleatorio de la lava de Minecraft). */
  private lavaTick(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const int = (n: number) => Math.floor(ctx.rand() * n);
    const tries = int(3);
    if (tries > 0) {
      let px = x, py = y, pz = z;
      for (let j = 0; j < tries; j++) {
        px += int(3) - 1;
        py += 1;
        pz += int(3) - 1;
        const b = w.getBlock(px, py, pz);
        if (b < 0) return;
        if (b === AIR) {
          if (this.flammableAround(px, py, pz)) {
            w.setBlock(px, py, pz, fireWithAge(0));
            return;
          }
        } else if (BLOCK_SOLID[b]) return;
      }
    } else {
      for (let j = 0; j < 3; j++) {
        const px = x + int(3) - 1, pz = z + int(3) - 1;
        if (w.getBlock(px, y + 1, pz) === AIR && flammability(w.getBlock(px, y, pz)) > 0) w.setBlock(px, y + 1, pz, fireWithAge(0));
      }
    }
  }

  /** Criaturas que tocan el fuego: se prenden (8 s) y reciben un golpe; los objetos arden. */
  private contacts(): void {
    const ctx = this.ctx;
    const w = ctx.world;
    for (const e of ctx.entities.list.values()) {
      if (e.dead) continue;
      const feet = w.getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z));
      const body = w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height * 0.6), Math.floor(e.z));
      const soul = feet === SOUL_FIRE || body === SOUL_FIRE; // Fase 7.5 (abismo): el fuego de alma quema el doble
      if (!isFire(feet) && !isFire(body) && !soul) continue;
      if (e.type === ENT_ITEM) {
        if (e.stack && FIRE_RESISTANT_ITEMS.has(e.stack.id)) continue; // Fase 8.5: la netherita no arde
        ctx.entities.remove(e.id);
        ctx.fx('burn_item', e.x, e.y, e.z);
      } else if (e.ai && !e.inWater) {
        e.fire = Math.max(e.fire, 8);
        ctx.entities.damage(e, soul ? 2 : 1, e.x, e.z, null, 0);
      }
    }
  }
}

