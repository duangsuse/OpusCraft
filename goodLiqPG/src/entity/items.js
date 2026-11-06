// Dropped item, falling block, primed TNT and experience orb entities.
import { Entity } from './entity.js';
import { BLOCKS, TYPE_MASK, T_SOLID, T_REPLACEABLE, T_FLUID, ID } from '../world/blocks.js';
import { ITEMS } from '../game/items.js';
import { maxStack } from '../game/inventory.js';

export class ItemEntity extends Entity {
  constructor(world, x, y, z, stack, vel) {
    super(world, 0.25, 0.25);
    this.type = 'item';
    this.setPos(x, y, z);
    this.stack = { id: stack.id, count: stack.count, damage: stack.damage || 0 };
    this.vel = vel || [Math.random() * 0.2 - 0.1, 0.2, Math.random() * 0.2 - 0.1];
    this.pickupDelay = 10;
    this.bobOffs = Math.random() * Math.PI * 2;
    this.lifespan = 6000;
    this.stepHeight = 0;
  }
  tick(game) {
    this.prevPos = this.pos.slice();
    this.age++;
    if (this.pickupDelay > 0 && this.pickupDelay !== 32767) this.pickupDelay--;
    this.updateFluids();
    const eyeWater = this.inWater && this.waterHeight > 0.1;
    if (eyeWater) {
      // float up
      if (this.vel[1] < 0.06) this.vel[1] += 5e-4;
      this.vel[0] *= 0.99; this.vel[2] *= 0.99;
    } else if (this.inLava) { this.vel[1] += 0.0005; }
    else this.vel[1] -= 0.04;
    // push out of solid blocks
    const v = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.125), Math.floor(this.pos[2]));
    if (T_SOLID[v & TYPE_MASK] && BLOCKS[v & TYPE_MASK].model === 'cube') { this.vel[1] = 0.1; this.noPhysicsTicks = 2; }
    if (this.noPhysicsTicks > 0) { this.noPhysicsTicks--; this.pos[1] += this.vel[1]; }
    else if (!this.onGround || Math.hypot(this.vel[0], this.vel[2]) > 1e-5 || (this.age + this.id) % 4 === 0) this.move(this.vel[0], this.vel[1], this.vel[2]);
    let f = 0.98;
    if (this.onGround) f = BLOCKS[this.blockBelow() & TYPE_MASK].friction * 0.98;
    this.vel[0] *= f; this.vel[1] *= 0.98; this.vel[2] *= f;
    if (this.onGround && this.vel[1] < 0) this.vel[1] *= -0.5;
    if (this.inLava && this.age > 2) { this.dead = true; game.audio?.play('random.fizz', { x: this.pos[0], y: this.pos[1], z: this.pos[2], volume: 0.4 }); }
    // merge
    if (this.age % 20 === 0 && this.stack.count < maxStack(this.stack)) {
      for (const e of game.entities) {
        if (e === this || e.type !== 'item' || e.dead || e.stack.id !== this.stack.id || ITEMS[e.stack.id]?.durability) continue;
        if (Math.abs(e.pos[0] - this.pos[0]) > 0.5 || Math.abs(e.pos[1] - this.pos[1]) > 0.5 || Math.abs(e.pos[2] - this.pos[2]) > 0.5) continue;
        const room = maxStack(this.stack) - this.stack.count;
        const n = Math.min(room, e.stack.count);
        if (n <= 0) continue;
        this.stack.count += n; e.stack.count -= n;
        this.pickupDelay = Math.max(this.pickupDelay, e.pickupDelay);
        this.age = Math.min(this.age, e.age);
        if (e.stack.count <= 0) e.dead = true;
      }
    }
    if (this.age >= this.lifespan || this.pos[1] < -128) this.dead = true;
    // pickup
    const p = game.player;
    if (!this.dead && this.pickupDelay === 0 && p.health > 0 && p.gamemode !== 'spectator') {
      const b = p.aabb();
      if (this.pos[0] > b[0] - 1 && this.pos[0] < b[3] + 1 && this.pos[1] + 0.25 > b[1] - 0.5 && this.pos[1] < b[4] + 0.5 && this.pos[2] > b[2] - 1 && this.pos[2] < b[5] + 1) {
        const before = this.stack.count;
        const left = game.inventory.addItem(this.stack);
        if (left < before) {
          game.audio?.play('random.pop', { x: this.pos[0], y: this.pos[1], z: this.pos[2], volume: 0.2, pitch: ((Math.random() - Math.random()) * 0.7 + 1) * 2 });
          game.particles?.pickup(this, p);
          this.stack.count = left;
          if (left <= 0) this.dead = true;
        }
      }
    }
  }
}

export class FallingBlock extends Entity {
  constructor(world, x, y, z, v) {
    super(world, 0.98, 0.98);
    this.type = 'falling_block';
    this.setPos(x + 0.5, y, z + 0.5);
    this.block = v;
    this.time = 0;
    this.stepHeight = 0;
  }
  tick(game) {
    this.prevPos = this.pos.slice();
    this.time++;
    this.vel[1] -= 0.04;
    this.move(this.vel[0], this.vel[1], this.vel[2]);
    this.vel[0] *= 0.98; this.vel[1] *= 0.98; this.vel[2] *= 0.98;
    const bx = Math.floor(this.pos[0]), by = Math.floor(this.pos[1] + 0.01), bz = Math.floor(this.pos[2]);
    if (this.onGround) {
      const cur = this.world.getBlock(bx, by, bz) & TYPE_MASK;
      this.dead = true;
      if (cur === 0 || T_REPLACEABLE[cur] || T_FLUID[cur]) {
        if (cur && !T_FLUID[cur]) game.breakBlockNaturally(bx, by, bz, this.world.getBlock(bx, by, bz), true);
        this.world.setBlock(bx, by, bz, this.block);
        game.audio?.play('step.' + (BLOCKS[this.block & TYPE_MASK].sound), { x: bx + 0.5, y: by + 0.5, z: bz + 0.5 });
      } else game.dropItem(this.pos[0], this.pos[1] + 0.5, this.pos[2], { id: this.block & TYPE_MASK, count: 1 });
    } else if (this.time > 600 || this.pos[1] < -128) this.dead = true;
  }
}

export class PrimedTnt extends Entity {
  constructor(world, x, y, z, fuse = 80) {
    super(world, 0.98, 0.98);
    this.type = 'tnt';
    this.setPos(x + 0.5, y, z + 0.5);
    const a = Math.random() * Math.PI * 2;
    this.vel = [-Math.sin(a) * 0.02, 0.2, -Math.cos(a) * 0.02];
    this.fuse = fuse;
    this.stepHeight = 0;
  }
  tick(game) {
    this.prevPos = this.pos.slice();
    this.vel[1] -= 0.04;
    this.move(this.vel[0], this.vel[1], this.vel[2]);
    this.vel = this.vel.map(v => v * 0.98);
    if (this.onGround) { this.vel[0] *= 0.7; this.vel[2] *= 0.7; this.vel[1] *= -0.5; }
    if (--this.fuse <= 0) { this.dead = true; game.explode(this.pos[0], this.pos[1] + 0.0625, this.pos[2], 4); }
    else game.particles?.spawn('smoke', this.pos[0], this.pos[1] + 0.5, this.pos[2], 0, 0, 0);
  }
}

export class XpOrb extends Entity {
  constructor(world, x, y, z, value) {
    super(world, 0.5, 0.5);
    this.type = 'xp';
    this.setPos(x, y, z);
    this.value = value;
    this.vel = [(Math.random() * 0.2 - 0.1) * 2, Math.random() * 0.2 * 2, (Math.random() * 0.2 - 0.1) * 2];
    this.stepHeight = 0;
  }
  tick(game) {
    this.prevPos = this.pos.slice();
    this.age++;
    this.vel[1] -= 0.03;
    const p = game.player;
    const d = [p.pos[0] - this.pos[0], p.pos[1] + p.eyeH / 2 - this.pos[1], p.pos[2] - this.pos[2]];
    const l = Math.hypot(...d);
    if (l < 8) { const f = 1 - l / 8; for (let i = 0; i < 3; i++) this.vel[i] += d[i] / l * f * f * 0.1; }
    this.move(this.vel[0], this.vel[1], this.vel[2]);
    const fr = this.onGround ? 0.6 * 0.98 : 0.98;
    this.vel[0] *= fr; this.vel[1] *= 0.98; this.vel[2] *= fr;
    if (l < 1.2 && p.health > 0 && this.age > 2) { this.dead = true; game.addXp(this.value); }
    if (this.age > 6000) this.dead = true;
  }
}
void ID;
