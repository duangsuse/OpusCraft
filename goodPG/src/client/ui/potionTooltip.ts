// Fase 7 (pociones): líneas de la descripción de las pociones y las flechas con efecto (como en
// Minecraft): cada efecto con su nivel y su duración (azul si es bueno, rojo si es malo), lo que cambia
// al aplicarse (daño, velocidad, suerte) y cómo se usa.
import { BREWING_STAND } from '../../shared/blocks';
import {
  EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_STRENGTH, EFFECT_WEAKNESS, EFFECT_LUCK, EFFECT_UNLUCK,
} from '../../shared/effects';
import { potionEffectLines, potionEffects, potionKind, potionType } from '../../shared/potions';
import type { ItemStack } from '../../shared/items';

const dim = (t: string) => `<span class="tt-dim">${t}</span>`;

/** Lo que cambia un efecto al aplicarse ([texto, bueno]) o null si no tiene nada que contar. */
function modifier(id: number, amp: number): [string, boolean] | null {
  const n = amp + 1;
  switch (id) {
    case EFFECT_SPEED: return [`速度 +${20 * n}%`, true];
    case EFFECT_SLOWNESS: return [`速度 −${Math.min(100, 15 * n)}%`, false];
    case EFFECT_STRENGTH: return [`攻击伤害 +${3 * n}`, true];
    case EFFECT_WEAKNESS: return [`攻击伤害 −${4 * n}`, false];
    case EFFECT_LUCK: return [`幸运 +${n}`, true];
    case EFFECT_UNLUCK: return [`幸运 −${n}`, false];
    default: return null;
  }
}

const USE: Readonly<Record<string, string>> = {
  drink: '按住右键：饮用',
  splash: '右键：投掷（对溅到的目标生效）',
  lingering: '右键：投掷（留下药水效果云）',
  arrow: '需用弓或弩射出',
};

/** Líneas (HTML) que añaden las pociones a la descripción de una pila. */
export function potionTooltip(s: ItemStack): string[] {
  if (s.id === BREWING_STAND) return [dim('用烈焰粉作燃料来酿造药水')];
  const kind = potionKind(s.id);
  if (!kind) return [];
  const type = potionType(s);
  const out = potionEffectLines(kind, type).map(([t, good]) => `<span class="${good ? 'tt-good' : 'tt-bad'}">${t}</span>`);
  const mods = potionEffects(type, kind).map(([id, , amp]) => modifier(id, amp)).filter((m): m is [string, boolean] => !!m);
  if (mods.length) {
    out.push('<span class="tt-gap"></span>', dim('生效时：'));
    for (const [t, good] of mods) out.push(`<span class="${good ? 'tt-good' : 'tt-bad'}">${t}</span>`);
  }
  out.push(dim(USE[kind]));
  return out;
}
