// Fase 6.5 (colecciones): botín especial al morir una criatura.
// - Explosión de un creeper cargado: la primera víctima que sea zombi, esqueleto o creeper suelta su cabeza.
// - Creeper muerto por la flecha de un esqueleto: suelta un disco de música al azar.
import { SKULLS } from '../../blocks';
import { MOB_CREEPER } from '../../mobs';
import { MOB_SKULL, CREEPER_DISCS, isSkeletonArcher } from '../../collections';
import type { Entity } from './types';
import type { Entities } from './Entities';

export function collectionDrops(m: Entities, e: Entity, killer: string | number | null): void {
  const blast = m.chargedBlast;
  const kind = MOB_SKULL[e.type];
  if (blast && !blast.dropped && kind) {
    blast.dropped = true;
    m.dropStacks([{ id: SKULLS[kind], count: 1 }], e.x, e.y + 0.3, e.z);
  }
  if (e.type === MOB_CREEPER && typeof killer === 'number') {
    const archer = m.list.get(killer);
    if (archer && isSkeletonArcher(archer.type)) {
      const disc = CREEPER_DISCS[Math.floor(m.rand() * CREEPER_DISCS.length)];
      m.dropStacks([{ id: disc, count: 1 }], e.x, e.y + 0.3, e.z);
    }
  }
}
