// Draws entities (mobs, dropped items, falling blocks, TNT, vehicles) for every render mode.
import { mat4, lerp } from '../engine/math.js';
import { PoseStack, itemDisplayKind } from './entities.js';
import { applyDisplay } from './hand.js';
import { ID } from '../world/blocks.js';

export class WorldEntityRenderer {
  constructor(game, er, items) { this.game = game; this.er = er; this.items = items; }

  // terrainProg: function returning the active terrain program configured for this pass
  render(gl, ctx, terrainProg, entityBegin) {
    const game = this.game, cam = ctx.cam, pt = game.partialTick;
    const shadow = ctx.pass === 'shadow';
    // box-model entities
    const models = [];
    for (const e of game.entities) if (!e.dead && e.renderModel) models.push(e);
    if (game.camera.thirdPerson && game.player.health > 0 || shadow && game.player.gamemode !== 'spectator') models.push(game.playerEntityView);
    if (models.length) {
      entityBegin();
      for (const e of models) {
        if (!e) continue;
        const pos = e.lerpPos(pt);
        const rel = [pos[0] - cam.pos[0], pos[1] - cam.pos[1], pos[2] - cam.pos[2]];
        if (Math.hypot(rel[0], rel[2]) > ctx.env.renderDistance * 16 + 16) continue;
        const L = game.world.getLight(Math.floor(pos[0]), Math.floor(pos[1] + 0.5), Math.floor(pos[2]));
        for (const inst of e.renderModel(pt, rel, L)) this.er.drawModel(inst.model, inst);
      }
      this.er.end();
    }
    // block/item based entities
    const prog = terrainProg();
    gl.disable(gl.CULL_FACE);
    for (const e of game.entities) {
      if (e.dead) continue;
      const pos = e.lerpPos(pt);
      const rel = [pos[0] - cam.pos[0], pos[1] - cam.pos[1], pos[2] - cam.pos[2]];
      if (Math.hypot(rel[0], rel[2]) > 96) continue;
      const L = game.world.getLight(Math.floor(pos[0]), Math.floor(pos[1] + 0.2), Math.floor(pos[2]));
      if (e.type === 'item') this.drawItemEntity(gl, prog, e, rel, L, pt, shadow);
      else if (e.type === 'falling_block') this.drawBlock(gl, prog, e.block, rel, L, [-0.5, 0, -0.5], 1);
      else if (e.type === 'tnt') {
        let s = 1;
        const f = e.fuse - pt + 1;
        if (f < 10) { let g = 1 - f / 10; g = Math.min(1, Math.max(0, g)); g *= g; g *= g; s = 1 + g * 0.3; }
        const flash = (Math.floor(e.fuse / 5) % 2 === 0) && !shadow;
        this.drawBlock(gl, prog, ID.tnt, rel, flash ? [15, 15] : L, [-0.5 * s, 0, -0.5 * s], s, flash ? [2.2, 2.2, 2.2, 1] : null);
      } else if (e.type === 'xp' && !shadow) {
        this.drawSpriteBillboard(gl, prog, 'item/emerald', rel, [15, 15], 0.3, cam, pt, e.age);
      }
    }
    prog.set('u_lightOverride', 0, 0, 0).set('u_model', mat4.create()).set('u_colorMul', 1, 1, 1, 1);
    gl.enable(gl.CULL_FACE);
  }

  drawBlock(gl, prog, v, rel, L, off, scale, color) {
    const mesh = this.items.block(v);
    const m = mat4.create();
    mat4.translate(m, m, [rel[0] + off[0], rel[1] + off[1], rel[2] + off[2]]);
    if (scale !== 1) mat4.scale(m, m, [scale, scale, scale]);
    prog.set('u_model', m).set('u_chunkOff', 0, 0, 0).set('u_lightOverride', L[0] / 15, L[1] / 15, 1).set('u_colorMul', ...(color || [1, 1, 1, 1]));
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.quads * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  drawItemEntity(gl, prog, e, rel, L, pt, shadow) {
    const mesh = this.items.forItem(e.stack.id);
    if (!mesh) return;
    const kind = itemDisplayKind(e.stack.id);
    const age = e.age + pt;
    const bob = Math.sin(age / 10 + e.bobOffs) * 0.1 + 0.1;
    const groundScaleY = kind === 'block' ? 0.25 : 0.5;
    const spin = age / 20 + e.bobOffs;
    const n = e.stack.count > 48 ? 5 : e.stack.count > 32 ? 4 : e.stack.count > 16 ? 3 : e.stack.count > 1 ? 2 : 1;
    let seed = e.stack.id * 31 + 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      const ps = new PoseStack();
      ps.translate(rel[0], rel[1] + bob + 0.25 * groundScaleY, rel[2]);
      ps.rotY(spin * 180 / Math.PI);
      if (i > 0) {
        if (kind === 'block') ps.translate((rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15);
        else ps.translate((rnd() * 2 - 1) * 0.15 * 0.5, (rnd() * 2 - 1) * 0.15 * 0.5, -0.09375 * i * 0.5);
      }
      applyDisplay(ps, kind, 'ground');
      prog.set('u_model', ps.m).set('u_chunkOff', 0, 0, 0).set('u_lightOverride', L[0] / 15, L[1] / 15, 1).set('u_colorMul', 1, 1, 1, 1);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.quads * 6, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    void shadow; void lerp;
  }

  drawSpriteBillboard(gl, prog, layer, rel, L, size, cam, pt, age) {
    const mesh = this.items.sprite(layer, 0x80ff20);
    const m = mat4.create();
    mat4.translate(m, m, [rel[0], rel[1] + 0.2, rel[2]]);
    mat4.rotateY(m, m, -cam.yaw * Math.PI / 180 + Math.PI);
    mat4.scale(m, m, [size, size, size]);
    mat4.translate(m, m, [-0.5, -0.5, -0.5]);
    const pulse = 0.6 + 0.4 * Math.sin((age + pt) * 0.3);
    prog.set('u_model', m).set('u_chunkOff', 0, 0, 0).set('u_lightOverride', 1, 1, 1).set('u_colorMul', pulse, 1, pulse, 1);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.quads * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}
