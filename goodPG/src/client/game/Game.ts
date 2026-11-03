// Bucle principal del juego: arranque, entrada, red y el orden de cada frame. El resto vive en
// controladores: movement (mirada, controles y física), cameraRig (cámara y lente), interaction
// (minar, colocar, usar, comer...), lifeCycle (daño, muerte, cama), serverEvents (mensajes del
// servidor), effects (sonidos y partículas), environment (cielo, lluvia y océano lejano), hudView
// (barras del HUD) y frameView (lo que se dibuja).
import { dyedColor } from '../../shared/dyedColor'; // el cuero teñido
import { bossState, onColumn as gatewayColumn, resetGateways } from './endFightClient'; // Fase 8.6
import { Navigation } from './navigation';
import { Movement } from './movement';
import { CameraRig } from './cameraRig';
import { updateHud } from './hudView';
import { remoteViews, selfView, animateHand, splitEntities, frameState, updateNameTags, debugText } from './frameView';
import { BOLT_LIFE, type Bolt } from '../render/LightningRenderer';
import { Renderer } from '../render/Renderer';
import { World } from '../world/World';
import { dimensionDef, DIM_END } from '../../shared/dimensions'; // Fase 8 (dimensiones)
import { PortalFx } from './portalFx';
import { Player } from './Player';
import { Input } from './Input';
import { raycast, type RayHit } from './raycast';
import { RemotePlayer } from './RemotePlayers';
import { Net, type Welcome, type NetEvents } from '../net/Net';
import { LocalServer } from '../net/LocalServer';
import { UI } from '../ui/UI';
import { InventoryScreen, type ScreenKind } from '../ui/InventoryScreen';
import type { Settings } from './settings';
import type { GeneratedTextures } from '../textures/generateTextures';
import { AudioEngine } from '../audio/AudioEngine';
import { Inventory, HOTBAR } from './Inventory';
import { Survival } from './Survival';
import { ClientEntities } from './ClientEntities';
import { BLOCK_RENDER, BLOCK_SOLID, BLOCK_FLUID, DEFAULT_HOTBAR, WATER, R_CROSS, R_CROP } from '../../shared/blocks';
import { AmbientParticles } from './ambientParticles';
import { NetherAtmosphere } from './netherAtmosphere'; // Fase 8.2 (biomas del Nether)
import { maxStack, type ItemStack } from '../../shared/items';
import { CHUNK_SIZE, DAY_LENGTH_SECONDS, SEA_LEVEL } from '../../shared/constants';
import { STATE_FLY, STATE_SNEAK, STATE_SWIM, STATE_DEAD, STATE_SLEEP, STATE_PRONE, STATE_GLIDE, STATE_EAT, STATE_BOW, STATE_BLOCK, worldTimeAt, type WorldTime, type GameMode, type PlayerSave } from '../../shared/protocol';
import { REACH_CREATIVE, REACH_SURVIVAL, ATTACK_REACH, lighten } from './gameTypes';
import { Interaction } from './interaction';
import { Experience } from './experience';
import { StatusEffects } from './statusEffects';
import { useLook } from './equipmentInteraction'; // Fase 6.5 (equipo)
import { equipmentFrame } from './equipmentLife';
// Fase 7 (pociones): remolinos, nubes, invisibles y nombres de las pociones.
import { potionPosState, potionFrame, handPotionTypes } from './potionClient';
import { effectsPosState } from './effectsClient'; // Fase 7 (efectos)
import { stackName } from '../../shared/potions';
import type { Use } from './gameTypes';
import { NamePrompt } from '../ui/NamePrompt'; // Fase 6.5 (remate)
import { BooksClient } from './booksClient'; // Fase 6.5 (libros y estandartes)
import { MAX_NAME } from '../../shared/nameTags';
import { SignTexts } from './signs';
import { SignEditor } from '../ui/SignEditor';
import { MAX_HEALTH_CAP } from '../../shared/effects'; // Fase 7 (efectos)
import { Effects } from './effects';
import { LifeCycle } from './lifeCycle';
import { ServerEvents } from './serverEvents';
import { Environment } from './environment';
import { Riding } from './riding'; // Fase 6 (monturas)
import { VehicleClient } from './vehicleClient'; // Fase 7 (transporte)
import { vehicleFrame } from './vehicleFx';
import { Trading } from './trading'; // Fase 6 (aldeanos)
import type { RaidState } from '../ui/raidBar'; // Fase 6 (asaltos)
import { raycastHangings } from './decorInteraction'; // Fase 6.5 (decoración): cuadros y marcos
// Fase 7 (encantamientos)
import { EnchantClient } from './enchantClient';
import { RecipeBookState } from './recipeBookClient'; // Fase 9 (libro de recetas)
import { EnchantBooks } from './enchantBooks';
import { Beacons } from './beacons'; // Fase 8.5 (lo que da el Nether)
import { EndAtmosphere } from './endAtmosphere'; // Fase 8.6 (el End)
import { MechanismsClient } from './mechanismsClient'; // Fase 7 (mecanismos)
import { VoiceChat } from '../voice/VoiceChat'; // chat de voz por proximidad
import { itemDecorKey as shieldDecorKey } from '../render/shieldArt'; // (o el color del cuero teñido) // Fase 7.6

export interface GameConfig {
  room: string;
  name: string;
  shirt: string;
  mode: GameMode;
  offline: boolean;
  /** Semilla elegida para un mundo nuevo (si el mundo ya existe, se ignora). */
  seed?: number | null;
  canvas: HTMLCanvasElement;
  ui: UI;
  audio: AudioEngine;
  textures: GeneratedTextures;
  settings: Settings;
  renderer: Renderer;
}

/** Bits de estado del objeto que se está usando (para animarlo en los demás jugadores). */
function useState(use: Use | null): number {
  const kind = useLook(use).kind; // Fase 6.5 (equipo): la ballesta y el tridente, como el arco
  return kind === 'eat' ? STATE_EAT : kind === 'bow' ? STATE_BOW : kind === 'block' ? STATE_BLOCK : 0;
}

export class Game {
  readonly interaction = new Interaction(this);
  readonly movement = new Movement(this);
  readonly camera = new CameraRig(this);
  readonly effects = new Effects(this);
  readonly nav = new Navigation(this);
  readonly life = new LifeCycle(this);
  readonly network = new ServerEvents(this);
  readonly environment = new Environment(this);
  /** Partículas del ambiente (hojas y pétalos que caen, antorchas, goteo, luciérnagas, lluvia). */
  readonly ambient = new AmbientParticles(this);
  /** Fase 8.2: niebla, partículas y sonidos de cada bioma del Nether. */
  readonly netherAtmos = new NetherAtmosphere(this);
  /** Intensidad de la lluvia ahora mismo (0..1), para las salpicaduras. */
  rainNow = 0;
  readonly riding = new Riding(this); // Fase 6 (monturas)
  readonly vehicles = new VehicleClient(this); // Fase 7 (transporte): barcas y vagonetas
  /** Fase 6 (aldeanos): comercio con los aldeanos. */
  readonly trading = new Trading(this);
  /** Chat de voz por proximidad. */
  readonly voice = new VoiceChat(this);
  /** Dónde está el servidor del mundo (ciudad del centro de datos de Cloudflare), para la lista de jugadores. */
  serverWhere: string | null = null;
  readonly xp = new Experience();
  readonly statusEffects = new StatusEffects();
  /** Fase 6 (asaltos): asalto cercano (para la barra) o null. */
  raid: RaidState | null = null;
  cfg: GameConfig;
  renderer: Renderer;
  ui: UI;
  audio: AudioEngine;
  input: Input;
  world: World | null = null;
  player = new Player();
  net: Net | null = null;
  private local: LocalServer | null = null;
  offline = false;
  remote = new Map<string, RemotePlayer>();
  /** Inclinación de la cámara al recibir un golpe (se endereza sola). */
  hurtRoll = 0;
  /** Captura de pantalla pedida (F2): se toma justo después de dibujar. */
  private wantShot = false;
  /** Agacharse y correr fijos (ajuste de alternar). */
  private keysSig = '';
  /** Flotadores de pesca fuera: jugador → entidad. */
  readonly bobbers = new Map<string, number>();
  /** Texto de los carteles y su editor. */
  readonly signs = new SignTexts();
  readonly signEditor = new SignEditor((pos, lines) => {
    this.net?.send({ t: 'sign', x: pos[0], y: pos[1], z: pos[2], l: lines });
    this.afterScreenClosed();
  });
  /** Fase 6.5 (remate): nombre de la etiqueta. */
  readonly namePrompt = new NamePrompt(MAX_NAME);
  /** Fase 6.5 (libros y estandartes): libros, atriles, telar y estandartes con dibujos. */
  readonly books = new BooksClient(this);
  /** Fase 7 (encantamientos): mesa, yunque, afiladora, efectos de los encantamientos y el libro de la mesa. */
  readonly enchant = new EnchantClient(this);
  readonly recipes = new RecipeBookState(this); // Fase 9 (libro de recetas)
  readonly enchantBooks = new EnchantBooks(this);
  /** Fase 8.5: los faros (el haz, su nivel y sus efectos elegidos). */
  readonly beacons = new Beacons(this);
  /** Fase 8.6: los destellos y el polvo del End. */
  readonly endAtmos = new EndAtmosphere(this);
  /** Fase 7 (mecanismos): lo que mueven los pistones y la armadura de los dispensadores. */
  readonly mechanisms = new MechanismsClient(this);
  selected = 0;
  time: WorldTime = { base: 0.08, at: Date.now(), rate: 1 / DAY_LENGTH_SECONDS };
  private running = false;
  private raf = 0;
  private lastFrame = 0;
  hit: RayHit | null = null;
  swingT = -1;
  equipT = 0;
  private lastSent = 0;
  private lastSentKey = '';
  debug = false;
  hudHidden = false;
  fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  playing = false;
  private lastTabDown = false;
  private statusText: string | null = null;
  private onQuitCb: (() => void) | null = null;

  // --- Supervivencia ---
  mode: GameMode = 's';
  difficulty = 2;
  inv = new Inventory();
  survival = new Survival();
  ents = new ClientEntities();
  screen: InventoryScreen;
  spawn: [number, number, number] = [0.5, 100, 0.5];
  private lookTimer = 0;
  private stateTimer = 0;
  private stateKey = '';
  private hotbarKey = '';
  shake = 0;
  /** Rayos de tormenta en pantalla. */
  bolts: Bolt[] = [];
  /** Destello de un rayo (0..1). */
  flash = 0;
  private flashEl: HTMLDivElement | null = null;
  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.renderer = cfg.renderer;
    this.ui = cfg.ui;
    this.audio = cfg.audio;
    this.input = new Input(cfg.canvas);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.screen = new InventoryScreen({
      icons: this.ui.icons,
      send: (m) => this.net?.send(m),
      drop: (s) => this.interaction.throwStack(s, false),
      sound: (k) => (k === 'craft' ? this.audio.playCraft() : this.audio.playUi('click')),
      keys: () => this.cfg.settings.keys,
      work: this.enchant.host, // Fase 7 (encantamientos)
      recipes: { has: (r) => this.recipes.has(r), version: () => this.recipes.version }, // Fase 9 (libro de recetas)
    }, this.inv);
    this.survival.armor = this.interaction.armor;
    this.ents.playerPos = (id) => {
      if (id === this.net?.id) return [this.player.x, this.player.y, this.player.z];
      const rp = this.remote.get(id);
      return rp ? [rp.view.x, rp.view.y, rp.view.z] : null;
    };
    this.bindUi();
  }

  onQuit(cb: () => void): void {
    this.onQuitCb = cb;
  }

  get creative(): boolean {
    return this.mode === 'c';
  }

  get heldStack(): ItemStack | null {
    return this.inv.slots[this.selected] ?? null;
  }

  get heldId(): number {
    return this.heldStack?.id ?? 0;
  }

  // ------------------------------------------------------------------ arranque

  async start(): Promise<void> {
    const { ui } = this;
    ui.showLoading(this.cfg.offline ? 'Preparando el mundo local…' : 'Conectando con el servidor…', 0.05);
    let welcome: Welcome | null = null;
    const events: NetEvents = {
      onWelcome: (w, reconnect) => {
        if (reconnect) this.network.onReconnectWelcome(w);
        else welcome = w;
      },
      onMessage: (m) => this.network.onServerMessage(m),
      onStatus: (st) => {
        this.statusText = st === 'reconnecting' ? 'Conexión perdida · reconectando…' : st === 'closed' && this.playing && !this.offline ? 'Desconectado del servidor' : null;
        ui.setStatus(this.statusText);
        if (st === 'connected' && this.playing) ui.addChat(null, 'Reconectado al servidor.');
      },
    };
    if (!this.cfg.offline) {
      this.net = new Net(Net.websocketFactory(this.cfg.room, this.cfg.seed ?? null), this.cfg.name, this.cfg.shirt, this.cfg.mode, events);
      try {
        await this.net.connect();
      } catch (e) {
        console.warn('Sin servidor, modo un jugador:', e);
        this.net.close();
        this.net = null;
      }
    }
    if (!this.net) {
      this.offline = true;
      ui.showLoading('Preparando el mundo local…', 0.08);
      this.local = new LocalServer(this.cfg.room, this.cfg.seed ?? hashSeed(this.cfg.room));
      this.net = new Net(this.local.factory, this.cfg.name, this.cfg.shirt, this.cfg.mode, events, true);
      await this.net.connect(30000);
    }
    const w = welcome as Welcome | null;
    if (!w) throw new Error('El servidor no envió la bienvenida.');
    if (!this.offline) {
      // Diagnóstico de la latencia: en qué centro de datos vive este mundo.
      void fetch(`/api/room/${encodeURIComponent(this.cfg.room)}/donde`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { servidor?: string; ciudad?: string } | null) => {
          if (d?.servidor) this.serverWhere = d.ciudad && d.ciudad !== d.servidor ? `${d.ciudad} (${d.servidor})` : d.servidor;
        })
        .catch(() => {});
    }
    this.time = w.time;
    this.voice.onWelcome();
    for (const p of w.players) this.network.addRemote(p, false);
    this.ui.voicePlayers = () => this.voice.voicePlayers();
    this.mode = w.mode;
    this.difficulty = w.diff;
    if (Array.isArray(w.spawn) && w.spawn.every(Number.isFinite)) this.spawn = w.spawn;
    this.life.bed = Array.isArray(w.bed) && w.bed.length === 3 && w.bed.every(Number.isInteger) ? w.bed : null;
    this.life.bedDim = w.bd ?? 0; // Fase 8.5
    for (const r of Array.isArray(w.rods) ? w.rods : []) if (Array.isArray(r) && typeof r[0] === 'string' && Number.isInteger(r[1])) this.bobbers.set(r[0], r[1]);
    this.signs.clear();
    for (const sg of Array.isArray(w.signs) ? w.signs : []) if (Array.isArray(sg) && sg.slice(0, 3).every(Number.isInteger)) this.signs.set(sg[0], sg[1], sg[2], sg[3]);
    this.books.onWelcome(w.banners); // Fase 6.5 (libros y estandartes)
    const cores = navigator.hardwareConcurrency || 4;
    this.world = new World(w.seed, this.renderer.terrain, Math.max(2, Math.min(6, cores - 1)), w.dim);
    this.beacons.reset(); // Fase 8.5: los faros de este mundo
    resetGateways();
    this.world.onColumnMeshed = (col) => {
      this.beacons.onColumn(col);
      gatewayColumn(col, w.dim);
    };
    this.world.renderDistance = this.cfg.settings.render.renderDistance;
    this.world.loadEdits(w.edits);

    // Estado guardado del jugador o aparición nueva.
    ui.showLoading('Buscando un buen lugar para aparecer…', 0.1);
    this.restore(w.save);

    // Carga inicial alrededor del jugador.
    const needR = 2;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const world = this.world!;
        world.update(this.player.x, this.player.z, this.player.yaw, 0.016);
        const pcx = Math.floor(this.player.x / CHUNK_SIZE), pcz = Math.floor(this.player.z / CHUNK_SIZE);
        let ready = 0, total = 0;
        for (let dz = -needR; dz <= needR; dz++) {
          for (let dx = -needR; dx <= needR; dx++) {
            total++;
            if (world.isReady(pcx + dx, pcz + dz)) ready++;
          }
        }
        ui.showLoading(this.offline ? 'Generando el mundo (modo un jugador)…' : 'Generando el mundo…', 0.15 + 0.85 * (ready / total));
        if (ready >= total) resolve();
        else setTimeout(tick, 30);
      };
      tick();
    });
    this.player.unstuck(this.world);
    this.net?.send({ t: 'dimok', d: this.world.dim }); // Fase 8: dimensión montada
    ui.hideLoading();
    ui.showHud();
    this.refreshHotbar(true);
    ui.addChat(null, this.offline
      ? 'Modo un jugador: el mundo se guarda en este navegador. Escribe /ayuda para ver los comandos.'
      : `Bienvenido a «${this.cfg.room}». E: inventario · T: chat · /ayuda: comandos. Comparte el enlace para jugar con amigos.`);
    if (this.cfg.seed !== undefined && this.cfg.seed !== null && w.seed !== this.cfg.seed) {
      ui.addChat(null, `Este mundo ya existía: sigue con su semilla (${w.seed}). La semilla sólo vale para mundos nuevos.`);
    }
    ui.addChat(null, this.creative ? 'Modo creativo: vuela con doble espacio y rompe al instante.' : 'Modo supervivencia: consigue madera, fabrica herramientas y sobrevive a la noche.');
    this.playing = true;
    this.running = true;
    this.renderer.resetTemporal();
    this.lastFrame = performance.now();
    this.input.requestLock();
    setTimeout(() => {
      if (this.playing && !this.input.locked && !this.anyScreenOpen()) {
        this.ui.showPause('Haz clic en «Volver al juego» para capturar el ratón y empezar a jugar.');
      }
    }, 400);
    this.cfg.canvas.addEventListener('mousedown', this.onCanvasClick);
    window.addEventListener('beforeunload', this.onUnload);
    this.raf = requestAnimationFrame(this.frame);
    if (this.survival.dead) this.life.showDeath();
  }

  // ------------------------------------------------------------------ Fase 8: dimensiones

  /** Cambiando de dimensión (hasta que se carga el mundo nuevo alrededor del jugador). */
  changingDim = false;
  /** Velo y distorsión dentro de un portal. */
  readonly portalFx = new PortalFx();

  /**
   * Llega la bienvenida de otra dimensión: se cambia de mundo sin salir de la partida. El inventario y
   * el estado del jugador siguen siendo los suyos; sólo cambian el mundo, el sitio y quién hay alrededor.
   */
  changeDimension(w: Welcome): void {
    this.screen.close();
    this.trading.screen.close();
    this.interaction.mining = null;
    this.interaction.use = null;
    this.world?.dispose();
    const cores = navigator.hardwareConcurrency || 4;
    this.world = new World(w.seed, this.renderer.terrain, Math.max(2, Math.min(6, cores - 1)), w.dim);
    this.beacons.reset(); // Fase 8.5: los faros de este mundo
    resetGateways();
    this.world.onColumnMeshed = (col) => {
      this.beacons.onColumn(col);
      gatewayColumn(col, w.dim);
    };
    this.world.renderDistance = this.cfg.settings.render.renderDistance;
    this.world.loadEdits(w.edits);
    this.time = w.time;
    this.voice.onWelcome(); // otra dimensión: otro servidor, otras voces
    this.remote.clear();
    this.ents.clear();
    this.bobbers.clear();
    for (const p of w.players) this.network.addRemote(p, false);
    this.mode = w.mode;
    this.difficulty = w.diff;
    if (Array.isArray(w.spawn) && w.spawn.every(Number.isFinite)) this.spawn = w.spawn;
    // Fase 8.5: el punto de reaparición (cama o nexo) sigue siendo el mismo al cambiar de dimensión.
    this.life.bed = Array.isArray(w.bed) && w.bed.length === 3 && w.bed.every(Number.isInteger) ? w.bed : null;
    this.life.bedDim = w.bd ?? 0;
    this.signs.clear();
    for (const sg of Array.isArray(w.signs) ? w.signs : []) if (Array.isArray(sg) && sg.slice(0, 3).every(Number.isInteger)) this.signs.set(sg[0], sg[1], sg[2], sg[3]);
    this.books.onWelcome(w.banners);
    const p = this.player;
    const at = w.at ?? w.save?.pos;
    if (at && at.every(Number.isFinite)) [p.x, p.y, p.z] = at;
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    this.changingDim = true;
    this.portalFx.reset();
    this.renderer.resetTemporal();
    this.ui.showLoading(`Entrando en ${dimensionDef(w.dim).name}…`, 0.1);
    this.audio.playUi('portal');
  }

  /** Carga el mundo nuevo; cuando está listo alrededor del jugador, se sigue jugando. */
  private loadNewDimension(dt: number): void {
    const world = this.world!;
    const p = this.player;
    world.update(p.x, p.z, p.yaw, dt);
    const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);
    let ready = 0, total = 0;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        total++;
        if (world.isReady(pcx + dx, pcz + dz)) ready++;
      }
    }
    this.ui.showLoading(`Entrando en ${dimensionDef(world.dim).name}…`, 0.15 + 0.85 * (ready / total));
    if (ready < total) return;
    this.changingDim = false;
    p.unstuck(world);
    this.ui.hideLoading();
    this.net?.send({ t: 'dimok', d: world.dim });
    this.sendPos(true);
    this.sendState(true);
    this.refreshHotbar(true);
  }

  /** Aplica el estado guardado por el servidor (o prepara una aparición nueva). */
  private restore(save: PlayerSave | null): void {
    const p = this.player;
    if (save) {
      this.inv.fromWire(save.inv);
      this.inv.armorFromWire(save.armor);
      this.inv.offhandFromWire(save.off);
      this.xp.total = Math.max(0, Math.floor(Number(save.xp) || 0));
      this.enchant.restore(save); // Fase 7 (encantamientos): semilla de encantamiento
      this.recipes.restore(save); // Fase 9 (libro de recetas)
      this.survival.reset();
      this.survival.health = Math.max(0, Math.min(MAX_HEALTH_CAP, save.hp)); // Fase 7 (efectos): Salud mejorada
      this.survival.food = Math.max(0, Math.min(20, save.food));
      this.survival.saturation = Math.max(0, Math.min(20, save.sat));
      this.survival.air = save.air ?? 15;
      this.statusEffects.fromWire(save.fx, this.survival);
      this.survival.absorption = Math.max(0, Math.min(20, Number(save.abs) || 0));
      this.survival.dead = !!save.dead || this.survival.health <= 0;
      if (this.survival.dead) this.survival.deathCause = '';
      this.selected = Math.max(0, Math.min(8, save.sel ?? 0));
      if (save.pos && save.pos.every(Number.isFinite)) {
        [p.x, p.y, p.z] = save.pos;
        if (save.rot) [p.yaw, p.pitch] = save.rot;
        p.flying = !!save.fly && this.creative;
        return;
      }
    } else if (this.creative) {
      DEFAULT_HOTBAR.forEach((id, i) => (this.inv.slots[i] = { id, count: maxStack(id) }));
      this.inv.changed();
    }
    [p.x, p.y, p.z] = [this.spawn[0], this.spawn[1] + 0.1, this.spawn[2]];
    p.yaw = Math.PI * 0.75;
  }

  private onCanvasClick = () => {
    if (!this.playing || this.input.locked || this.anyScreenOpen()) return;
    this.ui.hidePause();
    this.input.requestLock();
  };

  /**
   * Al cerrar o recargar la pestaña: guardar el estado y, si se está jugando, pedir confirmación
   * (Ctrl + W, el atajo de cerrar pestaña, está al lado de correr con Ctrl).
   */
  private onUnload = (e: BeforeUnloadEvent) => {
    this.sendState(true);
    if (this.playing && !this.survival.dead) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  anyScreenOpen(): boolean {
    return this.ui.isChatOpen() || this.ui.isInventoryOpen() || this.ui.isSettingsOpen() || this.screen.isOpen() || this.ui.isDeathOpen() ||
      this.signEditor.isOpen() || this.trading.isOpen() || this.namePrompt.isOpen() || this.books.isOpen(); // Fase 6 (aldeanos): + comercio
  }

  stop(): void {
    this.books.screen.close(false); // Fase 6.5 (libros y estandartes): lo escrito, antes de guardar
    this.sendState(true);
    this.screen.close();
    this.trading.screen.close(); // Fase 6 (aldeanos)
    this.running = false;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.cfg.canvas.removeEventListener('mousedown', this.onCanvasClick);
    window.removeEventListener('beforeunload', this.onUnload);
    const local = this.local;
    const net = this.net;
    // Cerrar después de que salga el último estado (y de que el servidor local guarde).
    setTimeout(() => {
      net?.close();
      if (local) void local.flush().then(() => local.dispose());
    }, 150);
    this.world?.dispose();
    this.portalFx.dispose(); // Fase 8
    this.voice.dispose();
    this.ui.voicePlayers = null;
    this.input.exitLock();
    this.input.dispose();
    this.ui.updateNameTags([]);
    this.ui.hideDeath();
    this.ui.setSurvival(false, 20, 20, 15, false);
    this.audio.setHeartbeat(0);
    this.audio.setFluidProximity(0, 0);
    this.remote.clear();
    this.ents.clear();
  }

  // ------------------------------------------------------------------ red

  /** Chat de voz: la tecla de hablar (la primera vez pide el micrófono) y las voces del fotograma. */
  private updateVoice(cam: [number, number, number]): void {
    // Las teclas de hablar y susurrar las lleva el chat de voz (funcionan con el inventario, el comercio, un cofre
    // o la pausa abiertos; no mientras se escribe en un campo de texto).
    const { voice: key, whisper } = this.cfg.settings.keys;
    this.voice.update(this.voice.keyHeld(key), this.voice.keyHeld(whisper), cam);
  }

  private sendChat(text: string): void {
    if (this.voice.command(text)) return; // /voz y /grupo: los resuelve el chat de voz
    if (text.startsWith('/tp ')) {
      const target = text.slice(4).trim().toLowerCase();
      for (const rp of this.remote.values()) {
        if (rp.name.toLowerCase() === target) {
          this.player.x = rp.view.x;
          this.player.y = rp.view.y + 0.1;
          this.player.z = rp.view.z;
          this.player.fallDistance = 0;
          this.ui.addChat(null, `Teletransportado a ${rp.name}.`);
          return;
        }
      }
      this.ui.addChat(null, `No hay ningún jugador llamado «${text.slice(4).trim()}».`);
      return;
    }
    if (!text.startsWith('/')) this.ui.addChat(this.cfg.name, text, lighten(this.cfg.shirt));
    this.net?.send({ t: 'chat', m: text });
  }

  private bindUi(): void {
    const ui = this.ui;
    ui.onResume = () => {
      ui.hidePause();
      this.input.requestLock();
    };
    ui.onQuit = () => {
      this.stop();
      this.onQuitCb?.();
    };
    ui.onFullscreen = () => {
      void this.input.toggleFullscreen().then(() => {
        ui.hidePause();
        this.input.requestLock();
      });
    };
    ui.onRespawn = () => this.life.respawn();
    ui.onChatSubmit = (t) => this.sendChat(t);
    ui.playerNames = () => [this.cfg.name, ...[...this.remote.values()].map((rp) => rp.name)];
    ui.onChatClosed = () => {
      this.input.gameKeys = true;
      this.input.requestLock();
    };
    ui.onInventoryPick = (id, slot, stack) => {
      const s = slot ?? this.selected;
      // Fase 7: con sus datos (libros encantados, un solo ejemplar) o su tipo (pociones y flechas con efecto).
      this.inv.set(s, stack ? { ...stack, count: stack.data ? 1 : maxStack(id) } : { id, count: maxStack(id) });
      this.refreshHotbar(true);
      this.equipT = 1;
    };
    ui.onInventorySelectSlot = (slot) => {
      this.selected = slot;
      this.refreshHotbar(true);
    };
    ui.getInviteLink = () => `${location.origin}/?mundo=${encodeURIComponent(this.cfg.room)}`;
    ui.onCloseInventory = () => {
      if (ui.isInventoryOpen()) this.toggleInventory();
    };
  }

  private onLockChange(locked: boolean): void {
    if (!this.playing) return;
    if (locked) {
      this.ui.hidePause();
      return;
    }
    if (!this.anyScreenOpen()) {
      const n = this.remote.size + 1;
      this.ui.showPause(this.offline ? 'Modo un jugador' : `Mundo «${this.cfg.room}» · ${n} jugador${n === 1 ? '' : 'es'} conectado${n === 1 ? '' : 's'}`);
    }
  }

  /** E: inventario (creativo: selector de bloques; supervivencia: inventario con fabricación). */
  toggleInventory(): void {
    const ui = this.ui;
    if (this.screen.isOpen()) {
      this.screen.close();
      this.afterScreenClosed();
      return;
    }
    if (ui.isInventoryOpen()) {
      ui.hideInventory();
      this.audio.playUi('close');
      this.input.gameKeys = true;
      this.input.requestLock();
      return;
    }
    if (this.creative) {
      ui.showInventory();
    } else {
      this.openScreen('player', null);
    }
    this.audio.playUi('open');
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
  }

  /** Editor del texto de un cartel (al colocarlo o con clic derecho). */
  /** Fase 6.5 (remate): ventana del nombre de la etiqueta. */
  openNamePrompt(current: string, done: (name: string | null) => void): void {
    this.interaction.mining = null;
    this.interaction.use = null;
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
    this.namePrompt.open(current, (name) => {
      done(name);
      this.afterScreenClosed();
    });
  }

  openSignEditor(x: number, y: number, z: number): void {
    this.interaction.mining = null;
    this.interaction.use = null;
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
    this.signEditor.open([x, y, z], this.signs.get(x, y, z));
  }

  openScreen(kind: ScreenKind, pos: [number, number, number] | null, title = ''): void {
    this.interaction.mining = null;
    this.interaction.use = null;
    this.screen.open(kind, pos, title);
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
  }

  afterScreenClosed(): void {
    this.audio.playUi('close');
    this.input.gameKeys = true;
    this.refreshHotbar(true);
    this.sendState(false);
    if (!this.survival.dead) this.input.requestLock();
  }

  refreshHotbar(force = false): void {
    const key = `${this.inv.version}|${this.selected}`;
    if (!force && key === this.hotbarKey) return;
    this.hotbarKey = key;
    this.ui.setHotbar(this.inv.slots.slice(0, HOTBAR), this.selected);
    this.ui.setOffhand(this.inv.offhand);
  }

  /** Guarda lo que se ve (sin la interfaz) como PNG. */
  private saveScreenshot(): void {
    const canvas = this.cfg.canvas;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `voxelcraft-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.ui.toast(`Captura guardada: ${name}`);
      this.audio.playUi('click');
    }, 'image/png');
  }

  /** Tecla F: intercambia lo de la mano con la mano secundaria. */
  private swapHands(): void {
    this.interaction.use = null;
    this.inv.swapOffhand(this.selected);
    this.audio.playUi('click');
    this.refreshHotbar(true);
  }

  // ------------------------------------------------------------------ persistencia

  sendState(force: boolean): void {
    if (!this.net || !this.playing) return;
    const p = this.player, s = this.survival;
    const key = `${this.inv.version}|${this.recipes.version}|${s.version}|${this.xp.version}|${this.statusEffects.version}|${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.z)}|${this.selected}|${s.dead}`;
    if (!force && key === this.stateKey) return;
    this.stateKey = key;
    this.net.send({
      t: 'state',
      d: {
        inv: this.inv.toWire(), hp: s.health, food: s.food, sat: Math.round(s.saturation * 10) / 10, air: Math.round(s.air),
        pos: [p.x, p.y, p.z], rot: [p.yaw, p.pitch], fly: p.flying, sel: this.selected, dead: s.dead,
        armor: this.inv.armorToWire(), off: this.inv.offhandToWire(), xp: this.xp.total, fx: this.statusEffects.toWire(), abs: s.absorption,
        es: this.enchant.seed, // Fase 7 (encantamientos)
        ...this.recipes.toWire(), // Fase 9 (libro de recetas): sólo si cambió
      },
    });
  }

  sendPos(force: boolean): void {
    const p = this.player;
    const s = (p.sneaking ? STATE_SNEAK : 0) | (p.flying ? STATE_FLY : 0) | (p.inWater ? STATE_SWIM : 0) |
      (this.survival.dead ? STATE_DEAD : 0) | (this.life.sleeping ? STATE_SLEEP : 0) | (p.pose !== 'stand' ? STATE_PRONE : 0) | (p.gliding ? STATE_GLIDE : 0) |
      useState(this.interaction.use) | potionPosState(this).s | effectsPosState(this); // Fase 7 (pociones y efectos): invisible y brillo
    const ec = potionPosState(this).ec;
    const q = (v: number, step: number) => Math.round(v / step);
    const armor = this.inv.armorIds();
    const off = this.inv.offhand?.id ?? 0;
    const g = this.enchant.glintBits(); // Fase 7 (encantamientos): qué brilla
    const { hp, op } = handPotionTypes(this); // Fase 7 (remate): el color de la poción en cada mano
    const hs = shieldDecorKey(this.heldStack), os = shieldDecorKey(this.inv.offhand); // Fase 7.6: escudos decorados
    const ac = this.inv.armor.map((a) => dyedColor(a) ?? -1); // el cuero teñido
    const dyed = ac.some((c) => c >= 0);
    const key = `${q(p.x, 0.05)},${q(p.y, 0.05)},${q(p.z, 0.05)},${q(p.yaw, 0.03)},${q(p.pitch, 0.03)},${s},${this.heldId},${off},${armor},${ec},${g},${hp},${op},${hs},${os},${dyed ? ac : ''}`;
    if (!force && key === this.lastSentKey) return;
    this.net?.send({
      t: 'pos', p: [p.x, p.y, p.z], r: [p.yaw, p.pitch], s, h: this.heldId, o: off, a: armor, ...(ec ? { ec } : {}), ...(g ? { g } : {}),
      ...(hp ? { hp } : {}), ...(op ? { op } : {}), ...(hs ? { hs } : {}), ...(os ? { os } : {}), ...(dyed ? { ac } : {}),
    });
    this.lastSentKey = key;
  }

  // ------------------------------------------------------------------ bucle

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    try {
      this.update(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
  };

  /** Teclas de interfaz (inventario, chat, F1/F3/F5, ranuras, tirar, lista de jugadores). */
  private handleUiKeys(): void {
    const ui = this.ui;
    const input = this.input;
    const surv = this.survival;
    const k = this.cfg.settings.keys;
    // Las teclas asignadas no deben disparar atajos del navegador mientras se juega.
    const sig = Object.values(k).join(',');
    if (sig !== this.keysSig) {
      this.keysSig = sig;
      input.reserved = new Set(Object.values(k));
      input.movement = new Set([k.forward, k.back, k.left, k.right]);
    }
    if (!ui.isChatOpen() && !surv.dead) {
      if (input.wasPressed(k.inventory) && !ui.isSettingsOpen() && !ui.isPauseOpen() && !this.signEditor.isOpen() && !this.namePrompt.isOpen() && !this.books.isOpen()) this.toggleInventory();
      else if (input.wasPressed('Escape') && (ui.isInventoryOpen() || this.screen.isOpen())) this.toggleInventory();
      if (input.locked && !this.anyScreenOpen()) {
        if (input.wasPressed(k.chat) || input.wasPressed('Enter')) this.openChat('');
        else if (input.wasPressed(k.command)) this.openChat('/');
        if (input.wasPressed('F1')) {
          this.hudHidden = !this.hudHidden;
          ui.setHudVisible(!this.hudHidden);
        }
        if (input.wasPressed('F3')) this.debug = !this.debug;
        if (input.wasPressed('F2')) this.wantShot = true;
        if (input.wasPressed(k.perspective)) this.camera.thirdPerson = (this.camera.thirdPerson + 1) % 3;
        for (let i = 0; i < 9; i++) {
          if (input.wasPressed('Digit' + (i + 1))) this.selectSlot(i);
        }
        if (input.wheel !== 0) this.selectSlot((this.selected + (input.wheel > 0 ? 1 : -1) + 9) % 9);
        if (input.wasPressed(k.swapHands)) this.swapHands();
        if (input.wasPressed(k.drop)) this.interaction.dropHeld(input.wasPressedWithCtrl(k.drop) || input.isDown('ControlLeft') || input.isDown('ControlRight'));
      }
    }
    const tabDown = input.isDown(k.playerList) && input.locked;
    if (tabDown) {
      const list = [{ name: this.cfg.name, color: this.cfg.shirt, me: true }];
      for (const rp of this.remote.values()) list.push({ name: rp.name, color: rp.shirt, me: false });
      ui.showPlayerList(list, this.cfg.room, this.net?.latency ?? null, this.offline ? null : this.serverWhere);
    } else if (this.lastTabDown) ui.hidePlayerList();
    this.lastTabDown = tabDown;
    this.trading.update(); // Fase 6 (aldeanos)
    this.screen.expirePending();
    if (this.screen.isOpen()) this.screen.render();
  }

  private update(dt: number): void {
    const world = this.world!;
    const ui = this.ui;
    const input = this.input;
    const settings = this.cfg.settings;
    const p = this.player;
    const surv = this.survival;
    const nowS = performance.now() / 1000;

    // FPS
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    // Fase 8: cambiando de dimensión, sólo se carga el mundo nuevo alrededor del jugador.
    if (this.changingDim) {
      this.loadNewDimension(dt);
      return;
    }

    this.handleUiKeys();

    // --- Jugador: mirada, cama, controles, física y pasos ---
    const { active, moved, wasGround } = this.movement.update(dt);
    this.portalFx.update(this, dt); // Fase 8: dentro de un portal

    // --- Supervivencia ---
    const worldTime = worldTimeAt(this.time, Date.now() + (this.net?.serverOffset ?? 0));
    const rain = this.environment.weatherAt(worldTime);
    this.rainNow = rain;
    this.recipes.update(); // Fase 9 (libro de recetas): recetas nuevas al tener el ingrediente
    this.enchant.update(dt); // Fase 7 (encantamientos): Respiración, Agilidad acuática, Paso helado, runas
    this.enchantBooks.update(dt);
    this.beacons.update(dt); // Fase 8.5
    this.endAtmos.update(dt); // Fase 8.6
    this.life.tickSurvival(dt, moved, wasGround, rain);
    this.audio.setHeartbeat(!this.creative && !surv.dead && surv.health <= 6 ? (7 - surv.health) / 6 : 0);

    // --- Interacción: a qué bloque o entidad se apunta ---
    const eyeX = p.x, eyeY = p.eyeY, eyeZ = p.z;
    const cp = Math.cos(p.pitch);
    const dir = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    const reach = this.creative ? REACH_CREATIVE : REACH_SURVIVAL;
    this.hit = surv.dead ? null : raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], reach, (x, y, z) => world.getBlock(x, y, z));
    const entHit = surv.dead ? null : this.ents.raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], this.creative ? 5 : ATTACK_REACH, this.riding.active ? this.riding.entityId : this.vehicles.skipId); // Fase 7: la barca propia no tapa
    // Las plantas sin colisión (hierba, flores, cultivos) no tapan a las criaturas.
    const hitBlocks = this.hit && BLOCK_RENDER[this.hit.id] !== R_CROSS && BLOCK_RENDER[this.hit.id] !== R_CROP;
    // Fase 6.5 (decoración): los cuadros y marcos también se pueden golpear y usar.
    const hangHit = surv.dead ? null : raycastHangings(this.ents, eyeX, eyeY, eyeZ, dir, this.creative ? 5 : ATTACK_REACH);
    const anyHit = hangHit && (!entHit || hangHit.dist < entHit.dist) ? hangHit : entHit;
    const target = anyHit && (!hitBlocks || anyHit.dist < this.hit!.dist) ? anyHit.e : null;
    this.interaction.placeCooldown -= dt;
    this.interaction.breakDelay -= dt;
    if (active) this.interaction.interact(dt, target, dir);
    else {
      this.interaction.mining = null;
      if (this.interaction.use?.kind === 'bow') this.interaction.releaseBow(dir);
      this.interaction.use = null;
    }

    // --- Mundo, jugadores, entidades y partículas ---
    world.update(p.x, p.z, p.yaw, dt);
    this.ents.update(dt, nowS);
    this.riding.afterEntities(dt); // Fase 6 (monturas)
    this.vehicles.afterEntities(dt); // Fase 7 (transporte)
    vehicleFrame(this, dt);
    this.interaction.autoPickup(nowS);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && !surv.dead) {
      this.lookTimer = 0.3;
      this.interaction.checkEndermanLook(eyeX, eyeY, eyeZ, dir);
    }
    this.effects.mobSounds(dt);
    const views = remoteViews(this, dt);
    // Partículas: física contra el mundo y emisores ambientales (hojas, antorchas, goteo...).
    const ps = this.renderer.entities.particles;
    ps.world = {
      solid: (x, y, z) => {
        const b = world.getBlock(x, y, z);
        return b < 0 || BLOCK_SOLID[b] === 1;
      },
      fluid: (x, y, z) => {
        const b = world.getBlock(x, y, z);
        return b > 0 ? BLOCK_FLUID[b] : 0;
      },
      light: (x, y, z) => world.renderLight(x, y, z), // Fase 8: con la luz de alma
    };
    ps.update(dt);
    this.ambient.update(dt);
    this.netherAtmos.update(dt); // Fase 8.2
    equipmentFrame(this, dt); // Fase 6.5 (equipo): estela de los cohetes
    potionFrame(this, dt); // Fase 7 (pociones): remolinos, nubes y flechas con efecto

    // --- Red: posición a ~8 Hz y sólo si cambia (ahorra peticiones) ---
    this.lastSent += dt;
    if (this.net && this.lastSent > 0.125) {
      this.sendPos(false);
      this.riding.send(); // Fase 6 (monturas): posición de la montura que guía
      this.lastSent = 0;
    }
    this.stateTimer += dt;
    if (this.stateTimer > 10) {
      this.stateTimer = 0;
      this.sendState(false);
    }
    this.refreshHotbar();
    updateHud(this, worldTime);

    // --- Cielo, luz en el ojo, cámara y lente ---
    const sky = this.environment.sky(dt, worldTime, rain);
    const eye = this.camera.eyeLight(dt);
    const cam = this.camera.place(dt, dir);
    if (this.camera.thirdPerson > 0) views.push(selfView(this, eye));
    this.camera.lens(dt);

    // --- Dibujar ---
    animateHand(this, dt);
    const { mobs, drops } = splitEntities(this);
    this.renderer.entities.lightDir = this.renderer.sunDir[1] >= 0 ? this.renderer.sunDir : this.renderer.sunDir.map((v) => -v);
    this.renderer.render(frameState(this, { dt, cam, eye, sky, rain, views, mobs, drops, target }));
    this.hurtRoll *= Math.exp(-dt * 5);
    this.nav.update();
    // Rayos: envejecen y se retiran; el destello blanco de la pantalla se apaga rápido.
    for (const b of this.bolts) b.age += dt;
    if (this.bolts.length) this.bolts = this.bolts.filter((b) => b.age < BOLT_LIFE);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.flash > 0 || this.flashEl) {
      if (!this.flashEl) {
        this.flashEl = document.createElement('div');
        this.flashEl.id = 'lightning-flash';
        document.body.appendChild(this.flashEl);
      }
      // Sólo se ve lo que entra por donde se ve el cielo: en una cueva, nada.
      const sky = Math.max(0, (this.camera.eyeSky - 0.15) / 0.85);
      this.flashEl.style.opacity = String(Math.min(0.75, this.flash * 0.75 * sky));
    }
    if (this.wantShot) {
      this.wantShot = false;
      this.saveScreenshot();
    }
    updateNameTags(this, cam);
    this.renderer.entities.prune(new Set(views.map((v) => v.id)));

    // --- Audio ---
    const fwd: [number, number, number] = [dir[0], dir[1], dir[2]];
    this.audio.setListener([cam.camX, cam.camY, cam.camZ], fwd, [0, 1, 0]);
    this.updateVoice([cam.camX, cam.camY, cam.camZ]);
    let waterNear = 0;
    if (p.y < SEA_LEVEL + 6) {
      for (const [ox2, oz2] of [[4, 0], [-4, 0], [0, 4], [0, -4], [0, 0]]) {
        if (world.getBlock(Math.floor(p.x + ox2), SEA_LEVEL - 1, Math.floor(p.z + oz2)) === WATER) waterNear += 0.2;
      }
    }
    this.effects.fluidTimer -= dt;
    if (this.effects.fluidTimer <= 0) {
      this.effects.fluidTimer = 0.5;
      this.effects.updateFluidSound();
    }
    this.audio.update(dt, {
      sunHeight: sky.sunHeight,
      skyExposure: this.camera.eyeSky,
      underwater: eye.underwater,
      waterProximity: waterNear,
      altitude: cam.camY,
      rain: sky.snow ? 0 : rain * Math.min(1, this.camera.eyeSky * 1.3),
      // Fase 8.2: el bioma del Nether (su ambiente y su música); 8.6: en el End, el suyo (sin los sonidos del mundo normal).
      netherBiome: this.world?.dim === DIM_END ? this.world.generator.biomeAt(Math.floor(this.player.x), Math.floor(this.player.z)) : this.netherAtmos.biome,
      boss: this.world?.dim === DIM_END && !!bossState(), // Fase 8.6: la música del combate con el dragón
    });

    ui.setDebug(this.debug ? debugText(this, eye, sky, { mobs: mobs.length, drops: drops.length }, target) : null);
  }

  // ------------------------------------------------------------------ interacción

  private openChat(prefill: string): void {
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.ui.openChat(prefill);
    this.input.exitLock();
  }

  selectSlot(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    // Cambiar de objeto vacía la barra de ataque (como en Minecraft).
    this.interaction.resetAttack();
    this.equipT = 1;
    this.interaction.mining = null;
    this.refreshHotbar(true);
    const s = this.heldStack;
    if (s) this.ui.showBlockName(stackName(s)); // Fase 7 (pociones): con el nombre de su tipo
  }

  /** Animación del brazo (y aviso por red si no hubo edición, que ya la anima). */
  swing(sendNet = false): void {
    if (this.swingT < 0 || this.swingT > 0.5) this.swingT = 0;
    if (sendNet) this.net?.send({ t: 'swing' });
  }
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h & 0x7fffffff;
}
