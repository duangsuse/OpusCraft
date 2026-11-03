// Granja: tierra de cultivo, cultivos por edades (trigo, zanahorias, patatas, remolachas), tarta,
// tallos de calabaza y sandía (con su fruto), calabaza tallada, farol de calabaza y compostador.
import { PUMPKIN } from './classic';
import { family, familyBase, L, isCrop, R_MODEL, R_CROP, R_CROSS, type BlockDef } from './registry';
import { mbox, rotateBoxes, DIR_FACE } from '../blockModels';

// ------------------------------------------------------------------ granja

/** Tierra de cultivo (seca o húmeda); mide 15/16. Al romperla suelta tierra. */
export const FARMLAND = family('farmland', 'Tierra de cultivo', [['moist', 2]], (st) => {
  const dirt = L('dirt'), top = L(st.moist ? 'farmland_wet' : 'farmland_dry');
  return {
    render: R_MODEL, hardness: 0.6, tool: 'shovel', sound: 'dirt', category: null, noItem: true,
    top: st.moist ? 'farmland_wet' : 'farmland_dry', side: 'dirt', bottom: 'dirt',
    model: [mbox(0, 0, 0, 16, 15, 16, [dirt, dirt, top, dirt, dirt, dirt])],
  };
});

/** Cultivo con `ages` edades; `tex(edad)` da la textura y `h(edad)` la altura de selección (1/16). */
function crop(key: string, name: string, ages: number, tex: (age: number) => string, h: (age: number) => number): number {
  return family(key, name, [['age', ages]], (st) => ({
    render: R_CROP, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, category: null,
    noItem: true, all: tex(st.age), selection: [0, 0, 0, 1, h(st.age) / 16, 1],
  }));
}
/** Las zanahorias y patatas tienen 8 edades pero 4 dibujos (como en Minecraft). */
const quarter = (age: number) => (age < 2 ? 0 : age < 4 ? 1 : age < 7 ? 2 : 3);
export const WHEAT_CROP = crop('wheat_crop', 'Trigo', 8, (a) => `wheat_stage${a}`, (a) => 2 + a * 2);
export const CARROTS = crop('carrots', 'Zanahorias', 8, (a) => `carrots_stage${quarter(a)}`, (a) => 2 + a);
export const POTATOES = crop('potatoes', 'Patatas', 8, (a) => `potatoes_stage${quarter(a)}`, (a) => 2 + a);
export const BEETROOTS = crop('beetroots', 'Remolachas', 4, (a) => `beetroots_stage${a}`, (a) => 2 + a * 2);
/** Edad máxima de cada cultivo (por su estado base). */
export const CROP_MAX_AGE: Record<number, number> = { [WHEAT_CROP]: 7, [CARROTS]: 7, [POTATOES]: 7, [BEETROOTS]: 3 };

/** Tarta: siete porciones; cada mordisco quita 2/16 por el lado oeste. */
export const CAKE = family('cake', 'Tarta', [['bites', 7]], (st) => {
  const top = L('cake_top'), side = L('cake_side'), bottom = L('cake_bottom'), inner = L('cake_inner');
  return {
    render: R_MODEL, hardness: 0.5, sound: 'wool', category: 'decoracion', top: 'cake_top', side: 'cake_side', bottom: 'cake_bottom',
    model: [mbox(1 + st.bites * 2, 0, 1, 15, 8, 15, [side, st.bites ? inner : side, top, bottom, side, side])],
  };
});


// ------------------------------------------------------------------ calabazas y sandías (fase 4)
// (Van después de la tarta para no mover los ids guardados.)

/** Sandía: se rompe con cualquier cosa y suelta rodajas. */
export const MELON = family('melon', 'Sandía', [], () => ({
  top: 'melon_top', side: 'melon_side', hardness: 1, tool: 'axe', sound: 'wood', category: 'decoracion',
}));

/** Tallo en crecimiento: ocho edades; la altura de la textura crece con la edad. */
function stem(key: string, name: string): number {
  return family(key, name, [['age', 8]], (st) => ({
    render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, category: null,
    noItem: true, all: `stem_stage${st.age}`, selection: [0.375, 0, 0.375, 0.625, (st.age * 2 + 2) / 16, 0.625],
  }));
}
/** Tallo maduro que ya dio su fruto: un plano doblado hacia él (`facing`: dónde está el fruto). */
function attachedStem(key: string, name: string): number {
  return family(key, name, [['facing', 4]], (st) => {
    const l = L('stem_attached');
    return {
      render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, category: null,
      noItem: true, all: 'stem_attached', selection: [0.375, 0, 0.375, 0.625, 0.625, 0.625],
      // Un plano en x = 8 que va del centro hacia el norte (se gira hacia el fruto), hundido 1/16 como
      // los cultivos porque siempre está sobre tierra de cultivo.
      model: rotateBoxes([mbox(8, -1, 0, 8, 15, 16, [l, l, -1, -1, -1, -1])], st.facing),
    };
  });
}
export const PUMPKIN_STEM = stem('pumpkin_stem', 'Tallo de calabaza');
export const MELON_STEM = stem('melon_stem', 'Tallo de sandía');
export const ATTACHED_PUMPKIN_STEM = attachedStem('attached_pumpkin_stem', 'Tallo de calabaza');
export const ATTACHED_MELON_STEM = attachedStem('attached_melon_stem', 'Tallo de sandía');

/** Cubo con un frente orientado (el frente mira hacia quien lo coloca). */
function facingCube(key: string, name: string, front: string, o: Partial<BlockDef>): number {
  return family(key, name, [['facing', 4]], (st) => {
    const tex: BlockDef['tex'] = ['pumpkin_side', 'pumpkin_side', 'pumpkin_top', 'pumpkin_top', 'pumpkin_side', 'pumpkin_side'];
    tex[DIR_FACE[st.facing]] = front;
    return { hardness: 1, tool: 'axe', sound: 'wood', category: 'decoracion', ...o, tex };
  });
}
export const CARVED_PUMPKIN = facingCube('carved_pumpkin', 'Calabaza tallada', 'carved_pumpkin', {});
export const JACK_O_LANTERN = facingCube('jack_o_lantern', 'Farol de calabaza', 'jack_o_lantern', { emission: 15 });

/** Compostador: nueve niveles (0 vacío … 7 lleno, 8 listo para dar polvo de hueso). */
export const COMPOSTER = family('composter', 'Compostador', [['level', 9]], (st) => {
  const side = L('composter_side'), top = L('composter_top'), bottom = L('composter_bottom');
  const wall = [side, side, top, -1, side, side];
  const model = [
    mbox(0, 0, 0, 16, 2, 16, [side, side, bottom, bottom, side, side]),
    mbox(0, 2, 0, 2, 16, 16, wall),
    mbox(14, 2, 0, 16, 16, 16, wall),
    mbox(2, 2, 0, 14, 16, 2, wall),
    mbox(2, 2, 14, 14, 16, 16, wall),
  ];
  if (st.level > 0) {
    const h = st.level >= 7 ? 15 : 1 + st.level * 2;
    model.push(mbox(2, 2, 2, 14, h, 14, [-1, -1, L(st.level === 8 ? 'compost_ready' : 'compost'), -1, -1, -1]));
  }
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.6, tool: 'axe', sound: 'wood', category: 'decoracion',
    side: 'composter_side', top: 'composter_top', bottom: 'composter_bottom', model, selection: [0, 0, 0, 1, 1, 1],
  };
});

/** Tallo que crece hasta dar este fruto (y su versión unida al fruto). */
export const STEM_FRUIT: Readonly<Record<number, readonly [fruit: number, attached: number]>> = {
  [PUMPKIN_STEM]: [PUMPKIN, ATTACHED_PUMPKIN_STEM],
  [MELON_STEM]: [MELON, ATTACHED_MELON_STEM],
};
// Los tallos maduran a la edad 7; los unidos al fruto ya no crecen.
Object.assign(CROP_MAX_AGE, { [PUMPKIN_STEM]: 7, [MELON_STEM]: 7, [ATTACHED_PUMPKIN_STEM]: 0, [ATTACHED_MELON_STEM]: 0 });

/** ¿Tallo de calabaza o sandía (creciendo)? */
export function isStem(id: number): boolean {
  const b = familyBase(id);
  return b === PUMPKIN_STEM || b === MELON_STEM;
}

/** ¿Tallo unido a su fruto? Devuelve hacia dónde está el fruto (0..3) o -1. */
export function attachedFacing(id: number): number {
  const b = familyBase(id);
  return b === ATTACHED_PUMPKIN_STEM || b === ATTACHED_MELON_STEM ? id - b : -1;
}
/** ¿Cultivo en su última edad? */
export function isMatureCrop(id: number): boolean {
  const b = familyBase(id);
  return isCrop(id) && id - b >= CROP_MAX_AGE[b];
}

