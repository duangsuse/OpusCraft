// Lo que se dibuja en cada frame: los demás jugadores (y uno mismo en tercera persona), la mano, las
// entidades, las grietas del bloque que se mina, los carteles, estandartes, rayos, sedales y correas;
// después, las etiquetas de nombre y el texto de depuración (F3).
import { ENT_WITHER_SKULL } from '../../shared/witherMobs'; // Fase 8.7
import { dyedColor } from '../../shared/dyedColor';
import { newGlidePose, stepGlidePose, glideScale, glideRoll } from '../render/elytraPose'; // Fase 8.6
import { ENT_END_CRYSTAL, ENT_SHULKER_BULLET } from '../../shared/mobs'; // Fase 8.6
import * as endFight from './endFightClient';
import { BLOCKS } from '../../shared/blocks';
import { MOBS } from '../../shared/mobs';
import { STATE_DEAD } from '../../shared/protocol';
import { STATE_INVISIBLE } from '../../shared/potions';
import { hasGlint } from '../../shared/enchantments';
import { isVehicleType } from '../../shared/vehicles';
import { TerrainGenerator, BIOME_NAMES } from '../../shared/world/terrain';
import { BIOME_LUSH_CAVES, BIOME_DRIPSTONE_CAVES } from '../../shared/world/biomeIds';
import { isDeepDark } from '../../shared/world/deepDark';
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (dimensiones)
import { OFFHAND } from './Inventory';
import { useLook } from './equipmentInteraction';
import { handPotionTypes } from './potionClient';
import { effectsView } from './effectsClient';
import { fishingLines } from './fishingLines';
import { leashLines } from './leashLines';
import { guardianBeams } from './guardianBeams';
import { itemDecorKey as shieldDecorKey } from '../render/shieldArt'; // (o el color del cuero teñido)
import type { FrameState } from '../render/Renderer';
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { ClientEntity } from './ClientEntities';
import type { CameraPose, EyeLight } from './cameraRig';
import type { SkyState } from './environment';
import type { Game } from './Game';
import type { NameTagInfo } from '../ui/UI';

/** Color sRGB (0..255) a lineal. */
function srgbToLin(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const tmpGrass = [0, 0, 0];

/** Los demás jugadores vivos, colocados (en su montura, barca o vagoneta) y con la luz de su sitio. */
export function remoteViews(g: Game, dt: number): RemotePlayerView[] {
  const world = g.world!;
  const views: RemotePlayerView[] = [];
  for (const rp of g.remote.values()) {
    rp.update(dt);
    g.riding.placeRemote(rp.id, rp.view); // Fase 6 (monturas): sentado en su montura
    g.vehicles.placeRemote(rp.id, rp.view); // Fase 7 (transporte): en su barca o vagoneta
    if (rp.state & STATE_DEAD) continue;
    const v = rp.view;
    v.invisible = (rp.state & STATE_INVISIBLE) !== 0; // Fase 7 (remate): del invisible sólo se ve lo que lleva puesto
    const l = world.renderLight(Math.floor(v.x), Math.floor(v.y + 0.5), Math.floor(v.z)); // Fase 8: con la luz de alma
    v.light = [(l >> 4) / 15, (l & 15) / 15];
    views.push(v);
  }
  return views;
}

/** Fase 8.6: la pose de los élitros propios (se avanza con cada vista). */
const selfGlide = newGlidePose();
let selfGlideT = 0;

/** Uno mismo visto desde fuera (tercera persona). */
export function selfView(g: Game, eye: EyeLight): RemotePlayerView {
  const p = g.player;
  const now = performance.now();
  const gdt = selfGlideT ? Math.min(0.1, (now - selfGlideT) / 1000) : 0;
  selfGlideT = now;
  stepGlidePose(selfGlide, p.gliding, p.sneaking, p.vx, p.vy, p.vz, gdt);
  const hands = handPotionTypes(g);
  return {
    id: '__self', name: g.cfg.name, shirt: g.cfg.shirt, x: p.x, y: p.y, z: p.z,
    bodyYaw: p.yaw, headYaw: p.yaw, pitch: p.pitch, walkPhase: p.walkDistance * 2.2, walkAmount: p.walkAmount,
    swing: g.swingT >= 0 ? g.swingT : 0, sneaking: p.sneaking, sleeping: !!g.life.sleeping, prone: p.pose !== 'stand', held: g.heldId, offhand: g.inv.offhand?.id ?? 0,
    heldDmg: hands.hp, offhandDmg: hands.op, // Fase 7 (remate)
    heldDecor: shieldDecorKey(g.heldStack), offhandDecor: shieldDecorKey(g.inv.offhand), // Fase 7.6
    use: ((k) => (k === 'none' ? null : k))(useLook(g.interaction.use).kind), light: [eye.skyAtEye, (eye.le & 15) / 15],
    armor: g.inv.armorIds(),
    armorDye: g.inv.armor.map((a) => dyedColor(a) ?? -1), // el cuero teñido
    riding: g.riding.active || g.vehicles.active, // Fase 6 (monturas) y 7 (transporte): sentado
    glint: g.enchant.glintBits(), // Fase 7 (encantamientos)
    invisible: g.statusEffects.invisible, // Fase 7 (remate): sin cuerpo, pero con la armadura y lo de las manos
    glowing: g.statusEffects.glowing, // Fase 7 (efectos)
    // Fase 8.6: planeando, tumbado y ladeado; y las alas.
    glide: p.gliding ? glideScale(selfGlide) : 0, glideRoll: p.gliding ? glideRoll(p.yaw, p.pitch, p.vx, p.vz) : 0, wings: selfGlide.wings,
  };
}

/** Golpe y cambio de objeto de la mano. */
export function animateHand(g: Game, dt: number): void {
  if (g.swingT >= 0) {
    g.swingT += dt / 0.28;
    if (g.swingT >= 1) g.swingT = g.interaction.mining ? 0 : -1;
  }
  g.equipT = Math.max(0, g.equipT - dt / 0.18);
}

/** Criaturas y vehículos (modelos de cajas) por un lado; objetos, flechas y demás por otro. */
export function splitEntities(g: Game): { mobs: ClientEntity[]; drops: ClientEntity[] } {
  const mobs: ClientEntity[] = [];
  const drops: ClientEntity[] = [];
  for (const e of g.ents.list.values()) {
    // Fase 7: barcas y vagonetas van con los modelos de cajas; de las criaturas invisibles sólo se dibuja
    // lo que llevan (lo decide MobRenderer).
    if (MOBS[e.type] || isVehicleType(e.type) || e.type === ENT_END_CRYSTAL || e.type === ENT_SHULKER_BULLET || e.type === ENT_WITHER_SKULL) mobs.push(e); // Fase 8.6: y los cristales del End y las balas de shulker
    else drops.push(e);
  }
  return { mobs, drops };
}

export interface FrameInput {
  dt: number;
  cam: CameraPose;
  eye: EyeLight;
  sky: SkyState;
  rain: number;
  views: RemotePlayerView[];
  mobs: ClientEntity[];
  drops: ClientEntity[];
  /** La entidad a la que se apunta (sin recuadro de selección del bloque). */
  target: ClientEntity | null;
}

/** El estado que dibuja el renderer este frame. */
export function frameState(g: Game, f: FrameInput): FrameState {
  const world = g.world!;
  const p = g.player;
  const settings = g.cfg.settings;
  const { camX, camY, camZ, yaw, pitch } = f.cam;
  const lightOf = (x: number, y: number, z: number): [number, number] => {
    const l = world.renderLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return [(l >> 4) / 15, (l & 15) / 15];
  };
  const bobPh = p.walkDistance * Math.PI * 0.62;
  TerrainGenerator.biomeGrass(world.generator.columnInfo(Math.floor(p.x), Math.floor(p.z)), tmpGrass);
  const m = g.interaction.mining;
  let crack: FrameState['crack'] = null;
  if (m && m.progress > 0) {
    const h = g.hit;
    const box = h && h.x === m.x && h.y === m.y && h.z === m.z ? h.box : undefined;
    crack = { x: m.x, y: m.y, z: m.z, stage: Math.min(9, Math.floor(m.progress * 10)), box };
  }
  const use = g.interaction.use;
  const mainUse = use && use.slot !== OFFHAND ? use : null;
  const offUse = use && use.slot === OFFHAND ? use : null;
  const firstPerson = g.camera.thirdPerson === 0;
  const localRod = {
    cam: [camX, camY, camZ] as [number, number, number], yaw, pitch, firstPerson,
    feet: [p.x, p.y, p.z] as [number, number, number], bodyYaw: p.yaw,
  };
  const dead = g.survival.dead;
  const out: FrameState = {
    camX, camY, camZ, yaw, pitch, roll: g.hurtRoll,
    time: performance.now() / 1000,
    dt: f.dt,
    dayTime: f.sky.dayTime,
    day: f.sky.day,
    underwater: f.eye.underwater,
    waterLight: f.eye.waterLight,
    eyeSkyExposure: g.camera.eyeSky,
    rain: f.rain,
    nightVision: g.statusEffects.nightVision,
    snow: f.sky.snow,
    cloudCoverage: f.sky.cloudCoverage,
    mist: f.sky.mist,
    selection: g.hit && !g.hudHidden && !f.target ? { x: g.hit.x, y: g.hit.y, z: g.hit.z, box: g.hit.box } : null,
    heldItem: dead ? 0 : g.heldId,
    heldDmg: g.heldStack?.dmg ?? 0, // Fase 7 (pociones): color de la poción
    offhandDmg: g.inv.offhand?.dmg ?? 0,
    heldDecor: shieldDecorKey(g.heldStack), // Fase 7.6: escudo decorado
    offhandDecor: shieldDecorKey(g.inv.offhand),
    handUse: useLook(mainUse).amount, // Fase 6.5 (equipo): con la ballesta y el tridente
    handUseKind: useLook(mainUse).kind,
    offhandItem: dead ? 0 : g.inv.offhand?.id ?? 0,
    heldGlint: hasGlint(g.heldStack), // Fase 7 (encantamientos)
    offhandGlint: hasGlint(g.inv.offhand),
    enchantBooks: g.enchantBooks.draws(g.renderer.items, camX, camY, camZ, lightOf),
    movingBlocks: g.mechanisms.draws(g.renderer.items, camX, camY, camZ, lightOf), // Fase 7 (mecanismos)
    offhandUseKind: offUse ? (offUse.kind === 'block' ? 'block' : 'eat') : 'none',
    offhandUse: offUse ? (offUse.kind === 'block' ? offUse.t : offUse.t / 1.6) : 0,
    crack,
    mobs: f.mobs,
    drops: f.drops,
    lightAt: (x, y, z) => world.renderLight(x, y, z),
    handSwing: g.swingT >= 0 ? g.swingT : 0,
    handBob: settings.viewBobbing ? [Math.sin(bobPh) * 0.018 * p.walkAmount, -Math.abs(Math.cos(bobPh)) * 0.022 * p.walkAmount] : [0, 0],
    handEquip: g.equipT,
    lightAtEye: [f.eye.skyAtEye, (f.eye.le & 15) / 15],
    grassTint: [srgbToLin(tmpGrass[0]), srgbToLin(tmpGrass[1]), srgbToLin(tmpGrass[2])],
    players: f.views,
    signs: g.signs.draws((x, y, z) => world.getBlock(x, y, z), camX, camY, camZ),
    banners: g.books.banners.draws((x, y, z) => world.getBlock(x, y, z), camX, camY, camZ), // Fase 6.5 (libros y estandartes)
    bolts: g.bolts,
    guardianBeams: guardianBeams(g), // Fase 7.5 (océano)
    beaconBeams: g.beacons.beams(), // Fase 8.5
    endFlash: g.endAtmos.flash ?? undefined, // Fase 8.6
    ...endFight.frame(g), // Fase 8.6: rayos del dragón, haces de los cristales y de las puertas del End
    fishLines: fishingLines(g.bobbers, g.ents.list, g.net?.id ?? null, localRod, f.views),
    leashes: leashLines(g.ents.list, g.net?.id ?? null, localRod, f.views), // Fase 6.5 (remate)
    showHand: firstPerson && !g.hudHidden && use?.kind !== 'spyglass',
    ...effectsView(g, f.dt), // Fase 7 (efectos): náuseas, ceguera y oscuridad
    dim: world.dim, // Fase 8: cielo, niebla y luz de la dimensión
    fog: g.netherAtmos.fog, // Fase 8.2: la niebla del bioma del Nether
  };
  // Fase 8: dentro de un portal la imagen se retuerce como con las náuseas.
  if (g.portalFx.warp > 0) out.nausea = Math.max(out.nausea ?? 0, g.portalFx.warp * 0.8);
  return out;
}

/** Etiquetas de nombre: jugadores (a menos de 72 bloques, no invisibles) y criaturas con nombre (16). */
export function updateNameTags(g: Game, cam: CameraPose): void {
  const tags: NameTagInfo[] = [];
  const { camX, camY, camZ } = cam;
  for (const rp of g.remote.values()) {
    const v = rp.view;
    const d = Math.hypot(v.x - camX, v.y - camY, v.z - camZ);
    const visible = d < 72 && !g.hudHidden && !(rp.state & (STATE_DEAD | STATE_INVISIBLE)); // Fase 7: sin nombre si es invisible
    tags.push({ id: rp.id, name: rp.name, pos: visible ? g.renderer.project(v.x, v.y + (v.sneaking ? 1.85 : 2.1), v.z) : null, talking: rp.talking, whisper: rp.whispering });
  }
  // Fase 6.5 (remate): criaturas con nombre (etiqueta), hasta 16 bloques.
  for (const e of g.ents.list.values()) {
    if (!e.name || e.gone || e.deathT >= 0) continue;
    const def = MOBS[e.type];
    const d = Math.hypot(e.x - camX, e.y - camY, e.z - camZ);
    const visible = d < 16 && !g.hudHidden && !!def;
    tags.push({ id: `m${e.id}`, name: e.name, pos: visible ? g.renderer.project(e.x, e.y + (def?.height ?? 1) + 0.35, e.z) : null });
  }
  g.ui.updateNameTags(tags);
}

/** Texto de depuración (F3). */
export function debugText(g: Game, eye: EyeLight, sky: SkyState, counts: { mobs: number; drops: number }, target: ClientEntity | null): string {
  const p = g.player;
  const world = g.world!;
  const gen = world.generator;
  // Fase 7.5 (abismo): el Deep Dark es un bioma de cueva (depende también de la altura).
  const bx = Math.floor(p.x), bz = Math.floor(p.z);
  // Fase 7.6: bajo tierra, también las cuevas frondosas y las de goteo.
  const cave = p.y < gen.columnInfo(bx, bz).height - 12 ? gen.caveBiomeAt(bx, bz) : 0;
  const biome = isDeepDark(gen, bx, Math.floor(p.y), bz) ? 'Deep Dark'
    : cave === 1 ? BIOME_NAMES[BIOME_LUSH_CAVES] : cave === 2 ? BIOME_NAMES[BIOME_DRIPSTONE_CAVES]
      : BIOME_NAMES[gen.biomeAt(bx, bz)];
  const hours = Math.floor(((sky.dayTime * 24 + 6) % 24));
  const mins = Math.floor(((sky.dayTime * 24 * 60) % 60));
  const r = g.renderer;
  return (
    `VoxelCraft · ${g.fps.toFixed(0)} FPS\n` +
    `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\n` +
    `Chunk: ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)} · Bioma: ${biome} · ${dimensionDef(world.dim).name}\n` +
    `Hora: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} · Día ${sky.day + 1}\n` +
    `Luz: cielo ${eye.le >> 4} · bloque ${eye.le & 15}\n` +
    `Chunks: ${world.meshedCount} mallados · ${r.stats.drawCalls} draws · ${(r.stats.quads / 1000).toFixed(0)}k caras\n` +
    `Entidades: ${counts.mobs} criaturas · ${counts.drops} objetos\n` +
    `Modo: ${g.creative ? 'creativo' : 'supervivencia'} · ${g.offline ? 'sin conexión' : `ping ${Math.round(g.net?.latency ?? 0)} ms · ${g.remote.size + 1} jugadores`}\n` +
    (g.hit ? `Mirando: ${BLOCKS[g.hit.id].name} (${g.hit.x}, ${g.hit.y}, ${g.hit.z})\n` : '') +
    (target ? `Criatura: ${MOBS[target.type]?.name ?? 'transporte'}\n` : '') + // Fase 7: también barcas y vagonetas
    `GPU: ${r.caps.renderer}`
  );
}
