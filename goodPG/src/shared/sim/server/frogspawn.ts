// Fase 6.5 (materiales): cría de las ranas y huevos de rana. Con bolas de slime las ranas entran en
// modo amor (items.ts); dos ranas enamoradas a menos de 8 bloques crían y una queda preñada: en cuanto
// tiene agua quieta cerca pone sus huevos encima (como el nenúfar). Los huevos eclosionan con los
// ticks aleatorios (unos minutos de media) en 2 a 6 renacuajos. El amor se gasta como el de los
// animales de granja (animalLife); su movimiento es el de las ranas (aquaticLife), así que la pareja se
// forma aquí en cuanto están cerca.
import { AIR, WATER, FROGSPAWN, BLOCK_FLUID, BLOCK_FLUID_LEVEL } from '../../blocks';
import { MOB_FROG, MOB_TADPOLE } from '../../mobs';
import { breedXp } from '../../experience';
import { BREED_COOLDOWN, type Entity } from '../entities/types';
import type { Nature } from './nature';
import type { ServerContext } from './context';

/** Cada cuántos ticks se revisan las ranas. */
const PERIOD = 10;
/** Probabilidad de eclosionar en cada tick aleatorio (≈ 5 minutos de media). */
export const HATCH_CHANCE = 0.2;
/** Segundos que una rana preñada busca agua antes de rendirse. */
const PREGNANT_SECONDS = 300;

export class Frogspawn {
  /** Ranas preñadas: id de la entidad → segundos que le quedan para poner. */
  private pregnant = new Map<number, number>();

  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  tick(): void {
    const ctx = this.ctx;
    if (ctx.tickCount % PERIOD !== 0) return;
    const dt = PERIOD / 20;
    const frogs: Entity[] = [];
    for (const e of ctx.entities.list.values()) if (e.type === MOB_FROG && !e.dead) frogs.push(e);
    // Parejas: dos adultas enamoradas cerca una de otra.
    for (const a of frogs) {
      if (!((a.love ?? 0) > 0)) continue;
      for (const b of frogs) {
        if (b === a || !((b.love ?? 0) > 0) || Math.abs(a.y - b.y) > 3 || Math.hypot(a.x - b.x, a.z - b.z) > 8) continue;
        this.breed(a, b);
        break;
      }
    }
    // Ranas preñadas: poner los huevos en el agua quieta más cercana.
    for (const [id, left] of this.pregnant) {
      const e = ctx.entities.list.get(id);
      if (!e || e.dead || left <= 0) {
        this.pregnant.delete(id);
        continue;
      }
      this.pregnant.set(id, left - dt);
      const spot = this.waterSpot(e);
      if (!spot) continue;
      ctx.world.setBlock(spot[0], spot[1], spot[2], FROGSPAWN);
      ctx.fx('splash', spot[0] + 0.5, spot[1] + 0.1, spot[2] + 0.5);
      this.pregnant.delete(id);
    }
  }

  private breed(a: Entity, b: Entity): void {
    const ctx = this.ctx;
    a.love = b.love = 0;
    a.breedCd = b.breedCd = BREED_COOLDOWN;
    const x = (a.x + b.x) / 2, y = Math.max(a.y, b.y), z = (a.z + b.z) / 2;
    ctx.fx('breed', x, y + 0.6, z);
    ctx.entities.xp.spawn(breedXp(() => ctx.rand()), x, y + 0.3, z);
    this.pregnant.set(a.id, PREGNANT_SECONDS);
  }

  /** ¿Está preñada esta rana? (para las pruebas). */
  isPregnant(id: number): boolean {
    return this.pregnant.has(id);
  }

  /** Celda de aire sobre una fuente de agua a 6 bloques o menos de la rana (la más cercana), o null. */
  private waterSpot(e: Entity): [number, number, number] | null {
    const w = this.ctx.world;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dz = -6; dz <= 6; dz++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = dx * dx + dz * dz;
        if (d >= bd || d > 36) continue;
        for (let dy = -3; dy <= 1; dy++) {
          const b = w.getBlock(bx + dx, by + dy, bz + dz);
          if (b !== WATER || BLOCK_FLUID[b] !== 1 || BLOCK_FLUID_LEVEL[b] !== 0) continue;
          if (w.getBlock(bx + dx, by + dy + 1, bz + dz) !== AIR) continue;
          bd = d;
          best = [bx + dx, by + dy + 1, bz + dz];
          break;
        }
      }
    }
    return best;
  }

  private randomTick(id: number, x: number, y: number, z: number): boolean {
    if (id !== FROGSPAWN) return false;
    if (this.ctx.rand() < HATCH_CHANCE) this.hatch(x, y, z);
    return true;
  }

  /** Los huevos se abren: 2 a 6 renacuajos en el agua de debajo. */
  hatch(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (ctx.world.getBlock(x, y, z) !== FROGSPAWN) return;
    ctx.world.setBlock(x, y, z, AIR);
    ctx.fx('splash', x + 0.5, y + 0.1, z + 0.5);
    const n = 2 + Math.floor(ctx.rand() * 5);
    for (let i = 0; i < n; i++) {
      ctx.entities.spawnMob(MOB_TADPOLE, x + 0.2 + ctx.rand() * 0.6, y - 0.7, z + 0.2 + ctx.rand() * 0.6);
    }
  }
}
