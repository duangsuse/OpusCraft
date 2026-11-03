// Fase 6.5 (equipo): líneas de la descripción del equipo nuevo: cómo se usa cada cosa, los colores y
// el vuelo de los fuegos artificiales, la tonada del cuerno y la armadura de los caballos.
import {
  CROSSBOW, CROSSBOW_CHARGED, TRIDENT, FLINT_AND_STEEL, GOAT_HORN, FIREWORK_ROCKET, FIREWORK_STAR, CARROT_ON_A_STICK, TURTLE_HELMET,
  WOLF_ARMOR, HORSE_ARMOR, WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW, type ItemStack,
  NETHERITE_UPGRADE_SMITHING_TEMPLATE, // Fase 8.5
} from '../../shared/items';
import { DYE_COLORS, COLOR_NAMES, CONDUIT, RESPAWN_ANCHOR, LODESTONE, BEACON } from '../../shared/blocks';
import { HORSE_ARMOR_POINTS, fireworkFlight, fireworkColors, colorList, hornTune } from '../../shared/equipment';
import { potionName } from '../../shared/potions'; // Fase 7 (remate)

const dim = (t: string) => `<span class="tt-dim">${t}</span>`;
const colorNames = (mask: number) => colorList(mask).map((i) => COLOR_NAMES[DYE_COLORS[i]][0]).join(', ');

/** Líneas (HTML) que añade el equipo a la descripción de una pila. */
export function equipmentTooltip(s: ItemStack): string[] {
  const out: string[] = [];
  switch (s.id) {
    case CROSSBOW:
      out.push(dim('Mantén el clic derecho para cargarla (usa flechas)'));
      break;
    case CROSSBOW_CHARGED:
      out.push(dim('Cargada: clic derecho para disparar'));
      // Fase 7 (remate): la flecha con efecto que lleva cargada.
      if (s.data?.ap !== undefined) out.push(dim(`Proyectil: ${s.data.ap === -2 ? 'Flecha espectral' : potionName('arrow', s.data.ap)}`)); // Fase 8.3
      break;
    case TRIDENT:
      out.push(dim('Mantén el clic derecho y suelta para lanzarlo'));
      break;
    case FLINT_AND_STEEL:
      out.push(dim('Clic derecho: enciende fuego, velas y fogatas'));
      break;
    case GOAT_HORN:
      out.push(dim(`Tonada: ${hornTune(s.dmg)}`));
      break;
    case CARROT_ON_A_STICK:
      out.push(dim('Guía al cerdo ensillado que montas (clic derecho: acelerón)'));
      break;
    // Fase 8.3 (criaturas del Nether).
    case WARPED_FUNGUS_ON_A_STICK:
      out.push(dim('Guía al strider ensillado que montas (clic derecho: acelerón)'));
      break;
    case FIRE_CHARGE:
      out.push(dim('Clic derecho: enciende fuego (se gasta)'));
      break;
    case SPECTRAL_ARROW:
      out.push(dim('Lo que alcanza brilla durante 10 s'));
      break;
    case TURTLE_HELMET:
      out.push(dim('Respiración acuática al sacar la cabeza del agua'));
      break;
    case WOLF_ARMOR:
      out.push(dim('Para tu lobo domesticado (con tijeras se le quita)'));
      break;
    case FIREWORK_ROCKET: {
      out.push(dim(`Duración del vuelo: ${fireworkFlight(s.dmg)}`));
      const c = fireworkColors(s.dmg);
      if (c) out.push(dim(`Colores: ${colorNames(c)}`));
      break;
    }
    case FIREWORK_STAR:
      if (s.dmg) out.push(dim(`Colores: ${colorNames(s.dmg)}`));
      break;
    case CONDUIT:
      out.push(dim('Bajo el agua, con un marco de prismarina, da Poder del conducto'));
      break;
    // Fase 8.5 (lo que da el Nether): la plantilla de mejora (como la describe Java) y los bloques nuevos.
    case NETHERITE_UPGRADE_SMITHING_TEMPLATE:
      out.push(dim('Mejora de netherita'), '<span class="tt-gap"></span>', dim('Se aplica a:'), '&nbsp;Equipo de diamante',
        dim('Ingredientes:'), '&nbsp;Lingote de netherita');
      break;
    case RESPAWN_ANCHOR:
      out.push(dim('Se carga con piedra luminosa; en el Nether, fija el punto de reaparición'));
      break;
    case LODESTONE:
      out.push(dim('Usa una brújula en ella para que apunte aquí'));
      break;
    case BEACON:
      out.push(dim('Sobre una pirámide de bloques de metal o mineral, da efectos a su alrededor'));
      break;
  }
  const horse = Object.entries(HORSE_ARMOR).find(([, id]) => id === s.id);
  if (horse) out.push('<span class="tt-gap"></span>', dim('En el caballo:'), `<span class="tt-armor">+${HORSE_ARMOR_POINTS[horse[0]]} de armadura</span>`);
  return out;
}
