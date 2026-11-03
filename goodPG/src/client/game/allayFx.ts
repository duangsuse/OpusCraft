// Fase 7.5 (mansión): efectos del alay que manda el servidor: darle y quitarle el objeto, recoger,
// lanzar lo recogido y duplicarse (sonido y partículas).
import type { Game } from './Game';

/** Atiende un efecto del servidor; false si no es del alay. */
export function allayFx(g: Game, kind: string, p: [number, number, number]): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'allay_give':
    case 'allay_take':
    case 'allay_throw':
      g.audio.playAllaySfx(kind, p);
      if (kind === 'allay_give') fx.spawnSparkles(p[0], p[1], p[2], 8, 0.4);
      return true;
    case 'allay_pickup':
      g.audio.playAllaySfx(kind, p);
      fx.spawnSparkles(p[0], p[1], p[2], 4, 0.3);
      return true;
    case 'allay_dup':
      g.audio.playAllaySfx(kind, p);
      fx.spawnHearts(p[0], p[1], p[2], 6, 0.5);
      fx.spawnSparkles(p[0], p[1], p[2], 18, 0.8);
      return true;
    default:
      return false;
  }
}
