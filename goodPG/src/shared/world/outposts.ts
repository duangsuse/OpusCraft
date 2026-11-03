// Puestos de saqueadores (fase 6, asaltos): una torre de vigilancia de roble oscuro y abedul con un
// mirador arriba (y el cofre del botín), tiendas de lana, montones de troncos y dianas de calabaza
// alrededor. Los saqueadores aparecen en ella mientras haya jugadores cerca (server/raids.ts).
//
// Como el resto de estructuras de superficie, se decide por regiones (structures.ts) y cada chunk
// dibuja sólo lo que le cae dentro. Nunca hay un puesto a menos de 10 chunks de una aldea.
import {
  AIR, COBBLESTONE, MOSSY_COBBLESTONE, BIRCH_PLANKS, DARK_OAK_LOG, DARK_OAK_PLANKS, WHITE_WOOL, HAY_BALE,
  CARVED_PUMPKIN, TORCH, LADDER, FENCES, SLABS, BLOCK_OPAQUE, BLOCK_FLUID, stateOf,
} from '../blocks';
import { hash2 } from '../constants';
import { mulberry32 } from './noise';
import { isVillageBiome } from './villages';
import type { VillageCanvas, VillageStart } from './villages';
import { MOB_ALLAY } from '../allay'; // Fase 7.5 (mansión)

/** Radio que ocupa el puesto alrededor de la torre (bloques). */
export const OUTPOST_RADIUS = 13;
/** Distancia mínima a una aldea (bloques). */
export const OUTPOST_VILLAGE_GAP = 160;
/** Altura del suelo del mirador sobre la base. */
export const OUTPOST_DECK = 15;

/** ¿Puede haber un puesto aquí? (mismos biomas que las aldeas y uno de cada tres candidatos). */
export function outpostCandidate(biome: number, x: number, z: number, seed: number): boolean {
  return isVillageBiome(biome) && hash2(x, z, seed ^ 0x5a3c7) % 3 === 0;
}

type Canvas = Pick<VillageCanvas, 'x0' | 'z0' | 'get' | 'set' | 'chest' | 'foundation' | 'clearAbove'> & {
  /** Fase 7.5 (mansión): los alays de la jaula. */
  mob?(type: number, x: number, y: number, z: number): void;
};

export function buildOutpost(c: Canvas, s: VillageStart): void {
  const ox = s.x, oy = s.y, oz = s.z;
  const rnd = mulberry32(s.rng);
  const R = OUTPOST_RADIUS;
  if (ox + R < c.x0 || ox - R > c.x0 + 15 || oz + R < c.z0 || oz - R > c.z0 + 15) return;
  const fence = FENCES.dark_oak;
  const slab = stateOf(SLABS.dark_oak, { type: 0 });
  // Base de roca (algo de musgo) bajo la torre, con cimientos hasta el suelo.
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = ox + dx, z = oz + dz;
      const id = rnd() < 0.2 ? MOSSY_COBBLESTONE : COBBLESTONE;
      c.set(x, oy, z, id);
      c.foundation(x, oy - 1, z, COBBLESTONE);
      c.clearAbove(x, oy + 1, z, OUTPOST_DECK + 6);
    }
  }
  // Torre de 7×7: esquinas de roble oscuro, paredes de abedul y tres pisos por dentro.
  const top = oy + OUTPOST_DECK - 1;
  for (let y = oy + 1; y <= top; y++) {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const corner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
        const floor = (y - oy) % 5 === 0;
        let id = AIR;
        if (corner) id = DARK_OAK_LOG;
        else if (edge) id = floor ? DARK_OAK_PLANKS : BIRCH_PLANKS;
        else if (floor) id = DARK_OAK_PLANKS;
        c.set(ox + dx, y, oz + dz, id);
      }
    }
    // Ventanas en el centro de cada lado (salvo en los forjados).
    if ((y - oy) % 5 === 2 || (y - oy) % 5 === 3) {
      for (const [dx, dz] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) c.set(ox + dx, y, oz + dz, AIR);
    }
  }
  // Puerta al norte.
  c.set(ox, oy + 1, oz - 3, AIR);
  c.set(ox, oy + 2, oz - 3, AIR);
  // Escalera de mano pegada a la pared sur, del suelo al mirador (atraviesa los forjados).
  for (let y = oy + 1; y <= oy + OUTPOST_DECK; y++) c.set(ox, y, oz + 2, stateOf(LADDER, { facing: 0 }));
  // Mirador: plataforma de 9×9 con barandilla y un tejadillo sobre cuatro postes.
  const deck = oy + OUTPOST_DECK;
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (!(dx === 0 && dz === 2)) c.set(ox + dx, deck, oz + dz, DARK_OAK_PLANKS);
      const rim = Math.abs(dx) === 4 || Math.abs(dz) === 4;
      const post = Math.abs(dx) === 4 && Math.abs(dz) === 4;
      for (let y = deck + 1; y <= deck + 4; y++) c.set(ox + dx, y, oz + dz, AIR);
      if (post) for (let y = deck + 1; y <= deck + 3; y++) c.set(ox + dx, y, oz + dz, DARK_OAK_LOG);
      else if (rim) c.set(ox + dx, deck + 1, oz + dz, fence);
      c.set(ox + dx, deck + 4, oz + dz, rim ? slab : DARK_OAK_PLANKS);
    }
  }
  c.set(ox, deck + 1, oz + 2, stateOf(LADDER, { facing: 0 }));
  c.chest(ox - 2, deck + 1, oz - 2, 2, 'pillager_outpost');
  c.set(ox + 2, deck + 1, oz - 3, TORCH);
  c.set(ox - 2, deck + 1, oz + 3, TORCH);
  // Alrededor: tiendas, troncos apilados, heno y dianas de calabaza sobre postes.
  const spots: [number, number][] = [[8, -2], [-8, 3], [3, 9], [-4, -9], [9, 7], [-9, -7]];
  for (let i = 0; i < spots.length; i++) {
    const [dx, dz] = spots[i];
    const x = ox + dx, z = oz + dz;
    const g = ground(c, x, z, oy);
    if (g === null) continue;
    const kind = (i + Math.floor(rnd() * 3)) % 4;
    if (kind === 0) tent(c, x, g + 1, z, dx > 0);
    else if (kind === 1) {
      for (let k = 0; k < 3; k++) c.set(x + k, g + 1, z, DARK_OAK_LOG);
      c.set(x + 1, g + 2, z, DARK_OAK_LOG);
    } else if (kind === 2) {
      c.set(x, g + 1, z, HAY_BALE);
      c.set(x + 1, g + 1, z, HAY_BALE);
      c.set(x, g + 2, z, HAY_BALE);
    } else {
      c.set(x, g + 1, z, fence);
      c.set(x, g + 2, z, CARVED_PUMPKIN);
    }
  }
  // Fase 7.5 (mansión): en la mitad de los puestos, una jaula de roble oscuro con alays presos (con su
  // propio azar: el de arriba depende de lo que cae en cada chunk).
  const cr = mulberry32(s.rng ^ 0xa11a7);
  if (cr() < 0.5) {
    const [dx, dz] = cr() < 0.5 ? [-9, 9] : [9, -9];
    cage(c, ox + dx, oz + dz, oy, 1 + Math.floor(cr() * 3));
  }
}

/**
 * Fase 7.5 (mansión): jaula de 5×5 (postes de tronco, barrotes de valla y techo de losas) con `n` alays
 * dentro. Se asienta sobre el suelo del centro de la jaula (la altura la da el generador, igual en todos
 * los chunks).
 */
function cage(c: Canvas, x: number, z: number, oy: number, n: number): void {
  const g = oy;
  const fence = FENCES.dark_oak;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = x + dx, pz = z + dz;
      c.foundation(px, g - 1, pz, COBBLESTONE);
      c.set(px, g, pz, DARK_OAK_PLANKS);
      c.clearAbove(px, g + 1, pz, 6);
      const rim = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      const post = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      for (let y = g + 1; y <= g + 3; y++) c.set(px, y, pz, post ? DARK_OAK_LOG : rim ? fence : AIR);
      c.set(px, g + 4, pz, stateOf(SLABS.dark_oak, { type: 0 }));
    }
  }
  for (let k = 0; k < n; k++) c.mob?.(MOB_ALLAY, x + 0.5 + (k - 1) * 0.6, g + 1.5, z + 0.5);
}

/** Tienda de lana blanca de 3 de fondo con un poste en cada extremo. */
function tent(c: Canvas, x: number, y: number, z: number, alongX: boolean): void {
  for (let k = -1; k <= 1; k++) {
    const [ax, az] = alongX ? [x + k, z] : [x, z + k];
    const [lx, lz, rx, rz] = alongX ? [ax, az - 1, ax, az + 1] : [ax - 1, az, ax + 1, az];
    c.set(lx, y, lz, WHITE_WOOL);
    c.set(rx, y, rz, WHITE_WOOL);
    c.set(ax, y + 1, az, WHITE_WOOL);
  }
  const [ex, ez] = alongX ? [x + 2, z] : [x, z + 2];
  c.set(ex, y, ez, FENCES.dark_oak);
}

/** Suelo firme de una columna cerca de la altura de referencia (null si no hay dentro del chunk). */
function ground(c: Canvas, x: number, z: number, ref: number): number | null {
  for (let y = ref + 6; y >= ref - 8; y--) {
    const b = c.get(x, y, z);
    if (b < 0) return null;
    if (b !== AIR && BLOCK_OPAQUE[b] && !BLOCK_FLUID[b]) return y;
  }
  return null;
}
