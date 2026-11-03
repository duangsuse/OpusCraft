// Fase 8.4 (estructuras del Nether): el bastión en ruinas. Se monta como en Java (JigsawPlacement de la 26.3): una
// pieza de inicio al azar entre las cuatro del grupo «bastion/starts» (viviendas, establos de hoglins, sala del
// tesoro y puente), girada al azar, a y = 33 en la esquina del chunk; cada pieza ofrece sus conectores (barajados
// por prioridad de selección) y en cada uno se prueba, por pesos, una pieza del grupo de destino con cada giro y
// cada conector suyo que encaje (frentes opuestos, mismo nombre, junta alineada o giratoria), que quepa entera en
// el espacio libre (el de su pieza madre si el conector da hacia dentro de ella; si no, el de la madre de la
// madre… hasta la caja de 80 bloques alrededor del inicio) y no pise lo ya puesto; hasta 6 de profundidad y, si
// nada vale, el grupo de reserva. Las pendientes se atienden por prioridad de colocación y en orden de llegada.
// Los datos de las piezas (tamaños, conectores, grupos, cofres y criaturas) están en bastionData.ts y su contenido
// lo construye bastionPieces.ts; los procesadores (cambios de material al azar por posición, como RuleProcessor)
// están aquí.
import { AIR, BLOCKS, CHEST, MOB_SPAWNER, familyBase, stateOf, stateProps, isStairs } from '../blocks';
import { CHUNK_SIZE, hash3 } from '../constants';
import { mulberry32 } from './noise';
import { BASTION_PIECES, BASTION_POOLS, type BastionPieceData, type BastionJigsaw } from './bastionData';
import { buildBastionPiece, VOID } from './bastionPieces';
import type { Canvas, StructureMob } from './structures';

// ------------------------------------------------------------------ azar y geometría

/** Azar de un bastión (como RandomSource: entero en [0, n), flotante, barajar como Util.shuffle). */
class BRandom {
  private r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed | 0);
  }
  nextInt(n: number): number {
    return Math.floor(this.r() * n);
  }
  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
}

type Dir = 'north' | 'south' | 'west' | 'east' | 'up' | 'down';
const STEP: Record<Dir, [number, number, number]> = {
  north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};
const OPPOSITE: Record<Dir, Dir> = { north: 'south', south: 'north', west: 'east', east: 'west', up: 'down', down: 'up' };
const CLOCKWISE: Record<Dir, Dir> = { north: 'east', east: 'south', south: 'west', west: 'north', up: 'up', down: 'down' };
const turnDir = (d: Dir, r: number): Dir => {
  for (let i = 0; i < r; i++) d = CLOCKWISE[d];
  return d;
};
/** Giro de una posición local alrededor de (0, 0) (StructureTemplate con pivote en el origen): 0, 90, 180, 270°. */
export function rotXZ(x: number, z: number, r: number): [number, number] {
  switch (r & 3) {
    case 1: return [-z, x];
    case 2: return [-x, -z];
    case 3: return [z, -x];
    default: return [x, z];
  }
}

export interface BBox {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
}
function pieceBox(size: readonly number[], pos: readonly number[], r: number): BBox {
  const xs: number[] = [], zs: number[] = [];
  for (const x of [0, size[0] - 1]) {
    for (const z of [0, size[2] - 1]) {
      const [a, b] = rotXZ(x, z, r);
      xs.push(a + pos[0]);
      zs.push(b + pos[2]);
    }
  }
  return { x0: Math.min(...xs), y0: pos[1], z0: Math.min(...zs), x1: Math.max(...xs), y1: pos[1] + size[1] - 1, z1: Math.max(...zs) };
}
const inBox = (b: BBox, x: number, y: number, z: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1;

/** Espacio libre (VoxelShape): una caja con sus celdas libres (1) o ya ocupadas (0). */
class Free {
  private cells: Uint8Array;
  private readonly w: number;
  private readonly h: number;
  private readonly d: number;
  constructor(readonly box: BBox) {
    this.w = box.x1 - box.x0 + 1;
    this.h = box.y1 - box.y0 + 1;
    this.d = box.z1 - box.z0 + 1;
    this.cells = new Uint8Array(this.w * this.h * this.d).fill(1);
  }
  private idx(x: number, y: number, z: number): number {
    return ((y - this.box.y0) * this.d + (z - this.box.z0)) * this.w + (x - this.box.x0);
  }
  /** ¿Cabe la caja entera en lo libre? */
  fits(b: BBox): boolean {
    const f = this.box;
    if (b.x0 < f.x0 || b.y0 < f.y0 || b.z0 < f.z0 || b.x1 > f.x1 || b.y1 > f.y1 || b.z1 > f.z1) return false;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let z = b.z0; z <= b.z1; z++) {
        let i = this.idx(b.x0, y, z);
        for (let x = b.x0; x <= b.x1; x++, i++) if (!this.cells[i]) return false;
      }
    }
    return true;
  }
  remove(b: BBox): void {
    const f = this.box;
    for (let y = Math.max(b.y0, f.y0); y <= Math.min(b.y1, f.y1); y++) {
      for (let z = Math.max(b.z0, f.z0); z <= Math.min(b.z1, f.z1); z++) {
        for (let x = Math.max(b.x0, f.x0); x <= Math.min(b.x1, f.x1); x++) this.cells[this.idx(x, y, z)] = 0;
      }
    }
  }
}

// ------------------------------------------------------------------ piezas

export interface BastionPiece {
  /** Plantilla (clave de BASTION_PIECES). */
  key: string;
  pos: [number, number, number];
  rot: number;
  box: BBox;
  /** Procesadores de su elemento de grupo. */
  proc: string;
}

interface Connector {
  x: number; y: number; z: number;
  front: Dir; top: Dir;
  name: string; target: string; pool: string;
  rollable: boolean; final: string; sel: number; place: number;
}

function connectors(data: BastionPieceData, pos: readonly number[], r: number, rng: BRandom): Connector[] {
  const out: Connector[] = data.j.map((j: BastionJigsaw) => {
    const [front, top] = j[3].split('_') as [Dir, Dir];
    const [a, b] = rotXZ(j[0], j[2], r);
    return {
      x: a + pos[0], y: j[1] + pos[1], z: b + pos[2], front: turnDir(front, r), top: turnDir(top, r),
      name: j[4], target: j[5], pool: j[6], rollable: j[7] === 1, final: j[8], sel: j[9], place: j[10],
    };
  });
  rng.shuffle(out);
  // Orden estable por prioridad de selección (de mayor a menor), como getShuffledJigsawBlocks.
  return out.map((c, i) => [c, i] as const).sort((a, b) => b[0].sel - a[0].sel || a[1] - b[1]).map(([c]) => c);
}

/** Plantillas de un grupo barajadas con su peso (getShuffledTemplates); '' es la pieza vacía. */
function shuffledTemplates(pool: string, rng: BRandom): [string, string][] {
  const p = BASTION_POOLS[pool];
  if (!p) return [];
  const out: [string, string][] = [];
  for (const [loc, weight, proc] of p.e) for (let i = 0; i < weight; i++) out.push([loc, proc]);
  return rng.shuffle(out);
}

/** JigsawBlock.canAttach. */
const canAttach = (s: Connector, t: Connector) => s.front === OPPOSITE[t.front] && (s.rollable || s.top === t.top) && s.target === t.name;

const poolKey = (p: string) => (p === 'empty' || p === '' ? '' : `bastion/${p}`);
const fallbackKey = (p: string) => BASTION_POOLS[p]?.f === 'empty' || !BASTION_POOLS[p] ? '' : BASTION_POOLS[p].f;

/** Monta un bastión que empieza en el chunk (cx, cz): sus piezas (JigsawPlacement.addPieces con profundidad 6). */
export function bastionPieces(seed: number, cx: number, cz: number, maxDepth = 6, maxDistance = 80): BastionPiece[] {
  const rng = new BRandom(seed);
  const rot = rng.nextInt(4);
  const starts = shuffledTemplates('bastion/starts', rng);
  const [startKey, startProc] = starts[rng.nextInt(starts.length)];
  const pos: [number, number, number] = [cx * CHUNK_SIZE, 33, cz * CHUNK_SIZE];
  const data = BASTION_PIECES[startKey];
  const box = pieceBox(data.s, pos, rot);
  const centerX = (box.x0 + box.x1) >> 1, centerZ = (box.z0 + box.z1) >> 1;
  const center: BastionPiece = { key: startKey, pos, rot, box, proc: startProc };
  const pieces: BastionPiece[] = [center];
  const ctx = new Free({
    x0: centerX - maxDistance, y0: Math.max(33 - maxDistance, 0), z0: centerZ - maxDistance,
    x1: centerX + maxDistance, y1: Math.min(33 + maxDistance, 127), z1: centerZ + maxDistance,
  });
  ctx.remove(box);
  // Pendientes por prioridad de colocación (mayor primero) y, a igualdad, en orden de llegada.
  const queue: { piece: BastionPiece; free: Free; depth: number; prio: number; seq: number }[] = [];
  let seq = 0;
  const tryChildren = (source: BastionPiece, contextFree: Free, depth: number) => {
    const sd = BASTION_PIECES[source.key];
    let sourceFree: Free | null = null;
    for (const sj of connectors(sd, source.pos, source.rot, rng)) {
      const step = STEP[sj.front];
      const tx = sj.x + step[0], ty = sj.y + step[1], tz = sj.z + step[2];
      const localY = sj.y - source.box.y0;
      const pool = poolKey(sj.pool);
      if (!pool || !BASTION_POOLS[pool]) continue;
      let free: Free;
      if (inBox(source.box, tx, ty, tz)) {
        if (!sourceFree) sourceFree = new Free(source.box);
        free = sourceFree;
      } else free = contextFree;
      const cands: [string, string][] = depth !== maxDepth ? shuffledTemplates(pool, rng) : [];
      const fb = fallbackKey(pool);
      if (fb) cands.push(...shuffledTemplates(fb, rng));
      let placed = false;
      for (const [loc, proc] of cands) {
        if (!loc) break; // la pieza vacía corta la búsqueda (EmptyPoolElement)
        const td = BASTION_PIECES[loc];
        if (!td) continue;
        const rots = rng.shuffle([0, 1, 2, 3]);
        for (const tr of rots) {
          for (const tj of connectors(td, [0, 0, 0], tr, rng)) {
            if (!canAttach(sj, tj)) continue;
            const raw: [number, number, number] = [tx - tj.x, ty - tj.y, tz - tj.z];
            const rawBox = pieceBox(td.s, raw, tr);
            const deltaY = localY - tj.y + step[1];
            const yOff = source.box.y0 + deltaY - rawBox.y0;
            const tBox: BBox = { ...rawBox, y0: rawBox.y0 + yOff, y1: rawBox.y1 + yOff };
            if (!free.fits(tBox)) continue;
            free.remove(tBox);
            const piece: BastionPiece = { key: loc, pos: [raw[0], raw[1] + yOff, raw[2]], rot: tr, box: tBox, proc };
            pieces.push(piece);
            if (depth + 1 <= maxDepth) {
              const q = { piece, free, depth: depth + 1, prio: sj.place, seq: seq++ };
              let i = queue.length;
              while (i > 0 && (queue[i - 1].prio < q.prio)) i--;
              queue.splice(i, 0, q);
            }
            placed = true;
            break;
          }
          if (placed) break;
        }
        if (placed) break;
      }
    }
  };
  tryChildren(center, ctx, 0);
  while (queue.length > 0) {
    const q = queue.shift()!;
    tryChildren(q.piece, q.free, q.depth);
  }
  return pieces;
}

/** Caja que envuelve todas las piezas. */
export function bastionBounds(pieces: readonly BastionPiece[]): BBox {
  const b: BBox = { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
  for (const p of pieces) {
    b.x0 = Math.min(b.x0, p.box.x0); b.y0 = Math.min(b.y0, p.box.y0); b.z0 = Math.min(b.z0, p.box.z0);
    b.x1 = Math.max(b.x1, p.box.x1); b.y1 = Math.max(b.y1, p.box.y1); b.z1 = Math.max(b.z1, p.box.z1);
  }
  return b;
}

// ------------------------------------------------------------------ procesadores

/** Regla: bloque de entrada (clave; '*' cualquiera), probabilidad, bloque de salida, y máximo de la altura lineal. */
type Rule = [string, number, string, number?];
const DEGRADE_GOLD: Rule[] = [['gilded_blackstone', 0.5, 'blackstone'], ['blackstone', 0.01, 'gilded_blackstone']];
/** Listas de procesadores de la 26.3 (processor_list). */
export const BASTION_PROCESSORS: Readonly<Record<string, Rule[]>> = {
  bastion_generic_degradation: [
    ['polished_blackstone_bricks', 0.3, 'cracked_polished_blackstone_bricks'], ['blackstone', 0.0001, 'air'],
    ['gold_block', 0.3, 'cracked_polished_blackstone_bricks'], ...DEGRADE_GOLD,
  ],
  bottom_rampart: [
    ['magma_block', 0.75, 'cracked_polished_blackstone_bricks'], ['cracked_polished_blackstone_bricks', 0.15, 'polished_blackstone_bricks'],
    ...DEGRADE_GOLD,
  ],
  bridge: [['polished_blackstone_bricks', 0.3, 'cracked_polished_blackstone_bricks'], ['blackstone', 0.0001, 'air']],
  entrance_replacement: [
    ['chiseled_polished_blackstone', 0.5, 'air'], ['gold_block', 0.6, 'cracked_polished_blackstone_bricks'], ...DEGRADE_GOLD,
  ],
  high_rampart: [['gold_block', 0.3, 'cracked_polished_blackstone_bricks'], ['*', 0, 'air', 0.05], ['gilded_blackstone', 0.5, 'blackstone']],
  housing: [['polished_blackstone_bricks', 0.3, 'cracked_polished_blackstone_bricks'], ['blackstone', 0.0001, 'air'], ...DEGRADE_GOLD],
  rampart_degradation: [
    ['polished_blackstone_bricks', 0.4, 'cracked_polished_blackstone_bricks'], ['blackstone', 0.01, 'cracked_polished_blackstone_bricks'],
    ['polished_blackstone_bricks', 0.0001, 'air'], ['blackstone', 0.0001, 'air'], ['gold_block', 0.3, 'cracked_polished_blackstone_bricks'],
    ...DEGRADE_GOLD,
  ],
  stable_degradation: [['polished_blackstone_bricks', 0.1, 'cracked_polished_blackstone_bricks'], ['blackstone', 0.0001, 'air'], ...DEGRADE_GOLD],
  treasure_rooms: [
    ['polished_blackstone_bricks', 0.35, 'cracked_polished_blackstone_bricks'], ['chiseled_polished_blackstone', 0.1, 'cracked_polished_blackstone_bricks'],
    ...DEGRADE_GOLD,
  ],
  high_wall: [
    ['polished_blackstone_bricks', 0.01, 'air'], ['polished_blackstone_bricks', 0.5, 'cracked_polished_blackstone_bricks'],
    ['polished_blackstone_bricks', 0.3, 'blackstone'], ...DEGRADE_GOLD,
  ],
  roof: [
    ['polished_blackstone_bricks', 0.3, 'cracked_polished_blackstone_bricks'], ['polished_blackstone_bricks', 0.15, 'air'],
    ['polished_blackstone_bricks', 0.3, 'blackstone'],
  ],
  side_wall_degradation: [
    ['chiseled_polished_blackstone', 0.5, 'air'], ['gold_block', 0.1, 'cracked_polished_blackstone_bricks'], ...DEGRADE_GOLD,
  ],
};

const idByKey = new Map<string, number>();
export function blockOf(key: string): number {
  let id = idByKey.get(key);
  if (id === undefined) {
    const [base, props] = key.split('[');
    id = base === 'air' ? AIR : BLOCKS.findIndex((b) => b?.key === base);
    if (id < 0) throw new Error('Bloque desconocido en el bastión: ' + key);
    // Con propiedades (el bloque final de un conector: «…_stairs[facing=north]»).
    if (props) {
      const st: Record<string, number> = {};
      for (const kv of props.replace(']', '').split(',')) {
        const [k, v] = kv.split('=');
        if (k === 'facing') st.facing = ['north', 'east', 'south', 'west'].indexOf(v);
        else if (k === 'half') st.half = v === 'top' ? 1 : 0;
      }
      id = stateOf(id, st);
    }
    idByKey.set(key, id);
  }
  return id;
}
const keyOfBase = (id: number) => BLOCKS[familyBase(id)]?.key ?? '';

/** RuleProcessor: el primer cambio que toca, con un azar propio de la posición del bloque. */
function processBlock(rules: readonly Rule[] | undefined, id: number, x: number, y: number, z: number, originY: number): number {
  if (!rules || id === AIR) return id;
  const key = keyOfBase(id);
  let s = hash3(x, y, z, 0x5b1d);
  const next = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    return (s >>> 8) / 16777216;
  };
  for (const [input, p, output, linear] of rules) {
    if (linear !== undefined) {
      // axis_aligned_linear_pos: la probabilidad crece con la altura sobre el origen (0 → 0, 100 → máximo).
      const chance = Math.min(1, Math.abs(y - originY) / 100) * linear;
      if (next() <= chance) return blockOf(output);
      continue;
    }
    if (key !== input) continue;
    if (next() < p) return blockOf(output);
  }
  return id;
}

// ------------------------------------------------------------------ dibujo

/** Orientación de un bloque girado con la pieza (escaleras y demás con `facing`). */
function turnBlock(id: number, r: number): number {
  if (!r) return id;
  const st = stateProps(id);
  if (!st || st.facing === undefined || !isStairs(familyBase(id))) {
    if (st && st.facing !== undefined) return stateOf(familyBase(id), { ...st, facing: (st.facing + r) & 3 });
    return id;
  }
  return stateOf(familyBase(id), { ...st, facing: (st.facing + r) & 3 });
}

/** Contenido local de cada pieza (se construye una vez por pieza). */
const built = new Map<string, Int32Array>();
function contentOf(p: BastionPiece): Int32Array {
  const k = `${p.key}@${p.pos.join(',')}`;
  let c = built.get(k);
  if (!c) {
    c = buildBastionPiece(p.key, BASTION_PIECES[p.key], hash3(p.pos[0], p.pos[1], p.pos[2], 0xba57));
    if (built.size > 4096) built.clear();
    built.set(k, c);
  }
  return c;
}

/** Dibuja en el lienzo (un chunk) la parte de cada pieza que le toca; cofres y criaturas, a su sitio. */
export function drawBastion(c: Canvas, pieces: readonly BastionPiece[], ticks: number[]): void {
  const x0 = c.x0, z0 = c.z0;
  for (const p of pieces) {
    const b = p.box;
    if (b.x1 < x0 || b.x0 > x0 + 15 || b.z1 < z0 || b.z0 > z0 + 15) continue;
    const data = BASTION_PIECES[p.key];
    const rules = BASTION_PROCESSORS[p.proc];
    const content = contentOf(p);
    for (let i = 0; i < content.length; i += 4) {
      const id = content[i + 3];
      if (id === VOID) continue;
      const [a, bz] = rotXZ(content[i], content[i + 2], p.rot);
      const X = a + p.pos[0], Y = content[i + 1] + p.pos[1], Z = bz + p.pos[2];
      if (!c.inside(X, Y, Z)) continue;
      const out = turnBlock(processBlock(rules, id, X, Y, Z, p.pos[1]), p.rot);
      c.set(X, Y, Z, out);
      if (out === blockOf('lava')) ticks.push(X, Y, Z);
    }
    // Los conectores se quedan con su bloque final.
    for (const j of data.j) {
      const [a, bz] = rotXZ(j[0], j[2], p.rot);
      const X = a + p.pos[0], Y = j[1] + p.pos[1], Z = bz + p.pos[2];
      if (c.inside(X, Y, Z)) c.set(X, Y, Z, turnBlock(processBlock(rules, blockOf(j[8] || 'air'), X, Y, Z, p.pos[1]), p.rot));
    }
    for (const [cx, cy, cz, facing, table] of data.c ?? []) {
      const [a, bz] = rotXZ(cx, cz, p.rot);
      const X = a + p.pos[0], Y = cy + p.pos[1], Z = bz + p.pos[2];
      const f = (({ north: 0, east: 1, south: 2, west: 3 } as Record<string, number>)[facing] + p.rot) & 3;
      c.chest(X, Y, Z, f, table);
    }
    for (const [sx, sy, sz] of data.sp ?? []) {
      const [a, bz] = rotXZ(sx, sz, p.rot);
      const X = a + p.pos[0], Y = sy + p.pos[1], Z = bz + p.pos[2];
      if (c.inside(X, Y, Z)) c.set(X, Y, Z, MOB_SPAWNER);
    }
    for (const [mx, my, mz, kind] of data.m ?? []) {
      const [a, bz] = rotXZ(mx, mz, p.rot);
      c.mob(BASTION_MOB_TYPES[kind] ?? 0, a + p.pos[0], my + p.pos[1], bz + p.pos[2], BASTION_MOB_VARIANT[kind]);
    }
  }
}

/** Criaturas de las plantillas de criaturas del bastión (los ids los pone netherStructures.ts para no importar mobs aquí). */
export const BASTION_MOB_TYPES: Record<string, number> = {};
/** Variante: 1 = con ballesta, 2 = con espada de oro (el piglin); lo demás, 0. */
export const BASTION_MOB_VARIANT: Record<string, number> = { piglin_crossbow: 1, piglin_sword: 2 };

void CHEST;
void (null as unknown as StructureMob);
