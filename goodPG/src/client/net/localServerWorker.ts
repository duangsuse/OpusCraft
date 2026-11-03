// Servidor de juego local (modo un jugador): el mismo GameServer que en Cloudflare, dentro de
// un Web Worker para no competir con el renderizado, con el mundo guardado en IndexedDB.
import { TICK_RATE, type Conn } from '../../shared/sim/GameServer';
import { Multiverse } from '../../shared/sim/Multiverse'; // Fase 8 (dimensiones)
import { IdbStore } from './idbStore';

type In = { t: 'init'; room: string; seed: number } | { t: 'open' } | { t: 'msg'; data: string } | { t: 'close' } | { t: 'flush' };

let game: Multiverse | null = null;
let store: IdbStore | null = null;
let conn: Conn | null = null;
const queue: In[] = [];

const post = (m: unknown, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

function makeConn(): Conn {
  return {
    send(data: string | ArrayBuffer) {
      if (data instanceof ArrayBuffer) post({ t: 'data', data }, [data]);
      else post({ t: 'data', data });
    },
    close(code?: number, reason?: string) {
      post({ t: 'closed', code: code ?? 1000, reason: reason ?? '' });
      if (conn && game) game.disconnect(conn);
      conn = null;
    },
  };
}

function handle(m: In): void {
  if (!game) {
    queue.push(m);
    return;
  }
  switch (m.t) {
    case 'open':
      if (conn) game.disconnect(conn);
      conn = makeConn();
      game.connect(conn);
      post({ t: 'opened' });
      break;
    case 'msg':
      if (conn) game.message(conn, m.data);
      break;
    case 'close':
      if (conn) game.disconnect(conn);
      conn = null;
      void store?.commit();
      break;
    case 'flush':
      game.flush(true);
      void store?.commit().then(() => post({ t: 'flushed' }));
      break;
  }
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.t === 'init') {
    try {
      store = await IdbStore.open('voxelcraft-' + m.room);
      game = new Multiverse(store, { seed: m.seed, local: true, flushSeconds: 10 });
      setInterval(() => {
        try {
          game!.tick();
        } catch (err) {
          console.error('Error en el tick del servidor local', err);
        }
      }, 1000 / TICK_RATE);
      post({ t: 'ready' });
      for (const q of queue.splice(0)) handle(q);
    } catch (err) {
      post({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  handle(m);
};
