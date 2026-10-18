/* mobsim.js — 15. MOBS + 16. SIMULATION (fluids, gravity blocks, fire, random ticks). Shares window.gg (see index.html); loaded deferred before the main module,
   so main-module systems (CH_LIT, ChunkManager, Entities, Game, Interaction, Particles, Physics, Player, c_Motion, player, rayBox, world) are read lazily as gg.X at call time. */
(() => {
'use strict';
const { THREE } = gg;
const { AIR, B, BIO_BIRCH, BIO_FOREST, BIO_TAIGA, Blocks, C, CHUNK_H, DIRS, Events, HDIRS, MOB_TYPES, Pix, SHEEP_COLOR_WEIGHTS, Scheduler, Sky, TICK_DT, TICK_RATE, Terrain, WOOL_COLORS, Weather, bidx, blockDrops, clamp, dist2, floor, isLiquidId, isLog, rng } = gg;

const TICK_FLUID = 0, TICK_FALL = 1, TICK_FIRE = 3;

/* Mob locomotion tuning. Steering re-plans at most every steerCd ticks (no per-tick flip-flop);
   in water mobs float on a damped spring (no in/out toggling) and head for the nearest shore. */
const c_MobAI = { maxDrop: 3, steerTries: 8, steerCd: 10, shoreScan: 8, float: 0.55, buoy: 14, buoyDamp: 5, climbVy: 5.5, yawEase: 0.35 };
// Monsters are the mobs that feed on darkness or gunpowder; everything else is an animal
const isMonster = (d) => d.food === 'darkness' || d.food === 'gunpowder';
const Mobs = {
  list: [], scene: null, faceTex: new Map(),
  init(scene) { this.scene = scene; },
  clear() { for (const m of this.list) this.scene.remove(m.mesh); this.list.length = 0; },

  // ---- Model construction ----
  faceTexture(type, base) {
    const key = type + base;
    if (this.faceTex.has(key)) return this.faceTex.get(key);
    const p = new Pix('face' + key, 8).fill(C(base));
    const eyes = (c1, c2) => { p.set(1, 3, C(c1)); p.set(2, 3, C(c2)); p.set(5, 3, C(c2)); p.set(6, 3, C(c1)); };
    if (type === 'zombie') { eyes('#000000', '#000000'); p.rect(2, 6, 4, 1, C('#1a1a1a')); }
    else if (type === 'skeleton') { eyes('#000000', '#1a1a1a'); p.rect(1, 6, 6, 1, C('#5a5a5a')); }
    else if (type === 'creeper') { p.rect(1, 2, 2, 2, C('#000')); p.rect(5, 2, 2, 2, C('#000')); p.rect(3, 4, 2, 3, C('#000')); p.rect(2, 5, 1, 2, C('#000')); p.rect(5, 5, 1, 2, C('#000')); }
    else if (type === 'pig') { eyes('#ffffff', '#000000'); p.rect(2, 5, 4, 3, C('#e08a8a')); p.set(3, 6, C('#a05050')); p.set(4, 6, C('#a05050')); }
    else if (type === 'cow') { eyes('#ffffff', '#000000'); p.rect(2, 5, 4, 3, C('#c8b8a8')); }
    else if (type === 'sheep') { eyes('#ffffff', '#000000'); p.rect(2, 6, 4, 2, C('#a89888')); }
    else if (type === 'chicken') { eyes('#000000', '#000000'); p.rect(3, 4, 2, 2, C('#f0c020')); p.rect(3, 6, 2, 1, C('#d02020')); }
    // Same Perlin skin as the other faces (head front sits at texels 4..11 of the tile)
    const g = gg.MobSkin.gain(type);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = p.get(x, y), k = gg.MobSkin.mul(type, x + 4, y + 4) * g; p.set(x, y, [c[0] * k, c[1] * k, c[2] * k]); }
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    cv.getContext('2d').drawImage(p.toCanvas(), 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    this.faceTex.set(key, tex);
    return tex;
  },
  box(parent, w, h, d, x, y, z, color, opts = {}) {
    // sizes/positions in 1/16 block units; (x,y,z) is the box centre unless opts.pivotTop (then it is the top-centre)
    const geo = new THREE.BoxGeometry(w / 16, h / 16, d / 16), t = this.skinType;
    // UVs in texels (1 texel = 1/16 block) on the tileable noise skin; random offset per box. Face (-Z) keeps 0..1.
    const uv = geo.attributes.uv, ox = rng.int(16) / 16, oy = rng.int(16) / 16;
    [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]].forEach(([fu, fv], f) => {
      if (opts.face && f === 5) return;
      for (let k = f * 4; k < f * 4 + 4; k++) uv.setXY(k, uv.getX(k) * fu / 16 + ox, uv.getY(k) * fv / 16 + oy);
    });
    const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(gg.MobSkin.gain(t)), map: gg.MobSkin.texture(t) });
    const mat = opts.face ? [skin, skin, skin, skin, skin, new THREE.MeshLambertMaterial({ map: opts.face })] : skin;
    const mesh = new THREE.Mesh(geo, mat);
    const pivot = new THREE.Group();
    pivot.position.set(x / 16, y / 16, z / 16);
    if (opts.pivotTop) mesh.position.y = -h / 32; else if (opts.pivotBottom) mesh.position.y = h / 32;
    pivot.add(mesh); parent.add(pivot);
    pivot.userData.mesh = mesh;
    return pivot;
  },
  buildModel(m) {
    const g = new THREE.Group(), t = m.type, parts = { legs: [], arms: [] };
    this.skinType = t;
    const face = (base) => this.faceTexture(t, base);
    if (t === 'pig' || t === 'cow' || t === 'sheep') {
      const legH = t === 'pig' ? 6 : 12, body = t === 'pig' ? '#f0a5a5' : t === 'cow' ? '#4a2f1f' : (m.sheared ? '#e2c8b8' : WOOL_COLORS[m.color]);
      const skin = t === 'pig' ? '#f0a5a5' : t === 'cow' ? '#4a2f1f' : '#c8b8a8';
      parts.body = this.box(g, 10, 8, 16, 0, legH + 4, 0, body);
      parts.head = this.box(g, 8, 8, 8, 0, legH + 6, -10, t === 'sheep' ? WOOL_COLORS[m.color] : skin, { face: face(skin) });
      for (const [lx, lz] of [[-3, -5], [3, -5], [-3, 5], [3, 5]]) parts.legs.push(this.box(g, 4, legH, 4, lx, legH, lz, skin, { pivotTop: true }));
      if (t === 'cow') { this.box(g, 1, 3, 1, -4, legH + 10, -10, '#e8e8e8'); this.box(g, 1, 3, 1, 4, legH + 10, -10, '#e8e8e8'); }
    } else if (t === 'chicken') {
      parts.body = this.box(g, 6, 6, 8, 0, 8, 0, '#f4f4f4');
      parts.head = this.box(g, 4, 6, 3, 0, 13, -4, '#f4f4f4', { face: face('#f4f4f4') });
      for (const lx of [-1.5, 1.5]) parts.legs.push(this.box(g, 1, 5, 1, lx, 5, 0, '#f0c020', { pivotTop: true }));
      for (const lx of [-3.5, 3.5]) parts.arms.push(this.box(g, 1, 4, 6, lx, 10, 0, '#e8e8e8', { pivotTop: true }));
    } else if (t === 'creeper') {
      parts.body = this.box(g, 8, 12, 4, 0, 12, 0, '#4aa64a');
      parts.head = this.box(g, 8, 8, 8, 0, 22, 0, '#4aa64a', { face: face('#4aa64a') });
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) parts.legs.push(this.box(g, 4, 6, 4, lx, 6, lz, '#3f8f3f', { pivotTop: true }));
    } else {
      const skin = t === 'zombie' ? '#3f7a3f' : '#c8c8c8', shirt = t === 'zombie' ? '#2c6a8c' : '#c8c8c8', pants = t === 'zombie' ? '#3a2f8a' : '#c8c8c8';
      const lw = t === 'skeleton' ? 2 : 4;
      parts.body = this.box(g, 8, 12, lw, 0, 18, 0, shirt);
      parts.head = this.box(g, 8, 8, 8, 0, 28, 0, skin, { face: face(skin) });
      for (const lx of [-2, 2]) parts.legs.push(this.box(g, lw, 12, lw, lx, 12, 0, pants, { pivotTop: true }));
      for (const lx of [-(4 + lw / 2), 4 + lw / 2]) parts.arms.push(this.box(g, lw, 12, lw, lx, 24, 0, skin, { pivotTop: true }));
      // +X rotation swings a hanging arm (-Y) toward -Z = the face side
      if (t === 'zombie') for (const a of parts.arms) a.rotation.x = Math.PI / 2;
      if (t === 'skeleton') { const aim = Math.PI / 2 - 0.3; parts.arms[1].rotation.x = aim; const bow = this.box(parts.arms[1], 1, 10, 2, 0, -11, 0, '#8a6a3a'); bow.rotation.x = -aim; }
    }
    // Health bar sprite
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 4;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter;
    const hp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    hp.scale.set(0.8, 0.1, 1); hp.position.y = m.h + 0.35; hp.visible = false; g.add(hp);
    parts.hp = hp; parts.hpCanvas = cv;
    g.traverse(o => { if (o.isMesh) { o.userData.baseColors = (Array.isArray(o.material) ? o.material : [o.material]).map(mt => mt.color.clone()); } });
    m.mesh = g; m.parts = parts;
  },
  updateHealthBar(m) {
    const ctx = m.parts.hpCanvas.getContext('2d');
    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 32, 4); ctx.fillStyle = '#e33'; ctx.fillRect(0, 0, Math.round(32 * clamp(m.health / m.maxHealth, 0, 1)), 4);
    m.parts.hp.material.map.needsUpdate = true; m.parts.hp.visible = true; m.hpTimer = 3;
  },

  // ---- Spawning ----
  spawnMob(type, x, y, z) {
    const def = MOB_TYPES[type]; if (!def) return null;
    const m = { type, def, x, y, z, vx: 0, vy: 0, vz: 0, w: def.w, h: def.h, yaw: rng.next() * Math.PI * 2, health: def.health, maxHealth: def.health, onGround: false, stepHeight: 0.6, aj: 0, ry: y, ryaw: 0, inWater: false, steerCd: 0,
      dead: false, deathTimer: 0, hurtTimer: 0, state: 'idle', stateTimer: rng.range(1, 3), moveX: 0, moveZ: 0, attackCooldown: 0, fire: 0, walkPhase: 0, hpTimer: 0, fuse: -1, age: 0, mesh: null, parts: null, sheared: false, regrow: 0, color: 'white', lightTimer: 0, fleeFrom: null };
    if (type === 'sheep') { let r = rng.int(100), pick = 'white'; for (const [c, w] of SHEEP_COLOR_WEIGHTS) { if (r < w) { pick = c; break; } r -= w; } m.color = pick; }
    m.ryaw = m.yaw;
    m.hurt = (amount, source, kb) => this.hurt(m, amount, source, kb);
    this.buildModel(m);
    this.scene.add(m.mesh);
    this.list.push(m);
    return m;
  },
  canStand(x, y, z, def) {
    const h = Math.ceil(def.h);
    for (let i = 0; i < h; i++) if (gg.world.isSolid(x, y + i, z) || gg.world.getDef(x, y + i, z).liquid) return false;
    return gg.world.isSolid(x, y - 1, z);
  },
  spawnTick() {
    const p = gg.player; if (!gg.Game.running) return;
    let passive = 0, hostile = 0;
    const peaceful = !!gg.Game.modeDef.peaceful;   // harmless mode: monsters vanish and never spawn (spawners included)
    for (const m of this.list) if (!m.dead) { if (!isMonster(m.def)) passive++; else if (peaceful) this.remove(m); else hostile++; }
    const rd = gg.ChunkManager.renderDistance;
    // Initial passive population of newly meshed chunks
    if (passive < 14 && Scheduler.tick % 4 === 0) {
      const cx = gg.ChunkManager.pcx + rng.irange(-rd + 1, rd - 1), cz = gg.ChunkManager.pcz + rng.irange(-rd + 1, rd - 1);
      const c = gg.world.getChunk(cx, cz);
      if (c && c.meshed && !c.spawnedPassive) {
        c.spawnedPassive = true;
        if (rng.chance(0.3)) {
          const lx = rng.int(16), lz = rng.int(16), x = cx * 16 + lx, z = cz * 16 + lz, y = c.height[lx * 16 + lz];
          if (gg.world.getBlock(x, y - 1, z) === B.grass_block) {
            const type = rng.pick(['pig', 'cow', 'sheep', 'chicken', 'sheep', 'cow']);
            const n = rng.irange(2, 4);
            for (let i = 0; i < n; i++) { const sx = x + rng.irange(-3, 3), sz = z + rng.irange(-3, 3), sy = gg.world.getHeight(sx, sz); if (this.canStand(sx, sy, sz, MOB_TYPES[type])) this.spawnMob(type, sx + 0.5, sy, sz + 0.5); }
          }
        }
      }
    }
    // Hostile spawning in darkness
    if (!peaceful && hostile < 26 && Scheduler.tick % 2 === 0) {
      const x = floor(p.x) + rng.irange(-48, 48), z = floor(p.z) + rng.irange(-48, 48);
      const c = gg.world.chunkAt(x, z);
      if (c && c.state >= gg.CH_LIT) {
        const surface = c.height[(x & 15) * 16 + (z & 15)];
        const y = rng.chance(0.5) ? surface : rng.irange(5, Math.max(6, surface));
        const d = Math.sqrt(dist2(x, y, z, p.x, p.y, p.z));
        if (d > 24 && d < 70) {
          const type = rng.pick(['zombie', 'zombie', 'skeleton', 'creeper']);
          if (this.canStand(x, y, z, MOB_TYPES[type]) && gg.world.getLightLevel(x, y, z, Sky.dayFactor) < 8 && !gg.world.getDef(x, y - 1, z).liquid) {
            const n = rng.irange(1, 3);
            for (let i = 0; i < n; i++) { const sx = x + rng.irange(-2, 2), sz = z + rng.irange(-2, 2); if (this.canStand(sx, y, sz, MOB_TYPES[type])) this.spawnMob(type, sx + 0.5, y, sz + 0.5); }
          }
        }
      }
    }
    // Monster spawners
    for (const c of gg.world.chunks.values()) {
      if (!c.tiles.size || Math.abs(c.cx - gg.ChunkManager.pcx) > 2 || Math.abs(c.cz - gg.ChunkManager.pcz) > 2) continue;
      for (const [i, t] of c.tiles) if (t.type === 'spawner') {
        const x = c.cx * 16 + (i >> 11), y = i & 127, z = c.cz * 16 + ((i >> 7) & 15);
        if (dist2(x, y, z, p.x, p.y, p.z) > 256) continue;
        if (--t.cooldown > 0) continue;
        t.cooldown = 200 + rng.int(600);
        if (peaceful || hostile > 30) continue;
        for (let k = 0; k < 4; k++) { const sx = x + rng.irange(-4, 4), sz = z + rng.irange(-4, 4), sy = y + rng.irange(-1, 1); if (this.canStand(sx, sy, sz, MOB_TYPES[t.mob])) { this.spawnMob(t.mob, sx + 0.5, sy, sz + 0.5); gg.Particles.burst(sx + 0.5, sy + 1, sz + 0.5, 10, [0.9, 0.9, 0.9]); if (rng.chance(0.5)) break; } }
      }
    }
  },

  // ---- Per-tick AI (20 Hz) ----
  tick() {
    const p = gg.player, day = Sky.dayFactor;
    for (const m of this.list) {
      if (m.dead) continue;
      const d = m.def;
      m.age++;
      const dist = Math.sqrt(dist2(m.x, m.y, m.z, p.x, p.y, p.z));
      if (dist > 110 || (isMonster(d) && dist > 40 && rng.chance(1 / 1200))) { this.remove(m); continue; }
      if (m.attackCooldown > 0) m.attackCooldown--;
      if (m.stateTimer > 0) m.stateTimer -= TICK_DT;
      // Burn in daylight
      if (d.food === 'darkness' && day > 0.6 && gg.world.getSky(floor(m.x), floor(m.y + m.h), floor(m.z)) === 15 && gg.world.getBlock(floor(m.x), floor(m.y), floor(m.z)) !== B.water) m.fire = Math.max(m.fire, 30);
      const feet = gg.world.getDef(floor(m.x), floor(m.y), floor(m.z));
      if (feet.id === B.lava || feet.id === B.fire) m.fire = 100;
      if (feet.id === B.water) m.fire = 0;
      if (m.fire > 0) { m.fire--; if (m.age % 20 === 0) this.hurt(m, 1, 'fire'); if (rng.chance(0.3)) gg.Particles.burst(m.x, m.y + m.h * 0.5, m.z, 1, [1, 0.5, 0.1], 1); }
      if (feet.id === B.cactus && m.age % 10 === 0) this.hurt(m, 1, 'cactus');
      if (dist < 20 && rng.chance(1 / 300)) gg.res_vam.a.mob(m.type, [m.x, m.y + m.h * 0.8, m.z]);
      // Behaviour
      const canSeePlayer = !p.dead && !gg.Player.isCreative() && dist < 24;
      if (isMonster(d) && canSeePlayer) {
        m.state = 'chase';
        const dx = p.x - m.x, dz = p.z - m.z, hd = Math.hypot(dx, dz) || 1;
        m.yaw = Math.atan2(-dx, -dz);
        if (d.ranged) {
          if (hd < 5) { m.moveX = -dx / hd; m.moveZ = -dz / hd; } else if (hd > 9) { m.moveX = dx / hd; m.moveZ = dz / hd; } else { m.moveX = -dz / hd * 0.6; m.moveZ = dx / hd * 0.6; }
          if (m.attackCooldown <= 0 && hd < 16 && this.lineOfSight(m)) { m.attackCooldown = 40; const ex = m.x, ey = m.y + m.h - 0.3, ez = m.z; const tx = p.x - ex, ty = p.y + 1.2 - ey + hd * 0.05, tz = p.z - ez; const l = Math.hypot(tx, ty, tz); gg.Entities.spawnArrow(ex, ey, ez, tx / l * 24, ty / l * 24, tz / l * 24, 'skeleton', 2 + rng.int(3)); }
        } else if (d.food === 'gunpowder') {
          m.moveX = dx / hd; m.moveZ = dz / hd;
          if (hd < 3) { if (m.fuse < 0) m.fuse = 30; } else if (hd > 6) m.fuse = -1;
          if (m.fuse >= 0) { m.fuse--; if (m.fuse <= 0) { this.remove(m); gg.Entities.explode(m.x, m.y + 0.5, m.z, 3); continue; } }
        } else {
          m.moveX = dx / hd; m.moveZ = dz / hd;
          if (hd < 1.8 && Math.abs(p.y - m.y) < 2 && m.attackCooldown <= 0) { m.attackCooldown = 20; gg.Player.damage(d.damage, 'was slain by a ' + d.name, [dx / hd * 6, 3, dz / hd * 6]); }
        }
      } else if (!isMonster(d) && m.state !== 'flee' && !p.dead && dist < 8 && gg.Player.held()?.name === d.food) {
        // Animals follow a player holding their food, stopping at arm's length
        m.state = 'follow'; m.stateTimer = 1;
        const dx = p.x - m.x, dz = p.z - m.z, hd = Math.hypot(dx, dz) || 1, go = hd > 2 ? 0.8 : 0;
        m.moveX = dx / hd * go; m.moveZ = dz / hd * go; m.yaw = Math.atan2(-dx, -dz);
      } else if (m.state === 'flee' && m.stateTimer > 0) {
        const dx = m.x - m.fleeFrom[0], dz = m.z - m.fleeFrom[2], hd = Math.hypot(dx, dz) || 1;
        m.moveX = dx / hd; m.moveZ = dz / hd; m.yaw = Math.atan2(-m.moveX, -m.moveZ);
      } else if (m.stateTimer <= 0) {
        if (m.state === 'wander' || m.state === 'chase' || m.state === 'flee' || m.state === 'follow') { m.state = 'idle'; m.stateTimer = rng.range(1, 4); m.moveX = m.moveZ = 0; }
        else { m.state = 'wander'; m.stateTimer = rng.range(2, 5); const a = rng.next() * Math.PI * 2; m.moveX = Math.sin(a); m.moveZ = Math.cos(a); m.yaw = Math.atan2(-m.moveX, -m.moveZ); }
      }
      if (m.steerCd > 0) m.steerCd--;
      // In water (not chasing): swim toward the nearest shore instead of bobbing in place
      if (m.inWater && m.state !== 'chase' && m.steerCd <= 0) {
        const a = this.shoreDir(m);
        if (a !== null) { m.state = 'wander'; m.stateTimer = 3; m.moveX = Math.sin(a); m.moveZ = Math.cos(a); m.yaw = Math.atan2(-m.moveX, -m.moveZ); }
        m.steerCd = c_MobAI.steerCd;
      }
      // Avoid water / cliffs while wandering: re-plan once (with cooldown) instead of reversing every tick
      if (m.state === 'wander' && !m.inWater && m.steerCd <= 0 && !this.safeStep(m, m.moveX, m.moveZ)) this.steer(m);
      // Sheep regrow wool by "eating grass"
      if (m.type === 'sheep' && m.sheared && --m.regrow <= 0) { m.sheared = false; this.rebuild(m); }
      // Passive mobs look at nearby player
      if (!isMonster(d) && dist < 6 && m.state === 'idle') m.yaw = Math.atan2(-(p.x - m.x), -(p.z - m.z));
    }
  },
  // Is one step ahead along (dx,dz) dry and at most maxDrop down?
  safeStep(m, dx, dz) {
    const ax = floor(m.x + dx * 1.2), az = floor(m.z + dz * 1.2), ay = floor(m.y);
    const at = (dy) => gg.world.getDef(ax, ay + dy, az);
    if (at(0).liquid || at(0).solid && (at(1).solid || at(2).solid)) return false;
    for (let dy = at(0).solid ? 0 : -1; dy >= -c_MobAI.maxDrop; dy--) { const d = at(dy); if (d.liquid) return false; if (d.solid) return true; }
    return false;
  },
  // Pick a new safe heading (random start, evenly spaced); none -> stand still
  steer(m) {
    const n = c_MobAI.steerTries, a0 = rng.next() * Math.PI * 2;
    const a = [...Array(n).keys()].map(i => a0 + i * Math.PI * 2 / n).find(a => this.safeStep(m, Math.sin(a), Math.cos(a)));
    m.steerCd = c_MobAI.steerCd;
    if (a === undefined) { m.state = 'idle'; m.stateTimer = rng.range(1, 3); m.moveX = m.moveZ = 0; return; }
    m.moveX = Math.sin(a); m.moveZ = Math.cos(a); m.yaw = Math.atan2(-m.moveX, -m.moveZ);
  },
  // Heading (rad) to the nearest dry, standable cell around the water surface, or null
  shoreDir(m) {
    const x = floor(m.x), z = floor(m.z), y = floor(m.y + 0.5);
    for (let r = 1; r <= c_MobAI.shoreScan; r++) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, sx = floor(m.x + Math.sin(a) * r), sz = floor(m.z + Math.cos(a) * r);
      if (sx === x && sz === z) continue;
      for (const dy of [0, 1]) if (gg.world.isSolid(sx, y + dy - 1, sz) && !gg.world.isSolid(sx, y + dy, sz) && !gg.world.getDef(sx, y + dy, sz).liquid) return a;
    }
    return null;
  },
  lineOfSight(m) { const ox = m.x, oy = m.y + m.h - 0.3, oz = m.z, dx = gg.player.x - ox, dy = gg.player.y + 1 - oy, dz = gg.player.z - oz, l = Math.hypot(dx, dy, dz); return !gg.Interaction.raycast(ox, oy, oz, dx / l, dy / l, dz / l, l); },
  rebuild(m) { this.scene.remove(m.mesh); this.buildModel(m); this.scene.add(m.mesh); },

  // ---- Per-frame movement + animation ----
  update(dt) {
    for (const m of this.list) {
      if (m.dead) {
        m.deathTimer += dt;
        m.mesh.rotation.z = Math.min(Math.PI / 2, m.deathTimer * 4);
        if (m.deathTimer > 0.7) { this.scene.remove(m.mesh); m.removed = true; }
        continue;
      }
      const d = m.def, speed = d.speed * (m.state === 'flee' ? 1.5 : 1) * (m.fuse >= 0 ? 0 : 1);
      // Water: float on a damped spring around (surface - float*h); no threshold toggling
      const fx = floor(m.x), fz = floor(m.z), isW = (yy) => gg.world.getBlock(fx, yy, fz) === B.water;
      const inWater = m.inWater = isW(floor(m.y)) || isW(floor(m.y + 0.4));
      const k = 1 - Math.exp(-(m.onGround || m.aj || inWater ? 10 : 2) * dt);
      m.vx += (m.moveX * speed - m.vx) * k; m.vz += (m.moveZ * speed - m.vz) * k;
      let surf = 0;
      if (inWater) {
        let yy = floor(m.y); while (isW(yy + 1) && yy < m.y + 4) yy++;
        surf = yy + 0.9;
        m.vy += ((surf - m.h * c_MobAI.float - m.y) * c_MobAI.buoy - m.vy * c_MobAI.buoyDamp) * dt;
      } else m.vy = Math.max(m.vy - gg.Physics.GRAVITY * (m.aj || 1) * dt, -gg.Physics.TERMINAL);
      const prevOnGround = m.onGround;
      gg.Physics.move(m, m.vx * dt, m.vy * dt, m.vz * dt);
      // Jumps: same MC auto-jump as the player (real arc, aj gravity scale); swimming mobs climb out at the shore
      if (m.aj && (m.onGround || inWater)) m.aj = 0;
      if (inWater) { if ((m.hitX || m.hitZ) && m.y > surf - m.h) m.vy = Math.max(m.vy, c_MobAI.climbVy); }
      else gg.Player.autoJump(m, m.moveX, m.moveZ, prevOnGround);
      if ((m.hitX || m.hitZ) && !m.aj && !inWater && m.state === 'wander' && m.steerCd <= 0) this.steer(m);
      if (!prevOnGround && m.onGround && m.fallStart !== undefined) { const fd = m.fallStart - m.y; if (fd > 3) this.hurt(m, floor(fd - 3), 'fall'); }
      if (m.onGround || inWater) m.fallStart = m.y; else if (m.fallStart === undefined || m.y > m.fallStart) m.fallStart = m.y;
      // Animation
      const hs = Math.hypot(m.vx, m.vz);
      m.walkPhase += hs * dt * 4;
      const swing = Math.sin(m.walkPhase) * Math.min(1, hs) * 0.7;
      m.parts.legs.forEach((l, i) => { l.rotation.x = swing * (i % 2 ? -1 : 1) * (i >= 2 ? -1 : 1); });
      if (m.type === 'skeleton') { /* arms hold the bow */ } else m.parts.arms.forEach((a, i) => { if (m.type !== 'zombie') a.rotation.x = swing * (i % 2 ? 1 : -1) * 0.8; });
      // Visual easing (c_Motion.eyeEase, like the camera): step-ups glide, drops follow at once; yaw turns the short way
      const ease = 1 - Math.pow(1 - gg.c_Motion.eyeEase, dt * TICK_RATE);
      m.ry = m.y < m.ry ? m.y : m.ry + (m.y - m.ry) * ease;
      m.ryaw += (Math.atan2(Math.sin(m.yaw - m.ryaw), Math.cos(m.yaw - m.ryaw))) * (1 - Math.pow(1 - c_MobAI.yawEase, dt * TICK_RATE));
      m.mesh.position.set(m.x, m.ry, m.z);
      m.mesh.rotation.y = m.ryaw;
      if (m.fuse >= 0) { const s = 1 + (30 - m.fuse) / 30 * 0.25; m.mesh.scale.set(s, s, s); }
      // Hurt flash & lighting
      if (m.hurtTimer > 0) m.hurtTimer -= dt;
      if (m.hpTimer > 0) { m.hpTimer -= dt; if (m.hpTimer <= 0) m.parts.hp.visible = false; }
      m.lightTimer -= dt;
      if (m.lightTimer <= 0 || m.hurtTimer > 0) {
        m.lightTimer = 0.25;
        const l = clamp(gg.world.getLightLevel(floor(m.x), floor(m.y + 0.5), floor(m.z), Sky.dayFactor) / 15, 0.12, 1);
        const br = 0.15 + 0.85 * l, red = m.hurtTimer > 0 ? 1 : 0;
        m.mesh.traverse(o => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach((mt, i) => { const b = o.userData.baseColors[i]; mt.color.setRGB(Math.min(1, b.r * br + red * 0.6), b.g * br * (1 - red * 0.6), b.b * br * (1 - red * 0.6)); }); } });
      }
    }
    if (this.list.some(m => m.removed)) this.list = this.list.filter(m => !m.removed);
  },

  hurt(m, amount, source, kb) {
    if (m.dead) return;
    m.health -= amount; m.hurtTimer = 0.35; gg.res_vam.a.mob(m.type, [m.x, m.y + 1, m.z], true);
    if (kb) { m.vx += kb[0]; m.vy += kb[1]; m.vz += kb[2]; }
    this.updateHealthBar(m);
    if (!isMonster(m.def)) { m.state = 'flee'; m.stateTimer = 4; m.fleeFrom = [gg.player.x, gg.player.y, gg.player.z]; }
    if (m.health <= 0) this.kill(m);
  },
  kill(m) {
    m.dead = true; m.deathTimer = 0; m.parts.hp.visible = false;
    gg.Particles.burst(m.x, m.y + m.h / 2, m.z, 12, [0.6, 0.6, 0.6], 2);
    for (const [item, a, b] of m.def.drops) { const n = rng.irange(a, b); if (n > 0) gg.Entities.spawnItem(m.x, m.y + 0.5, m.z, { name: item, count: n }); }
    if (m.type === 'sheep' && !m.sheared) gg.Entities.spawnItem(m.x, m.y + 0.5, m.z, { name: m.color + '_wool', count: 1 });
  },
  remove(m) { this.scene.remove(m.mesh); m.removed = true; m.dead = true; },
  shear(m) {
    if (m.sheared) return false;
    m.sheared = true; m.regrow = 1200 + rng.int(1200);
    const n = rng.irange(1, 3);
    gg.Entities.spawnItem(m.x, m.y + 0.6, m.z, { name: m.color + '_wool', count: n });
    this.rebuild(m);
    return true;
  },
  // Ray vs mob AABBs; returns the nearest mob within maxDist or null
  raycast(o, d, maxDist) {
    let best = null, bd = maxDist;
    for (const m of this.list) {
      if (m.dead) continue;
      const r = gg.rayBox(o[0], o[1], o[2], d[0], d[1], d[2], m.x - m.w, m.y, m.z - m.w, m.x + m.w, m.y + m.h, m.z + m.w);
      if (r && r[0] < bd) { bd = r[0]; best = m; }
    }
    return best;
  }
};
Object.values(Mobs).length; // (namespace ready)
Events.on('tick', () => { Mobs.tick(); Mobs.spawnTick(); });
/* ============================================================================
   16. SIMULATION — fluids, gravity blocks, fire, random ticks (farming, grass,
       saplings, leaves), redstone
   ========================================================================== */
/* ---- Fluids: Minecraft-style cellular flow -----------------------------------
   meta 0 = source, 1..7 = flowing (7 = thinnest), 8 = falling column.
   Strength = 8 for source/falling, 8-meta for flowing; water loses 1 per block,
   lava 2. A cell that can flow down ONLY flows down (no sideways sheet in mid-air)
   unless it is a source with >=3 source neighbours. Cells that can't fall spread
   sideways to every open side (or, with seek>0, toward the nearest drop like MC), so a
   source on a 1x1 pillar makes a cross that wraps the pillar and pours down;
   landing columns spread again with decay. Liquid over the same liquid (a pool)
   does not spread. Water + lava -> obsidian (source) / cobblestone (flowing). */
// Fluid kinds (declarative). seek: MC slope search radius (water 4 / lava 2) = only flow toward the nearest drop; 0 = spread to every open side
const FLUID = {
  water: { delay: 5,  drop: 1, seek: 0 },
  lava:  { delay: 25, drop: 2, seek: 0 },
};
const c_Flow = { hardenDirs: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]], NONE: 1000 };
const Fluids = gg.my(new class Fluids {
  schedule(x, y, z, delay) { Scheduler.add(x, y, z, delay, TICK_FLUID); }
  kind(id) { return id === B.water ? 'water' : 'lava'; }
  strength(id, meta) { return meta === 0 || meta >= 8 ? 8 : 8 - meta; }
  delay(id) { return FLUID[this.kind(id)].delay; }
  isSource(id, x, y, z) { return gg.world.getBlock(x, y, z) === id && gg.world.getMeta(x, y, z) === 0; }
  // MC "water hole": the cell below accepts fluid or already holds this fluid -> don't spread sideways
  hole(id, x, y, z) { if (y < 0) return false; const b = gg.world.getBlock(x, y, z); return b === id || this.canFlowInto(id, b, x, y, z); }
  passable(id, x, y, z) { const n = gg.world.getBlock(x, y, z); return this.canFlowInto(id, n, x, y, z); }
  tick(x, y, z) {
    const id = gg.world.getBlock(x, y, z);
    if (!isLiquidId(id)) return;
    const K = this.kind(id), drop = FLUID[K].drop, meta = gg.world.getMeta(x, y, z);
    if (id === B.lava && c_Flow.hardenDirs.some(d => gg.world.getBlock(x + d[0], y + d[1], z + d[2]) === B.water)) {
      gg.world.setBlock(x, y, z, meta === 0 ? B.obsidian : B.cobblestone); gg.Particles.burst(x + 0.5, y + 1, z + 0.5, 10, [0.4, 0.4, 0.4]); return;
    }
    // 1. Re-evaluate supply of non-source cells
    let m = meta;
    if (meta !== 0) {
      const side = HDIRS.map(d => [x + d[0], z + d[2]]).filter(([nx, nz]) => gg.world.getBlock(nx, y, nz) === id).map(([nx, nz]) => gg.world.getMeta(nx, y, nz));
      const srcN = side.filter(v => v === 0).length, best = side.reduce((b, v) => Math.max(b, this.strength(id, v)), 0) - drop;
      const bd = gg.world.getDef(x, y - 1, z);
      m = (K === 'water' && srcN >= 2 && (bd.solid || this.isSource(id, x, y - 1, z))) ? 0
        : gg.world.getBlock(x, y + 1, z) === id ? 8 : best > 0 ? 8 - best : -1;
      if (m < 0) { gg.world.setBlock(x, y, z, AIR, 0); return; }
      if (m !== meta) gg.world.setBlock(x, y, z, id, m); // notifies neighbours + reschedules
    }
    // 2. Fall: only straight down (mid-air sources need 3 source neighbours to also spread)
    const below = gg.world.getBlock(x, y - 1, z);
    if (y > 0 && this.canFlowInto(id, below, x, y - 1, z)) {
      if (!this.interact(id, x, y - 1, z) && !(below === id && gg.world.getMeta(x, y - 1, z) >= 8)) { this.wash(x, y - 1, z); gg.world.setBlock(x, y - 1, z, id, 8); }
      if (m === 0 && HDIRS.filter(d => this.isSource(id, x + d[0], y, z + d[2])).length >= 3) this.spread(id, x, y, z, m, drop, K);
      return;
    }
    // 3. Resting on something: sources always spread, flowing only if not sitting on a pool/hole
    if (m === 0 || !this.hole(id, x, y - 1, z)) this.spread(id, x, y, z, m, drop, K);
  }
  spread(id, x, y, z, m, drop, K) {
    const next = this.strength(id, m) - drop;
    if (next < 1) return;
    for (const i of this.flowDirs(id, x, y, z, FLUID[K].seek)) {
      const d = HDIRS[i], nx = x + d[0], nz = z + d[2], nid = gg.world.getBlock(nx, y, nz);
      if (this.interact(id, nx, y, nz)) continue;
      if (nid === id) { if (this.strength(id, gg.world.getMeta(nx, y, nz)) >= next) continue; }
      else this.wash(nx, y, nz);
      gg.world.setBlock(nx, y, nz, id, 8 - next);
    }
  }
  // Directions with minimal distance to a drop (all passable dirs when no drop is in reach)
  flowDirs(id, x, y, z, max) {
    const open = [0, 1, 2, 3].filter(i => this.passable(id, x + HDIRS[i][0], y, z + HDIRS[i][2]));
    if (max <= 0) return open;
    const cand = open.map(i => [i, this.hole(id, x + HDIRS[i][0], y - 1, z + HDIRS[i][2]) ? 0 : this.slope(id, x + HDIRS[i][0], y, z + HDIRS[i][2], i ^ 1, 1, max)]);
    const min = cand.reduce((a, c) => Math.min(a, c[1]), c_Flow.NONE);
    return cand.filter(c => c[1] === min).map(c => c[0]);
  }
  slope(id, x, y, z, from, depth, max) {
    let best = c_Flow.NONE;
    for (let i = 0; i < 4; i++) {
      if (i === from) continue;
      const nx = x + HDIRS[i][0], nz = z + HDIRS[i][2];
      if (!this.passable(id, nx, y, nz)) continue;
      if (this.hole(id, nx, y - 1, nz)) return depth;
      if (depth < max) best = Math.min(best, this.slope(id, nx, y, nz, i ^ 1, depth + 1, max));
    }
    return best;
  }
  // Washable = non-solid attached blocks (torches, plants, crops, snow layers): fluids pop them as items.
  washable(nd) { return !nd.solid && !nd.liquid && (nd.replaceable || !!nd.needsSupport); }
  canFlowInto(id, nid, x, y, z) {
    if (nid === AIR) return true;
    const nd = Blocks.byId[nid];
    if (nd.liquid) return nid === id ? gg.world.getMeta(x, y, z) !== 0 : true;
    return this.washable(nd);
  }
  wash(x, y, z) {
    const nid = gg.world.getBlock(x, y, z); if (nid === AIR) return;
    const nd = Blocks.byId[nid]; if (nd.liquid || nd.replaceable && nid !== B.snow) return;
    for (const dr of blockDrops(nd, gg.world.getMeta(x, y, z), null)) gg.Entities.spawnItem(x + 0.5, y + 0.5, z + 0.5, { name: dr.item, count: dr.count });
  }
  // Water/lava interaction at the destination block. Returns true if handled.
  interact(id, x, y, z) {
    const nid = gg.world.getBlock(x, y, z);
    if (nid === B.lava && id === B.water) { gg.world.setBlock(x, y, z, gg.world.getMeta(x, y, z) === 0 ? B.obsidian : B.cobblestone); gg.Particles.burst(x + 0.5, y + 1, z + 0.5, 10, [0.4, 0.4, 0.4]); return true; }
    if (nid === B.water && id === B.lava) { gg.world.setBlock(x, y, z, B.cobblestone); gg.Particles.burst(x + 0.5, y + 1, z + 0.5, 10, [0.4, 0.4, 0.4]); return true; }
    return false;
  }
});

/* ---- Fire ------------------------------------------------------------------ */
const Fire = {
  flammableNeighbor(x, y, z) { for (const d of DIRS) if (Blocks.byId[gg.world.getBlock(x + d[0], y + d[1], z + d[2])].flammable) return true; return false; },
  tick(x, y, z) {
    if (gg.world.getBlock(x, y, z) !== B.fire) return;
    if (Weather.raining && gg.world.getSky(x, y, z) === 15) { gg.world.setBlock(x, y, z, AIR); return; }
    const age = gg.world.getMeta(x, y, z);
    const flam = this.flammableNeighbor(x, y, z);
    if (!flam && (!gg.world.isSolid(x, y - 1, z) || age > 3)) { gg.world.setBlock(x, y, z, AIR); return; }
    if (age > 15 + rng.int(10)) { gg.world.setBlock(x, y, z, AIR); return; }
    gg.world.setMeta(x, y, z, Math.min(15, age + 1));
    // Burn / spread
    for (const d of DIRS) {
      const nx = x + d[0], ny = y + d[1], nz = z + d[2], nd = gg.world.getDef(nx, ny, nz);
      if (nd.flammable && rng.chance(nd.flammable / 300)) gg.world.setBlock(nx, ny, nz, rng.chance(0.5) ? B.fire : AIR, 0);
    }
    if (rng.chance(0.25)) {
      const nx = x + rng.irange(-1, 1), ny = y + rng.irange(-1, 2), nz = z + rng.irange(-1, 1);
      if (gg.world.getBlock(nx, ny, nz) === AIR && this.flammableNeighbor(nx, ny, nz)) gg.world.setBlock(nx, ny, nz, B.fire, 0);
    }
    Scheduler.add(x, y, z, 10 + rng.int(20), TICK_FIRE);
  }
};

/* ---- Scheduled tick dispatcher --------------------------------------------- */
function runScheduledTick(x, y, z, type) {
  if (type === TICK_FLUID) Fluids.tick(x, y, z);
  else if (type === TICK_FALL) {
    const id = gg.world.getBlock(x, y, z); const def = Blocks.byId[id];
    if (!def.gravity) return;
    const bdef = gg.world.getDef(x, y - 1, z);
    if (y > 0 && !bdef.solid) {
      if (bdef.id !== AIR && !bdef.liquid) gg.Interaction.breakBlock(x, y - 1, z, true, null);
      gg.world.setBlock(x, y, z, AIR, 0);
      gg.world.setBlock(x, y - 1, z, id, 0);
      Scheduler.add(x, y - 1, z, 2, TICK_FALL);
    }
  }
  else if (type === TICK_FIRE) Fire.tick(x, y, z);
}

// React to block changes: fluids flow, gravity blocks fall, fire starts, redstone updates
Events.on('blockChanged', (x, y, z, oldId, newId) => {
  const nd = Blocks.byId[newId];
  if (nd.liquid) Fluids.schedule(x, y, z, Fluids.delay(newId));
  if (nd.gravity) Scheduler.add(x, y, z, 2, TICK_FALL);
  if (newId === B.fire) Scheduler.add(x, y, z, 10, TICK_FIRE);
  for (const d of DIRS) {
    const nx = x + d[0], ny = y + d[1], nz = z + d[2], nid = gg.world.getBlock(nx, ny, nz);
    if (nid === AIR) continue;
    const ndef = Blocks.byId[nid];
    if (ndef.liquid) Fluids.schedule(nx, ny, nz, Fluids.delay(nid));
    if (ndef.gravity && d[1] === 1) Scheduler.add(nx, ny, nz, 2, TICK_FALL);
  }
  if (newId === B.wheat || oldId === B.wheat) { /* crops handled by random ticks */ }
});

/* ---- Random ticks ------------------------------------------------------------ */
const RandomTicks = {
  lightAbove(x, y, z) { return gg.world.getLightLevel(x, y + 1, z, Sky.dayFactor); },
  tick() {
    const pcx = gg.ChunkManager.pcx, pcz = gg.ChunkManager.pcz;
    for (let cx = pcx - 4; cx <= pcx + 4; cx++) for (let cz = pcz - 4; cz <= pcz + 4; cz++) {
      const c = gg.world.getChunk(cx, cz); if (!c || c.state < gg.CH_LIT) continue;
      for (let n = 0; n < 24; n++) {
        const lx = rng.int(16), lz = rng.int(16), y = rng.int(CHUNK_H);
        const id = c.blocks[bidx(lx, y, lz)]; if (id === AIR) continue;
        const def = Blocks.byId[id]; if (!def.onRandomTick) continue;
        def.onRandomTick(cx * 16 + lx, y, cz * 16 + lz, c.meta[bidx(lx, y, lz)]);
      }
    }
  }
};
(function defineRandomTickBehaviour() {
  const bn = Blocks.byName;
  bn.grass_block.onRandomTick = (x, y, z, meta) => {
    const above = gg.world.getDef(x, y + 1, z);
    if (above.opaque || above.liquid) { gg.world.setBlock(x, y, z, B.dirt, 0); return; }
    if (RandomTicks.lightAbove(x, y, z) < 9) return;
    for (let i = 0; i < 4; i++) {
      const nx = x + rng.irange(-1, 1), ny = y + rng.irange(-3, 1), nz = z + rng.irange(-1, 1);
      if (gg.world.getBlock(nx, ny, nz) === B.dirt && !gg.world.getDef(nx, ny + 1, nz).opaque && RandomTicks.lightAbove(nx, ny, nz) >= 4) gg.world.setBlock(nx, ny, nz, B.grass_block, meta);
    }
  };
  bn.farmland.onRandomTick = (x, y, z, meta) => {
    let wet = false;
    for (let dx = -4; dx <= 4 && !wet; dx++) for (let dz = -4; dz <= 4 && !wet; dz++) for (let dy = 0; dy <= 1; dy++) if (gg.world.getBlock(x + dx, y + dy, z + dz) === B.water) { wet = true; break; }
    if (wet) { if (meta !== 7) gg.world.setMeta(x, y, z, 7); }
    else if (meta > 0) gg.world.setMeta(x, y, z, meta - 1);
    else if (gg.world.getBlock(x, y + 1, z) !== B.wheat) gg.world.setBlock(x, y, z, B.dirt, 0);
  };
  bn.wheat.onRandomTick = (x, y, z, meta) => {
    if (meta >= 7 || RandomTicks.lightAbove(x, y - 1, z) < 9) return;
    const moist = gg.world.getMeta(x, y - 1, z) > 0;
    if (rng.chance(moist ? 0.3 : 0.12)) gg.world.setMeta(x, y, z, meta + 1);
  };
  for (const w of ['oak', 'birch', 'spruce']) bn[w + '_sapling'].onRandomTick = (x, y, z) => {
    if (RandomTicks.lightAbove(x, y - 1, z) < 9 || !rng.chance(0.15)) return;
    gg.world.setBlock(x, y, z, AIR, 0);
    Terrain.placeTree(x, y, z, w === 'spruce' ? BIO_TAIGA : w === 'birch' ? BIO_BIRCH : BIO_FOREST, rng);
  };
  for (const w of ['oak', 'birch', 'spruce']) bn[w + '_leaves'].onRandomTick = (x, y, z) => {
    if (!rng.chance(0.3)) return;
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) if (isLog(gg.world.getBlock(x + dx, y + dy, z + dz))) return;
    gg.Interaction.breakBlock(x, y, z, true, null);
  };
  bn.lava.onRandomTick = (x, y, z) => {
    if (!rng.chance(0.1)) return;
    const nx = x + rng.irange(-1, 1), ny = y + rng.irange(0, 1), nz = z + rng.irange(-1, 1);
    if (gg.world.getBlock(nx, ny, nz) === AIR && Fire.flammableNeighbor(nx, ny, nz)) gg.world.setBlock(nx, ny, nz, B.fire, 0);
  };
  bn.cactus.onRandomTick = (x, y, z) => {
    if (gg.world.getBlock(x, y + 1, z) !== AIR || !rng.chance(0.05)) return;
    let h = 1; while (gg.world.getBlock(x, y - h, z) === B.cactus) h++;
    if (h < 3) gg.world.setBlock(x, y + 1, z, B.cactus, 0);
  };
  bn.snow.onRandomTick = (x, y, z) => { if (gg.world.getBlockLight(x, y, z) >= 12) gg.world.setBlock(x, y, z, AIR, 0); };
  bn.ice.onRandomTick = (x, y, z) => { if (gg.world.getBlockLight(x, y, z) >= 11) gg.world.setBlock(x, y, z, B.water, 0); };
  bn.fire.onRandomTick = (x, y, z) => Scheduler.add(x, y, z, 1, TICK_FIRE);
  // Crops are washed away by flowing water: handled because wheat is replaceable? No — keep crops solid to fluids:
  bn.water.onRandomTick = null;
})();

Object.assign(gg, { TICK_FLUID, TICK_FALL, TICK_FIRE, c_MobAI, isMonster, Mobs, FLUID, c_Flow, Fluids, Fire, runScheduledTick, RandomTicks });
})();
