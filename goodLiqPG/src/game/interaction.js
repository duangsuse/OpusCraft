// Player interaction (MultiPlayerGameMode / Minecraft.handleKeybinds equivalents) + world events.
import { BLOCKS, ID, TYPE_MASK, META_SHIFT, mk, T_SOLID, T_OPAQUE, T_FLUID, T_REPLACEABLE, collisionBoxes, FACE_DIR, WOODS } from '../world/blocks.js';
import { ITEMS, IID, blockDrops, destroyProgress, itemDef } from './items.js';
import { ItemEntity, FallingBlock, PrimedTnt, XpOrb } from '../entity/items.js';
import { rayBox } from '../world/world.js';
import { MIN_Y } from '../world/constants.js';

const FACING_FROM_YAW = (yaw) => { const r = ((Math.round(yaw / 90) % 4) + 4) % 4; return [1, 2, 0, 3][r]; }; // yaw 0 = +z (south)
// horizontal facing index (0 N,1 S,2 W,3 E) the player looks toward
export function lookFacing(yaw) { return FACING_FROM_YAW(yaw); }
const OPP = [1, 0, 3, 2];

export const InteractionMixin = {
  reach() { return this.player.creative ? 5 : 4.5; },

  updateTarget() {
    const c = this.camera, p = this.player;
    const eye = [p.pos[0], p.pos[1] + p.eyeH, p.pos[2]];
    const d = lookVec(p.yaw, p.pitch);
    const reach = this.reach();
    const hit = this.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], reach);
    // entities
    let ent = null, entDist = hit ? hit.dist : reach;
    for (const e of this.entities) {
      if (e.dead || !e.attackable && !e.rideable) continue;
      const b = e.aabb();
      const g = e.pickRadius ?? 0.1;
      const r = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], b[0] - g, b[1] - g, b[2] - g, b[3] + g, b[4] + g, b[5] + g);
      if (r && r.t < entDist && r.t <= (p.creative ? 5 : 3)) { ent = e; entDist = r.t; }
    }
    this.target = ent ? { entity: ent, dist: entDist } : hit;
    void c;
  },

  // ---- per-tick input handling ----
  interactionTick() {
    const p = this.player, inp = this.input;
    if (this.destroyDelay > 0) this.destroyDelay--;
    if (this.rightClickDelay > 0) this.rightClickDelay--;
    this.attackStrengthTicker = (this.attackStrengthTicker || 0) + 1;
    if (this.swingTime !== undefined && this.swinging) { this.swingTime++; if (this.swingTime >= 6) { this.swingTime = 0; this.swinging = false; } }
    this.oSwing = this.swingAttack || 0;
    this.swingAttack = this.swinging ? this.swingTime / 6 : 0;
    if (p.health <= 0 || this.screenOpen) { this.stopDestroy(); this.stopUsing(); return; }
    this.updateTarget();
    const leftDown = inp.button(0) && inp.locked;
    const rightDown = inp.button(2) && inp.locked;
    if (inp.consumeMouse(0)) this.startAttack();
    if (inp.consumeMouse(1)) this.pickBlock();
    if (inp.consumeMouse(2)) { this.useStartTick = true; this.startUseItem(); }
    else if (rightDown && this.rightClickDelay === 0 && !this.using) this.startUseItem();
    if (this.using) {
      if (!rightDown) this.stopUsing(); else this.tickUsing();
    }
    if (leftDown && !this.using) this.continueAttack(); else this.stopDestroy();
  },

  swing() {
    if (!this.swinging || this.swingTime >= 3 || this.swingTime < 0) { this.swingTime = -1; this.swinging = true; }
  },
  swingProgress(pt) {
    if (!this.swinging && !this.oSwing) return 0;
    let f = (this.swingAttack || 0) - (this.oSwing || 0);
    if (f < 0) f += 1;
    return (this.oSwing || 0) + f * pt;
  },
  attackStrength(pt) {
    const it = this.inventory.heldDef();
    const speed = it && it.attackSpeed ? it.attackSpeed : 4;
    const delay = 20 / speed;
    return Math.min(1, ((this.attackStrengthTicker || 0) + pt) / delay);
  },

  startAttack() {
    const t = this.target;
    if (!t) { this.swing(); this.attackStrengthTicker = 0; return; }
    if (t.entity) { this.attackEntity(t.entity); this.swing(); return; }
    if (this.player.creative) { if (this.destroyDelay <= 0) { this.destroyBlockByPlayer(t.x, t.y, t.z); this.destroyDelay = 5; } this.swing(); return; }
    this.destroying = { x: t.x, y: t.y, z: t.z, progress: 0, ticks: 0 };
    const v = this.world.getBlock(t.x, t.y, t.z);
    const prog = destroyProgress(this.player, this.inventory.heldDef(), BLOCKS[v & TYPE_MASK]);
    if (prog >= 1) { this.destroyBlockByPlayer(t.x, t.y, t.z); this.destroying = null; this.destroyDelay = 5; }
    this.swing();
  },

  continueAttack() {
    const t = this.target;
    this.swing();
    if (!t || t.entity) { this.stopDestroy(); return; }
    if (this.player.creative) {
      if (this.destroyDelay <= 0) { this.destroyBlockByPlayer(t.x, t.y, t.z); this.destroyDelay = 5; }
      return;
    }
    if (this.destroyDelay > 0) return;
    const d = this.destroying;
    if (!d || d.x !== t.x || d.y !== t.y || d.z !== t.z) { this.destroying = { x: t.x, y: t.y, z: t.z, progress: 0, ticks: 0 }; return; }
    const v = this.world.getBlock(t.x, t.y, t.z);
    const b = BLOCKS[v & TYPE_MASK];
    if (v === 0) { this.destroying = null; return; }
    d.progress += destroyProgress(this.player, this.inventory.heldDef(), b);
    if (d.ticks % 4 === 0) {
      this.audio?.play('hit.' + soundOf(b), { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 });
    }
    d.ticks++;
    this.particles?.crack(t.x, t.y, t.z, t.face, v);
    if (d.progress >= 1) {
      this.destroyBlockByPlayer(t.x, t.y, t.z);
      this.destroying = null;
      this.destroyDelay = 5;
    }
  },
  stopDestroy() { this.destroying = null; },
  breakStage() { const d = this.destroying; return d && d.progress > 0 ? Math.min(9, Math.floor(d.progress * 10)) : -1; },

  destroyBlockByPlayer(x, y, z) {
    const w = this.world, p = this.player;
    const v = w.getBlock(x, y, z);
    const t = v & TYPE_MASK, b = BLOCKS[t];
    if (t === 0 || (b.hardness < 0 && !p.creative)) return false;
    const held = this.inventory.held();
    const heldDef = held ? ITEMS[held.id] : null;
    if (p.creative && heldDef && heldDef.tool && heldDef.tool.type === 'sword') return false;
    this.particles?.destroy(x, y, z, v);
    this.audio?.play('dig.' + soundOf(b), { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    // two-block structures
    const m = v >>> META_SHIFT;
    if (b.model === 'door' || b.model === 'double_plant') {
      const oy = (b.model === 'door' ? (m & 8) : (m & 1)) ? -1 : 1;
      if ((w.getBlock(x, y + oy, z) & TYPE_MASK) === t) w.setBlock(x, y + oy, z, b.waterlogged ? ID.water : 0);
    }
    const replacement = (b.waterlogged || (t === ID.ice && T_SOLID[w.getBlock(x, y - 1, z) & TYPE_MASK])) && !p.creative ? (t === ID.ice ? ID.water : ID.water) : (b.waterlogged ? ID.water : 0);
    w.setBlock(x, y, z, replacement);
    if (!p.creative) {
      for (const s of blockDrops(v, heldDef)) this.dropItem(x + 0.5, y + 0.5, z + 0.5, s, true);
      if (b.xp) { const n = b.xp[0] + Math.floor(Math.random() * (b.xp[1] - b.xp[0] + 1)); if (n > 0) this.entities.push(new XpOrb(w, x + 0.5, y + 0.5, z + 0.5, n)); }
      if (heldDef && heldDef.durability && b.hardness !== 0) { if (this.inventory.damageHeld(heldDef.tool && heldDef.tool.type === 'sword' ? 2 : 1)) this.audio?.play('random.break'); }
      p.exhaustion += 0.005;
    }
    this.onBlockBroken?.(x, y, z, v);
    return true;
  },

  breakBlockNaturally(x, y, z, v, drop = true) {
    const b = BLOCKS[v & TYPE_MASK];
    if (b.model === 'door' || b.model === 'double_plant') {
      const m = v >>> META_SHIFT, oy = (b.model === 'door' ? (m & 8) : (m & 1)) ? -1 : 1;
      if ((this.world.getBlock(x, y + oy, z) & TYPE_MASK) === (v & TYPE_MASK)) this.world.setBlock(x, y + oy, z, 0);
    }
    this.world.setBlock(x, y, z, b.waterlogged ? ID.water : 0);
    this.particles?.destroy(x, y, z, v);
    if (drop) for (const s of blockDrops(v, null)) this.dropItem(x + 0.5, y + 0.5, z + 0.5, s, true);
  },

  dropItem(x, y, z, stack, natural = false, vel = null) {
    if (!stack || !stack.count || stack.id === undefined) return null;
    let v = vel;
    if (natural) { x += Math.random() * 0.5 - 0.25; y += Math.random() * 0.5 - 0.25 - 0.125; z += Math.random() * 0.5 - 0.25; v = [Math.random() * 0.2 - 0.1, 0.2, Math.random() * 0.2 - 0.1]; }
    const e = new ItemEntity(this.world, x, y, z, stack, v);
    this.entities.push(e);
    return e;
  },

  // Player.drop: throw item from the eye position
  playerDrop(stack) {
    const p = this.player;
    const e = this.dropItem(p.pos[0], p.pos[1] + p.eyeH - 0.3, p.pos[2], stack);
    if (!e) return;
    e.pickupDelay = 40;
    const ry = p.yaw * Math.PI / 180, rx = p.pitch * Math.PI / 180;
    const f2 = Math.sin(rx), f3 = Math.cos(rx), f4 = Math.sin(ry), f5 = Math.cos(ry);
    const f6 = Math.random() * Math.PI * 2, f7 = 0.02 * Math.random();
    e.vel = [-f4 * f3 * 0.3 + Math.cos(f6) * f7, -f2 * 0.3 + 0.1 + (Math.random() - Math.random()) * 0.1, f5 * f3 * 0.3 + Math.sin(f6) * f7];
    this.audio?.play('random.pop', { volume: 0.2, pitch: 0.8 });
  },

  spawnFallingBlock(x, y, z, v) { this.entities.push(new FallingBlock(this.world, x, y, z, v)); },

  pickBlock() {
    const t = this.target;
    if (!t || t.entity) return;
    let v = this.world.getBlock(t.x, t.y, t.z);
    let id = v & TYPE_MASK;
    const b = BLOCKS[id];
    const map = { lit_furnace: 'furnace', wheat: 'wheat_seeds', kelp_plant: 'kelp', farmland: 'dirt', dirt_path: 'dirt', water: 'water_bucket', lava: 'lava_bucket' };
    let iid = map[b.name] ? IID[map[b.name]] : (ITEMS[id] ? id : null);
    if (iid == null) return;
    const inv = this.inventory;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === iid) { inv.selected = i; inv.changed(); return; }
    if (!this.player.creative) {
      for (let i = 9; i < 36; i++) if (inv.slots[i] && inv.slots[i].id === iid) { const tmp = inv.slots[inv.selected]; inv.slots[inv.selected] = inv.slots[i]; inv.slots[i] = tmp; inv.changed(); return; }
      return;
    }
    let slot = inv.selected;
    if (inv.slots[slot]) { for (let i = 0; i < 9; i++) if (!inv.slots[i]) { slot = i; break; } }
    inv.selected = slot;
    inv.set(slot, { id: iid, count: 1 });
  },

  // ---- use item / place ----
  startUseItem() {
    this.rightClickDelay = 4;
    const p = this.player, t = this.target, inv = this.inventory;
    const held = inv.held(), def = held ? ITEMS[held.id] : null;
    if (p.vehicle) return;
    if (t && t.entity) {
      if (t.entity.interact && t.entity.interact(this, held)) { this.swing(); return; }
    }
    if (t && !t.entity) {
      const v = this.world.getBlock(t.x, t.y, t.z);
      const b = BLOCKS[v & TYPE_MASK];
      if (!(p.sneaking && held) && b.interact && this.interactBlock(t, v, b, held)) { this.swing(); return; }
      if (held && this.useItemOn(t, held, def)) return;
    }
    if (held) this.useItemInAir(held, def);
  },

  useItemInAir(held, def) {
    const p = this.player;
    if (def.food && (p.food < 20 || p.creative || def.name === 'golden_apple')) { this.using = { kind: 'eat', ticks: 0, id: held.id }; return; }
    if (def.name === 'milk_bucket') { this.using = { kind: 'drink', ticks: 0, id: held.id }; return; }
    if (def.name === 'bucket') {
      const eye = [p.pos[0], p.pos[1] + p.eyeH, p.pos[2]], d = lookVec(p.yaw, p.pitch);
      const hit = this.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], this.reach(), { fluids: true });
      if (hit && T_FLUID[hit.v & TYPE_MASK] && !BLOCKS[hit.v & TYPE_MASK].waterlogged && (hit.v >>> META_SHIFT) === 0) {
        const lava = T_FLUID[hit.v & TYPE_MASK] === 2;
        this.world.setBlock(hit.x, hit.y, hit.z, 0);
        this.audio?.play(lava ? 'liquid.lava' : 'random.splash', { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5, volume: 0.6 });
        this.giveFromHeld(lava ? 'lava_bucket' : 'water_bucket');
        this.swing();
      }
      return;
    }
    if (def.boat) {
      // boats can be placed on water surfaces in the air hit test too
      const eye = [p.pos[0], p.pos[1] + p.eyeH, p.pos[2]], d = lookVec(p.yaw, p.pitch);
      const hit = this.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], this.reach(), { fluids: true });
      if (hit && T_FLUID[hit.v & TYPE_MASK] === 1) { this.placeBoat(hit.x + 0.5, hit.y + 1, hit.z + 0.5, def.boat); this.swing(); }
    }
    if (def.name === 'snowball' || def.name === 'egg') {
      this.throwProjectile?.(def.name);
      if (!p.creative) this.inventory.consumeHeld(1);
      this.swing();
    }
  },

  giveFromHeld(name) {
    const inv = this.inventory, p = this.player;
    if (p.creative) { if (inv.count(IID[name]) === 0) inv.addItem({ id: IID[name], count: 1 }); return; }
    const held = inv.held();
    if (held.count === 1) inv.set(inv.selected, { id: IID[name], count: 1 });
    else { held.count--; inv.changed(); if (inv.addItem({ id: IID[name], count: 1 })) this.playerDrop({ id: IID[name], count: 1 }); }
  },

  tickUsing() {
    const u = this.using, p = this.player;
    const held = this.inventory.held();
    if (!held || held.id !== u.id) { this.stopUsing(); return; }
    u.ticks++;
    p.usingItem = true;
    if (u.ticks > 7 && u.ticks % 4 === 0) {
      this.audio?.play(u.kind === 'drink' ? 'random.drink' : 'random.eat', { volume: 0.5 + 0.5 * Math.random(), pitch: (Math.random() - Math.random()) * 0.2 + 1 });
      const it = ITEMS[held.id];
      const eye = [p.pos[0], p.pos[1] + p.eyeH - 0.1, p.pos[2]], d = lookVec(p.yaw, p.pitch);
      if (u.kind === 'eat') this.particles?.item(eye[0] + d[0] * 0.5, eye[1] + d[1] * 0.5, eye[2] + d[2] * 0.5, it.icon.type === 'item' ? 'item/' + it.icon.tex : (it.icon.tex || BLOCKS[it.block]?.texFaces?.[0]));
    }
    if (u.ticks >= 32) {
      const it = ITEMS[held.id];
      if (u.kind === 'eat') {
        p.eat(it.food.hunger, it.food.saturation);
        this.audio?.play('random.burp', { volume: 0.5, pitch: Math.random() * 0.1 + 0.9 });
        if (it.name === 'golden_apple') { p.absorb = 4; p.regenTicks = 100; }
        if (it.name === 'mushroom_stew') { if (!p.creative) { this.inventory.set(this.inventory.selected, { id: IID.bowl, count: 1 }); } }
        else if (!p.creative) this.inventory.consumeHeld(1);
      } else if (u.kind === 'drink') {
        if (!p.creative) this.inventory.set(this.inventory.selected, { id: IID.bucket, count: 1 });
      }
      this.using = null; p.usingItem = false;
      this.rightClickDelay = 4;
    }
  },
  stopUsing() { this.using = null; if (this.player) this.player.usingItem = false; },

  interactBlock(t, v, b, held) {
    const w = this.world, m = v >>> META_SHIFT;
    switch (b.interact) {
      case 'crafting': this.openScreen?.('crafting'); return true;
      case 'chest': this.openScreen?.('chest', { x: t.x, y: t.y, z: t.z }); this.audio?.play('random.chestopen', { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5, volume: 0.5 }); return true;
      case 'furnace': this.openScreen?.('furnace', { x: t.x, y: t.y, z: t.z }); return true;
      case 'door': {
        const upper = m & 8;
        const oy = upper ? -1 : 1;
        w.setBlock(t.x, t.y, t.z, v ^ (4 << META_SHIFT));
        const o = w.getBlock(t.x, t.y + oy, t.z);
        if ((o & TYPE_MASK) === b.id) w.setBlock(t.x, t.y + oy, t.z, o ^ (4 << META_SHIFT));
        this.audio?.play((m & 4) ? 'random.door_close' : 'random.door_open', { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 });
        return true;
      }
      case 'trapdoor': w.setBlock(t.x, t.y, t.z, v ^ (4 << META_SHIFT)); this.audio?.play((m & 4) ? 'random.door_close' : 'random.door_open', { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 }); return true;
      case 'tnt': {
        const def = held ? ITEMS[held.id] : null;
        if (def && def.name === 'flint_and_steel') {
          w.setBlock(t.x, t.y, t.z, 0);
          this.entities.push(new PrimedTnt(w, t.x, t.y, t.z));
          this.audio?.play('random.fuse', { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 });
          if (!this.player.creative) this.inventory.damageHeld(1);
          return true;
        }
        return false;
      }
    }
    return false;
  },

  useItemOn(t, held, def) {
    const w = this.world, p = this.player;
    const v = w.getBlock(t.x, t.y, t.z), tb = BLOCKS[v & TYPE_MASK];
    const fd = FACE_DIR[t.face];
    let px = t.x + fd[0], py = t.y + fd[1], pz = t.z + fd[2];
    const tReplace = T_REPLACEABLE[v & TYPE_MASK] && !(tb.fluid && def.name === 'bucket') && !(tb.name === 'snow' && ((v >>> META_SHIFT) & 7) > 0 && def.block !== ID.snow);
    if (tReplace && !T_FLUID[v & TYPE_MASK]) { px = t.x; py = t.y; pz = t.z; }
    // tools on blocks
    if (def.tool && def.tool.type === 'hoe' && (tb.id === ID.grass_block || tb.id === ID.dirt || tb.id === ID.dirt_path || tb.id === ID.coarse_dirt) && t.face !== 0 && (w.getBlock(t.x, t.y + 1, t.z) & TYPE_MASK) === 0) {
      w.setBlock(t.x, t.y, t.z, tb.id === ID.coarse_dirt ? ID.dirt : ID.farmland);
      this.audio?.play('step.gravel', { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 });
      if (!p.creative) this.inventory.damageHeld(1);
      this.swing(); return true;
    }
    if (def.tool && def.tool.type === 'shovel' && tb.id === ID.grass_block && t.face !== 0 && (w.getBlock(t.x, t.y + 1, t.z) & TYPE_MASK) === 0) {
      w.setBlock(t.x, t.y, t.z, ID.dirt_path);
      this.audio?.play('step.grass', { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 });
      if (!p.creative) this.inventory.damageHeld(1);
      this.swing(); return true;
    }
    if (def.tool && def.tool.type === 'shears' && tb.id === ID.pumpkin) {
      w.setBlock(t.x, t.y, t.z, mk(ID.carved_pumpkin, [0, 1, 2, 3][[2, 3, 4, 5].indexOf(t.face)] ?? 1));
      this.dropItem(t.x + 0.5, t.y + 1, t.z + 0.5, { id: IID.pumpkin_seeds ?? IID.wheat_seeds, count: 4 });
      this.swing(); return true;
    }
    if (def.tool && def.tool.type === 'axe' && false) return false;
    if (def.name === 'flint_and_steel') {
      if (tb.id === ID.obsidian && this.tryLightPortal?.(px, py, pz)) { this.swing(); return true; }
      if ((w.getBlock(px, py, pz) & TYPE_MASK) === 0) {
        w.setBlock(px, py, pz, ID.fire);
        this.audio?.play('fire.ignite', { x: px + 0.5, y: py + 0.5, z: pz + 0.5 });
        if (!p.creative) this.inventory.damageHeld(1);
        this.swing(); return true;
      }
      return false;
    }
    if (def.name === 'water_bucket' || def.name === 'lava_bucket') {
      const lava = def.name === 'lava_bucket';
      const cur = w.getBlock(px, py, pz) & TYPE_MASK;
      if (cur === 0 || T_REPLACEABLE[cur] || T_FLUID[cur]) {
        w.setBlock(px, py, pz, lava ? ID.lava : ID.water);
        w.schedule(px, py, pz, lava ? 30 : 5);
        this.audio?.play(lava ? 'liquid.lava' : 'random.splash', { x: px + 0.5, y: py + 0.5, z: pz + 0.5, volume: 0.5 });
        if (!p.creative) this.inventory.set(this.inventory.selected, { id: IID.bucket, count: 1 });
        this.swing(); return true;
      }
      return false;
    }
    if (def.name === 'bone_meal') {
      if (this.boneMeal?.(t.x, t.y, t.z)) { if (!p.creative) this.inventory.consumeHeld(1); this.swing(); return true; }
      return false;
    }
    if (def.name === 'minecart') {
      if (tb.rail) { this.placeMinecart?.(t.x + 0.5, t.y + 0.0625, t.z + 0.5); if (!p.creative) this.inventory.consumeHeld(1); this.swing(); return true; }
      return false;
    }
    if (def.boat) {
      this.placeBoat(t.x + 0.5 + fd[0] * 0.5, t.y + (t.face === 1 ? 1 : 0), t.z + 0.5 + fd[2] * 0.5, def.boat);
      this.swing(); return true;
    }
    // placing blocks
    let blockId = def.block !== undefined ? def.block : def.place;
    if (blockId === undefined) return false;
    return this.placeBlock(t, px, py, pz, blockId, held);
  },

  placeBoat(x, y, z, wood) {
    this.spawnBoat?.(x, y, z, wood, this.player.yaw);
    if (!this.player.creative) this.inventory.consumeHeld(1);
  },

  placeBlock(t, px, py, pz, blockId, held) {
    const w = this.world, p = this.player;
    if (py < MIN_Y || py >= 320) return false;
    const b = BLOCKS[blockId];
    const cur = w.getBlock(px, py, pz);
    const ct = cur & TYPE_MASK;
    // slab merging
    if (b.model === 'slab') {
      const tv = w.getBlock(t.x, t.y, t.z);
      if ((tv & TYPE_MASK) === blockId) {
        const tm = tv >>> META_SHIFT;
        if ((tm === 0 && t.face === 1) || (tm === 1 && t.face === 0)) return this.finishPlace(t.x, t.y, t.z, mk(blockId, 2), b, held);
      }
      if (ct === blockId && (cur >>> META_SHIFT) !== 2) return this.finishPlace(px, py, pz, mk(blockId, 2), b, held);
    }
    if (b.model === 'layer' && ct === ID.snow) {
      const lm = cur >>> META_SHIFT;
      if (lm < 7) return this.finishPlace(px, py, pz, mk(ID.snow, lm + 1), b, held);
      return false;
    }
    if (!(ct === 0 || T_REPLACEABLE[ct])) return false;
    const fy = t.hit ? t.hit[1] - t.y : 0.5;
    const facing = lookFacing(p.yaw);
    let meta = 0;
    switch (b.model) {
      case 'slab': meta = t.face === 0 ? 1 : t.face === 1 ? 0 : (fy > 0.5 ? 1 : 0); break;
      case 'stairs': meta = facing | ((t.face === 0 || (t.face !== 1 && fy > 0.5)) ? 4 : 0); break;
      case 'torch': {
        if (t.face === 1) meta = 0;
        else if (t.face === 0) return false;
        else meta = 1 + [0, 1, 2, 3][[2, 3, 4, 5].indexOf(t.face)];
        if (!w.canSurvive(mk(blockId, meta), px, py, pz)) {
          if (t.face !== 1 && w.canSurvive(mk(blockId, 0), px, py, pz)) meta = 0; else return false;
        }
        break;
      }
      case 'ladder': {
        if (t.face < 2) return false;
        meta = [0, 1, 2, 3][[2, 3, 4, 5].indexOf(t.face)];
        break;
      }
      case 'lantern': meta = t.face === 0 ? 1 : 0; break;
      case 'door': {
        meta = OPP[facing] === undefined ? 0 : facing;
        // door facing = player facing; occupies 2 blocks
        if (py + 1 >= 320) return false;
        const above = w.getBlock(px, py + 1, pz) & TYPE_MASK;
        if (!(above === 0 || T_REPLACEABLE[above])) return false;
        if (!w.canSurvive(mk(blockId, facing), px, py, pz) && !T_SOLID[w.getBlock(px, py - 1, pz) & TYPE_MASK]) return false;
        if (this.entityBlocks(px, py, pz, blockId, facing) || this.entityBlocks(px, py + 1, pz, blockId, facing)) return false;
        w.setBlock(px, py + 1, pz, mk(blockId, facing | 8));
        return this.finishPlace(px, py, pz, mk(blockId, facing), b, held, true);
      }
      case 'trapdoor': meta = OPP[facing] | ((t.face === 0 || (t.face !== 1 && fy > 0.5)) ? 8 : 0); break;
      case 'double_plant': {
        const above = w.getBlock(px, py + 1, pz) & TYPE_MASK;
        if (!(above === 0 || T_REPLACEABLE[above])) return false;
        if (!w.canSurvive(mk(blockId, 0) , px, py, pz) && !( [ID.grass_block, ID.dirt, ID.podzol, ID.coarse_dirt].includes(w.getBlock(px, py - 1, pz) & TYPE_MASK))) return false;
        w.setBlock(px, py + 1, pz, mk(blockId, 1), 2);
        return this.finishPlace(px, py, pz, mk(blockId, 0), b, held, true);
      }
      case 'rail': meta = facing < 2 ? 0 : 1; break;
      default: break;
    }
    if (b.axis) meta = t.face < 2 ? 0 : t.face < 4 ? 2 : 1;
    if (b.facing) meta = OPP[facing];
    if (b.model === 'vine') {
      if (t.face < 2) return false;
      meta = [1, 2, 4, 8][[3, 2, 5, 4].indexOf(t.face)] || 0;
    }
    if (b.name === 'lily_pad') {
      if (T_FLUID[ct] === 1) return false;
    }
    const nv = mk(blockId, meta);
    if (!w.canSurvive(nv, px, py, pz)) return false;
    if (this.entityBlocks(px, py, pz, blockId, meta)) return false;
    return this.finishPlace(px, py, pz, nv, b, held);
  },

  entityBlocks(x, y, z, blockId, meta) {
    const bx = collisionBoxes(mk(blockId, meta), (a, b, c) => this.world.getBlock(a, b, c), x, y, z);
    if (!bx) return false;
    const ents = [this.player, ...this.entities.filter(e => e.blocksPlacement)];
    for (const e of ents) {
      if (e === this.player && (this.player.gamemode === 'spectator')) continue;
      const a = e.aabb();
      for (const q of bx) {
        if (a[3] > x + q[0] + 1e-4 && a[0] < x + q[3] - 1e-4 && a[4] > y + q[1] + 1e-4 && a[1] < y + q[4] - 1e-4 && a[5] > z + q[2] + 1e-4 && a[2] < z + q[5] - 1e-4) return true;
      }
    }
    return false;
  },

  finishPlace(x, y, z, v, b, held, already) {
    const w = this.world;
    const wasWater = T_FLUID[w.getBlock(x, y, z) & TYPE_MASK] === 1;
    if (b.waterlogged && !wasWater) return false;
    w.setBlock(x, y, z, v);
    if (b.rail) this.railUpdate(x, y, z, true);
    if (b.gravity) w.schedule(x, y, z, 2);
    this.audio?.play('place.' + soundOf(b), { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    if (!this.player.creative) this.inventory.consumeHeld(1);
    this.swing();
    void already;
    return true;
  },

  // ---- rails (simplified RailState) ----
  railUpdate(x, y, z, placed = false) {
    const w = this.world;
    const v = w.getBlock(x, y, z), b = BLOCKS[v & TYPE_MASK];
    if (!b.rail) return;
    const isRail = (vv) => BLOCKS[vv & TYPE_MASK].rail;
    const dirs = [[0, -1, 'N'], [0, 1, 'S'], [-1, 0, 'W'], [1, 0, 'E']];
    const conn = [];
    for (const [dx, dz, n] of dirs) {
      if (isRail(w.getBlock(x + dx, y, z + dz))) conn.push({ n, up: false });
      else if (isRail(w.getBlock(x + dx, y + 1, z + dz))) conn.push({ n, up: true });
      else if (isRail(w.getBlock(x + dx, y - 1, z + dz))) conn.push({ n, up: false });
    }
    const has = (n) => conn.find(c => c.n === n);
    let shape = b.poweredRail ? (v >>> META_SHIFT) & 7 : v >>> META_SHIFT;
    const N = has('N'), S = has('S'), W = has('W'), E = has('E');
    const canCurve = !b.poweredRail;
    if ((N || S) && !(E || W)) shape = N && N.up ? 4 : S && S.up ? 5 : 0;
    else if ((E || W) && !(N || S)) shape = E && E.up ? 2 : W && W.up ? 3 : 1;
    else if (N && S && !(E && W)) shape = 0;
    else if (E && W && !(N && S)) shape = 1;
    else if (canCurve && conn.length >= 2) {
      if (S && E) shape = 6; else if (S && W) shape = 7; else if (N && W) shape = 8; else if (N && E) shape = 9;
    }
    let nv = b.poweredRail ? mk(b.id, shape | ((v >>> META_SHIFT) & 8)) : mk(b.id, shape);
    if (b.poweredRail) {
      const powered = this.railPowered(x, y, z, 0, new Set());
      nv = mk(b.id, shape | (powered ? 8 : 0));
    }
    if (nv !== v) w.setBlock(x, y, z, nv, 2);
    if (placed) for (const [dx, dz] of dirs) for (const dy of [-1, 0, 1]) if (isRail(w.getBlock(x + dx, y + dy, z + dz))) this.railUpdate(x + dx, y + dy, z + dz);
  },
  railPowered(x, y, z, depth, seen) {
    const w = this.world;
    const key = x + ',' + y + ',' + z;
    if (seen.has(key) || depth > 8) return false;
    seen.add(key);
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      const n = BLOCKS[w.getBlock(x + dx, y + dy, z + dz) & TYPE_MASK];
      if (n.power) return true;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, -1, 1]) {
      const n = w.getBlock(x + dx, y + dy, z + dz);
      if (BLOCKS[n & TYPE_MASK].poweredRail && this.railPowered(x + dx, y + dy, z + dz, depth + 1, seen)) return true;
    }
    return false;
  },

  // ---- explosions (Explosion.explode) ----
  explode(x, y, z, power, fire = false) {
    const w = this.world;
    const affected = new Set();
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
      if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
      let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      let f = power * (0.7 + Math.random() * 0.6);
      let px = x, py = y, pz = z;
      for (; f > 0; f -= 0.22500001) {
        const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
        const v = w.getBlock(bx, by, bz);
        if (v) {
          const b = BLOCKS[v & TYPE_MASK];
          const res = b.fluid ? 100 : b.resistance;
          f -= (res + 0.3) * 0.3;
        }
        if (f > 0 && v && !(BLOCKS[v & TYPE_MASK].fluid)) affected.add(bx + ',' + by + ',' + bz);
        px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
      }
    }
    // damage entities
    const r2 = power * 2;
    for (const e of [this.player, ...this.entities]) {
      const ex = e.pos[0] - x, ey = e.pos[1] + (e.eyeHeight ? e.eyeHeight() : e.height / 2) - y, ez = e.pos[2] - z;
      const d = Math.hypot(ex, ey, ez);
      if (d / r2 > 1 || d === 0) continue;
      const exposure = 1;
      const impact = (1 - d / r2) * exposure;
      const dmg = Math.floor((impact * impact + impact) / 2 * 7 * r2 + 1);
      if (e === this.player) { if (!this.player.creative) this.player.damage(dmg, 'explosion'); }
      else if (e.hurt) e.hurt(this, dmg, null);
      else if (e.type === 'item' || e.type === 'xp') e.dead = true;
      const k = impact;
      e.vel[0] += ex / d * k; e.vel[1] += ey / d * k; e.vel[2] += ez / d * k;
      if (e.type === 'tnt' && e !== this) e.fuse = Math.min(e.fuse, 10 + Math.floor(Math.random() * 20));
    }
    for (const key of affected) {
      const [bx, by, bz] = key.split(',').map(Number);
      const v = w.getBlock(bx, by, bz);
      const b = BLOCKS[v & TYPE_MASK];
      if (b.id === ID.tnt) { w.setBlock(bx, by, bz, 0); const t = new PrimedTnt(w, bx, by, bz, 10 + Math.floor(Math.random() * 20)); this.entities.push(t); continue; }
      if (b.hardness < 0) continue;
      w.setBlock(bx, by, bz, 0);
      if (Math.random() < 1 / power) for (const s of blockDrops(v, null)) this.dropItem(bx + 0.5, by + 0.5, bz + 0.5, s, true);
      if (Math.random() < 0.15) this.particles?.spawn('smoke', bx + 0.5, by + 0.5, bz + 0.5, 0, 0.02, 0);
    }
    if (fire) for (const key of affected) { const [bx, by, bz] = key.split(',').map(Number); if (Math.random() < 1 / 3 && w.getBlock(bx, by, bz) === 0 && T_SOLID[w.getBlock(bx, by - 1, bz) & TYPE_MASK]) w.setBlock(bx, by, bz, ID.fire); }
    this.audio?.play('random.explode', { x, y, z, volume: 4, pitch: (1 + (Math.random() - Math.random()) * 0.2) * 0.7 });
    for (let i = 0; i < 16; i++) this.particles?.spawn('explosion', x + (Math.random() - 0.5) * power * 1.5, y + (Math.random() - 0.5) * power * 1.5, z + (Math.random() - 0.5) * power * 1.5);
    for (let i = 0; i < 30; i++) this.particles?.spawn('large_smoke', x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, 0, 0.05, 0);
    this.shake = 1;
  },

  addXp(n) {
    const p = this.player;
    p.xpTotal = (p.xpTotal || 0) + n;
    let pts = n;
    while (pts > 0) {
      const need = xpForLevel(p.xpLevel);
      const have = p.xpProgress * need;
      if (have + pts >= need) { pts -= need - have; p.xpLevel++; p.xpProgress = 0; if (p.xpLevel % 5 === 0) this.audio?.play('random.levelup', { volume: 0.75 }); }
      else { p.xpProgress = (have + pts) / need; pts = 0; }
    }
    this.audio?.play('random.orb', { volume: 0.1, pitch: 0.5 * ((Math.random() - Math.random()) * 0.7 + 1.8) });
  },

  attackEntity(e) {
    const p = this.player;
    const it = this.inventory.heldDef();
    const base = it && it.attackDamage ? it.attackDamage : 1;
    const s = this.attackStrength(0.5);
    let dmg = base * (0.2 + s * s * 0.8);
    const crit = s > 0.9 && p.fallDistance > 0 && !p.onGround && !p.isClimbing() && !p.inWater;
    if (crit) { dmg *= 1.5; for (let i = 0; i < 10; i++) this.particles?.spawn('crit', e.pos[0], e.pos[1] + e.height * 0.6, e.pos[2], (Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4); }
    this.attackStrengthTicker = 0;
    if (e.hurt) {
      const kb = (p.sprinting && s > 0.9) ? 1 : 0;
      e.hurt(this, dmg, p, kb);
      this.audio?.play(crit ? 'player.attack.crit' : s > 0.9 ? 'player.attack.strong' : 'player.attack.weak', { x: e.pos[0], y: e.pos[1], z: e.pos[2] });
      if (it && it.durability && !p.creative) this.inventory.damageHeld(it.tool && it.tool.type === 'sword' ? 1 : 2);
      p.exhaustion += 0.1;
      if (kb) { p.vel[0] *= 0.6; p.vel[2] *= 0.6; p.sprinting = false; }
    } else if (e.onAttack) e.onAttack(this);
  },
};

export function lookVec(yaw, pitch) {
  const ry = yaw * Math.PI / 180, rx = pitch * Math.PI / 180;
  return [-Math.sin(ry) * Math.cos(rx), -Math.sin(rx), Math.cos(ry) * Math.cos(rx)];
}
export function soundOf(b) {
  const s = b.sound || 'stone';
  return { wood: 'wood', cherry_wood: 'wood', gravel: 'gravel', grass: 'grass', cherry_leaves: 'grass', wet_grass: 'grass', sand: 'sand', snow: 'snow', cloth: 'cloth', glass: 'glass', metal: 'metal', copper: 'metal', lantern: 'metal', ladder: 'wood', deepslate: 'stone', netherrack: 'stone', none: 'stone' }[s] || 'stone';
}
export function xpForLevel(l) { return l >= 30 ? 112 + (l - 30) * 9 : l >= 15 ? 37 + (l - 15) * 5 : 7 + l * 2; }
void WOODS; void T_OPAQUE; void itemDef;
