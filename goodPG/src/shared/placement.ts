// Reglas de colocación y de uso de los bloques con estados (compartidas por el cliente, que las
// predice, y el servidor, que las aplica): losas dobles, escaleras invertidas, puertas de dos
// bloques con bisagra, trampillas, portillos, escaleras de mano y antorchas en la pared, camas,
// carteles (de pie o en la pared), cofres que se unen en dobles y fogatas encendidas.
import { isAmethystBudItem, amethystBudAt, AMETHYST_BUD } from './blocks'; // los brotes de amatista
import { isShulkerBox, ENDER_CHEST } from './blocks'; // Fase 8.6
import { NETHER_WART_CROP, SOUL_SAND } from './blocks'; // Fase 8.4
import { MIN_Y, MAX_Y } from './constants';
import {
  BLOCK_REPLACEABLE, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_SOLID, LILY_PAD, VINE, isVine, CAVE_VINES, isCaveVines,
  POINTED_DRIPSTONE, BLOCK_NEEDS_SUPPORT, SNOW_LAYER, isSnowLayer, BLOCK_OPAQUE, BLOCK_RENDER, R_CROSS, TORCH, WALL_TORCH, LADDER,
  stateOf, stateProps, familyBase, isSlab, isStairs, isDoor, isTrapdoor, isFenceGate, isBed, isCrop, isCake,
  isFarmland, isMatureCrop, COMPOSTER, CHEST, CHEST_DOUBLE, CAMPFIRE, SOUL_CAMPFIRE, END_ROD, END_PORTAL_FRAME, isEndRod, SIGN_WALL_OF, chestPartnerDir, isSign,
  blockSupported, orientedFor, type NeighborGet,
} from './blocks';
import { DIR_X, DIR_Z } from './blockModels';
import { isBeeHome } from './blocks'; // Fase 6 (fauna)
import { horizontalLog, AXIS_X, AXIS_Z } from './blocks'; // troncos tumbados
import { planNetherVine, canFertilizeNether } from './netherPlacement'; // Fase 8.2 (biomas del Nether)
// Fase 6.5 (colores): velas (hasta 4 por bloque, se encienden y apagan) y terracota esmaltada.
import { isCandle, canAddCandle, candleCount, isLitCandle, candleState, isGlazedTerracotta } from './blocks';
import { copperPlacement } from './blocks'; // Fase 6.5 (cobre)
import { planDecor, planScaffoldTower } from './decorPlacement'; // Fase 6.5 (decoración)
import { HANGING_WALL_OF, CHISELED_BOOKSHELF, isChiseledShelf } from './blocks'; // Fase 6.5 (remate)
import { isRipeBerryBush } from './blocks'; // Fase 6.5 (océano y plantas)
import { planPlant65, canFertilize65, isWaterCell } from './plantPlacement'; // Fase 6.5 (océano y plantas)
import { planMaterial } from './materialPlacement'; // Fase 6.5 (materiales)
import { isCandleCake } from './blocks'; // Fase 6.5 (materiales)
import { skullPlacement } from './blocks'; // Fase 6.5 (colecciones)
import { CONDUIT, conduitFor } from './blocks'; // Fase 6.5 (equipo)
import { isRailItem, planRail } from './rails'; // Fase 7 (transporte)
import { BLOCK_COLLIDE } from './blocks';
import { isAnvil, anvilFacing } from './blocks'; // Fase 7 (encantamientos)
import { planRedstone } from './redstonePlacement'; // Fase 7 (redstone)
import { isIronOpenable } from './blocks'; // Fase 7 (redstone)
import { planMechanism } from './mechanismPlacement'; // Fase 7 (mecanismos)
import { planDeepDark } from './deepDarkPlacement'; // Fase 7.5 (abismo)

export type Edit = [number, number, number, number];
export type GetBlock = (x: number, y: number, z: number) => number;

export interface PlaceHit {
  /** Celda golpeada. */
  x: number;
  y: number;
  z: number;
  /** Normal de la cara golpeada. */
  nx: number;
  ny: number;
  nz: number;
  /** Punto golpeado (coordenadas del mundo). */
  px: number;
  py: number;
  pz: number;
  /** Bloque golpeado. */
  id: number;
}

/** Dirección horizontal (0 N, 1 E, 2 S, 3 O) hacia la que mira un jugador con ese yaw. */
export function facingFromYaw(yaw: number): number {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 2 : 0;
}

/** Dirección de una normal horizontal. */
function dirOfNormal(nx: number, nz: number): number {
  if (nz < 0) return 0;
  if (nx > 0) return 1;
  if (nz > 0) return 2;
  return 3;
}

const replaceable = (id: number) => id >= 0 && BLOCK_REPLACEABLE[id] === 1;
/** Suelo firme para puertas y camas. */
const firm = (id: number) => id > 0 && BLOCK_SOLID[id] === 1 && BLOCK_RENDER[id] !== R_CROSS;

function rel(get: GetBlock, x: number, y: number, z: number): NeighborGet {
  return (dx, dy, dz) => get(x + dx, y + dy, z + dz);
}

/**
 * Bloques que coloca el objeto `item` al usarlo sobre `hit` (null si no se puede).
 * No comprueba si hay criaturas o jugadores en medio: eso lo hace quien llama.
 */
export function planPlacement(get: GetBlock, hit: PlaceHit, item: number, yaw: number, pitch = 0): Edit[] | null { // Fase 7 (mecanismos): pitch
  const base = familyBase(item);
  const mat = planMaterial(get, hit, base); // Fase 6.5 (materiales): tartas con vela y huevos de rana
  if (mat !== undefined) return mat;
  // Nenúfar: sobre una fuente de agua (el rayo del cliente se detiene en ella).
  if (base === LILY_PAD) {
    if (BLOCK_FLUID[hit.id] !== 1 || BLOCK_FLUID_LEVEL[hit.id] !== 0 || hit.y + 1 >= MAX_Y) return null;
    return get(hit.x, hit.y + 1, hit.z) === 0 ? [[hit.x, hit.y + 1, hit.z, LILY_PAD]] : null;
  }
  // Enredadera colgando de otra (clic en su cara de abajo): la misma, en la celda de debajo.
  if (base === VINE && isVine(hit.id) && hit.ny === -1) {
    return hit.y - 1 > MIN_Y && get(hit.x, hit.y - 1, hit.z) === 0 ? [[hit.x, hit.y - 1, hit.z, hit.id]] : null;
  }
  // Enredaderas de cueva (bayas luminosas): bajo un techo o colgando de otra.
  if (base === CAVE_VINES) {
    if (hit.ny !== -1 || hit.y - 1 <= MIN_Y || get(hit.x, hit.y - 1, hit.z) !== 0) return null;
    return BLOCK_OPAQUE[hit.id] || isCaveVines(hit.id) ? [[hit.x, hit.y - 1, hit.z, CAVE_VINES]] : null;
  }
  // Capa de nieve sobre otra: una capa más (hasta 8).
  if (base === SNOW_LAYER && isSnowLayer(hit.id) && hit.ny === 1 && hit.id < SNOW_LAYER + 7) return [[hit.x, hit.y, hit.z, hit.id + 1]];
  // Losa sobre la mitad libre de otra igual: losa doble.
  if (isSlab(base) && familyBase(hit.id) === base) {
    const t = stateProps(hit.id)!.type;
    if ((t === 0 && hit.ny === 1) || (t === 1 && hit.ny === -1)) return [[hit.x, hit.y, hit.z, stateOf(base, { type: 2 })]];
  }
  // Fase 6.5 (colores): una vela sobre otra igual: una más en el mismo bloque (hasta 4).
  if (canAddCandle(base, hit.id)) return [[hit.x, hit.y, hit.z, candleState(hit.id, candleCount(hit.id) + 1, isLitCandle(hit.id))]];
  // Fase 6.5 (decoración): andamio en lo alto de una torre de andamios (clic desde abajo).
  const tower = planScaffoldTower(get, hit, item);
  if (tower !== undefined) return tower;
  let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  if (BLOCK_REPLACEABLE[hit.id] && !BLOCK_FLUID[hit.id]) {
    x = hit.x;
    y = hit.y;
    z = hit.z;
  }
  if (y <= MIN_Y || y >= MAX_Y) return null;
  const cur = get(x, y, z);
  if (cur < 0) return null;
  // Fase 6.5 (océano y plantas): plantas marinas, corales, pepinos de mar y plantas de dos bloques.
  const plant65 = planPlant65(get, hit, x, y, z, base);
  if (plant65 !== undefined) return plant65;
  const netherVine = planNetherVine(get, base, x, y, z); // Fase 8.2: enredaderas del Nether (punta o tallo)
  if (netherVine !== undefined) return replaceable(cur) ? netherVine : null;
  // Fase 6.5 (equipo): el conducto queda anegado si se pone en el agua.
  if (base === CONDUIT) return replaceable(cur) ? [[x, y, z, conduitFor(isWaterCell(cur))]] : null;
  if (isSlab(base) && familyBase(cur) === base && stateProps(cur)!.type !== 2) return [[x, y, z, stateOf(base, { type: 2 })]];
  if (!replaceable(cur)) return null;

  const face = hit.ny > 0 ? 'up' : hit.ny < 0 ? 'down' : 'side';
  // Mitad superior: clic en la cara de abajo de un bloque o en la mitad alta de una cara lateral.
  const upper = face === 'down' || (face === 'side' && hit.py - y > 0.5);
  const facing = facingFromYaw(yaw);
  const one = (id: number): Edit[] => [[x, y, z, id]];
  // Fase 7 (transporte): los raíles se unen solos a los vecinos (y éstos se tuercen hacia el nuevo).
  if (isRailItem(base)) return planRail(get, x, y, z, base, facing, (id) => id < 0 || (BLOCK_SOLID[id] === 1 && BLOCK_COLLIDE[id] === 1));
  // Fase 6.5 (decoración): faroles, campanas, cadenas y andamios.
  const deco = planDecor(get, hit, base, x, y, z, face, facing);
  if (deco !== undefined) return deco;
  // Fase 7 (redstone): polvo, antorchas, palancas, botones, placas, repetidores, comparadores, ganchos…
  const rs = planRedstone(get, hit, base, x, y, z, face, facing);
  if (rs !== undefined) return rs;
  // Fase 7 (mecanismos): pistones, observadores, tolvas, dispensadores y soltadores orientados.
  const mech = planMechanism(hit, base, x, y, z, yaw, pitch);
  if (mech !== undefined) return mech;
  // Fase 7.5 (abismo): sensores, chilladores, venas de sculk y antorcha y farol de alma.
  const dd = planDeepDark(get, base, x, y, z, cur, [hit.nx, hit.ny, hit.nz], facing);
  if (dd !== undefined) return dd;
  // Fase 6.5 (colecciones): cabezas en el suelo (16 orientaciones, mirando al jugador) o en la pared.
  const skull = skullPlacement(base, face, hit.nx, hit.nz, yaw);
  if (skull >= 0) return skull && blockSupported(skull, rel(get, x, y, z)) ? one(skull) : null;

  // Semillas, zanahorias y patatas: sólo sobre tierra de cultivo.
  if (isCrop(base)) return isFarmland(get(x, y - 1, z)) ? one(base) : null;
  if (base === NETHER_WART_CROP) return get(x, y - 1, z) === SOUL_SAND ? one(base) : null; // Fase 8.4: sólo en arena de alma
  if (isCake(base)) return firm(get(x, y - 1, z)) ? one(base) : null;
  if (isSlab(base)) return one(stateOf(base, { type: upper ? 1 : 0 }));
  if (isStairs(base)) return one(stateOf(base, { facing, half: upper ? 1 : 0 }));
  if (isFenceGate(base)) return one(stateOf(base, { facing }));
  if (isTrapdoor(base)) {
    const f = face === 'side' ? dirOfNormal(hit.nx, hit.nz) : (facing + 2) & 3;
    return one(stateOf(base, { facing: f, half: upper ? 1 : 0 }));
  }
  if (base === LADDER) {
    const f = face === 'side' ? dirOfNormal(hit.nx, hit.nz) : (facing + 2) & 3;
    const id = stateOf(LADDER, { facing: f });
    return blockSupported(id, rel(get, x, y, z)) ? one(id) : null;
  }
  if (base === VINE) {
    // En una pared (colgar de otra enredadera se resuelve arriba).
    if (face !== 'side') return null;
    const id = stateOf(VINE, { facing: dirOfNormal(hit.nx, hit.nz) });
    return blockSupported(id, rel(get, x, y, z)) ? one(id) : null;
  }
  if (base === POINTED_DRIPSTONE) {
    // Encima de un bloque apunta hacia arriba; debajo, hacia abajo (siempre como punta).
    if (face === 'side') return null;
    const id = stateOf(POINTED_DRIPSTONE, { dir: face === 'down' ? 1 : 0, part: 0 });
    return blockSupported(id, rel(get, x, y, z)) ? one(id) : null;
  }
  // Fase 6.5 (remate): estantería cincelada con el frente hacia el jugador (vacía).
  if (base === CHISELED_BOOKSHELF) return one(stateOf(base, { facing: (facing + 2) & 3, books: 0 }));
  // Fase 6.5 (remate): cartel colgante, debajo de un bloque (con el texto hacia el jugador) o en un lateral.
  if (HANGING_WALL_OF[base] !== undefined) {
    if (face === 'up') return null;
    const id = face === 'side'
      ? stateOf(HANGING_WALL_OF[base], { facing: dirOfNormal(hit.nx, hit.nz) })
      : stateOf(base, { facing: (facing + 2) & 3 });
    return blockSupported(id, rel(get, x, y, z)) ? one(id) : null;
  }
  if (SIGN_WALL_OF[base] !== undefined) {
    if (face === 'down') return null;
    if (face === 'side') {
      const id = stateOf(SIGN_WALL_OF[base], { facing: dirOfNormal(hit.nx, hit.nz) });
      if (blockSupported(id, rel(get, x, y, z))) return one(id);
    }
    // De pie, con el texto hacia el jugador.
    return firm(get(x, y - 1, z)) ? one(stateOf(base, { facing: (facing + 2) & 3 })) : null;
  }
  if (base === CHEST) {
    // Junto a un cofre sencillo con la misma orientación: los dos forman un cofre doble.
    const f = orientedFor(CHEST, yaw) - CHEST;
    for (const side of [0, 1]) {
      const d = chestPartnerDir(f, side);
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (get(nx, y, nz) !== CHEST + f) continue;
      return [
        [x, y, z, stateOf(CHEST_DOUBLE, { facing: f, side })],
        [nx, y, nz, stateOf(CHEST_DOUBLE, { facing: f, side: 1 - side })],
      ];
    }
    return one(CHEST + f);
  }
  if (base === CAMPFIRE || base === SOUL_CAMPFIRE) return one(stateOf(base, { lit: 1 })); // Fase 8.5: también la de almas
  // Fase 8.6: la vara del End apunta hacia la cara en la que se pone (contra otra igual, al revés).
  // Fase 8.6: el marco del portal del End mira hacia quien lo pone (sin ojo).
  if (base === END_PORTAL_FRAME) return one(stateOf(base, { facing: (facing + 2) & 3, eye: 0 }));
  // Los brotes de amatista, apuntando hacia fuera de la cara en la que se ponen (AmethystClusterBlock.getStateForPlacement).
  if (isAmethystBudItem(item)) {
    const dir = hit.ny > 0 ? 1 : hit.ny < 0 ? 0 : hit.nz < 0 ? 2 : hit.nz > 0 ? 3 : hit.nx < 0 ? 4 : 5;
    return one(amethystBudAt(item - AMETHYST_BUD, dir));
  }
  // Fase 8.6: la caja de shulker, con la tapa hacia la cara en la que se pone; el cofre de ender, hacia quien lo pone.
  if (isShulkerBox(base)) return one(base + (hit.ny > 0 ? 2 : hit.ny < 0 ? 3 : hit.nx > 0 ? 0 : hit.nx < 0 ? 1 : hit.nz > 0 ? 4 : 5));
  if (base === ENDER_CHEST) return one(stateOf(base, { facing: (facing + 2) & 3 }));
  if (base === END_ROD) {
    let f = hit.ny > 0 ? 2 : hit.ny < 0 ? 3 : hit.nx > 0 ? 0 : hit.nx < 0 ? 1 : hit.nz > 0 ? 4 : 5;
    if (isEndRod(hit.id) && hit.id - END_ROD === f) f ^= 1;
    return one(END_ROD + f);
  }
  // Tronco contra la cara lateral de un bloque: tumbado en ese eje (como en Minecraft).
  if (face === 'side' && horizontalLog(base, AXIS_X) !== base) return one(horizontalLog(base, hit.nx !== 0 ? AXIS_X : AXIS_Z));
  if (base === TORCH) {
    if (face === 'down') return null;
    if (face === 'side') {
      const id = stateOf(WALL_TORCH, { facing: dirOfNormal(hit.nx, hit.nz) });
      if (blockSupported(id, rel(get, x, y, z))) return one(id);
    }
    return one(TORCH); // de pie: el apoyo de abajo lo comprueba quien llama
  }
  if (isDoor(base)) {
    if (y + 1 >= MAX_Y || !replaceable(get(x, y + 1, z)) || !firm(get(x, y - 1, z))) return null;
    const left = (facing + 3) & 3, right = (facing + 1) & 3;
    const lx = x + DIR_X[left], lz = z + DIR_Z[left], rx = x + DIR_X[right], rz = z + DIR_Z[right];
    const ln = get(lx, y, lz), rn = get(rx, y, rz);
    const doorWith = (id: number, hinge: number) => {
      if (!isDoor(id) || familyBase(id) !== base) return false;
      const st = stateProps(id)!;
      return st.half === 0 && st.hinge === hinge;
    };
    let hinge: number;
    // Puerta doble: la bisagra en el lado contrario a la vecina.
    if (doorWith(ln, 0)) hinge = 1;
    else if (doorWith(rn, 1)) hinge = 0;
    else {
      const solid = (xx: number, zz: number) => (BLOCK_OPAQUE[Math.max(0, get(xx, y, zz))] ? 1 : 0) + (BLOCK_OPAQUE[Math.max(0, get(xx, y + 1, zz))] ? 1 : 0);
      const sl = solid(lx, lz), sr = solid(rx, rz);
      if (sr > sl) hinge = 1;
      else if (sl > sr) hinge = 0;
      else {
        // Según la mitad de la cara en la que se hizo clic.
        const along = (hit.px - x - 0.5) * DIR_X[right] + (hit.pz - z - 0.5) * DIR_Z[right];
        hinge = along > 0 ? 1 : 0;
      }
    }
    return [
      [x, y, z, stateOf(base, { facing, half: 0, open: 0, hinge })],
      [x, y + 1, z, stateOf(base, { facing, half: 1, open: 0, hinge })],
    ];
  }
  if (isBed(base)) {
    const hx = x + DIR_X[facing], hz = z + DIR_Z[facing];
    if (!replaceable(get(hx, y, hz)) || !firm(get(x, y - 1, z)) || !firm(get(hx, y - 1, hz))) return null;
    return [
      [x, y, z, stateOf(base, { facing, part: 0 })],
      [hx, y, hz, stateOf(base, { facing, part: 1 })],
    ];
  }
  // Fase 6 (fauna): nidos y colmenas con la entrada hacia el jugador.
  if (isBeeHome(base)) return one(stateOf(familyBase(base), { facing: (facing + 2) & 3 }));
  // Fase 6.5 (colores): terracota esmaltada hacia el jugador; las velas se ponen ya encendidas.
  if (isGlazedTerracotta(base)) return one(stateOf(base, { facing: (facing + 2) & 3 }));
  if (isCandle(base)) return blockSupported(base, rel(get, x, y, z)) ? one(candleState(base, 1, true)) : null;
  // Fase 6.5 (cobre): cadenas en el eje de la cara, faroles de pie o colgados y antorchas de cobre.
  const copper = copperPlacement(base, face, hit.nx, hit.nz, rel(get, x, y, z));
  if (copper >= 0) return copper ? one(copper) : null;
  // Bloques con apoyo a medida (amatista, alfombra de musgo, nenúfar…).
  if (BLOCK_NEEDS_SUPPORT[base] && !blockSupported(base, rel(get, x, y, z))) return null;
  // Fase 7 (encantamientos): el yunque, con la tabla atravesada respecto a donde mira el jugador.
  if (isAnvil(base)) return one(anvilFacing(base, (facing + 1) & 3));
  return one(orientedFor(base, yaw));
}

/** Celda de la otra mitad de una puerta o de la otra parte de una cama (null si no tiene). */
export function partnerOf(x: number, y: number, z: number, id: number): [number, number, number] | null {
  const st = stateProps(id);
  if (!st) return null;
  if (isDoor(id)) return st.half === 0 ? [x, y + 1, z] : [x, y - 1, z];
  if (isBed(id)) {
    const s = st.part === 0 ? 1 : -1;
    return [x + DIR_X[st.facing] * s, y, z + DIR_Z[st.facing] * s];
  }
  return null;
}

/** ¿Hace algo el clic derecho sobre este bloque? (puertas, trampillas, portillos, camas, tartas, compostadores, carteles, velas). */
export function isUsable(id: number): boolean {
  if (isIronOpenable(id)) return false; // Fase 7 (redstone): la puerta y la trampilla de hierro sólo las abre la redstone
  return isDoor(id) || isTrapdoor(id) || isFenceGate(id) || isBed(id) || isCake(id) || familyBase(id) === COMPOSTER || isSign(id) ||
    isCandle(id) || // Fase 6.5 (colores): encender o apagar velas
    isRipeBerryBush(id) || // Fase 6.5 (océano y plantas): cosechar las bayas dulces
    isChiseledShelf(id) || // Fase 6.5 (remate): meter y sacar libros
    isCandleCake(id); // Fase 6.5 (materiales): encender, apagar o comer la tarta con vela
}

/** ¿Tendría efecto el polvo de hueso aquí? (lo usa el cliente para gastarlo). */
export function canFertilize(get: GetBlock, x: number, y: number, z: number, saplings: ReadonlySet<number>, grass: number): boolean {
  const id = get(x, y, z);
  if (canFertilize65(get, x, y, z)) return true; // Fase 6.5 (océano y plantas)
  if (canFertilizeNether(get, x, y, z)) return true; // Fase 8.2 (biomas del Nether)
  if (isCrop(id)) return !isMatureCrop(id);
  if (saplings.has(id)) return true;
  return id === grass && get(x, y + 1, z) === 0;
}

/** Abrir o cerrar puertas, trampillas y portillos (las dos mitades de una puerta a la vez). */
export function toggleEdits(get: GetBlock, x: number, y: number, z: number, yaw: number): Edit[] | null {
  const id = get(x, y, z);
  const st = stateProps(id);
  if (!st) return null;
  const base = familyBase(id);
  if (isDoor(id)) {
    const open = st.open ? 0 : 1;
    const out: Edit[] = [[x, y, z, stateOf(base, { ...st, open })]];
    const p = partnerOf(x, y, z, id)!;
    const other = get(p[0], p[1], p[2]);
    if (isDoor(other) && familyBase(other) === base) out.push([p[0], p[1], p[2], stateOf(base, { ...stateProps(other)!, open })]);
    return out;
  }
  if (isTrapdoor(id)) return [[x, y, z, stateOf(base, { ...st, open: st.open ? 0 : 1 })]];
  if (isCandle(id)) return [[x, y, z, candleState(id, candleCount(id), !isLitCandle(id))]]; // Fase 6.5 (colores)
  if (isCake(id)) return [[x, y, z, st.bites >= 6 ? 0 : stateOf(base, { bites: st.bites + 1 })]];
  if (isFenceGate(id)) {
    if (st.open) return [[x, y, z, stateOf(base, { ...st, open: 0 })]];
    // Se abre alejándose de quien la empuja.
    const f = facingFromYaw(yaw);
    const facing = st.facing === ((f + 2) & 3) ? f : st.facing;
    return [[x, y, z, stateOf(base, { facing, open: 1 })]];
  }
  return null;
}
