// Module worker: renders procedural sound buffers / instrument samples off the main thread.
// Message in:  { id, kind: 'sound', name, v } | { id, kind: 'inst', inst, midi }
// Message out: { id, kind, ..., sr, chans: [Float32Array...] } (transferred) or { id, error }
import { renderSound } from './sounds.js';
import { renderInstrumentNote } from './music.js';

self.onmessage = e => {
  const m = e.data;
  try {
    const res = m.kind === 'inst' ? renderInstrumentNote(m.inst, m.midi) : renderSound(m.name, m.v);
    self.postMessage({ ...m, sr: res.sr, chans: res.chans }, res.chans.map(c => c.buffer));
  } catch (err) {
    self.postMessage({ ...m, error: String(err && err.stack || err) });
  }
};
