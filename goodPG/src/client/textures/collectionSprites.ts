// Fase 6.5 (colecciones): sprites del saco de tinta brillante, el marco brillante y los discos de música.
// Mismo formato que SPRITES en itemSprites.ts ('.' transparente; el contorno lo pone él). Cada disco es
// un vinilo negro con surcos y una etiqueta propia (colores y dibujo distintos para cada uno).
import { DISCS } from '../../shared/discs';

type RGB = readonly [number, number, number];
interface Ink {
  c: RGB;
  o?: RGB;
  bare?: boolean;
}
interface SpriteDef {
  rows: readonly string[];
  inks: Readonly<Record<string, Ink>>;
  holes?: boolean;
}

const ink = (c: RGB, o?: RGB): Ink => ({ c, o });

/** Dibujo de la etiqueta: mitades, anillo, cuartos, diagonal o puntos. */
type LabelStyle = 'half' | 'ring' | 'quarters' | 'diagonal' | 'dots' | 'plain';

/** Etiqueta de cada disco (en el orden de DISCS): color principal, color de acento y dibujo. */
const LABELS: Record<string, [RGB, RGB, LabelStyle]> = {
  '13': [[226, 222, 210], [120, 116, 104], 'ring'],
  cat: [[118, 206, 70], [228, 244, 196], 'half'],
  blocks: [[222, 96, 52], [250, 206, 120], 'quarters'],
  chirp: [[214, 56, 48], [250, 170, 160], 'dots'],
  far: [[126, 214, 130], [52, 120, 70], 'diagonal'],
  mall: [[132, 96, 208], [216, 196, 250], 'half'],
  mellohi: [[196, 120, 206], [252, 236, 250], 'ring'],
  stal: [[46, 46, 50], [236, 236, 236], 'quarters'],
  strad: [[240, 240, 236], [170, 170, 176], 'dots'],
  ward: [[58, 132, 64], [236, 214, 92], 'diagonal'],
  '11': [[64, 60, 58], [150, 140, 126], 'plain'],
  wait: [[70, 150, 226], [206, 232, 252], 'ring'],
  otherside: [[46, 104, 150], [240, 196, 80], 'quarters'],
  '5': [[30, 62, 70], [104, 226, 232], 'ring'], // Fase 7.5 (abismo): verde del sculk con el brillo del eco
  tears: [[226, 236, 242], [110, 170, 226], 'dots'], // Fase 8.3 (criaturas del Nether): blanco con lágrimas azules
  pigstep: [[196, 60, 36], [58, 22, 20], 'quarters'], // Fase 8.4 (estructuras del Nether): rojo del Nether con negro
};

function discSprite(key: string): SpriteDef {
  const [main, accent, style] = LABELS[key];
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const r = Math.hypot(dx, dy);
      if (r > 6.9) {
        row += '.';
        continue;
      }
      if (r < 1) {
        row += 'k'; // agujero del centro
        continue;
      }
      if (r < 3) {
        const a = Math.atan2(dy, dx);
        const acc = style === 'half' ? dy > 0
          : style === 'ring' ? r > 2.2
            : style === 'quarters' ? dx * dy > 0
              : style === 'diagonal' ? Math.abs(dx - dy) < 1.2
                : style === 'dots' ? (Math.round(a / (Math.PI / 2)) & 1) === 0 && r > 1.8
                  : false;
        row += acc ? 'a' : 'l';
        continue;
      }
      // Vinilo: surcos (anillos algo más claros) y un brillo arriba a la izquierda.
      const shine = dx < 0 && dy < 0 && Math.abs(dx - dy) < 1.5 && r > 3.5 && r < 6.2;
      row += shine ? 's' : Math.abs(r - 4.6) < 0.45 || Math.abs(r - 6) < 0.35 ? 'g' : 'v';
    }
    rows.push(row);
  }
  const edge: RGB = [8, 8, 10];
  return {
    rows,
    inks: {
      v: ink([30, 30, 34], edge), g: ink([48, 48, 54], edge), s: ink([92, 92, 104], edge), k: ink([14, 14, 16], edge),
      l: ink(main, edge), a: ink(accent, edge),
    },
  };
}

export const COLLECTION_SPRITES: Record<string, SpriteDef> = {
  ...Object.fromEntries(DISCS.map((d) => [`music_disc_${d.key}`, discSprite(d.key)])),
  // Saco de tinta brillante: como el de tinta, en turquesa con destellos.
  glow_ink_sac: {
    rows: [
      '................',
      '................',
      '.......11.......',
      '......1221......',
      '.......11.......',
      '.....122221.....',
      '....12w22331....',
      '...1222223331...',
      '...122223w331...',
      '...1222333331...',
      '....12333w31....',
      '.....133331.....',
      '......1111..44..',
      '.............4..',
      '................',
      '................',
    ],
    inks: {
      '1': ink([34, 104, 104], [8, 36, 38]),
      '2': ink([86, 214, 196], [8, 36, 38]),
      '3': ink([52, 158, 150], [8, 36, 38]),
      '4': ink([30, 86, 90], [6, 28, 30]),
      w: ink([214, 255, 240], [8, 36, 38]),
    },
  },
  // Marco brillante: el marco con madera clara y el fondo de tinta brillante.
  glow_item_frame: {
    rows: [
      '................',
      '................',
      '..wwwwwwwwwwww..',
      '..wddddddddddw..',
      '..wdllllllllbw..',
      '..wdlllgllllbw..',
      '..wdllllllglbw..',
      '..wdlgllllllbw..',
      '..wdllllglllbw..',
      '..wdllllllllbw..',
      '..wdlllllgllbw..',
      '..wdbbbbbbbbbw..',
      '..wwwwwwwwwwww..',
      '................',
      '................',
      '................',
    ],
    inks: {
      w: ink([206, 178, 112], [70, 52, 24]), d: ink([160, 128, 76], [70, 52, 24]), b: ink([178, 146, 90], [70, 52, 24]),
      l: ink([70, 170, 158], [70, 52, 24]), g: ink([184, 250, 228], [70, 52, 24]),
    },
  },
};
