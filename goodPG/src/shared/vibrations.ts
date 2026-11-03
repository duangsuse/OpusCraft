// Fase 7.5 (abismo): vibraciones (los «game events» de Minecraft que oyen los sensores de sculk, los
// chilladores y el warden). Aquí sólo lo puro: la frecuencia de cada suceso, cuáles se ignoran si quien
// los causa va agachado, qué bloques ahogan u ocluyen las vibraciones y la potencia que da un sensor
// según la distancia. El sistema que las propaga está en sim/server/vibrations.ts (ver docs/vibraciones.md).
import { familyBase, defs } from './blocks';

/** Sucesos que producen vibraciones, con su frecuencia (la tabla de Minecraft 1.20+). */
export const VIBRATION_FREQUENCY = {
  step: 1, swim: 1, flap: 1,
  projectile_land: 2, hit_ground: 2, splash: 2,
  item_interact_finish: 3, projectile_shoot: 3, instrument_play: 3,
  entity_action: 4, elytra_glide: 4, unequip: 4,
  entity_dismount: 5, equip: 5,
  entity_interact: 6, shear: 6, entity_mount: 6,
  entity_damage: 7,
  drink: 8, eat: 8,
  container_close: 9, block_close: 9, block_deactivate: 9, block_detach: 9,
  container_open: 10, block_open: 10, block_activate: 10, block_attach: 10, prime_fuse: 10, note_block_play: 10,
  block_change: 11,
  block_destroy: 12, fluid_pickup: 12,
  block_place: 13, fluid_place: 13,
  entity_place: 14, lightning_strike: 14, teleport: 14,
  entity_die: 15, explode: 15,
} as const;

export type VibrationEvent = keyof typeof VIBRATION_FREQUENCY
  /** Resonancia de la amatista junto a un sensor que se activa (frecuencia 1..15). */
  | 'resonate'
  /** Un sensor que se activa hace chasquear sus zarcillos: sólo lo oyen los chilladores y el warden (no es una vibración). */
  | 'tendrils_clicking'
  /** Un chillador chilla: sólo lo oye el warden. */
  | 'shriek';

/** Frecuencia de un suceso (la de la resonancia va aparte); 0 si no es una vibración. */
export function vibrationFrequency(ev: VibrationEvent, resonance = 0): number {
  if (ev === 'resonate') return resonance;
  if (ev === 'tendrils_clicking' || ev === 'shriek') return 0;
  return VIBRATION_FREQUENCY[ev];
}

/** Sucesos que no vibran si quien los causa va agachado (etiqueta `ignore_vibrations_sneaking`). */
export const IGNORED_WHEN_SNEAKING: ReadonlySet<VibrationEvent> = new Set<VibrationEvent>([
  'hit_ground', 'projectile_shoot', 'step', 'swim', 'item_interact_finish',
]);

/** Alcance de los oyentes (bloques). */
export const SENSOR_RANGE = 8;
export const CALIBRATED_RANGE = 16;
export const SHRIEKER_RANGE = 8;
export const WARDEN_LISTEN_RANGE = 16;

/** Ticks que un sensor pasa activo (el calibrado, menos) y enfriándose (los de Minecraft 1.20+). */
export const SENSOR_ACTIVE_TICKS = 30;
export const CALIBRATED_ACTIVE_TICKS = 10;
export const SENSOR_COOLDOWN_TICKS = 10;

/** Potencia que da un sensor por una vibración que viene de `distance` bloques con alcance `range`. */
export function sensorPower(distance: number, range: number): number {
  return Math.max(1, 15 - Math.floor((15 / range) * distance));
}

/** Ticks que tarda una vibración en llegar (un bloque por tick). */
export function travelTicks(distance: number): number {
  return Math.floor(distance);
}

let woolTable: Uint8Array | null = null;
function wool(): Uint8Array {
  if (!woolTable) {
    // 1: lana (ocluye y ahoga); 2: alfombra de lana (sólo ahoga lo que pasa encima).
    woolTable = new Uint8Array(defs.length);
    for (const b of defs) {
      if (!b) continue;
      const key = defs[familyBase(b.id)]?.key ?? b.key;
      if (/_wool$/.test(key)) woolTable[b.id] = 1;
      else if (/_carpet$/.test(key) && key !== 'moss_carpet') woolTable[b.id] = 2;
    }
  }
  return woolTable;
}

/** ¿Ocluye las vibraciones que lo atraviesan? (la lana: etiqueta `occludes_vibration_signals`). */
export function occludesVibrations(id: number): boolean {
  return id > 0 && wool()[id] === 1;
}

/** ¿Ahoga las vibraciones de lo que hay encima o de sí mismo? (lana y alfombras: `dampens_vibrations`). */
export function dampensVibrations(id: number): boolean {
  return id > 0 && wool()[id] > 0;
}

/**
 * ¿Hay lana entre el origen y el oyente? Recorre las celdas que cruza el segmento (como
 * `isBlockInLine` de Minecraft), sin contar la del origen ni la del oyente.
 */
export function vibrationOccluded(
  get: (x: number, y: number, z: number) => number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
): boolean {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  let cx = Math.floor(x0), cy = Math.floor(y0), cz = Math.floor(z0);
  const ex = Math.floor(x1), ey = Math.floor(y1), ez = Math.floor(z1);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
  let tx = sx > 0 ? (cx + 1 - x0) * tdx : sx < 0 ? (x0 - cx) * tdx : Infinity;
  let ty = sy > 0 ? (cy + 1 - y0) * tdy : sy < 0 ? (y0 - cy) * tdy : Infinity;
  let tz = sz > 0 ? (cz + 1 - z0) * tdz : sz < 0 ? (z0 - cz) * tdz : Infinity;
  for (let i = 0; i < 64; i++) {
    if (tx <= ty && tx <= tz) {
      if (tx > 1) break;
      cx += sx;
      tx += tdx;
    } else if (ty <= tz) {
      if (ty > 1) break;
      cy += sy;
      ty += tdy;
    } else {
      if (tz > 1) break;
      cz += sz;
      tz += tdz;
    }
    if (cx === ex && cy === ey && cz === ez) break;
    if (occludesVibrations(get(cx, cy, cz))) return true;
  }
  return false;
}

/** Desplazamiento (−63..63 por eje, en medios bloques) empaquetado en un número para un efecto (partículas). */
export function packDelta(dx: number, dy: number, dz: number): number {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 2) + 128));
  return q(dx) | (q(dy) << 8) | (q(dz) << 16);
}

export function unpackDelta(v: number): [number, number, number] {
  return [((v & 255) - 128) / 2, (((v >> 8) & 255) - 128) / 2, (((v >> 16) & 255) - 128) / 2];
}
