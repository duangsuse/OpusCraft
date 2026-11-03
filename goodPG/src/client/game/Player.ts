// Física del jugador: caminar, correr, agacharse (sin caer por los bordes), saltar, nadar (y bucear
// en postura horizontal corriendo bajo el agua), gatear por huecos de un bloque, volar, subir
// escalones bajos (losas, escaleras) y trepar por escaleras de mano.
import { BLOCK_SOLID, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_CLIMB, COBWEB, fluidHeight } from '../../shared/blocks';
import { isPricklyBush } from '../../shared/blocks'; // Fase 6.5 (océano y plantas)
import { isSoulGround } from '../../shared/blocks'; // Fase 8.3: Velocidad de alma
import { isBubbleColumn, bubbleColumnDown } from '../../shared/blocks'; // Fase 8.5
import { SOUL_SPEED_BASE, SOUL_SPEED_PER_LEVEL } from '../../shared/netherMobs';
import { moveBox, boxBlocked } from '../../shared/collide';
import { scaffoldClimb, scaffoldFloor } from '../../shared/scaffoldPhysics'; // Fase 6.5 (decoración)
import { // Fase 6.5 (materiales): hielo, slime y nieve polvo
  blockUnder, groundGrip, groundSpeed, slimeBounce, inPowderSnow, powderSnowFloor, POWDER_SINK_SPEED, POWDER_WALK_FACTOR,
  POWDER_CLIMB_SPEED,
} from '../../shared/materialPhysics';
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_SNEAK_EYE_HEIGHT, PLAYER_WIDTH } from '../../shared/constants';
import { SLOW_FALL_GRAVITY, SLOW_FALL_SPEED } from '../../shared/effects'; // Fase 7 (pociones)
import { DOLPHINS_GRACE_SWIM, levitate } from '../../shared/effects'; // Fase 7 (efectos)
import { // Fase 8.6: los élitros
  glideTick, rocketBoostTick, wallHitDamage, ELYTRA_WEAR_TICKS, GLIDE_GRAVITY, GLIDE_SLOW_FALL_GRAVITY, type Vel,
} from '../../shared/elytra';

export interface BlockSource {
  /** Id del bloque o -1 si la columna no está cargada. */
  getBlock(x: number, y: number, z: number): number;
}

export interface MoveControls {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  /** Fase 8.6: se acaba de pulsar saltar (abre los élitros en el aire). */
  jumpPressed?: boolean;
}

const GRAVITY = 32;
/** Altura del cuerpo tumbado (buceando o gateando) y de sus ojos. */
const PRONE_HEIGHT = 0.6;
const PRONE_EYE = 0.4;
/** Velocidad buceando (Minecraft: unos 5,6 bloques/s) y gateando. */
const SWIM_SPEED = 5.6;
const CRAWL_SPEED = 1.3;

export type Pose = 'stand' | 'swim' | 'crawl' | 'glide';
const JUMP_VELOCITY = 9.0;
const HW = PLAYER_WIDTH / 2;
const EPS = 1e-4;

export class Player {
  x = 0;
  y = 100;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  sneaking = false;
  sprinting = false;
  inWater = false;
  /** Fase 8.5: columna de burbujas en los pies (0 no, 1 sube, 2 baja), si es la superficie y si el ojo está en una. */
  bubble = 0;
  bubbleTop = false;
  eyeInBubble = false;
  eyeInWater = false;
  inLava = false;
  /** Dentro de una telaraña: se mueve muy despacio. */
  inWeb = false;
  /** Fase 6.5 (océano y plantas): dentro de un arbusto de bayas dulces (frena y pincha). */
  inBush = false;
  /** Fase 6.5 (materiales): dentro de la nieve polvo, y si lleva botas de cuero (camina por encima). */
  inPowder = false;
  leatherBoots = false;
  /** Fase 7 (encantamientos): Agilidad acuática (0..1: cuánto se anda en el agua como en tierra). */
  depthStrider = 0;
  /** Fase 7.5 (abismo): velocidad agachado o gateando respecto a la de andar (Sigilo rápido la sube). */
  sneakFactor = 0.3;
  /** Fase 8.3: nivel de Velocidad de alma de las botas (0 sin ella) y si lo último que pisó era arena o tierra de alma. */
  soulSpeed = 0;
  soulGround = false;
  /** Distancia horizontal recorrida en el suelo (para pasos y balanceo). */
  walkDistance = 0;
  /** 0..1: cuánto se está moviendo (para animaciones). */
  walkAmount = 0;
  /** Velocidad vertical en el último aterrizaje (negativa). */
  landedSpeed = 0;
  justLanded = false;
  justEnteredWater = false;
  /** Distancia de caída acumulada (para el daño por caída). */
  fallDistance = 0;
  /** Caída total al aterrizar en este frame (0 si no aterrizó). */
  landedFall = 0;
  /** Impulso externo (golpes, explosiones) que se disipa poco a poco. */
  kx = 0;
  kz = 0;
  /** Corriente del agua en la que está (unitaria o cero). */
  flowX = 0;
  flowZ = 0;
  /** Multiplicador de velocidad (tensar el arco, comer). */
  slow = 1;
  /** Usando un objeto (comer, tensar el arco, cubrirse con el escudo): no se puede correr. */
  usingItem = false;
  /** Agarrado a una escalera de mano. */
  onLadder = false;
  /** Chocó horizontalmente en el último movimiento. */
  hitWall = false;
  /** Postura: de pie, buceando (corriendo bajo el agua) o gateando (sin sitio para ponerse de pie). */
  pose: Pose = 'stand';
  /** Fase 7 (pociones): velocidad extra del salto (Supersalto) y Caída lenta; los pone el juego cada frame. */
  jumpBoost = 0;
  slowFall = false;
  /** Fase 7 (remate): cajas de las barcas cercanas (6 números por caja): sólidas, se puede estar encima. */
  entityBoxes: number[] = [];
  /** Fase 7 (efectos): nivel de Levitación (−1 sin ella) y Gracia del delfín; los pone el juego cada frame. */
  levitation = -1;
  dolphinsGrace = false;
  /** Fase 8.6: planeando con élitros; si los lleva puestos y con usos (lo pone el juego cada frame). */
  gliding = false;
  canGlide = false;
  /** Fase 8.6: ticks que le quedan a cada cohete pegado, usos gastados y daño por chocar de lado (los recoge el juego). */
  rockets: number[] = [];
  glideWear = 0;
  wallDamage = 0;
  private glideAcc = 0;
  /** Ticks planeando (fallFlyTicks). */
  glideTicks = 0;
  private readonly gv: Vel = { x: 0, y: 0, z: 0 };

  /** Altura del cuerpo según la postura. */
  get height(): number {
    return this.pose === 'stand' ? PLAYER_HEIGHT : PRONE_HEIGHT;
  }
  private eyeOffset = PLAYER_EYE_HEIGHT;

  get eyeY(): number {
    return this.y + this.eyeOffset;
  }

  private collides(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, world: BlockSource): boolean {
    return boxBlocked(world, minX, minY, minZ, maxX, maxY, maxZ);
  }

  /** ¿Toca alguna escalera de mano con el cuerpo? */
  private checkLadder(world: BlockSource): boolean {
    const x0 = Math.floor(this.x - HW - 0.02), x1 = Math.floor(this.x + HW + 0.02);
    const z0 = Math.floor(this.z - HW - 0.02), z1 = Math.floor(this.z + HW + 0.02);
    for (let y = Math.floor(this.y); y <= Math.floor(this.y + 1.2); y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const b = world.getBlock(x, y, z);
          if (b > 0 && BLOCK_CLIMB[b]) return true;
        }
      }
    }
    return false;
  }

  /** ¿Hay suelo bajo la caja si el jugador estuviera en (px, pz)? (Fase 7: también una barca). */
  private groundBelow(px: number, pz: number, world: BlockSource): boolean {
    return boxBlocked(world, px - HW, this.y - 0.6, pz - HW, px + HW, this.y - 0.01, pz + HW, this.entityBoxes);
  }

  /** Altura de la superficie de un fluido en la celda (1 si hay fluido encima). */
  private fluidTop(world: BlockSource, x: number, y: number, z: number, id: number): number {
    const up = world.getBlock(x, y + 1, z);
    return y + (up > 0 && BLOCK_FLUID[up] === BLOCK_FLUID[id] ? 1 : fluidHeight(id));
  }

  private checkFluids(world: BlockSource): void {
    const wasInWater = this.inWater;
    let water = false;
    let lava = false;
    let web = false;
    let bush = false;
    let fx = 0, fz = 0;
    const x0 = Math.floor(this.x - HW), x1 = Math.floor(this.x + HW - EPS);
    const z0 = Math.floor(this.z - HW), z1 = Math.floor(this.z + HW - EPS);
    const y0 = Math.floor(this.y + 0.1), y1 = Math.floor(this.y + 1.0);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const b = world.getBlock(x, y, z);
          if (b <= 0) continue;
          if (b === COBWEB) web = true;
          if (isPricklyBush(b)) bush = true;
          const f = BLOCK_FLUID[b];
          if (!f || this.y + 0.05 >= this.fluidTop(world, x, y, z, b)) continue;
          if (f === 1) water = true;
          else lava = true;
          if (f === 1) {
            const [ax, az] = this.flowAt(world, x, y, z, b);
            fx += ax;
            fz += az;
          }
        }
      }
    }
    this.inWater = water;
    this.inLava = lava;
    this.inWeb = web;
    this.inBush = bush;
    const fl = Math.hypot(fx, fz);
    this.flowX = fl > 0.01 ? fx / fl : 0;
    this.flowZ = fl > 0.01 ? fz / fl : 0;
    const ex = Math.floor(this.x), ey = Math.floor(this.eyeY), ez = Math.floor(this.z);
    const eb = world.getBlock(ex, ey, ez);
    this.eyeInWater = eb > 0 && BLOCK_FLUID[eb] === 1 && this.eyeY < this.fluidTop(world, ex, ey, ez, eb) - 0.02;
    // Fase 8.5: columna de burbujas en los pies (1 sube, 2 baja) y si es su superficie; dentro de una, se respira.
    const fb = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
    this.bubble = isBubbleColumn(fb) ? (bubbleColumnDown(fb) ? 2 : 1) : 0;
    this.bubbleTop = this.bubble > 0 && world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1) + 1, Math.floor(this.z)) === 0;
    this.eyeInBubble = isBubbleColumn(eb);
    this.justEnteredWater = water && !wasInWater && this.vy < -3;
  }

  /** Dirección de la corriente en una celda de agua (hacia los niveles más bajos y los bordes). */
  private flowAt(world: BlockSource, x: number, y: number, z: number, id: number): [number, number] {
    const lvl = BLOCK_FLUID_LEVEL[id];
    const depth = lvl >= 8 ? 0 : lvl;
    let fx = 0, fz = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = world.getBlock(x + dx, y, z + dz);
      if (n < 0) continue;
      if (BLOCK_FLUID[n] === 1) {
        const nl = BLOCK_FLUID_LEVEL[n];
        const d = (nl >= 8 ? 0 : nl) - depth;
        fx += dx * d;
        fz += dz * d;
      } else if (!BLOCK_SOLID[n]) {
        // Hacia un hueco: la corriente sale por el borde (sobre todo si cae).
        const below = world.getBlock(x + dx, y - 1, z + dz);
        const k = below > 0 && BLOCK_FLUID[below] === 1 ? 3 : lvl > 0 ? 1 : 0;
        fx += dx * k;
        fz += dz * k;
      }
    }
    return [fx, fz];
  }

  /** Empujón (golpe, explosión). */
  impulse(kx: number, ky: number, kz: number): void {
    this.kx += kx;
    this.kz += kz;
    if (ky > 0) {
      this.vy = Math.max(this.vy, ky);
      this.onGround = false;
    }
  }

  update(dt: number, c: MoveControls, world: BlockSource): void {
    dt = Math.min(dt, 0.05);
    this.checkFluids(world);
    this.inPowder = inPowderSnow(world, this.x, this.y, this.z, HW, this.height); // Fase 6.5 (materiales)
    this.onLadder = !this.flying && this.checkLadder(world);
    const wasGround = this.onGround;
    const fwd = (c.forward ? 1 : 0) - (c.back ? 1 : 0);
    const str = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * str;
    let wz = -cy * fwd - sy * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    // Fase 8.6: los élitros se abren al pulsar saltar en el aire (tryToStartFallFlying) y se cierran al tocar el suelo,
    // un líquido o una escalera de mano, con Levitación, volando en creativo o si ya no sirven.
    if (!this.gliding && c.jumpPressed && this.canGlide && !this.onGround && !this.flying && !this.inWater && !this.inLava && !this.onLadder &&
      this.levitation < 0) {
      this.gliding = true;
      this.glideAcc = 0;
      this.glideTicks = 0;
    } else if (this.gliding && (!this.canGlide || this.onGround || this.flying || this.inWater || this.inLava || this.onLadder || this.levitation >= 0)) {
      this.gliding = false;
    }
    if (!this.gliding) this.rockets.length = 0;

    this.sneaking = c.sneak && !this.flying && !this.gliding && this.pose === 'stand';
    if (fwd <= 0 || this.sneaking || this.usingItem) this.sprinting = false;
    else if (c.sprint) this.sprinting = true;
    this.updatePose(world);
    const targetEye = this.pose !== 'stand' ? PRONE_EYE : this.sneaking ? PLAYER_SNEAK_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
    this.eyeOffset += (targetEye - this.eyeOffset) * (1 - Math.exp(-dt * 14));
    // Tumbado, los ojos nunca por encima del cuerpo (no se ve a través del techo al entrar en un hueco).
    this.eyeOffset = Math.min(this.eyeOffset, this.height - 0.1);

    if (this.gliding) {
      // Fase 8.6: el planeo va a 20 pasos por segundo, en bloques por tick (como en Java).
      this.glideAcc += dt;
      const v = this.gv;
      v.x = this.vx / 20;
      v.y = this.vy / 20;
      v.z = this.vz / 20;
      while (this.glideAcc >= 0.05) {
        this.glideAcc -= 0.05;
        for (let i = this.rockets.length - 1; i >= 0; i--) {
          rocketBoostTick(v, this.yaw, this.pitch);
          if (--this.rockets[i] <= 0) this.rockets.splice(i, 1);
        }
        glideTick(v, this.yaw, this.pitch, this.slowFall && v.y <= 0 ? GLIDE_SLOW_FALL_GRAVITY : GLIDE_GRAVITY);
        // checkFallDistanceAccumulation: mientras no se baje deprisa, la caída se queda en 1.
        if (v.y > -0.5 && this.fallDistance > 1) this.fallDistance = 1;
        if (++this.glideTicks % ELYTRA_WEAR_TICKS === 0) this.glideWear++;
      }
      this.vx = v.x * 20;
      this.vy = v.y * 20;
      this.vz = v.z * 20;
    } else if (this.flying) {
      const speed = this.sprinting ? 21.6 : 10.9;
      const k = 1 - Math.exp(-dt * 8);
      this.vx += (wx * speed - this.vx) * k;
      this.vz += (wz * speed - this.vz) * k;
      const vyT = ((c.jump ? 1 : 0) - (c.sneak ? 1 : 0)) * (this.sprinting ? 12 : 8);
      this.vy += (vyT - this.vy) * (1 - Math.exp(-dt * 10));
    } else if (this.pose === 'swim') {
      // Buceando: se avanza hacia donde se mira, también hacia arriba o abajo.
      const cp = Math.cos(this.pitch);
      const k = 1 - Math.exp(-dt * 5);
      const s = SWIM_SPEED * this.slow * Math.max(0, fwd) * (this.dolphinsGrace ? DOLPHINS_GRACE_SWIM : 1); // Fase 7: delfín
      this.vx += ((-sy * cp) * s + cy * str * 2 - this.vx) * k;
      this.vz += ((-cy * cp) * s - sy * str * 2 - this.vz) * k;
      this.vy += (Math.sin(this.pitch) * s + (c.jump ? 2.5 : 0) - (c.sneak ? 2.5 : 0) - this.vy) * k;
    } else if (this.inWater || this.inLava) {
      // Fase 7 (encantamientos): con Agilidad acuática se anda casi como en tierra (la mitad si no se toca el fondo).
      const ds = this.inLava ? 0 : this.depthStrider * (this.onGround ? 1 : 0.5);
      const speed = (this.inLava ? 1.2 : (this.sprinting ? 3.6 : 2.4) * (1 - ds) + (this.sprinting ? 5.61 : 4.32) * ds) * this.slow *
        (this.dolphinsGrace && this.inWater ? DOLPHINS_GRACE_SWIM : 1); // Fase 7 (efectos): Gracia del delfín
      const k = 1 - Math.exp(-dt * 6);
      // La corriente arrastra (velocidad objetivo desplazada en su dirección).
      this.vx += (wx * speed + this.flowX * 2.2 - this.vx) * k;
      this.vz += (wz * speed + this.flowZ * 2.2 - this.vz) * k;
      this.vy -= (this.inLava ? 5 : 8) * dt;
      this.vy *= Math.exp(-dt * 2.2);
      if (c.jump) this.vy += 26 * dt;
      if (c.sneak) this.vy -= 14 * dt;
      if (!this.bubble) this.vy = Math.max(-4.5, Math.min(4.2, this.vy)); // Fase 8.5: la columna de burbujas manda
      // Salir del agua trepando a la orilla.
      if (c.jump && this.inWater && !this.eyeInWater && this.touchingWall(world)) this.vy = Math.max(this.vy, 5.5);
    } else {
      // Fase 6.5 (materiales): el hielo resbala y el slime frena.
      const under = this.onGround ? blockUnder(world, this.x, this.y, this.z) : 0;
      // Fase 7.5 (abismo): agachado y gateando, al 30 % de andar (más con Sigilo rápido).
      const slowWalk = 4.32 * this.sneakFactor;
      // Fase 8.3: con Velocidad de alma, sobre arena o tierra de alma (y en el aire tras pisarlas) no frena y corre más
      // (+0,0405 de velocidad, +0,0105 por nivel, sobre los 0,1 del jugador).
      if (this.onGround) this.soulGround = isSoulGround(under);
      const soul = this.soulSpeed > 0 && this.soulGround && !this.flying;
      const soulBoost = soul ? (0.1 + SOUL_SPEED_BASE + SOUL_SPEED_PER_LEVEL * (this.soulSpeed - 1)) / 0.1 : 1;
      const speed = (this.pose === 'crawl' ? Math.max(CRAWL_SPEED, slowWalk) : this.sneaking ? Math.max(1.31, slowWalk) : this.sprinting ? 5.61 : 4.32) * this.slow *
        (soul ? soulBoost : groundSpeed(under));
      const k = 1 - Math.exp(-dt * (this.onGround ? 16 * groundGrip(under) : 3.2));
      this.vx += (wx * speed - this.vx) * k;
      this.vz += (wz * speed - this.vz) * k;
      // Fase 7 (pociones): con Caída lenta se cae con poca gravedad y muy despacio.
      // Fase 7 (efectos): con Levitación no hay gravedad y se sube despacio (ni saltar ni escaleras).
      if (this.levitation >= 0) this.vy = levitate(this.vy, this.levitation, dt);
      else this.vy -= (this.slowFall && this.vy <= 0 ? SLOW_FALL_GRAVITY : GRAVITY) * dt;
      if (this.vy < -78) this.vy = -78;
      if (this.slowFall && this.vy < -SLOW_FALL_SPEED) this.vy = -SLOW_FALL_SPEED;
      if (this.levitation >= 0) this.fallDistance = 0;
      else if (this.onLadder) {
        // Escalera de mano: se baja despacio, se sube saltando o empujando contra ella y
        // agachado se queda quieto.
        this.fallDistance = 0;
        if (this.vy < -3) this.vy = -3;
        if (c.jump || (this.hitWall && (c.forward || c.back || c.left || c.right))) this.vy = 2.4;
        else if (c.sneak && this.vy < 0) this.vy = 0;
      } else if (c.jump && this.onGround) {
        this.vy = JUMP_VELOCITY + this.jumpBoost; // Fase 7 (pociones): Supersalto
        this.onGround = false;
        if (this.sprinting) {
          this.vx += -sy * 1.2;
          this.vz += -cy * 1.2;
        }
      }
    }

    // Fase 8.5: columnas de burbujas (onInsideBubbleColumn / onAboveBubbleColumn de Java, en bloques por tick).
    if (this.bubble && !this.flying) {
      const k = dt * 20, down = this.bubble === 2, v = this.vy / 20;
      const nv = this.bubbleTop
        ? (down ? Math.max(-0.9, v - 0.03 * k) : Math.min(1.8, v + 0.1 * k))
        : (down ? Math.max(-0.3, v - 0.03 * k) : Math.min(0.7, v + 0.06 * k));
      this.vy = nv * 20;
      this.fallDistance = 0;
    }

    // Fase 6.5 (decoración): dentro de un andamio se sube saltando y se baja agachado.
    const climb = this.flying ? null : scaffoldClimb(world, this.x, this.y, this.z, HW, this.height, c.jump, c.sneak);
    if (climb !== null) {
      this.vy = climb;
      this.fallDistance = 0;
    }

    // Impulso externo (se disipa en ~0.4 s).
    const kd = Math.exp(-dt * (this.onGround ? 7 : 2.5));
    this.kx *= kd;
    this.kz *= kd;
    if (Math.abs(this.kx) < 0.01) this.kx = 0;
    if (Math.abs(this.kz) < 0.01) this.kz = 0;
    let dx = (this.vx + this.kx) * dt;
    let dy = this.vy * dt;
    let dz = (this.vz + this.kz) * dt;
    // Telaraña: casi no se avanza y se cae muy despacio (como en Minecraft).
    if (this.inWeb && !this.flying) {
      dx *= 0.25;
      dz *= 0.25;
      dy *= 0.05;
      this.vy = Math.max(this.vy, -2);
      this.fallDistance = 0;
    }
    // Fase 6.5 (océano y plantas): el arbusto de bayas dulces frena (como en Minecraft).
    if (this.inBush && !this.inWeb && !this.flying) {
      dx *= 0.8;
      dz *= 0.8;
      dy *= 0.75;
    }
    // Fase 6.5 (materiales): en la nieve polvo se hunde despacio y casi no se avanza; con botas de
    // cuero se sube saltando y se baja agachado.
    if (this.inPowder && !this.flying) {
      this.fallDistance = 0;
      if (this.leatherBoots) {
        if (c.jump) this.vy = POWDER_CLIMB_SPEED;
        else if (this.vy < -POWDER_SINK_SPEED) this.vy = -POWDER_SINK_SPEED;
        dy = this.vy * dt;
      } else {
        dx *= POWDER_WALK_FACTOR;
        dz *= POWDER_WALK_FACTOR;
        if (this.vy < -POWDER_SINK_SPEED) this.vy = -POWDER_SINK_SPEED;
        dy = this.vy * dt * (this.vy > 0 ? 0.85 : 1);
      }
    }
    // Agachado: no caer por los bordes.
    if (this.sneaking && this.onGround && !this.inWater) {
      if (dx !== 0 && !this.groundBelow(this.x + dx, this.z, world)) { dx = 0; this.vx = 0; }
      if (dz !== 0 && !this.groundBelow(this.x, this.z + dz, world)) { dz = 0; this.vz = 0; }
      if (dx !== 0 && dz !== 0 && !this.groundBelow(this.x + dx, this.z + dz, world)) { dz = 0; this.vz = 0; }
    }
    const prevVy = this.vy;
    const prevHor = Math.hypot(this.vx, this.vz);
    const ox = this.x, oy = this.y, oz = this.z;
    // Colisión por cajas con subida automática de escalones de hasta 0,6 bloques.
    const r = moveBox(world, this.x, this.y, this.z, PLAYER_WIDTH, this.height, dx, dy, dz, this.flying ? 0 : 0.6, wasGround, this.entityBoxes);
    this.x += r.dx;
    this.y += r.dy;
    this.z += r.dz;
    if (r.hitX) {
      this.vx = 0;
      this.kx = 0;
    }
    if (r.hitZ) {
      this.vz = 0;
      this.kz = 0;
    }
    if (r.hitY) this.vy = 0;
    this.onGround = r.onGround;
    // Fase 6.5 (decoración): de pie encima de un andamio (agachado se baja por dentro).
    const floor = this.flying || c.sneak || r.dy >= 0 ? null : scaffoldFloor(world, this.x, this.z, HW, oy, this.y);
    if (floor !== null) {
      this.y = floor;
      this.vy = 0;
      this.onGround = true;
    }
    // Fase 6.5 (materiales): rebote en el bloque de slime (agachado no) y suelo de nieve polvo con botas de cuero.
    if (r.hitY && prevVy < 0 && !this.flying) {
      const bounce = slimeBounce(blockUnder(world, this.x, this.y, this.z), prevVy, c.sneak);
      if (bounce !== null) {
        this.vy = bounce;
        this.onGround = false;
        this.fallDistance = 0;
      }
    }
    const snowFloor = this.leatherBoots && !this.flying && !c.sneak && r.dy < 0 ? powderSnowFloor(world, this.x, this.z, HW, oy, this.y) : null;
    if (snowFloor !== null) {
      this.y = snowFloor;
      this.vy = 0;
      this.onGround = true;
    }
    this.hitWall = r.hitX || r.hitZ;
    // Fase 8.6 (handleFallFlyingCollisions): chocar de lado planeando hace daño según lo que se frena.
    if (this.gliding && this.hitWall) {
      const dmg = wallHitDamage(prevHor / 20, Math.hypot(this.vx, this.vz) / 20);
      if (dmg > 0) this.wallDamage = Math.max(this.wallDamage, dmg);
    }
    if (this.flying && this.onGround) this.flying = false;
    this.justLanded = this.onGround && !wasGround;
    this.landedSpeed = this.justLanded ? prevVy : 0;
    // Distancia de caída: se acumula al bajar y se consume al aterrizar (el agua la anula).
    this.landedFall = 0;
    if (this.flying || this.inWater || this.slowFall) this.fallDistance = 0; // Fase 7: la caída lenta no hace daño
    else if (this.y < oy) this.fallDistance += oy - this.y;
    if (this.onGround) {
      if (this.justLanded) this.landedFall = this.fallDistance;
      this.fallDistance = 0;
    }
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (this.onGround) this.walkDistance += moved;
    const target = this.onGround && moved > 0.001 ? Math.min(1, moved / dt / 4.3) : 0;
    this.walkAmount += (target - this.walkAmount) * (1 - Math.exp(-dt * 10));
  }

  /** ¿Cabe de pie donde está? */
  private roomToStand(world: BlockSource): boolean {
    return !this.collides(this.x - HW + EPS, this.y + EPS, this.z - HW + EPS, this.x + HW - EPS, this.y + PLAYER_HEIGHT, this.z + HW - EPS, world);
  }

  /**
   * Postura: se bucea corriendo con la cabeza bajo el agua y se sigue mientras se corra dentro del
   * agua; sin sitio para ponerse de pie se gatea (y se levanta en cuanto cabe).
   */
  private updatePose(world: BlockSource): void {
    const canStand = this.roomToStand(world);
    if (this.gliding) this.pose = 'glide'; // Fase 8.6: 0,6 de alto
    else if (this.pose === 'glide') this.pose = canStand ? 'stand' : 'crawl';
    else if (this.flying) this.pose = canStand ? 'stand' : 'crawl';
    else if (this.pose === 'swim') {
      if (!this.inWater || !this.sprinting) this.pose = canStand ? 'stand' : 'crawl';
    } else if (this.sprinting && this.eyeInWater) this.pose = 'swim';
    else if (this.pose === 'crawl') {
      if (canStand) this.pose = 'stand';
    } else if (!canStand) this.pose = 'crawl';
    // Buceando en un hueco de un bloque el sprint sigue: no se corta por agacharse.
    if (this.pose === 'crawl' && !this.inWater) this.sprinting = false;
  }

  private touchingWall(world: BlockSource): boolean {
    const y0 = this.y + 0.3, y1 = this.y + 0.9;
    return this.collides(this.x - HW - 0.05, y0, this.z - HW - 0.05, this.x + HW + 0.05, y1, this.z + HW + 0.05, world);
  }

  /** ¿La caja del jugador ocupa la celda (bx, by, bz)? */
  intersectsBlock(bx: number, by: number, bz: number): boolean {
    return (
      this.x + HW > bx && this.x - HW < bx + 1 &&
      this.y + this.height > by && this.y < by + 1 &&
      this.z + HW > bz && this.z - HW < bz + 1
    );
  }

  /** Sube al jugador hasta que no esté dentro de bloques sólidos. */
  unstuck(world: BlockSource): void {
    for (let i = 0; i < 256; i++) {
      if (!this.collides(this.x - HW, this.y, this.z - HW, this.x + HW, this.y + PLAYER_HEIGHT, this.z + HW, world)) return;
      this.y = Math.floor(this.y) + 1;
    }
  }
}
