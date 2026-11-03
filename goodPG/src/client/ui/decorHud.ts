// Fase 6.5 (decoración): viñeta redonda al mirar por el catalejo y la hora del mundo cuando se lleva
// un reloj en la mano (principal o secundaria).
import './decorHud.css';

let spy: HTMLDivElement | null = null;
let clock: HTMLDivElement | null = null;
let lastClock = '';

function ensure(): void {
  if (spy) return;
  const hud = document.getElementById('hud');
  if (!hud) return;
  spy = document.createElement('div');
  spy.id = 'decor-spyglass';
  spy.className = 'hidden';
  clock = document.createElement('div');
  clock.id = 'decor-clock';
  clock.className = 'hidden';
  hud.append(spy, clock);
}

/** Hora (hh:mm) de un instante del día: 0 es el amanecer (las 6:00, como en Minecraft). */
export function clockText(dayTime: number): string {
  const mins = Math.floor((((dayTime % 1) + 1) % 1) * 24 * 60 + 6 * 60) % (24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  const part = h >= 6 && h < 12 ? 'mañana' : h >= 12 && h < 18 ? 'tarde' : h >= 18 && h < 21 ? 'atardecer' : 'noche';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${part}`;
}

/** spyglass: mirando por el catalejo; clockTime: instante del día (fracción) o null sin reloj. */
export function renderDecorHud(spyglass: boolean, clockTime: number | null, show: boolean): void {
  ensure();
  if (!spy || !clock) return;
  spy.classList.toggle('hidden', !spyglass || !show);
  const text = show && clockTime !== null && !spyglass ? clockText(clockTime) : '';
  if (text === lastClock) return;
  lastClock = text;
  clock.classList.toggle('hidden', !text);
  clock.textContent = text;
}
