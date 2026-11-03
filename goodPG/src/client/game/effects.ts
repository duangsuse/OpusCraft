// Efectos que llegan del servidor (sonidos y partículas) y sonidos de ambiente de las criaturas y
// los fluidos cercanos.
import { PROFESSIONS } from '../../shared/villagers'; // el trabajo de cada oficio
import { BLOCKS } from '../../shared/blocks';
import type { MobSoundKind, MobSoundEvent } from '../audio/types';
import type { ClientEntity } from './ClientEntities';
import { BLOCK_FLUID, BLOCK_FLUID_LEVEL, GRASS, CAMPFIRE, SOUL_CAMPFIRE, isLitFurnace, isValidBlockId } from '../../shared/blocks';
import { MOBS } from '../../shared/mobs';
import { EF_LOVE, EF_BABY, EF_FIRE } from '../../shared/protocol';
import type { Game } from './Game';
import { aquaticFx } from './aquaticFx'; // Fase 6 (acuáticos)
import { illagerFx } from './illagerFx'; // Fase 6 (asaltos)
import { faunaFx } from './faunaEffects'; // Fase 6 (fauna)
import { copperFx } from './copperInteraction'; // Fase 6.5 (cobre)
import { collectionFx } from './collectionInteraction'; // Fase 6.5 (colecciones)
import { transportFx } from './vehicleFx'; // Fase 7 (transporte)
import { equipmentFx } from './equipmentFx'; // Fase 6.5 (equipo)
import { redstoneFx } from './redstoneClient'; // Fase 7 (redstone)
import { potionFx } from './potionClient'; // Fase 7 (pociones)
import { enchantFx } from './enchantFx'; // Fase 7 (encantamientos)
import { mechanismFx } from './mechanismsClient'; // Fase 7 (mecanismos)
import { oceanFx } from './oceanFx'; // Fase 7.5 (océano)
import { deepDarkFx, deepDarkTick } from './deepDarkFx'; // Fase 7.5 (abismo)
import { critterFx } from './critterFx'; // Fase 7.5 (fauna)
import { allayFx } from './allayFx'; // Fase 7.5 (mansión)
import { netherFx, netherTick, serverVoiced, netherSteps } from './netherMobFx'; // Fase 8.3 (criaturas del Nether)
import { endFx, endTick } from './endMobFx'; // Fase 8.6 (el End)
import { witherFx, witherTick } from './witherFx'; // Fase 8.7

export class Effects {
  constructor(private g: Game) {}

  idleSounds = new Map<number, number>();
  stepSounds = new Map<number, number>();
  fluidTimer = 0;
  heartT = 0;

  onFx(kind: string, p: [number, number, number], a?: number, b?: number): void {
    if (!Array.isArray(p) || !p.every(Number.isFinite)) return;
    void b;
    const mob = a !== undefined ? MOBS[a] : undefined;
    const mk = (mob?.sound ?? mob?.key) as MobSoundKind | undefined; // Fase 6 (monstruos): voz prestada (MobDef.sound)
    const fx = this.g.renderer.entities;
    switch (kind) {
      case 'lightning': {
        // Rayo: se ve de lejos; el trueno llega con retraso y el destello depende de la distancia.
        const pl = this.g.player;
        const d = Math.hypot(p[0] - pl.x, p[2] - pl.z);
        if (d > 300) break;
        this.g.bolts.push({ x: p[0], y: p[1], z: p[2], age: 0, seed: (Math.random() * 2 ** 31) | 0 });
        // Bajo tierra o en una casa sin ventanas no se ve el destello y el trueno llega apagado y grave.
        const sky = this.g.camera.eyeSky;
        this.g.flash = Math.max(this.g.flash, Math.max(0.15, 1 - d / 200));
        this.g.audio.playThunder(d, sky);
        if (d < 24) this.g.shake = Math.max(this.g.shake, 0.5 * (1 - d / 24) * (0.3 + 0.7 * sky));
        break;
      }
      // Fase 6.5 (decoración): campana, cuadros y marcos.
      case 'bell':
      case 'hang_place':
      case 'hang_break':
      case 'frame_add':
      case 'frame_remove':
      case 'frame_rotate':
      case 'shelf_put': // Fase 6.5 (remate)
      case 'name_tag':
      case 'leash':
      case 'leash_break':
      case 'stand_place':
      case 'cauldron_fill': // Fase 6.5 (calderos)
      case 'cauldron_empty':
      case 'cauldron_wash':
      case 'stand_equip':
      case 'stand_break':
      case 'shelf_take':
        this.g.audio.playDecorSfx(kind, p);
        break;
      case 'snowball_break':
        fx.pfx.splash(p[0], p[1], p[2], 8);
        fx.spawnSmoke(p[0], p[1], p[2], 4, 0.15, 0.95, 0.2, 0.3);
        this.g.audio.playBlockHit('snow', p);
        break;
      case 'mob_hurt':
        if (mk) this.g.audio.playMob(mk, 'hurt', p);
        break;
      case 'mob_death':
        if (mk) this.g.audio.playMob(mk, 'death', p);
        fx.spawnSmoke(p[0], p[1], p[2], 14, 0.45, 0.85, 0.3, 0.8);
        break;
      case 'mob_attack':
        if (mk) this.g.audio.playMob(mk, 'attack', p);
        break;
      case 'mob_shoot':
        if (mk) this.g.audio.playMob(mk, 'shoot', p);
        break;
      case 'creeper_fuse':
        this.g.audio.playMob('creeper', 'fuse', p);
        break;
      case 'teleport':
        this.g.audio.playMob('enderman', 'teleport', p);
        fx.spawnSmoke(p[0], p[1], p[2], 16, 0.6, 0.15, 0.18, 0.4);
        break;
      case 'enderman_scream':
        this.g.audio.playMob('enderman', 'attack', p);
        break;
      case 'arrow_hit':
        this.g.audio.playArrowHit(p);
        break;
      case 'bow':
        this.g.audio.playBowShoot(p, a ?? 1);
        break;
      case 'explode': {
        const power = a ?? 3;
        this.g.audio.playExplosion(p, power);
        fx.pfx.explosion(p[0], p[1], p[2], power);
        const d = Math.hypot(p[0] - this.g.player.x, p[1] - this.g.player.y, p[2] - this.g.player.z);
        this.g.shake = Math.max(this.g.shake, Math.max(0, 1 - d / 24));
        break;
      }
      case 'spawner':
        // Criatura recién salida de un generador: humo oscuro.
        fx.spawnSmoke(p[0], p[1], p[2], 14, 0.45, 0.2, 0.6, 1.2);
        break;
      case 'burn_item':
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.2, 0.25, 0.2, 1);
        break;
      case 'leaves':
        if (a !== undefined && isValidBlockId(a)) fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), a, 0xf0);
        break;
      // Fase 6 (aldeanos): oficio nuevo, subida de nivel, trato hecho o «no».
      case 'villager_job':
      case 'villager_levelup':
        fx.spawnSparkles(p[0], p[1], p[2], kind === 'villager_levelup' ? 24 : 12, 0.5);
        this.g.audio.playMob('villager', 'idle', p);
        break;
      case 'villager_work': {
        // WorkAtPoi (playWorkSound): el aldeano trabaja en su bloque; suena ese bloque (a = el oficio).
        const block = PROFESSIONS[a ?? 0]?.block;
        const sound = block ? BLOCKS[block]?.sound : undefined;
        if (sound) this.g.audio.playPlace(sound, p);
        break;
      }
      case 'villager_yes':
        fx.spawnSparkles(p[0], p[1], p[2], 4, 0.3);
        this.g.audio.playMob('villager', 'attack', p);
        break;
      case 'villager_no':
        this.g.audio.playMob('villager', 'fuse', p);
        fx.pfx.angry(p[0], p[1] + 0.3, p[2]);
        break;
      case 'feed':
        this.g.audio.playEat();
        fx.spawnHearts(p[0], p[1], p[2], 3, 0.3);
        break;
      case 'breed':
        fx.spawnHearts(p[0], p[1], p[2], 9, 0.6);
        this.g.audio.playPickup();
        break;
      case 'shear':
        this.g.audio.playBreak('wool', p);
        break;
      // Fase 6 (gólems/domesticar)
      case 'tame':
        fx.spawnHearts(p[0], p[1], p[2], 7, 0.5);
        this.g.audio.playPickup();
        break;
      case 'tame_fail':
        fx.spawnSmoke(p[0], p[1], p[2], 7, 0.3, 0.55, 0.3, 0.8);
        break;
      case 'golem_build':
        fx.spawnSmoke(p[0], p[1], p[2], 24, 0.9, 0.85, 0.5, 1.2);
        this.g.audio.playPlace(a === undefined || MOBS[a]?.key !== 'snow_golem' ? 'metal' : 'snow', p);
        break;
      case 'golem_repair':
        this.g.audio.playPlace('metal', p);
        fx.spawnSparkles(p[0], p[1], p[2], 8, 0.6);
        break;
      case 'milk':
        this.g.audio.playSplash(p, 0.25);
        break;
      case 'egg':
        this.g.audio.playPickup();
        break;
      case 'eat_grass':
        this.g.audio.playBreak('grass', p);
        fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1] - 1), Math.floor(p[2]), GRASS, 0xf0);
        break;
      case 'bonemeal':
        this.g.audio.playPlace('grass', p);
        fx.spawnSparkles(p[0], p[1], p[2], 12, 0.5);
        break;
      case 'campfire_put':
        this.g.audio.playPlace('wood', p);
        break;
      case 'chorus_grow': // Fase 8.6: la flor de coro crece
        this.g.audio.playPlace('wood', p);
        fx.spawnSparkles(p[0], p[1], p[2], 4, 0.4);
        break;
      case 'campfire_done':
        this.g.audio.playPickup();
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.2, 0.7, 0.4, 1.2);
        break;
      // Huevos y pesca.
      case 'throw':
        this.g.audio.playBowShoot(p, 0.15);
        break;
      case 'egg_break':
        this.g.audio.playBlockHit('sand', p);
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.15, 0.95, 0.35, 0.6);
        break;
      case 'rod_cast':
        this.g.audio.playBowShoot(p, 0.3);
        break;
      case 'fish_splash':
        this.g.audio.playSplash(p, 0.3);
        fx.spawnSmoke(p[0], p[1], p[2], 5, 0.2, 0.9, 0.3, 0.8);
        break;
      case 'fish_bite':
        this.g.audio.playSplash(p, 0.7);
        fx.spawnSmoke(p[0], p[1], p[2], 10, 0.3, 0.92, 0.35, 1.4);
        break;
      case 'fish_catch':
        this.g.audio.playSplash(p, 0.5);
        this.g.audio.playPickup();
        break;
      // Compostador.
      case 'compost':
        this.g.audio.playPlace('grass', p);
        if (a) fx.spawnSparkles(p[0], p[1], p[2], 6, 0.3);
        break;
      case 'compost_ready':
        this.g.audio.playPlace('gravel', p);
        fx.spawnSparkles(p[0], p[1], p[2], 10, 0.4);
        break;
      case 'compost_empty':
        this.g.audio.playBreak('grass', p);
        break;
      // Fase 6 (monturas)
      case 'saddle':
        this.g.audio.playBreak('wool', p);
        break;
      case 'tame':
        fx.spawnHearts(p[0], p[1], p[2], 7, 0.5);
        this.g.audio.playPickup();
        break;
      case 'mount_angry':
        fx.spawnSmoke(p[0], p[1], p[2], 8, 0.4, 0.3, 0.35, 0.6);
        break;
      case 'llama_spit': {
        // Escupitajo: una ráfaga de gotas claras desde la boca hacia el objetivo (a = rumbo, b = distancia).
        const yaw = a ?? 0, dist = Math.min(16, Math.max(1, b ?? 4));
        for (let d = 0.5; d < dist; d += 0.6) fx.spawnSmoke(p[0] - Math.sin(yaw) * d, p[1] - d * 0.06, p[2] - Math.cos(yaw) * d, 1, 0.05, 0.92, 0.12, 0.1);
        this.g.audio.playSplash(p, 0.15);
        break;
      }
      // Fase 6 (monstruos). Fase 7 (pociones): la poción que se rompe y la bruja que bebe, en potionFx.
      case 'mob_convert':
        // Un zombi ahogado se convierte en ahogado.
        this.g.audio.playSplash(p, 0.5);
        fx.spawnSmoke(p[0], p[1], p[2], 16, 0.6, 0.6, 0.4, 0.8);
        if (mk) this.g.audio.playMob(mk, 'hurt', p);
        break;
      case 'slime_jump':
        if (mk && Math.random() < 0.5) this.g.audio.playMob(mk, 'step', p);
        break;
      default:
        if (netherFx(this.g, kind, p, a, b)) break; // Fase 8.3 (criaturas del Nether)
        if (endFx(this.g, kind, p, a, b)) break; // Fase 8.6 (el End)
        if (witherFx(this.g, kind, p, a)) break; // Fase 8.7 (el Wither)
        if (enchantFx(this.g, kind, p, a)) break; // Fase 7 (encantamientos)
        if (oceanFx(this.g, kind, p, a)) break; // Fase 7.5 (océano)
        if (deepDarkFx(this.g, kind, p, a, b)) break; // Fase 7.5 (abismo)
        // Fase 6 (acuáticos, fauna)
        // Fase 6.5 (equipo): mechero, fuego, ballesta, tridente, cuerno, cohetes, armaduras de animales y conducto.
        if (!potionFx(this.g, kind, p, a, b) && !transportFx(this.g, kind, p, a) && !aquaticFx(this.g, kind, p) && !illagerFx(this.g, kind, p, a) && !copperFx(this.g, kind, p) && !collectionFx(this.g, kind, p, a, b) && !equipmentFx(this.g, kind, p, a, b) && !redstoneFx(this.g, kind, p, a, b) && !mechanismFx(this.g, kind, p, a, b) && !critterFx(this.g, kind, p) && !allayFx(this.g, kind, p)) faunaFx(this.g, kind, p, a); // Fase 6 (asaltos), 6.5 (cobre, colecciones); 7.5 (fauna, mansión)
    }
  }


  /** Voces ocasionales y pasos de las criaturas cercanas (y llamas de las que arden). */
  mobSounds(dt: number): void {
    deepDarkTick(this.g, dt); // Fase 7.5 (abismo): latido de los wardens y ambiente del Deep Dark
    netherTick(this.g, dt); // Fase 8.3: humo del blaze, estela de las bolas de fuego, cubos de magma que caen
    endTick(this.g, dt); // Fase 8.6: partículas de portal de enderman y endermitas, estela del ojo de ender
    witherTick(this.g, dt); // Fase 8.7: el humo de las cabezas del Wither
    const p = this.g.player;
    const now = performance.now() / 1000;
    this.heartT -= dt;
    const hearts = this.heartT <= 0;
    if (hearts) this.heartT = 0.7;
    for (const e of this.g.ents.list.values()) {
      const def = MOBS[e.type];
      if (!def || e.deathT >= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
      // Animales enamorados: corazones de vez en cuando.
      if (hearts && e.flags & EF_LOVE && d < 32) {
        this.g.renderer.entities.spawnHearts(e.x, e.y + def.height * (e.flags & EF_BABY ? 0.5 : 1) + 0.2, e.z, 1, 0.3);
      }
      if ((e.flags & EF_FIRE) && d < 48 && Math.random() < dt * 14) {
        const hw = def.width / 2;
        this.g.renderer.entities.spawnFlame(
          e.x + (Math.random() - 0.5) * hw * 2, e.y + Math.random() * def.height, e.z + (Math.random() - 0.5) * hw * 2,
        );
      }
      if (d > 24) continue;
      const kind = (def.sound ?? def.key) as MobSoundKind;
      // Fase 8.3: las voces de las criaturas del Nether las decide el servidor (según lo que hacen); aquí sólo los pasos.
      const voiced = serverVoiced(e.type);
      if (voiced && !netherSteps(e.type)) continue;
      const next = this.idleSounds.get(e.id);
      if (voiced) {
        // sin voz de reposo del cliente
      } else if (next === undefined) this.idleSounds.set(e.id, now + 2 + Math.random() * 8);
      else if (now >= next) {
        this.idleSounds.set(e.id, now + 5 + Math.random() * 9);
        this.playMob(kind, 'idle', e);
      }
      if (d < 12 && e.walkAmount > 0.3) {
        const phase = Math.floor(e.walkPhase / Math.PI);
        if (this.stepSounds.get(e.id) !== phase) {
          this.stepSounds.set(e.id, phase);
          this.playMob(kind, 'step', e);
        }
      }
    }
    if (this.idleSounds.size > 200) {
      for (const id of this.idleSounds.keys()) if (!this.g.ents.list.has(id)) {
        this.idleSounds.delete(id);
        this.stepSounds.delete(id);
      }
    }
  }

  playMob(kind: MobSoundKind, ev: MobSoundEvent, e: ClientEntity): void {
    this.g.audio.playMob(kind, ev, [e.x, e.y + 1, e.z]);
  }

  /** Cercanía de agua que fluye y de lava (para su sonido ambiente), hornos y fogatas encendidos. */
  updateFluidSound(): void {
    const world = this.g.world!;
    const p = this.g.player;
    let water = 0, lava = 0;
    let furnace: [number, number, number] | null = null;
    const fires: [number, number, number][] = [];
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          const b = world.getBlock(cx + dx, cy + dy, cz + dz);
          if (b <= 0) continue;
          if (isLitFurnace(b)) furnace = [cx + dx + 0.5, cy + dy + 0.5, cz + dz + 0.5];
          else if ((b === CAMPFIRE + 1 || b === SOUL_CAMPFIRE + 1) && fires.length < 6) fires.push([cx + dx + 0.5, cy + dy, cz + dz + 0.5]);
          const f = BLOCK_FLUID[b];
          if (!f || ((dx | dz) & 1)) continue;
          const w = 1 / (1 + Math.hypot(dx, dy, dz) * 0.5);
          if (f === 2) lava += w;
          else if (BLOCK_FLUID_LEVEL[b] !== 0) water += w;
        }
      }
    }
    this.g.audio.setFluidProximity(Math.min(1, water / 4), Math.min(1, lava / 3));
    // Chisporroteo de un horno encendido cercano.
    if (furnace && Math.random() < 0.35) this.g.audio.playFurnace(furnace);
    // Fogatas: chisporroteo (el humo lo ponen las partículas del ambiente).
    for (const [x, y, z] of fires) {
      if (Math.random() < 0.3) this.g.audio.playFurnace([x, y + 0.5, z]);
    }
  }
}
