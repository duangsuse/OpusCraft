// Fase 6.5 (remate): soporte para armadura. La peana de piedra lisa y los palos de roble son cubos
// escalados (como los sedales); la armadura la dibuja EntityRenderer con las cajas del jugador.
import { mat4 } from 'gl-matrix';
import type { ItemDraw, ItemRenderer } from './ItemRenderer';
import type { ClientEntity } from '../game/ClientEntities';
import type { RemotePlayerView } from './EntityRenderer';
import { OAK_PLANKS, SMOOTH_STONE } from '../../shared/blocks';
import { EF_GLINT_ARMOR_SHIFT } from '../../shared/protocol'; // Fase 7 (encantamientos)

/** Cajas del soporte en píxeles (x, z centrados; y desde el suelo) y si son de piedra. */
const PARTS: [x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, stone: boolean][] = [
  [-6, 0, -6, 6, 1, 6, true], // peana
  [-3, 1, -1, -1, 12, 1, false], [1, 1, -1, 3, 12, 1, false], // piernas
  [-4, 12, -1, 4, 14, 1, false], // cadera
  [-3, 14, -1, -1, 21, 1, false], [1, 14, -1, 3, 21, 1, false], // tronco
  [-6, 21, -1.5, 6, 24, 1.5, false], // hombros
  [-1, 24, -1, 1, 31, 1, false], // cuello
];

export function pushStandDraws(
  out: ItemDraw[], e: ClientEntity, items: ItemRenderer, rx: number, ry: number, rz: number,
  lightOf: (x: number, y: number, z: number) => [number, number],
): void {
  const light = lightOf(e.x, e.y + 0.5, e.z);
  const wood = items.blockModel(OAK_PLANKS), stone = items.blockModel(SMOOTH_STONE);
  for (const [x0, y0, z0, x1, y1, z1, isStone] of PARTS) {
    const m = mat4.create();
    mat4.translate(m, m, [rx, ry, rz]);
    mat4.rotateY(m, m, e.yaw);
    mat4.translate(m, m, [(x0 + x1) / 32, (y0 + y1) / 32, (z0 + z1) / 32]);
    mat4.scale(m, m, [(x1 - x0) / 16, (y1 - y0) / 16, (z1 - z0) / 16]);
    out.push({ model: isStone ? stone : wood, m, light });
  }
}

/** Vista "de jugador" del soporte para dibujar su armadura con las cajas del jugador. */
export function standArmorView(e: ClientEntity, light: [number, number]): RemotePlayerView | null {
  if (!e.armor?.some(Boolean)) return null;
  return {
    id: `stand${e.id}`, name: '', shirt: '', x: e.x, y: e.y, z: e.z, bodyYaw: e.yaw, headYaw: e.yaw, pitch: 0,
    walkPhase: 0, walkAmount: 0, swing: 0, sneaking: false, light, armor: e.armor, armorDye: e.armorDye,
    glint: ((e.flags >> EF_GLINT_ARMOR_SHIFT) & 15) << 2, // Fase 7 (encantamientos)
  };
}
