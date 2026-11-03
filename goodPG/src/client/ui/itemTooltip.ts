// Descripción de un objeto al pasar el ratón: nombre y, según lo que sea, daño y velocidad de ataque,
// armadura, lo que alimenta y sus efectos, qué bloquea el escudo y la durabilidad que le queda.
import { isShulkerBox } from '../../shared/blocks'; // Fase 8.6
import { mapArea, mapZoom, mapLocked } from '../../shared/mapOps'; // Fase 7.6
import { isBundle, bagWeight, BUNDLE_CAPACITY } from '../../shared/bundles'; // Fase 6.5 (remate)
import { FILLED_MAP } from '../../shared/items';
import { STRUCTURE_MAPS, structureMapArea } from '../../shared/structureMapData'; // Fase 7.5 (mansión)
import './itemTooltip.css';
import { dyedColor } from '../../shared/dyedColor'; // el cuero teñido
import { ITEMS, itemName, type ItemStack } from '../../shared/items';
import { EFFECTS, effectLevel } from '../../shared/effects';
import { attackDamage, attackSpeed } from '../../shared/combat';
import { SUSPICIOUS_STEW, SPYGLASS, CLOCK } from '../../shared/items'; // Fase 6.5 (decoración)
import { stewEffect, stewEffectText } from '../../shared/decorFood'; // Fase 6.5 (decoración)
// Fase 6.5 (libros y estandartes).
import { WRITABLE_BOOK, WRITTEN_BOOK } from '../../shared/items';
import { BOOK_GENERATIONS } from '../../shared/books';
import { bannerLayers, layerName, isBannerPatternItem } from '../../shared/bannerPatterns';
import { discTitle } from '../../shared/collections'; // Fase 6.5 (colecciones)
import { skullKind } from '../../shared/blocks'; // Fase 6.5 (colecciones)
import { equipmentTooltip } from './equipmentTooltip'; // Fase 6.5 (equipo)
import { potionTooltip } from './potionTooltip'; // Fase 7 (pociones)
import { POTION } from '../../shared/items';
import { stackName } from '../../shared/potions';
// Fase 7 (encantamientos): nombre puesto en el yunque, encantamientos (las maldiciones en rojo) y los
// guardados en los libros encantados.
import { ENCHANTS, enchantName, enchantsOf, storedOf, sortedForTooltip, hasGlint } from '../../shared/enchantments';
import { ENCHANTED_BOOK, EXPERIENCE_BOTTLE } from '../../shared/items';
import { DISC_FRAGMENT_5, RECOVERY_COMPASS } from '../../shared/items'; // Fase 7.5 (abismo)

const WEAPONS = new Set(['sword', 'axe', 'pickaxe', 'shovel', 'hoe']);

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** HTML de la descripción de una pila (para un elemento con la clase `tooltip`). */
export function itemTooltipHtml(s: ItemStack): string {
  const def = ITEMS[s.id];
  // Fase 7 (encantamientos): el nombre del yunque va en cursiva; lo encantado, en turquesa (el libro, en amarillo).
  const cls = s.id === ENCHANTED_BOOK || s.id === EXPERIENCE_BOTTLE ? 'tt-rare' : hasGlint(s) ? 'tt-ench' : '';
  const name = s.data?.name ? `<i>${esc(s.data.name)}</i>` : esc(s.id === WRITTEN_BOOK ? itemName(s.id) : stackName(s));
  const lines: string[] = [`<b${cls ? ` class="${cls}"` : ''}>${name}</b>`];
  for (const [id, lvl] of sortedForTooltip([...enchantsOf(s), ...storedOf(s)])) {
    lines.push(`<span class="${ENCHANTS[id]?.curse ? 'tt-bad' : 'tt-dim'}">${esc(enchantName(id, lvl))}</span>`);
  }
  if (dyedColor(s) !== undefined) lines.push('<span class="tt-dim"><i>Teñido</i></span>'); // DyedItemColor (tras los encantamientos)
  if (s.id === EXPERIENCE_BOTTLE) lines.push('<span class="tt-dim">Clic derecho: lanzarla (suelta experiencia)</span>');
  const tool = def?.tool;
  if (tool && WEAPONS.has(tool.kind)) {
    lines.push('<span class="tt-gap"></span>', '<span class="tt-dim">En la mano principal:</span>',
      `<span class="tt-good">Daño por golpe: ${num(attackDamage(s.id))}</span>`,
      `<span class="tt-good">Velocidad de ataque: ${num(attackSpeed(s.id))}</span>`);
  } else if (tool?.kind === 'shield') {
    lines.push('<span class="tt-dim">Clic derecho mantenido: bloquea lo que llega de frente</span>');
  } else if (tool?.kind === 'bow') {
    lines.push('<span class="tt-dim">Mantén el clic derecho para tensarlo (usa flechas)</span>');
  }
  const armor = skullKind(s.id) ? undefined : def?.armor; // Fase 6.5 (colecciones): las cabezas no protegen
  if (armor) {
    lines.push('<span class="tt-gap"></span>', '<span class="tt-dim">En el cuerpo:</span>', `<span class="tt-armor">+${armor.points} de armadura</span>`);
    if (armor.toughness > 0) lines.push(`<span class="tt-armor">+${num(armor.toughness)} de dureza</span>`);
  }
  const food = def?.food;
  if (food) {
    lines.push(`<span class="tt-dim">Alimenta: ${num(food.hunger / 2)} 🍗 · saturación ${num(food.saturation)}</span>`);
    for (const [id, secs, amp, chance] of food.effects ?? []) {
      const e = EFFECTS[id];
      if (!e) continue;
      const lvl = amp > 0 ? ` ${effectLevel(amp)}` : '';
      const p = chance < 1 ? ` · ${Math.round(chance * 100)} %` : '';
      lines.push(`<span class="${e.good ? 'tt-good' : 'tt-bad'}">${e.name}${lvl} (${clock(secs)})${p}</span>`);
    }
  }
  if (def?.drink && s.id !== POTION) lines.push('<span class="tt-dim">Quita todos los efectos</span>');
  lines.push(...potionTooltip(s)); // Fase 7 (pociones)
  // Fase 6.5 (decoración): efecto del estofado sospechoso y uso del catalejo y del reloj.
  if (s.id === SUSPICIOUS_STEW && s.dmg) {
    const good = EFFECTS[stewEffect(s.dmg)?.[0] ?? 0]?.good ?? true; // Fase 7 (efectos): la ceguera, en rojo
    lines.push(`<span class="${good ? 'tt-good' : 'tt-bad'}">${esc(stewEffectText(s.dmg))}</span>`);
  }
  if (s.id === SPYGLASS) lines.push('<span class="tt-dim">Mantén el clic derecho para mirar de lejos</span>');
  if (s.id === CLOCK) lines.push('<span class="tt-dim">En la mano muestra la hora</span>');
  if (s.id === FILLED_MAP && s.dmg && !s.data?.smap) { // Fase 7.5: los de estructura, abajo
    // Fase 7.6: los ampliados, con su escala.
    const a = mapArea(s.dmg, mapZoom(s));
    const scale = a.scale > 1 ? `Escala 1:${a.scale} · zona` : 'Zona';
    lines.push(`<span class="tt-dim">${scale}: x ${a.x0} a ${a.x0 + a.span - 1}, z ${a.z0} a ${a.z0 + a.span - 1}</span>`);
  }
  if (mapLocked(s)) lines.push('<span class="tt-dim">Bloqueado</span>'); // Fase 7.6
  // Fase 7.5 (mansión): mapas del tesoro y de explorador: su escala y su zona (la del objetivo).
  const sm = s.id === FILLED_MAP ? s.data?.smap : undefined;
  if (sm && sm.x !== undefined && sm.z !== undefined && STRUCTURE_MAPS[sm.k]) {
    const a = structureMapArea(sm.k, sm.x, sm.z);
    lines.push(`<span class="tt-dim">Escala 1:${a.scale} · zona: x ${a.x0} a ${a.x0 + a.span - 1}, z ${a.z0} a ${a.z0 + a.span - 1}</span>`);
  }
  // Fase 6.5 (colecciones): título del disco y para qué sirve llevar una cabeza.
  const title = discTitle(s.id);
  if (title) lines.push(`<span class="tt-dim">${esc(title)}</span>`);
  // Fase 7.5 (abismo): el fragmento del disco 5 y la brújula de recuperación.
  if (s.id === DISC_FRAGMENT_5) lines.push('<span class="tt-dim">Disco de música - 5</span>');
  if (s.id === RECOVERY_COMPASS) lines.push('<span class="tt-dim">Apunta a donde moriste por última vez</span>');
  const skull = skullKind(s.id);
  // Fase 8.3: la cabeza de piglin engaña a los piglins y a los piglins brutos; el cráneo wither, a nadie.
  if (skull && skull !== 'player' && skull !== 'wither_skeleton' && skull !== 'dragon') {
    const who = { zombie: 'los zombis', skeleton: 'los esqueletos', creeper: 'los creepers', piglin: 'los piglins' }[skull];
    lines.push(`<span class="tt-dim">Puesta: ${who} te ven a la mitad de distancia</span>`);
  }
  // Fase 6.5 (remate): lo que lleva el saco.
  if (isBundle(s.id)) {
    for (const b of (s.bag ?? []).slice(0, 6)) lines.push(`<span class="tt-dim">${esc(ITEMS[b.id]?.name ?? '?')} ×${b.count}</span>`);
    if ((s.bag?.length ?? 0) > 6) lines.push(`<span class="tt-dim">y ${s.bag!.length - 6} más…</span>`);
    lines.push(`<span class="tt-dim">${bagWeight(s.bag)} / ${BUNDLE_CAPACITY} · clic derecho: meter o sacar</span>`);
  }
  // Fase 8.6: lo que lleva la caja de shulker (las cinco primeras pilas y cuántas más, como en Java).
  if (isShulkerBox(s.id) && s.bag?.length) {
    for (const b of s.bag.slice(0, 5)) lines.push(`<span class="tt-dim">${esc(ITEMS[b.id]?.name ?? '?')} ×${b.count}</span>`);
    if (s.bag.length > 5) lines.push(`<span class="tt-dim">y ${s.bag.length - 5} más…</span>`);
  }
  // Fase 6.5 (libros y estandartes): título, autor y generación del libro; capas del estandarte.
  if (s.id === WRITTEN_BOOK && s.data) {
    lines.push(`<span class="tt-good">${esc(s.data.title ?? '')}</span>`, `<span class="tt-dim">de ${esc(s.data.author ?? '?')}</span>`,
      `<span class="tt-dim">${BOOK_GENERATIONS[s.data.gen ?? 0] ?? ''} · clic derecho: leer</span>`);
  }
  if (s.id === WRITABLE_BOOK) {
    const n = s.data?.pages?.length ?? 0;
    lines.push(`<span class="tt-dim">${n ? `${n} página${n === 1 ? '' : 's'} escrita${n === 1 ? '' : 's'}` : 'En blanco'} · clic derecho: escribir</span>`);
  }
  for (const l of bannerLayers(s)) lines.push(`<span class="tt-dim">${esc(layerName(l))}</span>`);
  if (isBannerPatternItem(s.id)) lines.push('<span class="tt-dim">Para el telar (no se gasta)</span>');
  lines.push(...equipmentTooltip(s)); // Fase 6.5 (equipo)
  const max = tool?.durability ?? armor?.durability;
  if (max) lines.push(`<span class="tt-dim">Durabilidad: ${max - (s.dmg ?? 0)} / ${max}</span>`);
  return lines.join('');
}
