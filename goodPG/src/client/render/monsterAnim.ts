// Fase 6 (monstruos): animación de los monstruos nuevos que no encajan en las de MobRenderer.
// - Slime: se estira en el aire (EF_ACTION) y se aplasta al caer; tiembla un poco en reposo.
// - Phantom: bate las alas, mueve la cola y se inclina hacia donde vuela.
// - Lepisma: el cuerpo serpentea.
import { mat4 } from 'gl-matrix';
import type { MobDef } from '../../shared/mobs';
import { EF_ACTION } from '../../shared/protocol';
import type { ClientEntity } from '../game/ClientEntities';

/** Rotaciones [x, y, z] de una parte (se suman a las de reposo). */
export function animateMonster(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  switch (def.anim) {
    case 'phantom': {
      const flap = Math.sin(time * 6.5 + e.seed * 10) * (e.flags & EF_ACTION ? 0.15 : 0.5);
      if (name === 'wingR') out[2] = flap;
      else if (name === 'wingL') out[2] = -flap;
      else if (name === 'wingTipR') out[2] = flap * 0.7;
      else if (name === 'wingTipL') out[2] = -flap * 0.7;
      else if (name === 'tail' || name === 'tailTip') out[0] = Math.sin(time * 6.5 + e.seed * 10 + 1) * 0.12;
      break;
    }
    // Fase 8.6: la endermita (EndermiteModel.setupAnim): cada segmento se menea deprisa, más los de los extremos.
    case 'endermite':
      if (name.startsWith('seg')) {
        const i = Number(name.slice(3));
        const a = time * 18 + i * 0.15 * Math.PI + e.seed * 5;
        out[1] = Math.cos(a) * Math.PI * 0.01 * (1 + Math.abs(i - 2)) * 3;
      }
      break;
    case 'silverfish':
      if (name.startsWith('seg')) {
        const i = Number(name.slice(3));
        out[1] = Math.sin(time * 9 + i * 0.9 + e.seed * 5) * (0.08 + 0.18 * e.walkAmount) * Math.min(1, i * 0.5 + 0.3);
      }
      break;
  }
}

/** Estado visual del slime (estiramiento suavizado) por entidad. */
const squish = new WeakMap<ClientEntity, { s: number; t: number; air: boolean }>();

/**
 * Transformación extra de la raíz (antes de escalar): inclina al phantom según su vuelo y devuelve
 * el factor de escala [x, y, z] (el slime se estira y se aplasta).
 */
export function monsterRoot(def: MobDef, e: ClientEntity, m: mat4): [number, number, number] {
  if (def.anim === 'phantom') {
    const h = def.parts[0].pivot[1] / 16;
    mat4.translate(m, m, [0, h, 0]);
    mat4.rotateX(m, m, Math.max(-1.1, Math.min(1.1, e.pitch)));
    mat4.translate(m, m, [0, -h, 0]);
    return [1, 1, 1];
  }
  if (def.anim !== 'slime') return [1, 1, 1];
  const time = performance.now() / 1000;
  let st = squish.get(e);
  if (!st) {
    st = { s: 0, t: time, air: false };
    squish.set(e, st);
  }
  const dt = Math.max(0, Math.min(0.1, time - st.t));
  st.t = time;
  const air = (e.flags & EF_ACTION) !== 0;
  if (st.air && !air) st.s = -0.7; // aterriza: se aplasta
  st.air = air;
  const target = air ? 1 : 0;
  st.s += (target - st.s) * Math.min(1, dt * (air ? 8 : 5));
  const wobble = air ? 0 : Math.sin(time * 3 + e.seed * 7) * 0.03;
  const k = st.s * 0.22 + wobble;
  return [1 - k * 0.5, 1 + k, 1 - k * 0.5];
}
