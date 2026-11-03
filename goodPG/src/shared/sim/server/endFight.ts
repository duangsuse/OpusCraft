// Fase 8.6 (el End): el combate con el dragón (EndDragonFight de la 26.3), en el servidor del End.
// - La primera vez que alguien llega: cristales en lo alto de los diez pilares y el dragón a y = 128 sobre el centro.
//   El dragón y los cristales se guardan (no son animales: el servidor no los guardaría).
// - Barra del jefe para quien esté a menos de 192 bloques de (0, 128, 0) (con su niebla y su música en el cliente).
// - Al morir el dragón: el portal de salida se enciende, la primera vez sale el huevo en lo alto de la columna y cada
//   vez sale una de las veinte puertas del End del anillo.
// - Cuatro cristales en los cuatro lados del portal de salida lo traen de vuelta (DragonRespawnStage): el portal se
//   apaga, los cristales apuntan al cielo, los pilares se rehacen uno a uno entre explosiones y aparece un dragón
//   nuevo; si se rompe uno de los cuatro cristales antes, se aborta.
// - Puertas del End: las del anillo llevan a unos 1024 bloques en su dirección (a una isla; si no hay, se crea) y allí
//   dejan otra de vuelta; las de las tierras altas llevan a la plataforma de llegada.
// - Cristal del End (objeto): sobre obsidiana o lecho de roca con aire encima y sin nadie en medio.
// - Huevo de dragón: al usarlo (o golpearlo) salta a un sitio libre cercano.
import { AIR, OBSIDIAN, BEDROCK, END_STONE, END_GATEWAY, DRAGON_EGG, FIRE, BLOCK_COLLIDE, BLOCK_OPAQUE } from '../../blocks';
import { END_CRYSTAL, ENDER_PEARL } from '../../items';
import { MOB_ENDER_DRAGON, ENT_END_CRYSTAL, ENT_ITEM, DRAGON_HEALTH } from '../../mobs';
import { DIM_END } from '../../dimensions';
import { CHUNK_SIZE } from '../../constants';
import { STATE_DEAD } from '../../protocol';
import { END_SPAWN, EndGenerator } from '../../world/end';
import { endSpikes, drawSpike, drawPodium, drawGateway, gatewayOrder, gatewayPos, gatewayFarTarget, type EndLevel } from '../../world/endIsland';
import type { Entity } from '../entities';
import type { ServerStore } from '../store';
import type { ServerContext, Session } from './context';

interface FightSave {
  init: boolean;
  killed: boolean;
  prev: boolean;
  /** Puertas del anillo que quedan (en orden). */
  gates: number[];
  /** Puertas del anillo ya usadas y la suya de vuelta. */
  links: [number, number, number, number, number, number][];
  /** [x, y, z, vida] y, con los jefes reforzados, su vida máxima. */
  dragon: [number, number, number, number] | [number, number, number, number, number] | null;
  crystals: [number, number, number, number][];
}

const BOSS_RANGE = 192;

export class EndFight {
  private save: FightSave = { init: false, killed: false, prev: false, gates: [], links: [], dragon: null, crystals: [] };
  private loaded = false;
  private restored = false;
  /** Jugadores con la barra a la vista y lo último que se les mandó. */
  private bossSent = new Map<string, number>();
  /** Espera de cada jugador tras cruzar una puerta (ticks del servidor). */
  private gateCooldown = new Map<string, number>();
  /** Lo mismo para objetos y criaturas que cruzaron una. */
  private entityGate = new Map<number | string, number>();
  /** Dónde estaba cada perla en el tick anterior. */
  private entityPrev = new Map<number | string, [number, number, number]>();
  /** Reaparición en marcha: fase, ticks y los cristales que la hacen. */
  private respawn: { stage: number; time: number; spike: number; crystals: number[] } | null = null;
  private portalY = -1;

  constructor(private ctx: ServerContext, private store: ServerStore) {
    if (ctx.dim !== DIM_END) return;
    try {
      const raw = store.getMeta('endFight');
      if (raw) this.save = { ...this.save, ...(JSON.parse(raw) as FightSave) };
    } catch {
      // Sin combate guardado (o roto): empieza de cero.
    }
    const d = ctx.entities.dragon;
    d.fight = {
      podium: () => {
        const y = this.podiumY();
        return [0, y + 4, 0];
      },
      crystalsAlive: () => this.spikeCrystals(),
      previouslyKilled: () => this.save.prev,
      onDragonKilled: () => this.dragonKilled(),
    };
    d.onCrystalGone = (e) => this.onCrystalGone(e);
  }

  private get active(): boolean {
    return this.ctx.dim === DIM_END;
  }

  /** El y del portal de salida (el bloque más alto del centro de la isla, como en la generación). */
  private podiumY(): number {
    if (this.portalY < 0) {
      const gen = this.ctx.world.gen;
      this.portalY = gen instanceof EndGenerator ? gen.surfaceAt(0, 0) : 64;
      if (this.portalY < 1) this.portalY = 64;
    }
    return this.portalY;
  }

  private level(): EndLevel {
    const w = this.ctx.world;
    return {
      get: (x, y, z) => w.getBlock(x, y, z),
      set: (x, y, z, id) => {
        if (w.getBlock(x, y, z) !== id) w.setBlock(x, y, z, id);
      },
    };
  }

  private load(x0: number, z0: number, x1: number, z1: number): void {
    const now = this.ctx.now();
    for (let cz = Math.floor(z0 / CHUNK_SIZE); cz <= Math.floor(z1 / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) this.ctx.world.ensureChunk(cx, cz, now);
    }
  }

  /** Cristales en lo alto de los pilares (los que cuentan para el dragón). */
  private spikeCrystals(): number {
    let n = 0;
    const spikes = endSpikes(this.ctx.seed);
    for (const e of this.ctx.entities.list.values()) {
      if (e.type !== ENT_END_CRYSTAL || e.dead) continue;
      if (spikes.some((s) => Math.abs(e.x - s.x - 0.5) < 1 && Math.abs(e.z - s.z - 0.5) < 1 && Math.abs(e.y - s.height - 1) < 1)) n++;
    }
    return n;
  }

  private dragon(): Entity | null {
    for (const e of this.ctx.entities.list.values()) if (e.type === MOB_ENDER_DRAGON) return e;
    return null;
  }

  // ------------------------------------------------------------------ tick

  tick(): void {
    if (!this.active) return;
    const players = [...this.ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD));
    if (players.length === 0) return;
    if (!this.loaded) {
      this.loaded = true;
      this.load(-48, -48, 48, 48);
    }
    if (!this.save.init) this.start();
    else if (!this.restored) this.restore();
    this.restored = true;
    // Si el dragón desaparece sin terminar de morir (un comando), el combate se da por ganado igual.
    const dr = this.dragon();
    if (!this.save.killed && !this.respawn && !dr) this.dragonKilled(false);
    // La zona del combate sigue cargada por donde vuele el dragón (en Java, el combate mantiene su zona).
    if (dr && this.ctx.tickCount % 10 === 0) this.load(dr.x - 24, dr.z - 24, dr.x + 24, dr.z + 24);
    this.bossBar(players);
    this.gateways(players);
    if (this.respawn) this.respawnTick();
  }

  /** Primera vez: cristales en los pilares y el dragón. */
  private start(): void {
    const d = this.ctx.entities.dragon;
    for (const s of endSpikes(this.ctx.seed)) d.spawnCrystal(s.x + 0.5, s.height + 1, s.z + 0.5, true);
    d.spawn(0.5, 128, 0.5);
    this.save.init = true;
    this.save.gates = gatewayOrder(this.ctx.seed);
    this.persist();
  }

  /** Tras reiniciar el servidor: los cristales y el dragón guardados. */
  private restore(): void {
    const d = this.ctx.entities.dragon;
    for (const [x, y, z, b] of this.save.crystals) {
      this.load(x, z, x, z);
      d.spawnCrystal(x, y, z, b === 1);
    }
    if (!this.save.killed && this.save.dragon) {
      const [x, y, z, hp, max] = this.save.dragon;
      const e = d.spawn(x, y, z);
      if (e) {
        const top = Math.max(DRAGON_HEALTH, Math.min(DRAGON_HEALTH * 20, Number(max) || DRAGON_HEALTH));
        d.setMaxHealth(e, top);
        e.health = Math.max(1, Math.min(top, hp));
      }
    }
  }

  private persist(): void {
    const crystals: [number, number, number, number][] = [];
    for (const e of this.ctx.entities.list.values()) {
      if (e.type === ENT_END_CRYSTAL && !e.dead) crystals.push([round(e.x), round(e.y), round(e.z), e.variant ? 1 : 0]);
    }
    const dr = this.dragon();
    this.save.crystals = crystals;
    const max = dr ? this.ctx.entities.dragon.maxHealth(dr) : DRAGON_HEALTH;
    this.save.dragon = dr && dr.health > 0
      ? (max > DRAGON_HEALTH ? [round(dr.x), round(dr.y), round(dr.z), Math.round(dr.health), max] : [round(dr.x), round(dr.y), round(dr.z), Math.round(dr.health)])
      : this.save.killed ? null : this.save.dragon;
    this.store.setMeta('endFight', JSON.stringify(this.save));
  }

  flush(store: ServerStore): void {
    if (!this.active || !this.save.init) return;
    this.store = store;
    this.persist();
  }

  // ------------------------------------------------------------------ barra del jefe

  private bossBar(players: Session[]): void {
    const dr = this.dragon();
    const tick = this.ctx.tickCount;
    for (const s of players) {
      const near = !!dr && Math.hypot(s.p[0], s.p[1] - 128, s.p[2]) <= BOSS_RANGE;
      const h = near ? Math.max(0, Math.min(1, dr!.health / this.ctx.entities.dragon.maxHealth(dr!))) : -1;
      const last = this.bossSent.get(s.id);
      if (last === undefined && h < 0) continue;
      if (last !== undefined && Math.abs(last - h) < 0.002 && tick % 40 !== 0) continue;
      if (h < 0) this.bossSent.delete(s.id);
      else this.bossSent.set(s.id, h);
      const name = dr && this.ctx.entities.dragon.furious(dr) ? 'Dragón de Ender (furioso)' : 'Dragón de Ender';
      this.ctx.send(s, h < 0 ? { t: 'boss', h: -1 } : { t: 'boss', n: name, h: Math.round(h * 1000) / 1000 });
    }
  }

  onLeave(s: Session): void {
    this.bossSent.delete(s.id);
    this.gateCooldown.delete(s.id);
  }

  // ------------------------------------------------------------------ muerte del dragón

  /** setDragonKilled: portal encendido, huevo la primera vez y una puerta del End nueva. */
  private dragonKilled(real = true): void {
    if (this.save.killed) return;
    const y = this.podiumY();
    this.load(-8, -8, 8, 8);
    drawPodium(this.level(), 0, y, 0, true);
    if (!this.save.prev) this.ctx.world.setBlock(0, y + 4, 0, DRAGON_EGG);
    this.save.prev = true;
    this.save.killed = true;
    this.save.dragon = null;
    if (real || this.save.gates.length) this.spawnGateway();
    this.persist();
  }

  private spawnGateway(): void {
    const i = this.save.gates.shift();
    if (i === undefined) return;
    const [x, y, z] = gatewayPos(i);
    this.load(x - 2, z - 2, x + 2, z + 2);
    drawGateway(this.level(), x, y, z);
    this.ctx.fx('gateway_spawn', x + 0.5, y + 0.5, z + 0.5);
  }

  // ------------------------------------------------------------------ puertas del End

  private gateways(players: Session[]): void {
    const w = this.ctx.world;
    const tick = this.ctx.tickCount;
    for (const s of players) {
      const until = this.gateCooldown.get(s.id) ?? 0;
      if (tick < until) continue;
      const x = Math.floor(s.p[0]), y = Math.floor(s.p[1]), z = Math.floor(s.p[2]);
      let gy = -1;
      if (w.getBlock(x, y, z) === END_GATEWAY) gy = y;
      else if (w.getBlock(x, y + 1, z) === END_GATEWAY) gy = y + 1;
      if (gy < 0) continue;
      const to = this.gatewayExit(x, gy, z);
      if (!to) continue;
      this.gateCooldown.set(s.id, tick + 40);
      this.ctx.fx('gateway_beam', x + 0.5, gy + 0.5, z + 0.5);
      s.p = [to[0], to[1], to[2]];
      this.ctx.send(s, { t: 'moveTo', p: [to[0], to[1], to[2]] });
      this.tellReturn(s, x, gy, z);
    }
    this.gatewayEntities(players);
  }

  /**
   * TheEndGatewayBlockEntity.teleportEntity: lo que cae dentro de una puerta (objetos, criaturas) sale por su otra
   * punta; una perla de ender lleva a su dueño en su lugar y desaparece.
   */
  private gatewayEntities(players: Session[]): void {
    const w = this.ctx.world;
    const tick = this.ctx.tickCount;
    for (const [id, until] of this.entityGate) if (tick >= until) this.entityGate.delete(id);
    for (const id of this.entityPrev.keys()) if (!this.ctx.entities.list.has(id as number)) this.entityPrev.delete(id);
    for (const e of [...this.ctx.entities.list.values()]) {
      if (e.dead || e.type === ENT_END_CRYSTAL || e.type === MOB_ENDER_DRAGON || this.entityGate.has(e.id)) continue;
      const pearl = e.stack?.id === ENDER_PEARL;
      if (!pearl && !e.ai && e.type !== ENT_ITEM) continue;
      // Lo rápido (la perla) recorre más de una celda por tick: se mira todo el tramo desde donde estaba.
      const prev = this.entityPrev.get(e.id) ?? [e.x, e.y, e.z];
      if (pearl) this.entityPrev.set(e.id, [e.x, e.y, e.z]);
      const steps = Math.max(1, Math.ceil(Math.hypot(e.x - prev[0], e.y - prev[1], e.z - prev[2]) / 0.25));
      let x = 0, z = 0, gy = -1;
      for (let i = steps; i >= 0 && gy < 0; i--) {
        const k = i / steps;
        const px = Math.floor(prev[0] + (e.x - prev[0]) * k), py = Math.floor(prev[1] + (e.y - prev[1]) * k), pz = Math.floor(prev[2] + (e.z - prev[2]) * k);
        if (w.getBlock(px, py, pz) === END_GATEWAY) gy = py;
        else if (w.getBlock(px, py + 1, pz) === END_GATEWAY) gy = py + 1;
        x = px;
        z = pz;
      }
      if (gy < 0) continue;
      const to = this.gatewayExit(x, gy, z);
      if (!to) continue;
      this.ctx.fx('gateway_beam', x + 0.5, gy + 0.5, z + 0.5);
      this.entityPrev.delete(e.id);
      if (pearl) {
        const owner = players.find((s) => s.id === e.shooter);
        if (owner) this.tellReturn(owner, x, gy, z);
        this.ctx.entities.remove(e.id);
        if (owner) {
          this.gateCooldown.set(owner.id, tick + 40);
          owner.p = [to[0], to[1], to[2]];
          this.ctx.send(owner, { t: 'moveTo', p: [to[0], to[1], to[2]] });
        }
        continue;
      }
      this.entityGate.set(e.id, tick + 40);
      e.x = to[0];
      e.y = to[1];
      e.z = to[2];
      e.vx = e.vy = e.vz = 0;
    }
  }

  /** Aparte de Java: al cruzar, se apunta en el chat dónde queda la puerta del otro lado, para no perderla. */
  private tellReturn(s: Session, x: number, y: number, z: number): void {
    const link = this.save.links.find((l) => (l[0] === x && l[1] === y && l[2] === z) || (l[3] === x && l[4] === y && l[5] === z));
    if (!link) return;
    const there = link[0] === x && link[1] === y && link[2] === z ? [link[3], link[4], link[5]] : [link[0], link[1], link[2]];
    this.ctx.tell(s, `Puerta del End al otro lado: ${there[0]}, ${there[1]}, ${there[2]}. Apúntala para volver.`);
  }

  /** A dónde lleva la puerta de (x, y, z) (TheEndGatewayBlockEntity.getPortalPosition). */
  private gatewayExit(x: number, y: number, z: number): [number, number, number] | null {
    const link = this.save.links.find((l) => (l[0] === x && l[1] === y && l[2] === z) || (l[3] === x && l[4] === y && l[5] === z));
    if (link) {
      const back = link[0] === x && link[1] === y && link[2] === z ? [link[3], link[4], link[5]] : [link[0], link[1], link[2]];
      return this.exitNear(back[0], back[1], back[2]);
    }
    if (Math.hypot(x, z) < 150) {
      const far = this.makeFarGateway(x, z);
      this.save.links.push([x, y, z, far[0], far[1], far[2]]);
      this.persist();
      return this.exitNear(far[0], far[1], far[2]);
    }
    // Las de las tierras altas (end_gateway_return, salida exacta): a la plataforma de llegada.
    return [END_SPAWN[0] + 0.5, END_SPAWN[1] + 1, END_SPAWN[2] + 0.5];
  }

  /** ¿No hay nada en el chunk de (x, z)? (isChunkEmpty: el terreno del End, sin una sola piedra). */
  private chunkEmpty(x: number, z: number): boolean {
    const gen = this.ctx.world.gen;
    if (!(gen instanceof EndGenerator)) return true;
    const cx = Math.floor(x / 16) * 16, cz = Math.floor(z / 16) * 16;
    for (let lz = 0; lz < 16; lz += 3) for (let lx = 0; lx < 16; lx += 3) if (gen.surfaceAt(cx + lx, cz + lz) >= 0) return false;
    return true;
  }

  /**
   * findOrCreateValidTeleportPos + spawnGatewayPortal: a 1024 bloques en la dirección de la puerta, hacia atrás mientras
   * el chunk tenga isla y hacia delante mientras no (de 16 en 16); allí, la piedra del End con dos de aire encima más
   * cercana al centro (si no hay, una isla nueva a y = 75); la puerta de vuelta, 10 por encima de lo más alto a ±16.
   */
  private makeFarGateway(x: number, z: number): [number, number, number] {
    const d = Math.hypot(x, z) || 1;
    const dx = x / d, dz = z / d;
    let tx = dx * 1024, tz = dz * 1024;
    for (let i = 16; !this.chunkEmpty(tx, tz) && i-- > 0;) {
      tx -= dx * 16;
      tz -= dz * 16;
    }
    for (let i = 16; this.chunkEmpty(tx, tz) && i-- > 0;) {
      tx += dx * 16;
      tz += dz * 16;
    }
    const cx = Math.floor(tx / 16), cz = Math.floor(tz / 16);
    this.load(cx * 16 - 16, cz * 16 - 16, cx * 16 + 31, cz * 16 + 31);
    const w = this.ctx.world;
    let at: [number, number, number] | null = null, best = Infinity;
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) for (let y = 30; y < 128; y++) {
      const bx = cx * 16 + lx, bz = cz * 16 + lz;
      if (w.getBlock(bx, y, bz) !== END_STONE || fullBlock(w.getBlock(bx, y + 1, bz)) || fullBlock(w.getBlock(bx, y + 2, bz))) continue;
      const dist = (bx + 0.5) ** 2 + (y + 0.5) ** 2 + (bz + 0.5) ** 2;
      if (dist < best) {
        best = dist;
        at = [bx, y, bz];
      }
    }
    if (!at) {
      at = [Math.floor(tx + 0.5), 75, Math.floor(tz + 0.5)];
      let size = 4 + Math.floor(this.ctx.rand() * 3);
      for (let dy = 0; size > 0.5; dy--) {
        for (let ox = -Math.ceil(size); ox <= Math.ceil(size); ox++) for (let oz = -Math.ceil(size); oz <= Math.ceil(size); oz++) {
          if (ox * ox + oz * oz <= (size + 1) * (size + 1)) w.setBlock(at[0] + ox, 75 + dy, at[2] + oz, END_STONE);
        }
        size -= Math.floor(this.ctx.rand() * 2) + 0.5;
      }
    }
    const top = this.tallest(at[0], at[1], at[2], 16, true);
    const g: [number, number, number] = [top[0], top[1] + 10, top[2]];
    drawGateway(this.level(), g[0], g[1], g[2]);
    return g;
  }

  /** findTallestBlock: el bloque entero más alto a ±`dist` (sin lecho de roca si no se permite; entonces, sin la columna del centro). */
  private tallest(x: number, y: number, z: number, dist: number, bedrock: boolean): [number, number, number] {
    const w = this.ctx.world;
    this.load(x - dist, z - dist, x + dist, z + dist);
    let best: [number, number, number] | null = null;
    for (let dx = -dist; dx <= dist; dx++) {
      for (let dz = -dist; dz <= dist; dz++) {
        if (dx === 0 && dz === 0 && !bedrock) continue;
        for (let yy = 255; yy > (best ? best[1] : 0); yy--) {
          const id = w.getBlock(x + dx, yy, z + dz);
          if (fullBlock(id) && (bedrock || id !== BEDROCK)) {
            best = [x + dx, yy, z + dz];
            break;
          }
        }
      }
    }
    return best ?? [x, y, z];
  }

  /** findExitPosition: encima de lo más alto (sin lecho de roca) a ±5 de la puerta; si no hay nada, encima de ella. */
  private exitNear(x: number, y: number, z: number): [number, number, number] {
    const t = this.tallest(x, y + 2, z, 5, false);
    return [t[0] + 0.5, t[1] + 1, t[2] + 0.5];
  }

  // ------------------------------------------------------------------ objetos y bloques

  /** Clic derecho con algo: el cristal del End sobre obsidiana o lecho de roca, o el huevo de dragón. */
  use(_s: Session, x: number, y: number, z: number, id: number, item: number): boolean {
    const w = this.ctx.world;
    if (id === DRAGON_EGG) {
      this.eggTeleport(x, y, z);
      return true;
    }
    if (item !== END_CRYSTAL || (id !== OBSIDIAN && id !== BEDROCK)) return false;
    // EndCrystalItem.useOn: el bloque de encima libre y ninguna entidad en la caja de 1 × 2 × 1 de encima.
    if (w.getBlock(x, y + 1, z) !== AIR) return true;
    for (const e of this.ctx.entities.list.values()) {
      const hw = e.width / 2;
      if (!e.dead && e.x + hw > x && e.x - hw < x + 1 && e.z + hw > z && e.z - hw < z + 1 && e.y < y + 3 && e.y + e.height > y + 1) return true;
    }
    this.ctx.entities.dragon.spawnCrystal(x + 0.5, y + 1, z + 0.5, false);
    if (this.active) this.tryRespawn();
    return true;
  }

  /** DragonEggBlock.teleport: hasta 1000 intentos a ±15 en horizontal y ±7 en vertical, a un hueco de aire con algo debajo. */
  private eggTeleport(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const r = () => this.ctx.rand();
    for (let i = 0; i < 1000; i++) {
      const tx = x + Math.floor(r() * 16) - Math.floor(r() * 16), ty = y + Math.floor(r() * 8) - Math.floor(r() * 8), tz = z + Math.floor(r() * 16) - Math.floor(r() * 16);
      if (ty < 1 || w.getBlock(tx, ty, tz) !== AIR || w.getBlock(tx, ty - 1, tz) === AIR) continue;
      w.setBlock(x, y, z, AIR);
      w.setBlock(tx, ty, tz, DRAGON_EGG);
      this.ctx.fx('egg_teleport', x + 0.5, y + 0.5, z + 0.5, tx - x, (ty - y) * 1000 + (tz - z));
      return;
    }
  }

  // ------------------------------------------------------------------ reaparición

  /**
   * tryRespawn: con el dragón muerto, un cristal en cada uno de los cuatro lados del borde del portal de salida (a 3
   * bloques del centro, un bloque por encima). El portal se apaga y empieza la reaparición.
   */
  private tryRespawn(): void {
    if (!this.save.killed || this.respawn || this.dragon()) return;
    const y = this.podiumY() + 1;
    const found: number[] = [];
    for (const [dx, dz] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) {
      const c = [...this.ctx.entities.list.values()].find((e) => e.type === ENT_END_CRYSTAL && !e.dead &&
        e.x + 1 > dx && e.x - 1 < dx + 1 && e.z + 1 > dz && e.z - 1 < dz + 1 && e.y < y + 1 && e.y + 2 > y);
      if (!c) return;
      found.push(c.id);
    }
    this.respawn = { stage: 0, time: 0, spike: 0, crystals: found };
    drawPodium(this.level(), 0, this.podiumY(), 0, false);
    this.beam(found, [0, 128, 0]);
  }

  private beam(ids: number[], to: [number, number, number] | null): void {
    for (const id of ids) {
      const c = this.ctx.entities.list.get(id);
      if (c) c.leash = to ? [to[0], to[1], to[2]] : undefined;
    }
  }

  /** El cristal que se rompe era de los de la reaparición: se aborta (el portal vuelve a encenderse). */
  private onCrystalGone(e: Entity): void {
    const r = this.respawn;
    if (!r || !r.crystals.includes(e.id)) return;
    this.respawn = null;
    this.beam(r.crystals, null);
    this.resetSpikeCrystals();
    drawPodium(this.level(), 0, this.podiumY(), 0, true);
  }

  /** resetSpikeCrystals: los cristales de los pilares vuelven a poder romperse y dejan de apuntar al cielo. */
  private resetSpikeCrystals(): void {
    for (const s of endSpikes(this.ctx.seed)) {
      for (const e of this.ctx.entities.list.values()) {
        if (e.type === ENT_END_CRYSTAL && Math.abs(e.x - s.x - 0.5) < 1 && Math.abs(e.z - s.z - 0.5) < 1 && Math.abs(e.y - s.height - 1) < 1) {
          e.invulnerable = false;
          e.leash = undefined;
        }
      }
    }
  }

  /**
   * DragonRespawnStage: los cristales apuntan al cielo (100 ticks, con rugidos); cada 40 ticks un pilar: los cristales
   * le apuntan y al final se despeja su cima, estalla (potencia 5) y se rehace con un cristal invulnerable que apunta
   * al cielo; luego, 100 ticks apuntando arriba y los cuatro estallan (sin romper nada): el dragón nuevo.
   */
  private respawnTick(): void {
    const r = this.respawn!;
    const t = r.time++;
    const spikes = endSpikes(this.ctx.seed);
    const sky: [number, number, number] = [0, 128, 0];
    if (r.stage === 0) {
      if (t === 0 || t === 50 || t === 51 || t === 52 || t >= 95) this.ctx.fx('dragon_growl', 0.5, 128, 0.5);
      if (t >= 100) {
        r.stage = 1;
        r.time = 0;
      }
    } else if (r.stage === 1) {
      const i = Math.floor(t / 40);
      if (t % 40 === 0) {
        if (i >= spikes.length) {
          r.stage = 2;
          r.time = 0;
          return this.respawnTick();
        }
        const s = spikes[i];
        this.beam(r.crystals, [s.x, s.height + 1, s.z]);
      } else if (t % 40 === 39 && i < spikes.length) {
        const s = spikes[i];
        this.load(s.x - 10, s.z - 10, s.x + 10, s.z + 10);
        const w = this.ctx.world;
        for (let x = s.x - 10; x <= s.x + 10; x++) for (let y = s.height - 10; y <= s.height + 10; y++) for (let z = s.z - 10; z <= s.z + 10; z++) {
          if (w.getBlock(x, y, z) > 0) w.setBlock(x, y, z, AIR);
        }
        this.ctx.entities.explosion?.(s.x + 0.5, s.height, s.z + 0.5, 5, false, true);
        drawSpike(this.level(), s, FIRE);
        const c = this.ctx.entities.dragon.spawnCrystal(s.x + 0.5, s.height + 1, s.z + 0.5, true);
        c.invulnerable = true;
        c.leash = [sky[0], sky[1], sky[2]];
      }
    } else if (r.stage === 2) {
      if (t === 0) this.beam(r.crystals, sky);
      else if (t < 5 || (t >= 80 && t < 100)) this.ctx.fx('dragon_growl', 0.5, 128, 0.5);
      if (t >= 100) {
        this.respawn = null; // antes de las explosiones: los cristales que se alcanzan entre ellos ya no abortan nada
        this.resetSpikeCrystals();
        for (const id of r.crystals) {
          const c = this.ctx.entities.list.get(id);
          if (!c) continue;
          this.ctx.entities.remove(c.id);
          this.ctx.entities.explosion?.(c.x, c.y, c.z, 6, false, false);
        }
        this.ctx.entities.dragon.spawn(0.5, 128, 0.5);
        this.save.killed = false;
        this.persist();
      }
    }
  }
}

/** isCollisionShapeFullBlock: un cubo entero que choca. */
function fullBlock(id: number): boolean {
  return id > 0 && BLOCK_COLLIDE[id] === 1 && BLOCK_OPAQUE[id] === 1;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
