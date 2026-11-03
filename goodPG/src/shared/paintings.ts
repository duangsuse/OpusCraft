// Fase 6.5 (decoración): cuadros y marcos colgados en las paredes. Son entidades (como en Minecraft):
// el servidor las guarda aparte y el cliente las dibuja con capas de la textura de bloques (una por
// cada bloque que ocupa el cuadro). Este módulo no importa nada: lo usan textureDefs, los bloques,
// el servidor y el cliente.
import { DIR_X, DIR_Z } from './blockModels';

/** Entidad de cuadro (extra: variante). */
export const ENT_PAINTING = 107;
/** Entidad de marco (extra: id del objeto que muestra; el giro va en pitch, de 45° en 45°). */
export const ENT_FRAME = 108;

/** Fase 6.5 (colecciones): marco brillante (como el marco, con el objeto a plena luz). */
export const ENT_GLOW_FRAME = 120;

export function isHangingType(type: number): boolean {
  return type === ENT_PAINTING || type === ENT_FRAME || type === ENT_GLOW_FRAME;
}

/** ¿Marco (normal o brillante)? */
export function isFrameType(type: number): boolean {
  return type === ENT_FRAME || type === ENT_GLOW_FRAME;
}

export interface PaintingVariant {
  key: string;
  /** Título (en español). */
  name: string;
  /** Ancho y alto en bloques. */
  w: number;
  h: number;
}

/** Cuadros con arte procedural original. El índice es la variante que se guarda: sólo se añaden al final. */
export const PAINTINGS: readonly PaintingVariant[] = [
  { key: 'dawn', name: 'Amanecer', w: 1, h: 1 },
  { key: 'meadow', name: 'Pradera', w: 1, h: 1 },
  { key: 'lighthouse', name: 'Faro', w: 1, h: 1 },
  { key: 'still_life', name: 'Bodegón', w: 1, h: 1 },
  { key: 'mountains', name: 'Cordillera', w: 2, h: 1 },
  { key: 'river', name: 'El río', w: 2, h: 1 },
  { key: 'cypress', name: 'Ciprés', w: 1, h: 2 },
  { key: 'castle', name: 'Castillo', w: 2, h: 2 },
];

/** Textura de la celda (cx, cy) de un cuadro: cx hacia la derecha y cy hacia abajo desde la esquina de arriba. */
export function paintingCellTexture(v: PaintingVariant, cx: number, cy: number): string {
  return `painting_${v.key}_${cy * v.w + cx}`;
}

/** Nombres de todas las texturas de los cuadros (en el orden de las celdas). */
export const PAINTING_TEXTURES: readonly string[] = PAINTINGS.flatMap((v) => {
  const out: string[] = [];
  for (let cy = 0; cy < v.h; cy++) for (let cx = 0; cx < v.w; cx++) out.push(paintingCellTexture(v, cx, cy));
  return out;
});

/** Grosor de un cuadro o de un marco (en bloques). */
export const HANGING_DEPTH = 1 / 16;

/** Dirección horizontal a la derecha de quien mira un cuadro que da hacia `f` (0 N, 1 E, 2 S, 3 O). */
export function rightOf(f: number): number {
  return (f + 3) & 3;
}

/** Giro (yaw) con el que el frente (+Z del modelo) apunta hacia `f`. */
export function hangingYaw(f: number): number {
  return Math.atan2(DIR_X[f & 3], DIR_Z[f & 3]);
}

/**
 * Celdas de aire que ocupa un cuadro de w×h cuya esquina de abajo a la izquierda (vista de frente)
 * está en (x, y, z) y da hacia f; cada una con su celda de pared detrás y su (cx, cy) de textura.
 */
export function hangingCells(x: number, y: number, z: number, f: number, w: number, h: number):
  { x: number; y: number; z: number; wx: number; wz: number; cx: number; cy: number }[] {
  const r = rightOf(f);
  const out = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const cx = x + DIR_X[r] * i, cz = z + DIR_Z[r] * i, cy = y + j;
      out.push({ x: cx, y: cy, z: cz, wx: cx - DIR_X[f & 3], wz: cz - DIR_Z[f & 3], cx: i, cy: h - 1 - j });
    }
  }
  return out;
}

/** Centro de la entidad: en medio del cuadro, pegado a la pared. */
export function hangingCenter(x: number, y: number, z: number, f: number, w: number, h: number): [number, number, number] {
  const r = rightOf(f);
  const back = 0.5 - HANGING_DEPTH / 2;
  return [
    x + 0.5 + DIR_X[r] * (w - 1) / 2 - DIR_X[f & 3] * back,
    y + 0.5 + (h - 1) / 2,
    z + 0.5 + DIR_Z[r] * (w - 1) / 2 - DIR_Z[f & 3] * back,
  ];
}

/** Dirección (0..3) a la que da un cuadro por su yaw. */
export function facingOfYaw(yaw: number): number {
  let best = 0, bd = Infinity;
  for (let f = 0; f < 4; f++) {
    const d = Math.abs(Math.atan2(Math.sin(yaw - hangingYaw(f)), Math.cos(yaw - hangingYaw(f))));
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/** Tamaño (ancho, alto) en bloques de una entidad colgada: cuadro por variante; el marco, 12/16. */
export function hangingSize(type: number, variant: number): [number, number] {
  if (type === ENT_PAINTING) {
    const v = PAINTINGS[variant] ?? PAINTINGS[0];
    return [v.w, v.h];
  }
  return [12 / 16, 12 / 16];
}

/** Caja (mínimo, máximo) de una entidad colgada centrada en (x, y, z) que da hacia `yaw`. */
export function hangingBox(type: number, variant: number, x: number, y: number, z: number, yaw: number): [number, number, number, number, number, number] {
  const f = facingOfYaw(yaw);
  const [w, h] = hangingSize(type, variant);
  const alongX = DIR_X[f] === 0;
  const hx = (alongX ? w : HANGING_DEPTH) / 2, hz = (alongX ? HANGING_DEPTH : w) / 2;
  return [x - hx, y - h / 2, z - hz, x + hx, y + h / 2, z + hz];
}
