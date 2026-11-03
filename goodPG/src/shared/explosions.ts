// Fase 7 (mecanismos): explosiones como las de Minecraft (lo que es puro: resistencia de los bloques y qué
// bloques rompe). Desde el centro salen 1352 rayos (las caras de un cubo de 16×16×16) con una fuerza de
// potencia × (0,7..1,3); cada paso de 0,3 bloques pierde 0,225 y lo que resiste cada bloque que cruza
// ((resistencia + 0,3) × 0,3). Lo que queda con fuerza se rompe. Los fluidos resisten 100: dentro del agua
// una explosión no rompe nada. Lo usan el servidor (sim/server/tnt.ts) y las pruebas.
import {
  defs, familyBase, BLOCK_COUNT, BLOCK_HARDNESS, BLOCK_FLUID, OBSIDIAN, CRYING_OBSIDIAN, ENCHANTING_TABLE, isAnvil,
} from './blocks';
import { MIN_Y, MAX_Y } from './constants';
import { posKey } from './sim/posKey';

/** Resistencia de Minecraft distinta de la dureza, por clave del bloque base. */
const RESISTANCE: Record<string, number> = {
  hopper: 4.8, dried_kelp_block: 2.5, cocoa: 3, packed_mud: 3, mud_bricks: 3, pointed_dripstone: 3, dripstone_block: 1,
  terracotta: 4.2, basalt: 4.2, polished_basalt: 4.2, end_stone: 9, end_stone_bricks: 9, iron_bars: 6, iron_chain: 6,
  reinforced_deepslate: 1200, sculk_catalyst: 3, sculk_shrieker: 3, soul_lantern: 3.5, // Fase 7.5 (abismo)
  ancient_debris: 1200, netherite_block: 1200, respawn_anchor: 1200, lodestone: 3.5, beacon: 3, // Fase 8.5
  ender_chest: 600, // Fase 8.6
};

let TABLE: Float32Array | null = null;

function resistanceOf(id: number): number {
  const d = defs[id];
  if (!d) return 0;
  const base = familyBase(id);
  const key = defs[base]?.key ?? d.key;
  const h = BLOCK_HARDNESS[id];
  if (BLOCK_FLUID[id]) return 100;
  if (h < 0) return 3_600_000;
  if (base === OBSIDIAN || base === CRYING_OBSIDIAN || base === ENCHANTING_TABLE || isAnvil(id)) return 1200;
  if (key in RESISTANCE) return RESISTANCE[key];
  if (/shulker_box$/.test(key)) return 2; // Fase 8.6
  if (/_terracotta$/.test(key) && !/glazed/.test(key)) return 4.2;
  // Las piedras y los metales (con pico y de 1,5 en adelante) resisten 6; las menas, lo que cuesta romperlas.
  if (d.tool === 'pickaxe' && h >= 1.5 && !/_ore$/.test(key)) return 6;
  if (/^deepslate_.*_ore$/.test(key)) return 3;
  // Tablones y lo hecho con ellos: 3.
  if (d.tool === 'axe' && h === 2 && !/(log|wood|stem|hyphae)$/.test(key)) return 3;
  return h;
}

/** Resistencia a las explosiones de un bloque (Minecraft). */
export function blastResistance(id: number): number {
  if (id <= 0) return 0;
  if (!TABLE) {
    TABLE = new Float32Array(BLOCK_COUNT);
    for (let i = 1; i < BLOCK_COUNT; i++) TABLE[i] = resistanceOf(i);
  }
  return id < BLOCK_COUNT ? TABLE[id] : 0;
}

/** Fase 8.7: bloques que el Wither no rompe (etiqueta wither_immune; los que existen). */
const WITHER_IMMUNE = new Set(['bedrock', 'end_portal', 'end_portal_frame', 'end_gateway', 'reinforced_deepslate', 'barrier', 'light']);
export function witherImmune(id: number): boolean {
  return id > 0 && WITHER_IMMUNE.has(defs[familyBase(id)]?.key ?? '');
}

/** Direcciones de los rayos: las caras de un cubo de 16×16×16 (1352), normalizadas. */
const RAYS: number[] = [];
for (let j = 0; j < 16; j++) {
  for (let k = 0; k < 16; k++) {
    for (let l = 0; l < 16; l++) {
      if (j !== 0 && j !== 15 && k !== 0 && k !== 15 && l !== 0 && l !== 15) continue;
      const dx = (j / 15) * 2 - 1, dy = (k / 15) * 2 - 1, dz = (l / 15) * 2 - 1;
      const len = Math.hypot(dx, dy, dz);
      RAYS.push(dx / len, dy / len, dz / len);
    }
  }
}

/**
 * Bloques que rompe una explosión de potencia `power` en (x, y, z), en una lista plana [x, y, z, …] sin
 * repetir. `get` da el bloque (−1 sin cargar: detiene el rayo).
 */
export function explodedBlocks(
  get: (x: number, y: number, z: number) => number, x: number, y: number, z: number, power: number, rand: () => number,
  resist?: (id: number, r: number) => number,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let r = 0; r < RAYS.length; r += 3) {
    const dx = RAYS[r] * 0.3, dy = RAYS[r + 1] * 0.3, dz = RAYS[r + 2] * 0.3;
    let f = power * (0.7 + rand() * 0.6);
    let px = x, py = y, pz = z;
    while (f > 0) {
      const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
      if (by < MIN_Y || by >= MAX_Y) break;
      const id = get(bx, by, bz);
      if (id < 0) break;
      if (id > 0) f -= ((resist ? resist(id, blastResistance(id)) : blastResistance(id)) + 0.3) * 0.3; // (8.7: la calavera azul)
      if (f > 0 && id > 0 && !BLOCK_FLUID[id]) {
        const k = posKey(bx, by, bz);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(bx, by, bz);
        }
      }
      px += dx;
      py += dy;
      pz += dz;
      f -= 0.22500001;
    }
  }
  return out;
}
