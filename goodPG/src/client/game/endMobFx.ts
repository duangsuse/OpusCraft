// Fase 8.6 (el End): efectos de las cosas del End en el cliente.
// - Del servidor: el ojo de ender que se engasta en un marco (humo y el golpe), el portal que se abre (en toda la
//   dimensión), el ojo que cae o se rompe (levelEvent 2003: trocitos y un remolino de partículas de portal), la
//   perla que cae (32 partículas de portal y el sonido del teletransporte) y el lanzamiento del ojo.
// - Cada frame: las partículas de portal que sueltan los enderman y las endermitas (dos por tick, como en su
//   aiStep) y la estela del ojo de ender en vuelo (cuatro por tick; burbujas si va por el agua).
import { MOB_ENDERMAN, MOB_ENDERMITE, ENT_THROWN, MOB_ENDER_DRAGON, ENT_DRAGON_FIREBALL, EF_DRAGON_LANDING, EF_DRAGON_SITTING, ENT_SHULKER_BULLET } from '../../shared/mobs';
import { ENDER_EYE } from '../../shared/items';
import type { Game } from './Game';
import { updateDragons, dragonPartBoxes } from './dragonClient';
import { gatewayBeam } from './endFightClient';

/** Se oye en toda la dimensión: desde la dirección del suceso, a dos bloques del que escucha. */
function globalPos(g: Game, p: [number, number, number]): [number, number, number] {
  const pl = g.player;
  const dx = p[0] - pl.x, dz = p[2] - pl.z, d = Math.hypot(dx, dz) || 1;
  return d < 2 ? p : [pl.x + (dx / d) * 2, pl.eyeY, pl.z + (dz / d) * 2];
}

/** true si el efecto era de este módulo. */
export function endFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  const fx = g.renderer.entities;
  const pfx = fx.pfx;
  switch (kind) {
    case 'end_frame_fill':
      g.audio.playEquipSfx('end_portal_frame_fill', p);
      fx.spawnSmoke(p[0], p[1], p[2], 16, 0.35, 0.3, 0.3, 0.6);
      for (let i = 0; i < 10; i++) pfx.portal(p[0], p[1] - 0.3, p[2], (Math.random() - 0.5) * 1.2, Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
      return true;
    case 'end_portal_spawn': {
      // Se oye en toda la dimensión: desde la dirección del portal, a dos bloques del que escucha.
      const pl = g.player;
      const dx = p[0] - pl.x, dz = p[2] - pl.z, d = Math.hypot(dx, dz) || 1;
      const near: [number, number, number] = d < 2 ? p : [pl.x + (dx / d) * 2, pl.eyeY, pl.z + (dz / d) * 2];
      g.audio.playEquipSfx('end_portal_spawn', near);
      for (let i = 0; i < 60; i++) pfx.portal(p[0], p[1], p[2], (Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3);
      return true;
    }
    case 'ender_eye_launch':
      g.audio.playEquipSfx('ender_eye_launch', p);
      return true;
    case 'ender_eye_drop':
      g.audio.playEquipSfx('ender_eye_death', p);
      return true;
    case 'ender_eye_break':
      g.audio.playEquipSfx('ender_eye_death', p);
      fx.spawnSmoke(p[0], p[1], p[2], 8, 0.2, 0.25, 0.25, 0.4);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pfx.portal(p[0], p[1] - 0.6, p[2], Math.cos(a) * 1.4, Math.random() * 0.4, Math.sin(a) * 1.4);
      }
      pfx.magic(p[0], p[1], p[2], 10, 0.3);
      return true;
    case 'pearl_land':
      g.audio.playEquipSfx('chorus_teleport', p);
      for (let i = 0; i < 32; i++) pfx.portal(p[0], p[1] - 0.6, p[2], (Math.random() - 0.5) * 2, Math.random() * 2 - 0.5, (Math.random() - 0.5) * 2);
      return true;
    // El dragón.
    case 'dragon_growl':
      g.audio.playEquipSfx('dragon_growl', p);
      return true;
    case 'dragon_death':
      g.audio.playEquipSfx('dragon_death', globalPos(g, p));
      return true;
    case 'dragon_shoot':
      g.audio.playEquipSfx('dragon_shoot', p);
      return true;
    case 'dragon_fireball_hit':
      g.audio.playEquipSfx('dragon_fireball_hit', p);
      for (let i = 0; i < 40; i++) {
        const an = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
        pfx.dragonBreath(p[0], p[1], p[2], Math.cos(an) * sp, Math.random() * 1.5, Math.sin(an) * sp);
      }
      return true;
    case 'dragon_breath': {
      g.audio.playEquipSfx('dragon_breath', p);
      const dx = (a ?? 0) / 100, dz = (b ?? 0) / 100;
      for (let i = 0; i < 60; i++) {
        const sp = 4 + Math.random() * 6;
        pfx.dragonBreath(p[0], p[1], p[2], dx * sp + (Math.random() - 0.5) * 2.5, -1.5 - Math.random() * 2, dz * sp + (Math.random() - 0.5) * 2.5);
      }
      return true;
    }
    case 'dragon_break':
      pfx.explosion(p[0], p[1], p[2], 1.5);
      return true;
    case 'gateway_spawn':
      g.audio.playEquipSfx('gateway_spawn', p);
      gatewayBeam(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), 10);
      return true;
    case 'gateway_beam':
      g.audio.playEquipSfx('chorus_teleport', p);
      gatewayBeam(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), 2);
      for (let i = 0; i < 30; i++) pfx.portal(p[0], p[1], p[2], (Math.random() - 0.5) * 2, Math.random() * 2 - 1, (Math.random() - 0.5) * 2);
      return true;
    case 'egg_teleport': {
      // Un rastro de partículas de portal del sitio de antes al de ahora (128 en Java).
      const dx = a ?? 0, bb = b ?? 0, dy = Math.round(bb / 1000), dz = bb - dy * 1000;
      g.audio.playEquipSfx('chorus_teleport', p);
      for (let i = 0; i < 128; i++) {
        const t = i / 127;
        pfx.portal(p[0] + dx * t + (Math.random() - 0.5), p[1] + dy * t + Math.random() - 0.5 - 0.6, p[2] + dz * t + (Math.random() - 0.5), (Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4);
      }
      return true;
    }
    // El shulker: se abre, se cierra, dispara y se teletransporta (con las partículas de portal del levelEvent 2016).
    case 'shulker_open':
    case 'shulker_close':
    case 'shulker_shoot':
      g.audio.playEquipSfx(kind, p);
      return true;
    case 'shulker_teleport':
      g.audio.playEquipSfx('shulker_teleport', p);
      for (let i = 0; i < 24; i++) pfx.portal(p[0], p[1] - 0.6, p[2], (Math.random() - 0.5) * 1.6, Math.random() - 0.3, (Math.random() - 0.5) * 1.6);
      return true;
    // La bala: choca (dos explosiones pequeñas) o la deshace un golpe (15 críticos).
    case 'shulker_bullet_hit':
      g.audio.playEquipSfx('shulker_bullet_hit', p);
      pfx.explosion(p[0], p[1], p[2], 0.4);
      return true;
    case 'shulker_bullet_hurt':
      g.audio.playEquipSfx('shulker_bullet_hurt', p);
      pfx.crit(p[0], p[1], p[2], 15);
      return true;
    default:
      return false;
  }
}

/** Cada frame: partículas de portal de enderman y endermitas y la estela del ojo de ender. */
export function endTick(g: Game, dt: number): void {
  const pl = g.player;
  const pfx = g.renderer.entities.pfx;
  const ticks = dt * 20;
  updateDragons(g.ents.list.values(), dt, (e) => g.audio.playEquipSfx('dragon_flap', [e.x, e.y + 2, e.z]));
  for (const e of g.ents.list.values()) {
    if (e.type === MOB_ENDER_DRAGON && !e.gone) dragonFx(g, e, ticks);
    if (e.gone || e.deathT >= 0) continue;
    const d = Math.hypot(e.x - pl.x, e.y - pl.y, e.z - pl.z);
    if (d > 40) continue;
    if (e.type === MOB_ENDERMAN || e.type === MOB_ENDERMITE) {
      // Dos por tick de cerca; de lejos menos (no se ven y cuestan).
      const rate = 2 * ticks * (d < 16 ? 1 : 0.4);
      const tall = e.type === MOB_ENDERMAN ? 2.9 : 0.3, half = e.type === MOB_ENDERMAN ? 0.3 : 0.2;
      for (let n = Math.floor(rate + Math.random()); n > 0; n--) {
        pfx.portal(e.x + (Math.random() - 0.5) * half * 2, e.y + Math.random() * tall - 0.25, e.z + (Math.random() - 0.5) * half * 2,
          (Math.random() - 0.5) * 2, -Math.random(), (Math.random() - 0.5) * 2);
      }
    } else if (e.type === ENT_DRAGON_FIREBALL) {
      pfx.dragonOrb(e.x, e.y + 0.5, e.z);
    } else if (e.type === ENT_SHULKER_BULLET) {
      // Una chispa por tick, donde estaba (ShulkerBullet.tick en el cliente).
      for (let n = Math.floor(ticks + Math.random()); n > 0; n--) pfx.endRod(e.x, e.y + 0.15, e.z, 0, 0, 0);
    } else if (e.type === ENT_THROWN && e.item === ENDER_EYE) {
      for (let n = Math.floor(4 * ticks + Math.random()); n > 0; n--) {
        pfx.portal(e.x + Math.random() * 0.6 - 0.3, e.y - 0.5, e.z + Math.random() * 0.6 - 0.3, (Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4);
      }
    }
  }
}

/** Las partículas del dragón: explosiones mientras muere y el aliento de la boca al aterrizar o posado. */
function dragonFx(g: Game, e: import('./ClientEntities').ClientEntity, ticks: number): void {
  const pfx = g.renderer.entities.pfx;
  if (e.variant > 0) {
    // Cada 10 ticks mientras muere; en los últimos 20, cada tick (EnderDragon.tickDeath y la fase de muerte).
    const rate = e.variant >= 180 ? 1 : 0.1;
    if (Math.random() < rate * ticks) pfx.explosion(e.x + (Math.random() - 0.5) * 8, e.y + 2 + (Math.random() - 0.5) * 4, e.z + (Math.random() - 0.5) * 8, 2);
    return;
  }
  if (e.flags & (EF_DRAGON_LANDING | EF_DRAGON_SITTING) && Math.random() < 0.5 * ticks) {
    const head = dragonPartBoxes(e)[0];
    const hx = (head.x0 + head.x1) / 2, hy = head.y0 + 0.3, hz = (head.z0 + head.z1) / 2;
    const dx = hx - e.x, dz = hz - e.z, dl = Math.hypot(dx, dz) || 1;
    pfx.dragonBreath(hx, hy, hz, (dx / dl) * 1.5 + (Math.random() - 0.5), -0.4, (dz / dl) * 1.5 + (Math.random() - 0.5));
  }
}
