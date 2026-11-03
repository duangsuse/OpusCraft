// Criaturas: construye la malla de cajas de cada especie (un hueso por parte), anima las partes
// según el tipo (cuadrúpedo, humanoide, araña, calamar...) y las dibuja con sombras.
import { animateWither, witherPartOffset, witherScale, witherSkinVariant, witherPowered, witherSkullDef } from './witherPose'; // Fase 8.7
import { MOB_WITHER, ENT_WITHER_SKULL } from '../../shared/witherMobs';
import { mat4 } from 'gl-matrix';
import { Program, type GL } from '../engine/gl';
import { MOB_VS, MOB_FS, MOB_SHADOW_VS, MOB_SHADOW_FS, MAX_BONES } from './shaders/mob';
import { MOBS, boxFaces, type MobDef, MOB_SKELETON, MOB_STRAY, MOB_CREEPER } from '../../shared/mobs';
import { EF_ACTION, EF_ANGRY, EF_BABY, EF_SHEARED } from '../../shared/protocol';
import type { ClientEntity } from '../game/ClientEntities';
import { hiddenMountPart, mountPartAnim, mountRootPose } from './mountPose'; // Fase 6 (monturas)
import { animateMonster, monsterRoot } from './monsterAnim'; // Fase 6 (monstruos)
import { animateIllager, illagerRoot, hiddenIllagerPart } from './illagerAnim'; // Fase 6 (asaltos)
import { animateAquatic, hiddenAquaticPart, aquaticRoot } from './aquaticPose'; // Fase 6 (acuáticos)
// Fase 6 (gólems/domesticar): pieles, collar, poses de sentado y de los gólems.
import { mobSkinKey, hiddenPart, sitRoot, companionPart } from './companionPose';
import { mobVariant, faunaAnimate, faunaPartScale, faunaRoot } from './faunaPose'; // Fase 6 (fauna)
import { EF_CHARGED } from '../../shared/collections'; // Fase 6.5 (colecciones)
import { chargedAuraTexture, AURA_FRAMES } from '../textures/collectionTextures'; // Fase 6.5 (colecciones)
import { gearTexture, GEAR_INFLATE } from '../textures/gearTextures'; // Fase 6.5 (equipo)
import { MOB_DROWNED } from '../../shared/mobs';
import { EF_INVISIBLE } from '../../shared/potions'; // Fase 7 (remate)
import { vehicleModel, vehicleSkinVariant, animateVehicle, vehicleRoot } from './vehicleModels'; // Fase 7 (transporte)
import { animateGuardian, guardianPartScale } from './guardianPose'; // Fase 7.5 (océano)
import { animateWarden, wardenPartScale, wardenRoot } from './wardenAnim'; // Fase 7.5 (abismo)
import { critterAnimate, critterPart, critterRoot } from './critterPose'; // Fase 7.5 (fauna)
import { animateAllay, allayRoot, ALLAY_HOLD } from './allayPose'; // Fase 7.5 (mansión)
import { MOB_ALLAY } from '../../shared/allay';
import { netherAnimate, netherPartOffset, netherRoot, netherVariant } from './netherMobPose'; // Fase 8.3 (criaturas del Nether)
import { isNetherMob, MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_WITHER_SKELETON } from '../../shared/netherMobs';
import { MOB_ENDER_DRAGON, ENT_END_CRYSTAL } from '../../shared/endMobs'; // Fase 8.6 (el End)
import { DragonRenderer } from './DragonRenderer';
import { dragonTexture, crystalTexture, bulletTexture } from '../textures/dragonTextures';
import { shulkerRoot, shulkerPartOffset, animateShulker } from './shulkerPose'; // Fase 8.6
import { MOB_SHULKER, ENT_SHULKER_BULLET } from '../../shared/endMobs';

export interface MobTexture {
  width: number;
  height: number;
  rgba: Uint8Array;
}

interface MobMesh {
  vao: WebGLVertexArrayObject;
  count: number;
  parents: number[];
  names: string[];
}

const P = 1 / 16;

/**
 * Escala de las partes ocultas (lana esquilada, silla, collar, estandarte…): casi cero pero no cero.
 * Con una escala exactamente nula la matriz queda singular y algunas GPU dibujan líneas que cruzan
 * la pantalla.
 */
const HIDE: [number, number, number] = [1e-3, 1e-3, 1e-3];

export class MobRenderer {
  private gl: GL;
  private prog: Program;
  private shadowProg: Program;
  private meshes = new Map<number, MobMesh>();
  /** Fase 6.5 (equipo): mallas algo más grandes para las armaduras de los animales y sus texturas. */
  private gearMeshes = new Map<number, MobMesh>();
  private gearSkins = new Map<string, WebGLTexture | null>();
  private skins = new Map<number, WebGLTexture>();
  /** Fase 6: variant = pelaje (monturas) o profesión (aldeanos); una textura por especie y variante. */
  private texSource: (id: number, variant?: number) => MobTexture | null;
  private bones = new Float32Array(MAX_BONES * 16);
  /** Fase 8.3: desplazamiento de la parte que se está colocando (varas del blaze, rodajas del cubo de magma…). */
  private off = [0, 0, 0];
  /** Fase 6.5 (colecciones): fotogramas del aura del creeper cargado. */
  private auraSkins = new Map<string, WebGLTexture>();
  /** Fase 8.7: el modelo de la calavera del Wither. */
  private readonly skullDef = witherSkullDef(MOBS[MOB_WITHER]);
  private model = mat4.create();
  /** Fase 8.6: el dragón de Ender y los cristales del End (se dibujan parte a parte). */
  readonly dragon: DragonRenderer;

  constructor(gl: GL, texSource: (id: number, variant?: number) => MobTexture | null) {
    this.gl = gl;
    this.texSource = texSource;
    this.dragon = new DragonRenderer(gl, (k) => (k === 'dragon' ? dragonTexture() : k === 'bullet' ? bulletTexture() : crystalTexture()));
    this.prog = new Program(gl, { name: 'mob', vs: MOB_VS, fs: MOB_FS });
    this.shadowProg = new Program(gl, { name: 'mob-shadow', vs: MOB_SHADOW_VS, fs: MOB_SHADOW_FS });
  }

  // ---------------------------------------------------------------- recursos

  /**
   * `inflate`: píxeles que crece cada caja por cada lado, con la misma UV (Fase 6.5: aura del creeper
   * cargado y armaduras de animales).
   */
  private mesh(def: MobDef, inflate = 0): MobMesh {
    const cache = inflate ? this.gearMeshes : this.meshes;
    const key = inflate ? def.id * 1000 + Math.round(inflate * 100) : def.id;
    let m = cache.get(key);
    if (m) return m;
    const gl = this.gl;
    const [aw, ah] = def.atlas;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], bone: number[] = [], idx: number[] = [];
    const names = def.parts.map((p) => p.name);
    const parents = def.parts.map((p) => (p.parent ? names.indexOf(p.parent) : -1));
    def.parts.forEach((part, bi) => {
      const g = inflate + (part.grow ?? 0); // Fase 8.3: la silla del strider crece medio píxel sin cambiar su UV
      const [x0, y0, z0] = part.from.map((v) => (v - g) * P);
      const [w, h, d] = part.size;
      const x1 = x0 + (w + 2 * g) * P, y1 = y0 + (h + 2 * g) * P, z1 = z0 + (d + 2 * g) * P;
      const faces = boxFaces(part.uv[0], part.uv[1], w, h, d);
      const corners: number[][][] = [
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
        [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]],
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      ];
      const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1], [0, 0, 1]];
      for (let f = 0; f < 6; f++) {
        const [u, v, fw, fh] = faces[f];
        const uvs = [[u, v + fh], [u + fw, v + fh], [u + fw, v], [u, v]];
        const base = pos.length / 3;
        for (let k = 0; k < 4; k++) {
          pos.push(...corners[f][k]);
          nrm.push(...normals[f]);
          uv.push(uvs[k][0] / aw, uvs[k][1] / ah);
          bone.push(bi);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    });
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const attr = (loc: number, data: number[], size: number) => {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr(0, pos, 3);
    attr(1, nrm, 3);
    attr(2, uv, 2);
    attr(3, bone, 1);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    m = { vao, count: idx.length, parents, names };
    cache.set(key, m);
    return m;
  }

  private skin(def: MobDef, variant = 0): WebGLTexture {
    const key = def.id * 256 + variant;
    let t = this.skins.get(key);
    if (t) return t;
    const gl = this.gl;
    const src = this.texSource(def.id, variant) ?? placeholderTexture(def);
    t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.skins.set(key, t);
    return t;
  }

  /** Sustituye las texturas (cuando llega el arte definitivo). */
  setTextureSource(src: (id: number, variant?: number) => MobTexture | null): void {
    this.texSource = src;
    for (const t of this.skins.values()) this.gl.deleteTexture(t);
    this.skins.clear();
  }

  // ---------------------------------------------------------------- pose

  /** Rotaciones de animación por parte: [x, y, z] añadidas a la de reposo. */
  private animate(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
    out[0] = out[1] = out[2] = 0;
    if (netherAnimate(def, e, time, name, out)) return; // Fase 8.3 (criaturas del Nether)
    if (animateWither(def, e, time, name, out)) return; // Fase 8.7: el Wither y su calavera
    if (animateVehicle(def, e, time, name, out)) return; // Fase 7 (transporte): remos
    if (faunaAnimate(def, e, time, name, out)) return; // Fase 6 (fauna)
    if (animateGuardian(def, e, time, name, out)) return; // Fase 7.5 (océano)
    if (critterAnimate(def, e, time, name, out)) return; // Fase 7.5 (fauna): murciélago
    if (animateAllay(def, e, time, name, out)) return; // Fase 7.5 (mansión)
    const swing = Math.sin(e.walkPhase) * 1.1 * e.walkAmount;
    const headYaw = clampAngle(e.yaw - e.bodyYaw, 1.3);
    const acting = (e.flags & EF_ACTION) !== 0;
    switch (def.anim) {
      case 'quadruped':
      case 'creeper':
        if (name === 'leg0' || name === 'leg3') out[0] = swing;
        else if (name === 'leg1' || name === 'leg2') out[0] = -swing;
        else if (name === 'head') {
          out[1] = headYaw;
          out[0] = e.pitch;
        }
        break;
      case 'chicken':
        if (name === 'legR') out[0] = swing;
        else if (name === 'legL') out[0] = -swing;
        else if (name === 'wingR' || name === 'wingL') {
          const flap = e.walkAmount > 0.6 ? Math.abs(Math.sin(time * 18)) * 0.9 : Math.abs(Math.sin(time * 2 + e.seed * 7)) * 0.08;
          out[2] = name === 'wingR' ? flap : -flap;
        } else if (name === 'head') {
          out[1] = headYaw;
          out[0] = e.pitch;
        }
        break;
      case 'humanoid':
      case 'zombie':
      case 'skeleton':
      case 'enderman': {
        const amp = def.anim === 'enderman' ? 0.5 : 1;
        if (name === 'legR') out[0] = swing * amp;
        else if (name === 'legL') out[0] = -swing * amp;
        else if (name === 'armR' || name === 'armL') {
          const side = name === 'armR' ? 1 : -1;
          const sway = Math.sin(time * 1.3 + e.seed * 5) * 0.05;
          if (def.anim === 'zombie') out[0] = Math.PI / 2 + sway + swing * 0.1;
          else if (def.anim === 'skeleton' && (acting || (e.flags & EF_ANGRY))) {
            out[0] = Math.PI / 2 - 0.1;
            out[1] = side * (acting ? 0.35 : 0.1);
          } else if (def.anim === 'enderman' && (e.flags & EF_ANGRY)) out[0] = -swing * 0.4 + 0.3;
          else out[0] = -swing * side * 0.8 * amp;
          out[2] = side * (0.05 + Math.sin(time * 1.1 + e.seed * 3) * 0.03);
        } else if (name === 'head') {
          out[1] = headYaw;
          out[0] = e.pitch;
        }
        break;
      }
      case 'spider':
        if (name.startsWith('leg')) {
          const i = Number(name.slice(3));
          const ph = e.walkPhase * 1.4 + (i >> 1) * (Math.PI / 2) + (i & 1) * Math.PI;
          out[1] = Math.sin(ph) * 0.35 * e.walkAmount;
          out[2] = Math.abs(Math.cos(ph)) * 0.25 * e.walkAmount * (i & 1 ? 1 : -1);
        } else if (name === 'head') {
          out[1] = headYaw;
          out[0] = e.pitch * 0.5;
        }
        break;
      case 'villager':
        // Fase 6 (aldeanos): piernas al andar, brazos cruzados quietos (con un leve vaivén) y cabeza que mira.
        if (name === 'legR') out[0] = swing * 0.8;
        else if (name === 'legL') out[0] = -swing * 0.8;
        else if (name === 'arms') out[0] = Math.sin(time * 1.2 + e.seed * 5) * 0.03;
        else if (name === 'head') {
          out[1] = headYaw;
          out[0] = e.pitch;
          // Al quedarse quieto, a veces menea la cabeza.
          if (e.walkAmount < 0.1) out[2] = Math.sin(time * 0.7 + e.seed * 11) * 0.06;
        }
        break;
      case 'squid':
        if (name.startsWith('tent')) {
          const i = Number(name.slice(4));
          const a = (i / 8) * Math.PI * 2;
          const open = 0.25 + Math.sin(time * 2.2 + e.seed * 9) * 0.25;
          out[0] = Math.sin(a) * open;
          out[2] = -Math.cos(a) * open;
        }
        break;
      default:
        // Fase 6 (monstruos): slime, phantom y lepisma.
        animateMonster(def, e, time, name, out);
        // Fase 6 (acuáticos): peces, delfín, tortuga, ajolote, rana y renacuajo.
        animateAquatic(def, e, time, name, out);
        // Fase 6 (asaltos): illagers, vex, devastador y colmillos.
        animateIllager(def, e, time, name, out);
        animateWarden(def, e, time, name, out); // Fase 7.5 (abismo)
        animateShulker(def, e, time, name, out); // Fase 8.6
    }
    companionPart(def, e, time, name, out); // Fase 6 (gólems/domesticar)
    critterPart(def, e, name, out); // Fase 7.5 (fauna): el jinete esqueleto, sentado
  }

  private pose(def: MobDef, mesh: MobMesh, e: ClientEntity, time: number): void {
    const b = this.bones;
    const rot = [0, 0, 0];
    const mats: mat4[] = [];
    for (let i = 0; i < def.parts.length && i < MAX_BONES; i++) {
      const part = def.parts[i];
      const m = mat4.create();
      const parent = mesh.parents[i];
      if (parent >= 0) mat4.copy(m, mats[parent]);
      mat4.translate(m, m, [part.pivot[0] * P, part.pivot[1] * P, part.pivot[2] * P]);
      if (isNetherMob(def.id)) {
        netherPartOffset(def, e, time, part.name, this.off); // Fase 8.3
        mat4.translate(m, m, [this.off[0] * P, this.off[1] * P, this.off[2] * P]);
      } else if (shulkerPartOffset(def, e, time, part.name, this.off) || witherPartOffset(def, e, time, part.name, this.off)) {
        mat4.translate(m, m, [this.off[0] * P, this.off[1] * P, this.off[2] * P]); // Fase 8.6: la tapa del shulker; 8.7: la cola del Wither
      }
      this.animate(def, e, time, part.name, rot);
      mountPartAnim(def, e, time, part.name, rot); // Fase 6 (monturas)
      const rest = part.rot ?? [0, 0, 0];
      mat4.rotateY(m, m, rest[1] + rot[1]);
      mat4.rotateZ(m, m, -rest[2] + rot[2]);
      mat4.rotateX(m, m, rest[0] + rot[0]);
      // Oveja esquilada: la capa de lana no se dibuja. Crías: cabeza grande.
      const faunaScale = faunaPartScale(def, e, part.name) ?? guardianPartScale(def, e, part.name, time) ?? wardenPartScale(def, e, part.name, time); // Fase 6 (fauna): armadillo enroscado; 7.5: púas y corazón del warden
      if (faunaScale) mat4.scale(m, m, faunaScale);
      else if ((part.name === 'wool' && e.flags & EF_SHEARED) || hiddenAquaticPart(def, e, part.name) || hiddenPart(part.name, e.flags)) mat4.scale(m, m, HIDE);
      else if (hiddenMountPart(part.name, e)) mat4.scale(m, m, HIDE); // Fase 6 (monturas): sin silla
      else if (def.id === MOB_WITHER && part.name === 'skull') mat4.scale(m, m, HIDE); // Fase 8.7: la calavera, sólo en la textura
      else if (hiddenIllagerPart(part.name, e)) mat4.scale(m, m, HIDE); // Fase 6 (asaltos): estandarte
      else if (part.name === 'head' && e.flags & EF_BABY) mat4.scale(m, m, [1.45, 1.45, 1.45]);
      mats.push(m);
      b.set(m, i * 16);
    }
  }

  private rootMatrix(def: MobDef, e: ClientEntity, camX: number, camY: number, camZ: number, time = 0): mat4 {
    const m = this.model;
    mat4.identity(m);
    mat4.translate(m, m, [e.x - camX, e.y - camY, e.z - camZ]);
    mat4.rotateY(m, m, e.bodyYaw);
    shulkerRoot(def, e, m, time); // Fase 8.6: el shulker, hacia fuera de su cara
    vehicleRoot(def, e, m); // Fase 7 (transporte): balanceo e inclinación
    if (e.deathT >= 0) mat4.rotateZ(m, m, Math.min(1, e.deathT * 1.8) * (Math.PI / 2));
    mountRootPose(def, e, m); // Fase 6 (monturas): encabritada
    faunaRoot(def, e, m); // Fase 6 (fauna)
    critterRoot(def, e, m); // Fase 7.5 (fauna): murciélago colgado
    let s = def.scale * witherScale(def, e); // Fase 8.7: el Wither, más pequeño mientras nace
    if (e.flags & EF_BABY) s *= 0.5;
    if (def.id === MOB_CREEPER && e.actionT >= 0) {
      // El creeper se hincha mientras arde la mecha.
      const k = Math.min(1, e.actionT / 1.5);
      s *= 1 + 0.22 * k * k + Math.sin(e.actionT * 40) * 0.015 * k;
    }
    if (def.aquatic) {
      // El calamar se inclina hacia donde nada.
      mat4.translate(m, m, [0, 0.5, 0]);
      mat4.rotateX(m, m, Math.max(-1, Math.min(1, e.pitch)) * 0.8);
      mat4.translate(m, m, [0, -0.5, 0]);
    } else s *= aquaticRoot(def, e, m, time); // Fase 6 (acuáticos)
    illagerRoot(def, e, m, time); // Fase 6 (asaltos): colmillos que brotan, vex que flota
    wardenRoot(def, e, m, time); // Fase 7.5 (abismo): el warden sale del suelo o se hunde
    allayRoot(def, e, m, time); // Fase 7.5 (mansión): el alay flota y baila
    const k = monsterRoot(def, e, m); // Fase 6 (monstruos): picado del phantom, slime que se estira
    const nk = netherRoot(def, e, m, time); // Fase 8.3: tiritona y cubo de magma que se aplasta
    mat4.scale(m, m, [s * k[0] * nk[0], s * k[1] * nk[1], s * k[2] * nk[2]]);
    sitRoot(def, e.flags, m); // Fase 6 (gólems/domesticar)
    return m;
  }

  // ---------------------------------------------------------------- dibujo

  draw(
    list: ClientEntity[], camX: number, camY: number, camZ: number, time: number,
    lightAt: (e: ClientEntity) => [number, number], bindLighting: (p: Program) => Program,
  ): void {
    if (list.length === 0) return;
    const gl = this.gl;
    const p = bindLighting(this.prog.use());
    const bonesLoc = p.loc('uBones');
    for (const e of list) {
      // Fase 8.6: el dragón y los cristales, con su propio modelo.
      if (e.type === MOB_ENDER_DRAGON) {
        this.dragon.drawDragon(p, e, camX, camY, camZ, lightAt(e), e.hurtT < 0.35 && e.variant === 0);
        continue;
      }
      if (e.type === ENT_END_CRYSTAL) {
        this.dragon.drawCrystal(p, e, camX, camY, camZ, time);
        continue;
      }
      if (e.type === ENT_SHULKER_BULLET) {
        this.dragon.drawBullet(p, e, camX, camY, camZ, time);
        continue;
      }
      // Fase 8.7: la calavera del Wither (la cabeza con su textura; la azul, con la de invulnerable).
      const skull = e.type === ENT_WITHER_SKULL;
      if (skull) e.bodyYaw = e.yaw;
      const vehicle = MOBS[e.type] || skull ? undefined : vehicleModel(e); // Fase 7 (transporte): barcas y vagonetas
      const def = skull ? this.skullDef : MOBS[e.type] ?? vehicle?.def;
      if (!def) continue;
      const mesh = this.mesh(def);
      this.pose(def, mesh, e, time);
      const root = this.rootMatrix(def, e, camX, camY, camZ, time);
      const hurt = !vehicle && (e.hurtT < 0.35 || e.deathT >= 0);
      // Fase 8.3: el blaze y el cubo de magma brillan. Fase 8.7: el Wither también se ve de noche, pero con luz blanca
      // (la del cielo a tope) en vez del tono de las antorchas, que lo volvería marrón.
      const light: [number, number] = def.id === MOB_WITHER || def.id === -MOB_WITHER ? [1, Math.max(lightAt(e)[1], 0.35)] : def.fullBright ? [0, 1] : lightAt(e);
      let flash = 0;
      if (def.id === MOB_CREEPER && e.actionT >= 0) flash = (Math.sin(e.actionT * 14) * 0.5 + 0.5) * 0.7;
      const skinDef = skull ? MOBS[MOB_WITHER] : def;
      const skinVariant = skull ? e.variant ?? 0 : def.id === MOB_WITHER ? witherSkinVariant(e) // Fase 8.7
        : vehicle ? vehicleSkinVariant(e) : def.id === MOB_SHULKER ? 0 : e.variant || mobVariant(e) || netherVariant(e);
      p.tex2D('uSkin', this.skin(skinDef, skinVariant))
        .m4('uModel', root as Float32Array)
        .f2('uLightLevel', light[0], light[1])
        .f3('uTint', 1, hurt ? 0.45 : 1, hurt ? 0.45 : 1)
        .f1('uFlash', flash);
      gl.uniformMatrix4fv(bonesLoc, false, this.bones, 0, Math.min(MAX_BONES, def.parts.length) * 16);
      // Fase 7 (remate): de la criatura invisible sólo se ve lo que lleva encima (armadura, aura).
      if (!(e.flags & EF_INVISIBLE)) {
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      }
      // Fase 6.5 (colecciones): creeper cargado: franjas de energía azul (emisivas) que envuelven el cuerpo.
      if (((def.id === MOB_CREEPER && e.flags & EF_CHARGED) || (def.id === MOB_WITHER && witherPowered(e))) && e.deathT < 0) {
        // Fase 8.7: y el Wither blindado (WitherArmorLayer: la misma energía, algo más ceñida).
        const aura = this.mesh(def, def.id === MOB_WITHER ? 0.5 : 1.2);
        p.tex2D('uSkin', this.auraSkin(def, Math.floor(time * 10) % AURA_FRAMES)).f2('uLightLevel', 1, 1).f3('uTint', 1, 1, 1).f1('uFlash', 0);
        gl.bindVertexArray(aura.vao);
        gl.drawElements(gl.TRIANGLES, aura.count, gl.UNSIGNED_SHORT, 0);
      }
      // Fase 6.5 (equipo): la armadura del caballo o del lobo, encima y con la misma pose.
      const gear = e.gear ? this.gearSkin(def, e.gear, e.gearDye) : null;
      if (gear) {
        const gm = this.mesh(def, GEAR_INFLATE);
        p.tex2D('uSkin', gear);
        gl.bindVertexArray(gm.vao);
        gl.drawElements(gl.TRIANGLES, gm.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    gl.bindVertexArray(null);
  }

  /**
   * Fase 7 (efectos): siluetas de las criaturas que brillan con el programa `p` (sólo la forma: la piel
   * decide qué píxeles son transparentes). Para el contorno del efecto Brillo.
   */
  drawSilhouettes(list: ClientEntity[], camX: number, camY: number, camZ: number, time: number, p: Program): void {
    const gl = this.gl;
    const bonesLoc = p.loc('uBones');
    for (const e of list) {
      const def = MOBS[e.type];
      if (!def) continue;
      const mesh = this.mesh(def);
      this.pose(def, mesh, e, time);
      const root = this.rootMatrix(def, e, camX, camY, camZ, time);
      p.tex2D('uSkin', this.skin(def, def.id === MOB_SHULKER ? 0 : e.variant || mobVariant(e))).m4('uModel', root as Float32Array);
      gl.uniformMatrix4fv(bonesLoc, false, this.bones, 0, Math.min(MAX_BONES, def.parts.length) * 16);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }

  /** Fase 6.5 (colecciones): un fotograma de la textura del aura (del tamaño del atlas de la especie). */
  private auraSkin(def: MobDef, frame: number): WebGLTexture {
    const key = `${def.atlas[0]}x${def.atlas[1]}:${frame}`; // (cada tamaño de atlas, el suyo)
    let t = this.auraSkins.get(key);
    if (t) return t;
    const gl = this.gl;
    const src = chargedAuraTexture(def.atlas[0], def.atlas[1], frame);
    t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.auraSkins.set(key, t);
    return t;
  }

  /** Fase 6.5 (equipo): textura de la armadura `gear` de una criatura (null si no le va). */
  private gearSkin(def: MobDef, gear: number, dye?: number): WebGLTexture | null {
    const key = `${def.id}:${gear}:${dye ?? -1}`;
    if (this.gearSkins.has(key)) return this.gearSkins.get(key)!;
    const src = gearTexture(def, gear, dye);
    let t: WebGLTexture | null = null;
    if (src) {
      const gl = this.gl;
      t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.gearSkins.set(key, t);
    return t;
  }

  drawShadow(list: ClientEntity[], camX: number, camY: number, camZ: number, time: number): void {
    if (list.length === 0) return;
    const gl = this.gl;
    const p = this.shadowProg.use();
    const bonesLoc = p.loc('uBones');
    for (const e of list) {
      if (e.type === MOB_ENDER_DRAGON) {
        this.dragon.drawDragonShadow(p, e, camX, camY, camZ); // Fase 8.6
        continue;
      }
      const def = MOBS[e.type] ?? vehicleModel(e)?.def; // Fase 7 (transporte)
      if (!def || e.flags & EF_INVISIBLE) continue; // Fase 7 (remate): la invisible no hace sombra
      const mesh = this.mesh(def);
      this.pose(def, mesh, e, time);
      const root = this.rootMatrix(def, e, camX, camY, camZ, time);
      p.tex2D('uSkin', this.skin(def, def.id === MOB_SHULKER ? 0 : MOBS[e.type] ? e.variant : vehicleSkinVariant(e))).m4('uModel', root as Float32Array);
      gl.uniformMatrix4fv(bonesLoc, false, this.bones, 0, Math.min(MAX_BONES, def.parts.length) * 16);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }

  /**
   * Fase 7 (transporte): tapas invisibles de las barcas (sólo profundidad) para que el agua no se vea
   * dentro del casco. Se dibujan después de todo lo que puede ir dentro (jugadores, criaturas) y antes
   * del agua.
   */
  drawVehicleMasks(list: ClientEntity[], camX: number, camY: number, camZ: number, time: number, bindLighting: (p: Program) => Program): void {
    const gl = this.gl;
    let p: Program | null = null;
    for (const e of list) {
      const vm = MOBS[e.type] ? undefined : vehicleModel(e);
      if (!vm?.mask) continue;
      if (!p) {
        p = bindLighting(this.prog.use());
        gl.colorMask(false, false, false, false);
        gl.disable(gl.CULL_FACE);
      }
      const mesh = this.mesh(vm.mask);
      const root = this.rootMatrix(vm.def, e, camX, camY, camZ, time);
      this.bones.set(mat4.create() as Float32Array, 0);
      p.tex2D('uSkin', this.skin(vm.def, vehicleSkinVariant(e))).m4('uModel', root as Float32Array);
      gl.uniformMatrix4fv(p.loc('uBones'), false, this.bones, 0, 16);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    if (p) {
      gl.colorMask(true, true, true, true);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(null);
    }
  }

  /**
   * Fase 8.3: matriz de la mano derecha (o izquierda) de un piglin, piglin bruto, piglin zombificado o esqueleto
   * wither (ItemInHandLayer: en la punta del brazo, un píxel hacia fuera), para dibujar lo que lleva.
   */
  netherHandMatrix(e: ClientEntity, camX: number, camY: number, camZ: number, time: number, left: boolean): mat4 | null {
    const def = MOBS[e.type];
    if (!def || (def.id !== MOB_PIGLIN && def.id !== MOB_PIGLIN_BRUTE && def.id !== MOB_ZOMBIFIED_PIGLIN && def.id !== MOB_WITHER_SKELETON)) return null;
    const mesh = this.mesh(def);
    this.pose(def, mesh, e, time);
    const i = mesh.names.indexOf(left ? 'armL' : 'armR');
    if (i < 0) return null;
    const root = mat4.clone(this.rootMatrix(def, e, camX, camY, camZ, time));
    const bone = mat4.clone(this.bones.subarray(i * 16, i * 16 + 16) as unknown as mat4);
    const out = mat4.create();
    mat4.multiply(out, root, bone);
    const thin = def.id === MOB_WITHER_SKELETON;
    mat4.translate(out, out, [(left ? -1 : 1) * (thin ? 0 : 1) * P, -9 * P, -1 * P]);
    return out;
  }

  /** Matriz (relativa a la cámara) de la mano derecha de un esqueleto, para dibujar su arco. */
  handMatrix(e: ClientEntity, camX: number, camY: number, camZ: number, time: number): mat4 | null {
    const def = MOBS[e.type];
    // (Fase 6.5, equipo: también el ahogado que lleva un tridente o una concha.)
    // (Fase 7.5, mansión: y el alay, que lleva su objeto delante del cuerpo.)
    const allay = def?.id === MOB_ALLAY && !!e.gear;
    if (!def || (def.id !== MOB_SKELETON && def.id !== MOB_STRAY && !(def.id === MOB_DROWNED && e.gear) && !allay)) return null;
    const mesh = this.mesh(def);
    this.pose(def, mesh, e, time);
    const i = mesh.names.indexOf(allay ? 'body' : 'armR');
    if (i < 0) return null;
    const root = mat4.clone(this.rootMatrix(def, e, camX, camY, camZ, time));
    const bone = mat4.clone(this.bones.subarray(i * 16, i * 16 + 16) as unknown as mat4);
    const out = mat4.create();
    mat4.multiply(out, root, bone);
    if (allay) mat4.translate(out, out, [ALLAY_HOLD[0] * P, ALLAY_HOLD[1] * P, ALLAY_HOLD[2] * P]);
    else mat4.translate(out, out, [0, -9 * P, -1 * P]);
    return out;
  }
}

function clampAngle(a: number, lim: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-lim, Math.min(lim, d));
}

/** Textura provisional (colores planos por especie) hasta que llegue el arte definitivo. */
export function placeholderTexture(def: MobDef): MobTexture {
  const [w, h] = def.atlas;
  const rgba = new Uint8Array(w * h * 4);
  const colors: Record<string, [number, number, number]> = {
    pig: [240, 160, 160], cow: [80, 60, 45], sheep: [230, 230, 230], chicken: [245, 245, 245], zombie: [80, 140, 80],
    husk: [170, 150, 100], skeleton: [200, 200, 200], stray: [170, 190, 190], creeper: [80, 170, 70], spider: [60, 50, 45],
    enderman: [25, 20, 30], squid: [60, 80, 120],
  };
  const c = colors[def.key] ?? [200, 0, 200];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const n = ((x * 7 + y * 13) % 5) * 6 - 12;
      rgba[o] = Math.max(0, Math.min(255, c[0] + n));
      rgba[o + 1] = Math.max(0, Math.min(255, c[1] + n));
      rgba[o + 2] = Math.max(0, Math.min(255, c[2] + n));
      rgba[o + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}
