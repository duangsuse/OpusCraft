// Fase 6.5 (materiales) en el cliente: clic derecho con una pala (camino de tierra) o una azada (tierra
// gruesa, enraizada y camino), polvo de hueso en la tierra enraizada, velas sobre una tarta entera, la
// tarta con vela (encender, apagar o comer), el cubo con la nieve polvo y los huevos de rana sobre el
// agua. El cliente lo predice y el servidor lo aplica ('use', 'place' o 'set').
import {
  AIR, CAKE, POWDER_SNOW, FROGSPAWN, ROOTED_DIRT, HANGING_ROOTS, BLOCKS, isCandle, isCandleCake,
} from '../../shared/blocks';
import { ITEMS, BUCKET, BONE_MEAL, POWDER_SNOW_BUCKET, type ItemStack } from '../../shared/items';
import { soilUse, candleCakeUse } from '../../shared/materialPlacement';
import { raycast, type RayHit } from './raycast';
import { REACH_CREATIVE, REACH_SURVIVAL } from './gameTypes';
import type { Interaction } from './interaction';
import type { Game } from './Game';

/** true si el clic derecho era asunto de este módulo (ya está usado). */
export function materialsUse(g: Game, ia: Interaction, pressed: boolean, hit: RayHit | null, held: ItemStack | null, dir: number[]): boolean {
  if (!pressed) return false;
  const world = g.world!;
  const p = g.player;
  // Huevos de rana (creativo): sobre una fuente de agua, como el nenúfar.
  if (held?.id === FROGSPAWN) {
    const wet = raycast(p.x, p.eyeY, p.z, dir[0], dir[1], dir[2], g.creative ? REACH_CREATIVE : REACH_SURVIVAL, (x, y, z) => world.getBlock(x, y, z), true);
    if (wet) ia.placeBlock(wet, FROGSPAWN);
    return true;
  }
  // Cubo de nieve polvo: la pone y queda el cubo vacío.
  if (held?.id === POWDER_SNOW_BUCKET) {
    if (hit && ia.placeBlock(hit, POWDER_SNOW) && !g.creative) g.inv.set(g.selected, { id: BUCKET, count: 1 });
    return true;
  }
  if (!hit) return false;
  const at: [number, number, number] = [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5];
  // Cubo vacío sobre la nieve polvo: se recoge.
  if (held?.id === BUCKET && hit.id === POWDER_SNOW) {
    world.setBlock(hit.x, hit.y, hit.z, AIR);
    g.net?.sendSet(hit.x, hit.y, hit.z, AIR, BUCKET);
    g.audio.playBreak('snow', at);
    g.swing(false);
    if (g.creative) return true;
    if (held.count <= 1) g.inv.set(g.selected, { id: POWDER_SNOW_BUCKET, count: 1 });
    else {
      g.inv.consume(g.selected, 1);
      const rest = g.inv.add({ id: POWDER_SNOW_BUCKET, count: 1 });
      if (rest) ia.throwStack(rest, true);
    }
    return true;
  }
  // Tarta con vela: en la vela se enciende o se apaga; en la tarta se come una porción (con hambre).
  if (isCandleCake(hit.id) && !p.sneaking) {
    const h = hit.py - hit.y;
    const r = candleCakeUse(hit.id, h)!;
    if (r.eat) {
      if (!g.creative && g.survival.food >= 20) return true;
      g.survival.eat(2, 0.4);
      g.audio.playEat();
    } else g.audio.playPlace('wool', at);
    world.setBlock(hit.x, hit.y, hit.z, r.block);
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: p.yaw, h });
    g.swing(true);
    return true;
  }
  if (!held) return false;
  // Una vela sobre una tarta entera: tarta con vela.
  if (isCandle(held.id) && hit.id === CAKE) return ia.placeBlock(hit, held.id);
  // Polvo de hueso en la tierra enraizada: raíces colgantes debajo.
  if (held.id === BONE_MEAL && hit.id === ROOTED_DIRT) {
    if (world.getBlock(hit.x, hit.y - 1, hit.z) !== AIR) return true;
    world.setBlock(hit.x, hit.y - 1, hit.z, HANGING_ROOTS);
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: p.yaw, item: BONE_MEAL });
    if (!g.creative) g.inv.consume(g.selected, 1);
    g.swing(false);
    return true;
  }
  // Pala (camino de tierra) y azada (tierra gruesa, enraizada y camino); no desde abajo.
  const kind = ITEMS[held.id]?.tool?.kind;
  if ((kind === 'shovel' || kind === 'hoe') && hit.ny >= 0) {
    const r = soilUse((x, y, z) => world.getBlock(x, y, z), hit.x, hit.y, hit.z, held.id, HANGING_ROOTS);
    if (!r) return false;
    world.setBlock(hit.x, hit.y, hit.z, r.block);
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: p.yaw, item: held.id });
    g.audio.playPlace(BLOCKS[r.block].sound, [hit.x + 0.5, hit.y + 1, hit.z + 0.5]);
    g.swing(false);
    ia.wearHeld(1);
    return true;
  }
  return false;
}
