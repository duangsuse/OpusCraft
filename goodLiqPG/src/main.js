// Application shell: title screen, world lifecycle, input bindings, HUD/screens, audio, persistence.
import { Renderer } from './render/renderer.js';
import { buildBlockTextures } from './textures/atlas.js';
import { Game, DEFAULT_SETTINGS } from './game/game.js';
import { Input } from './game/input.js';
import { InteractionMixin } from './game/interaction.js';
import { GameplayMixin } from './game/gameplay.js';
import { PlayerInventory } from './game/inventory.js';
import { ITEMS, IID } from './game/items.js';
import { Storage } from './game/storage.js';
import { GUI } from './ui/gui.js';
import { HUD } from './ui/hud.js';
import { IconCache } from './ui/icons.js';
import { TitleScreen, WorldListScreen, PauseScreen, DeathScreen, ChatScreen, LoadingScreen } from './ui/screens.js';
import { InventoryScreen, CraftingScreen, ChestScreen, FurnaceScreen, CreativeScreen } from './ui/containers.js';
import { ItemMeshes } from './render/itemrender.js';
import { EntityRenderer } from './render/entities.js';
import { HandRenderer } from './render/hand.js';
import { WorldEntityRenderer } from './render/worldentities.js';
import { Particles } from './render/particles.js';
import { BLOCKS, TYPE_MASK, T_FLUID, ID } from './world/blocks.js';
import { mat4 } from './engine/math.js';
import { soundOf } from './game/interaction.js';

Object.assign(Game.prototype, InteractionMixin, GameplayMixin);

const TITLE_SEED = 1709021;

class App {
  async boot() {
    this.settings = { ...DEFAULT_SETTINGS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('mc.settings') || '{}')); } catch { }
    this.canvas = document.getElementById('game');
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', depth: true });
    if (!gl) { document.body.innerHTML = '<p style="color:#fff;font:16px sans-serif;padding:20px">WebGL2 is required.</p>'; return; }
    this.gui = new GUI(document.getElementById('ui'));
    this.gui.onClick = () => this.audio?.play('random.click', { volume: 0.25 });
    this.loading = new LoadingScreen('Loading resources...');
    this.gui.pushScreen(this.loading);
    this.renderUI();
    this.atlas = await buildBlockTextures(gl);
    this.renderer = new Renderer(this.canvas, this.atlas);
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.renderer.glInfo = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).slice(0, 60) : '';
    this.input = new Input(this.canvas);
    this.input.handlers.push((e) => this.handleKey(e));
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    try { const m = await import('./world/gen/generator.js'); this.biomes = m.BIOMES || []; } catch (e) { this.biomes = []; }
    const biomeColors = { grass: this.biomes.map(b => b.grassColor ?? 0x91bd59), foliage: this.biomes.map(b => b.foliageColor ?? 0x77ab2f), water: this.biomes.map(b => b.waterColor ?? 0x3f76e4) };
    this.itemMeshes = new ItemMeshes(gl, this.atlas, biomeColors, this.renderer.indexBuffer);
    this.icons = new IconCache(this.renderer, this.itemMeshes);
    this.entityRenderer = new EntityRenderer(this.renderer, this.itemMeshes);
    this.particles = new Particles(this.renderer, null);
    this.storage = new Storage();
    this.chatHistory = [];
    try {
      const { AudioEngine } = await import('./audio/audio.js');
      this.audio = new AudioEngine();
      const resume = () => { try { this.audio.resume(); this.applySettings(); } catch (e) { console.warn(e); } };
      window.addEventListener('pointerdown', resume, { once: false });
      window.addEventListener('keydown', resume, { once: false });
    } catch (e) { console.warn('audio unavailable', e); this.audio = null; }
    this.crosshair = this.makeCrosshair();
    this.applySettings();
    this.canvas.addEventListener('mousedown', () => { if (this.inWorld && !this.gui.top() && !this.input.locked) this.input.lock(); });
    window.addEventListener('beforeunload', () => { if (this.inWorld) this.saveWorld(); });
    this.loading.text = 'Building terrain...';
    await this.startTitleWorld();
    this.gui.setScreen(new TitleScreen(this));
    const loop = (t) => { try { this.frame(t); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    window.app = this;
  }

  makeCrosshair() {
    const c = document.createElement('canvas');
    c.width = 15; c.height = 15;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(7, 0, 1, 15); x.fillRect(0, 7, 15, 1);
    Object.assign(c.style, { position: 'absolute', left: '50%', top: '50%', imageRendering: 'pixelated', mixBlendMode: 'difference', pointerEvents: 'none', display: 'none' });
    document.body.appendChild(c);
    return c;
  }

  saveSettings() { try { localStorage.setItem('mc.settings', JSON.stringify(this.settings)); } catch { } }
  applySettings() {
    const s = this.settings;
    this.gui.settingScale = s.guiScale || 0;
    if (this.game) {
      this.game.settings = s;
      if (this.game.world && this.game.world.renderDistance !== s.renderDistance) this.game.world.setRenderDistance(s.renderDistance);
    }
    this.renderer?.setShaderMode?.(s.shaders, s.shaderQuality, s.renderScale ?? 0, s.waterStyle || 'shader');
    if (this.audio && this.audio.ctx) {
      const v = s.volumes || {};
      for (const [k, val] of Object.entries({ master: 1, music: 0.5, blocks: 1, hostile: 1, neutral: 1, player: 1, ambient: 1, weather: 1, ...v })) this.audio.setVolume(k, val);
    }
    this.saveSettings();
  }

  // ---------------------------------------------------------------------------------------------------
  async createGame(seed, gamemode, store, playerData) {
    if (this.game) this.disposeGame();
    const game = new Game({ canvas: this.canvas, renderer: this.renderer, atlas: this.atlas, input: this.input, settings: this.settings, biomes: this.biomes });
    game.app = this;
    game.audio = this.audio;
    game.inventory = new PlayerInventory();
    game.carried = null;
    game.hud = new HUD(this.gui, game, this.icons);
    game.particles = this.particles; this.particles.game = game; this.particles.list = [];
    game.entities = [];
    game.destroyDelay = 0; game.rightClickDelay = 0;
    game.openScreen = (name, data) => this.openContainer(name, data);
    game.hand = new HandRenderer(game, this.entityRenderer, this.itemMeshes);
    game.entityView = new WorldEntityRenderer(game, this.entityRenderer, this.itemMeshes);
    await game.loadWorld({ seed, name: 'world', storage: store, gamemode, playerData });
    if (playerData && playerData.inventory) game.inventory.load(playerData.inventory);
    if (playerData && playerData.selected !== undefined) game.inventory.selected = playerData.selected;
    if (playerData && playerData.weather) game.weather.set(playerData.weather);
    this.installPasses(game);
    this.installTicks(game);
    this.game = game;
    try { const ext = await import('./game/extras.js'); ext.installExtras?.(game, this); } catch (e) { if (!String(e).includes('Failed to fetch')) console.warn(e); }
    return game;
  }

  disposeGame() {
    const g = this.game;
    if (!g) return;
    for (const c of g.world.chunks.values()) this.renderer.removeChunk(c);
    g.world.destroy();
    this.renderer.meshes.clear();
    this.renderer.extraPasses = [];
    this.game = null;
  }

  installPasses(game) {
    const r = this.renderer, er = this.entityRenderer;
    r.extraPasses = [(gl, ctx, pass) => {
      if (pass === 'opaque' || pass === 'shadow') {
        const terrainProg = () => ctx.terrainProgram ? ctx.terrainProgram() : r.vanillaProg.use();
        const lightmap = (s, b) => { const i = (s * 16 + b) * 4, d = r.lightmapData; return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]; };
        const entityBegin = () => er.begin({ ...ctx, lightmap });
        game.entityView.render(gl, ctx, terrainProg, entityBegin);
      } else if (pass === 'translucent') {
        game.particles.render(gl, ctx);
        game.extraTranslucent?.(gl, ctx);
      } else if (pass === 'hand') {
        const terrainProg = () => ctx.terrainProgram ? ctx.terrainProgram() : r.vanillaProg.use();
        const lightmap = (s, b) => { const i = (s * 16 + b) * 4, d = r.lightmapData; return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]; };
        if (this.inWorld && !this.titleMode) game.hand.render(gl, ctx, terrainProg, () => er.begin({ ...ctx, lightmap }));
      } else if (pass === 'clouds' || pass === 'weather') {
        game.extraPass?.(gl, ctx, pass);
      }
    }];
  }

  installTicks(game) {
    const inp = this.input;
    game.tickListeners.push(() => {
      const p = game.player;
      const active = this.inWorld && !this.titleMode && !this.gui.top() && inp.locked;
      if (active) {
        p.input.forward = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
        p.input.strafe = (inp.down('KeyA') ? 1 : 0) - (inp.down('KeyD') ? 1 : 0);
        p.input.jump = inp.down('Space');
        p.input.jumpPressed = inp.pressed.has('Space');
        p.input.sneak = inp.down('ShiftLeft') || inp.down('ShiftRight');
        p.input.sprint = inp.down('ControlLeft') || inp.down('ControlRight');
        const wheel = inp.takeWheel();
        if (wheel) { game.inventory.selected = ((game.inventory.selected + wheel) % 9 + 9) % 9; }
        for (let i = 1; i <= 9; i++) if (inp.consumePressed('Digit' + i)) game.inventory.selected = i - 1;
        if (inp.consumePressed('KeyQ')) {
          const s = game.inventory.held();
          if (s) { const n = inp.down('ControlLeft') ? s.count : 1; game.playerDrop({ ...s, count: n }); game.inventory.consumeHeld(n); game.swing(); }
        }
        if (p.vehicle && p.input.sneak) game.dismount?.();
      } else {
        p.input.forward = 0; p.input.strafe = 0; p.input.jump = false; p.input.sneak = p.sneaking && false; p.input.sprint = false; p.input.jumpPressed = false;
      }
      if (!this.titleMode) game.interactionTick();
      // entities
      for (const e of game.entities) if (!e.dead) e.tick(game);
      game.entities = game.entities.filter(e => !e.dead);
      game.particles.tick();
      game.hud.tick();
      game.hand.tick();
      if (!this.titleMode) {
        game.tickBlockEntities();
        game.randomTicks();
        this.survivalTick(game);
      }
      // sound events
      for (const ev of p.events) this.playerEvent(game, ev);
      p.events.length = 0;
    });
  }

  survivalTick(game) {
    const p = game.player;
    if (p.health <= 0) {
      if (!this.gui.top() || !(this.gui.top() instanceof DeathScreen)) {
        this.input.unlock();
        const msg = { fall: 'Player hit the ground too hard', drown: 'Player drowned', lava: 'Player tried to swim in lava', fire: 'Player burned to death', void: 'Player fell out of the world', explosion: 'Player blew up', starve: 'Player starved to death', kill: 'Player fell out of the world', lightning: 'Player was struck by lightning' }[p.lastDamageSource] || 'Player died';
        this.gui.setScreen(new DeathScreen(this, msg));
        if (!game.hardcore) for (let i = 0; i < 41; i++) { const s = game.inventory.slots[i]; if (s && !game.keepInventory) { game.dropItem(p.pos[0], p.pos[1] + 1, p.pos[2], s, true); game.inventory.slots[i] = null; } }
        game.inventory.changed();
      }
      return;
    }
    // air & drowning
    if (p.eyeFluid() === 1 && !p.creative) {
      p.air--;
      if (p.air <= -20) { p.air = 0; p.lastDamageSource = 'drown'; p.damage(2, 'drown'); for (let i = 0; i < 8; i++) game.particles.spawn('bubble', p.pos[0] + Math.random() - 0.5, p.pos[1] + p.eyeH, p.pos[2] + Math.random() - 0.5, 0, 0.1, 0); }
    } else p.air = Math.min(300, p.air + 4);
    if (p.eyeFluid() === 1 && game.world.tickCount % 3 === 0) game.particles.spawn('bubble', p.pos[0] + (Math.random() - 0.5) * 0.5, p.pos[1] + p.eyeH - 0.2, p.pos[2] + (Math.random() - 0.5) * 0.5, 0, 0.02, 0);
    // lava / fire
    if (p.inLava && !p.creative) { p.lastDamageSource = 'lava'; p.damage(4, 'lava'); p.fireTicks = 300; }
    const feet = game.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1]), Math.floor(p.pos[2])) & TYPE_MASK;
    if (feet === ID.fire && !p.creative) { p.fireTicks = Math.max(p.fireTicks, 160); }
    if (feet === ID.cactus || game.world.getBlock(Math.floor(p.pos[0] + 0.31), Math.floor(p.pos[1] + 0.5), Math.floor(p.pos[2])) === ID.cactus) { p.lastDamageSource = 'cactus'; p.damage(1, 'cactus'); }
    if (p.fireTicks > 0) {
      if (p.inWater || (game.weather.rainLevel > 0.5 && game.world.rainHeight(Math.floor(p.pos[0]), Math.floor(p.pos[2])) < p.pos[1])) p.fireTicks = 0;
      else { if (p.fireTicks % 20 === 0 && !p.creative) { p.lastDamageSource = 'fire'; p.damage(1, 'fire'); } p.fireTicks--; }
    }
    if (p.regenTicks > 0) { p.regenTicks--; if (p.regenTicks % 50 === 0) p.heal(1); }
    p.foodTick(2);
    p.armorValue = game.inventory.armorValue();
  }

  playerEvent(game, ev) {
    const a = this.audio, p = game.player;
    if (!a) return;
    const pos = { x: p.pos[0], y: p.pos[1], z: p.pos[2] };
    switch (ev.type) {
      case 'step': { const b = BLOCKS[ev.block & TYPE_MASK]; a.play('step.' + (ev.block === ID.ladder ? 'ladder' : soundOf(b)), { ...pos, category: 'player' }); break; }
      case 'jump': break;
      case 'hurt': p.lastDamageSource = ev.source; a.play('damage.hit', { ...pos, category: 'player' }); break;
      case 'fall': a.play(ev.big ? 'damage.fallbig' : 'damage.fallsmall', { ...pos, category: 'player' }); break;
      case 'splash': a.play('random.splash', { ...pos, volume: Math.min(1, 0.2 + ev.speed), category: 'player' }); for (let i = 0; i < 12; i++) game.particles.spawn('splash', p.pos[0] + Math.random() - 0.5, p.pos[1] + 0.5, p.pos[2] + Math.random() - 0.5); break;
      case 'swim': a.play('random.swim', { ...pos, volume: 0.25, category: 'player' }); break;
      case 'death': break;
    }
  }

  // ---------------------------------------------------------------------------------------------------
  async startTitleWorld() {
    this.titleMode = true;
    this.inWorld = false;
    const game = await this.createGame(TITLE_SEED, 'spectator', null, null);
    game.world.setRenderDistance(Math.min(8, this.settings.renderDistance));
    game.player.setPos(game.player.pos[0], game.player.pos[1] + 14, game.player.pos[2]);
    game.player.pitch = 8;
    game.world.time = 23300;
    game.weather.cycle = false;
    game.weather.set('cloudy', 1e9); game.weather.cur = { ...game.weather.target };
    await game.waitForSpawnArea((f) => { this.loading.progress = f; this.renderUI(); });
    game.titleRotation = 0;
  }

  openWorldList() { this.gui.pushScreen(new WorldListScreen(this)); }

  async createWorld({ name, seed, gamemode, hardcore }) {
    const id = 'w' + Date.now().toString(36);
    const meta = { id, name, seed, gamemode, hardcore, lastPlayed: Date.now(), created: Date.now() };
    await this.storage.saveWorldMeta(meta);
    await this.playWorld(meta);
  }

  async playWorld(meta) {
    const ls = new LoadingScreen('Loading terrain...');
    this.gui.setScreen(ls);
    this.titleMode = false;
    const store = await this.storage.openWorld(meta.id);
    const pd = meta.player ? { ...meta.player, time: meta.time, weather: meta.weatherType } : null;
    const game = await this.createGame(meta.seed, meta.gamemode, store, pd);
    game.worldMeta = meta;
    game.hardcore = !!meta.hardcore;
    if (!pd && meta.gamemode === 'survival') { /* empty inventory like vanilla */ }
    await game.waitForSpawnArea((f) => { ls.progress = f; });
    if (!pd) {
      // settle the player on the ground at spawn
      const p = game.player;
      for (let i = 0; i < 40 && !game.world.getCollisions(...p.aabb()).length; i++) p.pos[1] -= 0.5;
      while (game.world.getCollisions(...p.aabb()).length) p.pos[1] += 1;
      p.prevPos = p.pos.slice();
    }
    this.inWorld = true;
    this.gui.setScreen(null);
    this.input.lock();
    this.audio?.update?.(0, { inMenu: false, time: game.world.time });
    this.lastAutosave = performance.now();
  }

  async saveWorld() {
    const g = this.game;
    if (!g || this.titleMode || !g.worldMeta) return;
    const p = g.player;
    const meta = {
      ...g.worldMeta, lastPlayed: Date.now(), time: g.world.time, weatherType: g.weather.type,
      player: { pos: p.pos, yaw: p.yaw, pitch: p.pitch, spawn: g.spawnPoint, inventory: g.inventory.toJSON(), selected: g.inventory.selected, stats: { health: p.health, food: p.food, saturation: p.saturation, xpLevel: p.xpLevel, xpProgress: p.xpProgress, gamemode: p.gamemode, flying: p.flying } },
    };
    g.worldMeta = meta;
    await this.storage.saveWorldMeta(meta);
    await g.world.saveAll();
  }

  async quitToTitle() {
    this.gui.setScreen(new LoadingScreen('Saving world'));
    this.renderUI();
    await this.saveWorld();
    this.inWorld = false;
    this.input.unlock();
    await this.startTitleWorld();
    this.gui.setScreen(new TitleScreen(this));
  }

  respawn() {
    const g = this.game, p = g.player;
    if (g.hardcore) { p.setGamemode('spectator'); p.health = 20; this.closeScreen(); return; }
    const sp = g.spawnPoint;
    p.setPos(sp[0], sp[1], sp[2]);
    p.health = 20; p.food = 20; p.saturation = 5; p.air = 300; p.fireTicks = 0; p.deathTime = 0; p.vel = [0, 0, 0]; p.xpLevel = 0; p.xpProgress = 0;
    this.closeScreen();
  }

  // test helper: jump to a scene (used for visual verification)
  async debugScene(o) {
    if (!this.game || this.titleMode || this.game.seed !== o.seed) await this.createWorld({ name: 'Debug ' + o.seed, seed: o.seed, gamemode: 'creative' });
    const g = this.game, p = g.player;
    p.setGamemode('creative'); p.flying = true;
    p.setPos(o.x + 0.5, o.y ?? 120, o.z + 0.5);
    p.yaw = o.yaw ?? 0; p.pitch = o.pitch ?? 0;
    if (o.time !== undefined) g.world.time = o.time;
    if (o.weather) { g.weather.set(o.weather, 1e9); g.weather.cur = { ...g.weather.target }; g.weather.rainLevel = g.weather.prevRain = g.weather.cur.rain; g.weather.thunderLevel = g.weather.prevThunder = g.weather.cur.thunder; }
    g.weather.cycle = false;
    await g.waitForSpawnArea();
    if (o.y === undefined || o.above !== undefined) { const h = g.world.heightAt(Math.floor(o.x), Math.floor(o.z)); p.setPos(o.x + 0.5, h + 1 + (o.above ?? 1.62), o.z + 0.5); }
    p.vel = [0, 0, 0];
    g.hideHud = !!o.hideHud;
    await new Promise(r => setTimeout(r, o.wait ?? 2500));
    return { pos: p.pos, fps: g.fps, biome: g.biomes[g.world.biomeAt(Math.floor(p.pos[0]), Math.floor(p.pos[2]))]?.name };
  }

  quitMessage() { this.gui.top().splash = 'Close the tab to quit!'; }

  // ---------------------------------------------------------------------------------------------------
  openContainer(name, data) {
    const g = this.game;
    let s;
    if (name === 'inventory') s = g.player.creative ? new CreativeScreen(g) : new InventoryScreen(g);
    else if (name === 'crafting') s = new CraftingScreen(g);
    else if (name === 'chest') { const be = g.blockEntity(data.x, data.y, data.z); s = new ChestScreen(g, be.inv); s.chestPos = data; }
    else if (name === 'furnace') { const be = g.blockEntity(data.x, data.y, data.z); s = new FurnaceScreen(g, be); }
    if (!s) return;
    s.pausesGame = false;
    this.input.unlock();
    this.gui.pushScreen(s);
    g.screenOpen = true;
    g.closeContainerHook = (scr) => { if (scr.chestPos) this.audio?.play('random.chestclosed', { x: scr.chestPos.x + 0.5, y: scr.chestPos.y + 0.5, z: scr.chestPos.z + 0.5, volume: 0.5 }); };
  }

  closeScreen() {
    this.gui.popScreen();
    if (!this.gui.top() && this.inWorld) {
      if (this.game) { this.game.screenOpen = false; this.game.chatOpen = false; }
      this.input.clear();
      this.input.lock();
    }
  }

  onLockChange(locked) {
    if (!locked && this.inWorld && !this.gui.top() && this.game && this.game.player.health > 0) {
      this.gui.pushScreen(new PauseScreen(this));
      this.game.screenOpen = true;
    }
  }

  handleKey(e) {
    const top = this.gui.top();
    const code = e.code;
    if (code === 'F11') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); return true; }
    if (top) {
      if (top.onKey && top.onKey(e)) return true;
      if (code === 'Escape' || (code === 'KeyE' && top.slots && !(top.search && top.search.focused))) {
        if (top instanceof TitleScreen || top instanceof LoadingScreen || top instanceof DeathScreen) return true;
        if (this.inWorld || this.gui.screens.length > 1) { this.closeScreen(); return true; }
      }
      return false;
    }
    if (!this.inWorld || !this.game) return false;
    const g = this.game;
    switch (code) {
      case 'Escape': this.input.unlock(); this.gui.pushScreen(new PauseScreen(this)); g.screenOpen = true; return true;
      case 'KeyE': if (g.player.health > 0 && !g.player.vehicle?.noInventory) { this.openContainer('inventory'); } return true;
      case 'KeyT': case 'Slash': {
        this.input.unlock();
        const s = new ChatScreen(this, code === 'Slash' ? '/' : '');
        this.gui.pushScreen(s); g.screenOpen = true; g.chatOpen = true; return true;
      }
      case 'F1': g.hideHud = !g.hideHud; return true;
      case 'F3': g.showDebug = !g.showDebug; return true;
      case 'F5': g.camera.thirdPerson = (g.camera.thirdPerson + 1) % 3; return true;
      case 'KeyK': this.settings.shaders = !this.settings.shaders; this.applySettings(); g.hud.showActionbar(`Shaders: ${this.settings.shaders ? 'ON' : 'OFF'}`); return true;
      case 'F2': this.screenshot(); return true;
    }
    return false;
  }

  screenshot() {
    this.renderer.render(this.game.camera, this.game.env);
    this.canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `screenshot-${Date.now()}.png`; a.click(); });
    this.game.hud.addChat('Saved screenshot');
  }

  submitChat(text) {
    const g = this.game;
    if (text.startsWith('/')) g.runCommand(text);
    else g.hud.addChat(`<Player> ${text}`);
  }
  completeCommand(v) {
    const cmds = ['/time set ', '/weather ', '/gamemode ', '/tp ', '/give ', '/kill', '/seed', '/summon ', '/shader', '/clear', '/fill ', '/setblock ', '/spawnpoint', '/lightning', '/help'];
    const m = cmds.find(c => c.startsWith(v) && c !== v);
    return m || v;
  }

  // ---------------------------------------------------------------------------------------------------
  frame(t) {
    const g = this.game;
    const top = this.gui.top();
    if (g) {
      g.paused = !!(top && top.pausesGame !== false && this.inWorld);
      if (this.titleMode) {
        g.paused = false;
        const p = g.player;
        p.yaw += 0.025 * 60 / Math.max(30, g.fps || 60);
        p.prevYaw = p.yaw;
        p.vel = [0, 0, 0];
      }
      g.hideHudForFrame = this.titleMode;
      g.frame(t);
      if (!this.titleMode && !g.paused) {
        g.env.selection = g.target && !g.target.entity ? g.target : null;
        g.env.breakStage = g.breakStage();
      }
      if (this.audio && this.audio.ctx) {
        const c = g.camera;
        this.audio.setListener(c.pos[0], c.pos[1], c.pos[2], c.look[0], c.look[1], c.look[2]);
        this.audio.setUnderwater?.(g.player.eyeFluid() === 1);
        const covered = g.world.rainHeight(Math.floor(c.pos[0]), Math.floor(c.pos[2])) > c.pos[1] ? 1 : 0;
        this.audio.setCovered?.(covered);
        const biome = g.biomes[g.world.biomeAt(Math.floor(c.pos[0]), Math.floor(c.pos[2]))];
        const snowy = biome && (biome.precipitation === 'snow');
        this.audio.setWeather?.(snowy ? 0 : g.env.rain, g.env.thunder);
        this.audio.update?.(1 / 60, { time: g.world.time, inMenu: this.titleMode, biome: biome?.name });
      }
      if (this.inWorld && performance.now() - this.lastAutosave > 60000) { this.lastAutosave = performance.now(); this.saveWorld(); }
    }
    this.renderUI();
  }

  renderUI() {
    const gui = this.gui;
    gui.begin();
    if (this.icons) this.icons.setScale(gui.scale);
    const g = this.game;
    const top = gui.top();
    if (g && this.inWorld && !this.titleMode) {
      if (!top || !(top instanceof LoadingScreen)) g.hud.render();
      if (this.settings.showFps && !g.showDebug) gui.text(`${g.fps} fps`, 2, 2, 0xffffff);
    }
    if (top) top.render(gui.mouse.x, gui.mouse.y);
    const showCross = g && this.inWorld && !this.titleMode && !top && !g.hideHud && g.camera.thirdPerson === 0;
    if (this.crosshair) {
      this.crosshair.style.display = showCross ? 'block' : 'none';
      const s = gui.scale / gui.dpr;
      this.crosshair.style.width = 15 * s + 'px'; this.crosshair.style.height = 15 * s + 'px';
      this.crosshair.style.marginLeft = -7.5 * s + 'px'; this.crosshair.style.marginTop = -7.5 * s + 'px';
    }
    document.getElementById('ui').style.cursor = top ? 'default' : 'none';
  }
}

new App().boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:absolute;top:0;color:#f66;z-index:9;white-space:pre-wrap">${e.stack || e}</pre>`); });
void ITEMS; void IID; void T_FLUID; void mat4;
