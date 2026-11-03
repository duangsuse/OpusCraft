// Efectos de las criaturas acuáticas (fase 6): chapoteos, el pez globo que se hincha, cubos con
// criatura, huevos de tortuga que se agrietan y eclosionan, saltos de rana.
import { TURTLE_EGG } from '../../shared/blocks';
import type { Game } from './Game';

/** Atiende un efecto del servidor; devuelve false si no es de las criaturas acuáticas. */
export function aquaticFx(g: Game, kind: string, p: [number, number, number]): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'splash':
      g.audio.playSplash(p, 0.6);
      fx.pfx.splash(p[0], p[1], p[2], 12);
      fx.pfx.bubbles(p[0], p[1] - 0.4, p[2], 4);
      return true;
    case 'puffer_inflate':
      g.audio.playSplash(p, 0.25);
      fx.pfx.bubbles(p[0], p[1], p[2], 8, 0.4);
      return true;
    case 'bucket_fill_fish':
    case 'bucket_empty_fish':
      g.audio.playSplash(p, 0.45);
      return true;
    case 'turtle_egg_crack':
      g.audio.playBlockHit('stone', p);
      return true;
    case 'turtle_egg_hatch':
      g.audio.playBreak('stone', p);
      fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), TURTLE_EGG, 0xf0);
      return true;
    case 'turtle_lay_egg':
      g.audio.playPlace('sand', p);
      return true;
    case 'frog_hop':
    case 'tadpole_grow':
      g.audio.playPlace('grass', p);
      return true;
    // La rana saca la lengua y se come un cubo pequeño.
    case 'frog_tongue':
    case 'frog_eat':
      g.audio.playEquipSfx(kind, p);
      return true;
  }
  return false;
}
