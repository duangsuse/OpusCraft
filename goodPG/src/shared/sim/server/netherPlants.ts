// Fase 8.2 (biomas del Nether): las plantas del Nether en el servidor, como en Java 26.3.
// - Necelio (NyliumBlock): con un tick aleatorio, si lo tapa un bloque que no deja pasar la luz, vuelve a ser
//   rocanegra. Con polvo de hueso (si tiene aire encima) echa la vegetación de su bosque alrededor.
// - Rocanegra (NetherrackBlock): con polvo de hueso, si encima deja pasar la luz y hay necelio en los 26
//   bloques de alrededor, se vuelve necelio de ese tipo (de uno de los dos al azar si hay de ambos).
// - Hongos (NetherFungusBlock): con polvo de hueso sobre su necelio, un 40 % de las veces crece el hongo
//   gigante (el plantado: rompe lo que estorbe).
// - Enredaderas lloronas y retorcidas (GrowingPlantHeadBlock): la punta, con edad menor que 25, crece un
//   bloque con probabilidad 0,1 en cada tick aleatorio si hay aire; con polvo de hueso crecen varios bloques
//   (tantos como aciertos seguidos al 82,6 %), también desde el tallo. La que tiene otra enredadera delante
//   pasa a tallo y el tallo que se queda sin nada delante vuelve a ser punta (con una edad al azar).
import {
  AIR, NETHERRACK, CRIMSON_NYLIUM, WARPED_NYLIUM, BLOCK_LIGHT_OPACITY, BLOCK_OPAQUE, isNylium, isNetherFungus, fungusNylium,
  netherVineOf, vineAge, vineHead, VINE_MAX_AGE, WARPED_FUNGUS,
} from '../../blocks';
import { hugeFungus, nyliumBonemeal, type FeatureLevel } from '../../world/netherFeatures';
import { NoiseRandom } from '../../world/javaNoise';
import { blockDrops } from '../drops';
import type { Nature } from './nature';
import type { ServerContext } from './context';

/** Probabilidad de crecer de la punta de una enredadera del Nether en cada tick aleatorio (NetherVines). */
const VINE_GROW_CHANCE = 0.1;
/** Probabilidad de seguir creciendo con polvo de hueso (NetherVines.getBlocksToGrowWhenBonemealed). */
const VINE_BONEMEAL_CHANCE = 0.826;
/** Probabilidad de que crezca el hongo gigante con polvo de hueso. */
const FUNGUS_BONEMEAL_CHANCE = 0.4;

/** ¿Deja pasar la luz hacia abajo? (propagatesSkylightDown: aire, cristal, plantas…). */
const lightPasses = (id: number) => id === AIR || (id > 0 && BLOCK_LIGHT_OPACITY[id] === 0);

export class NetherPlants {
  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  private rng(): NoiseRandom {
    return new NoiseRandom((this.ctx.rand() * 0x7fffffff) | 0);
  }

  /** El mundo del servidor como sitio donde poner una feature (el hongo gigante, la vegetación del necelio). */
  private level(): FeatureLevel {
    const w = this.ctx.world;
    return {
      get: (x, y, z) => w.getBlock(x, y, z),
      set: (x, y, z, id) => {
        if (w.getBlock(x, y, z) >= 0) w.setBlock(x, y, z, id);
      },
      biome: (x, z) => w.gen.biomeAt(x, z),
      destroy: (x, y, z) => {
        const id = w.getBlock(x, y, z);
        if (id <= 0) return;
        w.setBlock(x, y, z, AIR);
        this.ctx.entities.dropStacks(blockDrops(id, 0, () => this.ctx.rand()), x + 0.5, y + 0.3, z + 0.5);
      },
    };
  }

  private randomTick(id: number, x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    if (isNylium(id)) {
      // canBeNylium: lo que tiene encima no debe tapar la luz del todo.
      const above = w.getBlock(x, y + 1, z);
      if (above > 0 && (BLOCK_OPAQUE[above] || BLOCK_LIGHT_OPACITY[above] >= 15)) w.setBlock(x, y, z, NETHERRACK);
      return true;
    }
    const age = vineAge(id);
    if (age >= 0) {
      if (age < VINE_MAX_AGE && this.ctx.rand() < VINE_GROW_CHANCE) {
        const [head, , dir] = netherVineOf(id)!;
        if (w.getBlock(x, y + dir, z) === AIR) w.setBlock(x, y + dir, z, vineHead(head, age + 1));
      }
      return true;
    }
    return false;
  }

  /** Polvo de hueso en el Nether: necelio, rocanegra junto al necelio, hongos y enredaderas. */
  fertilize(x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    const w = ctx.world;
    const id = w.getBlock(x, y, z);
    if (isNylium(id)) {
      if (w.getBlock(x, y + 1, z) !== AIR) return false;
      nyliumBonemeal(this.level(), this.rng(), x, y + 1, z);
      ctx.fx('bonemeal', x + 0.5, y + 1.2, z + 0.5);
      return true;
    }
    if (id === NETHERRACK) {
      if (!lightPasses(w.getBlock(x, y + 1, z))) return false;
      let red = false, blue = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const b = w.getBlock(x + dx, y + dy, z + dz);
            if (b === CRIMSON_NYLIUM) red = true;
            else if (b === WARPED_NYLIUM) blue = true;
          }
        }
      }
      if (!red && !blue) return false;
      w.setBlock(x, y, z, red && blue ? (ctx.rand() < 0.5 ? WARPED_NYLIUM : CRIMSON_NYLIUM) : blue ? WARPED_NYLIUM : CRIMSON_NYLIUM);
      ctx.fx('bonemeal', x + 0.5, y + 1.2, z + 0.5);
      return true;
    }
    if (isNetherFungus(id)) {
      if (w.getBlock(x, y - 1, z) !== fungusNylium(id)) return false;
      ctx.fx('bonemeal', x + 0.5, y + 0.4, z + 0.5);
      if (ctx.rand() < FUNGUS_BONEMEAL_CHANCE) hugeFungus(this.level(), this.rng(), x, y, z, id === WARPED_FUNGUS, true);
      return true;
    }
    const vine = netherVineOf(id);
    if (vine) {
      const [head, , dir] = vine;
      // Desde el tallo, busca la punta.
      let hy = y;
      while (netherVineOf(w.getBlock(x, hy + dir, z))?.[0] === head) hy += dir;
      const tip = w.getBlock(x, hy, z);
      if (vineAge(tip) < 0 || w.getBlock(x, hy + dir, z) !== AIR) return false;
      let count = 0;
      for (let p = 1; ctx.rand() < p; count++) p *= VINE_BONEMEAL_CHANCE;
      let age = Math.min(vineAge(tip) + 1, VINE_MAX_AGE);
      for (let k = 0, cy = hy + dir; k < count && w.getBlock(x, cy, z) === AIR; k++, cy += dir) {
        w.setBlock(x, cy, z, vineHead(head, age));
        age = Math.min(age + 1, VINE_MAX_AGE);
      }
      ctx.fx('bonemeal', x + 0.5, y + 0.5, z + 0.5);
      return true;
    }
    return false;
  }

  /**
   * Un bloque cambió: las enredaderas de encima y de debajo se ponen en punta o en tallo según tengan o no
   * otra enredadera de su tipo delante (updateShape de GrowingPlantHeadBlock/BodyBlock).
   */
  onBlockChanged(x: number, y: number, z: number): void {
    for (const dy of [0, 1, -1]) this.fixVine(x, y + dy, z);
  }

  private fixVine(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    const v = netherVineOf(id);
    if (!v) return;
    const [head, body, dir] = v;
    const ahead = w.getBlock(x, y + dir, z);
    if (ahead < 0) return;
    const continues = netherVineOf(ahead)?.[0] === head;
    if (vineAge(id) >= 0 && continues) w.setBlock(x, y, z, body);
    else if (id === body && !continues) w.setBlock(x, y, z, vineHead(head, Math.floor(this.ctx.rand() * VINE_MAX_AGE)));
  }
}
