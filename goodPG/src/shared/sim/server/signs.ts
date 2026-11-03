// Carteles: el texto de cada cartel (por posición). Cualquiera al alcance puede escribirlo; se guarda
// con los contenedores, se reenvía a todos y quien entra lo recibe en la bienvenida.
import { isSign } from '../../blocks';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { sanitizeSignLines, signIsBlank } from '../../signText';
import type { ServerStore } from '../store';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext, Session } from './context';

/** Carteles con texto que se envían al entrar (como mucho). */
const MAX_SIGNS = 4000;

export class Signs {
  private text = new Map<number, string[]>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; l?: unknown };
        if (w.k !== 'sg') continue;
        const lines = sanitizeSignLines(w.l);
        if (lines && !signIsBlank(lines)) this.text.set(key, lines);
      } catch {
        /* ignorar */
      }
    }
  }

  onSign(s: Session, msg: Extract<ClientMsg, { t: 'sign' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return;
    if (!isSign(ctx.world.getBlock(x, y, z))) return;
    const lines = sanitizeSignLines(msg.l);
    if (!lines) return;
    const k = posKey(x, y, z);
    if (signIsBlank(lines)) this.text.delete(k);
    else {
      if (!this.text.has(k) && this.text.size >= MAX_SIGNS) return;
      this.text.set(k, lines);
    }
    this.dirty.add(k);
    ctx.broadcast({ t: 'sign', x, y, z, l: lines });
  }

  /** Se rompe un cartel: se borra su texto. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isSign(old) || isSign(id)) return;
    const k = posKey(x, y, z);
    if (!this.text.delete(k)) return;
    this.dirty.add(k);
    this.ctx.broadcast({ t: 'sign', x, y, z, l: [] });
  }

  /** Todos los carteles con texto: [x, y, z, líneas]. */
  all(): [number, number, number, string[]][] {
    return [...this.text].map(([k, l]) => [keyX(k), keyY(k), keyZ(k), l]);
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const l = this.text.get(k);
      store.saveContainer(k, l ? JSON.stringify({ k: 'sg', l }) : null);
    }
    this.dirty.clear();
  }
}
