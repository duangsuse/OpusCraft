// Fase 6 (asaltos): barra del asalto (arriba, en el centro, como la de los jefes de Minecraft).
// Muestra la oleada y la vida que les queda a los asaltantes; en la calma entre oleadas se va
// llenando hasta que llega la siguiente; al final, «Victoria» o «Derrota».
import './raidBar.css';

export interface RaidState {
  /** 0 ninguno, 1 en curso, 2 victoria, 3 derrota. */
  s: number;
  w: number;
  n: number;
  h: number;
  r: number;
}

let el: HTMLDivElement | null = null;
let fill: HTMLDivElement | null = null;
let label: HTMLSpanElement | null = null;
let last = '';

function ensure(): void {
  if (el) return;
  const hud = document.getElementById('hud');
  if (!hud) return;
  el = document.createElement('div');
  el.id = 'raid-bar';
  el.className = 'hidden';
  label = document.createElement('span');
  const track = document.createElement('div');
  track.className = 'track';
  fill = document.createElement('div');
  fill.className = 'fill';
  track.appendChild(fill);
  el.append(label, track);
  hud.appendChild(el);
}

/** Pinta el estado del asalto cercano (s = 0 la oculta). */
export function renderRaidBar(st: RaidState | null, show: boolean): void {
  ensure();
  if (!el || !fill || !label) return;
  const key = st && show ? `${st.s}.${st.w}.${st.n}.${st.h}.${st.r}` : '';
  if (key === last) return;
  last = key;
  if (!st || !show || st.s === 0) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('won', st.s === 2);
  el.classList.toggle('lost', st.s === 3);
  const waiting = st.s === 1 && st.r === 0;
  el.classList.toggle('waiting', waiting);
  if (st.s === 2) {
    label.textContent = 'Asalto · Victoria';
    fill.style.width = '0%';
  } else if (st.s === 3) {
    label.textContent = 'Asalto · Derrota';
    fill.style.width = '0%';
  } else {
    const left = st.r > 0 ? ` · quedan ${st.r}` : '';
    label.textContent = `Asalto · Oleada ${st.w} de ${st.n}${left}`;
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, st.h)) * 100)}%`;
  }
}
