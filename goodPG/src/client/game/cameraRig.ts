// La cámara del jugador: la luz que le llega al ojo (y la del sol filtrada bajo el agua), dónde se pone
// (primera persona con balanceo, tercera persona por detrás o de frente sin atravesar paredes, la
// sacudida de los golpes y explosiones) y la lente (FOV al correr, el arco y el catalejo, y la
// resolución que baja sola si el juego va lento).
import { AIR, BLOCK_SOLID, BLOCK_FLUID } from '../../shared/blocks';
import { raycast } from './raycast';
import type { Game } from './Game';

/** Luz en el ojo del jugador. */
export interface EyeLight {
  /** Luz empaquetada del bloque del ojo (cielo << 4 | bloque). */
  le: number;
  /** Luz del cielo en el ojo (0..1). */
  skyAtEye: number;
  underwater: boolean;
  /** Bajo el agua abierta al cielo: luz del sol filtrada por la profundidad (0..1). */
  waterLight: number;
}

/** Dónde está la cámara y hacia dónde mira. */
export interface CameraPose {
  camX: number;
  camY: number;
  camZ: number;
  yaw: number;
  pitch: number;
}

export class CameraRig {
  /** 0 primera persona, 1 tercera por detrás, 2 tercera de frente (tecla de perspectiva). */
  thirdPerson = 0;
  /** Exposición al cielo en el ojo, suavizada (niebla, sonido del viento, lluvia). */
  eyeSky = 1;
  private fovCurrent = 75;
  private autoScale = 1;
  private lastUserScale = -1;
  private slowTime = 0;

  constructor(private g: Game) {}

  eyeLight(dt: number): EyeLight {
    const world = this.g.world!;
    const p = this.g.player;
    const le = world.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const skyAtEye = (le >> 4) / 15;
    this.eyeSky += (skyAtEye - this.eyeSky) * (1 - Math.exp(-dt * 1.5));
    const underwater = p.eyeInWater;
    // Bajo el agua abierta al cielo, la luz del sol llega filtrada (menos cuanto más hondo): la usan la
    // mano y las partículas, que si no sólo verían la luz del cielo del bloque (se apaga a pocos bloques).
    let waterLight = 0;
    if (underwater) {
      const ex = Math.floor(p.x), ez = Math.floor(p.z);
      let y = Math.floor(p.eyeY), depth = 0;
      for (; depth < 64; depth++, y++) {
        const b = world.getBlock(ex, y, ez);
        if (b <= 0 || BLOCK_FLUID[b] !== 1) break;
      }
      if (world.getBlock(ex, y, ez) === AIR && world.getLight(ex, y, ez) >> 4 >= 14) waterLight = Math.exp(-0.07 * depth);
    }
    return { le, skyAtEye, underwater, waterLight };
  }

  /** Coloca la cámara; `dir` es la dirección de la mirada. */
  place(dt: number, dir: number[]): CameraPose {
    const g = this.g;
    const world = g.world!;
    const p = g.player;
    const eyeX = p.x, eyeY = p.eyeY, eyeZ = p.z;
    let camX = eyeX, camY = eyeY, camZ = eyeZ;
    let yaw = p.yaw, pitch = p.pitch;
    if (g.survival.dead) camY = p.y + 0.3;
    else if (g.life.sleeping) camY = p.y + 0.2;
    if (g.cfg.settings.viewBobbing && this.thirdPerson === 0) {
      const ph = p.walkDistance * Math.PI * 0.62;
      camY += -Math.abs(Math.cos(ph)) * 0.06 * p.walkAmount;
      camX += Math.cos(p.yaw) * Math.sin(ph) * 0.035 * p.walkAmount;
      camZ += -Math.sin(p.yaw) * Math.sin(ph) * 0.035 * p.walkAmount;
    }
    // Sacudida al recibir daño o por una explosión cercana.
    if (g.shake > 0) {
      const t = performance.now() / 1000;
      pitch += Math.sin(t * 41) * 0.03 * g.shake;
      yaw += Math.sin(t * 33 + 1) * 0.03 * g.shake;
      g.shake = Math.max(0, g.shake - dt * 2.5);
    }
    if (this.thirdPerson > 0) {
      const back = this.thirdPerson === 1 ? 1 : -1;
      const want = 4;
      const hit = raycast(eyeX, eyeY, eyeZ, -dir[0] * back, -dir[1] * back, -dir[2] * back, want, (x, y, z) => {
        const b = world.getBlock(x, y, z);
        return b > 0 && BLOCK_SOLID[b] ? b : AIR;
      });
      const d = hit ? Math.max(0.3, hit.dist - 0.25) : want;
      camX = eyeX - dir[0] * back * d;
      camY = eyeY - dir[1] * back * d;
      camZ = eyeZ - dir[2] * back * d;
      if (back < 0) {
        yaw += Math.PI;
        pitch = -pitch;
      }
    }
    return { camX, camY, camZ, yaw, pitch };
  }

  /** FOV dinámico (correr, volar, arco, catalejo) y resolución interna automática. */
  lens(dt: number): void {
    const g = this.g;
    const settings = g.cfg.settings;
    const p = g.player;
    const use = g.interaction.use;
    const baseFov = settings.render.fov;
    const bowZoom = use?.kind === 'bow' ? 1 - Math.min(1, use.t) * 0.15 : 1;
    const spyZoom = use?.kind === 'spyglass' ? 0.1 : 1; // Fase 6.5 (decoración): catalejo
    const targetFov = baseFov * (p.sprinting ? 1.12 : 1) * (p.flying && p.sprinting ? 1.05 : 1) * bowZoom * spyZoom;
    this.fovCurrent += (targetFov - this.fovCurrent) * (1 - Math.exp(-dt * 8));
    // Resolución dinámica: si el rendimiento cae de forma sostenida, bajar la escala interna.
    if (settings.render.renderScale !== this.lastUserScale) {
      this.lastUserScale = settings.render.renderScale;
      this.autoScale = 1;
      this.slowTime = 0;
    }
    if (g.playing && document.visibilityState === 'visible') {
      this.slowTime = dt > 1 / 33 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 0.5);
      if (this.slowTime > 3 && settings.render.renderScale * this.autoScale > 0.55) {
        this.autoScale = Math.max(0.5 / settings.render.renderScale, this.autoScale - 0.12);
        this.slowTime = 0;
        g.ui.toast('Resolución reducida automáticamente para mantener la fluidez');
      }
    }
    g.renderer.settings = { ...settings.render, fov: this.fovCurrent, renderScale: settings.render.renderScale * this.autoScale };
  }
}
