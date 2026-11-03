// Fase 6.5 (decoración): cuadros y marcos colgados. Cada celda de un cuadro es un cubo aplanado con el
// arte en la cara del frente (bloques ocultos de decorBlocks.ts); el marco, otro cubo aplanado con el
// objeto delante, girado de 45° en 45°.
import { mat4 } from 'gl-matrix';
import type { ItemDraw, ItemRenderer } from './ItemRenderer';
import type { ClientEntity } from '../game/ClientEntities';
import { PAINTING_CELLS, ITEM_FRAME_MODEL } from '../../shared/blocks';
import { DIR_X, DIR_Z } from '../../shared/blockModels';
import { ENT_PAINTING, PAINTINGS, HANGING_DEPTH, facingOfYaw } from '../../shared/paintings';
// Fase 6.5 (colecciones): marco brillante (su objeto se dibuja a plena luz).
import { ENT_GLOW_FRAME, isFrameType } from '../../shared/paintings';
import { GLOW_ITEM_FRAME_MODEL } from '../../shared/blocks';

/** Añade a la lista de dibujo un cuadro o un marco (rx, ry, rz: posición respecto a la cámara). */
export function pushHangingDraws(
  out: ItemDraw[], e: ClientEntity, items: ItemRenderer, rx: number, ry: number, rz: number,
  lightOf: (x: number, y: number, z: number) => [number, number],
): void {
  const f = facingOfYaw(e.yaw);
  // La luz de la celda de delante (la entidad está pegada a la pared).
  const light = lightOf(e.x + DIR_X[f] * 0.4, e.y, e.z + DIR_Z[f] * 0.4);
  if (e.type === ENT_PAINTING) {
    const v = PAINTINGS[e.item] ?? PAINTINGS[0];
    const cells = PAINTING_CELLS[PAINTINGS.indexOf(v)];
    for (let cy = 0; cy < v.h; cy++) {
      for (let cx = 0; cx < v.w; cx++) {
        const m = mat4.create();
        mat4.translate(m, m, [rx, ry, rz]);
        mat4.rotateY(m, m, e.yaw);
        mat4.translate(m, m, [cx - (v.w - 1) / 2, (v.h - 1) / 2 - cy, 0]);
        mat4.scale(m, m, [1, 1, HANGING_DEPTH]);
        out.push({ model: items.blockModel(cells[cy * v.w + cx]), m, light });
      }
    }
    return;
  }
  if (!isFrameType(e.type)) return;
  const glow = e.type === ENT_GLOW_FRAME;
  const m = mat4.create();
  mat4.translate(m, m, [rx, ry, rz]);
  mat4.rotateY(m, m, e.yaw);
  const frame = mat4.clone(m);
  mat4.scale(frame, frame, [12 / 16, 12 / 16, HANGING_DEPTH]);
  out.push({ model: items.blockModel(glow ? GLOW_ITEM_FRAME_MODEL : ITEM_FRAME_MODEL), m: frame, light });
  const model = e.item > 0 ? items.model(e.item) : null;
  if (!model) return;
  const size = model.flat ? 0.5 : 0.32;
  mat4.translate(m, m, [0, 0, HANGING_DEPTH / 2 + (model.flat ? 0.02 : size / 2 + 0.01)]);
  mat4.rotateZ(m, m, -e.pitch);
  mat4.scale(m, m, [size, size, size]);
  // Marco brillante: el objeto, con luz de antorcha aunque esté a oscuras.
  out.push({ model, m, light: glow ? [light[0], Math.max(light[1], 0.8)] : light });
}
