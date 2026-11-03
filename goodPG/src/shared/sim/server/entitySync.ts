// Envío de entidades a cada jugador: sólo las cercanas y sólo lo que cambió desde el último envío
// (altas, actualizaciones y bajas, con quién recogió cada objeto para la animación).
import { MOB_WITHER, ENT_WITHER_SKULL } from '../../witherMobs'; // Fase 8.7
import { dyedColor } from '../../dyedColor';
import { MOB_ENDER_DRAGON, MOB_SHULKER } from '../../mobs'; // Fase 8.6
import { ENT_ITEM, ENT_FALLING, ENT_XP, ENT_THROWN, ENT_DISPLAY } from '../../mobs';
import type { ServerMsg, EntExtra } from '../../protocol';
import { isHangingType } from '../../paintings'; // Fase 6.5 (decoración)
import { ENT_ARMOR_STAND } from '../../armorStands'; // Fase 6.5 (remate)
import { ENT_ARROW } from '../../mobs';
import { ENT_EFFECT_CLOUD, potionColor } from '../../potions'; // Fase 7 (pociones)
import { packColor } from '../../effects';
import { isVehicleType } from '../../vehicles'; // Fase 7 (transporte)
import { ENT_TNT } from '../../mechanisms'; // Fase 7 (mecanismos)
import type { Entity } from '../entities';
import { r2, type ServerContext } from './context';
// Fase 7 (encantamientos): el brillo de los objetos encantados va en los bits de estado.
import { EF_GLINT, EF_GLINT_ARMOR_SHIFT } from '../../protocol';
import { hasGlint } from '../../enchantments';

/** Bits de estado que se envían: los de la entidad más el brillo de lo que lleva o muestra. */
function flagsOf(e: Entity): number {
  if (e.type === ENT_ARMOR_STAND) return e.flags | ((e.standGlint ?? 0) << EF_GLINT_ARMOR_SHIFT);
  return e.stack && hasGlint(e.stack) ? e.flags | EF_GLINT : e.flags;
}

/** Distancia a la que se envían entidades a un jugador. */
const ENTITY_RANGE = 80;
/** Fase 8.6: el dragón se ve desde lejos (es enorme y vuela en círculos amplios). */
const DRAGON_RANGE = 256;
/** Fase 8.6: color de la nube del aliento del dragón (las partículas DRAGON_BREATH). */
const DRAGON_BREATH_COLOR = 0xb44ce8;

export class EntitySync {
  /** Entidades retiradas desde el último envío: id → jugador que la recogió. */
  private collected = new Map<number, string>();
  /** Fase 6.5 (remate): nombre y correa ya enviados a cada jugador, por entidad ('' si nada). */
  private extraSent = new Map<string, Map<number, string>>();

  constructor(private ctx: ServerContext) {}

  markCollected(entityId: number, playerId: string): void {
    this.collected.set(entityId, playerId);
  }

  /** Recoge las bajas del último tick de la simulación de entidades. */
  takeRemoved(removed: [number, string][]): void {
    for (const [id, who] of removed) if (!this.collected.has(id)) this.collected.set(id, who);
  }

  private key(e: Entity): string {
    // Fase 6 (aldeanos): la variante (profesión) también cuenta como cambio.
    return `${r2(e.x)},${r2(e.y)},${r2(e.z)},${r2(e.yaw)},${r2(e.bodyYaw)},${r2(e.pitch)},${flagsOf(e)},${e.stack?.count ?? e.xp ?? 0},${e.variant ?? 0}` +
      (e.cloudRadius !== undefined ? `,${Math.round(e.cloudRadius * 10)}` : '') + // Fase 7 (pociones): radio de la nube
      (e.type === MOB_WITHER ? `,${this.ctx.entities.wither.headRots(e).join(',')}` : ''); // Fase 8.7: las cabezas del Wither
  }

  sync(): void {
    const ctx = this.ctx;
    const removedInfo = this.collected;
    for (const s of ctx.sessions()) {
      if (!s.joined) continue;
      const add: number[][] = [], upd: number[][] = [], rm: (number | [number, string])[] = [];
      const ex: EntExtra[] = [];
      let sent = this.extraSent.get(s.id);
      if (!sent) this.extraSent.set(s.id, (sent = new Map()));
      const seen = new Set<number>();
      for (const e of ctx.entities.list.values()) {
        const dx = e.x - s.p[0], dz = e.z - s.p[2];
        const range = e.type === MOB_ENDER_DRAGON ? DRAGON_RANGE : ENTITY_RANGE;
        if (dx * dx + dz * dz > range * range) continue;
        seen.add(e.id);
        // Fase 6.5 (remate): nombre y correa (se mandan aparte, sólo cuando cambian).
        // Fase 6.5 (equipo): y el equipo que lleva (armadura de caballo o de lobo, tridente del ahogado).
        const extra = e.customName || e.leash || e.gear ? `${e.customName ?? ''}|${Array.isArray(e.leash) ? e.leash.join(',') : e.leash ?? ''}|${e.gear ?? 0}|${e.gearDye ?? -1}` : '';
        if ((sent.get(e.id) ?? '') !== extra) {
          if (extra) sent.set(e.id, extra);
          else sent.delete(e.id);
          const leash = e.leash ? (Array.isArray(e.leash) ? [...e.leash] as [number, number, number] : e.leash) : 0;
          ex.push(e.gearDye !== undefined ? [e.id, e.customName ?? '', leash, e.gear ?? 0, e.gearDye] : [e.id, e.customName ?? '', leash, e.gear ?? 0]); // (y su color)
        }
        const key = this.key(e);
        const prev = s.known.get(e.id);
        if (prev === key) continue;
        s.known.set(e.id, key);
        if (prev === undefined) {
          const rec = [e.id, e.type, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.bodyYaw), r2(e.pitch), flagsOf(e)];
          if ((e.type === ENT_ITEM || e.type === ENT_THROWN || e.type === ENT_DISPLAY) && e.stack) {
            rec.push(e.stack.id, e.stack.count);
            const dc = dyedColor(e.stack); // el cuero teñido: su color, detrás del desgaste
            if (e.stack.dmg || dc !== undefined) rec.push(e.stack.dmg ?? 0); // Fase 7 (pociones): el tipo (su color)
            if (dc !== undefined) rec.push(dc);
          }
          // Fase 7 (pociones): tipo de la flecha con efecto; color y radio de la nube.
          else if (e.type === ENT_ARROW) rec.push(e.arrowPotion ?? -1);
          else if (e.type === ENT_EFFECT_CLOUD) rec.push(e.dragonBreath ? DRAGON_BREATH_COLOR : packColor(potionColor(e.cloudPotion ?? 0)), Math.round((e.cloudRadius ?? 0) * 100)); // Fase 8.6: el aliento, morado
          else if (e.type === ENT_FALLING) rec.push(e.block ?? 0);
          else if (e.type === ENT_TNT) rec.push(e.block ?? 0, Math.round(e.fuse ?? 0)); // Fase 7 (mecanismos): bloque y mecha
          else if (e.type === ENT_XP) rec.push(e.xp ?? 1);
          else if (isHangingType(e.type)) rec.push(e.variant ?? 0); // Fase 6.5: variante del cuadro u objeto del marco
          else if (e.type === ENT_WITHER_SKULL) rec.push(e.variant ?? 0); // Fase 8.7: la calavera azul
          else if (e.type === ENT_ARMOR_STAND) rec.push(...(e.standArmor ?? [0, 0, 0, 0]), ...(e.standDye ?? [-1, -1, -1, -1])); // Fase 6.5 (remate): su armadura (y su color)
          else if (isVehicleType(e.type)) rec.push(e.variant ?? 0); // Fase 7 (transporte): madera de la barca
          else if (e.ai) rec.push(Math.round(e.health), e.variant ?? 0); // Fase 6: variante (pelaje o profesión)
          add.push(rec);
        } else {
          const rec = [e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.bodyYaw), r2(e.pitch), flagsOf(e)];
          if (e.type === ENT_ITEM && e.stack) rec.push(e.stack.count);
          else if (e.type === ENT_XP) rec.push(e.xp ?? 1);
          else if (e.villager) rec.push(e.variant ?? 0); // Fase 6 (aldeanos): profesión del aldeano
          else if (e.type === MOB_ENDER_DRAGON || e.type === MOB_SHULKER) rec.push(e.variant ?? 0); // Fase 8.6: los ticks de la muerte del dragón; la cara y lo que se asoma el shulker
          else if (e.type === MOB_WITHER) rec.push(e.variant ?? 0, ...ctx.entities.wither.headRots(e)); // Fase 8.7: invulnerabilidad y cabezas de los lados
          else if (e.type === ENT_EFFECT_CLOUD) rec.push(Math.round((e.cloudRadius ?? 0) * 100)); // Fase 7 (pociones)
          upd.push(rec);
        }
      }
      for (const id of s.known.keys()) {
        if (seen.has(id)) continue;
        s.known.delete(id);
        sent.delete(id);
        const who = removedInfo.get(id);
        rm.push(who ? [id, who] : id);
      }
      if (add.length || upd.length || rm.length || ex.length) {
        const msg: ServerMsg = { t: 'ents' };
        if (ex.length) msg.ex = ex;
        if (add.length) msg.a = add;
        if (upd.length) msg.u = upd;
        if (rm.length) msg.rm = rm;
        ctx.send(s, msg);
      }
    }
    removedInfo.clear();
    // Jugadores que ya no están.
    if (this.extraSent.size > 0) {
      const ids = new Set<string>();
      for (const s of ctx.sessions()) ids.add(s.id);
      for (const id of this.extraSent.keys()) if (!ids.has(id)) this.extraSent.delete(id);
    }
  }
}
