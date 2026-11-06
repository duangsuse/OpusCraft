// AudioEngine: Web Audio playback of the procedural sound bank (src/audio/sounds.js), Minecraft-style
// positional attenuation, weather/underwater/cave ambience and generative background music (src/audio/music.js).
//
// Buffers are synthesised by pure JS (shared with tools/test_audio.mjs). Rendering happens in a module Worker
// (synth_worker.js); a sound requested before the worker delivered it is rendered synchronously on the main
// thread (short sounds take ~1-5 ms). Without Worker support everything is rendered in small idle slices.
import { SOUNDS, resolve, renderSound } from './sounds.js';
import { INSTRUMENTS, nearestSample, renderInstrumentNote, composePiece } from './music.js';
import { makeIR } from './dsp.js';

const CATS = ['master', 'music', 'blocks', 'hostile', 'neutral', 'player', 'ambient', 'weather', 'ui'];
const WORLD = ['blocks', 'hostile', 'neutral', 'player', 'ambient', 'weather'];
const HEADROOM = 0.75;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const rand = (a, b) => a + Math.random() * (b - a);
// sounds rendered first (most likely needed in the first seconds of play)
const PRIORITY = ['random.click', 'step.grass', 'step.stone', 'step.wood', 'step.gravel', 'step.sand', 'dig.grass', 'dig.stone',
  'dig.wood', 'dig.gravel', 'dig.sand', 'random.pop', 'damage.hit', 'step.cloth', 'step.snow', 'dig.snow', 'dig.cloth', 'dig.glass',
  'step.ladder', 'player.attack.weak', 'player.attack.strong', 'player.attack.sweep', 'random.eat', 'damage.fallsmall', 'ui.toast'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volumes = Object.fromEntries(CATS.map(c => [c, 1]));
    this.panningModel = 'HRTF';      // or 'equalpower'
    this.maxVoices = 72;
    this.musicDelay = [240, 600];    // seconds of silence between in-game pieces (vanilla: 10-20 min)
    this.menuDelay = [4, 25];
    this.autoThunder = true;         // distant rumbles during thunderstorms if the game does not call thunder()
    this._L = { x: 0, y: 0, z: 0, hx: 0, hz: -1 };
    this._bufs = new Map();          // src -> AudioBuffer[] (by variant)
    this._inst = { piano: {}, pad: {}, bell: {} };
    this._queue = []; this._queued = new Set(); this._inflight = new Map(); this._jobId = 0;
    this._worker = null; this._idleTimer = null;
    this._warned = new Set(); this._lastVar = new Map(); this._recent = new Map();
    this._voices = 0;
    this._rain = 0; this._thunderLvl = 0; this._covered = 0; this._underwater = false;
    this._cave = 0; this._caveMood = -Math.random() * 0.4; this._lastThunder = -1e9; this._pendingThunder = null;
    this._rainSrc = null; this._rainOffTime = 0; this._uwSrc = null;
    this._music = { kind: null, piece: null, idx: 0, t0: 0, gain: null, nodes: new Set(), timer: null, lastInMenu: null, nextShort: false, seed: (Math.random() * 1e9) | 0, info: {} };
  }

  // ------------------------------------------------------------------ setup
  resume() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume().catch(() => { }); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = new AC({ latencyHint: 'interactive' }); } catch (e) { c = new AC(); }
    this.ctx = c;
    if (c.state === 'suspended' && c.resume) c.resume().catch(() => { });
    // master chain: categories -> (world lowpass) -> master -> compressor -> out
    this.comp = c.createDynamicsCompressor();
    this._set(this.comp.threshold, -10); this._set(this.comp.knee, 8); this._set(this.comp.ratio, 6);
    this._set(this.comp.attack, 0.004); this._set(this.comp.release, 0.25);
    this.master = c.createGain(); this.master.gain.value = this.volumes.master * HEADROOM;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this._open = Math.min(22000, c.sampleRate * 0.49);
    this.worldLP = c.createBiquadFilter(); this.worldLP.type = 'lowpass'; this.worldLP.frequency.value = this._open; this.worldLP.Q.value = 0.5;
    this.worldLP.connect(this.master);
    this.cat = {};
    for (const k of CATS) {
      if (k === 'master') continue;
      const g = c.createGain(); g.gain.value = this.volumes[k];
      g.connect(WORLD.includes(k) ? this.worldLP : this.master); this.cat[k] = g;
    }
    // music bus: dry + convolution reverb
    this.musicIn = c.createGain(); this.musicIn.gain.value = 1;
    const dry = c.createGain(); dry.gain.value = 0.8; this.musicIn.connect(dry); dry.connect(this.cat.music);
    try {
      const ir = makeIR(3.2, { t60: 2.6 }, c.sampleRate), b = c.createBuffer(2, ir[0].length, c.sampleRate);
      b.copyToChannel(ir[0], 0); b.copyToChannel(ir[1], 1);
      this.reverb = c.createConvolver(); this.reverb.normalize = false; this.reverb.buffer = b;
      const wet = c.createGain(); wet.gain.value = 0.35; this.musicIn.connect(this.reverb); this.reverb.connect(wet); wet.connect(this.cat.music);
    } catch (e) { console.warn('[audio] reverb unavailable', e); }
    // rain chain
    this.rainLP = c.createBiquadFilter(); this.rainLP.type = 'lowpass'; this.rainLP.frequency.value = Math.min(18000, this._open); this.rainLP.Q.value = 0.6;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    this.rainLP.connect(this.rainGain); this.rainGain.connect(this.cat.weather);
    this.uwGain = c.createGain(); this.uwGain.gain.value = 0; this.uwGain.connect(this.cat.ambient);
    this._startWorker();
    this._prewarm();
    this._applyListener();
    this._updateRain();
  }
  _set(param, v) { if (param) param.value = v; }
  _ramp(param, v, tau = 0.05) {
    if (!param) return;
    const t = this.ctx.currentTime;
    if (param.cancelScheduledValues) param.cancelScheduledValues(t);
    if (param.setTargetAtTime) { param.setValueAtTime(param.value, t); param.setTargetAtTime(v, t, tau); } else param.value = v;
  }

  // ------------------------------------------------------------------ buffer bank / worker
  _startWorker() {
    if (typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./synth_worker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => this._onRendered(e.data);
      w.onerror = e => { console.warn('[audio] synth worker failed, using main thread', e && e.message); this._worker = null; this._requeueInflight(); this._pump(); };
      this._worker = w;
    } catch (e) { this._worker = null; }
  }
  _requeueInflight() { for (const job of this._inflight.values()) { this._queue.unshift(job); } this._inflight.clear(); }
  _key(job) { return job.kind === 'inst' ? `i:${job.inst}:${job.midi}` : `s:${job.name}#${job.v}`; }
  _request(job, urgent = false) {
    const k = this._key(job);
    if (this._queued.has(k)) {
      if (urgent) { const i = this._queue.findIndex(j => this._key(j) === k); if (i > 0) { const [j] = this._queue.splice(i, 1); this._queue.unshift(j); } }
      return;
    }
    if (job.kind === 'sound' && this._bufs.get(job.name)?.[job.v]) return;
    if (job.kind === 'inst' && this._inst[job.inst][job.midi]) return;
    this._queued.add(k);
    if (urgent) this._queue.unshift(job); else this._queue.push(job);
    this._pump();
  }
  _pump() {
    if (this._worker) {
      while (this._inflight.size < 2 && this._queue.length) {
        const job = this._queue.shift(); job.id = ++this._jobId; this._inflight.set(job.id, job);
        this._worker.postMessage(job);
      }
      return;
    }
    // main-thread fallback: render in small slices between frames
    if (this._idleTimer || !this._queue.length) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      const t0 = performance.now();
      while (this._queue.length && performance.now() - t0 < 8) {
        const job = this._queue.shift();
        try {
          const res = job.kind === 'inst' ? renderInstrumentNote(job.inst, job.midi) : renderSound(job.name, job.v);
          this._onRendered({ ...job, sr: res.sr, chans: res.chans });
        } catch (e) { this._onRendered({ ...job, error: String(e) }); }
      }
      this._pump();
    }, 16);
  }
  _onRendered(m) {
    if (m.id != null) this._inflight.delete(m.id);
    this._queued.delete(this._key(m));
    if (m.error) { console.warn('[audio] render failed', m.name || m.inst, m.error); this._pump(); return; }
    const buf = this._toBuffer(m);
    if (m.kind === 'inst') this._inst[m.inst][m.midi] = buf;
    else { const arr = this._arr(m.name); if (!arr[m.v]) arr[m.v] = buf; }
    this._pump();
  }
  _toBuffer({ sr, chans }) {
    const b = this.ctx.createBuffer(chans.length, chans[0].length, sr);
    chans.forEach((c, i) => b.copyToChannel ? b.copyToChannel(c, i) : b.getChannelData(i).set(c));
    return b;
  }
  _arr(src) { let a = this._bufs.get(src); if (!a) { a = new Array(SOUNDS[src].n); this._bufs.set(src, a); } return a; }
  _prewarm() {
    const seen = new Set(), list = [];
    const add = n => { if (!seen.has(n) && SOUNDS[n]) { seen.add(n); list.push(n); } };
    PRIORITY.forEach(add);
    for (const n in SOUNDS) if (!SOUNDS[n].heavy) add(n);
    for (const n of list) for (let v = 0; v < SOUNDS[n].n; v++) this._request({ kind: 'sound', name: n, v });
    for (const m of INSTRUMENTS.piano.notes) this._request({ kind: 'inst', inst: 'piano', midi: m });
    for (const n of ['ambient.weather.rain', 'ambient.weather.thunder', 'ambient.weather.thunder.far', 'ambient.underwater.loop', 'ambient.cave'])
      this._request({ kind: 'sound', name: n, v: 0 });
    for (const m of INSTRUMENTS.pad.notes) this._request({ kind: 'inst', inst: 'pad', midi: m });
    for (const m of INSTRUMENTS.bell.notes) this._request({ kind: 'inst', inst: 'bell', midi: m });
  }
  // pick a ready variant (avoid immediate repeats); synchronously render one if none is ready and the sound is light
  _pick(src, urgent = true) {
    const d = SOUNDS[src], arr = this._arr(src), ready = [];
    for (let v = 0; v < d.n; v++) if (arr[v]) ready.push(v);
    if (!ready.length) {
      if (d.heavy) { for (let v = 0; v < d.n; v++) this._request({ kind: 'sound', name: src, v }, urgent && v === 0); return null; }
      const v = (Math.random() * d.n) | 0, k = `s:${src}#${v}`;
      arr[v] = this._toBuffer(renderSound(src, v));
      if (this._queued.delete(k)) { const i = this._queue.findIndex(j => this._key(j) === k); if (i >= 0) this._queue.splice(i, 1); }
      for (let u = 0; u < d.n; u++) if (!arr[u]) this._request({ kind: 'sound', name: src, v: u }, urgent);
      this._lastVar.set(src, v); return arr[v];
    }
    for (let v = 0; v < d.n; v++) if (!arr[v]) this._request({ kind: 'sound', name: src, v });
    const last = this._lastVar.get(src);
    let v = ready[(Math.random() * ready.length) | 0];
    if (v === last && ready.length > 1) v = ready[(ready.indexOf(v) + 1 + ((Math.random() * (ready.length - 1)) | 0)) % ready.length];
    this._lastVar.set(src, v);
    return arr[v];
  }

  // ------------------------------------------------------------------ listener
  setListener(x, y, z, fx, fy, fz) {
    const L = this._L; L.x = x; L.y = y; L.z = z;
    const h = Math.hypot(fx, fz);
    if (h > 1e-3) { L.hx = fx / h; L.hz = fz / h; }   // keep orientation stable when looking straight up/down
    this._applyListener();
  }
  _applyListener() {
    if (!this.ctx) return;
    const l = this.ctx.listener, L = this._L;
    if (l.positionX) {
      l.positionX.value = L.x; l.positionY.value = L.y; l.positionZ.value = L.z;
      l.forwardX.value = L.hx; l.forwardY.value = 0; l.forwardZ.value = L.hz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else if (l.setPosition) { l.setPosition(L.x, L.y, L.z); l.setOrientation(L.hx, 0, L.hz, 0, 1, 0); }
  }

  // ------------------------------------------------------------------ playback
  /**
   * play(name, { x, y, z, volume=1, pitch=1, loop=false, category, delay }) -> handle | null
   * handle: { stop(fadeSec), setPosition(x,y,z), setVolume(v), setPitch(p), source }
   */
  play(name, opts = {}) {
    if (!this.ctx) return null;
    const res = resolve(name);
    if (!res) { if (!this._warned.has(name)) { this._warned.add(name); console.warn(`[audio] unknown sound "${name}"`); } return null; }
    const d = SOUNDS[res.src], c = this.ctx, vol = opts.volume ?? 1, catName = opts.category || d.cat;
    if (!(vol > 0)) return null;
    const positional = opts.x != null && opts.y != null && opts.z != null && catName !== 'ui';
    const range = 16 * Math.max(1, vol);
    if (positional) {
      const L = this._L, dist = Math.hypot(opts.x - L.x, opts.y - L.y, opts.z - L.z);
      if (dist > range) return null;
    }
    if (!opts.loop) {
      if (this._voices >= this.maxVoices) return null;
      const now = c.currentTime, rc = this._recent.get(res.src);
      if (rc && now - rc.t < 0.04) { if (++rc.n > 4) return null; } else this._recent.set(res.src, { t: now, n: 1 });
    }
    const buf = this._pick(res.src);
    if (!buf) return null;
    const when = c.currentTime + (opts.delay || 0);
    const src = c.createBufferSource(); src.buffer = buf; src.loop = !!opts.loop;
    const pv = d.pv * (opts.pitchVar ?? 1);
    src.playbackRate.value = clamp((opts.pitch ?? 1) * res.rate * (1 + (Math.random() - Math.random()) * pv), 0.05, 8);
    const g = c.createGain(), baseGain = d.gain * res.gain;
    g.gain.value = baseGain * Math.min(vol, 1);
    src.connect(g);
    let pan = null;
    if (positional) {
      pan = c.createPanner();
      pan.panningModel = this.panningModel; pan.distanceModel = 'linear';
      pan.refDistance = 0; pan.maxDistance = range; pan.rolloffFactor = 1;
      this._pos(pan, opts.x, opts.y, opts.z);
      g.connect(pan); pan.connect(this.cat[catName] || this.cat.blocks);
    } else g.connect(this.cat[catName] || this.cat.blocks);
    this._voices++;
    let ended = false;
    src.onended = () => {
      if (ended) return; ended = true; this._voices--;
      try { src.disconnect(); g.disconnect(); pan && pan.disconnect(); } catch (e) { }
    };
    src.start(when);
    const self = this;
    return {
      source: src,
      stop(fade = 0.05) {
        if (ended) return;
        const t = c.currentTime;
        try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(0, t, Math.max(0.005, fade / 4)); src.stop(t + fade + 0.02); } catch (e) { }
      },
      setPosition(x, y, z) { if (pan) self._pos(pan, x, y, z); },
      setVolume(v) { self._ramp(g.gain, baseGain * clamp(v, 0, 1), 0.05); },
      setPitch(p) { src.playbackRate.value = clamp(p * res.rate, 0.05, 8); },
      get playing() { return !ended; },
    };
  }
  _pos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }
  setVolume(category, v) {
    if (!(category in this.volumes)) return;
    v = clamp(+v || 0, 0, 1); this.volumes[category] = v;
    if (!this.ctx) return;
    if (category === 'master') this._ramp(this.master.gain, v * HEADROOM);
    else this._ramp(this.cat[category].gain, v);
  }

  // ------------------------------------------------------------------ weather / environment
  setWeather(rain, thunder = 0) { this._rain = clamp(+rain || 0, 0, 1); this._thunderLvl = clamp(+thunder || 0, 0, 1); this._updateRain(); }
  setCovered(v) { this._covered = clamp(+v || 0, 0, 1); this._updateRain(); }
  _updateRain() {
    if (!this.ctx) return;
    if (this._rain > 0.001 && !this._rainSrc) {
      const arr = this._arr('ambient.weather.rain');
      if (arr[0]) {
        const s = this.ctx.createBufferSource(); s.buffer = arr[0]; s.loop = true;
        s.connect(this.rainLP); s.start(); this._rainSrc = s;
      } else this._request({ kind: 'sound', name: 'ambient.weather.rain', v: 0 }, true);
    }
    const cov = this._covered, uw = this._underwater ? 1 : 0;
    const g = this._rain * SOUNDS['ambient.weather.rain'].gain * (1 + 0.25 * this._thunderLvl) * (1 - 0.55 * cov) * (uw ? 0.35 : 1);
    this._ramp(this.rainGain.gain, g, 0.4);
    this._ramp(this.rainLP.frequency, Math.min(18000, this._open) * Math.pow(650 / 18000, Math.max(cov, uw * 0.8)), 0.25);
  }
  thunder(distance = 100) {
    if (!this.ctx) return;
    this._lastThunder = this.ctx.currentTime;
    const d = Math.max(0, +distance || 0), name = d < 90 ? 'ambient.weather.thunder' : 'ambient.weather.thunder.far';
    const buf = this._pick(name);
    if (!buf) { this._pendingThunder = { d, t: this.ctx.currentTime }; return; }
    const c = this.ctx, when = c.currentTime + Math.min(d / 343, 2.5);
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rand(0.82, 1.0);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.value = clamp(16000 * Math.pow(0.5, d / 35), 220, Math.min(16000, this._open)) * (this._underwater ? 0.3 : 1);
    const g = c.createGain(); g.gain.value = SOUNDS[name].gain * clamp(1.15 - d / 350, 0.3, 1) * (1 - 0.35 * this._covered);
    src.connect(lp); lp.connect(g);
    let out = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rand(-0.5, 0.5); g.connect(p); out = p; }
    out.connect(this.cat.weather);
    this._voices++;
    src.onended = () => { this._voices--; try { src.disconnect(); lp.disconnect(); g.disconnect(); out.disconnect(); } catch (e) { } };
    src.start(when);
  }
  setUnderwater(b) {
    b = !!b; if (b === this._underwater) return; this._underwater = b;
    if (!this.ctx) return;
    this._ramp(this.worldLP.frequency, b ? 700 : this._open, 0.06);
    this._ramp(this.worldLP.Q, b ? 0.9 : 0.5, 0.06);
    if (b) {
      this.play('ambient.underwater.enter', { volume: 0.8 });
      this._startUnderwaterLoop();
    }
    this._ramp(this.uwGain.gain, b ? SOUNDS['ambient.underwater.loop'].gain : 0, b ? 0.4 : 0.15);
    this._updateRain();
  }
  _startUnderwaterLoop() {
    if (this._uwSrc) return;
    const arr = this._arr('ambient.underwater.loop');
    if (!arr[0]) { this._request({ kind: 'sound', name: 'ambient.underwater.loop', v: 0 }, true); return; }
    const s = this.ctx.createBufferSource(); s.buffer = arr[0]; s.loop = true; s.connect(this.uwGain); s.start(); this._uwSrc = s;
  }
  setCaveFactor(v) { this._cave = clamp(+v || 0, 0, 1); }

  // ------------------------------------------------------------------ per-frame update
  update(dt, info = {}) {
    if (!this.ctx) return;
    dt = clamp(+dt || 0, 0, 0.5);
    const now = this.ctx.currentTime;
    this._musicUpdate(dt, info);
    // cave "mood": accumulates in dark enclosed places, plays an eerie sound every few minutes
    if (this._cave > 0.5) this._caveMood += dt * (this._cave - 0.5) * 2 / 150;
    else this._caveMood = Math.max(-0.3, this._caveMood - dt / 400);
    if (this._caveMood >= 1 && !this._underwater) {
      const a = Math.random() * Math.PI * 2, r = rand(6, 13), L = this._L;
      if (this.play('ambient.cave', { x: L.x + Math.cos(a) * r, y: L.y + rand(-3, 3), z: L.z + Math.sin(a) * r, volume: 1 })) this._caveMood = -Math.random() * 0.6;
    }
    // weather upkeep
    if (this._rain > 0.001 && !this._rainSrc) this._updateRain();
    if (this._rain <= 0.001 && this._rainSrc) {
      if (!this._rainOffTime) this._rainOffTime = now;
      else if (now - this._rainOffTime > 4) { try { this._rainSrc.stop(); this._rainSrc.disconnect(); } catch (e) { } this._rainSrc = null; this._rainOffTime = 0; }
    } else this._rainOffTime = 0;
    if (this._underwater && !this._uwSrc) this._startUnderwaterLoop();
    if (this._pendingThunder) { const p = this._pendingThunder; if (now - p.t > 4) this._pendingThunder = null; else if (this._arr(p.d < 90 ? 'ambient.weather.thunder' : 'ambient.weather.thunder.far').some(Boolean)) { this._pendingThunder = null; this.thunder(p.d); } }
    if (this.autoThunder && this._thunderLvl > 0.3 && this._rain > 0.2 && now - this._lastThunder > 50) {
      if (Math.random() < dt / 25) this.thunder(rand(140, 450));
    }
  }

  // ------------------------------------------------------------------ music
  _instReady(inst) { return INSTRUMENTS[inst].notes.every(m => this._inst[inst][m]); }
  playMusic(kind = 'game') {
    if (!this.ctx) return;
    this._music.timer = null;
    this._startPiece(kind === 'menu' ? 'menu' : 'game', false, true);
  }
  stopMusic(fade = 3) {
    const m = this._music;
    this._fadeOutMusic(fade);
    m.timer = m.lastInMenu ? rand(...this.menuDelay) : rand(...this.musicDelay);
  }
  _startPiece(kind, short, force = false) {
    const m = this._music;
    if (!this._instReady('piano') || !this._instReady('pad')) {
      for (const inst of ['piano', 'pad']) for (const n of INSTRUMENTS[inst].notes) this._request({ kind: 'inst', inst, midi: n }, true);
      m.pendingForce = force ? kind : null; m.timer = 1; return false;
    }
    if (m.piece) this._fadeOutMusic(2);
    const info = m.info || {}, t = info.time ?? 6000;
    const night = t > 13000 && t < 23000;
    m.seed = (m.seed * 1103515245 + 12345) >>> 0;
    m.piece = composePiece(m.seed, { kind, short, night, biome: info.biome });
    m.kind = kind; m.idx = 0; m.t0 = this.ctx.currentTime + 0.15; m.nextShort = false;
    m.gain = this.ctx.createGain(); m.gain.gain.value = 1; m.gain.connect(this.musicIn);
    m.nodes = new Set();
    return true;
  }
  _fadeOutMusic(sec) {
    const m = this._music; if (!m.piece || !this.ctx) { m.piece = null; return; }
    const g = m.gain, nodes = m.nodes, t = this.ctx.currentTime;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(0, t, Math.max(0.05, sec / 4)); } catch (e) { }
    setTimeout(() => { for (const s of nodes) { try { s.stop(); } catch (e) { } } nodes.clear(); try { g.disconnect(); } catch (e) { } }, sec * 1000 + 200);
    m.piece = null;
  }
  _musicUpdate(dt, info) {
    const m = this._music, inMenu = !!info.inMenu;
    m.info = info;
    if (m.lastInMenu === null || inMenu !== m.lastInMenu) {
      if (m.piece && m.kind !== (inMenu ? 'menu' : 'game')) this._fadeOutMusic(3);
      m.timer = inMenu ? rand(1, 8) : rand(20, 60);       // first track shortly after entering a world
      m.nextShort = !inMenu;
      m.lastInMenu = inMenu;
    }
    if (m.piece) {
      this._scheduleNotes();
      if (this.ctx.currentTime > m.t0 + m.piece.duration) {
        m.piece = null; try { m.gain.disconnect(); } catch (e) { }
        m.timer = inMenu ? rand(...this.menuDelay) : rand(...this.musicDelay);
      }
    } else if (m.timer != null) {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.timer = null;
        const kind = m.pendingForce || (inMenu ? 'menu' : 'game');
        if (this._startPiece(kind, kind === 'game' && m.nextShort)) m.pendingForce = null;
      }
    }
  }
  _scheduleNotes() {
    const m = this._music, c = this.ctx, now = c.currentTime, ev = m.piece.events;
    while (m.idx < ev.length && m.t0 + ev[m.idx].t < now + 0.8) {
      const e = ev[m.idx++], when = m.t0 + e.t;
      if (when < now - 0.05) continue;                  // fell behind (tab hidden): skip rather than burst
      this._playNote(e, Math.max(when, now), m);
    }
  }
  _playNote(e, when, m) {
    const c = this.ctx, I = INSTRUMENTS[e.inst], sm = nearestSample(e.inst, e.midi), buf = this._inst[e.inst][sm];
    if (!buf) return;
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = Math.pow(2, (e.midi - sm) / 12);
    const g = c.createGain(), lvl = I.gain * e.vel;
    g.gain.setValueAtTime(lvl, when); g.gain.setTargetAtTime(0, when + e.dur, I.release);
    src.connect(g);
    let out = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(e.pan || 0, -1, 1); g.connect(p); out = p; }
    out.connect(m.gain);
    src.start(when);
    const bufDur = buf.duration / src.playbackRate.value;
    src.stop(when + Math.min(bufDur, e.dur + I.release * 7));
    m.nodes.add(src);
    src.onended = () => { m.nodes.delete(src); try { src.disconnect(); g.disconnect(); out.disconnect(); } catch (err) { } };
  }
  get musicInfo() { const m = this._music; return m.piece ? { kind: m.kind, ...m.piece.info, elapsed: this.ctx.currentTime - m.t0, duration: m.piece.duration } : { idle: true, nextIn: m.timer }; }
}
