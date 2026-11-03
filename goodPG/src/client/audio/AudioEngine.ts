// Motor de audio procedural de VoxelCraft. Todo se sintetiza con Web Audio (sin ficheros de
// audio): cadena maestra (ganancia -> lowpass "bajo el agua" -> compresor suave -> destino),
// una reverb de convolución compartida (bus de envío), timbres de materiales, ambientación
// continua/discreta y música generativa. Ningún método debe lanzar nunca ni antes de resume()
// ni si Web Audio no está disponible (p. ej. navegadores headless de pruebas).
import { buildWitherSfx } from './witherSounds'; // Fase 8.7
import { BOSS_STYLE } from './music'; // Fase 8.6
import type { SoundMaterial } from '../../shared/blocks';
import { buildRaidSfx } from './illagerSounds'; // Fase 6 (asaltos)
import { buildAllaySfx } from './allaySounds'; // Fase 7.5 (mansión)
import { buildCopperSfx } from './copperSounds'; // Fase 6.5 (cobre)
import { buildDecorSfx } from './decorSounds'; // Fase 6.5 (decoración)
import { buildRedstoneSfx } from './redstoneSounds'; // Fase 7 (redstone)
import { buildMechanismSfx } from './mechanismSounds'; // Fase 7 (mecanismos)
import { Jukeboxes } from './jukebox'; // Fase 6.5 (colecciones)
import { buildEquipmentSfx } from './equipmentSounds'; // Fase 6.5 (equipo)
import { buildPotionSfx } from './potionSounds'; // Fase 7 (pociones)
import { buildTransportSfx } from './transportSounds'; // Fase 7 (transporte)
import { buildEnchantSfx } from './enchantSounds'; // Fase 7 (encantamientos)
import { buildOceanSfx } from './oceanSounds'; // Fase 7.5 (océano)
import { buildDeepDarkSfx } from './deepDarkSounds'; // Fase 7.5 (abismo)
import { AmbienceController } from './ambience';
import {
  buildArrowHit, buildSweep, buildKnockbackHit,
  buildBlockHit,
  buildBowTwang,
  buildBurp,
  buildCraft,
  buildEat,
  buildExplosion, buildThunder,
  buildFurnaceCrackle,
  buildPickup,
  buildPlayerDeath,
  buildPlayerHurt,
} from './combat';
import { buildMobSound } from './creatures';
import { buildNetherVoice, buildNetherSfx } from './netherMobSounds'; // Fase 8.3 (criaturas del Nether)
import { buildLevelUp, buildXpOrb } from './experienceSounds';
import { FluidAmbience } from './fluidAmbience';
import { Heartbeat } from './heartbeat';
import { GlideWind } from './glideWind'; // Fase 8.6
import { buildMaterialSound, buildSplashSound, buildUiSound } from './materials';
import { createNoiseBuffers, createReverbImpulse, type NoiseBuffers } from './noise';
import { MusicEngine } from './music';
import { NetherAmbience } from './netherAmbience'; // Fase 8.2 (biomas del Nether)
import { createPanner, isWithinRange, MAX_ONE_SHOT_VOICES, VoicePool } from './spatial';
import { clamp01, type AmbientState, type MobSoundEvent, type MobSoundKind, type UiKind, type Vec3 } from './types';

export type { Vec3, AmbientState, MobSoundKind, MobSoundEvent };

/** Frecuencia del lowpass maestro cuando NO estamos bajo el agua: prácticamente transparente. */
const OPEN_LOWPASS_FREQ = 20000;
/** Frecuencia del lowpass maestro bajo el agua: amortiguamiento notable. */
const UNDERWATER_LOWPASS_FREQ = 500;

/** Interfaz mínima para los métodos heredados de AudioListener, retirados del estándar pero
 * aún presentes en algunos motores/navegadores antiguos. */
interface LegacyListener {
  setPosition?(x: number, y: number, z: number): void;
  setOrientation?(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private resumePromise: Promise<void> | null = null;

  // Cadena maestra y buses; se crean todos juntos en buildGraph() y a partir de ahí conviven
  // con el mismo ciclo de vida que `ctx` (se comprueba `this.ctx` como única fuente de verdad
  // de "el motor está listo").
  private masterGain!: GainNode;
  private masterLowpass!: BiquadFilterNode;
  private compressor!: DynamicsCompressorNode;
  private sfxBus!: GainNode;
  private ambientBus!: GainNode;
  private musicBus!: GainNode;
  private reverbSend!: GainNode;
  private convolver!: ConvolverNode;
  private reverbReturn!: GainNode;
  /** Chat de voz: bus de las voces de los demás jugadores (con su propio volumen). */
  private voiceBus!: GainNode;
  private voiceVolume = 1;

  private noise: NoiseBuffers | null = null;
  private ambience: AmbienceController | null = null;
  private music: MusicEngine | null = null;
  private fluids: FluidAmbience | null = null;
  private heartbeat: Heartbeat | null = null;
  private glideWind: GlideWind | null = null; // Fase 8.6
  /** Fase 6.5 (colecciones): tocadiscos que suenan y los que llegaron antes de arrancar el audio. */
  private jukeboxes: Jukeboxes | null = null;
  /** Fase 8.2 (biomas del Nether): bucles, sonidos sueltos y «mood» de cada bioma del Nether. */
  private nether: NetherAmbience | null = null;
  private pendingDiscs = new Map<string, { disc: number; pos: Vec3; elapsed: number; at: number }>();
  private readonly voices = new VoicePool(MAX_ONE_SHOT_VOICES);

  private listenerPos: Vec3 = [0, 0, 0];
  private masterVolume = 1;
  private musicVolume = 0.5;
  private ambientVolume = 0.7;
  // Objetivos pendientes: si se llaman antes de resume(), se aplican en cuanto el motor arranca.
  private pendingWaterProximity = 0;
  private pendingLavaProximity = 0;
  private pendingHeartbeat = 0;

  constructor() {
    // A propósito no se crea el AudioContext aquí: las políticas de autoplay de los navegadores
    // exigen que se cree (o reanude) tras un gesto explícito del usuario, en resume().
  }

  async resume(): Promise<void> {
    if (this.resumePromise) return this.resumePromise;
    const p = this.doResume();
    this.resumePromise = p;
    try {
      await p;
    } finally {
      this.resumePromise = null;
    }
  }

  private async doResume(): Promise<void> {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        return;
      }
      const Ctor = getAudioContextCtor();
      if (!Ctor) return; // Web Audio no disponible: no-op seguro.
      const ctx = new Ctor();
      this.ctx = ctx;
      this.buildGraph(ctx);
      this.noise = createNoiseBuffers(ctx);
      this.ambience = new AmbienceController(ctx, this.noise, this.ambientBus, this.reverbSend);
      this.music = new MusicEngine(ctx, this.musicBus, this.reverbSend);
      this.fluids = new FluidAmbience(ctx, this.noise, this.ambientBus, this.reverbSend);
      this.fluids.setProximity(this.pendingWaterProximity, this.pendingLavaProximity);
      this.heartbeat = new Heartbeat(ctx, this.masterGain);
      this.heartbeat.setLevel(this.pendingHeartbeat);
      this.glideWind = new GlideWind(ctx, this.noise, this.sfxBus); // Fase 8.6
      // Fase 6.5 (colecciones)
      this.jukeboxes = new Jukeboxes(ctx, this.noise, this.sfxBus, this.reverbSend);
      this.nether = new NetherAmbience(ctx, this.noise, this.ambientBus, this.reverbSend);
      for (const [key, p] of this.pendingDiscs) this.jukeboxes.play(key, p.disc, p.pos, p.elapsed + (performance.now() - p.at) / 1000);
      this.pendingDiscs.clear();
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      try {
        this.ctx?.close();
      } catch {
        /* no-op */
      }
      this.ctx = null;
      this.ambience = null;
      this.music = null;
      this.fluids = null;
      this.heartbeat = null;
      this.glideWind = null; // Fase 8.6
      this.jukeboxes = null; // Fase 6.5 (colecciones)
      this.nether = null; // Fase 8.2
      this.noise = null;
    }
  }

  private buildGraph(ctx: AudioContext): void {
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;

    this.masterLowpass = ctx.createBiquadFilter();
    this.masterLowpass.type = 'lowpass';
    this.masterLowpass.frequency.value = OPEN_LOWPASS_FREQ;
    this.masterLowpass.Q.value = 0.0001;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;

    this.masterGain.connect(this.masterLowpass).connect(this.compressor).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.masterGain);

    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = this.ambientVolume;
    this.ambientBus.connect(this.masterGain);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.masterGain);

    // Reverb de convolución compartida, alimentada por un bus de envío.
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    this.convolver.buffer = createReverbImpulse(ctx);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.5;
    this.reverbSend.connect(this.convolver).connect(this.reverbReturn).connect(this.masterGain);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = this.voiceVolume;
    this.voiceBus.connect(this.masterGain);
  }

  /** Chat de voz: el contexto de audio, el bus de las voces y el envío a la reverberación (null si el audio no arrancó). */
  voiceGraph(): { ctx: AudioContext; bus: GainNode; reverb: GainNode } | null {
    return this.ctx ? { ctx: this.ctx, bus: this.voiceBus, reverb: this.reverbSend } : null;
  }

  setVoiceVolume(v: number): void {
    this.voiceVolume = Math.max(0, Math.min(2, v));
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      this.voiceBus.gain.setTargetAtTime(this.voiceVolume, ctx.currentTime, 0.05);
    });
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* el audio nunca debe interrumpir el juego */
    }
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      this.masterGain.gain.setTargetAtTime(this.masterVolume, ctx.currentTime, 0.05);
    });
  }

  setMusicVolume(v: number): void {
    this.musicVolume = clamp01(v);
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      this.musicBus.gain.setTargetAtTime(this.musicVolume, ctx.currentTime, 0.05);
    });
  }

  setAmbientVolume(v: number): void {
    this.ambientVolume = clamp01(v);
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      this.ambientBus.gain.setTargetAtTime(this.ambientVolume, ctx.currentTime, 0.05);
    });
  }

  setListener(pos: Vec3, forward: Vec3, up: Vec3): void {
    this.listenerPos = pos;
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      const listener = ctx.listener;
      const now = ctx.currentTime;
      if (listener.positionX) {
        listener.positionX.setTargetAtTime(pos[0], now, 0.03);
        listener.positionY.setTargetAtTime(pos[1], now, 0.03);
        listener.positionZ.setTargetAtTime(pos[2], now, 0.03);
        listener.forwardX.setTargetAtTime(forward[0], now, 0.03);
        listener.forwardY.setTargetAtTime(forward[1], now, 0.03);
        listener.forwardZ.setTargetAtTime(forward[2], now, 0.03);
        listener.upX.setTargetAtTime(up[0], now, 0.03);
        listener.upY.setTargetAtTime(up[1], now, 0.03);
        listener.upZ.setTargetAtTime(up[2], now, 0.03);
      } else {
        const legacy = listener as unknown as LegacyListener;
        legacy.setPosition?.(pos[0], pos[1], pos[2]);
        legacy.setOrientation?.(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
      }
    });
  }

  /** Crea un PannerNode para `pos`, construye el sonido con `build` y lo registra en el pool de voces. */
  private spawnPositional(
    pos: Vec3,
    build: (ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number) => AudioScheduledSourceNode[],
    wetLevel = 0.35,
    volume = 1,
  ): void {
    const ctx = this.ctx;
    const noise = this.noise;
    if (!ctx || !noise) return;
    // Fase 8.3: los sonidos fuertes (volumen de Java > 1, como el ghast) se oyen más lejos (16 bloques por unidad).
    if (volume > 1) {
      const d = Math.hypot(this.listenerPos[0] - pos[0], this.listenerPos[1] - pos[1], this.listenerPos[2] - pos[2]);
      if (d > Math.min(96, 16 * volume)) return;
    } else if (!isWithinRange(this.listenerPos, pos)) return;
    const now = ctx.currentTime;
    const panner = createPanner(ctx, pos);
    if (volume > 1) {
      panner.refDistance *= volume;
      panner.maxDistance = Math.min(96, 16 * volume);
    }
    const dry = ctx.createGain();
    dry.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = wetLevel;
    panner.connect(dry).connect(this.sfxBus);
    panner.connect(wet);
    wet.connect(this.reverbSend);
    const sources = build(ctx, noise, panner, now);
    this.voices.spawn(sources, [panner, dry, wet]);
  }

  /**
   * Igual que `spawnPositional` pero sin PannerNode: para sonidos "dentro de la cabeza" del
   * jugador (dolor propio, comer, recoger objetos, crafteo...) que no dependen de una posición ni
   * se ven afectados por la distancia.
   */
  private spawnLocal(wetLevel: number, build: (ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number) => AudioScheduledSourceNode[]): void {
    const ctx = this.ctx;
    const noise = this.noise;
    if (!ctx || !noise) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(this.sfxBus);
    const wet = ctx.createGain();
    wet.gain.value = wetLevel;
    gain.connect(wet);
    wet.connect(this.reverbSend);
    const sources = build(ctx, noise, gain, now);
    this.voices.spawn(sources, [gain, wet]);
  }

  playBreak(material: SoundMaterial, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildMaterialSound(ctx, noise, material, 'break', 1, dest, now)));
  }

  playPlace(material: SoundMaterial, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildMaterialSound(ctx, noise, material, 'place', 1, dest, now)));
  }

  playStep(material: SoundMaterial, pos: Vec3, volume = 1): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildMaterialSound(ctx, noise, material, 'step', clamp01(volume), dest, now)));
  }

  playLand(material: SoundMaterial, pos: Vec3, intensity: number): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildMaterialSound(ctx, noise, material, 'land', clamp01(intensity), dest, now)));
  }

  playSplash(pos: Vec3, intensity: number): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildSplashSound(ctx, noise, clamp01(intensity), dest, now)));
  }

  playUi(kind: UiKind): void {
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gain.connect(this.sfxBus);
      const wet = ctx.createGain();
      wet.gain.value = 0.15;
      gain.connect(wet);
      wet.connect(this.reverbSend);
      const sources = buildUiSound(ctx, kind, gain, now);
      this.voices.spawn(sources, [gain, wet]);
    });
  }

  // --- Criaturas (modo supervivencia) ---

  /**
   * Fase 8.3 (criaturas del Nether): voz con variante (enfadado, celoso, huyendo…) que decide el servidor. `volume`:
   * el volumen de Java (el ghast, 5: se oye a 80 bloques).
   */
  playNetherVoice(kind: MobSoundKind, variant: number, pos: Vec3, volume = 1): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildNetherVoice(ctx, noise, kind, variant, dest, now), 0.35, volume));
  }

  /** Fase 8.3: sonidos sueltos del Nether (ballesta del piglin, bolas de fuego, conversión, acelerón del strider). */
  playNetherSfx(what: string, a: number, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildNetherSfx(ctx, noise, what, a, dest, now)));
  }

  /** Sonido de una criatura en `pos` para el `kind`/`event` dados. */
  playMob(kind: MobSoundKind, event: MobSoundEvent, pos: Vec3): void {
    if (kind === 'creeper' && event === 'idle') return; // silencio intencionado: el creeper no vocaliza en reposo
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildMobSound(ctx, noise, kind, event, dest, now)));
  }

  // --- Jugador y objetos ---

  /** `pos` null = el jugador local (no posicional, "dentro de la cabeza"); si no, otro jugador visto/oído en el mundo. */
  playPlayerHurt(pos: Vec3 | null): void {
    this.safe(() => {
      if (pos) {
        this.spawnPositional(pos, (ctx, noise, dest, now) => buildPlayerHurt(ctx, noise, dest, now));
      } else {
        this.spawnLocal(0.1, (ctx, noise, dest, now) => buildPlayerHurt(ctx, noise, dest, now));
      }
    });
  }

  /** Muerte del jugador local: siempre no posicional. */
  playPlayerDeath(): void {
    this.safe(() => this.spawnLocal(0.15, (ctx, noise, dest, now) => buildPlayerDeath(ctx, noise, dest, now)));
  }

  /** Ráfaga de mordisco; llamar repetidamente mientras se come. */
  playEat(): void {
    this.safe(() => this.spawnLocal(0.06, (ctx, noise, dest, now) => buildEat(ctx, noise, dest, now)));
  }

  /** Eructo corto al terminar de comer. */
  playBurp(): void {
    this.safe(() => this.spawnLocal(0.08, (ctx, _noise, dest, now) => buildBurp(ctx, dest, now)));
  }

  /** "Pop" suave con tono aleatorio: un objeto se recoge del suelo. */
  playPickup(): void {
    this.safe(() => this.spawnLocal(0.05, (ctx, _noise, dest, now) => buildPickup(ctx, dest, now)));
  }

  /** Tintineo de un orbe de experiencia recogido (tono aleatorio). */
  playXpOrb(): void {
    this.safe(() => this.spawnLocal(0.1, (ctx, _noise, dest, now) => buildXpOrb(ctx, dest, now)));
  }

  /** Fanfarria de subir de nivel. */
  playLevelUp(): void {
    this.safe(() => this.spawnLocal(0.2, (ctx, _noise, dest, now) => buildLevelUp(ctx, dest, now)));
  }

  /** Confirmación de crafteo (interfaz, no posicional). */
  playCraft(): void {
    this.safe(() => this.spawnLocal(0.08, (ctx, _noise, dest, now) => buildCraft(ctx, dest, now)));
  }

  // --- Combate ---

  /** Explosión de creeper en `pos`; `power` ~1..4 (potencia/radio). */
  playExplosion(pos: Vec3, power: number): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildExplosion(ctx, noise, dest, now, power), 0.55));
  }

  /**
   * Trueno de un rayo a `distance` bloques: llega con retraso (343 bloques/s) y más flojo de lejos. `sky` (0..1) es
   * cuánto cielo ve el jugador: bajo tierra llega muy apagado y sin el chasquido (sólo el retumbar grave).
   */
  playThunder(distance: number, sky = 1): void {
    const delay = Math.min(4, distance / 343);
    const loud = Math.max(0.15, Math.min(1, 1 - distance / 260)) * (0.1 + 0.9 * Math.max(0, Math.min(1, sky)));
    this.safe(() => this.spawnLocal(0.6, (ctx, noise, dest, now) => buildThunder(ctx, noise, dest, now, delay, loud)));
  }

  /** Fase 6 (asaltos): cuerno, ballesta, conjuros, colmillos, rugido, tótem, victoria y derrota. */
  playRaidSfx(kind: string, pos: Vec3 | null): void {
    const build = (ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number) => buildRaidSfx(ctx, noise, kind, dest, now);
    this.safe(() => (pos ? this.spawnPositional(pos, build, 0.5) : this.spawnLocal(0.4, build)));
  }

  /** Fase 7.5 (mansión): el alay recibe, devuelve, recoge o lanza objetos, o se duplica. */
  playAllaySfx(kind: string, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildAllaySfx(ctx, noise, kind, dest, now), 0.3));
  }

  /** Fase 6.5 (cobre): encerar o raspar un bloque de cobre en `pos`. */
  playCopperSfx(kind: 'wax' | 'scrape', pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildCopperSfx(ctx, noise, kind, dest, now)));
  }

  /** Fase 7 (redstone): chasquidos de los componentes, puertas movidas por la potencia y notas del bloque musical. */
  playRedstoneSfx(kind: string, pos: Vec3, a = 0, b = 0): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildRedstoneSfx(ctx, noise, kind, a, b, dest, now), kind === 'note' ? 0.45 : 0.25));
  }

  /** Fase 7 (mecanismos): pistones, dispensadores y soltadores. */
  playMechanismSfx(kind: string, pos: Vec3, a = 0): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildMechanismSfx(ctx, noise, kind, a, dest, now), 0.3));
  }

  /** Fase 6.5 (decoración): campana, colgar/descolgar cuadros y marcos, girar el objeto del marco. */
  playDecorSfx(kind: string, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildDecorSfx(ctx, noise, kind, dest, now), kind === 'bell' ? 0.6 : 0.3));
  }

  /**
   * Fase 6.5 (colecciones): pone a sonar el disco `disc` (índice de DISCS) en el tocadiscos `key`, que ya
   * lleva `elapsed` segundos sonando.
   */
  playDisc(key: string, disc: number, pos: Vec3, elapsed: number): void {
    if (!this.jukeboxes) {
      this.pendingDiscs.set(key, { disc, pos, elapsed, at: performance.now() });
      return;
    }
    this.safe(() => this.jukeboxes?.play(key, disc, pos, elapsed));
  }

  /** Fase 6.5 (colecciones): calla el tocadiscos `key`. */
  stopDisc(key: string): void {
    this.pendingDiscs.delete(key);
    this.safe(() => this.jukeboxes?.stop(key));
  }

  /** Fase 6.5 (colecciones): tocadiscos sonando ahora mismo. */
  get discsPlaying(): number {
    return this.jukeboxes?.count ?? this.pendingDiscs.size;
  }

  /**
   * Fase 6.5 (equipo): sonidos del equipo (mechero, fuego, ballesta, tridente, cuerno, cohetes…). El
   * cuerno y los estallidos se oyen lejos: si están fuera del alcance normal, suenan desde más cerca
   * en la misma dirección (y más flojos).
   */
  playEquipSfx(kind: string, pos: Vec3, a = 0): void {
    const far = kind === 'goat_horn' ? 26 : kind === 'firework_burst' || kind === 'firework_launch' ? 34 : 0;
    let p = pos;
    if (far) {
      const l = this.listenerPos;
      const d = Math.hypot(pos[0] - l[0], pos[1] - l[1], pos[2] - l[2]);
      if (d > far) {
        const k = far / d;
        p = [l[0] + (pos[0] - l[0]) * k, l[1] + (pos[1] - l[1]) * k, l[2] + (pos[2] - l[2]) * k];
      }
    }
    this.safe(() => this.spawnPositional(p, (ctx, noise, dest, now) => buildEquipmentSfx(ctx, noise, kind, dest, now, a), far ? 0.6 : 0.3));
  }

  /** Fase 8.7: el Wither (nacer, disparar, romper bloques). */
  playWitherSfx(kind: string, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildWitherSfx(ctx, noise, kind, dest, now), kind === 'wither_spawn' ? 0.6 : 0.3));
  }

  /**
   * Fase 7 (pociones): beber, llenar o vaciar un frasco, el alambique al terminar, la poción que se rompe
   * y la nube persistente. Sin posición, suena en la cabeza del jugador (beber).
   */
  playPotionSfx(kind: string, pos: Vec3 | null): void {
    const build = (ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number) => buildPotionSfx(ctx, noise, kind, dest, now);
    this.safe(() => (pos ? this.spawnPositional(pos, build, 0.3) : this.spawnLocal(0.1, build)));
  }

  /** Fase 7 (transporte): remos, barcas y vagonetas (`a`: 1 metal, 0 madera; en el traqueteo, la velocidad). */
  playTransportSfx(kind: string, pos: Vec3, a = 0): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildTransportSfx(ctx, noise, kind, dest, now, a), 0.3));
  }

  /** Fase 7 (encantamientos): mesa de encantamientos, yunque, afiladora, botella con experiencia y espinas. */
  playEnchantSfx(kind: string, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildEnchantSfx(ctx, noise, kind, dest, now), 0.3));
  }

  /**
   * Fase 7.5 (océano): láser del guardián, coletazos, púas y la maldición del anciano (`a`: tipo de criatura).
   * Sin posición, suena en la cabeza del jugador (la maldición).
   */
  playOceanSfx(kind: string, pos: Vec3 | null, a?: number): void {
    const build = (ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number) => buildOceanSfx(ctx, noise, kind, dest, now, a);
    this.safe(() => (pos ? this.spawnPositional(pos, build, 0.4) : this.spawnLocal(0.5, build)));
  }

  /**
   * Fase 7.5 (abismo): sensores, chilladores, catalizadores, el warden (rugido, olfateo, latido, estampido…) y
   * el ambiente del Deep Dark (`a`: dato del efecto). Sin posición, suena en la cabeza del jugador.
   */
  /** Fase 8.2: sonido suelto («additions») del bioma del Nether en `pos`. */
  playNetherAddition(biome: number, pos: Vec3): void {
    this.safe(() => this.nether?.playAddition(biome, pos));
  }

  /** Fase 8.2: «mood» del bioma del Nether en `pos` (tras mucho rato a oscuras). */
  playNetherMood(biome: number, pos: Vec3): void {
    this.safe(() => this.nether?.playMood(biome, pos));
  }

  playDeepDarkSfx(kind: string, pos: Vec3 | null, a?: number): void {
    const build = (ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number) => buildDeepDarkSfx(ctx, noise, kind, dest, now, a);
    this.safe(() => (pos ? this.spawnPositional(pos, build, 0.6) : this.spawnLocal(0.6, build)));
  }

  /** Suelta de cuerda de arco en `pos`; `charge` 0..1 es la tensión acumulada al soltar. */
  playBowShoot(pos: Vec3, charge: number): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildBowTwang(ctx, noise, dest, now, charge)));
  }

  /** Barrido de la espada (PLAYER_ATTACK_SWEEP) en `pos`. */
  playSweep(pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildSweep(ctx, noise, dest, now), 0.3));
  }

  /** Golpe corriendo (PLAYER_ATTACK_KNOCKBACK) en `pos`. */
  playKnockbackHit(pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildKnockbackHit(ctx, noise, dest, now), 0.2));
  }

  /** Impacto de una flecha contra un bloque o criatura en `pos`. */
  playArrowHit(pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildArrowHit(ctx, noise, dest, now)));
  }

  /** Golpe de picado (minería), más suave y corto que `playBreak`; repetir mientras se rompe el bloque. */
  playBlockHit(material: SoundMaterial, pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildBlockHit(ctx, noise, material, dest, now)));
  }

  /** Chisporroteo ocasional de un horno encendido en `pos`. */
  playFurnace(pos: Vec3): void {
    this.safe(() => this.spawnPositional(pos, (ctx, noise, dest, now) => buildFurnaceCrackle(ctx, noise, dest, now)));
  }

  // --- Fluidos y estado del jugador ---

  /** 0..1 cada uno: proximidad a agua corriente y a lava cercanas (bucles con crossfade suave; 0 = silencio). */
  setFluidProximity(water: number, lava: number): void {
    this.pendingWaterProximity = clamp01(water);
    this.pendingLavaProximity = clamp01(lava);
    this.safe(() => this.fluids?.setProximity(water, lava));
  }

  /** 0..1: intensidad del latido por salud baja (0 = apagado). */
  setHeartbeat(lowHealth: number): void {
    this.pendingHeartbeat = clamp01(lowHealth);
    this.safe(() => this.heartbeat?.setLevel(lowHealth));
  }

  /** Fase 8.6: el viento al planear con élitros (volumen 0..1 y tono). */
  setGlideWind(volume: number, pitch: number): void {
    this.safe(() => this.glideWind?.set(volume, pitch));
  }

  update(dt: number, state: AmbientState): void {
    this.safe(() => {
      const ctx = this.ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      const targetFreq = state.underwater ? UNDERWATER_LOWPASS_FREQ : OPEN_LOWPASS_FREQ;
      this.masterLowpass.frequency.setTargetAtTime(targetFreq, now, 0.4);
      this.ambience?.update(dt, state, this.listenerPos);
      this.nether?.update(dt, state.netherBiome ?? -1); // Fase 8.2
      this.music?.setStyle(state.boss ? BOSS_STYLE : state.netherBiome ?? -1); // Fase 8.6: la del jefe
      this.music?.update(dt);
      this.fluids?.update(dt);
      this.heartbeat?.update(dt);
      this.glideWind?.update(); // Fase 8.6
      this.jukeboxes?.update(this.listenerPos); // Fase 6.5 (colecciones)
    });
  }

  dispose(): void {
    this.safe(() => {
      this.voices.clear();
      this.ambience?.dispose();
      this.music?.dispose();
      this.fluids?.dispose();
      this.heartbeat?.dispose();
      this.glideWind?.dispose(); // Fase 8.6
      this.jukeboxes?.dispose(); // Fase 6.5 (colecciones)
      this.jukeboxes = null;
      this.nether?.dispose(); // Fase 8.2
      this.nether = null;
      this.ambience = null;
      this.music = null;
      this.fluids = null;
      this.heartbeat = null;
      this.noise = null;
      const ctx = this.ctx;
      this.ctx = null;
      this.resumePromise = null;
      if (ctx) {
        void ctx.close().catch(() => {
          /* no-op */
        });
      }
    });
  }
}
