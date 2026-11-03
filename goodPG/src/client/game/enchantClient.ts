// Fase 7 (encantamientos) en el cliente. El inventario y la experiencia los lleva el cliente, así que aquí
// viven la semilla de encantamiento, la mesa, el yunque y la afiladora (sus pantallas usan WorkHost) y los
// efectos que dependen de lo que se lleva puesto o en la mano:
// - armadura: Protección (y las específicas), Caída de pluma, Respiración, Agilidad acuática, Paso helado,
//   Espinas (el desgaste extra), Ligamiento (no se quita) y Desaparición (se pierde al morir);
// - herramientas y armas: los encantamientos viajan con cada acción (golpe, bloque roto, disparo, pesca);
//   Eficiencia y Afinidad acuática aceleran el minado, Irrompibilidad y Reparación cuidan la durabilidad;
// - el brillo de lo encantado (mano, mano secundaria y armadura) para los demás jugadores.
import { ENCHANTING_TABLE, GRINDSTONE, SMITHING_TABLE, BEACON, isAnvil, familyBase, isContainer } from '../../shared/blocks';
import { ITEMS, type ItemStack } from '../../shared/items';
import {
  RESPIRATION, AQUA_AFFINITY, DEPTH_STRIDER, FROST_WALKER, EFFICIENCY, MENDING, BINDING_CURSE, VANISHING_CURSE,
  FIRE_PROTECTION, BLAST_PROTECTION, SHARPNESS, SMITE, BANE_OF_ARTHROPODS, IMPALING, enchantsOf, enchLevel, hasGlint, canApply,
  sanitizeEnchList, withEnchants, maxDurability, ENCHANTS, MAX_ENCHANT_LEVEL, type EnchList,
} from '../../shared/enchantments';
import { protectionPoints, applyProtection, airDrainFactor, depthStriderFactor, blastKnockbackFactor, burnTimeFactor, MENDING_PER_XP } from '../../shared/enchantEffects';
import { countBookshelves, newEnchantSeed, BOOKSHELF_OFFSETS, bookshelfCounts } from '../../shared/enchanting';
import { totalForLevel, xpToNext } from '../../shared/experience';
import type { PlayerSave, ServerMsg } from '../../shared/protocol';
import type { WorkHost } from '../ui/enchantScreens';
import type { RayHit } from './raycast';
import { OFFHAND } from './Inventory';
import type { Game } from './Game';
import { sneakSpeedFactor } from '../../shared/enchantEffects'; // Fase 7.5 (abismo)
import { SWIFT_SNEAK } from '../../shared/enchantments';
import { SOUL_SPEED } from '../../shared/enchantments'; // Fase 8.3 (criaturas del Nether)

/** Radio en el que la mesa suelta runas hacia el libro (como en Minecraft, sólo si hay un jugador cerca). */
const GLYPH_RANGE = 16;

export class EnchantClient {
  /** Semilla de encantamiento (las ofertas de la mesa; cambia cada vez que se encanta algo). */
  seed = newEnchantSeed();
  /** Última celda en la que se pidió Paso helado (para no repetir el mensaje). */
  private frostCell = '';
  private glyphT = 0;
  /** Fase 8.3: Velocidad de alma (espera hasta la siguiente alma y último bloque pisado). */
  private soulT = 0;
  private soulCell = '';

  constructor(private g: Game) {}

  // ---------------------------------------------------------------- guardado

  restore(save: PlayerSave | null): void {
    const es = Number(save?.es);
    this.seed = Number.isInteger(es) ? es | 0 : newEnchantSeed();
  }

  // ---------------------------------------------------------------- lo que se lleva

  /** Encantamientos de lo que hay en la mano principal (se mandan con cada acción). */
  held(): EnchList {
    return enchantsOf(this.g.heldStack);
  }

  /** Para los mensajes: `en` sólo si lleva algo. */
  heldField(): { en?: [number, number][] } {
    const en = this.held();
    return en.length ? { en } : {};
  }

  /** Encantamientos de cada pieza de armadura puesta. */
  armorLists(): EnchList[] {
    return this.g.inv.armor.map((s) => enchantsOf(s));
  }

  /** Nivel de un encantamiento en las botas, el casco… (el de la ranura `slot`). */
  armorLevel(slot: number, ench: number): number {
    return enchLevel(this.g.inv.armor[slot], ench);
  }

  /** Suma de un encantamiento en todas las piezas (Protección contra el fuego, contra explosiones). */
  armorSum(ench: number): number {
    let n = 0;
    for (const s of this.g.inv.armor) n += enchLevel(s, ench);
    return n;
  }

  /** Brillo para los demás: bit 0 mano, 1 mano secundaria, 2..5 armadura. */
  glintBits(): number {
    let g = 0;
    if (hasGlint(this.g.heldStack)) g |= 1;
    if (hasGlint(this.g.inv.offhand)) g |= 2;
    this.g.inv.armor.forEach((s, i) => {
      if (hasGlint(s)) g |= 4 << i;
    });
    return g;
  }

  /** Daño tras las protecciones encantadas de la armadura (todas las causas salvo el vacío, /matar y el hambre). */
  protect(damage: number, cause: string): number {
    return applyProtection(damage, protectionPoints(this.armorLists(), cause));
  }

  /** Protección contra explosiones: menos empuje. */
  knockbackFactor(cause: string): number {
    return cause === 'explosion' || cause === 'creeper' ? blastKnockbackFactor(this.armorSum(BLAST_PROTECTION)) : 1;
  }

  /** Eficiencia de la herramienta de la mano y si Afinidad acuática quita el castigo bajo el agua. */
  miningBonus(): { efficiency: number; aqua: boolean } {
    return { efficiency: enchLevel(this.g.heldStack, EFFICIENCY), aqua: this.armorLevel(0, AQUA_AFFINITY) > 0 };
  }

  /** ¿No se puede quitar la pieza de la ranura `k`? (Maldición de ligamiento, salvo en creativo). */
  bound(k: number): boolean {
    return !this.g.creative && enchLevel(this.g.inv.armor[k], BINDING_CURSE) > 0;
  }

  /** Arma con daño extra: chispas mágicas al golpear (como en Minecraft). */
  magicHit(): boolean {
    const h = this.g.heldStack;
    return [SHARPNESS, SMITE, BANE_OF_ARTHROPODS, IMPALING].some((e) => enchLevel(h, e) > 0);
  }

  // ---------------------------------------------------------------- cada frame

  /** Efectos continuos de la armadura (antes de la física y la supervivencia del frame). */
  update(dt: number): void {
    const g = this.g, p = g.player, surv = g.survival;
    surv.respiration = airDrainFactor(this.armorLevel(0, RESPIRATION));
    surv.burnFactor = burnTimeFactor(this.armorSum(FIRE_PROTECTION));
    p.depthStrider = depthStriderFactor(this.armorLevel(3, DEPTH_STRIDER));
    p.sneakFactor = sneakSpeedFactor(this.armorLevel(2, SWIFT_SNEAK)); // Fase 7.5 (abismo): Sigilo rápido
    this.soulSpeed(dt); // Fase 8.3: Velocidad de alma
    // Paso helado: en el suelo (no en el agua), cada vez que se cambia de celda.
    const frost = this.armorLevel(3, FROST_WALKER);
    if (frost > 0 && p.onGround && !p.inWater && !surv.dead && !p.flying) {
      const cell = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
      if (cell !== this.frostCell) {
        this.frostCell = cell;
        g.net?.send({ t: 'frost', l: frost });
      }
    } else this.frostCell = '';
    this.tableGlyphs(dt);
  }

  /**
   * Fase 8.3: Velocidad de alma. El nivel de las botas va al movimiento; corriendo sobre arena o tierra de alma salen
   * almas (cada 5 ticks, con su sonido a veces) y, cada vez que se cambia de bloque, las botas se desgastan (un 4 %
   * por nivel de las veces).
   */
  private soulSpeed(dt: number): void {
    const g = this.g, p = g.player;
    const lvl = this.armorLevel(3, SOUL_SPEED);
    p.soulSpeed = lvl;
    if (lvl <= 0 || !p.onGround || !p.soulGround || p.flying || g.survival.dead) return;
    const moving = Math.hypot(p.vx, p.vz) > 0.2;
    this.soulT -= dt;
    if (moving && this.soulT <= 0) {
      this.soulT = 0.25;
      const fx = g.renderer.entities.pfx;
      fx.spore(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.6, 0.55, 0.95, 1, true);
      if (Math.random() < 0.35) g.audio.playNetherSfx('boost', 0, [p.x, p.y, p.z]);
    }
    const cell = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
    if (cell !== this.soulCell) {
      this.soulCell = cell;
      if (!g.creative && Math.random() < 0.04 * lvl) {
        const boots = g.inv.armor[3];
        if (boots && g.inv.wearStack(boots, 1)) g.inv.armor[3] = null;
        g.inv.changed();
      }
    }
  }

  /** Runas que vuelan de las librerías cercanas a las mesas de encantamientos que el jugador tiene al lado. */
  private tableGlyphs(dt: number): void {
    const g = this.g, world = g.world;
    if (!world) return;
    this.glyphT -= dt;
    if (this.glyphT > 0) return;
    this.glyphT = 0.1;
    const p = g.player;
    const pfx = g.renderer.entities.pfx;
    const get = (x: number, y: number, z: number) => world.getBlock(x, y, z);
    for (const [x, y, z] of this.nearTables()) {
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z);
      if (d > GLYPH_RANGE) continue;
      for (const off of BOOKSHELF_OFFSETS) {
        if (Math.random() > 1 / 16 || !bookshelfCounts(get, x, y, z, off)) continue;
        pfx.glyph(x + off[0] + 0.5 + (Math.random() - 0.5) * 0.6, y + off[1] + 1.1 + Math.random() * 0.4, z + off[2] + 0.5 + (Math.random() - 0.5) * 0.6,
          x + 0.5, y + 1.15, z + 0.5);
      }
    }
  }

  /** Mesas de encantamientos cerca del jugador (las recuerda la vista del libro que flota). */
  nearTables(): [number, number, number][] {
    return this.g.enchantBooks.tables;
  }

  // ---------------------------------------------------------------- clic derecho

  /** Abre la mesa, el yunque o la afiladora (agachado, se coloca encima como siempre). */
  use(pressed: boolean, hit: RayHit | null): boolean {
    const g = this.g;
    if (!pressed || !hit || g.player.sneaking) return false;
    const base = familyBase(hit.id);
    const kind = hit.id === ENCHANTING_TABLE ? 'enchant' : isAnvil(hit.id) ? 'anvil' : base === GRINDSTONE ? 'grindstone'
      : base === SMITHING_TABLE ? 'smithing' : base === BEACON ? 'beacon' : null; // Fase 8.5: la mesa de herrería y el faro
    if (!kind || isContainer(hit.id)) return false;
    g.openScreen(kind, [hit.x, hit.y, hit.z]);
    g.audio.playUi('open');
    g.swing(true);
    return true;
  }

  // ---------------------------------------------------------------- pantallas

  readonly host: WorkHost = {
    level: () => this.g.xp.level,
    creative: () => this.g.creative,
    spendLevels: (n) => this.spendLevels(n),
    shelves: (pos) => {
      const w = this.g.world;
      return w ? countBookshelves((x, y, z) => w.getBlock(x, y, z), pos[0], pos[1], pos[2]) : 0;
    },
    seed: () => this.seed,
    enchanted: (pos) => {
      this.seed = newEnchantSeed();
      this.g.xp.version++; // se guarda con el estado
      this.g.net?.send({ t: 'work', k: 'enchant', x: pos[0], y: pos[1], z: pos[2] });
      this.g.renderer.entities.pfx.magic(pos[0] + 0.5, pos[1] + 1.1, pos[2] + 0.5, 14, 0.4);
    },
    anvilUsed: (pos) => this.g.net?.send({ t: 'work', k: 'anvil', x: pos[0], y: pos[1], z: pos[2] }),
    grindUsed: (pos, xp) => this.g.net?.send({ t: 'work', k: 'grind', x: pos[0], y: pos[1], z: pos[2], ...(xp > 0 ? { n: xp } : {}) }),
    smithUsed: (pos) => this.g.net?.send({ t: 'work', k: 'smith', x: pos[0], y: pos[1], z: pos[2] }), // Fase 8.5
    beaconLevel: (pos) => this.g.beacons.levelAt(pos[0], pos[1], pos[2]),
    beaconEffects: (pos) => this.g.beacons.effects.get(`${pos[0]},${pos[1]},${pos[2]}`) ?? [0, 0],
    beaconSet: (pos, p, s) => {
      this.g.beacons.onServer(pos[0], pos[1], pos[2], p, s);
      this.g.net?.send({ t: 'beacon', x: pos[0], y: pos[1], z: pos[2], p, s });
    },
    sound: (kind) => {
      if (kind === 'click') this.g.audio.playUi('click');
    },
  };

  /**
   * Quita `n` niveles como Minecraft (onEnchantmentPerformed / giveExperienceLevels): se conserva la
   * fracción del nivel en curso.
   */
  spendLevels(n: number): void {
    const xp = this.g.xp;
    const lvl = xp.level, prog = xp.progress;
    const to = Math.max(0, lvl - n);
    xp.total = totalForLevel(to) + Math.floor(prog * xpToNext(to));
  }

  // ---------------------------------------------------------------- experiencia y Reparación

  /**
   * Orbes recogidos: Reparación gasta la experiencia en reparar una pieza al azar (de las que lo tienen y
   * están gastadas: manos y armadura), 2 de durabilidad por punto. Devuelve lo que queda para el jugador.
   */
  mend(n: number): number {
    const inv = this.g.inv;
    const slots: { get: () => ItemStack | null; set: (s: ItemStack) => void }[] = [
      { get: () => inv.get(this.g.selected), set: (s) => inv.set(this.g.selected, s) },
      { get: () => inv.get(OFFHAND), set: (s) => inv.set(OFFHAND, s) },
      ...inv.armor.map((_, k) => ({ get: () => inv.armor[k], set: (s: ItemStack) => { inv.armor[k] = s; inv.changed(); } })),
    ];
    const menders = slots.filter((sl) => {
      const s = sl.get();
      return !!s && (s.dmg ?? 0) > 0 && enchLevel(s, MENDING) > 0 && maxDurability(s.id) > 0;
    });
    if (menders.length === 0) return n;
    const sl = menders[Math.floor(Math.random() * menders.length)];
    const s = sl.get()!;
    const fix = Math.min(n * MENDING_PER_XP, s.dmg ?? 0);
    const next: ItemStack = { ...s, dmg: (s.dmg ?? 0) - fix };
    if (!next.dmg) delete next.dmg;
    sl.set(next);
    return n - Math.ceil(fix / MENDING_PER_XP);
  }

  /** Espinas: las piezas que saltaron se gastan 2 más. */
  onThorns(bits: number): void {
    if (!bits || this.g.creative) return;
    for (let k = 0; k < 4; k++) {
      if (!(bits & (1 << k)) || !this.g.inv.armor[k]) continue;
      const s = this.g.inv.armor[k]!;
      const dmg = (s.dmg ?? 0) + 2;
      if (dmg >= maxDurability(s.id)) this.g.inv.armor[k] = null;
      else this.g.inv.armor[k] = { ...s, dmg };
    }
    this.g.inv.changed();
    this.g.audio.playEnchantSfx('thorns', [this.g.player.x, this.g.player.eyeY, this.g.player.z]);
  }

  /** Maldición de desaparición: lo que la lleva no se suelta al morir. */
  keepsOnDeath(s: ItemStack): boolean {
    return enchLevel(s, VANISHING_CURSE) === 0;
  }

  // ---------------------------------------------------------------- mensajes

  /** /encantar: pone el encantamiento al objeto de la mano (si lo admite). */
  onServer(msg: ServerMsg): boolean {
    if (msg.t !== 'ench') return false;
    const g = this.g;
    const s = g.heldStack;
    const list = sanitizeEnchList(msg.e) ?? [];
    if (!s || !list.length) {
      g.ui.addChat(null, 'Pon en la mano lo que quieras encantar.');
      return true;
    }
    const [[id, lvl]] = list;
    if (!canApply(id, s.id)) {
      g.ui.addChat(null, `${ENCHANTS[id].name} no se puede poner a ${ITEMS[s.id]?.name ?? 'eso'}.`);
      return true;
    }
    const cur = enchantsOf(s).filter(([e]) => e !== id);
    g.inv.set(g.selected, withEnchants(s, [...cur, [id, Math.min(MAX_ENCHANT_LEVEL, lvl)]]));
    g.refreshHotbar(true);
    g.renderer.entities.pfx.magic(g.player.x, g.player.eyeY - 0.3, g.player.z, 10, 0.4);
    return true;
  }

}

