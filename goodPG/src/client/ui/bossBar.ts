// Fase 8.6 (el End): la barra del jefe (arriba, en el centro): el nombre y la vida que le queda, con lo que acaba de
// perder vaciándose detrás.
import './bossBar.css';

let el: HTMLDivElement | null = null;
let fill: HTMLDivElement | null = null;
let lag: HTMLDivElement | null = null;
let label: HTMLSpanElement | null = null;
let last = '';

function ensure(): void {
  if (el) return;
  const hud = document.getElementById('hud');
  if (!hud) return;
  el = document.createElement('div');
  el.id = 'boss-bar';
  el.className = 'hidden';
  label = document.createElement('span');
  const track = document.createElement('div');
  track.className = 'track';
  lag = document.createElement('div');
  lag.className = 'lag';
  fill = document.createElement('div');
  fill.className = 'fill';
  track.append(lag, fill);
  el.append(label, track);
  hud.appendChild(el);
}

/** Pinta la barra (null o `show` falso la ocultan). */
export function renderBossBar(st: { name: string; h: number; c?: string } | null, show: boolean): void {
  ensure();
  if (!el || !fill || !lag || !label) return;
  const key = st && show ? `${st.name}.${st.h}.${st.c ?? ''}` : '';
  if (key === last) return;
  last = key;
  if (!st || !show) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('purple', st.c === 'purple'); // Fase 8.7: la del Wither
  label.textContent = st.name;
  const w = `${(Math.max(0, Math.min(1, st.h)) * 100).toFixed(1)}%`;
  fill.style.width = w;
  lag.style.width = w;
}
