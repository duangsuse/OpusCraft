// Fase 7.5 (abismo): la brújula de recuperación. Con ella en cualquier mano se ve una esfera de pizarra
// cuya aguja turquesa apunta a donde murió el jugador por última vez (lo manda el servidor al entrar y al
// morir); si no ha muerto nunca, la aguja gira sin rumbo (como en Minecraft).
import { RECOVERY_COMPASS } from '../../shared/items';
import type { Game } from './Game';
import '../ui/recoveryCompass.css';

/** Última muerte conocida de cada partida (null si no ha muerto nunca). */
const deaths = new WeakMap<Game, [number, number, number]>();
let el: HTMLDivElement | null = null;
let needle: HTMLDivElement | null = null;

/** El servidor dice dónde murió el jugador por última vez. */
export function setLastDeath(g: Game, p: unknown): void {
  if (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) deaths.set(g, [Number(p[0]), Number(p[1]), Number(p[2])]);
}

export function lastDeath(g: Game): [number, number, number] | null {
  return deaths.get(g) ?? null;
}

/** Cada fotograma (desde la navegación): muestra u oculta la esfera y mueve la aguja. */
export function updateRecoveryCompass(g: Game, hide: boolean): void {
  const show = !hide && (g.heldStack?.id === RECOVERY_COMPASS || g.inv.offhand?.id === RECOVERY_COMPASS);
  if (!show) {
    if (el) el.style.display = 'none';
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'recovery-compass-view';
    el.innerHTML = '<div class="needle"></div>';
    needle = el.querySelector('.needle');
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  const p = g.player;
  const target = deaths.get(g);
  let a: number;
  if (!target || Math.hypot(target[0] - p.x, target[2] - p.z) < 2) a = performance.now() / 150;
  else {
    const dx = target[0] + 0.5 - p.x, dz = target[2] + 0.5 - p.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  }
  needle!.style.transform = `translate(-50%, -100%) rotate(${a}rad)`;
}
