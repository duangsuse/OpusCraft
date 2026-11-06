// Local player: port of LocalPlayer.aiStep / LivingEntity.travel / Player.travel movement physics (20 TPS).
import { Entity } from './entity.js';
import { BLOCKS, TYPE_MASK, T_FLUID, ID } from '../world/blocks.js';

const deg = Math.PI / 180;

export class Player extends Entity {
  constructor(world) {
    super(world, 0.6, 1.8);
    this.isPlayer = true;
    this.gamemode = 'survival';
    this.flying = false;
    this.mayFly = false;
    this.flyingSpeed = 0.5;
    this.walkSpeed = 0.1;
    this.sprinting = false;
    this.sneaking = false;
    this.swimming = false;
    this.jumping = false;
    this.noJumpDelay = 0;
    this.sprintToggleTimer = 0;
    this.jumpTriggerTime = 0;
    this.health = 20; this.maxHealth = 20;
    this.food = 20; this.saturation = 5; this.exhaustion = 0; this.foodTimer = 0;
    this.air = 300;
    this.xp = 0; this.xpLevel = 0; this.xpProgress = 0;
    this.hurtTime = 0; this.invulnerable = 0; this.deathTime = 0;
    this.lastHurt = 0;
    this.bob = 0; this.oBob = 0;
    this.eyeH = 1.62; this.prevEyeH = 1.62;
    this.fovMod = 1; this.prevFovMod = 1;
    this.input = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
    this.prevForwardKey = false;
    this.wasInWater = false;
    this.events = [];      // sounds/effects for the game to consume
    this.vehicle = null;
    this.portalTime = 0;
    this.fireTicks = 0;
  }

  get creative() { return this.gamemode === 'creative' || this.gamemode === 'spectator'; }
  setGamemode(m) {
    this.gamemode = m;
    this.mayFly = m === 'creative' || m === 'spectator';
    if (!this.mayFly) this.flying = false;
    if (m === 'spectator') { this.flying = true; this.noPhysics = true; } else this.noPhysics = false;
  }
  eyeHeight() { return this.eyeH; }
  targetEyeHeight() { return this.swimming ? 0.4 : this.sneaking && !this.flying ? 1.27 : 1.62; }

  // Called once per tick with sampled input
  tick() {
    this.prevPos = this.pos.slice();
    this.prevYaw = this.yaw; this.prevPitch = this.pitch;
    this.prevWalkDist = this.walkDist;
    this.oBob = this.bob;
    this.prevEyeH = this.eyeH;
    this.prevFovMod = this.fovMod;
    this.age++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invulnerable > 0) this.invulnerable--;
    if (this.health <= 0) { this.deathTime++; return; }

    if (this.vehicle) { this.ridingTick(); return; }

    const inp = this.input;
    // ---- LocalPlayer.aiStep ----
    if (this.sprintToggleTimer > 0) this.sprintToggleTimer--;
    const wasSneaking = this.sneaking;
    this.sneaking = inp.sneak && !this.flying && !this.swimming;
    let forward = inp.forward, strafe = inp.strafe;
    if (this.sneaking || this.swimming && false) { forward *= 0.3; strafe *= 0.3; }
    if (this.usingItem) { forward *= 0.2; strafe *= 0.2; this.sprinting = false; }
    // sprint
    const canSprint = this.food > 6 || this.mayFly;
    const fwdKey = inp.forward > 0;
    if ((this.onGround || this.inWater) && !wasSneaking && fwdKey && !this.prevForwardKey && !this.sprinting && canSprint && !this.usingItem) {
      if (this.sprintToggleTimer > 0) this.sprinting = true; else this.sprintToggleTimer = 7;
    }
    this.prevForwardKey = fwdKey;
    if (!this.sprinting && inp.forward >= 0.8 && canSprint && !this.usingItem && inp.sprint && !this.sneaking) this.sprinting = true;
    if (this.sprinting && (inp.forward < 0.8 || this.horizontalCollision && !this.inWater || !canSprint || this.sneaking && !this.inWater)) this.sprinting = false;
    // swimming
    const eyeFluid = this.eyeFluid();
    if (this.swimming) { if (!this.sprinting || !this.inWater) this.swimming = false; }
    else if (this.sprinting && eyeFluid === 1 && this.inWater) this.swimming = true;
    // flying toggle (double-tap space)
    if (inp.jumpPressed && this.mayFly) {
      if (this.jumpTriggerTime === 0) this.jumpTriggerTime = 7;
      else { this.flying = !this.flying; this.jumpTriggerTime = 0; if (this.gamemode === 'spectator') this.flying = true; }
    }
    if (this.jumpTriggerTime > 0) this.jumpTriggerTime--;
    if (this.flying && this.onGround && !this.noPhysics && this.gamemode !== 'spectator') this.flying = false;
    if (this.flying) {
      let dy = 0;
      if (inp.sneak) dy -= this.flyingSpeed * 3;
      if (inp.jump) dy += this.flyingSpeed * 3;
      this.vel[1] += dy;
    }
    this.jumping = inp.jump;

    // ---- LivingEntity.aiStep ----
    if (this.noJumpDelay > 0) this.noJumpDelay--;
    for (let i = 0; i < 3; i++) if (Math.abs(this.vel[i]) < 0.003) this.vel[i] = 0;
    this.updateFluids();
    if (this.jumping && !this.flying) {
      const fluidH = this.inLava ? this.lavaHeight : this.waterHeight;
      const onGroundInFluid = this.onGround && fluidH <= 0.4;
      if ((this.inWater || this.inLava) && !onGroundInFluid) this.vel[1] += 0.04;
      else if (this.onGround && this.noJumpDelay === 0) { this.jumpFromGround(); this.noJumpDelay = 10; }
    } else this.noJumpDelay = 0;
    const xxa = strafe * 0.98, zza = forward * 0.98;
    this.travel(xxa, zza);

    // ---- Player.aiStep extras ----
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    const f = this.onGround && this.health > 0 && !this.swimming ? Math.min(0.1, hs) : 0;
    this.bob += (f - this.bob) * 0.4;
    // camera eye height smoothing (Camera.tick)
    this.eyeH += (this.targetEyeHeight() - this.eyeH) * 0.5;
    // FOV modifier (AbstractClientPlayer.getFieldOfViewModifier)
    let fm = 1;
    if (this.flying) fm *= 1.1;
    const speed = this.walkSpeed * (this.sprinting ? 1.3 : 1);
    fm *= (speed / this.walkSpeed + 1) / 2;
    if (this.walkSpeed === 0 || isNaN(fm)) fm = 1;
    this.fovMod += (fm - this.fovMod) * 0.5;
    // step sounds
    if (this.moveDist > this.nextStep && this.onGround && !this.sneaking) {
      this.nextStep = this.moveDist + 1;
      const below = this.blockBelow();
      if (below) this.events.push({ type: 'step', block: below });
    } else if (this.moveDist > this.nextStep && this.isClimbing()) { this.nextStep = this.moveDist + 1; this.events.push({ type: 'step', block: ID.ladder }); }
    if (this.inWater && !this.wasInWater && this.age > 20) this.events.push({ type: 'splash', speed: -this.vel[1] });
    if (this.inWater && hs > 0.05 && this.moveDist > this.nextStep) { this.nextStep = this.moveDist + 1; this.events.push({ type: 'swim' }); }
    this.wasInWater = this.inWater;
    // exhaustion
    if (!this.creative) {
      const d = Math.hypot(this.pos[0] - this.prevPos[0], this.pos[2] - this.prevPos[2]);
      if (this.swimming || eyeFluid === 1 && this.inWater) this.exhaustion += 0.01 * d;
      else if (this.sprinting) this.exhaustion += 0.1 * d;
    }
  }

  jumpFromGround() {
    let jp = 0.42;
    const below = this.blockBelow() & TYPE_MASK;
    if (below === ID.honey_block) jp *= 0.5;
    this.vel[1] = jp;
    if (this.sprinting) {
      const r = this.yaw * deg;
      this.vel[0] += -Math.sin(r) * 0.2;
      this.vel[2] += Math.cos(r) * 0.2;
    }
    if (!this.creative) this.exhaustion += this.sprinting ? 0.2 : 0.05;
    this.events.push({ type: 'jump' });
  }

  moveRelative(speed, xxa, zza) {
    let l = xxa * xxa + zza * zza;
    if (l < 1e-7) return;
    let x = xxa, z = zza;
    if (l > 1) { l = Math.sqrt(l); x /= l; z /= l; }
    x *= speed; z *= speed;
    const r = this.yaw * deg, s = Math.sin(r), c = Math.cos(r);
    this.vel[0] += x * c - z * s;
    this.vel[2] += z * c + x * s;
  }

  travel(xxa, zza) {
    if (this.flying) {
      const vy = this.vel[1];
      this.travelInner(xxa, zza);
      this.vel[1] = vy * 0.6;
      this.fallDistance = 0;
      return;
    }
    if (this.swimming) {
      const look = -Math.sin(this.pitch * deg);
      const d4 = look < -0.2 ? 0.085 : 0.06;
      const above = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.9), Math.floor(this.pos[2]));
      if (look <= 0 || this.jumping || T_FLUID[above & TYPE_MASK]) this.vel[1] += (look - this.vel[1]) * d4;
    }
    this.travelInner(xxa, zza);
  }

  travelInner(xxa, zza) {
    const grav = 0.08;
    if (this.inWater && !this.flying) {
      const y0 = this.pos[1];
      let f4 = this.sprinting ? 0.9 : 0.8;
      let f5 = 0.02;
      this.moveRelative(f5, xxa, zza);
      this.move(this.vel[0], this.vel[1], this.vel[2]);
      if (this.horizontalCollision && this.isClimbing()) this.vel[1] = 0.2;
      this.vel[0] *= f4; this.vel[1] *= 0.8; this.vel[2] *= f4;
      // getFluidFallingAdjustedMovement
      if (!this.sprinting || !this.swimming) {
        const falling = this.vel[1] <= 0;
        if (falling && Math.abs(this.vel[1] - 0.005) >= 0.003 && Math.abs(this.vel[1] - grav / 16) < 0.003) this.vel[1] = -0.003;
        else this.vel[1] -= grav / 16;
      }
      if (this.horizontalCollision && this.isFree(this.vel[0], this.vel[1] + 0.6 - this.pos[1] + y0, this.vel[2])) this.vel[1] = 0.3;
      return;
    }
    if (this.inLava && !this.flying) {
      const y0 = this.pos[1];
      this.moveRelative(0.02, xxa, zza);
      this.move(this.vel[0], this.vel[1], this.vel[2]);
      this.vel[0] *= 0.5; this.vel[1] *= 0.5; this.vel[2] *= 0.5;
      this.vel[1] -= grav / 4;
      if (this.horizontalCollision && this.isFree(this.vel[0], this.vel[1] + 0.6 - this.pos[1] + y0, this.vel[2])) this.vel[1] = 0.3;
      return;
    }
    const belowV = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.5000001), Math.floor(this.pos[2]));
    const blockFriction = BLOCKS[belowV & TYPE_MASK].friction;
    const f3 = this.onGround ? blockFriction * 0.91 : 0.91;
    const speedAttr = this.walkSpeed * (this.sprinting ? 1.3 : 1);
    const flySpeed = this.flying ? this.flyingSpeed * (this.sprinting ? 2 : 1) : (this.sprinting ? 0.026 : 0.02);
    const speed = this.onGround ? speedAttr * (0.21600002 / (blockFriction * blockFriction * blockFriction)) : flySpeed;
    this.moveRelative(speed, xxa, zza);
    // climbing
    const climbing = this.isClimbing() && !this.flying;
    if (climbing) {
      this.fallDistance = 0;
      this.vel[0] = Math.max(-0.15, Math.min(0.15, this.vel[0]));
      this.vel[2] = Math.max(-0.15, Math.min(0.15, this.vel[2]));
      this.vel[1] = Math.max(this.vel[1], -0.15);
      if (this.vel[1] < 0 && this.sneaking) this.vel[1] = 0;
    }
    this.move(this.vel[0], this.vel[1], this.vel[2], this.sneaking);
    if ((this.horizontalCollision || this.jumping) && climbing) this.vel[1] = 0.2;
    let vy = this.vel[1];
    vy -= grav;
    this.vel[0] *= f3; this.vel[1] = vy * 0.98; this.vel[2] *= f3;
    // block speed factor (soul sand)
    const sf = BLOCKS[this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2])) & TYPE_MASK].speedFactor;
    const sfb = BLOCKS[belowV & TYPE_MASK].speedFactor;
    const factor = sf !== 1 ? sf : sfb;
    if (factor !== 1 && !this.flying) { this.vel[0] *= factor; this.vel[2] *= factor; }
  }

  isFree(dx, dy, dz) {
    const b = this.aabb();
    const boxes = this.world.getCollisions(b[0] + dx, b[1] + dy, b[2] + dz, b[3] + dx, b[4] + dy, b[5] + dz, []);
    return boxes.length === 0 && !this.world.getBlock(Math.floor(this.pos[0] + dx), Math.floor(this.pos[1] + dy), Math.floor(this.pos[2] + dz)) !== undefined;
  }

  onLand(dist) {
    if (this.creative || this.flying) return;
    const below = this.blockBelow() & TYPE_MASK;
    let dmg = Math.ceil(dist - 3);
    if (below === ID.hay_block) dmg = Math.ceil((dist - 3) * 0.2);
    if (dmg > 0) {
      this.damage(dmg, 'fall');
      this.events.push({ type: 'fall', big: dmg > 4 });
    }
  }

  damage(amount, source) {
    if (this.creative && source !== 'void' && source !== 'kill') return false;
    if (this.health <= 0) return false;
    if (this.invulnerable > 10 && source !== 'void' && source !== 'starve') {
      if (amount <= this.lastHurt) return false;
      const extra = amount - this.lastHurt; this.lastHurt = amount; amount = extra;
    } else { this.lastHurt = amount; this.invulnerable = 20; this.hurtTime = 10; }
    // armor reduction
    if (this.armorValue && source !== 'fall' && source !== 'drown' && source !== 'starve' && source !== 'void' && source !== 'fire') {
      const a = this.armorValue;
      amount = amount * (1 - Math.min(20, Math.max(a / 5, a - amount / 2)) / 25);
    }
    this.health = Math.max(0, this.health - amount);
    this.exhaustion += 0.1;
    this.events.push({ type: 'hurt', source });
    if (this.health <= 0) this.events.push({ type: 'death', source });
    return true;
  }

  // food & regen (FoodData.tick)
  foodTick(difficulty = 2) {
    if (this.creative) return;
    if (this.exhaustion > 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (difficulty > 0) this.food = Math.max(0, this.food - 1);
    }
    if (this.saturation > 0 && this.health < this.maxHealth && this.food >= 20) {
      if (++this.foodTimer >= 10) { const f = Math.min(this.saturation, 6); this.heal(f / 6); this.exhaustion += f; this.foodTimer = 0; }
    } else if (this.food >= 18 && this.health < this.maxHealth) {
      if (++this.foodTimer >= 80) { this.heal(1); this.exhaustion += 6; this.foodTimer = 0; }
    } else if (this.food <= 0) {
      if (++this.foodTimer >= 80) { if (this.health > 10 || difficulty >= 3 || this.health > 1 && difficulty >= 2) this.damage(1, 'starve'); this.foodTimer = 0; }
    } else this.foodTimer = 0;
  }
  heal(a) { this.health = Math.min(this.maxHealth, this.health + a); }
  eat(food, sat) { this.food = Math.min(20, this.food + food); this.saturation = Math.min(this.food, this.saturation + food * sat * 2); }

  ridingTick() {
    // position is driven by the vehicle
    const v = this.vehicle;
    const p = v.riderPos();
    this.pos = p;
    this.fallDistance = 0;
    this.sneaking = false;
    this.eyeH += (1.62 - this.eyeH) * 0.5;
    this.bob += (0 - this.bob) * 0.4;
    this.fovMod += (1 - this.fovMod) * 0.5;
    this.updateFluids();
  }
}
