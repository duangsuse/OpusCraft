// Fase 7.5 (abismo): efectos del Deep Dark en el cliente.
// - Vibraciones: una chispa turquesa que viaja del origen al oyente en el tiempo que tarda la vibración.
// - Sensores (chasquido), amatista que resuena, catalizador que florece (almas que suben), sculk que se
//   extiende, chillador (ondas que suben), el aviso lejano del warden.
// - El warden: sale del suelo y se hunde (trozos del bloque de debajo), ruge (la cámara tiembla cerca),
//   olfatea, carga y suelta el estampido sónico (anillos a lo largo del rayo), mueve los zarcillos y late
//   (se oye su corazón cerca, más deprisa cuanto más enfadado).
// - Ambiente: lamentos lejanos de vez en cuando mientras el jugador está en el Deep Dark.
import { MOBS, MOB_WARDEN } from '../../shared/mobs';
import { unpackDelta } from '../../shared/vibrations';
import { isDeepDark } from '../../shared/world/deepDark';
import { PF, SPRITE } from '../render/particles/ParticleSystem';
import { heartbeat } from '../render/wardenAnim';
import type { Game } from './Game';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Atiende un efecto del servidor; devuelve false si no es del Deep Dark. */
export function deepDarkFx(g: Game, kind: string, p: [number, number, number], a?: number, b?: number): boolean {
  const ps = g.renderer.entities.particles;
  const pfx = g.renderer.entities.pfx;
  switch (kind) {
    case 'vibration': {
      // a: desplazamiento hasta el oyente; b: ticks de viaje.
      const [dx, dy, dz] = unpackDelta(a ?? 0);
      const life = Math.max(0.05, (b ?? 1) / 20);
      ps.spawn({
        x: p[0], y: p[1], z: p[2], vx: dx / life, vy: dy / life, vz: dz / life, life, size: 0.14, sprite: SPRITE.glow,
        r: 0.5, g: 2.4, b: 2.6, drag: 0, flags: PF.EMISSIVE | PF.BRIGHT,
      });
      return true;
    }
    case 'sculk_clicking':
      g.audio.playDeepDarkSfx(kind, p);
      for (let i = 0; i < 4; i++) {
        ps.spawn({ x: p[0] + rnd(-0.3, 0.3), y: p[1] + 0.4, z: p[2] + rnd(-0.3, 0.3), vy: rnd(0.3, 0.8), life: rnd(0.3, 0.6), size: 0.06, sprite: SPRITE.spark, r: 0.6, g: 2.4, b: 2.6, flags: PF.EMISSIVE });
      }
      return true;
    case 'amethyst_resonate':
      g.audio.playDeepDarkSfx(kind, p, a);
      pfx.ring(p[0], p[1], p[2], 1.2, 1.4, 0.9, 1.8);
      return true;
    case 'sculk_bloom':
      g.audio.playDeepDarkSfx(kind, p);
      for (let i = 0; i < 10; i++) {
        ps.spawn({
          x: p[0] + rnd(-0.4, 0.4), y: p[1], z: p[2] + rnd(-0.4, 0.4), vy: rnd(0.4, 1.1), life: rnd(1, 1.8), size: rnd(0.1, 0.18), size1: 0.02,
          sprite: SPRITE.glow, r: 0.4, g: 2.2, b: 2.4, drag: 0.4, flags: PF.EMISSIVE | PF.FADE_IN | PF.DRIFT,
        });
      }
      return true;
    case 'sculk_spread':
      if (Math.random() < 0.5) g.audio.playDeepDarkSfx(kind, p);
      for (let i = 0; i < 2; i++) ps.spawn({ x: p[0] + rnd(-0.5, 0.5), y: p[1] + 0.5, z: p[2] + rnd(-0.5, 0.5), vy: 0.3, life: 0.8, size: 0.08, sprite: SPRITE.glow, r: 0.3, g: 1.6, b: 1.8, flags: PF.EMISSIVE | PF.FADE_IN });
      return true;
    case 'shriek':
      g.audio.playDeepDarkSfx(kind, p);
      for (let i = 0; i < 6; i++) {
        ps.spawn({ x: p[0], y: p[1] + i * 0.35, z: p[2], vy: 1.4, life: 1.2, size: 0.4, size1: 1.4, sprite: SPRITE.ring, r: 0.7, g: 1.8, b: 1.9, a: 0.6, flags: PF.EMISSIVE });
      }
      return true;
    case 'warden_warning':
      g.audio.playDeepDarkSfx(kind, p, a);
      return true;
    case 'warden_emerge':
    case 'warden_dig':
      g.audio.playDeepDarkSfx(kind, p);
      if (a && a > 0) {
        const light = 0x80;
        for (let i = 0; i < 24; i++) g.renderer.entities.spawnBreak(p[0] + rnd(-0.8, 0.8), p[1] + rnd(0, 0.4), p[2] + rnd(-0.8, 0.8), a, light);
      }
      return true;
    case 'warden_roar': {
      g.audio.playDeepDarkSfx(kind, p);
      const d = Math.hypot(p[0] - g.player.x, p[1] - g.player.y, p[2] - g.player.z);
      if (d < 16) g.shake = Math.min(1, g.shake + (1 - d / 16) * 0.8);
      return true;
    }
    case 'warden_sniff':
    case 'warden_sonic_charge':
    case 'warden_tendril':
      g.audio.playDeepDarkSfx(kind, p);
      return true;
    case 'warden_sonic_boom': {
      g.audio.playDeepDarkSfx(kind, p);
      const [dx, dy, dz] = unpackDelta(a ?? 0);
      const len = Math.hypot(dx, dy, dz) || 1;
      for (let i = 1; i < len + 6; i++) {
        const k = i / len;
        ps.spawn({ x: p[0] + dx * k, y: p[1] + dy * k, z: p[2] + dz * k, life: 0.5, size: 0.3, size1: 1.3, sprite: SPRITE.ring, r: 1.1, g: 2.2, b: 2.4, a: 0.8, flags: PF.EMISSIVE });
      }
      const d = Math.hypot(p[0] - g.player.x, p[2] - g.player.z);
      if (d < 20) g.shake = Math.min(1, g.shake + 0.6);
      return true;
    }
  }
  return false;
}

/** Latido ya sonado de cada warden (último golpe) y cuándo toca el próximo lamento del ambiente. */
const beats = new Map<number, boolean>();
let ambientT = 20;

/** Cada fotograma: el corazón de los wardens cercanos y el ambiente del Deep Dark. */
export function deepDarkTick(g: Game, dt: number): void {
  const p = g.player;
  const time = performance.now() / 1000;
  for (const e of g.ents.list.values()) {
    if (e.type !== MOB_WARDEN || e.deathT >= 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (d > 20) continue;
    const on = heartbeat(e, time) > 0.6;
    if (on && !beats.get(e.id)) g.audio.playDeepDarkSfx('warden_heartbeat', [e.x, e.y + (MOBS[e.type]?.height ?? 2) * 0.6, e.z]);
    beats.set(e.id, on);
  }
  if (beats.size > 32) for (const id of beats.keys()) if (!g.ents.list.has(id)) beats.delete(id);
  const world = g.world;
  if (!world) return;
  ambientT -= dt;
  if (ambientT > 0) return;
  ambientT = rnd(18, 40);
  if (!isDeepDark(world.generator, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return;
  const a = Math.random() * Math.PI * 2;
  g.audio.playDeepDarkSfx('deep_dark_ambient', [p.x + Math.cos(a) * 12, p.y + rnd(-4, 6), p.z + Math.sin(a) * 12]);
}
