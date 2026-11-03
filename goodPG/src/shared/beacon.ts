// Fase 8.5 (lo que da el Nether): el faro (BeaconBlockEntity y BeaconMenu de la 26.3), lo que comparten el servidor
// (los efectos) y el cliente (el haz y la pantalla).
// - Pirámide: el nivel es cuántas capas completas tiene debajo (3×3, 5×5, 7×7 y 9×9) de bloques de hierro, oro,
//   esmeralda, diamante o netherita (se pueden mezclar).
// - Haz: sube hasta arriba del mundo y cada cristal de color lo tiñe (el primero pone su color; los siguientes, la
//   media con el que traía). Un bloque que no deja pasar la luz lo corta y el faro no funciona (el lecho de roca,
//   no: se ve a través del techo del Nether).
// - Efectos: el principal (Velocidad o Prisa desde el nivel 1, Resistencia o Supersalto desde el 2, Fuerza desde el
//   3) y, con el nivel 4, el secundario (Regeneración o el principal en nivel II). Cada 4 s a los jugadores a
//   10 + 10·nivel bloques (en horizontal; en vertical, toda la altura), durante 9 + 2·nivel segundos.
// - Se paga cada cambio con un lingote de hierro u oro, una esmeralda, un diamante o un lingote de netherita.
import {
  IRON_BLOCK, GOLD_BLOCK, EMERALD_BLOCK, DIAMOND_BLOCK, NETHERITE_BLOCK, BEDROCK, BEACON, STAINED_GLASS, STAINED_GLASS_PANES,
  BLOCK_OPAQUE, defs, DYE_COLORS,
} from './blocks';
import { IRON_INGOT, GOLD_INGOT, EMERALD, DIAMOND, NETHERITE_INGOT } from './items';
import { EFFECT_SPEED, EFFECT_HASTE, EFFECT_RESISTANCE, EFFECT_JUMP_BOOST, EFFECT_STRENGTH, EFFECT_REGENERATION } from './effects';
import { MAX_Y } from './constants';

type Get = (x: number, y: number, z: number) => number;

/** Bloques de la pirámide (la etiqueta beacon_base_blocks). */
export const BEACON_BASE: ReadonlySet<number> = new Set([IRON_BLOCK, GOLD_BLOCK, EMERALD_BLOCK, DIAMOND_BLOCK, NETHERITE_BLOCK]);
/** Con qué se paga (la etiqueta beacon_payment_items). */
export const BEACON_PAYMENT: ReadonlySet<number> = new Set([IRON_INGOT, GOLD_INGOT, EMERALD, DIAMOND, NETHERITE_INGOT]);
/** Efectos de cada nivel (BeaconBlockEntity.BEACON_EFFECTS). */
export const BEACON_EFFECTS: readonly (readonly number[])[] = [
  [EFFECT_SPEED, EFFECT_HASTE], [EFFECT_RESISTANCE, EFFECT_JUMP_BOOST], [EFFECT_STRENGTH], [EFFECT_REGENERATION],
];
/** Ticks entre dos repasos del faro (Java: 80). */
export const BEACON_PULSE = 80;

/** Nivel de la pirámide del faro de (x, y, z): 0..4 (updateBase). */
export function beaconLevel(get: Get, x: number, y: number, z: number): number {
  let level = 0;
  for (let n = 1; n <= 4; n++) {
    const by = y - n;
    for (let dx = -n; dx <= n; dx++) {
      for (let dz = -n; dz <= n; dz++) if (!BEACON_BASE.has(get(x + dx, by, z + dz))) return level;
    }
    level = n;
  }
  return level;
}

/** Color (0..1) que cada cristal de color da al haz (DyeColor.getTextureDiffuseColor). */
const DYE_BEAM: Readonly<Record<string, number>> = {
  white: 0xf9fffe, orange: 0xf9801d, magenta: 0xc74ebd, light_blue: 0x3ab3da, yellow: 0xfed83d, lime: 0x80c71f, pink: 0xf38baa,
  gray: 0x474f52, light_gray: 0x9d9d97, cyan: 0x169c9c, purple: 0x8932b8, blue: 0x3c44aa, brown: 0x835432, green: 0x5e7c16,
  red: 0xb02e26, black: 0x1d1d21,
};
const GLASS_COLOR = new Map<number, [number, number, number]>();
for (const c of DYE_COLORS) {
  const v = DYE_BEAM[c];
  const rgb: [number, number, number] = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  GLASS_COLOR.set(STAINED_GLASS[c], rgb);
  GLASS_COLOR.set(STAINED_GLASS_PANES[c], rgb);
}

/** Tramo del haz: desde `y0` (incluido) hasta `y1` (excluido), de un color. */
export interface BeamSegment {
  y0: number;
  y1: number;
  color: [number, number, number];
}

/**
 * Tramos del haz del faro de (x, y, z) hasta arriba del mundo, o null si algo lo corta (el faro no funciona).
 * `top`: hasta dónde mirar (arriba del mundo).
 */
export function beamSegments(get: Get, x: number, y: number, z: number, top = MAX_Y): BeamSegment[] | null {
  const out: BeamSegment[] = [];
  let cur: BeamSegment = { y0: y + 1, y1: y + 1, color: [1, 1, 1] };
  let tinted = false;
  for (let yy = y + 1; yy < top; yy++) {
    const b = get(x, yy, z);
    const glass = GLASS_COLOR.get(b);
    if (glass) {
      const color: [number, number, number] = tinted
        ? [(cur.color[0] + glass[0]) / 2, (cur.color[1] + glass[1]) / 2, (cur.color[2] + glass[2]) / 2]
        : glass;
      tinted = true;
      if (color[0] !== cur.color[0] || color[1] !== cur.color[1] || color[2] !== cur.color[2]) {
        if (cur.y1 > cur.y0) out.push(cur);
        cur = { y0: yy, y1: yy, color };
      }
    } else if (b > 0 && b !== BEDROCK && (BLOCK_OPAQUE[b] || (defs[b]?.lightOpacity ?? 0) >= 15)) {
      return null;
    }
    cur.y1 = yy + 1;
  }
  out.push(cur);
  return out;
}

/** ¿Está el faro encendido? (nivel ≥ 1 y el haz llega arriba). */
export function beaconActive(get: Get, x: number, y: number, z: number): { level: number; segments: BeamSegment[] | null } {
  const level = get(x, y, z) === BEACON ? beaconLevel(get, x, y, z) : 0;
  return { level, segments: level > 0 ? beamSegments(get, x, y, z) : null };
}

/** ¿Vale este principal con este nivel? (en alguno de los niveles alcanzados, sin la Regeneración). */
export function validPrimary(effect: number, level: number): boolean {
  for (let i = 0; i < Math.min(level, 3); i++) if (BEACON_EFFECTS[i].includes(effect)) return true;
  return false;
}

/** ¿Vale este secundario? (sólo con el nivel 4: la Regeneración o el mismo principal, en nivel II). */
export function validSecondary(effect: number, primary: number, level: number): boolean {
  return level >= 4 && validPrimary(primary, level) && (effect === EFFECT_REGENERATION || effect === primary);
}

/** Alcance horizontal y segundos del efecto según el nivel. */
export function beaconRange(level: number): number {
  return level * 10 + 10;
}
export function beaconSeconds(level: number): number {
  return 9 + level * 2;
}
