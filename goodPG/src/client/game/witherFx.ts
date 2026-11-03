// Fase 8.7: efectos del Wither en el cliente.
// - Cada frame (WitherBoss.aiStep en el cliente): humo en las tres cabezas; blindado, remolinos de efecto (1 de cada 4
//   por cabeza y tick); naciendo, tres remolinos azulados por tick a lo largo del cuerpo. La calavera deja humo.
// - Del servidor: nace (el rugido, en toda la dimensión, y la explosión), la figura de la invocación que se deshace,
//   el disparo, los bloques que rompe, su voz de ambiente y su muerte (en toda la dimensión).
import { MOB_WITHER, ENT_WITHER_SKULL, witherHeadPos } from '../../shared/witherMobs';
import { BLOCKS, isValidBlockId } from '../../shared/blocks';
import { witherInvulnerable, witherPowered } from '../render/witherPose';
import { swirl } from './potionClient';
import type { Game } from './Game';

const DEG = Math.PI / 180;

/** Se oye en toda la dimensión: desde su dirección, a dos bloques del que escucha. */
function globalPos(g: Game, p: [number, number, number]): [number, number, number] {
  const pl = g.player;
  const dx = p[0] - pl.x, dz = p[2] - pl.z, d = Math.hypot(dx, dz) || 1;
  return d < 2 ? p : [pl.x + (dx / d) * 2, pl.eyeY, pl.z + (dz / d) * 2];
}

/** true si el efecto era de este módulo. */
export function witherFx(g: Game, kind: string, p: [number, number, number], a?: number): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'wither_spawn':
      g.audio.playWitherSfx('wither_spawn', globalPos(g, p));
      fx.pfx.explosion(p[0], p[1], p[2], 7);
      return true;
    case 'wither_death':
      g.audio.playMob('wither', 'death', globalPos(g, p));
      fx.spawnSmoke(p[0], p[1], p[2], 30, 1.2, 0.2, 0.6, 1.4);
      return true;
    case 'wither_summon':
      fx.spawnSmoke(p[0], p[1], p[2], 30, 1, 0.15, 0.6, 1);
      return true;
    case 'wither_cell':
      if (a !== undefined && isValidBlockId(a)) {
        fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), a, 0xf0);
        const snd = BLOCKS[a]?.sound;
        if (snd) g.audio.playBreak(snd, p);
      }
      return true;
    case 'wither_shoot':
      g.audio.playWitherSfx('wither_shoot', p);
      return true;
    case 'wither_break':
      g.audio.playWitherSfx('wither_break', p);
      return true;
    case 'wither_ambient':
      g.audio.playMob('wither', 'idle', p);
      return true;
    default:
      return false;
  }
}

/** Partículas de cada frame. */
export function witherTick(g: Game, dt: number): void {
  const pl = g.player;
  const fx = g.renderer.entities;
  const ticks = dt * 20;
  for (const e of g.ents.list.values()) {
    if (e.gone || (e.type !== MOB_WITHER && e.type !== ENT_WITHER_SKULL)) continue;
    if (Math.hypot(e.x - pl.x, e.y - pl.y, e.z - pl.z) > 64) continue;
    if (e.type === ENT_WITHER_SKULL) {
      if (Math.random() < ticks) fx.spawnSmoke(e.x, e.y + 0.15, e.z, 1, 0.05, e.variant === 1 ? 0.6 : 0.25, 0.12, 0.3);
      continue;
    }
    if (e.deathT >= 0) continue;
    const invul = witherInvulnerable(e);
    const powered = witherPowered(e);
    const bodyJava = 180 - e.bodyYaw / DEG;
    for (let h = 0; h < 3; h++) {
      const [hx, hy, hz] = witherHeadPos(bodyJava, h);
      if (Math.random() < ticks) fx.spawnSmoke(e.x + hx + gauss() * 0.3, e.y + hy + gauss() * 0.3, e.z + hz + gauss() * 0.3, 1, 0.02, 0.2, 0.1, 0.4);
      if (powered && Math.random() < ticks / 4) swirl(g, e.x + hx + gauss() * 0.3, e.y + hy + gauss() * 0.3, e.z + hz + gauss() * 0.3, [0.7 * 255, 0.7 * 255, 0.5 * 255]);
    }
    if (invul > 0) {
      for (let n = Math.floor(3 * ticks + Math.random()); n > 0; n--) {
        swirl(g, e.x + gauss(), e.y + Math.random() * 3.3, e.z + gauss(), [0.7 * 255, 0.7 * 255, 0.9 * 255]);
      }
    }
  }
}

function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
}
