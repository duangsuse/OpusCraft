// Buffers de ruido reutilizables y respuesta al impulso para la reverb compartida.
// Se generan una única vez en resume() y se reutilizan en cada disparo para no asignar
// memoria de audio en los bucles calientes del juego.

export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

function makeWhiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Ruido rosa (~1/f) mediante el filtro de Paul Kellett. */
function makePinkNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  return buffer;
}

/** Ruido marrón/rojo mediante integración con fuga de ruido blanco. */
function makeBrownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export function createNoiseBuffers(ctx: AudioContext): NoiseBuffers {
  return {
    white: makeWhiteNoise(ctx, 4),
    pink: makePinkNoise(ctx, 4),
    brown: makeBrownNoise(ctx, 4),
  };
}

/** Crea una fuente de reproducción de un buffer de ruido (sin iniciarla todavía). */
export function noiseSource(ctx: AudioContext, buffer: AudioBuffer, loop = false): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  if (loop) {
    src.loopStart = 0;
    src.loopEnd = buffer.duration;
  }
  return src;
}

/** Punto de inicio aleatorio dentro del buffer para que repeticiones del mismo ruido no suenen idénticas. */
export function noiseOffset(buffer: AudioBuffer, tailSeconds = 0.5): number {
  return Math.random() * Math.max(0, buffer.duration - tailSeconds);
}

/**
 * Respuesta al impulso estéreo con decaimiento exponencial, para la reverb de convolución compartida.
 * Los dos canales usan ruido independiente para dar amplitud estéreo (decorrelación).
 */
export function createReverbImpulse(ctx: AudioContext, duration = 2.2, decay = 2.6): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}
