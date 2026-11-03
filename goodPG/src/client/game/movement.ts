// El jugador propio en cada frame: mirar con el ratón, levantarse de la cama, los controles (agacharse y
// correr fijos, volar con doble salto en creativo), la física (o la montura, barca o vagoneta que lo
// lleva) y los sonidos de pasos, aterrizajes y chapuzones.
import { BLOCKS, DIRT, isFarmland } from '../../shared/blocks';
import { ITEMS } from '../../shared/items';
import { potionPhysics } from './potionClient';
import { effectsPhysics } from './effectsClient';
import type { Game } from './Game';
import { canGlideWith } from '../../shared/elytra'; // Fase 8.6
import { isPushableMob, pushStep, boxesOverlap, PUSH_STEP } from '../../shared/push';
import { MOBS } from '../../shared/mobs';
import { EF_BABY } from '../../shared/protocol';
import { PLAYER_WIDTH } from '../../shared/constants';

/** Aceleración del empuje de una criatura (bloques/s² por cada 0,05 bloques por tick de Entity.push). */
const PUSH_ACCEL = 15.4;
import { glideWindLevel } from '../audio/glideWind';

/** Lo que el resto del frame necesita saber del movimiento. */
export interface MoveResult {
  /** El jugador controla (ratón capturado, sin chat, vivo y despierto). */
  active: boolean;
  /** Distancia horizontal recorrida (0 montado: no gasta hambre). */
  moved: number;
  /** Estaba en el suelo antes de moverse. */
  wasGround: boolean;
}

export class Movement {
  /** Agacharse y correr fijos: una pulsación los activa y otra los quita. */
  sneakOn = false;
  sprintOn = false;
  private stepDist = 0;

  constructor(private g: Game) {}

  /**
   * Entity.push de Java con cada criatura cuya caja se solapa con la del jugador: hasta 0,05 bloques por tick, que
   * aquí van al impulso externo (con la fuerza que da, frenando como frena ese impulso, el mismo desplazamiento).
   */
  private pushedByMobs(dt: number): void {
    const g = this.g, p = g.player;
    if (g.survival.dead || p.flying) return;
    for (const e of g.ents.list.values()) {
      if (e.gone || e.deathT >= 0 || !isPushableMob(e.type)) continue;
      const def = MOBS[e.type];
      const s = e.flags & EF_BABY ? 0.5 : 1;
      if (!boxesOverlap(p.x, p.y, p.z, PLAYER_WIDTH, p.height, e.x, e.y, e.z, def.width * s, def.height * s)) continue;
      const v = pushStep(e.x, e.z, p.x, p.z);
      if (!v) continue;
      // En Java el paso se frena ×0,546 por tick en el suelo: 0,05 b/tick dan ~2,2 b/s; el impulso de aquí se
      // frena ×e^(−7 s): hacen falta ~15 b/s² por cada 0,05 b/tick para llegar a lo mismo.
      p.kx += (v[0] / PUSH_STEP) * PUSH_ACCEL * dt;
      p.kz += (v[1] / PUSH_STEP) * PUSH_ACCEL * dt;
    }
  }

  update(dt: number): MoveResult {
    const g = this.g;
    const world = g.world!;
    const { ui, input, player: p, survival: surv } = g;
    const settings = g.cfg.settings;

    // Cámara: el ratón gira la mirada (el catalejo la frena).
    if (input.locked && !surv.dead) {
      const sens = 0.0022 * settings.sensitivity * (g.interaction.use?.kind === 'spyglass' ? 0.2 : 1); // Fase 6.5: catalejo
      p.yaw -= input.dx * sens;
      p.pitch -= input.dy * sens * (settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }

    // Cama: la pantalla se oscurece; Mayús para levantarse.
    if (g.life.sleeping) {
      g.life.sleeping.t += dt;
      ui.setSleep(Math.min(0.9, g.life.sleeping.t / 5));
      if (input.locked && !ui.isChatOpen() && input.wasPressed(settings.keys.sneak)) g.life.leaveBed(true);
    }

    const active = input.locked && !ui.isChatOpen() && !surv.dead && !g.life.sleeping;
    const k = settings.keys;
    if (active && settings.toggleSneak && input.wasPressed(k.sneak)) this.sneakOn = !this.sneakOn;
    if (active && settings.toggleSprint && input.wasPressed(k.sprint)) this.sprintOn = !this.sprintOn;
    if (!settings.toggleSneak) this.sneakOn = false;
    if (!settings.toggleSprint) this.sprintOn = false;
    if (active && g.creative && input.wasDoubleTapped(k.jump)) {
      p.flying = !p.flying;
      if (p.flying) p.vy = 0;
    }
    if (!g.creative) p.flying = false;
    if (active && input.wasDoubleTapped(k.forward) && (g.creative || surv.canSprint())) p.sprinting = true;
    if (!g.creative && !surv.canSprint()) p.sprinting = false;
    // Usar un objeto frena mucho; los efectos Velocidad y Lentitud multiplican.
    p.usingItem = !!g.interaction.use;
    p.slow = (g.interaction.use ? 0.25 : 1) * g.statusEffects.speed;
    potionPhysics(g); // Fase 7 (pociones): Supersalto y Caída lenta
    effectsPhysics(g); // Fase 7 (efectos): Levitación, Gracia del delfín, Ceguera y Salud mejorada
    p.leatherBoots = ITEMS[g.inv.armor[3]?.id ?? 0]?.armor?.material === 'leather'; // Fase 6.5 (materiales): nieve polvo
    world.renderDistance = settings.render.renderDistance;
    const wasInWater = p.inWater;
    const wasGround = p.onGround;
    const ox = p.x, oz = p.z;
    const controls = {
      forward: active && input.isDown(k.forward),
      back: active && input.isDown(k.back),
      left: active && input.isDown(k.left),
      right: active && input.isDown(k.right),
      jump: active && (input.isDown(k.jump) || input.wasPressed(k.jump)),
      sneak: active && (settings.toggleSneak ? this.sneakOn : input.isDown(k.sneak)),
      sprint: active && (settings.toggleSprint ? this.sprintOn : input.isDown(k.sprint)) && (g.creative || surv.canSprint()),
      jumpPressed: active && input.wasPressed(k.jump), // Fase 8.6: abrir los élitros
    };
    // Fase 8.6: los élitros sirven puestos en el pecho, con más de un uso, sin ir montado.
    p.canGlide = canGlideWith(g.inv.armor[1]) && !g.riding.active && !g.vehicles.active;
    // Fase 6 (monturas): montado se mueve la montura (o nada, si la lleva el servidor) y no el jugador.
    // Fase 7 (transporte): en barca o vagoneta tampoco (la mueve su sistema).
    g.vehicles.collidePlayer(dt); // Fase 7 (remate): barcas sólidas y vagonetas que apartan
    if (!g.riding.active && !g.vehicles.active) this.pushedByMobs(dt); // las criaturas con las que se solapa le apartan
    if (!g.riding.update(dt, controls, active) && !g.vehicles.update(dt, controls, active)) p.update(dt, controls, world);
    g.mechanisms.update(); // Fase 7 (mecanismos): los bloques que empujan los pistones apartan al jugador
    const moved = g.riding.active || g.vehicles.active ? 0 : Math.hypot(p.x - ox, p.z - oz);
    // Fase 8.6: lo que gasta el vuelo (1 cada 20 ticks, con Irrompibilidad) y el golpe al chocar de lado.
    for (; p.glideWear > 0; p.glideWear--) {
      const el = g.inv.armor[1];
      if (el && !g.creative) g.inv.wearStack(el, 1);
    }
    const [wv, wp] = glideWindLevel(p.gliding ? p.glideTicks : 0, (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) / 400);
    g.audio.setGlideWind(wv, wp);
    if (p.wallDamage > 0) {
      if (!g.creative) surv.damage(p.wallDamage, 'fly_into_wall');
      p.wallDamage = 0;
    }
    // Caer sobre tierra de cultivo la pisotea (más probable cuanto más alta la caída).
    if (p.justLanded && !p.flying && p.landedFall > 0.5 && Math.random() < p.landedFall - 0.5) {
      const bx = Math.floor(p.x), by = Math.floor(p.y - 0.05), bz = Math.floor(p.z);
      if (isFarmland(world.getBlock(bx, by, bz))) {
        world.setBlock(bx, by, bz, DIRT);
        g.net?.send({ t: 'trample', x: bx, y: by, z: bz });
      }
    }

    // Sonidos de pasos y aterrizaje.
    const below = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
    const groundMat = below > 0 ? BLOCKS[below].sound : 'stone';
    if (p.onGround && !p.sneaking) {
      this.stepDist += p.walkAmount * dt * 4.3;
      if (this.stepDist > 1.8) {
        this.stepDist = 0;
        g.audio.playStep(groundMat, [p.x, p.y, p.z], p.sprinting ? 0.8 : 0.6);
      }
    }
    if (p.justLanded && p.landedSpeed < -7) g.audio.playLand(groundMat, [p.x, p.y, p.z], Math.min(1, (-p.landedSpeed - 7) / 15));
    if (p.inWater && !wasInWater && p.justEnteredWater) {
      g.audio.playSplash([p.x, p.y, p.z], Math.min(1, -p.vy / 10 + 0.3));
      // Chapuzón: salpicadura en la superficie y burbujas.
      g.renderer.entities.pfx.splash(p.x, p.y + 0.4, p.z, Math.min(24, 6 + Math.round(-p.vy * 1.5)));
      g.renderer.entities.pfx.bubbles(p.x, p.y, p.z, 6, 0.4);
    }
    return { active, moved, wasGround };
  }
}
