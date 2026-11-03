// Servidor local en un Web Worker con una interfaz de WebSocket para Net.
import type { Transport } from './Net';

export class LocalServer {
  private worker: Worker;
  private transport: LocalTransport | null = null;
  private flushWaiters: (() => void)[] = [];

  constructor(room: string, seed: number) {
    this.worker = new Worker(new URL('./localServerWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { t: string; data?: string | ArrayBuffer; code?: number; reason?: string; message?: string };
      const tr = this.transport;
      switch (m.t) {
        case 'opened':
          tr?.fireOpen();
          break;
        case 'data':
          tr?.fireMessage(m.data!);
          break;
        case 'closed':
          tr?.fireClose(m.code ?? 1000, m.reason ?? '');
          break;
        case 'flushed':
          for (const w of this.flushWaiters.splice(0)) w();
          break;
        case 'error':
          console.error('Servidor local:', m.message);
          tr?.fireClose(1011, m.message ?? 'error');
          break;
      }
    };
    this.worker.postMessage({ t: 'init', room, seed });
  }

  /** Fábrica de transportes para Net. */
  factory = (): Transport => {
    const tr = new LocalTransport(this.worker);
    this.transport = tr;
    this.worker.postMessage({ t: 'open' });
    return tr;
  };

  /** Guarda todo en IndexedDB (al salir al menú). */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.flushWaiters.push(resolve);
      this.worker.postMessage({ t: 'flush' });
      setTimeout(resolve, 1500);
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}

class LocalTransport implements Transport {
  readyState = 0;
  binaryType = 'arraybuffer';
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  private worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  fireMessage(data: string | ArrayBuffer): void {
    if (this.readyState === 1) this.onmessage?.({ data });
  }

  fireClose(code: number, reason: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  send(data: string): void {
    if (this.readyState === 1) this.worker.postMessage({ t: 'msg', data });
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.worker.postMessage({ t: 'close' });
    this.fireClose(code, reason);
  }
}
