// Game hub: world + player + renderer + 20 TPS simulation loop + camera.
import { World } from '../world/world.js';
import { Player } from '../entity/player.js';
import { Weather, computeEnvironment } from './environment.js';
import { mat4, clamp, lerp } from '../engine/math.js';
import { BLOCKS, TYPE_MASK } from '../world/blocks.js';
import { MIN_Y } from '../world/constants.js';

export const DEFAULT_SETTINGS = {
  renderDistance: 10, fov: 70, sensitivity: 0.5, viewBobbing: true, guiScale: 0, shaders: true, shaderQuality: 'auto',
  clouds: 'fancy', gamma: 0.5, music: 0.5, sound: 1, smoothLighting: true, renderScale: 0, showFps: false, waterStyle: 'shader',
};

export class Game {
  constructor({ canvas, renderer, atlas, input, settings, biomes }) {
    this.canvas = canvas; this.renderer = renderer; this.atlas = atlas; this.input = input;
    this.settings = settings;
    this.biomes = biomes || [];
    this.tickTime = 0;
    this.renderTime = 0;
    this.paused = false;
    this.camera = { pos: [0, 80, 0], yaw: 0, pitch: 0, fov: 70, look: [0, 0, 1], view: mat4.create(), thirdPerson: 0 };
    this.entities = [];
    this.listeners = [];
    this.frameListeners = [];
    this.tickListeners = [];
    this.fps = 0; this._fpsFrames = 0; this._fpsTime = 0;
    this.lastFrame = performance.now();
  }

  async loadWorld({ seed, name, storage, gamemode = 'survival', playerData = null }) {
    this.seed = seed; this.worldName = name;
    const biomeColors = {
      grass: this.biomes.map(b => b.grassColor ?? 0x91bd59),
      foliage: this.biomes.map(b => b.foliageColor ?? 0x77ab2f),
      water: this.biomes.map(b => b.waterColor ?? 0x3f76e4),
    };
    this.world = new World({
      seed, renderDistance: this.settings.renderDistance, texLayers: this.atlas.layers, biomeColors, storage,
      onMesh: (c, msg) => this.renderer.uploadChunk(c, msg),
      onUnload: (c) => this.renderer.removeChunk(c),
    });
    this.world.game = this;
    await this.world.ready();
    this.weather = new Weather(seed);
    this.player = new Player(this.world);
    this.player.setGamemode(gamemode);
    if (playerData) {
      this.player.setPos(...playerData.pos);
      this.player.yaw = playerData.yaw; this.player.pitch = playerData.pitch;
      Object.assign(this.player, playerData.stats || {});
      this.world.time = playerData.time ?? 1000;
      this.spawnPoint = playerData.spawn;
    } else {
      const sp = await this.world.findSpawn();
      this.spawnPoint = sp;
      this.player.setPos(sp[0], sp[1], sp[2]);
    }
    this.player.prevPos = this.player.pos.slice();
  }

  biomeAtCamera() {
    if (!this.world) return {};
    const b = this.world.biomeAt(Math.floor(this.camera.pos[0]), Math.floor(this.camera.pos[2]));
    return this.biomes[b] || {};
  }
  cameraBrightness() {
    const [s] = this.world.getLight(Math.floor(this.camera.pos[0]), Math.floor(this.camera.pos[1]), Math.floor(this.camera.pos[2]));
    return s / 15;
  }

  // waits until the chunks around the player are meshed
  async waitForSpawnArea(onProgress) {
    const p = this.player;
    const need = Math.min(4, this.settings.renderDistance);
    const t0 = performance.now();
    return new Promise((res) => {
      const check = () => {
        this.world.update(p.pos[0], p.pos[2]);
        let done = 0, total = 0;
        const pcx = Math.floor(p.pos[0]) >> 4, pcz = Math.floor(p.pos[2]) >> 4;
        for (let dz = -need; dz <= need; dz++) for (let dx = -need; dx <= need; dx++) {
          total++;
          const c = this.world.getChunk(pcx + dx, pcz + dz);
          if (c && c.mesh) done++;
        }
        onProgress?.(done / total);
        if (done >= total || performance.now() - t0 > 30000) res(); else setTimeout(check, 30);
      };
      check();
    });
  }

  // ---- Main loop -----------------------------------------------------------------------------------------
  frame(now) {
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this._fpsFrames++; this._fpsTime += dt;
    if (this._fpsTime >= 1) { this.fps = Math.round(this._fpsFrames / this._fpsTime); this._fpsFrames = 0; this._fpsTime = 0; }
    if (!this.paused) {
      this.tickTime += dt * 20;
      let n = 0;
      while (this.tickTime >= 1 && n < 10) { this.tick(); this.tickTime -= 1; n++; }
      if (n >= 10) this.tickTime = 0;
      this.renderTime += dt;
    }
    const pt = this.paused ? 1 : clamp(this.tickTime, 0, 1);
    this.partialTick = pt;
    this.applyMouse();
    this.updateCamera(pt);
    this.world.update(this.camera.pos[0], this.camera.pos[2]);
    const env = computeEnvironment(this, pt);
    this.env = env;
    const title = this.app && this.app.titleMode;
    env.selection = !title && !this.paused && this.target && !this.target.entity ? this.target : null;
    env.breakStage = !title && this.breakStage ? this.breakStage() : -1;
    env.hideHud = this.hideHud || title;
    for (const fn of this.frameListeners) fn(dt, pt, env);
    this.renderer.updateLightmap({ skyDarken: env.skyDarken, skyFlash: this.weather.flash, gamma: this.settings.gamma, flicker: this.flicker || 0, nightVision: this.player.nightVision || 0 });
    this.renderer.render(this.camera, env);
    this.input.endFrame();
  }

  applyMouse() {
    const [dx, dy] = this.input.takeMouseDelta();
    if (!this.input.locked || this.paused || this.screenOpen) return;
    const s = this.settings.sensitivity * 0.6 + 0.2;
    const k = s * s * s * 8 * 0.15;
    const p = this.player;
    const ride = p.vehicle;
    p.yaw += dx * k;
    p.pitch = clamp(p.pitch + dy * k, -90, 90);
    if (ride && ride.onRiderRotate) ride.onRiderRotate(p);
  }

  tick() {
    const p = this.player;
    this.flicker = (this.flicker || 0) + (Math.random() - Math.random()) * Math.random() * Math.random() * 0.1;
    this.flicker *= 0.9;
    for (const fn of this.tickListeners) fn();
    p.tick();
    this.weather.tick();
    this.world.tick(this);
    this.renderer.tickTextures();
    if (p.pos[1] < MIN_Y - 64) p.damage(4, 'void');
    this.input.endTick();
  }

  updateCamera(pt) {
    const p = this.player, c = this.camera;
    const pos = p.lerpPos(pt);
    const eye = lerp(p.prevEyeH, p.eyeH, pt);
    c.pos = [pos[0], pos[1] + eye, pos[2]];
    c.yaw = p.yaw; c.pitch = p.pitch;
    const fovMod = lerp(p.prevFovMod, p.fovMod, pt);
    let fov = this.settings.fov * fovMod;
    if (p.eyeFluid() === 1) fov *= 6 / 7 + (1 - 6 / 7);
    c.fov = fov;
    const v = mat4.create();
    // hurt camera shake (GameRenderer.bobHurt)
    if (p.hurtTime > 0 || p.health <= 0) {
      let f = p.hurtTime - pt;
      if (p.health <= 0) mat4.rotateZ(v, v, (40 - 8000 / (Math.min(p.deathTime + pt, 20) + 200)) * Math.PI / 180);
      if (f > 0) { f = f / 10; f = Math.sin(f * f * f * f * Math.PI); mat4.rotateZ(v, v, -f * 14 * Math.PI / 180); }
    }
    if (this.settings.viewBobbing && !p.flying && c.thirdPerson === 0) {
      const wd = p.walkDist - p.prevWalkDist;
      const f1 = -(p.walkDist + wd * pt);
      const f2 = lerp(p.oBob, p.bob, pt);
      const tm = mat4.create();
      mat4.translate(tm, tm, [Math.sin(f1 * Math.PI) * f2 * 0.5, -Math.abs(Math.cos(f1 * Math.PI) * f2), 0]);
      mat4.rotateZ(tm, tm, Math.sin(f1 * Math.PI) * f2 * 3 * Math.PI / 180);
      mat4.rotateX(tm, tm, Math.abs(Math.cos(f1 * Math.PI - 0.2) * f2) * 5 * Math.PI / 180);
      mat4.multiply(v, v, tm);
      c.bobMatrix = tm;
    }
    mat4.rotateX(v, v, c.pitch * Math.PI / 180);
    mat4.rotateY(v, v, (c.yaw + 180) * Math.PI / 180);
    // third person
    c.look = [-Math.sin(c.yaw * Math.PI / 180) * Math.cos(c.pitch * Math.PI / 180), -Math.sin(c.pitch * Math.PI / 180), Math.cos(c.yaw * Math.PI / 180) * Math.cos(c.pitch * Math.PI / 180)];
    if (c.thirdPerson) {
      let dir = c.thirdPerson === 2 ? -1 : 1;
      if (c.thirdPerson === 2) { mat4.identity(v); mat4.rotateX(v, v, -c.pitch * Math.PI / 180); mat4.rotateY(v, v, (c.yaw) * Math.PI / 180); }
      // pull back with collision (Camera.getMaxZoom)
      let dist = 4;
      const lx = -c.look[0] * dir, ly = -c.look[1] * dir, lz = -c.look[2] * dir;
      for (let i = 0; i < 8; i++) {
        const ox = ((i & 1) * 2 - 1) * 0.1, oy = (((i >> 1) & 1) * 2 - 1) * 0.1, oz = (((i >> 2) & 1) * 2 - 1) * 0.1;
        const hit = this.world.raycast(c.pos[0] + ox, c.pos[1] + oy, c.pos[2] + oz, lx, ly, lz, dist, {});
        if (hit && hit.dist < dist && BLOCKS[hit.v & TYPE_MASK].solid) dist = hit.dist;
      }
      c.pos = [c.pos[0] + lx * dist, c.pos[1] + ly * dist, c.pos[2] + lz * dist];
    }
    c.view = v;
  }
}
