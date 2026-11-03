// Fase 7 (encantamientos): los encantamientos de las armas en el servidor.
// - Cuerpo a cuerpo: Filo, Castigo, Perdición de los artrópodos y Empalamiento suman daño (escalado con la
//   carga del golpe, como en Minecraft); Empuje empuja más; Aspecto de fuego prende al objetivo; Saqueo
//   da más botín; y la espada barre (golpe cargado desde el suelo y sin correr): hiere a las criaturas
//   pegadas al objetivo con 1 + daño × nivel / (nivel + 1) de Barrido.
// - Arco: Poder (más daño), Retroceso (más empuje), Fuego (la flecha prende) e Infinidad (no se gasta la
//   flecha: la que sale no se recoge). Ballesta: Multidisparo (tres virotes en abanico) y Perforación
//   (atraviesa criaturas).
import { ITEMS, BOW, CROSSBOW } from '../../items';
import {
  KNOCKBACK, FIRE_ASPECT, LOOTING, SWEEPING_EDGE, POWER, PUNCH, FLAME, INFINITY, MULTISHOT, PIERCING,
} from '../../enchantments';
import {
  sanitizeHeldEnchants, levelIn, meleeBonus, knockbackFactor, fireAspectSeconds, sweepDamage, powerDamage, piercingHits,
} from '../../enchantEffects';
import { MOBS } from '../../mobs';
import type { ClientMsg } from '../../protocol';
import type { Entity } from '../entities';
import type { ServerContext, Session } from './context';

/** Ángulo de los virotes laterales de Multidisparo (10°). */
const MULTISHOT_SPREAD = (10 * Math.PI) / 180;

/**
 * Golpe cuerpo a cuerpo de un jugador a la criatura `e` con `item` (ya calculado el daño base con la
 * carga, los efectos y el crítico). `knock`: empuje del arma sin encantamientos.
 */
export function meleeHit(
  ctx: ServerContext, s: Session, e: Entity, item: number, msg: Extract<ClientMsg, { t: 'attack' }>, dmg: number, charge: number,
  knock: number,
): void {
  const en = item ? sanitizeHeldEnchants(item, msg.en) : [];
  const ents = ctx.entities;
  const bonus = meleeBonus(en, e.type) * charge;
  ents.looting = levelIn(en, LOOTING);
  // Golpe corriendo con la barra llena (Player.attack: knockbackAttack): medio punto más de empuje, como un nivel de Empuje.
  const sprintKnock = msg.sp === 1 && charge > 0.9 ? 1 : 0;
  try {
    ents.damage(e, Math.max(0.5, dmg + bonus), s.p[0], s.p[2], s.id, knock * knockbackFactor(levelIn(en, KNOCKBACK) + sprintKnock));
  } finally {
    ents.looting = 0;
  }
  ents.mobs.guardians.meleeThorns(e, s.id, s.p[0], s.p[2]); // Fase 7.5 (océano): las púas del guardián pinchan
  const fire = levelIn(en, FIRE_ASPECT);
  if (fire > 0 && !e.dead && e.hurt === 0) e.fire = Math.max(e.fire, fireAspectSeconds(fire));
  // Barrido: sólo espadas, golpe cargado desde el suelo y sin correr (lo comprueba el cliente).
  if (msg.sw === 1 && !sprintKnock && ITEMS[item]?.tool?.kind === 'sword' && charge > 0.9) sweep(ctx, s, e, dmg, levelIn(en, SWEEPING_EDGE), en, charge);
}

/**
 * Player.doSweepAttack: las criaturas que tocan la caja del objetivo ensanchada 1 × 0,25 × 1 y a menos de 3 bloques
 * del jugador (de pies a pies) reciben 1 + daño × Barrido (con Filo, Castigo o Perdición según cada una, y por la
 * carga del golpe) y un empujón de 0,4.
 */
function sweep(ctx: ServerContext, s: Session, target: Entity, dmg: number, level: number, en: [number, number][], charge: number): void {
  const ents = ctx.entities;
  const amount = sweepDamage(dmg, level);
  const ex = s.p[0], ey = s.p[1], ez = s.p[2];
  ents.looting = levelIn(en, LOOTING);
  try {
    for (const o of ents.list.values()) {
      if (o === target || !o.ai || o.dead || MOBS[o.type]?.inert) continue;
      const hw = target.width / 2 + 1 + o.width / 2;
      if (Math.abs(o.x - target.x) > hw || Math.abs(o.z - target.z) > hw) continue;
      if (o.y > target.y + target.height + 0.25 || o.y + o.height < target.y - 0.25) continue;
      if ((o.x - ex) ** 2 + (o.y - ey) ** 2 + (o.z - ez) ** 2 >= 9) continue;
      ents.damage(o, (amount + meleeBonus(en, o.type)) * charge, s.p[0], s.p[2], s.id, 1); // knockback(0,4): el mismo que un golpe normal
    }
  } finally {
    ents.looting = 0;
  }
  const a = s.r[0];
  ctx.fx('sweep', s.p[0] - Math.sin(a) * 1.3, s.p[1] + 1.1, s.p[2] - Math.cos(a) * 1.3, a);
}

/** Gira la dirección (x, z) un ángulo alrededor del eje vertical. */
function yawTurn(d: readonly number[], a: number): [number, number, number] {
  const c = Math.cos(a), sn = Math.sin(a);
  return [d[0] * c - d[2] * sn, d[1], d[0] * sn + d[2] * c];
}

/**
 * Dispara lo que sale del arco o de la ballesta desde `p` hacia `dir` (normalizada) con sus
 * encantamientos (`raw`, sin validar: los manda el cliente).
 */
export function shootArrows(
  ctx: ServerContext, s: Session, p: readonly number[], dir: readonly number[], speed: number, damage: number, crossbow: boolean,
  raw: unknown,
): Entity[] {
  const en = sanitizeHeldEnchants(crossbow ? CROSSBOW : BOW, raw);
  const out: Entity[] = [];
  const base = crossbow ? damage : powerDamage(damage, levelIn(en, POWER));
  const angles = crossbow && levelIn(en, MULTISHOT) > 0 ? [0, -MULTISHOT_SPREAD, MULTISHOT_SPREAD] : [0];
  for (const a of angles) {
    const d = a ? yawTurn(dir, a) : dir;
    const e = ctx.entities.spawnArrow(p[0], p[1], p[2], d[0] * speed, d[1] * speed, d[2] * speed, s.id, base);
    if (!crossbow) {
      const punch = levelIn(en, PUNCH);
      if (punch > 0) e.arrowKnock = knockbackFactor(punch);
      if (levelIn(en, FLAME) > 0) e.arrowFire = true;
      if (levelIn(en, INFINITY) > 0) e.noPickup = true;
    } else {
      const pierce = levelIn(en, PIERCING);
      if (pierce > 0) e.pierce = piercingHits(pierce);
    }
    if (a) e.noPickup = true;
    out.push(e);
  }
  return out;
}
