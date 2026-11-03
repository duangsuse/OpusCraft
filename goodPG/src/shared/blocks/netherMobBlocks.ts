// Fase 8.3 (criaturas del Nether): las dos cabezas que sueltan las criaturas del Nether. El cráneo de
// esqueleto wither (2,5 % al matar un esqueleto wither, 3,5 % + 1 % por nivel de Saqueo; hará falta para
// invocar al Wither) es el cubo de 8×8×8 de siempre. La cabeza de piglin (la suelta el piglin al que mata la
// explosión de un creeper cargado) es como la del piglin: 10 píxeles de ancho, hocico, colmillos y orejas
// caídas (en escalón, porque los modelos de cajas no se inclinan).
// Registrado el último (export * al final de index.ts): no mueve ningún id guardado.
import { mbox, type ModelBox } from '../blockModels';
import { L } from './registry';
import { registerSkull, skullTexture, SKULLS, SKULL_FACES } from './collections';

/** Texturas propias de la cabeza de piglin (además de sus seis caras). */
export const PIGLIN_HEAD_SNOUT = 'piglin_head_snout';
export const PIGLIN_HEAD_EAR = 'piglin_head_ear';

/** Cabeza de piglin mirando al norte (−Z), con la cabeza entre y = 4 y 12 como las demás. */
function piglinHeadBoxes(): ModelBox[] {
  const faces = SKULL_FACES.map((f) => L(skullTexture('piglin', f)));
  const snout = L(PIGLIN_HEAD_SNOUT);
  const ear = L(PIGLIN_HEAD_EAR);
  return [
    mbox(3, 4, 4, 13, 12, 12, faces),
    // Hocico (4×4×1, en la mitad de abajo de la cara) y los dos colmillos a los lados.
    mbox(6, 4, 3, 10, 8, 4, snout),
    mbox(5, 4, 3, 6, 6, 4, snout),
    mbox(10, 4, 3, 11, 6, 4, snout),
    // Orejas: salen de lo alto de los costados y caen hacia fuera.
    mbox(13, 8, 6, 14, 11, 10, ear),
    mbox(14, 5, 6, 15, 8, 10, ear),
    mbox(2, 8, 6, 3, 11, 10, ear),
    mbox(1, 5, 6, 2, 8, 10, ear),
  ];
}

registerSkull('wither_skeleton');
registerSkull('piglin', piglinHeadBoxes(), 5);

/** Bloques de la fase 8.3 en el orden del inventario creativo. */
export const NETHER_MOB_INVENTORY: readonly number[] = [SKULLS.wither_skeleton, SKULLS.piglin];
