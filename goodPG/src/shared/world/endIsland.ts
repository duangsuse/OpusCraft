// Fase 8.6 (el End): la isla central del dragón, portada de la 26.3.
// - Pilares de obsidiana (SpikeFeature): diez en un anillo de 42 bloques alrededor del centro; su tamaño (0..9,
//   barajado con la semilla del mundo) da el radio (2 + tamaño / 3) y el alto (76 + 3 · tamaño); los de tamaño 1 y 2
//   llevan una jaula de barrotes arriba. Bajan hasta el fondo del mundo, despejan el aire alrededor por encima de
//   y = 65 y arriba tienen lecho de roca con fuego y un cristal del End.
// - Portal de salida (EndPodiumFeature): el podio de lecho de roca en el centro de la isla (radio 3,5), con su columna
//   de cuatro bloques y cuatro antorchas; apagado hasta que muere el dragón (entonces, portal y huevo).
// - Puertas del End (EndGatewayFeature): la puerta con su cruz de lecho de roca; tras cada dragón muerto sale una de
//   las veinte del anillo de 96 bloques a y = 75.
import { AIR, OBSIDIAN, BEDROCK, END_STONE, IRON_BARS, END_PORTAL, END_GATEWAY, WALL_TORCH, stateOf } from '../blocks';
import { hash2 } from '../constants';
import { mulberry32 } from './noise';

export interface EndSpike {
  x: number;
  z: number;
  radius: number;
  height: number;
  guarded: boolean;
}

/** Lo que se lee y escribe al dibujar (el generador o el mundo del servidor). */
export interface EndLevel {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
}

/** Barajado de Fisher–Yates con el azar dado. */
function shuffled(n: number, r: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const spikeCache = new Map<number, EndSpike[]>();

/** Los diez pilares del mundo (SpikeFeature.getSpikesForLevel). */
export function endSpikes(seed: number): EndSpike[] {
  const hit = spikeCache.get(seed);
  if (hit) return hit;
  const sizes = shuffled(10, mulberry32(hash2(seed, 0x5b1e, 0x77)));
  const out: EndSpike[] = [];
  for (let i = 0; i < 10; i++) {
    const a = 2 * (-Math.PI + (Math.PI / 10) * i);
    const size = sizes[i];
    out.push({ x: Math.floor(42 * Math.cos(a)), z: Math.floor(42 * Math.sin(a)), radius: 2 + Math.floor(size / 3), height: 76 + size * 3, guarded: size === 1 || size === 2 });
  }
  if (spikeCache.size > 8) spikeCache.clear();
  spikeCache.set(seed, out);
  return out;
}

/** Dibuja un pilar (sin el cristal: ése es una entidad; sí su lecho de roca y el fuego de debajo si `fire`). */
export function drawSpike(l: EndLevel, s: EndSpike, fireId: number): void {
  const r = s.radius;
  for (let y = 0; y <= s.height + 10; y++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz <= r * r + 1 && y < s.height) l.set(s.x + dx, y, s.z + dz, OBSIDIAN);
        else if (y > 65) l.set(s.x + dx, y, s.z + dz, AIR);
      }
    }
  }
  if (s.guarded) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 3; dy++) {
          if (Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 3) l.set(s.x + dx, s.height + dy, s.z + dz, IRON_BARS);
        }
      }
    }
  }
  l.set(s.x, s.height, s.z, BEDROCK);
  if (fireId > 0) l.set(s.x, s.height + 1, s.z, fireId);
}

/**
 * EndPodiumFeature en `o` (el bloque más alto del centro de la isla): lecho de roca en el círculo de 2,5 (en 3D, como
 * closerThan) por debajo, piedra del End en el anillo hasta 3,5, el borde de lecho de roca a la altura de `o`, dentro
 * portal (encendido) o aire, aire por encima, la columna de cuatro y las antorchas en su tercer bloque.
 */
export function drawPodium(l: EndLevel, ox: number, oy: number, oz: number, active: boolean): void {
  for (let y = oy - 1; y <= oy + 32; y++) {
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const d2 = dx * dx + (y - oy) * (y - oy) + dz * dz;
        const inner = d2 < 2.5 * 2.5;
        if (!inner && d2 >= 3.5 * 3.5) continue;
        const x = ox + dx, z = oz + dz;
        if (y < oy) l.set(x, y, z, inner ? BEDROCK : END_STONE);
        else if (y > oy) l.set(x, y, z, AIR);
        else if (!inner) l.set(x, y, z, BEDROCK);
        else l.set(x, y, z, active ? END_PORTAL : AIR);
      }
    }
  }
  for (let i = 0; i < 4; i++) l.set(ox, oy + i, oz, BEDROCK);
  const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
  for (let f = 0; f < 4; f++) l.set(ox + DX[f], oy + 2, oz + DZ[f], stateOf(WALL_TORCH, { facing: f }));
}

/** EndGatewayFeature en (x, y, z): la puerta, aire a su altura, lecho de roca arriba, abajo y en cruz. */
export function drawGateway(l: EndLevel, x: number, y: number, z: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const sx = dx === 0, sy = dy === 0, sz = dz === 0, top = Math.abs(dy) === 2;
        let id = AIR;
        if (sx && sy && sz) id = END_GATEWAY;
        else if (sy) id = AIR;
        else if (top && sx && sz) id = BEDROCK;
        else if ((sx || sz) && !top) id = BEDROCK;
        l.set(x + dx, y + dy, z + dz, id);
      }
    }
  }
}

/** Las veinte puertas del anillo (EndDragonFight.spawnNewGateway), en el orden en que van saliendo. */
export function gatewayOrder(seed: number): number[] {
  return shuffled(20, mulberry32(hash2(seed, 0x6a7e, 0x33)));
}
export function gatewayPos(i: number): [number, number, number] {
  const a = 2 * (-Math.PI + 0.15707963267948966 * i);
  return [Math.floor(96 * Math.cos(a)), 75, Math.floor(96 * Math.sin(a))];
}

/** Donde se llega por una puerta del End cuya salida no está: la dirección de la puerta a 1024 bloques. */
export function gatewayFarTarget(x: number, z: number): [number, number] {
  const d = Math.hypot(x, z) || 1;
  return [Math.floor((x / d) * 1024), Math.floor((z / d) * 1024)];
}
