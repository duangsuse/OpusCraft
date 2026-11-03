// Fase 6.5 (océano y plantas): partículas de las plantas nuevas, para el muestreo al azar de
// ambientParticles.ts: la flor de esporas suelta esporas verdes que caen despacio (de la propia flor
// y en el aire de alrededor, como en Minecraft) y los pepinos de mar anegados echan alguna burbuja.
import { SPORE_BLOSSOM, isSeaPickle, isWaterlogged } from '../../shared/blocks';
import { PF, SPRITE } from '../render/particles/ParticleSystem';
import type { ParticleFx } from '../render/particles/effects';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Espora de la flor de esporas: cae meciéndose poco a poco. */
function sporeFall(fx: ParticleFx, x: number, y: number, z: number): void {
  fx.ps.spawn({
    x, y, z, vx: rnd(-0.05, 0.05), vy: rnd(-0.25, -0.1), vz: rnd(-0.05, 0.05), life: rnd(5, 9), size: rnd(0.04, 0.07),
    sprite: SPRITE.dust, r: 0.42, g: 0.95, b: 0.32, a: 0.9, grav: 0.15, drag: 1.2, wind: 0.1,
    flags: PF.DRIFT | PF.FADE_IN | PF.COLLIDE | PF.REST,
  });
}

/**
 * Partículas del bloque `b` en (x, y, z) (muestreo al azar alrededor del jugador). Devuelve true si
 * el bloque era de éstos.
 */
export function plantParticles(fx: ParticleFx, b: number, x: number, y: number, z: number): boolean {
  if (b === SPORE_BLOSSOM) {
    if (Math.random() < 0.7) sporeFall(fx, x + rnd(0.3, 0.7), y + 0.75, z + rnd(0.3, 0.7));
    // Esporas en el aire de alrededor de la flor (hasta 7 bloques).
    for (let k = 0; k < 3; k++) sporeFall(fx, x + rnd(-7, 8), y - rnd(0, 6), z + rnd(-7, 8));
    return true;
  }
  if (isSeaPickle(b)) {
    if (isWaterlogged(b) && Math.random() < 0.08) fx.bubbles(x + 0.5, y + 0.4, z + 0.5, 1, 0.2);
    return true;
  }
  return false;
}
