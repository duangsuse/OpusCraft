// Camas: dormir de noche (si todos los jugadores duermen, amanece) y punto de reaparición.
import { isBed, stateProps, AIR, FIRE, BLOCK_SOLID } from '../../blocks';
import { dimensionDef } from '../../dimensions'; // Fase 8 (dimensiones)
import { MOBS } from '../../mobs';
import { STATE_DEAD, STATE_SLEEP } from '../../protocol';
import { partnerOf } from '../../placement';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext, Session } from './context';

/** Ticks durmiendo antes de que se haga de día (Minecraft: 100). */
const SLEEP_TICKS = 100;

/** ¿Se puede dormir a esta hora? (como en Minecraft: del anochecer hasta poco antes del amanecer). */
export function canSleepAt(worldTime: number): boolean {
  const d = worldTime - Math.floor(worldTime);
  return d > 0.52 && d < 0.98;
}

export class Beds {
  constructor(private ctx: ServerContext) {}

  trySleep(s: Session, x: number, y: number, z: number, id: number): void {
    const ctx = this.ctx;
    // Siempre se duerme en los pies de la cama.
    const st = stateProps(id)!;
    const foot: [number, number, number] = st.part === 0 ? [x, y, z] : (partnerOf(x, y, z, id) as [number, number, number]);
    const fail = (m: string) => ctx.send(s, { t: 'sleep', ok: false, m });
    const footId = ctx.world.getBlock(foot[0], foot[1], foot[2]);
    if (!isBed(footId)) return fail('La cama está rota.');
    // Fase 8: donde no se puede dormir (el Nether), la cama explota (potencia 5, con fuego), como en Minecraft.
    if (!dimensionDef(ctx.dim).beds) {
      this.explodeBed(foot[0], foot[1], foot[2], footId);
      return;
    }
    if (s.sleeping !== null) return;
    // Punto de reaparición: al usar la cama, aunque no se pueda dormir (como en Minecraft).
    const same = s.bed && s.bedDim === ctx.dim && s.bed[0] === foot[0] && s.bed[1] === foot[1] && s.bed[2] === foot[2];
    if (!same) {
      s.bed = foot;
      s.bedDim = ctx.dim; // Fase 8.5: el punto de reaparición es de una dimensión
      ctx.savePlayer(s);
      ctx.send(s, { t: 'spawn', p: foot, d: ctx.dim });
      ctx.tell(s, 'Punto de reaparición establecido.');
    }
    if (!canSleepAt(ctx.worldTime())) return fail('Sólo puedes dormir de noche.');
    const key = posKey(foot[0], foot[1], foot[2]);
    for (const o of ctx.sessions()) if (o !== s && o.sleeping === key) return fail('Esta cama está ocupada.');
    if (s.mode !== 'c') {
      for (const e of ctx.entities.list.values()) {
        const def = MOBS[e.type];
        if (!def || !def.hostile || e.dead) continue;
        if (Math.abs(e.x - (foot[0] + 0.5)) <= 8 && Math.abs(e.z - (foot[2] + 0.5)) <= 8 && Math.abs(e.y - foot[1]) <= 5) {
          return fail('No puedes descansar ahora: hay monstruos cerca.');
        }
      }
    }
    s.sleeping = key;
    s.sleepTicks = 0;
    s.s |= STATE_SLEEP;
    ctx.send(s, { t: 'sleep', ok: true, p: [foot[0] + 0.5, foot[1] + 0.5625, foot[2] + 0.5], f: stateProps(footId)!.facing });
    const n = ctx.playerCount;
    let sleeping = 0;
    for (const o of ctx.sessions()) if (o.joined && o.sleeping !== null) sleeping++;
    if (n > 1) ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} se fue a dormir (${sleeping}/${n}).` });
  }

  /** Fase 8: la cama explota y prende fuego alrededor. */
  private explodeBed(x: number, y: number, z: number, id: number): void {
    const ctx = this.ctx, w = ctx.world;
    const head = partnerOf(x, y, z, id);
    w.setBlock(x, y, z, AIR);
    if (head) w.setBlock(head[0], head[1], head[2], AIR);
    ctx.entities.explosion?.(x + 0.5, y + 0.5, z + 0.5, 5, false);
    for (let dz = -3; dz <= 3; dz++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (ctx.rand() > 0.33) continue;
          const b = w.getBlock(x + dx, y + dy, z + dz), below = w.getBlock(x + dx, y + dy - 1, z + dz);
          if (b === AIR && below > 0 && BLOCK_SOLID[below]) w.setBlock(x + dx, y + dy, z + dz, FIRE);
        }
      }
    }
  }

  /** Levanta a un jugador de la cama. */
  wake(s: Session, notify = false): void {
    if (s.sleeping === null) return;
    s.sleeping = null;
    s.sleepTicks = 0;
    s.s &= ~STATE_SLEEP;
    if (notify) this.ctx.send(s, { t: 'wake' });
  }

  /** Si todos los jugadores vivos duermen desde hace 5 s, se hace de día. */
  tick(): void {
    const ctx = this.ctx;
    let any = false, all = true;
    const night = canSleepAt(ctx.worldTime());
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      if (s.sleeping === null) {
        all = false;
        continue;
      }
      if (!night || !isBed(ctx.world.getBlock(keyX(s.sleeping), keyY(s.sleeping), keyZ(s.sleeping)))) {
        this.wake(s, true);
        all = false;
        continue;
      }
      any = true;
      s.sleepTicks++;
      if (s.sleepTicks < SLEEP_TICKS) all = false;
    }
    if (!any || !all) return;
    ctx.setTime(Math.floor(ctx.worldTime()) + 1.01);
    for (const s of ctx.sessions()) this.wake(s, true);
    ctx.broadcast({ t: 'chat', id: null, name: '', m: 'Amaneció. ¡Buenos días!' });
  }

  /** Camas rotas: ya no sirven para reaparecer. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isBed(old) || isBed(id)) return;
    const p = partnerOf(x, y, z, old);
    for (const s of this.ctx.sessions()) {
      if (!s.bed || (s.bedDim ?? 0) !== this.ctx.dim) continue; // Fase 8.5: la cama de esta dimensión
      const atFoot = s.bed[0] === x && s.bed[1] === y && s.bed[2] === z;
      const atHead = !!p && s.bed[0] === p[0] && s.bed[1] === p[1] && s.bed[2] === p[2];
      if (atFoot || atHead) {
        s.bed = null;
        this.ctx.savePlayer(s);
        this.ctx.send(s, { t: 'spawn', p: null });
      }
    }
  }
}
