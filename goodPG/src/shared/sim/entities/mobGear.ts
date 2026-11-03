// Fase 6.5 (equipo): el equipo de las criaturas en el servidor.
// - Armaduras para caballo (se ponen a un caballo domado; reducen el daño con sus puntos) y armadura
//   para lobo (sólo al lobo propio; absorbe todo el daño y se desgasta hasta romperse; con tijeras
//   se le quita). Se ven puestas (el cliente las recibe con las entidades) y se guardan.
// - Ahogados: algunos aparecen con tridente (lo lanzan de lejos) o con una concha de nautilo.
// - Botín: la armadura puesta, el tridente o la concha del ahogado, la ballesta del saqueador y la
//   pata de conejo; la escama de la tortuga al crecer.
// - Cabras: de vez en cuando embisten a quien tengan cerca; si chocan contra piedra, troncos, cobre
//   o menas, se les cae un cuerno (tienen dos).
import { isDyeable, sanitizeDyeColor } from '../../dyedColor'; // la armadura teñida
import { MOBS, MOB_HORSE, MOB_WOLF, MOB_DROWNED, MOB_PILLAGER, MOB_RABBIT, MOB_TURTLE, MOB_GOAT } from '../../mobs';
import {
  ITEMS, HORSE_ARMOR, WOLF_ARMOR, TRIDENT, NAUTILUS_SHELL, CROSSBOW, RABBIT_FOOT, TURTLE_SCUTE, GOAT_HORN, SHEARS,
  type ItemStack,
} from '../../items';
import { BLOCKS, BLOCK_SOLID, familyBase } from '../../blocks';
import { armorReduce } from '../../armor';
import { EF_ACTION } from '../../protocol';
import {
  HORSE_ARMOR_POINTS, HORSE_ARMOR_TOUGHNESS, WOLF_ARMOR_DURABILITY, DROWNED_TRIDENT_CHANCE, DROWNED_TRIDENT_DROP, DROWNED_SHELL_CHANCE,
  PILLAGER_CROSSBOW_DROP, RABBIT_FOOT_DROP, TURTLE_SCUTES_ON_GROW, GOAT_HORN_TUNES, TRIDENT_SPEED,
} from '../../equipment';
import { moveBody, lineOfSight } from '../physics';
import { GRAVITY, angleTo, lerpAngle, type PlayerView, type InteractResult, type Entity } from './types';
import type { Entities } from './Entities';
import { enchantWithLevels, rndFrom, TABLE_POOL } from '../../enchanting'; // Fase 7 (encantamientos)

/** Material de cada armadura para caballo (id → leather, iron…). */
const HORSE_ARMOR_OF = new Map<number, string>(Object.entries(HORSE_ARMOR).map(([m, id]) => [id, m]));

export function isHorseArmor(id: number): boolean {
  return HORSE_ARMOR_OF.has(id);
}

/** Puntos de armadura de una armadura para caballo (0 si no lo es). */
export function horseArmorPoints(id: number): number {
  const m = HORSE_ARMOR_OF.get(id);
  return m ? HORSE_ARMOR_POINTS[m] ?? 0 : 0;
}

/** Fase 8.5: dureza de una armadura para caballo. */
export function horseArmorToughness(id: number): number {
  const m = HORSE_ARMOR_OF.get(id);
  return m ? HORSE_ARMOR_TOUGHNESS[m] ?? 0 : 0;
}

let ramBlocks: Uint8Array | null = null;
/** Bloques contra los que la cabra pierde un cuerno (piedra, troncos, cobre, menas, hielo compacto). */
function snapsHorn(id: number): boolean {
  if (id <= 0) return false;
  if (!ramBlocks) {
    ramBlocks = new Uint8Array(BLOCKS.length);
    const re = /(^|_)(stone|cobblestone|deepslate|granite|diorite|andesite|tuff|calcite|log|wood)$|_ore$|^packed_ice$|copper/;
    for (const b of BLOCKS) {
      if (!b || !b.solid) continue;
      const key = BLOCKS[familyBase(b.id)]?.key ?? b.key;
      if (re.test(key) && (b.sound === 'stone' || b.sound === 'wood' || b.sound === 'metal' || b.sound === 'glass')) ramBlocks[b.id] = 1;
    }
  }
  return ramBlocks[id] === 1;
}

/** Cabra: segundos entre embestidas, velocidad y duración máxima de la carrera. */
const RAM_WAIT: [number, number] = [20, 90];
const RAM_SPEED = 7.5;
const RAM_PREPARE = 0.8;
const RAM_RUN = 1.6;
const RAM_RANGE = 12;

export class MobGear {
  constructor(private m: Entities) {}

  // ------------------------------------------------------------------ aparición y crecimiento

  /** Al aparecer: los ahogados pueden llevar tridente o concha; las cabras, sus dos cuernos. */
  onSpawn(e: Entity): void {
    if (e.type === MOB_DROWNED) {
      const r = this.m.rand();
      if (r < DROWNED_TRIDENT_CHANCE) e.gear = TRIDENT;
      else if (r < DROWNED_TRIDENT_CHANCE + DROWNED_SHELL_CHANCE) e.gear = NAUTILUS_SHELL;
      e.throwCd = 1 + this.m.rand() * 2;
    } else if (e.type === MOB_GOAT) {
      e.horns = 2;
      e.ramCd = RAM_WAIT[0] + this.m.rand() * (RAM_WAIT[1] - RAM_WAIT[0]);
    }
  }

  /** Una cría acaba de crecer: la tortuga suelta su escama. */
  onGrown(e: Entity): void {
    if (e.type === MOB_TURTLE) this.m.spawnItem({ id: TURTLE_SCUTE, count: TURTLE_SCUTES_ON_GROW }, e.x, e.y + 0.3, e.z, 0, 2, 0);
  }

  // ------------------------------------------------------------------ armaduras

  /**
   * Usar un objeto sobre una criatura: poner o quitar su armadura. null si no le toca a este sistema.
   * `dmg`: el desgaste de la pila de la mano (armadura para lobo); `sneaking`: agachado (quitar la del caballo).
   */
  interact(e: Entity, item: number, who: string, dmg = 0, sneaking = false, dye?: number): InteractResult | null {
    if (e.dead || !e.ai) return null;
    const baby = (e.growAge ?? 0) > 0;
    if (e.type === MOB_HORSE) {
      if (isHorseArmor(item)) {
        if (!e.tamed || baby || e.gear) return { ok: false };
        e.gear = item;
        e.gearDye = item === HORSE_ARMOR.leather ? dye : undefined;
        this.m.host.fx('horse_armor', e.x, e.y + 1, e.z);
        return { ok: true, take: 1 };
      }
      // Agachado con la mano vacía: se le quita la armadura.
      if (item === 0 && sneaking && e.gear && e.tamed) {
        const give = this.gearStack(e);
        e.gear = undefined;
        e.gearDye = undefined;
        this.m.host.fx('horse_armor', e.x, e.y + 1, e.z);
        return { ok: true, give };
      }
      return null;
    }
    if (e.type === MOB_WOLF) {
      const mine = !!e.tamedBy && e.tamedBy === who.toLowerCase();
      if (item === WOLF_ARMOR) {
        if (!mine || baby || e.gear) return { ok: false };
        e.gear = WOLF_ARMOR;
        e.gearDmg = Math.max(0, Math.min(WOLF_ARMOR_DURABILITY - 1, dmg | 0));
        e.gearDye = dye;
        this.m.host.fx('wolf_armor', e.x, e.y + 0.6, e.z);
        return { ok: true, take: 1 };
      }
      if (item === SHEARS && e.gear === WOLF_ARMOR && mine) {
        const give = this.gearStack(e);
        e.gear = undefined;
        e.gearDmg = undefined;
        e.gearDye = undefined;
        this.m.host.fx('wolf_armor', e.x, e.y + 0.6, e.z);
        return { ok: true, give, wear: 1 };
      }
    }
    return null;
  }

  /** Fase 8.5: resistencia al empuje de lo que lleva puesto (la armadura de netherita del caballo). */
  knockbackResistance(e: Entity): number {
    return e.type === MOB_HORSE && e.gear === HORSE_ARMOR.netherite ? 0.1 : 0;
  }

  /** Daño que llega tras la armadura puesta (el del caballo se reduce; el del lobo lo absorbe la suya). */
  absorb(e: Entity, amount: number): number {
    if (!e.gear || amount <= 0) return amount;
    if (e.type === MOB_HORSE && isHorseArmor(e.gear)) return armorReduce(amount, horseArmorPoints(e.gear), horseArmorToughness(e.gear));
    if (e.type === MOB_WOLF && e.gear === WOLF_ARMOR) {
      e.gearDmg = (e.gearDmg ?? 0) + Math.ceil(amount);
      if (e.gearDmg >= WOLF_ARMOR_DURABILITY) {
        e.gear = undefined;
        e.gearDmg = undefined;
        e.gearDye = undefined;
        this.m.host.fx('wolf_armor_break', e.x, e.y + 0.6, e.z);
      }
      return 0;
    }
    return amount;
  }

  // ------------------------------------------------------------------ botín

  /** Al morir con botín: lo que llevaba puesto o en la mano y el botín raro. */
  onKilled(e: Entity): void {
    const out: ItemStack[] = [];
    const r = () => this.m.rand();
    if (e.gear && (isHorseArmor(e.gear) || e.gear === WOLF_ARMOR)) {
      out.push(this.gearStack(e));
    } else if (e.type === MOB_DROWNED) {
      if (e.gear === NAUTILUS_SHELL) out.push({ id: NAUTILUS_SHELL, count: 1 });
      if (e.gear === TRIDENT && r() < DROWNED_TRIDENT_DROP) out.push(this.worn(TRIDENT));
    }
    const adult = !((e.growAge ?? 0) > 0);
    if (adult && e.type === MOB_PILLAGER && r() < PILLAGER_CROSSBOW_DROP) out.push(this.worn(CROSSBOW));
    if (adult && e.type === MOB_RABBIT && r() < RABBIT_FOOT_DROP) out.push({ id: RABBIT_FOOT, count: 1 });
    e.gear = undefined;
    e.gearDye = undefined;
    if (out.length) this.m.dropStacks(out, e.x, e.y + 0.3, e.z);
  }

  /** La pila de la armadura que lleva puesta (con su desgaste y su color). */
  private gearStack(e: Entity): ItemStack {
    const s: ItemStack = { id: e.gear!, count: 1 };
    if (e.gearDmg) s.dmg = e.gearDmg;
    if (e.gearDye !== undefined) s.data = { dc: e.gearDye };
    return s;
  }

  /**
   * Arma soltada por una criatura: gastada entre el 10 y el 90 %. Fase 7 (encantamientos): a veces
   * encantada (más cuanto más difícil, con 5 a 22 niveles, como el equipo de las criaturas de Minecraft).
   */
  private worn(id: number): ItemStack {
    const max = ITEMS[id]?.tool?.durability ?? 0;
    const s: ItemStack = max ? { id, count: 1, dmg: Math.floor(max * (0.1 + 0.8 * this.m.rand())) } : { id, count: 1 };
    const chance = [0, 0.1, 0.2, 0.35][this.m.host.difficulty()] ?? 0.2;
    if (this.m.rand() >= chance) return s;
    return enchantWithLevels(s, 5 + Math.floor(this.m.rand() * 18), rndFrom(() => this.m.rand()), TABLE_POOL);
  }

  // ------------------------------------------------------------------ guardado

  /** Lo que se guarda con el animal (armadura puesta), o null. */
  save(e: Entity): { gear: number; gd?: number; gc?: number } | null {
    if (!e.gear || !(isHorseArmor(e.gear) || e.gear === WOLF_ARMOR)) return null;
    return { gear: e.gear, ...(e.gearDmg ? { gd: e.gearDmg } : {}), ...(e.gearDye !== undefined ? { gc: e.gearDye } : {}) };
  }

  restore(e: Entity, row: unknown[]): void {
    const g = row.find((c) => !!c && typeof c === 'object' && !Array.isArray(c) && 'gear' in (c as object)) as { gear?: unknown; gd?: unknown; gc?: unknown } | undefined;
    if (!g) return;
    const id = Number(g.gear);
    if ((e.type === MOB_HORSE && isHorseArmor(id)) || (e.type === MOB_WOLF && id === WOLF_ARMOR)) {
      e.gear = id;
      const d = Number(g.gd);
      if (id === WOLF_ARMOR && Number.isInteger(d) && d > 0) e.gearDmg = Math.min(WOLF_ARMOR_DURABILITY - 1, d);
      if (isDyeable(id)) e.gearDye = sanitizeDyeColor(g.gc);
    }
  }

  // ------------------------------------------------------------------ cada tick

  /** Bits de estado: la cabra que prepara o hace su embestida (baja la cabeza). */
  flags(e: Entity): number {
    return e.type === MOB_GOAT && (e.ramT ?? 0) > 0 ? EF_ACTION : 0;
  }

  /**
   * Antes de que la criatura decida: el ahogado con tridente lo lanza (y sigue con lo suyo); la
   * cabra que embiste se mueve sola (devuelve true: MobBrain no hace nada más este tick).
   */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (e.type === MOB_DROWNED && e.gear === TRIDENT) this.drownedThrow(e, dt, players);
    if (e.type === MOB_GOAT) return this.goat(e, dt, players);
    return false;
  }

  /** Ahogado con tridente: si ve a su presa a media distancia, se lo lanza (cada 2 s o así). */
  private drownedThrow(e: Entity, dt: number, players: PlayerView[]): void {
    const ai = e.ai!;
    e.throwCd = (e.throwCd ?? 2) - dt;
    if (e.throwCd > 0 || !ai.target) return;
    const t = players.find((p) => p.id === ai.target && p.alive && !p.creative);
    if (!t) return;
    const sx = e.x, sy = e.y + e.height * 0.85, sz = e.z;
    const dx = t.x - sx, dz = t.z - sz;
    const horiz = Math.hypot(dx, dz);
    // DrownedTridentAttackGoal: a 10 bloques como mucho, en 3D.
    if (horiz < 1 || Math.hypot(dx, t.y - e.y, dz) > 10 || !lineOfSight(this.m.w, sx, sy, sz, t.x, t.y + 1.4, t.z)) return;
    e.throwCd = 2 + this.m.rand() * 1.5;
    const time = Math.max(0.05, horiz / TRIDENT_SPEED);
    const vy = (t.y + 1.2 - sy) / time + 0.5 * 20 * time;
    this.m.gearShots.spawnTrident(sx + (dx / horiz) * 0.5, sy, sz + (dz / horiz) * 0.5, dx / time, vy, dz / time, e.id, { id: TRIDENT, count: 1 });
    this.m.host.fx('trident_throw', sx, sy, sz);
  }

  /** Cabra: espera, elige a quién embestir, baja la cabeza y corre en línea recta. */
  private goat(e: Entity, dt: number, players: PlayerView[]): boolean {
    if ((e.growAge ?? 0) > 0 || e.leash || e.rider) return false;
    const ai = e.ai!;
    if (!(e.ramT && e.ramT > 0)) {
      if (ai.panic > 0) return false;
      e.ramCd = (e.ramCd ?? RAM_WAIT[0]) - dt;
      if (e.ramCd > 0) return false;
      e.ramCd = RAM_WAIT[0] + this.m.rand() * (RAM_WAIT[1] - RAM_WAIT[0]);
      const target = this.ramTarget(e, players);
      if (!target) return false;
      const dx = target[0] - e.x, dz = target[1] - e.z;
      const d = Math.hypot(dx, dz) || 1;
      e.ramDir = [dx / d, dz / d];
      e.ramT = RAM_PREPARE + RAM_RUN;
    }
    return this.ramStep(e, dt, players);
  }

  /** Alguien a quien embestir a la vista: un jugador (no en creativo) o una criatura que no sea cabra. */
  private ramTarget(e: Entity, players: PlayerView[]): [number, number] | null {
    const w = this.m.w;
    const eye = e.y + e.height * 0.8;
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d > 2 && d < RAM_RANGE && Math.abs(p.y - e.y) < 2 && lineOfSight(w, e.x, eye, e.z, p.x, p.y + 1, p.z)) return [p.x, p.z];
    }
    for (const o of this.m.list.values()) {
      if (o === e || !o.ai || o.dead || o.type === MOB_GOAT || MOBS[o.type]?.inert) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d > 2 && d < RAM_RANGE && Math.abs(o.y - e.y) < 2 && lineOfSight(w, e.x, eye, e.z, o.x, o.y + o.height / 2, o.z)) return [o.x, o.z];
    }
    return null;
  }

  /** Un tick de la embestida: preparar (quieta) y correr; choca con criaturas, jugadores o bloques. */
  private ramStep(e: Entity, dt: number, players: PlayerView[]): boolean {
    const [dx, dz] = e.ramDir ?? [0, 1];
    e.ramT = (e.ramT ?? 0) - dt;
    const running = e.ramT < RAM_RUN;
    e.bodyYaw = e.yaw = lerpAngle(e.bodyYaw, angleTo(0, 0, dx, dz), dt * 12);
    e.pitch = 0.5;
    const speed = running ? RAM_SPEED : 0;
    const k = Math.min(1, dt * (e.onGround ? 12 : 2));
    e.vx += (dx * speed - e.vx) * k;
    e.vz += (dz * speed - e.vz) * k;
    e.vy = e.inWater ? e.vy + (1.8 - e.vy) * Math.min(1, dt * 3) : Math.max(-60, e.vy - GRAVITY * dt);
    moveBody(e, this.m.w, dt, 0.6);
    if (!running) return true;
    // Choque con un jugador o una criatura por delante.
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      if (Math.hypot(p.x - e.x, p.z - e.z) < e.width / 2 + 0.6 && Math.abs(p.y - e.y) < 1.5) {
        this.m.host.hurtPlayer(p.id, 2 * this.m.difficultyScale(), dx * 9, 5, dz * 9, 'goat');
        return this.endRam(e, e.x, e.y + 0.8, e.z);
      }
    }
    for (const o of this.m.list.values()) {
      if (o === e || !o.ai || o.dead || o.type === MOB_GOAT || MOBS[o.type]?.inert) continue;
      if (Math.hypot(o.x - e.x, o.z - e.z) < (e.width + o.width) / 2 + 0.2 && Math.abs(o.y - e.y) < 1.5) {
        this.m.damage(o, 2, e.x, e.z, e.id, 2.2);
        return this.endRam(e, o.x, o.y + o.height / 2, o.z);
      }
    }
    if (e.hitWall) {
      // Contra un bloque: si es de los que rompen el cuerno, se le cae uno (con su tonada).
      const bx = Math.floor(e.x + dx * (e.width / 2 + 0.4)), bz = Math.floor(e.z + dz * (e.width / 2 + 0.4));
      for (const by of [Math.floor(e.y + 0.3), Math.floor(e.y + 1)]) {
        const b = this.m.w.getBlock(bx, by, bz);
        if (b <= 0 || !BLOCK_SOLID[b]) continue;
        if (snapsHorn(b) && (e.horns ?? 2) > 0) {
          e.horns = (e.horns ?? 2) - 1;
          const tune = 1 + Math.floor(this.m.rand() * 4) + (this.m.rand() < 0.02 ? 4 : 0);
          this.m.spawnItem({ id: GOAT_HORN, count: 1, dmg: Math.min(GOAT_HORN_TUNES.length, tune) }, e.x + dx * 0.6, e.y + 0.8, e.z + dz * 0.6, -dx * 2, 3, -dz * 2);
        }
        return this.endRam(e, bx + 0.5, by + 0.5, bz + 0.5);
      }
      return this.endRam(e, e.x + dx, e.y + 0.8, e.z + dz);
    }
    if (e.ramT <= 0) e.ramT = 0;
    return true;
  }

  private endRam(e: Entity, x: number, y: number, z: number): boolean {
    e.ramT = 0;
    e.pitch = 0;
    e.vx *= -0.3;
    e.vz *= -0.3;
    this.m.host.fx('goat_ram', x, y, z);
    return true;
  }
}

