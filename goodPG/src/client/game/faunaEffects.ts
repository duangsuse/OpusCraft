// Efectos de la fauna de la fase 6 que llegan del servidor: abejas que entran en el nido o se
// cargan de polen, cosecha de miel, pandas comiendo, armadillos que se enroscan y escamas.
import { HONEY_BLOCK } from '../../shared/blocks';
import { BAMBOO } from '../../shared/blocks'; // Fase 6.5 (maderas): los pandas comen bambú
import type { Game } from './Game';

export function faunaFx(g: Game, kind: string, p: [number, number, number], a?: number): void {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'bee_enter':
      g.audio.playMob('bee', 'idle', p);
      break;
    case 'bee_pollen':
      fx.spawnSparkles(p[0], p[1], p[2], 4, 0.2);
      break;
    case 'honey_harvest':
      // a = 1 con tijeras (panal), 0 con frasco (miel).
      if (a) g.audio.playBreak('wood', p);
      else g.audio.playSplash(p, 0.15);
      fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), HONEY_BLOCK, 0xf0);
      break;
    case 'panda_eat':
      g.audio.playBreak('grass', p);
      fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), BAMBOO, 0xf0);
      break;
    case 'armadillo_roll':
      // a = 1 al enroscarse, 0 al desenroscarse.
      g.audio.playMob('armadillo', a ? 'attack' : 'idle', p);
      break;
    case 'scute':
      g.audio.playPlace('stone', p);
      break;
    case 'brush':
      g.audio.playBreak('sand', p);
      fx.spawnSmoke(p[0], p[1], p[2], 5, 0.25, 0.75, 0.25, 0.6);
      break;
  }
}
