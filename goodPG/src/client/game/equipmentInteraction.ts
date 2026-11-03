// Fase 6.5 (equipo): el equipo nuevo en el cliente.
// - Mechero: clic derecho en un bloque (enciende fuego en esa cara, o una vela o fogata apagadas).
// - Ballesta: se carga manteniendo el clic derecho (gasta una flecha) y queda cargada; el siguiente
//   clic dispara. Tridente: se mantiene para cargarlo y se suelta para lanzarlo (sale del inventario).
// - Cuerno de cabra (con enfriamiento), cohetes (sobre un bloque) y la caña con zanahoria (acelerón
//   del cerdo que se monta).
// - Armaduras: la de caballo se pone a un caballo domado (agachado y con la mano vacía se quita); la
//   de lobo, al lobo propio (con tijeras se le quita).
import type { RayHit } from './raycast';
import type { ClientEntity } from './ClientEntities';
import type { Interaction } from './interaction';
import type { Game } from './Game';
import type { Use } from './gameTypes';
import {
  ITEMS, SHEARS, FLINT_AND_STEEL, CROSSBOW, CROSSBOW_CHARGED, TRIDENT, GOAT_HORN, FIREWORK_ROCKET, CARROT_ON_A_STICK, WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE,
  WOLF_ARMOR, HORSE_ARMOR, type ItemStack,
} from '../../shared/items';
import { MOB_HORSE, MOB_WOLF, MOB_PIG, MOB_STRIDER } from '../../shared/mobs';
import { EF_TAMED, EF_BABY } from '../../shared/protocol';
import { CROSSBOW_CHARGE, TRIDENT_MIN_CHARGE, GOAT_HORN_COOLDOWN, fireworkFlight } from '../../shared/equipment';
import { rocketLifetime } from '../../shared/elytra'; // Fase 8.6
import { hasArrows, takeArrow } from './potionClient'; // Fase 7 (pociones)
import { loadCrossbow, unloadCrossbow } from '../../shared/itemData'; // Fase 7 (remate)
import { RIPTIDE, QUICK_CHARGE, enchLevel, enchantsOf } from '../../shared/enchantments'; // Fase 7 (encantamientos)
import { riptideSpeed, crossbowChargeTime } from '../../shared/enchantEffects';

const HORSE_ARMORS = new Set(Object.values(HORSE_ARMOR));
/** Momento (ms) en que se podrá volver a tocar el cuerno. */
let hornReady = 0;

/** Pide algo al servidor que responde con 'ires' (lo que se gasta o se desgasta de la mano). */
function ask(ia: Interaction, g: Game, item: number, send: (q: number) => void): void {
  const q = ++ia.interactQ;
  ia.pendingInteract.set(q, { slot: g.selected, item });
  if (ia.pendingInteract.size > 32) ia.pendingInteract.delete(ia.pendingInteract.keys().next().value!);
  send(q);
}

/** Clic derecho con el equipo nuevo; true si lo atendió (y el resto de la interacción no sigue). */
export function equipmentUse(
  g: Game, ia: Interaction, pressed: boolean, hit: RayHit | null, target: ClientEntity | null, held: ItemStack | null,
): boolean {
  if (!pressed) return false;
  const heldId = held?.id ?? 0;
  // Armaduras sobre caballos y lobos.
  if (target && target.deathT < 0) {
    const baby = (target.flags & EF_BABY) !== 0;
    if (target.type === MOB_HORSE && HORSE_ARMORS.has(heldId)) {
      if (!(target.flags & EF_TAMED) || baby) g.ui.toast('Primero tienes que domarlo.');
      else if (!target.gear) ia.interactEntity(target, heldId, undefined, held?.data ? held : undefined); // (con su color)
      return true;
    }
    if (target.type === MOB_HORSE && !heldId && g.player.sneaking && target.gear) {
      ia.interactEntity(target, 0);
      return true;
    }
    if (target.type === MOB_WOLF && heldId === WOLF_ARMOR) {
      if (!target.gear && !baby) {
        ask(ia, g, heldId, (q) => g.net?.send({ t: 'interact', e: target.id, item: heldId, q, ...(held?.dmg ? { d: held.dmg } : {}), ...(held?.data ? { st: held } : {}) }));
        g.swing(true);
      }
      return true;
    }
    if (target.type === MOB_WOLF && heldId === SHEARS && target.gear === WOLF_ARMOR) {
      ia.interactEntity(target, SHEARS);
      return true;
    }
  }
  if (!held) return false;
  switch (heldId) {
    case FLINT_AND_STEEL:
    case FIRE_CHARGE: // Fase 8.3: la carga de fuego también enciende (y se gasta)
      if (!hit) return false;
      ask(ia, g, heldId, (q) => g.net?.send({ t: 'ignite', x: hit.x, y: hit.y, z: hit.z, n: [hit.nx, hit.ny, hit.nz], q }));
      g.swing(true);
      return true;
    case CROSSBOW:
      if (g.creative || hasArrows(g)) { // Fase 7 (pociones): también flechas con efecto
        ia.use = { kind: 'crossbow', t: 0, slot: g.selected, item: heldId, soundT: 0, charge: chargeTime(held) }; // Fase 7
        g.audio.playEquipSfx('crossbow_loading', [g.player.x, g.player.eyeY, g.player.z]);
      }
      return true;
    case CROSSBOW_CHARGED:
      fireCrossbow(g, ia, held);
      return true;
    case TRIDENT:
      // Fase 7 (encantamientos): con Propulsión acuática sólo se usa mojado (en el agua o bajo la lluvia).
      if (enchLevel(held, RIPTIDE) > 0 && !wet(g)) return true;
      ia.use = { kind: 'trident', t: 0, slot: g.selected, item: heldId, soundT: 0 };
      return true;
    case GOAT_HORN: {
      const now = performance.now();
      if (now < hornReady) return true;
      hornReady = now + GOAT_HORN_COOLDOWN * 1000;
      g.net?.send({ t: 'horn', v: held.dmg || 1 });
      g.swing(false);
      return true;
    }
    case FIREWORK_ROCKET:
      // Fase 8.6: planeando con élitros, el cohete se pega al jugador y lo empuja hacia donde mira mientras dura.
      if (g.player.gliding) {
        const lt = rocketLifetime(fireworkFlight(held.dmg), Math.random);
        g.player.rockets.push(lt);
        g.net?.send({ t: 'throw', item: heldId, p: [g.player.x, g.player.y, g.player.z], d: [0, 0, 0], lt, ...(held.dmg ? { w: held.dmg } : {}) });
        if (!g.creative) g.inv.consume(g.selected, 1);
        g.swing(false);
        return true;
      }
      if (!hit) return true;
      g.net?.send({
        t: 'throw', item: heldId, p: [hit.px + hit.nx * 0.15, hit.py + hit.ny * 0.15, hit.pz + hit.nz * 0.15], d: [0, 1, 0],
        ...(held.dmg ? { w: held.dmg } : {}),
      });
      if (!g.creative) g.inv.consume(g.selected, 1);
      g.swing(false);
      return true;
    case CARROT_ON_A_STICK:
    case WARPED_FUNGUS_ON_A_STICK: { // Fase 8.3: la del strider
      const mount = g.riding.active ? g.ents.list.get(g.riding.entityId) : undefined;
      if (mount?.type === (heldId === CARROT_ON_A_STICK ? MOB_PIG : MOB_STRIDER)) {
        ask(ia, g, heldId, (q) => g.net?.send({ t: 'boost', q }));
        g.swing(false);
      }
      return true;
    }
  }
  return false;
}

/** Disparar la ballesta cargada: sale el virote y vuelve a estar descargada (con un uso menos). */
function fireCrossbow(g: Game, ia: Interaction, held: ItemStack): void {
  const p = g.player;
  const cp = Math.cos(p.pitch);
  const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  // Fase 7: la flecha con efecto cargada (pociones; va en los datos de la ballesta) y Multidisparo y
  // Perforación (encantamientos, los aplica el servidor); la ballesta conserva el resto de sus datos.
  const ap = held.data?.ap;
  const en = enchantsOf(held);
  g.net?.send({ t: 'shoot', p: [p.x + d[0] * 0.3, p.eyeY - 0.1, p.z + d[2] * 0.3], d: [d[0], d[1], d[2]], f: 1, c: 1, ...(ap !== undefined ? { ap } : {}), ...(en.length ? { en } : {}) });
  g.inv.set(g.selected, unloadCrossbow(held));
  ia.wearHeld(1);
  g.swing(false);
  g.shake = Math.max(g.shake, 0.15);
}

/** Mientras se mantiene el clic: la ballesta termina de cargarse (gasta una flecha). */
export function equipmentHold(g: Game, ia: Interaction, u: Use): void {
  if (u.kind !== 'crossbow' || u.t < chargeTime(g.inv.get(u.slot))) return; // Fase 7: Carga rápida
  const s = g.inv.get(u.slot);
  ia.use = null;
  if (!s || s.id !== CROSSBOW) return;
  // Fase 7 (pociones): la primera flecha que haya; si es con efecto, la ballesta la recuerda (en sus datos,
  // así sobrevive a moverla de hueco y a guardar la partida). Conserva sus encantamientos.
  const ap = takeArrow(g);
  if (ap === null) return;
  g.inv.set(u.slot, loadCrossbow(s, ap));
  g.audio.playEquipSfx('crossbow_load', [g.player.x, g.player.eyeY, g.player.z]);
}

/** Al soltar el clic: el tridente cargado sale lanzado (y deja el inventario). */
export function equipmentRelease(g: Game, u: Use, dir: number[], stillHeld: boolean): void {
  if (u.kind !== 'trident' || !stillHeld || u.t < TRIDENT_MIN_CHARGE) return;
  const s = g.inv.get(u.slot);
  if (!s || s.id !== TRIDENT) return;
  const p = g.player;
  // Fase 7 (encantamientos): Propulsión acuática lanza al jugador en vez del tridente.
  const riptide = enchLevel(s, RIPTIDE);
  if (riptide > 0) {
    if (!wet(g)) return;
    const k = riptideSpeed(riptide) * 0.55;
    p.vx = dir[0] * k;
    p.vy = dir[1] * k;
    p.vz = dir[2] * k;
    p.kx += dir[0] * k * 0.5;
    p.kz += dir[2] * k * 0.5;
    p.onGround = false;
    p.fallDistance = 0;
    g.interaction.wearSlot(u.slot, 1);
    g.audio.playEquipSfx('trident_throw', [p.x, p.eyeY, p.z]);
    g.renderer.entities.pfx.bubbles(p.x, p.y + 1, p.z, 10, 0.5);
    g.swing(false);
    return;
  }
  g.net?.send({
    t: 'throw', item: TRIDENT, p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]], ...(s.dmg ? { w: s.dmg } : {}),
    st: s, // Fase 7 (encantamientos): el tridente entero (Lealtad, Empalamiento, Conductividad…)
  });
  if (!g.creative) g.inv.set(u.slot, null);
  g.swing(false);
}

/** Cómo se ve en la mano y en el cuerpo lo que se está usando (la ballesta y el tridente, como el arco). */
export function useLook(u: Use | null): { kind: 'eat' | 'bow' | 'block' | 'none'; amount: number } {
  if (!u || u.kind === 'spyglass') return { kind: 'none', amount: 0 };
  if (u.kind === 'crossbow') return { kind: 'bow', amount: Math.min(1, u.t / (u.charge ?? CROSSBOW_CHARGE)) }; // Fase 7: Carga rápida
  if (u.kind === 'trident') return { kind: 'bow', amount: Math.min(1, u.t / TRIDENT_MIN_CHARGE) };
  if (u.kind === 'bow') return { kind: 'bow', amount: Math.min(1, u.t) };
  if (u.kind === 'block') return { kind: 'block', amount: u.t };
  return { kind: 'eat', amount: u.t / 1.6 };
}

/** Lo que no se gasta al picar ni al golpear (sólo con su propio uso). */
export const EQUIPMENT_WEARLESS = ['crossbow', 'lighter', 'carrot_stick', 'body_armor'] as const;

/** ¿Es un objeto del equipo que usa el clic derecho? (para que la mano secundaria no se adelante). */
export function equipmentUses(id: number): boolean {
  return id === FLINT_AND_STEEL || id === CROSSBOW || id === CROSSBOW_CHARGED || id === TRIDENT || id === GOAT_HORN ||
    id === FIREWORK_ROCKET || id === CARROT_ON_A_STICK || id === WARPED_FUNGUS_ON_A_STICK || id === FIRE_CHARGE || ITEMS[id]?.tool?.kind === 'body_armor';
}

// ------------------------------------------------------------------ Fase 7 (encantamientos)

/** Segundos para cargar la ballesta (Carga rápida los acorta). */
function chargeTime(s: ItemStack | null): number {
  const q = enchLevel(s, QUICK_CHARGE);
  return q > 0 ? crossbowChargeTime(q) : CROSSBOW_CHARGE;
}

/** ¿Está mojado el jugador? (en el agua o bajo la lluvia a cielo abierto): Propulsión acuática. */
function wet(g: Game): boolean {
  const p = g.player;
  if (p.inWater) return true;
  const exposed = (g.world?.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z)) ?? 0) >> 4 >= 15;
  return g.rainNow > 0.2 && exposed;
}
