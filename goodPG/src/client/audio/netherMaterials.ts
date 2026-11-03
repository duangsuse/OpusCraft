// Fase 8.2 (biomas del Nether): timbres de los materiales del Nether, uno por cada tipo de sonido de Java
// (rocanegra, ladrillos del Nether, madera y tallos del Nether, necelio, hongos, raíces y brotes, luz de
// hongo, enredaderas, arena y tierra de alma, basalto, bloques de verrugas y menas del Nether). Como los
// demás, se sintetizan al momento con ruido filtrado y tonos cortos, y varían en cada golpe.
import type { NoiseBuffers } from './noise';
import { playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import { randRange, type SoundMaterial } from './types';

/**
 * Golpe de un material del Nether (`g` volumen y `d` duración relativos del tipo de golpe). Devuelve false si
 * el material no es de éstos.
 */
export function buildNetherMaterial(
  ctx: AudioContext, noise: NoiseBuffers, material: SoundMaterial, g: number, d: number, destination: AudioNode, now: number,
  sources: AudioScheduledSourceNode[],
): boolean {
  const burst = (o: Omit<Parameters<typeof playNoiseBurst>[1], 'destination' | 'now'> & { at?: number }) =>
    sources.push(playNoiseBurst(ctx, { ...o, destination, now: now + (o.at ?? 0) }));
  const blip = (o: Omit<Parameters<typeof playTonalBlip>[1], 'destination' | 'now'> & { at?: number }) =>
    sources.push(playTonalBlip(ctx, { ...o, destination, now: now + (o.at ?? 0) }));
  const sweep = (o: Omit<Parameters<typeof playPitchSweep>[1], 'destination' | 'now'> & { at?: number }) =>
    sources.push(playPitchSweep(ctx, { ...o, destination, now: now + (o.at ?? 0) }));

  switch (material) {
    // Rocanegra: seca y granulosa, un desmoronarse de muchos granitos.
    case 'netherrack':
    case 'nether_ore': {
      const grains = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < grains; i++) {
        burst({
          buffer: noise.white, at: Math.random() * 0.05 * d, filterType: 'bandpass', freq: randRange(700, 2100), q: randRange(1.8, 3.5),
          attack: 0.001, decay: randRange(0.018, 0.04) * d, gain: (0.5 / grains + 0.07) * g,
        });
      }
      blip({ freq: randRange(80, 130), freqEnd: randRange(45, 65), wave: 'triangle', attack: 0.001, decay: 0.05 * d, gain: 0.3 * g });
      // La mena lleva además el chasquido duro del mineral.
      if (material === 'nether_ore') {
        blip({ at: 0.004, freq: randRange(1500, 2300), wave: 'sine', attack: 0.001, decay: 0.035 * d, gain: 0.16 * g });
      }
      return true;
    }
    // Ladrillos del Nether: duros y secos, un chasquido más agudo y corto que la piedra.
    case 'nether_bricks': {
      burst({ buffer: noise.white, filterType: 'bandpass', freq: randRange(1500, 2600), q: randRange(2.5, 4), attack: 0.001, decay: 0.035 * d, gain: 0.6 * g });
      blip({ freq: randRange(150, 230), freqEnd: randRange(80, 110), wave: 'triangle', attack: 0.001, decay: 0.04 * d, gain: 0.36 * g });
      burst({ buffer: noise.white, at: randRange(0.015, 0.03), filterType: 'bandpass', freq: randRange(2400, 3400), q: 5, attack: 0.001, decay: 0.02, gain: 0.18 * g });
      return true;
    }
    // Madera del Nether: hueca y apagada, más grave y blanda que la madera normal.
    case 'nether_wood': {
      const body = randRange(160, 300);
      blip({ freq: body, freqEnd: body * 0.82, wave: 'triangle', attack: 0.002, decay: 0.15 * d, gain: 0.5 * g });
      burst({ buffer: noise.pink, filterType: 'bandpass', freq: body * 2, q: 3.5, attack: 0.002, decay: 0.07 * d, gain: 0.26 * g });
      return true;
    }
    // Tallos: fibrosos, un crujido de madera húmeda que se deshilacha.
    case 'stem': {
      const body = randRange(190, 330);
      blip({ freq: body, freqEnd: body * 0.86, wave: 'triangle', attack: 0.002, decay: 0.11 * d, gain: 0.42 * g });
      for (let i = 0; i < 3; i++) {
        burst({
          buffer: noise.white, at: i * randRange(0.012, 0.025), filterType: 'bandpass', freq: randRange(900, 1700), q: 2.2,
          attack: 0.001, decay: 0.03 * d, gain: 0.16 * g,
        });
      }
      return true;
    }
    // Necelio: rocanegra cubierta de algo blando; el crujido sale amortiguado.
    case 'nylium': {
      burst({ buffer: noise.pink, filterType: 'lowpass', freq: randRange(900, 1500), q: 0.8, attack: 0.003, decay: 0.09 * d, gain: 0.46 * g });
      for (let i = 0; i < 3; i++) {
        burst({
          buffer: noise.white, at: Math.random() * 0.04 * d, filterType: 'bandpass', freq: randRange(800, 1600), q: 2.5, attack: 0.001,
          decay: 0.025 * d, gain: 0.14 * g,
        });
      }
      return true;
    }
    // Hongos: un «pop» blando y carnoso.
    case 'fungus': {
      sweep({ freqStart: randRange(380, 560), freqEnd: randRange(160, 230), attack: 0.002, decay: 0.07 * d, gain: 0.34 * g });
      burst({ buffer: noise.brown, filterType: 'lowpass', freq: randRange(600, 1000), q: 1.2, attack: 0.003, decay: 0.07 * d, gain: 0.3 * g });
      return true;
    }
    // Raíces y brotes: un roce seco y fino.
    case 'roots': {
      burst({ buffer: noise.white, filterType: 'highpass', freq: randRange(1600, 2600), q: 0.6, attack: 0.003, decay: 0.08 * d, gain: 0.4 * g });
      burst({ buffer: noise.white, at: randRange(0.02, 0.04), filterType: 'bandpass', freq: randRange(2400, 3400), q: 3, attack: 0.001, decay: 0.02, gain: 0.14 * g });
      return true;
    }
    // Luz de hongo: esponjosa, un golpe blando con un soplo de aire.
    case 'shroomlight': {
      burst({ buffer: noise.brown, filterType: 'lowpass', freq: randRange(500, 800), q: 0.8, attack: 0.004, decay: 0.1 * d, gain: 0.46 * g });
      burst({ buffer: noise.pink, filterType: 'highpass', freq: randRange(2000, 3000), q: 0.5, attack: 0.01, decay: 0.08 * d, gain: 0.16 * g });
      blip({ freq: randRange(120, 170), wave: 'sine', attack: 0.003, decay: 0.06 * d, gain: 0.2 * g });
      return true;
    }
    // Enredaderas del Nether: roce de hojas con un tirón elástico.
    case 'vines': {
      burst({ buffer: noise.white, filterType: 'highpass', freq: randRange(1800, 3000), q: 0.5, attack: 0.002, decay: 0.07 * d, gain: 0.36 * g });
      sweep({ at: 0.01, freqStart: randRange(260, 360), freqEnd: randRange(420, 560), attack: 0.003, decay: 0.05 * d, gain: 0.12 * g });
      return true;
    }
    // Arena de alma: arena que se hunde con un suspiro grave (como en Java, algo inquietante).
    case 'soul_sand': {
      burst({ buffer: noise.white, filterType: 'highpass', freq: randRange(2600, 4200), q: 0.4, attack: 0.006, decay: 0.1 * d, gain: 0.3 * g });
      burst({ buffer: noise.brown, filterType: 'lowpass', freq: randRange(250, 420), q: 1, attack: 0.02, decay: 0.16 * d, gain: 0.34 * g });
      sweep({ at: 0.02, freqStart: randRange(210, 280), freqEnd: randRange(130, 170), wave: 'sine', attack: 0.03, decay: 0.14 * d, gain: 0.07 * g });
      return true;
    }
    // Tierra de alma: como la tierra, más compacta y con un zumbido hondo.
    case 'soul_soil': {
      burst({ buffer: noise.brown, filterType: 'lowpass', freq: randRange(350, 650), q: 0.9, attack: 0.003, decay: 0.1 * d, gain: 0.55 * g });
      blip({ freq: randRange(60, 90), wave: 'sine', attack: 0.004, decay: 0.09 * d, gain: 0.32 * g });
      sweep({ at: 0.015, freqStart: randRange(180, 240), freqEnd: randRange(110, 140), attack: 0.02, decay: 0.1 * d, gain: 0.06 * g });
      return true;
    }
    // Basalto: piedra densa y grave, con resonancia corta.
    case 'basalt': {
      burst({ buffer: noise.white, filterType: 'bandpass', freq: randRange(600, 1200), q: randRange(1.8, 2.8), attack: 0.001, decay: 0.05 * d, gain: 0.58 * g });
      blip({ freq: randRange(70, 115), freqEnd: randRange(38, 55), wave: 'triangle', attack: 0.001, decay: 0.07 * d, gain: 0.46 * g });
      return true;
    }
    // Bloques de verrugas: un golpe húmedo y blando.
    case 'wart': {
      burst({ buffer: noise.brown, filterType: 'lowpass', freq: randRange(400, 750), q: 1.4, attack: 0.003, decay: 0.1 * d, gain: 0.52 * g });
      sweep({ freqStart: randRange(240, 340), freqEnd: randRange(90, 130), attack: 0.002, decay: 0.07 * d, gain: 0.22 * g });
      return true;
    }
    // Fase 8.5: escombros ancestrales: roca densa y pesada, un golpe grave con un raspado metálico debajo.
    case 'ancient_debris': {
      blip({ freq: randRange(70, 105), freqEnd: randRange(40, 55), wave: 'triangle', attack: 0.001, decay: 0.09 * d, gain: 0.5 * g });
      burst({ buffer: noise.pink, filterType: 'bandpass', freq: randRange(500, 1000), q: 2, attack: 0.002, decay: 0.07 * d, gain: 0.42 * g });
      burst({ buffer: noise.white, at: 0.01, filterType: 'bandpass', freq: randRange(2200, 3200), q: 6, attack: 0.001, decay: 0.05 * d, gain: 0.12 * g });
      return true;
    }
    // Netherita: metal macizo, un tañido corto y oscuro más grave que el hierro.
    case 'netherite': {
      const f = randRange(380, 520);
      blip({ freq: f, freqEnd: f * 0.97, wave: 'sine', attack: 0.001, decay: 0.16 * d, gain: 0.3 * g });
      blip({ freq: f * 2.7, wave: 'sine', attack: 0.001, decay: 0.07 * d, gain: 0.12 * g });
      burst({ buffer: noise.white, filterType: 'bandpass', freq: randRange(1300, 2300), q: 4, attack: 0.001, decay: 0.04 * d, gain: 0.34 * g });
      blip({ freq: randRange(90, 120), freqEnd: 60, wave: 'triangle', attack: 0.001, decay: 0.06 * d, gain: 0.3 * g });
      return true;
    }
    // Magnetita: piedra con un zumbido metálico que tiembla al final.
    case 'lodestone': {
      burst({ buffer: noise.white, filterType: 'bandpass', freq: randRange(1000, 1900), q: 2.6, attack: 0.001, decay: 0.045 * d, gain: 0.5 * g });
      blip({ freq: randRange(140, 200), freqEnd: randRange(90, 110), wave: 'triangle', attack: 0.001, decay: 0.05 * d, gain: 0.3 * g });
      blip({ at: 0.005, freq: randRange(620, 760), wave: 'sine', attack: 0.004, decay: 0.12 * d, gain: 0.1 * g });
      return true;
    }
  }
  return false;
}
