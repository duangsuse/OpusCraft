// First-person hand + held item (port of ItemInHandRenderer transforms and item display transforms).
import { mat4, lerp, clamp } from '../engine/math.js';
import { PoseStack, itemDisplayKind } from './entities.js';
import { ITEMS } from '../game/items.js';
import { BLOCKS } from '../world/blocks.js';

const DISPLAY = {
  block: { fp: { rot: [0, 45, 0], tr: [0, 0, 0], sc: 0.40 }, tp: { rot: [75, 45, 0], tr: [0, 2.5, 0], sc: 0.375 }, ground: { rot: [0, 0, 0], tr: [0, 3, 0], sc: 0.25 } },
  generated: { fp: { rot: [0, -90, 25], tr: [1.13, 3.2, 1.13], sc: 0.68 }, tp: { rot: [0, 0, 0], tr: [0, 3, 1], sc: 0.55 }, ground: { rot: [0, 0, 0], tr: [0, 2, 0], sc: 0.5 } },
  handheld: { fp: { rot: [0, -90, 25], tr: [1.13, 3.2, 1.13], sc: 0.68 }, tp: { rot: [0, -90, 55], tr: [0, 4, 0.5], sc: 0.85 }, ground: { rot: [0, 0, 0], tr: [0, 2, 0], sc: 0.5 } },
};
export function applyDisplay(ps, kind, which) {
  const d = DISPLAY[kind === 'block' ? 'block' : kind === 'handheld' ? 'handheld' : 'generated'][which];
  ps.translate(d.tr[0] / 16, d.tr[1] / 16, d.tr[2] / 16);
  ps.rotX(d.rot[0]); ps.rotY(d.rot[1]); ps.rotZ(d.rot[2]);
  ps.scale(d.sc, d.sc, d.sc);
  ps.translate(-0.5, -0.5, -0.5);
}

export class HandRenderer {
  constructor(game, entityRenderer, itemMeshes) {
    this.game = game; this.er = entityRenderer; this.items = itemMeshes;
    this.mainHandHeight = 0; this.oMainHandHeight = 0;
    this.lastItem = null;
    this.xBob = 0; this.yBob = 0; this.xBobO = 0; this.yBobO = 0;
  }
  tick() {
    const p = this.game.player;
    this.oMainHandHeight = this.mainHandHeight;
    this.xBobO = this.xBob; this.yBobO = this.yBob;
    this.xBob += (p.pitch - this.xBob) * 0.5;
    this.yBob += (p.yaw - this.yBob) * 0.5;
    const held = this.game.inventory.held();
    const key = held ? held.id + ':' + held.count : null;
    const same = (held ? held.id : null) === (this.lastItem ? this.lastItem.id : null);
    const f = clamp(this.game.attackStrength ? this.game.attackStrength(1) : 1, 0, 1);
    this.mainHandHeight += clamp((same ? f * f * f : 0) - this.mainHandHeight, -0.4, 0.4);
    if (this.mainHandHeight < 0.1) this.lastItem = held ? { id: held.id } : null;
    void key;
  }

  // Draw with the active terrain program (vanilla or PBR) and entity program
  render(gl, ctx, terrainProg, entityBegin) {
    const game = this.game, p = game.player, cam = game.camera;
    if (cam.thirdPerson || game.hideHud || p.gamemode === 'spectator' || p.health <= 0) return;
    const pt = game.partialTick;
    const [w, h] = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    const proj = mat4.perspective(mat4.create(), game.settings.fov * Math.PI / 180, (ctx.width || w) / (ctx.height || h), 0.05, 100);
    // camera rotation (without bob) and bob/hurt matrix
    const rot = mat4.create();
    mat4.rotateX(rot, rot, p.pitch * Math.PI / 180);
    mat4.rotateY(rot, rot, (p.yaw + 180) * Math.PI / 180);
    const invRot = mat4.invert(mat4.create(), rot);
    const bob = mat4.create();
    if (p.hurtTime > 0) { let f = (p.hurtTime - pt) / 10; f = Math.sin(f * f * f * f * Math.PI); mat4.rotateZ(bob, bob, -f * 14 * Math.PI / 180); }
    if (game.settings.viewBobbing && cam.bobMatrix && !p.flying) mat4.multiply(bob, bob, cam.bobMatrix);
    const vp = mat4.multiply(mat4.create(), proj, mat4.multiply(mat4.create(), bob, rot));
    if (ctx.jitter) { vp[8] += 0; }
    const ps = new PoseStack(invRot);
    // camera-lag sway
    ps.rotX((p.pitch - lerp(this.xBobO, this.xBob, pt)) * 0.1);
    ps.rotY(-(p.yaw - lerp(this.yBobO, this.yBob, pt)) * 0.1);
    const swing = game.swingProgress ? game.swingProgress(pt) : 0;
    const equip = 1 - lerp(this.oMainHandHeight, this.mainHandHeight, pt);
    const held = this.lastItem && game.inventory.held() && game.inventory.held().id === this.lastItem.id ? game.inventory.held() : (this.lastItem ? { id: this.lastItem.id } : null);
    const light = game.world.getLight(Math.floor(cam.pos[0]), Math.floor(cam.pos[1]), Math.floor(cam.pos[2]));
    gl.clear(gl.DEPTH_BUFFER_BIT);
    if (!held) {
      // renderPlayerArm
      const f = 1, f1 = Math.sqrt(swing);
      const f2 = -0.3 * Math.sin(f1 * Math.PI), f3 = 0.4 * Math.sin(f1 * Math.PI * 2), f4 = -0.4 * Math.sin(swing * Math.PI);
      ps.translate(f * (f2 + 0.64000005), f3 - 0.6 + equip * -0.6, f4 - 0.71999997);
      ps.rotY(f * 45);
      const f5 = Math.sin(swing * swing * Math.PI), f6 = Math.sin(f1 * Math.PI);
      ps.rotY(f * f6 * 70);
      ps.rotZ(f * f5 * -20);
      ps.translate(f * -1, 3.6, 3.5);
      ps.rotZ(f * 120);
      ps.rotX(200);
      ps.rotY(f * -135);
      ps.translate(f * 5.6, 0, 0);
      // Java model part render: scale 1/16 is applied in the vertex shader (a_pos / 16)
      entityBegin();
      this.er.drawArm(ps.m, light, vp, 'player');
      this.er.end();
      return;
    }
    const kind = itemDisplayKind(held.id);
    const f5 = -0.4 * Math.sin(Math.sqrt(swing) * Math.PI);
    const f6 = 0.2 * Math.sin(Math.sqrt(swing) * Math.PI * 2);
    const f10 = -0.2 * Math.sin(swing * Math.PI);
    ps.translate(f5, f6, f10);
    // applyItemArmTransform
    ps.translate(0.56, -0.52 + equip * -0.6, -0.72);
    // applyItemArmAttackTransform
    const fa = Math.sin(swing * swing * Math.PI);
    ps.rotY(45 + fa * -20);
    const fb = Math.sin(Math.sqrt(swing) * Math.PI);
    ps.rotZ(fb * -20);
    ps.rotX(fb * -80);
    ps.rotY(-45);
    applyDisplay(ps, kind, 'fp');
    const mesh = this.items.forItem(held.id);
    if (!mesh) return;
    const prog = terrainProg();
    prog.set('u_model', ps.m).set('u_viewProj', vp).set('u_chunkOff', 0, 0, 0).set('u_lightOverride', light[0] / 15, light[1] / 15, 1).set('u_colorMul', 1, 1, 1, 1).set('u_alphaCutoff', 0.1);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.quads * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    prog.set('u_lightOverride', 0, 0, 0).set('u_model', mat4.create());
    void BLOCKS; void ITEMS; void w; void h;
  }
}
