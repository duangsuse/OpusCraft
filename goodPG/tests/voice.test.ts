// Chat de voz por proximidad: el servidor reparte quién tiene la voz activada y pasa, validadas, las señales de
// WebRTC entre dos jugadores que la tienen (la voz en sí va de navegador a navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRtc } from '../src/shared/sim/server/voice';
import { makeServer } from './harness';

test('señales: sólo ofertas, respuestas y candidatos con tamaños razonables', () => {
  assert.deepEqual(sanitizeRtc({ sdp: { type: 'offer', sdp: 'v=0' } }), { sdp: { type: 'offer', sdp: 'v=0' } });
  assert.deepEqual(sanitizeRtc({ ice: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } }),
    { ice: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
  assert.equal(sanitizeRtc({ sdp: { type: 'pranswer', sdp: 'x' } }), null);
  assert.equal(sanitizeRtc({ sdp: { type: 'offer', sdp: 'x'.repeat(20000) } }), null);
  assert.equal(sanitizeRtc({ ice: { candidate: 5 } }), null);
  assert.equal(sanitizeRtc('hola'), null);
});

test('servidor: presencia de voz, señales entre quienes la tienen y nada para quien no', () => {
  const h = makeServer(4242);
  const a = h.join('Ana');
  const b = h.join('Beto');
  a.conn.msgs = [];
  b.conn.msgs = [];
  // Ana activa su voz: Beto se entera.
  a.send({ t: 'voice', on: true });
  assert.deepEqual(b.conn.take('voice').map((m) => [m.id, m.on]), [[a.welcome.id, true]]);
  // Beto aún no la tiene: la señal de Ana no le llega.
  a.send({ t: 'rtc', to: b.welcome.id, d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.equal(b.conn.take('rtc').length, 0);
  // Con los dos, sí (con quién la manda); y la respuesta vuelve.
  b.send({ t: 'voice', on: true });
  a.send({ t: 'rtc', to: b.welcome.id, d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  const [offer] = b.conn.take('rtc');
  assert.equal(offer.from, a.welcome.id);
  assert.equal(offer.d.sdp.type, 'offer');
  b.send({ t: 'rtc', to: a.welcome.id, d: { sdp: { type: 'answer', sdp: 'v=0' } } });
  assert.equal(a.conn.take('rtc')[0]?.d.sdp.type, 'answer');
  // Una señal que no vale no pasa.
  a.send({ t: 'rtc', to: b.welcome.id, d: { sdp: { type: 'offer', sdp: 'x'.repeat(20000) } } });
  assert.equal(b.conn.take('rtc').length, 0);
  // Quien entra después ve quién tiene la voz.
  const c = h.join('Carla');
  const info = (c.welcome.players as { id: string; v?: number }[]).find((p) => p.id === a.welcome.id);
  assert.equal(info?.v, 1);
  // Ana la apaga: los demás se enteran y ya no le llegan señales.
  b.conn.msgs = [];
  a.send({ t: 'voice', on: false });
  assert.deepEqual(b.conn.take('voice').map((m) => m.on), [false]);
  b.send({ t: 'rtc', to: a.welcome.id, d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.equal(a.conn.take('rtc').length, 0);
});

test('cliente: la voz se oye entera de cerca y se apaga del todo a los 48 bloques', async () => {
  const { voiceDistanceGain, VOICE_RANGE } = await import('../src/client/voice/VoiceChat');
  assert.equal(VOICE_RANGE, 48);
  assert.equal(voiceDistanceGain(1), 1);
  assert.equal(voiceDistanceGain(48), 0);
  assert.equal(voiceDistanceGain(60), 0);
  assert.ok(voiceDistanceGain(10) > voiceDistanceGain(20) && voiceDistanceGain(20) > voiceDistanceGain(40));
  assert.ok(voiceDistanceGain(40) > 0 && voiceDistanceGain(40) < 0.05);
});

test('entorno: las paredes apagan la voz según el material, las cuevas retumban y el aire libre no', async () => {
  const { voiceOcclusion, voiceReverb } = await import('../src/client/voice/voiceEnvironment');
  const { STONE, GLASS, OAK_LEAVES, WHITE_WOOL } = await import('../src/shared/blocks');
  // Una pared de un bloque de grosor en x = 5 (de y 60 a 70), entre dos cabezas a la misma altura.
  const wall = (id: number, thick = 1) => (x: number, y: number) => (x >= 5 && x < 5 + thick && y >= 60 && y <= 70 ? id : 0);
  const open = voiceOcclusion(() => 0, 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  assert.deepEqual(open, { gain: 1, cutoff: 20000 });
  const stone = voiceOcclusion(wall(STONE), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const stone3 = voiceOcclusion(wall(STONE, 3), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const glass = voiceOcclusion(wall(GLASS), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const leaves = voiceOcclusion(wall(OAK_LEAVES), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const wool = voiceOcclusion(wall(WHITE_WOOL), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  assert.ok(stone.gain < 0.4 && stone.cutoff < 5000, JSON.stringify(stone));
  assert.ok(stone3.gain < stone.gain && stone3.cutoff < stone.cutoff);
  assert.ok(wool.gain < stone.gain, 'la lana aísla más que la piedra');
  assert.ok(leaves.gain > glass.gain && glass.gain > stone.gain, 'hojas < cristal < piedra en lo que tapan');
  // Un muro bajo (hasta y 64): se oye por encima, aunque algo menos que sin nada.
  const low = voiceOcclusion((x: number, y: number) => (x === 5 && y <= 64 ? STONE : 0), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  assert.ok(low.gain > 0.6 && low.gain < 1, JSON.stringify(low));
  // Eco: al aire libre casi nada; en una sala de 5 × 4 × 5 bastante; en una cueva grande más.
  const box = (r: number, h: number) => (x: number, y: number, z: number) => (Math.abs(x) > r || Math.abs(z) > r || y < 60 || y > 60 + h ? STONE : 0);
  const outside = voiceReverb((_x: number, y: number) => (y < 60 ? STONE : 0), 0.5, 61.6, 0.5);
  const room = voiceReverb(box(2, 4), 0.5, 61.6, 0.5);
  const cave = voiceReverb(box(14, 12), 0.5, 61.6, 0.5);
  assert.ok(outside < 0.1, `fuera ${outside}`);
  assert.ok(room > 0.25, `sala ${room}`);
  assert.ok(cave > room, `cueva ${cave} > sala ${room}`);
});

test('extras: el susurro llega a la mitad, los nombres de grupo se limpian', async () => {
  const { voiceDistanceGain, WHISPER_RANGE, cleanGroup } = await import('../src/client/voice/VoiceChat');
  assert.equal(WHISPER_RANGE, 24);
  assert.equal(voiceDistanceGain(30, WHISPER_RANGE), 0);
  assert.ok(voiceDistanceGain(30) > 0);
  assert.equal(cleanGroup('  Los Mineros! '), 'losmineros');
  assert.equal(cleanGroup('Niño_2'), 'niño_2');
  assert.equal(cleanGroup('x'.repeat(40)).length, 24);
  assert.equal(cleanGroup('¡¿?!'), '');
});

test('entorno: la voz rodea la pared por la puerta y se oye desde ahí', async () => {
  const { soundPath, voiceOcclusion } = await import('../src/client/voice/voiceEnvironment');
  const { STONE } = await import('../src/shared/blocks');
  // Suelo en y = 63; pared de piedra en x = 5 (y 64..70) con un hueco de puerta en z = 6 (y 64..65).
  const get = (x: number, y: number, z: number) => {
    if (y <= 63) return STONE;
    if (x === 5 && y <= 70 && !(z === 6 && y <= 65)) return STONE;
    return 0;
  };
  // Quien escucha en (2, 64, 0), quien habla en (8, 64, 0): la pared en medio tapa lo directo.
  const occ = voiceOcclusion(get, 2.5, 65.6, 0.5, 8.5, 65.6, 0.5);
  assert.ok(occ.gain < 0.5, `directo tapado: ${occ.gain}`);
  const path = soundPath(get, 2.5, 65.6, 0.5, 8.5, 65.6, 0.5)!;
  assert.ok(path, 'hay camino por la puerta');
  assert.ok(path.length > 6 && path.length < 24, `largo del rodeo: ${path.length}`);
  assert.ok(Math.abs(path.aperture[2] - 6.5) <= 1.5 && path.aperture[0] <= 6, `la voz sale por la puerta: ${path.aperture}`);
  // Sin hueco no hay camino (con un presupuesto pequeño y la pared entera).
  const shut = (x: number, y: number, z: number) => (y <= 63 || (x === 5) ? STONE : 0);
  assert.equal(soundPath(shut, 2.5, 65.6, 0.5, 8.5, 65.6, 0.5, 40, 3000), null);
});

test('entorno: la sala suena según tamaño y material; eco en las cavernas; de espaldas, más bajo', async () => {
  const { roomProfile, roomWet, roomEcho, voiceDirectivity, airCutoff } = await import('../src/client/voice/voiceEnvironment');
  const { STONE, WHITE_WOOL } = await import('../src/shared/blocks');
  const box = (id: number, r: number, h: number) => (x: number, y: number, z: number) => (Math.abs(x) > r || Math.abs(z) > r || y < 60 || y > 60 + h ? id : 0);
  const stoneRoom = roomProfile(box(STONE, 3, 4), 0.5, 61.6, 0.5);
  const woolRoom = roomProfile(box(WHITE_WOOL, 3, 4), 0.5, 61.6, 0.5);
  const cave = roomProfile(box(STONE, 20, 16), 0.5, 61.6, 0.5);
  assert.ok(roomWet(woolRoom) < roomWet(stoneRoom) * 0.6, `la lana apaga: ${roomWet(woolRoom)} vs ${roomWet(stoneRoom)}`);
  assert.equal(roomEcho(stoneRoom).level, 0, 'en una sala pequeña no hay eco separado');
  const e = roomEcho(cave);
  assert.ok(e.level > 0 && e.delay > 0.05, `eco en la caverna: ${JSON.stringify(e)}`);
  const front = voiceDirectivity(1), back = voiceDirectivity(-1);
  assert.ok(back.gain < front.gain && back.cutoff < front.cutoff / 3);
  assert.ok(airCutoff(48) < airCutoff(5));
});

test('región: cada mundo nuevo nace cerca de quien lo crea', async () => {
  const { regionFor, cityOf } = await import('../src/server/region');
  assert.equal(regionFor({ continent: 'SA', country: 'PE' }), 'sam');
  assert.equal(regionFor({ continent: 'NA', country: 'MX', longitude: '-99.1' }), 'enam');
  assert.equal(regionFor({ continent: 'NA', country: 'US', longitude: '-122.4' }), 'wnam');
  assert.equal(regionFor({ continent: 'EU', country: 'ES', longitude: '-3.7' }), 'weur');
  assert.equal(regionFor({ continent: 'AS', country: 'AE' }), 'me');
  assert.equal(regionFor(undefined), undefined);
  assert.equal(cityOf('MIA'), 'Miami');
});
