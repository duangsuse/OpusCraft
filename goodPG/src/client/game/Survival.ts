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
    zombie: 'fue devorado por un zombi', husk: 'fue devorado por un zombi momificado', skeleton: 'fue abatido por un esqueleto',
    stray: 'fue abatido por un esqueleto errante', spider: 'fue mordido por una araña', enderman: 'fue destrozado por un enderman',
    creeper: 'voló por los aires por un creeper',
    // Fase 6 (monstruos)
    drowned: 'fue arrastrado al fondo por un ahogado', witch: 'fue hechizado por una bruja', slime: 'fue aplastado por un slime',
    phantom: 'fue atacado por un phantom', silverfish: 'fue devorado por lepismas', cave_spider: 'fue mordido por una araña de cueva',
    zombie_villager: 'fue devorado por un aldeano zombi',
    // Fase 6 (gólems/domesticar)
    iron_golem: 'salió volando por un gólem de hierro', wolf: 'fue despedazado por un lobo',
    // Fase 6 (fauna).
    bee: 'murió picado por una abeja', panda: 'fue aplastado por un panda',
    polar_bear: 'fue destrozado por un oso polar',
    // Fase 6 (asaltos)
    pillager: 'fue abatido por un saqueador', vindicator: 'fue despedazado por un vindicador',
    evoker: 'fue devorado por los colmillos de un evocador', vex: 'fue atravesado por un vex', ravager: 'fue arrollado por un devastador',
    // Fase 7.5 (océano)
    guardian: 'fue fulminado por un guardián', elder_guardian: 'fue fulminado por un guardián anciano',
    guardian_laser: 'fue fulminado por el láser de un guardián', guardian_thorns: 'murió pinchado por un guardián',
    // Fase 7.5 (abismo)
    warden: 'fue destrozado por un warden', sonic_boom: 'fue aniquilado por un chillido cargado sónicamente',
    // Fase 8.3 (criaturas del Nether)
    piglin: 'fue asesinado por un piglin', piglin_brute: 'fue asesinado por un piglin bruto',
    zombified_piglin: 'fue asesinado por un piglin zombificado', blaze: 'fue asesinado por un blaze',
    magma_cube: 'fue aplastado por un cubo de magma', hoglin: 'fue asesinado por un hoglin', zoglin: 'fue asesinado por un zoglin',
    wither_skeleton: 'fue asesinado por un esqueleto wither', fireball: 'fue alcanzado por una bola de fuego',
    small_fireball: 'fue alcanzado por una bola de fuego',
  };
  switch (cause) {
    case 'fall': return 'cayó desde muy alto';
    case 'lava': return 'intentó nadar en lava';
    case 'fire': return 'ardió hasta morir';
    case 'campfire': return 'se quemó en una fogata';
    case 'hot_floor': return 'descubrió que el suelo era lava'; // Fase 8: el magma
    case 'sweet_berry_bush': return 'murió pinchado por un arbusto de bayas dulces'; // Fase 6.5
    case 'freeze': return 'se congeló hasta morir'; // Fase 6.5 (materiales)
    case 'drown': return 'se ahogó';
    case 'starve': return 'murió de hambre';
    case 'void': return 'cayó al vacío';
    case 'suffocate': return 'se asfixió dentro de un bloque';
    case 'explosion': return 'voló por los aires';
    case 'fireworks': return 'estalló por los aires con un cohete'; // Fase 8.6
    case 'shulker_bullet': return 'fue abatido por un shulker'; // Fase 8.6
    case 'fly_into_wall': return 'experimentó la energía cinética'; // Fase 8.6: chocar planeando
    case 'lightning': return 'fue alcanzado por un rayo';
    case 'arrow': return 'fue abatido por una flecha';
    case 'kill': return 'abandonó este mundo';
    case 'llama': return 'murió de un escupitajo de llama'; // Fase 6 (monturas)
    case 'magic': return 'murió por arte de magia'; // Fase 7 (pociones)
    case 'wither': return 'se marchitó'; // Fase 7 (efectos)
    default: return mobs[cause] ?? 'murió';
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
