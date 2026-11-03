// Fase 6 (asaltos): lo que los saqueadores necesitan del servidor.
// - Puestos: mientras haya jugadores cerca, aparecen saqueadores alrededor de la torre (hasta 4).
// - Patrullas: cada 10–11 minutos (a partir del quinto día), un grupo de 2 a 5 saqueadores con un
//   capitán aparece a unos 30 bloques de un jugador que está a cielo abierto, y echa a andar.
// - Mal presagio: al beberse la botella ominosa que suelta el capitán, el jugador lo lleva encima
//   (el servidor lo apunta); si entra en una aldea, empieza un asalto.
// - Asalto: 3, 5 o 7 oleadas según la dificultad (+1 con un presagio fuerte) que llegan desde fuera
//   de la aldea; entre oleadas hay 15 s de calma. Se gana al acabar con todas (Héroe de la aldea
//   para los que estaban cerca) y se pierde si no queda ningún aldeano. Los aldeanos se esconden.
import { MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, MOB_RAVAGER, MOB_WITCH, MOB_VILLAGER } from '../../mobs';
import { BLOCK_FLUID, isLeaves } from '../../blocks';
import { EFFECT_BAD_OMEN, EFFECT_HERO, BAD_OMEN_SECONDS, HERO_SECONDS } from '../../effects';
import { STATE_DEAD, type ServerMsg } from '../../protocol';
import { locateStructure } from '../../world/structures';
import { VILLAGE_RADIUS } from '../../world/villages';
import { OUTPOST_DECK } from '../../world/outposts';
import type { Entity } from '../entities/types';
import type { ServerStore } from '../store';
import type { ServerContext, Session } from './context';

const META_KEY = 'raids';
/** Segundos de calma antes de cada oleada. */
export const RAID_WAIT = 15;
/** Radio de la barra del asalto y de los jugadores que cuentan como presentes. */
const RAID_RANGE = 96;
/** Un asalto sin jugadores cerca durante este tiempo se abandona. */
const RAID_ABANDON = 60;
/** Duración máxima de un asalto (s). */
const RAID_MAX = 40 * 60;
/** Segundos entre patrullas (más una parte al azar). */
const PATROL_EVERY = 600;
/** Día del mundo a partir del cual salen patrullas. */
const PATROL_FROM_DAY = 5;

/** Oleadas según la dificultad (fácil, normal, difícil). */
export const RAID_WAVES = [3, 3, 5, 7];
/**
 * Composición de cada oleada (columnas de la tabla de Minecraft en normal: 7 oleadas). Con menos
 * oleadas se reparten las columnas para que la última sea la más dura.
 */
const TABLE: [number, number[]][] = [
  [MOB_PILLAGER, [4, 3, 3, 4, 4, 4, 2]],
  [MOB_VINDICATOR, [0, 2, 0, 1, 4, 2, 5]],
  [MOB_RAVAGER, [0, 0, 1, 0, 1, 0, 2]],
  [MOB_WITCH, [0, 0, 0, 3, 0, 0, 1]],
  [MOB_EVOKER, [0, 0, 0, 0, 1, 1, 2]],
];

/** Criaturas de la oleada `wave` (1..waves); la primera es la capitana. */
export function waveMobs(wave: number, waves: number, difficulty: number, rand: () => number): number[] {
  const col = waves <= 1 ? 6 : Math.min(6, Math.round(((Math.min(wave, waves) - 1) * 6) / (waves - 1)));
  const out: number[] = [];
  for (const [type, counts] of TABLE) {
    let n = counts[col];
    // En difícil, a veces uno más de los de a pie.
    if (difficulty >= 3 && (type === MOB_PILLAGER || type === MOB_VINDICATOR) && rand() < 0.5) n++;
    for (let i = 0; i < n; i++) out.push(type);
  }
  if (out.length === 0) out.push(MOB_PILLAGER);
  return out;
}

interface Raid {
  id: number;
  cx: number;
  cy: number;
  cz: number;
  waves: number;
  /** Oleadas lanzadas (0 = aún ninguna). */
  wave: number;
  raiders: Set<number>;
  /** Vida total de la oleada al lanzarla (para la barra). */
  waveHp: number;
  state: 'wait' | 'fight' | 'won' | 'lost';
  /** Segundos que le quedan a la fase actual (espera o final). */
  timer: number;
  age: number;
  /** Segundos seguidos sin jugadores cerca. */
  lonely: number;
  /** Aldeanos al empezar (si llega a 0, se pierde). */
  villagers: number;
  /** Nivel del mal presagio que lo empezó (el del Héroe de la aldea al ganarlo). */
  amp: number;
}

export class Raids {
  /** Mal presagio por jugador (nombre en minúsculas): nivel y momento en que acaba (ms). */
  private omens = new Map<string, { amp: number; until: number }>();
  /** Héroe de la aldea por jugador: hasta cuándo (ms). */
  /** Héroes de la aldea: nivel del efecto y momento en que acaba (ms). */
  private heroes = new Map<string, { amp: number; until: number }>();
  private raids: Raid[] = [];
  private nextId = 1;
  private patrolIn: number;
  private sent = new Map<string, string>();
  private dirty = false;

  constructor(private ctx: ServerContext, store: ServerStore) {
    this.patrolIn = PATROL_EVERY + ctx.rand() * 60;
    try {
      const raw = JSON.parse(store.getMeta(META_KEY) ?? '{}') as { o?: Record<string, [number, number]>; h?: Record<string, number | [number, number]> };
      const now = ctx.now();
      for (const [k, v] of Object.entries(raw.o ?? {})) {
        if (Array.isArray(v) && Number(v[1]) > now) this.omens.set(k, { amp: Math.max(0, Math.min(4, Number(v[0]) | 0)), until: Number(v[1]) });
      }
      for (const [k, v] of Object.entries(raw.h ?? {})) {
        const [amp, until] = Array.isArray(v) ? v.map(Number) : [0, Number(v)];
        if (until > now) this.heroes.set(k, { amp: Math.max(0, Math.min(4, amp | 0)), until });
      }
    } catch {
      /* ignorar */
    }
  }

  // ------------------------------------------------------------------ jugadores

  /** El jugador se bebió una botella ominosa. */
  onOmen(s: Session, amp: number): void {
    if (s.s & STATE_DEAD) return;
    const a = Math.max(0, Math.min(4, Number(amp) | 0));
    this.omens.set(s.name.toLowerCase(), { amp: a, until: this.ctx.now() + BAD_OMEN_SECONDS * 1000 });
    this.dirty = true;
  }

  /** Al morir se pierde el presagio (como los demás efectos). */
  onDeath(s: Session): void {
    if (this.omens.delete(s.name.toLowerCase())) this.dirty = true;
  }

  hasOmen(name: string): boolean {
    const o = this.omens.get(name.toLowerCase());
    return !!o && o.until > this.ctx.now();
  }

  /** ¿Es héroe de la aldea? (los aldeanos le rebajan los precios). */
  isHero(name: string): boolean {
    return this.heroAmp(name) !== null;
  }

  /** Nivel del Héroe de la aldea de un jugador (null si no lo tiene). */
  heroAmp(name: string): number | null {
    const h = this.heroes.get(name.toLowerCase());
    return h && h.until > this.ctx.now() ? h.amp : null;
  }

  /** Asaltos en curso (para las pruebas y el comando). */
  get active(): readonly Raid[] {
    return this.raids;
  }

  // ------------------------------------------------------------------ bucle (una vez por segundo)

  tick(): void {
    const ctx = this.ctx;
    const now = ctx.now();
    for (const [k, o] of this.omens) if (o.until <= now) this.omens.delete(k);
    // Presagio dentro de una aldea: empieza el asalto.
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD || s.mode === 'c') continue;
      const key = s.name.toLowerCase();
      const omen = this.omens.get(key);
      if (!omen) continue;
      const v = this.villageAt(s.p[0], s.p[2]);
      if (!v || this.raids.some((r) => Math.hypot(r.cx - v[0], r.cz - v[2]) < VILLAGE_RADIUS)) continue;
      if (ctx.difficulty === 0) continue;
      this.omens.delete(key);
      this.dirty = true;
      ctx.send(s, { t: 'effect', id: EFFECT_BAD_OMEN, s: -1, a: 0 });
      this.start(v[0], v[1], v[2], omen.amp);
    }
    for (const r of [...this.raids]) this.raidTick(r, 1);
    this.publishAlarms();
    this.sendBars();
    this.outposts();
    this.patrols(1);
  }

  // ------------------------------------------------------------------ asaltos

  /** Centro de la aldea que contiene (x, z), o null. */
  villageAt(x: number, z: number): [number, number, number] | null {
    const v = locateStructure(this.ctx.world.gen, 'village', Math.floor(x), Math.floor(z), 1);
    return v && Math.hypot(v[0] - x, v[2] - z) <= VILLAGE_RADIUS + 8 ? v : null;
  }

  /** Empieza un asalto en la aldea con centro (x, y, z). */
  start(x: number, y: number, z: number, amp = 0): Raid {
    const ctx = this.ctx;
    const waves = (RAID_WAVES[ctx.difficulty] ?? 5) + (amp > 0 ? 1 : 0);
    const r: Raid = {
      id: this.nextId++, cx: x, cy: y, cz: z, waves, wave: 0, raiders: new Set(), waveHp: 1, state: 'wait', timer: RAID_WAIT,
      age: 0, lonely: 0, villagers: this.villagersNear(x, z), amp,
    };
    this.raids.push(r);
    ctx.entities.raidCenters.set(r.id, [x, y, z]);
    ctx.fx('raid_horn', x, y + 2, z);
    for (const s of ctx.sessions()) {
      if (s.joined && Math.hypot(s.p[0] - x, s.p[2] - z) < RAID_RANGE) ctx.tell(s, '¡Un asalto se acerca a la aldea!');
    }
    return r;
  }

  private villagersNear(x: number, z: number): number {
    let n = 0;
    for (const e of this.ctx.entities.list.values()) {
      if (e.type === MOB_VILLAGER && !e.dead && Math.hypot(e.x - x, e.z - z) < VILLAGE_RADIUS + 16) n++;
    }
    return n;
  }

  private raidTick(r: Raid, dt: number): void {
    const ctx = this.ctx;
    r.age += dt;
    const present = [...ctx.sessions()].some((s) => s.joined && !(s.s & STATE_DEAD) && Math.hypot(s.p[0] - r.cx, s.p[2] - r.cz) < RAID_RANGE);
    r.lonely = present ? 0 : r.lonely + dt;
    for (const id of r.raiders) {
      const e = ctx.entities.list.get(id);
      if (!e || e.dead) r.raiders.delete(id);
    }
    if (r.state === 'won' || r.state === 'lost') {
      r.timer -= dt;
      if (r.timer <= 0) this.end(r);
      return;
    }
    if (r.lonely > RAID_ABANDON || r.age > RAID_MAX) {
      this.end(r);
      return;
    }
    // Sin aldeanos no hay nada que defender.
    if (r.villagers > 0 && this.villagersNear(r.cx, r.cz) === 0) {
      this.finish(r, false);
      return;
    }
    if (r.state === 'wait') {
      r.timer -= dt;
      if (r.timer <= 0) this.spawnWave(r);
      return;
    }
    if (r.raiders.size === 0) {
      if (r.wave >= r.waves) this.finish(r, true);
      else {
        r.state = 'wait';
        r.timer = RAID_WAIT;
      }
    }
  }

  /** Lanza la siguiente oleada desde fuera de la aldea. */
  spawnWave(r: Raid): number {
    const ctx = this.ctx;
    r.wave++;
    r.state = 'fight';
    const mobs = waveMobs(r.wave, r.waves, ctx.difficulty, () => ctx.rand());
    const spot = this.spawnSpot(r.cx, r.cz, 30, 42) ?? this.spawnSpot(r.cx, r.cz, 16, 30);
    let hp = 0;
    if (spot) {
      ctx.fx('raid_horn', spot[0], spot[1] + 2, spot[2]);
      for (let i = 0; i < mobs.length; i++) {
        const e = ctx.entities.spawnMob(mobs[i], spot[0] + (ctx.rand() - 0.5) * 4, spot[1], spot[2] + (ctx.rand() - 0.5) * 4);
        if (!e) continue;
        e.raid = r.id;
        if (i === 0 && mobs[i] !== MOB_RAVAGER && mobs[i] !== MOB_WITCH) e.captain = true;
        r.raiders.add(e.id);
        hp += e.maxHealth;
      }
    }
    r.waveHp = Math.max(1, hp);
    return r.raiders.size;
  }

  /** Suelo firme a cielo abierto a una distancia entre `min` y `max` de (x, z), o null. */
  spawnSpot(x: number, z: number, min: number, max: number): [number, number, number] | null {
    const ctx = this.ctx;
    const w = ctx.world;
    for (let i = 0; i < 24; i++) {
      const a = ctx.rand() * Math.PI * 2, d = min + ctx.rand() * (max - min);
      const sx = Math.floor(x + Math.cos(a) * d), sz = Math.floor(z + Math.sin(a) * d);
      if (!w.isLoaded(Math.floor(sx / 16), Math.floor(sz / 16))) continue;
      const top = w.skyTop(sx, sz);
      const b = w.getBlock(sx, top, sz);
      if (b <= 0 || BLOCK_FLUID[b] || isLeaves(b)) continue;
      if (w.getBlock(sx, top + 1, sz) !== 0 || w.getBlock(sx, top + 2, sz) !== 0) continue;
      return [sx + 0.5, top + 1, sz + 0.5];
    }
    return null;
  }

  private finish(r: Raid, won: boolean): void {
    const ctx = this.ctx;
    r.state = won ? 'won' : 'lost';
    r.timer = 10;
    ctx.fx(won ? 'raid_win' : 'raid_lose', r.cx, r.cy + 2, r.cz);
    for (const s of ctx.sessions()) {
      if (!s.joined || Math.hypot(s.p[0] - r.cx, s.p[2] - r.cz) >= RAID_RANGE) continue;
      if (won) {
        ctx.tell(s, '¡Victoria! Has defendido la aldea.');
        if (!(s.s & STATE_DEAD)) {
          this.heroes.set(s.name.toLowerCase(), { amp: r.amp, until: ctx.now() + HERO_SECONDS * 1000 });
          this.dirty = true;
          ctx.send(s, { t: 'effect', id: EFFECT_HERO, s: HERO_SECONDS, a: r.amp });
        }
      } else ctx.tell(s, 'Derrota: los saqueadores han arrasado la aldea.');
    }
  }

  /** Cierra un asalto: los asaltantes que queden vuelven a ser saqueadores sueltos. */
  private end(r: Raid): void {
    const ctx = this.ctx;
    for (const e of ctx.entities.list.values()) if (e.raid === r.id) e.raid = undefined;
    ctx.entities.raidCenters.delete(r.id);
    this.raids = this.raids.filter((x) => x !== r);
    for (const s of ctx.sessions()) this.sendBar(s, null);
  }

  private publishAlarms(): void {
    this.ctx.entities.alarms = this.raids.filter((r) => r.state === 'wait' || r.state === 'fight').map((r) => [r.cx, r.cz, VILLAGE_RADIUS + 16]);
  }

  // ------------------------------------------------------------------ barra del asalto

  private sendBars(): void {
    for (const s of this.ctx.sessions()) {
      if (!s.joined) continue;
      const r = this.raids.find((x) => Math.hypot(s.p[0] - x.cx, s.p[2] - x.cz) < RAID_RANGE) ?? null;
      this.sendBar(s, r);
    }
  }

  private sendBar(s: Session, r: Raid | null): void {
    let msg: Extract<ServerMsg, { t: 'raid' }>;
    if (!r) msg = { t: 'raid', s: 0, w: 0, n: 0, h: 0, r: 0 };
    else {
      let h = 0;
      if (r.state === 'wait') h = 1 - r.timer / RAID_WAIT;
      else if (r.state === 'fight') {
        let hp = 0;
        for (const id of r.raiders) hp += this.ctx.entities.list.get(id)?.health ?? 0;
        h = Math.min(1, hp / r.waveHp);
      }
      msg = { t: 'raid', s: r.state === 'won' ? 2 : r.state === 'lost' ? 3 : 1, w: Math.max(1, r.wave + (r.state === 'wait' ? 1 : 0)), n: r.waves, h: Math.round(h * 100) / 100, r: r.raiders.size };
    }
    const key = `${msg.s}.${msg.w}.${msg.n}.${msg.h}.${msg.r}`;
    if (this.sent.get(s.id) === key) return;
    this.sent.set(s.id, key);
    this.ctx.send(s, msg);
  }

  onLeave(s: Session): void {
    this.sent.delete(s.id);
  }

  // ------------------------------------------------------------------ puestos y patrullas

  /** Saqueadores alrededor de los puestos con jugadores cerca (hasta 4 por puesto). */
  private outposts(): void {
    const ctx = this.ctx;
    if (ctx.difficulty === 0 || ctx.rand() > 0.25) return;
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      const o = locateStructure(ctx.world.gen, 'pillager_outpost', Math.floor(s.p[0]), Math.floor(s.p[2]), 1);
      if (!o || Math.hypot(o[0] - s.p[0], o[2] - s.p[2]) > 64) continue;
      let n = 0;
      for (const e of ctx.entities.list.values()) if (e.type === MOB_PILLAGER && !e.dead && Math.hypot(e.x - o[0], e.z - o[2]) < 40) n++;
      if (n >= 4) continue;
      // En el mirador o al pie de la torre.
      const onDeck = ctx.rand() < 0.3;
      const spot = onDeck ? [o[0] + 0.5 + (ctx.rand() - 0.5) * 4, o[1] + OUTPOST_DECK + 1, o[2] + 0.5 + (ctx.rand() - 0.5) * 4] : this.spawnSpot(o[0], o[2], 6, 12);
      if (!spot || !ctx.world.isLoaded(Math.floor(spot[0] / 16), Math.floor(spot[2] / 16))) continue;
      ctx.entities.spawnMob(MOB_PILLAGER, spot[0], spot[1], spot[2]);
    }
  }

  private patrols(dt: number): void {
    const ctx = this.ctx;
    this.patrolIn -= dt;
    if (this.patrolIn > 0) return;
    this.patrolIn = PATROL_EVERY + ctx.rand() * 60;
    if (ctx.difficulty === 0 || ctx.worldTime() < PATROL_FROM_DAY || ctx.rand() < 0.2) return;
    const players = [...ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD) && s.mode !== 'c');
    if (players.length === 0) return;
    const s = players[Math.floor(ctx.rand() * players.length)];
    const bx = Math.floor(s.p[0]), bz = Math.floor(s.p[2]);
    // Sólo a cielo abierto y fuera de las aldeas.
    if (ctx.world.skyTop(bx, bz) > Math.floor(s.p[1]) + 1 || this.villageAt(s.p[0], s.p[2])) return;
    this.spawnPatrol(s.p[0], s.p[2]);
  }

  /** Patrulla de 2 a 5 saqueadores (el primero, capitán) a unos 24–40 bloques de (x, z). */
  spawnPatrol(x: number, z: number): Entity[] {
    const ctx = this.ctx;
    const spot = this.spawnSpot(x, z, 24, 40);
    if (!spot) return [];
    const n = 2 + Math.floor(ctx.rand() * (2 + ctx.difficulty));
    const out: Entity[] = [];
    const to: [number, number] = [x + (ctx.rand() - 0.5) * 20, z + (ctx.rand() - 0.5) * 20];
    for (let i = 0; i < Math.min(5, n); i++) {
      const e = ctx.entities.spawnMob(MOB_PILLAGER, spot[0] + (ctx.rand() - 0.5) * 3, spot[1], spot[2] + (ctx.rand() - 0.5) * 3);
      if (!e) continue;
      e.patrolTo = [to[0] + (ctx.rand() - 0.5) * 4, to[1] + (ctx.rand() - 0.5) * 4];
      if (i === 0) e.captain = true;
      out.push(e);
    }
    return out;
  }

  // ------------------------------------------------------------------ guardado

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    const o: Record<string, [number, number]> = {};
    for (const [k, v] of this.omens) o[k] = [v.amp, v.until];
    const h: Record<string, [number, number]> = {};
    for (const [k, v] of this.heroes) if (v.until > this.ctx.now()) h[k] = [v.amp, v.until];
    store.setMeta(META_KEY, JSON.stringify({ o, h }));
  }
}
