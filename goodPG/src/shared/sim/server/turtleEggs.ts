// Huevos de tortuga (fase 6): con cada tick aleatorio, sobre arena, se agrietan (siempre de noche y
// muy de vez en cuando de día); al tercer paso se rompen y nacen tantas crías como huevos había.
import { AIR, SAND, RED_SAND, isTurtleEgg, turtleEggState, turtleEggBlock } from '../../blocks';
import { MOB_TURTLE } from '../../mobs';
import { sunHeightAt } from '../../weather';
import type { Nature } from './nature';
import type { ServerContext } from './context';

/** Probabilidad de agrietarse en un tick aleatorio de día (de noche, siempre). */
const DAY_CRACK_CHANCE = 1 / 40;

export class TurtleEggs {
  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  private randomTick(id: number, x: number, y: number, z: number): boolean {
    if (!isTurtleEgg(id)) return false;
    const w = this.ctx.world;
    const below = w.getBlock(x, y - 1, z);
    if (below !== SAND && below !== RED_SAND) return true;
    const night = sunHeightAt(this.ctx.worldTime()) < 0;
    if (!night && this.ctx.rand() > DAY_CRACK_CHANCE) return true;
    this.crack(x, y, z);
    return true;
  }

  /** Un paso de eclosión: agrieta los huevos o, si ya estaban muy agrietados, nacen las crías. */
  crack(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    if (!isTurtleEgg(id)) return;
    const { eggs, hatch } = turtleEggState(id);
    if (hatch < 2) {
      w.setBlock(x, y, z, turtleEggBlock(eggs, hatch + 1));
      this.ctx.fx('turtle_egg_crack', x + 0.5, y + 0.3, z + 0.5);
      return;
    }
    w.setBlock(x, y, z, AIR);
    this.ctx.fx('turtle_egg_hatch', x + 0.5, y + 0.3, z + 0.5);
    for (let i = 0; i < eggs; i++) {
      const baby = this.ctx.entities.spawnMob(MOB_TURTLE, x + 0.3 + this.ctx.rand() * 0.4, y, z + 0.3 + this.ctx.rand() * 0.4, true);
      // Las crías recuerdan su playa: allí volverán a poner huevos de mayores.
      if (baby) this.ctx.entities.aquatic.setHome(baby, x, y, z);
    }
  }
}
