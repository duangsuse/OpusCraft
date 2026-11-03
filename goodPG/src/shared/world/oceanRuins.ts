// Fase 7.5 (océano): ruinas oceánicas y tesoro enterrado.
// - Ruinas: restos de casas en el fondo del mar, frías (ladrillos de piedra, musgosos, agrietados y
//   cincelados) o templadas en los océanos cálidos (arenisca). Tres de cada diez son grandes (varias
//   salas, muros más altos y dos cofres) y casi todas ellas vienen con un grupo de ruinas pequeñas
//   alrededor (un cofre cada una). Les faltan bloques (están en ruinas) y traen ahogados.
// - Tesoro enterrado: un cofre bajo la arena de una playa (1 de cada 100 chunks de playa, como en
//   Minecraft), con el corazón del mar. Se encuentra con los mapas del tesoro.
import {
  AIR, WATER, SAND, SANDSTONE, CUT_SANDSTONE, SMOOTH_SANDSTONE, CHISELED_SANDSTONE, STONE_BRICKS, MOSSY_STONE_BRICKS,
  CRACKED_STONE_BRICKS, CHISELED_STONE_BRICKS, GRAVEL, BLOCK_OPAQUE, BLOCK_FLUID,
} from '../blocks';
import { SEA_LEVEL, hash3 } from '../constants';
import { mulberry32 } from './noise';
import { MOB_DROWNED } from '../mobs';
import type { Canvas, Start } from './structures';
import type { TerrainGenerator } from './terrain';

/** Radio que puede ocupar un grupo de ruinas alrededor de la grande. */
export const RUINS_RADIUS = 27;

interface RuinPiece {
  x: number;
  z: number;
  /** Medio ancho y medio fondo. */
  hw: number;
  hd: number;
  big: boolean;
  seed: number;
}

interface RuinsLayout {
  warm: boolean;
  pieces: RuinPiece[];
}

const cache = new Map<string, RuinsLayout>();

/** Ruinas de una candidata: la del centro (grande o pequeña) y, si es grande, su grupo de pequeñas. */
function ruinsLayout(s: Start, warm: boolean): RuinsLayout {
  const key = `${s.x},${s.z},${s.rng}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 128) cache.clear();
  const rnd = mulberry32(s.rng);
  const big = rnd() < 0.3;
  const size = (b: boolean) => (b ? 5 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 2));
  const pieces: RuinPiece[] = [{ x: s.x, z: s.z, hw: size(big), hd: size(big), big, seed: Math.floor(rnd() * 2 ** 31) }];
  if (big && rnd() < 0.9) {
    const n = 4 + Math.floor(rnd() * 5);
    for (let t = 0; t < n * 4 && pieces.length < n + 1; t++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 10;
      const p: RuinPiece = {
        x: Math.round(s.x + Math.cos(a) * r), z: Math.round(s.z + Math.sin(a) * r), hw: size(false), hd: size(false), big: false,
        seed: Math.floor(rnd() * 2 ** 31),
      };
      // Sin pisarse unas a otras.
      if (pieces.some((o) => Math.abs(o.x - p.x) <= o.hw + p.hw + 2 && Math.abs(o.z - p.z) <= o.hd + p.hd + 2)) continue;
      pieces.push(p);
    }
  }
  const L = { warm, pieces };
  cache.set(key, L);
  return L;
}

/** Bloque de muro de las ruinas (con su desgaste). */
function ruinBlock(warm: boolean, x: number, y: number, z: number, seed: number): number {
  const r = hash3(x, y, z, seed) % 100;
  if (warm) return r < 45 ? SANDSTONE : r < 75 ? CUT_SANDSTONE : r < 90 ? SMOOTH_SANDSTONE : CHISELED_SANDSTONE;
  return r < 50 ? STONE_BRICKS : r < 80 ? MOSSY_STONE_BRICKS : r < 95 ? CRACKED_STONE_BRICKS : CHISELED_STONE_BRICKS;
}

/** Dibuja las ruinas de la candidata `s` que caen en el chunk. */
export function buildOceanRuins(c: Canvas, s: Start, gen: TerrainGenerator, warm: boolean): void {
  const L = ruinsLayout(s, warm);
  for (const p of L.pieces) {
    if (p.x + p.hw < c.x0 || p.x - p.hw > c.x0 + 15 || p.z + p.hd < c.z0 || p.z - p.hd > c.z0 + 15) continue;
    buildPiece(c, p, gen, warm);
  }
}

function buildPiece(c: Canvas, p: RuinPiece, gen: TerrainGenerator, warm: boolean): void {
  const rnd = mulberry32(p.seed);
  const y0 = Math.min(SEA_LEVEL - 4, gen.surfaceAt(p.x, p.z, gen.columnInfo(p.x, p.z, info)));
  // Cuánto aguanta en pie: de 0,75 a 0,9 de los bloques (como la «integridad» de Minecraft).
  const integrity = 0.75 + rnd() * 0.15;
  const maxH = p.big ? 5 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
  // Lado del hueco de la puerta y esquina que se ha derrumbado.
  const doorSide = Math.floor(rnd() * 4), fallen = Math.floor(rnd() * 4);
  const midX = p.x + Math.floor((rnd() - 0.5) * p.hw), midZ = p.z + Math.floor((rnd() - 0.5) * p.hd);
  const stands = (x: number, y: number, z: number) => hash3(x, y, z, p.seed ^ 0x5eed) % 1000 < integrity * 1000;
  for (let z = p.z - p.hd; z <= p.z + p.hd; z++) {
    for (let x = p.x - p.hw; x <= p.x + p.hw; x++) {
      const ex = x === p.x - p.hw || x === p.x + p.hw, ez = z === p.z - p.hd || z === p.z + p.hd;
      // Cimientos hasta el fondo y suelo (con huecos de arena o grava).
      for (let y = y0 - 1; y > y0 - 6; y--) {
        const b = c.get(x, y, z);
        if (b < 0 || (b !== AIR && !BLOCK_FLUID[b] && BLOCK_OPAQUE[b])) break;
        c.set(x, y, z, ruinBlock(warm, x, y, z, p.seed));
      }
      c.set(x, y0, z, stands(x, y0, z) ? ruinBlock(warm, x, y0, z, p.seed) : warm ? SAND : GRAVEL);
      // Muros: más altos lejos de la esquina caída; tabiques interiores en las grandes.
      const inner = p.big && (x === midX || z === midZ);
      let h = 0;
      if (ex || ez || inner) {
        const cx = fallen & 1 ? p.x + p.hw : p.x - p.hw, cz = fallen & 2 ? p.z + p.hd : p.z - p.hd;
        const far = (Math.abs(x - cx) + Math.abs(z - cz)) / (p.hw + p.hd);
        h = Math.max(0, Math.round(maxH * Math.min(1, 0.25 + far)) - (inner ? 1 : 0) - (hash3(x, 0, z, p.seed) % 2));
      }
      // Hueco de la puerta (2 de ancho en el centro de un lado) y paso en los tabiques.
      const door = (doorSide === 0 && ez && z < p.z && Math.abs(x - p.x) <= 1) || (doorSide === 1 && ex && x > p.x && Math.abs(z - p.z) <= 1)
        || (doorSide === 2 && ez && z > p.z && Math.abs(x - p.x) <= 1) || (doorSide === 3 && ex && x < p.x && Math.abs(z - p.z) <= 1)
        || (inner && !ex && !ez && (Math.abs(x - p.x) === 2 || Math.abs(z - p.z) === 2));
      for (let y = y0 + 1; y <= y0 + 7; y++) {
        const wall = y <= y0 + h && !(door && y <= y0 + 2);
        if (wall && stands(x, y, z)) c.set(x, y, z, ruinBlock(warm, x, y, z, p.seed));
        else if (y < SEA_LEVEL) {
          const b = c.get(x, y, z);
          if (b > 0) c.set(x, y, z, WATER); // el fondo que asoma dentro de la ruina se retira
        }
      }
      // Esquinas cinceladas en lo alto de los muros que siguen en pie.
      if ((ex && ez) && h >= 2 && stands(x, y0 + h + 1, z)) c.set(x, y0 + h, z, warm ? CHISELED_SANDSTONE : CHISELED_STONE_BRICKS);
    }
  }
  // Cofres: uno en una esquina (dos en las grandes, en salas distintas).
  const chest = (x: number, z: number, facing: number) => c.chest(x, y0 + 1, z, facing, p.big ? 'underwater_ruin_big' : 'underwater_ruin_small');
  chest(p.x - p.hw + 1, p.z - p.hd + 1, 2);
  if (p.big) chest(p.x + p.hw - 1, p.z + p.hd - 1, 0);
  // Ahogados: uno en la mitad de las pequeñas y dos o tres en las grandes.
  const drowned = p.big ? 2 + Math.floor(rnd() * 2) : rnd() < 0.5 ? 1 : 0;
  for (let i = 0; i < drowned; i++) {
    const dx = Math.floor((rnd() - 0.5) * (p.hw - 1) * 2), dz = Math.floor((rnd() - 0.5) * (p.hd - 1) * 2);
    c.mob(MOB_DROWNED, p.x + dx + 0.5, y0 + 1, p.z + dz + 0.5);
  }
}

const info = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

// ------------------------------------------------------------------ tesoro enterrado

/** Dibuja el cofre del tesoro enterrado: bajo dos capas de arena, con arenisca donde no hay suelo. */
export function buildBuriedTreasure(c: Canvas, s: Start): void {
  const x = s.x, z = s.z, y = s.y - 2;
  if (c.get(x, y, z) < 0) return;
  c.chest(x, y, z, s.rng % 4, 'buried_treasure');
  for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    const b = c.get(x + dx, y + dy, z + dz);
    if (b >= 0 && (b === AIR || BLOCK_FLUID[b] || !BLOCK_OPAQUE[b])) c.set(x + dx, y + dy, z + dz, dy === 1 ? SAND : SANDSTONE);
  }
}
