// Iconos del HUD de supervivencia (corazones, hambre, burbujas de aire) en pixel art, y los
// iconos de los objetos que no son bloques (a partir del atlas de sprites).
import { ITEMS, itemSpriteIndex } from '../../shared/items';
import type { ItemSprites } from '../textures/itemSprites';

type Pal = Record<string, string>;

const HEART = [
  '.KK...KK.',
  'KrrK.KrrK',
  'KrWrKrrrK',
  'KrrrrrrrK',
  'KrrrrrrdK',
  '.KrrrrdK.',
  '..KrrdK..',
  '...KdK...',
  '....K....',
];

const FOOD = [
  '....KKKK.',
  '...KbbbbK',
  '..KbWbbbK',
  '..KbbbbbK',
  '.KbbbbbK.',
  'KwKbbbK..',
  'KwwKKK...',
  '.KwK.....',
  '..K......',
];

const BUBBLE = [
  '..KKKK...',
  '.KbbbbK..',
  'KbWWbbbK.',
  'KbWbbbbK.',
  'KbbbbbbK.',
  'KbbbbbbK.',
  '.KbbbbK..',
  '..KKKK...',
  '.........',
];

function draw(rows: string[], pal: Pal, half: 'full' | 'left' | 'none', emptyPal: Pal): string {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 9;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const filled = half === 'full' || (half === 'left' && x < 5);
      const col = ch === 'K' ? pal.K : filled ? pal[ch] : emptyPal[ch] ?? emptyPal.fill;
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL();
}

export interface HudIcons {
  heart: string;
  heartHalf: string;
  heartEmpty: string;
  heartFlash: string;
  food: string;
  foodHalf: string;
  foodEmpty: string;
  bubble: string;
  /** Absorción (corazones dorados). */
  heartGold: string;
  heartGoldHalf: string;
  /** Con veneno los corazones se vuelven verdes. */
  heartPoison: string;
  heartPoisonHalf: string;
  /** Fase 7 (efectos): con Marchitamiento los corazones se vuelven negros. */
  heartWither: string;
  heartWitherHalf: string;
  /** Con el efecto Hambre la comida se vuelve verdosa. */
  foodHunger: string;
  foodHungerHalf: string;
}

export function buildHudIcons(): HudIcons {
  const heartPal: Pal = { K: '#1b0707', r: '#e02828', W: '#ffd0d0', d: '#a31515' };
  const heartEmpty: Pal = { fill: '#3a1717', W: '#3a1717', r: '#3a1717', d: '#3a1717' };
  const flashPal: Pal = { K: '#ffffff', r: '#ff9a9a', W: '#ffffff', d: '#ff7070' };
  const foodPal: Pal = { K: '#1d1006', b: '#c07a3b', W: '#f0c48f', w: '#efe6d6' };
  const foodEmpty: Pal = { fill: '#2e2218', b: '#2e2218', W: '#2e2218', w: '#3a3129' };
  const bubPal: Pal = { K: '#0b2342', b: '#5fb4f0', W: '#e9f6ff' };
  const goldPal: Pal = { K: '#2a1c02', r: '#f2c21b', W: '#fff4b0', d: '#c08a0c' };
  const poisonPal: Pal = { K: '#0c1a05', r: '#8f9e2a', W: '#e2eca0', d: '#5d6b12' };
  const witherPal: Pal = { K: '#000000', r: '#2b2b2b', W: '#8a8a8a', d: '#141414' };
  const hungerPal: Pal = { K: '#141d06', b: '#7a8a2b', W: '#c2d27a', w: '#c9d6a8' };
  return {
    heart: draw(HEART, heartPal, 'full', heartEmpty),
    heartHalf: draw(HEART, heartPal, 'left', heartEmpty),
    heartEmpty: draw(HEART, heartPal, 'none', heartEmpty),
    heartFlash: draw(HEART, flashPal, 'none', { fill: '#5a2a2a' }),
    food: draw(FOOD, foodPal, 'full', foodEmpty),
    foodHalf: draw(FOOD, foodPal, 'left', foodEmpty),
    foodEmpty: draw(FOOD, foodPal, 'none', foodEmpty),
    bubble: draw(BUBBLE, bubPal, 'full', bubPal),
    heartGold: draw(HEART, goldPal, 'full', heartEmpty),
    heartGoldHalf: draw(HEART, goldPal, 'left', heartEmpty),
    heartPoison: draw(HEART, poisonPal, 'full', heartEmpty),
    heartPoisonHalf: draw(HEART, poisonPal, 'left', heartEmpty),
    heartWither: draw(HEART, witherPal, 'full', heartEmpty),
    heartWitherHalf: draw(HEART, witherPal, 'left', heartEmpty),
    foodHunger: draw(FOOD, hungerPal, 'full', foodEmpty),
    foodHungerHalf: draw(FOOD, hungerPal, 'left', foodEmpty),
  };
}

/** Iconos de todos los objetos: bloques (isométricos, ya generados) y sprites. */
/**
 * Mapa id → dataURL que pinta cada icono la primera vez que se pide (y lo guarda). Se usa como un Map normal;
 * lo que se añade con set (pociones, estandartes…) tiene prioridad.
 */
export class LazyIcons extends Map<number, string> {
  private missing = new Set<number>();
  constructor(private make: (id: number) => string | undefined) {
    super();
  }
  override get(id: number): string | undefined {
    let v = super.get(id);
    if (v === undefined && !this.missing.has(id)) {
      v = this.make(id);
      if (v === undefined) this.missing.add(id);
      else super.set(id, v);
    }
    return v;
  }
  override has(id: number): boolean {
    return this.get(id) !== undefined;
  }
}

/** Iconos de los objetos: los de bloque, el icono del bloque; los demás, su sprite. Se pintan al pedirlos. */
export function buildItemIcons(blockIcon: (id: number) => string | undefined, sprites: ItemSprites): LazyIcons {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  const blockCache = new Map<number, string | undefined>();
  const block = (id: number) => {
    if (!blockCache.has(id)) blockCache.set(id, blockIcon(id));
    return blockCache.get(id);
  };
  return new LazyIcons((id) => {
    const it = ITEMS[id];
    if (!it) return undefined;
    if (it.block !== undefined && it.sprite === undefined) return block(it.block);
    const s = itemSpriteIndex(it.id);
    if (s < 0 || s >= sprites.count) return undefined;
    const img = g.createImageData(16, 16);
    img.data.set(sprites.rgba.subarray(s * 1024, s * 1024 + 1024));
    g.clearRect(0, 0, 16, 16);
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  });
}
