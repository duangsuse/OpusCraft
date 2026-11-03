// Fase 7.5 (océano): la aparición del guardián anciano. Cuando su maldición alcanza al jugador, su cara
// (el frente del cuerpo con las placas, el ojo y las púas, sacados de su propia textura) aparece en medio
// de la pantalla, se acerca y se desvanece, con su lamento.
import { MOBS, MOB_ELDER_GUARDIAN, boxFaces } from '../../shared/mobs';
import { generateMobTexture } from '../textures/mobTextures';
import { ELDER_FACE_COLORS } from '../textures/oceanMobTextures';
import type { Game } from './Game';
import '../ui/elderCurse.css';

/** Lado del dibujo (píxeles de textura). */
const SIZE = 40;
let face: HTMLCanvasElement | null = null;

/** Dibuja la cara una vez (a partir de la textura del anciano). */
function drawFace(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const tex = generateMobTexture(MOB_ELDER_GUARDIAN);
  const def = MOBS[MOB_ELDER_GUARDIAN];
  const rgb = (k: readonly number[]) => `rgb(${k[0] | 0},${k[1] | 0},${k[2] | 0})`;
  const col = ELDER_FACE_COLORS;
  // Púas: cuatro en los centros de las aristas de delante y cuatro en las esquinas (en diagonal).
  g.fillStyle = rgb(col.spike);
  g.fillRect(19, 5, 2, 7);
  g.fillRect(19, 28, 2, 7);
  g.fillRect(5, 19, 7, 2);
  g.fillRect(28, 19, 7, 2);
  for (let k = 0; k < 5; k++) {
    g.fillRect(11 - k, 11 - k, 2, 2);
    g.fillRect(27 + k, 11 - k, 2, 2);
    g.fillRect(11 - k, 27 + k, 2, 2);
    g.fillRect(27 + k, 27 + k, 2, 2);
  }
  // Placas de los lados (su canto) y el frente del cuerpo copiado de la textura.
  g.fillStyle = rgb(col.plate);
  g.fillRect(12, 14, 2, 12);
  g.fillRect(26, 14, 2, 12);
  g.fillRect(14, 12, 12, 2);
  g.fillRect(14, 26, 12, 2);
  const blit = (name: string, dx: number, dy: number) => {
    const p = def.parts.find((q) => q.name === name);
    if (!p) return;
    const [u, v, fw, fh] = boxFaces(p.uv[0], p.uv[1], p.size[0], p.size[1], p.size[2])[4];
    const img = g.createImageData(fw, fh);
    for (let j = 0; j < fh; j++) {
      for (let i = 0; i < fw; i++) {
        const o = ((v + j) * tex.width + (u + i)) * 4, t = (j * fw + i) * 4;
        img.data[t] = tex.rgba[o];
        img.data[t + 1] = tex.rgba[o + 1];
        img.data[t + 2] = tex.rgba[o + 2];
        img.data[t + 3] = 255;
      }
    }
    g.putImageData(img, dx, dy);
  };
  blit('body', 14, 14);
  blit('eye', 19, 19);
  return c;
}

/** Muestra la aparición y su lamento. */
export function showElderCurse(g: Game): void {
  g.audio.playOceanSfx('elder_curse', null);
  try {
    if (!face) {
      face = drawFace();
      face.id = 'elder-curse';
      document.body.appendChild(face);
    }
    face.classList.remove('show');
    void face.offsetWidth; // reinicia la animación
    face.classList.add('show');
  } catch {
    /* sin DOM (pruebas) */
  }
}
