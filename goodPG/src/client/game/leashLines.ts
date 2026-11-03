// Fase 6.5 (remate): correas dibujadas. De la mano de quien la lleva (o del nudo en la valla) hasta la
// criatura atada; el renderizador las dibuja combadas, como los sedales pero más gruesas.
import { ENT_END_CRYSTAL } from '../../shared/mobs';
import { MOBS } from '../../shared/mobs';
import { isBoatType, BOAT_WIDTH } from '../../shared/vehicles'; // Fase 7 (remate)
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { ClientEntity } from './ClientEntities';
import type { FishLine, LocalRod } from './fishingLines';

/** Mano de un jugador visto desde fuera (a la altura de la cintura, algo adelantada). */
function handOf(x: number, y: number, z: number, yaw: number): [number, number, number] {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return [x + rx * 0.38 + fx * 0.3, y + 1.0, z + rz * 0.38 + fz * 0.3];
}

export function leashLines(
  ents: ReadonlyMap<number, ClientEntity>, myId: string | null, local: LocalRod, remotes: readonly RemotePlayerView[],
): { lines: FishLine[]; knots: [number, number, number][] } {
  const lines: FishLine[] = [];
  const knots: [number, number, number][] = [];
  for (const e of ents.values()) {
    const h = e.leash;
    if (!h || e.gone || e.type === ENT_END_CRYSTAL) continue; // Fase 8.6: en el cristal, es a donde apunta su haz
    let a: [number, number, number] | null = null;
    if (Array.isArray(h)) {
      a = [h[0] + 0.5, h[1] + 0.62, h[2] + 0.5];
      knots.push(a);
    } else if (h.startsWith('@')) {
      // Fase 7.5 (fauna): atada a una criatura (la llama de comerciante, al comerciante): de su mano.
      const t = ents.get(Number(h.slice(1)));
      if (t && !t.gone) a = handOf(t.x, t.y, t.z, t.bodyYaw);
    } else if (h === myId) {
      if (local.firstPerson) {
        // Abajo a la derecha de la vista.
        const { yaw, pitch } = local;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const f = [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp];
        const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
        a = [0, 1, 2].map((k) => local.cam[k] + f[k] * 0.5 + r[k] * 0.3 - (k === 1 ? 0.45 : 0)) as [number, number, number];
      } else a = handOf(local.feet[0], local.feet[1], local.feet[2], local.bodyYaw);
    } else {
      const v = remotes.find((rp) => rp.id === h);
      if (v) a = handOf(v.x, v.y, v.z, v.bodyYaw);
    }
    if (!a) continue;
    const def = MOBS[e.type];
    // Al cuello: por delante del centro, a tres cuartos de su altura. Fase 7 (remate): la barca, de la proa.
    const boat = isBoatType(e.type);
    const fwd = def ? def.width * 0.35 : boat ? BOAT_WIDTH * 0.45 : 0;
    const bx = e.x - Math.sin(e.bodyYaw) * fwd, bz = e.z - Math.cos(e.bodyYaw) * fwd;
    lines.push([a[0], a[1], a[2], bx, e.y + (def ? def.height * 0.75 : boat ? 0.45 : 0.5), bz]);
  }
  return { lines, knots };
}
