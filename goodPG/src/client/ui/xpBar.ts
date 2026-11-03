// Barra de experiencia y nivel del HUD (encima de la barra rápida), sólo en supervivencia y vivo.
import type { Experience } from '../game/experience';
import './xp.css';

let lastKey = '';
let lastLevel = -1;

export function renderXpBar(xp: Experience, show: boolean): void {
  const key = show ? String(xp.version) : 'off';
  if (key === lastKey) return;
  lastKey = key;
  const bar = document.getElementById('xp-bar');
  const fill = document.getElementById('xp-fill');
  const label = document.getElementById('xp-level');
  if (!bar || !fill || !label) return;
  bar.classList.toggle('off', !show);
  if (!show) return;
  const level = xp.level;
  fill.style.width = `${(xp.progress * 100).toFixed(1)}%`;
  label.textContent = level > 0 ? String(level) : '';
  // Pequeño salto del número al subir de nivel (no al cargar la partida).
  if (lastLevel >= 0 && level > lastLevel) {
    label.classList.remove('up');
    void label.offsetWidth;
    label.classList.add('up');
  }
  lastLevel = level;
}
