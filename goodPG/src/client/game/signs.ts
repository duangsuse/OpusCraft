// Carteles en el cliente: el texto de cada uno (lo manda el servidor) y la lista de los cercanos que
// hay que dibujar.
import { BLOCK_WALL, isSign, stateProps, hangingSignKind } from '../../shared/blocks';
import { sanitizeSignLines, signIsBlank } from '../../shared/signText';
import type { SignDraw } from '../render/SignTextRenderer';

/** Distancia a la que se dibuja el texto. */
const SIGN_RANGE = 32;

export class SignTexts {
  private text = new Map<string, string[]>();

  get(x: number, y: number, z: number): string[] {
    return this.text.get(`${x},${y},${z}`) ?? [];
  }

  set(x: number, y: number, z: number, raw: unknown): void {
    const lines = sanitizeSignLines(raw);
    const k = `${x},${y},${z}`;
    if (!lines || signIsBlank(lines)) this.text.delete(k);
    else this.text.set(k, lines);
  }

  clear(): void {
    this.text.clear();
  }

  /** Carteles con texto cerca de la cámara (y que siguen siendo carteles). */
  draws(getBlock: (x: number, y: number, z: number) => number, camX: number, camY: number, camZ: number): SignDraw[] {
    const out: SignDraw[] = [];
    for (const [k, lines] of this.text) {
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x + 0.5 - camX) > SIGN_RANGE || Math.abs(y + 0.5 - camY) > SIGN_RANGE || Math.abs(z + 0.5 - camZ) > SIGN_RANGE) continue;
      const id = getBlock(x, y, z);
      if (!isSign(id)) continue;
      out.push({ x, y, z, facing: stateProps(id)!.facing, wall: BLOCK_WALL[id] >= 0, hanging: hangingSignKind(id), lines });
    }
    return out;
  }
}
