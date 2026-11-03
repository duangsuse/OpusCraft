// Barra de armadura del HUD (10 petos encima de los corazones, como en Minecraft) y las siluetas
// de las ranuras de armadura vacías del inventario, en pixel art dibujado en código.
import './armor.css';

type Pal = Record<string, string>;

const CHEST = [
  'KKK...KKK',
  'KwWK.KwwK',
  'KwwwKwwdK',
  '.KwwwwdK.',
  '.KWwwwdK.',
  '.KwwwwdK.',
  '.KwwwwdK.',
  '.KwwwddK.',
  '.KKKKKKK.',
];

/** Siluetas (16 de ancho, centradas en 16x16) de las ranuras vacías: casco, peto, grebas y botas. */
const SILHOUETTES = [
  [
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '...###....###...',
    '...##......##...',
    '...##......##...',
  ],
  [
    '..####....####..',
    '.######..######.',
    '.##############.',
    '.##############.',
    '.##.########.##.',
    '.##.########.##.',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
  ],
  [
    '....########....',
    '....########....',
    '....########....',
    '....###..###....',
    '....###..###....',
    '....###..###....',
    '....###..###....',
    '....###..###....',
    '....###..###....',
    '....###..###....',
    '....###..###....',
  ],
  [
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '...###....###...',
    '..####....####..',
    '..####....####..',
  ],
];

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

/** Peto de 9x9 como los corazones: lleno, la mitad izquierda o vacío. */
function drawChest(pal: Pal, half: 'full' | 'left' | 'none', emptyPal: Pal): string {
  const [c, g] = canvas(9);
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const ch = CHEST[y][x];
      if (ch === '.') continue;
      const filled = half === 'full' || (half === 'left' && x < 5);
      g.fillStyle = ch === 'K' ? pal.K : filled ? pal[ch] : emptyPal[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL();
}

let icons: { full: string; half: string; empty: string } | null = null;
let lastKey = '';

export function renderArmorBar(points: number, show: boolean): void {
  const el = document.getElementById('armor-bar');
  if (!el) return;
  const n = Math.max(0, Math.min(20, Math.round(points)));
  const key = show && n > 0 ? String(n) : 'off';
  if (key === lastKey) return;
  lastKey = key;
  el.classList.toggle('hidden', key === 'off');
  if (key === 'off') return;
  if (!icons) {
    const pal: Pal = { K: '#141414', w: '#c9c9c9', W: '#f4f4f4', d: '#8a8a8a' };
    const empty: Pal = { w: '#2c2c2c', W: '#2c2c2c', d: '#2c2c2c' };
    icons = { full: drawChest(pal, 'full', empty), half: drawChest(pal, 'left', empty), empty: drawChest(pal, 'none', empty) };
  }
  let h = '';
  for (let i = 0; i < 10; i++) {
    const v = n - i * 2;
    h += `<i style="background-image:url(${v >= 2 ? icons.full : v === 1 ? icons.half : icons.empty})"></i>`;
  }
  el.innerHTML = h;
}

let silhouettes: string[] | null = null;

/** Siluetas de las ranuras de armadura vacías (0 cabeza .. 3 pies), como data URL. */
export function armorSilhouettes(): string[] {
  if (silhouettes) return silhouettes;
  silhouettes = SILHOUETTES.map((rows) => {
    const [c, g] = canvas(16);
    const top = (16 - rows.length) >> 1;
    g.fillStyle = '#ffffff';
    rows.forEach((row, y) => {
      for (let x = 0; x < 16; x++) if (row[x] === '#') g.fillRect(x, top + y, 1, 1);
    });
    return c.toDataURL();
  });
  return silhouettes;
}
