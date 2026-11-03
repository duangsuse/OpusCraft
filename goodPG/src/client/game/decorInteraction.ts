// Fase 6.5 (decoración): clic derecho con los objetos y bloques de decoración en el cliente. Colgar
// cuadros y marcos (y poner o girar el objeto de un marco), plantar en macetas (o sacar la planta),
// tocar campanas, usar huevos generadores y mirar por el catalejo. También lo que queda al comer un
// estofado (el cuenco), el efecto del estofado sospechoso y el rayo contra cuadros y marcos.
import type { RayHit } from './raycast';
import type { ClientEntity, ClientEntities } from './ClientEntities';
import type { Interaction } from './interaction';
import type { Game } from './Game';
import { FLOWER_POT, familyBase, isBell, pottedPlant, potWith, isChiseledShelf, shelfSlotAt, stateProps, SHELF_BOOK_KEYS } from '../../shared/blocks';
import { ITEMS, PAINTING, ITEM_FRAME, SPYGLASS, SUSPICIOUS_STEW, spawnEggMob, type ItemStack } from '../../shared/items';
import { EATEN_REMAINDER, stewEffect } from '../../shared/decorFood';
import { hangingBox, isHangingType, isFrameType } from '../../shared/paintings';
import { ENT_ARMOR_STAND, standBox } from '../../shared/armorStands'; // Fase 6.5 (remate)
import { ARMOR_STAND } from '../../shared/items';

/** Dirección horizontal (0 N, 1 E, 2 S, 3 O) de una normal de cara lateral. */
function dirOfNormal(nx: number, nz: number): number {
  if (nz < 0) return 0;
  if (nx > 0) return 1;
  if (nz > 0) return 2;
  return 3;
}

/** Pide algo al servidor que, si sale bien ('ires' con take), gasta el objeto de la mano. */
function askServer(ia: Interaction, g: Game, item: number, send: (q: number) => void): void {
  const q = ++ia.interactQ;
  ia.pendingInteract.set(q, { slot: g.selected, item });
  if (ia.pendingInteract.size > 32) ia.pendingInteract.delete(ia.pendingInteract.keys().next().value!);
  send(q);
}

/**
 * Clic derecho de decoración. Devuelve true si lo atendió (y el resto de la interacción no sigue).
 */
export function decorUse(
  g: Game, ia: Interaction, pressed: boolean, hit: RayHit | null, target: ClientEntity | null, held: ItemStack | null,
): boolean {
  if (!pressed) return false;
  const heldId = held?.id ?? 0;
  // Marco o cuadro delante: el marco recibe el objeto (o lo gira); el cuadro no hace nada.
  if (target && isHangingType(target.type)) {
    if (isFrameType(target.type)) { // Fase 6.5 (colecciones): también el marco brillante
      // Fase 6.5 (libros y estandartes): el marco sólo guarda el objeto, así que lo que lleva datos (un libro
      // escrito, un estandarte con dibujos) no se pone: se usa como la mano vacía (gira el que tenga).
      const item = held?.data ? 0 : heldId;
      askServer(ia, g, item, (q) => g.net?.send({ t: 'frame', e: target.id, item, q }));
      g.swing(true);
    }
    return true;
  }
  // Fase 6.5 (remate): soporte para armadura delante: vestirlo (con su desgaste) o quitarle una pieza.
  if (target && target.type === ENT_ARMOR_STAND) {
    const piece = heldId ? ITEMS[heldId]?.armor : undefined;
    if (heldId && !piece) return true;
    const q = ++ia.interactQ;
    ia.pendingInteract.set(q, { slot: g.selected, item: heldId });
    g.net?.send({ t: 'interact', e: target.id, item: heldId, q, ...(held?.dmg ? { d: held.dmg } : {}), ...(held?.data ? { st: held } : {}) }); // (la pila entera: encantamientos y color)
    g.swing(true);
    return true;
  }
  // Catalejo: se mira mientras se mantiene el botón.
  if (heldId === SPYGLASS) {
    ia.use = { kind: 'spyglass', t: 0, slot: g.selected, item: heldId, soundT: 0 };
    g.audio.playUi('open');
    return true;
  }
  if (!hit) return false;
  const yaw = g.player.yaw;
  // Fase 6.5 (remate): poner un soporte para armadura encima de un bloque.
  if (heldId === ARMOR_STAND) {
    if (hit.ny > 0) {
      askServer(ia, g, heldId, (q) => g.net?.send({ t: 'stand', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, q }));
      g.swing(true);
    }
    return true;
  }
  // Colgar un cuadro o un marco en la cara lateral de un bloque.
  if (heldId === PAINTING || heldId === ITEM_FRAME) {
    if (hit.ny === 0) {
      const f = dirOfNormal(hit.nx, hit.nz);
      askServer(ia, g, heldId, (q) => g.net?.send({ t: 'hang', x: hit.x, y: hit.y, z: hit.z, f, item: heldId, q }));
      g.swing(true);
    }
    return true;
  }
  if (!g.player.sneaking) {
    // Fase 6.5 (remate): estantería cincelada. Hueco lleno: sacar el libro; vacío y con un libro: meterlo.
    if (isChiseledShelf(hit.id)) {
      const slot = shelfSlotAt(hit.id, hit.x, hit.y, hit.z, hit.px, hit.py, hit.pz, hit.nx, hit.nz);
      const full = slot >= 0 && (stateProps(hit.id)!.books & (1 << slot)) !== 0;
      if (slot >= 0 && (full || SHELF_BOOK_KEYS.has(ITEMS[heldId]?.key ?? ''))) {
        // Fase 6.5 (libros y estandartes): la pila entera, para que un libro escrito conserve su texto.
        askServer(ia, g, heldId, (q) => g.net?.send({ t: 'shelf', x: hit.x, y: hit.y, z: hit.z, slot, item: heldId, q, ...(held?.data ? { st: held } : {}) }));
        g.swing(true);
        return true;
      }
    }
    // Campana: suena (el servidor avisa a todos los que están cerca).
    if (isBell(hit.id)) {
      g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw });
      g.swing(true);
      return true;
    }
    // Maceta: plantar lo que se lleva o, con la mano vacía, sacar la planta.
    if (familyBase(hit.id) === FLOWER_POT) {
      const world = g.world!;
      const plant = pottedPlant(hit.id);
      const pot = !plant && heldId ? potWith(ITEMS[heldId]?.block ?? 0) : 0;
      if (pot) {
        world.setBlock(hit.x, hit.y, hit.z, pot);
        g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw, item: heldId });
        if (!g.creative) g.inv.consume(g.selected, 1);
        g.audio.playPlace('grass', [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
        g.swing(true);
        return true;
      }
      if (plant && !heldId) {
        world.setBlock(hit.x, hit.y, hit.z, FLOWER_POT);
        g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw });
        g.audio.playBreak('grass', [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
        g.swing(true);
        return true;
      }
      // Otra planta en una maceta ya ocupada: nada (no se pone encima).
      if (plant && heldId && potWith(ITEMS[heldId]?.block ?? 0)) return true;
    }
  }
  // Huevo generador sobre un bloque: el servidor crea la criatura.
  if (heldId && spawnEggMob(heldId)) {
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw, item: heldId });
    if (!g.creative) g.inv.consume(g.selected, 1);
    g.swing(true);
    return true;
  }
  return false;
}

/** Después de comer: los estofados dejan el cuenco y el sospechoso da el efecto de su flor. */
export function decorAfterEat(g: Game, ia: Interaction, item: number, slot: number, dmg: number): void {
  const fx = stewEffect(dmg);
  if (item === SUSPICIOUS_STEW && fx) g.statusEffects.add(fx[0], fx[1], 0, g.survival);
  const rest = EATEN_REMAINDER[item];
  if (!rest || g.creative) return;
  const give = { id: rest, count: 1 };
  if (!g.inv.get(slot)) g.inv.set(slot, give);
  else {
    const left = g.inv.add(give);
    if (left) ia.throwStack(left, false);
  }
}

/** Rayo contra cuadros y marcos (cajas finas pegadas a la pared). */
export function raycastHangings(
  ents: ClientEntities, ox: number, oy: number, oz: number, dir: number[], maxDist: number,
): { e: ClientEntity; dist: number } | null {
  let best: { e: ClientEntity; dist: number } | null = null;
  for (const e of ents.list.values()) {
    const stand = e.type === ENT_ARMOR_STAND; // Fase 6.5 (remate): los soportes para armadura también
    if ((!isHangingType(e.type) && !stand) || e.gone) continue;
    const b = stand ? standBox(e.x, e.y, e.z) : hangingBox(e.type, e.item, e.x, e.y, e.z, e.yaw);
    let tmin = 0, tmax = maxDist, ok = true;
    const o = [ox, oy, oz];
    for (let k = 0; k < 3 && ok; k++) {
      const pad = 0.02;
      const mn = b[k] - pad, mx = b[k + 3] + pad;
      if (Math.abs(dir[k]) < 1e-9) {
        if (o[k] < mn || o[k] > mx) ok = false;
        continue;
      }
      let t1 = (mn - o[k]) / dir[k], t2 = (mx - o[k]) / dir[k];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) ok = false;
    }
    if (ok && (!best || tmin < best.dist)) best = { e, dist: tmin };
  }
  return best;
}
