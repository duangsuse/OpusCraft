// Estado de supervivencia del jugador: vida, hambre, saturación, agotamiento, aire, fuego,
// invulnerabilidad tras un golpe, armadura, regeneración, inanición y muerte (reglas de Minecraft).
import { ARMOR_BYPASS, armorReduce, armorWear } from '../../shared/armor';
import { resistanceFactor } from '../../shared/effects'; // Fase 6.5 (equipo)

export interface SurvivalContext {
  eyeInWater: boolean;
  /** Fase 8.5: el ojo está en una columna de burbujas (se respira). */
  eyeInBubble?: boolean;
  inLava: boolean;
  inWater: boolean;
  /** Bajo la lluvia a cielo abierto (apaga el fuego). */
  inRain: boolean;
  /** 0 pacífico .. 3 difícil. */
  difficulty: number;
  /** Efecto Resistencia al fuego: la lava y el fuego no hacen daño. */
  fireResistant?: boolean;
  /** Efecto Respiración acuática: no se gasta el aire. */
  waterBreathing?: boolean;
  /** De pie sobre una fogata encendida (quema sin prender fuego). */
  onCampfire?: boolean;
  /** Fase 8.5: la fogata que pisa es la de almas (2 de daño). */
  soulCampfire?: boolean;
  /** Fase 8: de pie sobre un bloque de magma (sin agacharse). */
  onMagma?: boolean;
  /** Fase 6.5 (equipo): dentro de un bloque de fuego (quema y prende). */
  inFire?: boolean;
}

/** Armadura puesta (la implementa el inventario). */
export interface ArmorSource {
  armorPoints(): number;
  armorToughness(): number;
  /** Desgasta cada pieza puesta; devuelve cuántas se rompieron. */
  wearArmor(amount: number): number;
  /** Fase 7 (encantamientos): daño tras las protecciones encantadas (Protección, Caída de pluma…). */
  protect?(damage: number, cause: DamageCause): number;
}

export type DamageCause =
  | 'fall' | 'lava' | 'fire' | 'drown' | 'starve' | 'void' | 'suffocate' | 'explosion' | 'arrow' | 'kill' | string;

/** Mensajes de muerte (se completan con el nombre del jugador). */
export function deathMessage(cause: DamageCause): string {
  const mobs: Record<string, string> = {
    zombie: '被僵尸杀死了', husk: '被尸壳杀死了', skeleton: '被骷髅杀死了',
    stray: '被流浪者杀死了', spider: '被蜘蛛咬死了', enderman: '被末影人杀死了',
    creeper: '被苦力怕炸死了',
    // Fase 6 (monstruos)
    drowned: '被溺尸拖入了水底', witch: '被女巫施法杀死了', slime: '被史莱姆压死了',
    phantom: '被幻翼杀死了', silverfish: '被蠹虫咬死了', cave_spider: '被洞穴蜘蛛咬死了',
    zombie_villager: '被僵尸村民杀死了',
    // Fase 6 (gólems/domesticar)
    iron_golem: '被铁傀儡打飞了', wolf: '被狼咬死了',
    // Fase 6 (fauna).
    bee: '被蜜蜂蜇死了', panda: '被熊猫压死了',
    polar_bear: '被北极熊杀死了',
    // Fase 6 (asaltos)
    pillager: '被掠夺者杀死了', vindicator: '被卫道士杀死了',
    evoker: '被唤魔者的尖牙咬死了', vex: '被恼鬼刺死了', ravager: '被劫掠兽撞死了',
    // Fase 7.5 (océano)
    guardian: '被守卫者用魔法杀死了', elder_guardian: '被远古守卫者用魔法杀死了',
    guardian_laser: '被守卫者的激光杀死了', guardian_thorns: '被守卫者刺死了',
    // Fase 7.5 (abismo)
    warden: '被监守者杀死了', sonic_boom: '被音波尖啸消灭了',
    // Fase 8.3 (criaturas del Nether)
    piglin: '被猪灵杀死了', piglin_brute: '被猪灵蛮兵杀死了',
    zombified_piglin: '被僵尸猪灵杀死了', blaze: '被烈焰人杀死了',
    magma_cube: '被岩浆怪压死了', hoglin: '被疣猪兽杀死了', zoglin: '被僵尸疣猪兽杀死了',
    wither_skeleton: '被凋灵骷髅杀死了', fireball: '被火球击中了',
    small_fireball: '被火球击中了',
  };
  switch (cause) {
    case 'fall': return '从高处摔了下来';
    case 'lava': return '试图在岩浆里游泳';
    case 'fire': return '被烧死了';
    case 'campfire': return '被营火烧死了';
    case 'hot_floor': return '发现了地板是岩浆'; // Fase 8: el magma
    case 'sweet_berry_bush': return '被甜浆果丛刺死了'; // Fase 6.5
    case 'freeze': return '被冻死了'; // Fase 6.5 (materiales)
    case 'drown': return '淹死了';
    case 'starve': return '饿死了';
    case 'void': return '掉进了虚空';
    case 'suffocate': return '在方块里窒息了';
    case 'explosion': return '被炸死了';
    case 'fireworks': return '被烟花炸死了'; // Fase 8.6
    case 'shulker_bullet': return '被潜影贝杀死了'; // Fase 8.6
    case 'fly_into_wall': return '体验了动能'; // Fase 8.6: chocar planeando
    case 'lightning': return '被闪电劈死了';
    case 'arrow': return '被箭射死了';
    case 'kill': return '离开了这个世界';
    case 'llama': return '被羊驼吐口水吐死了'; // Fase 6 (monturas)
    case 'magic': return '死于魔法'; // Fase 7 (pociones)
    case 'wither': return '凋零了'; // Fase 7 (efectos)
    default: return mobs[cause] ?? '死了';
  }
}

export class Survival {
  health = 20;
  food = 20;
  saturation = 5;
  exhaustion = 0;
  /** Aire en segundos (15 = lleno). */
  air = 15;
  /** Segundos que le quedan ardiendo. */
  fire = 0;
  dead = false;
  deathCause: DamageCause = '';
  /** Tiempo desde el último daño (para el parpadeo rojo y el balanceo de cámara). */
  hurtTime = 10;
  /** Dirección del último golpe (para inclinar la cámara). */
  hurtDir = 0;
  private invuln = 0;
  private lastDamage = 0;
  private regenTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;
  private fireTimer = 0;
  private lavaTimer = 0;
  /** Se ha curado o dañado (para refrescar el HUD). */
  version = 0;
  /** Corazones dorados del efecto Absorción (vida extra que se gasta primero). */
  absorption = 0;
  /** Armadura que reduce el daño (sin ella, el daño llega entero). */
  armor: ArmorSource | null = null;
  /** Fase 6.5 (equipo): nivel del efecto Resistencia (−1 sin él); lo pone el juego cada frame. */
  resistance = -1;
  /**
   * Fase 7 (encantamientos), los pone el juego cada frame: parte del aire que se gasta bajo el agua
   * (Respiración) y de lo que dura el fuego (Protección contra el fuego).
   */
  respiration = 1;
  burnFactor = 1;
  /** Fase 7 (efectos), los pone el juego cada frame: vida máxima (Salud mejorada) y ciego (no se corre). */
  maxHealth = 20;
  blind = false;

  reset(): void {
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 15;
    this.fire = 0;
    this.absorption = 0;
    this.dead = false;
    this.deathCause = '';
    this.hurtTime = 10;
    this.invuln = 0;
    this.lastDamage = 0;
    this.version++;
  }

  /**
   * Aplica daño respetando la invulnerabilidad de medio segundo (en ella sólo cuenta el exceso
   * sobre el último golpe; `bypass` se la salta). La armadura reduce el daño y se desgasta, salvo con
   * las causas que la atraviesan (caídas, ahogo, vacío...). Devuelve el daño efectivo.
   */
  damage(amount: number, cause: DamageCause, bypass = false): number {
    if (this.dead || amount <= 0) return 0;
    let dmg = amount;
    if (!bypass && this.invuln > 0) {
      if (amount <= this.lastDamage) return 0;
      dmg = amount - this.lastDamage;
      this.lastDamage = amount;
    } else {
      this.lastDamage = amount;
      this.invuln = 0.5;
    }
    // `bypass` sólo salta la invulnerabilidad (daño periódico); lo que atraviesa la armadura lo
    // decide la causa (la lava y el fuego sí se reducen, como en Minecraft).
    if (this.armor && !ARMOR_BYPASS.has(cause)) {
      const raw = dmg;
      dmg = armorReduce(raw, this.armor.armorPoints(), this.armor.armorToughness());
      this.armor.wearArmor(armorWear(raw));
    }
    // Fase 6.5 (equipo): Resistencia (todo menos el vacío y /kill).
    if (cause !== 'void' && cause !== 'kill') dmg *= resistanceFactor(this.resistance);
    // Fase 7 (encantamientos): protecciones de la armadura encantada (también en las caídas).
    if (this.armor?.protect) dmg = this.armor.protect(dmg, cause);
    // Los corazones dorados (absorción) se gastan antes que la vida.
    const absorbed = Math.min(this.absorption, dmg);
    this.absorption -= absorbed;
    this.health = Math.max(0, this.health - (dmg - absorbed));
    this.hurtTime = 0;
    this.addExhaustion(0.1);
    this.version++;
    if (this.health <= 0) {
      this.dead = true;
      this.deathCause = cause;
    }
    return dmg;
  }

  heal(n: number): void {
    if (this.dead) return;
    const h = Math.max(this.health, Math.min(this.maxHealth, this.health + n));
    if (h !== this.health) {
      this.health = h;
      this.version++;
    }
  }

  addExhaustion(x: number): void {
    this.exhaustion += x;
  }

  eat(hunger: number, saturation: number): void {
    this.food = Math.min(20, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + saturation);
    this.version++;
  }

  canSprint(): boolean {
    return this.food > 6 && !this.blind;
  }

  update(dt: number, ctx: SurvivalContext): void {
    if (this.dead) return;
    this.hurtTime += dt;
    if (this.invuln > 0) this.invuln -= dt;
    const peaceful = ctx.difficulty === 0;

    // Agotamiento → saturación → hambre.
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (!peaceful) {
        this.food = Math.max(0, this.food - 1);
        this.version++;
      }
    }
    // Regeneración natural.
    this.regenTimer += dt;
    if (peaceful) {
      if (this.regenTimer >= 1) {
        this.regenTimer = 0;
        this.heal(1);
        if (this.food < 20) {
          this.food++;
          this.version++;
        }
      }
    } else if (this.health < this.maxHealth && this.food >= 20 && this.saturation > 0) {
      if (this.regenTimer >= 0.5) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(Math.min(this.saturation, 6));
      }
    } else if (this.health < this.maxHealth && this.food >= 18) {
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(6);
      }
    } else this.regenTimer = Math.min(this.regenTimer, 4);
    // Inanición: en fácil se detiene a 5 corazones y en normal a medio corazón.
    if (this.food <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        const floor = ctx.difficulty <= 1 ? 10 : ctx.difficulty === 2 ? 1 : 0;
        if (this.health > floor) this.damage(1, 'starve', true);
      }
    } else this.starveTimer = 0;
    // Aire bajo el agua.
    if (ctx.eyeInWater && !ctx.waterBreathing && !ctx.eyeInBubble) {
      this.air = Math.max(0, this.air - dt * this.respiration); // Fase 7: Respiración
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer = 0;
          this.damage(2, 'drown', true);
        }
      }
    } else {
      this.air = Math.min(15, this.air + dt * 5);
      this.drownTimer = 0;
    }
    // Lava y fuego.
    if (ctx.inLava) {
      this.fire = 15 * this.burnFactor; // Fase 7: Protección contra el fuego
      this.lavaTimer += dt;
      if (this.lavaTimer >= 0.5) {
        this.lavaTimer = 0;
        if (!ctx.fireResistant) this.damage(4, 'lava', true);
      }
    } else this.lavaTimer = 0.5;
    // La fogata quema al pisarla (la invulnerabilidad deja un golpe cada medio segundo).
    if (ctx.onCampfire && !ctx.fireResistant) this.damage(ctx.soulCampfire ? 2 : 1, 'campfire');
    if (ctx.onMagma && !ctx.fireResistant) this.damage(1, 'hot_floor'); // Fase 8
    // Fase 6.5 (equipo): el fuego prende al que lo toca (8 s) y quema al momento.
    if (ctx.inFire && !ctx.inWater) {
      this.fire = Math.max(this.fire, 8 * this.burnFactor); // Fase 7: Protección contra el fuego
      if (!ctx.fireResistant) this.damage(1, 'fire');
    }
    if (ctx.inWater || ctx.inRain) this.fire = 0;
    if (this.fire > 0) {
      this.fire -= dt;
      this.fireTimer += dt;
      if (this.fireTimer >= 1 && !ctx.inLava) {
        this.fireTimer = 0;
        if (!ctx.fireResistant) this.damage(1, 'fire', true);
      }
    } else this.fireTimer = 0;
  }
}
