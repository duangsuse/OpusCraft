// Fase 8.2 (biomas del Nether): el ambiente de cada bioma del Nether en el cliente, como en Java 26.3.
// - Niebla: el color de la niebla de cada bioma, mezclado con el de los de alrededor de la cámara con el
//   muestreo gaussiano de CubicSampler (así cambia poco a poco al pasar de un bioma a otro).
// - Partículas (ClientLevel.animateTick): en cada tick, 667 × 2 bloques al azar alrededor del jugador (a 16
//   y a 32); en cada uno que no sea un cubo sólido, la partícula del bioma con su probabilidad: esporas
//   carmesíes (0,025) y distorsionadas (0,01428), ceniza del valle de almas (0,00625) y ceniza blanca de las
//   deltas (0,118). Cada una se mueve como la suya de Java (SuspendedParticle, AshParticle, WhiteAshParticle).
// - Sonido (BiomeAmbientSoundsHandler): el bucle del bioma (lo funde el motor de audio), un sonido suelto
//   con probabilidad 0,0111 por tick y el «mood», que se va cargando al estar a oscuras (6000 ticks a luz 0)
//   y suena desde la dirección del bloque muestreado, 2 bloques más lejos.
import { BLOCK_COLLIDE } from '../../shared/blocks';
import { DIM_NETHER } from '../../shared/dimensions';
import {
  netherBiomeEffects, NETHER_ADDITIONS_CHANCE, NETHER_MOOD_TICKS, NETHER_MOOD_EXTENT, NETHER_MOOD_OFFSET, type NetherParticle,
} from '../../shared/world/netherBiomeEffects';
import { PF, SPRITE } from '../render/particles/ParticleSystem';
import type { Game } from './Game';

/** Núcleo gaussiano de CubicSampler. */
const KERNEL = [0, 1, 4, 6, 4, 1, 0];
const rnd = Math.random;
const nextInt = (n: number) => Math.floor(rnd() * n);

export class NetherAtmosphere {
  /** Color de la niebla (sRGB 0..255) en el Nether, o null fuera de él. */
  fog: [number, number, number] | null = null;
  /** Bioma del Nether donde está el jugador (−1 fuera del Nether). */
  biome = -1;
  private ticks = 0;
  private moodiness = 0;

  constructor(private g: Game) {}

  update(dt: number): void {
    const g = this.g;
    const world = g.world;
    if (!world || world.dim !== DIM_NETHER || dt <= 0) {
      this.fog = null;
      this.biome = -1;
      return;
    }
    const gen = world.generator;
    const p = g.player;
    this.biome = gen.biomeAt(Math.floor(p.x), Math.floor(p.z));
    this.fog = this.sampleFog(p.x, p.z);
    this.ticks = Math.min(this.ticks + dt * 20, 3);
    while (this.ticks >= 1) {
      this.ticks -= 1;
      this.tick();
    }
  }

  /** Niebla de la cámara: la de los biomas de las celdas de 4×4 de alrededor, con pesos gaussianos. */
  private sampleFog(x: number, z: number): [number, number, number] {
    const gen = this.g.world!.generator;
    const sx = (x - 2) * 0.25, sz = (z - 2) * 0.25;
    const ix = Math.floor(sx), iz = Math.floor(sz);
    const fx = sx - ix, fz = sz - iz;
    let r = 0, gg = 0, b = 0, total = 0;
    for (let dx = 0; dx < 6; dx++) {
      const wx = KERNEL[dx + 1] + fx * (KERNEL[dx] - KERNEL[dx + 1]);
      for (let dz = 0; dz < 6; dz++) {
        const w = wx * (KERNEL[dz + 1] + fz * (KERNEL[dz] - KERNEL[dz + 1]));
        if (w <= 0) continue;
        // El centro de la celda de 4×4 (bioma de columna: basta la x y la z).
        const c = netherBiomeEffects(gen.biomeAt((ix - 2 + dx) * 4 + 2, (iz - 2 + dz) * 4 + 2)).fog;
        r += c[0] * w;
        gg += c[1] * w;
        b += c[2] * w;
        total += w;
      }
    }
    return [r / total, gg / total, b / total];
  }

  /** Un tick del ambiente: partículas, sonidos sueltos y «mood». */
  private tick(): void {
    const g = this.g;
    const world = g.world!;
    const gen = world.generator;
    const p = g.player;
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    const ps = g.renderer.entities.particles;
    // Partículas: 667 × 2 muestras (a 16 y a 32 bloques), como animateTick.
    if (ps.n < 12000) {
      for (let i = 0; i < 1334; i++) {
        const r = i & 1 ? 32 : 16;
        const x = px + nextInt(r) - nextInt(r), y = py + nextInt(r) - nextInt(r), z = pz + nextInt(r) - nextInt(r);
        const id = world.getBlock(x, y, z);
        if (id < 0 || BLOCK_COLLIDE[id] === 1) continue;
        const fx = netherBiomeEffects(gen.biomeAt(x, z));
        if (!fx.particle || rnd() > fx.particleChance) continue;
        this.spawn(fx.particle, x + rnd(), y + rnd(), z + rnd());
      }
    }
    // Sonidos sueltos del bioma, alrededor del jugador.
    if (rnd() < NETHER_ADDITIONS_CHANCE) {
      const a = rnd() * Math.PI * 2, d = 4 + rnd() * 10;
      g.audio.playNetherAddition(this.biome, [p.x + Math.cos(a) * d, p.y + 1.6 + (rnd() - 0.5) * 6, p.z + Math.sin(a) * d]);
    }
    // «Mood»: un bloque al azar a 8 o menos de los ojos; sin luz de cielo, la de bloque le quita o le da.
    const span = NETHER_MOOD_EXTENT * 2 + 1;
    const bx = Math.floor(p.x + nextInt(span) - NETHER_MOOD_EXTENT);
    const by = Math.floor(p.y + 1.62 + nextInt(span) - NETHER_MOOD_EXTENT);
    const bz = Math.floor(p.z + nextInt(span) - NETHER_MOOD_EXTENT);
    const block = world.getLight(bx, by, bz) & 15;
    this.moodiness -= (block - 1) / NETHER_MOOD_TICKS;
    if (this.moodiness >= 1) {
      const dx = bx + 0.5 - p.x, dy = by + 0.5 - (p.y + 1.62), dz = bz + 0.5 - p.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const k = (dist + NETHER_MOOD_OFFSET) / dist;
      g.audio.playNetherMood(this.biome, [p.x + dx * k, p.y + 1.62 + dy * k, p.z + dz * k]);
      this.moodiness = 0;
    } else this.moodiness = Math.max(0, this.moodiness);
  }

  /** Una partícula del ambiente del Nether, con el movimiento de la suya de Java (unidades por tick × 20). */
  private spawn(kind: NetherParticle, x: number, y: number, z: number): void {
    const ps = this.g.renderer.entities.particles;
    // Velocidad inicial de Particle(x, y, z, xa, ya, za): una dirección al azar con rapidez 0,06–0,18 por tick
    // y 0,1 hacia arriba (más la que da cada tipo).
    const base = (xa: number, ya: number, za: number): [number, number, number] => {
      let vx = xa + (rnd() * 2 - 1) * 0.4, vy = ya + (rnd() * 2 - 1) * 0.4, vz = za + (rnd() * 2 - 1) * 0.4;
      const speed = (rnd() + rnd() + 1) * 0.15, dd = Math.hypot(vx, vy, vz) || 1;
      vx = (vx / dd) * speed * 0.4;
      vy = (vy / dd) * speed * 0.4 + 0.1;
      vz = (vz / dd) * speed * 0.4;
      return [vx, vy, vz];
    };
    switch (kind) {
      case 'crimson_spore':
      case 'warped_spore': {
        // SuspendedParticle: sin rozamiento ni gravedad, vive 16–80 ticks; aparece 0,125 más abajo.
        const warped = kind === 'warped_spore';
        const [vx, vy, vz] = warped ? base(0, rnd() * -1.9 * rnd() * 0.1, 0) : base(0, 0, 0);
        const life = 16 / (rnd() * 0.8 + 0.2) / 20;
        const size = (0.1 + rnd() * 0.1) * (rnd() * 0.6 + 0.6) * 0.5;
        ps.spawn({
          x, y: y - 0.125, z, vx: vx * 20, vy: vy * 20, vz: vz * 20, life, size, sprite: SPRITE.dust,
          r: warped ? 0.1 : 0.9, g: warped ? 0.1 : 0.4, b: warped ? 0.3 : 0.5, a: 1, drag: 0, flags: PF.FADE_IN,
        });
        return;
      }
      case 'ash':
      case 'white_ash': {
        // BaseAshSmokeParticle: la velocidad inicial ×(0,1, −0,1, 0,1), rozamiento 0,96 por tick, gravedad 0,1 (la
        // ceniza) o 0,0125 (la blanca, que además deriva hacia −x, −z y abajo); vive 20–100 ticks.
        const white = kind === 'white_ash';
        const [bx, by, bz] = base(0, 0, 0);
        let vx = bx * 0.1, vy = by * -0.1, vz = bz * 0.1;
        if (white) {
          vx += rnd() * -1.9 * rnd() * 0.1;
          vy += rnd() * -0.5 * rnd() * 0.1 * 5;
          vz += rnd() * -1.9 * rnd() * 0.1;
        }
        const col = white ? 1 : rnd() * 0.5;
        const life = 20 / (rnd() * 0.8 + 0.2) / 20;
        ps.spawn({
          x, y, z, vx: vx * 20, vy: vy * 20, vz: vz * 20, life, size: (0.1 + rnd() * 0.1) * 0.75 * 0.45,
          sprite: SPRITE.dust, r: white ? 186 / 255 : col, g: white ? 177 / 255 : col, b: white ? 194 / 255 : col, a: 1,
          grav: 16 * (white ? 0.0125 : 0.1), drag: 0.816, flags: PF.FADE_IN,
        });
      }
    }
  }
}
