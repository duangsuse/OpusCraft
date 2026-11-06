// Offline test/preview for the procedural audio: renders every sound variant to /tmp/audio/*.wav, prints stats,
// checks for NaNs / clipping / lengths, renders spectrogram sheets (PNG) and a few generated music pieces,
// and smoke-tests AudioEngine against a mock Web Audio implementation.
//   node tools/test_audio.mjs            (all)
//   node tools/test_audio.mjs sounds     (only sound bank)   | music | engine | spec <name...>
import fs from 'node:fs';
import { writePNG } from './png.mjs';
import { SOUNDS, SOUND_NAMES, ALIASES, resolve, renderSound } from '../src/audio/sounds.js';
import { INSTRUMENTS, renderInstrumentNote, composePiece, mixPiece } from '../src/audio/music.js';
import { fft, makeIR, convolve, SR } from '../src/audio/dsp.js';

const OUT = '/tmp/audio';
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2), mode = args[0] || 'all';
let failures = 0;
const fail = msg => { failures++; console.log('  FAIL: ' + msg); };

export function writeWav(file, chans, sr) {
  const n = chans[0].length, nc = chans.length, buf = Buffer.alloc(44 + n * nc * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nc * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nc, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * nc * 2, 28); buf.writeUInt16LE(nc * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * nc * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * nc + c) * 2);
  fs.writeFileSync(file, buf);
}
const db = x => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

// ------------------------------------------------------------------ spectrogram
function colormap(v) { // 0..1 -> inferno-ish
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const x = Math.max(0, Math.min(1, v)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((c, k) => c + (stops[i + 1][k] - c) * f);
}
// returns {w,h,data} panel: waveform envelope (top 40px) + log-frequency spectrogram (H rows)
function specPanel(x, sr, hop = 128, H = 160, fftN = 1024, maxW = 1400) {
  const frames = Math.min(maxW, Math.max(1, Math.floor((x.length) / hop)));
  const WH = 40, h = H + WH + 2, w = frames, data = new Uint8ClampedArray(w * h * 4);
  const win = new Float64Array(fftN).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / fftN));
  const mags = [];
  let gmax = 1e-12;
  const fLo = 40, fHi = sr / 2;
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(fftN), im = new Float64Array(fftN), s = f * hop - fftN / 2;
    for (let i = 0; i < fftN; i++) { const k = s + i; re[i] = (k >= 0 && k < x.length ? x[k] : 0) * win[i]; }
    fft(re, im);
    const col = new Float64Array(H);
    for (let y = 0; y < H; y++) {
      const fa = fLo * Math.pow(fHi / fLo, y / H), fb = fLo * Math.pow(fHi / fLo, (y + 1) / H);
      const ba = Math.floor(fa / sr * fftN), bb = Math.max(ba + 1, Math.ceil(fb / sr * fftN));
      let m = 0; for (let b = ba; b < bb && b < fftN / 2; b++) m = Math.max(m, re[b] * re[b] + im[b] * im[b]);
      col[y] = m; if (m > gmax) gmax = m;
    }
    mags.push(col);
  }
  for (let f = 0; f < frames; f++) {
    // waveform (peak per hop)
    let pk = 0; for (let i = f * hop; i < (f + 1) * hop && i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
    const ph = Math.round(pk * (WH - 2));
    for (let y = 0; y < WH; y++) {
      const on = Math.abs(y - WH / 2) <= ph / 2, di = (y * w + f) * 4;
      const c = pk > 0.99 ? [255, 60, 60] : [120, 200, 255];
      data.set(on ? [...c, 255] : [20, 20, 28, 255], di);
    }
    for (let y = 0; y < H; y++) {
      const v = 10 * Math.log10(mags[f][y] / gmax + 1e-12), t = (v + 60) / 60; // 60 dB range
      const [r, g, b] = colormap(t), di = ((WH + 2 + (H - 1 - y)) * w + f) * 4;
      data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = 255;
    }
  }
  // frequency guide marks every octave from 100 Hz at left edge (white ticks)
  for (let fq = 100; fq < fHi; fq *= 2) {
    const y = Math.round(Math.log(fq / fLo) / Math.log(fHi / fLo) * H); if (y < 0 || y >= H) continue;
    for (let xx = 0; xx < Math.min(6, w); xx++) data.set([255, 255, 255, 255], ((WH + 2 + (H - 1 - y)) * w + xx) * 4);
  }
  // time marks every 100 ms on waveform strip bottom
  for (let ms = 100; ms * sr / 1000 / hop < w; ms += 100) { const xx = Math.round(ms * sr / 1000 / hop); for (let y = WH - 4; y < WH; y++) data.set([255, 255, 0, 255], (y * w + xx) * 4); }
  return { w, h, data };
}
function stack(panels, pad = 4, bg = [50, 50, 60, 255], cols = 1) {
  const cw = Math.max(...panels.map(p => p.w)) + pad, rows = Math.ceil(panels.length / cols);
  const rh = []; for (let r = 0; r < rows; r++) rh.push(Math.max(...panels.slice(r * cols, r * cols + cols).map(p => p.h)) + pad);
  const W = cols * cw + pad, H = rh.reduce((a, b) => a + b, pad);
  const data = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) data.set(bg, i * 4);
  let oy = pad;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = panels[r * cols + c]; if (!p) continue; const ox = pad + c * cw;
      for (let y = 0; y < p.h; y++) data.set(p.data.subarray(y * p.w * 4, (y + 1) * p.w * 4), ((oy + y) * W + ox) * 4);
    }
    oy += rh[r];
  }
  return { w: W, h: H, data };
}
function specSheet(file, names, hop = 96, cols = 3) {
  const panels = [];
  for (const nm of names) { const [n, v] = nm.split('#'); const res = resolve(n); const { chans, sr } = renderSound(res.src, +(v || 0)); panels.push(specPanel(chans[0], sr, hop, 200)); }
  const s = stack(panels, 6, [50, 50, 60, 255], cols); writePNG(file, s.w, s.h, s.data, 1);
  console.log(`wrote ${file}: ${names.join(', ')}`);
}

// ------------------------------------------------------------------ sound bank test
function testSounds() {
  const REQUIRED = `dig.stone dig.wood dig.gravel dig.grass dig.sand dig.snow dig.cloth dig.glass dig.metal step.stone step.wood step.gravel
  step.grass step.sand step.snow step.cloth step.metal step.ladder hit.stone hit.wood hit.gravel hit.grass hit.sand hit.snow hit.cloth hit.glass
  hit.metal place.stone place.wood place.gravel place.grass place.sand place.snow place.cloth place.glass place.metal random.pop random.click
  random.break random.eat random.burp random.drink random.explode random.fuse random.splash random.swim random.levelup random.orb
  random.door_open random.door_close random.bow random.bowhit random.fizz random.chestopen random.chestclosed random.glass fire.ignite fire.fire
  liquid.water liquid.lava liquid.lavapop damage.hit damage.fallsmall damage.fallbig player.attack.sweep player.attack.strong player.attack.weak
  mob.pig.say mob.pig.death mob.cow.say mob.cow.hurt mob.sheep.say mob.chicken.say mob.chicken.hurt mob.chicken.plop mob.zombie.say
  mob.zombie.hurt mob.zombie.death mob.zombie.step mob.skeleton.say mob.skeleton.hurt mob.skeleton.death mob.skeleton.step mob.creeper.say
  mob.creeper.death mob.spider.say mob.spider.death mob.spider.step minecart.base minecart.inside boat.paddle_water boat.paddle_land
  entity.boat.splash ambient.cave ambient.weather.thunder ui.toast`.split(/\s+/).filter(Boolean);
  for (const n of REQUIRED) if (!resolve(n)) fail('missing required sound ' + n);
  for (const [k, a] of Object.entries(ALIASES)) if (!SOUNDS[a[0]]) fail(`alias ${k} -> ${a[0]} missing`);
  console.log(`${SOUND_NAMES.length} sounds, ${Object.keys(ALIASES).length} aliases, ${REQUIRED.length} required names OK`);
  console.log('name'.padEnd(30) + 'var  dur(s)  peak   rms(dB) crest  ms');
  let total = 0, totalMs = 0;
  for (const name of SOUND_NAMES) {
    const d = SOUNDS[name];
    for (let v = 0; v < d.n; v++) {
      const t0 = performance.now(); const { chans, sr } = renderSound(name, v); const ms = performance.now() - t0; totalMs += ms;
      const x = chans[0]; let pk = 0, ss = 0, nan = 0;
      for (const c of chans) for (let i = 0; i < c.length; i++) { const a = c[i]; if (!Number.isFinite(a)) nan++; else { pk = Math.max(pk, Math.abs(a)); ss += a * a; } }
      const dur = x.length / sr, rms = Math.sqrt(ss / (x.length * chans.length));
      let dc = 0; for (let i = 0; i < x.length; i++) dc += x[i]; dc /= x.length;
      console.log(`${name.padEnd(30)}${String(v).padEnd(5)}${dur.toFixed(3).padEnd(8)}${pk.toFixed(3).padEnd(7)}${db(rms).padEnd(8)}${(pk / Math.max(rms, 1e-9)).toFixed(1).padEnd(6)}${ms.toFixed(0)}`);
      if (nan) fail(`${name}#${v}: ${nan} non-finite samples`);
      if (pk >= 1) fail(`${name}#${v}: clipping peak ${pk}`);
      if (pk < 0.1) fail(`${name}#${v}: too quiet (peak ${pk})`);
      if (d.len && (dur < d.len[0] - 1e-3 || dur > d.len[1] + 1e-3)) fail(`${name}#${v}: duration ${dur.toFixed(3)} outside [${d.len}]`);
      if (Math.abs(dc) > 0.02) fail(`${name}#${v}: DC offset ${dc.toFixed(4)}`);
      if (d.loop) { // seam check: jump between last and first sample should be small relative to typical sample diffs
        let md = 0; for (let i = 1; i < x.length; i++) md += Math.abs(x[i] - x[i - 1]); md /= x.length;
        const seam = Math.abs(x[0] - x[x.length - 1]); if (seam > md * 8 + 0.02) fail(`${name}: loop seam jump ${seam.toFixed(4)} (avg step ${md.toFixed(4)})`);
      }
      writeWav(`${OUT}/${name}_${v}.wav`, chans, sr);
      total++;
    }
  }
  console.log(`rendered ${total} buffers in ${totalMs.toFixed(0)} ms -> ${OUT}`);
}
function specAll() {
  specSheet(`${OUT}/spec_blocks_dig.png`, ['dig.stone', 'dig.wood', 'dig.gravel', 'dig.grass', 'dig.sand', 'dig.snow', 'dig.cloth', 'dig.glass', 'dig.metal']);
  specSheet(`${OUT}/spec_blocks_step.png`, ['step.stone', 'step.wood', 'step.gravel', 'step.grass', 'step.sand', 'step.snow', 'step.cloth', 'step.metal', 'step.ladder']);
  specSheet(`${OUT}/spec_player.png`, ['random.pop', 'random.click', 'random.break', 'random.eat', 'random.burp', 'random.drink', 'damage.hit', 'damage.fallsmall', 'damage.fallbig', 'random.orb', 'random.levelup']);
  specSheet(`${OUT}/spec_mobs1.png`, ['mob.pig.say', 'mob.pig.death', 'mob.cow.say', 'mob.cow.hurt', 'mob.sheep.say', 'mob.chicken.say', 'mob.chicken.hurt', 'mob.chicken.plop']);
  specSheet(`${OUT}/spec_mobs2.png`, ['mob.zombie.say', 'mob.zombie.hurt', 'mob.zombie.death', 'mob.zombie.step', 'mob.skeleton.say', 'mob.skeleton.hurt', 'mob.skeleton.step', 'mob.creeper.say', 'mob.creeper.death', 'mob.spider.say', 'mob.spider.death', 'mob.spider.step']);
  specSheet(`${OUT}/spec_misc.png`, ['random.door_open', 'random.door_close', 'random.chestopen', 'random.chestclosed', 'random.bow', 'random.bowhit', 'random.fizz', 'fire.ignite', 'random.splash', 'random.swim', 'liquid.lavapop', 'player.attack.sweep', 'player.attack.strong', 'ui.toast']);
  specSheet(`${OUT}/spec_long.png`, ['random.explode', 'random.fuse', 'fire.fire', 'liquid.water', 'liquid.lava', 'minecart.base', 'minecart.inside', 'ambient.weather.rain', 'ambient.underwater.loop'], 512, 2);
  specSheet(`${OUT}/spec_amb.png`, ['ambient.weather.thunder', 'ambient.weather.thunder.far', 'ambient.cave'], 1024, 1);
  const cav = []; for (let v = 0; v < 5; v++) cav.push(specPanel(renderSound('ambient.cave', v).chans[0], SR, 1024, 160));
  const s = stack(cav, 6, undefined, 2); writePNG(`${OUT}/spec_cave.png`, s.w, s.h, s.data, 1); console.log('wrote spec_cave.png');
}

// ------------------------------------------------------------------ music
function testMusic() {
  const t0 = performance.now(), samples = {};
  for (const inst in INSTRUMENTS) {
    samples[inst] = {};
    for (const m of INSTRUMENTS[inst].notes) {
      const t1 = performance.now(), { chans, sr } = renderInstrumentNote(inst, m);
      const x = chans[0]; let pk = 0, nan = 0; for (const a of x) { if (!Number.isFinite(a)) nan++; else pk = Math.max(pk, Math.abs(a)); }
      if (nan) fail(`${inst} ${m} NaN`); if (pk >= 1) fail(`${inst} ${m} clip`);
      samples[inst][m] = x;
      console.log(`  ${inst} midi ${m}: ${(x.length / sr).toFixed(2)} s peak ${pk.toFixed(2)} ${(performance.now() - t1).toFixed(0)} ms`);
      if (m === 60 || m === 59 || m === 79) writeWav(`${OUT}/inst_${inst}_${m}.wav`, [x], sr);
    }
  }
  console.log(`instrument bank rendered in ${(performance.now() - t0).toFixed(0)} ms`);
  const IR = makeIR(3.2, { t60: 2.6 }, SR);
  const cases = [
    ['game_short', 101, { kind: 'game', short: true }], ['game_a', 202, { kind: 'game' }], ['game_b', 303, { kind: 'game' }],
    ['game_night', 404, { kind: 'game', night: true }], ['menu', 505, { kind: 'menu' }],
  ];
  const panels = [];
  for (const [label, seed, o] of cases) {
    const piece = composePiece(seed, o);
    const [L, R] = mixPiece(piece, samples, SR);
    // reverb send (same as engine: dry + wet convolver)
    const wl = convolve(L, IR[0]), wr = convolve(R, IR[1]);
    const n = wl.length, oL = new Float32Array(n), oR = new Float32Array(n);
    for (let i = 0; i < n; i++) { oL[i] = (i < L.length ? L[i] : 0) * 0.8 + wl[i] * 0.35; oR[i] = (i < R.length ? R[i] : 0) * 0.8 + wr[i] * 0.35; }
    let pk = 0, ss = 0; for (let i = 0; i < n; i++) { pk = Math.max(pk, Math.abs(oL[i]), Math.abs(oR[i])); ss += oL[i] * oL[i]; }
    console.log(`music ${label}: ${piece.duration.toFixed(1)} s, ${piece.events.length} notes, peak ${pk.toFixed(2)}, rms ${db(Math.sqrt(ss / n))} dB, ${JSON.stringify(piece.info)}`);
    if (pk > 1) fail(`music ${label} clipping ${pk}`);
    if (o.short && (piece.duration < 35 || piece.duration > 100)) fail(`short piece length ${piece.duration}`);
    writeWav(`${OUT}/music_${label}.wav`, [oL, oR], SR);
    if (panels.length < 3) panels.push(pianoRoll(piece));
  }
  const s = stack(panels); writePNG(`${OUT}/music_roll.png`, s.w, s.h, s.data, 1); console.log('wrote music_roll.png');
  const sp = stack(['piano', 'pad', 'bell'].map(i => specPanel(samples[i][INSTRUMENTS[i].notes[2]], INSTRUMENTS[i].sr, 256))); writePNG(`${OUT}/spec_inst.png`, sp.w, sp.h, sp.data, 1);
}
function pianoRoll(piece) {
  const pxs = 8, w = Math.ceil(piece.duration * pxs), lo = 30, hi = 100, h = (hi - lo) * 3;
  const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) data.set([16, 16, 24, 255], i * 4);
  const col = { piano: [240, 200, 120], pad: [90, 140, 255], bell: [140, 255, 160] };
  for (const e of piece.events) {
    const y = h - (e.midi - lo) * 3 - 3; if (y < 0 || y >= h) continue;
    const x0 = Math.floor(e.t * pxs), x1 = Math.min(w, Math.ceil((e.t + Math.min(e.dur, 4)) * pxs));
    for (let x = x0; x < x1; x++) for (let yy = y; yy < y + 2; yy++) { const a = x === x0 ? 1 : 0.35 + 0.65 * e.vel; data.set([...col[e.inst].map(c => c * a), 255], (yy * w + x) * 4); }
  }
  return { w, h, data };
}

// ------------------------------------------------------------------ engine smoke test with mock Web Audio
async function testEngine() {
  const log = { nodes: 0, started: 0, warns: [] };
  class Param { constructor(v = 0) { this.value = v; } setValueAtTime(v) { this.value = v; return this; } linearRampToValueAtTime(v) { this.value = v; return this; } exponentialRampToValueAtTime(v) { this.value = v; return this; } setTargetAtTime(v) { this.value = v; return this; } cancelScheduledValues() { return this; } cancelAndHoldAtTime() { return this; } }
  class Node { constructor(ctx) { this.context = ctx; log.nodes++; this.outs = []; } connect(n) { if (!n) throw new Error('connect to undefined'); this.outs.push(n); return n; } disconnect() { this.outs = []; } }
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Node(this); this.listener = { positionX: new Param(), positionY: new Param(), positionZ: new Param(), forwardX: new Param(), forwardY: new Param(), forwardZ: new Param(-1), upX: new Param(), upY: new Param(1), upZ: new Param() }; }
    resume() { return Promise.resolve(); }
    createGain() { const n = new Node(this); n.gain = new Param(1); return n; }
    createBiquadFilter() { const n = new Node(this); n.frequency = new Param(350); n.Q = new Param(1); n.gain = new Param(0); n.type = 'lowpass'; return n; }
    createDynamicsCompressor() { const n = new Node(this); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(); return n; }
    createConvolver() { const n = new Node(this); n.buffer = null; return n; }
    createStereoPanner() { const n = new Node(this); n.pan = new Param(); return n; }
    createPanner() { const n = new Node(this); for (const k of ['positionX', 'positionY', 'positionZ', 'orientationX', 'orientationY', 'orientationZ']) n[k] = new Param(); return n; }
    createBuffer(nc, len, sr) { if (len < 1) throw new Error('empty buffer'); const ch = Array.from({ length: nc }, () => new Float32Array(len)); return { numberOfChannels: nc, length: len, sampleRate: sr, duration: len / sr, copyToChannel(d, c) { ch[c].set(d); }, getChannelData(c) { return ch[c]; } }; }
    createBufferSource() {
      const n = new Node(this); n.playbackRate = new Param(1); n.loop = false; n.buffer = null;
      n.start = (when = 0) => { if (!n.buffer) throw new Error('start without buffer'); log.started++; const d = n.buffer.duration / n.playbackRate.value; setTimeout(() => n.onended && n.onended(), 1); };
      n.stop = () => { }; return n;
    }
  }
  globalThis.AudioContext = Ctx;
  globalThis.window = globalThis;
  const origWarn = console.warn; console.warn = (...a) => log.warns.push(a.join(' '));
  const { AudioEngine } = await import('../src/audio/audio.js');
  const eng = new AudioEngine();
  eng.play('dig.stone'); // before resume: must be a no-op
  const tr = performance.now(); eng.resume(); const resumeMs = performance.now() - tr;
  console.log(`  resume() took ${resumeMs.toFixed(1)} ms`); if (resumeMs > 300) fail('resume() too slow');
  const ctx = eng.ctx;
  eng.setListener(0, 64, 0, 0, 0, -1);
  for (const v of ['master', 'music', 'blocks', 'hostile', 'neutral', 'player', 'ambient', 'weather', 'ui']) eng.setVolume(v, 0.8);
  const names = [...SOUND_NAMES, ...Object.keys(ALIASES)];
  const t0 = performance.now(); eng.maxVoices = 10000;
  const nulls = [];
  for (const n of names) { const h = eng.play(n, { x: 3, y: 64, z: -2, volume: 1, pitch: 1 }); if (!h) nulls.push(n); }
  const heavyNull = nulls.filter(n => SOUNDS[resolve(n).src].heavy), lightNull = nulls.filter(n => !SOUNDS[resolve(n).src].heavy);
  if (lightNull.length) fail('play() returned null for ' + lightNull.join(','));
  console.log('  heavy sounds not yet rendered on first call (async):', heavyNull.join(', '));
  eng.maxVoices = 72;
  console.log(`engine: played ${names.length} names (sync render path) in ${(performance.now() - t0).toFixed(0)} ms, sources started ${log.started}`);
  eng.play('no.such.sound'); eng.play('no.such.sound');
  if (log.warns.filter(w => w.includes('no.such.sound')).length !== 1) fail('unknown sound should warn exactly once');
  const far = log.started; eng.play('dig.stone', { x: 100, y: 64, z: 0 }); if (log.started !== far) fail('sound beyond 16 blocks should be culled');
  eng.setWeather(1, 0.5); eng.setCovered(0.7); eng.thunder(10); eng.thunder(200); eng.setUnderwater(true); eng.setUnderwater(false); eng.setCaveFactor(1);
  const h = eng.play('minecart.base', { x: 1, y: 64, z: 1, loop: true }); if (!h || !h.stop) fail('loop handle'); else { h.setPosition(2, 64, 2); h.stop(0.2); }
  // simulate: menu for 40 s, then game for 120 s at 20 fps
  let started = null;
  const step = async (sec, inMenu) => {
    for (let i = 0; i < sec * 20; i++) {
      ctx.currentTime += 0.05; eng.update(0.05, { time: 6000, inMenu, biome: 'plains' });
      if (eng._music && eng._music.piece && !started) started = { at: ctx.currentTime, kind: eng._music.kind, short: eng._music.piece.info.short, dur: eng._music.piece.duration.toFixed(0) };
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 20)); // let the idle-slice renderer progress
    }
  };
  await step(40, true);
  console.log('  menu music started:', started);
  if (!started || started.kind !== 'menu') fail('menu music did not start within 40 s');
  started = null; const tg = ctx.currentTime;
  await step(5, false); started = null; await step(115, false);
  console.log('  game music started:', started && { after: (started.at - tg).toFixed(1), kind: started.kind, short: started.short, dur: started.dur });
  if (started && !started.short) fail('first in-world piece should be short');
  if (!started || started.kind !== 'game') fail('game music did not start within 120 s of entering world');
  else if (started.at - tg < 19 || started.at - tg > 65) fail('first game track start time out of 20..60 s');
  eng.stopMusic(); eng.playMusic('game'); await step(3, false);
  if (!eng._music.piece) fail('playMusic did not start a piece');
  console.log('  musicInfo:', JSON.stringify(eng.musicInfo));
  console.log(`  pending render jobs: ${eng._queue.length}, buffers ready: ${[...eng._bufs.values()].reduce((s, a) => s + a.filter(Boolean).length, 0)}`);
  console.warn = origWarn;
  console.log(`engine smoke test done; nodes created ${log.nodes}, sources started ${log.started}, warnings: ${log.warns.length}`);
  if (log.warns.length > 1) console.log('  warnings:', log.warns.slice(0, 5));
}

if (mode === 'spec') {
  const names = args.slice(1); specSheet(`${OUT}/spec_custom.png`, names, names.some(n => /thunder|cave|explode|rain|minecart|underwater|fire.fire|liquid/.test(n)) ? 512 : 64, names.length > 4 ? 3 : 2);
} else {
  if (mode === 'all' || mode === 'sounds') { testSounds(); specAll(); }
  if (mode === 'all' || mode === 'music') testMusic();
  if (mode === 'all' || mode === 'engine') await testEngine();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exitCode = failures ? 1 : 0;
}
