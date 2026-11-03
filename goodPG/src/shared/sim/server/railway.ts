// Fase 7 (transporte): potencia de los raíles en el servidor.
//
// Ganchos para la redstone (Fase 7 (redstone): GameServer conecta railPowered a la redstone; el segundo
// no hace falta: el detector emite por su estado y los raíles escuchan a sus vecinos, ver redstone/rails.ts):
//  - railPowered(x, y, z): ¿recibe potencia el raíl propulsor o activador de (x, y, z)? (lo que en
//    Minecraft es hasNeighborSignal). Con él encendido, los 8 raíles siguientes del mismo tipo unidos en
//    línea también se encienden.
//  - detectorOutput(x, y, z, on): el raíl detector de (x, y, z) empieza (on) o deja de emitir porque
//    tiene encima una vagoneta (o ya no).
// Cualquier cambio de bloque alrededor de un propulsor o activador recalcula su potencia; si la potencia
// cambia sin que cambie ningún bloque, hay que llamar a refreshPower(x, y, z).
import { RAIL_KIND, RAIL_SHAPE, RAIL_POWERED, RAIL_ACTIVATOR, RAIL_DETECTOR, railIsPowered, railState } from '../../blocks';
import { railPowerEdits } from '../../rails';
import type { ServerContext } from './context';

/** Ticks que sigue encendido un detector después de que se vaya la vagoneta. */
const DETECTOR_HOLD = 10;

export class Rails {
  /** Gancho de la redstone: ¿recibe potencia el raíl de (x, y, z)? */
  railPowered: (x: number, y: number, z: number) => boolean = () => false;
  /** Gancho de la redstone: el raíl detector de (x, y, z) empieza (true) o deja (false) de emitir. */
  detectorOutput: (x: number, y: number, z: number, on: boolean) => void = () => {};
  /** Aplicando cambios de potencia (los cambios de bloque que provocan no vuelven a recalcular). */
  private busy = false;
  /** Detectores pisados: clave → [x, y, z, ticks que le quedan encendido]. */
  private pressed = new Map<string, [number, number, number, number]>();

  constructor(private ctx: ServerContext) {}

  /** Recalcula el encendido de los propulsores o activadores unidos al raíl de (x, y, z). */
  refreshPower(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const kind = RAIL_KIND[Math.max(0, w.getBlock(x, y, z))];
    if (kind !== RAIL_POWERED && kind !== RAIL_ACTIVATOR) return;
    const get = (a: number, b: number, c: number) => w.getBlock(a, b, c);
    const edits = railPowerEdits(get, x, y, z, (a, b, c) => (this.railPowered(a, b, c) ? 1 : 0));
    if (edits.length === 0) return;
    this.busy = true;
    try {
      for (const [a, b, c, id] of edits) w.setBlock(a, b, c, id);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Un bloque cambió. Auditoría de la redstone: la potencia de los propulsores y activadores ya la lleva la
   * redstone raíl a raíl, como en Java (redstone/rails.ts); esto queda para quien la pida a mano.
   */
  onBlockChanged(x: number, y: number, z: number): void {
    void x;
    void y;
    void z;
  }

  /** Recalcula a mano los propulsores y activadores de alrededor de (x, y, z) (y los que se unían a ellos). */
  refreshAround(x: number, y: number, z: number): void {
    if (this.busy) return;
    const w = this.ctx.world;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const id = w.getBlock(x + dx, y + dy, z + dz);
          if (id > 0 && (RAIL_KIND[id] === RAIL_POWERED || RAIL_KIND[id] === RAIL_ACTIVATOR)) this.refreshPower(x + dx, y + dy, z + dz);
        }
      }
    }
  }

  /** Hay una vagoneta sobre el raíl detector de (x, y, z) este tick. */
  press(x: number, y: number, z: number): void {
    const k = `${x},${y},${z}`;
    const cur = this.pressed.get(k);
    if (cur) {
      cur[3] = DETECTOR_HOLD;
      return;
    }
    this.pressed.set(k, [x, y, z, DETECTOR_HOLD]);
    this.setDetector(x, y, z, true);
  }

  private setDetector(x: number, y: number, z: number, on: boolean): void {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    if (RAIL_KIND[Math.max(0, id)] !== RAIL_DETECTOR) return;
    if (railIsPowered(id) !== on) w.setBlock(x, y, z, railState(RAIL_DETECTOR, RAIL_SHAPE[id], on));
    this.detectorOutput(x, y, z, on);
  }

  /** Cada tick: los detectores que ya no tienen vagoneta se apagan. */
  tick(): void {
    for (const [k, p] of this.pressed) {
      const gone = RAIL_KIND[Math.max(0, this.ctx.world.getBlock(p[0], p[1], p[2]))] !== RAIL_DETECTOR;
      if (gone || --p[3] <= 0) {
        this.pressed.delete(k);
        if (!gone) this.setDetector(p[0], p[1], p[2], false);
        else this.detectorOutput(p[0], p[1], p[2], false);
      }
    }
  }
}
