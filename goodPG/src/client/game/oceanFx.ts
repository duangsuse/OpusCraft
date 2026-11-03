// Fase 7.5 (océano): efectos de los guardianes que llegan del servidor: el láser que empieza a cargar,
// los coletazos fuera del agua, el pinchazo de las púas, la maldición del anciano y el delfín que llegó a
// su tesoro.
import type { Game } from './Game';
import { showElderCurse } from './elderCurse';

/** Atiende un efecto del servidor; false si no es de los del océano. `a`: tipo de criatura. */
export function oceanFx(g: Game, kind: string, p: [number, number, number], a?: number): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'guardian_laser':
      g.audio.playOceanSfx(kind, p, a);
      return true;
    case 'guardian_flop':
      g.audio.playOceanSfx(kind, p, a);
      fx.pfx.splash(p[0], p[1], p[2], 4);
      return true;
    case 'guardian_thorns':
      g.audio.playOceanSfx(kind, p, a);
      return true;
    case 'dolphin_arrived':
      // El delfín llegó al tesoro: chispas de alegría.
      fx.spawnSparkles(p[0], p[1], p[2], 16, 0.8);
      g.audio.playSplash(p, 0.3);
      return true;
    case 'elder_curse':
      showElderCurse(g);
      return true;
  }
  return false;
}
