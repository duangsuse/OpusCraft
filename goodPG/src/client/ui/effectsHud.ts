// Efectos de estado en el HUD (arriba a la derecha, como en Minecraft): un icono por efecto con su
// nivel y el tiempo que le queda; parpadea cuando está a punto de acabarse. Los iconos se dibujan en
// pixel art con un canvas, en el mismo estilo que los corazones.
import './effects.css';
import {
  EFFECTS, EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_STRENGTH, EFFECT_WEAKNESS, EFFECT_REGENERATION, EFFECT_POISON,
  EFFECT_HUNGER, EFFECT_FIRE_RESISTANCE, EFFECT_NIGHT_VISION, EFFECT_WATER_BREATHING, EFFECT_ABSORPTION, effectLevel,
  EFFECT_BAD_OMEN, EFFECT_HERO,
  EFFECT_RESISTANCE, EFFECT_CONDUIT_POWER, // Fase 6.5 (equipo)
  EFFECT_JUMP_BOOST, EFFECT_INVISIBILITY, EFFECT_SLOW_FALLING, EFFECT_LUCK, EFFECT_UNLUCK, // Fase 7 (pociones)
  // Fase 7 (efectos)
  EFFECT_HASTE, EFFECT_MINING_FATIGUE, EFFECT_NAUSEA, EFFECT_BLINDNESS, EFFECT_SATURATION, EFFECT_GLOWING, EFFECT_DOLPHINS_GRACE,
  EFFECT_HEALTH_BOOST, EFFECT_DARKNESS, EFFECT_WITHER, EFFECT_LEVITATION,
} from '../../shared/effects';
import type { StatusEffects } from '../game/statusEffects';

/** Dibujos de 9×9: 'K' contorno, 'a' color del efecto, 'b' su tono claro, 'c' su tono oscuro, 'w' blanco. */
const GLYPHS: Record<number, string[]> = {
  [EFFECT_SPEED]: [
    '.........', '..KKKK...', '.KaaaaK..', 'KaabbaaK.', '.KaaaaaK.', '..KaaaaaK', 'KKKKaaaaK', 'Kccccccc.', '.KKKKKKK.',
  ],
  [EFFECT_SLOWNESS]: [
    '.........', '...KKK...', '..KaaaK..', '.KabbaaK.', '.KabaaaK.', '.KaaaacK.', 'KKKKKKKKK', 'Kccccccck', 'KKKKKKKKK',
  ],
  [EFFECT_STRENGTH]: [
    '.......KK', '......KbK', '.....KbK.', '....KbK..', 'K..KbK...', 'KK.KaK...', '.KKaK....', '.KccKK...', 'KcK.KK...',
  ],
  [EFFECT_WEAKNESS]: [
    '.......KK', '......KbK', '.....KbK.', '.........', 'K..KbK...', 'KK.KaK...', '.KKaK....', '.KccKK...', 'KcK.KK...',
  ],
  [EFFECT_REGENERATION]: [
    '.KK...KK.', 'KaaK.KaaK', 'KabaKaaaK', 'KaaawaaaK', 'KaawwwacK', '.KaawacK.', '..KaacK..', '...KcK...', '....K....',
  ],
  [EFFECT_POISON]: [
    '....K....', '...KaK...', '...KaK...', '..KabaK..', '.KabbaaK.', '.KabaaaK.', '.KaaaacK.', '..KaacK..', '...KKK...',
  ],
  [EFFECT_HUNGER]: [
    '....KKKK.', '...KaaaaK', '..KabaaaK', '..KaaaaaK', '.KaaaaaK.', 'KwKaaaK..', 'KwwKKK...', '.KwK.....', '..K......',
  ],
  [EFFECT_FIRE_RESISTANCE]: [
    '....K....', '...KaK...', '..KaaK...', '..KabaK..', '.KabbaK..', '.KabwbaK.', 'KaabwbaaK', 'KaaabaacK', '.KKKKKKK.',
  ],
  [EFFECT_NIGHT_VISION]: [
    '.........', '.........', '..KKKKK..', '.KbbbbbK.', 'KbbKKKbbK', 'KbbKwKbbK', '.KbbbbbK.', '..KKKKK..', '.........',
  ],
  [EFFECT_WATER_BREATHING]: [
    '..KKKK...', '.KaaaaK..', 'KawwaaaK.', 'KawaaaaK.', 'KaaaaaaK.', 'KaaaaacK.', '.KaaacK.K', '..KKKK.KbK', '.......K.',
  ],
  [EFFECT_ABSORPTION]: [
    '.KK...KK.', 'KaaK.KaaK', 'KabaKaaaK', 'KaaaaaaaK', 'KaaaaaacK', '.KaaaacK.', '..KaacK..', '...KcK...', '....K....',
  ],
  // Fase 6 (asaltos): el rostro del estandarte ominoso y la esmeralda del héroe.
  [EFFECT_BAD_OMEN]: [
    '.KKKKKKK.', 'KwwwwwwwK', 'KwaaaaawK', 'KaKaaaKaK', 'KaaaaaaaK', 'KwaacaawK', 'KwwcccwwK', '.KwwwwwK.', '..KKKKK..',
  ],
  [EFFECT_HERO]: [
    '...KKK...', '..KbbaK..', '.KbbaaaK.', 'KbbaaaacK', 'KbaaaaacK', 'KaaaaaccK', '.KaaaccK.', '..KaccK..', '...KKK...',
  ],
  // Fase 6.5 (equipo): el escudo de la resistencia y el ojo del conducto.
  [EFFECT_RESISTANCE]: [
    'KKKKKKKKK', 'KbbbabaaK', 'KbwbaaacK', 'KbbaaaacK', 'KbaaaaacK', '.KaaaaacK', '.KaaaaccK', '..KaaccK.', '...KKKK..',
  ],
  [EFFECT_CONDUIT_POWER]: [
    '..KKKKK..', '.KbbbbaK.', 'KbKKKKKaK', 'KbKwwwKaK', 'KbKwKwKcK', 'KbKwwwKcK', 'KaKKKKKcK', '.KaaaccK.', '..KKKKK..',
  ],
  // Fase 7 (pociones): la flecha del supersalto, la silueta del invisible, la pluma de la caída lenta y
  // el trébol de la suerte (mustio en la mala suerte).
  [EFFECT_JUMP_BOOST]: [
    '....K....', '...KbK...', '..KbbaK..', '.KbaaacK.', 'KKKaacKKK', '..KaacK..', '..KaacK..', '..KaacK..', '..KKKKK..',
  ],
  [EFFECT_INVISIBILITY]: [
    '...KKK...', '..KbbbK..', '..KbwbK..', '...KbK...', '.KbbbbbK.', 'K.KbbbK.K', '..KbKbK..', '..Kb.bK..', '..KK.KK..',
  ],
  [EFFECT_SLOW_FALLING]: [
    '.......KK', '.....KKbK', '....KbbaK', '...KbbaK.', '..KbbaaK.', '..KbaaK..', '.KbaacK..', '.KacKK...', 'KKK......',
  ],
  [EFFECT_LUCK]: [
    '.KKK.KKK.', 'KbbaKbbaK', 'KbaaKbaaK', '.KKaKaKK.', 'KbbaKbbaK', 'KbaaKaacK', '.KKKKKKK.', '....KcK..', '....KK...',
  ],
  [EFFECT_UNLUCK]: [
    '.KKK.KKK.', 'KccaKbcaK', 'KcaaKcacK', '.KKaKcKK.', 'KbcaKccaK', 'KcacKaccK', '.KKKKKKK.', '...KcK...', '...KK....',
  ],
  // Fase 7 (efectos): el pico de la prisa (roto en la fatiga), la espiral de las náuseas, el ojo cerrado
  // de la ceguera, el muslo de la saturación, la silueta que brilla, el delfín, el corazón con más, el ojo
  // de la oscuridad, la calavera del marchitamiento y las burbujas que suben de la levitación.
  [EFFECT_HASTE]: [
    '...KKKK..', '..KbbbaK.', '...KKKcaK', '....KcKaK', '...KcK.KK', '..KcK....', '.KcK.....', 'KcK......', 'KK.......',
  ],
  [EFFECT_MINING_FATIGUE]: [
    '...KKKK..', '..KbbbaK.', '...KKKcaK', '....KcKaK', '.....K.KK', '..K......', '.KcK.....', 'KcK......', 'KK.......',
  ],
  [EFFECT_NAUSEA]: [
    'KKKKKKKKK', 'KaaaaaaaK', 'KaKKKKKaK', 'KaKbbbKaK', 'KaKbKbKaK', 'KaKbKKKaK', 'KaKbbbbaK', 'KaKKKKKKK', 'KaaaaaaaK',
  ],
  [EFFECT_BLINDNESS]: [
    '.........', '.........', 'KK.....KK', '.KKKKKKK.', '.KbbbbbK.', '..KKKKK..', '.K.K.K.K.', '.........', '.........',
  ],
  [EFFECT_SATURATION]: [
    '....KKKK.', '...KaaaaK', '..KabaaaK', '..KaaaaaK', '.KaaaacK.', 'KwKaacK..', 'KwwKKK...', '.KwK.....', '..K......',
  ],
  [EFFECT_GLOWING]: [
    '...aaa...', '..aKKKa..', '..aKKKa..', '...aKa...', '.aaKKKaa.', 'a.aKKKa.a', '..aKaKa..', '..aKaKa..', '..aa.aa..',
  ],
  [EFFECT_DOLPHINS_GRACE]: [
    '.........', '....KK...', '...KbK...', '.KKbbaKK.', 'KbbwbaaaK', '.KaaaaacK', '..KKKccK.', '.....KKcK', '......KK.',
  ],
  [EFFECT_HEALTH_BOOST]: [
    '.KK...KK.', 'KaaK.KaaK', 'KaaawaaaK', 'KaaawaaaK', 'KawwwwwcK', '.KaawacK.', '..KawcK..', '...KcK...', '....K....',
  ],
  [EFFECT_DARKNESS]: [
    '..KKKKK..', '.KcccccK.', 'KccKKKccK', 'KcKbbbKcK', 'KcKbwbKcK', 'KcKbbbKcK', 'KccKKKccK', '.KcccccK.', '..KKKKK..',
  ],
  [EFFECT_WITHER]: [
    '.KKKKKKK.', 'KaaaaaaaK', 'KaKKaKKaK', 'KaKKaKKaK', 'KaaaKaaaK', '.KaaaaaK.', '.KaKaKaK.', '..KKKKK..', '.........',
  ],
  [EFFECT_LEVITATION]: [
    '...KKK...', '..KbbbK..', '.KbwbbaK.', '.KbbbaaK.', '..KaacK..', '...KKK...', '.K.....K.', 'KaK...KaK', '.K.....K.',
  ],
};

/**
 * Color base del icono cuando el del efecto es demasiado oscuro para el fondo del HUD (Fase 7: ceguera,
 * oscuridad y fatiga minera).
 */
const ICON_BASE: Record<number, [number, number, number]> = {
  [EFFECT_BLINDNESS]: [150, 150, 160], [EFFECT_DARKNESS]: [118, 110, 96], [EFFECT_MINING_FATIGUE]: [150, 134, 60],
};

const iconCache = new Map<number, string>();

function shade(c: [number, number, number], k: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}

export function effectIcon(id: number): string {
  const cached = iconCache.get(id);
  if (cached) return cached;
  const rows = GLYPHS[id];
  const col = EFFECTS[id].color;
  // La absorción usa el dorado de sus corazones.
  const base: [number, number, number] = id === EFFECT_ABSORPTION ? [242, 194, 27] : ICON_BASE[id] ?? col;
  const pal: Record<string, string> = { K: '#101010', a: shade(base, 1), b: shade(base, 1.45), c: shade(base, 0.6), w: '#ffffff' };
  const cv = document.createElement('canvas');
  cv.width = 9;
  cv.height = 9;
  const g = cv.getContext('2d')!;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const ch = rows[y]?.[x] ?? '.';
      if (ch === '.' || !pal[ch]) continue;
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  const url = cv.toDataURL();
  iconCache.set(id, url);
  return url;
}

function clock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

let lastKey = '';

/** Pinta los efectos activos (sólo toca el DOM cuando cambian los segundos o los efectos). */
export function renderEffectsHud(fx: StatusEffects, show: boolean): void {
  const el = document.getElementById('effects-hud');
  if (!el) return;
  const list = show ? [...fx.list] : [];
  const key = list.map(([id, e]) => `${id}.${e.amp}.${Math.ceil(e.time)}.${e.time < 10 ? Math.floor(e.time * 4) & 1 : 0}`).join('|');
  if (key === lastKey) return;
  lastKey = key;
  // Primero los beneficiosos, como en Minecraft.
  list.sort(([a], [b]) => Number(EFFECTS[b].good) - Number(EFFECTS[a].good) || a - b);
  el.innerHTML = list.map(([id, e]) => {
    const d = EFFECTS[id];
    const blink = e.time < 10 && (Math.floor(e.time * 4) & 1) === 1;
    const lvl = e.amp > 0 ? ` ${effectLevel(e.amp)}` : '';
    return `<div class="fx ${d.good ? 'good' : 'bad'}${blink ? ' blink' : ''}" title="${d.name}${lvl}">` +
      `<i style="background-image:url(${effectIcon(id)})"></i><span>${clock(e.time)}</span></div>`;
  }).join('');
}
