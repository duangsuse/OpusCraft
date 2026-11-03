// Fase 7 (encantamientos): sprites del libro encantado (tapas violetas con un emblema dorado y un
// marcapáginas turquesa) y de la botella con experiencia (vidrio redondo con el líquido verde y
// amarillo que brilla). Mismo formato que SPRITES en itemSprites.ts, que los añade a los suyos; el
// brillo animado lo pone el dibujo del objeto.

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
const OUT: RGB = [34, 12, 40];

export const ENCHANT_SPRITES: Record<string, SpriteDef> = {
  enchanted_book: {
    rows: [
      '................',
      '................',
      '...ggg1111111...',
      '...g2g22222221..',
      '...g2g222ee222..',
      '...ggg22eGGe22..',
      '...323e2eGGe2e3.',
      '...32322eGGe223.',
      '...ggg222ee223..',
      '...g3g2222e233..',
      '...g3g23333333..',
      '...ggg4444444...',
      '...44pPpPpPpt...',
      '....44444444t...',
      '............t...',
      '................',
    ],
    inks: {
      '1': ink([176, 92, 196], OUT), '2': ink([140, 62, 168], OUT), '3': ink([108, 42, 136], OUT), '4': ink([78, 28, 102], OUT),
      g: ink([236, 196, 88], OUT), e: ink([214, 170, 64], OUT), G: ink([255, 236, 150], OUT),
      p: ink([246, 240, 226], OUT), P: ink([212, 204, 184], OUT), t: ink([72, 214, 204], [18, 70, 72]),
    },
  },
  experience_bottle: {
    rows: [
      '................',
      '.......cc.......',
      '.......cc.......',
      '......gccg......',
      '.......gg.......',
      '......g22g......',
      '....gg1122gg....',
      '...g1w112223g...',
      '...g1w1s1223g...',
      '..g11112s2233g..',
      '..g1s111223s3g..',
      '..g11122223334g.',
      '...g122s23334g..',
      '...g223333344g..',
      '....gg44444gg...',
      '......gggg......',
    ],
    inks: {
      '1': ink([214, 250, 128], [30, 60, 20]), '2': ink([160, 226, 72], [30, 60, 20]), '3': ink([104, 184, 46], [30, 60, 20]),
      '4': ink([62, 128, 30], [30, 60, 20]), s: ink([255, 252, 170], [30, 60, 20]), w: ink([248, 255, 236], [30, 60, 20]),
      g: ink([196, 214, 226], [60, 70, 86]), c: ink([150, 108, 64], [70, 48, 26]),
    },
  },
};
