// Fase 7 (mecanismos) en el cliente:
// - Lo que mueve un pistón se ve deslizarse: el servidor avisa de cada bloque que se mueve ('pmove': de
//   dónde sale, qué bloque es y hacia dónde va) y aquí se dibuja suelto mientras su sitio es un «bloque
//   en movimiento» (invisible) y un poco más, hasta que el bloque asentado ya está en la malla. Al
//   recogerse, la base extendida se dibuja quieta en su celda (también es un bloque en movimiento) mientras
//   la cabeza entra en ella.
// - Al jugador lo aparta su propio cliente (como en Minecraft): si un bloque que se mueve le alcanza, lo
//   empuja; si es de slime, lo lanza; si es de miel y lo tiene encima, se lo lleva.
// - Dinamita encendida: el bloque que parpadea en blanco y se hincha justo antes de explotar.
// - Efectos: el pistón, el clic y el humo del dispensador y del soltador, y la mecha.
// - La armadura que le pone al jugador un dispensador ('equip').
import { mat4 } from 'gl-matrix';
import { BLOCK_COLLIDE, SLIME_BLOCK, HONEY_BLOCK, MOVING_BLOCK, isValidBlockId } from '../../shared/blocks';
import { FACE_X, FACE_Y, FACE_Z } from '../../shared/redstone';
import { ITEMS } from '../../shared/items';
import { PISTON_MOVE_TICKS, PMOVE_STILL } from '../../shared/mechanisms';
import { sanitizeStack } from '../../shared/containers';
import type { ServerMsg } from '../../shared/protocol';
import type { ItemDraw, ItemRenderer } from '../render/ItemRenderer';
import type { ClientEntity } from './ClientEntities';
import type { Game } from './Game';

/** Lo que tarda en deslizarse (s). */
const MOVE_SECONDS = PISTON_MOVE_TICKS / 20;
/** Tiempo que se sigue dibujando tras asentarse (lo que tarda en rehacerse la malla del chunk). */
const LINGER = 0.2;
/** Velocidad (bloques/s) con la que lanza el slime (1 bloque por tick). */
const SLIME_LAUNCH = 20;

interface Moving {
  block: number;
  /** Celda de la que sale y dirección (cara). */
  x: number;
  y: number;
  z: number;
  dir: number;
  /** Cuándo empezó (s), cuándo se asentó (−1 aún no) y si ya se vio su hueco de bloque en movimiento. */
  t0: number;
  settled: number;
  seen: boolean;
  /** Ya lanzó al jugador (el slime) y el avance del frame anterior (la miel lo lleva pegado). */
  launched: boolean;
  lastK: number;
}

type LightOf = (x: number, y: number, z: number) => [number, number];

const now = () => performance.now() / 1000;

/** Paso de una dirección de 'pmove' en cada eje (lo que se dibuja quieto no se mueve). */
const stepX = (dir: number) => (dir === PMOVE_STILL ? 0 : FACE_X[dir]);
const stepY = (dir: number) => (dir === PMOVE_STILL ? 0 : FACE_Y[dir]);
const stepZ = (dir: number) => (dir === PMOVE_STILL ? 0 : FACE_Z[dir]);

export class MechanismsClient {
  private moving: Moving[] = [];

  constructor(private g: Game) {}

  /** Un bloque empieza a deslizarse desde la celda (x, y, z) hacia `dir` (PMOVE_STILL: se queda en ella). */
  add(block: number, x: number, y: number, z: number, dir: number): void {
    if (!isValidBlockId(block) || dir < 0 || dir > PMOVE_STILL || this.moving.length > 512) return;
    this.moving.push({ block, x, y, z, dir, t0: now(), settled: -1, seen: false, launched: false, lastK: 0 });
  }

  /** Avance (0..1) de un bloque que se mueve (ya asentado, 1: está donde el bloque de verdad). */
  private progress(m: Moving, t: number): number {
    return m.settled >= 0 ? 1 : Math.max(0, Math.min(1, (t - m.t0) / MOVE_SECONDS));
  }

  /** Mensajes del servidor: la armadura que pone un dispensador. true si era uno de éstos. */
  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'equip') return false;
    const st = sanitizeStack(msg.s);
    const slot = st ? ITEMS[st.id]?.armor?.slot : undefined;
    if (!st || slot === undefined) return true;
    const inv = this.g.inv;
    if (!inv.armor[slot]) {
      inv.armor[slot] = { ...st, count: 1 };
      inv.changed();
    } else {
      const rest = inv.add({ ...st, count: 1 });
      if (rest) this.g.interaction.throwStack(rest, false);
    }
    this.g.audio.playUi('click');
    return true;
  }

  /** Cada frame: se retiran los que ya se asentaron y se aparta al jugador. */
  update(): void {
    if (this.moving.length === 0) return;
    const t = now();
    const world = this.g.world;
    const p = this.g.player;
    this.moving = this.moving.filter((m) => {
      const dx = m.x + stepX(m.dir), dy = m.y + stepY(m.dir), dz = m.z + stepZ(m.dir);
      // Se asienta cuando su hueco (que ya se vio) pasa a ser el bloque de verdad; si no llegó a verse, al rato.
      const b = world ? world.getBlock(dx, dy, dz) : MOVING_BLOCK;
      if (b === MOVING_BLOCK) m.seen = true;
      if (m.settled < 0 && ((m.seen && b !== MOVING_BLOCK) || t - m.t0 > MOVE_SECONDS + 0.3)) m.settled = t;
      return m.settled < 0 ? t - m.t0 < 3 : t - m.settled < LINGER;
    });
    if (this.g.vehicles.active || this.g.riding.active) return;
    const hw = 0.3, h = p.height;
    for (const m of this.moving) {
      if (!BLOCK_COLLIDE[m.block] || m.settled >= 0 || m.dir === PMOVE_STILL) continue;
      const k = this.progress(m, t);
      const prev = m.lastK;
      m.lastK = k;
      const ax = FACE_X[m.dir], ay = FACE_Y[m.dir], az = FACE_Z[m.dir];
      const bx = m.x + ax * k, by = m.y + ay * k, bz = m.z + az * k;
      const touching = p.x + hw > bx - 0.02 && p.x - hw < bx + 1.02 && p.y + h > by - 0.02 && p.y < by + 1.02 && p.z + hw > bz - 0.02 && p.z - hw < bz + 1.02;
      if (!touching) continue;
      // La miel se lleva al jugador que está encima cuando se mueve de lado (como en Minecraft).
      if (m.block === HONEY_BLOCK && ay === 0 && p.y >= by + 0.98 && p.y < by + 1.5) {
        p.x += ax * (k - prev);
        p.z += az * (k - prev);
        continue;
      }
      // Sólo le alcanza si está por delante (no detrás del bloque que se aleja).
      const front = ax * (p.x - (bx + 0.5)) + ay * (p.y + h / 2 - (by + 0.5)) + az * (p.z - (bz + 0.5)) > -0.6;
      if (!front) continue;
      // Lo que tiene que moverse para quedar fuera de la cara de delante del bloque.
      const need = ax > 0 ? bx + 1 - (p.x - hw) : ax < 0 ? p.x + hw - bx : ay > 0 ? by + 1 - p.y : ay < 0 ? p.y + h - by : az > 0 ? bz + 1 - (p.z - hw) : p.z + hw - bz;
      if (need > 0 && need < 1.1) {
        p.x += ax * need;
        p.y += ay * need;
        p.z += az * need;
        if (ay > 0) {
          p.vy = Math.max(p.vy, 0);
          p.fallDistance = 0;
        }
      }
      if (m.block === SLIME_BLOCK && !m.launched) {
        m.launched = true;
        if (ax) p.vx = ax * SLIME_LAUNCH;
        if (ay) p.vy = ay * SLIME_LAUNCH;
        if (az) p.vz = az * SLIME_LAUNCH;
        p.onGround = false;
      }
    }
  }

  /** Lo que se dibuja de los bloques que se mueven. */
  draws(items: ItemRenderer, camX: number, camY: number, camZ: number, lightOf: LightOf): ItemDraw[] {
    if (this.moving.length === 0) return [];
    const t = now();
    const out: ItemDraw[] = [];
    for (const m of this.moving) {
      const model = items.stateModel(m.block);
      if (!model) continue;
      const k = this.progress(m, t);
      const x = m.x + stepX(m.dir) * k, y = m.y + stepY(m.dir) * k, z = m.z + stepZ(m.dir) * k;
      const mm = mat4.create();
      mat4.translate(mm, mm, [x + 0.5 - camX, y + 0.5 - camY, z + 0.5 - camZ]);
      // Un pelo más pequeño: no pelea con el bloque asentado mientras se rehace la malla.
      if (m.settled >= 0) mat4.scale(mm, mm, [0.998, 0.998, 0.998]);
      out.push({ model, m: mm, light: lightOf(x + 0.5, y + 0.5, z + 0.5) });
    }
    return out;
  }
}

/** Dinamita encendida: parpadea en blanco cada 5 ticks y se hincha en los últimos 10. */
export function pushPrimedTnt(out: ItemDraw[], e: ClientEntity, items: ItemRenderer, rx: number, ry: number, rz: number, lightOf: LightOf): void {
  const fuse = e.count - e.age * 20;
  let s = 1;
  if (fuse < 10) {
    const f = Math.max(0, Math.min(1, 1 - fuse / 10));
    s = 1 + Math.pow(f, 4) * 0.3;
  }
  const flash = Math.floor(fuse / 5) % 2 === 0;
  const m = mat4.create();
  mat4.translate(m, m, [rx, ry + 0.49, rz]);
  mat4.scale(m, m, [0.98 * s, 0.98 * s, 0.98 * s]);
  const light = lightOf(e.x, e.y + 0.5, e.z);
  if (flash) out.push({ model: items.textureCube('snow'), m, light: [0, 1], tint: [1.25, 1.25, 1.25] });
  else out.push({ model: items.blockModel(e.item), m, light });
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Efectos de los mecanismos que manda el servidor (sonido y partículas); false si no es uno de éstos. */
export function mechanismFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  const fx = g.renderer.entities.pfx;
  switch (kind) {
    case 'pmove':
      // Un bloque que empieza a moverse (p: la celda de la que sale; a: el bloque; b: la dirección o PMOVE_STILL).
      g.mechanisms.add(a ?? 0, Math.round(p[0]), Math.round(p[1]), Math.round(p[2]), b ?? 0);
      return true;
    case 'piston':
      g.audio.playMechanismSfx('piston', p, a ?? 0);
      return true;
    case 'dispense': {
      g.audio.playMechanismSfx('dispense', p, a ?? 0);
      // Humo que sale por delante.
      const d = b ?? 0;
      const x = p[0] + FACE_X[d] * 0.6, y = p[1] + FACE_Y[d] * 0.6, z = p[2] + FACE_Z[d] * 0.6;
      for (let i = 0; i < 5; i++) fx.smoke(x + rnd(-0.1, 0.1), y + rnd(-0.1, 0.1), z + rnd(-0.1, 0.1), 1, 0.08, 0.5, 0.1, 0.4);
      return true;
    }
    case 'dispense_fail':
      g.audio.playMechanismSfx('dispense_fail', p);
      return true;
    case 'tnt_primed':
      // La mecha: el mismo siseo que el del creeper (como en Minecraft) y algo de humo.
      g.audio.playMob('creeper', 'fuse', p);
      fx.smoke(p[0], p[1] + 0.5, p[2], 3, 0.1, 0.5, 0.1, 0.6);
      return true;
    case 'bucket_empty':
    case 'bucket_fill':
      g.audio.playSplash(p, 0.4);
      return true;
    case 'bucket_empty_lava':
    case 'bucket_fill_lava':
      fx.smoke(p[0], p[1], p[2], 4, 0.2, 0.3, 0.12, 0.6);
      return true;
  }
  return false;
}
