// Fase 8.6 (el End): lo que el servidor hace con las cosas del End.
// - Flor de coro (ChorusFlowerBlock.randomTick): con aire encima, sube (si debajo hay piedra del End, aire o un
//   tallo corto; más alto, cada vez menos) y deja tallo; si no, se ramifica a los lados (a más edad, menos) o se
//   muere. Las ramas nuevas tienen un año más; a los 5 años, muerta.
// - Plataforma de llegada: cada vez que alguien llega al End se rehace la de obsidiana (5 × 5, con aire encima),
//   como EndPlatformFeature.createEndPlatform.
// - Marcos del portal del End: el ojo de ender se engasta en un marco vacío; si con él queda un anillo de doce
//   marcos con ojo mirando hacia dentro alrededor de un hueco de 3 × 3 (el patrón de EndPortalFrameBlock), el hueco
//   se llena de portal y suena en toda la dimensión.
import {
  AIR, END_STONE, OBSIDIAN, CHORUS_PLANT, CHORUS_FLOWER, CHORUS_FLOWER_DEAD_AGE, END_PORTAL_FRAME, END_PORTAL, isChorusFlower,
  isChorusPlant, isEndPortalFrame, stateOf, stateProps,
} from '../../blocks';
import { ENDER_EYE } from '../../items';
import { END_SPAWN } from '../../world/end';
import type { Nature } from './nature';
import type { ServerContext, Session } from './context';

const HORIZ: readonly (readonly [number, number])[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
/** Direcciones horizontales (0 norte, 1 este, 2 sur, 3 oeste). */
const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];

/** Orientación y ojo de un marco del portal del End (o null si no lo es). */
export function frameState(id: number): { facing: number; eye: number } | null {
  if (!isEndPortalFrame(id)) return null;
  const st = stateProps(id);
  return st ? { facing: st.facing, eye: st.eye } : null;
}

export class EndGoods {
  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => {
      if (!isChorusFlower(id)) return false;
      this.growFlower(id, x, y, z);
      return true;
    });
  }

  private get(x: number, y: number, z: number): number {
    return this.ctx.world.getBlock(x, y, z);
  }

  private neighborsEmpty(x: number, y: number, z: number, ignore: number): boolean {
    for (let d = 0; d < 4; d++) if (d !== ignore && this.get(x + HORIZ[d][0], y, z + HORIZ[d][1]) !== AIR) return false;
    return true;
  }

  private placeFlower(x: number, y: number, z: number, age: number): void {
    this.ctx.world.setBlock(x, y, z, CHORUS_FLOWER + age);
    this.ctx.fx('chorus_grow', x + 0.5, y + 0.5, z + 0.5);
  }

  private growFlower(id: number, x: number, y: number, z: number): void {
    const age = id - CHORUS_FLOWER;
    if (age >= CHORUS_FLOWER_DEAD_AGE || this.get(x, y + 1, z) !== AIR || y + 1 >= 255) return;
    const r = () => this.ctx.rand();
    let up = false, stoneBelow = false;
    const below = this.get(x, y - 1, z);
    if (below === END_STONE) up = true;
    else if (isChorusPlant(below)) {
      let height = 1;
      for (let i = 0; i < 4; i++) {
        const st = this.get(x, y - height - 1, z);
        if (!isChorusPlant(st)) {
          if (st === END_STONE) stoneBelow = true;
          break;
        }
        height++;
      }
      if (height < 2 || height <= Math.floor(r() * (stoneBelow ? 5 : 4))) up = true;
    } else if (below === AIR) up = true;
    const w = this.ctx.world;
    if (up && this.neighborsEmpty(x, y + 1, z, -1) && this.get(x, y + 2, z) === AIR) {
      w.setBlock(x, y, z, CHORUS_PLANT);
      this.placeFlower(x, y + 1, z, age);
      return;
    }
    if (age < 4) {
      let stems = Math.floor(r() * 4);
      if (stoneBelow) stems++;
      let placed = false;
      for (let i = 0; i < stems; i++) {
        const d = Math.floor(r() * 4);
        const tx = x + HORIZ[d][0], tz = z + HORIZ[d][1];
        if (this.get(tx, y, tz) === AIR && this.get(tx, y - 1, tz) === AIR && this.neighborsEmpty(tx, y, tz, d ^ 1)) {
          this.placeFlower(tx, y, tz, age + 1);
          placed = true;
        }
      }
      if (placed) w.setBlock(x, y, z, CHORUS_PLANT);
      else w.setBlock(x, y, z, CHORUS_FLOWER + CHORUS_FLOWER_DEAD_AGE);
      return;
    }
    w.setBlock(x, y, z, CHORUS_FLOWER + CHORUS_FLOWER_DEAD_AGE);
  }

  /** Clic derecho con algo sobre un bloque: el ojo de ender en un marco vacío (true si lo atiende). */
  use(_s: Session, x: number, y: number, z: number, id: number, item: number): boolean {
    const f = frameState(id);
    if (!f || f.eye || item !== ENDER_EYE) return false;
    const w = this.ctx.world;
    w.setBlock(x, y, z, stateOf(END_PORTAL_FRAME, { facing: f.facing, eye: 1 }));
    this.ctx.fx('end_frame_fill', x + 0.5, y + 0.8, z + 0.5);
    const hole = this.completedPortal(x, y, z, f.facing);
    if (hole) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.setBlock(hole[0] + dx, y, hole[1] + dz, END_PORTAL);
      this.ctx.fx('end_portal_spawn', hole[0] + 0.5, y + 0.75, hole[1] + 0.5);
    }
    return true;
  }

  /**
   * ¿Cierra el marco (x, y, z) que mira hacia `facing` un portal? El centro del hueco está dos bloques hacia dentro
   * (y a un lado o al otro); vale si los doce marcos del anillo tienen ojo y miran hacia el hueco.
   */
  private completedPortal(x: number, y: number, z: number, facing: number): [number, number] | null {
    const w = this.ctx.world;
    const px = DX[(facing + 1) & 3], pz = DZ[(facing + 1) & 3];
    for (let k = -1; k <= 1; k++) {
      const cx = x + DX[facing] * 2 + px * k, cz = z + DZ[facing] * 2 + pz * k;
      let ok = true;
      for (let side = 0; side < 4 && ok; side++) {
        // El lado que mira hacia `side` está a dos bloques del centro en la dirección contraria.
        const bx = cx - DX[side] * 2, bz = cz - DZ[side] * 2;
        const sx = DX[(side + 1) & 3], sz = DZ[(side + 1) & 3];
        for (let j = -1; j <= 1 && ok; j++) {
          const fs = frameState(w.getBlock(bx + sx * j, y, bz + sz * j));
          ok = !!fs && fs.eye === 1 && fs.facing === side;
        }
      }
      if (ok) return [cx, cz];
    }
    return null;
  }

  /** Alguien llega al End: la plataforma de obsidiana, entera y despejada. */
  rebuildPlatform(): void {
    const w = this.ctx.world;
    const [px, py, pz] = END_SPAWN;
    w.ensureChunk(px >> 4, pz >> 4, this.ctx.now());
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const want = dy === -1 ? OBSIDIAN : AIR;
          if (w.getBlock(px + dx, py + dy, pz + dz) !== want) w.setBlock(px + dx, py + dy, pz + dz, want);
        }
      }
    }
  }
}
