// Vida del jugador: daño, muerte (suelta el inventario y la experiencia), reaparición (en la cama si
// la tiene) y dormir.
import { VOID_Y } from '../../shared/constants';
import { deathMessage } from './Survival';
import { faunaOnHurt } from './faunaInteraction'; // Fase 6 (fauna)
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (dimensiones)
import { isBed, BLOCK_OPAQUE, BLOCK_SOLID, isCampfire, SOUL_CAMPFIRE, HAY_BALE, familyBase, stateProps, MAGMA_BLOCK } from '../../shared/blocks';
import { deathXp } from '../../shared/experience';
import type { EffectTarget } from './statusEffects';
import type { Game } from './Game';
import { useTotem } from './raidClient'; // Fase 6 (asaltos)
import { isPricklyBush } from '../../shared/blocks'; // Fase 6.5 (océano y plantas)
import { Freezing } from './freezing'; // Fase 6.5 (materiales)
import { equipmentSurvival, playerInFire } from './equipmentLife'; // Fase 6.5 (equipo)

/** Destino de los efectos en creativo: nada hace daño ni cura. */
const CREATIVE_TARGET: EffectTarget = { health: 20, absorption: 0, heal: () => {}, damage: () => 0, addExhaustion: () => {} };

export class LifeCycle {
  constructor(private g: Game) {}

  voidTimer = 0;
  suffocateTimer = 0;
  /** Fase 6.5 (materiales): frío de la nieve polvo. */
  readonly freezing = new Freezing();
  /** Durmiendo en una cama (t = segundos que lleva). */
  sleeping: { t: number } | null = null;
  /** Cama donde reaparece (pies). */
  bed: [number, number, number] | null = null;
  /** Fase 8.5: dimensión del punto de reaparición (la cama del mundo normal o el nexo del Nether). */
  bedDim = 0;
  startSleeping(pos: [number, number, number], facing: number): void {
    const p = this.g.player;
    [p.x, p.y, p.z] = pos;
    // Mirando hacia la cabecera (0 N, 1 E, 2 S, 3 O).
    p.yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing & 3];
    p.pitch = 0;
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.flying = false;
    this.g.interaction.mining = null;
    this.g.interaction.use = null;
    this.sleeping = { t: 0 };
    this.g.ui.setSleep(0);
    this.g.sendPos(true);
  }

  /** Levantarse de la cama (send: avisar al servidor). */
  leaveBed(send: boolean): void {
    if (!this.sleeping) return;
    this.sleeping = null;
    this.g.ui.setSleep(null);
    if (send) this.g.net?.send({ t: 'wake' });
    this.g.sendPos(true);
  }

  onHurt(amount: number, k: [number, number, number], cause: string): void {
    this.leaveBed(true);
    if (this.g.survival.dead || (this.g.creative && cause !== 'kill')) return;
    // Fase 8.3: sólo un empujón, sin daño (el hoglin y el zoglin lanzan por los aires lo que embisten).
    if (cause === 'push') {
      if (Array.isArray(k) && k.every(Number.isFinite)) this.g.player.impulse(k[0], k[1], k[2]);
      return;
    }
    // Escudo levantado: bloquea golpes, flechas y explosiones que llegan de frente.
    // Fase 7.5 (abismo): el estampido sónico del warden atraviesa el escudo.
    if (cause !== 'kill' && cause !== 'sonic_boom' && Array.isArray(k) && k.every(Number.isFinite) && this.g.interaction.blockHit(amount, k)) return;
    const dmg = this.g.survival.damage(amount, cause, cause === 'kill');
    // Fase 8.3: la bola de fuego del blaze prende 5 s a quien alcanza.
    if (cause === 'small_fireball' && !this.g.creative) this.g.survival.fire = Math.max(this.g.survival.fire, 5);
    if (dmg <= 0) return;
    faunaOnHurt(this.g, cause); // Fase 6 (fauna): veneno de las abejas
    if (Array.isArray(k) && k.every(Number.isFinite)) {
      let kb = this.g.enchant.knockbackFactor(cause); // Fase 7 (encantamientos): Protección contra explosiones
      // Fase 8.5: la netherita resiste el empuje de golpes y proyectiles (no el de las explosiones).
      if (cause !== 'explosion' && cause !== 'creeper') kb *= 1 - this.g.inv.knockbackResistance();
      this.g.player.impulse(k[0] * kb, k[1] * kb, k[2] * kb);
      // La cámara se inclina hacia el lado del golpe (el atacante está contra el empuje).
      const kl = Math.hypot(k[0], k[2]);
      if (kl > 0.01) {
        const yaw = this.g.player.yaw;
        const side = (Math.cos(yaw) * -k[0] - Math.sin(yaw) * -k[2]) / kl;
        this.g.hurtRoll = -side * 0.14;
      }
    }
    this.hurtFeedback(dmg);
    if (this.g.survival.dead) this.die();
  }

  hurtFeedback(dmg: number): void {
    this.g.audio.playPlayerHurt(null);
    this.g.ui.flashHurt(dmg);
    this.g.shake = Math.min(1, 0.4 + dmg * 0.1);
  }

  die(): void {
    // Fase 6 (asaltos): un tótem de inmortalidad en la mano salva de la muerte.
    if (useTotem(this.g)) return;
    this.leaveBed(true);
    this.g.survival.dead = true;
    this.g.statusEffects.clear(this.g.survival);
    this.g.interaction.mining = null;
    this.g.interaction.use = null;
    // Cerrar antes las pantallas: lo que había en la cuadrícula de fabricación vuelve al inventario
    // y se suelta con todo lo demás.
    this.g.screen.close();
    if (this.g.ui.isInventoryOpen()) this.g.toggleInventory();
    let xp = 0;
    if (!this.g.creative) {
      const items = this.g.inv.takeAll().filter((s) => this.g.enchant.keepsOnDeath(s)); // Fase 7: Maldición de desaparición
      const p = this.g.player;
      for (let i = 0; i < items.length; i += 16) {
        this.g.net?.send({ t: 'drop', items: items.slice(i, i + 16), p: [p.x, p.y + 0.5, p.z] });
      }
      // La experiencia se pierde: se suelta una parte en orbes (7 por nivel, como mucho 100).
      xp = deathXp(this.g.xp.level);
      this.g.xp.reset();
    }
    this.g.audio.playPlayerDeath();
    this.g.net?.send({ t: 'died', m: deathMessage(this.g.survival.deathCause) });
    this.showDeath();
    this.g.sendState(true);
    this.g.sendPos(true);
    // Después de la posición (ya muerto): el servidor sólo acepta 'dropxp' de jugadores muertos.
    const p = this.g.player;
    if (xp > 0) this.g.net?.send({ t: 'dropxp', n: xp, p: [p.x, p.y + 0.5, p.z] });
  }

  showDeath(): void {
    this.g.ui.showDeath(this.g.survival.deathCause ? `${this.g.cfg.name} ${deathMessage(this.g.survival.deathCause)}.` : 'Tu partida anterior terminó en muerte.');
    this.g.input.exitLock();
    this.g.input.releaseAll();
  }

  respawn(): void {
    this.g.survival.reset();
    const p = this.g.player;
    // Fase 8: donde no se puede reaparecer (el Nether), el servidor lleva al mundo normal (a la cama o al
    // punto de aparición); el cambio de mundo llega con su bienvenida. Fase 8.5: también si el punto de
    // reaparición es de otra dimensión (el nexo del Nether): lo resuelve el servidor.
    if (this.g.world && (!dimensionDef(this.g.world.dim).respawn || (this.bed && this.bedDim !== this.g.world.dim))) {
      this.g.ui.hideDeath();
      this.g.input.requestLock();
      this.g.sendState(true);
      this.g.net?.send({ t: 'respawn' });
      this.g.refreshHotbar(true);
      return;
    }
    let sp: [number, number, number] = [this.g.spawn[0], this.g.spawn[1] + 0.1, this.g.spawn[2]];
    if (this.bed) {
      // En la cama si sigue ahí (si su chunk aún no está cargado, se confía en ella).
      const b = this.g.world ? this.g.world.getBlock(this.bed[0], this.bed[1], this.bed[2]) : -1;
      if (b < 0 || isBed(b)) sp = [this.bed[0] + 0.5, this.bed[1] + 0.5625, this.bed[2] + 0.5];
      else {
        this.bed = null;
        this.g.ui.toast('No tenías cama o estaba obstruida');
      }
    }
    [p.x, p.y, p.z] = sp;
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    p.flying = false;
    if (this.g.world) p.unstuck(this.g.world);
    this.g.ui.hideDeath();
    this.g.input.requestLock();
    this.g.sendState(true);
    this.g.sendPos(true);
    this.g.refreshHotbar(true);
  }

  /** Fase 8.5: el servidor dice dónde reaparecer (sin cambiar de dimensión). */
  respawnAt(at: [number, number, number]): void {
    const p = this.g.player;
    [p.x, p.y, p.z] = at;
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    p.flying = false;
    if (this.g.world) p.unstuck(this.g.world);
    this.g.sendPos(true);
  }

  /**
   * Reglas de supervivencia de cada frame: daño por caída, agotamiento al correr, nadar y saltar,
   * vacío, asfixia dentro de bloques, lluvia, hambre y regeneración (Survival), y la muerte.
   */
  tickSurvival(dt: number, moved: number, wasGround: boolean, rain: number): void {
    const g = this.g;
    const p = g.player;
    const surv = g.survival;
    const cold = surv.dead ? 0 : this.freezing.update(g, dt); // Fase 6.5 (materiales)
    if (!g.creative && !surv.dead) {
      // Fase 7 (pociones): con Supersalto se aguanta un bloque más de caída por nivel.
      const safe = 3 + Math.max(0, g.statusEffects.jumpAmp + 1);
      if (p.landedFall > safe && !p.inWater) {
        // Caer sobre un fardo de heno quita el 80 % del daño y sobre una cama, la mitad.
        const under = g.world!.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
        const k = under === HAY_BALE ? 0.2 : isBed(under) ? 0.5 : 1;
        const dmg = Math.ceil((p.landedFall - safe) * k);
        if (dmg > 0 && surv.damage(dmg, 'fall') > 0) this.hurtFeedback(dmg);
      }
      if (p.sprinting) surv.addExhaustion(moved * 0.1);
      else if (p.inWater) surv.addExhaustion(moved * 0.01);
      if (wasGround && !p.onGround && p.vy > 5) surv.addExhaustion(p.sprinting ? 0.2 : 0.05);
      // Vacío y asfixia.
      if (p.y < VOID_Y) {
        this.voidTimer += dt;
        if (this.voidTimer >= 0.5) {
          this.voidTimer = 0;
          if (surv.damage(4, 'void', true) > 0) this.hurtFeedback(4);
        }
      }
      const headB = g.world!.getBlock(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
      if (headB > 0 && BLOCK_OPAQUE[headB] && BLOCK_SOLID[headB] && !p.flying) {
        this.suffocateTimer += dt;
        if (this.suffocateTimer >= 0.5) {
          this.suffocateTimer = 0;
          if (surv.damage(1, 'suffocate', true) > 0) this.hurtFeedback(1);
        }
      } else this.suffocateTimer = 0;
      const hpBefore = surv.health;
      const fx = g.statusEffects;
      equipmentSurvival(g); // Fase 6.5 (equipo): Resistencia y caparazón de tortuga
      fx.tick(dt, surv);
      const exposed = g.world!.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z)) >> 4 >= 15;
      const feet = g.world!.getBlock(Math.floor(p.x), Math.floor(p.y + 0.05), Math.floor(p.z));
      surv.update(dt, {
        eyeInWater: p.eyeInWater, eyeInBubble: p.eyeInBubble, inLava: p.inLava, inWater: p.inWater, inRain: rain > 0.2 && exposed, difficulty: g.difficulty,
        fireResistant: fx.fireResistant, waterBreathing: fx.waterBreathing,
        onCampfire: isCampfire(feet) && stateProps(feet)!.lit === 1,
        soulCampfire: familyBase(feet) === SOUL_CAMPFIRE, // Fase 8.5: la de almas quema el doble
        // Fase 8: el magma quema a quien lo pisa sin agacharse.
        onMagma: p.onGround && !p.sneaking && g.world!.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z)) === MAGMA_BLOCK,
        inFire: playerInFire(g), // Fase 6.5 (equipo)
      });
      // Fase 6.5 (océano y plantas): el arbusto de bayas dulces pincha al moverse dentro.
      if (isPricklyBush(feet) && Math.hypot(p.vx, p.vz) > 0.5) surv.damage(1, 'sweet_berry_bush');
      if (cold > 0) surv.damage(cold, 'freeze', true); // Fase 6.5 (materiales): congelado en la nieve polvo
      if (surv.health < hpBefore) this.hurtFeedback(hpBefore - surv.health);
      if (surv.dead) this.die();
    } else {
      // En creativo los efectos siguen corriendo (Velocidad, Visión nocturna…) pero no hacen daño.
      if (!surv.dead) g.statusEffects.tick(dt, CREATIVE_TARGET);
      if (g.creative && p.y < VOID_Y) {
        p.y = 200;
        p.vy = 0;
      }
    }
  }
}
