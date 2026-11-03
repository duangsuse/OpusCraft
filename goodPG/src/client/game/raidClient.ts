// Fase 6 (asaltos), lado del cliente: la botella ominosa y el tótem de inmortalidad.
// - Al beberse la botella ominosa, el cliente se pone Mal presagio (lo hace la comida) y avisa al
//   servidor, que es quien decide cuándo empieza un asalto.
// - Tótem de inmortalidad: si el jugador va a morir con él en la mano (o en la secundaria), se gasta,
//   se queda con medio corazón y recibe Regeneración II, Absorción II y Resistencia al fuego.
import { OMINOUS_BOTTLE, TOTEM_OF_UNDYING } from '../../shared/items';
import { EFFECT_REGENERATION, EFFECT_ABSORPTION, EFFECT_FIRE_RESISTANCE } from '../../shared/effects';
import { OFFHAND } from './Inventory';
import type { Game } from './Game';

/** Después de comer o beber algo: la botella ominosa avisa al servidor. */
export function afterDrinkOminous(g: Game, item: number): void {
  if (item === OMINOUS_BOTTLE) g.net?.send({ t: 'omen', a: 0 });
}

/**
 * ¿Salva un tótem al jugador de esta muerte? Si es así lo gasta y lo deja con vida. No sirve contra
 * el vacío ni contra /matar (como en Minecraft).
 */
export function useTotem(g: Game): boolean {
  const surv = g.survival;
  if (g.creative || surv.deathCause === 'void' || surv.deathCause === 'kill') return false;
  const slot = g.inv.get(g.selected)?.id === TOTEM_OF_UNDYING ? g.selected : g.inv.get(OFFHAND)?.id === TOTEM_OF_UNDYING ? OFFHAND : -1;
  if (slot < 0) return false;
  g.inv.consume(slot, 1);
  surv.dead = false;
  surv.deathCause = '';
  surv.health = 1;
  surv.version++;
  const fx = g.statusEffects;
  fx.clear(surv);
  fx.add(EFFECT_REGENERATION, 45, 1, surv);
  fx.add(EFFECT_ABSORPTION, 5, 1, surv);
  fx.add(EFFECT_FIRE_RESISTANCE, 40, 0, surv);
  const p = g.player;
  g.effects.onFx('totem', [p.x, p.y + 1, p.z]);
  g.sendState(true);
  return true;
}
