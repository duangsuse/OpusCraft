// Fase 7 (redstone) en el cliente:
// - Clic derecho sobre palancas, botones, repetidores (retardo), comparadores (modo), sensores de luz
//   solar (invertir), bloques musicales (tono), polvo suelto (cruz o punto) y la mena de redstone: se
//   predice el bloque nuevo (redstoneUseState) y el servidor lo confirma y hace el resto.
// - Efectos que manda el servidor: chasquidos, notas con su partícula de color, humo de la antorcha
//   que se funde, chispas del pararrayos…
// - Partículas del ambiente: motas rojas del polvo con potencia, de las antorchas encendidas, de los
//   repetidores y comparadores encendidos y de la mena de redstone encendida (las usa ambientParticles).
import {
  isWire, wirePower, isRedstoneTorch, torchLit, isLitRedstoneOre, redstoneOreLit, isDiode, diodePowered, diodeFacing,
  isRepeater, repeaterDelay, stateProps, familyBase, REDSTONE_WALL_TORCH, BLOCK_SOLID,
} from '../../shared/blocks';
import { redstoneUseState } from '../../shared/redstone';
import { ITEMS, type ItemStack } from '../../shared/items';
import { DIR_X, DIR_Z } from '../../shared/blockModels';
import { PF, SPRITE } from '../render/particles/ParticleSystem';
import type { ParticleFx } from '../render/particles/effects';
import { dustColor } from '../textures/genRedstone';
import type { RayHit } from './raycast';
import type { Game } from './Game';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Clic derecho sobre un componente de redstone. true si se usó. */
export function redstoneUse(g: Game, pressed: boolean, hit: RayHit | null, held: ItemStack | null): boolean {
  if (!pressed || !hit) return false;
  // Agachado con algo en la mano se coloca (como en Minecraft).
  if (g.player.sneaking && held) return false;
  // La mena de redstone se enciende al tocarla; con un bloque en la mano se coloca (y se enciende igual).
  if (redstoneOreLit(hit.id, true) && held && ITEMS[held.id]?.block !== undefined) return false;
  const world = g.world!;
  const next = redstoneUseState(hit.id, (dx, dy, dz) => world.getBlock(hit.x + dx, hit.y + dy, hit.z + dz));
  if (next === null) return false;
  if (next !== hit.id) world.setBlock(hit.x, hit.y, hit.z, next);
  g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw });
  g.swing(true);
  return true;
}

/** Color de una nota del bloque musical (0..24): el arcoíris de Minecraft. */
function noteColor(n: number): [number, number, number] {
  const c = n / 24;
  const ch = (o: number) => Math.max(0, Math.sin((c + o) * Math.PI * 2) * 0.65 + 0.35);
  return [ch(0), ch(1 / 3), ch(2 / 3)];
}

/** Mota de polvo de redstone del color de la potencia (0..15). */
export function dustMote(fx: ParticleFx, x: number, y: number, z: number, power = 15, spread = 0): void {
  const [r, g, b] = dustColor(power);
  const k = 1.5 / 255;
  fx.ps.spawn({
    x: x + rnd(-spread, spread), y: y + rnd(-spread, spread) * 0.5, z: z + rnd(-spread, spread), vx: rnd(-0.05, 0.05), vy: rnd(0.02, 0.18),
    vz: rnd(-0.05, 0.05), life: rnd(0.45, 1.1), size: rnd(0.05, 0.085), size1: 0.02, sprite: SPRITE.dust, r: r * k, g: g * k, b: b * k,
    a: 0.95, drag: 1.4, flags: PF.EMISSIVE | PF.FADE_IN,
  });
}

/** Efectos de la redstone que manda el servidor (sonido y partículas); false si no es uno de éstos. */
export function redstoneFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  const fx = g.renderer.entities.pfx;
  switch (kind) {
    case 'lever':
      // Al encenderse, una mota roja (como en Minecraft).
      if (a === 1) dustMote(fx, p[0], p[1], p[2], 15, 0.15);
      break;
    case 'button':
    case 'plate':
    case 'repeater':
    case 'comparator':
    case 'tripwire':
    case 'openable':
    case 'target':
      break;
    case 'bulb':
      if (a === 1) fx.sparkles(p[0], p[1], p[2], 6, 0.55, [1.8, 1.2, 0.5]);
      break;
    case 'torch_burnout':
      fx.smoke(p[0], p[1], p[2], 5, 0.12, 0.3, 0.1, 1.3);
      for (let i = 0; i < 4; i++) dustMote(fx, p[0], p[1], p[2], 15, 0.1);
      break;
    case 'rod_spark':
      // Chispas eléctricas azuladas por el asta.
      for (let i = 0; i < 14; i++) {
        fx.ps.spawn({
          x: p[0] + rnd(-0.2, 0.2), y: p[1] + rnd(-0.5, 0.6), z: p[2] + rnd(-0.2, 0.2), vx: rnd(-1.5, 1.5), vy: rnd(-0.5, 2), vz: rnd(-1.5, 1.5),
          life: rnd(0.15, 0.4), size: rnd(0.04, 0.08), size1: 0.01, sprite: SPRITE.spark, r: 1.6, g: 2.6, b: 4, drag: 2,
          flags: PF.EMISSIVE | PF.STRETCH,
        });
      }
      break;
    case 'note': {
      const [r, gg, bb] = noteColor(b ?? 0);
      fx.ps.spawn({
        x: p[0], y: p[1], z: p[2], vy: 1.4, life: 0.7, size: 0.3, size1: 0.26, sprite: SPRITE.note, r, g: gg, b: bb, drag: 3.5,
        light: 0xff, flags: PF.BRIGHT,
      });
      break;
    }
    default:
      return false;
  }
  g.audio.playRedstoneSfx(kind, p, a ?? 0, b ?? 0);
  return true;
}

// ------------------------------------------------------------------ partículas del ambiente

/** Punta de una antorcha de redstone encendida (fuente fija de motas); null si no es una. */
export function redstoneTorchTip(b: number, x: number, y: number, z: number): [number, number, number] | null {
  if (!isRedstoneTorch(b) || !torchLit(b)) return null;
  if (familyBase(b) !== REDSTONE_WALL_TORCH) return [x + 0.5, y + 0.7, z + 0.5];
  const f = stateProps(b)?.facing ?? 0;
  return [x + 0.5 - DIR_X[f] * 0.12, y + 0.86, z + 0.5 - DIR_Z[f] * 0.12];
}

/**
 * Motas de un bloque de redstone muestreado al azar (polvo con potencia, mena encendida, repetidores y
 * comparadores encendidos); true si era uno de éstos. `getBlock` da los vecinos.
 */
export function redstoneAmbient(fx: ParticleFx, getBlock: (x: number, y: number, z: number) => number, b: number, x: number, y: number, z: number): boolean {
  if (isWire(b)) {
    const p = wirePower(b);
    if (p > 0 && Math.random() < 0.4 + p / 25) dustMote(fx, x + rnd(0.25, 0.75), y + 0.08, z + rnd(0.25, 0.75), p);
    return true;
  }
  if (isLitRedstoneOre(b)) {
    // Una mota en cada cara que da al aire.
    for (let f = 0; f < 6; f++) {
      const ax = f >> 1, side = f & 1;
      const n = [0, 0, 0];
      n[ax] = side ? 1 : -1;
      const nb = getBlock(x + n[0], y + n[1], z + n[2]);
      if (nb > 0 && BLOCK_SOLID[nb]) continue;
      const o = [rnd(0, 1), rnd(0, 1), rnd(0, 1)];
      o[ax] = side ? 1.06 : -0.06;
      dustMote(fx, x + o[0], y + o[1], z + o[2]);
    }
    return true;
  }
  if (isDiode(b)) {
    if (!diodePowered(b) || Math.random() < 0.5) return true;
    // Sobre una de sus antorchas: en el repetidor, la de delante o la del retardo; en el comparador,
    // una de las dos de atrás (a lo largo de la salida y de lado, en dieciseisavos desde el centro).
    const f = diodeFacing(b), ax = DIR_X[f], az = DIR_Z[f], sx = -az, sz = ax;
    let along: number, side = 0;
    if (isRepeater(b)) along = Math.random() < 0.5 ? 5 : 1 - repeaterDelay(b) * 2;
    else {
      along = -4;
      side = Math.random() < 0.5 ? 3 : -3;
    }
    dustMote(fx, x + 0.5 + (ax * along + sx * side) / 16, y + 0.5, z + 0.5 + (az * along + sz * side) / 16);
    return true;
  }
  return false;
}
