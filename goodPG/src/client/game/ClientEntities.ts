// Entidades en el cliente: réplica de las del servidor (criaturas, objetos, flechas, bloques que
// caen, orbes de experiencia) con interpolación entre instantáneas (se dibujan ~110 ms en el pasado
// para suavizar).
import { MOB_WITHER, ENT_WITHER_SKULL } from '../../shared/witherMobs'; // Fase 8.7
import { MOBS, ENT_ITEM, ENT_ARROW, ENT_FALLING, ENT_XP, ENT_THROWN, ENT_DISPLAY, ENT_LARGE_FIREBALL } from '../../shared/mobs';
import { EF_DEAD, EF_HURT, EF_ACTION, EF_BABY, type EntAdd, type EntUpd, type EntExtra } from '../../shared/protocol';
import { isHangingType } from '../../shared/paintings'; // Fase 6.5 (decoración): cuadros y marcos
import { ENT_ARMOR_STAND } from '../../shared/armorStands'; // Fase 6.5 (remate)
import { ENT_EFFECT_CLOUD } from '../../shared/potions'; // Fase 7 (pociones)
import { MOB_ENDER_DRAGON, ENT_END_CRYSTAL, ENT_SHULKER_BULLET } from '../../shared/mobs'; // Fase 8.6
import { dragonPartBoxes } from './dragonClient';
import { isVehicleType, vehicleSize } from '../../shared/vehicles'; // Fase 7 (transporte)
import { ENT_TNT } from '../../shared/mechanisms'; // Fase 7 (mecanismos)

interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  body: number;
  pitch: number;
}

export interface ClientEntity {
  id: number;
  type: number;
  snaps: Snap[];
  x: number;
  y: number;
  z: number;
  yaw: number;
  bodyYaw: number;
  pitch: number;
  flags: number;
  /** Objetos: id y cantidad. Bloques que caen: id del bloque. Orbes: valor en `count`. */
  item: number;
  count: number;
  health: number;
  /** Fase 6: pelaje (caballos, llamas) o profesión (aldeanos). */
  variant: number;
  /** Animación de caminar. */
  walkPhase: number;
  walkAmount: number;
  /** Segundos desde que apareció (para animaciones) y desde el último golpe. */
  age: number;
  hurtT: number;
  deathT: number;
  /** Segundos desde que empezó su acción (mecha del creeper, tensar el arco); -1 si no. */
  actionT: number;
  /** Recogido por un jugador: vuela hacia él y desaparece. */
  collector: string | null;
  collectT: number;
  /** Retirado del servidor (se borra al terminar la animación). */
  gone: boolean;
  /** Semilla visual (giro de los objetos). */
  seed: number;
  lastX: number;
  lastZ: number;
  /** Fase 6.5 (remate): nombre de etiqueta ('' sin nombre) y a qué está atada (jugador, valla o nada). */
  name?: string;
  leash?: string | [number, number, number] | 0;
  /** Fase 6.5 (remate): soporte para armadura: ids de [cabeza, pecho, piernas, pies]. */
  armor?: number[];
  /** Fase 6.5 (equipo): armadura puesta (caballo, lobo) u objeto en la mano (tridente del ahogado). */
  gear?: number;
  /** Fase 8.7: giros de las cabezas de los lados del Wither [yaw 1, pitch 1, yaw 2, pitch 2] (grados de Java, relativos). */
  witherHeads?: number[];
  /** Color del cuero teñido: el objeto en el suelo, cada pieza del soporte (−1 sin teñir) y la armadura puesta. */
  dye?: number;
  armorDye?: number[];
  gearDye?: number;
  /** Fase 7 (pociones): desgaste o tipo de la pila (objetos y pociones lanzadas), tipo de la flecha con efecto (−1 normal) y nube de efecto (color 0xRRGGBB y radio). */
  dmg?: number;
  potion?: number;
  cloudColor?: number;
  cloudRadius?: number;
}

const DELAY = 0.11;

/** Color que llega de la red (undefined si no vale). */
function dyeFrom(v: unknown): number | undefined {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffff ? (v as number) : undefined;
}

const wrap = (a: number) => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class ClientEntities {
  readonly list = new Map<number, ClientEntity>();
  /** Posición de los jugadores (para la animación de recogida). */
  playerPos: (id: string) => [number, number, number] | null = () => null;
  /** Aviso de golpe recibido por una criatura (sonido/partículas se gestionan fuera). */
  onRemoved: ((e: ClientEntity) => void) | null = null;

  apply(msg: { a?: EntAdd[]; u?: EntUpd[]; rm?: (number | [number, string])[]; ex?: EntExtra[] }, now: number): void {
    for (const a of msg.a ?? []) {
      const [id, type, x, y, z, yaw, body, pitch, flags, e1, e2, e3, e4] = a;
      const prev = this.list.get(id);
      if (prev && !prev.gone) {
        this.push(prev, now, x, y, z, yaw, body, pitch, flags);
        continue;
      }
      const e: ClientEntity = {
        id, type, snaps: [{ t: now, x, y, z, yaw, body, pitch }], x, y, z, yaw, bodyYaw: body, pitch, flags,
        item: type === ENT_ITEM || type === ENT_FALLING || type === ENT_THROWN || type === ENT_DISPLAY || isHangingType(type) || type === ENT_TNT ? e1 ?? 0 : 0,
        count: type === ENT_ITEM ? e2 ?? 1 : type === ENT_XP ? e1 ?? 1 : type === ENT_TNT ? e2 ?? 80 : 1, // Fase 7 (mecanismos): mecha
        health: MOBS[type] ? e1 ?? MOBS[type].health : 1,
        variant: MOBS[type] && Number.isInteger(e2) ? Math.max(0, Math.min(255, e2)) : 0, // Fase 6 (monturas)
        walkPhase: 0, walkAmount: 0, age: 0, hurtT: flags & EF_HURT ? 0 : 99, deathT: flags & EF_DEAD ? 0 : -1,
        actionT: flags & EF_ACTION ? 0 : -1,
        collector: null, collectT: 0, gone: false, seed: (id * 2654435761) % 1000 / 1000, lastX: x, lastZ: z,
      };
      if (type === ENT_ARMOR_STAND) {
        e.armor = [0, 1, 2, 3].map((k) => Number(a[9 + k]) || 0); // Fase 6.5 (remate)
        e.armorDye = [0, 1, 2, 3].map((k) => dyeFrom(a[13 + k]) ?? -1); // (y el color de cada pieza teñida)
      }
      if (type === ENT_ITEM) e.dye = dyeFrom(e4); // el cuero teñido
      if (type === ENT_WITHER_SKULL) e.variant = e1 === 1 ? 1 : 0; // Fase 8.7: la calavera azul
      // Fase 7 (pociones): tipo de la poción lanzada, de la flecha con efecto y color y radio de la nube.
      if ((type === ENT_ITEM || type === ENT_THROWN || type === ENT_DISPLAY) && Number.isInteger(e3) && e3 > 0) e.dmg = e3;
      else if (type === ENT_ARROW && Number.isInteger(e1)) e.potion = e1;
      else if (type === ENT_EFFECT_CLOUD) {
        e.cloudColor = Number.isInteger(e1) ? e1 : 0;
        e.cloudRadius = Number.isFinite(e2) ? Math.max(0, Math.min(8, e2 / 100)) : 0;
      }
      if (isVehicleType(type)) e.variant = Number.isInteger(e1) ? Math.max(0, Math.min(255, e1)) : 0; // Fase 7 (transporte): madera
      this.list.set(id, e);
    }
    for (const u of msg.u ?? []) {
      const e = this.list.get(u[0]);
      if (!e || e.gone) continue;
      this.push(e, now, u[1], u[2], u[3], u[4], u[5], u[6], u[7]);
      if ((e.type === ENT_ITEM || e.type === ENT_XP) && u.length > 8) e.count = u[8];
      else if (MOBS[e.type] && u.length > 8) {
        e.variant = u[8]; // Fase 6 (aldeanos)
        if (e.type === MOB_WITHER && u.length > 12) e.witherHeads = [u[9], u[10], u[11], u[12]]; // Fase 8.7: las cabezas de los lados
      }
      else if (e.type === ENT_EFFECT_CLOUD && u.length > 8) e.cloudRadius = Math.max(0, Math.min(8, u[8] / 100)); // Fase 7 (pociones)
    }
    // Fase 6.5 (remate): nombre y correa.
    for (const [id, name, leash, gear, gearDye] of msg.ex ?? []) {
      const e = this.list.get(id);
      if (!e) continue;
      e.gear = Number.isInteger(gear) ? gear : 0; // Fase 6.5 (equipo)
      e.gearDye = dyeFrom(gearDye); // (su color, si está teñida)
      e.name = typeof name === 'string' ? name.slice(0, 32) : '';
      e.leash = typeof leash === 'string' || (Array.isArray(leash) && leash.length === 3) ? leash : 0;
    }
    for (const r of msg.rm ?? []) {
      const id = Array.isArray(r) ? r[0] : r;
      const e = this.list.get(id);
      if (!e) continue;
      if (Array.isArray(r) && r[1] && (e.type === ENT_ITEM || e.type === ENT_ARROW || e.type === ENT_XP)) {
        e.collector = r[1];
        e.collectT = 0;
        e.gone = true;
      } else if (MOBS[e.type] && e.deathT >= 0 && e.deathT < 1) {
        // Terminar la animación de muerte antes de borrarla.
        e.gone = true;
      } else {
        this.list.delete(id);
        this.onRemoved?.(e);
      }
    }
  }

  private push(e: ClientEntity, now: number, x: number, y: number, z: number, yaw: number, body: number, pitch: number, flags: number): void {
    if ((flags & EF_HURT) && !(e.flags & EF_HURT)) e.hurtT = 0;
    if ((flags & EF_DEAD) && e.deathT < 0) e.deathT = 0;
    if (flags & EF_ACTION) {
      if (e.actionT < 0) e.actionT = 0;
    } else e.actionT = -1;
    e.flags = flags;
    e.snaps.push({ t: now, x, y, z, yaw, body, pitch });
    if (e.snaps.length > 4) e.snaps.shift();
  }

  update(dt: number, now: number): void {
    const rt = now - DELAY;
    for (const [id, e] of this.list) {
      e.age += dt;
      e.hurtT += dt;
      if (e.deathT >= 0) e.deathT += dt;
      if (e.actionT >= 0) e.actionT += dt;
      if (e.collector) {
        e.collectT += dt;
        const p = this.playerPos(e.collector);
        if (p) {
          const k = Math.min(1, e.collectT / 0.15);
          e.x += (p[0] - e.x) * k;
          e.y += (p[1] + 0.8 - e.y) * k;
          e.z += (p[2] - e.z) * k;
        }
        if (e.collectT > 0.15 || !p) {
          this.list.delete(id);
          this.onRemoved?.(e);
        }
        continue;
      }
      if (e.gone && (e.deathT < 0 || e.deathT > 1.05)) {
        this.list.delete(id);
        this.onRemoved?.(e);
        continue;
      }
      // Interpolación entre las dos instantáneas que rodean el tiempo de dibujo.
      const s = e.snaps;
      let a = s[0], b = s[s.length - 1];
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i].t <= rt && s[i + 1].t >= rt) {
          a = s[i];
          b = s[i + 1];
          break;
        }
      }
      let t = b.t > a.t ? (rt - a.t) / (b.t - a.t) : 1;
      t = Math.max(0, Math.min(1, t));
      if (rt > b.t) t = 1;
      e.x = a.x + (b.x - a.x) * t;
      e.y = a.y + (b.y - a.y) * t;
      e.z = a.z + (b.z - a.z) * t;
      e.yaw = a.yaw + wrap(b.yaw - a.yaw) * t;
      e.bodyYaw = a.body + wrap(b.body - a.body) * t;
      e.pitch = a.pitch + (b.pitch - a.pitch) * t;
      // Animación de caminar según la velocidad real.
      const moved = Math.hypot(e.x - e.lastX, e.z - e.lastZ);
      e.lastX = e.x;
      e.lastZ = e.z;
      const speed = dt > 0 ? moved / dt : 0;
      e.walkAmount += (Math.min(1, speed / 2.5) - e.walkAmount) * Math.min(1, dt * 10);
      e.walkPhase += moved * 2.2;
    }
  }

  /** Rayo contra las cajas de las criaturas: devuelve la más cercana antes de maxDist. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, skip = -1): { e: ClientEntity; dist: number } | null {
    let best: { e: ClientEntity; dist: number } | null = null;
    const slab = (mn: number[], mx: number[]): number => {
      let tmin = 0, tmax = maxDist;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) {
          if (o[k] < mn[k] || o[k] > mx[k]) return -1;
          continue;
        }
        let t1 = (mn[k] - o[k]) / d[k], t2 = (mx[k] - o[k]) / d[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return -1;
      }
      return tmin;
    };
    for (const e of this.list.values()) {
      // Fase 8.6: al dragón se le apunta por partes.
      if (e.type === MOB_ENDER_DRAGON) {
        if (e.gone || e.variant > 0) continue;
        for (const b of dragonPartBoxes(e)) {
          const t = slab([b.x0, b.y0, b.z0], [b.x1, b.y1, b.z1]);
          if (t >= 0 && (!best || t < best.dist)) best = { e, dist: t };
        }
        continue;
      }
      const def = MOBS[e.type];
      // Fase 7 (transporte): las barcas y vagonetas también se apuntan (para subirse y golpearlas).
      // Fase 8.3: la bola de fuego del ghast también se apunta (un golpe la devuelve).
      // Fase 8.6: y el cristal del End (estalla).
      const vs = def ? null : isVehicleType(e.type) ? vehicleSize(e.type) : e.type === ENT_LARGE_FIREBALL ? ([1, 1] as const)
        : e.type === ENT_END_CRYSTAL ? ([2, 2] as const) : e.type === ENT_SHULKER_BULLET ? ([0.3125, 0.3125] as const) : null;
      if ((!def && !vs) || def?.inert || e.gone || e.deathT >= 0 || e.id === skip) continue; // skip: la montura propia; inert: colmillos (fase 6)
      const k = e.flags & EF_BABY && def ? 0.5 : 1;
      const hw = ((vs ? vs[0] : def!.width) * k) / 2 + 0.05;
      const mn = [e.x - hw, e.y, e.z - hw], mx = [e.x + hw, e.y + (vs ? vs[1] : def!.height) * k, e.z + hw];
      let tmin = 0, tmax = maxDist;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) {
          if (o[k] < mn[k] || o[k] > mx[k]) {
            hit = false;
            break;
          }
          continue;
        }
        let t1 = (mn[k] - o[k]) / d[k], t2 = (mx[k] - o[k]) / d[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          hit = false;
          break;
        }
      }
      if (hit && (!best || tmin < best.dist)) best = { e, dist: tmin };
    }
    return best;
  }

  clear(): void {
    this.list.clear();
  }
}
