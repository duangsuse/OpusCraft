// Fase 7 (pociones): el alambique alquímico dentro de la pantalla de inventario (como en Minecraft): el
// combustible (polvo de blaze) con su barra de usos a la izquierda, el ingrediente arriba con las
// burbujas y la flecha que se llena al destilar, y los tres frascos abajo (el del centro, más bajo),
// unidos al ingrediente por los tubos.
import './brewing.css';
import { BREW_BOTTLES, BREW_FUEL, BREW_FUEL_USES, BREW_INGREDIENT, BREW_TIME } from '../../shared/brewing';
import type { ContainerState } from '../../shared/containers';

export const BREWING_HTML =
  '<h3>Soporte para pociones</h3><div class="brew">' +
  `<div class="brew-fuel"><div class="slot2" data-s="cont:${BREW_FUEL}" data-hint="Polvo de blaze"></div>` +
  '<div class="brew-blaze" title="Combustible"><i></i></div></div>' +
  '<div class="brew-main">' +
  '<div class="brew-top"><div class="brew-bubbles"><i></i><i></i><i></i></div>' +
  `<div class="slot2" data-s="cont:${BREW_INGREDIENT}" data-hint="Ingrediente"></div>` +
  '<div class="brew-arrow"><i></i></div></div>' +
  '<div class="brew-pipes"><i></i><i></i><i></i></div>' +
  `<div class="brew-bottles">${BREW_BOTTLES.map((i) => `<div class="slot2${i === 1 ? ' low' : ''}" data-s="cont:${i}" data-hint="Frasco"></div>`).join('')}</div>` +
  '</div></div>';

/** Barra del combustible, flecha del progreso y burbujas (sólo mientras destila). */
export function renderBrewing(panel: HTMLElement, c: ContainerState | null): void {
  const fuel = panel.querySelector('.brew-blaze i') as HTMLElement | null;
  const arrow = panel.querySelector('.brew-arrow i') as HTMLElement | null;
  const bubbles = panel.querySelector('.brew-bubbles') as HTMLElement | null;
  const cook = c ? Math.max(0, Math.min(1, c.cook / BREW_TIME)) : 0;
  if (fuel) fuel.style.width = `${c ? Math.round((Math.max(0, c.burn) / BREW_FUEL_USES) * 100) : 0}%`;
  if (arrow) arrow.style.height = `${Math.round(cook * 100)}%`;
  bubbles?.classList.toggle('on', cook > 0);
}
