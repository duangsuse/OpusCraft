// Fase 6.5 (océano y plantas): lo que hacen solos los bloques del mar y las plantas nuevas.
// - Corales: fuera del agua (o un bloque de coral sin agua al lado) se mueren a los 3–5 segundos.
// - Algas: crecen hacia arriba mientras haya agua; la de arriba es la punta y las de debajo, tallo.
// - Esponjas: al ponerlas o al llegarles agua, la absorben alrededor (hasta 65 bloques a 6 pasos) y
//   se mojan; las plantas marinas que había se sueltan y los corales y pepinos se quedan secos.
// - Arbustos de bayas dulces: crecen con luz; con bayas se cosechan con clic derecho.
// - Plantaformas grandes: al pisarlas se inclinan (y dejan caer) y al rato vuelven a su sitio.
// - Polvo de hueso sobre las plantas nuevas (ver fertilize).
import {
  AIR, WATER, SPONGE, WET_SPONGE, BLOCK_FLUID, BLOCK_OPAQUE, BLOCK_RENDER, BLOCK_REPLACEABLE, R_CROSS, SWEET_BERRY_BUSH,
  KELP_TOP, KELP_STEM, SEAGRASS_SHORT, TALL_SEAGRASS_LOWER, TALL_SEAGRASS_UPPER, BIG_DRIPLEAF, BIG_DRIPLEAF_STEM, AZALEA,
  FLOWERING_AZALEA, TALL_FLOWERS, GROWS_TALL, isKelp, isLiveCoral, coralAlive, deadCoralOf, isWaterlogged, isSeaPickle,
  isCoralBlock, isSweetBerryBush, berryAge, isRipeBerryBush, isBigDripleaf, dripleafTilt, tallPlantBase, seaPickleBlock,
  familyBase, stateOf, stateProps, isLeaves,
} from '../../blocks';
import { SWEET_BERRIES } from '../../items';
import { STATE_DEAD } from '../../protocol';
import { MIN_Y, MAX_Y, hash2 } from '../../constants';
import { azaleaTree } from '../../world/oceanDecor';
import { blockDrops } from '../drops';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { Nature } from './nature';
import type { BlockRules } from './blockRules';
import type { ServerContext, Session } from './context';

const NEIGHBORS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
/** Pasos y bloques máximos que absorbe una esponja (como en Minecraft). */
const SPONGE_RANGE = 6, SPONGE_MAX = 65;
/** Altura máxima de un alga (según la columna: entre 8 y 20). */
const kelpMax = (x: number, z: number) => 8 + (hash2(x, z, 0x6e1b) % 13);

export class OceanLife {
  /** Corales que se van a morir: clave de posición → tick. */
  private dying = new Map<number, number>();
  /** Plantaformas inclinándose: clave → [paso (1 inclinándose, 2 inclinada, 3 vuelve), tick]. */
  private tilting = new Map<number, [number, number]>();

  constructor(private ctx: ServerContext, nature: Nature, private rules: BlockRules) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  // ------------------------------------------------------------------ cambios de bloques

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    const w = this.ctx.world;
    // Corales de la celda y de alrededor: ¿se quedan sin agua?
    this.checkCoral(x, y, z, id);
    for (const [dx, dy, dz] of NEIGHBORS6) this.checkCoral(x + dx, y + dy, z + dz, w.getBlock(x + dx, y + dy, z + dz));
    // Algas: sólo la de arriba es punta.
    if (isKelp(id)) {
      if (w.getBlock(x, y - 1, z) === KELP_TOP) w.setBlock(x, y - 1, z, KELP_STEM);
      if (id === KELP_STEM && !isKelp(w.getBlock(x, y + 1, z))) w.setBlock(x, y, z, KELP_TOP);
    } else if (isKelp(old) && w.getBlock(x, y - 1, z) === KELP_STEM) {
      w.setBlock(x, y - 1, z, KELP_TOP);
    }
    // Esponjas: al ponerlas o al llegarles agua.
    if (id === SPONGE) this.absorb(x, y, z);
    else if (id > 0 && BLOCK_FLUID[id] === 1) {
      for (const [dx, dy, dz] of NEIGHBORS6) if (w.getBlock(x + dx, y + dy, z + dz) === SPONGE) this.absorb(x + dx, y + dy, z + dz);
    }
  }

  private checkCoral(x: number, y: number, z: number, id: number): void {
    if (!isLiveCoral(id)) return;
    const k = posKey(x, y, z);
    if (this.dying.has(k)) return;
    const w = this.ctx.world;
    if (coralAlive(id, (dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz))) return;
    this.dying.set(k, this.ctx.tickCount + 60 + Math.floor(this.ctx.rand() * 40));
  }

  /** La esponja de (x, y, z) absorbe el agua de alrededor y se moja (si había agua). */
  absorb(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    const seen = new Set<number>([posKey(x, y, z)]);
    let frontier: [number, number, number][] = [[x, y, z]];
    let taken = 0;
    for (let step = 0; step < SPONGE_RANGE && frontier.length && taken < SPONGE_MAX; step++) {
      const next: [number, number, number][] = [];
      for (const [cx, cy, cz] of frontier) {
        for (const [dx, dy, dz] of NEIGHBORS6) {
          if (taken >= SPONGE_MAX) break;
          const nx = cx + dx, ny = cy + dy, nz = cz + dz;
          const k = posKey(nx, ny, nz);
          if (seen.has(k) || ny <= MIN_Y || ny >= MAX_Y) continue;
          seen.add(k);
          const b = w.getBlock(nx, ny, nz);
          if (b <= 0 || BLOCK_FLUID[b] !== 1) continue;
          if (isWaterlogged(b)) {
            const st = stateProps(b);
            if (st && st.water !== undefined) {
              // Corales y pepinos: se quedan en seco.
              w.setBlock(nx, ny, nz, stateOf(familyBase(b), { ...st, water: 0 }));
            } else {
              // Algas y plantas marinas: se sueltan.
              w.setBlock(nx, ny, nz, AIR);
              this.ctx.entities.dropStacks(blockDrops(b, 0, () => this.ctx.rand()), nx + 0.5, ny + 0.3, nz + 0.5);
            }
          } else w.setBlock(nx, ny, nz, AIR);
          taken++;
          next.push([nx, ny, nz]);
        }
      }
      frontier = next;
    }
    if (taken === 0) return false;
    if (w.getBlock(x, y, z) === SPONGE) w.setBlock(x, y, z, WET_SPONGE);
    this.ctx.fx('fish_splash', x + 0.5, y + 0.5, z + 0.5);
    return true;
  }

  // ------------------------------------------------------------------ ticks

  tick(): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const now = ctx.tickCount;
    if (this.dying.size) {
      for (const [k, due] of this.dying) {
        if (due > now) continue;
        this.dying.delete(k);
        const x = keyX(k), y = keyY(k), z = keyZ(k);
        const id = w.getBlock(x, y, z);
        if (isLiveCoral(id) && !coralAlive(id, (dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz))) w.setBlock(x, y, z, deadCoralOf(id));
      }
    }
    if (now % 2 === 0) this.stepOnDripleaves();
    if (this.tilting.size) {
      for (const [k, [stage, due]] of this.tilting) {
        if (due > now) continue;
        const x = keyX(k), y = keyY(k), z = keyZ(k);
        if (!isBigDripleaf(w.getBlock(x, y, z))) {
          this.tilting.delete(k);
          continue;
        }
        if (stage < 3) {
          w.setBlock(x, y, z, BIG_DRIPLEAF + stage);
          this.tilting.set(k, [stage + 1, now + (stage === 1 ? 10 : 100)]);
        } else {
          w.setBlock(x, y, z, BIG_DRIPLEAF);
          this.tilting.delete(k);
        }
      }
    }
  }

  /** Jugadores de pie sobre una plantaforma grande plana: empieza a inclinarse. */
  private stepOnDripleaves(): void {
    const w = this.ctx.world;
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      const bx = Math.floor(s.p[0]), bz = Math.floor(s.p[2]);
      const by = Math.floor(s.p[1] - 0.1);
      const id = w.getBlock(bx, by, bz);
      if (dripleafTilt(id) !== 0) continue;
      const above = s.p[1] - by;
      if (above < 0.85 || above > 1.15) continue;
      const k = posKey(bx, by, bz);
      if (!this.tilting.has(k)) this.tilting.set(k, [1, this.ctx.tickCount + 10]);
    }
  }

  private randomTick(id: number, x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    const w = ctx.world;
    if (id === KELP_TOP) {
      if (ctx.rand() >= 0.14 || w.getBlock(x, y + 1, z) !== WATER) return true;
      let h = 1;
      while (h <= 25 && isKelp(w.getBlock(x, y - h, z))) h++;
      if (h < kelpMax(x, z)) w.setBlock(x, y + 1, z, KELP_TOP);
      return true;
    }
    if (isLiveCoral(id)) {
      this.checkCoral(x, y, z, id);
      return true;
    }
    if (isSweetBerryBush(id)) {
      const lit = w.skyTop(x, z) <= y || w.isLitByBlocks(x, y, z);
      if (berryAge(id) < 3 && lit && ctx.rand() < 0.2) w.setBlock(x, y, z, id + 1);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ uso y polvo de hueso

  /** Clic derecho sobre un bloque (cosechar bayas dulces). Devuelve true si lo atendió. */
  useBlock(_s: Session, x: number, y: number, z: number, id: number): boolean {
    if (!isRipeBerryBush(id)) return false;
    const ctx = this.ctx;
    const n = berryAge(id) === 3 ? 2 + Math.floor(ctx.rand() * 2) : 1 + Math.floor(ctx.rand() * 2);
    ctx.world.setBlock(x, y, z, SWEET_BERRY_BUSH + 1);
    ctx.entities.dropStacks([{ id: SWEET_BERRIES, count: n }], x + 0.5, y + 0.5, z + 0.5);
    return true;
  }

  /** Polvo de hueso sobre las plantas de la fase 6.5; devuelve true si ha hecho algo. */
  fertilize(x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    const w = ctx.world;
    const id = w.getBlock(x, y, z);
    if (id <= 0) return false;
    const done = (): boolean => {
      ctx.fx('bonemeal', x + 0.5, y + 0.4, z + 0.5);
      return true;
    };
    if (isSweetBerryBush(id)) {
      if (berryAge(id) >= 3) return false;
      w.setBlock(x, y, z, id + 1);
      return done();
    }
    if (id === SEAGRASS_SHORT) {
      if (w.getBlock(x, y + 1, z) !== WATER) return false;
      this.rules.applyEdits([[x, y, z, TALL_SEAGRASS_LOWER], [x, y + 1, z, TALL_SEAGRASS_UPPER]]);
      return done();
    }
    if (isSeaPickle(id)) {
      if (!isWaterlogged(id) || !isCoralBlock(w.getBlock(x, y - 1, z))) return false;
      w.setBlock(x, y, z, seaPickleBlock(4, true));
      for (let k = 0; k < 12; k++) {
        const bx = x + Math.floor(ctx.rand() * 5) - 2, bz = z + Math.floor(ctx.rand() * 5) - 2;
        for (let by = y + 1; by >= y - 1; by--) {
          if (!isCoralBlock(w.getBlock(bx, by - 1, bz)) || w.getBlock(bx, by, bz) !== WATER) continue;
          w.setBlock(bx, by, bz, seaPickleBlock(1 + Math.floor(ctx.rand() * 4), true));
          break;
        }
      }
      return done();
    }
    if (isBigDripleaf(id)) {
      let h = 1;
      while (h < 5 && w.getBlock(x, y - h, z) === BIG_DRIPLEAF_STEM) h++;
      if (h >= 5 || w.getBlock(x, y + 1, z) !== AIR) return false;
      this.rules.applyEdits([[x, y, z, BIG_DRIPLEAF_STEM], [x, y + 1, z, BIG_DRIPLEAF]]);
      return done();
    }
    const tall = tallPlantBase(id);
    if (tall >= 0) {
      if (!TALL_FLOWERS.includes(tall)) return false;
      ctx.entities.dropStacks([{ id: tall, count: 1 }], x + 0.5, y + 0.3, z + 0.5);
      return done();
    }
    const grown = GROWS_TALL.get(id);
    if (grown !== undefined) {
      if (w.getBlock(x, y + 1, z) !== AIR) return false;
      this.rules.applyEdits([[x, y, z, grown], [x, y + 1, z, grown + 1]]);
      return done();
    }
    if (id === AZALEA || id === FLOWERING_AZALEA) {
      if (ctx.rand() < 0.45) this.growAzalea(x, y, z);
      return done();
    }
    // Fondo bajo el agua: plantas marinas alrededor.
    if (BLOCK_OPAQUE[id] && w.getBlock(x, y + 1, z) === WATER) {
      for (let k = 0; k < 24; k++) {
        const bx = x + Math.floor(ctx.rand() * 7) - 3, bz = z + Math.floor(ctx.rand() * 7) - 3;
        for (let by = y + 2; by >= y - 1; by--) {
          const floor = w.getBlock(bx, by - 1, bz);
          if (floor <= 0 || !BLOCK_OPAQUE[floor] || w.getBlock(bx, by, bz) !== WATER) continue;
          if (ctx.rand() < 0.15 && w.getBlock(bx, by + 1, bz) === WATER) {
            this.rules.applyEdits([[bx, by, bz, TALL_SEAGRASS_LOWER], [bx, by + 1, bz, TALL_SEAGRASS_UPPER]]);
          } else w.setBlock(bx, by, bz, SEAGRASS_SHORT);
          break;
        }
      }
      return done();
    }
    return false;
  }

  /** Una azalea se convierte en árbol si hay sitio encima. */
  growAzalea(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    for (let k = 1; k <= 6; k++) {
      const b = w.getBlock(x, y + k, z);
      if (b < 0 || (b !== AIR && BLOCK_RENDER[b] !== R_CROSS && !isLeaves(b))) return;
    }
    w.setBlock(x, y, z, AIR);
    azaleaTree(x, y, z, this.ctx.rand(), (bx, by, bz, id, force) => {
      if (by <= MIN_Y || by >= MAX_Y) return;
      const cur = w.getBlock(bx, by, bz);
      if (cur < 0) return;
      if (cur === AIR || (force && (isLeaves(cur) || BLOCK_RENDER[cur] === R_CROSS || BLOCK_REPLACEABLE[cur]))) w.setBlock(bx, by, bz, id);
    });
  }
}
