// Cerebro de las criaturas: entorno (sol, lava, agua), objetivos, persecución con A*, ataques,
// disparos, teletransporte del enderman, paseo y movimiento con física.
import { MOBS, MOB_CHICKEN, MOB_SKELETON, MOB_STRAY, MOB_CREEPER, MOB_ENDERMAN, MOB_RABBIT, MOB_WOLF, MOB_LLAMA, MOB_ENDERMITE } from '../../mobs';
import { isVillagerType } from '../../mobs'; // Fase 6 (aldeanos)
import { BLOCK_SOLID, BLOCK_FLUID, isFarmland } from '../../blocks';
import { EF_HURT, EF_FIRE, EF_DEAD, EF_ANGRY, EF_ACTION, EF_BABY, EF_SHEARED, EF_LOVE } from '../../protocol';
import { moveBody, lineOfSight } from '../physics';
import { canMeleeHit } from './meleeReach'; // alcance y línea de visión de Java
import { findPath, standable } from '../pathfind';
import { GRAVITY, TAU, angleTo, lerpAngle, type PlayerView, type AI, type Entity } from './types';
import type { Entities } from './Entities';
import { MIN_Y, VOID_Y } from '../../constants';
// Fase 6 (monstruos): comportamiento de los monstruos nuevos.
import { MonsterAI, isSpiderLike } from './monsterAi';
import { faunaMobTick, faunaFlags } from './wildlife'; // Fase 6 (fauna)
import { IllagerAI } from './illagers'; // Fase 6 (asaltos)
import { WardenAI } from './warden'; // Fase 7.5 (abismo)
import { CHARGED_POWER, EF_CHARGED, skullDisguises } from '../../collections'; // Fase 6.5 (colecciones)
import { PT_LONG_SLOWNESS } from '../../potions'; // Fase 7 (pociones)
import { invisibleRange } from '../../effects';
import { GuardianAI } from './guardians'; // Fase 7.5 (océano)
// Fase 7.5 (fauna): murciélagos, ocelotes, llamas de comerciante, caballos no muertos y jinetes esqueleto.
import { critterTick, critterFlags, isFeline, isLlamaLike } from './critters';
import { wearsHelmet, sinksInWater } from './skeletonTrap';
import { NetherAI } from './netherMobs'; // Fase 8.3 (criaturas del Nether)

export class MobBrain {
  /** Fase 6 (monstruos). */
  readonly monsters: MonsterAI;
  /** Fase 6 (asaltos): illagers, vex, devastadores, colmillos y zombis contra aldeanos. */
  readonly illagers: IllagerAI;
  /** Fase 7.5 (abismo): el warden. */
  readonly warden: WardenAI;
  /** Fase 7.5 (océano): guardianes y guardianes ancianos. */
  readonly guardians: GuardianAI;

  /** Fase 8.3 (criaturas del Nether): piglins, ghast, blaze, cubos de magma, hoglin, zoglin, strider y esqueleto wither. */
  readonly nether: NetherAI;

  constructor(private m: Entities) {
    this.monsters = new MonsterAI(m, this);
    this.illagers = new IllagerAI(m, this);
    this.warden = new WardenAI(m, this);
    this.guardians = new GuardianAI(m, this);
    this.nether = new NetherAI(m, this);
  }

  nearestPlayer(e: Entity, players: PlayerView[], max: number, needLos: boolean): PlayerView | null {
    let best: PlayerView | null = null;
    let bd = max * max;
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
      const d2 = dx * dx + dy * dy * 2 + dz * dz;
      if (d2 >= bd) continue;
      // Fase 6.5 (colecciones): con la cabeza de su especie puesta, lo ven a la mitad de distancia.
      if (p.head && skullDisguises(p.head, e.type) && d2 * 4 >= max * max) continue;
      // Fase 7 (pociones): a alguien invisible lo ven de mucho más cerca (menos cuanta más armadura lleve).
      if (p.invisible && d2 >= (max * invisibleRange(p.armorPieces ?? 0)) ** 2) continue;
      if (needLos && d2 > 36 && !lineOfSight(this.m.w, e.x, e.y + e.height * 0.85, e.z, p.x, p.y + 1.5, p.z)) continue;
      bd = d2;
      best = p;
    }
    return best;
  }

  isSunlit(e: Entity): boolean {
    if (this.m.host.sunHeight() < 0.05 || this.m.host.raining() > 0.3 || e.inWater) return false;
    const top = this.m.w.skyTop(Math.floor(e.x), Math.floor(e.z));
    return top >= MIN_Y - 1 && e.y + e.height > top + 1;
  }

  mobTick(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const w = this.m.w;
    // Fase 6 (monturas): la montura que guía su jinete ni piensa ni se mueve sola.
    if (this.m.mounts.riddenTick(e, dt)) return;
    if (e.vehicle !== undefined && this.m.seated?.(e)) return; // Fase 7 (transporte): sentada en una barca o vagoneta
    if (this.warden.tick(e, dt, players)) return; // Fase 7.5 (abismo): el warden lo decide todo solo
    // Ambiente: sol, lava, fuego, caída, vacío.
    if (def.burnsInSun && !wearsHelmet(e) && this.isSunlit(e)) e.fire = Math.max(e.fire, 2); // Fase 7.5: el casco protege
    if (def.fireImmune) {
      // Fase 8.3: a las criaturas del Nether no les hacen nada el fuego ni la lava (y no se las ve arder).
      e.fire = 0;
      e.burnAcc = 0;
    } else if (e.inLava) {
      e.fire = 7;
      e.burnAcc += dt * 8;
    }
    if (e.inWater) e.fire = 0;
    if (e.fire > 0) {
      e.fire -= dt;
      e.burnAcc += dt;
    }
    if (e.burnAcc >= 1) {
      e.burnAcc -= 1;
      e.invuln = 0;
      if (this.m.damage(e, 1, e.x, e.z, null, 0)) return;
    }
    if (e.y < VOID_Y) {
      this.m.kill(e, false);
      return;
    }
    if (def.aquatic) {
      if (!e.inWater) {
        ai.think -= dt;
        if (ai.think <= 0) {
          ai.think = 1;
          e.invuln = 0;
          if (this.m.damage(e, 1, e.x, e.z, null, 0)) return;
        }
      }
    }
    if (e.type === MOB_ENDERMAN && (e.inWater || (this.m.host.raining() > 0.3 && this.isSunlit({ ...e, inWater: false } as Entity)))) {
      ai.teleportCd -= dt;
      if (ai.teleportCd <= 0) {
        ai.teleportCd = 1;
        e.invuln = 0;
        this.m.damage(e, 1, e.x, e.z, null, 0);
        this.teleport(e);
      }
    }

    if (!def.hostile && !def.aquatic) this.m.animals.animalTick(e, dt);
    // Fase 6 (aldeanos): oficio, reposición, puertas y huida de los zombis.
    if (isVillagerType(e.type)) this.m.villagers.tick(e, dt);
    if (e.dead || !this.m.list.has(e.id)) return;
    if (this.nether.tick(e, dt, players)) return; // Fase 8.3 (criaturas del Nether): lo deciden todo solas
    // Fase 7.5 (mansión): el alay vuela, recoge objetos y baila.
    if (this.m.allays.tick(e, dt, players)) {
      if (!e.dead && this.m.list.has(e.id)) {
        this.updateFlags(e, ai);
        e.flags |= this.m.allays.flags(e);
      }
      return;
    }
    // Fase 6 (fauna): abejas y loros vuelan; pandas y armadillos tienen estados propios.
    if (faunaMobTick(this.m, e, dt, players)) {
      if (!e.dead && this.m.list.has(e.id)) this.updateFlags(e, ai);
      return;
    }
    if (critterTick(this.m, e, dt, players)) {
      if (!e.dead && this.m.list.has(e.id)) this.updateFlags(e, ai);
      return;
    }
    ai.attackCd -= dt;
    ai.shootCd -= dt;
    ai.repath -= dt;
    ai.think -= dt;
    if (ai.angry > 0) ai.angry -= dt;
    if (ai.panic > 0) ai.panic -= dt;
    // Fase 6 (gólems/domesticar): gólems y domesticados deciden aparte (dejan la dirección en ai.goalDir).
    const companion = this.m.companions.decide(e, players, dt);
    // Animales neutrales (lobo, oso polar): si un jugador les pega, en vez de huir se enfadan.
    if (!def.hostile && def.neutral && ai.panic > 0 && e.lastHurtBy && e.age - (e.lastHurtAt ?? -99) < 0.5) this.provoke(e, e.lastHurtBy);
    // Fase 6 (acuáticos): peces, delfines, tortugas, ajolotes, ranas y renacuajos nadan a su manera.
    if (this.m.aquatic.handles(e.type)) {
      this.m.aquatic.tick(e, dt, players);
      return;
    }
    // Fase 6.5 (equipo): el ahogado con tridente lo lanza; la cabra que embiste se mueve sola.
    if (this.m.gear.tick(e, dt, players)) {
      if (!e.dead && this.m.list.has(e.id)) this.updateFlags(e, ai);
      return;
    }
    if (this.guardians.tick(e, dt, players)) return; // Fase 7.5 (océano)
    // Fase 6 (monstruos): los monstruos nuevos deciden y se mueven solos.
    if (this.monsters.tick(e, dt, players)) return;
    if (this.illagers.tick(e, dt, players)) return; // Fase 6 (asaltos)
    const spiderLike = isSpiderLike(e.type);

    // --- Decisión ---
    let moveX = 0, moveZ = 0, speed = 0, jump = false;
    let lookAt: [number, number, number] | null = null;
    const hostileNow = (def.hostile || !!def.neutral) && (
      !def.neutral || ai.angry > 0 ||
      (spiderLike && (this.m.host.sunHeight() < 0.05 || w.skyTop(Math.floor(e.x), Math.floor(e.z)) > e.y + 2))
    );
    if (e.type === MOB_ENDERMAN) {
      for (const p of players) {
        if (p.lookingAt === e.id && p.alive && !p.creative) {
          if (ai.angry <= 0) this.m.host.fx('enderman_scream', e.x, e.y + 2.5, e.z);
          ai.angry = 30;
          ai.target = p.id;
        }
      }
    }
    let target: PlayerView | null = null;
    if (hostileNow) {
      if (ai.target) target = players.find((p) => p.id === ai.target && p.alive && !p.creative) ?? null;
      if (target && Math.hypot(target.x - e.x, target.z - e.z) > 40) target = null;
      // Fase 7 (pociones): si se vuelve invisible, lo pierde de vista en cuanto se aleja un poco.
      if (target?.invisible && Math.hypot(target.x - e.x, target.z - e.z) > 24 * invisibleRange(target.armorPieces ?? 0)) target = null;
      // (Fase 6: las arañas, neutrales de día, a oscuras buscan presa sin que las provoquen.)
      if (!target && (def.neutral ? ai.angry > 0 || spiderLike : true)) target = this.nearestPlayer(e, players, spiderLike ? 16 : 24, true);
      ai.target = target ? target.id : null;
    } else ai.target = null;

    if (def.aquatic) {
      // Calamar: impulsos aleatorios dentro del agua.
      if (e.inWater) {
        if (ai.think <= 0) {
          ai.think = 2 + this.m.rand() * 3;
          const a = this.m.rand() * TAU;
          ai.swimDir = [Math.cos(a), (this.m.rand() - 0.5) * 0.8, Math.sin(a)];
        }
        e.vx += (ai.swimDir[0] * def.walk - e.vx) * dt * 1.5;
        e.vz += (ai.swimDir[2] * def.walk - e.vz) * dt * 1.5;
        e.vy += (ai.swimDir[1] * def.walk - e.vy) * dt * 1.5;
        const above = w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height + 0.3), Math.floor(e.z));
        if (!(above > 0 && BLOCK_FLUID[above] === 1) && e.vy > 0) e.vy = -0.5;
      } else {
        e.vy -= GRAVITY * dt;
        if (e.onGround && this.m.rand() < dt * 2) {
          e.vy = 4;
          e.vx = (this.m.rand() - 0.5) * 3;
          e.vz = (this.m.rand() - 0.5) * 3;
        }
      }
      if (Math.hypot(e.vx, e.vz) > 0.05) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 3);
      e.yaw = e.bodyYaw;
      moveBody(e, w, dt);
      this.updateFlags(e, ai);
      return;
    }

    // Fase 6 (gólems/domesticar): los creepers huyen de los gatos.
    if (e.type === MOB_CREEPER && this.m.companions.scaredOfCat(e)) target = null;
    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z;
      const dist = Math.hypot(dx, dz);
      const dy = target.y - e.y;
      // Distancia de verdad (en 3D), como distanceToSqr en Java: la que cuenta para los ataques a distancia.
      const dist3 = Math.hypot(dx, dy, dz);
      lookAt = [target.x, target.y + 1.6, target.z];
      const los = dist < 20 && lineOfSight(w, e.x, e.y + e.height * 0.85, e.z, target.x, target.y + 1.5, target.z);
      if (e.type === MOB_SKELETON || e.type === MOB_STRAY) {
        // Mantener distancia y disparar.
        if (dist < 6) {
          moveX = -dx / dist;
          moveZ = -dz / dist;
          speed = def.walk;
        } else if (dist > 12 || !los) {
          [moveX, moveZ, jump] = this.followPath(e, target, dt);
          speed = def.run;
        } else {
          // Rodeo lateral.
          const side = Math.sin(e.age * 0.7 + e.id) > 0 ? 1 : -1;
          moveX = (-dz / dist) * side;
          moveZ = (dx / dist) * side;
          speed = def.walk * 0.6;
        }
        // RangedBowAttackGoal: dispara a 15 bloques como mucho.
        if (los && dist3 <= 15 && ai.shootCd <= 0) {
          ai.shootCd = 1.6 + this.m.rand() * 1.2;
          this.shootAt(e, target);
        }
      } else if (e.type === MOB_CREEPER) {
        // SwellGoal: empieza a hincharse con su presa a menos de 3 bloques (en 3D) y, ya hinchándose, sigue
        // mientras la vea a 7 como mucho; si no, se deshincha. Hinchándose no anda. 30 ticks: explota.
        if (ai.fuse > 0 || (dist3 < 3 && los)) {
          speed = 0;
          if (dist3 > 7 || !los) ai.fuse = Math.max(0, ai.fuse - dt);
          else {
            if (ai.fuse === 0) this.m.host.fx('creeper_fuse', e.x, e.y + 1, e.z);
            ai.fuse += dt;
            if (ai.fuse >= 1.5) {
              this.m.remove(e.id);
              // Fase 6.5 (colecciones): el creeper cargado explota el doble de fuerte.
              this.m.explode(e.x, e.y + 0.5, e.z, e.charged ? CHARGED_POWER : 3, !!e.charged);
              return;
            }
          }
        }
        if (ai.fuse <= 0) {
          [moveX, moveZ, jump] = this.followPath(e, target, dt);
          speed = def.run;
        }
      } else if (e.type === MOB_LLAMA || isLlamaLike(e.type)) {
        // Fase 6 (monturas): la llama no muerde, escupe (Fase 7.5: también la llama de comerciante).
        [moveX, moveZ, speed, jump] = this.m.mounts.llamaFight(e, target, dist3, los, dt);
      } else {
        // Cuerpo a cuerpo.
        if (dist < 2.5 && Math.abs(dy) < 1.5 && los) {
          moveX = dx / (dist || 1);
          moveZ = dz / (dist || 1);
        } else [moveX, moveZ, jump] = this.followPath(e, target, dt);
        speed = e.type === MOB_ENDERMAN ? def.run * 1.2 : def.run;
        if (spiderLike && dist < 4 && dist > 2 && e.onGround && this.m.rand() < dt * 1.5) {
          // Salto de ataque.
          e.vy = 6;
          e.vx += (dx / dist) * 4;
          e.vz += (dz / dist) * 4;
        }
        // MeleeAttackGoal.canPerformAttack: al alcance y viéndolo (no a través de puertas, cristales ni paredes).
        if (ai.attackCd <= 0 && canMeleeHit(w, e, target.x, target.y, target.z, 0.6, 1.8, 1.62)) {
          ai.attackCd = 1;
          const dmg = def.damage * this.m.difficultyScale();
          this.m.host.hurtPlayer(target.id, dmg, (dx / (dist || 1)) * 5, 4, (dz / (dist || 1)) * 5, def.key, e); // Fase 7: e (Espinas)
          this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
          this.monsters.onMelee(e, target); // Fase 6 (monstruos): veneno de la araña de cueva
          this.m.companions.onPlayerHurtBy(target.id, e); // Fase 6 (gólems/domesticar)
        }
      }
    } else if (e.type === MOB_ENDERMAN && this.huntEndermite(e, ai)) {
      // Fase 8.6: el enderman va a por la endermita que ve (huntEndermite deja la dirección en ai.goalDir).
      moveX = ai.goalDir[0];
      moveZ = ai.goalDir[1];
      speed = ai.goalDir[2];
      jump = ai.goalDir[3] > 0;
      if (ai.lookAt) lookAt = ai.lookAt;
    } else if (companion) {
      // Fase 6 (gólems/domesticar)
      moveX = ai.goalDir[0];
      moveZ = ai.goalDir[1];
      speed = ai.goalDir[2];
      jump = ai.goalDir[3] > 0;
      if (ai.lookAt) lookAt = ai.lookAt;
    } else if (ai.panic > 0) {
      const dx = e.x - ai.panicFrom[0], dz = e.z - ai.panicFrom[1];
      const d = Math.hypot(dx, dz) || 1;
      moveX = dx / d + Math.sin(e.age * 3) * 0.3;
      moveZ = dz / d + Math.cos(e.age * 3) * 0.3;
      speed = def.run;
    } else if (e.leashTo && Math.hypot(e.leashTo[0] - e.x, e.leashTo[2] - e.z) > 2.5) {
      // Fase 6.5 (remate): atada con correa, camina hacia quien la lleva (o hacia la valla).
      const dx = e.leashTo[0] - e.x, dz = e.leashTo[2] - e.z;
      const d = Math.hypot(dx, dz);
      moveX = dx / d;
      moveZ = dz / d;
      speed = e.steerSpeed ?? (d > 5 ? def.run : def.walk); // Fase 6.5 (equipo): el cerdo guiado con la caña
      jump = e.hitWall;
      lookAt = e.leashTo;
    } else if (isVillagerType(e.type) && this.m.villagers.goal(e, players, dt)) {
      // Fase 6 (aldeanos): comerciar, huir, ir a casa o pasear (goal deja la dirección en ai.goalDir).
      moveX = ai.goalDir[0];
      moveZ = ai.goalDir[1];
      speed = ai.goalDir[2];
      jump = ai.goalDir[3] > 0;
      if (ai.lookAt) lookAt = ai.lookAt;
    } else if (!def.hostile && this.m.animals.animalGoal(e, players, dt)) {
      // Buscar pareja o seguir a quien lleva su comida (animalGoal deja la dirección en ai.goalDir).
      moveX = ai.goalDir[0];
      moveZ = ai.goalDir[1];
      speed = ai.goalDir[2];
      jump = ai.goalDir[3] > 0;
      if (ai.lookAt) lookAt = ai.lookAt;
    } else {
      // Paseo tranquilo.
      if (ai.think <= 0) {
        ai.think = 3 + this.m.rand() * 6;
        if (this.m.rand() < 0.6) {
          const a = this.m.rand() * TAU, r = 3 + this.m.rand() * 7;
          ai.goal = [Math.floor(e.x + Math.cos(a) * r), Math.floor(e.y), Math.floor(e.z + Math.sin(a) * r)];
        } else ai.goal = null;
        // Mirar a los jugadores cercanos a veces.
        const near = this.nearestPlayer(e, players.map((p) => ({ ...p, creative: false })), 8, false);
        if (near && this.m.rand() < 0.5) ai.lookYaw = angleTo(e.x, e.z, near.x, near.z);
        else ai.lookYaw = e.bodyYaw + (this.m.rand() - 0.5) * 1.5;
      }
      if (ai.goal) {
        const dx = ai.goal[0] + 0.5 - e.x, dz = ai.goal[2] + 0.5 - e.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) ai.goal = null;
        else {
          moveX = dx / d;
          moveZ = dz / d;
          speed = def.walk;
        }
      }
    }

    // --- Movimiento ---
    const wantMove = speed > 0 && (moveX !== 0 || moveZ !== 0);
    if (wantMove) {
      const ml = Math.hypot(moveX, moveZ) || 1;
      moveX /= ml;
      moveZ /= ml;
      // No caminar hacia la lava ni a caídas grandes al pasear.
      if (!target && ai.panic <= 0) {
        const ax = Math.floor(e.x + moveX * 0.9), az = Math.floor(e.z + moveZ * 0.9), fy = Math.floor(e.y);
        const ahead = w.getBlock(ax, fy, az);
        let drop = 0;
        while (drop < 4 && !BLOCK_SOLID[Math.max(0, w.getBlock(ax, fy - 1 - drop, az))] && w.getBlock(ax, fy - 1 - drop, az) >= 0) drop++;
        const below = w.getBlock(ax, fy - 1, az);
        if ((ahead > 0 && BLOCK_FLUID[ahead] === 2) || (below > 0 && BLOCK_FLUID[below] === 2) || drop >= 4) {
          moveX = moveZ = 0;
          ai.goal = null;
        }
      }
    }
    const tvx = moveX * speed, tvz = moveZ * speed;
    const acc = e.onGround ? 10 : e.inWater ? 4 : 2;
    e.vx += (tvx - e.vx) * Math.min(1, dt * acc);
    e.vz += (tvz - e.vz) * Math.min(1, dt * acc);
    if ((e.inWater || e.inLava) && !sinksInWater(e.type)) {
      // Flotar (las criaturas terrestres nadan hacia arriba).
      e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
      if (e.hitWall) e.vy = Math.max(e.vy, 4);
    } else if (e.inWater) {
      e.vy = Math.max(-3, e.vy - GRAVITY * 0.3 * dt); // Fase 7.5: el caballo esqueleto se hunde y anda por el fondo
    } else {
      e.vy -= GRAVITY * dt;
      if (e.vy < -60) e.vy = -60;
    }
    if (e.onGround && (jump || (e.hitWall && wantMove && speed > 0))) {
      if (e.type === MOB_CHICKEN || spiderLike || ai.stuck > 0.1 || jump || e.hitWall) e.vy = 8.6;
    } else if (e.type === MOB_RABBIT && e.onGround && wantMove && speed > 0) e.vy = 5.2; // el conejo va a saltitos
    if (spiderLike && e.hitWall && wantMove) e.vy = Math.max(e.vy, 3.2);
    if (e.type === MOB_CHICKEN && !e.onGround && e.vy < -2 && !e.inWater) e.vy = -2; // aleteo
    const wasGround = e.onGround;
    const prevVy = e.vy;
    moveBody(e, w, dt, 0.6);
    // Daño por caída.
    if (!wasGround && e.onGround && !e.inWater && e.type !== MOB_CHICKEN && !isFeline(e.type)) { // Fase 7.5: gatos y ocelotes caen de pie
      const fall = e.fallStart - e.y;
      if (fall > 3.5 && prevVy < -8) this.m.damage(e, Math.floor(fall - 3), e.x, e.z, null, 0);
      // Pisotear la tierra de cultivo al caer encima (sólo las criaturas grandes, como en Minecraft).
      if (fall > 0.5 && this.m.rand() < fall - 0.5 && e.width * e.width * e.height > 0.512) {
        const bx = Math.floor(e.x), by = Math.floor(e.y - 0.05), bz = Math.floor(e.z);
        if (isFarmland(w.getBlock(bx, by, bz))) this.m.host.trample(bx, by, bz);
      }
    }
    if (e.onGround || e.inWater) e.fallStart = e.y;
    else e.fallStart = Math.max(e.fallStart, e.y);
    // Atasco.
    const moved = Math.hypot(e.x - ai.lastX, e.z - ai.lastZ);
    ai.stuck = wantMove && moved < speed * dt * 0.2 ? ai.stuck + dt : 0;
    if (ai.stuck > 2) {
      ai.goal = null;
      ai.path = null;
      ai.stuck = 0;
      ai.think = 0;
    }
    ai.lastX = e.x;
    ai.lastZ = e.z;
    // Orientación.
    if (Math.hypot(e.vx, e.vz) > 0.3) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 8);
    if (lookAt) {
      e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, lookAt[0], lookAt[2]), dt * 10);
      const hd = Math.hypot(lookAt[0] - e.x, lookAt[2] - e.z);
      e.pitch = Math.atan2(lookAt[1] - (e.y + e.height * 0.85), hd);
    } else {
      e.yaw = lerpAngle(e.yaw, ai.lookYaw, dt * 3);
      e.pitch *= 1 - Math.min(1, dt * 3);
    }
    this.updateFlags(e, ai);
  }

  /**
   * Fase 8.6: el enderman y las endermitas (NearestAttackableTargetGoal<Endermite>): la más cercana que ve a menos
   * de 16 bloques; se le acerca corriendo y la muerde (su daño, una vez por segundo). false si no hay ninguna.
   */
  private huntEndermite(e: Entity, ai: AI): boolean {
    let prey: Entity | null = null, bd = 16 * 16;
    for (const o of this.m.list.values()) {
      if (o.type !== MOB_ENDERMITE || o.dead || !o.ai) continue;
      const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2 + (o.z - e.z) ** 2;
      if (d2 >= bd || !lineOfSight(this.m.w, e.x, e.y + e.height * 0.85, e.z, o.x, o.y + 0.2, o.z)) continue;
      bd = d2;
      prey = o;
    }
    if (!prey) return false;
    const def = MOBS[e.type];
    const dx = prey.x - e.x, dz = prey.z - e.z, d = Math.hypot(dx, dz) || 1;
    ai.goalDir = [dx / d, dz / d, def.run * 1.2, e.hitWall ? 1 : 0];
    ai.lookAt = [prey.x, prey.y + 0.2, prey.z];
    if (d < 1.6 && Math.abs(prey.y - e.y) < 1.5 && ai.attackCd <= 0) {
      ai.attackCd = 1;
      this.m.damage(prey, def.damage * this.m.difficultyScale(), e.x, e.z, e.id);
      this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
    }
    return true;
  }

  /** Enfada a un animal neutral contra un jugador (los lobos cercanos acuden en manada). */
  provoke(e: Entity, player: string): void {
    const pack = e.type === MOB_WOLF ? [...this.m.list.values()].filter((o) => o.type === MOB_WOLF && !o.dead && o.ai && Math.hypot(o.x - e.x, o.z - e.z) < 16) : [e];
    for (const o of pack) {
      const a = o.ai!;
      a.panic = 0;
      a.angry = 25;
      a.target = player;
    }
  }

  updateFlags(e: Entity, ai: AI): void {
    let f = 0;
    if (e.hurt < 0.4) f |= EF_HURT;
    if (e.fire > 0) f |= EF_FIRE;
    if (e.dead) f |= EF_DEAD;
    if (ai.angry > 0 || (ai.target && MOBS[e.type].hostile)) f |= EF_ANGRY;
    if (ai.fuse > 0 || (ai.target && ai.shootCd < 0.6 && (e.type === MOB_SKELETON || e.type === MOB_STRAY))) f |= EF_ACTION;
    if ((e.growAge ?? 0) > 0) f |= EF_BABY;
    if (e.sheared) f |= EF_SHEARED;
    if ((e.love ?? 0) > 0) f |= EF_LOVE;
    f |= this.m.mounts.flags(e); // Fase 6 (monturas): silla, domada, con jinete, encabritada
    f |= this.m.companions.flags(e); // Fase 6 (gólems/domesticar)
    f |= faunaFlags(e); // Fase 6 (fauna)
    f |= critterFlags(e); // Fase 7.5 (fauna)
    if (e.charged) f |= EF_CHARGED; // Fase 6.5 (colecciones)
    f |= this.m.gear.flags(e); // Fase 6.5 (equipo): la cabra que embiste
    e.flags = f;
  }

  /** Sigue (o recalcula) el camino hacia el objetivo. Devuelve [dirX, dirZ, saltar]. */
  followPath(e: Entity, target: PlayerView, dt: number): [number, number, boolean] {
    const ai = e.ai!;
    const tx = Math.floor(target.x), ty = Math.floor(target.y), tz = Math.floor(target.z);
    const needs = !ai.path || ai.repath <= 0 || (ai.goal && Math.abs(ai.goal[0] - tx) + Math.abs(ai.goal[2] - tz) > 2);
    if (needs) {
      ai.repath = 1 + this.m.rand() * 0.6;
      ai.goal = [tx, ty, tz];
      const h = Math.ceil(e.height);
      ai.path = findPath(this.m.w, Math.floor(e.x), Math.floor(e.y + 0.01), Math.floor(e.z), tx, ty, tz, h, 350);
      ai.pathIdx = 0;
    }
    void dt;
    const path = ai.path;
    if (path && ai.pathIdx < path.length) {
      let node = path[ai.pathIdx];
      const dx = node[0] + 0.5 - e.x, dz = node[2] + 0.5 - e.z;
      if (Math.hypot(dx, dz) < 0.4 && Math.abs(node[1] - e.y) < 1.2) {
        ai.pathIdx++;
        if (ai.pathIdx >= path.length) return this.direct(e, target);
        node = path[ai.pathIdx];
      }
      const ndx = node[0] + 0.5 - e.x, ndz = node[2] + 0.5 - e.z;
      const d = Math.hypot(ndx, ndz) || 1;
      return [ndx / d, ndz / d, node[1] > Math.floor(e.y + 0.01)];
    }
    return this.direct(e, target);
  }

  direct(e: Entity, target: PlayerView): [number, number, boolean] {
    const dx = target.x - e.x, dz = target.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d, false];
  }

  shootAt(e: Entity, target: PlayerView): void {
    const sx = e.x, sy = e.y + e.height * 0.8, sz = e.z;
    const tx = target.x, ty = target.y + 1.2, tz = target.z;
    const dx = tx - sx, dz = tz - sz;
    const horiz = Math.max(1e-3, Math.hypot(dx, dz));
    const speed = 30;
    const t = Math.max(0.05, horiz / speed);
    // Compensar la gravedad (20 m/s²) y añadir imprecisión según la dificultad.
    const spread = [0.12, 0.09, 0.06, 0.03][this.m.host.difficulty()] ?? 0.06;
    const vy = (ty - sy) / t + 0.5 * 20 * t;
    const vx = dx / t + (this.m.rand() - 0.5) * spread * speed;
    const vz = dz / t + (this.m.rand() - 0.5) * spread * speed;
    const arrow = this.m.spawnArrow(sx + (dx / horiz) * 0.6, sy, sz + (dz / horiz) * 0.6, vx, vy + (this.m.rand() - 0.5) * spread * speed, vz, e.id, 2);
    // Fase 7 (pociones): las flechas de los esqueletos glaciales dan 30 s de Lentitud (como en Minecraft).
    if (e.type === MOB_STRAY) arrow.arrowPotion = PT_LONG_SLOWNESS;
    this.m.host.fx('mob_shoot', sx, sy, sz, e.type);
  }

  teleport(e: Entity): void {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(e.x + (this.m.rand() - 0.5) * 32);
      const z = Math.floor(e.z + (this.m.rand() - 0.5) * 32);
      for (let y = Math.floor(e.y) + 8; y > Math.floor(e.y) - 16; y--) {
        if (standable(this.m.w, x, y, z, 3)) {
          const b = this.m.w.getBlock(x, y, z);
          if (b > 0 && BLOCK_FLUID[b]) break;
          this.m.host.fx('teleport', e.x, e.y + 1.5, e.z, e.type);
          e.x = x + 0.5;
          e.y = y;
          e.z = z + 0.5;
          e.vx = e.vy = e.vz = 0;
          e.fallStart = e.y;
          this.m.host.fx('teleport', e.x, e.y + 1.5, e.z, e.type);
          return;
        }
      }
    }
  }
}
