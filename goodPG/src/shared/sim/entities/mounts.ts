// Fase 6 (monturas): vida de las monturas en el servidor. Pelaje y aptitudes (velocidad, salto) al
// nacer, la silla, la paciencia y la doma, la herencia de las crías (caballo + burro = mula), la
// montura que guía su jinete (no piensa ni se mueve sola) y el escupitajo de la llama enfadada.
// Quién monta qué lo lleva el sistema de monturas del servidor (server/riding.ts).
import { MOBS, MOB_PIG, MOB_HORSE, MOB_DONKEY, MOB_LLAMA, MOB_CAMEL } from '../../mobs';
import { BIOME_PLAINS, BIOME_SAVANNA, BIOME_MOUNTAINS, BIOME_DESERT, baseBiome } from '../../world/biomeIds';
import { SADDLE, GOLDEN_APPLE, BREED_FOOD } from '../../items';
import { HAY_BALE } from '../../blocks';
import { EF_SADDLE, EF_TAMED, EF_RIDDEN, EF_ACTION } from '../../protocol';
import { MOUNTS, HORSE_COLORS, HORSE_MARKINGS } from '../../mounts';
import { angleTo, type PlayerView, type InteractResult, type Entity } from './types';
import type { Entities } from './Entities';

/** Cuantiza v en [lo, hi] a 0..63 (para guardar las aptitudes en pocos bits). */
function quant(v: number | undefined, [lo, hi]: [number, number]): number {
  if (v === undefined || !(hi > lo)) return 0;
  return Math.max(0, Math.min(63, Math.round(((v - lo) / (hi - lo)) * 63)));
}

function unquant(q: number, [lo, hi]: [number, number]): number {
  return lo + (q / 63) * (hi - lo);
}

export class MountLife {
  constructor(private m: Entities) {}

  private roll([lo, hi]: [number, number]): number {
    // Media de tres tiradas: los valores medios son más comunes que los extremos (como en Minecraft).
    const r = (this.m.rand() + this.m.rand() + this.m.rand()) / 3;
    return lo + (hi - lo) * r;
  }

  /** Al aparecer: pelaje, aptitudes y estado inicial (los camellos no hace falta domarlos). */
  init(e: Entity): void {
    const md = MOUNTS[e.type];
    if (!md) return;
    e.saddled = false;
    e.temper = 0;
    e.tamed = !md.tameable && e.type !== MOB_PIG;
    if (md.variants > 1) e.variant = Math.floor(this.m.rand() * md.variants);
    if (md.steer) {
      e.mountSpeed = this.roll(md.speed);
      e.mountJump = this.roll(md.jump);
    }
  }

  /** ¿La guía su jinete? (con silla y domada). */
  controlled(e: Entity): boolean {
    const md = MOUNTS[e.type];
    return !!md?.steer && !!e.saddled && !!e.tamed;
  }

  /** Bits de estado propios de las monturas (se suman a los de updateFlags). */
  flags(e: Entity): number {
    if (!MOUNTS[e.type]) return 0;
    let f = 0;
    if (e.saddled) f |= EF_SADDLE;
    if (e.tamed && MOUNTS[e.type].tameable) f |= EF_TAMED;
    if (e.rider) f |= EF_RIDDEN;
    if ((e.rear ?? 0) > 0) f |= EF_ACTION;
    return f;
  }

  /**
   * Usar un objeto sobre una montura: poner la silla o dar de comer a una sin domar (la calma y la
   * cura, pero no la enamora). null: no es cosa de las monturas (sigue la cría normal).
   */
  interact(e: Entity, item: number, creative: boolean): InteractResult | null {
    const md = MOUNTS[e.type];
    if (!md) return null;
    const baby = (e.growAge ?? 0) > 0;
    if (item === SADDLE) {
      if (!md.saddle || baby || e.saddled || e.rider || (md.tameable && !e.tamed)) return { ok: false };
      e.saddled = true;
      this.m.host.fx('saddle', e.x, e.y + e.height * 0.8, e.z, e.type);
      return { ok: true, take: creative ? 0 : 1 };
    }
    const food = BREED_FOOD[MOBS[e.type].key];
    if (md.tameable && !e.tamed && food?.includes(item)) {
      if (!baby && (e.temper ?? 0) >= 100 && e.health >= e.maxHealth) return { ok: false };
      const rich = item === GOLDEN_APPLE || item === HAY_BALE;
      e.temper = Math.min(100, (e.temper ?? 0) + (rich ? 10 : 3));
      e.health = Math.min(e.maxHealth, e.health + (rich ? 10 : 2));
      if (baby) e.growAge = Math.max(0.05, e.growAge! * 0.9);
      this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
      return { ok: true, take: creative ? 0 : 1 };
    }
    return null;
  }

  /** Una cría recién nacida de a y b: pelaje de sus padres y aptitudes a medio camino. */
  born(baby: Entity, a: Entity, b: Entity): void {
    const md = MOUNTS[baby.type];
    if (!md) return;
    const [pa, pb] = this.m.rand() < 0.5 ? [a, b] : [b, a];
    if (baby.type === MOB_HORSE && a.type === b.type) {
      // Color de un padre y marcas del otro (a veces, marcas nuevas).
      const n = HORSE_COLORS.length;
      const color = (pa.variant ?? 0) % n;
      const marks = this.m.rand() < 0.2 ? Math.floor(this.m.rand() * HORSE_MARKINGS) : Math.floor((pb.variant ?? 0) / n) % HORSE_MARKINGS;
      baby.variant = color + n * marks;
    } else if (baby.type === MOB_LLAMA) baby.variant = pa.variant ?? 0;
    if (md.steer) {
      const [slo, shi] = md.speed, [jlo, jhi] = md.jump;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      baby.mountSpeed = clamp(((a.mountSpeed ?? slo) + (b.mountSpeed ?? slo) + this.roll(md.speed)) / 3, slo, shi);
      baby.mountJump = clamp(((a.mountJump ?? jlo) + (b.mountJump ?? jlo) + this.roll(md.jump)) / 3, jlo, jhi);
    }
  }

  /**
   * Tras un rato montada sin domar: se deja domar con probabilidad igual a su paciencia (%); si no,
   * gana paciencia, se encabrita y tira al jinete. Devuelve true si quedó domada.
   */
  tryTame(e: Entity): boolean {
    if (this.m.rand() * 100 < (e.temper ?? 0)) {
      e.tamed = true;
      this.m.host.fx('tame', e.x, e.y + e.height, e.z, e.type);
      return true;
    }
    e.temper = Math.min(100, (e.temper ?? 0) + 5);
    e.rear = 1;
    this.m.host.fx('mount_angry', e.x, e.y + e.height, e.z, e.type);
    return false;
  }

  /** Cada tick, antes de pensar: true si la guía su jinete (entonces ni piensa ni se mueve sola). */
  riddenTick(e: Entity, dt: number): boolean {
    if ((e.rear ?? 0) > 0) e.rear! -= dt;
    if (!e.rider || !this.controlled(e)) return false;
    e.vx = e.vy = e.vz = 0;
    e.fallStart = e.y;
    const ai = e.ai!;
    ai.panic = 0;
    ai.target = null;
    ai.goal = null;
    ai.path = null;
    this.m.mobs.updateFlags(e, ai);
    return true;
  }

  /**
   * Llama enfadada: no muerde; se acerca hasta unos 8 bloques y escupe (1 de daño) cada 2 s, a 20 bloques como
   * mucho (RangedAttackGoal; `dist`, en 3D). Cada
   * escupitajo la calma un poco. Devuelve [dirX, dirZ, velocidad, saltar].
   */
  llamaFight(e: Entity, target: PlayerView, dist: number, los: boolean, dt: number): [number, number, number, boolean] {
    const ai = e.ai!;
    let out: [number, number, number, boolean] = [0, 0, 0, false];
    if (dist > 8 || !los) {
      const [mx, mz, jump] = this.m.mobs.followPath(e, target, dt);
      out = [mx, mz, MOBS[e.type].walk * 1.3, jump];
    }
    if (los && dist <= 20 && ai.attackCd <= 0) {
      ai.attackCd = 2;
      ai.angry -= 8;
      const d = dist || 1;
      const dx = (target.x - e.x) / d, dz = (target.z - e.z) / d;
      this.m.host.hurtPlayer(target.id, MOBS[e.type].damage * this.m.difficultyScale(), dx * 2, 1, dz * 2, 'llama');
      this.m.host.fx('llama_spit', e.x - dx * 0.2, e.y + e.height * 0.85, e.z - dz * 0.2, angleTo(e.x, e.z, target.x, target.z), d);
    }
    return out;
  }

  /**
   * Estado guardado en un número: pelaje (6 bits), domada, silla, paciencia (7 bits) y velocidad y
   * salto cuantizados (6 bits cada uno). null si no es una montura.
   */
  save(e: Entity): number | null {
    const md = MOUNTS[e.type];
    if (!md) return null;
    return ((e.variant ?? 0) & 63) | (e.tamed ? 64 : 0) | (e.saddled ? 128 : 0) | ((Math.round(e.temper ?? 0) & 127) << 8) |
      (quant(e.mountSpeed, md.speed) << 15) | (quant(e.mountJump, md.jump) << 21);
  }

  load(e: Entity, n: number): void {
    const md = MOUNTS[e.type];
    if (!md || !Number.isInteger(n) || n < 0) return;
    e.variant = Math.min(md.variants - 1, n & 63);
    e.tamed = (n & 64) !== 0 || (!md.tameable && e.type !== MOB_PIG);
    e.saddled = md.saddle && (n & 128) !== 0;
    e.temper = Math.min(100, (n >> 8) & 127);
    if (md.steer) {
      e.mountSpeed = unquant((n >> 15) & 63, md.speed);
      e.mountJump = unquant((n >> 21) & 63, md.jump);
    }
  }
}

/**
 * Montura que aparece en un bioma (0: ninguna; entonces sale el animal de siempre). `r` es una tirada
 * en [0, 1): caballos y burros en llanuras y sabanas, llamas en montañas y sabanas, camellos en el
 * desierto.
 */
export function mountSpawnFor(biome: number, r: number): number {
  switch (baseBiome(biome)) {
    case BIOME_PLAINS:
      return r < 0.12 ? MOB_HORSE : r < 0.16 ? MOB_DONKEY : 0;
    case BIOME_SAVANNA:
      return r < 0.25 ? MOB_HORSE : r < 0.33 ? MOB_DONKEY : r < 0.48 ? MOB_LLAMA : 0;
    case BIOME_MOUNTAINS:
      return r < 0.15 ? MOB_LLAMA : 0;
    case BIOME_DESERT:
      return r < 0.25 ? MOB_CAMEL : 0;
    default:
      return 0;
  }
}
