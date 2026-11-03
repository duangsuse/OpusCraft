// Fase 8.6 (el End): el dragón de Ender y los cristales del End, portados de EnderDragon, sus fases
// (DragonPhaseManager) y EndCrystal de la 26.3. Todo va a 20 ticks por segundo, con las unidades de Java (bloques por
// tick y grados); la velocidad de la entidad se pasa a bloques por segundo para el cliente.
// - Vuelo (EnderDragon.aiStep): hacia el objetivo de su fase, girando poco a poco (yRotA), con impulso hacia delante
//   que depende de lo alineado que va y de lo cerca que está; atraviesa los bloques y rompe los que no aguantan
//   (dragon_immune: obsidiana, lecho de roca, piedra del End, barrotes…).
// - Fases: VUELTAS entre los 12 nodos del anillo exterior (a veces cambia de sentido); desde un nodo, a veces se
//   lanza a por un jugador (ACOSO: se acerca y le escupe una bola de fuego) o baja a POSARSE en el podio (con menos
//   cristales, más a menudo). Posado: OTEA (si hay alguien a 20 bloques, le RUGE y le ECHA EL ALIENTO; si no, despega
//   o SE LANZA contra el más cercano), y tras cuatro alientos DESPEGA. Muriendo, vuela al podio y allí se consume.
// - Partes (EnderDragonPart): cabeza, cuello, cuerpo, tres de cola y dos alas; las alas empujan (y hieren 5 si no
//   está posado), la cabeza y el cuello hieren 10. Los golpes que no dan en la cabeza o el cuello hacen un cuarto (+1).
// - Se cura 1 cada 10 ticks con el cristal más cercano (a 32 bloques); si ése estalla, el dragón pierde 10.
import { dragonMaxHealth, DRAGON_HEALTH_PER_PLAYER, FURY_FRACTION, FURY_SPEED, FURY_STRAFE_CHANCE, FURY_FIREBALL_CHARGE, FURY_BURST } from '../../bossRules'; // jefes reforzados
import { MOB_ENDER_DRAGON, ENT_END_CRYSTAL, ENT_DRAGON_FIREBALL, EF_DRAGON_SITTING, EF_DRAGON_LANDING, DRAGON_HEALTH, DRAGON_PARTS, DRAGON_XP_FIRST, DRAGON_XP_AGAIN } from '../../mobs';
import {
  AIR, OBSIDIAN, CRYING_OBSIDIAN, BEDROCK, END_STONE, IRON_BARS, END_PORTAL, END_PORTAL_FRAME, END_GATEWAY, REINFORCED_DEEPSLATE,
  isFire, familyBase, RESPAWN_ANCHOR, BLOCK_FLUID,
} from '../../blocks';
import { lineOfSight } from '../physics';
import { dragonPartOffsets } from '../../dragonParts';
import type { Entities } from './Entities';
import type { Entity, PlayerView } from './types';
import { ENT_EFFECT_CLOUD } from '../../potions';
import { instantHarm, EFFECT_INSTANT_DAMAGE } from '../../effects';

const DEG = Math.PI / 180;
const wrapDeg = (a: number) => {
  let d = a % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export type DragonPhase =
  | 'holding' | 'strafe' | 'landing_approach' | 'landing' | 'takeoff' | 'sitting_flaming' | 'sitting_scanning' | 'sitting_attacking'
  | 'charging' | 'dying' | 'hovering';
const SITTING: ReadonlySet<DragonPhase> = new Set(['sitting_flaming', 'sitting_scanning', 'sitting_attacking']);

/** Lo que el dragón necesita del combate (el sistema del End del servidor). */
export interface DragonFight {
  /** Donde se posa (el primer bloque libre encima de la columna del podio). */
  podium(): [number, number, number];
  /** Cristales que quedan en los pilares. */
  crystalsAlive(): number;
  /** ¿Ya se mató algún dragón? (la experiencia es menor). */
  previouslyKilled(): boolean;
  /** Termina de morir: el portal se enciende, sale el huevo y una puerta del End. */
  onDragonKilled(e: Entity): void;
}

interface Box {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
}

/** Estado del dragón (lo que en Java son sus campos y los de la fase actual). */
export interface DragonState {
  phase: DragonPhase;
  /** Ticks en la fase (y los de sus contadores propios). */
  time: number;
  yRot: number;
  yRotA: number;
  xRot: number;
  vel: [number, number, number];
  target: [number, number, number] | null;
  /** Historia de [yRot, y] (64 ticks) para las partes de atrás (getLatencyPos). */
  history: Float64Array;
  ptr: number;
  clockwise: boolean;
  /** Camino pendiente (nodos) de la fase. */
  path: number[];
  pathEnd: [number, number, number] | null;
  attackTarget: string | null;
  fireballCharge: number;
  flameCount: number;
  sittingDamage: number;
  growlIn: number;
  crystal: number | null;
  deathTime: number;
  firstTick: boolean;
  inWall: boolean;
  hurtTime: number;
  parts: Box[];
  acc: number;
  /** Jefes reforzados (bossRules.ts): vida máxima, jugadores con los que se ha peleado (el máximo) y furia. */
  maxHealth: number;
  fighters: number;
  fury: boolean;
}

/** Los 24 nodos por los que vuela (findClosestNode): 12 fuera a 60, 8 a 40 (10 más altos) y 4 a 20. */
function nodePositions(top: (x: number, z: number) => number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < 24; i++) {
    let yAdj = 5, x: number, z: number;
    if (i < 12) {
      x = Math.floor(60 * Math.cos(2 * (-Math.PI + (Math.PI / 12) * i)));
      z = Math.floor(60 * Math.sin(2 * (-Math.PI + (Math.PI / 12) * i)));
    } else if (i < 20) {
      const k = i - 12;
      x = Math.floor(40 * Math.cos(2 * (-Math.PI + (Math.PI / 8) * k)));
      z = Math.floor(40 * Math.sin(2 * (-Math.PI + (Math.PI / 8) * k)));
      yAdj += 10;
    } else {
      const k = i - 20;
      x = Math.floor(20 * Math.cos(2 * (-Math.PI + (Math.PI / 4) * k)));
      z = Math.floor(20 * Math.sin(2 * (-Math.PI + (Math.PI / 4) * k)));
    }
    out.push([x, Math.max(73, top(x, z) + yAdj), z]);
  }
  return out;
}

/** ¿Lo rompe el dragón al atravesarlo? (lo que no es dragon_immune ni dragon_transparent). */
function dragonBreaks(id: number): boolean {
  if (id <= 0 || isFire(id) || BLOCK_FLUID[id]) return false;
  const b = familyBase(id);
  return !(id === OBSIDIAN || id === CRYING_OBSIDIAN || id === BEDROCK || id === END_STONE || id === IRON_BARS || id === END_PORTAL ||
    b === END_PORTAL_FRAME || id === END_GATEWAY || id === REINFORCED_DEEPSLATE || b === RESPAWN_ANCHOR);
}

export class EnderDragonAI {
  fight: DragonFight | null = null;
  /** La parte del próximo golpe cuerpo a cuerpo (la elige el que ataca con su mirada). */
  pendingPart = -1;
  private readonly states = new Map<number, DragonState>();
  private nodes: [number, number, number][] | null = null;

  constructor(private m: Entities) {
    m.custom.set(MOB_ENDER_DRAGON, (e, dt) => this.tick(e, dt));
    m.custom.set(ENT_END_CRYSTAL, (e) => this.crystalTick(e));
    m.custom.set(ENT_DRAGON_FIREBALL, (e, dt) => this.fireballTick(e, dt));
  }

  // ------------------------------------------------------------------ aparición

  /** Un dragón nuevo en (x, y, z), en la fase de vueltas. */
  spawn(x: number, y: number, z: number): Entity | null {
    const e = this.m.spawnMob(MOB_ENDER_DRAGON, x, y, z);
    if (!e) return null;
    e.persist = true;
    e.health = DRAGON_HEALTH;
    this.state(e);
    return e;
  }

  /** Un cristal del End (con su base de lecho de roca a la vista si `bottom`). */
  spawnCrystal(x: number, y: number, z: number, bottom: boolean): Entity {
    const e = this.m.spawnBare(ENT_END_CRYSTAL, x, y, z, 2, 2);
    e.persist = true;
    e.variant = bottom ? 1 : 0;
    return e;
  }

  state(e: Entity): DragonState {
    let s = this.states.get(e.id);
    if (!s) {
      s = {
        phase: 'holding', time: 0, yRot: -e.yaw / DEG, yRotA: 0, xRot: 0, vel: [0, 0, 0], target: null, history: new Float64Array(128),
        ptr: -1, clockwise: true, path: [], pathEnd: null, attackTarget: null, fireballCharge: 0, flameCount: 0, sittingDamage: 0,
        growlIn: 100, crystal: null, deathTime: 0, firstTick: true, inWall: false, hurtTime: 0, parts: DRAGON_PARTS.map(() => ({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 })),
        acc: 0,
        maxHealth: Math.max(DRAGON_HEALTH, e.health), fighters: 1, fury: false,
      };
      s.fighters = 1 + Math.ceil((s.maxHealth - DRAGON_HEALTH) / DRAGON_HEALTH_PER_PLAYER);
      this.states.set(e.id, s);
    }
    return s;
  }

  /** Los dragones vivos (o muriendo). */
  dragons(): Entity[] {
    return [...this.m.list.values()].filter((e) => e.type === MOB_ENDER_DRAGON);
  }

  private node(i: number): [number, number, number] {
    if (!this.nodes) {
      const w = this.m.w;
      this.nodes = nodePositions((x, z) => {
        for (let y = 127; y > 0; y--) if (w.getBlock(x, y, z) > 0) return y + 1;
        return 0;
      });
    }
    return this.nodes[i];
  }

  /** findClosestNode(x, y, z): el nodo más cercano a menos de 100 bloques (sin cristales, sólo los de dentro). */
  private closestNode(x: number, y: number, z: number): number {
    const crystals = this.fight?.crystalsAlive() ?? 0;
    let best = 0, bd = 10000;
    for (let i = crystals === 0 ? 12 : 0; i < 24; i++) {
      const [nx, ny, nz] = this.node(i);
      const d = (nx - x) ** 2 + (ny - y) ** 2 + (nz - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ historia y partes

  private latency(s: DragonState, step: number): [number, number] {
    const i = ((s.ptr - step) & 63) * 2;
    return [s.history[i], s.history[i + 1]];
  }

  private record(s: DragonState, y: number): void {
    if (s.ptr < 0) {
      for (let i = 0; i < 64; i++) {
        s.history[i * 2] = s.yRot;
        s.history[i * 2 + 1] = y;
      }
      s.ptr = 0;
    }
    s.ptr = (s.ptr + 1) & 63;
    s.history[s.ptr * 2] = s.yRot;
    s.history[s.ptr * 2 + 1] = y;
  }

  /** Coloca las partes (EnderDragon.aiStep: tickPart). */
  private placeParts(e: Entity, s: DragonState): void {
    const offs = dragonPartOffsets(s.yRot, s.yRotA, (n) => this.latency(s, n), SITTING.has(s.phase));
    offs.forEach(([dx, dy, dz], i) => {
      const [, w, h] = DRAGON_PARTS[i];
      const b = s.parts[i];
      const x = e.x + dx, y = e.y + dy, z = e.z + dz;
      b.x0 = x - w / 2; b.x1 = x + w / 2; b.y0 = y; b.y1 = y + h; b.z0 = z - w / 2; b.z1 = z + w / 2;
    });
  }

  /** Parte más cercana a un punto (para saber qué parte recibe un golpe). */
  partAt(e: Entity, x: number, y: number, z: number): number {
    const s = this.state(e);
    let best = 2, bd = Infinity;
    s.parts.forEach((b, i) => {
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Parte a la que apunta un rayo (el primer choque), o −1. */
  partOnRay(e: Entity, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number): number {
    const s = this.state(e);
    let best = -1, bt = reach;
    s.parts.forEach((b, i) => {
      let t0 = 0, t1 = bt;
      for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]] as const) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) t0 = Infinity;
          continue;
        }
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
      }
      if (t0 <= t1 && t0 < bt) {
        bt = t0;
        best = i;
      }
    });
    return best;
  }

  // ------------------------------------------------------------------ fases

  private setPhase(e: Entity, s: DragonState, p: DragonPhase): void {
    if (s.phase === 'dying' && p !== 'dying') return;
    if (s.phase === 'sitting_flaming' && p !== 'sitting_flaming') this.flameEnd();
    s.phase = p;
    s.time = 0;
    s.target = null;
    s.path = [];
    s.pathEnd = null;
    s.firstTick = true;
    if (p === 'strafe') s.fireballCharge = 0;
    if (p === 'sitting_flaming') s.flameCount++;
    if (p === 'sitting_attacking') this.m.host.fx('dragon_growl', e.x, e.y, e.z);
    this.flags(e, s);
  }

  private flameEnd(): void {
    // La nube del aliento posado dura sus 200 ticks sola (Java la quita al cambiar de fase: se deja expirar).
  }

  private flags(e: Entity, s: DragonState): void {
    e.flags = (e.flags & ~(EF_DRAGON_SITTING | EF_DRAGON_LANDING)) | (SITTING.has(s.phase) ? EF_DRAGON_SITTING : 0) |
      (s.phase === 'landing' || s.phase === 'takeoff' ? EF_DRAGON_LANDING : 0);
  }

  private flySpeed(s: DragonState): number {
    const base = s.phase === 'landing' ? 1.5 : s.phase === 'charging' || s.phase === 'dying' ? 3 : 0.6;
    return s.fury && s.phase !== 'landing' && s.phase !== 'dying' ? base * FURY_SPEED : base;
  }

  /** Vida máxima del dragón (200, o más con los jefes reforzados y un grupo). */
  maxHealth(e: Entity): number {
    return this.state(e).maxHealth;
  }

  /** ¿Está enfurecido? (jefes reforzados, por debajo de un cuarto de su vida). */
  furious(e: Entity): boolean {
    return this.state(e).fury;
  }

  /** Pone la vida máxima guardada (tras reiniciar el servidor). */
  setMaxHealth(e: Entity, max: number): void {
    const s = this.state(e);
    s.maxHealth = Math.max(DRAGON_HEALTH, max);
    s.fighters = 1 + Math.ceil((s.maxHealth - DRAGON_HEALTH) / DRAGON_HEALTH_PER_PLAYER);
  }

  /**
   * Jefes reforzados: cada segundo cuenta los jugadores de la pelea (en la isla, a 150 bloques del podio); por cada uno
   * de más que llegue, 100 de vida más (y de máximo). Por debajo de un cuarto, se enfurece.
   */
  private reinforce(e: Entity, s: DragonState): void {
    if (!this.m.host.hardBosses() || s.phase === 'dying' || e.health <= 0) return;
    if (s.time % 20 === 0) {
      const podium = this.fight?.podium() ?? [0, 64, 0];
      const n = this.m.host.players().filter((p) => p.alive && !p.creative && Math.hypot(p.x - podium[0], p.z - podium[2]) <= 150).length;
      if (n > s.fighters) {
        const extra = dragonMaxHealth(n) - dragonMaxHealth(s.fighters);
        s.fighters = n;
        s.maxHealth += extra;
        e.health += extra;
      }
    }
    if (!s.fury && e.health <= s.maxHealth * FURY_FRACTION) {
      s.fury = true;
      s.growlIn = 200;
      this.m.host.fx('dragon_growl', e.x, e.y, e.z);
      this.m.host.fx('dragon_fury', e.x, e.y, e.z);
    }
  }

  private turnSpeed(s: DragonState): number {
    const rot = Math.hypot(s.vel[0], s.vel[2]) + 1;
    const dist = Math.min(rot, 40);
    return s.phase === 'landing' ? dist / rot : 0.7 / dist / rot;
  }

  private nearestPlayer(x: number, y: number, z: number, range: number, filter?: (p: PlayerView) => boolean): PlayerView | null {
    let best: PlayerView | null = null, bd = range * range;
    for (const p of this.m.host.players()) {
      if (!p.alive || p.creative || (filter && !filter(p))) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** navigateToNextPathNode: el siguiente nodo, a una altura de entre la suya y 20 más. */
  private nextNode(s: DragonState): void {
    if (s.path.length === 0) {
      if (s.pathEnd) {
        s.target = s.pathEnd;
        s.pathEnd = null;
      }
      return;
    }
    const [x, y, z] = this.node(s.path.shift()!);
    s.target = [x, y + this.m.rand() * 20, z];
  }

  private pathDone(s: DragonState): boolean {
    return s.path.length === 0 && !s.pathEnd;
  }

  /** De un nodo a otro: si no son vecinos del anillo, pasando por el anillo (como el grafo de nodos de Java). */
  private findPath(from: number, to: number, end: [number, number, number] | null, s: DragonState): void {
    s.path = from === to ? [] : from >= 12 && to < 12 ? [this.ringNear(from), to] : [to];
    s.pathEnd = end;
  }

  private ringNear(inner: number): number {
    const [x, , z] = this.node(inner);
    let best = 0, bd = Infinity;
    for (let i = 0; i < 12; i++) {
      const [nx, , nz] = this.node(i);
      const d = (nx - x) ** 2 + (nz - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private holdingNewTarget(e: Entity, s: DragonState): void {
    const podium = this.fight?.podium() ?? [0, 64, 0];
    if (s.path.length === 0 && s.target) {
      const crystals = this.fight?.crystalsAlive() ?? 0;
      // Furia (jefes reforzados): la mitad de las veces va directo a por el jugador más cercano.
      if (s.fury && this.m.rand() < FURY_STRAFE_CHANCE) {
        const q = this.nearestPlayer(e.x, e.y, e.z, 150);
        if (q) return this.strafe(e, s, q);
      }
      if (Math.floor(this.m.rand() * (crystals + 3)) === 0) return this.setPhase(e, s, 'landing_approach');
      const p = this.nearestPlayer(podium[0], podium[1], podium[2], 128);
      const dist = p ? ((p.x - podium[0]) ** 2 + (p.y - podium[1]) ** 2 + (p.z - podium[2]) ** 2) / 512 : 64;
      if (p && (Math.floor(this.m.rand() * (Math.abs(dist) + 2)) === 0 || Math.floor(this.m.rand() * (crystals + 2)) === 0)) {
        this.strafe(e, s, p);
        return;
      }
    }
    if (s.path.length === 0) {
      const cur = this.closestNode(e.x, e.y, e.z);
      let to = cur;
      if (this.m.rand() < 1 / 8) {
        // Al cambiar de sentido cruza al otro lado del anillo.
        s.clockwise = !s.clockwise;
        to = cur + 6;
      }
      to += s.clockwise ? 1 : -1;
      to = ((to % 12) + 12) % 12;
      this.findPath(cur, to, null, s);
    }
    this.nextNode(s);
  }

  /** DragonStrafePlayerPhase.setTarget: camino al nodo del jugador y, al final, encima de él. */
  private strafe(e: Entity, s: DragonState, p: PlayerView): void {
    this.setPhase(e, s, 'strafe');
    s.attackTarget = p.id;
    const cur = this.closestNode(e.x, e.y, e.z), to = this.closestNode(p.x, p.y, p.z);
    const fx = Math.floor(p.x), fz = Math.floor(p.z);
    const sd = Math.hypot(fx - e.x, fz - e.z);
    this.findPath(cur, to, [fx, Math.floor(p.y + Math.min(0.4 + sd / 80 - 1, 10)), fz], s);
    this.nextNode(s);
  }

  private phaseTick(e: Entity, s: DragonState): void {
    const d2 = (t: [number, number, number] | null) => (t ? (t[0] - e.x) ** 2 + (t[1] - e.y) ** 2 + (t[2] - e.z) ** 2 : 0);
    s.time++;
    switch (s.phase) {
      case 'holding': {
        const d = d2(s.target);
        if (!s.target || d < 100 || d > 22500) this.holdingNewTarget(e, s);
        return;
      }
      case 'strafe': {
        const t = this.m.host.players().find((p) => p.id === s.attackTarget && p.alive && !p.creative);
        if (!t) return this.setPhase(e, s, 'holding');
        if (this.pathDone(s)) {
          const dist = Math.hypot(t.x - e.x, t.z - e.z);
          s.target = [t.x, t.y + Math.min(0.4 + dist / 80 - 1, 10), t.z];
        }
        const d = d2(s.target);
        if (d < 100 || d > 22500) {
          if (s.path.length === 0) {
            const cur = this.closestNode(e.x, e.y, e.z);
            let to = cur;
            if (this.m.rand() < 1 / 8) {
              s.clockwise = !s.clockwise;
              to = cur + 6;
            }
            to += s.clockwise ? 1 : -1;
            this.findPath(cur, (this.fight?.crystalsAlive() ?? 0) > 0 ? ((to % 12) + 12) % 12 : (((to - 12) & 7) + 12), null, s);
          }
          this.nextNode(s);
        }
        const td2 = (t.x - e.x) ** 2 + (t.y - e.y) ** 2 + (t.z - e.z) ** 2;
        if (td2 < 4096 && lineOfSight(this.m.w, e.x, e.y + 2, e.z, t.x, t.y + 1.6, t.z)) {
          s.fireballCharge++;
          const ax = t.x - e.x, az = t.z - e.z, al = Math.hypot(ax, az) || 1;
          const dot = (Math.sin(s.yRot * DEG) * ax - Math.cos(s.yRot * DEG) * az) / al;
          const angle = Math.acos(clamp(dot, -1, 1)) / DEG + 0.5;
          if (s.fireballCharge >= (s.fury ? FURY_FIREBALL_CHARGE : 5) && angle < 10) {
            const head = s.parts[0];
            const vx = -Math.sin(s.yRot * DEG), vz = Math.cos(s.yRot * DEG);
            const sx = (head.x0 + head.x1) / 2 - vx, sy = (head.y0 + head.y1) / 2 + 0.5, sz = (head.z0 + head.z1) / 2 - vz;
            this.shootFireball(e, sx, sy, sz, t.x - sx, t.y + 0.9 - sy, t.z - sz);
            // Furia: dos más a los lados (a 3 bloques del jugador), para que apartarse un poco no baste.
            if (s.fury) {
              const px = -(t.z - sz), pz = t.x - sx, pl = Math.hypot(px, pz) || 1;
              for (let k = 1; k < FURY_BURST; k++) {
                const side = k % 2 ? 3 : -3;
                this.shootFireball(e, sx, sy, sz, t.x + (px / pl) * side - sx, t.y + 0.9 - sy, t.z + (pz / pl) * side - sz);
              }
            }
            s.fireballCharge = 0;
            this.setPhase(e, s, 'holding');
          }
        } else if (s.fireballCharge > 0) s.fireballCharge--;
        return;
      }
      case 'landing_approach': {
        const d = d2(s.target);
        if (!s.target || d < 100 || d > 22500) {
          if (this.pathDone(s) || !s.target) {
            const cur = this.closestNode(e.x, e.y, e.z);
            const podium = this.fight?.podium() ?? [0, 64, 0];
            const p = this.nearestPlayer(podium[0], podium[1], podium[2], 128);
            let to: number;
            if (p) {
              const l = Math.hypot(p.x, p.z) || 1;
              to = this.closestNode((-p.x / l) * 40, 105, (-p.z / l) * 40);
            } else to = this.closestNode(40, podium[1], 0);
            this.findPath(cur, to, [podium[0] + 0.5, podium[1], podium[2] + 0.5], s);
          }
          this.nextNode(s);
          if (this.pathDone(s)) this.setPhase(e, s, 'landing');
        }
        return;
      }
      case 'landing': {
        const podium = this.fight?.podium() ?? [0, 64, 0];
        s.target = [podium[0] + 0.5, podium[1], podium[2] + 0.5];
        if (d2(s.target) < 1) {
          s.flameCount = 0;
          this.setPhase(e, s, 'sitting_scanning');
        }
        return;
      }
      case 'sitting_scanning': {
        const t = this.nearestPlayer(e.x, e.y, e.z, 20, (p) => Math.abs(p.y - e.y) <= 10);
        if (t) {
          if (s.time > 25) return this.setPhase(e, s, 'sitting_attacking');
          const ax = t.x - e.x, az = t.z - e.z, al = Math.hypot(ax, az) || 1;
          const dot = (Math.sin(s.yRot * DEG) * ax - Math.cos(s.yRot * DEG) * az) / al;
          const angle = Math.acos(clamp(dot, -1, 1)) / DEG + 0.5;
          if (angle > 10) {
            const head = s.parts[0];
            const hx = t.x - (head.x0 + head.x1) / 2, hz = t.z - (head.z0 + head.z1) / 2;
            const yRotD = clamp(wrapDeg(180 - Math.atan2(hx, hz) / DEG - s.yRot), -100, 100);
            s.yRotA *= 0.8;
            let rot = Math.hypot(hx, hz) + 1;
            const dist = rot;
            if (rot > 40) rot = 40;
            s.yRotA += yRotD * (0.7 / rot / dist);
            s.yRot += s.yRotA;
          }
        } else if (s.time >= 100) {
          const far = this.nearestPlayer(e.x, e.y, e.z, 150);
          this.setPhase(e, s, 'takeoff');
          if (far) {
            this.setPhase(e, s, 'charging');
            s.target = [far.x, far.y, far.z];
          }
        }
        return;
      }
      case 'sitting_attacking':
        if (s.time >= 40) this.setPhase(e, s, 'sitting_flaming');
        return;
      case 'sitting_flaming':
        if (s.time >= 200) return this.setPhase(e, s, s.flameCount >= 4 ? 'takeoff' : 'sitting_scanning');
        if (s.time === 10) {
          // El aliento: una nube de 5 de radio en el suelo, delante de la cabeza.
          const head = s.parts[0];
          const hx = (head.x0 + head.x1) / 2, hz = (head.z0 + head.z1) / 2, hy = head.y0 + 0.5;
          const lx = hx - e.x, lz = hz - e.z, ll = Math.hypot(lx, lz) || 1;
          const x = hx + (lx / ll) * 2.5, z = hz + (lz / ll) * 2.5;
          let y = hy;
          while (y > 0 && this.m.w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === AIR) y--;
          if (y <= 0) y = hy;
          this.breathCloud(x, Math.floor(y) + 1, z, 5, 10, 0, 0, e.id);
          this.m.host.fx('dragon_breath', hx, hy, hz, (lx / ll) * 100, (lz / ll) * 100);
        }
        return;
      case 'takeoff': {
        const podium = this.fight?.podium() ?? [0, 64, 0];
        if (!s.firstTick && s.target) {
          if (Math.hypot(e.x - podium[0] - 0.5, e.y - podium[1], e.z - podium[2] - 0.5) >= 10) this.setPhase(e, s, 'holding');
        } else {
          s.firstTick = false;
          const cur = this.closestNode(e.x, e.y, e.z);
          const fx = Math.sin(s.yRot * DEG), fz = -Math.cos(s.yRot * DEG);
          let to = this.closestNode(fx * 40, 105, fz * 40);
          to = (this.fight?.crystalsAlive() ?? 0) > 0 ? ((to % 12) + 12) % 12 : (((to - 12) & 7) + 12);
          this.findPath(cur, to, null, s);
          this.nextNode(s);
        }
        return;
      }
      case 'charging': {
        if (!s.target) return this.setPhase(e, s, 'holding');
        if (s.fireballCharge > 0 && s.fireballCharge++ >= 10) return this.setPhase(e, s, 'holding');
        const d = d2(s.target);
        if (d < 100 || d > 22500) s.fireballCharge++;
        return;
      }
      case 'dying': {
        const podium = this.fight?.podium() ?? [0, 64, 0];
        if (!s.target) s.target = [podium[0] + 0.5, podium[1], podium[2] + 0.5];
        const d = d2(s.target);
        if (d < 100 || d > 22500) e.health = 0;
        else e.health = 1;
        return;
      }
      case 'hovering':
        return;
    }
  }

  // ------------------------------------------------------------------ tick

  private tick(e: Entity, dt: number): void {
    const s = this.state(e);
    s.acc += dt;
    while (s.acc >= 0.05) {
      s.acc -= 0.05;
      this.javaTick(e, s);
      if (!this.m.list.has(e.id)) return;
    }
    e.vx = s.vel[0] * 20;
    e.vy = s.vel[1] * 20;
    e.vz = s.vel[2] * 20;
    e.yaw = e.bodyYaw = -s.yRot * DEG;
    e.variant = Math.min(255, s.deathTime);
    this.flags(e, s);
  }

  private javaTick(e: Entity, s: DragonState): void {
    this.record(s, e.y);
    if (s.hurtTime > 0) s.hurtTime--;
    if (e.health <= 0 && s.phase !== 'dying' && !SITTING.has(s.phase)) {
      e.health = 1;
      this.setPhase(e, s, 'dying');
    }
    if (e.health <= 0) {
      this.tickDeath(e, s);
      return;
    }
    this.checkCrystals(e, s);
    this.reinforce(e, s);
    const was = s.phase;
    this.phaseTick(e, s);
    if (s.phase !== was && e.health > 0) this.phaseTick(e, s); // la fase nueva actúa en el mismo tick
    if (e.health <= 0) return;
    const t = s.target;
    if (t && !SITTING.has(s.phase)) {
      const xd = t[0] - e.x, zd = t[2] - e.z;
      let yd = t[1] - e.y;
      const dist2 = xd * xd + yd * yd + zd * zd;
      const max = this.flySpeed(s);
      const hd = Math.hypot(xd, zd);
      if (hd > 0) yd = clamp(yd / hd, -max, max);
      s.vel[1] += yd * 0.01;
      s.yRot = wrapDeg(s.yRot);
      const al = Math.sqrt(dist2) || 1;
      const fx = Math.sin(s.yRot * DEG), fz = -Math.cos(s.yRot * DEG);
      const dl = Math.hypot(fx, s.vel[1], fz) || 1;
      const dot = Math.max(((fx * xd + s.vel[1] * (t[1] - e.y) + fz * zd) / (al * dl) + 0.5) / 1.5, 0);
      if (Math.abs(xd) > 1e-5 || Math.abs(zd) > 1e-5) {
        const yRotD = clamp(wrapDeg(180 - Math.atan2(xd, zd) / DEG - s.yRot), -50, 50);
        s.yRotA *= 0.8;
        s.yRotA += yRotD * this.turnSpeed(s);
        s.yRot += s.yRotA * 0.1;
      }
      const span = 2 / (dist2 + 1);
      const push = 0.06 * (dot * span + (1 - span));
      s.vel[0] += Math.sin(s.yRot * DEG) * push;
      s.vel[2] += -Math.cos(s.yRot * DEG) * push;
      const k = s.inWall ? 0.8 : 1;
      e.x += s.vel[0] * k;
      e.y += s.vel[1] * k;
      e.z += s.vel[2] * k;
      const vl = Math.hypot(s.vel[0], s.vel[1], s.vel[2]) || 1;
      const nd = Math.hypot(fx, s.vel[1], fz) || 1;
      const slide = 0.8 + (0.15 * ((s.vel[0] * fx + s.vel[1] * s.vel[1] + s.vel[2] * fz) / (vl * nd) + 1)) / 2;
      s.vel[0] *= slide;
      s.vel[1] *= 0.91;
      s.vel[2] *= slide;
    } else s.vel = [0, 0, 0];
    this.placeParts(e, s);
    this.contact(e, s);
    const head = s.parts[0], neck = s.parts[1], body = s.parts[2];
    s.inWall = this.checkWalls(head) || this.checkWalls(neck) || this.checkWalls(body);
    // Gruñe de vez en cuando (si no está posado).
    if (!SITTING.has(s.phase) && --s.growlIn < 0) {
      this.m.host.fx('dragon_growl', e.x, e.y, e.z);
      s.growlIn = 200 + Math.floor(this.m.rand() * 200);
    }
  }

  /** Alas que empujan (y hieren si no está posado) y cabeza y cuello que hieren (si no acaba de recibir un golpe). */
  private contact(e: Entity, s: DragonState): void {
    if (s.hurtTime > 0) return;
    const sitting = SITTING.has(s.phase);
    const body = s.parts[2];
    const bcx = (body.x0 + body.x1) / 2, bcz = (body.z0 + body.z1) / 2;
    const scale = this.m.difficultyScale();
    const inBox = (p: PlayerView, b: Box, gx: number, gy: number, gz: number, oy: number) =>
      p.x + 0.3 > b.x0 - gx && p.x - 0.3 < b.x1 + gx && p.y + 1.8 > b.y0 - gy + oy && p.y < b.y1 + gy + oy && p.z + 0.3 > b.z0 - gz && p.z - 0.3 < b.z1 + gz;
    for (const p of this.m.host.players()) {
      if (!p.alive || p.creative) continue;
      if (inBox(p, s.parts[6], 4, 2, 4, -2) || inBox(p, s.parts[7], 4, 2, 4, -2)) {
        const xd = p.x - bcx, zd = p.z - bcz, dd = Math.max(xd * xd + zd * zd, 0.1);
        const k = Math.min(30, 80 / Math.sqrt(dd));
        const hl = Math.hypot(xd, zd) || 1;
        this.m.host.hurtPlayer(p.id, sitting ? 0 : 5 * scale, (xd / hl) * k, 4, (zd / hl) * k, 'ender_dragon');
      }
      if (inBox(p, s.parts[0], 1, 1, 1, 0) || inBox(p, s.parts[1], 1, 1, 1, 0)) this.m.host.hurtPlayer(p.id, 10 * scale, 0, 2, 0, 'ender_dragon');
    }
    // Las criaturas que toca también salen despedidas.
    for (const o of this.m.list.values()) {
      if (!o.ai || o.dead || o.type === MOB_ENDER_DRAGON) continue;
      for (const w of [s.parts[6], s.parts[7]]) {
        if (o.x > w.x0 - 4 && o.x < w.x1 + 4 && o.y + o.height > w.y0 - 4 && o.y < w.y1 && o.z > w.z0 - 4 && o.z < w.z1 + 4) {
          const xd = o.x - bcx, zd = o.z - bcz, dd = Math.max(xd * xd + zd * zd, 0.1);
          o.vx += (xd / dd) * 80;
          o.vz += (zd / dd) * 80;
          o.vy += 4;
          if (!sitting) this.m.damage(o, 5, bcx, bcz, e.id, 0);
        }
      }
    }
  }

  /** checkWalls: rompe lo que no aguanta en la caja; true si hay algo que no puede romper. */
  private checkWalls(b: Box): boolean {
    const w = this.m.w;
    let wall = false, broke = false;
    for (let x = Math.floor(b.x0); x <= Math.floor(b.x1); x++) {
      for (let y = Math.floor(b.y0); y <= Math.floor(b.y1); y++) {
        for (let z = Math.floor(b.z0); z <= Math.floor(b.z1); z++) {
          const id = w.getBlock(x, y, z);
          if (id <= 0 || isFire(id) || BLOCK_FLUID[id]) continue;
          if (dragonBreaks(id)) {
            this.m.host.breakBlock(x, y, z, false);
            broke = true;
          } else wall = true;
        }
      }
    }
    if (broke) this.m.host.fx('dragon_break', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    return wall;
  }

  /** checkCrystals: se cura con el cristal más cercano (lo busca de vez en cuando, a 32 bloques). */
  private checkCrystals(e: Entity, s: DragonState): void {
    if (s.crystal !== null) {
      const c = this.m.list.get(s.crystal);
      if (!c || c.dead) s.crystal = null;
      else if (s.time % 10 === 0 && e.health < s.maxHealth) e.health = Math.min(s.maxHealth, e.health + 1);
    }
    if (this.m.rand() < 0.1) {
      let best: Entity | null = null, bd = Infinity;
      for (const c of this.m.list.values()) {
        if (c.type !== ENT_END_CRYSTAL || c.dead) continue;
        if (Math.abs(c.x - e.x) > 40 || Math.abs(c.y - e.y) > 36 || Math.abs(c.z - e.z) > 40) continue;
        const d = (c.x - e.x) ** 2 + (c.y - e.y) ** 2 + (c.z - e.z) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      s.crystal = best ? best.id : null;
    }
  }

  /** tickDeath: sube despacio 200 ticks soltando experiencia; al final, el combate termina. */
  private tickDeath(e: Entity, s: DragonState): void {
    s.deathTime++;
    const xp = this.fight && !this.fight.previouslyKilled() ? DRAGON_XP_FIRST : DRAGON_XP_AGAIN;
    if (s.deathTime > 150 && s.deathTime % 5 === 0) this.m.xp.spawn(Math.floor(xp * 0.08), e.x, e.y, e.z);
    if (s.deathTime === 1) this.m.host.fx('dragon_death', e.x, e.y, e.z);
    e.y += 0.1;
    s.vel = [0, 0.1, 0];
    this.placeParts(e, s);
    if (s.deathTime >= 200) {
      this.m.xp.spawn(Math.floor(xp * 0.2), e.x, e.y, e.z);
      this.fight?.onDragonKilled(e);
      this.states.delete(e.id);
      this.m.remove(e.id);
    }
  }

  // ------------------------------------------------------------------ daño

  /**
   * EnderDragon.hurt(part, …): muriendo no le pasa nada; posado, las flechas rebotan; fuera de la cabeza, un cuarto
   * más 1. Si baja de 0 sin estar posado, va a morir al podio; posado, si pierde más de 50 despega.
   */
  hurt(e: Entity, part: number, amount: number, attacker: string | number | null, arrow = false): boolean {
    const s = this.state(e);
    if (s.phase === 'dying' || e.health <= 0) return false;
    if (SITTING.has(s.phase) && arrow) return false;
    if (part !== 0 && part !== 1) amount = amount / 4 + Math.min(amount, 1);
    if (amount < 0.01) return false;
    if (typeof attacker !== 'string' && attacker !== null) return false;
    const before = e.health;
    e.health -= amount;
    s.hurtTime = 10;
    e.hurt = 0;
    this.m.host.fx('mob_hurt', e.x, e.y + 4, e.z, e.type);
    if (e.health <= 0 && !SITTING.has(s.phase)) {
      e.health = 1;
      this.setPhase(e, s, 'dying');
    }
    if (SITTING.has(s.phase)) {
      s.sittingDamage += before - Math.max(0, e.health);
      if (s.sittingDamage > 0.25 * s.maxHealth) {
        s.sittingDamage = 0;
        this.setPhase(e, s, 'takeoff');
      }
    }
    return true;
  }

  /**
   * Una flecha en (x, y, z): contra una parte del dragón (posado, rebota y arde: true sin herir) o contra un cristal
   * (estalla). true si la flecha ya no sigue.
   */
  arrowHit(a: Entity, dmg: number): boolean {
    for (const e of this.dragons()) {
      if (e.health <= 0) continue;
      const s = this.state(e);
      const i = s.parts.findIndex((b) => a.x > b.x0 && a.x < b.x1 && a.y > b.y0 && a.y < b.y1 && a.z > b.z0 && a.z < b.z1);
      if (i < 0) continue;
      if (SITTING.has(s.phase)) {
        a.vx *= -0.1;
        a.vy *= -0.1;
        a.vz *= -0.1;
        a.arrowFire = true;
        return false;
      }
      this.hurt(e, i, dmg, typeof a.shooter === 'string' ? a.shooter : null, true);
      this.m.host.fx('arrow_hit', a.x, a.y, a.z);
      this.m.remove(a.id);
      return true;
    }
    for (const c of this.m.list.values()) {
      if (c.type !== ENT_END_CRYSTAL || c.dead) continue;
      if (Math.abs(c.x - a.x) < 1 && Math.abs(c.z - a.z) < 1 && a.y > c.y && a.y < c.y + 2) {
        this.m.remove(a.id);
        this.crystalHit(c, typeof a.shooter === 'string' ? a.shooter : null);
        return true;
      }
    }
    return false;
  }

  /** Distancia de un punto a la parte más cercana del dragón (el alcance de los golpes). */
  distanceToParts(e: Entity, x: number, y: number, z: number): number {
    const s = this.state(e);
    let bd = Infinity;
    for (const b of s.parts) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      bd = Math.min(bd, Math.hypot(dx, dy, dz));
    }
    return bd;
  }

  /** El cristal que la curaba estalla: el dragón pierde 10 (en la cabeza, como una explosión). */
  onCrystalDestroyed(crystal: Entity, attacker: string | null): void {
    for (const e of this.dragons()) {
      const s = this.state(e);
      if (s.crystal === crystal.id) {
        s.crystal = null;
        this.hurt(e, 0, 10, attacker);
      }
      // En las vueltas, va a por quien lo rompió (DragonHoldingPatternPhase.onCrystalDestroyed).
      const p = attacker ? this.m.host.players().find((q) => q.id === attacker && q.alive && !q.creative) : undefined;
      if (s.phase === 'holding' && p && e.health > 0) this.strafe(e, s, p);
    }
  }

  // ------------------------------------------------------------------ cristales

  /** EndCrystal.tick: en el End, el fuego de debajo no se apaga. */
  private crystalTick(e: Entity): void {
    e.flags = 0;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    if (this.fight && this.m.w.getBlock(x, y, z) === AIR) this.m.host.igniteBlock?.(x, y, z);
  }

  /**
   * EndCrystal.hurtServer: el cristal (si no es invulnerable) se rompe; si no fue una explosión, estalla con
   * potencia 6 (así no hay reacción en cadena: el que alcanza una explosión sólo desaparece).
   */
  crystalHit(e: Entity, attacker: string | null, byExplosion = false): void {
    if (e.dead || !this.m.list.has(e.id) || e.invulnerable) return;
    this.m.remove(e.id);
    this.onCrystalDestroyed(e, attacker);
    this.onCrystalGone?.(e);
    if (!byExplosion) this.m.explode(e.x, e.y, e.z, 6);
  }

  /** Aviso al combate de que se fue un cristal (para la reaparición del dragón). */
  onCrystalGone: ((e: Entity) => void) | null = null;

  // ------------------------------------------------------------------ aliento

  /**
   * Nube del aliento (AreaEffectCloud con partículas DRAGON_BREATH): de `radius` bloques, `seconds` de vida, crece
   * `grow` bloques por segundo y da daño instantáneo de nivel `amp` (cada segundo, a quien esté dentro).
   */
  breathCloud(x: number, y: number, z: number, radius: number, seconds: number, grow: number, amp: number, owner: number): Entity {
    const c = this.m.spawnBare(ENT_EFFECT_CLOUD, x, y, z, radius * 2, 0.5);
    c.cloudRadius = radius;
    c.cloudVictims = new Map();
    c.shooter = owner;
    c.dragonBreath = { grow, life: seconds, amp };
    return c;
  }

  /** La nube del aliento: crece, hiere a quien está dentro (una vez por segundo a cada uno) y se acaba. */
  breathTick(c: Entity, dt: number): void {
    c.flags = 0;
    const b = c.dragonBreath!;
    if (c.age >= b.life || (c.cloudRadius ?? 0) < 0.5) {
      this.m.remove(c.id);
      return;
    }
    c.cloudRadius = (c.cloudRadius ?? 3) + b.grow * dt;
    if (c.age < 0.5) return;
    const victims = c.cloudVictims ??= new Map();
    const inside = (x: number, y: number, z: number, h: number) => Math.hypot(x - c.x, z - c.z) <= c.cloudRadius! && y <= c.y + 0.5 && y + h >= c.y;
    const due = (k: string | number) => (victims.get(k) ?? -1) <= c.age;
    // Las nubes dan los efectos instantáneos a la mitad (AreaEffectCloud: applyInstantenousEffect con 0,5).
    const dmg = instantHarm(b.amp) * 0.5;
    for (const p of this.m.host.players()) {
      if (!p.alive || !inside(p.x, p.y, p.z, 1.8) || !due(p.id)) continue;
      victims.set(p.id, c.age + 1);
      this.m.host.hurtPlayer(p.id, dmg, 0, 0, 0, 'dragon_breath');
    }
    for (const o of this.m.list.values()) {
      if (!o.ai || o.dead || o.type === MOB_ENDER_DRAGON || !inside(o.x, o.y, o.z, o.height) || !due(o.id)) continue;
      victims.set(o.id, c.age + 1);
      this.m.effects.add(o, EFFECT_INSTANT_DAMAGE, 0, b.amp, 0.5, c.shooter ?? null);
    }
  }

  /** Un frasco recoge el aliento: la nube pierde medio bloque de radio (true si había nube). */
  bottleBreath(id: number): boolean {
    const c = this.m.list.get(id);
    if (!c?.dragonBreath) return false;
    c.cloudRadius = (c.cloudRadius ?? 0) - 0.5;
    return true;
  }

  // ------------------------------------------------------------------ bola de fuego

  /** DragonFireball: sale de la boca hacia el objetivo, acelerando (AbstractHurtingProjectile). */
  private shootFireball(e: Entity, x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const l = Math.hypot(dx, dy, dz) || 1;
    const f = this.m.spawnBare(ENT_DRAGON_FIREBALL, x, y, z, 1, 1);
    f.shooter = e.id;
    f.stack = { id: 0, count: 1 };
    f.vx = (dx / l) * 0.1 * 20;
    f.vy = (dy / l) * 0.1 * 20;
    f.vz = (dz / l) * 0.1 * 20;
    f.eyeTarget = [dx / l, dy / l, dz / l];
    this.m.host.fx('dragon_shoot', x, y, z);
  }

  private fireballTick(f: Entity, dt: number): void {
    f.eyeAcc = (f.eyeAcc ?? 0) + dt;
    const dir = f.eyeTarget ?? [0, -1, 0];
    while (f.eyeAcc >= 0.05) {
      f.eyeAcc -= 0.05;
      let mx = f.vx / 20, my = f.vy / 20, mz = f.vz / 20;
      const nx = f.x + mx, ny = f.y + my, nz = f.z + mz;
      if (this.fireballHits(f, nx, ny, nz)) return;
      f.x = nx;
      f.y = ny;
      f.z = nz;
      mx = (mx + dir[0] * 0.1) * 0.95;
      my = (my + dir[1] * 0.1) * 0.95;
      mz = (mz + dir[2] * 0.1) * 0.95;
      f.vx = mx * 20;
      f.vy = my * 20;
      f.vz = mz * 20;
      f.eyeLife = (f.eyeLife ?? 0) + 1;
      if (f.eyeLife > 400 || f.y < -64) {
        this.m.remove(f.id);
        return;
      }
    }
  }

  /** ¿Choca la bola en (x, y, z)? (un bloque, un jugador o una criatura que no sea el dragón): nube de aliento. */
  private fireballHits(f: Entity, x: number, y: number, z: number): boolean {
    const id = this.m.w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    let hit = id < 0 || (id > 0 && !BLOCK_FLUID[id] && !isFire(id));
    let at: [number, number, number] = [x, y, z];
    if (!hit) {
      for (const p of this.m.host.players()) {
        if (!p.alive || Math.abs(p.x - x) > 0.8 || Math.abs(p.z - z) > 0.8 || y < p.y - 0.5 || y > p.y + 2.3) continue;
        hit = true;
        at = [p.x, p.y, p.z];
        break;
      }
    }
    if (!hit) {
      for (const o of this.m.list.values()) {
        if (!o.ai || o.dead || o.type === MOB_ENDER_DRAGON) continue;
        if (Math.abs(o.x - x) < o.width / 2 + 0.5 && Math.abs(o.z - z) < o.width / 2 + 0.5 && y > o.y - 0.5 && y < o.y + o.height + 0.5) {
          hit = true;
          at = [o.x, o.y, o.z];
          break;
        }
      }
    }
    if (!hit) return false;
    // La nube va donde estaba quien esté a menos de 4 bloques (si no, donde cayó); crece de 3 a 7 en 30 s.
    for (const p of this.m.host.players()) {
      if (p.alive && (p.x - f.x) ** 2 + (p.y - f.y) ** 2 + (p.z - f.z) ** 2 < 16) {
        at = [p.x, p.y, p.z];
        break;
      }
    }
    this.breathCloud(at[0], at[1], at[2], 3, 30, 4 / 30, 1, typeof f.shooter === 'number' ? f.shooter : 0);
    this.m.host.fx('dragon_fireball_hit', f.x, f.y, f.z);
    this.m.remove(f.id);
    return true;
  }
}
