// Fase 6 (asaltos): animación de los illagers, el vex, el devastador y los colmillos del evocador.
// - Saqueador: la ballesta abajo al andar; al cargar (EF_ACTION) la apunta con los dos brazos.
// - Vindicador: brazos cruzados en calma; con presa, el hacha en alto y golpes al atacar.
// - Evocador: brazos cruzados; al conjurar (EF_ACTION), los alza y los agita.
// - Vex: bate las alas; embiste con la espada en alto (EF_ACTION).
// - Devastador: patas de cuadrúpedo, cabeza que cabecea y fauces abiertas al atacar.
// - Colmillos: brotan del suelo, se abren y se cierran de golpe, y se hunden.
// El estandarte de los capitanes sólo se dibuja con EF_CAPTAIN.
import { mat4 } from 'gl-matrix';
import { MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, type MobDef } from '../../shared/mobs';
import { EF_ACTION, EF_ANGRY, EF_CAPTAIN } from '../../shared/protocol';
import type { ClientEntity } from '../game/ClientEntities';

const BANNER_PARTS = new Set(['bannerPole', 'bannerBar', 'banner']);

/** Partes ocultas: el estandarte de quien no es capitán. */
export function hiddenIllagerPart(name: string, e: ClientEntity): boolean {
  return BANNER_PARTS.has(name) && !(e.flags & EF_CAPTAIN);
}

function clampAngle(a: number, lim: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-lim, Math.min(lim, d));
}

/** Rotaciones [x, y, z] de una parte (se suman a las de reposo). */
export function animateIllager(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  const swing = Math.sin(e.walkPhase) * 1.1 * e.walkAmount;
  const headYaw = clampAngle(e.yaw - e.bodyYaw, 1.3);
  const acting = (e.flags & EF_ACTION) !== 0;
  const angry = (e.flags & EF_ANGRY) !== 0;
  switch (def.anim) {
    case 'illager': {
      if (name === 'legR') out[0] = swing;
      else if (name === 'legL') out[0] = -swing;
      else if (name === 'head') {
        out[1] = headYaw;
        out[0] = e.pitch;
      } else if (name === 'bannerPole') out[2] = Math.sin(time * 1.6 + e.seed * 4) * 0.04;
      else if (name === 'banner') out[0] = 0.08 + Math.sin(time * 2.1 + e.seed * 7) * 0.06 + e.walkAmount * 0.25;
      else if (name === 'armR' || name === 'armL') {
        const side = name === 'armR' ? 1 : -1;
        const sway = Math.sin(time * 1.2 + e.seed * 5) * 0.04;
        if (def.id === MOB_PILLAGER) {
          if (acting) {
            // Apuntando: los dos brazos al frente, sujetando la ballesta.
            out[0] = Math.PI / 2 + e.pitch * 0.8;
            // (Un giro en Y positivo lleva hacia −X un brazo que apunta al frente.)
            out[1] = side === 1 ? 0.1 : -0.55;
          } else if (side === 1) out[0] = 0.35 + swing * 0.2 + sway;
          else out[0] = -swing * 0.8;
        } else if (def.id === MOB_VINDICATOR && (angry || acting)) {
          if (side === 1) out[0] = Math.PI * 0.72 + (acting ? Math.sin(time * 11) * 0.55 : sway);
          else out[0] = -swing * 0.6;
        } else if (def.id === MOB_EVOKER && acting) {
          // Conjuro: brazos alzados y abiertos que se agitan.
          out[0] = Math.PI * 0.85 + Math.sin(time * 9) * 0.12;
          out[2] = side * (0.55 + Math.sin(time * 9 + 1) * 0.1);
        } else if (def.id === MOB_VINDICATOR || def.id === MOB_EVOKER) {
          // En calma, brazos cruzados sobre el pecho.
          out[0] = 0.85 + sway;
          out[1] = side * 0.75;
        } else out[0] = -swing * side * 0.8;
      }
      break;
    }
    case 'vex': {
      if (name === 'wingR' || name === 'wingL') {
        const flap = Math.sin(time * 16 + e.seed * 9) * 0.45;
        out[1] = name === 'wingR' ? flap : -flap;
      } else if (name === 'armR') out[0] = acting ? Math.PI * 0.8 : 0.3 + Math.sin(time * 3 + e.seed) * 0.1;
      else if (name === 'armL') out[0] = acting ? 0.6 : 0.2;
      else if (name === 'tail') out[0] = 0.3 + Math.sin(time * 4 + e.seed * 3) * 0.2;
      else if (name === 'head') {
        out[1] = headYaw;
        out[0] = e.pitch * 0.6;
      } else if (name === 'body') out[0] = acting ? 0.5 : 0.15;
      break;
    }
    case 'ravager': {
      if (name === 'leg0' || name === 'leg3') out[0] = swing * 0.8;
      else if (name === 'leg1' || name === 'leg2') out[0] = -swing * 0.8;
      else if (name === 'neck') {
        out[1] = headYaw * 0.6;
        out[0] = e.pitch * 0.4 + Math.sin(e.walkPhase * 2) * 0.05 * e.walkAmount + (acting ? Math.sin(time * 8) * 0.25 : 0);
      } else if (name === 'jaw') out[0] = acting ? 0.35 + Math.abs(Math.sin(time * 8)) * 0.35 : 0.05;
      break;
    }
    case 'fangs': {
      // Se abren al brotar y se cierran de golpe al morder (a los 0,3 s).
      const t = e.age;
      const open = t < 0.25 ? 0.2 + t * 2.4 : t < 0.38 ? 0.8 * (1 - (t - 0.25) / 0.13) : 0;
      if (name === 'jawA') out[0] = -open;
      else if (name === 'jawB') out[0] = -open;
      break;
    }
  }
}

/** Transformación de la raíz: los colmillos suben y bajan; el vex flota y se ladea. */
export function illagerRoot(def: MobDef, e: ClientEntity, m: mat4, time: number): void {
  if (def.anim === 'fangs') {
    const t = e.age;
    const rise = t < 0.2 ? t / 0.2 : t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.3) : 1;
    mat4.translate(m, m, [0, (rise - 1) * 0.8, 0]);
  } else if (def.anim === 'vex') {
    mat4.translate(m, m, [0, Math.sin(time * 2.2 + e.seed * 6) * 0.06, 0]);
  }
}
