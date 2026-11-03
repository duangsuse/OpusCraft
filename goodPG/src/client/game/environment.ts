// Entorno alrededor del jugador: el cielo y el clima de cada frame (hora, nubes, bruma, nieve), la
// lluvia (mapa de alturas para no mojar bajo techo) y el océano lejano del horizonte.
import { AIR, BLOCK_RENDER, R_CROSS, R_TORCH } from '../../shared/blocks';
import { CHUNK_SIZE, SEA_LEVEL, MIN_Y, MAX_Y, blockIndex } from '../../shared/constants';
import { rainAt } from '../../shared/weather';
import { BIOME_MUSHROOM_FIELDS } from '../../shared/world/biomeIds';
import type { Game } from './Game';
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (dimensiones)

/** El cielo y el clima de un frame. */
export interface SkyState {
  day: number;
  /** Fracción del día (0 amanecer… 1). */
  dayTime: number;
  sunHeight: number;
  cloudCoverage: number;
  mist: number;
  /** En el sitio del jugador nieva en vez de llover. */
  snow: boolean;
}

export class Environment {
  constructor(private g: Game) {}

  /** Cielo y clima en `worldTime` con lluvia `rain`; también refresca el horizonte y el mapa de lluvia. */
  sky(dt: number, worldTime: number, rain: number): SkyState {
    const p = this.g.player;
    this.farTimer -= dt;
    if (this.farTimer <= 0 || Math.hypot(p.x - this.farPos[0], p.z - this.farPos[1]) > 48) this.updateFarOcean();
    const day = Math.floor(worldTime);
    const dayTime = worldTime - day;
    const sunHeight = Math.sin(dayTime * Math.PI * 2);
    const baseCoverage = 0.27 + 0.1 * Math.sin(worldTime * 2.3 + 1.3) + 0.06 * Math.sin(worldTime * 5.9 + 0.4);
    const coverage = baseCoverage + (0.86 - baseCoverage) * Math.min(1, rain * 1.5);
    const dawn = Math.exp(-Math.pow(((dayTime + 0.5) % 1) - 0.5, 2) / 0.0035);
    const mist = 0.0022 + 0.011 * dawn + (sunHeight < 0 ? 0.002 : 0) + rain * 0.006;
    const climate = this.g.world!.generator.columnInfo(Math.floor(p.x), Math.floor(p.z));
    const snow = (climate.temp < -0.5 || climate.height > 150) && climate.biome !== BIOME_MUSHROOM_FIELDS && dimensionDef(this.g.world!.dim).weather;
    this.rainMapTimer -= dt;
    if (rain > 0.01 && this.rainMapTimer <= 0) this.updateRainMap();
    const cloudCoverage = (window as unknown as { __cloudCov?: number }).__cloudCov ?? Math.max(0.1, Math.min(0.9, coverage));
    return { day, dayTime, sunHeight, cloudCoverage, mist, snow };
  }

  rainMapTimer = 0;
  rainHeights = new Float32Array(64 * 64);

  /** Intensidad de lluvia (0..1) determinista a partir del tiempo del mundo: igual para todos. */
  weatherAt(worldTime: number): number {
    const override = (window as unknown as { __rain?: number }).__rain;
    if (override !== undefined) return override;
    if (!dimensionDef(this.g.world!.dim).weather) return 0; // Fase 8: en el Nether no llueve
    return rainAt(worldTime, this.g.world!.seed);
  }

  /** Altura del bloque más alto de cada columna en un área de 64x64 (para que no llueva bajo techo). */
  updateRainMap(): void {
    const world = this.g.world!;
    this.rainMapTimer = 0.5;
    const x0 = Math.floor(this.g.player.x) - 32;
    const z0 = Math.floor(this.g.player.z) - 32;
    const out = this.rainHeights;
    for (let dz = 0; dz < 64; dz++) {
      for (let dx = 0; dx < 64; dx++) {
        const x = x0 + dx, z = z0 + dz;
        const col = world.getColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        let top = MIN_Y;
        if (col && col.blocks) {
          const lx = x - col.cx * CHUNK_SIZE, lz = z - col.cz * CHUNK_SIZE;
          for (let y = Math.min(MAX_Y - 1, col.maxY + 1); y > MIN_Y; y--) {
            const b = col.blocks[blockIndex(lx, y, lz)];
            if (b !== AIR && BLOCK_RENDER[b] !== R_CROSS && BLOCK_RENDER[b] !== R_TORCH) {
              top = y;
              break;
            }
          }
        }
        out[dz * 64 + dx] = top;
      }
    }
    this.g.renderer.weather.setHeights(x0, z0, out);
  }

  farTimer = 0;
  farPos = [1e9, 1e9];
  farData = new Uint8Array(64);

  updateFarOcean(): void {
    const world = this.g.world!;
    const p = this.g.player;
    this.farTimer = 2;
    this.farPos = [p.x, p.z];
    const R = world.renderDistance * CHUNK_SIZE;
    const gen = world.generator;
    const dists = [R + 16, R + 60, R + 140, R + 300, R + 600, R + 1100];
    const weights = [2, 1.6, 1.3, 1, 0.8, 0.6];
    const raw = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const az = ((i + 0.5) / 64 - 0.5) * Math.PI * 2;
      const cx = Math.cos(az), cz = Math.sin(az);
      let water = 0, total = 0;
      for (let k = 0; k < dists.length; k++) {
        const h = gen.columnInfo(Math.floor(p.x + cx * dists[k]), Math.floor(p.z + cz * dists[k])).height;
        if (h < SEA_LEVEL - 1) water += weights[k];
        total += weights[k];
      }
      raw[i] = water / total;
    }
    const k5 = [1, 2, 3, 2, 1];
    for (let i = 0; i < 64; i++) {
      let acc = 0;
      for (let j = -2; j <= 2; j++) acc += raw[(i + j + 64) % 64] * k5[j + 2];
      const v = acc / 9;
      const t = Math.max(0, Math.min(1, (v - 0.3) / 0.4));
      this.farData[i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    this.g.renderer.setFarOcean(this.farData);
  }
}
