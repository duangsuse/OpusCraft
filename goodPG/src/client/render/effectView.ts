// Fase 7 (efectos): lo que los efectos de estado cambian en la imagen.
// - Náuseas: la proyección se estira y gira despacio sobre un eje inclinado (como en Minecraft Java).
// - Ceguera y Oscuridad: niebla negra que se cierra a pocos bloques (el cielo, negro) y, con la
//   Oscuridad, la vista que se apaga a pulsos. Se pinta antes de la mano (que se sigue viendo) y después
//   de medir la exposición (así la cámara no se aclara en la oscuridad).
// - Brillo: contorno blanco de las criaturas y jugadores que brillan, visible a través de las paredes.
//   Se dibujan sus siluetas en una máscara y se marca el borde encima de la imagen final.
import { mat4 } from 'gl-matrix';
import { Program, RenderTarget, FULLSCREEN_VS, type FullscreenTriangle, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';
import { MOB_VS } from './shaders/mob';
import { ENTITY_VS } from './shaders/entity';
import { EF_GLOWING } from '../../shared/effects';
import type { MobRenderer } from './MobRenderer';
import type { EntityRenderer, RemotePlayerView } from './EntityRenderer';
import type { ClientEntity } from '../game/ClientEntities';

/** Vista cerrada: niebla negra de `start` a `end` bloques, cielo tapado (0..1) y oscurecimiento (0..1). */
export interface SightFog {
  start: number;
  end: number;
  sky: number;
  dark: number;
}

const SILHOUETTE_FS = /* glsl */ `
uniform sampler2D uSkin;
in vec2 vUV;
out vec4 outColor;
void main() {
  if (texture(uSkin, vUV).a < 0.5) discard;
  outColor = vec4(1.0);
}
`;

/** Borde de la máscara: los píxeles fuera de una silueta con alguna silueta a `uWidth` píxeles. */
const OUTLINE_FS = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uWidth;
in vec2 vUV;
out vec4 outColor;
void main() {
  if (texture(uMask, vUV).a > 0.5) discard;
  float m = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      m = max(m, texture(uMask, vUV + vec2(float(x), float(y)) * uTexel * uWidth * 0.5).a);
    }
  }
  if (m < 0.5) discard;
  outColor = vec4(1.0);
}
`;

const SIGHT_FS = /* glsl */ `
${COMMON}
uniform sampler2D uDepth;
uniform vec4 uSight;
in vec2 vUV;
out vec4 outColor;
void main() {
  float depth = texture(uDepth, vUV).r;
  float f = uSight.z;
  if (depth < 1.0) f = smoothstep(uSight.x, uSight.y, length(relFromDepth(vUV, depth)));
  outColor = vec4(0.0, 0.0, 0.0, max(f, uSight.w));
}
`;

const AXIS = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
const tmpA = mat4.create();
const tmpB = mat4.create();

export class EffectView {
  private pSilMob: Program;
  private pSilPlayer: Program;
  private pOutline: Program;
  private pSight: Program;
  private mask: RenderTarget;

  constructor(private gl: GL, private tri: FullscreenTriangle) {
    this.pSilMob = new Program(gl, { name: 'glow-mob', vs: MOB_VS, fs: SILHOUETTE_FS });
    this.pSilPlayer = new Program(gl, { name: 'glow-player', vs: ENTITY_VS, fs: SILHOUETTE_FS });
    this.pOutline = new Program(gl, { name: 'glow-outline', vs: FULLSCREEN_VS, fs: OUTLINE_FS });
    this.pSight = new Program(gl, { name: 'sight-fog', vs: FULLSCREEN_VS, fs: SIGHT_FS });
    this.mask = new RenderTarget(gl, [{ internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST }]);
  }

  /**
   * Náuseas (intensidad 0..1): proyección × giro(eje, a) × escala(1/h, 1, 1) × giro(eje, −a), con
   * h = (5 / (k² + 5) − 0,04·k)² y a = 7° por tick, como en Minecraft Java.
   */
  static warp(proj: mat4, k: number, time: number): void {
    if (!(k > 0)) return;
    let h = 5 / (k * k + 5) - k * 0.04;
    h *= h;
    const a = ((time * 20 * 7) % 360) * (Math.PI / 180);
    mat4.fromRotation(tmpA, a, AXIS as unknown as [number, number, number]);
    mat4.scale(tmpA, tmpA, [1 / h, 1, 1]);
    mat4.fromRotation(tmpB, -a, AXIS as unknown as [number, number, number]);
    mat4.multiply(tmpA, tmpA, tmpB);
    mat4.multiply(proj, proj, tmpA);
  }

  /** Niebla negra de la Ceguera o la Oscuridad sobre el buffer ya enlazado (con la profundidad de la escena). */
  sight(fog: SightFog | null | undefined, depth: WebGLTexture | null): void {
    if (!fog) return;
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.pSight.use().tex2D('uDepth', depth).f4('uSight', fog.start, Math.max(fog.start + 0.01, fog.end), fog.sky, fog.dark);
    this.tri.draw();
    gl.disable(gl.BLEND);
  }

  /**
   * Contorno de lo que brilla, sobre la imagen final (framebuffer de la pantalla). `w`×`h`: resolución
   * interna (la de la máscara); `cw`×`ch`: la de la pantalla.
   */
  glow(
    mobs: ClientEntity[], players: RemotePlayerView[], mobR: MobRenderer, entR: EntityRenderer,
    camX: number, camY: number, camZ: number, time: number, w: number, h: number, cw: number, ch: number,
  ): void {
    const glowMobs = mobs.filter((e) => e.flags & EF_GLOWING && e.deathT < 0);
    const glowPlayers = players.filter((p) => p.glowing);
    if (glowMobs.length === 0 && glowPlayers.length === 0) return;
    const gl = this.gl;
    this.mask.resize(w, h);
    this.mask.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    if (glowMobs.length) mobR.drawSilhouettes(glowMobs, camX, camY, camZ, time, this.pSilMob.use());
    if (glowPlayers.length) entR.drawSilhouettes(glowPlayers, camX, camY, camZ, this.pSilPlayer.use());
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    this.pOutline.use().tex2D('uMask', this.mask.color).f2('uTexel', 1 / w, 1 / h).f1('uWidth', Math.max(1, h / 540));
    this.tri.draw();
  }
}
