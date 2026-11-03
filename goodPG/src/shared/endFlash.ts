// Fase 8.6 (el End): los destellos del cielo del End (EndFlashState de la 26.3). El tiempo se parte en ventanas de
// 600 ticks (30 s); en cada una hay un destello que empieza entre el tick 0 y el 200 de la ventana, dura de 100 a
// 380 ticks (sin salirse de ella) con una intensidad que sube y baja como un seno, y viene de una dirección al
// azar (entre 10° por debajo del horizonte y 60° por encima, en cualquier rumbo). Todo sale de la ventana, así
// que todos los jugadores ven el mismo destello a la vez. El trueno suena 30 ticks después de empezar.
import { mulberry32 } from './world/noise';

export const END_FLASH_INTERVAL = 600;
export const END_FLASH_SOUND_DELAY = 30;

interface FlashParams {
  offset: number;
  duration: number;
  /** Dirección (unitaria) de la que viene. */
  dir: [number, number, number];
}

let cachedWindow = -1;
let cached: FlashParams | null = null;

/** Los parámetros del destello de la ventana `w`. */
function paramsOf(w: number): FlashParams {
  if (w === cachedWindow && cached) return cached;
  const r = mulberry32((w * 0x9e3779b1) ^ 0x5eed);
  r();
  const offset = Math.floor(r() * 201);
  const duration = 100 + Math.floor(r() * (Math.min(380, END_FLASH_INTERVAL - offset) - 100 + 1));
  const xAngle = -60 + r() * 70, yAngle = -180 + r() * 360;
  const pitch = (-xAngle * Math.PI) / 180, yaw = (yAngle * Math.PI) / 180;
  cached = { offset, duration, dir: [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)] };
  cachedWindow = w;
  return cached;
}

/** El destello en el tick `t` (con fracción): dirección e intensidad (0 si no hay). */
export function endFlashAt(t: number): { dir: [number, number, number]; intensity: number; sinceStart: number } {
  const w = Math.floor(t / END_FLASH_INTERVAL);
  const p = paramsOf(w);
  const l = t - w * END_FLASH_INTERVAL;
  const on = l >= p.offset && l <= p.offset + p.duration;
  return { dir: p.dir, intensity: on ? Math.sin(((l - p.offset) * Math.PI) / p.duration) : 0, sinceStart: on ? l - p.offset : -1 };
}
