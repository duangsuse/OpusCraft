// Fase 8.3 (criaturas del Nether): animaciones de las criaturas del Nether para MobRenderer, como los setupAnim de
// los modelos de Java 26.3 (con sus signos pasados a nuestro espacio: X e Y cambiados; ver jb en netherMobs.ts).
// - Piglins: brazos y piernas al andar, orejas que se mecen (más al correr), baile al celebrar, cabeza gacha y brazo
//   izquierdo arriba al admirar el oro, ballesta tensándose o apuntando, arma en alto al atacar; el zombificado,
//   con los brazos por delante (más altos enfadado).
// - Ghast: tentáculos que ondulan. Blaze: las tres coronas de varas girando y subiendo y bajando.
// - Cubo de magma: se aplasta al caer y se estira al saltar (las rodajas se separan).
// - Hoglin y zoglin: patas, orejas y la embestida (la cabeza sube de golpe en 10 ticks).
// - Strider: vaivén del cuerpo, zancadas y cerdas que ondean; con frío (y los que se convierten), tiritan.
// - Esqueleto wither: brazos por delante cuando ataca.
import { mat4 } from 'gl-matrix';
import type { MobDef } from '../../shared/mobs';
import {
  MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER,
  MOB_WITHER_SKELETON, EF_PIGLIN_DANCING, EF_STRIDER_COLD, EF_ZOMBIFYING, HOGLIN_HEAD_REST, STRIDER_BRISTLES,
  isMagmaCube, isNetherMob, magmaSize, blazeRodPos, gearMain, gearOff, isPiglinLoved,
} from '../../shared/netherMobs';
import { CROSSBOW, CROSSBOW_CHARGED, ITEMS } from '../../shared/items';
import { EF_ACTION, EF_ANGRY, EF_RIDDEN } from '../../shared/protocol';
import type { ClientEntity } from '../game/ClientEntities';

const TICK = 20;

/** Variante de textura: el strider con frío y el ghast que dispara. */
export function netherVariant(e: ClientEntity): number {
  if (e.type === MOB_STRIDER) return e.flags & EF_STRIDER_COLD ? 1 : 0;
  if (e.type === MOB_GHAST) return e.flags & EF_ACTION ? 1 : 0;
  return 0;
}

/** Posición y velocidad de la animación de andar como las de Java (walkAnimation.position y speed). */
function walk(e: ClientEntity): [number, number] {
  return [e.walkPhase * 1.6, Math.min(1, e.walkAmount * 0.7)];
}

function headYaw(e: ClientEntity): number {
  let d = (e.yaw - e.bodyYaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-1.3, Math.min(1.3, d));
}

const lerp = (k: number, a: number, b: number) => a + (b - a) * k;

/** Rotaciones de animación de una parte (sumadas a las de reposo). false si no es una criatura del Nether. */
export function netherAnimate(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  if (!isNetherMob(def.id)) return false;
  const ticks = time * TICK + e.seed * 100;
  switch (def.id) {
    case MOB_PIGLIN:
    case MOB_PIGLIN_BRUTE:
    case MOB_ZOMBIFIED_PIGLIN:
      piglin(def.id, e, ticks, name, out);
      return true;
    case MOB_GHAST:
      if (name.startsWith('tent')) out[0] = -(0.2 * Math.sin(ticks * 0.3 + Number(name.slice(4))) + 0.4);
      return true;
    case MOB_BLAZE:
      if (name === 'head') {
        out[1] = headYaw(e);
        out[0] = e.pitch;
      }
      return true;
    case MOB_HOGLIN:
    case MOB_ZOGLIN:
      hoglin(e, name, out);
      return true;
    case MOB_STRIDER:
      strider(e, ticks, name, out);
      return true;
    case MOB_WITHER_SKELETON:
      witherSkeleton(e, ticks, name, out);
      return true;
    default:
      return true; // cubos de magma: sólo se desplazan (netherPartOffset)
  }
}

function piglin(type: number, e: ClientEntity, ticks: number, name: string, out: number[]): void {
  const [pos, speed] = walk(e);
  const main = gearMain(e.gear), off = gearOff(e.gear);
  const dancing = type === MOB_PIGLIN && (e.flags & EF_PIGLIN_DANCING) !== 0;
  const admiring = type === MOB_PIGLIN && isPiglinLoved(off);
  const angry = (e.flags & EF_ANGRY) !== 0;
  const charging = type === MOB_PIGLIN && (e.flags & EF_ACTION) !== 0;
  const holdingCharged = main === CROSSBOW_CHARGED;
  const melee = angry && !!ITEMS[main]?.tool && main !== CROSSBOW && main !== CROSSBOW_CHARGED;
  const hy = headYaw(e);
  switch (name) {
    case 'head':
      out[1] = hy;
      out[0] = e.pitch;
      if (admiring) {
        out[0] = -0.5;
        out[1] = 0;
      }
      return;
    case 'earL':
    case 'earR': {
      // AbstractPiglinModel: se mecen con el tiempo y con el paso (más al correr).
      const f = ticks * 0.1 + pos * 0.5, amp = 0.08 + speed * 0.4;
      if (dancing) {
        const d = ticks / 60;
        out[2] = name === 'earR' ? (Math.PI / 180) * Math.sin(d * 30) * 10 : -(Math.PI / 180) * Math.cos(d * 30) * 10;
      } else out[2] = name === 'earL' ? -Math.cos(f * 1.2) * amp : Math.cos(f) * amp;
      return;
    }
    case 'legR':
      out[0] = -Math.cos(pos * 0.6662) * 1.4 * speed;
      return;
    case 'legL':
      out[0] = -Math.cos(pos * 0.6662 + Math.PI) * 1.4 * speed;
      return;
    case 'armR':
    case 'armL': {
      const right = name === 'armR';
      // Balanceo de andar y el vaivén suave de los brazos (bobArms).
      out[0] = -Math.cos(pos * 0.6662 + (right ? Math.PI : 0)) * speed - Math.sin(ticks * 0.067) * 0.05 * (right ? 1 : -1);
      out[2] = (right ? 1 : -1) * (Math.cos(ticks * 0.09) * 0.05 + 0.05);
      if (type === MOB_ZOMBIFIED_PIGLIN) {
        // AnimationUtils.animateZombieArms: por delante (más arriba si está enfadado).
        out[0] = Math.PI / (angry ? 1.5 : 2.25) - Math.sin(ticks * 0.067) * 0.05;
        out[1] = right ? 0.1 : -0.1;
        return;
      }
      if (dancing) {
        const d = ticks / 60;
        out[2] = (right ? 1 : -1) * (Math.PI / 180) * (70 + Math.cos(d * 40) * 10);
        out[0] = 0;
        return;
      }
      if (charging) {
        // Tensando la ballesta (AnimationUtils.animateCrossbowCharge, 25 ticks).
        const p = Math.min(1, Math.max(0, e.actionT) * TICK / 25);
        if (right) {
          out[1] = 0.8;
          out[0] = 0.97079635;
        } else {
          out[1] = -lerp(p, 0.4, 0.85);
          out[0] = -lerp(p, -0.97079635, -Math.PI / 2);
        }
        return;
      }
      if (holdingCharged && angry) {
        // Apuntando con la ballesta cargada (animateCrossbowHold).
        out[1] = right ? 0.3 + hy : -0.6 + hy;
        out[0] = right ? Math.PI / 2 + e.pitch - 0.1 : 1.5 + e.pitch;
        return;
      }
      if (admiring && !right) {
        out[1] = -0.5;
        out[0] = 0.9;
        return;
      }
      if (melee && right) out[0] = 1.8;
      return;
    }
  }
}

function hoglin(e: ClientEntity, name: string, out: number[]): void {
  const [pos, speed] = walk(e);
  switch (name) {
    case 'earR':
      out[2] = -speed * Math.sin(pos);
      return;
    case 'earL':
      out[2] = speed * Math.sin(pos);
      return;
    case 'head': {
      out[1] = headYaw(e);
      // Embestida: en 10 ticks la cabeza sube de 0,87 rad (mirando al suelo) a −π/9 y vuelve.
      if (e.flags & EF_ACTION && e.actionT >= 0) {
        const remaining = Math.max(0, 10 - e.actionT * TICK);
        const k = 1 - Math.abs(10 - 2 * remaining) / 10;
        out[0] = -(lerp(k, HOGLIN_HEAD_REST, -Math.PI / 9) - HOGLIN_HEAD_REST);
      }
      return;
    }
    case 'legFR':
    case 'legBL':
      out[0] = -Math.cos(pos) * 1.2 * speed;
      return;
    case 'legFL':
    case 'legBR':
      out[0] = -Math.cos(pos + Math.PI) * 1.2 * speed;
      return;
  }
}

function strider(e: ClientEntity, ticks: number, name: string, out: number[]): void {
  const [pos, rawSpeed] = walk(e);
  const speed = Math.min(rawSpeed, 0.25);
  switch (name) {
    case 'body':
      if (!(e.flags & EF_RIDDEN)) {
        out[0] = e.pitch;
        out[1] = headYaw(e);
      }
      out[2] = 0.1 * Math.sin(pos * 1.5) * 4 * speed;
      return;
    case 'legL':
      out[0] = -Math.sin(pos * 1.5 * 0.5) * 2 * speed;
      out[2] = (Math.PI / 18) * Math.cos(pos * 1.5 * 0.5) * speed;
      return;
    case 'legR':
      out[0] = -Math.sin(pos * 1.5 * 0.5 + Math.PI) * 2 * speed;
      out[2] = (Math.PI / 18) * Math.cos(pos * 1.5 * 0.5 + Math.PI) * speed;
      return;
  }
  if (name.startsWith('bristle')) {
    // Ondean con el paso (más las de abajo) y un poco con el tiempo (AdultStriderModel.animateBristle).
    const flow = Math.cos(pos * 1.5 + Math.PI) * speed;
    const level = name.endsWith('T') ? 0 : name.endsWith('M') ? 1 : 2;
    const k = [0.6, 1.2, 1.3][level];
    const t = [0.1 * Math.sin(ticks * 0.4), 0.1 * Math.sin(ticks * 0.2), 0.05 * Math.sin(ticks * -0.4)][level];
    out[2] = flow * k + t;
    void STRIDER_BRISTLES;
  }
}

function witherSkeleton(e: ClientEntity, ticks: number, name: string, out: number[]): void {
  const [pos, speed] = walk(e);
  const angry = (e.flags & EF_ANGRY) !== 0;
  switch (name) {
    case 'head':
      out[1] = headYaw(e);
      out[0] = e.pitch;
      return;
    case 'legR':
      out[0] = -Math.cos(pos * 0.6662) * 1.4 * speed;
      return;
    case 'legL':
      out[0] = -Math.cos(pos * 0.6662 + Math.PI) * 1.4 * speed;
      return;
    case 'armR':
    case 'armL': {
      const right = name === 'armR';
      if (angry) {
        // SkeletonModel: agresivo y sin arco, los dos brazos por delante.
        out[0] = Math.PI / 2 - Math.sin(ticks * 0.067) * 0.05;
        out[1] = right ? 0.1 : -0.1;
        out[2] = (right ? 1 : -1) * (Math.cos(ticks * 0.09) * 0.05 + 0.05);
        return;
      }
      out[0] = -Math.cos(pos * 0.6662 + (right ? Math.PI : 0)) * speed;
      out[2] = (right ? 1 : -1) * (Math.cos(ticks * 0.09) * 0.05 + 0.05);
      return;
    }
  }
}

// ---------------------------------------------------------------------------------- desplazamientos

/** Estado del aplastamiento de cada cubo de magma (squish de AbstractCubeMob, por ticks). */
interface Squish {
  sq: number;
  target: number;
  ground: boolean;
  last: number;
}
const squishes = new Map<number, Squish>();

function squishOf(e: ClientEntity, time: number): number {
  let s = squishes.get(e.id);
  const ground = !(e.flags & EF_ACTION);
  if (!s) {
    s = { sq: 0, target: 0, ground, last: time };
    squishes.set(e.id, s);
    if (squishes.size > 256) for (const [id, v] of squishes) if (time - v.last > 5) squishes.delete(id);
  }
  let ticks = Math.min(10, Math.floor((time - s.last) * TICK));
  if (ticks > 0) s.last += ticks / TICK;
  while (ticks-- > 0) {
    if (ground && !s.ground) s.target = -0.5;
    else if (!ground && s.ground) s.target = 1;
    s.ground = ground;
    s.sq += (s.target - s.sq) * 0.5;
    s.target *= 0.9;
  }
  return s.sq;
}

/**
 * Desplazamiento de una parte (en píxeles, en nuestro espacio): las varas del blaze en órbita, las rodajas del cubo
 * de magma, el cuerpo y las patas del strider al andar, la cabeza, los brazos y el cuerpo del piglin que baila.
 */
export function netherPartOffset(def: MobDef, e: ClientEntity, time: number, name: string, off: number[]): void {
  off[0] = off[1] = off[2] = 0;
  if (!isNetherMob(def.id)) return;
  const ticks = time * TICK + e.seed * 100;
  if (def.id === MOB_BLAZE && name.startsWith('rod')) {
    const i = Number(name.slice(3));
    const [x0, y0, z0] = blazeRodPos(i, 0), [x, y, z] = blazeRodPos(i, ticks);
    off[0] = -(x - x0);
    off[1] = -(y - y0);
    off[2] = z - z0;
    return;
  }
  if (isMagmaCube(def.id) && name.startsWith('cube')) {
    const i = Number(name.slice(4));
    off[1] = (4 - i) * Math.max(0, squishOf(e, time)) * 1.7;
    return;
  }
  if (def.id === MOB_STRIDER) {
    const [pos, raw] = walk(e);
    const speed = Math.min(raw, 0.25);
    if (name === 'body') off[1] = -(1 - 2 * Math.cos(pos * 1.5) * 2 * speed);
    else if (name === 'legL') off[1] = -2 * Math.sin(pos * 1.5 * 0.5 + Math.PI) * 2 * speed;
    else if (name === 'legR') off[1] = -2 * Math.sin(pos * 1.5 * 0.5) * 2 * speed;
    return;
  }
  if (def.id === MOB_PIGLIN && e.flags & EF_PIGLIN_DANCING) {
    const d = ticks / 60;
    if (name === 'head') {
      off[0] = -Math.sin(d * 10);
      off[1] = -(Math.sin(d * 40) + 0.4);
    } else if (name === 'armR') off[1] = -(Math.sin(d * 40) * 0.5 - 0.5);
    else if (name === 'armL') off[1] = -(Math.sin(d * 40) * 0.5 + 0.5);
    else if (name === 'body') off[1] = -Math.sin(d * 40) * 0.35;
  }
}

/**
 * Transformación de la raíz: tiritona (strider con frío, piglins y hoglins que se convierten: ±1,26° de giro, como
 * LivingEntityRenderer.isShaking) y el aplastamiento del cubo de magma (MagmaCubeRenderer.scale). Devuelve el
 * factor de escala [x, y, z].
 */
export function netherRoot(def: MobDef, e: ClientEntity, m: mat4, time: number): [number, number, number] {
  if (!isNetherMob(def.id)) return [1, 1, 1];
  const shaking = (def.id === MOB_STRIDER && e.flags & EF_STRIDER_COLD) || e.flags & EF_ZOMBIFYING;
  if (shaking && e.deathT < 0) mat4.rotateY(m, m, Math.cos(Math.floor(time * TICK) * 3.25) * Math.PI * 0.4 * (Math.PI / 180));
  if (isMagmaCube(def.id)) {
    const size = magmaSize(def.id);
    const ss = squishOf(e, time) / (size * 0.5 + 1);
    const w = 1 / (ss + 1);
    return [w, 1 / w, w];
  }
  return [1, 1, 1];
}

/** Partes que no se dibujan: la silla del strider sin silla (la de los caballos la oculta mountPose). */
export function hiddenNetherPart(def: MobDef, e: ClientEntity, name: string): boolean {
  void def;
  void e;
  void name;
  return false;
}
