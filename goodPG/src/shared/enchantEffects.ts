// Fase 7 (encantamientos): lo que hace cada encantamiento en el juego (fórmulas de Minecraft Java),
// en funciones puras que usan el cliente (minar, recibir daño, respirar, nadar, desgaste, reparación)
// y el servidor (golpes, flechas, tridentes, botín, pesca, espinas).
import { MOBS } from './mobs';
import {
  PROTECTION, FIRE_PROTECTION, BLAST_PROTECTION, PROJECTILE_PROTECTION, FEATHER_FALLING, SHARPNESS, SMITE,
  BANE_OF_ARTHROPODS, IMPALING, sanitizeEnchList, canApply, type EnchList,
} from './enchantments';

/** Nivel de un encantamiento en una lista (0 si no está). */
export function levelIn(list: readonly (readonly [number, number])[] | null | undefined, ench: number): number {
  if (!list) return 0;
  for (const [id, lvl] of list) if (id === ench) return lvl;
  return 0;
}

/**
 * Encantamientos que manda el cliente con una acción (golpe, disparo, bloque roto…): sólo los que se
 * pueden aplicar a ese objeto, con los niveles acotados (hasta 10, lo que permite /encantar).
 */
export function sanitizeHeldEnchants(item: number, raw: unknown): EnchList {
  return (sanitizeEnchList(raw) ?? []).filter(([id]) => canApply(id, item));
}

// ------------------------------------------------------------------ criaturas sensibles

/** No muertos (Castigo), artrópodos (Perdición de los artrópodos) y acuáticos (Empalamiento). */
// Fase 8.3: el piglin zombificado y el zoglin (etiqueta zombies).
const UNDEAD = new Set(['zombie', 'husk', 'skeleton', 'stray', 'drowned', 'phantom', 'zombie_villager', 'wither_skeleton', 'zombie_horse', 'skeleton_horse', 'zombified_piglin', 'zoglin', 'wither']);
const ARTHROPOD = new Set(['spider', 'cave_spider', 'silverfish', 'bee', 'endermite']);
const AQUATIC = new Set(['turtle', 'axolotl', 'guardian', 'elder_guardian', 'cod', 'pufferfish', 'salmon', 'tropical_fish', 'dolphin', 'squid', 'glow_squid', 'tadpole']);

export function isUndead(type: number): boolean {
  return UNDEAD.has(MOBS[type]?.key ?? '');
}

export function isArthropod(type: number): boolean {
  return ARTHROPOD.has(MOBS[type]?.key ?? '');
}

export function isAquaticMob(type: number): boolean {
  return AQUATIC.has(MOBS[type]?.key ?? '');
}

// ------------------------------------------------------------------ armas

/**
 * Daño extra de un golpe contra una criatura de tipo `type`: Filo (0,5 por nivel + 0,5), Castigo contra
 * no muertos, Perdición contra artrópodos y Empalamiento contra acuáticos (2,5 por nivel).
 */
export function meleeBonus(list: EnchList, type: number): number {
  let b = 0;
  const sharp = levelIn(list, SHARPNESS);
  if (sharp > 0) b += 0.5 * sharp + 0.5;
  const smite = levelIn(list, SMITE);
  if (smite > 0 && isUndead(type)) b += 2.5 * smite;
  const bane = levelIn(list, BANE_OF_ARTHROPODS);
  if (bane > 0 && isArthropod(type)) b += 2.5 * bane;
  const imp = levelIn(list, IMPALING);
  if (imp > 0 && isAquaticMob(type)) b += 2.5 * imp;
  return b;
}

/** Segundos de Lentitud IV que pone Perdición de los artrópodos (entre 1,5 y 1,5 + 0,5 por nivel extra). */
export function baneSlowSeconds(level: number, rand: () => number): number {
  return 1.5 + rand() * 0.5 * Math.max(0, level - 1);
}

/** Multiplicador del empuje con Empuje (o Retroceso en las flechas): cada nivel, uno más. */
export function knockbackFactor(level: number): number {
  return 1 + level;
}

/** Segundos ardiendo con Aspecto de fuego (4 por nivel). */
export function fireAspectSeconds(level: number): number {
  return 4 * level;
}

/** Segundos que arde lo que alcanza una flecha con Fuego. */
export const FLAME_SECONDS = 5;

/** Daño del barrido a las criaturas de alrededor: 1 + daño del golpe × nivel / (nivel + 1). */
export function sweepDamage(attack: number, level: number): number {
  return 1 + attack * (level > 0 ? level / (level + 1) : 0);
}

/** Daño base de la flecha con Poder (Minecraft: 2 + 0,5 por nivel + 0,5). */
export function powerDamage(base: number, level: number): number {
  return level > 0 ? base + 0.5 * level + 0.5 : base;
}

/** Criaturas que atraviesa una flecha con Perforación antes de pararse (nivel + 1 en total). */
export function piercingHits(level: number): number {
  return level + 1;
}

/** Segundos para cargar la ballesta con Carga rápida (1,25 − 0,25 por nivel). */
export function crossbowChargeTime(level: number): number {
  return Math.max(0, 1.25 - 0.25 * level);
}

// ------------------------------------------------------------------ herramientas

/** Velocidad extra de minado con Eficiencia (nivel² + 1), sólo si la herramienta es la adecuada. */
export function efficiencyBonus(level: number): number {
  return level > 0 ? level * level + 1 : 0;
}

/**
 * Irrompibilidad: ¿se libra este uso del desgaste? Herramientas: con probabilidad nivel / (nivel + 1).
 * Armaduras: sólo se gastan con probabilidad 0,6 + 0,4 / (nivel + 1).
 */
export function unbreakingSaves(level: number, armor: boolean, rand: () => number): boolean {
  if (level <= 0) return false;
  if (armor) return rand() >= 0.6 + 0.4 / (level + 1);
  return rand() >= 1 / (level + 1);
}

/** Reparación: durabilidad que recuperan `xp` puntos de experiencia (2 por punto). */
export const MENDING_PER_XP = 2;

// ------------------------------------------------------------------ armadura

/** Causas de daño de fuego, explosión, proyectil y caída (para las protecciones). */
const FIRE_CAUSES = new Set(['fire', 'lava', 'campfire']);
const BLAST_CAUSES = new Set(['explosion', 'creeper']);
const PROJECTILE_CAUSES = new Set(['arrow', 'trident', 'llama', 'snowball']);
/** Lo que ninguna protección reduce (el vacío y /matar). */
const UNPROTECTED = new Set(['void', 'kill', 'sonic_boom']); // Fase 7.5 (abismo): el estampido del warden atraviesa las protecciones

/**
 * Factor de protección de los encantamientos (EPF) de la armadura puesta contra una causa: Protección
 * 1 por nivel, las específicas 2 por nivel y Caída de pluma 3 por nivel; como mucho 20.
 */
export function protectionPoints(pieces: readonly EnchList[], cause: string): number {
  if (UNPROTECTED.has(cause)) return 0;
  let epf = 0;
  for (const list of pieces) {
    epf += levelIn(list, PROTECTION);
    if (FIRE_CAUSES.has(cause)) epf += 2 * levelIn(list, FIRE_PROTECTION);
    if (BLAST_CAUSES.has(cause)) epf += 2 * levelIn(list, BLAST_PROTECTION);
    if (PROJECTILE_CAUSES.has(cause)) epf += 2 * levelIn(list, PROJECTILE_PROTECTION);
    if (cause === 'fall') epf += 3 * levelIn(list, FEATHER_FALLING);
  }
  return Math.min(20, epf);
}

/** Daño tras las protecciones: cada punto quita un 4 % (hasta un 80 %). */
export function applyProtection(damage: number, epf: number): number {
  return damage * (1 - Math.min(20, Math.max(0, epf)) / 25);
}

/** Protección contra el fuego: el fuego dura menos (−15 % por nivel, sumando las piezas). */
export function burnTimeFactor(fireProtLevels: number): number {
  return Math.max(0, 1 - 0.15 * fireProtLevels);
}

/** Protección contra explosiones: resiste el empuje de las explosiones (+15 % por nivel). */
export function blastKnockbackFactor(blastLevels: number): number {
  return Math.max(0, 1 - 0.15 * blastLevels);
}

/** Respiración: el aire se gasta con probabilidad 1 / (nivel + 1) (aguanta nivel + 1 veces más). */
export function airDrainFactor(level: number): number {
  return 1 / (level + 1);
}

/** Agilidad acuática: parte del frenado del agua que se quita (un tercio por nivel, hasta 3). */
export function depthStriderFactor(level: number): number {
  return Math.min(3, level) / 3;
}

/**
 * Fase 7.5 (abismo): Sigilo rápido: velocidad agachado (y gateando) respecto a la de andar: 30 % + 15 % por
 * nivel (como mucho, la de andar).
 */
export function sneakSpeedFactor(level: number): number {
  return Math.min(1, 0.3 + 0.15 * Math.max(0, level));
}

/** Paso helado: radio del disco de hielo (2 + nivel, como mucho 16). */
export function frostWalkerRadius(level: number): number {
  return Math.min(16, 2 + level);
}

/** Espinas: probabilidad (15 % por nivel) y daño al atacante (de 1 a 5). */
export function thornsChance(level: number): number {
  return 0.15 * level;
}

export function thornsDamage(rand: () => number): number {
  return 1 + Math.floor(rand() * 4);
}

// ------------------------------------------------------------------ pesca y tridente

/** Atracción: segundos menos de espera por nivel (Minecraft: 5 s). */
export function lureReduction(level: number): number {
  return 5 * level;
}

/**
 * Suerte marina: pesos de basura, tesoro y peces (10, 5 y 85 de base; cada nivel quita 2 a la basura,
 * suma 2 al tesoro y quita 1 a los peces).
 */
export function fishingWeights(luck: number): { junk: number; treasure: number; fish: number } {
  return {
    junk: Math.max(0, 10 - 2 * luck),
    treasure: Math.max(0, 5 + 2 * luck),
    fish: Math.max(0, 85 - luck),
  };
}

/** Propulsión acuática: velocidad de salida (bloques/s): 3 · (1 + nivel) / 4 bloques por tick. */
export function riptideSpeed(level: number): number {
  return level > 0 ? (3 * (1 + level)) / 4 * 20 : 0;
}

/** Lealtad: velocidad a la que vuelve el tridente (bloques/s, crece con el nivel). */
export function loyaltySpeed(level: number): number {
  return 10 + 8 * level;
}
