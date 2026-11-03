// Fase 7 (encantamientos): mesa de encantamientos, yunques y hielo escarchado.
// - Mesa de encantamientos: losa de 12 px de alto (obsidiana con esquinas de diamante y un paño rojo
//   encima) que da algo de luz; el libro que flota encima lo dibuja el cliente.
// - Yunque, yunque dañado y yunque muy dañado: tres bloques con la misma forma de Minecraft (base, cuello
//   y tabla) orientada a lo largo de donde miraba quien lo puso; sólo cambia la tabla, cada vez más
//   agrietada. Caen como la arena.
// - Hielo escarchado: el que crea Paso helado sobre el agua; tiene cuatro edades y se derrite (no se
//   obtiene como objeto).
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import { family, familyBase, L, R_MODEL, R_TRANSLUCENT } from './registry';
import { mbox, rotateBoxes, rotateFlat } from '../blockModels';
import { BLOCK_LEAVES_WATER } from './ocean';

// ------------------------------------------------------------------ mesa de encantamientos

export const ENCHANTING_TABLE = family('enchanting_table', 'Mesa de encantamientos', [], () => {
  const side = L('enchanting_table_side'), top = L('enchanting_table_top'), bottom = L('enchanting_table_bottom');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, emission: 7, hardness: 5, tool: 'pickaxe', tier: 1, sound: 'stone',
    category: 'decoracion', side: 'enchanting_table_side', top: 'enchanting_table_top', bottom: 'enchanting_table_bottom',
    model: [mbox(0, 0, 0, 16, 12, 16, [side, side, top, bottom, side, side])],
    collision: [0, 0, 0, 1, 12 / 16, 1],
    selection: [0, 0, 0, 1, 12 / 16, 1],
  };
});

// ------------------------------------------------------------------ yunques

/** Forma del yunque con la tabla a lo largo de Z (se gira con la orientación). */
function anvilBoxes(topTex: string) {
  const body = L('anvil'), top = L(topTex);
  return [
    mbox(2, 0, 2, 14, 4, 14, body),
    mbox(4, 4, 3, 12, 5, 13, body),
    mbox(6, 5, 4, 10, 10, 12, body),
    mbox(3, 10, 0, 13, 16, 16, [body, body, top, body, body, body]),
  ];
}

function anvil(key: string, name: string, topTex: string): number {
  return family(key, name, [['facing', 4]], (st) => ({
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 5, tool: 'pickaxe', tier: 1, sound: 'metal', category: 'decoracion',
    side: 'anvil', top: topTex, bottom: 'anvil',
    model: rotateBoxes(anvilBoxes(topTex), st.facing),
    // Colisión y selección: la tabla de arriba y el pie (como en Minecraft, sin huecos que atrapen).
    collision: rotateFlat([2 / 16, 0, 2 / 16, 14 / 16, 10 / 16, 14 / 16, 3 / 16, 10 / 16, 0, 13 / 16, 1, 1], st.facing),
    selection: rotateFlat([2 / 16, 0, 2 / 16, 14 / 16, 10 / 16, 14 / 16, 3 / 16, 10 / 16, 0, 13 / 16, 1, 1], st.facing),
  }));
}

export const ANVIL = anvil('anvil', 'Yunque', 'anvil_top');
export const CHIPPED_ANVIL = anvil('chipped_anvil', 'Yunque dañado', 'chipped_anvil_top');
export const DAMAGED_ANVIL = anvil('damaged_anvil', 'Yunque muy dañado', 'damaged_anvil_top');
/** Los tres yunques, del intacto al muy dañado. */
export const ANVILS: readonly number[] = [ANVIL, CHIPPED_ANVIL, DAMAGED_ANVIL];

export function isAnvil(id: number): boolean {
  return id > 0 && ANVILS.includes(familyBase(id));
}

/** Deterioro del yunque (0 intacto, 1 dañado, 2 muy dañado); -1 si no es un yunque. */
export function anvilDamage(id: number): number {
  return id > 0 ? ANVILS.indexOf(familyBase(id)) : -1;
}

/** El yunque un grado más dañado con la misma orientación (0: se rompe). */
export function damagedAnvil(id: number): number {
  const d = anvilDamage(id);
  if (d < 0 || d >= 2) return 0;
  return ANVILS[d + 1] + (id - familyBase(id));
}

/** Yunque con la orientación dada (0..3). */
export function anvilFacing(base: number, facing: number): number {
  return familyBase(base) + (facing & 3);
}

// ------------------------------------------------------------------ hielo escarchado

export const FROSTED_ICE_AGES = 4;

export const FROSTED_ICE = family('frosted_ice', 'Hielo escarchado', [['age', FROSTED_ICE_AGES]], (st) => ({
  all: `frosted_ice_${st.age}`, render: R_TRANSLUCENT, lightOpacity: 2, hardness: 0.5, sound: 'glass', noItem: true,
  category: null,
}));

// Al romperse (o derretirse) deja agua, como el hielo.
for (let a = 0; a < FROSTED_ICE_AGES; a++) BLOCK_LEAVES_WATER[FROSTED_ICE + a] = 1;

export function isFrostedIce(id: number): boolean {
  return id > 0 && familyBase(id) === FROSTED_ICE;
}

export function frostedIceAge(id: number): number {
  return isFrostedIce(id) ? id - FROSTED_ICE : -1;
}

export const ENCHANT_INVENTORY: readonly number[] = [ENCHANTING_TABLE, ANVIL, CHIPPED_ANVIL, DAMAGED_ANVIL];
