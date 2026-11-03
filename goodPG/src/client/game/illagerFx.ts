// Efectos de los asaltos (fase 6): cuerno, ballesta, conjuros del evocador, mordisco de los colmillos,
// rugido del devastador, tótem de inmortalidad, victoria y derrota.
import type { Game } from './Game';

/** Atiende un efecto del servidor; devuelve false si no es de los asaltos. */
export function illagerFx(g: Game, kind: string, p: [number, number, number], a?: number): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'raid_horn':
      // El cuerno se oye en toda la aldea (sin distancia).
      g.audio.playRaidSfx('raid_horn', null);
      return true;
    case 'raid_win':
    case 'raid_lose':
      g.audio.playRaidSfx(kind, null);
      if (kind === 'raid_win') fx.spawnSparkles(p[0], p[1], p[2], 30, 3);
      return true;
    case 'crossbow_shoot':
      g.audio.playRaidSfx(kind, p);
      return true;
    case 'evoker_cast':
      // a = 1: invoca vex (más humo); 0: colmillos.
      g.audio.playRaidSfx(kind, p);
      fx.spawnSparkles(p[0], p[1], p[2], a ? 22 : 14, 0.9);
      fx.spawnSmoke(p[0], p[1] - 0.4, p[2], a ? 12 : 6, 0.8, 0.55, 0.28, 0.8);
      return true;
    case 'fangs_bite':
      g.audio.playRaidSfx(kind, p);
      fx.spawnCrit(p[0], p[1], p[2], 6);
      return true;
    case 'ravager_roar':
      g.audio.playRaidSfx(kind, p);
      fx.spawnSmoke(p[0], p[1], p[2], 14, 1.2, 0.65, 0.4, 0.6);
      return true;
    case 'totem':
      g.audio.playRaidSfx(kind, null);
      fx.spawnSparkles(p[0], p[1], p[2], 40, 1.2);
      fx.spawnCrit(p[0], p[1], p[2], 24);
      return true;
    default:
      return false;
  }
}
