// Fase 6.5 (colecciones): tocadiscos y creepers cargados.
// - Tocadiscos: clic derecho con un disco lo mete y empieza a sonar para todos (cada cliente toca la
//   composición del disco en la posición del tocadiscos); clic derecho otra vez lo saca (cae encima).
//   Al romperlo cae el disco. Qué disco tiene cada uno se guarda con los contenedores (clave 'jb'); lo
//   que suena no: al cargar el mundo los discos están dentro, callados (como cuando termina la pieza).
// - Un rayo carga a los creepers que tenga cerca.
import { isJukebox, jukeboxHasDisc, jukeboxWith } from '../../blocks';
import { isValidItem } from '../../items';
import { MOB_CREEPER } from '../../mobs';
import { discOfItem, CHARGE_RADIUS } from '../../collections';
import { DISCS } from '../../discs';
import { STATE_DEAD, type ClientMsg, type ServerMsg } from '../../protocol';
import type { ServerStore } from '../store';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { r2, type ServerContext, type Session } from './context';

export class Collections {
  /** Disco (id del objeto) de cada tocadiscos, por clave de posición. */
  private discs = new Map<number, number>();
  /** Tocadiscos que están sonando: desde cuándo (ms del reloj del servidor). */
  private playing = new Map<number, number>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; d?: unknown };
        const d = Number(w.d);
        if (w.k === 'jb' && isValidItem(d) && discOfItem(d) >= 0) this.discs.set(key, d);
      } catch {
        /* ignorar */
      }
    }
  }

  // ------------------------------------------------------------------ tocadiscos

  /** Clic derecho en un tocadiscos: sacar el disco que tiene o meter el de la mano. */
  onJukebox(s: Session, msg: Extract<ClientMsg, { t: 'jukebox' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), item = Number(msg.item), q = Number(msg.q);
    const reply = (ok: boolean, take = 0) => ctx.send(s, { t: 'ires', q: Number.isInteger(q) ? q : 0, ok, take });
    if (![x, y, z].every(Number.isInteger) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return reply(false);
    const id = ctx.world.getBlock(x, y, z);
    if (!isJukebox(id)) return reply(false);
    const k = posKey(x, y, z);
    if (jukeboxHasDisc(id)) {
      this.eject(k, x, y, z);
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, jukeboxWith(false)));
      return reply(true);
    }
    if (!Number.isInteger(item) || discOfItem(item) < 0) return reply(false);
    this.discs.set(k, item);
    this.dirty.add(k);
    this.playing.set(k, ctx.now());
    ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, jukeboxWith(true)));
    this.announce(k, discOfItem(item), 0);
    reply(true, 1);
  }

  /** Fase 7 (mecanismos): una tolva mete el disco `item` en el tocadiscos vacío de (x, y, z); true si entró. */
  insertDisc(x: number, y: number, z: number, item: number): boolean {
    const ctx = this.ctx;
    const id = ctx.world.getBlock(x, y, z);
    if (!isJukebox(id) || jukeboxHasDisc(id) || discOfItem(item) < 0) return false;
    const k = posKey(x, y, z);
    this.discs.set(k, item);
    this.dirty.add(k);
    this.playing.set(k, ctx.now());
    ctx.world.setBlock(x, y, z, jukeboxWith(true));
    this.announce(k, discOfItem(item), 0);
    return true;
  }

  /** Saca el disco (cae encima del tocadiscos) y lo calla. */
  private eject(k: number, x: number, y: number, z: number): void {
    const disc = this.discs.get(k);
    this.discs.delete(k);
    this.dirty.add(k);
    if (this.playing.delete(k)) this.announce(k, -1, 0);
    if (disc) this.ctx.entities.spawnItem({ id: disc, count: 1 }, x + 0.5, y + 1.05, z + 0.5, 0, 2.5, 0);
  }

  /** Mensaje de efecto con el disco que suena (a = índice en DISCS, -1 = silencio; b = segundos ya sonados). */
  private message(k: number, disc: number, elapsed: number): ServerMsg {
    return { t: 'fx', k: 'jukebox', p: [keyX(k) + 0.5, keyY(k) + 0.5, keyZ(k) + 0.5], a: disc, b: r2(elapsed) };
  }

  /** Se avisa a todos: cada cliente decide si lo oye (según lo cerca que esté). */
  private announce(k: number, disc: number, elapsed: number): void {
    this.ctx.broadcast(this.message(k, disc, elapsed));
  }

  /** Quien entra oye lo que ya estaba sonando, por donde va. */
  onJoin(s: Session): void {
    const now = this.ctx.now();
    for (const [k, since] of this.playing) {
      const disc = discOfItem(this.discs.get(k) ?? 0);
      if (disc >= 0) this.ctx.send(s, this.message(k, disc, (now - since) / 1000));
    }
  }

  /** Cada segundo: los discos que acabaron dejan de sonar (los clientes ya paran solos). */
  tick(): void {
    const now = this.ctx.now();
    for (const [k, since] of this.playing) {
      const disc = discOfItem(this.discs.get(k) ?? 0);
      if (disc < 0 || now - since > DISCS[disc].seconds * 1000) this.playing.delete(k);
    }
  }

  /** ¿Está sonando el tocadiscos de (x, y, z)? (Para pruebas.) */
  isPlaying(x: number, y: number, z: number): boolean {
    return this.playing.has(posKey(x, y, z));
  }

  /** Fase 7.5 (mansión): ¿suena algún tocadiscos a `r` bloques de (x, y, z)? (Los alays bailan.) */
  playingNear(x: number, y: number, z: number, r: number): boolean {
    for (const k of this.playing.keys()) if (Math.hypot(keyX(k) + 0.5 - x, keyY(k) + 0.5 - y, keyZ(k) + 0.5 - z) <= r) return true;
    return false;
  }

  /** Disco que tiene el tocadiscos de (x, y, z) (0 si ninguno). */
  discAt(x: number, y: number, z: number): number {
    return this.discs.get(posKey(x, y, z)) ?? 0;
  }

  /** Se rompe (o se sustituye) un tocadiscos: cae su disco. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isJukebox(old) || isJukebox(id)) return;
    const k = posKey(x, y, z);
    if (this.discs.has(k) || this.playing.has(k)) this.eject(k, x, y, z);
  }

  // ------------------------------------------------------------------ creepers cargados

  /** Cae un rayo en (x, y, z): los creepers de alrededor se cargan. */
  lightning(x: number, y: number, z: number): void {
    for (const e of this.ctx.entities.list.values()) {
      if (e.type !== MOB_CREEPER || e.dead || !e.ai) continue;
      if (Math.hypot(e.x - x, e.y - y, e.z - z) <= CHARGE_RADIUS) e.charged = true;
    }
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const d = this.discs.get(k);
      store.saveContainer(k, d ? JSON.stringify({ k: 'jb', d }) : null);
    }
    this.dirty.clear();
  }
}
