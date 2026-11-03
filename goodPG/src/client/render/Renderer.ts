// Pipeline de renderizado completo.
//
// Orden por frame:
//  1. LUT del cielo (vista + irradiancia)
//  2. Mapa de sombras (terreno opaco/recorte + jugadores) y mapa de profundidad del agua (cáusticas)
//  3. Pasada principal HDR: terreno opaco, recortes, jugadores, partículas y cielo
//  4. Copia de color/profundidad → agua y hielo (refracción, SSR, absorción)
//  5. Nubes volumétricas (resolución reducida) y luz volumétrica (media resolución)
//  6. Composición atmosférica (niebla, bruma, nubes, rayos de luz)
//  7. TAA → contorno de selección y bloque en la mano
//  8. Exposición automática, bloom, tonemapping ACES (+ FXAA si no hay TAA)
import { dyeDecorKey } from './dyeArt'; // el cuero teñido
import { mat4, vec3 } from 'gl-matrix';
import {
  createContext, Program, RenderTarget, UniformBuffer, FullscreenTriangle, FULLSCREEN_VS, type GL, type GLCaps,
} from '../engine/gl';
import { TERRAIN_VS, TERRAIN_FS, SHADOW_VS, SHADOW_FS } from './shaders/terrain';
import { WATER_VS, WATER_FS, WATER_SHADOW_VS, WATER_SHADOW_FS, WATER_NORMAL_GEN_FS } from './shaders/water';
import {
  VOLUMETRIC_FS, COMPOSITE_FS, TAA_FS, LUMINANCE_FS, ADAPT_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, FINAL_FS, FXAA_FS,
} from './shaders/post';
import { Atmosphere, SUN_ILLUMINANCE } from './Atmosphere';
import { Clouds } from './Clouds';
import { TerrainRenderer } from './TerrainRenderer';
import { BlockTextures } from './BlockTextures';
import { EntityRenderer, type RemotePlayerView } from './EntityRenderer';
import { Weather } from './Weather';
import { ItemRenderer, type ItemDraw } from './ItemRenderer';
import { MobRenderer, type MobTexture } from './MobRenderer';
import { XpOrbRenderer } from './XpOrbRenderer';
import type { GeneratedTextures } from '../textures/generateTextures';
import type { ItemSprites } from '../textures/itemSprites';
import type { ClientEntity } from '../game/ClientEntities';
import { ENT_ITEM, ENT_ARROW, ENT_FALLING, ENT_THROWN, ENT_BOBBER, ENT_DISPLAY } from '../../shared/mobs';
import { MOB_ALLAY } from '../../shared/allay'; // Fase 7.5 (mansión)
import { ENT_TNT } from '../../shared/mechanisms'; // Fase 7 (mecanismos)
import { pushPrimedTnt } from '../game/mechanismsClient';
import { TIPPED_ARROW, ENDER_EYE } from '../../shared/items'; // Fase 7 (pociones)
import { FIRE_CHARGE, SPECTRAL_ARROW } from '../../shared/items'; // Fase 8.3 (criaturas del Nether)
import { ENT_LARGE_FIREBALL, ENT_SMALL_FIREBALL, isNetherMob, gearMain, gearOff } from '../../shared/netherMobs';
// Fase 6.5 (decoración): cuadros y marcos.
import { isHangingType } from '../../shared/paintings';
import { pushHangingDraws } from './hangingDraws';
import { pushStandDraws, standArmorView } from './standDraws'; // Fase 6.5 (remate)
import { isSkull } from '../../shared/blocks'; // Fase 6.5 (colecciones)
import { ENT_ARMOR_STAND } from '../../shared/armorStands';
import { pushEquipmentDraws } from './equipmentDraws'; // Fase 6.5 (equipo)
import { SignTextRenderer, type SignDraw } from './SignTextRenderer';
import { BannerRenderer, type BannerDraw } from './BannerRenderer'; // Fase 6.5 (libros y estandartes)
import { LightningRenderer, type Bolt } from './LightningRenderer';
import { GuardianBeamRenderer, type GuardianBeam } from './GuardianBeamRenderer'; // Fase 7.5 (océano)
import { BeaconBeamRenderer } from './BeaconBeamRenderer'; // Fase 8.5 (lo que da el Nether)
import { EndFxRenderer, type DragonRays, type CrystalBeam } from './EndFxRenderer'; // Fase 8.6 (el End)
import type { BeaconBeam } from '../game/beacons';
import { EffectView, type SightFog } from './effectView'; // Fase 7 (efectos)
import type { FishLine } from '../game/fishingLines';
import { ARROW, BOW, ITEMS } from '../../shared/items';
import { WHITE_WOOL, RED_WOOL, BLACK_WOOL, WOOL } from '../../shared/blocks';
// Fase 7 (encantamientos): brillo de los objetos encantados y bloques con forma que caen.
import { EF_GLINT } from '../../shared/protocol';
import { R_MODEL, BLOCK_RENDER as F7_BLOCK_RENDER } from '../../shared/blocks';
import { itemForBlock } from '../../shared/items';
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (dimensiones)

export interface RenderSettings {
  renderScale: number;
  shadowSize: number;
  shadowDistance: number;
  pcfSamples: number;
  volumetric: boolean;
  volumetricSteps: number;
  clouds: boolean;
  cloudSteps: number;
  cloudScale: number;
  ssrSteps: number;
  taa: boolean;
  bloom: boolean;
  fov: number;
  renderDistance: number;
  brightness: number;
  /** Relieve de texturas (parallax occlusion mapping). */
  pom: boolean;
}

export type PresetName = 'bajo' | 'medio' | 'alto' | 'ultra';

export const PRESETS: Record<PresetName, Omit<RenderSettings, 'fov' | 'brightness'>> = {
  bajo: {
    renderScale: 0.75, shadowSize: 1024, shadowDistance: 80, pcfSamples: 4, volumetric: false, volumetricSteps: 8,
    clouds: true, cloudSteps: 18, cloudScale: 0.33, ssrSteps: 0, taa: false, bloom: true, renderDistance: 6, pom: false,
  },
  medio: {
    renderScale: 1, shadowSize: 2048, shadowDistance: 112, pcfSamples: 8, volumetric: true, volumetricSteps: 12,
    clouds: true, cloudSteps: 28, cloudScale: 0.35, ssrSteps: 18, taa: true, bloom: true, renderDistance: 8, pom: false,
  },
  alto: {
    renderScale: 1, shadowSize: 2048, shadowDistance: 144, pcfSamples: 12, volumetric: true, volumetricSteps: 16,
    clouds: true, cloudSteps: 40, cloudScale: 0.5, ssrSteps: 28, taa: true, bloom: true, renderDistance: 10, pom: true,
  },
  ultra: {
    renderScale: 1, shadowSize: 4096, shadowDistance: 192, pcfSamples: 16, volumetric: true, volumetricSteps: 24,
    clouds: true, cloudSteps: 56, cloudScale: 0.5, ssrSteps: 40, taa: true, bloom: true, renderDistance: 14, pom: true,
  },
};

export interface FrameState {
  camX: number;
  camY: number;
  camZ: number;
  yaw: number;
  pitch: number;
  /** Tiempo real acumulado (s). */
  time: number;
  dt: number;
  /** Fase del día 0..1 (0 = amanecer). */
  dayTime: number;
  /** Número de día (para las fases lunares). */
  day: number;
  underwater: boolean;
  /** Bajo el agua abierta: cuánta luz del sol llega filtrada al ojo (0..1; 0 fuera del agua o en cuevas). */
  waterLight?: number;
  eyeSkyExposure: number;
  rain: number;
  /** Efecto Visión nocturna (0..1): la exposición sube para ver en la oscuridad. */
  nightVision?: number;
  /** La precipitación es nieve (bioma frío). */
  snow: boolean;
  cloudCoverage: number;
  mist: number;
  selection: { x: number; y: number; z: number; box?: number[] } | null;
  /** Objeto en la mano (id de objeto; 0 = mano vacía). */
  heldItem: number;
  /** Uso del objeto: 0..1 (tensar el arco, comer). */
  handUse: number;
  handUseKind: 'none' | 'bow' | 'eat' | 'block';
  /** Fase 7 (pociones): tipo de las pociones de cada mano (su color). */
  heldDmg?: number;
  offhandDmg?: number;
  /** Fase 7.6: escudo decorado en cada mano (clave de shieldArt). */
  heldDecor?: string | null;
  offhandDecor?: string | null;
  /** Mano secundaria: objeto y su uso (comer o cubrirse con el escudo). */
  offhandItem?: number;
  /** Fase 7 (encantamientos): brillo de lo que se lleva en la mano principal y en la secundaria. */
  heldGlint?: boolean;
  offhandGlint?: boolean;
  /** Fase 7 (encantamientos): el libro que flota sobre las mesas de encantamientos. */
  enchantBooks?: ItemDraw[];
  /** Fase 7 (mecanismos): bloques que mueven los pistones. */
  movingBlocks?: ItemDraw[];
  offhandUseKind?: 'none' | 'eat' | 'block';
  offhandUse?: number;
  /** Bloque que se está minando y fase de la grieta (0..9). */
  crack: { x: number; y: number; z: number; stage: number; box?: number[] } | null;
  /** Criaturas y demás entidades (objetos, flechas, bloques que caen). */
  mobs: ClientEntity[];
  drops: ClientEntity[];
  /** Luz empaquetada (cielo << 4 | bloque) en una celda. */
  lightAt: (x: number, y: number, z: number) => number;
  handSwing: number;
  handBob: [number, number];
  handEquip: number;
  lightAtEye: [number, number];
  grassTint: [number, number, number];
  players: RemotePlayerView[];
  showHand: boolean;
  /** Inclinación lateral de la cámara (radianes). */
  roll?: number;
  /** Sedales de pesca: [punta de la caña, flotador]. */
  fishLines?: FishLine[];
  /** Fase 6.5 (remate): correas (y los nudos en las vallas). */
  leashes?: { lines: FishLine[]; knots: [number, number, number][] };
  /** Carteles con texto cercanos. */
  signs?: SignDraw[];
  /** Fase 6.5 (libros y estandartes): estandartes con dibujos cercanos. */
  banners?: BannerDraw[];
  /** Rayos de tormenta en pantalla. */
  bolts?: Bolt[];
  /** Fase 7.5 (océano): rayos de los guardianes que están cargando. */
  guardianBeams?: GuardianBeam[];
  /** Fase 8.5: los haces de los faros encendidos. */
  beaconBeams?: BeaconBeam[];
  /** Fase 8.6: rayos de la muerte del dragón, haces de los cristales del End y de las puertas del End. */
  endRays?: DragonRays[];
  crystalBeams?: CrystalBeam[];
  gatewayBeams?: BeaconBeam[];
  /** Fase 8.6: niebla del combate con el jefe (0..1). */
  bossFog?: number;
  /** Fase 8.7: cielo oscurecido por el Wither (0..1). */
  bossDark?: number;
  /** Fase 8.6: el destello del End: [dirección x, y, z, intensidad]. */
  endFlash?: [number, number, number, number];
  /** Fase 7 (efectos): intensidad de las Náuseas (0..1) y la vista cerrada por la Ceguera o la Oscuridad. */
  nausea?: number;
  /** Fase 8: dimensión en la que está la cámara (cielo, niebla y luz; sin ella, el mundo normal). */
  dim?: number;
  /** Fase 8.2: color de la niebla del bioma (sRGB 0..255; sin él, el de la dimensión). */
  fog?: readonly [number, number, number] | null;
  sight?: SightFog | null;
}

const NEAR = 0.05;
const FAR = 1600;
const HALTON: [number, number][] = [];
for (let i = 1; i <= 16; i++) {
  const h = (b: number) => {
    let f = 1, r = 0, n = i;
    while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); }
    return r;
  };
  HALTON.push([h(2) - 0.5, h(3) - 0.5]);
}

const SUN_TILT = (25 * Math.PI) / 180;

export class Renderer {
  /** Fase 6.5 (remate): armadura de los soportes de este frame (la llena buildDropDraws). */
  private standViews: RemotePlayerView[] = [];
  readonly gl: GL;
  readonly caps: GLCaps;
  readonly canvas: HTMLCanvasElement;
  readonly terrain: TerrainRenderer;
  readonly textures: BlockTextures;
  readonly entities: EntityRenderer;
  readonly weather: Weather;
  /** Framebuffer con sólo el color del buffer de post (las partículas leen la profundidad aparte). */
  private particleFbo: WebGLFramebuffer | null = null;
  readonly items: ItemRenderer;
  readonly mobs: MobRenderer;
  readonly xpOrbs: XpOrbRenderer;
  readonly signText: SignTextRenderer;
  /** Fase 6.5 (libros y estandartes): tela de los estandartes con dibujos. */
  readonly bannerCloth: BannerRenderer;
  readonly lightning: LightningRenderer;
  private beams: GuardianBeamRenderer; // Fase 7.5 (océano)
  private beaconBeams: BeaconBeamRenderer; // Fase 8.5
  private endFx: EndFxRenderer; // Fase 8.6
  /** Fase 7 (efectos): náuseas, ceguera, oscuridad y contorno del Brillo. */
  private effectView: EffectView;
  settings: RenderSettings;

  private tri: FullscreenTriangle;
  private ubo: UniformBuffer;
  private atmosphere: Atmosphere;
  private clouds: Clouds;

  private pTerrain: Program;
  private pTerrainCut: Program;
  private pShadow: Program;
  private pShadowCut: Program;
  private pWater: Program;
  private pWaterShadow: Program;
  private pVol: Program;
  private pComposite: Program;
  private pTAA: Program;
  private pLum: Program;
  private pAdapt: Program;
  private pBloomDown: Program;
  private pBloomUp: Program;
  private pFinal: Program;
  private pFxaa: Program;

  private main: RenderTarget;
  private copy: RenderTarget;
  private volRT: RenderTarget;
  private compositeRT: RenderTarget;
  private history: RenderTarget[];
  private post: RenderTarget;
  private ldr: RenderTarget;
  private bloom: RenderTarget[] = [];
  private exposure: RenderTarget[];
  private lumTex: WebGLTexture;
  private lumFbo: WebGLFramebuffer;
  private shadowTex: WebGLTexture | null = null;
  private shadowFbo: WebGLFramebuffer | null = null;
  private waterShadowTex: WebGLTexture | null = null;
  private waterShadowFbo: WebGLFramebuffer | null = null;
  private shadowSize = 0;
  private shadowSampler: WebGLSampler;
  private waterNormal: WebGLTexture;
  private dummyDepth: WebGLTexture;

  private width = 0;
  private height = 0;
  private frame = 0;
  private historyIndex = 0;
  private historyValid = false;
  private exposureIndex = 0;
  private exposureReset = true;
  private prevViewProj = mat4.create();
  private prevCam = [0, 0, 0];
  private viewRot = mat4.create();
  private proj = mat4.create();
  private projUnjit = mat4.create();
  private viewProj = mat4.create();
  private viewProjUnjit = mat4.create();
  private invViewProj = mat4.create();
  private shadowMat = mat4.create();
  private tmpT = [0, 0, 0];
  /** Últimos datos útiles para la UI (proyección de etiquetas). */
  lastViewProj = mat4.create();
  lastCam = [0, 0, 0];
  stats = { drawCalls: 0, quads: 0 };
  sunDir = [0, 1, 0];

  constructor(
    canvas: HTMLCanvasElement, tex: GeneratedTextures, settings: RenderSettings, sprites: ItemSprites,
    mobTextures: (id: number, variant?: number) => MobTexture | null, // Fase 6 (monturas): variant = pelaje
  ) {
    this.canvas = canvas;
    const { gl, caps } = createContext(canvas);
    this.gl = gl;
    this.caps = caps;
    this.settings = settings;
    this.tri = new FullscreenTriangle(gl);
    this.ubo = new UniformBuffer(gl, 172); // Fase 8: + uDim, uDimFog y uDimAmb; 8.6: + uEndFlash
    this.textures = new BlockTextures(gl, caps, tex);
    this.terrain = new TerrainRenderer(gl);
    this.atmosphere = new Atmosphere(gl, this.tri);
    this.clouds = new Clouds(gl, this.tri);
    this.entities = new EntityRenderer(gl, this.textures);
    this.weather = new Weather(gl);
    this.items = new ItemRenderer(gl, caps, this.textures, sprites);
    this.mobs = new MobRenderer(gl, mobTextures);
    this.effectView = new EffectView(gl, this.tri); // Fase 7 (efectos)
    this.xpOrbs = new XpOrbRenderer(gl);
    this.signText = new SignTextRenderer(gl);
    this.bannerCloth = new BannerRenderer(gl);
    this.lightning = new LightningRenderer(gl);
    this.beams = new GuardianBeamRenderer(gl); // Fase 7.5 (océano)
    this.beaconBeams = new BeaconBeamRenderer(gl); // Fase 8.5
    this.endFx = new EndFxRenderer(gl); // Fase 8.6

    this.pTerrain = new Program(gl, { name: 'terrain', vs: TERRAIN_VS, fs: TERRAIN_FS });
    this.pTerrainCut = new Program(gl, { name: 'terrain-cutout', vs: TERRAIN_VS, fs: TERRAIN_FS, defines: { CUTOUT: true } });
    this.pShadow = new Program(gl, { name: 'shadow', vs: SHADOW_VS, fs: SHADOW_FS });
    this.pShadowCut = new Program(gl, { name: 'shadow-cutout', vs: SHADOW_VS, fs: SHADOW_FS, defines: { CUTOUT: true } });
    this.pWater = new Program(gl, { name: 'water', vs: WATER_VS, fs: WATER_FS });
    this.pWaterShadow = new Program(gl, { name: 'water-shadow', vs: WATER_SHADOW_VS, fs: WATER_SHADOW_FS });
    this.pVol = new Program(gl, { name: 'volumetric', vs: FULLSCREEN_VS, fs: VOLUMETRIC_FS });
    this.pComposite = new Program(gl, { name: 'composite', vs: FULLSCREEN_VS, fs: COMPOSITE_FS });
    this.pTAA = new Program(gl, { name: 'taa', vs: FULLSCREEN_VS, fs: TAA_FS });
    this.pLum = new Program(gl, { name: 'luminance', vs: FULLSCREEN_VS, fs: LUMINANCE_FS });
    this.pAdapt = new Program(gl, { name: 'adapt', vs: FULLSCREEN_VS, fs: ADAPT_FS });
    this.pBloomDown = new Program(gl, { name: 'bloom-down', vs: FULLSCREEN_VS, fs: BLOOM_DOWN_FS });
    this.pBloomUp = new Program(gl, { name: 'bloom-up', vs: FULLSCREEN_VS, fs: BLOOM_UP_FS });
    this.pFinal = new Program(gl, { name: 'final', vs: FULLSCREEN_VS, fs: FINAL_FS });
    this.pFxaa = new Program(gl, { name: 'fxaa', vs: FULLSCREEN_VS, fs: FXAA_FS });

    const hdr = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    this.main = new RenderTarget(gl, [hdr], 'texture');
    this.copy = new RenderTarget(gl, [hdr], 'texture');
    this.volRT = new RenderTarget(gl, [hdr]);
    this.compositeRT = new RenderTarget(gl, [hdr]);
    this.history = [new RenderTarget(gl, [hdr]), new RenderTarget(gl, [hdr])];
    this.post = new RenderTarget(gl, [hdr], 'external');
    this.ldr = new RenderTarget(gl, [{ internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR }]);
    for (let i = 0; i < 6; i++) this.bloom.push(new RenderTarget(gl, [hdr]));
    this.exposure = [
      new RenderTarget(gl, [{ ...hdr, filter: gl.NEAREST }]),
      new RenderTarget(gl, [{ ...hdr, filter: gl.NEAREST }]),
    ];
    for (const e of this.exposure) e.resize(1, 1);

    // Luminancia media: 64x64 RG16F con mipmaps.
    this.lumTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.lumTex);
    gl.texStorage2D(gl.TEXTURE_2D, 7, gl.RG16F, 64, 64);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.lumFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lumTex, 0);

    this.shadowSampler = gl.createSampler()!;
    gl.samplerParameteri(this.shadowSampler, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.samplerParameteri(this.shadowSampler, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.samplerParameteri(this.shadowSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.shadowSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.shadowSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.shadowSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Textura de profundidad 1x1 (= 1.0) para cuando las sombras están desactivadas.
    this.dummyDepth = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.dummyDepth);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, 1, 1);
    const dfb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dfb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.dummyDepth, 0);
    gl.drawBuffers([gl.NONE]);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(dfb);

    // Mapa de normales del agua.
    const wn = new RenderTarget(gl, [{ internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, wrap: gl.REPEAT }]);
    wn.resize(256, 256);
    wn.bind();
    gl.disable(gl.DEPTH_TEST);
    const pWN = new Program(gl, { name: 'water-normal', vs: FULLSCREEN_VS, fs: WATER_NORMAL_GEN_FS });
    pWN.use();
    this.tri.draw();
    gl.deleteProgram(pWN.program);
    this.waterNormal = wn.color;
    gl.bindTexture(gl.TEXTURE_2D, this.waterNormal);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.atmosphere.precompute();
  }

  // ---------------------------------------------------------------- tamaño

  private ensureSize(): void {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    // Resolución interna limitada (~1440p) para no agotar la memoria de vídeo en pantallas 4K.
    let scale = this.settings.renderScale;
    const maxPixels = 2560 * 1440;
    if (cw * ch * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (cw * ch));
    const w = Math.max(1, Math.floor(cw * scale));
    const h = Math.max(1, Math.floor(ch * scale));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.main.resize(w, h);
    this.copy.resize(w, h);
    this.compositeRT.resize(w, h);
    this.history[0].resize(w, h);
    this.history[1].resize(w, h);
    this.post.resize(w, h, this.main.depth);
    // Partículas: el color del buffer de post sin su profundidad.
    this.particleFbo ??= gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.particleFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.post.color, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.ldr.resize(cw, ch);
    this.volRT.resize(Math.ceil(w / 2), Math.ceil(h / 2));
    let bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    for (const b of this.bloom) {
      b.resize(bw, bh);
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
    }
    this.historyValid = false;
    void gl;
  }

  private ensureShadowMap(): void {
    const size = this.settings.shadowSize;
    if (size === this.shadowSize) return;
    const gl = this.gl;
    if (this.shadowTex) gl.deleteTexture(this.shadowTex);
    if (this.waterShadowTex) gl.deleteTexture(this.waterShadowTex);
    if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo);
    if (this.waterShadowFbo) gl.deleteFramebuffer(this.waterShadowFbo);
    this.shadowTex = this.waterShadowTex = null;
    this.shadowFbo = this.waterShadowFbo = null;
    this.shadowSize = size;
    if (size <= 0) return;
    const mk = (s: number): [WebGLTexture, WebGLFramebuffer] => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, s, s);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return [t, f];
    };
    [this.shadowTex, this.shadowFbo] = mk(size);
    [this.waterShadowTex, this.waterShadowFbo] = mk(Math.max(512, size / 2));
  }

  // ---------------------------------------------------------------- uniformes

  private computeLights(s: FrameState) {
    const theta = s.dayTime * Math.PI * 2;
    const sun = [Math.cos(theta), Math.sin(theta) * Math.cos(SUN_TILT), Math.sin(theta) * Math.sin(SUN_TILT)];
    const moon = [-sun[0], -sun[1], -sun[2]];
    const sunUp = sun[1] >= 0;
    const light = sunUp ? sun : moon;
    const T = Atmosphere.transmittance(s.camY, light[1], this.tmpT);
    const phase = ((s.day % 8) + 8) % 8 / 8;
    const moonFull = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
    const moonIllum = SUN_ILLUMINANCE[0] * 0.009 * (0.3 + 0.7 * moonFull);
    // Luz directa atenuada por el cielo cubierto cuando llueve.
    // Fase 8: sin cielo no hay luz directa (ni sombras ni rayos de luz).
    const fade = dimensionDef(s.dim ?? 0).sky ? smooth(0.0, 0.07, Math.abs(sun[1])) * (1 - 0.82 * s.rain) * (1 - 0.4 * (s.bossDark ?? 0)) : 0; // 8.7: el Wither oscurece
    const lc = sunUp
      ? [SUN_ILLUMINANCE[0] * T[0] * fade, SUN_ILLUMINANCE[1] * T[1] * fade, SUN_ILLUMINANCE[2] * T[2] * fade]
      : [moonIllum * 0.75 * T[0] * fade, moonIllum * 0.85 * T[1] * fade, moonIllum * T[2] * fade];
    return { sun, moon, light, lightColor: lc, sunUp, moonIllum, phase };
  }

  private writeUBO(s: FrameState, L: ReturnType<Renderer['computeLights']>, shadowOrigin: number[]): void {
    const d = this.ubo.data;
    d.set(this.viewRot, 0);
    d.set(this.proj, 16);
    d.set(this.viewProj, 32);
    d.set(this.invViewProj, 48);
    d.set(this.prevViewProj, 64);
    d.set(this.shadowMat, 80);
    d[96] = s.camX; d[97] = s.camY; d[98] = s.camZ; d[99] = s.time % 3600;
    d[100] = s.camX - shadowOrigin[0]; d[101] = s.camY - shadowOrigin[1]; d[102] = s.camZ - shadowOrigin[2];
    d[103] = this.settings.shadowDistance;
    d[104] = L.sun[0]; d[105] = L.sun[1]; d[106] = L.sun[2]; d[107] = smooth(-0.1, 0.2, L.sun[1]);
    d[108] = L.moon[0]; d[109] = L.moon[1]; d[110] = L.moon[2]; d[111] = L.phase;
    d[112] = L.light[0]; d[113] = L.light[1]; d[114] = L.light[2]; d[115] = L.sunUp ? 1 : 0;
    d[116] = L.lightColor[0]; d[117] = L.lightColor[1]; d[118] = L.lightColor[2]; d[119] = s.underwater ? s.waterLight ?? 0 : 0;
    d[120] = SUN_ILLUMINANCE[0]; d[121] = SUN_ILLUMINANCE[1]; d[122] = SUN_ILLUMINANCE[2]; d[123] = L.moonIllum;
    const R = this.settings.renderDistance * 16;
    d[124] = s.mist; d[125] = 1 / 28; d[126] = R * 0.62; d[127] = R * 0.93;
    d[128] = this.width; d[129] = this.height; d[130] = 1 / this.width; d[131] = 1 / this.height;
    d[132] = 0; d[133] = 0; d[134] = 0; d[135] = 0;
    d[136] = this.frame; d[137] = s.rain; d[138] = s.underwater ? 1 : 0; d[139] = s.eyeSkyExposure;
    d[140] = s.cloudCoverage; d[141] = 230; d[142] = 560; d[143] = 1.0;
    d[144] = s.time * 7.0; d[145] = s.time * 2.5; d[146] = 1.0 + s.rain * 1.5; d[147] = s.time % 10000;
    d[148] = Math.max(1, this.shadowSize); d[149] = this.settings.pcfSamples;
    d[150] = this.settings.ssrSteps; d[151] = this.settings.volumetricSteps;
    const fovY = (this.settings.fov * Math.PI) / 180;
    d[152] = NEAR; d[153] = FAR; d[154] = Math.tan(fovY / 2); d[155] = this.width / this.height;
    // Fase 8: la dimensión (cielo, niebla y penumbra). La niebla se cierra antes que el borde normal.
    const dd = dimensionDef(s.dim ?? 0);
    const lin = (c: number) => Math.pow(c / 255, 2.2);
    d[156] = dd.sky ? 1 : 0; d[157] = dd.lavaSea ?? 0; d[158] = dd.sky ? 0 : (1.3 / (R * dd.fogDistance)) * (1 + (s.bossFog ?? 0) * 1.6); d[159] = dd.skyLight ? 0 : 1;
    // Fase 8.2: la niebla es la del bioma (mezclada con los de alrededor) y la penumbra toma su tono.
    const fog = s.fog ?? dd.fog;
    d[160] = lin(fog[0]) * 0.8; d[161] = lin(fog[1]) * 0.8; d[162] = lin(fog[2]) * 0.8; d[163] = dd.skybox === 'end' ? 1 : 0;
    const top = Math.max(fog[0], fog[1], fog[2], 1);
    const hue = (c: number) => 0.55 + 0.45 * (c / top);
    // Fase 8 (entorno del Nether): una penumbra algo más clara, para que lo oscuro (arena de alma, basalto) se lea
    // contra la niebla en vez de quedar en silueta negra.
    const amb = dd.ambient * 2.4; // en proporción a la luz de bloque, como el 10 % de Java (lerp(ambiente, luz, 1))
    // Fase 8.6: el End tiene su propio color de penumbra (gris verdoso).
    const ac = dd.ambientColor;
    const atop = ac ? Math.max(ac[0], ac[1], ac[2], 1) : 1;
    const tone = (i: number) => (ac ? ac[i] / atop : hue(fog[i]));
    d[164] = amb * tone(0); d[165] = amb * tone(1); d[166] = amb * tone(2); d[167] = 0;
    // Fase 8.6: el destello del End (dirección e intensidad).
    const fl = s.endFlash;
    d[168] = fl ? fl[0] : 0; d[169] = fl ? fl[1] : 1; d[170] = fl ? fl[2] : 0; d[171] = fl ? fl[3] : 0;
    this.ubo.upload();
  }

  // ---------------------------------------------------------------- frame

  render(s: FrameState): void {
    const gl = this.gl;
    this.ensureSize();
    this.ensureShadowMap();
    const set = this.settings;
    const W = this.width, H = this.height;
    this.terrain.stats.drawCalls = 0;
    this.terrain.stats.quads = 0;

    // Cámara (relativa: la vista sólo rota).
    const fovY = (set.fov * Math.PI) / 180;
    mat4.perspective(this.projUnjit, fovY, W / H, NEAR, FAR);
    EffectView.warp(this.projUnjit, s.nausea ?? 0, s.time); // Fase 7 (efectos): náuseas
    mat4.copy(this.proj, this.projUnjit);
    if (set.taa) {
      const j = HALTON[this.frame % 8];
      this.proj[8] += (j[0] * 2) / W;
      this.proj[9] += (j[1] * 2) / H;
    }
    const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
    const fwd = vec3.fromValues(-Math.sin(s.yaw) * cp, sp, -Math.cos(s.yaw) * cp);
    mat4.lookAt(this.viewRot, [0, 0, 0], fwd, [0, 1, 0]);
    // Inclinación lateral de la cámara (al recibir un golpe).
    if (s.roll) mat4.multiply(this.viewRot, mat4.fromZRotation(mat4.create(), s.roll), this.viewRot);
    mat4.multiply(this.viewProj, this.proj, this.viewRot);
    mat4.multiply(this.viewProjUnjit, this.projUnjit, this.viewRot);
    mat4.invert(this.invViewProj, this.viewProj);
    // Matriz del frame anterior desplazada por el movimiento de la cámara.
    const moved = [s.camX - this.prevCam[0], s.camY - this.prevCam[1], s.camZ - this.prevCam[2]];
    const prevRel = mat4.create();
    mat4.translate(prevRel, this.prevViewProj, moved as unknown as vec3);
    const lights = this.computeLights(s);
    this.sunDir = lights.sun;

    // Sombras: órbita estable alrededor del eje de la trayectoria solar.
    const shadowOrigin = [Math.floor(s.camX), Math.floor(s.camY), Math.floor(s.camZ)];
    const axis = [0, -Math.sin(SUN_TILT), Math.cos(SUN_TILT)];
    const lv = mat4.create();
    mat4.lookAt(lv, lights.light as unknown as vec3, [0, 0, 0], axis as unknown as vec3);
    const D = set.shadowDistance;
    const lp = mat4.create();
    mat4.ortho(lp, -D, D, -D, D, -256, 256);
    mat4.multiply(this.shadowMat, lp, lv);

    // UBO con prevViewProj correcto.
    const savedPrev = mat4.clone(this.prevViewProj);
    mat4.copy(this.prevViewProj, prevRel);
    this.writeUBO(s, lights, shadowOrigin);
    mat4.copy(this.prevViewProj, savedPrev);

    this.atmosphere.update();

    // Culling.
    this.terrain.setFrustum(this.viewProj);
    this.terrain.cull(s.camX, s.camY, s.camZ, set.renderDistance, this.shadowSize > 0 ? D * 1.2 : 0);

    const dropDraws = this.buildDropDraws(s);

    // --- 2. Sombras ---
    const lightOn = lights.lightColor[0] + lights.lightColor[1] + lights.lightColor[2] > 1e-4;
    if (this.shadowFbo && this.waterShadowFbo && lightOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      this.pShadow.use().tex2D('uLayerProps', this.textures.layerProps);
      this.terrain.draw(this.pShadow, this.terrain.shadowList, 'opaque', s.camX, s.camY, s.camZ);
      this.pShadowCut.use().tex2D('uLayerProps', this.textures.layerProps)
        .tex('uAlbedo', gl.TEXTURE_2D_ARRAY, this.textures.albedo);
      this.terrain.draw(this.pShadowCut, this.terrain.shadowList, 'cutout', s.camX, s.camY, s.camZ);
      this.entities.drawPlayersShadow(s.players, s.camX, s.camY, s.camZ);
      this.entities.drawArmorOnlyShadow(this.standViews, s.camX, s.camY, s.camZ); // Fase 6.5 (remate)
      this.mobs.drawShadow(s.mobs, s.camX, s.camY, s.camZ, s.time);
      this.items.drawShadow(dropDraws);
      // Profundidad de la superficie del agua (para cáusticas y absorción de la luz).
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.waterShadowFbo);
      const ws = Math.max(512, this.shadowSize / 2);
      gl.viewport(0, 0, ws, ws);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      this.pWaterShadow.use().tex2D('uLayerProps', this.textures.layerProps);
      this.terrain.draw(this.pWaterShadow, this.terrain.shadowList, 'translucent', s.camX, s.camY, s.camZ);
    } else if (this.shadowFbo && this.waterShadowFbo) {
      for (const f of [this.shadowFbo, this.waterShadowFbo]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
      }
    }
    const shadowTex = this.shadowTex ?? this.dummyDepth;
    const waterShadowTex = this.waterShadowTex ?? this.dummyDepth;

    const bindLighting = (p: Program) => {
      p.tex2D('uShadowMap', shadowTex, this.shadowSampler)
        .tex2D('uWaterShadow', waterShadowTex)
        .tex2D('uIrradiance', this.atmosphere.irradiance.color)
        .tex2D('uCloudWeather', this.clouds.weather)
        .tex2D('uSkyView', this.atmosphere.skyView.color)
        .tex2D('uLayerProps', this.textures.layerProps)
        .tex2D('uBiomeMap', this.terrain.biomeMap)
        .tex('uAlbedo', gl.TEXTURE_2D_ARRAY, this.textures.albedo)
        .tex('uNormalTex', gl.TEXTURE_2D_ARRAY, this.textures.normal)
        .tex('uSpecular', gl.TEXTURE_2D_ARRAY, this.textures.specular);
      return p;
    };

    // --- 3. Pasada principal ---
    this.main.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    bindLighting(this.pTerrain.use()).f1('uPom', set.pom ? 1 : 0);
    this.terrain.draw(this.pTerrain, this.terrain.visibleOpaque, 'opaque', s.camX, s.camY, s.camZ);
    bindLighting(this.pTerrainCut.use());
    this.terrain.draw(this.pTerrainCut, this.terrain.visibleOpaque, 'cutout', s.camX, s.camY, s.camZ);
    if (s.crack) {
      const c = s.crack;
      this.items.drawCrack(c.x, c.y, c.z, c.stage, s.camX, s.camY, s.camZ, this.viewProj, bindLighting, c.box);
    }
    this.entities.drawPlayers(s.players, s.camX, s.camY, s.camZ, bindLighting);
    this.entities.drawArmorOnly(this.standViews, s.camX, s.camY, s.camZ, bindLighting); // Fase 6.5 (remate)
    const lightOf = (x: number, y: number, z: number): [number, number] => {
      const l = s.lightAt(Math.floor(x), Math.floor(y), Math.floor(z));
      return [(l >> 4) / 15, (l & 15) / 15];
    };
    this.mobs.draw(s.mobs, s.camX, s.camY, s.camZ, s.time, (e) => lightOf(e.x, e.y + 0.6, e.z), bindLighting);
    this.drawMobHeldItems(s, lightOf, bindLighting);
    this.drawPlayerHeldItems(s, bindLighting);
    this.items.drawWorld(dropDraws, this.viewProj, s.grassTint, bindLighting);
    this.mobs.drawVehicleMasks(s.mobs, s.camX, s.camY, s.camZ, s.time, bindLighting); // Fase 7 (transporte): sin agua dentro de las barcas
    this.signText.draw(s.signs ?? [], s.camX, s.camY, s.camZ);
    this.bannerCloth.draw(s.banners ?? [], s.camX, s.camY, s.camZ, lightOf, bindLighting);
    gl.disable(gl.CULL_FACE);
    this.xpOrbs.draw(s.drops, s.camX, s.camY, s.camZ);
    this.atmosphere.drawSky();
    this.lightning.draw(s.bolts ?? [], s.camX, s.camY, s.camZ);
    this.beams.draw(s.guardianBeams ?? [], s.camX, s.camY, s.camZ); // Fase 7.5 (océano)
    const beacons = s.gatewayBeams ? [...(s.beaconBeams ?? []), ...s.gatewayBeams] : s.beaconBeams ?? []; // Fase 8.6: y los de las puertas del End
    this.beaconBeams.draw(beacons, s.camX, s.camY, s.camZ, performance.now() / 1000); // Fase 8.5: el haz de los faros
    this.endFx.draw(s.endRays ?? [], s.crystalBeams ?? [], s.camX, s.camY, s.camZ, performance.now() / 1000); // Fase 8.6

    // --- 4. Agua ---
    if (this.terrain.visibleTranslucent.length > 0) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.main.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.copy.fbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      this.main.bind();
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      bindLighting(this.pWater.use())
        .tex2D('uSceneCopy', this.copy.color)
        .tex2D('uDepthCopy', this.copy.depth)
        .tex2D('uWaterNormal', this.waterNormal);
      this.terrain.draw(this.pWater, this.terrain.visibleTranslucent, 'translucent', s.camX, s.camY, s.camZ);
    }
    gl.disable(gl.DEPTH_TEST);

    // --- 5. Nubes y luz volumétrica ---
    const cloudsOn = set.clouds && dimensionDef(s.dim ?? 0).sky; // Fase 8: sin cielo no hay nubes
    if (cloudsOn) {
      this.clouds.resize(W, H, set.cloudScale);
      this.clouds.render(this.main.depth!, this.atmosphere.skyView.color, this.atmosphere.irradiance.color, set.cloudSteps, set.taa);
    }
    const volOn = set.volumetric && this.shadowSize > 0 && lightOn;
    if (volOn) {
      this.volRT.bind();
      this.pVol.use()
        .tex2D('uDepth', this.main.depth)
        .tex2D('uShadowMap', shadowTex, this.shadowSampler)
        .tex2D('uWaterShadow', waterShadowTex)
        .f1('uSteps', set.volumetricSteps)
        .f1('uTemporal', set.taa ? 1 : 0);
      this.tri.draw();
    }

    // --- 6. Composición ---
    this.compositeRT.bind();
    this.pComposite.use()
      .tex2D('uScene', this.main.color)
      .tex2D('uDepth', this.main.depth)
      .tex2D('uClouds', this.clouds.target.color)
      .tex2D('uVolumetric', this.volRT.color)
      .tex2D('uSkyView', this.atmosphere.skyView.color)
      .tex2D('uIrradiance', this.atmosphere.irradiance.color)
      .tex2D('uFarOcean', this.atmosphere.farOcean)
      .f1('uCloudsOn', cloudsOn ? 1 : 0)
      .f1('uCloudBlur', set.taa ? 0 : 1)
      .f1('uVolumetricOn', volOn ? 1 : 0);
    this.tri.draw();

    // --- 7. TAA ---
    let resolved: RenderTarget;
    if (set.taa) {
      const cur = this.history[this.historyIndex];
      const prev = this.history[1 - this.historyIndex];
      cur.bind();
      this.pTAA.use()
        .tex2D('uCurrent', this.compositeRT.color)
        .tex2D('uHistory', prev.color)
        .tex2D('uDepth', this.main.depth)
        .f1('uReset', this.historyValid ? 0 : 1);
      this.tri.draw();
      this.historyValid = true;
      this.historyIndex = 1 - this.historyIndex;
      resolved = cur;
    } else {
      this.historyValid = false;
      resolved = this.compositeRT;
    }
    // Copia al buffer de post (con la profundidad de la escena) para contorno y mano.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resolved.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.post.fbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    this.post.bind();
    // Sin jitter para lo que se dibuja después del TAA.
    this.ubo.data.set(this.viewProjUnjit as Float32Array, 32);
    this.ubo.upload();
    if (s.selection) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      this.entities.drawOutline(s.selection, s.camX, s.camY, s.camZ);
      gl.depthMask(true);
    }
    // Partículas (después del TAA, como la lluvia, para que no dejen estela): se desvanecen contra la
    // geometría con una copia de la profundidad de la escena.
    if (this.entities.particles.n > 0) {
      // Sólo el color del buffer de post: así se puede leer la profundidad de la escena.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.particleFbo);
      gl.viewport(0, 0, W, H);
      this.entities.particles.draw(s.camX, s.camY, s.camZ, this.textures.albedo, this.atmosphere.irradiance.color, this.main.depth!);
      this.post.bind();
      gl.enable(gl.DEPTH_TEST);
    }
    // Lluvia o nieve (después del TAA para que las gotas no dejen estela).
    this.weather.draw(s.camX, s.camY, s.camZ, s.rain, s.snow, s.time, this.atmosphere.irradiance.color);
    gl.disable(gl.DEPTH_TEST);

    // --- 8. Exposición automática (medida antes de dibujar la mano; el cielo pesa menos) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumFbo);
    gl.viewport(0, 0, 64, 64);
    this.pLum.use().tex2D('uColor', this.post.color).tex2D('uDepth', this.main.depth);
    this.tri.draw();
    gl.bindTexture(gl.TEXTURE_2D, this.lumTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    // Fase 7 (efectos): Ceguera y Oscuridad (después de medir la exposición y antes de la mano).
    // (Sobre el color del buffer de post sin su profundidad, que se lee aparte, como las partículas.)
    if (s.sight) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.particleFbo);
      gl.viewport(0, 0, W, H);
      this.effectView.sight(s.sight, this.main.depth);
    }

    // Objeto en la mano (con su propio buffer de profundidad).
    if (s.showHand && (s.heldItem > 0 || (s.offhandItem ?? 0) > 0)) {
      this.post.bind();
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      this.drawHeld(s, W / H, bindLighting);
      gl.disable(gl.DEPTH_TEST);
    }
    const expCur = this.exposure[this.exposureIndex];
    const expPrev = this.exposure[1 - this.exposureIndex];
    expCur.bind();
    this.pAdapt.use()
      .tex2D('uLum', this.lumTex)
      .tex2D('uPrev', expPrev.color)
      .f1('uDt', Math.min(s.dt, 0.1))
      .f1('uEV', set.brightness - s.rain * 0.7 + (s.nightVision ?? 0) * 2.5)
      .f1('uLevels', 6)
      .f1('uReset', this.exposureReset ? 1 : 0);
    this.tri.draw();
    this.exposureReset = false;
    this.exposureIndex = 1 - this.exposureIndex;

    // --- Bloom ---
    if (set.bloom) {
      let src = this.post.color;
      for (let i = 0; i < this.bloom.length; i++) {
        const b = this.bloom[i];
        b.bind();
        const sw = i === 0 ? W : this.bloom[i - 1].width;
        const sh = i === 0 ? H : this.bloom[i - 1].height;
        this.pBloomDown.use().tex2D('uSrc', src).f2('uTexel', 1 / sw, 1 / sh).f1('uFirst', i === 0 ? 1 : 0);
        this.tri.draw();
        src = b.color;
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.bloom.length - 2; i >= 0; i--) {
        const b = this.bloom[i];
        const lower = this.bloom[i + 1];
        b.bind();
        this.pBloomUp.use().tex2D('uSrc', lower.color).f2('uTexel', 1 / lower.width, 1 / lower.height).f1('uRadius', 1.0);
        this.tri.draw();
      }
      gl.disable(gl.BLEND);
    }

    // --- Final ---
    const cw = this.canvas.width, ch = this.canvas.height;
    const finalTarget = set.taa ? null : this.ldr;
    if (finalTarget) finalTarget.bind();
    else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
    }
    this.pFinal.use()
      .tex2D('uColor', this.post.color)
      .tex2D('uBloom', this.bloom[0].color)
      .tex2D('uExposure', expCur.color)
      .f1('uBloomStrength', set.bloom ? 0.065 : 0)
      .f1('uSharpen', set.taa ? 0.55 : 0.0)
      .f1('uSaturation', 1.08)
      .f1('uVignette', 0.35)
      .f1('uUnderwater', s.underwater ? 1 : 0);
    this.tri.draw();
    if (finalTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      this.pFxaa.use().tex2D('uColor', this.ldr.color).f2('uTexel', 1 / cw, 1 / ch);
      this.tri.draw();
    }

    // Fase 7 (efectos): contorno de lo que brilla, encima de todo.
    this.effectView.glow(s.mobs, s.players, this.mobs, this.entities, s.camX, s.camY, s.camZ, s.time, W, H, cw, ch);

    // Estado para el frame siguiente.
    mat4.copy(this.prevViewProj, this.viewProjUnjit);
    this.prevCam = [s.camX, s.camY, s.camZ];
    mat4.copy(this.lastViewProj, this.viewProjUnjit);
    this.lastCam = [s.camX, s.camY, s.camZ];
    this.stats.drawCalls = this.terrain.stats.drawCalls;
    this.stats.quads = this.terrain.stats.quads;
    this.frame++;
  }

  // ---------------------------------------------------------------- objetos y mano

  /** Objetos tirados, flechas y bloques que caen: lista de dibujo. */
  private buildDropDraws(s: FrameState): ItemDraw[] {
    const out: ItemDraw[] = [];
    this.standViews.length = 0;
    const lightOf = (x: number, y: number, z: number): [number, number] => {
      const l = s.lightAt(Math.floor(x), Math.floor(y), Math.floor(z));
      return [(l >> 4) / 15, (l & 15) / 15];
    };
    for (const e of s.drops) {
      const rx = e.x - s.camX, ry = e.y - s.camY, rz = e.z - s.camZ;
      if (rx * rx + ry * ry + rz * rz > 96 * 96) continue;
      if (e.type === ENT_ITEM) {
        const model = this.items.model(e.item, e.dmg, dyeDecorKey(e.dye)); // Fase 7 (pociones): con el color de su tipo; el cuero teñido
        if (!model) continue;
        const copies = e.count <= 1 ? 1 : e.count <= 16 ? 2 : e.count <= 32 ? 3 : 4;
        const bob = Math.sin(e.age * 2.4 + e.seed * 6.28) * 0.05;
        const spin = e.age * 1.7 + e.seed * 6.28;
        const size = model.flat ? 0.42 : 0.25;
        const light = lightOf(e.x, e.y + 0.2, e.z);
        for (let c = 0; c < copies; c++) {
          const m = mat4.create();
          const ox = c === 0 ? 0 : (((c * 37) % 7) - 3) * 0.03, oz = c === 0 ? 0 : (((c * 53) % 7) - 3) * 0.03;
          mat4.translate(m, m, [rx + ox, ry + size / 2 + 0.06 + bob + (model.flat ? 0 : c * 0.04), rz + oz]);
          mat4.rotateY(m, m, spin);
          if (model.flat) mat4.translate(m, m, [0, 0, c * 0.05]);
          mat4.scale(m, m, [size, size, size]);
          out.push({ model, m, light, glint: (e.flags & EF_GLINT) !== 0 }); // Fase 7: brillo
        }
      } else if (e.type === ENT_ARROW) {
        // Fase 7 (pociones): las flechas con efecto llevan la punta de su color.
        const model = e.potion === -2 ? this.items.model(SPECTRAL_ARROW) : (e.potion ?? -1) >= 0 ? this.items.model(TIPPED_ARROW, e.potion) : this.items.model(ARROW); // Fase 8.3: la espectral
        if (!model) continue;
        const m = mat4.create();
        mat4.translate(m, m, [rx, ry, rz]);
        mat4.rotateY(m, m, e.yaw);
        mat4.rotateX(m, m, e.pitch);
        mat4.rotateY(m, m, Math.PI / 2);
        mat4.rotateZ(m, m, -Math.PI / 4);
        mat4.scale(m, m, [0.7, 0.7, 0.7]);
        out.push({ model, m, light: lightOf(e.x, e.y, e.z) });
      } else if (e.type === ENT_LARGE_FIREBALL || e.type === ENT_SMALL_FIREBALL) {
        // Fase 8.3: bola de fuego: el sprite de la carga de fuego de cara a la cámara (grande × 3, pequeña × 0,75), con toda la luz.
        const model = this.items.model(FIRE_CHARGE);
        if (!model) continue;
        const big = e.type === ENT_LARGE_FIREBALL;
        const m = mat4.create();
        mat4.translate(m, m, [rx, ry + (big ? 0.5 : 0.16), rz]);
        mat4.rotateY(m, m, Math.atan2(-rx, -rz));
        const k = big ? 0.9 : 0.225;
        mat4.scale(m, m, [k, k, k]);
        out.push({ model, m, light: [0, 1] });
      } else if (e.type === ENT_THROWN && e.item > 0) {
        // Huevo (o poción: Fase 7) en vuelo: el sprite de cara a la cámara.
        const model = this.items.model(e.item, e.dmg);
        if (!model) continue;
        const m = mat4.create();
        mat4.translate(m, m, [rx, ry + 0.12, rz]);
        mat4.rotateY(m, m, Math.atan2(-rx, -rz));
        mat4.scale(m, m, [0.3, 0.3, 0.3]);
        // Fase 8.6: el ojo de ender se ve con toda la luz (ThrownItemRenderer con fullBright).
        out.push({ model, m, light: e.item === ENDER_EYE ? [0, 1] : lightOf(e.x, e.y, e.z), glint: (e.flags & EF_GLINT) !== 0 }); // Fase 7: brillo
      } else if (e.type === ENT_DISPLAY && e.item > 0) {
        // Comida asándose en una fogata: tumbada encima.
        const model = this.items.model(e.item);
        if (!model) continue;
        const m = mat4.create();
        mat4.translate(m, m, [rx, ry + 0.02, rz]);
        mat4.rotateY(m, m, e.yaw);
        mat4.rotateX(m, m, -Math.PI / 2);
        mat4.scale(m, m, [0.36, 0.36, 0.36]);
        out.push({ model, m, light: lightOf(e.x, e.y + 0.3, e.z), glint: (e.flags & EF_GLINT) !== 0 }); // Fase 7: brillo
      } else if (e.type === ENT_BOBBER) {
        // Flotador: mitad de abajo blanca y mitad de arriba roja.
        const light = lightOf(e.x, e.y + 0.1, e.z);
        for (const [block, dy] of [[WHITE_WOOL, 0.04], [RED_WOOL, 0.11]] as const) {
          const m = mat4.create();
          mat4.translate(m, m, [rx, ry + dy, rz]);
          mat4.scale(m, m, [0.12, 0.07, 0.12]);
          out.push({ model: this.items.blockModel(block), m, light });
        }
      } else if (e.type === ENT_FALLING && e.item > 0) {
        // Fase 7 (encantamientos): los bloques con forma (el yunque) caen con su forma.
        const model = F7_BLOCK_RENDER[e.item] === R_MODEL ? this.items.model(itemForBlock(e.item)) ?? this.items.blockModel(e.item) : this.items.blockModel(e.item);
        const m = mat4.create();
        mat4.translate(m, m, [rx, ry + 0.49, rz]);
        mat4.scale(m, m, [0.98, 0.98, 0.98]);
        out.push({ model, m, light: lightOf(e.x, e.y + 0.5, e.z) });
      } else if (e.type === ENT_TNT && e.item > 0) {
        pushPrimedTnt(out, e, this.items, rx, ry, rz, lightOf); // Fase 7 (mecanismos): dinamita encendida
      } else if (isHangingType(e.type)) {
        pushHangingDraws(out, e, this.items, rx, ry, rz, lightOf); // Fase 6.5 (decoración): cuadros y marcos
      } else if (e.type === ENT_ARMOR_STAND) {
        // Fase 6.5 (remate): soporte para armadura (la armadura se dibuja aparte, con las cajas del jugador).
        pushStandDraws(out, e, this.items, rx, ry, rz, lightOf);
        const v = standArmorView(e, lightOf(e.x, e.y + 1, e.z));
        if (v) this.standViews.push(v);
      } else {
        const n0 = out.length;
        pushEquipmentDraws(out, e, this.items, rx, ry, rz, lightOf); // Fase 6.5 (equipo): tridentes y cohetes
        if (e.flags & EF_GLINT) for (let k = n0; k < out.length; k++) out[k].glint = true; // Fase 7: tridente encantado
      }
    }
    if (s.enchantBooks) out.push(...s.enchantBooks); // Fase 7 (encantamientos)
    if (s.movingBlocks) out.push(...s.movingBlocks); // Fase 7 (mecanismos)
    for (const l of s.fishLines ?? []) this.pushFishLine(out, s, l, lightOf);
    // Fase 6.5 (remate): correas, más gruesas y de cuero, y el nudo de cada valla.
    const lead = this.items.blockModel(WOOL.brown);
    for (const l of s.leashes?.lines ?? []) this.pushFishLine(out, s, l, lightOf, lead, 0.035);
    for (const k of s.leashes?.knots ?? []) {
      const m = mat4.create();
      mat4.translate(m, m, [k[0] - s.camX, k[1] - s.camY, k[2] - s.camZ]);
      mat4.scale(m, m, [0.2, 0.2, 0.2]);
      out.push({ model: lead, m, light: lightOf(k[0], k[1], k[2]) });
    }
    return out;
  }

  /** Sedal: segmentos finos de una curva que cuelga entre la punta de la caña y el flotador. */
  private pushFishLine(
    out: ItemDraw[], s: FrameState, l: FishLine, lightOf: (x: number, y: number, z: number) => [number, number],
    model = this.items.blockModel(BLACK_WOOL), thick = 0.012,
  ): void {
    const len = Math.hypot(l[3] - l[0], l[4] - l[1], l[5] - l[2]);
    if (!(len > 0.05) || len > 40) return;
    const sag = Math.min(1.2, len * 0.06);
    const SEG = 14;
    const at = (t: number): [number, number, number] => [
      l[0] + (l[3] - l[0]) * t, l[1] + (l[4] - l[1]) * t - sag * 4 * t * (1 - t), l[2] + (l[5] - l[2]) * t,
    ];
    const light = lightOf((l[0] + l[3]) / 2, (l[1] + l[4]) / 2, (l[2] + l[5]) / 2);
    let a = at(0);
    for (let k = 1; k <= SEG; k++) {
      const b = at(k / SEG);
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const d = Math.hypot(dx, dy, dz);
      const m = mat4.create();
      mat4.translate(m, m, [(a[0] + b[0]) / 2 - s.camX, (a[1] + b[1]) / 2 - s.camY, (a[2] + b[2]) / 2 - s.camZ]);
      mat4.rotateY(m, m, Math.atan2(dx, dz));
      mat4.rotateX(m, m, -Math.atan2(dy, Math.hypot(dx, dz)));
      mat4.scale(m, m, [thick, thick, d]);
      out.push({ model, m, light });
      a = b;
    }
  }

  /** Lo que llevan en las manos los demás jugadores (y uno mismo en tercera persona). */
  private drawPlayerHeldItems(s: FrameState, bindLighting: (p: Program) => Program): void {
    const list: ItemDraw[] = [];
    for (const p of s.players) {
      if (p.sleeping) continue;
      for (const [id, left, dmg, decor] of [[p.held ?? 0, false, p.heldDmg, p.heldDecor], [p.offhand ?? 0, true, p.offhandDmg, p.offhandDecor]] as const) {
        const model = id > 0 ? this.items.model(id, dmg, decor ?? null) : null; // Fase 7 (remate): con el color de su poción; 7.6: escudos
        if (!model) continue;
        const glint = ((p.glint ?? 0) & (left ? 2 : 1)) !== 0; // Fase 7 (encantamientos)
        const m = this.entities.handMatrix(p, s.camX, s.camY, s.camZ, left);
        if (ITEMS[id]?.tool?.kind === 'shield') {
          // El escudo, de cara hacia delante sobre el antebrazo.
          mat4.translate(m, m, [left ? 0.06 : -0.06, 0.12, -0.1]);
          mat4.scale(m, m, [0.62, 0.62, 0.62]);
        } else if (model.flat) {
          // Herramientas y objetos planos: el plano a lo largo del brazo, la punta hacia delante y
          // arriba, y el mango (la esquina de abajo a la izquierda del dibujo) en la mano.
          mat4.rotateX(m, m, -0.35);
          mat4.rotateY(m, m, Math.PI / 2);
          mat4.scale(m, m, [0.62, 0.62, 0.62]);
          mat4.translate(m, m, [0.32, 0.32, 0]);
        } else {
          mat4.translate(m, m, [0, -0.04, 0.02]);
          mat4.rotateY(m, m, Math.PI / 4);
          mat4.scale(m, m, [0.28, 0.28, 0.28]);
        }
        list.push({ model, m, light: p.light, glint });
      }
    }
    // Fase 6.5 (colecciones): cabezas puestas en el hueco del casco (jugadores y soportes para armadura).
    for (const p of [...s.players, ...this.standViews]) {
      const head = p.armor?.[0] ?? 0;
      const model = head && isSkull(head) ? this.items.model(head) : null;
      if (model) list.push({ model, m: this.entities.headMatrix(p, s.camX, s.camY, s.camZ), light: p.light });
    }
    this.items.drawWorld(list, this.viewProj, s.grassTint, bindLighting);
  }

  /** Arcos en las manos de los esqueletos. */
  private drawMobHeldItems(
    s: FrameState, lightOf: (x: number, y: number, z: number) => [number, number], bindLighting: (p: Program) => Program,
  ): void {
    const bow = this.items.model(BOW);
    if (!bow) return;
    const list: ItemDraw[] = [];
    for (const e of s.mobs) {
      if (e.deathT >= 0) continue;
      // Fase 8.3: lo que llevan los piglins y los esqueletos wither en cada mano (el oro que admiran, a la izquierda).
      if (isNetherMob(e.type)) {
        for (const left of [false, true]) {
          const id = left ? gearOff(e.gear) : gearMain(e.gear);
          const model = id ? this.items.model(id) : null;
          const hand = model ? this.mobs.netherHandMatrix(e, s.camX, s.camY, s.camZ, s.time, left) : null;
          if (!model || !hand) continue;
          const m = mat4.clone(hand);
          mat4.rotateX(m, m, -Math.PI / 2);
          mat4.rotateY(m, m, Math.PI / 2);
          mat4.rotateZ(m, m, Math.PI / 4);
          mat4.scale(m, m, [0.8, 0.8, 0.8]);
          list.push({ model, m, light: lightOf(e.x, e.y + 1, e.z) });
        }
        continue;
      }
      const hand = this.mobs.handMatrix(e, s.camX, s.camY, s.camZ, s.time);
      if (!hand) continue;
      // Fase 7.5 (mansión): el alay lleva su objeto delante, pequeño y de frente.
      if (e.type === MOB_ALLAY) {
        const model = e.gear ? this.items.model(e.gear) : null;
        if (!model) continue;
        const m = mat4.clone(hand);
        const k = model.flat ? 0.34 : 0.2;
        mat4.scale(m, m, [k, k, k]);
        list.push({ model, m, light: [0, 1] });
        continue;
      }
      const m = mat4.clone(hand);
      mat4.rotateX(m, m, -Math.PI / 2);
      mat4.rotateY(m, m, Math.PI / 2);
      mat4.rotateZ(m, m, Math.PI / 4);
      mat4.scale(m, m, [0.7, 0.7, 0.7]);
      // Fase 6.5 (equipo): el ahogado lleva su tridente (o su concha) en vez de un arco.
      const gear = e.gear ? this.items.model(e.gear) : null;
      if (gear) mat4.scale(m, m, [1.3, 1.3, 1.3]);
      list.push({ model: gear ?? bow, m, light: lightOf(e.x, e.y + 1, e.z) });
    }
    this.items.drawWorld(list, this.viewProj, s.grassTint, bindLighting);
  }

  /** Objetos en las manos: la principal a la derecha y la secundaria reflejada a la izquierda. */
  private drawHeld(s: FrameState, aspect: number, bindLighting: (p: Program) => Program): void {
    if (s.heldItem > 0) this.drawHand(s, aspect, bindLighting, s.heldItem, s.handUseKind, s.handUse, s.handSwing, s.handEquip, false, s.heldDmg, !!s.heldGlint, s.heldDecor ?? null);
    const off = s.offhandItem ?? 0;
    if (off > 0) this.drawHand(s, aspect, bindLighting, off, s.offhandUseKind ?? 'none', s.offhandUse ?? 0, 0, 0, true, s.offhandDmg, !!s.offhandGlint, s.offhandDecor ?? null);
  }

  private drawHand(
    s: FrameState, aspect: number, bindLighting: (p: Program) => Program, item: number,
    useKind: FrameState['handUseKind'], handUse: number, handSwing: number, equip: number, left: boolean, dmg = 0, glint = false,
    decor: string | null = null,
  ): void {
    const model = this.items.model(item, dmg, decor); // Fase 7 (pociones): con el color de su tipo; 7.6: escudos decorados
    if (!model) return;
    const proj = mat4.create();
    mat4.perspective(proj, (70 * Math.PI) / 180, aspect, 0.01, 10);
    const mv = mat4.create();
    const swing = handSwing > 0 ? Math.sin(handSwing * Math.PI) : 0;
    const swing2 = handSwing > 0 ? Math.sin(Math.sqrt(handSwing) * Math.PI) : 0;
    const use = useKind !== 'none' ? handUse : 0;
    if (!model.flat) {
      mat4.translate(mv, mv, [
        0.56 + s.handBob[0] - swing2 * 0.25,
        -0.5 + s.handBob[1] - equip * 0.5 + swing2 * 0.12,
        -0.95 - swing * 0.15,
      ]);
      mat4.rotateX(mv, mv, 0.32);
      mat4.rotateY(mv, mv, (45 * Math.PI) / 180 + swing2 * 0.5);
      mat4.rotateX(mv, mv, -swing * 0.8);
      mat4.rotateZ(mv, mv, swing2 * 0.2);
      mat4.scale(mv, mv, [0.34, 0.34, 0.34]);
    } else if (useKind === 'bow' && use > 0) {
      // Arco tensado: al centro de la pantalla, con temblor al máximo.
      const shake = use >= 1 ? Math.sin(s.time * 60) * 0.004 : 0;
      mat4.translate(mv, mv, [0.28 - use * 0.18 + s.handBob[0], -0.3 + s.handBob[1] + shake, -0.62 + use * 0.08]);
      mat4.rotateY(mv, mv, -0.25);
      mat4.rotateZ(mv, mv, -Math.PI / 4 - 0.35);
      mat4.scale(mv, mv, [0.62, 0.62, 0.62]);
    } else if (ITEMS[item]?.tool?.kind === 'shield') {
      // Escudo derecho a un lado; al cubrirse sube hacia el centro, por debajo de la mira.
      const k = useKind === 'block' ? Math.min(1, use / 0.25) : 0;
      mat4.translate(mv, mv, [
        0.7 - k * 0.48 + s.handBob[0] - swing2 * 0.2,
        -0.64 + k * 0.26 + s.handBob[1] - equip * 0.5 + swing2 * 0.1,
        -1.0 + k * 0.15 - swing * 0.2,
      ]);
      mat4.rotateY(mv, mv, -0.5 + k * 0.38 + swing2 * 0.3);
      mat4.rotateX(mv, mv, -swing * 0.6);
      const sc = 0.44 + k * 0.12;
      mat4.scale(mv, mv, [sc, sc, sc]);
    } else if (useKind === 'eat' && use > 0) {
      const chew = Math.abs(Math.sin(s.time * 14)) * 0.035;
      mat4.translate(mv, mv, [0.18 - Math.min(1, use * 4) * 0.12, -0.32 + chew, -0.55]);
      mat4.rotateY(mv, mv, -0.6);
      mat4.rotateX(mv, mv, 0.3);
      mat4.scale(mv, mv, [0.5, 0.5, 0.5]);
    } else {
      // Herramientas con la hoja hacia arriba y hacia el centro; el resto, algo inclinado.
      const isTool = !!ITEMS[item]?.tool;
      mat4.translate(mv, mv, [
        0.6 + s.handBob[0] - swing2 * 0.32,
        -0.52 + s.handBob[1] - equip * 0.5 + swing2 * 0.14,
        -1.0 - swing * 0.25,
      ]);
      mat4.rotateY(mv, mv, -0.7 + swing2 * 0.35);
      mat4.rotateX(mv, mv, -swing * 1.2);
      mat4.rotateZ(mv, mv, isTool ? Math.PI / 2 - 0.25 : 0.25);
      const k = isTool ? 0.62 : 0.46;
      mat4.scale(mv, mv, [k, k, k]);
    }
    const ld = this.entities.lightDir;
    const vr = this.viewRot;
    const lv = [
      vr[0] * ld[0] + vr[4] * ld[1] + vr[8] * ld[2],
      vr[1] * ld[0] + vr[5] * ld[1] + vr[9] * ld[2],
      vr[2] * ld[0] + vr[6] * ld[1] + vr[10] * ld[2],
    ];
    const gl = this.gl;
    // Mano izquierda: la misma pose reflejada (las caras quedan del revés).
    if (left) {
      const mirror = mat4.fromScaling(mat4.create(), [-1, 1, 1]);
      mat4.multiply(mv, mirror, mv);
      gl.frontFace(gl.CW);
    }
    if (model.flat) gl.disable(gl.CULL_FACE);
    else gl.enable(gl.CULL_FACE);
    this.items.drawHand(model, mv, proj, lv, s.lightAtEye, s.grassTint, bindLighting, glint); // Fase 7: brillo
    gl.disable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
  }

  /** Proyecta una posición del mundo a coordenadas CSS del canvas (o null si está detrás). */
  project(x: number, y: number, z: number): [number, number] | null {
    const m = this.lastViewProj;
    const rx = x - this.lastCam[0], ry = y - this.lastCam[1], rz = z - this.lastCam[2];
    const cx = m[0] * rx + m[4] * ry + m[8] * rz + m[12];
    const cy = m[1] * rx + m[5] * ry + m[9] * rz + m[13];
    const cw = m[3] * rx + m[7] * ry + m[11] * rz + m[15];
    if (cw <= 0.05) return null;
    const nx = cx / cw, ny = cy / cw;
    if (nx < -1.2 || nx > 1.2 || ny < -1.2 || ny > 1.2) return null;
    return [(nx * 0.5 + 0.5) * this.canvas.clientWidth, (1 - (ny * 0.5 + 0.5)) * this.canvas.clientHeight];
  }

  /** Fracción de océano por dirección (64 bins de azimut) más allá del terreno cargado. */
  setFarOcean(data: Uint8Array): void {
    this.atmosphere.setFarOcean(data);
  }

  resetTemporal(): void {
    this.historyValid = false;
    this.exposureReset = true;
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
