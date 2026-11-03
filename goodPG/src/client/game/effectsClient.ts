// Fase 7 (efectos): los efectos nuevos en el cliente (los lleva él, como la vida y el movimiento).
// - Antes de mover al jugador: Levitación y Gracia del delfín en su física, la Ceguera (no se corre) y
//   la vida máxima de la Salud mejorada (al acabarse, la vida que sobra se pierde).
// - Con la posición: el bit de Brillo (los demás ven su contorno).
// - Cada frame: la vista (Náuseas, y la niebla negra de la Ceguera y la Oscuridad).
import type { Game } from './Game';
import type { SightFog } from '../render/effectView';
import {
  STATE_GLOWING, BLIND_FOG_END, DARKNESS_FOG_END, darknessPulse, nauseaStep,
} from '../../shared/effects';

/** Antes de mover al jugador. */
export function effectsPhysics(g: Game): void {
  const fx = g.statusEffects;
  const s = g.survival;
  g.player.levitation = fx.levitation;
  g.player.dolphinsGrace = fx.dolphinsGrace;
  s.blind = fx.blind;
  const max = fx.maxHealth;
  if (s.maxHealth !== max) {
    s.maxHealth = max;
    if (s.health > max) {
      s.health = max;
      s.version++;
    }
  }
}

/** Bits de estado que se mandan con la posición. */
export function effectsPosState(g: Game): number {
  return g.statusEffects.glowing ? STATE_GLOWING : 0;
}

let nausea = 0;

/** Lo que los efectos cambian en la imagen de este frame. */
export function effectsView(g: Game, dt: number): { nausea: number; sight: SightFog | null } {
  const fx = g.statusEffects;
  nausea = nauseaStep(nausea, fx.nauseous && !g.survival.dead, dt);
  const far = g.cfg.settings.render.renderDistance * 16;
  let sight: SightFog | null = null;
  // Oscuridad: la niebla se queda a 15 bloques y la vista se apaga a pulsos.
  const dk = fx.darkness;
  if (dk > 0) {
    const end = far + (DARKNESS_FOG_END - far) * dk;
    sight = { start: end * 0.75, end, sky: dk, dark: 0.55 * darknessPulse(performance.now() / 1000) * dk };
  }
  // Ceguera: a 5 bloques (y el cielo, negro).
  const bl = fx.blindness;
  if (bl > 0) {
    const end = far + (BLIND_FOG_END - far) * bl;
    if (!sight || end < sight.end) sight = { start: end * 0.25, end, sky: Math.max(bl, sight?.sky ?? 0), dark: sight?.dark ?? 0 };
  }
  return { nausea, sight };
}
