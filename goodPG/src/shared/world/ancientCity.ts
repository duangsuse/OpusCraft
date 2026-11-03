// Fase 7.5 (abismo): la ciudad antigua. Está en el Deep Dark, con el suelo a y = −51, dentro de una
// caverna enorme: en el centro, sobre una plataforma, el gran marco de pizarra profunda reforzada con la
// silueta de la cabeza del warden (el «portal»); cuatro avenidas de ladrillos de pizarra profunda y,
// entre ellas, manzanas con casas, torres, fogatas de alma, neveras (con su cofre de hielo), ruinas y
// estatuas. Todo cubierto de sculk, con sensores, chilladores que pueden invocar al warden, velas
// apagadas, cabezas de esqueleto, lana gris y cofres con el botín de Minecraft (loot 'ancient_city').
//
// El plano se decide una vez por ciudad (semilla y posición) y cada chunk dibuja sólo lo que le cae
// dentro: cada pieza se recorta a su chunk.
import {
  AIR, SCULK, SCULK_SENSOR, SCULK_CATALYST, REINFORCED_DEEPSLATE, DEEPSLATE, COBBLED_DEEPSLATE, POLISHED_DEEPSLATE,
  DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS, DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES, CHISELED_DEEPSLATE, SLABS, STAIRS,
  WALLS, WOOL, CARPETS, CANDLE, PACKED_ICE, BLUE_ICE, SNOW_BLOCK, SOUL_SAND, SOUL_FIRE, SOUL_LANTERN, SKULLS, DARK_OAK_PLANKS,
  FENCES, BLOCK_FLUID, stateOf, candleState, shriekerFor, veinWith, BLOCK_OPAQUE, LADDER, TRAPDOORS,
} from '../blocks';
import { hash2, hash3 } from '../constants';
import { mulberry32 } from './noise';
import { deepDarkColumn } from './deepDark';
import type { TerrainGenerator, ColumnInfo } from './terrain';

/** Altura del suelo de la ciudad y radio de la caverna (bloques). */
export const ANCIENT_CITY_Y = -51;
export const ANCIENT_CITY_RADIUS = 58;
/** Alto de la bóveda de la caverna en el centro. */
const DOME = 26;

/** Lo que usa la ciudad del lienzo del chunk (la clase Canvas de structures.ts). */
export interface CityCanvas {
  readonly x0: number;
  readonly z0: number;
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
  chest(x: number, y: number, z: number, facing: number, table: string): void;
}

export interface CityStart {
  x: number;
  y: number;
  z: number;
  rng: number;
}

const tmp: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

/**
 * ¿Puede haber una ciudad con centro en (x, z)? Tiene que ser Deep Dark en el centro y alrededor, y con
 * roca de sobra por encima. Devuelve la altura del suelo o null.
 */
export function ancientCitySite(gen: TerrainGenerator, x: number, z: number): number | null {
  const r = ANCIENT_CITY_RADIUS - 10;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (!deepDarkColumn(gen, x + dx, z + dz)) return null;
  const top = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp));
  return top > ANCIENT_CITY_Y + DOME + 24 ? ANCIENT_CITY_Y : null;
}

// ------------------------------------------------------------------ plano

type Kind = 'house' | 'tower' | 'ice_box' | 'camp' | 'ruin' | 'statue' | 'garden' | 'barracks';

interface Lot {
  kind: Kind;
  /** Esquina mínima (u, v) relativa al centro y tamaño. */
  u: number;
  v: number;
  size: number;
  seed: number;
  /** Lado hacia la avenida más cercana (0 N, 1 E, 2 S, 3 O): ahí va la entrada. */
  door: number;
}

interface Plan {
  lots: Lot[];
  /** El portal mira a lo largo de x (true) o de z. */
  alongX: boolean;
  /** Pasarelas elevadas entre torres vecinas (índices en lots). */
  bridges: [number, number][];
}

const plans = new Map<string, Plan>();

function planOf(s: CityStart): Plan {
  const key = `${s.x},${s.z},${s.rng}`;
  let p = plans.get(key);
  if (p) return p;
  if (plans.size > 64) plans.clear();
  const rnd = mulberry32(s.rng);
  const lots: Lot[] = [];
  const kinds: Kind[] = ['house', 'house', 'barracks', 'tower', 'camp', 'ruin', 'statue', 'garden', 'ice_box', 'ruin', 'house', 'tower'];
  const R = ANCIENT_CITY_RADIUS - 6;
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const size = 11;
          const a = 21 + i * 13, b = 21 + j * 13;
          // Lo más lejano del solar tiene que quedar dentro de la caverna.
          if (Math.hypot(a + size, b + size) > R + 4) continue;
          const u = su > 0 ? a : -a - size + 1, v = sv > 0 ? b : -b - size + 1;
          const kind = kinds[Math.floor(rnd() * kinds.length)];
          // La entrada da a la avenida más cercana.
          const door = a < b ? (su > 0 ? 3 : 1) : (sv > 0 ? 0 : 2);
          lots.push({ kind, u, v, size, seed: Math.floor(rnd() * 2 ** 31), door });
        }
      }
    }
  }
  // Una nevera como mínimo (como en Minecraft).
  if (!lots.some((l) => l.kind === 'ice_box') && lots.length) lots[Math.floor(rnd() * lots.length)].kind = 'ice_box';
  // Pasarelas: entre dos torres de solares contiguos (en la misma fila o columna).
  const bridges: [number, number][] = [];
  lots.forEach((a, i) => lots.forEach((b, j) => {
    if (j <= i || a.kind !== 'tower' || b.kind !== 'tower') return;
    const near = (a.u === b.u && Math.abs(a.v - b.v) === 13) || (a.v === b.v && Math.abs(a.u - b.u) === 13);
    if (near && towerHeight(a) >= BRIDGE_Y + 3 && towerHeight(b) >= BRIDGE_Y + 3) bridges.push([i, j]);
  }));
  p = { lots, alongX: (s.rng & 1) === 0, bridges };
  plans.set(key, p);
  return p;
}

// ------------------------------------------------------------------ dibujo

/** Pinta dentro del chunk con coordenadas relativas al centro (u = x − cx, v = z − cz, y absoluta). */
class Draw {
  constructor(readonly c: CityCanvas, readonly cx: number, readonly y0: number, readonly cz: number, readonly seed: number) {}

  /** ¿Toca el rectángulo (u0..u1, v0..v1) este chunk? */
  touches(u0: number, v0: number, u1: number, v1: number): boolean {
    const x0 = this.cx + u0, x1 = this.cx + u1, z0 = this.cz + v0, z1 = this.cz + v1;
    return x1 >= this.c.x0 && x0 <= this.c.x0 + 15 && z1 >= this.c.z0 && z0 <= this.c.z0 + 15;
  }

  set(u: number, y: number, v: number, id: number): void {
    this.c.set(this.cx + u, y, this.cz + v, id);
  }

  get(u: number, y: number, v: number): number {
    return this.c.get(this.cx + u, y, this.cz + v);
  }

  /** Recorre las celdas del rectángulo que caen en el chunk. */
  each(u0: number, v0: number, u1: number, v1: number, fn: (u: number, v: number) => void): void {
    const a0 = Math.max(u0, this.c.x0 - this.cx), a1 = Math.min(u1, this.c.x0 + 15 - this.cx);
    const b0 = Math.max(v0, this.c.z0 - this.cz), b1 = Math.min(v1, this.c.z0 + 15 - this.cz);
    for (let v = b0; v <= b1; v++) for (let u = a0; u <= a1; u++) fn(u, v);
  }

  fill(u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, id: number | ((u: number, y: number, v: number) => number)): void {
    this.each(u0, v0, u1, v1, (u, v) => {
      for (let y = y0; y <= y1; y++) {
        const b = typeof id === 'number' ? id : id(u, y, v);
        if (b >= 0) this.set(u, y, v, b);
      }
    });
  }

  chest(u: number, y: number, v: number, facing: number, table: string): void {
    this.c.chest(this.cx + u, y, this.cz + v, facing, table);
  }

  /** Número al azar fijo para una celda (0..1). */
  r(u: number, y: number, v: number, salt = 0): number {
    return (hash3(this.cx + u, y, this.cz + v, this.seed ^ salt) & 0xffff) / 65536;
  }
}

/** Ladrillos de pizarra profunda (algunos agrietados). */
const brick = (d: Draw, u: number, y: number, v: number) => (d.r(u, y, v, 1) < 0.18 ? CRACKED_DEEPSLATE_BRICKS : DEEPSLATE_BRICKS);
const tile = (d: Draw, u: number, y: number, v: number) => (d.r(u, y, v, 2) < 0.15 ? CRACKED_DEEPSLATE_TILES : DEEPSLATE_TILES);
const unlitCandles = (n: number) => candleState(CANDLE, n, false);

export function buildAncientCity(c: CityCanvas, s: CityStart): void {
  const R = ANCIENT_CITY_RADIUS;
  if (s.x + R < c.x0 || s.x - R > c.x0 + 15 || s.z + R < c.z0 || s.z - R > c.z0 + 15) return;
  const plan = planOf(s);
  const d = new Draw(c, s.x, s.y, s.z, s.rng);
  carveCavern(d);
  streets(d);
  centerPiece(d, plan.alongX);
  for (const lot of plan.lots) if (d.touches(lot.u - 1, lot.v - 1, lot.u + lot.size, lot.v + lot.size)) buildLot(d, lot);
  for (const [i, j] of plan.bridges) bridge(d, plan.lots[i], plan.lots[j]);
  overgrow(d);
}

/** La caverna: una bóveda de 26 bloques sobre un suelo firme (sin fluidos debajo). */
function carveCavern(d: Draw): void {
  const R = ANCIENT_CITY_RADIUS, y0 = d.y0;
  d.each(-R, -R, R, R, (u, v) => {
    const r = Math.hypot(u, v);
    if (r > R) return;
    const wob = (hash2(d.cx + u, d.cz + v, d.seed ^ 0xca7e) & 3) - 1;
    const h = Math.floor(DOME * Math.sqrt(Math.max(0, 1 - (r / R) ** 2))) + wob;
    for (let y = y0; y <= y0 + h; y++) d.set(u, y, v, AIR);
    // Suelo: pizarra (y sculk encima más tarde); debajo, roca maciza hasta 5 bloques.
    d.set(u, y0 - 1, v, d.r(u, y0, v, 3) < 0.12 ? COBBLED_DEEPSLATE : DEEPSLATE);
    for (let y = y0 - 6; y < y0 - 1; y++) {
      const b = d.get(u, y, v);
      if (b === AIR || (b > 0 && BLOCK_FLUID[b])) d.set(u, y, v, DEEPSLATE);
    }
    // El techo que queda encima no puede ser un fluido suelto.
    const top = d.get(u, y0 + h + 1, v);
    if (top > 0 && BLOCK_FLUID[top]) d.set(u, y0 + h + 1, v, DEEPSLATE);
  });
}

/** Plaza del centro y las cuatro avenidas. */
function streets(d: Draw): void {
  const y = d.y0 - 1, R = ANCIENT_CITY_RADIUS - 7;
  // Plaza: azulejos con un damero de pizarra pulida.
  d.each(-19, -19, 19, 19, (u, v) => {
    const edge = Math.max(Math.abs(u), Math.abs(v)) === 19;
    d.set(u, y, v, edge ? POLISHED_DEEPSLATE : (u + v) & 1 ? tile(d, u, y, v) : POLISHED_DEEPSLATE);
  });
  // Avenidas de 7 de ancho: bordes de pizarra pulida y ladrillos en el centro.
  const avenue = (u: number, v: number, off: number) => {
    if (Math.abs(off) > 3) return;
    d.set(u, y, v, Math.abs(off) === 3 ? POLISHED_DEEPSLATE : brick(d, u, y, v));
  };
  d.each(-R, -3, R, 3, (u, v) => {
    if (Math.abs(u) > 19) avenue(u, v, v);
  });
  d.each(-3, -R, 3, R, (u, v) => {
    if (Math.abs(v) > 19) avenue(u, v, u);
  });
  // Farolas de alma a lo largo de las avenidas (sobre un muro de ladrillo).
  for (const k of [26, 40]) for (const [pu, pv] of [[k, 4], [-k, -4], [4, -k], [-4, k]]) lampPost(d, pu, pv);
}

/** Silueta del marco (21 × 16, de arriba abajo): R pizarra reforzada. */
const PORTAL = [
  'RR.................RR',
  'RRR...............RRR',
  '.RRR.............RRR.',
  '..RRRRRRRRRRRRRRRRR..',
  '..RRR...........RRR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RR.............RR..',
  '..RRR...........RRR..',
  '.RRRRRRRRRRRRRRRRRRR.',
  'RRRRRRRRRRRRRRRRRRRRR',
];

/** El centro: plataforma con escalinatas, el gran marco y dos muros de costillas a los lados. */
function centerPiece(d: Draw, alongX: boolean): void {
  const y = d.y0;
  // Coordenadas del marco: a lo largo (a) y de frente (b).
  const P = (a: number, b: number): [number, number] => (alongX ? [a, b] : [b, a]);
  const box = (a0: number, b0: number, a1: number, b1: number, y0: number, y1: number, id: number | ((u: number, y: number, v: number) => number)) => {
    const [u0, v0] = P(a0, b0), [u1, v1] = P(a1, b1);
    d.fill(Math.min(u0, u1), y0, Math.min(v0, v1), Math.max(u0, u1), y1, Math.max(v0, v1), id);
  };
  // Plataforma de 2 alturas.
  box(-14, -8, 14, 8, y, y, (u, yy, v) => brick(d, u, yy, v));
  box(-12, -5, 12, 5, y + 1, y + 1, (u, yy, v) => tile(d, u, yy, v));
  // Escalinatas por delante y por detrás (suben hacia el marco).
  for (let a = -4; a <= 4; a++) {
    for (const b of [9, -9, 6, -6]) {
      const [u, v] = P(a, b);
      const facing = alongX ? (b > 0 ? 0 : 2) : b > 0 ? 3 : 1;
      d.set(u, Math.abs(b) === 9 ? y : y + 1, v, stateOf(STAIRS.deepslate_tile, { facing, half: 0 }));
    }
  }
  // El marco (dos de grueso) sobre la plataforma.
  for (let row = 0; row < PORTAL.length; row++) {
    const yy = y + 2 + (PORTAL.length - 1 - row);
    for (let col = 0; col < 21; col++) {
      if (PORTAL[row][col] !== 'R') continue;
      for (const b of [0, 1]) {
        const [u, v] = P(col - 10, b);
        d.set(u, yy, v, REINFORCED_DEEPSLATE);
      }
    }
  }
  // Costillas: a los lados del marco, pilares de pizarra pulida con capitel cincelado, unidos arriba por
  // arcos de escaleras invertidas y una viga de losas; faroles de alma colgados entre los pilares.
  for (const side of [-1, 1]) {
    for (let b = -7; b <= 7; b++) {
      const [u, v] = P(side * 13, b);
      const top = y + 9 - Math.floor(Math.abs(b) / 3);
      if (Math.abs(b) % 3 === 0) {
        for (let yy = y + 1; yy < top; yy++) d.set(u, yy, v, yy === top - 1 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE);
      } else {
        // Arco: escalera invertida pegada al pilar más cercano.
        const toward = Math.abs(b) % 3 === 1 ? -Math.sign(b) || 1 : Math.sign(b);
        const [tu, tv] = P(0, toward);
        const facing = tu > 0 ? 1 : tu < 0 ? 3 : tv > 0 ? 2 : 0;
        d.set(u, top - 1, v, stateOf(STAIRS.deepslate_tile, { facing, half: 1 }));
        if (Math.abs(b) % 3 === 2 && Math.abs(b) < 7) d.set(u, top - 2, v, stateOf(SOUL_LANTERN, { hanging: 1 }));
      }
      d.set(u, top, v, stateOf(SLABS.deepslate_tile, { type: 0 }));
    }
  }
  // Barandillas de muro a los lados de las escalinatas.
  for (const a of [-5, 5]) {
    for (const b of [9, -9, 8, -8, 7, -7, 6, -6]) {
      const [u, v] = P(a, b);
      d.set(u, Math.abs(b) >= 8 ? y : y + 1, v, stateOf(WALLS.deepslate_tile, {}));
    }
  }
  // Velas apagadas y sculk a los pies del marco; dos chilladores y un catalizador en las esquinas.
  for (const [a, b] of [[-11, -3], [11, -3], [-11, 4], [11, 4]]) {
    const [u, v] = P(a, b);
    d.set(u, y + 2, v, unlitCandles(1 + Math.floor(d.r(u, y, v, 4) * 4)));
  }
  for (const [a, b, id] of [[-8, -4, shriekerFor(true)], [8, 4, shriekerFor(true)], [0, -4, SCULK_CATALYST]] as const) {
    const [u, v] = P(a, b);
    d.set(u, y + 2, v, id);
  }
  // Farolas en las esquinas de la plaza.
  for (const [u, v] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) {
    for (let k = 0; k < 3; k++) d.set(u, y + k, v, k === 2 ? CHISELED_DEEPSLATE : DEEPSLATE_BRICKS);
    d.set(u, y + 3, v, SOUL_LANTERN);
  }
}

// ------------------------------------------------------------------ edificios

function buildLot(d: Draw, lot: Lot): void {
  switch (lot.kind) {
    case 'house': return house(d, lot, false);
    case 'barracks': return house(d, lot, true);
    case 'tower': return tower(d, lot);
    case 'ice_box': return iceBox(d, lot);
    case 'camp': return camp(d, lot);
    case 'ruin': return ruin(d, lot);
    case 'statue': return statue(d, lot);
    case 'garden': return garden(d, lot);
  }
}

/** Celda de la puerta (u, v) de un recinto de lado n con esquina (u0, v0), en el lado `door`. */
function doorCell(u0: number, v0: number, n: number, door: number): [number, number] {
  const m = Math.floor(n / 2);
  return door === 0 ? [u0 + m, v0] : door === 1 ? [u0 + n - 1, v0 + m] : door === 2 ? [u0 + m, v0 + n - 1] : [u0, v0 + m];
}

const DU = [0, 1, 0, -1];
const DV = [-1, 0, 1, 0];
const wall = (id: number) => stateOf(id, {});
/** Escalera cuyo lado alto mira a `facing` (0 N, 1 E, 2 S, 3 O); `top`, invertida. */
const stair = (id: number, facing: number, top = false) => stateOf(id, { facing: facing & 3, half: top ? 1 : 0 });
const slab = (id: number, top = false) => stateOf(id, { type: top ? 1 : 0 });

/** Farola: pie cincelado, dos muros de ladrillo, una losa y el farol de alma. */
function lampPost(d: Draw, u: number, v: number): void {
  const y = d.y0;
  d.set(u, y, v, CHISELED_DEEPSLATE);
  d.set(u, y + 1, v, wall(WALLS.deepslate_brick));
  d.set(u, y + 2, v, wall(WALLS.deepslate_brick));
  d.set(u, y + 3, v, SOUL_LANTERN);
}

/**
 * Casa (o barracón, más grande): zócalo de pizarra pulida, pilastras en las esquinas, franja de azulejos
 * arriba, ventanas con barrotes de muro, techo de tablones de roble oscuro y tejado a dos aguas de
 * escaleras de azulejos con alero; dentro, camas de lana, alfombras, un farol colgado, velas y el cofre.
 */
function house(d: Draw, lot: Lot, barracks: boolean): void {
  const n = barracks ? 11 : 9, off = barracks ? 0 : 1;
  const u0 = lot.u + off, v0 = lot.v + off, u1 = u0 + n - 1, v1 = v0 + n - 1;
  const y = d.y0, H = barracks ? 6 : 5;
  const rnd = mulberry32(lot.seed);
  const [du, dv] = doorCell(u0, v0, n, lot.door);
  d.fill(u0, y, v0, u1, y + H - 1, v1, (u, yy, v) => {
    const edgeU = u === u0 || u === u1, edgeV = v === v0 || v === v1;
    if (!edgeU && !edgeV) return AIR;
    if (edgeU && edgeV) return yy === y + H - 1 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE;
    if (yy === y) return POLISHED_DEEPSLATE;
    if (yy === y + H - 1) return tile(d, u, yy, v);
    // Pilastras cada 4 y ventanas entre ellas (barrotes de muro abajo, hueco arriba).
    const along = edgeU ? v - v0 : u - u0;
    if (along % 4 === 0) return POLISHED_DEEPSLATE;
    if (along % 4 === 2 && yy === y + 2) return wall(WALLS.deepslate_tile);
    if (along % 4 === 2 && yy === y + 3 && barracks) return AIR;
    return brick(d, u, yy, v);
  });
  // Puerta de 2 de alto con dintel cincelado.
  d.set(du, y, dv, AIR);
  d.set(du, y + 1, dv, AIR);
  d.set(du, y + 2, dv, CHISELED_DEEPSLATE);
  // Suelo y techo de tablones.
  d.fill(u0 + 1, y - 1, v0 + 1, u1 - 1, y - 1, v1 - 1, DARK_OAK_PLANKS);
  d.fill(u0 + 1, y + H - 1, v0 + 1, u1 - 1, y + H - 1, v1 - 1, DARK_OAK_PLANKS);
  roof(d, u0, v0, u1, v1, y + H - 1, lot.door === 0 || lot.door === 2);
  // Dentro.
  const inner = (a: number) => Math.floor(a * (n - 3)) + 1;
  d.set(u0 + Math.floor(n / 2), y + H - 2, v0 + Math.floor(n / 2), stateOf(SOUL_LANTERN, { hanging: 1 }));
  for (let k = 1; k < n - 1; k++) {
    // Pasillo de alfombra gris de la puerta al fondo.
    const [cu, cv] = lot.door === 0 || lot.door === 2 ? [du, v0 + k] : [u0 + k, dv];
    d.set(cu, y, cv, CARPETS.gray);
  }
  // Camas: lana gris y azul claro contra las paredes laterales.
  const beds = barracks ? 4 : 2;
  for (let k = 0; k < beds; k++) {
    const side = k % 2 === 0;
    const along = 2 + Math.floor(k / 2) * 3;
    const [bu, bv] = lot.door === 0 || lot.door === 2 ? [side ? u0 + 1 : u1 - 1, v0 + along] : [u0 + along, side ? v0 + 1 : v1 - 1];
    d.set(bu, y, bv, k % 3 === 2 ? WOOL.light_blue : WOOL.gray);
    d.set(bu, y + 1, bv, CARPETS.light_gray);
  }
  if (rnd() < 0.7) {
    const cu = lot.door === 0 || lot.door === 2 ? u0 + inner(rnd()) : lot.door === 1 ? u0 + 1 : u1 - 1;
    const cv = lot.door === 0 ? v1 - 1 : lot.door === 2 ? v0 + 1 : v0 + inner(rnd());
    if (d.get(cu, y, cv) === AIR || d.get(cu, y, cv) === CARPETS.gray) d.chest(cu, y, cv, (lot.door + 2) & 3, 'ancient_city');
  }
  for (let k = 0; k < 2; k++) {
    const cu = u0 + inner(rnd()), cv = v0 + inner(rnd());
    if (d.get(cu, y, cv) === AIR) d.set(cu, y, cv, unlitCandles(1 + Math.floor(rnd() * 4)));
  }
  if (rnd() < 0.6) {
    const cu = u0 + inner(rnd()), cv = v0 + inner(rnd());
    if (d.get(cu, y, cv) === AIR) d.set(cu, y, cv, stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  }
}

/**
 * Tejado a dos aguas sobre el recinto (u0..u1, v0..v1) desde la altura y: escaleras de azulejos con alero
 * de 1 y cumbrera de losas; los hastiales, de ladrillo. `ridgeU`: la cumbrera va a lo largo de u.
 */
function roof(d: Draw, u0: number, v0: number, u1: number, v1: number, y: number, ridgeU: boolean): void {
  // Coordenadas del tejado: a a lo largo de la cumbrera, b de alero a alero.
  const P = (a: number, b: number): [number, number] => (ridgeU ? [a, b] : [b, a]);
  const [a0, a1, b0, b1] = ridgeU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
  for (let k = 0; ; k++) {
    const lo = b0 - 1 + k, hi = b1 + 1 - k, yy = y + k;
    if (lo > hi) break;
    for (let a = a0 - 1; a <= a1 + 1; a++) {
      if (lo === hi) {
        const [u, v] = P(a, lo);
        d.set(u, yy, v, slab(SLABS.deepslate_tile));
        continue;
      }
      const [nu, nv] = P(a, lo), [su, sv] = P(a, hi);
      // El lado alto de cada fila mira a la cumbrera.
      d.set(nu, yy, nv, stair(STAIRS.deepslate_tile, ridgeU ? 2 : 1));
      d.set(su, yy, sv, stair(STAIRS.deepslate_tile, ridgeU ? 0 : 3));
      // Hastiales: ladrillo entre las dos aguas en los extremos.
      if (a === a0 || a === a1) {
        for (let b = lo + 1; b < hi; b++) {
          const [gu, gv] = P(a, b);
          if (k > 0) d.set(gu, yy, gv, brick(d, gu, yy, gv));
        }
      }
    }
  }
}

/**
 * Torre por pisos: base ancha de ladrillo con faldón de escaleras, cuerpo de azulejos con pilastras,
 * franjas cinceladas y saeteras, remate volado sobre ménsulas con barandilla de muro y una aguja con farol;
 * por dentro, una escalera de mano sube hasta el remate.
 */
function tower(d: Draw, lot: Lot): void {
  const rnd = mulberry32(lot.seed ^ 0x70e5);
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  const H = towerHeight(lot);
  const door = lot.door, back = (door + 2) & 3;
  // Base: 7×7, 4 de alto.
  d.fill(cu - 3, y, cv - 3, cu + 3, y + 3, cv + 3, (u, yy, v) => {
    const eu = Math.abs(u - cu) === 3, ev = Math.abs(v - cv) === 3;
    if (!eu && !ev) return AIR;
    if (eu && ev) return yy === y + 3 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE;
    return yy === y ? POLISHED_DEEPSLATE : brick(d, u, yy, v);
  });
  // Faldón: escaleras alrededor de la base, con el lado alto hacia el cuerpo.
  d.each(cu - 3, cv - 3, cu + 3, cv + 3, (u, v) => {
    const ru = u - cu, rv = v - cv;
    if (Math.max(Math.abs(ru), Math.abs(rv)) !== 3) return;
    const facing = Math.abs(ru) === 3 && Math.abs(rv) === 3 ? -1 : rv === -3 ? 2 : rv === 3 ? 0 : ru === -3 ? 1 : 3;
    d.set(u, y + 4, v, facing < 0 ? POLISHED_DEEPSLATE : stair(STAIRS.deepslate_brick, facing));
  });
  // Cuerpo: 5×5 hasta el remate.
  d.fill(cu - 2, y + 4, cv - 2, cu + 2, y + H, cv + 2, (u, yy, v) => {
    const eu = Math.abs(u - cu) === 2, ev = Math.abs(v - cv) === 2;
    if (!eu && !ev) return AIR;
    if (eu && ev) return POLISHED_DEEPSLATE;
    if ((yy - y) % 5 === 0) return CHISELED_DEEPSLATE;
    // Saeteras en el centro de cada cara cada 5.
    if ((u === cu || v === cv) && (yy - y) % 5 === 2) return AIR;
    return tile(d, u, yy, v);
  });
  // Ménsulas (escaleras invertidas) bajo el remate y el remate volado de 7×7.
  d.each(cu - 3, cv - 3, cu + 3, cv + 3, (u, v) => {
    const ru = u - cu, rv = v - cv;
    const ring = Math.max(Math.abs(ru), Math.abs(rv)) === 3;
    if (ring) {
      const corner = Math.abs(ru) === 3 && Math.abs(rv) === 3;
      const facing = rv === -3 ? 2 : rv === 3 ? 0 : ru === -3 ? 1 : 3;
      if (!corner) d.set(u, y + H, v, stair(STAIRS.deepslate_tile, facing, true));
      d.set(u, y + H + 1, v, corner ? POLISHED_DEEPSLATE : slab(SLABS.polished_deepslate, true));
      // Barandilla: pilares en las esquinas y muros entre ellos.
      d.set(u, y + H + 2, v, corner ? CHISELED_DEEPSLATE : wall(WALLS.polished_deepslate));
      if (corner) d.set(u, y + H + 3, v, wall(WALLS.polished_deepslate));
    } else d.set(u, y + H + 1, v, slab(SLABS.polished_deepslate, true));
  });
  // Aguja con farol.
  for (let k = 2; k <= 4; k++) d.set(cu, y + H + k, cv, wall(WALLS.deepslate_brick));
  d.set(cu, y + H + 5, cv, SOUL_LANTERN);
  // Puerta en la base y escalera de mano contra la pared del fondo, hasta el remate (con su trampilla).
  const [pu, pv] = [cu + DU[door] * 3, cv + DV[door] * 3];
  d.set(pu, y, pv, AIR);
  d.set(pu, y + 1, pv, AIR);
  d.set(pu, y + 2, pv, CHISELED_DEEPSLATE);
  const [lu, lv] = [cu + DU[back], cv + DV[back]];
  for (let yy = y; yy <= y + H + 1; yy++) d.set(lu, yy, lv, stateOf(LADDER, { facing: (back + 2) & 3 }));
  d.set(lu, y + H + 1, lv, stateOf(TRAPDOORS.dark_oak, { facing: door, half: 1, open: 1 }));
  // Muro del cuerpo detrás de la escalera, hasta arriba (apoyo de la escalera).
  for (let yy = y; yy <= y + H; yy++) {
    const wu = cu + DU[back] * 2, wv = cv + DV[back] * 2;
    if (d.get(wu, yy, wv) === AIR) d.set(wu, yy, wv, tile(d, wu, yy, wv));
  }
  if (rnd() < 0.5) d.chest(cu + DU[(door + 1) & 3] * 2, y, cv + DV[(door + 1) & 3] * 2, (door + 3) & 3, 'ancient_city');
  d.set(cu + DU[(door + 3) & 3] * 2, y, cv + DV[(door + 3) & 3] * 2, unlitCandles(1 + Math.floor(rnd() * 4)));
}

/** Altura de las pasarelas (el piso por el que se anda). */
const BRIDGE_Y = 9;

/** Alto del cuerpo de una torre: cabe bajo la bóveda (más baja hacia el borde), con el remate y la aguja. */
function towerHeight(lot: Lot): number {
  const cu = lot.u + 5, cv = lot.v + 5;
  const r = Math.hypot(Math.abs(cu) + 3, Math.abs(cv) + 3);
  const room = Math.floor(DOME * Math.sqrt(Math.max(0, 1 - (r / ANCIENT_CITY_RADIUS) ** 2))) - 7;
  return Math.max(6, Math.min(13 + Math.floor(mulberry32(lot.seed)() * 7), room));
}

/** Pasarela elevada entre dos torres vecinas: losas altas con barandilla de muro y huecos en los muros. */
function bridge(d: Draw, a: Lot, b: Lot): void {
  const y = d.y0 + BRIDGE_Y;
  const ac = [a.u + 5, a.v + 5], bc = [b.u + 5, b.v + 5];
  const alongU = ac[1] === bc[1];
  const [c0, c1] = alongU ? [Math.min(ac[0], bc[0]), Math.max(ac[0], bc[0])] : [Math.min(ac[1], bc[1]), Math.max(ac[1], bc[1])];
  const mid = alongU ? ac[1] : ac[0];
  for (let t = c0 + 2; t <= c1 - 2; t++) {
    for (let w = -1; w <= 1; w++) {
      const [u, v] = alongU ? [t, mid + w] : [mid + w, t];
      const inside = t > c0 + 2 && t < c1 - 2;
      if (Math.abs(w) <= 1) d.set(u, y - 1, v, inside ? slab(SLABS.deepslate_brick, true) : POLISHED_DEEPSLATE);
      // Paso por el muro de cada torre.
      if (!inside && w === 0) {
        d.set(u, y, v, AIR);
        d.set(u, y + 1, v, AIR);
      }
      if (inside && Math.abs(w) === 1) d.set(u, y, v, wall(WALLS.deepslate_brick));
    }
    // Ménsulas bajo la pasarela en el centro del vano.
    if (t === Math.floor((c0 + c1) / 2)) {
      const [u, v] = alongU ? [t, mid] : [mid, t];
      d.set(u, y - 2, v, stateOf(SOUL_LANTERN, { hanging: 1 }));
    }
  }
}

/** Nevera: una sala de hielo compacto y azul con nieve y su cofre de provisiones. */
function iceBox(d: Draw, lot: Lot): void {
  const u0 = lot.u + 2, v0 = lot.v + 2, u1 = u0 + 6, v1 = v0 + 6, y = d.y0;
  d.fill(u0, y - 1, v0, u1, y + 4, v1, (u, yy, v) => {
    const edge = u === u0 || u === u1 || v === v0 || v === v1;
    if (yy === y - 1) return BLUE_ICE;
    if (yy === y + 4) return SNOW_BLOCK;
    if (!edge) return AIR;
    return (u + yy + v) % 4 === 0 ? BLUE_ICE : PACKED_ICE;
  });
  // Un marco de pizarra alrededor y la entrada.
  d.fill(u0 - 1, y, v0 - 1, u1 + 1, y, v1 + 1, (u, _y, v) => (u === u0 - 1 || u === u1 + 1 || v === v0 - 1 || v === v1 + 1 ? stateOf(SLABS.polished_deepslate, { type: 0 }) : -1));
  const [du, dv] = doorCell(u0, v0, 7, lot.door);
  d.set(du, y, dv, AIR);
  d.set(du, y + 1, dv, AIR);
  d.chest(u0 + 3, y, lot.door === 0 ? v1 - 1 : v0 + 1, lot.door === 0 ? 0 : 2, 'ancient_city_ice_box');
  d.set(u0 + 1, y, v0 + 1, SNOW_BLOCK);
  d.set(u1 - 1, y, v1 - 1, SNOW_BLOCK);
}

/** Fogata de alma: un murete, arena de alma con fuego de alma en el centro, calaveras y velas. */
function camp(d: Draw, lot: Lot): void {
  const rnd = mulberry32(lot.seed);
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  d.each(cu - 4, cv - 4, cu + 4, cv + 4, (u, v) => {
    const r = Math.max(Math.abs(u - cu), Math.abs(v - cv));
    if (r === 4 && (u + v) % 2 === 0) d.set(u, y, v, stateOf(WALLS.deepslate_brick, {}));
    if (r <= 3) d.set(u, y - 1, v, tile(d, u, y - 1, v));
  });
  d.set(cu, y - 1, cv, SOUL_SAND);
  d.set(cu, y, cv, SOUL_FIRE);
  for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) d.set(cu + du, y, cv + dv, stateOf(SLABS.deepslate_brick, { type: 0 }));
  d.set(cu - 2, y, cv - 2, SKULLS.skeleton + Math.floor(rnd() * 16));
  d.set(cu + 2, y, cv + 2, SKULLS.skeleton + Math.floor(rnd() * 16));
  d.set(cu + 2, y, cv - 2, unlitCandles(1 + Math.floor(rnd() * 4)));
  d.set(cu - 2, y, cv + 2, WOOL.gray);
  d.set(cu - 2, y + 1, cv + 2, CARPETS.light_gray);
  if (rnd() < 0.35) d.chest(cu + 3, y, cv, 3, 'ancient_city');
}

/** Ruina: muros medio caídos de ladrillos agrietados y pizarra rocosa, con un chillador entre los escombros. */
function ruin(d: Draw, lot: Lot): void {
  const rnd = mulberry32(lot.seed);
  const u0 = lot.u + 1, v0 = lot.v + 1, n = 9, y = d.y0;
  d.each(u0, v0, u0 + n - 1, v0 + n - 1, (u, v) => {
    const edge = u === u0 || u === u0 + n - 1 || v === v0 || v === v0 + n - 1;
    if (!edge) {
      if (d.r(u, y, v, 7) < 0.08) d.set(u, y, v, COBBLED_DEEPSLATE);
      return;
    }
    const h = Math.floor(d.r(u, y, v, 8) * 6);
    for (let k = 0; k < h; k++) d.set(u, y + k, v, d.r(u, y + k, v, 9) < 0.4 ? COBBLED_DEEPSLATE : CRACKED_DEEPSLATE_BRICKS);
  });
  d.set(u0 + 4, y, v0 + 4, shriekerFor(true));
  if (rnd() < 0.25) d.chest(u0 + 2, y, v0 + 2, Math.floor(rnd() * 4), 'ancient_city');
}

/** Estatua: pedestal de ladrillos y columna cincelada con una cabeza de esqueleto. */
function statue(d: Draw, lot: Lot): void {
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  d.fill(cu - 1, y, cv - 1, cu + 1, y, cv + 1, (u, yy, v) => brick(d, u, yy, v));
  d.fill(cu - 1, y + 1, cv - 1, cu + 1, y + 1, cv + 1, (u, _y, v) => (u === cu && v === cv ? CHISELED_DEEPSLATE : stateOf(SLABS.deepslate_tile, { type: 0 })));
  for (let k = 2; k < 7; k++) d.set(cu, y + k, cv, k % 2 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE);
  d.set(cu, y + 7, cv, SKULLS.skeleton + (lot.seed & 15));
  for (const [du, dv] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) d.set(cu + du, y, cv + dv, unlitCandles(1 + ((lot.seed >> 4) & 3)));
}

/** Jardín de sculk: una mancha con sensores, chilladores y un catalizador, rodeada de vallas de roble oscuro. */
function garden(d: Draw, lot: Lot): void {
  const rnd = mulberry32(lot.seed);
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  d.each(cu - 4, cv - 4, cu + 4, cv + 4, (u, v) => {
    const r = Math.max(Math.abs(u - cu), Math.abs(v - cv));
    if (r === 4) {
      if ((u + v) % 3 !== 0) d.set(u, y, v, FENCES.dark_oak);
    } else d.set(u, y - 1, v, SCULK);
  });
  d.set(cu, y, cv, SCULK_CATALYST);
  for (let k = 0; k < 4; k++) {
    const u = cu - 3 + Math.floor(rnd() * 7), v = cv - 3 + Math.floor(rnd() * 7);
    if (u === cu && v === cv) continue;
    d.set(u, y, v, k === 0 ? shriekerFor(true) : stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  }
}

// ------------------------------------------------------------------ sculk

/** El sculk se come el suelo de la ciudad (menos las avenidas) y trepa por los muros en venas. */
function overgrow(d: Draw): void {
  const R = ANCIENT_CITY_RADIUS, y = d.y0;
  d.each(-R, -R, R, R, (u, v) => {
    const r = Math.hypot(u, v);
    if (r > R - 1) return;
    const road = (Math.abs(u) <= 3 || Math.abs(v) <= 3 || Math.max(Math.abs(u), Math.abs(v)) <= 19) && r < R - 7;
    const floor = d.get(u, y - 1, v);
    const n = d.r(u >> 2, y, v >> 2, 11) * 0.6 + d.r(u, y, v, 12) * 0.4;
    if (floor === DEEPSLATE || floor === COBBLED_DEEPSLATE ? n < 0.72 : road && n < 0.1 && floor > 0 && BLOCK_OPAQUE[floor]) {
      d.set(u, y - 1, v, SCULK);
    }
    // Venas en las paredes: celda de aire junto a un muro.
    if (d.r(u, y, v, 13) < 0.12) {
      for (let yy = y; yy < y + 4; yy++) {
        if (d.get(u, yy, v) !== AIR) continue;
        let faces = 0;
        const sides: [number, number, number][] = [[1, 0, 1], [-1, 0, 2], [0, 1, 16], [0, -1, 32]];
        for (const [du, dv, bit] of sides) {
          const b = d.get(u + du, yy, v + dv);
          if (b > 0 && BLOCK_OPAQUE[b] && b !== SCULK) faces |= bit;
        }
        if (faces && d.r(u, yy, v, 14) < 0.5) d.set(u, yy, v, veinWith(faces));
      }
    }
    // Sensores sueltos por el suelo cubierto de sculk.
    if (d.get(u, y - 1, v) === SCULK && d.get(u, y, v) === AIR && d.r(u, y, v, 15) < 0.012) d.set(u, y, v, stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  });
}
