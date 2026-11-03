// Vida acuática (fase 6): nado genérico (rumbo dentro del agua, sin salirse por arriba ni por los
// lados), bancos de peces, peces que boquean y se ahogan fuera del agua, pez globo que se hincha y
// envenena, delfines que respiran en la superficie y siguen a los jugadores, tortugas que vuelven a
// su playa a poner huevos, ajolotes que cazan peces, ranas que saltan, renacuajos que crecen a rana,
// cubos con criatura y la aparición de todas ellas según el bioma.
import { MOB_SLIME_SMALL } from '../../mobs'; // lo que caza la rana
import { MOB_MAGMA_CUBE_SMALL } from '../../netherMobs';
import {
  MOBS, MOB_SQUID, MOB_COD, MOB_SALMON, MOB_TROPICAL_FISH, MOB_PUFFERFISH, MOB_DOLPHIN, MOB_TURTLE, MOB_AXOLOTL, MOB_FROG,
  MOB_TADPOLE, MOB_GLOW_SQUID, MOB_BUCKETS, mobInBucket, isFish, isWaterAmbient,
} from '../../mobs';
import { WATER_BUCKET } from '../../items';
import { AIR, SAND, RED_SAND, GRASS, DIRT, CLAY, ICE, PACKED_ICE, BLOCK_FLUID, BLOCK_SOLID, BLOCK_REPLACEABLE, turtleEggBlock, isTurtleEgg } from '../../blocks';
import {
  BIOME_OCEAN, BIOME_FROZEN_OCEAN, BIOME_BEACH, BIOME_SWAMP, BIOME_WARM_OCEAN, BIOME_COLD_OCEAN, BIOME_DEEP_OCEAN, isOceanBiome, baseBiome,
} from '../../world/biomeIds';
import { EF_ACTION, EF_ANGRY } from '../../protocol';
import { EFFECT_POISON } from '../../effects';
import { EFFECT_DOLPHINS_GRACE, DOLPHIN_GRACE_RANGE, DOLPHIN_GRACE_SECONDS } from '../../effects'; // Fase 7 (efectos)
import { MIN_Y } from '../../constants';
import { moveBody, lineOfSight } from '../physics';
import { GRAVITY, GROW_SECONDS, TAU, lerpAngle, type PlayerView, type InteractResult, type Entity } from './types';
import type { Entities } from './Entities';

/** Segundos que aguanta cada criatura fuera del agua antes de empezar a ahogarse (o a secarse). */
const AIR_OUT: Record<number, number> = {
  [MOB_COD]: 15, [MOB_SALMON]: 15, [MOB_TROPICAL_FISH]: 15, [MOB_PUFFERFISH]: 15, [MOB_TADPOLE]: 15,
  [MOB_DOLPHIN]: 120, [MOB_AXOLOTL]: 300,
};
/** Segundos que aguanta un delfín bajo el agua sin salir a respirar. */
const DOLPHIN_BREATH = 90;
/** Tortugas: segundos entre puestas de huevos (y tiempo máximo para llegar a su playa). */
const TURTLE_LAY_MIN = 900, TURTLE_LAY_RAND = 900, TURTLE_TRIP = 180;
/** Ajolotes: descanso tras cazar. */
const AXOLOTL_REST = 20;

interface AquaState {
  /** Rana: el cubo que caza, cuánto lleva cazándolo y cuánto lleva la lengua fuera (s). */
  frogPrey?: number;
  huntTime?: number;
  tongue?: number;
  /** Segundos que le quedan fuera del agua antes de ahogarse o secarse. */
  air: number;
  /** Delfín: aire bajo el agua. */
  breath: number;
  /** Acumulador del daño por asfixia (1 por segundo). */
  choke: number;
  /** Pez globo: segundos que seguirá hinchado; espera entre picotazos. */
  puff: number;
  sting: number;
  /** Renacuajo: segundos para ser rana. */
  grow: number;
  /** Rana: espera hasta el siguiente salto. */
  hop: number;
  /** Tortuga: su playa, tiempo para la próxima puesta y tiempo que lleva de viaje. */
  home: [number, number, number] | null;
  lay: number;
  trip: number;
  /** Ajolote: presa actual y descanso tras cazar. */
  prey: number;
  rest: number;
  /** Delfín: espera entre saltos fuera del agua. */
  leap: number;
  /** Salió de un cubo: no desaparece al alejarse los jugadores. */
  fromBucket: boolean;
  /** Fuera del agua este tick (boqueando). */
  flop: boolean;
}

/** Tamaño de grupo [mín, máx] al aparecer. */
const GROUP: Record<number, [number, number]> = {
  [MOB_COD]: [3, 6], [MOB_SALMON]: [2, 5], [MOB_TROPICAL_FISH]: [3, 7], [MOB_PUFFERFISH]: [1, 3], [MOB_DOLPHIN]: [1, 2],
  [MOB_TURTLE]: [2, 4], [MOB_AXOLOTL]: [1, 3], [MOB_FROG]: [2, 4], [MOB_TADPOLE]: [2, 5], [MOB_GLOW_SQUID]: [1, 2],
};

/** Límite de cada grupo de criaturas cerca de un jugador (radio 64). */
const CAPS: [(t: number) => boolean, number][] = [
  [isFish, 12],
  [(t) => t === MOB_DOLPHIN, 3],
  [(t) => t === MOB_TURTLE, 6],
  [(t) => t === MOB_FROG, 6],
  [(t) => t === MOB_TADPOLE, 6],
  [(t) => t === MOB_AXOLOTL, 5],
  [(t) => t === MOB_GLOW_SQUID, 3],
];

const SWIMMERS = new Set([MOB_COD, MOB_SALMON, MOB_TROPICAL_FISH, MOB_PUFFERFISH, MOB_DOLPHIN, MOB_TURTLE, MOB_AXOLOTL, MOB_FROG, MOB_TADPOLE]);

const isWaterId = (id: number): boolean => id > 0 && BLOCK_FLUID[id] === 1;

export class AquaticLife {
  private state = new WeakMap<Entity, AquaState>();
  private spawnTimer = 3;
  /** Hueco que dejó el último room(): el grupo no pasa del límite. */
  private roomLeft = Infinity;

  constructor(private m: Entities) {}

  /** ¿Lleva esta criatura su propio nado (en vez del cerebro general)? */
  handles(type: number): boolean {
    return SWIMMERS.has(type);
  }

  /** ¿Desaparece lejos de los jugadores? (calamares, peces, delfines, ajolotes, renacuajos). */
  despawns(e: Entity): boolean {
    if (e.type === MOB_SQUID) return true;
    return isWaterAmbient(e.type) && !this.stateOf(e).fromBucket;
  }

  stateOf(e: Entity): AquaState {
    let s = this.state.get(e);
    if (!s) {
      s = {
        air: AIR_OUT[e.type] ?? 0, breath: DOLPHIN_BREATH, choke: 0, puff: 0, sting: 0, grow: GROW_SECONDS, hop: 1,
        home: null, lay: TURTLE_LAY_MIN + this.m.rand() * TURTLE_LAY_RAND, trip: 0, prey: 0, rest: 0, leap: 3,
        fromBucket: false, flop: false,
      };
      this.state.set(e, s);
    }
    return s;
  }

  /** Playa de una tortuga (donde nació): allí vuelve a poner sus huevos. */
  setHome(e: Entity, x: number, y: number, z: number): void {
    this.stateOf(e).home = [x, y, z];
  }

  // ------------------------------------------------------------------ comportamiento

  /** Un tick de una criatura acuática (ya aplicados el fuego, la lava y el crecimiento). */
  tick(e: Entity, dt: number, players: PlayerView[]): void {
    const st = this.stateOf(e);
    st.flop = false;
    if (!this.breathe(e, st, dt)) return;
    if (st.sting > 0) st.sting -= dt;
    if (st.rest > 0) st.rest -= dt;
    switch (e.type) {
      case MOB_DOLPHIN:
        this.dolphin(e, st, dt, players);
        break;
      case MOB_TURTLE:
        this.turtle(e, st, dt);
        break;
      case MOB_AXOLOTL:
        this.axolotl(e, st, dt);
        break;
      case MOB_FROG:
        this.frog(e, st, dt);
        break;
      default:
        if (e.type === MOB_TADPOLE) {
          st.grow -= dt;
          if (st.grow <= 0) {
            this.growUp(e);
            return;
          }
        }
        if (e.type === MOB_PUFFERFISH) this.puffer(e, st, dt, players);
        this.fish(e, st, dt, players);
    }
    if (e.dead || !this.m.list.has(e.id)) return;
    this.m.mobs.updateFlags(e, e.ai!);
    if (st.flop) e.flags |= EF_ACTION;
    if (e.type === MOB_PUFFERFISH && st.puff > 0) e.flags |= EF_ANGRY;
  }

  /**
   * Aire: los peces y renacuajos se ahogan fuera del agua; delfines y ajolotes se secan (la lluvia
   * moja a los ajolotes) y el delfín, además, necesita salir a respirar. Devuelve false si murió.
   */
  private breathe(e: Entity, st: AquaState, dt: number): boolean {
    const max = AIR_OUT[e.type];
    let choking = false;
    if (max !== undefined) {
      const wet = e.inWater || (e.type === MOB_AXOLOTL && this.m.host.raining() > 0.3 && this.m.w.skyTop(Math.floor(e.x), Math.floor(e.z)) <= e.y);
      if (wet) st.air = max;
      else {
        st.air -= dt;
        if (st.air <= 0) choking = true;
      }
    }
    if (e.type === MOB_DOLPHIN) {
      if (!this.headUnderwater(e)) st.breath = DOLPHIN_BREATH;
      else {
        st.breath -= dt;
        if (st.breath <= 0) choking = true;
      }
    }
    if (!choking) {
      st.choke = 0;
      return true;
    }
    st.choke += dt;
    if (st.choke >= 1) {
      st.choke -= 1;
      e.invuln = 0;
      if (this.m.damage(e, 1, e.x, e.z, null, 0)) return false;
    }
    return !e.dead;
  }

  private headUnderwater(e: Entity): boolean {
    return isWaterId(this.m.w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height + 0.05), Math.floor(e.z)));
  }

  private isWater(x: number, y: number, z: number): boolean {
    return isWaterId(this.m.w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  /** Rumbo al azar que siga dentro del agua (a 2 bloques); null si no hay ninguno. */
  private waterDir(e: Entity, vertical: number): [number, number, number] | null {
    const cy = e.y + e.height / 2;
    for (let i = 0; i < 8; i++) {
      const a = this.m.rand() * TAU;
      const dy = (this.m.rand() - 0.5) * vertical;
      const dx = Math.cos(a), dz = Math.sin(a);
      if (this.isWater(e.x + dx * 2, cy + dy * 2, e.z + dz * 2) && this.isWater(e.x + dx, cy + dy, e.z + dz)) {
        const l = Math.hypot(dx, dy, dz);
        return [dx / l, dy / l, dz / l];
      }
    }
    return null;
  }

  /**
   * Nada hacia (dx, dy, dz) a la velocidad dada sin salirse del agua: frena al llegar a una orilla o a
   * la superficie (salvo `leap`: el delfín puede saltar fuera).
   */
  private swim(e: Entity, dx: number, dy: number, dz: number, speed: number, dt: number, leap = false): void {
    const w = this.m.w;
    const cy = e.y + e.height / 2;
    // Orilla delante: no seguir por ahí.
    if (!this.isWater(e.x + dx * 0.8, cy, e.z + dz * 0.8)) {
      dx = -dx * 0.3;
      dz = -dz * 0.3;
      e.ai!.think = Math.min(e.ai!.think, 0.2);
    }
    // Superficie encima: no subir (el agua no deja salir a los peces).
    const surface = !isWaterId(w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height + 0.15), Math.floor(e.z)));
    if (surface && dy > 0 && !leap) dy = -0.1;
    const k = Math.min(1, dt * 2.5);
    e.vx += (dx * speed - e.vx) * k;
    e.vz += (dz * speed - e.vz) * k;
    e.vy += (dy * speed - e.vy) * k;
    if (surface && e.vy > 0 && !leap) e.vy = Math.min(e.vy, 0);
    moveBody(e, w, dt);
    this.face(e, dt, 6);
  }

  /** Gira el cuerpo hacia donde se mueve e inclina el morro según la velocidad vertical. */
  private face(e: Entity, dt: number, rate: number): void {
    const h = Math.hypot(e.vx, e.vz);
    if (h > 0.05) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * rate);
    e.yaw = e.bodyYaw;
    const target = e.inWater ? Math.max(-0.8, Math.min(0.8, Math.atan2(e.vy, Math.max(0.3, h)))) : 0;
    e.pitch += (target - e.pitch) * Math.min(1, dt * 4);
  }

  /** Fuera del agua: cae y da coletazos en el suelo (peces, renacuajos y delfines varados). */
  private flop(e: Entity, st: AquaState, dt: number): void {
    st.flop = true;
    e.vy -= GRAVITY * dt;
    if (e.vy < -60) e.vy = -60;
    if (e.onGround) {
      e.vx *= Math.max(0, 1 - dt * 8);
      e.vz *= Math.max(0, 1 - dt * 8);
      if (this.m.rand() < dt * 2) {
        e.vy = e.type === MOB_DOLPHIN ? 3 : 5;
        e.vx = (this.m.rand() - 0.5) * 3;
        e.vz = (this.m.rand() - 0.5) * 3;
      }
    }
    moveBody(e, this.m.w, dt);
    this.face(e, dt, 2);
  }

  /** Dirección para huir de un punto (en horizontal y algo hacia abajo). */
  private away(e: Entity, fx: number, fy: number, fz: number): [number, number, number] {
    const dx = e.x - fx, dz = e.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    const dy = e.y < fy ? -0.3 : 0.1;
    return [dx / d, dy, dz / d];
  }

  /** Peces y renacuajos: bancos que deambulan, huyen de jugadores y ajolotes, y boquean fuera del agua. */
  private fish(e: Entity, st: AquaState, dt: number, players: PlayerView[]): void {
    const ai = e.ai!;
    const def = MOBS[e.type];
    if (!e.inWater) {
      this.flop(e, st, dt);
      return;
    }
    // Peligro: jugadores muy cerca (que no estén quietos en creativo), ajolotes o un golpe reciente.
    let threat: [number, number, number] | null = null;
    if (ai.panic > 0) threat = [ai.panicFrom[0], e.y, ai.panicFrom[1]];
    if (!threat && e.type !== MOB_PUFFERFISH) {
      for (const p of players) {
        if (!p.alive || p.creative) continue;
        if (Math.abs(p.x - e.x) < 4 && Math.abs(p.z - e.z) < 4 && Math.abs(p.y + 0.9 - e.y) < 3) {
          threat = [p.x, p.y + 0.9, p.z];
          break;
        }
      }
    }
    if (!threat && e.type !== MOB_TADPOLE) {
      for (const o of this.m.list.values()) {
        if (o.type !== MOB_AXOLOTL || o.dead) continue;
        if (Math.abs(o.x - e.x) < 6 && Math.abs(o.z - e.z) < 6 && Math.abs(o.y - e.y) < 4) {
          threat = [o.x, o.y, o.z];
          break;
        }
      }
    }
    if (threat) {
      const [dx, dy, dz] = this.away(e, threat[0], threat[1], threat[2]);
      this.swim(e, dx, dy, dz, def.run, dt);
      return;
    }
    // Rumbo propio de vez en cuando.
    if (ai.think <= 0) {
      ai.think = 1 + this.m.rand() * 2.5;
      const d = this.waterDir(e, 0.7);
      ai.swimDir = d ?? [-ai.swimDir[0], -ai.swimDir[1] * 0.5, -ai.swimDir[2]];
    }
    // Banco: acercarse al grupo, nadar como él y no chocar (sólo los de la misma especie).
    let n = 0, cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0, sx = 0, sy = 0, sz = 0;
    for (const o of this.m.list.values()) {
      if (o === e || o.type !== e.type || o.dead) continue;
      const ox = o.x - e.x, oy = o.y - e.y, oz = o.z - e.z;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 > 36) continue;
      n++;
      cx += ox;
      cy += oy;
      cz += oz;
      ax += o.vx;
      ay += o.vy;
      az += o.vz;
      if (d2 < 0.6) {
        const d = Math.sqrt(d2) || 0.1;
        sx -= ox / d;
        sy -= oy / d;
        sz -= oz / d;
      }
    }
    let [dx, dy, dz] = ai.swimDir;
    if (n > 0) {
      const al = Math.hypot(ax, ay, az) || 1;
      dx = dx * 0.6 + (cx / n) * 0.25 + (ax / al) * 0.8 + sx * 1.5;
      dy = dy * 0.6 + (cy / n) * 0.25 + (ay / al) * 0.4 + sy * 1.5;
      dz = dz * 0.6 + (cz / n) * 0.25 + (az / al) * 0.8 + sz * 1.5;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
    }
    this.swim(e, dx, dy, dz, def.walk, dt);
  }

  /** Pez globo: se hincha si alguien se acerca y pincha (veneno) a quien lo toca estando hinchado. */
  private puffer(e: Entity, st: AquaState, dt: number, players: PlayerView[]): void {
    if (st.puff > 0) st.puff -= dt;
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const dx = p.x - e.x, dz = p.z - e.z, dy = p.y + 0.9 - (e.y + e.height / 2);
      const d = Math.hypot(dx, dz);
      if (d > 2.5 || Math.abs(dy) > 2) continue;
      if (st.puff <= 0) this.m.host.fx('puffer_inflate', e.x, e.y + e.height / 2, e.z);
      st.puff = 3;
      // Pinchazo: al tocarlo hinchado (como en Minecraft, 1 de daño y veneno).
      if (d < e.width / 2 + 0.7 && Math.abs(dy) < 1.3 && st.sting <= 0) {
        st.sting = 1;
        this.m.host.hurtPlayer(p.id, 1 * this.m.difficultyScale(), (dx / (d || 1)) * 2, 2, (dz / (d || 1)) * 2, 'pufferfish');
        this.m.host.effectPlayer?.(p.id, EFFECT_POISON, 6, 0);
        this.m.host.fx('mob_attack', e.x, e.y + e.height / 2, e.z, e.type);
      }
    }
  }

  /** Delfín: sigue a los jugadores que nadan cerca, sale a respirar, salta y muerde si le pegan. */
  private dolphin(e: Entity, st: AquaState, dt: number, players: PlayerView[]): void {
    const ai = e.ai!;
    const def = MOBS[e.type];
    if (!e.inWater) {
      // En el aire tras un salto (cae de nuevo al agua) o varado en la orilla.
      if (e.onGround) this.flop(e, st, dt);
      else {
        e.vy -= GRAVITY * dt;
        moveBody(e, this.m.w, dt);
        this.face(e, dt, 3);
      }
      return;
    }
    if (st.leap > 0) st.leap -= dt;
    // Venganza (el cerebro general lo enfada al pegarle, como a los lobos): persigue y muerde.
    if (ai.angry > 0 && ai.target) {
      const t = players.find((p) => p.id === ai.target && p.alive && !p.creative);
      if (t) {
        const dx = t.x - e.x, dy = t.y + 0.9 - (e.y + e.height / 2), dz = t.z - e.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        this.swim(e, dx / d, dy / d, dz / d, def.run, dt);
        if (d < 1.8 && ai.attackCd <= 0) {
          ai.attackCd = 1;
          this.m.host.hurtPlayer(t.id, def.damage * this.m.difficultyScale(), (dx / d) * 4, 3, (dz / d) * 4, def.key, e); // Fase 7: e (Espinas)
          this.m.host.fx('mob_attack', e.x, e.y + e.height / 2, e.z, e.type);
        }
        return;
      }
      ai.angry = 0;
      ai.target = null;
    }
    // Poco aire: a la superficie.
    if (st.breath < 20) {
      this.swim(e, ai.swimDir[0] * 0.3, 1, ai.swimDir[2] * 0.3, def.run, dt, true);
      return;
    }
    // Fase 7.5 (océano): si le dieron pescado, lleva al naufragio o a las ruinas más cercanos.
    const guide = this.m.dolphinGuide.heading(e, dt);
    if (guide) {
      this.swim(e, guide[0], guide[1], guide[2], def.run, dt);
      return;
    }
    // Acompañar al jugador que nada más cerca.
    let near: PlayerView | null = null, best = 20;
    for (const p of players) {
      if (!p.alive || !this.isWater(p.x, p.y + 0.5, p.z)) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (d < best) {
        best = d;
        near = p;
      }
    }
    if (ai.think <= 0) {
      ai.think = 1.5 + this.m.rand() * 2.5;
      const d = this.waterDir(e, 0.5);
      if (d) ai.swimDir = d;
    }
    let [dx, dy, dz] = ai.swimDir;
    let speed = def.walk;
    if (near && best > 3) {
      const tx = near.x - e.x, ty = near.y + 0.5 - e.y, tz = near.z - e.z;
      const l = Math.hypot(tx, ty, tz) || 1;
      [dx, dy, dz] = [tx / l, ty / l, tz / l];
      speed = def.run * 0.8;
    }
    // Fase 7 (efectos): a quien bucea cerca le da Gracia del delfín (se renueva cada segundo mientras nada con él).
    if (near && near.swimming && best <= DOLPHIN_GRACE_RANGE && Math.floor(e.age) !== Math.floor(e.age - dt)) {
      this.m.host.effectPlayer?.(near.id, EFFECT_DOLPHINS_GRACE, DOLPHIN_GRACE_SECONDS, 0, true);
    }
    if (near && best <= 3) {
      // Junto al jugador: dar vueltas a su alrededor.
      const a = e.age * 0.8 + e.id;
      dx = Math.cos(a);
      dz = Math.sin(a);
      dy = (near.y + 0.5 - e.y) * 0.3;
    }
    // Saltos juguetones al llegar a la superficie nadando deprisa.
    const atSurface = !this.headUnderwater(e);
    let leap = false;
    if (atSurface && st.leap <= 0 && Math.hypot(e.vx, e.vz) > 2 && this.m.rand() < dt * 0.6) {
      st.leap = 6 + this.m.rand() * 8;
      e.vy = 7;
      leap = true;
      this.m.host.fx('splash', e.x, e.y + 0.5, e.z);
    }
    this.swim(e, dx, dy, dz, speed, dt, leap);
  }

  /** Tortuga: nada o camina despacio; de adulta vuelve a su playa a poner huevos en la arena. */
  private turtle(e: Entity, st: AquaState, dt: number): void {
    const ai = e.ai!;
    const def = MOBS[e.type];
    const w = this.m.w;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    const floor = w.getBlock(bx, Math.floor(e.y - 0.05), bz);
    const baby = (e.growAge ?? 0) > 0;
    // La primera playa que pisa es su casa.
    if (!st.home && e.onGround && (floor === SAND || floor === RED_SAND)) st.home = [bx, by, bz];
    if (!baby) st.lay -= dt;
    let goal: [number, number] | null = null;
    let speed = e.inWater ? def.run * 1.3 : def.walk;
    if (ai.panic > 0) {
      const [dx, , dz] = this.away(e, ai.panicFrom[0], e.y, ai.panicFrom[1]);
      goal = [e.x + dx * 4, e.z + dz * 4];
      speed = e.inWater ? def.run * 1.6 : def.run;
    } else if (!baby && st.lay <= 0 && st.home) {
      // Hora de poner: ir a casa (si tarda demasiado, lo deja para otra vez).
      st.trip += dt;
      const [hx, hy, hz] = st.home;
      if (st.trip > TURTLE_TRIP) {
        st.trip = 0;
        st.lay = TURTLE_LAY_MIN * 0.3;
      } else if (Math.hypot(hx + 0.5 - e.x, hz + 0.5 - e.z) < 2.5 && e.onGround && !e.inWater && Math.abs(hy - by) < 3) {
        if (this.layEggs(e)) {
          st.trip = 0;
          st.lay = TURTLE_LAY_MIN + this.m.rand() * TURTLE_LAY_RAND;
        }
      } else goal = [hx + 0.5, hz + 0.5];
    }
    if (!goal) {
      if (ai.think <= 0) {
        ai.think = 3 + this.m.rand() * 5;
        // Las crías buscan el agua; las adultas pasean (y a veces vuelven al agua).
        const water = baby || this.m.rand() < 0.3 ? this.nearestWater(e, 10) : null;
        if (water) ai.goal = water;
        else if (this.m.rand() < 0.7) {
          const a = this.m.rand() * TAU, r = 2 + this.m.rand() * 6;
          ai.goal = [Math.floor(e.x + Math.cos(a) * r), by, Math.floor(e.z + Math.sin(a) * r)];
        } else ai.goal = null;
      }
      if (ai.goal) {
        if (Math.hypot(ai.goal[0] + 0.5 - e.x, ai.goal[2] + 0.5 - e.z) < 0.8) ai.goal = null;
        else goal = [ai.goal[0] + 0.5, ai.goal[2] + 0.5];
      }
    }
    if (e.inWater) {
      if (goal) {
        const dx = goal[0] - e.x, dz = goal[1] - e.z;
        const d = Math.hypot(dx, dz) || 1;
        // Hacia la orilla: subir un poco para poder salir del agua.
        const dy = st.lay <= 0 || baby ? 0.4 : (this.m.rand() - 0.5) * 0.2;
        this.swim(e, dx / d, dy, dz / d, speed, dt, true);
        if (e.hitWall) e.vy = Math.max(e.vy, 4);
      } else this.swim(e, ai.swimDir[0], -0.2, ai.swimDir[2], def.walk, dt);
      return;
    }
    this.walk(e, goal, speed, dt);
  }

  /** Pone de 1 a 4 huevos en la celda de sus pies (sobre arena). */
  private layEggs(e: Entity): boolean {
    const w = this.m.w;
    const x = Math.floor(e.x), y = Math.floor(e.y + 0.01), z = Math.floor(e.z);
    const below = w.getBlock(x, y - 1, z);
    const cur = w.getBlock(x, y, z);
    if ((below !== SAND && below !== RED_SAND) || (cur !== AIR && !(cur > 0 && BLOCK_REPLACEABLE[cur] && !BLOCK_FLUID[cur]))) return false;
    if (isTurtleEgg(cur)) return false;
    w.setBlock(x, y, z, turtleEggBlock(1 + Math.floor(this.m.rand() * 4), 0));
    this.m.host.fx('turtle_lay_egg', x + 0.5, y + 0.2, z + 0.5);
    return true;
  }

  /** Ajolote: caza peces y calamares en el agua; en tierra camina despacio y busca agua si se seca. */
  private axolotl(e: Entity, st: AquaState, dt: number): void {
    const ai = e.ai!;
    const def = MOBS[e.type];
    if (!e.inWater) {
      if (ai.think <= 0) {
        ai.think = 3 + this.m.rand() * 4;
        const water = this.nearestWater(e, 8);
        if (water) ai.goal = water;
        else {
          const a = this.m.rand() * TAU;
          ai.goal = [Math.floor(e.x + Math.cos(a) * 3), Math.floor(e.y), Math.floor(e.z + Math.sin(a) * 3)];
        }
      }
      const g = ai.goal;
      this.walk(e, g && Math.hypot(g[0] + 0.5 - e.x, g[2] + 0.5 - e.z) > 0.6 ? [g[0] + 0.5, g[2] + 0.5] : null, def.walk, dt);
      return;
    }
    // Presa: la que ya tenía o el pez (o calamar) más cercano.
    let prey = st.prey ? this.m.list.get(st.prey) : undefined;
    if (prey && (prey.dead || Math.hypot(prey.x - e.x, prey.y - e.y, prey.z - e.z) > 12)) prey = undefined;
    if (!prey && st.rest <= 0 && ai.think <= 0) {
      let best = 8;
      for (const o of this.m.list.values()) {
        if (o.dead || !(isFish(o.type) || o.type === MOB_SQUID || o.type === MOB_GLOW_SQUID)) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y, o.z - e.z);
        if (d < best) {
          best = d;
          prey = o;
        }
      }
    }
    st.prey = prey ? prey.id : 0;
    if (prey) {
      const dx = prey.x - e.x, dy = prey.y + prey.height / 2 - (e.y + e.height / 2), dz = prey.z - e.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      this.swim(e, dx / d, dy / d, dz / d, def.run, dt);
      if (d < 1.3 && ai.attackCd <= 0) {
        ai.attackCd = 1;
        this.m.host.fx('mob_attack', e.x, e.y + e.height / 2, e.z, e.type);
        if (this.m.damage(prey, def.damage, e.x, e.z, null, 0.5)) {
          st.prey = 0;
          st.rest = AXOLOTL_REST;
        }
      }
      return;
    }
    if (ai.think <= 0) {
      ai.think = 2 + this.m.rand() * 3;
      const d = this.waterDir(e, 0.6);
      if (d) ai.swimDir = d;
    }
    this.swim(e, ai.swimDir[0], ai.swimDir[1], ai.swimDir[2], def.walk * 1.5, dt);
  }

  /** Rana: a saltos en tierra (de vez en cuando uno hacia el agua) y nadando en el agua. */
  private frog(e: Entity, st: AquaState, dt: number): void {
    const ai = e.ai!;
    const def = MOBS[e.type];
    if (this.frogHunt(e, st, dt)) return;
    if (e.inWater) {
      if (ai.think <= 0) {
        ai.think = 2 + this.m.rand() * 3;
        const d = this.waterDir(e, 0.8);
        if (d) ai.swimDir = d;
      }
      // Suben a la superficie y trepan a la orilla si la tocan.
      this.swim(e, ai.swimDir[0], ai.swimDir[1] * 0.5 + 0.15, ai.swimDir[2], def.walk, dt, true);
      if (e.hitWall) e.vy = Math.max(e.vy, 5);
      return;
    }
    st.hop -= dt;
    if (e.onGround) {
      e.vx *= Math.max(0, 1 - dt * 10);
      e.vz *= Math.max(0, 1 - dt * 10);
      if (st.hop <= 0 || ai.panic > 0) {
        st.hop = ai.panic > 0 ? 0.4 : 1.5 + this.m.rand() * 3;
        let dx: number, dz: number;
        if (ai.panic > 0) [dx, , dz] = this.away(e, ai.panicFrom[0], e.y, ai.panicFrom[1]);
        else {
          const water = this.m.rand() < 0.25 ? this.nearestWater(e, 8) : null;
          const a = this.m.rand() * TAU;
          [dx, dz] = water ? [water[0] + 0.5 - e.x, water[2] + 0.5 - e.z] : [Math.cos(a), Math.sin(a)];
          const l = Math.hypot(dx, dz) || 1;
          dx /= l;
          dz /= l;
        }
        // Un salto de rana: alto y largo.
        e.vy = 7.5;
        e.vx = dx * def.run;
        e.vz = dz * def.run;
        e.bodyYaw = Math.atan2(-dx, -dz);
        this.m.host.fx('frog_hop', e.x, e.y, e.z);
      }
    }
    e.vy -= GRAVITY * dt;
    if (e.vy < -60) e.vy = -60;
    moveBody(e, this.m.w, dt, 0.6);
    e.yaw = e.bodyYaw;
    e.pitch = 0;
  }

  /**
   * ShootTongue de Java: la rana va a por el cubo pequeño (slime o de magma de tamaño 1) más cercano a 10 bloques que
   * vea; a 1,75 le lanza la lengua (lo atrae a 0,75 bloques por tick) y a los 6 ticks se lo come (10 de daño: lo
   * mata; kill() pone lo que suelta). Si en 100 ticks no llega, lo deja. Devuelve true si está cazando (se mueve sola).
   */
  private frogHunt(e: Entity, st: AquaState, dt: number): boolean {
    const m = this.m;
    let prey = st.frogPrey !== undefined ? m.list.get(st.frogPrey) : undefined;
    if (prey && (prey.dead || (st.huntTime ?? 0) > 5)) {
      st.frogPrey = undefined;
      prey = undefined;
    }
    if (!prey) {
      st.tongue = 0;
      if (m.rand() > dt * 2) return false;
      let best: Entity | undefined, bd = 100;
      for (const o of m.list.values()) {
        if (o.dead || (o.type !== MOB_SLIME_SMALL && o.type !== MOB_MAGMA_CUBE_SMALL)) continue;
        const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2 + (o.z - e.z) ** 2;
        if (d < bd && lineOfSight(m.w, e.x, e.y + 0.4, e.z, o.x, o.y + 0.3, o.z)) {
          bd = d;
          best = o;
        }
      }
      if (!best) return false;
      prey = best;
      st.frogPrey = best.id;
      st.huntTime = 0;
      st.tongue = 0;
    }
    st.huntTime = (st.huntTime ?? 0) + dt;
    const dx = prey.x - e.x, dz = prey.z - e.z;
    const d = Math.hypot(dx, prey.y - e.y, dz);
    e.bodyYaw = e.yaw = Math.atan2(-dx, -dz);
    if ((st.tongue ?? 0) > 0) {
      // Lengua fuera: la presa viene hacia la boca y, a los 6 ticks, se la come.
      st.tongue! += dt;
      e.flags |= EF_ACTION;
      const k = 15 / (d || 1);
      prey.vx = -dx * k;
      prey.vz = -dz * k;
      prey.vy = -(prey.y - e.y) * k;
      if (st.tongue! >= 0.3) {
        m.host.fx('frog_eat', e.x, e.y + 0.3, e.z);
        m.damage(prey, 10, e.x, e.z, e.id, 0);
        if (prey.dead) m.remove(prey.id);
        st.frogPrey = undefined;
        st.tongue = 0;
      }
    } else if (d < 1.75) {
      st.tongue = dt;
      m.host.fx('frog_tongue', e.x, e.y + 0.3, e.z);
    } else if (e.onGround) {
      // Hacia ella, a saltitos (o nadando, que lo hace frog()).
      if (e.inWater) return false;
      st.hop -= dt;
      e.vx *= Math.max(0, 1 - dt * 10);
      e.vz *= Math.max(0, 1 - dt * 10);
      if (st.hop <= 0) {
        st.hop = 0.5;
        const l = Math.hypot(dx, dz) || 1;
        e.vy = 5;
        e.vx = (dx / l) * MOBS[e.type].run;
        e.vz = (dz / l) * MOBS[e.type].run;
        m.host.fx('frog_hop', e.x, e.y, e.z);
      }
    }
    e.vy -= GRAVITY * dt;
    moveBody(e, m.w, dt, 0.6);
    return true;
  }

  /** Camina en tierra hacia `goal` (o se queda quieta), saltando los escalones. */
  private walk(e: Entity, goal: [number, number] | null, speed: number, dt: number): void {
    let tvx = 0, tvz = 0;
    if (goal) {
      const dx = goal[0] - e.x, dz = goal[1] - e.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        tvx = (dx / d) * speed;
        tvz = (dz / d) * speed;
      }
    }
    const acc = e.onGround ? 10 : 2;
    e.vx += (tvx - e.vx) * Math.min(1, dt * acc);
    e.vz += (tvz - e.vz) * Math.min(1, dt * acc);
    e.vy -= GRAVITY * dt;
    if (e.vy < -60) e.vy = -60;
    if (e.onGround && e.hitWall && (tvx || tvz)) e.vy = 8.6;
    moveBody(e, this.m.w, dt, 0.6);
    if (Math.hypot(e.vx, e.vz) > 0.2) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 6);
    e.yaw = e.bodyYaw;
    e.pitch *= 1 - Math.min(1, dt * 4);
  }

  /** Celda de agua más cercana (en un radio horizontal `r`, a su altura o un bloque más abajo). */
  private nearestWater(e: Entity, r: number): [number, number, number] | null {
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dz * dz;
        if (d >= bd || d > r * r) continue;
        for (const dy of [0, -1, 1]) {
          if (isWaterId(this.m.w.getBlock(bx + dx, by + dy, bz + dz))) {
            bd = d;
            best = [bx + dx, by + dy, bz + dz];
            break;
          }
        }
      }
    }
    return best;
  }

  /** El renacuajo se convierte en rana. */
  private growUp(e: Entity): void {
    const frog = this.m.spawnMob(MOB_FROG, e.x, e.y, e.z); // (con la variedad del bioma donde crece)
    if (frog) {
      frog.yaw = frog.bodyYaw = e.bodyYaw;
      frog.health = frog.maxHealth;
    }
    this.m.host.fx('tadpole_grow', e.x, e.y + 0.2, e.z);
    this.m.remove(e.id);
  }

  // ------------------------------------------------------------------ cubos

  /** Cubo de agua sobre un pez, un ajolote o un renacuajo: la criatura entra en el cubo. */
  interact(e: Entity, item: number): InteractResult | null {
    const bucket = MOB_BUCKETS[e.type];
    if (item !== WATER_BUCKET || bucket === undefined || e.dead || !e.ai) return null;
    this.m.host.fx('bucket_fill_fish', e.x, e.y + e.height / 2, e.z, e.type);
    this.m.remove(e.id);
    return { ok: true, take: 1, give: { id: bucket, count: 1 } };
  }

  /** Vaciar un cubo con criatura en (x, y, z): sale la criatura (el agua la pone quien vacía el cubo). */
  releaseBucket(item: number, x: number, y: number, z: number): Entity | null {
    const type = mobInBucket(item);
    if (!type) return null;
    const e = this.m.spawnMob(type, x + 0.5, y + 0.1, z + 0.5);
    if (!e) return null;
    this.stateOf(e).fromBucket = true;
    this.m.host.fx('bucket_empty_fish', x + 0.5, y + 0.5, z + 0.5, type);
    return e;
  }

  // ------------------------------------------------------------------ aparición

  spawnTick(dt: number, players: PlayerView[]): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || players.length === 0) return;
    this.spawnTimer = 3;
    for (const p of players) {
      if (!p.alive) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        const a = this.m.rand() * TAU, r = 16 + this.m.rand() * 32;
        if (this.spawnColumn(Math.floor(p.x + Math.cos(a) * r), Math.floor(p.z + Math.sin(a) * r), p) > 0) break;
      }
      this.spawnCave(p);
    }
  }

  /** ¿Cabe otro grupo de `type` cerca de (x, z)? (cuenta las de su grupo en un radio de 64). */
  private room(type: number, x: number, z: number): boolean {
    const [lo] = GROUP[type] ?? [1, 1];
    this.roomLeft = this.capOf(type) - this.near(type, x, z);
    return this.roomLeft >= lo;
  }

  /** Cuántas criaturas del grupo de `type` hay cerca de (x, z). */
  private near(type: number, x: number, z: number, r = 64): number {
    const cap = CAPS.find(([f]) => f(type));
    const f = cap ? cap[0] : (t: number) => t === type;
    let n = 0;
    for (const e of this.m.list.values()) {
      if (!e.ai || e.dead || !f(e.type)) continue;
      if (Math.abs(e.x - x) < r && Math.abs(e.z - z) < r) n++;
    }
    return n;
  }

  private capOf(type: number): number {
    return CAPS.find(([f]) => f(type))?.[1] ?? 4;
  }

  /** Criatura del agua abierta según el bioma (0: ninguna). */
  waterMobFor(biome: number, r: number): number {
    switch (baseBiome(biome)) { // Fase 7.6: los océanos y ríos nuevos, como su base
      case BIOME_WARM_OCEAN:
        return r < 0.62 ? MOB_TROPICAL_FISH : r < 0.9 ? MOB_PUFFERFISH : MOB_DOLPHIN;
      case BIOME_OCEAN:
      case BIOME_DEEP_OCEAN:
        return r < 0.88 ? MOB_COD : MOB_DOLPHIN;
      case BIOME_COLD_OCEAN:
        return r < 0.6 ? MOB_COD : MOB_SALMON;
      case BIOME_FROZEN_OCEAN:
        return MOB_SALMON;
      case BIOME_BEACH:
        return MOB_COD;
      case BIOME_SWAMP:
        return r < 0.6 ? MOB_TADPOLE : 0;
      default:
        // Ríos y lagos de tierra adentro: salmones.
        return isOceanBiome(biome) ? MOB_COD : r < 0.7 ? MOB_SALMON : 0;
    }
  }

  /**
   * Intenta que aparezca un grupo en la columna (x, z): peces o delfines en su agua, tortugas en la
   * arena de la playa y ranas en la orilla de los pantanos. Los límites se cuentan alrededor de
   * `around` (el jugador) o de la propia columna. Devuelve cuántas criaturas aparecieron.
   */
  spawnColumn(x: number, z: number, around?: { x: number; z: number }): number {
    const ax = around?.x ?? x, az = around?.z ?? z;
    const w = this.m.w;
    let top = w.skyTop(x, z);
    if (top < MIN_Y) return 0;
    let surface = w.getBlock(x, top, z);
    const biome = w.gen.columnInfo(x, z).biome;
    // Bajo el hielo de los océanos helados también hay peces.
    if ((surface === ICE || surface === PACKED_ICE) && isWaterId(w.getBlock(x, top - 1, z))) {
      top--;
      surface = w.getBlock(x, top, z);
    }
    if (isWaterId(surface)) {
      let bottom = top;
      while (top - bottom < 48 && isWaterId(w.getBlock(x, bottom - 1, z))) bottom--;
      const depth = top - bottom + 1;
      const type = this.waterMobFor(biome, this.m.rand());
      if (!type || depth < (type === MOB_DOLPHIN ? 4 : type === MOB_TADPOLE ? 1 : 2) || !this.room(type, ax, az)) return 0;
      const y = type === MOB_DOLPHIN ? top - 2 : bottom + Math.floor(this.m.rand() * Math.max(1, depth - 1));
      return this.group(type, x, y, z, (gx, gy, gz) => isWaterId(w.getBlock(gx, gy, gz)) && (type === MOB_TADPOLE || gy < top)).length;
    }
    // Tierra: tortugas en las playas y ranas en los pantanos, siempre junto al agua.
    let type = 0;
    if (baseBiome(biome) === BIOME_BEACH && (surface === SAND || surface === RED_SAND)) type = this.m.rand() < 0.35 ? MOB_TURTLE : 0;
    else if (baseBiome(biome) === BIOME_SWAMP && (surface === GRASS || surface === DIRT || surface === CLAY)) type = MOB_FROG;
    if (!type || !this.room(type, ax, az) || !this.waterNear(x, top, z, 5)) return 0;
    const born = this.group(type, x, top + 1, z, (gx, gy, gz) => {
      const f = w.getBlock(gx, gy - 1, gz);
      return w.getBlock(gx, gy, gz) === AIR && w.getBlock(gx, gy + 1, gz) === AIR && f > 0 && BLOCK_SOLID[f] === 1;
    }, true);
    // Esta playa es la casa de las tortugas que aparecen en ella.
    if (type === MOB_TURTLE) for (const e of born) this.setHome(e, x, top + 1, z);
    return born.length;
  }

  /** Aparece un grupo de `type` alrededor de (x, y, z) en las celdas que acepta `ok`. */
  private group(type: number, x: number, y: number, z: number, ok: (x: number, y: number, z: number) => boolean, surface = false): Entity[] {
    const [lo, hi] = GROUP[type] ?? [1, 2];
    const count = Math.min(this.roomLeft, lo + Math.floor(this.m.rand() * (hi - lo + 1)));
    this.roomLeft = Infinity;
    const born: Entity[] = [];
    for (let i = 0; i < count * 2 && born.length < count; i++) {
      const gx = x + (i === 0 ? 0 : Math.floor((this.m.rand() - 0.5) * 5));
      const gz = z + (i === 0 ? 0 : Math.floor((this.m.rand() - 0.5) * 5));
      let gy = y;
      if (surface) {
        const t = this.m.w.skyTop(gx, gz);
        if (t < MIN_Y) continue;
        gy = t + 1;
      } else if (i > 0) gy = y + Math.floor((this.m.rand() - 0.5) * 3);
      if (!ok(gx, gy, gz)) continue;
      const e = this.m.spawnMob(type, gx + 0.5, gy + (surface ? 0 : 0.1), gz + 0.5);
      if (e) born.push(e);
    }
    return born;
  }

  private waterNear(x: number, y: number, z: number, r: number): boolean {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -1; dy <= 0; dy++) if (isWaterId(this.m.w.getBlock(x + dx, y + dy, z + dz))) return true;
      }
    }
    return false;
  }

  /**
   * Cuevas: ajolotes en el agua de las cuevas frondosas y calamares brillantes en el agua oscura de
   * las cuevas profundas (por debajo de y = 30).
   */
  spawnCave(p: PlayerView): number {
    const w = this.m.w;
    const a = this.m.rand() * TAU, r = 8 + this.m.rand() * 24;
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    const top = w.skyTop(x, z);
    if (top < MIN_Y || isWaterId(w.getBlock(x, top, z))) return 0;
    const lush = w.gen.caveBiomeAt(x, z) === 1;
    const y0 = Math.min(top - 8, Math.floor(p.y) + 16), y1 = Math.max(MIN_Y + 6, Math.floor(p.y) - 24);
    for (let y = y0; y >= y1; y--) {
      if (!isWaterId(w.getBlock(x, y, z)) || !isWaterId(w.getBlock(x, y + 1, z))) continue;
      let type = 0;
      if (lush) type = MOB_AXOLOTL;
      else if (y < 30 && w.blockLightAt(x, y, z) === 0) type = MOB_GLOW_SQUID;
      if (!type || !this.room(type, p.x, p.z)) return 0;
      return this.group(type, x, y, z, (gx, gy, gz) => isWaterId(w.getBlock(gx, gy, gz)) && isWaterId(w.getBlock(gx, gy + 1, gz))).length;
    }
    return 0;
  }
}
