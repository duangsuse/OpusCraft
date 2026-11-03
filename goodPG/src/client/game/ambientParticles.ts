// Partículas del ambiente alrededor del jugador (como el "animateTick" de Minecraft):
// - Pétalos que caen de los cerezos y, de vez en cuando, hojas de los demás árboles (de su color).
// - Llamas y humo de antorchas, hornos encendidos y fogatas; brasas que saltan de la lava.
// - Goteo bajo los techos con agua o lava encima y de las puntas de las estalactitas.
// - Esporas sobre el micelio, motas bajo el agua, luciérnagas en las noches despejadas y
//   salpicaduras de la lluvia en el suelo.
// Las fuentes fijas (antorchas, hornos, fogatas, lava) se buscan dos veces por segundo; el resto se
// descubre muestreando bloques al azar cada frame.
import { isEnderChest, isEndRod, WITHER_ROSE } from '../../shared/blocks'; // Fase 8.6; 8.7: la rosa marchita
import {
  BLOCK_SOLID, BLOCK_FLUID, TORCH, WALL_TORCH, isCampfire, MYCELIUM, POINTED_DRIPSTONE, GRASS, CHERRY_LEAVES, BIRCH_LEAVES,
  SPRUCE_LEAVES, isLeaves, isLitFurnace, familyBase, stateProps, blockFacing, anchorCharges, isBubbleColumn, bubbleColumnDown,
} from '../../shared/blocks';
import { DIR_X, DIR_Z } from '../../shared/blockModels';
import { TerrainGenerator } from '../../shared/world/terrain';
import { BIOME_MUSHROOM_FIELDS } from '../../shared/world/biomeIds';
import type { Game } from './Game';
import { COPPER_TORCH, COPPER_WALL_TORCH } from '../../shared/blocks'; // Fase 6.5 (cobre)
import { plantParticles } from './plantParticles'; // Fase 6.5 (océano y plantas)
import { isFire } from '../../shared/blocks'; // Fase 6.5 (equipo)
import { redstoneTorchTip, redstoneAmbient, dustMote } from './redstoneClient'; // Fase 7 (redstone)
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (entorno del Nether)

type P3 = [number, number, number];

/** Radio (bloques) de la búsqueda de fuentes fijas y del muestreo al azar. */
const SCAN_R = 12;
const SCAN_H = 8;
/** Bloques al azar que se miran por frame. */
const SAMPLES = 140;

export class AmbientParticles {
  private torches: P3[] = [];
  /** Fase 6.5 (cobre): antorchas de cobre (llama verde). */
  private copperTorches: P3[] = [];
  private furnaces: [number, number, number, number][] = [];
  private fires: P3[] = [];
  private lava: P3[] = [];
  /** Fase 6.5 (equipo): bloques de fuego (llamas, humo y chisporroteo). */
  private blazes: P3[] = [];
  /** Fase 7 (redstone): puntas de las antorchas de redstone encendidas (motas rojas). */
  private redTorches: P3[] = [];
  /** Fase 8.6: cofres de ender (partículas de portal) y varas del End (chispas desde la punta, hacia donde apunta). */
  private enderChests: P3[] = [];
  private endRods: [number, number, number, number][] = [];
  /** Fase 8.7: rosas marchitas (echan humo). */
  private witherRoses: P3[] = [];
  private scanT = 0;
  private tint = [0, 0, 0];

  constructor(private g: Game) {}

  update(dt: number): void {
    const g = this.g;
    const world = g.world;
    if (!world || dt <= 0) return;
    const fx = g.renderer.entities.pfx;
    const p = g.player;
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      this.scan(px, py, pz);
    }
    // Fuentes fijas.
    for (const [x, y, z] of this.torches) if (Math.random() < dt * 2.2) fx.torch(x, y, z);
    for (const [x, y, z] of this.copperTorches) if (Math.random() < dt * 2.2) fx.torch(x, y, z, true); // Fase 6.5 (cobre)
    for (const [x, y, z] of this.redTorches) if (Math.random() < dt * 2.5) dustMote(fx, x, y, z, 15, 0.04); // Fase 7 (redstone)
    // Fase 8.6 (EnderChestBlock.animateTick): tres partículas de portal que salen del cofre hacia fuera.
    for (const [x, y, z] of this.enderChests) {
      if (Math.random() > dt * 3) continue;
      for (let k = 0; k < 3; k++) {
        const sx = Math.random() < 0.5 ? -1 : 1, sz = Math.random() < 0.5 ? -1 : 1;
        fx.portal(x + 0.5 + 0.25 * sx, y + Math.random() - 0.6, z + 0.5 + 0.25 * sz, sx * Math.random(), (Math.random() - 0.5) * 0.25, sz * Math.random());
      }
    }
    // Fase 8.7 (WitherRoseBlock.animateTick): humo que sale de la flor (tres oportunidades por vez, la mitad de las veces).
    for (const [x, y, z] of this.witherRoses) {
      if (Math.random() > dt * 2) continue;
      for (let k = 0; k < 3; k++) if (Math.random() < 0.5) fx.smoke(x + 0.5 + Math.random() / 5 - 0.1, y + 0.5 - Math.random() * 0.5 + 0.25, z + 0.5 + Math.random() / 5 - 0.1, 1, 0.01, 0.2, 0.06, 0.5);
    }
    // Fase 8.6 (EndRodBlock.animateTick): una chispa de vez en cuando junto a la punta, que se aleja despacio.
    for (const [x, y, z, f] of this.endRods) {
      if (Math.random() > dt * 4) continue;
      const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][f];
      const j = () => (Math.random() - 0.5) * 0.3;
      fx.endRod(x + 0.5 + d[0] * 0.4 + j(), y + 0.5 + d[1] * 0.4 + j(), z + 0.5 + d[2] * 0.4 + j(), d[0] * 0.3 + j(), d[1] * 0.3 + j(), d[2] * 0.3 + j());
    }
    for (const [x, y, z, f] of this.furnaces) {
      if (Math.random() < dt * 1.2) {
        // Llama junto a la boca del horno y humo encima.
        const side = (Math.random() - 0.5) * 0.5;
        const ox = f >= 0 ? DIR_X[f] * 0.52 + (DIR_Z[f] !== 0 ? side : 0) : 0, oz = f >= 0 ? DIR_Z[f] * 0.52 + (DIR_X[f] !== 0 ? side : 0) : 0;
        fx.flame(x + 0.5 + ox, y + 0.2 + Math.random() * 0.25, z + 0.5 + oz, 0.6);
        if (Math.random() < 0.5) fx.smoke(x + 0.5 + ox, y + 0.55, z + 0.5 + oz, 1, 0.05, 0.4, 0.08, 0.8);
      }
    }
    for (const [x, y, z] of this.fires) {
      if (Math.random() < dt * 3) fx.campfireSmoke(x + 0.5, y + 0.6, z + 0.5);
      if (Math.random() < dt * 0.8) fx.ember(x + 0.5, y + 0.4, z + 0.5);
      if (Math.random() < dt * 2) fx.flame(x + 0.5 + (Math.random() - 0.5) * 0.5, y + 0.3, z + 0.5 + (Math.random() - 0.5) * 0.5, 0.8);
    }
    for (const [x, y, z] of this.blazes) {
      if (Math.random() < dt * 4) fx.flame(x + 0.2 + Math.random() * 0.6, y + 0.1 + Math.random() * 0.5, z + 0.2 + Math.random() * 0.6, 1.1);
      if (Math.random() < dt * 1.5) fx.smoke(x + 0.5, y + 0.9, z + 0.5, 1, 0.3, 0.2, 0.2, 1.3);
      if (Math.random() < dt * 0.5) g.audio.playEquipSfx('fire_crackle', [x + 0.5, y + 0.5, z + 0.5]);
    }
    for (const [x, y, z] of this.lava) {
      if (Math.random() < dt * 0.12) {
        fx.ember(x + Math.random(), y + 1, z + Math.random());
        if (Math.random() < 0.5) fx.smoke(x + 0.5, y + 1.1, z + 0.5, 1, 0.2, 0.3, 0.12, 0.6);
      }
    }
    // Muestreo al azar (independiente de los fps: más muestras cuanto más largo el frame).
    const n = Math.min(400, Math.round(SAMPLES * (dt / (1 / 60))));
    const gen = world.generator;
    for (let i = 0; i < n; i++) {
      const x = px + Math.floor((Math.random() * 2 - 1) * SCAN_R), y = py + Math.floor((Math.random() * 2 - 1) * SCAN_H);
      const z = pz + Math.floor((Math.random() * 2 - 1) * SCAN_R);
      const b = world.getBlock(x, y, z);
      if (b <= 0) continue;
      if (plantParticles(fx, b, x, y, z)) continue; // Fase 6.5 (océano y plantas): flor de esporas, pepinos de mar
      if (redstoneAmbient(fx, (a, c, d) => world.getBlock(a, c, d), b, x, y, z)) continue; // Fase 7 (redstone): polvo, menas y diodos
      if (isLeaves(b)) {
        const below = world.getBlock(x, y - 1, z);
        if (below !== 0) continue;
        if (b === CHERRY_LEAVES) {
          if (Math.random() < 0.16) fx.petal(x + Math.random(), y - 0.05, z + Math.random());
        } else if (Math.random() < 0.006) {
          const [r, gg, bb] = this.leafColor(b, x, z, gen);
          fx.leaf(x + Math.random(), y - 0.05, z + Math.random(), r, gg, bb);
        }
        continue;
      }
      // Fase 8.5: columnas de burbujas: suben (o giran hacia abajo) y, arriba, revientan en la superficie.
      if (isBubbleColumn(b)) {
        const down = bubbleColumnDown(b);
        for (let k = 0; k < 3; k++) fx.bubbleColumn(x + 0.5, y + Math.random(), z + 0.5, down);
        if (!down && world.getBlock(x, y + 1, z) === 0) {
          fx.splash(x + 0.5, y + 0.95, z + 0.5, 2);
          if (Math.random() < 0.08) this.g.audio.playEnchantSfx('bubble_pop', [x + 0.5, y + 1, z + 0.5]);
        } else if (down && world.getBlock(x, y + 1, z) === 0 && Math.random() < 0.05) {
          this.g.audio.playEnchantSfx('whirlpool', [x + 0.5, y + 1, z + 0.5]);
        }
        continue;
      }
      // Fase 8.5: el nexo de reaparición cargado suelta motas violetas por arriba (más cuanto más cargado).
      const charges = anchorCharges(b);
      if (charges > 0) {
        if (world.getBlock(x, y + 1, z) === 0 && Math.random() < 0.25 + charges * 0.15) fx.anchorMote(x + 0.3 + Math.random() * 0.4, y + 1.02, z + 0.3 + Math.random() * 0.4);
        continue;
      }
      if (BLOCK_SOLID[b] && world.getBlock(x, y - 1, z) === 0) {
        // Techo con agua o lava encima: gotea.
        const above = world.getBlock(x, y + 1, z);
        const fl = above > 0 ? BLOCK_FLUID[above] : 0;
        if (fl && Math.random() < 0.35) fx.drip(x + 0.2 + Math.random() * 0.6, y - 0.02, z + 0.2 + Math.random() * 0.6, fl === 2);
        continue;
      }
      if (familyBase(b) === POINTED_DRIPSTONE) {
        const st = stateProps(b);
        if (st && st.dir === 1 && st.part === 0 && Math.random() < 0.2) fx.drip(x + 0.5, y + 0.1, z + 0.5, false);
        continue;
      }
      if (familyBase(b) === MYCELIUM && world.getBlock(x, y + 1, z) === 0) {
        if (Math.random() < 0.25) fx.spore(x + Math.random(), y + 1.05 + Math.random() * 0.3, z + Math.random(), 0.62, 0.55, 0.66);
        continue;
      }
    }
    // Bajo el agua: burbujas al respirar.
    if (p.eyeInWater && Math.random() < dt * 0.8) fx.bubbles(p.x - Math.sin(p.yaw) * 0.3, p.eyeY - 0.1, p.z - Math.cos(p.yaw) * 0.3, 2 + Math.floor(Math.random() * 3), 0.1);
    // Bajo el agua: motas en suspensión alrededor.
    if (p.eyeInWater && Math.random() < dt * 25) {
      const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 5;
      fx.spore(p.x + Math.cos(a) * d, p.eyeY + (Math.random() - 0.5) * 4, p.z + Math.sin(a) * d, 0.55, 0.7, 0.8);
    }
    this.fireflies(dt, px, py, pz);
    const sea = dimensionDef(world.dim).lavaSea;
    if (sea !== undefined) this.heatEmbers(dt, px, py, pz, sea); // Fase 8 (entorno del Nether)
    this.rain(dt, px, py, pz);
  }

  /** Busca antorchas, hornos encendidos, fogatas y lava a la vista cerca del jugador. */
  private scan(px: number, py: number, pz: number): void {
    const world = this.g.world!;
    const torches: P3[] = [], furnaces: [number, number, number, number][] = [], fires: P3[] = [], lava: P3[] = [];
    const copperTorches: P3[] = []; // Fase 6.5 (cobre)
    const blazes: P3[] = []; // Fase 6.5 (equipo)
    const redTorches: P3[] = []; // Fase 7 (redstone)
    const enderChests: P3[] = [], endRods: [number, number, number, number][] = []; // Fase 8.6
    const witherRoses: P3[] = []; // Fase 8.7
    for (let dy = -SCAN_H; dy <= SCAN_H; dy++) {
      for (let dz = -SCAN_R; dz <= SCAN_R; dz++) {
        for (let dx = -SCAN_R; dx <= SCAN_R; dx++) {
          const x = px + dx, y = py + dy, z = pz + dz;
          const b = world.getBlock(x, y, z);
          if (b <= 0) continue;
          if (b === TORCH) {
            if (torches.length < 64) torches.push([x + 0.5, y + 0.7, z + 0.5]);
          } else if (b === WITHER_ROSE) {
            if (witherRoses.length < 32) witherRoses.push([x, y, z]); // Fase 8.7
          } else if (isEnderChest(b)) {
            if (enderChests.length < 16) enderChests.push([x, y, z]); // Fase 8.6
          } else if (isEndRod(b)) {
            if (endRods.length < 48) endRods.push([x, y, z, b - familyBase(b)]); // Fase 8.6
          } else if (familyBase(b) === WALL_TORCH) {
            const f = stateProps(b)?.facing ?? 0;
            if (torches.length < 64) torches.push([x + 0.5 - DIR_X[f] * 0.12, y + 0.84, z + 0.5 - DIR_Z[f] * 0.12]);
          } else if (b === COPPER_TORCH || familyBase(b) === COPPER_WALL_TORCH) {
            // Fase 6.5 (cobre): la llama en la punta, como en las normales.
            const f = b === COPPER_TORCH ? -1 : stateProps(b)?.facing ?? 0;
            if (copperTorches.length < 64) {
              copperTorches.push(f < 0 ? [x + 0.5, y + 0.7, z + 0.5] : [x + 0.5 - DIR_X[f] * 0.12, y + 0.84, z + 0.5 - DIR_Z[f] * 0.12]);
            }
          } else if (isLitFurnace(b)) {
            if (furnaces.length < 16) furnaces.push([x, y, z, blockFacing(b)]);
          } else if (isCampfire(b)) { // Fase 8.5: también la de almas
            if (stateProps(b)?.lit === 1 && fires.length < 12) fires.push([x, y, z]);
          } else if (BLOCK_FLUID[b] === 2 && lava.length < 32 && world.getBlock(x, y + 1, z) === 0) lava.push([x, y, z]);
          else if (isFire(b) && blazes.length < 32) blazes.push([x, y, z]); // Fase 6.5 (equipo)
          else if (redTorches.length < 64) {
            // Fase 7 (redstone): antorchas de redstone encendidas.
            const tip = redstoneTorchTip(b, x, y, z);
            if (tip) redTorches.push(tip);
          }
        }
      }
    }
    this.torches = torches;
    this.copperTorches = copperTorches;
    this.furnaces = furnaces;
    this.fires = fires;
    this.lava = lava;
    this.blazes = blazes;
    this.redTorches = redTorches;
    this.enderChests = enderChests;
    this.endRods = endRods;
    this.witherRoses = witherRoses;
  }

  /** Color de las hojas que caen: fijo para abedul y abeto; del bioma para el resto. */
  private leafColor(b: number, x: number, z: number, gen: TerrainGenerator): [number, number, number] {
    if (b === BIRCH_LEAVES) return [0.5, 0.66, 0.32];
    if (b === SPRUCE_LEAVES) return [0.36, 0.5, 0.36];
    TerrainGenerator.biomeGrass(gen.columnInfo(x, z), this.tint);
    return [this.tint[0] * 0.82, this.tint[1] * 0.85, this.tint[2] * 0.78];
  }

  /** Luciérnagas en las noches despejadas, sobre la hierba y a cielo abierto. */
  /**
   * Fase 8 (entorno del Nether): pavesas que suben del mar de lava a la vista (hasta 28 bloques alrededor, si el
   * jugador no está muy lejos de su altura) y flotan por la caverna.
   */
  private heatEmbers(dt: number, px: number, py: number, pz: number, sea: number): void {
    if (Math.abs(py - sea) > 48) return;
    const world = this.g.world!;
    const fx = this.g.renderer.entities.pfx;
    const ly = Math.floor(sea);
    const tries = Math.min(40, Math.round(dt * 60));
    for (let i = 0; i < tries; i++) {
      const x = px + Math.floor((Math.random() * 2 - 1) * 28), z = pz + Math.floor((Math.random() * 2 - 1) * 28);
      const b = world.getBlock(x, ly, z);
      if (b <= 0 || BLOCK_FLUID[b] !== 2 || world.getBlock(x, ly + 1, z) !== 0) continue;
      fx.heatEmber(x + Math.random(), sea + 0.1 + Math.random() * 0.6, z + Math.random());
    }
  }

  private fireflies(dt: number, px: number, py: number, pz: number): void {
    const g = this.g;
    if (g.renderer.sunDir[1] > -0.08 || Math.random() > dt * 1.6) return;
    const world = g.world!;
    const x = px + Math.floor((Math.random() * 2 - 1) * 14), z = pz + Math.floor((Math.random() * 2 - 1) * 14);
    for (let y = py + 6; y > py - 8; y--) {
      const b = world.getBlock(x, y, z);
      if (b === 0) continue;
      if (b !== GRASS || world.getBlock(x, y + 1, z) !== 0) return;
      if (world.getLight(x, y + 1, z) >> 4 < 13) return;
      if (world.generator.columnInfo(x, z).biome === BIOME_MUSHROOM_FIELDS) return;
      g.renderer.entities.pfx.firefly(x + Math.random(), y + 1.3 + Math.random() * 1.6, z + Math.random());
      return;
    }
  }

  /** Salpicaduras de la lluvia en el suelo alrededor del jugador (no donde nieva). */
  private rain(dt: number, px: number, py: number, pz: number): void {
    const g = this.g;
    const intensity = g.rainNow;
    if (intensity < 0.15) return;
    const world = g.world!;
    const n = Math.min(12, Math.floor(intensity * 45 * dt + Math.random()));
    for (let i = 0; i < n; i++) {
      const x = px + Math.floor((Math.random() * 2 - 1) * 10), z = pz + Math.floor((Math.random() * 2 - 1) * 10);
      const inf = world.generator.columnInfo(x, z);
      if ((inf.temp < -0.5 || inf.height > 150) && inf.biome !== BIOME_MUSHROOM_FIELDS) continue;
      for (let y = py + 12; y > py - 10; y--) {
        const b = world.getBlock(x, y, z);
        if (b === 0) continue;
        if (b > 0 && (BLOCK_SOLID[b] || BLOCK_FLUID[b] || isLeaves(b))) g.renderer.entities.pfx.rainSplash(x + Math.random(), y + (BLOCK_FLUID[b] ? 0.9 : 1.02), z + Math.random());
        break;
      }
    }
  }
}
