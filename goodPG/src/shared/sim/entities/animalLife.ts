// Vida de los animales de granja: crías que crecen, modo amor y cría, seguir la comida,
// huevos, lana que vuelve a crecer y lo que se hace con ellos (dar de comer, esquilar, ordeñar).
import { MOBS, MOB_COW, MOB_SHEEP, MOB_CHICKEN } from '../../mobs';
import { EGG, BUCKET, MILK_BUCKET, SHEARS, BREED_FOOD } from '../../items';
import { GRASS, DIRT, WHITE_WOOL } from '../../blocks';
import { breedXp } from '../../experience';
import { boxCollides } from '../physics';
import { LOVE_SECONDS, BREED_COOLDOWN, type PlayerView, type InteractResult, type Entity } from './types';
import type { Entities } from './Entities';
import { canMate, offspringType } from '../../mounts'; // Fase 6 (monturas)
import { faunaInteract } from './wildlife'; // Fase 6 (fauna)
import { critterInteract, critterBorn } from './critters'; // Fase 7.5 (fauna)

export class AnimalLife {
  constructor(private m: Entities) {}

  setBaby(e: Entity, seconds: number): void {
    const def = MOBS[e.type];
    e.growAge = seconds;
    e.width = def.width * 0.5;
    e.height = def.height * 0.5;
  }

  /** Crecer, amor, huevos y lana (una vez por tick para los animales pacíficos). */
  animalTick(e: Entity, dt: number): void {
    if ((e.growAge ?? 0) > 0) {
      e.growAge! -= dt;
      if (e.growAge! <= 0) {
        const def = MOBS[e.type];
        e.growAge = 0;
        e.width = def.width;
        e.height = def.height;
        // Al crecer puede quedar dentro de un bloque bajo: subirla un poco.
        if (boxCollides(this.m.w, e.x - e.width / 2, e.y, e.z - e.width / 2, e.x + e.width / 2, e.y + e.height, e.z + e.width / 2)) e.y += 0.5;
        this.m.gear.onGrown(e); // Fase 6.5 (equipo): la tortuga suelta su escama al crecer
      }
    }
    if ((e.love ?? 0) > 0) e.love! -= dt;
    if ((e.breedCd ?? 0) > 0) e.breedCd! -= dt;
    // Gallina adulta: un huevo cada 5–10 minutos.
    if (e.type === MOB_CHICKEN && !((e.growAge ?? 0) > 0)) {
      e.eggTimer = (e.eggTimer ?? 300) - dt;
      if (e.eggTimer <= 0) {
        e.eggTimer = 300 + this.m.rand() * 300;
        this.m.spawnItem({ id: EGG, count: 1 }, e.x, e.y + 0.3, e.z, 0, 1, 0, undefined, 0.5);
        this.m.host.fx('egg', e.x, e.y + 0.3, e.z);
      }
    }
    // Oveja esquilada: le vuelve a crecer la lana comiendo hierba (una vez por minuto de media).
    if (e.type === MOB_SHEEP && e.sheared && e.onGround && this.m.rand() < dt / 60) {
      const bx = Math.floor(e.x), by = Math.floor(e.y - 0.05), bz = Math.floor(e.z);
      if (this.m.w.getBlock(bx, by, bz) === GRASS) {
        this.m.w.setBlock(bx, by, bz, DIRT);
        e.sheared = false;
        this.m.host.fx('eat_grass', e.x, e.y + 0.3, e.z);
      }
    }
  }

  /**
   * Objetivo de un animal tranquilo: acercarse a su pareja en modo amor (y criar al tocarla) o seguir
   * a un jugador que lleva su comida en la mano. Devuelve false si no tiene ninguno.
   */
  animalGoal(e: Entity, players: PlayerView[], dt: number): boolean {
    const ai = e.ai!;
    const def = MOBS[e.type];
    const food = BREED_FOOD[def.key];
    if (!food) return false;
    ai.lookAt = null;
    // Pareja: otro adulto de la misma especie en modo amor a menos de 8 bloques.
    if ((e.love ?? 0) > 0) {
      let mate: Entity | null = null, best = 8;
      for (const o of this.m.list.values()) {
        // Fase 6 (monturas): caballo y burro también pueden criar juntos (mula).
        if (o === e || !canMate(e.type, o.type) || o.dead || !((o.love ?? 0) > 0) || (o.growAge ?? 0) > 0) continue;
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        if (d < best && Math.abs(o.y - e.y) < 3) {
          best = d;
          mate = o;
        }
      }
      if (mate) {
        ai.lookAt = [mate.x, mate.y + mate.height * 0.8, mate.z];
        if (best < 1.3) {
          this.breed(e, mate);
          return false;
        }
        const [mx, mz, jump] = this.m.mobs.followPath(e, { id: '', name: '', x: mate.x, y: mate.y, z: mate.z, alive: true, creative: false, lookingAt: -1 }, dt);
        ai.goalDir = [mx, mz, def.walk, jump ? 1 : 0];
        return true;
      }
    }
    // Seguir a quien lleva su comida (hasta 10 bloques), parando a 2 bloques.
    let lure: PlayerView | null = null, best = 10;
    for (const p of players) {
      if (!p.alive || p.held === undefined || !food.includes(p.held)) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < best && Math.abs(p.y - e.y) < 4) {
        best = d;
        lure = p;
      }
    }
    if (!lure) return false;
    ai.lookAt = [lure.x, lure.y + 1.6, lure.z];
    if (best < 2.2) {
      ai.goalDir = [0, 0, 0, 0];
      return true;
    }
    const [mx, mz, jump] = this.m.mobs.followPath(e, lure, dt);
    ai.goalDir = [mx, mz, def.walk * 1.15, jump ? 1 : 0];
    return true;
  }

  /** Dos adultos en modo amor tienen una cría entre ellos. */
  breed(a: Entity, b: Entity): void {
    a.love = 0;
    b.love = 0;
    a.breedCd = BREED_COOLDOWN;
    b.breedCd = BREED_COOLDOWN;
    const x = (a.x + b.x) / 2, y = Math.max(a.y, b.y), z = (a.z + b.z) / 2;
    const baby = this.m.spawnMob(offspringType(a.type, b.type), x, y, z, true); // Fase 6 (monturas): mula
    if (baby) this.m.mounts.born(baby, a, b);
    if (baby) critterBorn(this.m, baby, a, b); // Fase 7.5 (fauna): color de la champiñaca, pelaje de la llama de comerciante
    if (baby) baby.yaw = baby.bodyYaw = a.bodyYaw;
    this.m.host.fx('breed', x, y + 0.6, z);
    this.m.xp.spawn(breedXp(this.m.rand), x, y + 0.3, z);
  }

  /**
   * Usar un objeto sobre una criatura: dar de comer (amor o hacer crecer a una cría), esquilar una
   * oveja u ordeñar una vaca con un cubo.
   */
  interact(e: Entity, item: number, creative: boolean): InteractResult {
    const def = MOBS[e.type];
    if (!def || e.dead || !e.ai || def.hostile) return { ok: false };
    // Fase 6 (monturas): silla y doma de las monturas.
    const mount = this.m.mounts.interact(e, item, creative);
    if (mount) return mount;
    const baby = (e.growAge ?? 0) > 0;
    // Fase 6 (fauna): cepillar armadillos.
    const fauna = faunaInteract(this.m, e, item, creative);
    if (fauna) return fauna;
    // Fase 7.5 (fauna): confianza del ocelote; tijeras, cuenco, cubo y flores con la champiñaca.
    const critter = critterInteract(this.m, e, item, creative);
    if (critter) return critter;
    const food = BREED_FOOD[def.key];
    if (food && food.includes(item)) {
      if (baby) {
        // Comer acelera el crecimiento un 10 % de lo que le falta.
        e.growAge = Math.max(0.05, e.growAge! * 0.9);
      } else {
        if ((e.love ?? 0) > 0 || (e.breedCd ?? 0) > 0) return { ok: false };
        e.love = LOVE_SECONDS;
      }
      this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
      return { ok: true, take: creative ? 0 : 1 };
    }
    if (e.type === MOB_SHEEP && item === SHEARS && !baby && !e.sheared) {
      e.sheared = true;
      const n = 1 + Math.floor(this.m.rand() * 3);
      this.m.spawnItem({ id: WHITE_WOOL, count: n }, e.x, e.y + e.height, e.z, (this.m.rand() - 0.5) * 2, 3, (this.m.rand() - 0.5) * 2);
      this.m.host.fx('shear', e.x, e.y + e.height * 0.7, e.z);
      return { ok: true, wear: creative ? 0 : 1 };
    }
    if (e.type === MOB_COW && item === BUCKET && !baby) {
      this.m.host.fx('milk', e.x, e.y + e.height * 0.5, e.z);
      return { ok: true, take: 1, give: { id: MILK_BUCKET, count: 1 } };
    }
    return { ok: false };
  }
}
