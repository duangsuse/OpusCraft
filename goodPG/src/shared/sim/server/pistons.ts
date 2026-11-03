// Fase 7 (mecanismos): pistones y pistones adhesivos en el servidor. Auditoría de la redstone: igual que en
// Minecraft Java (PistonBaseBlock, PistonMovingBlockEntity, PistonHeadBlock):
// - Potencia (getNeighborSignal): por cualquier lado menos por delante, o la del bloque de encima por
//   cualquier lado menos por abajo (la cuasi-conectividad: como sólo miran al recibir un aviso, hay «BUD»).
//   La cabeza pasa a la base los avisos que recibe.
// - No se mueven al recibir el aviso: apuntan un evento de bloque (0 extender, 1 recoger, 2 recoger al
//   instante) que se atiende en su fase del tick, y ahí vuelven a mirar la potencia. Recoger al instante
//   (el 2) es lo que pasa si se apaga mientras la cabeza aún sale (progreso < 0,5, en el mismo tick o
//   durante los ticks programados): lo empujado se queda donde iba y el adhesivo lo «escupe».
// - Al moverse, lo que se mueve pasa a ser un bloque en movimiento con su entidad de bloque (progreso 0 →
//   0,5 → 1 en la fase de entidades de bloque) y se asienta al tercer tick, avisando a sus vecinos y a sí
//   mismo. Los avisos y las formas van con las mismas opciones y en el mismo orden que en Java (también las
//   celdas que se vacían, en el orden de un HashMap<BlockPos>).
// - Empujan hasta 12 bloques (shared/pistons.ts, el PistonStructureResolver de Java) y rompen los que se
//   rompen; el slime y la miel arrastran; el cliente lo ve deslizarse (efecto 'pmove') y las entidades que
//   estorban se apartan (el slime las lanza).
// - Un chunk que se guarda a medio movimiento guarda lo que quedará al asentarse, y uno que se descarga
//   termina antes sus movimientos: no se pierde nada.
// - Romper la base quita la cabeza; romper la cabeza rompe la base (y suelta el pistón).
import {
  AIR, SLIME_BLOCK, HONEY_BLOCK, BLOCK_COLLIDE, isPiston, isStickyPiston, pistonExtended, pistonState, isPistonHead, headState, facingOf,
  MOVING_BLOCK, PISTON, STICKY_PISTON, PISTON_HEAD, familyBase,
} from '../../blocks';
import {
  registerRedstone, FACE_X, FACE_Y, FACE_Z, DOWN, JAVA_DIRECTIONS, UPDATE_ALL, UPDATE_CLIENTS, UPDATE_KNOWN_SHAPE, UPDATE_MOVE_BY_PISTON,
  type RedstoneApi,
} from '../../redstone';
import { resolvePush, isPushable, pushReaction, PUSH_NORMAL, type Cell } from '../../pistons';
import { javaHashMapOrder } from '../../redstone/wire';
import { ENT_DISPLAY } from '../../mobs';
import { isHangingType } from '../../paintings';
import { isVehicleType } from '../../vehicles';
import { CHUNK_SIZE } from '../../constants';
import { PMOVE_STILL } from '../../mechanisms';
import { posKey } from '../posKey';
import type { Redstone } from './redstone';
import type { BlockRules } from './blockRules';
import type { ServerContext } from './context';

/** Ticks que tarda en asentarse lo que mueve un pistón (2 deslizándose; se asienta en el tercero). */
export const MOVE_TICKS = 2;
/** Velocidad (bloques/s) con la que lanza un bloque de slime empujado (1 bloque por tick). */
const SLIME_LAUNCH = 20;
/** Opciones de setBlock que usa el pistón en Java. */
const F_EXTENDED = UPDATE_ALL | UPDATE_MOVE_BY_PISTON; // 67
const F_MOVING = 4 | UPDATE_MOVE_BY_PISTON; // 68
const F_SILENT = 4 | UPDATE_KNOWN_SHAPE; // 20
const F_VACATE = UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE | UPDATE_MOVE_BY_PISTON; // 82
const F_DESTROY = UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE; // 18
const F_SETTLE_AIR = 4 | UPDATE_KNOWN_SHAPE | UPDATE_MOVE_BY_PISTON; // 84

/** Lo que se mueve de una barca o vagoneta. */
export interface VehicleBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
}

/** Entidad de bloque de un bloque en movimiento (PistonMovingBlockEntity). */
interface Mover {
  x: number;
  y: number;
  z: number;
  key: number;
  /** Bloque que quedará al asentarse. */
  moved: number;
  /** Dirección de la cara del pistón y si sale o entra. */
  dir: number;
  extending: boolean;
  /** Es la propia base o cabeza del pistón (al acabar de golpe, desaparece). */
  source: boolean;
  progress: number;
  progressO: number;
  lastTicked: number;
}

const SYSTEMS = new WeakMap<RedstoneApi, Pistons>();

registerRedstone([PISTON, STICKY_PISTON], {
  neighbor: (api, x, y, z) => SYSTEMS.get(api)?.checkIfExtend(x, y, z),
  // onPlace: uno recién puesto (que no esté moviéndose) mira si tiene potencia.
  placed: (api, x, y, z, old, id) => {
    const s = SYSTEMS.get(api);
    if (s && !(old > 0 && familyBase(old) === familyBase(id)) && !s.isMoving(x, y, z)) s.checkIfExtend(x, y, z);
  },
  event: (api, x, y, z, id, a) => SYSTEMS.get(api)?.triggerEvent(x, y, z, id, a),
});
registerRedstone(PISTON_HEAD, {
  // neighborChanged de la cabeza: si sigue unida a su base, le pasa el aviso.
  neighbor: (api, x, y, z, id, sx, sy, sz, src) => {
    const f = facingOf(id);
    const bx = x - FACE_X[f], by = y - FACE_Y[f], bz = z - FACE_Z[f];
    const b = api.getBlock(bx, by, bz);
    if ((isPiston(b) && pistonExtended(b) && facingOf(b) === f) || b === MOVING_BLOCK) api.updateAt(bx, by, bz, sx, sy, sz, src);
  },
});
registerRedstone(MOVING_BLOCK, {
  // Un hueco de bloque en movimiento sin entidad (no debería guardarse ninguno): se vacía.
  changed: (api, x, y, z, old) => {
    if (old < 0) api.schedule(x, y, z, MOVE_TICKS + 1);
  },
  tick: (api, x, y, z) => {
    const s = SYSTEMS.get(api);
    if (s && !s.isMoving(x, y, z)) api.setBlock(x, y, z, AIR);
  },
  // onRemove de MovingPistonBlock: si lo quitan (una explosión, un comando…), su entidad acaba ya.
  removed: (api, x, y, z, _old, id) => {
    if (id !== MOVING_BLOCK) SYSTEMS.get(api)?.dropMover(x, y, z);
  },
});

export class Pistons {
  /** Entidades de bloque en movimiento, en el orden en que se crearon (el de las entidades de bloque de Java). */
  private movers = new Map<number, Mover>();
  /** Mientras mueve bloques no reacciona a sus propios cambios (cabezas y bases). */
  private busy = false;
  /** Cuerpo (posición y velocidad) de la barca o vagoneta de una entidad (lo engancha el transporte). */
  vehicleBody: ((entityId: number) => VehicleBody | undefined) | null = null;

  constructor(private ctx: ServerContext, private rs: Redstone, private rules: BlockRules) {
    SYSTEMS.set(rs, this);
  }

  /** ¿Hay algo moviéndose en (x, y, z)? */
  isMoving(x: number, y: number, z: number): boolean {
    return this.movers.has(posKey(x, y, z));
  }

  /** Bloques en movimiento (para las pruebas). */
  get pending(): number {
    return this.movers.size;
  }

  /** Bloques del mundo (el resolvedor ve los bloques en movimiento como inamovibles). */
  private readonly get = (x: number, y: number, z: number): number => this.ctx.world.getBlock(x, y, z);

  /** Cambia un bloque sin que la vigilancia de base y cabeza reaccione (lo hace el propio pistón). */
  private set(x: number, y: number, z: number, id: number, flags = UPDATE_ALL): void {
    const was = this.busy;
    this.busy = true;
    try {
      this.rs.setBlock(x, y, z, id, flags);
    } finally {
      this.busy = was;
    }
  }

  /** getNeighborSignal de Java: por cualquier lado menos por delante; o el bloque de encima, por cualquiera menos por abajo. */
  neighborSignal(x: number, y: number, z: number, facing: number): boolean {
    const rs = this.rs;
    for (const f of JAVA_DIRECTIONS) if (f !== facing && rs.powerFrom(x, y, z, f) > 0) return true;
    for (const f of JAVA_DIRECTIONS) if (f !== DOWN && rs.powerFrom(x, y + 1, z, f) > 0) return true;
    return false;
  }

  /** checkIfExtend de Java: apunta el evento de extender o de recoger (normal o al instante). */
  checkIfExtend(x: number, y: number, z: number): void {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isPiston(id)) return;
    const facing = facingOf(id);
    const powered = this.neighborSignal(x, y, z, facing);
    if (powered && !pistonExtended(id)) {
      if (resolvePush(this.get, x, y, z, facing, true)) this.rs.blockEvent(x, y, z, 0, facing);
    } else if (!powered && pistonExtended(id)) {
      // La cabeza aún sale (bloque en movimiento a dos que se extiende): recoger al instante.
      let type = 1;
      const m = this.movers.get(posKey(x + FACE_X[facing] * 2, y + FACE_Y[facing] * 2, z + FACE_Z[facing] * 2));
      if (m && m.dir === facing && m.extending && (m.progress < 0.5 || this.ctx.tickCount === m.lastTicked || this.rs.inTickPhase)) type = 2;
      this.rs.blockEvent(x, y, z, type, facing);
    }
  }

  /** triggerEvent de Java (en la fase de eventos de bloque). */
  triggerEvent(x: number, y: number, z: number, id: number, type: number): void {
    const w = this.ctx.world;
    const dir = facingOf(id);
    const powered = this.neighborSignal(x, y, z, dir);
    if (powered && (type === 1 || type === 2)) {
      this.set(x, y, z, pistonState(id, dir, true), UPDATE_CLIENTS);
      return;
    }
    if (!powered && type === 0) return;
    if (type === 0) {
      if (!this.moveBlocks(x, y, z, dir, true, id)) return;
      this.set(x, y, z, pistonState(id, dir, true), F_EXTENDED);
      this.ctx.fx('piston', x + 0.5, y + 0.5, z + 0.5, 1);
      return;
    }
    // Recoger: la cabeza que aún sale acaba ya (desaparece) y la base pasa a ser un bloque en movimiento.
    const hx = x + FACE_X[dir], hy = y + FACE_Y[dir], hz = z + FACE_Z[dir];
    const headMover = this.movers.get(posKey(hx, hy, hz));
    if (headMover) this.finalTick(headMover);
    const headId = w.getBlock(hx, hy, hz);
    this.set(x, y, z, MOVING_BLOCK, F_SILENT);
    this.addMover(x, y, z, pistonState(id, dir, false), dir, false, true);
    this.rs.updateNeighbors(x, y, z, -1, MOVING_BLOCK);
    this.rs.updateShapesAround(x, y, z, UPDATE_CLIENTS);
    this.anim({ x, y, z }, pistonState(id, dir, true), PMOVE_STILL);
    if (isPistonHead(headId)) this.anim({ x: hx, y: hy, z: hz }, headId, dir ^ 1);
    if (isStickyPiston(id)) {
      const fx = x + FACE_X[dir] * 2, fy = y + FACE_Y[dir] * 2, fz = z + FACE_Z[dir] * 2;
      const front = w.getBlock(fx, fy, fz);
      const fm = front === MOVING_BLOCK ? this.movers.get(posKey(fx, fy, fz)) : undefined;
      if (fm && fm.dir === dir && fm.extending) {
        // Lo que empujaba aún se mueve: se queda donde iba (el adhesivo lo «escupe»).
        this.finalTick(fm);
      } else {
        const pushable = front > 0 && isPushable(front, fy, dir ^ 1, false, dir) && (pushReaction(front) === PUSH_NORMAL || isPiston(front));
        if (type !== 1 || !pushable) this.removeHead(hx, hy, hz);
        else this.moveBlocks(x, y, z, dir, false, id);
      }
    } else this.removeHead(hx, hy, hz);
    this.ctx.fx('piston', x + 0.5, y + 0.5, z + 0.5, 0);
  }

  /** removeBlock de la cabeza (con avisos). */
  private removeHead(x: number, y: number, z: number): void {
    if (this.ctx.world.getBlock(x, y, z) !== AIR) this.set(x, y, z, AIR);
  }

  /** moveBlocks de Java: mueve (o rompe) lo que decide el resolvedor. */
  private moveBlocks(x: number, y: number, z: number, facing: number, extending: boolean, pistonId: number): boolean {
    const w = this.ctx.world, rs = this.rs;
    const hx = x + FACE_X[facing], hy = y + FACE_Y[facing], hz = z + FACE_Z[facing];
    if (!extending && isPistonHead(w.getBlock(hx, hy, hz))) this.set(hx, hy, hz, AIR, F_SILENT);
    const plan = resolvePush(this.get, x, y, z, facing, extending);
    if (!plan) return false;
    const dir = plan.dir;
    const { toPush, toDestroy } = plan;
    const pushed = toPush.map((c) => w.getBlock(c.x, c.y, c.z));
    const left = new Set(toPush.map((c) => posKey(c.x, c.y, c.z)));
    const old: number[] = [];
    const was = this.busy;
    this.busy = true;
    try {
      // Lo que se rompe (del último al primero): suelta lo suyo y se vacía sin avisar.
      for (let k = toDestroy.length - 1; k >= 0; k--) {
        const c = toDestroy[k];
        const b = w.getBlock(c.x, c.y, c.z);
        if (b > 0) this.rules.dropOnly(c.x, c.y, c.z, b);
        rs.setBlock(c.x, c.y, c.z, AIR, F_DESTROY);
        old.push(b);
      }
      // Lo que se mueve (del último al primero): su destino pasa a ser un bloque en movimiento.
      for (let l = toPush.length - 1; l >= 0; l--) {
        const c = toPush[l];
        const dx = c.x + FACE_X[dir], dy = c.y + FACE_Y[dir], dz = c.z + FACE_Z[dir];
        left.delete(posKey(dx, dy, dz));
        rs.setBlock(dx, dy, dz, MOVING_BLOCK, F_MOVING);
        this.addMover(dx, dy, dz, pushed[l], facing, extending, false);
        old.push(pushed[l]);
      }
      if (extending) {
        left.delete(posKey(hx, hy, hz));
        rs.setBlock(hx, hy, hz, MOVING_BLOCK, F_MOVING);
        this.addMover(hx, hy, hz, headState(facing, isStickyPiston(pistonId)), facing, true, true);
      }
      // Lo que queda vacío: aire sin avisar y luego sus formas, en el orden de un HashMap<BlockPos>.
      const vacated = javaHashMapOrder(toPush.filter((c) => left.has(posKey(c.x, c.y, c.z))));
      for (const c of vacated) rs.setBlock(c.x, c.y, c.z, AIR, F_VACATE);
      for (const c of vacated) rs.updateShapesAround(c.x, c.y, c.z, UPDATE_CLIENTS);
    } finally {
      this.busy = was;
    }
    // Avisos: lo roto (del último al primero), lo movido (del último al primero) y la cabeza.
    let j = 0;
    for (let k = toDestroy.length - 1; k >= 0; k--) {
      const c = toDestroy[k], b = old[j++];
      rs.runRemoved(c.x, c.y, c.z, b, AIR, false);
      rs.updateNeighbors(c.x, c.y, c.z, -1, b);
    }
    for (let l = toPush.length - 1; l >= 0; l--) rs.updateNeighbors(toPush[l].x, toPush[l].y, toPush[l].z, -1, old[j++]);
    if (extending) rs.updateNeighbors(hx, hy, hz, -1, PISTON_HEAD);
    // Lo que ve el cliente y las entidades que estorban.
    const cells = toPush.map((c, i) => ({ x: c.x + FACE_X[dir], y: c.y + FACE_Y[dir], z: c.z + FACE_Z[dir], block: pushed[i] }));
    for (let i = 0; i < toPush.length; i++) this.anim(toPush[i], pushed[i], dir);
    if (extending) {
      const head = headState(facing, isStickyPiston(pistonId));
      this.anim({ x, y, z }, head, facing);
      cells.push({ x: hx, y: hy, z: hz, block: head });
    }
    this.pushEntities(cells, dir);
    return true;
  }

  private addMover(x: number, y: number, z: number, moved: number, dir: number, extending: boolean, source: boolean): void {
    const key = posKey(x, y, z);
    this.movers.delete(key);
    this.movers.set(key, { x, y, z, key, moved, dir, extending, source, progress: 0, progressO: 0, lastTicked: -1 });
  }

  /** La entidad del bloque en movimiento de (x, y, z) desaparece sin más (su bloque ya no está). */
  dropMover(x: number, y: number, z: number): void {
    this.movers.delete(posKey(x, y, z));
  }

  /** Bloque en el que se asienta: una cabeza cuya base ya no está no se queda sola. */
  private settled(m: Mover): number {
    if (!isPistonHead(m.moved)) return m.moved;
    const f = facingOf(m.moved);
    const b = this.ctx.world.getBlock(m.x - FACE_X[f], m.y - FACE_Y[f], m.z - FACE_Z[f]);
    return isPiston(b) && pistonExtended(b) && facingOf(b) === f ? m.moved : AIR;
  }

  /** finalTick de Java: acaba ya (la base o cabeza que acaba de golpe desaparece), con avisos a vecinos y a sí mismo. */
  private finalTick(m: Mover): void {
    if (m.progressO >= 1) return;
    m.progress = m.progressO = 1;
    this.movers.delete(m.key);
    if (this.ctx.world.getBlock(m.x, m.y, m.z) !== MOVING_BLOCK) return;
    const id = m.source ? AIR : this.settled(m);
    this.set(m.x, m.y, m.z, id);
    this.rs.updateAt(m.x, m.y, m.z, m.x, m.y, m.z, id);
  }

  /** tick de PistonMovingBlockEntity: avanza medio bloque por tick y se asienta al tercero. */
  private tickMover(m: Mover): void {
    m.lastTicked = this.ctx.tickCount;
    m.progressO = m.progress;
    if (m.progressO < 1) {
      m.progress = Math.min(1, m.progress + 0.5);
      return;
    }
    this.movers.delete(m.key);
    if (this.ctx.world.getBlock(m.x, m.y, m.z) !== MOVING_BLOCK) return;
    const id = this.settled(m);
    if (id === AIR) {
      this.set(m.x, m.y, m.z, AIR, F_SETTLE_AIR);
      return;
    }
    // Se asienta avisando (opción 1) como movido por un pistón, y se avisa a sí mismo.
    this.set(m.x, m.y, m.z, id, F_EXTENDED);
    this.rs.updateAt(m.x, m.y, m.z, m.x, m.y, m.z, id);
  }

  /**
   * Lo que quedará en cada celda que se está moviendo, [x, y, z, bloque] (el chunk se guarda así: un chunk
   * guardado a medio movimiento no pierde nada).
   */
  settledCells(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const m of this.movers.values()) {
      if (this.ctx.world.getBlock(m.x, m.y, m.z) === MOVING_BLOCK) out.push([m.x, m.y, m.z, this.settled(m)]);
    }
    return out;
  }

  /** El chunk (cx, cz) se va a descargar: lo que se mueve en él se asienta ya. */
  settleChunk(cx: number, cz: number): void {
    for (const m of [...this.movers.values()]) {
      if (Math.floor(m.x / CHUNK_SIZE) !== cx || Math.floor(m.z / CHUNK_SIZE) !== cz || this.movers.get(m.key) !== m) continue;
      m.progress = 1;
      this.tickMover(m);
    }
  }

  /** Fase de entidades de bloque: cada bloque en movimiento avanza (en el orden en que se crearon). */
  tick(): void {
    if (this.movers.size === 0) return;
    for (const m of [...this.movers.values()]) if (this.movers.get(m.key) === m) this.tickMover(m);
  }

  /** El cliente dibuja el bloque `block` deslizándose de (c) una celda hacia `dir`. */
  private anim(c: Cell, block: number, dir: number): void {
    if (block > 0) this.ctx.fx('pmove', c.x, c.y, c.z, block, dir);
  }

  /**
   * Las entidades que ocupan el sitio al que llega un bloque que choca se apartan hacia donde se mueve (los
   * jugadores los aparta su cliente); el slime, además, las lanza, y la miel se lleva las que tiene encima.
   */
  private pushEntities(cells: { x: number; y: number; z: number; block: number }[], dir: number): void {
    if (cells.length === 0) return;
    const ax = FACE_X[dir], ay = FACE_Y[dir], az = FACE_Z[dir];
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || e.type === ENT_DISPLAY || isHangingType(e.type)) continue;
      // Barcas y vagonetas: se mueve su cuerpo (lo que las mueve cada tick).
      const body = isVehicleType(e.type) ? this.vehicleBody?.(e.id) : e;
      if (!body) continue;
      const hw = e.width / 2, h = Math.max(0.1, e.height);
      let need = 0, slime = false, honey = false;
      for (const c of cells) {
        if (BLOCK_COLLIDE[c.block] === 0) continue;
        if (c.block === HONEY_BLOCK && ay === 0) {
          // Encima de la miel que se mueve de lado: se la lleva (como en Minecraft).
          const ox = c.x - ax, oy = c.y, oz = c.z - az;
          if (e.x + hw > ox && e.x - hw < ox + 1 && e.z + hw > oz && e.z - hw < oz + 1 && e.y >= oy + 0.98 && e.y < oy + 1.5) honey = true;
        }
        if (e.x + hw <= c.x || e.x - hw >= c.x + 1 || e.y + h <= c.y || e.y >= c.y + 1 || e.z + hw <= c.z || e.z - hw >= c.z + 1) continue;
        const d = ax > 0 ? c.x + 1 - (e.x - hw) : ax < 0 ? e.x + hw - c.x : ay > 0 ? c.y + 1 - e.y : ay < 0 ? e.y + h - c.y
          : az > 0 ? c.z + 1 - (e.z - hw) : e.z + hw - c.z;
        need = Math.max(need, Math.min(1.01, d + 0.01));
        if (c.block === SLIME_BLOCK) slime = true;
      }
      if (honey && need === 0) need = 1;
      if (need > 0) {
        body.x += ax * need;
        body.y += ay * need;
        body.z += az * need;
        if (ay !== 0) e.fallStart = e.y;
      }
      if (slime) {
        if (ax) body.vx = ax * SLIME_LAUNCH;
        if (ay) body.vy = ay * SLIME_LAUNCH;
        if (az) body.vz = az * SLIME_LAUNCH;
        body.onGround = false;
      }
    }
  }

  /** Cambio de bloque (de quien sea): la base y la cabeza no se quedan la una sin la otra. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (this.busy || old <= 0) return;
    const w = this.ctx.world;
    if (isPiston(old) && pistonExtended(old) && !(isPiston(id) && familyBase(id) === familyBase(old)) && id !== MOVING_BLOCK) {
      const f = facingOf(old);
      const hx = x + FACE_X[f], hy = y + FACE_Y[f], hz = z + FACE_Z[f];
      const h = w.getBlock(hx, hy, hz);
      if (isPistonHead(h) && facingOf(h) === f) w.setBlock(hx, hy, hz, AIR);
    } else if (isPistonHead(old) && !isPistonHead(id) && id !== MOVING_BLOCK) {
      const f = facingOf(old);
      const bx = x - FACE_X[f], by = y - FACE_Y[f], bz = z - FACE_Z[f];
      const b = w.getBlock(bx, by, bz);
      if (isPiston(b) && pistonExtended(b) && facingOf(b) === f) this.rules.breakWithDrops(bx, by, bz, b);
    }
  }
}
