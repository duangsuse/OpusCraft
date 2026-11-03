// Fase 6.5 (equipo): efectos del equipo que llegan del servidor (sonido y partículas): el mechero, el
// fuego que quema o se apaga, la ballesta, el tridente, el cuerno de cabra, los cohetes (subida,
// estallido de colores o chasquido), las armaduras de caballo y lobo, la embestida de la cabra, el
// acelerón del cerdo y el conducto. También la estela de chispas de los cohetes en vuelo.
import type { Game } from './Game';
import { PF, SPRITE } from '../render/particles/ParticleSystem';
import { ENT_FIREWORK, FIREWORK_RGB, colorList } from '../../shared/equipment';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Sonido (y partículas) de un efecto del equipo; false si no es de este módulo. */
export function equipmentFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  const pfx = g.renderer.entities.pfx;
  switch (kind) {
    case 'ignite':
      for (let i = 0; i < 4; i++) pfx.flame(p[0] + rnd(-0.2, 0.2), p[1] + rnd(-0.1, 0.2), p[2] + rnd(-0.2, 0.2), 0.8);
      pfx.crit(p[0], p[1], p[2], 5);
      break;
    case 'fire_burn':
      pfx.smoke(p[0], p[1], p[2], 6, 0.4, 0.2, 0.25, 1.4);
      break;
    case 'fire_extinguish':
      pfx.smoke(p[0], p[1], p[2], 8, 0.35, 0.85, 0.2, 1.6);
      break;
    case 'crossbow_shoot':
    case 'trident_throw':
    case 'horse_armor':
    case 'wolf_armor':
      break;
    case 'trident_hit':
    case 'trident_break':
    case 'wolf_armor_break':
      pfx.crit(p[0], p[1], p[2], kind === 'trident_hit' ? 4 : 10);
      break;
    case 'goat_horn':
      g.audio.playEquipSfx(kind, p, a ?? 1);
      return true;
    case 'firework_launch':
      pfx.smoke(p[0], p[1], p[2], 4, 0.15, 0.7, 0.15, 0.6);
      break;
    case 'firework_burst':
      fireworkBurst(g, p, a ?? 0);
      g.audio.playEquipSfx(kind, p, b ?? 1);
      return true;
    case 'firework_fizzle':
      pfx.smoke(p[0], p[1], p[2], 5, 0.2, 0.6, 0.2, 0.5);
      break;
    case 'goat_ram':
      pfx.crit(p[0], p[1], p[2], 8);
      pfx.smoke(p[0], p[1], p[2], 4, 0.3, 0.7, 0.2, 0.6);
      g.shake = Math.max(g.shake, Math.hypot(p[0] - g.player.x, p[2] - g.player.z) < 3 ? 0.4 : 0);
      break;
    case 'pig_boost':
      pfx.smoke(p[0], p[1] - 0.4, p[2], 5, 0.3, 0.8, 0.2, 0.5);
      break;
    case 'conduit_on':
    case 'conduit_off':
      pfx.bubbles(p[0], p[1], p[2], 12, 0.6);
      if (kind === 'conduit_on') pfx.sparkles(p[0], p[1], p[2], 10, 0.8, [0.4, 1.4, 1.8]);
      break;
    default:
      return false;
  }
  g.audio.playEquipSfx(kind, p);
  return true;
}

/** Estallido: una esfera de chispas de los colores del cohete que caen despacio y centellean. */
function fireworkBurst(g: Game, p: [number, number, number], mask: number): void {
  const ps = g.renderer.entities.pfx.ps;
  const colors = colorList(mask);
  if (colors.length === 0) colors.push(0);
  const n = 90 + Math.min(4, colors.length) * 20;
  for (let i = 0; i < n; i++) {
    // Dirección al azar sobre la esfera.
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const sp = rnd(7, 9.5);
    const c = FIREWORK_RGB[colors[i % colors.length]];
    // (Sin pasarse de 1,4: de noche la exposición sube y los colores muy intensos se ven blancos.)
    const k = 1.4 / 255;
    ps.spawn({
      x: p[0], y: p[1], z: p[2], vx: s * Math.cos(th) * sp, vy: u * sp, vz: s * Math.sin(th) * sp,
      life: rnd(1.1, 1.8), size: rnd(0.32, 0.46), size1: 0.12, sprite: i % 3 === 0 ? SPRITE.star : SPRITE.spark,
      r: c[0] * k + 0.05, g: c[1] * k + 0.05, b: c[2] * k + 0.05, grav: 2.5, drag: 2.2, light: 0xff,
      flags: PF.EMISSIVE | (i % 3 === 0 ? PF.BLINK : PF.STRETCH),
    });
  }
  // Destello en el centro.
  ps.spawn({ x: p[0], y: p[1], z: p[2], life: 0.25, size: 2.2, size1: 0.5, sprite: SPRITE.star, r: 3, g: 3, b: 3, flags: PF.EMISSIVE, light: 0xff });
  g.flash = Math.max(g.flash, 0.05);
}

/** Cada frame: estela de chispas de los cohetes que suben. */
export function fireworkTrails(g: Game, dt: number): void {
  const ps = g.renderer.entities.pfx.ps;
  for (const e of g.ents.list.values()) {
    if (e.type !== ENT_FIREWORK || e.gone || Math.random() > dt * 40) continue;
    ps.spawn({
      x: e.x + rnd(-0.05, 0.05), y: e.y - 0.1, z: e.z + rnd(-0.05, 0.05), vx: rnd(-0.4, 0.4), vy: rnd(-1.5, -0.5), vz: rnd(-0.4, 0.4),
      life: rnd(0.3, 0.6), size: rnd(0.06, 0.1), size1: 0.02, sprite: SPRITE.spark, r: 3, g: 2.4, b: 1.4, grav: 4, drag: 1,
      flags: PF.EMISSIVE, light: 0xff,
    });
  }
}
