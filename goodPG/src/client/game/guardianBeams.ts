// Fase 7.5 (océano): rayos de los guardianes que están cargando (EF_ACTION). El servidor no manda a quién
// apuntan: el guardián mira fijamente a su presa, así que se elige la que está en su línea de mirada (el
// jugador local, otro jugador o un calamar o ajolote) y el color sale del tiempo que lleva cargando.
import { MOBS, MOB_SQUID, MOB_GLOW_SQUID, MOB_AXOLOTL } from '../../shared/mobs';
import { LASER_CHARGE, LASER_RANGE, MOB_ELDER_GUARDIAN, isGuardian } from '../../shared/oceanMobs';
import type { GuardianBeam } from '../render/GuardianBeamRenderer';
import type { Game } from './Game';

const PREY = new Set([MOB_SQUID, MOB_GLOW_SQUID, MOB_AXOLOTL]);

export function guardianBeams(g: Game): GuardianBeam[] {
  const out: GuardianBeam[] = [];
  for (const e of g.ents.list.values()) {
    if (!isGuardian(e.type) || e.actionT < 0 || e.deathT >= 0 || e.gone) continue;
    const def = MOBS[e.type];
    const cp = Math.cos(e.pitch);
    const f: [number, number, number] = [-Math.sin(e.yaw) * cp, Math.sin(e.pitch), -Math.cos(e.yaw) * cp];
    const c: [number, number, number] = [e.x, e.y + def.height / 2, e.z];
    // Presa: la que queda más cerca de la línea de mirada.
    let best: [number, number, number] | null = null, bestA = 0.5;
    const consider = (x: number, y: number, z: number) => {
      const dx = x - c[0], dy = y - c[1], dz = z - c[2];
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.5 || d > LASER_RANGE + 2) return;
      const a = Math.acos(Math.max(-1, Math.min(1, (dx * f[0] + dy * f[1] + dz * f[2]) / d)));
      if (a < bestA) {
        bestA = a;
        best = [x, y, z];
      }
    };
    if (!g.survival.dead) consider(g.player.x, g.player.y + 1.0, g.player.z);
    for (const rp of g.remote.values()) consider(rp.view.x, rp.view.y + 1.2, rp.view.z);
    for (const o of g.ents.list.values()) if (PREY.has(o.type) && o.deathT < 0) consider(o.x, o.y + MOBS[o.type].height / 2, o.z);
    if (!best) continue;
    const r = def.width * 0.5;
    out.push({
      from: [c[0] + f[0] * r, c[1] + f[1] * r, c[2] + f[2] * r], to: best,
      charge: Math.min(1, e.actionT / LASER_CHARGE[e.type]), width: e.type === MOB_ELDER_GUARDIAN ? 0.13 : 0.08,
    });
  }
  return out;
}
