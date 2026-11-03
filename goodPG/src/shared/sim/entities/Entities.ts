// Entidades del servidor: criaturas (con IA), objetos tirados, flechas, bloques que caen, orbes de
// experiencia, huevos lanzados y flotadores de pesca. Este gestor guarda la lista, crea y retira
// entidades, aplica daño y explosiones y reparte cada tick entre sus comportamientos: itemPhysics,
// projectiles, mobBrain, animalLife, spawner y xpOrbs.
import { MOB_WITHER } from '../../witherMobs';
import { WitherAI } from './wither'; // Fase 8.7
/** Fase 8.7: opciones de una explosión (tnt.ts BlastOptions). */
export interface BlastExtra { source?: number; resist?: (id: number, r: number) => number }
import { MOB_FROG, frogVariantFor } from '../../aquaticMobs'; // la rana y sus variedades
import { isDeepDark } from '../../world/deepDark';
import { MOB_SLIME_SMALL } from '../../mobs';
import { MOB_MAGMA_CUBE_SMALL } from '../../netherMobs';
import { OCHRE_FROGLIGHT, PEARLESCENT_FROGLIGHT, VERDANT_FROGLIGHT } from '../../blocks';
import { SLIME_BALL } from '../../items';
import { isPushableMob, pushStep, boxesOverlap } from '../../push'; // empujar criaturas
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../../constants';
import { ShulkerAI } from './shulkers'; // Fase 8.6
import { MOB_SHULKER } from '../../endMobs';
import {
  MOBS, MOB_CHICKEN, MOB_ENDERMAN, MOB_ENDER_DRAGON, MOB_SQUID, ENT_ITEM, ENT_ARROW, ENT_FALLING, ENT_XP, ENT_THROWN, ENT_BOBBER, ENT_DISPLAY,
  type MobDef,
} from '../../mobs';
import { ITEMS, ARROW, SADDLE, type ItemStack } from '../../items';
import { WHITE_WOOL, BLOCK_FLUID, BLOCK_HARDNESS } from '../../blocks';
import type { WorldSim } from '../WorldSim';
import { blockDrops } from '../drops';
import { GROW_SECONDS, TAU, MAX_ITEMS, MAX_ARROWS, ACTIVE_RANGE, type PlayerView, type EntityHost, type InteractResult, type Entity } from './types';
import { ItemPhysics } from './itemPhysics';
import { MobBrain } from './mobBrain';
import { AnimalLife } from './animalLife';
import { Spawner } from './spawner';
import { XpOrbs } from './xpOrbs';
import { Projectiles } from './projectiles';
import { MountLife } from './mounts'; // Fase 6 (monturas)
import { VillagerLife } from './villagerLife'; // Fase 6 (aldeanos)
// Fase 6 (acuáticos).
import { AquaticLife } from './aquaticLife';
import { isWaterAmbient } from '../../aquaticMobs';
// Fase 6 (gólems/domesticar)
import { Companions } from './companions';
import { ENT_ARMOR_STAND } from '../../armorStands'; // Fase 6.5 (remate)
import { isHangingType } from '../../paintings'; // Fase 6.5 (decoración)
import { collectionDrops } from './collectionDrops'; // Fase 6.5 (colecciones)
// Fase 6.5 (equipo): armaduras y equipo de las criaturas; tridentes y cohetes.
import { MobGear } from './mobGear';
import { GearShots } from './gearShots';
import { ENT_TRIDENT, ENT_FIREWORK } from '../../equipment';
// Fase 7 (pociones): efectos de las criaturas, pociones que se rompen, nubes y flechas con efecto.
import { MobEffects } from './mobEffects';
import { PotionLife } from './potions';
import { ENT_EFFECT_CLOUD } from '../../potions';
import { EnderDragonAI } from './enderDragon'; // Fase 8.6 (el End)
import { isVehicleType } from '../../vehicles'; // Fase 7 (transporte)
import { DolphinGuide } from './dolphinGuide'; // Fase 7.5 (océano)
// Fase 7.5 (fauna): murciélagos (del ambiente), jinetes esqueleto y lo que se guarda de las criaturas nuevas.
import { isAmbientCritter } from '../../critters';
import { critterKilled, critterSave, critterRestore } from './critters';
import { horsemanAbsorb } from './skeletonTrap';
import { AllayLife } from './allay'; // Fase 7.5 (mansión)

export class Entities {
  readonly list = new Map<number, Entity>();
  private nextId = 1;
  readonly host: EntityHost;
  rand = Math.random;
  /** Retirados este tick: [id, id del jugador que lo recogió o ''] (para animaciones en clientes). */
  removed: [number, string][] = [];
  readonly items = new ItemPhysics(this);
  readonly mobs = new MobBrain(this);
  readonly animals = new AnimalLife(this);
  readonly spawner = new Spawner(this);
  readonly xp = new XpOrbs(this);
  readonly projectiles = new Projectiles(this);
  /** Fase 6 (monturas): pelaje, silla, doma, mulas y llamas que escupen. */
  readonly mounts = new MountLife(this);
  /** Fase 6 (aldeanos): profesión, paseo y casa de los aldeanos. */
  readonly villagers = new VillagerLife(this);
  /** Fase 6 (acuáticos): peces, delfines, tortugas, ajolotes, ranas y renacuajos. */
  readonly aquatic = new AquaticLife(this);
  // Fase 6 (gólems/domesticar): gólems y animales domesticados.
  readonly companions = new Companions(this);
  /** Fase 6 (asaltos): centro de la aldea de cada asalto en curso (hacia donde marchan los asaltantes). */
  readonly raidCenters = new Map<number, [number, number, number]>();
  /** Fase 6 (asaltos): zonas en alerta [x, z, radio]: los aldeanos se refugian en casa. */
  alarms: [number, number, number][] = [];
  /** Fase 6.5 (colecciones): quién dio el golpe mortal (mientras se resuelve la muerte). */
  private killer: string | number | null = null;
  /** Fase 6.5 (colecciones): explosión de creeper cargado en curso (suelta una sola cabeza). */
  chargedBlast: { dropped: boolean } | null = null;
  /** Fase 6.5 (equipo): armaduras de caballo y lobo, tridentes de los ahogados, botín raro y cabras. */
  readonly gear = new MobGear(this);
  /** Fase 6.5 (equipo): tridentes lanzados y cohetes. */
  readonly gearShots = new GearShots(this);
  /** Fase 7 (pociones): efectos de estado de las criaturas. */
  readonly effects = new MobEffects(this);
  /** Fase 7 (pociones): arrojadizas, persistentes (nubes) y flechas con efecto. */
  readonly potions = new PotionLife(this);
  /**
   * Fase 7 (transporte): criatura sentada en una barca o vagoneta: la coloca en su asiento el sistema de
   * transporte (devuelve true y la criatura ni piensa ni se mueve sola).
   */
  seated: ((e: Entity) => boolean) | null = null;
  // Fase 7 (encantamientos)
  /** Un bloque que caía toca el suelo (antes de ponerse): el yunque hiere y se deteriora. */
  fallingLanded: ((e: Entity) => boolean) | null = null;
  /** Nivel de Saqueo del golpe que se está resolviendo (lo pone quien ataca). */
  looting = 0;
  // Fase 7 (mecanismos)
  /** Entidades con comportamiento de otro sistema (la dinamita encendida): tipo → su tick. */
  readonly custom = new Map<number, (e: Entity, dt: number) => void>();
  /** Fase 8.6 (el End): el dragón de Ender, sus cristales y sus bolas de fuego. */
  readonly dragon = new EnderDragonAI(this);
  /** Fase 8.6 (el End): los shulkers y sus balas. */
  readonly shulkers = new ShulkerAI(this);
  /** Fase 8.7: el Wither y sus calaveras. */
  readonly wither = new WitherAI(this);
  /** Fase 7.5 (océano): delfines que llevan a los naufragios y a las ruinas. */
  readonly dolphinGuide = new DolphinGuide(this);
  /** Explosión como las de Minecraft (la pone el sistema de la dinamita); sin ella, la sencilla de aquí. */
  explosion: ((x: number, y: number, z: number, power: number, charged: boolean, breakBlocks?: boolean, extra?: BlastExtra) => void) | null = null; // Fase 8.5: breakBlocks; 8.7: extra
  /** Fase 7.5 (abismo): un catalizador de sculk cercano se come la experiencia de la criatura que muere (devuelve true). */
  xpEater: ((e: Entity) => boolean) | null = null;
  /** Fase 7.5 (mansión): alays (objetos que recogen, bailes y duplicación). */
  readonly allays = new AllayLife(this);

  constructor(host: EntityHost) {
    this.host = host;
    this.mobs.nether.flyers.register(); // Fase 8.3: el tick de las bolas de fuego
  }

  get w(): WorldSim {
    return this.host.world;
  }

  private base(type: number, x: number, y: number, z: number, width: number, height: number, health: number): Entity {
    return {
      id: this.nextId++, type, x, y, z, vx: 0, vy: 0, vz: 0, width, height, onGround: false, inWater: false,
      inLava: false, hitWall: false, yaw: this.rand() * TAU, pitch: 0, bodyYaw: 0, health, maxHealth: health,
      hurt: 99, invuln: 0, dead: false, deathTime: 0, fire: 0, burnAcc: 0, age: 0, fallStart: y, despawn: false,
      flags: 0,
    };
  }

  spawnMob(type: number, x: number, y: number, z: number, baby = false): Entity | null {
    const def = MOBS[type];
    if (!def) return null;
    const e = this.base(type, x, y, z, def.width, def.height, def.health);
    e.bodyYaw = e.yaw;
    if (!def.hostile && !def.aquatic) {
      e.growAge = 0;
      e.love = 0;
      e.breedCd = 0;
      e.sheared = false;
      if (type === MOB_CHICKEN) e.eggTimer = 300 + this.rand() * 300;
      if (baby) this.animals.setBaby(e, GROW_SECONDS);
      this.mounts.init(e); // Fase 6 (monturas)
    }
    e.ai = {
      target: null, goal: null, path: null, pathIdx: 0, repath: 0, think: this.rand() * 2, attackCd: 0, shootCd: 1 + this.rand(),
      fuse: 0, angry: 0, panic: 0, panicFrom: [x, z], stuck: 0, lastX: x, lastZ: z, swimDir: [0, 0, 0], lookYaw: e.yaw,
      teleportCd: 0, goalDir: [0, 0, 0, 0], lookAt: null,
    };
    this.gear.onSpawn(e); // Fase 6.5 (equipo)
    this.allays.init(e); // Fase 7.5 (mansión)
    if (type === MOB_SHULKER) this.shulkers.init(e); // Fase 8.6: en el centro de su celda, pegado abajo
    if (type === MOB_WITHER) e.persist = true; // Fase 8.7: el Wither no desaparece (salvo en pacífico)
    // La rana, de la variedad de su bioma (la templada, la cálida o la fría).
    if (type === MOB_FROG) e.variant = frogVariantFor(this.w.gen.biomeAt(Math.floor(x), Math.floor(z)), isDeepDark(this.w.gen, Math.floor(x), Math.floor(y), Math.floor(z)));
    this.list.set(e.id, e);
    return e;
  }

  /** Entidad sin comportamiento propio (el que la crea rellena sus datos). */
  spawnBare(type: number, x: number, y: number, z: number, width: number, height: number): Entity {
    const e = this.base(type, x, y, z, width, height, 1);
    this.list.set(e.id, e);
    return e;
  }

  /** Retira la entidad más antigua de un tipo si se alcanzó su límite. */
  makeRoom(type: number, max: number): void {
    let n = 0;
    let oldest: Entity | null = null;
    for (const e of this.list.values()) {
      if (e.type !== type) continue;
      n++;
      if (!oldest || e.age > oldest.age) oldest = e;
    }
    if (n >= max && oldest) this.remove(oldest.id);
  }

  spawnItem(stack: ItemStack, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, owner?: string, delay = 0.5): Entity {
    this.makeRoom(ENT_ITEM, MAX_ITEMS);
    const e = this.base(ENT_ITEM, x, y, z, 0.25, 0.25, 5);
    e.stack = { ...stack };
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.owner = owner;
    e.pickupDelay = delay;
    this.list.set(e.id, e);
    return e;
  }

  /** Suelta objetos con la dispersión típica de un bloque roto. */
  /** Retoques de lo que se suelta antes de soltarlo (las capas de los estandartes rotos). */
  decorateDrops: ((stacks: ItemStack[], x: number, y: number, z: number) => ItemStack[]) | null = null;

  dropStacks(stacks: ItemStack[], x: number, y: number, z: number): void {
    if (this.decorateDrops) stacks = this.decorateDrops(stacks, x, y, z);
    for (const s of stacks) {
      if (!s || s.count <= 0) continue;
      this.spawnItem(s, x + (this.rand() - 0.5) * 0.4, y, z + (this.rand() - 0.5) * 0.4, (this.rand() - 0.5) * 2, 3 + this.rand() * 1.5, (this.rand() - 0.5) * 2);
    }
  }

  spawnArrow(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: string | number, damage: number): Entity {
    this.makeRoom(ENT_ARROW, MAX_ARROWS);
    const e = this.base(ENT_ARROW, x, y, z, 0.2, 0.2, 1);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.shooter = shooter;
    e.arrowDamage = damage;
    e.yaw = Math.atan2(-vx, -vz);
    e.pitch = Math.atan2(vy, Math.hypot(vx, vz));
    this.list.set(e.id, e);
    return e;
  }

  /** Objeto lanzado por un jugador (huevo). Fase 7 (pociones): `dmg`, el tipo de la poción lanzada. */
  spawnThrown(item: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, thrower: string, dmg = 0): Entity {
    this.makeRoom(ENT_THROWN, MAX_ARROWS);
    const e = this.base(ENT_THROWN, x, y, z, 0.25, 0.25, 1);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.stack = dmg > 0 ? { id: item, count: 1, dmg } : { id: item, count: 1 };
    e.shooter = thrower;
    this.list.set(e.id, e);
    return e;
  }

  /** Flotador de la caña de pescar de `owner`. */
  spawnBobber(x: number, y: number, z: number, vx: number, vy: number, vz: number, owner: string): Entity {
    const e = this.base(ENT_BOBBER, x, y, z, 0.25, 0.25, 1);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.shooter = owner;
    this.list.set(e.id, e);
    return e;
  }

  /** Objeto quieto de adorno (no se mueve ni se recoge). */
  spawnDisplay(stack: ItemStack, x: number, y: number, z: number, yaw: number): Entity {
    const e = this.base(ENT_DISPLAY, x, y, z, 0.25, 0.05, 1);
    e.stack = { id: stack.id, count: 1 };
    e.yaw = yaw;
    this.list.set(e.id, e);
    return e;
  }

  spawnFalling(block: number, x: number, y: number, z: number): Entity {
    const e = this.base(ENT_FALLING, x, y, z, 0.98, 0.98, 1);
    e.block = block;
    e.fallFrom = y; // Fase 7 (encantamientos)
    e.yaw = 0;
    this.list.set(e.id, e);
    return e;
  }

  remove(id: number, collector = ''): void {
    if (this.list.delete(id)) this.removed.push([id, collector]);
  }

  counts(x: number, z: number, radius: number): { hostile: number; passive: number; squid: number } {
    let hostile = 0, passive = 0, squid = 0;
    const r2 = radius * radius;
    for (const e of this.list.values()) {
      if (!e.ai) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz > r2) continue;
      const def = MOBS[e.type];
      if (e.type === MOB_SQUID) squid++;
      else if (isWaterAmbient(e.type) || isAmbientCritter(e.type)) continue; // Fase 6 (acuáticos), 7.5 (murciélagos): sus propios límites.
      else if (def.hostile) hostile++;
      else passive++;
    }
    return { hostile, passive, squid };
  }

  // ------------------------------------------------------------------ daño

  /** Daño a una entidad; devuelve true si murió. */
  damage(e: Entity, amount: number, fromX: number, fromZ: number, attacker: string | number | null, knock = 1): boolean {
    if (e.dead || !e.ai || MOBS[e.type].inert) return false;
    // Fase 8.6: el dragón recibe el daño por partes (la del golpe o la más cercana a quien lo da).
    if (e.type === MOB_ENDER_DRAGON) {
      const part = this.dragon.pendingPart >= 0 ? this.dragon.pendingPart : this.dragon.partAt(e, fromX, e.y + 2, fromZ);
      this.dragon.pendingPart = -1;
      this.dragon.hurt(e, part, amount, attacker);
      return false;
    }
    if (e.invuln > 0) return false;
    if (this.wither.ignores(e, attacker)) return false; // Fase 8.7: el Wither al nacer, y contra los no muertos
    if (this.allays.immune(e, attacker)) return false; // Fase 7.5 (mansión): su jugador no hiere al alay
    amount = this.gear.absorb(e, amount); // Fase 6.5 (equipo): armadura de caballo o de lobo
    amount = horsemanAbsorb(e, amount); // Fase 7.5 (fauna): el casco del jinete esqueleto
    amount = this.mobs.nether.absorb(e, amount); // Fase 8.3: la armadura del cubo de magma y el oro de los piglins
    amount = this.shulkers.absorb(e, amount); // Fase 8.6: el shulker cerrado
    amount = this.wither.absorb(e, amount); // Fase 8.7: la armadura del Wither
    knock *= 1 - this.mobs.nether.knockbackResistance(e); // Fase 8.3: el hoglin y el zoglin apenas retroceden
    knock *= 1 - this.gear.knockbackResistance(e); // Fase 8.5: la armadura de netherita del caballo
    amount *= this.effects.damageFactor(e); // Fase 7 (pociones): Resistencia
    e.health -= amount;
    e.invuln = 0.5;
    e.hurt = 0;
    const dx = e.x - fromX, dz = e.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    e.vx += (dx / d) * 5 * knock;
    e.vz += (dz / d) * 5 * knock;
    e.vy = Math.max(e.vy, 4 * knock);
    if (typeof attacker === 'string') {
      e.lastHurtBy = attacker;
      e.lastHurtAt = e.age;
    }
    const ai = e.ai;
    const def = MOBS[e.type];
    if (!def.hostile || def.neutral) {
      if (def.hostile && typeof attacker === 'string') {
        ai.angry = 30;
        ai.target = attacker;
      } else {
        ai.panic = 5;
        ai.panicFrom = [fromX, fromZ];
      }
    } else if (typeof attacker === 'string') ai.target = attacker;
    // Fase 6 (gólems/domesticar): los lobos ayudan a su dueño; gólems y domesticados se defienden.
    if (typeof attacker === 'string') this.companions.onPlayerAttack(attacker, e);
    this.companions.onHurt(e, attacker);
    if (typeof attacker === 'string') this.villagers.onHurtBy(e, attacker); // cotilleo: le han hecho daño
    if (e.type === MOB_ENDERMAN && this.rand() < 0.6) this.mobs.teleport(e);
    this.mobs.monsters.onDamaged(e, attacker); // Fase 6 (monstruos): las lepismas piden ayuda
    this.mobs.illagers.onDamaged(e, attacker); // Fase 6 (asaltos): venganza de los asaltantes
    this.mobs.warden.onDamaged(e, attacker); // Fase 7.5 (abismo): el warden se enfada (y no retrocede)
    this.mobs.nether.onDamaged(e, attacker); // Fase 8.3 (criaturas del Nether)
    this.shulkers.onDamaged(e, attacker); // Fase 8.6: se teletransporta, se duplica y avisa a los suyos
    this.wither.onDamaged(e, attacker); // Fase 8.7: rompe lo que le rodea
    this.host.fx('mob_hurt', e.x, e.y + e.height / 2, e.z, e.type);
    if (e.health <= 0) {
      this.killer = attacker; // Fase 6.5 (colecciones)
      this.kill(e, true);
      this.killer = null;
      return true;
    }
    return false;
  }

  kill(e: Entity, drops: boolean): void {
    if (e.dead) return;
    if (typeof this.killer === 'string') this.villagers.onMurdered(e, this.killer); // cotilleo: lo vieron matar
    e.dead = true;
    e.deathTime = 0;
    e.health = 0;
    this.host.fx('mob_death', e.x, e.y + e.height / 2, e.z, e.type);
    // La rana se come los cubos pequeños: el slime deja una bola de slime y el de magma, una luz de rana de su color.
    const frog = typeof this.killer === 'number' ? this.list.get(this.killer) : undefined;
    if (drops && frog?.type === MOB_FROG && (e.type === MOB_SLIME_SMALL || e.type === MOB_MAGMA_CUBE_SMALL)) {
      const light = [OCHRE_FROGLIGHT, PEARLESCENT_FROGLIGHT, VERDANT_FROGLIGHT][frog.variant ?? 0] ?? OCHRE_FROGLIGHT;
      this.dropStacks([{ id: e.type === MOB_SLIME_SMALL ? SLIME_BALL : light, count: 1 }], e.x, e.y + 0.2, e.z);
      this.xp.onMobKilled(e);
      return;
    }
    if (drops && e.ai && !((e.growAge ?? 0) > 0)) {
      const def = MOBS[e.type];
      const stacks: ItemStack[] = [];
      for (const [id, min, max] of def.drops) {
        if (id === WHITE_WOOL && e.sheared) continue;
        // Fase 7 (encantamientos): Saqueo suma de 0 a su nivel a cada botín.
        const n = min + Math.floor(this.rand() * (max - min + 1)) + (this.looting > 0 ? Math.floor(this.rand() * (this.looting + 1)) : 0);
        if (n > 0) stacks.push({ id, count: n });
      }
      // Los animales que mueren ardiendo sueltan la carne cocinada.
      if (e.fire > 0) for (const s of stacks) if (ITEMS[s.id]?.smelt && ITEMS[s.id]?.food) s.id = ITEMS[s.id].smelt!;
      if (e.saddled) stacks.push({ id: SADDLE, count: 1 }); // Fase 6 (monturas): suelta la silla
      this.dropStacks(stacks, e.x, e.y + 0.3, e.z);
    }
    if (drops && !this.xpEater?.(e)) this.xp.onMobKilled(e); // Fase 7.5 (abismo): o se la come un catalizador
    if (drops) this.mobs.monsters.onKilled(e); // Fase 6 (monstruos): los slimes se dividen
    if (drops) this.mobs.illagers.onKilled(e); // Fase 6 (asaltos): botella ominosa del capitán
    if (drops) collectionDrops(this, e, this.killer); // Fase 6.5 (colecciones): cabezas y discos
    // Fase 7.5 (mansión): lo que llevaba el alay (antes que el equipo: su objeto no es una armadura puesta).
    if (drops) this.allays.onKilled(e);
    if (drops) critterKilled(this, e); // Fase 7.5 (fauna): equipo del jinete esqueleto (antes de que se lo quite gear)
    if (drops) this.gear.onKilled(e); // Fase 6.5 (equipo): armadura puesta, tridente, ballesta, pata de conejo
    if (drops) this.mobs.guardians.onKilled(e); // Fase 7.5 (océano): botín de los guardianes
    if (drops) this.mobs.nether.onKilled(e, this.killer); // Fase 8.3 (criaturas del Nether): equipo, varas, cráneos, cubos que se dividen
    if (drops) this.shulkers.onKilled(e); // Fase 8.6: la concha
    if (drops) this.wither.onKilled(e); // Fase 8.7: la estrella del Nether
    this.wither.onVictim(e, this.killer); // Fase 8.7: lo que mata el Wither deja una rosa marchita
  }

  // ------------------------------------------------------------------ explosiones

  /** `charged`: Fase 6.5 (colecciones), creeper cargado (su víctima suelta la cabeza). */
  explode(x: number, y: number, z: number, power: number, charged = false, extra?: BlastExtra): void {
    if (this.explosion) return this.explosion(x, y, z, power, charged, true, extra); // Fase 7 (mecanismos); 8.7: extra
    const r = Math.ceil(power);
    this.host.fx('explode', x, y, z, power);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > power * (0.7 + this.rand() * 0.6)) continue;
          const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
          const id = this.w.getBlock(bx, by, bz);
          if (id <= 0 || BLOCK_FLUID[id]) continue;
          const h = BLOCK_HARDNESS[id];
          if (h < 0 || h >= 10) continue;
          this.host.breakBlock(bx, by, bz, this.rand() < 0.3);
        }
      }
    }
    const reach = power * 2;
    this.chargedBlast = charged ? { dropped: false } : null;
    for (const e of this.list.values()) {
      if (!e.ai || e.dead) continue;
      const d = Math.hypot(e.x - x, e.y + e.height / 2 - y, e.z - z);
      if (d > reach) continue;
      const impact = 1 - d / reach;
      this.damage(e, Math.floor((impact * impact + impact) * 3.5 * power + 1), x, z, null, 1 + impact * 2);
    }
    this.chargedBlast = null;
    for (const p of this.host.players()) {
      if (!p.alive || p.creative) continue;
      const d = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
      if (d > reach) continue;
      const impact = 1 - d / reach;
      const dmg = Math.floor((impact * impact + impact) * 3.5 * power + 1) * this.difficultyScale();
      const dd = d || 1;
      this.host.hurtPlayer(p.id, dmg, ((p.x - x) / dd) * impact * 12, 4 + impact * 6, ((p.z - z) / dd) * impact * 12, 'explosion');
    }
  }

  difficultyScale(): number {
    const d = this.host.difficulty();
    return d <= 1 ? 0.5 : d === 3 ? 1.5 : 1;
  }

  // ------------------------------------------------------------------ bucle

  /** Distancia horizontal al jugador más cercano. */
  nearestPlayer2D(e: Entity, players: PlayerView[]): number {
    let d = Infinity;
    for (const p of players) d = Math.min(d, Math.hypot(p.x - e.x, p.z - e.z));
    return d;
  }

  tick(dt: number): void {
    const players = this.host.players();
    this.items.buildItemGrid();
    this.xp.beginTick(dt);
    this.mobs.illagers.tickWorld(dt); // Fase 6 (asaltos): colmillos que brotan
    const active: Entity[] = [];
    for (const e of this.list.values()) {
      const near = this.nearestPlayer2D(e, players);
      // Monstruos y calamares desaparecen lejos de todos (como en Minecraft).
      // Fase 7.5 (océano, mansión): las de estructura (persist: illagers de la mansión, guardianes…) sólo se van en pacífico.
      // Fase 7.5 (fauna): los murciélagos, también.
      if (e.ai && !e.dead && e.raid === undefined && !e.customName && !e.leash && (MOBS[e.type].hostile || this.aquatic.despawns(e) || isAmbientCritter(e.type))) {
        if ((!e.persist && (near > 96 || (near > 32 && this.rand() < dt / 40))) || (MOBS[e.type].hostile && this.host.difficulty() === 0)) {
          this.remove(e.id);
          continue;
        }
      }
      // Lejos de los jugadores o en un chunk sin cargar: congelada.
      if (near > ACTIVE_RANGE || !this.w.isLoaded(Math.floor(e.x / 16), Math.floor(e.z / 16))) continue;
      if (e.ai) active.push(e);
      e.age += dt;
      e.hurt += dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.dead) {
        e.deathTime += dt;
        if (e.deathTime > 1.1) this.remove(e.id);
        continue;
      }
      if (e.type === ENT_ITEM) this.items.itemTick(e, dt, players);
      else if (e.type === ENT_ARROW) this.items.arrowTick(e, dt, players);
      else if (e.type === ENT_FALLING) this.items.fallingTick(e, dt);
      else if (e.type === ENT_XP) this.xp.orbTick(e, dt, players);
      else if (e.type === ENT_THROWN) this.projectiles.thrownTick(e, dt, players);
      else if (e.type === ENT_BOBBER) this.projectiles.bobberTick(e, dt, players);
      else if (e.type === ENT_DISPLAY || isHangingType(e.type) || e.type === ENT_ARMOR_STAND) e.flags = 0; // Fase 6.5: cuadros, marcos y soportes
      else if (e.type === ENT_TRIDENT || e.type === ENT_FIREWORK) this.gearShots.tick(e, dt, players); // Fase 6.5 (equipo)
      else if (e.type === ENT_EFFECT_CLOUD) {
        if (e.dragonBreath) this.dragon.breathTick(e, dt); // Fase 8.6: el aliento del dragón
        else this.potions.cloudTick(e, dt, players); // Fase 7 (pociones)
      }
      else if (this.custom.has(e.type)) this.custom.get(e.type)!(e, dt); // Fase 7 (mecanismos): dinamita encendida; 8.6: el End
      else if (e.effects) this.effects.tickWith(e, dt, () => this.mobs.mobTick(e, dt, players)); // Fase 7 (pociones)
      else if (isVehicleType(e.type)) continue; // Fase 7 (transporte): las mueve su sistema
      else this.mobs.mobTick(e, dt, players);
    }
    this.separate(active.filter((e) => !e.dead && this.list.has(e.id) && e.mountId === undefined)); // Fase 8.3: los jinetes van encima
    this.pushedByPlayers(active, players, dt);
    this.spawner.spawnTick(dt, players);
    this.aquatic.spawnTick(dt, players); // Fase 6 (acuáticos).
  }

  /**
   * Los jugadores apartan a las criaturas con las que se solapan (Entity.push de Java: hasta 0,05 bloques por tick,
   * que aquí se suman a su velocidad). A las que van montadas o llevan jinete, no.
   */
  private pushedByPlayers(mobs: Entity[], players: PlayerView[], dt: number): void {
    const k = 20 * dt * 20; // bloques por tick → velocidad (bloques/s), por los ticks de este paso
    for (const p of players) {
      if (!p.alive) continue;
      for (const e of mobs) {
        if (e.dead || e.rider || e.mountId !== undefined || !isPushableMob(e.type)) continue;
        if (!boxesOverlap(p.x, p.y, p.z, PLAYER_WIDTH, PLAYER_HEIGHT, e.x, e.y, e.z, e.width, e.height)) continue;
        const v = pushStep(p.x, p.z, e.x, e.z);
        if (!v) continue;
        e.vx += v[0] * k;
        e.vz += v[1] * k;
      }
    }
  }

  /** Empuje entre criaturas que se solapan (sólo las que se simulan). */
  private separate(mobs: Entity[]): void {
    for (let i = 0; i < mobs.length; i++) {
      for (let j = i + 1; j < mobs.length; j++) {
        const a = mobs[i], b = mobs[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = (a.width + b.width) * 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || Math.abs(a.y - b.y) > 1.5) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) * 2;
        a.vx -= (dx / d) * push;
        a.vz -= (dz / d) * push;
        b.vx += (dx / d) * push;
        b.vz += (dz / d) * push;
      }
    }
  }

  // ------------------------------------------------------------------ persistencia

  /** Animales pacíficos para guardar (los hostiles no se guardan). */
  serializePassive(): string {
    const out: number[][] = [];
    for (const e of this.list.values()) {
      // Fase 6.5 (remate): los que llevan nombre se guardan siempre (también monstruos y calamares).
      // Fase 7.5: persist (océano), murciélagos (fauna).
      if (!e.ai || e.dead || ((MOBS[e.type].hostile || e.type === MOB_SQUID || isWaterAmbient(e.type) || isAmbientCritter(e.type)) && !e.customName && !e.persist)) continue;
      const row = [
        e.type, Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.z * 10) / 10, Math.round(e.health),
        Math.round(e.growAge ?? 0), e.sheared ? 1 : 0,
      ];
      // Fase 6 (monturas): octavo campo con pelaje, doma, silla y aptitudes.
      const mount = this.mounts.save(e);
      if (mount !== null) row.push(mount);
      // Fase 6 (aldeanos): profesión, nivel y casa, como un objeto al final de la fila.
      const vil = this.villagers.save(e);
      if (vil) (row as unknown[]).push(vil);
      // Fase 6 (gólems/domesticar): dueño, sentado, piel y gólem hecho a mano.
      const extra = this.companions.save(e);
      if (extra) (row as unknown[]).push(extra);
      // Fase 6.5 (remate): nombre y valla a la que está atada (la correa en la mano de un jugador no se guarda).
      if (e.customName || Array.isArray(e.leash)) (row as unknown[]).push({ tag: e.customName ?? '', fence: Array.isArray(e.leash) ? e.leash : 0 });
      // Fase 6.5 (equipo): armadura de caballo o de lobo.
      const gear = this.gear.save(e);
      if (gear) (row as unknown[]).push(gear);
      // Fase 7.5 (mansión): lo que lleva el alay.
      const allay = this.allays.save(e);
      if (allay) (row as unknown[]).push(allay);
      if (e.persist) (row as unknown[]).push({ keep: 1 }); // Fase 7.5 (océano): criatura de estructura
      // Fase 7.5 (fauna): confianza del ocelote, color de la champiñaca, trampa del caballo esqueleto…
      const crit = critterSave(e);
      if (crit) (row as unknown[]).push(crit);
      const nether = this.mobs.nether.save(e); // Fase 8.3 (criaturas del Nether): equipo e inventario del piglin
      if (nether) (row as unknown[]).push(nether);
      const wither = this.wither.save(e); // Fase 8.7: la invulnerabilidad del Wither
      if (wither) (row as unknown[]).push(wither);
      out.push(row);
    }
    return JSON.stringify(out);
  }

  restorePassive(json: string | null): void {
    if (!json) return;
    try {
      const arr = JSON.parse(json) as number[][];
      for (const row of arr) {
        const [type, x, y, z, hp, grow, sheared, mount] = row;
        if (!MOBS[type] || ![x, y, z].every(Number.isFinite)) continue;
        const e = this.spawnMob(type, x, y, z);
        if (!e) continue;
        // Fase 6: campos extra al final de la fila (monturas: número; gólems/domesticar: lista; aldeanos: {vil}).
        this.companions.restore(e, (row as unknown[]).slice(7).find((c) => Array.isArray(c)));
        if (Number.isFinite(hp)) e.health = Math.max(1, Math.min(e.maxHealth, hp));
        if (Number.isFinite(grow) && grow > 0) this.animals.setBaby(e, Math.min(GROW_SECONDS, grow));
        if (sheared === 1) e.sheared = true;
        if (typeof mount === 'number') this.mounts.load(e, mount); // Fase 6 (monturas)
        // Fase 6 (aldeanos): datos del aldeano (objeto con clave 'vil' en cualquier posición de la fila).
        if (Array.isArray(row)) this.villagers.restore(e, (row as unknown[]).find((c) => !!c && typeof c === 'object' && 'vil' in (c as object)));
        // Fase 6.5 (remate): nombre y valla.
        const tag = (row as unknown[]).find((c) => !!c && typeof c === 'object' && 'tag' in (c as object)) as { tag?: unknown; fence?: unknown } | undefined;
        if (tag) {
          if (typeof tag.tag === 'string' && tag.tag) e.customName = tag.tag.slice(0, 32);
          const f = tag.fence;
          if (Array.isArray(f) && f.length === 3 && f.every(Number.isInteger)) e.leash = [f[0], f[1], f[2]];
        }
        if (Array.isArray(row)) this.gear.restore(e, row as unknown[]); // Fase 6.5 (equipo)
        if ((row as unknown[]).some((c) => !!c && typeof c === 'object' && 'keep' in (c as object))) e.persist = true; // Fase 7.5 (océano)
        if (Array.isArray(row)) critterRestore(e, row as unknown[]); // Fase 7.5 (fauna)
        if (Array.isArray(row)) this.allays.restore(e, row as unknown[]); // Fase 7.5 (mansión): el alay
        if (Array.isArray(row)) this.mobs.nether.restore(e, row as unknown[]); // Fase 8.3 (criaturas del Nether)
        if (Array.isArray(row)) this.wither.restore(e, row as unknown[]); // Fase 8.7
      }
    } catch {
      /* ignorar */
    }
  }

  /** Fase 6 (asaltos): ¿hay un asalto en curso cerca de (x, z)? */
  alarmed(x: number, z: number): boolean {
    for (const [ax, az, r] of this.alarms) if (Math.hypot(x - ax, z - az) < r) return true;
    return false;
  }

  // ------------------------------------------------------------------ fachada para el servidor

  tryPickup(id: number, p: PlayerView): ItemStack | null {
    const trident = this.gearShots.tryPickup(id, p); // Fase 6.5 (equipo)
    if (trident !== undefined) return trident;
    return this.items.tryPickup(id, p);
  }

  /** `who`: nombre del jugador (para domesticar y reconocer al dueño). */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult {
    // Fase 6 (gólems/domesticar): domesticar, sentar, curar gólems.
    const r = this.companions.interact(e, item, creative, who);
    if (r) return r;
    // Fase 8.3 (criaturas del Nether): oro para el piglin, hongo carmesí para el hoglin.
    const nether = this.mobs.nether.interact(e, item, creative, who);
    if (nether) return nether;
    // Fase 6 (acuáticos): cubo de agua sobre un pez, un ajolote o un renacuajo.
    return this.dolphinGuide.feed(e, item) ?? this.aquatic.interact(e, item) ?? this.animals.interact(e, item, creative); // Fase 7.5: delfines
  }

  spawnPassive(p: PlayerView, force = false): void {
    this.spawner.spawnPassive(p, force);
  }
}

export function isMobType(type: number): boolean {
  return !!MOBS[type];
}

export function mobDef(type: number): MobDef | undefined {
  return MOBS[type];
}

export { ARROW, blockDrops };
