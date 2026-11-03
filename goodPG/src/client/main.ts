// Punto de entrada: prepara texturas, renderizador, menú y arranca el juego.
import { setShieldIconSprites } from './ui/shieldIcons'; // Fase 7.6
import { parseSeed } from '../shared/seed';
import { loadRecentWorlds, rememberWorld, forgetWorld } from './ui/recentWorlds';
import './style.css';
import { generateTextures } from './textures/generateTextures';
import { generateItemSprites } from './textures/itemSprites';
import { buildHudIcons, buildItemIcons } from './ui/hudIcons';
import { mobTextureSource } from './textures/mobTextureSource';
import { Renderer } from './render/Renderer';
import { UI, randomRoom, sanitizeRoomInput } from './ui/UI';
import { blockIconMaker } from './ui/icons';
import { prepareBannerIcons } from './ui/bannerIcons'; // Fase 6.5 (libros y estandartes)
import { addPotionIcons } from './ui/potionIcons'; // Fase 7 (pociones)
import { setMapPalette } from './game/maps';
import { MenuBackground } from './ui/menuBackground';
import { AudioEngine } from './audio/AudioEngine';
import { Game } from './game/Game';
import { detectPreset, loadSettings, defaultSettings, saveSettings, type Settings } from './game/settings';
import { sanitizeName, type GameMode } from '../shared/protocol';
import { ITEMS, CREATIVE_ITEMS } from '../shared/items';
import { INVENTORY_ORDER } from '../shared/blocks';
import { Program } from './engine/gl';

const NAME_KEY = 'voxelcraft:name';
const COLOR_KEY = 'voxelcraft:shirt';
const ROOM_KEY = 'voxelcraft:room';
const MODE_KEY = 'voxelcraft:mode';
const OFFLINE_KEY = 'voxelcraft:offline';

function randomName(): string {
  const a = ['Zorro', 'Lobo', 'Búho', 'Tejón', 'Lince', 'Halcón', 'Oso', 'Nutria', 'Ciervo', 'Gato'];
  const b = ['Veloz', 'Sabio', 'Audaz', 'Minero', 'Errante', 'Valiente', 'Curioso', 'Feliz'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)];
}

function randomColor(): string {
  const cols = ['#3a7bd5', '#d5453a', '#3aa55a', '#d5a13a', '#8a4fd5', '#2fb3b3', '#e0679b', '#e07b2f'];
  return cols[Math.floor(Math.random() * cols.length)];
}

function storage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* sin almacenamiento */
  }
}

/** Espera a que el navegador pinte (para que lo que se acaba de mostrar se vea antes de un trabajo largo). */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

/**
 * Pinta los iconos del inventario creativo poco a poco en los ratos libres (así, al abrirlo, ya están hechos y
 * no hay tirón).
 */
function prewarmIcons(icons: Map<number, string>): void {
  const ids = [...INVENTORY_ORDER, ...CREATIVE_ITEMS];
  let i = 0;
  const idle = (cb: (d: { timeRemaining(): number }) => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(() => cb({ timeRemaining: () => 8 }), 50);
  const step = (d: { timeRemaining(): number }) => {
    while (i < ids.length && d.timeRemaining() > 2) icons.get(ids[i++]);
    if (i < ids.length) idle(step);
  };
  idle(step);
}

/** Portada: cuántos mundos hay activos y cuánta gente conectada (cada 20 s mientras se ve el menú). */
function watchLiveStats(ui: UI): void {
  const menu = document.getElementById('menu')!;
  const load = async () => {
    if (menu.classList.contains('hidden') || document.hidden) return;
    try {
      const r = await fetch('/api/stats', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { servers?: unknown; players?: unknown };
      const servers = Number(d.servers), players = Number(d.players);
      ui.setLiveStats(Number.isFinite(servers) && Number.isFinite(players) ? { servers, players } : null);
    } catch {
      ui.setLiveStats(null); // sin servidor (p. ej. abierto como archivo): no se muestra
    }
  };
  void load();
  setInterval(() => void load(), 20000);
  document.addEventListener('visibilitychange', () => void load());
}

async function boot(): Promise<void> {
  const ui = new UI();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const menuBg = new MenuBackground(document.getElementById('menu-bg') as HTMLCanvasElement);
  menuBg.start();

  const params = new URLSearchParams(location.search);
  const room = sanitizeRoomInput(params.get('mundo') ?? params.get('room') ?? storage(ROOM_KEY) ?? randomRoom());
  const savedMode: GameMode = storage(MODE_KEY) === 'c' ? 'c' : 's';
  ui.initMenu(storage(NAME_KEY) ?? randomName(), room, storage(COLOR_KEY) ?? randomColor(), savedMode, storage(OFFLINE_KEY) === '1');

  const audio = new AudioEngine();
  ui.onUiSound = (k) => audio.playUi(k);
  ui.setPlayEnabled(false);
  watchLiveStats(ui);
  // Que el menú se vea y responda antes de preparar texturas y shaders.
  await nextFrame();

  // Texturas procedurales e iconos (bloques y objetos).
  const textures = generateTextures();
  setMapPalette(textures);
  const sprites = generateItemSprites();
  ui.icons = buildItemIcons(blockIconMaker(textures), sprites); // cada icono se pinta cuando se ve
  prepareBannerIcons(ui.icons); // Fase 6.5 (libros y estandartes)
  addPotionIcons(ui.icons, sprites); // Fase 7 (pociones): una por tipo
  setShieldIconSprites(sprites); // Fase 7.6: escudos decorados
  ui.hudIcons = buildHudIcons();

  // Renderizador (compila shaders mientras el jugador está en el menú).
  let renderer: Renderer | null = null;
  let settings: Settings = defaultSettings('medio');
  let initError: string | null = null;
  await nextFrame();
  try {
    const probe = loadSettings('medio');
    renderer = new Renderer(canvas, textures, probe.render, sprites, mobTextureSource());
    const preset = detectPreset(renderer.caps.renderer);
    settings = loadSettings(preset);
    renderer.settings = settings.render;
    // Los shaders se compilan en paralelo mientras se está en el menú: se espera a que acaben (sin bloquear)
    // y luego se comprueban (si alguno falla, se avisa aquí y no al empezar a jugar).
    const t0 = performance.now();
    while (!Program.allReady() && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 40));
    Program.finishAll();
  } catch (e) {
    console.error(e);
    initError = e instanceof Error ? e.message : String(e);
    ui.setMenuError(`No se pudo iniciar el renderizado 3D: ${initError}`);
  }
  ui.setPlayEnabled(!initError);
  ui.bindSettings(settings, renderer?.caps.renderer ?? 'desconocida');
  prewarmIcons(ui.icons);
  const applyAudio = () => {
    audio.setMasterVolume(settings.master);
    audio.setMusicVolume(settings.music);
    audio.setAmbientVolume(settings.ambient);
    audio.setVoiceVolume(settings.voiceVolume);
  };
  applyAudio();
  ui.onSettingsChanged = (s) => {
    settings = s;
    if (renderer) renderer.settings = { ...s.render };
    applyAudio();
    saveSettings(s);
  };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.setStatus('Se perdió el contexto gráfico. Recarga la página (F5).');
  });

  let game: Game | null = null;
  ui.onPlay = async () => {
    if (!renderer || game) return;
    const v = ui.menuValues();
    const name = sanitizeName(v.name);
    store(NAME_KEY, name);
    store(COLOR_KEY, v.shirt);
    store(ROOM_KEY, v.room);
    store(MODE_KEY, v.mode);
    store(OFFLINE_KEY, v.offline ? '1' : '0');
    ui.setMenuError('');
    history.replaceState(null, '', `/?mundo=${encodeURIComponent(v.room)}${params.get('autostart') === '1' ? '&autostart=1' : ''}`);
    // El audio nunca debe bloquear el arranque (sin gesto del usuario puede no activarse).
    void audio.resume().then(applyAudio, () => {});
    menuBg.stop();
    ui.hideMenu();
    game = new Game({
      room: v.room, name, shirt: v.shirt, mode: v.mode, offline: v.offline || params.get('offline') === '1', seed: parseSeed(v.seed),
      canvas, ui, audio, textures, settings, renderer,
    });
    game.onQuit(() => {
      game = null;
      ui.hideHud();
      ui.showMenu();
      menuBg.start();
    });
    try {
      await game.start();
      rememberWorld(v.room, v.offline || params.get('offline') === '1');
      showRecent();
    } catch (e) {
      console.error(e);
      game?.stop();
      game = null;
      ui.hideLoading();
      ui.showMenu();
      menuBg.start();
      ui.setMenuError(`Error al iniciar la partida: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Mundos recientes en el menú.
  function showRecent(): void {
    ui.renderRecentWorlds(loadRecentWorlds(), (w) => {
      forgetWorld(w.room, w.offline);
      showRecent();
    });
  }
  showRecent();

  // Atajo para pruebas automáticas: ?autostart=1
  if (params.get('autostart') === '1' && !initError) ui.onPlay?.();

  // Accesos de depuración en consola.
  (window as unknown as Record<string, unknown>).__voxel = {
    get game() {
      return game;
    },
    renderer,
    settings: () => settings,
    itemId: (key: string) => ITEMS.find((i) => i && i.key === key)?.id ?? 0,
  };
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('menu-error');
  if (el) el.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
});
