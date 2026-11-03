// Fase 6.5 (colecciones): clic derecho con cabezas, discos y el marco brillante en el cliente, y los
// avisos del servidor sobre los tocadiscos.
// - Cabeza: sobre un bloque se coloca (en el suelo o en la pared); al aire, se la pone el jugador.
// - Tocadiscos: con un disco en la mano se mete; si ya tiene uno, se saca (lo decide el servidor).
// - Marco brillante: se cuelga en la cara lateral de un bloque, como el marco.
import type { RayHit } from './raycast';
import type { Interaction } from './interaction';
import type { Game } from './Game';
import { isSkull, isJukebox, jukeboxHasDisc } from '../../shared/blocks';
import { GLOW_ITEM_FRAME, type ItemStack } from '../../shared/items';
import { isMusicDisc } from '../../shared/collections';
import { DISCS } from '../../shared/discs';

/** Pide algo al servidor que, si sale bien ('ires' con take), gasta el objeto de la mano. */
function askServer(ia: Interaction, g: Game, item: number, send: (q: number) => void): void {
  const q = ++ia.interactQ;
  ia.pendingInteract.set(q, { slot: g.selected, item });
  if (ia.pendingInteract.size > 32) ia.pendingInteract.delete(ia.pendingInteract.keys().next().value!);
  send(q);
}

/** Devuelve true si atendió el clic (y el resto de la interacción no sigue). */
export function collectionUse(g: Game, ia: Interaction, pressed: boolean, hit: RayHit | null, held: ItemStack | null): boolean {
  if (!pressed) return false;
  const heldId = held?.id ?? 0;
  if (hit && !g.player.sneaking && isJukebox(hit.id) && (jukeboxHasDisc(hit.id) || isMusicDisc(heldId))) {
    askServer(ia, g, heldId, (q) => g.net?.send({ t: 'jukebox', x: hit.x, y: hit.y, z: hit.z, item: heldId, q }));
    g.swing(true);
    return true;
  }
  if (heldId && isSkull(heldId)) {
    if (hit) ia.placeBlock(hit, heldId);
    else ia.equipHeld();
    return true;
  }
  if (heldId === GLOW_ITEM_FRAME) {
    if (hit && hit.ny === 0) {
      const f = hit.nz < 0 ? 0 : hit.nx > 0 ? 1 : hit.nz > 0 ? 2 : 3;
      askServer(ia, g, heldId, (q) => g.net?.send({ t: 'hang', x: hit.x, y: hit.y, z: hit.z, f, item: heldId, q }));
      g.swing(true);
    }
    return true;
  }
  return false;
}

/** Efectos del servidor de las colecciones; devuelve true si era suyo. */
export function collectionFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  if (kind !== 'jukebox') return false;
  const key = `${Math.floor(p[0])},${Math.floor(p[1])},${Math.floor(p[2])}`;
  const disc = a ?? -1;
  if (disc < 0 || !DISCS[disc]) {
    g.audio.stopDisc(key);
    return true;
  }
  const elapsed = Math.max(0, b ?? 0);
  g.audio.playDisc(key, disc, p, elapsed);
  // Quien está cerca ve qué suena (como en Minecraft).
  const pl = g.player;
  if (elapsed < 1 && Math.hypot(p[0] - pl.x, p[1] - pl.y, p[2] - pl.z) < 24) g.ui.toast(`Suena: ${DISCS[disc].title}`);
  return true;
}
