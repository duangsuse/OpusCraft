// Fase 6.5 (equipo): texturas de las armaduras que se ponen a los animales, con la misma disposición de
// cajas que la criatura (se dibujan sobre ella con las cajas algo más grandes). Lo que la armadura no
// cubre queda transparente.
// - Caballo: cuerpo, cuello, cabeza y hocico enteros y la parte de arriba de las patas; placas con
//   remaches y un testuz más claro en la frente. Cuero, hierro, oro o diamante.
// - Lobo: lomo y melena enteros y el arranque de las patas, con las placas de escama de armadillo.
import { tintRamp, tintPlates } from '../render/dyeArt'; // la armadura teñida
import { LEATHER_COLOR } from '../../shared/dyedColor';
import type { MobDef } from '../../shared/mobs';
import { boxFaces, MOB_HORSE, MOB_WOLF } from '../../shared/mobs';
import { HORSE_ARMOR, WOLF_ARMOR } from '../../shared/items';
import { helmetTexture } from './critterTextures'; // Fase 7.5 (fauna)
import { netherGearTexture } from './netherMobTextures'; // Fase 8.3 (criaturas del Nether)
import { isNetherMob } from '../../shared/netherMobs';

type RGB = readonly [number, number, number];

/** Textura RGBA (la misma forma que MobTexture del renderizador de criaturas). */
export interface GearTexture {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Rampas de 4 tonos (brillo, base, sombra, junta) por material. */
const HORSE_RAMPS: Record<string, readonly RGB[]> = {
  leather: [[204, 142, 90], [168, 106, 62], [124, 72, 38], [80, 44, 20]],
  iron: [[246, 246, 250], [206, 206, 214], [150, 150, 160], [96, 96, 106]],
  golden: [[255, 244, 160], [246, 204, 52], [200, 144, 22], [140, 92, 10]],
  diamond: [[210, 255, 250], [100, 228, 214], [50, 176, 170], [22, 110, 110]],
  netherite: [[140, 126, 142], [92, 82, 94], [64, 58, 66], [36, 32, 38]], // Fase 8.5
};
const WOLF_RAMP: readonly RGB[] = [[226, 172, 150], [196, 128, 112], [150, 90, 78], [96, 52, 44]];

/** Qué cubre la armadura de cada parte: 'all' entera, un número = las filas de arriba de sus caras laterales. */
const HORSE_COVER: Record<string, 'all' | number> = { body: 'all', neck: 'all', head: 'all', mouth: 'all', leg0: 5, leg1: 5, leg2: 5, leg3: 5 };
const WOLF_COVER: Record<string, 'all' | number> = { body: 'all', mane: 'all', leg0: 3, leg1: 3, leg2: 3, leg3: 3 };

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Textura de la armadura `gear` para la criatura `def` (null si no le va). */
export function gearTexture(def: MobDef, gear: number, dye?: number): GearTexture | null {
  if (isNetherMob(def.id)) return netherGearTexture(def, gear); // Fase 8.3: la armadura de oro de los piglins
  const helmet = helmetTexture(def, gear); // Fase 7.5 (fauna): el casco del jinete esqueleto
  if (helmet) return helmet;
  let ramp: readonly RGB[] | null = null;
  let plates: readonly RGB[] | null = null;
  let cover: Record<string, 'all' | number> = {};
  const wolf = def.id === MOB_WOLF && gear === WOLF_ARMOR;
  if (def.id === MOB_HORSE) {
    const mat = Object.entries(HORSE_ARMOR).find(([, id]) => id === gear)?.[0];
    if (mat) {
      ramp = mat === 'leather' && dye !== undefined ? tintRamp(HORSE_RAMPS.leather, dye) : HORSE_RAMPS[mat]; // el cuero teñido, de su color
      cover = HORSE_COVER;
    }
  } else if (wolf) {
    ramp = WOLF_RAMP;
    cover = WOLF_COVER;
    if (dye !== undefined) plates = tintPlates(WOLF_RAMP, dye); // teñida: las placas, del color (los bordes, no)
  }
  if (!ramp) return null;
  const [w, h] = def.atlas;
  const rgba = new Uint8Array(w * h * 4);
  def.parts.forEach((part, pi) => {
    const c = cover[part.name];
    if (c === undefined) return;
    const [pw, ph, pd] = part.size.map((v) => Math.round(v));
    boxFaces(part.uv[0], part.uv[1], pw, ph, pd).forEach(([fu, fv, fw, fh], f) => {
      for (let j = 0; j < fh; j++) {
        for (let i = 0; i < fw; i++) {
          const side = f !== 2 && f !== 3;
          if (c !== 'all' && (!side || j >= c)) continue;
          const px = fu + i, py = fv + j;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          // Placas: juntas cada 4 píxeles, borde de arriba claro y de abajo oscuro, remaches.
          let tone = 1;
          const edge = j === 0 || i === 0 || i === fw - 1 || (c !== 'all' ? j === c - 1 : j === fh - 1);
          if (wolf) {
            // Escamas en filas desplazadas.
            const row = Math.floor(j / 2), col = Math.floor((i + (row % 2) * 2) / 4);
            tone = j % 2 === 1 ? 2 : (i + (row % 2) * 2) % 4 === 0 ? 3 : col % 2 ? 1 : 0;
          } else {
            if ((i % 4 === 0 && i > 0) || (j % 4 === 0 && j > 0)) tone = 2;
            if (i % 4 === 2 && j % 4 === 2) tone = 0;
            // Testuz: la frente del caballo, más clara.
            if (part.name === 'head' && f === 4) tone = j < 2 ? 0 : 1;
          }
          if (edge) tone = j === 0 ? 0 : 3;
          const n = 0.94 + hash(px, py, pi) * 0.12;
          const col = plates && !edge && tone <= 1 ? plates[tone] : ramp![tone];
          const o = (py * w + px) * 4;
          rgba[o] = Math.min(255, col[0] * n);
          rgba[o + 1] = Math.min(255, col[1] * n);
          rgba[o + 2] = Math.min(255, col[2] * n);
          rgba[o + 3] = 255;
        }
      }
    });
  });
  return { width: w, height: h, rgba };
}

/** Cuánto más grandes (en píxeles del modelo) son las cajas de la armadura que las de la criatura. */
export const GEAR_INFLATE = 0.4;
