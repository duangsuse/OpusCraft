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
      out.push(dim('按住右键装填（消耗箭）'));
      break;
    case CROSSBOW_CHARGED:
      out.push(dim('已装填：右键发射'));
      // Fase 7 (remate): la flecha con efecto que lleva cargada.
      if (s.data?.ap !== undefined) out.push(dim(`弹射物：${s.data.ap === -2 ? '光灵箭' : potionName('arrow', s.data.ap)}`)); // Fase 8.3
      break;
    case TRIDENT:
      out.push(dim('按住右键蓄力，松开投掷'));
      break;
    case FLINT_AND_STEEL:
      out.push(dim('右键：点燃火焰、蜡烛和营火'));
      break;
    case GOAT_HORN:
      out.push(dim(`曲调：${hornTune(s.dmg)}`));
      break;
    case CARROT_ON_A_STICK:
      out.push(dim('引导你骑乘的已上鞍的猪（右键：加速）'));
      break;
    // Fase 8.3 (criaturas del Nether).
    case WARPED_FUNGUS_ON_A_STICK:
      out.push(dim('引导你骑乘的已上鞍的炽足兽（右键：加速）'));
      break;
    case FIRE_CHARGE:
      out.push(dim('右键：点燃火焰（会被消耗）'));
      break;
    case SPECTRAL_ARROW:
      out.push(dim('命中的目标会发光 10 秒'));
      break;
    case TURTLE_HELMET:
      out.push(dim('出水后获得水下呼吸'));
      break;
    case WOLF_ARMOR:
      out.push(dim('用于你驯服的狼（可用剪刀取下）'));
      break;
    case FIREWORK_ROCKET: {
      out.push(dim(`飞行时间：${fireworkFlight(s.dmg)}`));
      const c = fireworkColors(s.dmg);
      if (c) out.push(dim(`颜色：${colorNames(c)}`));
      break;
    }
    case FIREWORK_STAR:
      if (s.dmg) out.push(dim(`颜色：${colorNames(s.dmg)}`));
      break;
    case CONDUIT:
      out.push(dim('置于水中并由海晶石框架激活时，给予潮涌能量'));
      break;
    // Fase 8.5 (lo que da el Nether): la plantilla de mejora (como la describe Java) y los bloques nuevos.
    case NETHERITE_UPGRADE_SMITHING_TEMPLATE:
      out.push(dim('下界合金升级'), '<span class="tt-gap"></span>', dim('可用于：'), '&nbsp;钻石装备',
        dim('所需材料：'), '&nbsp;下界合金锭');
      break;
    case RESPAWN_ANCHOR:
      out.push(dim('用萤石充能；在下界可设置重生点'));
      break;
    case LODESTONE:
      out.push(dim('对其使用指南针，即可让它指向此处'));
      break;
    case BEACON:
      out.push(dim('放在由金属或矿物方块构成的宝塔上时，为周围提供效果'));
      break;
  }
  const horse = Object.entries(HORSE_ARMOR).find(([, id]) => id === s.id);
  if (horse) out.push('<span class="tt-gap"></span>', dim('在马身上：'), `<span class="tt-armor">+${HORSE_ARMOR_POINTS[horse[0]]} 护甲</span>`);
  return out;
}
