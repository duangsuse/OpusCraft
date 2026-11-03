// Sedales de las cañas de pescar: de la punta de la caña (en la mano del jugador local o de los
// demás) hasta su flotador. El renderizador los dibuja combados.
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { ClientEntity } from './ClientEntities';

/** [ax, ay, az, bx, by, bz]: punta de la caña y flotador. */
export type FishLine = [number, number, number, number, number, number];

export interface LocalRod {
  /** Posición de la cámara y orientación de la vista. */
  cam: [number, number, number];
  yaw: number;
  pitch: number;
  /** Primera persona (la caña está en la mano de la vista) o tercera (en el modelo). */
  firstPerson: boolean;
  /** Pies del jugador local y hacia dónde mira su cuerpo (para la tercera persona). */
  feet: [number, number, number];
  bodyYaw: number;
}

/** Punta de la caña de un jugador visto desde fuera: sobre la mano derecha, algo adelantada. */
function modelTip(x: number, y: number, z: number, yaw: number): [number, number, number] {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return [x + rx * 0.38 + fx * 0.9, y + 2.0, z + rz * 0.38 + fz * 0.9];
}

export function fishingLines(
  bobbers: ReadonlyMap<string, number>, ents: ReadonlyMap<number, ClientEntity>, myId: string | null, local: LocalRod,
  remotes: readonly RemotePlayerView[],
): FishLine[] {
  const out: FishLine[] = [];
  for (const [pid, eid] of bobbers) {
    const e = ents.get(eid);
    if (!e || e.gone) continue;
    let tip: [number, number, number] | null = null;
    if (pid === myId) {
      if (local.firstPerson) {
        // Punta de la caña de la mano: abajo a la derecha de la vista, hacia delante.
        const { yaw, pitch } = local;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const f = [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp];
        const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
        const u = [Math.sin(yaw) * sp, cp, Math.cos(yaw) * sp];
        tip = [0, 1, 2].map((k) => local.cam[k] + f[k] * 0.75 + r[k] * 0.31 - u[k] * 0.17) as [number, number, number];
      } else tip = modelTip(local.feet[0], local.feet[1], local.feet[2], local.bodyYaw);
    } else {
      const v = remotes.find((rp) => rp.id === pid);
      if (v) tip = modelTip(v.x, v.y, v.z, v.bodyYaw);
    }
    if (tip) out.push([tip[0], tip[1], tip[2], e.x, e.y + 0.12, e.z]);
  }
  return out;
}
