// Fase 7 (pociones): las pociones en el cliente.
// - Usar: beber un frasco (sus efectos y queda el frasco vacío), lanzar arrojadizas y persistentes y
//   llenar un frasco de cristal en una fuente de agua.
// - Flechas: el arco y la ballesta disparan la primera flecha que encuentran (mano secundaria, mano
//   principal y luego el inventario), normal o con efecto.
// - Cada frame: Supersalto y Caída lenta en la física del jugador, remolinos del color de los efectos
//   alrededor del jugador y de los demás, las nubes persistentes y la estela de las flechas con efecto.
// - Efectos del servidor: la poción que se rompe, la bruja que bebe, los remolinos de las criaturas,
//   frascos que se llenan o se vacían en el caldero y el alambique que termina.
import type { Game } from './Game';
import type { Interaction } from './interaction';
import type { RayHit } from './raycast';
import { raycast } from './raycast';
import { OFFHAND, INV_SIZE } from './Inventory';
import { REACH_CREATIVE, REACH_SURVIVAL } from './gameTypes';
import { PF, SPRITE } from '../render/particles/ParticleSystem';
import { BLOCK_FLUID, BLOCK_FLUID_LEVEL, isWaterlogged } from '../../shared/blocks';
import {
  ARROW, TIPPED_ARROW, GLASS_BOTTLE, DRAGON_BREATH, POTION, SPLASH_POTION, LINGERING_POTION, SPECTRAL_ARROW, type ItemStack,
} from '../../shared/items';
import { EFFECTS, jumpBoostVelocity, unpackColor, packColor } from '../../shared/effects';
import { ENT_ARROW, MOBS } from '../../shared/mobs';
import { EF_PICKABLE } from '../../shared/protocol';
import {
  ENT_EFFECT_CLOUD, EF_INVISIBLE, STATE_INVISIBLE, potionEffects, potionColor, potionStack, potionType, PT_WATER, potionKind,
} from '../../shared/potions';
import { SPECTRAL_ARROW_TYPE } from '../../shared/potions'; // Fase 8.3 (criaturas del Nether)

type RGB = readonly [number, number, number];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Color sRGB (0..255) → color de partícula (lineal y algo subido, como las demás partículas). */
function tone(c: RGB, k = 1.3): [number, number, number] {
  const f = (v: number) => Math.pow(v / 255, 2.2) * k + 0.04;
  return [f(c[0]), f(c[1]), f(c[2])];
}

// ------------------------------------------------------------------ partículas

/** Remolino de efecto: una chispa de color que sube despacio y se apaga. */
export function swirl(g: Game, x: number, y: number, z: number, c: RGB, a = 0.9): void {
  const [r, gg, b] = tone(c);
  g.renderer.entities.pfx.ps.spawn({
    x, y, z, vx: rnd(-0.12, 0.12), vy: rnd(0.25, 0.6), vz: rnd(-0.12, 0.12), life: rnd(0.7, 1.2), size: rnd(0.07, 0.11),
    size1: 0.02, sprite: Math.random() < 0.5 ? SPRITE.twinkle : SPRITE.glow, r, g: gg, b, a, drag: 0.8, rot: Math.random() * 6,
    spin: rnd(-2, 2), flags: PF.FADE_IN,
  });
}

/** Remolinos alrededor de un cuerpo (pies en x, y, z; alto h). */
function bodySwirls(g: Game, x: number, y: number, z: number, h: number, c: RGB, n: number, a = 0.9): void {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, r = rnd(0.2, 0.45);
    swirl(g, x + Math.cos(ang) * r, y + rnd(0.1, h), z + Math.sin(ang) * r, c, a);
  }
}

/** Salpicadura de una poción que se rompe: cristales, gotas de su color y, si es instantánea, destellos. */
function shatterFx(g: Game, p: [number, number, number], c: RGB, lingering: boolean, instant: boolean): void {
  const ps = g.renderer.entities.pfx.ps;
  const [r, gg, b] = tone(c, 1.5);
  for (let i = 0; i < 10; i++) {
    ps.spawn({
      x: p[0], y: p[1] + 0.1, z: p[2], vx: rnd(-2.5, 2.5), vy: rnd(1.5, 4), vz: rnd(-2.5, 2.5), life: rnd(0.4, 0.8), size: rnd(0.04, 0.07),
      sprite: SPRITE.spark, r: 0.9, g: 0.95, b: 1, a: 0.9, grav: 16, drag: 0.4, flags: PF.COLLIDE | PF.BOUNCE,
    });
  }
  const n = lingering ? 24 : 48;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1), sp = rnd(1.6, 3.4);
    ps.spawn({
      x: p[0], y: p[1] + rnd(0, 0.4), z: p[2], vx: Math.cos(ang) * sp, vy: rnd(0.3, 1.4), vz: Math.sin(ang) * sp, life: rnd(0.6, 1.2),
      size: rnd(0.08, 0.13), size1: 0.03, sprite: instant ? SPRITE.star : SPRITE.twinkle, r, g: gg, b, a: 0.95, drag: 1.4,
      grav: 0.6, rot: Math.random() * 6, spin: rnd(-3, 3), flags: (instant ? PF.EMISSIVE : 0) | PF.FADE_IN,
    });
  }
}

// ------------------------------------------------------------------ cada frame

/** Antes de mover al jugador: Supersalto y Caída lenta. */
export function potionPhysics(g: Game): void {
  const fx = g.statusEffects;
  g.player.jumpBoost = jumpBoostVelocity(fx.jumpAmp);
  g.player.slowFall = fx.slowFalling;
}

/** Bits y color que el jugador manda con su posición (invisible y el color de sus remolinos). */
export function potionPosState(g: Game): { s: number; ec: number } {
  const fx = g.statusEffects;
  const c = fx.swirlColor;
  return { s: fx.invisible ? STATE_INVISIBLE : 0, ec: c ? packColor(c) : 0 };
}

/** Fase 7 (remate): tipo de poción de lo que lleva en cada mano (0 si no es una poción), para que los demás lo vean. */
export function handPotionTypes(g: Game): { hp: number; op: number } {
  const t = (st: ItemStack | null | undefined) => (st && potionKind(st.id) ? st.dmg ?? 0 : 0);
  return { hp: t(g.heldStack), op: t(g.inv.offhand) };
}

let swirlAcc = 0;
let sentFxVersion = -1;

/**
 * Cada frame: partículas (remolinos, nubes persistentes y flechas con efecto) y, si cambian los efectos,
 * se guardan en el servidor (las brujas eligen qué poción lanzar según los que ya tiene).
 */
export function potionFrame(g: Game, dt: number): void {
  if (g.statusEffects.version !== sentFxVersion) {
    sentFxVersion = g.statusEffects.version;
    g.sendState(false);
  }
  const p = g.player;
  swirlAcc += dt;
  const tick = swirlAcc >= 0.1;
  if (tick) swirlAcc = 0;
  if (tick && !g.survival.dead) {
    // Los propios, menos (y casi nada en primera persona si es invisible).
    const c = g.statusEffects.swirlColor;
    if (c && Math.random() < (g.statusEffects.invisible ? 0.15 : 0.6)) bodySwirls(g, p.x, p.y, p.z, 1.8, c, 1, 0.7);
    for (const rp of g.remote.values()) {
      if (!rp.effectColor) continue;
      const v = rp.view;
      bodySwirls(g, v.x, v.y, v.z, 1.8, unpackColor(rp.effectColor), rp.state & STATE_INVISIBLE ? (Math.random() < 0.3 ? 1 : 0) : 2);
    }
  }
  for (const e of g.ents.list.values()) {
    if (e.gone) continue;
    if (e.type === ENT_EFFECT_CLOUD) {
      // Nube persistente: partículas de su color por todo el círculo, a ras de suelo.
      const r = e.cloudRadius ?? 0;
      if (r <= 0.05) continue;
      const c = unpackColor(e.cloudColor ?? 0);
      let n = r * r * Math.PI * dt * 7;
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n -= 1;
        const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        swirl(g, e.x + Math.cos(ang) * d, e.y + rnd(0.05, 0.4), e.z + Math.sin(ang) * d, c, 0.8);
      }
    } else if (e.type === ENT_ARROW && (e.potion ?? -1) > PT_WATER) {
      // Flecha con efecto: estela de su color (clavada, alguna de vez en cuando).
      const stuck = (e.flags & EF_PICKABLE) !== 0;
      if (Math.random() < dt * (stuck ? 4 : 30)) swirl(g, e.x, e.y, e.z, potionColor(e.potion!), 0.85);
    }
  }
}

// ------------------------------------------------------------------ efectos del servidor

/** Efecto de las pociones que llega del servidor; false si no es de este módulo. */
export function potionFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  switch (kind) {
    case 'potion_break': {
      // a = color; b: 1 persistente, 2 instantánea.
      const c = unpackColor(a ?? packColor(potionColor(PT_WATER)));
      shatterFx(g, p, c, ((b ?? 0) & 1) !== 0, ((b ?? 0) & 2) !== 0);
      g.audio.playPotionSfx('splash', p);
      if ((b ?? 0) & 1) g.audio.playPotionSfx('cloud', p);
      return true;
    }
    case 'witch_drink':
      if (a !== undefined) bodySwirls(g, p[0], p[1] - 0.3, p[2], 0.6, unpackColor(a), 8);
      g.audio.playPotionSfx('drink', p);
      return true;
    case 'effect_swirl': {
      // Criatura con efectos (a = color, b = diez veces su altura).
      const e = findMobAt(g, p);
      bodySwirls(g, p[0], p[1], p[2], (b ?? 18) / 10, unpackColor(a ?? 0), e && (e.flags & EF_INVISIBLE) ? 1 : 2);
      return true;
    }
    case 'bottle_fill':
    case 'bottle_empty':
      g.renderer.entities.pfx.bubbles(p[0], p[1], p[2], 5, 0.25);
      g.audio.playPotionSfx(kind, p);
      return true;
    case 'brew_done':
      g.audio.playPotionSfx('brew', p);
      return true;
  }
  return false;
}

function findMobAt(g: Game, p: [number, number, number]) {
  for (const e of g.ents.list.values()) {
    if (MOBS[e.type] && Math.abs(e.x - p[0]) < 0.6 && Math.abs(e.z - p[2]) < 0.6 && Math.abs(e.y - p[1]) < 1) return e;
  }
  return null;
}

// ------------------------------------------------------------------ usar

/**
 * Clic derecho con un objeto de las pociones: lanzar una arrojadiza o persistente, o llenar un frasco
 * de cristal en el agua. true si lo atendió (los frascos se beben por la vía de la comida).
 */
export function potionUse(g: Game, ia: Interaction, pressed: boolean, held: ItemStack | null, dir: number[]): boolean {
  if (!held) return false;
  if (held.id === SPLASH_POTION || held.id === LINGERING_POTION) {
    if (pressed) throwPotion(g, held, dir);
    return true;
  }
  if (held.id === GLASS_BOTTLE && pressed) return fillBottle(g, ia, dir);
  return false;
}

function throwPotion(g: Game, held: ItemStack, dir: number[]): void {
  const p = g.player;
  const type = potionType(held);
  g.net?.send({
    t: 'throw', item: held.id, p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]],
    ...(type > 0 ? { w: type } : {}),
  });
  if (!g.creative) g.inv.consume(g.selected, 1);
  g.swing(false);
}

/** Frasco de cristal contra una fuente de agua: frasco de agua (los vacíos se apilan: sale aparte). */
/** Fase 8.6: color de la nube del aliento del dragón (el que manda el servidor). */
const DRAGON_BREATH_CLOUD = 0xb44ce8;

function fillBottle(g: Game, ia: Interaction, dir: number[]): boolean {
  const world = g.world!;
  const p = g.player;
  // Fase 8.6: cerca de una nube del aliento del dragón, el frasco lo recoge (GlassBottleItem: a 2 bloques de ella).
  for (const e of g.ents.list.values()) {
    if (e.type !== ENT_EFFECT_CLOUD || e.cloudColor !== DRAGON_BREATH_CLOUD || e.gone) continue;
    if (Math.hypot(e.x - p.x, e.z - p.z) > (e.cloudRadius ?? 0) + 2 || Math.abs(e.y - p.y) > 3) continue;
    g.net?.send({ t: 'breath', e: e.id });
    if (!g.creative) g.inv.consume(g.selected, 1);
    const got = { id: DRAGON_BREATH, count: 1 };
    if (!g.inv.get(g.selected)) g.inv.set(g.selected, got);
    else {
      const rest = g.inv.add(got);
      if (rest) ia.throwStack(rest, false);
    }
    g.inv.changed();
    g.audio.playPotionSfx('bottle_fill', [e.x, e.y + 0.5, e.z]);
    g.swing(false);
    return true;
  }
  const hit: RayHit | null = raycast(p.x, p.eyeY, p.z, dir[0], dir[1], dir[2], g.creative ? REACH_CREATIVE : REACH_SURVIVAL, (x, y, z) => world.getBlock(x, y, z), true);
  if (!hit) return false;
  const water = (BLOCK_FLUID[hit.id] === 1 && BLOCK_FLUID_LEVEL[hit.id] === 0) || isWaterlogged(hit.id);
  if (!water) return false;
  const filled = potionStack('drink', PT_WATER);
  if (!g.creative) g.inv.consume(g.selected, 1);
  if (!g.inv.get(g.selected)) g.inv.set(g.selected, filled);
  else {
    const rest = g.inv.add(filled);
    if (rest) ia.throwStack(rest, false);
  }
  g.inv.changed();
  g.audio.playPotionSfx('bottle_fill', [hit.x + 0.5, hit.y + 0.8, hit.z + 0.5]);
  g.swing(false);
  return true;
}

/**
 * Al terminar de beber un frasco: sus efectos (los instantáneos, ya) y queda el frasco vacío. false si
 * lo que se bebió no es una poción (la leche va aparte).
 */
export function drinkPotion(g: Game, ia: Interaction, slot: number, item: number): boolean {
  if (item !== POTION) return false;
  const s = g.inv.get(slot);
  const type = potionType(s ?? { id: POTION, count: 1 });
  for (const [id, secs, amp] of potionEffects(type)) {
    // En creativo no se recibe daño (tampoco el de la poción).
    if (g.creative && EFFECTS[id]?.instant && !EFFECTS[id].good) continue;
    g.statusEffects.add(id, EFFECTS[id]?.instant ? 1 : secs, amp, g.survival);
  }
  g.audio.playBurp();
  if (!g.creative) {
    g.inv.consume(slot, 1);
    const bottle = { id: GLASS_BOTTLE, count: 1 };
    if (!g.inv.get(slot)) g.inv.set(slot, bottle);
    else {
      const rest = g.inv.add(bottle);
      if (rest) ia.throwStack(rest, false);
    }
  }
  g.sendState(true);
  return true;
}

// ------------------------------------------------------------------ flechas

/** ¿Tiene alguna flecha (normal o con efecto)? */
export function hasArrows(g: Game): boolean {
  return g.inv.count(ARROW) + g.inv.count(TIPPED_ARROW) + g.inv.count(SPECTRAL_ARROW) > 0; // Fase 8.3: y espectrales
}

/**
 * Coge la flecha que toca disparar (como en Minecraft: mano secundaria, mano principal y luego el
 * inventario en orden) y la gasta (en creativo no; con `infinity`, tampoco las normales). Devuelve el tipo
 * de poción que lleva (−1 normal) o null si no hay ninguna.
 */
export function takeArrow(g: Game, infinity = false): number | null {
  const order = [OFFHAND, g.selected, ...Array.from({ length: INV_SIZE }, (_, i) => i)];
  for (const i of order) {
    const s = g.inv.get(i);
    if (!s || (s.id !== ARROW && s.id !== TIPPED_ARROW && s.id !== SPECTRAL_ARROW)) continue;
    const type = s.id === TIPPED_ARROW ? potionType(s) : s.id === SPECTRAL_ARROW ? SPECTRAL_ARROW_TYPE : -1; // Fase 8.3
    if (!g.creative && !(infinity && s.id === ARROW)) g.inv.consume(i, 1);
    return type;
  }
  return g.creative ? -1 : null;
}
