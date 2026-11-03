// Fase 7.5 (fauna): efectos de las criaturas sueltas que llegan del servidor: el murciélago que
// despega, la champiñaca esquilada o cambiada por un rayo y la flor que se come la champiñaca marrón.
import type { Game } from './Game';

/** true si el efecto era de este módulo. */
export function critterFx(g: Game, kind: string, p: [number, number, number]): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'bat_takeoff':
      g.audio.playMob('bat', 'attack', p);
      return true;
    case 'mooshroom_shear':
      // Se queda en vaca: tijeretazo y una nube de humo.
      g.audio.playBreak('wool', p);
      fx.spawnSmoke(p[0], p[1], p[2], 18, 0.7, 0.85, 0.45, 1);
      return true;
    case 'mooshroom_convert':
      g.audio.playMob('cow', 'hurt', p);
      fx.spawnSmoke(p[0], p[1], p[2], 12, 0.6, 0.6, 0.35, 0.9);
      return true;
    case 'stew_flower':
      g.audio.playEat();
      fx.spawnSparkles(p[0], p[1], p[2], 10, 0.5);
      return true;
    default:
      return false;
  }
}
