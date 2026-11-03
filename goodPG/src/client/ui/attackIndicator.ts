// Indicador de recarga del ataque bajo la mira (como en Minecraft 1.9+): se llena según el ritmo del
// arma y desaparece cuando el golpe ya hace todo su daño.
import './attackIndicator.css';

let el: HTMLElement | null = null;
let fill: HTMLElement | null = null;
let last = -1;

/** `charge` 0..1; `show` false oculta (HUD escondido, muerto, pantalla abierta). */
export function renderAttackIndicator(charge: number, show: boolean): void {
  if (!el) {
    el = document.createElement('div');
    el.id = 'attack-bar';
    fill = document.createElement('i');
    el.appendChild(fill);
    document.getElementById('hud')?.appendChild(el);
  }
  const v = show && charge < 1 ? Math.round(charge * 32) / 32 : -1;
  if (v === last) return;
  last = v;
  el.classList.toggle('hidden', v < 0);
  if (v >= 0) fill!.style.width = `${v * 100}%`;
}
