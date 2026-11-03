// Fase 8.7: pose del Wither y de su calavera (WitherBossModel.setupAnim y WitherBossRenderer de la 26.3).
// - Las costillas y la cola se mecen (0,065 + 0,05 · cos(edad · 0,1)) · π; la cola cuelga del extremo de las costillas.
// - La cabeza del centro mira a donde mira el Wither; las de los lados, a sus objetivos (giros que manda el servidor).
// - Mientras nace (invulnerable) es más pequeño (escala 2 − ticks / 220 · 0,5) y parpadea su textura azul (siempre
//   que queden más de 80 ticks; después, cada 5 ticks).
// - Blindado (por debajo de la mitad de la vida) lleva encima un aura de energía.
// `variant` del Wither: los ticks de invulnerabilidad (0..220) o 255 si está blindado.
import type { MobDef, ModelPart } from '../../shared/mobs';
import { MOB_WITHER, WITHER_INVULNERABLE_TICKS } from '../../shared/witherMobs';
import type { ClientEntity } from '../game/ClientEntities';

const DEG = Math.PI / 180;
const RIB_REST = 0.20420352;
const TAIL_REST = 0.83252203;
/** Ticks de Java a partir del tiempo del cliente (segundos). */
const ageTicks = (time: number, e: ClientEntity) => time * 20 + e.seed * 100;

/** Ticks de invulnerabilidad que le quedan (0 si ya no). */
export function witherInvulnerable(e: ClientEntity): number {
  const v = e.variant ?? 0;
  return v <= WITHER_INVULNERABLE_TICKS ? v : 0;
}

/** ¿Blindado? */
export function witherPowered(e: ClientEntity): boolean {
  return e.variant === 255;
}

/** Textura: 1 la azul (naciendo, parpadea en los últimos 80 ticks), 0 la normal. */
export function witherSkinVariant(e: ClientEntity): number {
  const inv = witherInvulnerable(e);
  return inv > 0 && (inv > 80 || Math.floor(inv / 5) % 2 !== 1) ? 1 : 0;
}

/** Factor de escala sobre la del modelo (2): naciendo, más pequeño. */
export function witherScale(def: MobDef, e: ClientEntity): number {
  if (def.id !== MOB_WITHER) return 1;
  const inv = witherInvulnerable(e);
  return inv > 0 ? (2 - (inv / WITHER_INVULNERABLE_TICKS) * 0.5) / 2 : 1;
}

/** Giro de las costillas en el espacio de Java. */
function ribX(time: number, e: ClientEntity): number {
  return (0.065 + 0.05 * Math.cos(ageTicks(time, e) * 0.1)) * Math.PI;
}

/** Rotaciones de animación de cada parte (lo que se suma a la de reposo; true si es del Wither o de su calavera). */
export function animateWither(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  if (def.anim !== 'wither') return false;
  if (name === 'skull') {
    out[0] = e.pitch;
    return true;
  }
  const anim = Math.cos(ageTicks(time, e) * 0.1);
  // jb cambia el signo de los giros de Java: lo que se suma es −(el de Java) + el de reposo.
  if (name === 'ribcage') out[0] = -ribX(time, e) + RIB_REST;
  else if (name === 'tail') out[0] = -(0.265 + 0.1 * anim) * Math.PI + TAIL_REST;
  else if (name === 'center_head') {
    out[1] = wrap(e.yaw - e.bodyYaw);
    out[0] = e.pitch;
  } else if (name === 'right_head' || name === 'left_head') {
    const h = e.witherHeads;
    if (h) {
      const k = name === 'right_head' ? 0 : 2;
      out[1] = -h[k] * DEG;
      out[0] = -h[k + 1] * DEG;
    }
  }
  return true;
}

/** La cola cuelga del extremo de las costillas (tail.setPos): lo que se mueve su pivote, en píxeles. */
export function witherPartOffset(def: MobDef, e: ClientEntity, time: number, name: string, off: number[]): boolean {
  if (def.id !== MOB_WITHER || name !== 'tail') return false;
  const r = ribX(time, e);
  off[0] = 0;
  off[1] = -(Math.cos(r) - Math.cos(RIB_REST)) * 10;
  off[2] = (Math.sin(r) - Math.sin(RIB_REST)) * 10;
  return true;
}

function wrap(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** La calavera (WitherSkullRenderer: una cabeza de 8 × 8 × 8 con la textura del Wither en 0, 35). */
const SKULL_PART: ModelPart = { name: 'skull', pivot: [0, 0, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 35] };
export function witherSkullDef(wither: MobDef): MobDef {
  return { ...wither, id: -MOB_WITHER, key: 'wither_skull', parts: [SKULL_PART], scale: 1, width: 0.3125, height: 0.3125 };
}
