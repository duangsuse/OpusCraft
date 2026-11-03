// Fase 7.5 (fauna): lo que las criaturas sueltas necesitan del servidor.
// - Rayos: en una tormenta, un rayo natural puede dejar una trampa de esqueletos (un caballo esqueleto y
//   un rayo sólo de luz) en vez de caer; y el rayo que toca a una champiñaca le cambia el color sin herirla.
// - Comerciante ambulante: llega con dos llamas de comerciante atadas.
// - Cabañas de bruja: su bruja y su gato negro aparecen con el chunk (criaturas de estructura); y, como en
//   Minecraft, cada minuto vuelve un gato negro si no queda ninguno cerca. Las brujas que salen de noche
//   dentro de la cabaña las pone el spawner.
import { MOB_CAT } from '../../mobs';
import { CAT_SKINS } from '../../companions';
import { STATE_DEAD } from '../../protocol';
import { locateStructure } from '../../world/structures';
import { swampHutSpawnSpot } from '../../world/swampHut';
import { critterStruck, spawnTraderLlamas } from '../entities/critters';
import { spawnTrapHorse, trapChance } from '../entities/skeletonTrap';
import type { Storms } from './storms';
import type { Trading } from './trading';
import type { ServerContext } from './context';

/** Distancia a la que un jugador «descubre» una cabaña (bloques). */
const HUT_RANGE = 64;
/** Segundos entre las visitas del gato negro a las cabañas (como el generador de gatos de Minecraft). */
const HUT_CAT_EVERY = 60;
const BLACK_CAT = CAT_SKINS.indexOf('negro');

export class CritterWorld {
  private catIn = HUT_CAT_EVERY;

  constructor(private ctx: ServerContext, storms: Storms, trading: Trading) {
    storms.natural = (x, y, z) => this.trap(x, y, z);
    storms.struck = (e) => critterStruck(ctx.entities, e);
    trading.onTraderSpawn = (trader) => {
      spawnTraderLlamas(ctx.entities, trader);
    };
  }

  /** Rayo natural: con suerte (según la dificultad) deja una trampa en vez de caer. */
  trap(x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    if (ctx.rand() >= trapChance(ctx.difficulty)) return false;
    if (!spawnTrapHorse(ctx.entities, x, y, z)) return false;
    // Sólo el destello y el trueno: ni daño ni fuego.
    ctx.broadcast({ t: 'fx', k: 'lightning', p: [Math.round(x * 100) / 100, y, Math.round(z * 100) / 100] });
    return true;
  }

  /** Una vez por segundo: cada minuto, el gato negro de las cabañas cercanas a los jugadores si falta. */
  tick(): void {
    const ctx = this.ctx;
    this.catIn -= 1;
    if (this.catIn > 0) return;
    this.catIn = HUT_CAT_EVERY;
    const seen = new Set<string>();
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      const o = locateStructure(ctx.world.gen, 'swamp_hut', Math.floor(s.p[0]), Math.floor(s.p[2]), 1);
      if (!o || Math.hypot(o[0] - s.p[0], o[2] - s.p[2]) > HUT_RANGE) continue;
      const key = `${o[0]},${o[2]}`;
      if (seen.has(key) || !ctx.world.isLoaded(Math.floor(o[0] / 16), Math.floor(o[2] / 16))) continue;
      seen.add(key);
      const spot = swampHutSpawnSpot(ctx.world.seed, o[0], o[1], o[2]);
      if (!this.catNear(spot)) this.spawnCat(spot);
    }
  }

  private catNear([x, y, z]: [number, number, number]): boolean {
    for (const e of this.ctx.entities.list.values()) {
      if (e.type === MOB_CAT && !e.dead && Math.abs(e.x - x) <= 16 && Math.abs(e.z - z) <= 16 && Math.abs(e.y - y) <= 8) return true;
    }
    return false;
  }

  private spawnCat(spot: [number, number, number]): void {
    const cat = this.ctx.entities.spawnMob(MOB_CAT, ...spot);
    if (!cat) return;
    cat.variant = BLACK_CAT;
    cat.persist = true;
  }
}
