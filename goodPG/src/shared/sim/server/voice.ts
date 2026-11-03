// Chat de voz por proximidad: el servidor sólo presenta a los jugadores. La voz va directa de navegador a navegador
// (WebRTC); aquí se reparte quién tiene la voz activada y se pasan, validados, los mensajes con los que se conectan
// (ofertas, respuestas y candidatos ICE) de un jugador a otro. Cada dimensión es un servidor aparte, así que sólo se
// oyen los de la misma dimensión.
import type { ClientMsg, RtcSignal } from '../../protocol';
import type { ServerContext, Session } from './context';

/** Tope de una descripción de sesión (SDP) y de un candidato ICE. */
const MAX_SDP = 16000;
const MAX_CANDIDATE = 1000;

/** Señal de WebRTC válida (null si no lo es). */
export function sanitizeRtc(raw: unknown): RtcSignal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const sdp = r.sdp as Record<string, unknown> | undefined;
  if (sdp && typeof sdp === 'object') {
    if ((sdp.type !== 'offer' && sdp.type !== 'answer') || typeof sdp.sdp !== 'string' || sdp.sdp.length > MAX_SDP) return null;
    return { sdp: { type: sdp.type, sdp: sdp.sdp } };
  }
  const ice = r.ice as Record<string, unknown> | undefined;
  if (ice && typeof ice === 'object') {
    if (typeof ice.candidate !== 'string' || ice.candidate.length > MAX_CANDIDATE) return null;
    const out: RtcSignal = { ice: { candidate: ice.candidate } };
    if (typeof ice.sdpMid === 'string' && ice.sdpMid.length <= 32) out.ice!.sdpMid = ice.sdpMid;
    const idx = Number(ice.sdpMLineIndex);
    if (ice.sdpMLineIndex !== undefined && Number.isInteger(idx) && idx >= 0 && idx < 16) out.ice!.sdpMLineIndex = idx;
    return out;
  }
  return null;
}

export class VoiceRelay {
  constructor(private ctx: ServerContext) {}

  /** El jugador activa o desactiva su voz: se lo cuenta a los demás. */
  onVoice(s: Session, msg: Extract<ClientMsg, { t: 'voice' }>): void {
    const on = msg.on === true;
    if ((s.voice ?? false) === on) return;
    s.voice = on;
    this.ctx.broadcast({ t: 'voice', id: s.id, on }, s);
  }

  /** Una señal de WebRTC para otro jugador de esta dimensión (los dos con la voz activada). */
  onRtc(s: Session, msg: Extract<ClientMsg, { t: 'rtc' }>): void {
    if (!s.voice || typeof msg.to !== 'string' || msg.to === s.id) return;
    const d = sanitizeRtc(msg.d);
    if (!d) return;
    for (const o of this.ctx.sessions()) {
      if (o.id !== msg.to) continue;
      if (o.joined && o.voice) this.ctx.send(o, { t: 'rtc', from: s.id, d });
      return;
    }
  }
}
