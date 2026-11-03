// Fase 8.3 (criaturas del Nether): efectos de las criaturas del Nether en el cliente.
// - Del servidor: voces con variante ('nvoice': la del ghast se oye a 80 bloques), la conversión en zombificado,
//   la embestida del hoglin, la ballesta del piglin (cargar, cargada, disparar), lo que lanza el piglin (el
//   trueque), las bolas de fuego que dan o se devuelven y el acelerón del strider.
// - Cada frame: el humo del blaze (dos columnas de humo grande por tick y su chisporroteo, como Blaze.aiStep),
//   la estela de humo de las bolas de fuego y las llamas y el chapoteo del cubo de magma al caer (AbstractCubeMob.
//   tick: tamaño × 16 llamas en el suelo).
import type { MobSoundKind } from '../audio/types';
import { MOBS } from '../../shared/mobs';
import {
  MOB_BLAZE, MOB_GHAST, ENT_LARGE_FIREBALL, ENT_SMALL_FIREBALL, isMagmaCube, isNetherMob, magmaSize,
} from '../../shared/netherMobs';
import { EF_ACTION } from '../../shared/protocol';
import type { Game } from './Game';
import type { ClientEntity } from './ClientEntities';

/** true si el efecto era de este módulo. */
export function netherFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'nvoice': {
      const def = a !== undefined ? MOBS[a] : undefined;
      if (!def) return true;
      const k = (def.sound ?? def.key) as MobSoundKind;
      // Volumen de Java: el ghast 5; el cubo de magma, 0,4 por tamaño.
      const vol = def.id === MOB_GHAST ? 5 : isMagmaCube(def.id) ? 0.4 * magmaSize(def.id) : 1;
      g.audio.playNetherVoice(k, b ?? 0, p, vol);
      return true;
    }
    case 'nether_convert':
      g.audio.playNetherSfx('convert', 0, p);
      return true;
    case 'nether_attack': {
      const def = a !== undefined ? MOBS[a] : undefined;
      if (def) g.audio.playMob((def.sound ?? def.key) as MobSoundKind, 'attack', p);
      return true;
    }
    case 'nether_crossbow':
      g.audio.playNetherSfx('crossbow', a ?? 0, p);
      return true;
    case 'nether_throw':
      g.audio.playBowShoot(p, 0.12);
      return true;
    case 'pickup_mob':
      return true;
    case 'fireball_hit':
      g.audio.playNetherSfx('fireball_hit', 0, p);
      for (let i = 0; i < 6; i++) fx.spawnFlame(p[0] + (Math.random() - 0.5) * 0.4, p[1] + (Math.random() - 0.5) * 0.4, p[2] + (Math.random() - 0.5) * 0.4);
      fx.spawnSmoke(p[0], p[1], p[2], 6, 0.25, 0.2, 0.35, 0.8);
      return true;
    case 'fireball_deflect':
      g.audio.playNetherSfx('fireball_deflect', 0, p);
      return true;
    case 'strider_boost':
      g.audio.playNetherSfx('boost', 0, p);
      return true;
    case 'fire_charge_use':
    case 'fire_charge_shoot':
      // La carga de fuego al encender (o salir del dispensador): el bufido de la bola de fuego del blaze.
      g.audio.playMob('blaze', 'shoot', p);
      return true;
    default:
      return false;
  }
}

/** Estado de los cubos de magma (para ver cuándo caen al suelo). */
const magmaAir = new Map<number, boolean>();

/** Cada frame: humo del blaze, estela de las bolas de fuego y cubos de magma que caen. */
export function netherTick(g: Game, dt: number): void {
  const p = g.player;
  const fx = g.renderer.entities;
  const ticks = dt * 20;
  for (const e of g.ents.list.values()) {
    if (e.deathT >= 0 || e.gone) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (d > 48) continue;
    if (e.type === MOB_BLAZE) blaze(g, e, ticks, d);
    else if (e.type === ENT_LARGE_FIREBALL || e.type === ENT_SMALL_FIREBALL) {
      const big = e.type === ENT_LARGE_FIREBALL;
      if (Math.random() < ticks) fx.spawnSmoke(e.x, e.y + (big ? 0.5 : 0.15), e.z, 1, big ? 0.3 : 0.1, 0.25, big ? 0.5 : 0.25, 0.2);
    } else if (isMagmaCube(e.type)) magma(g, e);
  }
  if (magmaAir.size > 256) for (const id of magmaAir.keys()) if (!g.ents.list.has(id)) magmaAir.delete(id);
}

function blaze(g: Game, e: ClientEntity, ticks: number, d: number): void {
  const fx = g.renderer.entities;
  const def = MOBS[MOB_BLAZE];
  // Dos columnas de humo grande por tick en su caja.
  let n = 2 * ticks;
  while (n > 0) {
    if (n >= 1 || Math.random() < n) {
      fx.spawnSmoke(e.x + (Math.random() - 0.5) * def.width, e.y + Math.random() * def.height, e.z + (Math.random() - 0.5) * def.width, 1, 0.05, 0.18, 0.45, 0.25);
    }
    n -= 1;
  }
  // Chisporroteo (uno de cada 24 ticks).
  if (d < 16 && Math.random() < ticks / 24) g.audio.playNetherSfx('blaze_burn', 0, [e.x, e.y + 1, e.z]);
}

function magma(g: Game, e: ClientEntity): void {
  const air = (e.flags & EF_ACTION) !== 0;
  const was = magmaAir.get(e.id);
  magmaAir.set(e.id, air);
  if (was === undefined || !was || air) return;
  // Acaba de caer: llamas alrededor y el chapoteo.
  const def = MOBS[e.type];
  const size = def.width * 2, r = size / 2;
  const fx = g.renderer.entities;
  for (let i = 0; i < size * 8; i++) {
    const a = Math.random() * Math.PI * 2, k = Math.random() * 0.5 + 0.5;
    fx.spawnFlame(e.x + Math.sin(a) * r * k, e.y + 0.05, e.z + Math.cos(a) * r * k);
  }
  g.audio.playMob((def.sound ?? def.key) as MobSoundKind, 'step', [e.x, e.y, e.z]);
}

/** ¿Pone el servidor las voces de esta criatura? (las del Nether: no hacen falta las de reposo del cliente). */
export function serverVoiced(type: number): boolean {
  return isNetherMob(type);
}

/** Criaturas del Nether que suenan al andar (las que caminan). */
export function netherSteps(type: number): boolean {
  return isNetherMob(type) && type !== MOB_GHAST && type !== MOB_BLAZE && !isMagmaCube(type);
}
