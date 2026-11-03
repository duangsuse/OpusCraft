// Fase 7 (transporte): modelos de las barcas, balsas y vagonetas para MobRenderer (cajas con huesos,
// como las criaturas, con su piel procedural en textures/vehicleTextures.ts).
// - Barca: fondo, dos costados, proa y popa, y dos remos (pala incluida) que reman cuando llegan los
//   bits VF_PADDLE_*; la de cofre lleva el cofre atrás. La balsa de bambú es una plataforma de cañas.
// - Vagoneta: la cuba de hierro sobre cuatro ruedas; con cofre o con horno dentro.
// Mirando hacia −Z (como las criaturas); el origen es el centro de la base de la entidad.
// La cabecera, el balanceo al golpearla y la inclinación en las cuestas se aplican en vehicleRoot.
import { mat4 } from 'gl-matrix';
import type { MobDef, ModelPart } from '../../shared/mobs';
import {
  ENT_BOAT, ENT_CHEST_BOAT, ENT_MINECART, ENT_CHEST_MINECART, ENT_FURNACE_MINECART, RAFT_VARIANT, VF_PADDLE_L, VF_PADDLE_R,
  VF_HURT_FLIP, VF_LIT, isVehicleType, isCartType,
} from '../../shared/vehicles';
import { ENT_HOPPER_MINECART, ENT_TNT_MINECART, VF_PRIMED } from '../../shared/vehicles'; // Fase 7 (mecanismos)
import type { ClientEntity } from '../game/ClientEntities';

export type VehicleMaterial =
  | 'hull' | 'floor' | 'paddle' | 'blade' | 'chest' | 'lid' | 'latch' | 'iron' | 'ironFloor' | 'wheel' | 'furnace' | 'stalk'
  | 'beam'
  | 'hopper' | 'tnt'; // Fase 7 (mecanismos)

export interface VehiclePart extends ModelPart {
  mat: VehicleMaterial;
}

export interface VehicleModel {
  def: MobDef;
  parts: VehiclePart[];
  /** Tapa invisible (sólo profundidad) que impide que el agua se vea dentro del casco; null sin ella. */
  mask: MobDef | null;
}

/** Ids de modelo de las balsas (no son tipos de entidad: sólo para las cachés de mallas y pieles). */
const RAFT_MODEL = ENT_BOAT + 1000, CHEST_RAFT_MODEL = ENT_CHEST_BOAT + 1000;
const ATLAS_W = 128;

type Box = Omit<VehiclePart, 'uv'>;
const box = (name: string, mat: VehicleMaterial, pivot: [number, number, number], from: [number, number, number], size: [number, number, number], o: Partial<ModelPart> = {}): Box =>
  ({ name, mat, pivot, from, size, ...o });

/** Coloca las cajas en el atlas (en filas, de izquierda a derecha) y devuelve su tamaño. */
function pack(boxes: Box[]): { parts: VehiclePart[]; atlas: [number, number] } {
  let x = 0, y = 0, rowH = 0;
  const parts: VehiclePart[] = [];
  for (const b of boxes) {
    const [w, h, d] = b.size.map((v) => Math.ceil(v));
    const bw = 2 * (w + d), bh = d + h;
    if (x + bw > ATLAS_W) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    parts.push({ ...b, uv: [x, y] });
    x += bw;
    rowH = Math.max(rowH, bh);
  }
  return { parts, atlas: [ATLAS_W, y + rowH] };
}

function makeDef(id: number, key: string, name: string, parts: ModelPart[], atlas: [number, number]): MobDef {
  return {
    id, key, name, hostile: false, health: 1, walk: 0, run: 0, width: 1, height: 1, damage: 0, burnsInSun: false, drops: [],
    atlas, parts, anim: 'quadruped', scale: 1, inert: true,
  };
}

/** Remo de un lado (−1 izquierda, 1 derecha): la caña sobre la borda y la pala en el extremo de fuera. */
function paddle(side: -1 | 1, y: number): Box[] {
  const s = side < 0 ? 'L' : 'R';
  const shaftFrom: [number, number, number] = side < 0 ? [-14, -1, -1] : [-3, -1, -1];
  const bladeFrom: [number, number, number] = side < 0 ? [-19, -3, -0.5] : [14, -3, -0.5];
  return [
    box(`paddle${s}`, 'paddle', [side * 10, y, -2], shaftFrom, [17, 2, 2], { rot: [0, 0, side * 0.45] }),
    box(`blade${s}`, 'blade', [0, 0, 0], bladeFrom, [5, 6, 1], { parent: `paddle${s}` }),
  ];
}

function boatBoxes(chest: boolean): Box[] {
  const out = [
    box('bottom', 'floor', [0, 0, 0], [-8, 0, -14], [16, 3, 28]),
    box('left', 'hull', [0, 0, 0], [-10, 1, -15], [2, 8, 30]),
    box('right', 'hull', [0, 0, 0], [8, 1, -15], [2, 8, 30]),
    box('front', 'hull', [0, 0, 0], [-8, 2, -16], [16, 7, 2]),
    box('back', 'hull', [0, 0, 0], [-8, 2, 14], [16, 7, 2]),
    ...paddle(-1, 8), ...paddle(1, 8),
  ];
  if (chest) out.push(...chestBoxes(3, 2));
  return out;
}

function raftBoxes(chest: boolean): Box[] {
  const out = [
    box('deck', 'stalk', [0, 0, 0], [-10, 4, -15], [20, 4, 30]),
    box('beamF', 'beam', [0, 0, 0], [-11, 3, -11], [22, 2, 3]),
    box('beamB', 'beam', [0, 0, 0], [-11, 3, 8], [22, 2, 3]),
    ...paddle(-1, 9), ...paddle(1, 9),
  ];
  if (chest) out.push(...chestBoxes(8, 2));
  return out;
}

/** Cofre de 12 × 12 con su tapa y el cierre (mirando hacia delante), con la base en y0 y el frente en z0. */
function chestBoxes(y0: number, z0: number): Box[] {
  return [
    box('chest', 'chest', [0, 0, 0], [-6, y0, z0], [12, 9, 12]),
    box('lid', 'lid', [0, 0, 0], [-6, y0 + 9, z0], [12, 3, 12]),
    box('latch', 'latch', [0, 0, 0], [-1, y0 + 7, z0 - 1], [2, 4, 1]),
  ];
}

function cartBoxes(content: 'none' | 'chest' | 'furnace' | 'hopper' | 'tnt'): Box[] {
  const out = [
    box('bottom', 'ironFloor', [0, 0, 0], [-8, 2, -10], [16, 2, 20]),
    box('left', 'iron', [0, 0, 0], [-8, 4, -10], [2, 8, 20]),
    box('right', 'iron', [0, 0, 0], [6, 4, -10], [2, 8, 20]),
    box('front', 'iron', [0, 0, 0], [-6, 4, -10], [12, 8, 2]),
    box('back', 'iron', [0, 0, 0], [-6, 4, 8], [12, 8, 2]),
    box('wheel0', 'wheel', [0, 0, 0], [-8, 0, -8], [2, 2, 3]),
    box('wheel1', 'wheel', [0, 0, 0], [6, 0, -8], [2, 2, 3]),
    box('wheel2', 'wheel', [0, 0, 0], [-8, 0, 5], [2, 2, 3]),
    box('wheel3', 'wheel', [0, 0, 0], [6, 0, 5], [2, 2, 3]),
  ];
  if (content === 'chest') out.push(...chestBoxes(4, -6));
  if (content === 'furnace') out.push(box('furnace', 'furnace', [0, 0, 0], [-6, 4, -6], [12, 12, 12]));
  // Fase 7 (mecanismos): la tolva (el cuenco y el embudo) y la dinamita, dentro de la cuba.
  if (content === 'hopper') {
    out.push(box('bowl', 'hopper', [0, 0, 0], [-6, 9, -6], [12, 5, 12]), box('funnel', 'hopper', [0, 0, 0], [-4, 4, -4], [8, 5, 8]));
  }
  if (content === 'tnt') out.push(box('tnt', 'tnt', [0, 0, 0], [-6, 4, -6], [12, 12, 12]));
  return out;
}

function model(id: number, key: string, name: string, boxes: Box[], mask: [number, number, number, number, number] | null): VehicleModel {
  const { parts, atlas } = pack(boxes);
  // La tapa: un plano (caja de alto 0) a la altura y, de x0..x1 y z0..z1.
  const m = mask ? makeDef(id + 2000, `${key}_mask`, name, [
    { name: 'mask', pivot: [0, 0, 0], from: [mask[0], mask[4], mask[1]], size: [mask[2] - mask[0], 0, mask[3] - mask[1]], uv: [0, 0] },
  ], atlas) : null;
  return { def: makeDef(id, key, name, parts, atlas), parts, mask: m };
}

const MODELS = new Map<number, VehicleModel>();
const add = (m: VehicleModel) => MODELS.set(m.def.id, m);
add(model(ENT_BOAT, 'boat', 'Barca', boatBoxes(false), [-8, -14, 8, 14, 8]));
add(model(ENT_CHEST_BOAT, 'chest_boat', 'Barca con cofre', boatBoxes(true), [-8, -14, 8, 14, 8]));
add(model(RAFT_MODEL, 'raft', 'Balsa', raftBoxes(false), null));
add(model(CHEST_RAFT_MODEL, 'chest_raft', 'Balsa con cofre', raftBoxes(true), null));
add(model(ENT_MINECART, 'minecart', 'Vagoneta', cartBoxes('none'), null));
add(model(ENT_CHEST_MINECART, 'chest_minecart', 'Vagoneta con cofre', cartBoxes('chest'), null));
add(model(ENT_FURNACE_MINECART, 'furnace_minecart', 'Vagoneta con horno', cartBoxes('furnace'), null));
add(model(ENT_HOPPER_MINECART, 'hopper_minecart', 'Vagoneta con tolva', cartBoxes('hopper'), null)); // Fase 7 (mecanismos)
add(model(ENT_TNT_MINECART, 'tnt_minecart', 'Vagoneta con dinamita', cartBoxes('tnt'), null));

/** Modelo de un id de modelo (el tipo de entidad, o el de la balsa). */
export function vehicleModelById(id: number): VehicleModel | undefined {
  return MODELS.get(id);
}

/** Modelo con el que se dibuja una entidad (undefined si no es una barca ni una vagoneta con modelo). */
export function vehicleModel(e: ClientEntity): VehicleModel | undefined {
  if (!isVehicleType(e.type)) return undefined;
  if (e.variant === RAFT_VARIANT) {
    if (e.type === ENT_BOAT) return MODELS.get(RAFT_MODEL);
    if (e.type === ENT_CHEST_BOAT) return MODELS.get(CHEST_RAFT_MODEL);
  }
  // Vagonetas nuevas (tolva, TNT…) sin modelo propio todavía: la normal (se les añade con add(model(…))).
  return MODELS.get(e.type) ?? (isCartType(e.type) ? MODELS.get(ENT_MINECART) : undefined);
}

/** ¿Es un id de modelo de transporte? (para la fuente de texturas). */
export function isVehicleModelId(id: number): boolean {
  return MODELS.has(id);
}

/** Piel: la madera de la barca; en la vagoneta con horno, 1 si está encendido. */
export function vehicleSkinVariant(e: ClientEntity): number {
  // Fase 7 (mecanismos): la vagoneta con dinamita encendida parpadea (piel 1: blanca) cada 5 ticks.
  if (e.type === ENT_TNT_MINECART) return e.flags & VF_PRIMED && Math.floor(performance.now() / 250) % 2 === 0 ? 1 : 0;
  if (isCartType(e.type)) return e.flags & VF_LIT ? 1 : 0;
  return e.variant;
}

// ------------------------------------------------------------------ animación

/** Fase de los remos por entidad ([izquierdo, derecho, último tiempo]). */
const paddles = new WeakMap<ClientEntity, [number, number, number]>();
/** Velocidad del remo: media vuelta cada 8 ticks (Minecraft). */
const PADDLE_SPEED = (Math.PI / 8) * 20;

/** Rotaciones de los remos. Devuelve true si la parte es de un transporte (y ya está animada). */
export function animateVehicle(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  if (!MODELS.has(def.id)) return false;
  const left = name === 'paddleL';
  if (!left && name !== 'paddleR') return true;
  let st = paddles.get(e);
  if (!st) paddles.set(e, (st = [0, 0, time]));
  const dt = Math.max(0, Math.min(0.1, time - st[2]));
  st[2] = time;
  if (e.flags & VF_PADDLE_L) st[0] += dt * PADDLE_SPEED;
  if (e.flags & VF_PADDLE_R) st[1] += dt * PADDLE_SPEED;
  const ph = left ? st[0] : st[1];
  if (ph === 0) return true;
  // Atrás con la pala metida (tira del agua) y adelante con ella fuera.
  const sweep = Math.sin(ph) * 0.7;
  const c = Math.cos(ph);
  const dip = c > 0 ? c * 0.3 : c * 0.25;
  const side = left ? 1 : -1;
  out[1] = sweep * side;
  out[2] = dip * side;
  return true;
}

/** Balanceo al golpearla (de lado a lado) e inclinación de la vagoneta en las cuestas. */
export function vehicleRoot(def: MobDef, e: ClientEntity, m: mat4): void {
  if (!MODELS.has(def.id)) return;
  if (isCartType(e.type) && e.pitch) {
    mat4.translate(m, m, [0, 0.35, 0]);
    mat4.rotateX(m, m, e.pitch);
    mat4.translate(m, m, [0, -0.35, 0]);
  }
  if (e.hurtT < 0.5) {
    const k = (0.5 - e.hurtT) * 2;
    mat4.rotateZ(m, m, Math.sin(e.hurtT * 22) * k * k * 0.35 * (e.flags & VF_HURT_FLIP ? -1 : 1));
  }
}
