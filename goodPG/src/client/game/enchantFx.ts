// Fase 7 (encantamientos): efectos que llegan del servidor: encantar en la mesa (sonido y chispas), el
// yunque (usarlo, caer y romperse), la afiladora, la botella con experiencia al romperse, las espinas y
// el barrido de la espada (un arco blanco delante de quien golpea).
import { SPRITE, PF } from '../render/particles/ParticleSystem';
import { BLOCK_TEX } from '../../shared/blocks';
import type { Game } from './Game';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Atiende el efecto `kind` si es suyo (devuelve false si no). */
export function enchantFx(g: Game, kind: string, p: [number, number, number], a?: number): boolean {
  const pfx = g.renderer.entities.pfx;
  switch (kind) {
    case 'enchant':
      g.audio.playEnchantSfx('enchant', p);
      pfx.sparkles(p[0], p[1] + 0.3, p[2], 12, 0.5, [1.3, 0.8, 2.2]);
      return true;
    case 'anvil_use':
    case 'anvil_land':
      g.audio.playEnchantSfx(kind, p);
      if (kind === 'anvil_land') pfx.smoke(p[0], p[1] + 0.1, p[2], 6, 0.5, 0.55, 0.25, 0.4);
      else pfx.crit(p[0], p[1] + 0.5, p[2], 4);
      return true;
    case 'anvil_destroy':
      g.audio.playEnchantSfx(kind, p);
      if (a !== undefined && a > 0) {
        const light = g.world?.getLight(Math.floor(p[0]), Math.floor(p[1]) + 1, Math.floor(p[2])) ?? 0xf0;
        pfx.chips(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), BLOCK_TEX[a * 6 + 2], light, 36);
      }
      return true;
    case 'grindstone':
      g.audio.playEnchantSfx(kind, p);
      pfx.crit(p[0], p[1] + 0.4, p[2], 6);
      return true;
    // Fase 8.5: el nexo de reaparición (cargar, fijar el punto y gastar una carga).
    case 'anchor_charge':
    case 'anchor_set':
    case 'anchor_deplete':
      g.audio.playEnchantSfx(kind, p);
      for (let i = 0; i < (kind === 'anchor_deplete' ? 10 : 6); i++) pfx.anchorMote(p[0] + rnd(-0.4, 0.4), p[1] + 0.52, p[2] + rnd(-0.4, 0.4));
      return true;
    case 'beacon_power': // Fase 8.5: se eligió un poder en el faro
      g.audio.playEnchantSfx(kind, p);
      pfx.sparkles(p[0], p[1] + 0.6, p[2], 10, 0.4, [0.6, 1.8, 2.2]);
      return true;
    case 'smithing': // Fase 8.5: golpes de martillo y chispas sobre la mesa de herrería
      g.audio.playEnchantSfx(kind, p);
      pfx.crit(p[0], p[1], p[2], 8);
      return true;
    case 'xp_bottle':
      g.audio.playEnchantSfx(kind, p);
      pfx.sparkles(p[0], p[1], p[2], 16, 0.4, [0.9, 2.2, 0.6]);
      pfx.splash(p[0], p[1], p[2], 6, true);
      return true;
    case 'thorns':
      g.audio.playEnchantSfx(kind, p);
      pfx.crit(p[0], p[1], p[2], 6);
      return true;
    case 'sweep': {
      // Arco de un lado a otro, perpendicular a donde mira quien golpea.
      const yaw = a ?? 0;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (let i = 0; i < 9; i++) {
        const t = (i / 8 - 0.5) * 2.2;
        const c = Math.cos(t), s = Math.sin(t);
        const dx = fx * c - fz * s, dz = fz * c + fx * s;
        g.renderer.entities.particles.spawn({
          x: p[0] + dx * 0.5, y: p[1] + rnd(-0.05, 0.05), z: p[2] + dz * 0.5, vx: -dz * 4 * Math.sign(t || 1), vy: 0, vz: dx * 4 * Math.sign(t || 1),
          life: 0.22, size: 0.35, size1: 0.2, sprite: SPRITE.streak, r: 1.6, g: 1.6, b: 1.6, a: 0.8, drag: 6,
          flags: PF.EMISSIVE | PF.STRETCH,
        });
      }
      g.audio.playSweep(p);
      return true;
    }
  }
  return false;
}

