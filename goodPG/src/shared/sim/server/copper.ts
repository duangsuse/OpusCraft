// Cobre (fase 6.5): se oxida con los ticks aleatorios (normal → expuesto → degradado → oxidado), se
// encera con panal para que no cambie más y se raspa con un hacha (quita la cera o una fase). Un rayo
// que cae sobre cobre sin cera lo deja como nuevo y limpia a trozos el cobre que tiene al lado.
import { copperInfo, copperVariant, oxidizedCopper, waxedCopper, scrapedCopper, isDoor, OXIDIZED } from '../../blocks';
import { ITEMS, HONEYCOMB } from '../../items';
import { partnerOf, type Edit } from '../../placement';
import type { Nature } from './nature';
import type { BlockRules } from './blockRules';
import type { ServerContext } from './context';

/** Probabilidad de intentar oxidarse en cada tick aleatorio (la de Minecraft). */
export const OXIDIZE_CHANCE = 0.05688889;
/** Distancia (en pasos) a la que se mira el cobre de alrededor. */
const NEIGHBOR_RANGE = 4;

export class Copper {
  constructor(private ctx: ServerContext, nature: Nature, private rules: BlockRules) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  private randomTick(id: number, x: number, y: number, z: number): boolean {
    const info = copperInfo(id);
    if (!info) return false;
    if (info.waxed || info.stage >= OXIDIZED) return true;
    // Las puertas cambian enteras: decide la mitad de abajo.
    if (isDoor(id) && partnerOf(x, y, z, id)?.[1] === y - 1) return true;
    if (this.ctx.rand() < OXIDIZE_CHANCE) this.tryOxidize(x, y, z);
    return true;
  }

  /**
   * Intenta pasar a la siguiente fase, como en Minecraft: si hay cobre sin cera menos oxidado a 4
   * pasos o menos, espera; cuanto más cobre haya más oxidado alrededor, más fácil es. Así un tejado
   * de cobre se oxida parejo. Devuelve true si cambió.
   */
  tryOxidize(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    const info = copperInfo(id);
    if (!info || info.waxed || info.stage >= OXIDIZED) return false;
    let same = 0, more = 0;
    const R = NEIGHBOR_RANGE;
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R + Math.abs(dy); dz <= R - Math.abs(dy); dz++) {
        const rx = R - Math.abs(dy) - Math.abs(dz);
        for (let dx = -rx; dx <= rx; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const b = w.getBlock(x + dx, y + dy, z + dz);
          if (b <= 0) continue;
          const o = copperInfo(b);
          if (!o || o.waxed) continue;
          if (o.stage < info.stage) return false;
          if (o.stage > info.stage) more++;
          else same++;
        }
      }
    }
    const c = (more + 1) / (more + same + 1);
    if (this.ctx.rand() >= c * c * (info.stage === 0 ? 0.75 : 1)) return false;
    this.change(x, y, z, oxidizedCopper(id));
    return true;
  }

  /** Cambia un bloque de cobre por otra variante (las dos mitades de una puerta a la vez). */
  private change(x: number, y: number, z: number, next: number): void {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    if (!next || next === id) return;
    const edits: Edit[] = [[x, y, z, next]];
    const p = isDoor(id) ? partnerOf(x, y, z, id) : null;
    if (p) {
      const other = w.getBlock(p[0], p[1], p[2]);
      const info = copperInfo(next)!;
      if (isDoor(other) && copperInfo(other)?.kind === 'door') edits.push([p[0], p[1], p[2], copperVariant(other, info.stage, info.waxed)]);
    }
    this.rules.applyEdits(edits);
  }

  /**
   * Clic derecho sobre cobre con un panal (encerar) o un hacha (quitar la cera o una fase). null si
   * el objeto no sirve para esto; false si no había nada que hacer.
   */
  use(x: number, y: number, z: number, item: number): boolean | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!copperInfo(id)) return null;
    const axe = ITEMS[item]?.tool?.kind === 'axe';
    if (item !== HONEYCOMB && !axe) return null;
    const next = axe ? scrapedCopper(id) : waxedCopper(id);
    if (!next) return false;
    const fx = !axe ? 'copper_wax' : copperInfo(id)!.waxed ? 'copper_unwax' : 'copper_scrape';
    this.change(x, y, z, next);
    this.ctx.fx(fx, x + 0.5, y + 0.5, z + 0.5);
    return true;
  }

  /**
   * Cae un rayo en el bloque (x, y, z): si es cobre sin cera vuelve a estar como nuevo y, como en
   * Minecraft, unos paseos al azar por el cobre de alrededor le quitan una fase a cada bloque que pisan.
   */
  lightning(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    const info = copperInfo(id);
    if (!info || info.waxed) return;
    if (info.stage > 0) this.change(x, y, z, copperVariant(id, 0, false));
    const rand = () => this.ctx.rand();
    const walks = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < walks; k++) {
      let cx = x, cy = y, cz = z;
      const steps = 1 + Math.floor(rand() * 5);
      for (let s = 0; s < steps; s++) {
        let moved = false;
        for (let tries = 0; tries < 8 && !moved; tries++) {
          const nx = cx + Math.floor(rand() * 3) - 1, ny = cy + Math.floor(rand() * 3) - 1, nz = cz + Math.floor(rand() * 3) - 1;
          const b = w.getBlock(nx, ny, nz);
          const o = b > 0 ? copperInfo(b) : null;
          if (!o || o.waxed) continue;
          if (o.stage > 0) this.change(nx, ny, nz, copperVariant(b, o.stage - 1, false));
          cx = nx;
          cy = ny;
          cz = nz;
          moved = true;
        }
        if (!moved) break;
      }
    }
    this.ctx.fx('copper_scrape', x + 0.5, y + 0.5, z + 0.5);
  }
}
