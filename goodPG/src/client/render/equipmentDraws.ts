// Fase 6.5 (equipo): cómo se dibujan el tridente lanzado (como una flecha grande, con la punta por
// delante) y el cohete en vuelo (el dibujo del cohete, de pie y de cara a la cámara).
import { mat4 } from 'gl-matrix';
import type { ItemDraw, ItemRenderer } from './ItemRenderer';
import type { ClientEntity } from '../game/ClientEntities';
import { TRIDENT, FIREWORK_ROCKET } from '../../shared/items';
import { ENT_TRIDENT, ENT_FIREWORK } from '../../shared/equipment';

/** Añade el dibujo de un tridente o un cohete; false si la entidad no es de éstas. */
export function pushEquipmentDraws(
  out: ItemDraw[], e: ClientEntity, items: ItemRenderer, rx: number, ry: number, rz: number,
  lightOf: (x: number, y: number, z: number) => [number, number],
): boolean {
  if (e.type === ENT_TRIDENT) {
    const model = items.model(TRIDENT);
    if (!model) return true;
    const m = mat4.create();
    mat4.translate(m, m, [rx, ry, rz]);
    mat4.rotateY(m, m, e.yaw);
    mat4.rotateX(m, m, e.pitch);
    // La punta del dibujo (arriba a la derecha) hacia delante, y el asta un poco hacia atrás.
    mat4.translate(m, m, [0, 0, 0.35]);
    mat4.rotateY(m, m, Math.PI / 2);
    mat4.rotateZ(m, m, -Math.PI / 4);
    mat4.scale(m, m, [1.25, 1.25, 1.25]);
    out.push({ model, m, light: lightOf(e.x, e.y, e.z) });
    return true;
  }
  if (e.type === ENT_FIREWORK) {
    const model = items.model(FIREWORK_ROCKET);
    if (!model) return true;
    const m = mat4.create();
    mat4.translate(m, m, [rx, ry, rz]);
    mat4.rotateY(m, m, Math.atan2(-rx, -rz));
    mat4.rotateZ(m, m, Math.PI / 4);
    mat4.scale(m, m, [0.55, 0.55, 0.55]);
    out.push({ model, m, light: [0, 1] });
    return true;
  }
  return false;
}
