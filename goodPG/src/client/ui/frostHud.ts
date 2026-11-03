// Fase 6.5 (materiales): pantalla escarchada al congelarse en la nieve polvo (los bordes se llenan de
// escarcha según el frío) y la vista tapada de nieve cuando los ojos están dentro de ella. La escarcha
// se pinta una vez en un lienzo (cristales ramificados desde los bordes, transparente en el centro).
import './frostHud.css';

let frost: HTMLDivElement | null = null;
let powder: HTMLDivElement | null = null;
let lastFrost = -1;
let lastPowder = false;

/** Escarcha procedural: ramas de hielo que nacen en los bordes y se aclaran hacia el centro. */
function frostImage(): string {
  const W = 512, H = 288;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  let s = 0x5eed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // Velo blanco azulado en los bordes.
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(210, 235, 255, 0)');
  g.addColorStop(0.65, 'rgba(214, 236, 255, 0.3)');
  g.addColorStop(1, 'rgba(236, 248, 255, 0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Ramas: desde un punto del borde hacia dentro, con brotes a los lados.
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    let px = x, py = y;
    const steps = Math.max(2, Math.floor(len / 6));
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.5;
      const nx = px + Math.cos(a) * 6, ny = py + Math.sin(a) * 6;
      const d = Math.hypot(nx - W / 2, (ny - H / 2) * (W / H)) / (W / 2);
      ctx.strokeStyle = `rgba(236, 248, 255, ${Math.min(0.6, Math.max(0, (d - 0.5) * 1.3))})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      if (depth > 0 && rnd() < 0.35) branch(nx, ny, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.5), len * 0.45, Math.max(0.6, w * 0.6), depth - 1);
      px = nx;
      py = ny;
    }
  };
  for (let k = 0; k < 55; k++) {
    const side = Math.floor(rnd() * 4);
    const t = rnd();
    const [x, y] = side === 0 ? [t * W, 0] : side === 1 ? [W, t * H] : side === 2 ? [t * W, H] : [0, t * H];
    const a = Math.atan2(H / 2 - y, W / 2 - x) + (rnd() - 0.5) * 0.9;
    branch(x, y, a, 30 + rnd() * 70, 0.8 + rnd() * 0.9, 2);
  }
  return c.toDataURL();
}

function ensure(): void {
  if (frost) return;
  const hud = document.getElementById('hud');
  if (!hud) return;
  powder = document.createElement('div');
  powder.id = 'frost-powder';
  powder.className = 'hidden';
  frost = document.createElement('div');
  frost.id = 'frost-overlay';
  frost.style.opacity = '0';
  const img = frostImage();
  if (img) frost.style.backgroundImage = `url(${img})`;
  hud.prepend(powder, frost);
}

/** `fraction`: frío acumulado (0..1); `eyesIn`: los ojos dentro de la nieve polvo. */
export function renderFrostHud(fraction: number, eyesIn: boolean, show: boolean): void {
  if (!frost && fraction <= 0 && !eyesIn) return;
  ensure();
  if (!frost || !powder) return;
  const f = show ? Math.round(fraction * 50) / 50 : 0;
  if (f !== lastFrost) {
    lastFrost = f;
    frost.style.opacity = String(f);
  }
  const p = show && eyesIn;
  if (p !== lastPowder) {
    lastPowder = p;
    powder.classList.toggle('hidden', !p);
  }
}
