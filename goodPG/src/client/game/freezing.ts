// Fase 6.5 (materiales): congelarse en la nieve polvo (como en Minecraft). Dentro, el frío sube hasta
// congelar del todo en 7 s; congelado, se pierde medio corazón cada 2 s; fuera, se descongela al doble
// de ritmo. Cualquier pieza de armadura de cuero protege (y el modo creativo). La pantalla se escarcha
// según el frío (ver ui/frostHud.ts).
import { ITEMS } from '../../shared/items';
import { POWDER_SNOW } from '../../shared/blocks';
import { stepFreeze, FREEZE_TICKS, FREEZE_DAMAGE_EVERY } from '../../shared/materialPhysics';
import type { Game } from './Game';

export class Freezing {
  /** Frío acumulado en ticks (0..FREEZE_TICKS). */
  ticks = 0;
  private damageT = 0;

  /** 0 (nada) .. 1 (congelado del todo). */
  get fraction(): number {
    return this.ticks / FREEZE_TICKS;
  }

  /** ¿Lleva alguna pieza de cuero? (las botas, además, dejan andar por encima de la nieve polvo). */
  static wearsLeather(g: Game): boolean {
    return g.inv.armor.some((s) => !!s && ITEMS[s.id]?.armor?.material === 'leather');
  }

  /** ¿Tiene los ojos dentro de la nieve polvo? (la pantalla se tapa de blanco). */
  static eyesInPowder(g: Game): boolean {
    const p = g.player;
    return g.world?.getBlock(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z)) === POWDER_SNOW;
  }

  /** Un frame; devuelve el daño a aplicar por el frío (0 casi siempre). */
  update(g: Game, dt: number): number {
    const p = g.player;
    this.ticks = stepFreeze(this.ticks, dt, p.inPowder && !p.flying, g.creative || Freezing.wearsLeather(g));
    if (this.ticks < FREEZE_TICKS || g.creative) {
      this.damageT = 0;
      return 0;
    }
    this.damageT += dt;
    if (this.damageT < FREEZE_DAMAGE_EVERY) return 0;
    this.damageT = 0;
    return 1;
  }
}
