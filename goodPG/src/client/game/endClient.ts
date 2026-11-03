// Fase 8.6 (el End): lo que el cliente hace con las cosas del End.
// - Fruta de coro: al comerla, teletransporte al azar (teleport_randomly, diámetro 16, como en Java): hasta 16
//   intentos a ±8 bloques; en cada uno se baja hasta algo firme y vale si cabe sin tocar líquidos. Suena donde
//   se estaba y donde se llega, y la fruta queda en espera un segundo.
// - Ojo de ender: en un marco del portal del End sin ojo, se engasta (lo decide el servidor, que abre el portal si
//   el anillo queda completo); en un marco con ojo no hace nada. Si no, en el mundo normal se lanza hacia la
//   fortaleza más cercana (en las otras dimensiones no hay).
// - Perla de ender: se lanza como una bola de nieve y queda en espera un segundo (20 ticks).
import { CHORUS_FRUIT, ENDER_EYE, ENDER_PEARL, END_CRYSTAL, type ItemStack } from '../../shared/items';
import { BLOCK_FLUID, BLOCK_SOLID, OBSIDIAN, BEDROCK, DRAGON_EGG, isEndPortalFrame, stateProps } from '../../shared/blocks';
import { DIM_OVERWORLD } from '../../shared/dimensions';
import type { RayHit } from './raycast';
import { boxBlocked } from '../../shared/collide';
import { PLAYER_WIDTH } from '../../shared/constants';
import type { Game } from './Game';

/** Hasta cuándo (ms) espera cada objeto antes de poder usarse otra vez. */
const cooldown = new Map<number, number>();

/** ¿Está en espera el objeto? (y cuánto le falta, 0..1, para la barra). */
export function itemCooldown(id: number): number {
  const until = cooldown.get(id);
  if (until === undefined) return 0;
  const left = until - performance.now();
  if (left <= 0) {
    cooldown.delete(id);
    return 0;
  }
  return left / 1000;
}

/** Tras comer algo del End: la fruta de coro teletransporta. */
export function endAfterEat(g: Game, item: number): void {
  if (item !== CHORUS_FRUIT) return;
  cooldown.set(CHORUS_FRUIT, performance.now() + 1000);
  const w = g.world;
  if (!w) return;
  const p = g.player;
  const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
  const hw = PLAYER_WIDTH / 2;
  const from: [number, number, number] = [p.x, p.y, p.z];
  for (let i = 0; i < 16; i++) {
    const x = p.x + (Math.random() - 0.5) * 16, z = p.z + (Math.random() - 0.5) * 16;
    let y = Math.floor(Math.max(0, Math.min(255, p.y + (Math.random() - 0.5) * 16)));
    const bx = Math.floor(x), bz = Math.floor(z);
    if (get(bx, y, bz) < 0) continue; // sin cargar
    let found = false;
    while (!found && y > -64) {
      const below = get(bx, y - 1, bz);
      if (below > 0 && BLOCK_SOLID[below]) found = true;
      else y--;
    }
    if (!found) continue;
    if (boxBlocked(w, x - hw, y, z - hw, x + hw, y + p.height, z + hw)) continue;
    let wet = false;
    for (let yy = y; yy < y + p.height && !wet; yy++) if (BLOCK_FLUID[Math.max(0, get(bx, Math.floor(yy), bz))]) wet = true;
    if (wet) continue;
    g.audio.playEquipSfx('chorus_teleport', from);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = p.vy = p.vz = 0;
    p.fallDistance = 0;
    g.sendPos(true);
    g.audio.playEquipSfx('chorus_teleport', [x, y, z]);
    g.renderer.entities.pfx.magic(from[0], from[1] + 1, from[2], 16, 0.5);
    return;
  }
}

/** ¿Se lanza con el clic derecho? (el ojo y la perla de ender). */
export function isEndThrowable(id: number): boolean {
  return id === ENDER_EYE || id === ENDER_PEARL;
}

/**
 * Clic derecho sobre bloques del End: el ojo de ender en un marco, el cristal del End sobre obsidiana o lecho de roca
 * y el huevo de dragón (salta). true si lo atiende.
 */
export function endFrameUse(g: Game, pressed: boolean, hit: RayHit | null, held: ItemStack | null): boolean {
  if (!pressed || !hit) return false;
  if (hit.id === DRAGON_EGG && !(g.player.sneaking && held)) {
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: held?.id ?? 0 });
    g.swing(true);
    return true;
  }
  if (held?.id === END_CRYSTAL && (hit.id === OBSIDIAN || hit.id === BEDROCK)) {
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: END_CRYSTAL });
    if (!g.creative) g.inv.consume(g.selected, 1);
    g.swing(true);
    return true;
  }
  if (held?.id !== ENDER_EYE || !isEndPortalFrame(hit.id)) return false;
  if (!stateProps(hit.id)?.eye) {
    g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: ENDER_EYE });
    if (!g.creative) g.inv.consume(g.selected, 1);
    g.swing(true);
  }
  return true;
}

/** Lanza el ojo o la perla de ender en la dirección `dir`. */
export function endThrow(g: Game, id: number, dir: number[]): void {
  if (itemCooldown(id) > 0) return;
  if (id === ENDER_EYE) {
    if ((g.world?.dim ?? DIM_OVERWORLD) !== DIM_OVERWORLD) return;
    const p = g.player;
    g.net?.send({ t: 'throw', p: [p.x, p.eyeY - 0.7, p.z], d: [dir[0], dir[1], dir[2]], item: ENDER_EYE });
    if (!g.creative) g.inv.consume(g.selected, 1);
    g.swing(false);
    return;
  }
  cooldown.set(ENDER_PEARL, performance.now() + 1000);
  g.interaction.throwEgg(dir, ENDER_PEARL);
}

/** Golpear el huevo de dragón en supervivencia lo hace saltar en vez de picarlo (DragonEggBlock.attack). */
export function endEggPunch(g: Game, hit: RayHit): boolean {
  if (hit.id !== DRAGON_EGG || g.creative) return false;
  g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: g.player.yaw, item: 0 });
  g.swing(true);
  return true;
}
