// Física de cajas (AABB) contra la rejilla de bloques, compartida por criaturas, objetos y flechas.
import { BLOCK_SOLID, BLOCK_FLUID, COBWEB } from '../blocks';
import { moveBox, boxBlocked, clipSegment } from '../collide';
import { blockUnder, groundSpeed, slimeBounce, inPowderSnow, POWDER_SINK_SPEED, POWDER_WALK_FACTOR } from '../materialPhysics'; // Fase 6.5 (materiales)
import { SLOW_FALL_SPEED } from '../effects'; // Fase 7 (pociones)
import { levitate } from '../effects'; // Fase 7 (efectos)

export interface BlockGetter {
  /** Id del bloque o -1 si no está cargado (se trata como sólido). */
  getBlock(x: number, y: number, z: number): number;
}

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  width: number;
  height: number;
  onGround: boolean;
  inWater: boolean;
  inLava: boolean;
  /** Choque horizontal en el último movimiento. */
  hitWall: boolean;
  /** Fase 7 (pociones): multiplicador del paso horizontal (Velocidad y Lentitud) y caída lenta. */
  speedMul?: number;
  slowFall?: boolean;
  /**
   * Fase 7 (efectos): nivel de Levitación y la velocidad vertical que lleva con ella (sube despacio sin
   * gravedad: la que le pone su turno no cuenta).
   */
  levitation?: number;
  levVy?: number;
}

const EPS = 1e-4;

export function isSolidAt(w: BlockGetter, x: number, y: number, z: number): boolean {
  const b = w.getBlock(x, y, z);
  return b < 0 || BLOCK_SOLID[b] === 1;
}

/** ¿La caja se solapa con alguna caja de colisión? */
export function boxCollides(
  w: BlockGetter, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
): boolean {
  return boxBlocked(w, minX, minY, minZ, maxX, maxY, maxZ);
}

/**
 * Integra la velocidad durante dt con colisiones por cajas; actualiza onGround, hitWall y fluidos.
 * `step` > 0 permite subir escalones bajos (las criaturas suben losas y escaleras).
 */
export function moveBody(b: Body, w: BlockGetter, dt: number, step = 0): void {
  // Telaraña: las criaturas también se quedan casi quietas.
  const fx = Math.floor(b.x), fz = Math.floor(b.z);
  const web = w.getBlock(fx, Math.floor(b.y + 0.1), fz) === COBWEB || w.getBlock(fx, Math.floor(b.y + b.height * 0.6), fz) === COBWEB;
  let kh = web ? 0.25 : 1;
  const kv = web ? 0.05 : 1;
  // Fase 6.5 (materiales): el slime frena al andar por encima y la nieve polvo hunde despacio.
  if (b.onGround) kh *= groundSpeed(blockUnder(w, b.x, b.y, b.z));
  if (inPowderSnow(w, b.x, b.y, b.z, b.width / 2, b.height)) {
    kh *= POWDER_WALK_FACTOR;
    if (b.vy < -POWDER_SINK_SPEED) b.vy = -POWDER_SINK_SPEED;
  }
  // Fase 7 (pociones): Velocidad y Lentitud; con Caída lenta se baja despacio.
  if (b.speedMul !== undefined) kh *= b.speedMul;
  if (b.slowFall && b.vy < -SLOW_FALL_SPEED) b.vy = -SLOW_FALL_SPEED;
  if (b.levitation !== undefined) b.vy = levitate(b.levVy ?? Math.max(0, b.vy), b.levitation, dt);
  const vy0 = b.vy;
  const r = moveBox(w, b.x, b.y, b.z, b.width, b.height, b.vx * dt * kh, b.vy * dt * kv, b.vz * dt * kh, step, b.onGround);
  b.x += r.dx;
  b.y += r.dy;
  b.z += r.dz;
  if (r.hitX) b.vx = 0;
  if (r.hitZ) b.vz = 0;
  if (r.hitY) b.vy = 0;
  b.onGround = r.onGround;
  // Fase 6.5 (materiales): al caer sobre un bloque de slime, rebota (y no toca el suelo).
  const bounce = r.hitY && vy0 < 0 ? slimeBounce(blockUnder(w, b.x, b.y, b.z), vy0, false) : null;
  if (bounce !== null) {
    b.vy = bounce;
    b.onGround = false;
  }
  b.hitWall = r.hitX || r.hitZ;
  if (b.levitation !== undefined) b.levVy = b.vy;
  updateFluids(b, w);
}

export function updateFluids(b: Body, w: BlockGetter): void {
  const hw = b.width / 2;
  let water = false, lava = false;
  const x0 = Math.floor(b.x - hw), x1 = Math.floor(b.x + hw - EPS);
  const z0 = Math.floor(b.z - hw), z1 = Math.floor(b.z + hw - EPS);
  const y0 = Math.floor(b.y + 0.1), y1 = Math.floor(b.y + Math.max(0.2, b.height * 0.6));
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = w.getBlock(x, y, z);
        if (id <= 0) continue;
        const f = BLOCK_FLUID[id];
        if (f === 1) water = true;
        else if (f === 2) lava = true;
      }
    }
  }
  b.inWater = water;
  b.inLava = lava;
}

/**
 * ¿Hay línea de visión entre dos puntos? Como hasLineOfSight de Java (clip COLLIDER): cuenta la forma de colisión
 * de cada bloque, así que se ve por una puerta abierta o por encima de una losa, pero no a través de una puerta
 * cerrada, un panel de cristal o una pared.
 */
export function lineOfSight(w: BlockGetter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  return clipSegment(w, x0, y0, z0, x1, y1, z1) < 0;
}
