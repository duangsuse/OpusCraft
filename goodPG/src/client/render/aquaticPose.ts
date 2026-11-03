// Animación de las criaturas acuáticas (fase 6): colas que baten, aletas, delfines que ondulan,
// tortugas que reman, ajolotes y renacuajos que culebrean, ranas que encogen las patas al saltar,
// peces que dan coletazos fuera del agua y el pez globo que se hincha.
import { mat4 } from 'gl-matrix';
import { MOB_PUFFERFISH, MOB_FROG, type MobDef } from '../../shared/mobs';
import { EF_ACTION, EF_ANGRY } from '../../shared/protocol';
import type { ClientEntity } from '../game/ClientEntities';

/** Rotaciones de animación [x, y, z] de una parte (se suman a las de reposo). */
export function animateAquatic(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  const flop = (e.flags & EF_ACTION) !== 0;
  // Ritmo del nado: más rápido cuanto más deprisa va (y frenético boqueando en tierra).
  const beat = time * (flop ? 22 : 6 + e.walkAmount * 10) + e.seed * 20;
  switch (def.anim) {
    case 'fish':
    case 'tadpole':
      if (name === 'tail') out[1] = Math.sin(beat) * (flop ? 0.9 : 0.45);
      else if (name === 'body') out[1] = Math.sin(beat - 1) * 0.08;
      else if (name === 'finR' || name === 'finL') out[1] = Math.sin(beat * 0.7) * 0.3 * (name === 'finR' ? 1 : -1);
      break;
    case 'puffer':
      if (name === 'finR' || name === 'finL') out[1] = Math.sin(beat * 1.5) * 0.5 * (name === 'finR' ? 1 : -1);
      else if (name === 'tail') out[1] = Math.sin(beat) * 0.4;
      break;
    case 'dolphin': {
      // Ondulación vertical (los cetáceos mueven la cola arriba y abajo).
      const w = Math.sin(time * (3 + e.walkAmount * 3) + e.seed * 10);
      if (name === 'tail') out[0] = w * 0.25;
      else if (name === 'tailFin') out[0] = w * 0.35;
      else if (name === 'finR' || name === 'finL') out[2] = Math.sin(time * 2 + e.seed) * 0.15 * (name === 'finR' ? 1 : -1);
      break;
    }
    case 'turtle': {
      const row = Math.sin(e.walkPhase * 0.8) * e.walkAmount;
      if (name === 'legFR' || name === 'legFL') out[1] = row * 0.8 * (name === 'legFR' ? 1 : -1);
      else if (name === 'legBR' || name === 'legBL') out[1] = -row * 0.5 * (name === 'legBR' ? 1 : -1);
      else if (name === 'head') out[1] = Math.sin(time * 0.7 + e.seed * 6) * 0.2;
      break;
    }
    case 'axolotl': {
      const w = Math.sin(e.walkPhase * 1.2 + time * 2 + e.seed * 9);
      if (name === 'tail') out[1] = w * 0.5;
      else if (name === 'body') out[1] = w * 0.1;
      else if (name.startsWith('leg')) {
        const front = name === 'legFR' || name === 'legFL';
        out[0] = Math.sin(e.walkPhase * 1.5 + (front ? 0 : Math.PI)) * 0.8 * e.walkAmount;
      } else if (name === 'gillR' || name === 'gillL' || name === 'gillTop') out[0] = Math.sin(time * 3 + e.seed * 4) * 0.12;
      break;
    }
    case 'frog': {
      // En el aire (se mueve deprisa): patas estiradas hacia atrás.
      const jump = Math.min(1, e.walkAmount * 1.5);
      if (name === 'legR' || name === 'legL') out[0] = jump * 0.9;
      else if (name === 'armR' || name === 'armL') out[0] = -jump * 0.6;
      else if (name === 'head') out[0] = e.flags & EF_ACTION ? -0.35 : -Math.abs(Math.sin(time * 1.3 + e.seed * 5)) * 0.06; // cazando: la boca abierta
      break;
    }
  }
}

/** ¿Se oculta esta parte? (las espinas del pez globo sólo se ven cuando está hinchado). */
export function hiddenAquaticPart(def: MobDef, e: ClientEntity, name: string): boolean {
  if (def.id === MOB_FROG && name === 'tongue') return !(e.flags & EF_ACTION); // la lengua, sólo cazando
  return def.id === MOB_PUFFERFISH && name.startsWith('spike') && !(e.flags & EF_ANGRY);
}

/**
 * Transformación de la raíz: los peces se inclinan hacia donde nadan y, fuera del agua, se tumban de
 * lado; el pez globo cambia de tamaño. Devuelve el factor de escala.
 */
export function aquaticRoot(def: MobDef, e: ClientEntity, m: mat4, time: number): number {
  const flop = (e.flags & EF_ACTION) !== 0 && (def.anim === 'fish' || def.anim === 'puffer' || def.anim === 'tadpole' || def.anim === 'dolphin');
  const h = (def.height * 0.5) / Math.max(0.01, def.scale);
  if (flop) {
    // Tumbado de lado, dando coletazos.
    mat4.translate(m, m, [0, 0.1, 0]);
    mat4.rotateZ(m, m, Math.PI / 2 + Math.sin(time * 18 + e.seed * 9) * 0.25);
  } else if (def.anim === 'fish' || def.anim === 'dolphin' || def.anim === 'tadpole' || def.anim === 'axolotl') {
    mat4.translate(m, m, [0, h, 0]);
    mat4.rotateX(m, m, Math.max(-0.8, Math.min(0.8, e.pitch)));
    mat4.translate(m, m, [0, -h, 0]);
  }
  if (def.id === MOB_PUFFERFISH) return e.flags & EF_ANGRY ? 1 : 0.5;
  return 1;
}
