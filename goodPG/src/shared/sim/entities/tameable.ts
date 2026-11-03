// Fase 6 (gólems/domesticar): lobos y gatos domesticados.
// - Se domestican dándoles su objeto (hueso al lobo; bacalao o salmón crudo al gato) con 1/3 de
//   probabilidad por intento. El dueño se guarda por nombre (en minúsculas).
// - El dueño los sienta y levanta con clic derecho. De pie le siguen y, si se aleja más de 12
//   bloques, aparecen a su lado. Los lobos atacan a lo que ataque su dueño o a lo que les ataque.
// - Con su comida se curan y, con la vida llena, entran en modo amor y crían (la cría nace domesticada).
// - Los gatos salvajes se acercan despacio a quien lleva pescado crudo.
import { MOBS, MOB_WOLF, MOB_CAT } from '../../mobs';
import { BLOCK_FLUID } from '../../blocks';
import { breedXp } from '../../experience';
import {
  TAME_ITEMS, PET_FOOD, TAME_CHANCE, TAMED_WOLF_HEALTH, TELEPORT_DISTANCE, CAT_SKINS, isTameable,
} from '../../companions';
import { standable } from '../pathfind';
import { LOVE_SECONDS, BREED_COOLDOWN, type PlayerView, type InteractResult, type Entity } from './types';
import type { Entities } from './Entities';
import type { Companions } from './companions';

export class Tameable {
  constructor(private m: Entities, private c: Companions) {}

  /** Pasa a ser del jugador `owner` (nombre). */
  makeTamed(e: Entity, owner: string): void {
    e.tamedBy = owner.toLowerCase();
    e.foe = undefined;
    const ai = e.ai;
    if (ai) {
      ai.angry = 0;
      ai.target = null;
      ai.panic = 0;
    }
    if (e.type === MOB_WOLF) {
      e.maxHealth = TAMED_WOLF_HEALTH;
      e.health = TAMED_WOLF_HEALTH;
    }
  }

  decide(e: Entity, players: PlayerView[], dt: number): boolean {
    if (!e.tamedBy) return e.type === MOB_CAT ? this.catTempt(e, players, dt) : false;
    const ai = e.ai!;
    const def = MOBS[e.type];
    // Los gatos huyen cuando les pegan (aunque sean de alguien).
    this.c.calm(e, e.type === MOB_CAT);
    if (e.type === MOB_CAT && ai.panic > 0) return false;
    const owner = players.find((p) => p.alive && p.name.toLowerCase() === e.tamedBy) ?? null;
    if (e.sitting) {
      e.foe = undefined;
      e.following = false;
      ai.path = null;
      ai.goalDir = [0, 0, 0, 0];
      if (owner && Math.hypot(owner.x - e.x, owner.z - e.z) < 8) ai.lookAt = [owner.x, owner.y + 1.6, owner.z];
      return true;
    }
    if ((e.love ?? 0) > 0 && this.seekMate(e, dt)) return true;
    if (e.type === MOB_WOLF) {
      const foe = this.c.resolveFoe(e, players, 20);
      if (foe) {
        e.following = false;
        this.c.chaseAndHit(e, foe, dt, def.run, def.damage, 1, 0);
        return true;
      }
    }
    if (!owner) {
      e.following = false;
      return false;
    }
    const d = Math.hypot(owner.x - e.x, owner.y - e.y, owner.z - e.z);
    if (d > TELEPORT_DISTANCE && this.teleportNear(e, owner)) {
      ai.goalDir = [0, 0, 0, 0];
      return true;
    }
    if (d > 6) e.following = true;
    else if (d < 2.5) e.following = false;
    if (!e.following) return false; // cerca del dueño: pasea
    const [mx, mz, jump] = this.m.mobs.followPath(e, owner, dt);
    ai.goalDir = [mx, mz, d > 8 ? def.run : def.walk * 1.6, jump ? 1 : 0];
    ai.lookAt = [owner.x, owner.y + 1.6, owner.z];
    return true;
  }

  /** Gato salvaje: se acerca despacio a quien lleva pescado crudo y se para a 2 bloques. */
  private catTempt(e: Entity, players: PlayerView[], dt: number): boolean {
    const ai = e.ai!;
    if (ai.panic > 0) return false;
    const food = TAME_ITEMS[MOB_CAT];
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
    ai.goalDir = [mx, mz, MOBS[e.type].walk * 0.8, jump ? 1 : 0];
    return true;
  }

  /** Busca pareja domesticada en modo amor; al tocarla, crían. */
  private seekMate(e: Entity, dt: number): boolean {
    let mate: Entity | null = null, best = 8;
    for (const o of this.m.list.values()) {
      if (o === e || o.type !== e.type || o.dead || !o.tamedBy || !((o.love ?? 0) > 0) || (o.growAge ?? 0) > 0) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < best && Math.abs(o.y - e.y) < 3) {
        best = d;
        mate = o;
      }
    }
    if (!mate) return false;
    const ai = e.ai!;
    ai.lookAt = [mate.x, mate.y + mate.height * 0.8, mate.z];
    if (best < 1.3) {
      this.breed(e, mate);
      ai.goalDir = [0, 0, 0, 0];
      return true;
    }
    const [mx, mz, jump] = this.m.mobs.followPath(e, { id: '', name: '', x: mate.x, y: mate.y, z: mate.z, alive: true, creative: false, lookingAt: -1 }, dt);
    ai.goalDir = [mx, mz, MOBS[e.type].walk, jump ? 1 : 0];
    return true;
  }

  /** Dos domesticados en modo amor tienen una cría, que nace domesticada (del dueño del primero). */
  breed(a: Entity, b: Entity): Entity | null {
    a.love = 0;
    b.love = 0;
    a.breedCd = BREED_COOLDOWN;
    b.breedCd = BREED_COOLDOWN;
    const x = (a.x + b.x) / 2, y = Math.max(a.y, b.y), z = (a.z + b.z) / 2;
    const baby = this.m.spawnMob(a.type, x, y, z, true);
    if (baby) {
      baby.yaw = baby.bodyYaw = a.bodyYaw;
      if (a.tamedBy) this.makeTamed(baby, a.tamedBy);
      if (a.type === MOB_CAT) baby.variant = this.m.rand() < 0.5 ? a.variant ?? 0 : b.variant ?? 0;
    }
    this.m.host.fx('breed', x, y + 0.6, z);
    this.m.xp.spawn(breedXp(this.m.rand), x, y + 0.3, z);
    return baby;
  }

  /** Aparece junto al dueño (en un hueco de pie a 1–3 bloques). */
  teleportNear(e: Entity, owner: PlayerView): boolean {
    const w = this.m.w;
    const h = Math.ceil(e.height);
    const ox = Math.floor(owner.x), oy = Math.floor(owner.y), oz = Math.floor(owner.z);
    for (let i = 0; i < 12; i++) {
      const dx = Math.floor(this.m.rand() * 7) - 3, dz = Math.floor(this.m.rand() * 7) - 3;
      if (Math.abs(dx) < 1 && Math.abs(dz) < 1) continue;
      for (const dy of [0, 1, -1, 2, -2]) {
        const x = ox + dx, y = oy + dy, z = oz + dz;
        if (!standable(w, x, y, z, h)) continue;
        const feet = w.getBlock(x, y, z), floor = w.getBlock(x, y - 1, z);
        if ((feet > 0 && BLOCK_FLUID[feet]) || (floor > 0 && BLOCK_FLUID[floor])) continue;
        e.x = x + 0.5;
        e.y = y;
        e.z = z + 0.5;
        e.vx = e.vy = e.vz = 0;
        e.fallStart = y;
        const ai = e.ai!;
        ai.path = null;
        ai.goal = null;
        ai.lastX = e.x;
        ai.lastZ = e.z;
        return true;
      }
    }
    return false;
  }

  /** Clic derecho del jugador `who` (nombre) con `item` (0 = mano vacía). */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult | null {
    if (!isTameable(e.type) || e.dead || !e.ai) return null;
    const take = creative ? 0 : 1;
    if (!e.tamedBy) {
      if (!TAME_ITEMS[e.type]?.includes(item)) return null;
      if (!who || (e.type === MOB_WOLF && e.ai.angry > 0)) return { ok: false };
      if (this.m.rand() < TAME_CHANCE) {
        this.makeTamed(e, who);
        if (e.type === MOB_CAT && e.variant === undefined) e.variant = Math.floor(this.m.rand() * CAT_SKINS.length);
        this.m.host.fx('tame', e.x, e.y + e.height, e.z, e.type);
      } else this.m.host.fx('tame_fail', e.x, e.y + e.height, e.z, e.type);
      return { ok: true, take };
    }
    // Domesticado: sólo le hace caso su dueño.
    if (!who || who.toLowerCase() !== e.tamedBy) return { ok: false };
    if (PET_FOOD[e.type]?.includes(item)) {
      if (e.health < e.maxHealth) {
        e.health = Math.min(e.maxHealth, e.health + (e.type === MOB_WOLF ? 4 : 2));
        this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
        return { ok: true, take };
      }
      if ((e.growAge ?? 0) > 0) {
        e.growAge = Math.max(0.05, e.growAge! * 0.9);
        this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
        return { ok: true, take };
      }
      if (!((e.love ?? 0) > 0) && !((e.breedCd ?? 0) > 0)) {
        e.love = LOVE_SECONDS;
        e.sitting = false;
        this.m.host.fx('feed', e.x, e.y + e.height, e.z, e.type);
        return { ok: true, take };
      }
    }
    // Cualquier otra cosa (o la mano vacía): sentarse o levantarse.
    e.sitting = !e.sitting;
    e.foe = undefined;
    e.following = false;
    e.ai.path = null;
    e.ai.goalDir = [0, 0, 0, 0];
    return { ok: true };
  }
}
