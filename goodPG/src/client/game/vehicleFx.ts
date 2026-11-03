// Fase 7 (transporte): sonidos y partículas de las barcas y vagonetas.
// - Avisos del servidor: poner, golpear, romper (astillas de madera o de hierro) y subirse una criatura.
// - Cada frame: chapoteo de cada palada (y salpicaduras) de las barcas que reman, estela de las que van
//   rápido por el agua, traqueteo de las vagonetas en cada junta de la vía y humo de la de horno.
import { textureLayer } from '../../shared/textureDefs';
import { BOAT_WOODS, RAFT_VARIANT, VF_PADDLE_L, VF_PADDLE_R, VF_LIT, isBoatType, isCartType, isVehicleType } from '../../shared/vehicles';
import { BLOCK_FLUID } from '../../shared/blocks';
import type { ClientEntity } from './ClientEntities';
import type { Game } from './Game';

/** Tiempo entre paladas (una vuelta del remo: 16 ticks). */
const STROKE = 0.8;

interface Track {
  /** Tiempo hasta la próxima palada, celda en la que estaba y última posición. */
  stroke: number;
  cell: string;
  x: number;
  z: number;
  smoke: number;
  wake: number;
}

const tracks = new Map<number, Track>();

/** Capa de textura para las astillas: los tablones de su madera o el hierro. */
function chipLayer(type: number, variant: number): number {
  if (isCartType(type)) return textureLayer('iron_block');
  const wood = variant === RAFT_VARIANT ? 'bamboo' : BOAT_WOODS[Math.max(0, Math.min(BOAT_WOODS.length - 1, variant))];
  return textureLayer(`${wood}_planks`);
}

/** Avisos 'fx' del transporte (a: tipo de entidad). true si era uno de ellos. */
export function transportFx(g: Game, kind: string, p: [number, number, number], a?: number): boolean {
  if (!kind.startsWith('vehicle_')) return false;
  const type = a ?? 0;
  const metal = isCartType(type) ? 1 : 0;
  g.audio.playTransportSfx(kind, p, metal);
  const pfx = g.renderer.entities.pfx;
  if (kind === 'vehicle_break' || kind === 'vehicle_hit') {
    // La variante (madera) no viene en el aviso: la de la barca más cercana a ese punto.
    let variant = 0, best = 4;
    for (const e of g.ents.list.values()) {
      if (e.type !== type) continue;
      const d = Math.hypot(e.x - p[0], e.z - p[2]);
      if (d < best) {
        best = d;
        variant = e.variant;
      }
    }
    pfx.chips(p[0] - 0.5, p[1] - 0.3, p[2] - 0.5, chipLayer(type, variant), 0xf0, kind === 'vehicle_break' ? 30 : 6);
  } else if (kind === 'vehicle_place' && isBoatType(type)) {
    const id = g.world?.getBlock(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])) ?? 0;
    if (id > 0 && BLOCK_FLUID[id] === 1) pfx.splash(p[0], p[1] + 0.3, p[2], 10);
  }
  return true;
}

function wetAt(g: Game, x: number, y: number, z: number): boolean {
  const id = g.world?.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) ?? 0;
  return id > 0 && BLOCK_FLUID[id] === 1;
}

/** Cada frame: remos, estelas, traqueteo y humo. */
export function vehicleFrame(g: Game, dt: number): void {
  if (dt <= 0) return;
  const pl = g.player;
  for (const [id] of tracks) if (!g.ents.list.has(id)) tracks.delete(id);
  for (const e of g.ents.list.values()) {
    if (!isVehicleType(e.type) || e.gone) continue;
    if (Math.abs(e.x - pl.x) > 48 || Math.abs(e.z - pl.z) > 48) continue;
    let t = tracks.get(e.id);
    if (!t) tracks.set(e.id, (t = { stroke: STROKE * 0.5, cell: '', x: e.x, z: e.z, smoke: 0, wake: 0 }));
    const speed = Math.hypot(e.x - t.x, e.z - t.z) / dt;
    t.x = e.x;
    t.z = e.z;
    if (isBoatType(e.type)) boatFrame(g, e, t, dt, speed);
    else cartFrame(g, e, t, dt, speed);
  }
}

function boatFrame(g: Game, e: ClientEntity, t: Track, dt: number, speed: number): void {
  const pfx = g.renderer.entities.pfx;
  const rowing = e.flags & (VF_PADDLE_L | VF_PADDLE_R);
  const wet = wetAt(g, e.x, e.y + 0.2, e.z) || wetAt(g, e.x, e.y - 0.2, e.z);
  if (rowing) {
    t.stroke -= dt;
    if (t.stroke <= 0) {
      t.stroke += STROKE;
      g.audio.playTransportSfx(wet ? 'paddle' : 'paddle_land', [e.x, e.y + 0.3, e.z]);
      if (wet) {
        // Salpicadura donde entra cada pala (a los lados, algo por detrás).
        for (const [bit, side] of [[VF_PADDLE_L, -1], [VF_PADDLE_R, 1]] as const) {
          if (!(e.flags & bit)) continue;
          const sx = Math.cos(e.yaw) * side * 1.1 + Math.sin(e.yaw) * 0.2, sz = -Math.sin(e.yaw) * side * 1.1 + Math.cos(e.yaw) * 0.2;
          pfx.splash(e.x + sx, e.y + 0.4, e.z + sz, 5);
        }
      }
    }
  } else t.stroke = STROKE * 0.35;
  // Estela: burbujas y salpicaduras detrás si va rápido por el agua.
  if (wet && speed > 3) {
    t.wake -= dt;
    if (t.wake <= 0) {
      t.wake = Math.max(0.03, 0.2 - speed * 0.01);
      const bx = e.x + Math.sin(e.yaw) * 1, bz = e.z + Math.cos(e.yaw) * 1;
      pfx.splash(bx, e.y + 0.35, bz, 2);
    }
  }
}

function cartFrame(g: Game, e: ClientEntity, t: Track, dt: number, speed: number): void {
  const cell = `${Math.floor(e.x)},${Math.floor(e.y + 0.1)},${Math.floor(e.z)}`;
  if (cell !== t.cell) {
    if (t.cell && speed > 0.8) g.audio.playTransportSfx('cart_roll', [e.x, e.y + 0.3, e.z], Math.min(1, speed / 8));
    t.cell = cell;
  }
  if (e.flags & VF_LIT) {
    t.smoke -= dt;
    if (t.smoke <= 0) {
      t.smoke = 0.12;
      g.renderer.entities.pfx.smoke(e.x, e.y + 1.05, e.z, 1, 0.1, 0.25, 0.3, 1.0);
    }
  }
}
