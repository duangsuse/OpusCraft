// Chat de voz por proximidad. La voz va directa de navegador a navegador (WebRTC, una conexión con cada jugador de
// la dimensión que también tiene la voz activada); el servidor sólo reparte quién la tiene y pasa las señales con
// las que se conectan. Cada voz entra en el motor de audio como un sonido más del mundo: sale de la cabeza de quien
// habla (HRTF), se apaga con la distancia hasta los 48 bloques y comparte la reverberación del resto de sonidos.
//
// Parte 2: el entorno (voiceEnvironment): las paredes la apagan y le quitan los agudos, pero la voz rodea los
// obstáculos por puertas, ventanas y pasillos (y entonces se oye desde la abertura); cada sitio suena según su
// tamaño y sus paredes (una sala pequeña, una caverna con eco, un cuarto de lana sordo); de espaldas se oye más
// baja y apagada, el aire se come los agudos con la distancia y bajo el agua suena ahogada. Cada dimensión es un
// servidor aparte, así que sólo se oye a los de la misma.
//
// Parte 3: susurrar (otra tecla: se oye a la mitad de distancia), el volumen o el silencio de cada jugador (por su
// nombre, se guarda) y los grupos: los de un mismo grupo se oyen a cualquier distancia dentro de la dimensión. El
// susurro y el grupo viajan por un canal de datos de la propia conexión, sin pasar por el servidor.
//
// Se escucha a los demás en cuanto se entra (con la voz activada en los ajustes); el micrófono sólo se pide la
// primera vez que se pulsa la tecla de hablar (o al elegir el modo «por voz»).
import type { RtcSignal, ServerMsg } from '../../shared/protocol';
import type { Game } from '../game/Game';
import type { RemotePlayer } from '../game/RemotePlayers';
import { keyLabel } from '../game/keybinds';
import { BLOCK_FLUID } from '../../shared/blocks';
import {
  voiceOcclusion, roomProfile, roomWet, roomEcho, soundPath, voiceDirectivity, airCutoff, type BlockAt, type RoomProfile,
} from './voiceEnvironment';
import { createReverbImpulse } from '../audio/noise';

/** Alcance de la voz (bloques): a partir de aquí no se oye. */
export const VOICE_RANGE = 48;
/** Alcance del susurro. */
export const WHISPER_RANGE = VOICE_RANGE / 2;
/** Los de un mismo grupo se oyen al menos a este volumen, estén donde estén (y sin paredes). */
const GROUP_GAIN = 0.85;
/** Nombre de un grupo: corto y sin espacios raros. */
export function cleanGroup(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 24);
}
/** Hasta esta distancia se oye a todo volumen. */
const VOICE_NEAR = 2.5;
/** Conexiones como mucho (la malla crece con el cuadrado de los jugadores). */
const MAX_PEERS = 16;
/** Tras fallar una conexión, espera antes de reintentarla (ms). */
const RETRY_MS = 4000;
/** Nivel (RMS) a partir del cual se considera que alguien habla, y cuánto dura el «hablando» tras callar (ms). */
const TALK_RMS = 0.012;
const TALK_HOLD = 350;
/** Cada cuánto se recalcula lo que tapa cada voz, su camino rodeando obstáculos y cómo es su sitio (ms). */
const OCCLUSION_MS = 120;
const PATH_MS = 300;
const REVERB_MS = 600;
/** Sólo se busca un camino alrededor si lo directo llega bastante tapado. */
const PATH_WHEN_BELOW = 0.85;
/** Quien habla bajo el agua (y se le oye desde fuera): la voz ahogada. */
const WATER_CUTOFF = 650;
const WATER_GAIN = 0.6;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

/** Volumen según la distancia: entero de cerca y una caída suave (cuadrática) hasta el alcance. */
export function voiceDistanceGain(d: number, range = VOICE_RANGE): number {
  if (d <= VOICE_NEAR) return 1;
  if (d >= range) return 0;
  const t = 1 - (d - VOICE_NEAR) / (range - VOICE_NEAR);
  return t * t;
}

/** Nivel RMS de lo que hay ahora en un analizador. */
function rms(an: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  an.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

interface PeerAudio {
  /** Chrome sólo entrega el sonido remoto a Web Audio si el stream está puesto en un elemento (silenciado). */
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  /** El volumen elegido para ese jugador (lo comparten lo directo, la sala y el eco). */
  gain: GainNode;
  /** Lo que llega: distancia, paredes o rodeo, hacia dónde habla y agua; con los agudos que quedan. */
  direct: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  /** A las salas de voz: la corta (sitios pequeños) y la larga (cavernas). */
  sendSmall: GainNode;
  sendLarge: GainNode;
  /** Eco de los sitios grandes: retardo con realimentación y sin agudos. */
  echoIn: GainNode;
  echoDelay: DelayNode;
  echoFeedback: GainNode;
  echoFilter: BiquadFilterNode;
}

/** El entorno de una voz (se recalcula cada poco y el audio se acerca a él con suavidad). */
interface PeerEnv {
  /** Lo tapado por lo directo (0..1) y su corte. */
  gain: number;
  cutoff: number;
  /** El rodeo por el aire (si lo hay): largo y de dónde parece venir. */
  path: { length: number; aperture: [number, number, number] } | null;
  room: RoomProfile;
  nextOcclusion: number;
  nextPath: number;
  nextReverb: number;
  /** Dónde suena ahora (se acerca poco a poco a donde toca, sin saltos). */
  pos: [number, number, number] | null;
  speakerWet: boolean;
}

const OPEN_ROOM: RoomProfile = { closed: 0, size: 0, reflect: 0 };

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** Candidatos que llegaron antes que la descripción del otro. */
  pending: RTCIceCandidateInit[];
  remoteSet: boolean;
  audio: PeerAudio | null;
  stream: MediaStream | null;
  talkUntil: number;
  env: PeerEnv;
  /** Canal de datos: el susurro y el grupo del otro. */
  dc: RTCDataChannel | null;
  whisper: boolean;
  group: string;
}

export type MicState = 'none' | 'asking' | 'ready' | 'denied';

export class VoiceChat {
  private peers = new Map<string, Peer>();
  /** Lo que el servidor sabe de nosotros (se reinicia con cada bienvenida). */
  private announced = false;
  /** Conexiones que fallaron: no se reintentan hasta este instante. */
  private retryAt = new Map<string, number>();
  private mic: MediaStream | null = null;
  micState: MicState = 'none';
  private micAnalyser: AnalyserNode | null = null;
  private micSrc: MediaStreamAudioSourceNode | null = null;
  private buf = new Float32Array(512);
  /** Estamos mandando voz ahora (tecla pulsada o voz por encima del umbral). */
  transmitting = false;
  /** Susurrando (con la tecla de susurrar): los demás nos oyen a la mitad de distancia. */
  whispering = false;
  /** Grupo de voz ('' sin grupo). */
  group = '';
  /** Último estado mandado por los canales de datos. */
  private sentState = '';
  /** Nivel del micrófono (0..1) para el medidor de los ajustes. */
  micLevel = 0;
  private vadUntil = 0;
  private hud: HTMLElement | null = null;
  /** Cómo es el sitio donde estamos nosotros (se mezcla con el de quien habla). */
  private listenerRoom: RoomProfile = OPEN_ROOM;
  private nextListenerReverb = 0;
  /** Las dos salas de voz (convoluciones): corta y larga, compartidas por todas las voces. */
  private rooms: { small: ConvolverNode; large: ConvolverNode } | null = null;

  /** Teclas pulsadas ahora (hablar y susurrar funcionan con cualquier pantalla abierta: inventario, comercio…). */
  private held = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || typingIn(e.target)) return;
    const k = this.settings.keys;
    if (e.code !== k.voice && e.code !== k.whisper) return;
    this.held.add(e.code);
    // La primera vez, el micrófono se pide aquí (con el gesto de pulsar la tecla).
    if (this.active && this.micState === 'none') void this.requestMic();
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private readonly onBlur = () => this.held.clear();

  constructor(private g: Game) {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
  }

  /** ¿Se está pulsando ahora la tecla de hablar / de susurrar? */
  keyHeld(code: string): boolean {
    return this.held.has(code);
  }

  private get settings() {
    return this.g.cfg.settings;
  }

  /** Activo: con servidor de verdad y la voz encendida en los ajustes. */
  get active(): boolean {
    return !this.g.offline && !!this.g.net && this.settings.voiceEnabled;
  }

  /** Nueva sesión en el servidor (entrar, reconectar o cambiar de dimensión): hay que volver a presentarse. */
  onWelcome(): void {
    this.announced = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.retryAt.clear();
  }

  /** Mensajes 'voice' y 'rtc' del servidor (true si era uno de ellos). */
  onMessage(msg: ServerMsg): boolean {
    if (msg.t === 'voice') {
      const rp = this.g.remote.get(msg.id);
      if (rp) rp.voice = msg.on;
      if (!msg.on) this.closePeer(msg.id);
      return true;
    }
    if (msg.t === 'rtc') {
      void this.onSignal(msg.from, msg.d);
      return true;
    }
    return false;
  }

  /** Pide el micrófono (hace falta un gesto del jugador la primera vez). */
  async requestMic(): Promise<boolean> {
    if (this.mic) return true;
    if (this.micState === 'asking') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micState = 'denied';
      this.g.ui.toast('Este navegador no permite usar el micrófono');
      return false;
    }
    this.micState = 'asking';
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    } catch (e) {
      console.warn('Micrófono no disponible:', e);
      this.micState = 'denied';
      this.g.ui.toast('No se pudo usar el micrófono');
      return false;
    }
    this.micState = 'ready';
    const track = this.mic.getAudioTracks()[0];
    if (track) track.enabled = false;
    // Las conexiones que ya había empiezan a llevar nuestra voz (sin renegociar: el transceptor ya estaba).
    for (const p of this.peers.values()) this.attachMic(p);
    return true;
  }

  private attachMic(p: Peer): void {
    const track = this.mic?.getAudioTracks()[0] ?? null;
    const tr = p.pc.getTransceivers()[0];
    if (!tr || !track || tr.sender.track === track) return;
    tr.direction = 'sendrecv';
    void tr.sender.replaceTrack(track).catch(() => {});
  }

  private releaseMic(): void {
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.micSrc?.disconnect();
    this.micSrc = null;
    this.micAnalyser = null;
    if (this.micState === 'ready') this.micState = 'none';
    this.transmitting = false;
  }

  /** Cada fotograma: presentarse, conexiones con quien toque, quién habla y dónde suena cada voz. */
  update(pttDown: boolean, whisperDown: boolean, cam: readonly [number, number, number]): void {
    const net = this.g.net;
    if (!this.active || !net) {
      if (this.announced && net) net.send({ t: 'voice', on: false });
      this.announced = false;
      if (this.peers.size) for (const id of [...this.peers.keys()]) this.closePeer(id);
      if (this.mic) this.releaseMic();
      this.renderHud();
      return;
    }
    if (!this.announced) {
      net.send({ t: 'voice', on: true });
      this.announced = true;
    }
    // Modo «por voz»: el micrófono se pide al activarlo (desde los ajustes) o aquí si ya se había concedido.
    if (this.settings.voiceMode === 'vad' && this.micState === 'none') void this.requestMic();
    this.updateMic(pttDown, whisperDown);
    if (net.id) this.syncPeers(net.id);
    this.shareState();
    this.placeVoices(cam);
    this.renderHud();
  }

  /** Pulsar para hablar o voz por encima del umbral: el micrófono sólo manda sonido mientras tanto. */
  private updateMic(pttDown: boolean, whisperDown: boolean): void {
    const track = this.mic?.getAudioTracks()[0];
    const now = performance.now();
    let level = 0;
    if (this.mic && !this.micAnalyser) {
      const graph = this.g.audio.voiceGraph();
      if (graph) {
        this.micSrc = graph.ctx.createMediaStreamSource(this.mic);
        this.micAnalyser = graph.ctx.createAnalyser();
        this.micAnalyser.fftSize = 512;
        this.micSrc.connect(this.micAnalyser);
      }
    }
    if (this.micAnalyser) level = rms(this.micAnalyser, this.buf);
    this.micLevel = Math.min(1, level * 8);
    let on: boolean;
    if (this.settings.voiceMode === 'vad') {
      // El umbral de los ajustes (0..1) va de muy sensible a sólo voz fuerte.
      const threshold = 0.004 + this.settings.voiceThreshold * 0.08;
      if (level > threshold) this.vadUntil = now + 450;
      on = now < this.vadUntil || whisperDown;
    } else on = pttDown || whisperDown;
    this.transmitting = on && !!track && track.readyState === 'live';
    this.whispering = this.transmitting && whisperDown;
    if (track && track.enabled !== this.transmitting) track.enabled = this.transmitting;
  }

  /** Una conexión con cada jugador de la dimensión que tiene la voz; fuera las de quien se fue o la apagó. */
  private syncPeers(myId: string): void {
    const now = performance.now();
    for (const id of [...this.peers.keys()]) {
      const rp = this.g.remote.get(id);
      if (!rp || !rp.voice) this.closePeer(id);
    }
    for (const rp of this.g.remote.values()) {
      if (!rp.voice || this.peers.has(rp.id) || this.peers.size >= MAX_PEERS) continue;
      // Ofrece siempre el de id menor: así nunca se cruzan dos ofertas. El otro espera la suya.
      if (myId >= rp.id) continue;
      if ((this.retryAt.get(rp.id) ?? 0) > now) continue;
      void this.offer(rp.id);
    }
  }

  private createPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const p: Peer = {
      id, pc, pending: [], remoteSet: false, audio: null, stream: null, talkUntil: 0,
      env: { gain: 1, cutoff: 20000, path: null, room: OPEN_ROOM, nextOcclusion: 0, nextPath: 0, nextReverb: 0, pos: null, speakerWet: false },
      dc: null, whisper: false, group: '',
    };
    pc.ondatachannel = (e) => {
      if (this.peers.get(id) === p) this.bindChannel(p, e.channel);
    };
    this.peers.set(id, p);
    pc.onicecandidate = (e) => {
      if (!e.candidate || this.peers.get(id) !== p) return;
      const c = e.candidate;
      const ice: NonNullable<RtcSignal['ice']> = { candidate: c.candidate };
      if (c.sdpMid != null) ice.sdpMid = c.sdpMid;
      if (c.sdpMLineIndex != null) ice.sdpMLineIndex = c.sdpMLineIndex;
      this.g.net?.send({ t: 'rtc', to: id, d: { ice } });
    };
    pc.ontrack = (e) => {
      if (this.peers.get(id) !== p) return;
      p.stream = e.streams[0] ?? new MediaStream([e.track]);
      this.buildAudio(p);
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== p) return;
      if (pc.connectionState === 'failed') {
        this.closePeer(id);
        this.retryAt.set(id, performance.now() + RETRY_MS);
      }
    };
    return p;
  }

  private async offer(id: string): Promise<void> {
    const p = this.createPeer(id);
    const tr = p.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.bindChannel(p, p.pc.createDataChannel('estado', { ordered: true }));
    const track = this.mic?.getAudioTracks()[0];
    if (track) await tr.sender.replaceTrack(track).catch(() => {});
    try {
      const offer = await p.pc.createOffer();
      if (this.peers.get(id) !== p) return;
      await p.pc.setLocalDescription(offer);
      const sdp = p.pc.localDescription;
      if (sdp && this.peers.get(id) === p) this.g.net?.send({ t: 'rtc', to: id, d: { sdp: { type: 'offer', sdp: sdp.sdp } } });
    } catch (e) {
      console.warn('Voz: no se pudo crear la oferta', e);
      this.closePeer(id);
      this.retryAt.set(id, performance.now() + RETRY_MS);
    }
  }

  private async onSignal(from: string, d: RtcSignal): Promise<void> {
    if (!this.active) return;
    try {
      if (d.sdp?.type === 'offer') {
        // Una oferta nueva sustituye a la conexión que hubiera (el otro la rehízo).
        if (this.peers.has(from)) this.closePeer(from);
        if (this.peers.size >= MAX_PEERS) return;
        const p = this.createPeer(from);
        await p.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp.sdp });
        p.remoteSet = true;
        const tr = p.pc.getTransceivers()[0];
        if (tr) tr.direction = 'sendrecv';
        this.attachMic(p);
        await this.flushCandidates(p);
        const answer = await p.pc.createAnswer();
        if (this.peers.get(from) !== p) return;
        await p.pc.setLocalDescription(answer);
        const sdp = p.pc.localDescription;
        if (sdp) this.g.net?.send({ t: 'rtc', to: from, d: { sdp: { type: 'answer', sdp: sdp.sdp } } });
      } else if (d.sdp?.type === 'answer') {
        const p = this.peers.get(from);
        if (!p || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp.sdp });
        p.remoteSet = true;
        await this.flushCandidates(p);
      } else if (d.ice) {
        const p = this.peers.get(from);
        if (!p) return;
        if (p.remoteSet) await p.pc.addIceCandidate(d.ice);
        else if (p.pending.length < 64) p.pending.push(d.ice);
      }
    } catch (e) {
      console.warn('Voz: señal rechazada', e);
    }
  }

  /** El canal de datos de una conexión: al abrirse manda nuestro estado; recibe el del otro. */
  private bindChannel(p: Peer, dc: RTCDataChannel): void {
    p.dc = dc;
    dc.onopen = () => this.sendState(p);
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 200) return;
      try {
        const m = JSON.parse(e.data) as { w?: unknown; g?: unknown };
        p.whisper = m.w === 1;
        p.group = typeof m.g === 'string' ? cleanGroup(m.g) : '';
      } catch {
        /* mensaje roto: se ignora */
      }
    };
  }

  private stateJson(): string {
    return JSON.stringify({ w: this.whispering ? 1 : 0, g: this.group });
  }

  private sendState(p: Peer): void {
    if (p.dc?.readyState === 'open') p.dc.send(this.stateJson());
  }

  /** Si cambió el susurro o el grupo, se lo cuenta a todos. */
  private shareState(): void {
    const s = this.stateJson();
    if (s === this.sentState) return;
    this.sentState = s;
    for (const p of this.peers.values()) this.sendState(p);
  }

  private async flushCandidates(p: Peer): Promise<void> {
    const list = p.pending.splice(0);
    for (const c of list) await p.pc.addIceCandidate(c).catch(() => {});
  }

  /** Las salas de voz: una respuesta corta (salas, pasillos) y otra larga y oscura (cavernas). */
  private voiceRooms(ctx: AudioContext, bus: GainNode): { small: ConvolverNode; large: ConvolverNode } {
    if (this.rooms) return this.rooms;
    const small = ctx.createConvolver();
    small.normalize = true;
    small.buffer = createReverbImpulse(ctx, 0.55, 3.2);
    const large = ctx.createConvolver();
    large.normalize = true;
    large.buffer = createReverbImpulse(ctx, 3.2, 2.1);
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 3200;
    const outSmall = ctx.createGain();
    outSmall.gain.value = 0.7;
    const outLarge = ctx.createGain();
    outLarge.gain.value = 0.8;
    small.connect(outSmall).connect(bus);
    large.connect(dark).connect(outLarge).connect(bus);
    return (this.rooms = { small, large });
  }

  /** La voz que llega: volumen, filtro, posición 3D, las salas y el eco. */
  private buildAudio(p: Peer): void {
    if (p.audio || !p.stream) return;
    const graph = this.g.audio.voiceGraph();
    if (!graph) return; // se vuelve a intentar en placeVoices
    const { ctx, bus } = graph;
    const rooms = this.voiceRooms(ctx, bus);
    const el = new Audio();
    el.muted = true;
    el.srcObject = p.stream;
    void el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(p.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const direct = ctx.createGain();
    direct.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.5;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    // La distancia (o el largo del rodeo) la aplica el nivel de lo directo; el panner sólo coloca la voz.
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    const sendSmall = ctx.createGain();
    sendSmall.gain.value = 0;
    const sendLarge = ctx.createGain();
    sendLarge.gain.value = 0;
    const echoIn = ctx.createGain();
    echoIn.gain.value = 0;
    const echoDelay = ctx.createDelay(0.5);
    echoDelay.delayTime.value = 0.1;
    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = 0;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 2600;
    src.connect(analyser);
    src.connect(gain);
    gain.connect(direct).connect(filter).connect(panner).connect(bus);
    gain.connect(sendSmall).connect(rooms.small);
    gain.connect(sendLarge).connect(rooms.large);
    // El eco: entra, se retarda, pierde agudos, sale y vuelve a entrar (cada rebote más flojo).
    gain.connect(echoIn).connect(echoDelay).connect(echoFilter);
    echoFilter.connect(echoFeedback).connect(echoDelay);
    echoFilter.connect(bus);
    p.audio = { el, src, analyser, gain, direct, filter, panner, sendSmall, sendLarge, echoIn, echoDelay, echoFeedback, echoFilter };
  }

  private placeVoices(cam: readonly [number, number, number]): void {
    const graph = this.g.audio.voiceGraph();
    if (!graph) return;
    const now = performance.now();
    const t = graph.ctx.currentTime;
    const world = this.g.world;
    const get: BlockAt | null = world ? (x, y, z) => world.getBlock(x, y, z) : null;
    if (get && now >= this.nextListenerReverb) {
      this.nextListenerReverb = now + REVERB_MS;
      this.listenerRoom = roomProfile(get, cam[0], cam[1], cam[2]);
    }
    const listenerWet = get ? BLOCK_FLUID[get(Math.floor(cam[0]), Math.floor(cam[1]), Math.floor(cam[2]))] === 1 : false;
    for (const p of this.peers.values()) {
      if (!p.audio) this.buildAudio(p);
      const a = p.audio;
      const rp = this.g.remote.get(p.id);
      if (!a || !rp) continue;
      const v = rp.view;
      const hy = v.y + (v.sneaking ? 1.27 : 1.62);
      const d = Math.hypot(v.x - cam[0], hy - cam[1], v.z - cam[2]);
      const range = p.whisper ? WHISPER_RANGE : VOICE_RANGE;
      const grouped = this.group !== '' && p.group === this.group;
      const vol = this.playerVolume(rp.name);
      a.gain.gain.setTargetAtTime(vol, t, 0.05);
      const heard = get ? this.updateEnv(p, a, get, cam, v.x, hy, v.z, v.headYaw, d, range, listenerWet, now, t, grouped) : grouped || d < range;
      if (rms(a.analyser, this.buf) > TALK_RMS) p.talkUntil = now + TALK_HOLD;
      this.setTalking(rp, now < p.talkUntil && vol > 0 && heard, p.whisper);
    }
    for (const rp of this.g.remote.values()) if (!this.peers.has(rp.id)) this.setTalking(rp, false);
  }

  /**
   * El entorno de una voz: lo directo tras las paredes o el rodeo por el aire (lo que llegue más fuerte, y desde
   * donde llegue), hacia dónde habla, el aire, el agua, la sala y el eco. Devuelve si se oye.
   */
  private updateEnv(p: Peer, a: PeerAudio, get: BlockAt, cam: readonly [number, number, number],
    x: number, y: number, z: number, yaw: number, d: number, range: number, listenerWet: boolean, now: number, t: number, grouped: boolean): boolean {
    const env = p.env;
    const smooth = (target: [number, number, number]) => {
      const k = env.pos ? 0.25 : 1;
      env.pos ??= [target[0], target[1], target[2]];
      for (let i = 0; i < 3; i++) env.pos[i] += (target[i] - env.pos[i]) * k;
      a.panner.positionX.value = env.pos[0];
      a.panner.positionY.value = env.pos[1];
      a.panner.positionZ.value = env.pos[2];
    };
    if (grouped) {
      // En grupo la voz llega limpia (como por radio): sin paredes ni agua, desde quien habla, con poca sala.
      smooth([x, y, z]);
      a.direct.gain.setTargetAtTime(Math.max(GROUP_GAIN, voiceDistanceGain(d, range)), t, 0.1);
      a.filter.frequency.setTargetAtTime(20000, t, 0.12);
      a.sendSmall.gain.setTargetAtTime(0.03, t, 0.3);
      a.sendLarge.gain.setTargetAtTime(0, t, 0.3);
      a.echoIn.gain.setTargetAtTime(0, t, 0.3);
      return true;
    }
    if (now >= env.nextOcclusion) {
      // Repartidos en el tiempo para no calcular todas las voces en el mismo fotograma.
      env.nextOcclusion = now + OCCLUSION_MS * (0.8 + Math.random() * 0.4);
      const occ = voiceOcclusion(get, cam[0], cam[1], cam[2], x, y, z);
      env.gain = occ.gain;
      env.cutoff = occ.cutoff;
      env.speakerWet = BLOCK_FLUID[get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
    }
    if (now >= env.nextPath) {
      env.nextPath = now + PATH_MS * (0.8 + Math.random() * 0.4);
      // El rodeo por el aire (puertas, ventanas, pasillos), sólo si lo directo llega tapado.
      env.path = env.gain < PATH_WHEN_BELOW && d < range + 8 ? soundPath(get, cam[0], cam[1], cam[2], x, y, z, range + 16) : null;
    }
    if (now >= env.nextReverb) {
      env.nextReverb = now + REVERB_MS * (0.8 + Math.random() * 0.4);
      env.room = roomProfile(get, x, y, z);
    }
    // Lo directo (a través de lo que haya) frente al rodeo: se oye lo que llegue más fuerte, y desde ahí.
    const directLevel = voiceDistanceGain(d, range) * env.gain;
    let level = directLevel, cutoff = env.cutoff, carry = env.gain;
    let from: [number, number, number] = [x, y, z];
    if (env.path) {
      const excess = Math.max(0, env.path.length - d);
      const pathLevel = voiceDistanceGain(env.path.length, range) * Math.exp(-excess / 30) * 0.92;
      if (pathLevel > directLevel) {
        level = pathLevel;
        carry = Math.exp(-excess / 30) * 0.92;
        // Doblar una esquina le quita agudos (difracción): más cuanto más largo el rodeo.
        cutoff = Math.max(900, 18000 * Math.exp(-excess / 10));
        // Suena desde la abertura, a la distancia del camino.
        const ap = env.path.aperture;
        const ax = ap[0] - cam[0], ay = ap[1] - cam[1], az = ap[2] - cam[2];
        const al = Math.hypot(ax, ay, az) || 1;
        from = [cam[0] + (ax / al) * env.path.length, cam[1] + (ay / al) * env.path.length, cam[2] + (az / al) * env.path.length];
      }
    }
    smooth(from);
    // Hacia dónde habla: de frente se oye entera; de espaldas, más baja y apagada.
    const tx = cam[0] - x, tz = cam[2] - z;
    const tl = Math.hypot(tx, tz) || 1;
    const facing = (-Math.sin(yaw) * tx - Math.cos(yaw) * tz) / tl;
    const dir = voiceDirectivity(facing);
    level *= dir.gain;
    cutoff = Math.min(cutoff, dir.cutoff, airCutoff(d));
    // Quien habla bajo el agua suena ahogado desde fuera (si los dos están dentro, ya lo apaga el filtro general).
    if (env.speakerWet && !listenerWet) {
      level *= WATER_GAIN;
      cutoff = Math.min(cutoff, WATER_CUTOFF);
    }
    a.direct.gain.setTargetAtTime(level, t, 0.1);
    a.filter.frequency.setTargetAtTime(cutoff, t, 0.12);
    // La sala: sobre todo la de quien habla y algo la nuestra. La cola llega aunque haya una pared (más floja).
    const s = env.room, l = this.listenerRoom;
    const wet = 0.7 * roomWet(s) + 0.3 * roomWet(l);
    const size = 0.7 * s.size + 0.3 * l.size;
    const large = Math.max(0, Math.min(1, (size - 6) / 12));
    const reach = Math.sqrt(voiceDistanceGain(d * 0.85, range)) * Math.max(0.3, Math.sqrt(carry));
    a.sendSmall.gain.setTargetAtTime(wet * (1 - large) * reach, t, 0.3);
    a.sendLarge.gain.setTargetAtTime(wet * large * reach, t, 0.3);
    // El eco de los sitios grandes (con la distancia real hasta sus paredes).
    const echo = roomEcho(s);
    a.echoDelay.delayTime.setTargetAtTime(echo.delay, t, 0.5);
    a.echoFeedback.gain.setTargetAtTime(echo.feedback, t, 0.3);
    a.echoIn.gain.setTargetAtTime(echo.level * reach, t, 0.3);
    return level > 0.002;
  }

  private setTalking(rp: RemotePlayer, on: boolean, whisper = false): void {
    rp.talking = on;
    rp.whispering = on && whisper;
  }

  /** Volumen elegido para un jugador (0 silenciado, 1 normal, hasta 2). */
  playerVolume(name: string): number {
    const v = this.settings.voicePlayers[name.toLowerCase()];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
  }

  private setPlayerVolume(name: string, v: number): void {
    const key = name.toLowerCase();
    if (v === 1) delete this.settings.voicePlayers[key];
    else this.settings.voicePlayers[key] = Math.max(0, Math.min(2, v));
    this.g.ui.commitSettings();
  }

  /** Jugadores de la dimensión con la voz activada (para los ajustes y /voz). */
  voicePlayers(): string[] {
    return [...this.g.remote.values()].filter((r) => r.voice).map((r) => r.name);
  }

  /**
   * Comandos del chat de voz (los resuelve el propio cliente): /voz [on|off|silenciar|activar|volumen] y
   * /grupo [nombre|salir]. Devuelve false si el texto no es uno de ellos.
   */
  command(text: string): boolean {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    if (cmd !== '/voz' && cmd !== '/grupo') return false;
    const say = (m: string) => this.g.ui.addChat(null, m);
    const findName = (raw: string | undefined): string | null => {
      if (!raw) return null;
      const r = [...this.g.remote.values()].find((p) => p.name.toLowerCase() === raw.toLowerCase());
      return r ? r.name : raw;
    };
    if (cmd === '/grupo') {
      const arg = parts.slice(1).join(' ');
      if (!arg) {
        say(this.group ? `Estás en el grupo «${this.group}». /grupo salir para dejarlo.` : 'No estás en ningún grupo. Uso: /grupo <nombre> (los del mismo grupo os oís a cualquier distancia).');
      } else if (arg.toLowerCase() === 'salir') {
        say(this.group ? `Has dejado el grupo «${this.group}».` : 'No estabas en ningún grupo.');
        this.group = '';
      } else {
        const g = cleanGroup(arg);
        if (!g) say('Ese nombre de grupo no vale: usa letras, números, _ o -.');
        else {
          this.group = g;
          const mates = [...this.peers.values()].filter((p) => p.group === g).map((p) => this.g.remote.get(p.id)?.name).filter(Boolean);
          say(`Ahora estás en el grupo «${g}»${mates.length ? ` con ${mates.join(', ')}` : ''}. Os oís a cualquier distancia en esta dimensión.`);
        }
      }
      return true;
    }
    const sub = (parts[1] ?? '').toLowerCase();
    const s = this.settings;
    if (sub === 'on' || sub === 'off') {
      s.voiceEnabled = sub === 'on';
      this.g.ui.commitSettings();
      say(s.voiceEnabled ? 'Chat de voz activado.' : 'Chat de voz desactivado.');
    } else if (sub === 'silenciar' || sub === 'activar') {
      const name = findName(parts[2]);
      if (!name) say(`Uso: /voz ${sub} <jugador>`);
      else {
        this.setPlayerVolume(name, sub === 'silenciar' ? 0 : 1);
        say(sub === 'silenciar' ? `Ya no oyes a ${name}.` : `Vuelves a oír a ${name}.`);
      }
    } else if (sub === 'volumen') {
      const name = findName(parts[2]);
      const pct = Number(parts[3]);
      if (!name || !Number.isFinite(pct)) say('Uso: /voz volumen <jugador> <0-200>');
      else {
        this.setPlayerVolume(name, Math.round(Math.max(0, Math.min(200, pct))) / 100);
        say(`Voz de ${name} al ${Math.round(this.playerVolume(name) * 100)} %.`);
      }
    } else if (sub === '') {
      if (!this.active) say(this.g.offline ? 'El chat de voz sólo funciona en un mundo con servidor.' : 'El chat de voz está desactivado (/voz on).');
      else {
        const mode = s.voiceMode === 'vad' ? 'se abre al hablar' : `pulsa ${keyLabel(s.keys.voice)} para hablar`;
        const list = [...this.g.remote.values()].filter((r) => r.voice).map((r) => {
          const vol = this.playerVolume(r.name);
          const state = !this.connected(r.id) ? 'conectando' : vol === 0 ? 'silenciado' : `${Math.round(vol * 100)} %`;
          return `${r.name} (${state})`;
        });
        say(`Chat de voz: ${mode}, ${keyLabel(s.keys.whisper)} para susurrar${this.group ? `, grupo «${this.group}»` : ''}. ` +
          (list.length ? `Con voz: ${list.join(', ')}.` : 'Nadie más tiene la voz activada en esta dimensión.'));
      }
    } else say('Uso: /voz [on|off], /voz silenciar <jugador>, /voz activar <jugador>, /voz volumen <jugador> <0-200>');
    return true;
  }

  private closePeer(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.ondatachannel = null;
    if (p.dc) {
      p.dc.onopen = null;
      p.dc.onmessage = null;
    }
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    if (p.audio) {
      p.audio.src.disconnect();
      p.audio.gain.disconnect();
      p.audio.panner.disconnect();
      p.audio.sendSmall.disconnect();
      p.audio.sendLarge.disconnect();
      p.audio.echoFilter.disconnect();
      p.audio.echoFeedback.disconnect();
      p.audio.el.srcObject = null;
    }
    const rp = this.g.remote.get(id);
    if (rp) rp.talking = rp.whispering = false;
  }

  /** Conectados de verdad (para la lista de jugadores y la depuración). */
  connected(id: string): boolean {
    const s = this.peers.get(id)?.pc.connectionState;
    return s === 'connected';
  }

  /** Icono del micrófono en la pantalla: apagado, escuchando, hablando o sin permiso. */
  private renderHud(): void {
    if (!this.hud) {
      const hudRoot = document.getElementById('hud');
      if (!hudRoot) return;
      this.hud = document.createElement('div');
      this.hud.id = 'voice-hud';
      this.hud.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/><path class="slash" d="M4 4l16 16"/></svg><span></span>';
      hudRoot.appendChild(this.hud);
    }
    const st = !this.active ? 'off' : this.micState === 'denied' ? 'denied' : this.whispering ? 'whisper' : this.transmitting ? 'talking' : 'idle';
    const key = this.settings.keys.voice;
    const text = st === 'denied' ? 'Sin micrófono' : st === 'whisper' ? 'Susurro'
      : (st === 'idle' && this.settings.voiceMode === 'ptt' ? keyLabel(key) : '') + (this.group ? ` · ${this.group}` : '');
    if (this.hud.dataset.state !== st || this.hud.dataset.text !== text) {
      this.hud.dataset.state = st;
      this.hud.dataset.text = text;
      this.hud.querySelector('span')!.textContent = text.replace(/^ · /, '');
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
    this.held.clear();
    const net = this.g.net;
    if (this.announced && net) net.send({ t: 'voice', on: false });
    this.announced = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.releaseMic();
    this.hud?.remove();
    this.hud = null;
  }
}

/** ¿Se está escribiendo en un campo de texto? (chat, carteles, libros, buscador…): entonces las teclas no hablan. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
