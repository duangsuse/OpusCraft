// Fase 6.5 (libros y estandartes): estandartes con dibujos, diseños de estandarte y telar (registro,
// recetas, telar, datos de la pila de ida y vuelta, servidor y persistencia).
import { test } from 'node:test';
import { SKULLS } from '../src/shared/blocks';
import { ENCHANTED_GOLDEN_APPLE } from '../src/shared/items';
import assert from 'node:assert/strict';
import { AIR, STONE, BANNERS, WALL_BANNERS, FLOWERS, VINE, BRICKS, DYE_COLORS, stateOf } from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, itemSpriteIndex, sameKind, DYES, PAPER, GUNPOWDER, BONE, GOLDEN_APPLE, EMPTY_MAP, STICK,
  BANNER_PATTERN_ITEMS, type ItemStack,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { sanitizeStack, cloneStack } from '../src/shared/containers';
import {
  BANNER_PATTERNS, MAX_BANNER_LAYERS, loomOptions, loomResult, bannerColor, isBannerItem, dyeColor, layerName,
} from '../src/shared/bannerPatterns';
import { ENT_ITEM } from '../src/shared/mobs';
import { MemoryStore } from '../src/shared/sim/store';
import { BOOK_SPRITES } from '../src/client/textures/bookSprites';
import { PATTERN_MASKS } from '../src/client/render/bannerArt';
import { makeServer, type Client, type Harness } from './harness';

const RED = DYE_COLORS.indexOf('red'), BLUE = DYE_COLORS.indexOf('blue');

test('registro: dibujos, diseños de estandarte y sus sprites', () => {
  // Claves únicas; cada dibujo con su máscara en el cliente; los de las cámaras, fuera (Fase 8.4: el hocico, dentro).
  const keys = BANNER_PATTERNS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(PATTERN_MASKS[k], `máscara: ${k}`);
  for (const k of ['flow', 'guster']) assert.ok(!keys.includes(k), `sin ${k}`);
  assert.equal(keys.indexOf('piglin'), 39);
  // Los índices se guardan: los primeros no se mueven.
  assert.deepEqual(keys.slice(0, 3), ['stripe_bottom', 'stripe_top', 'stripe_left']);
  assert.equal(keys.indexOf('globe'), 38);
  for (const id of Object.values(BANNER_PATTERN_ITEMS)) {
    assert.ok(CREATIVE_ITEMS.includes(id), `en el creativo: ${ITEMS[id].key}`);
    assert.ok(itemSpriteIndex(id) >= 0 && BOOK_SPRITES[ITEMS[id].key], `sprite: ${ITEMS[id].key}`);
    assert.equal(ITEMS[id].stack, 1);
  }
  // Colores de estandartes (de pie, de pared y como objeto) y de tintes.
  assert.equal(bannerColor(BANNERS.red), RED);
  assert.equal(bannerColor(stateOf(WALL_BANNERS.blue, { facing: 2 })), BLUE);
  assert.equal(bannerColor(STONE), -1);
  assert.ok(isBannerItem(BANNERS.white) && !isBannerItem(WALL_BANNERS.white));
  assert.equal(dyeColor(DYES.blue), BLUE);
  assert.equal(layerName([0, RED]), 'Franja inferior (rojo)');
});

test('recetas de los diseños de estandarte', () => {
  const P = BANNER_PATTERN_ITEMS;
  const pairs: [number, number][] = [
    [FLOWERS.oxeye_daisy, P.flower], [SKULLS.creeper, P.creeper], [SKULLS.wither_skeleton, P.skull], [ENCHANTED_GOLDEN_APPLE, P.thing], [EMPTY_MAP, P.globe],
    [VINE, P.curly_border], [BRICKS, P.bricks],
  ];
  for (const [ing, out] of pairs) assert.equal(matchRecipe([PAPER, ing, 0, 0], 2)?.out.id, out, ITEMS[out].key);
});

test('telar: dibujos, capas y límites', () => {
  // Sin diseño, los 32 básicos; con uno, sólo el suyo.
  assert.equal(loomOptions(0).length, 32);
  const flower = BANNER_PATTERNS.findIndex((p) => p.key === 'flower');
  assert.deepEqual(loomOptions(BANNER_PATTERN_ITEMS.flower), [flower]);
  const banner: ItemStack = { id: BANNERS.white, count: 1 };
  const dye: ItemStack = { id: DYES.red, count: 3 };
  const one = loomResult(banner, dye, null, 0)!;
  assert.deepEqual(one, { id: BANNERS.white, count: 1, data: { layers: [[0, RED]] } });
  // Encima otra capa; un dibujo con diseño sólo con su diseño.
  assert.equal(loomResult(one, { id: DYES.blue, count: 1 }, null, flower), null);
  const two = loomResult(one, { id: DYES.blue, count: 1 }, { id: BANNER_PATTERN_ITEMS.flower, count: 1 }, flower)!;
  assert.deepEqual(two.data!.layers, [[0, RED], [flower, BLUE]]);
  // Hasta 6 capas; sin tinte o sin estandarte, nada.
  let b = banner;
  for (let i = 0; i < MAX_BANNER_LAYERS; i++) b = loomResult(b, dye, null, i)!;
  assert.equal(b.data!.layers!.length, MAX_BANNER_LAYERS);
  assert.equal(loomResult(b, dye, null, 0), null);
  assert.equal(loomResult(banner, null, null, 0), null);
  assert.equal(loomResult({ id: STICK, count: 1 }, dye, null, 0), null);
  assert.equal(loomResult(banner, { id: STICK, count: 1 }, null, 0), null);
});

test('datos del estandarte: ida y vuelta, límites y apilado', () => {
  const banner: ItemStack = { id: BANNERS.red, count: 1, data: { layers: [[0, BLUE], [19, 0]] } };
  assert.deepEqual(sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(banner))))), banner);
  assert.deepEqual(cloneStack(banner), banner);
  // Como mucho 6 capas; dibujos y colores desconocidos fuera.
  const cheat = sanitizeStack({ id: BANNERS.red, count: 1, data: { layers: [[0, 1], [999, 1], [1, 16], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]] } })!;
  assert.deepEqual(cheat.data!.layers, [[0, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]);
  assert.equal(sanitizeStack({ id: BANNERS.red, count: 1, data: { layers: [] } })!.data, undefined);
  // Los estandartes con capas distintas no se apilan (los lisos sí).
  assert.ok(sameKind({ id: BANNERS.red, count: 1 }, { id: BANNERS.red, count: 4 }));
  assert.ok(!sameKind(banner, { id: BANNERS.red, count: 1 }));
  assert.ok(sameKind(banner, cloneStack(banner)));
});

// ------------------------------------------------------------------ servidor

function platform(store = new MemoryStore(), mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(7373, store);
  const c = h.join('Abanderada', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 5; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const bannerDrops = (h: Harness) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && bannerColor(e.stack?.id ?? 0) >= 0).map((e) => e.stack);

/** Colocar un estandarte sobre (x, y - 1, z) con estas capas, como haría el cliente. */
function placeBanner(c: Client, x: number, y: number, z: number, id: number, l?: [number, number][]): void {
  c.send({ t: 'place', x, y: y - 1, z, n: [0, 1, 0], p: [x + 0.5, y, z + 0.5], item: id, yaw: 0, ...(l ? { l } : {}) });
}

test('servidor: colocar, avisar, romper (el objeto conserva las capas) y guardar', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  const W = h.gs.world;
  const layers: [number, number][] = [[0, BLUE], [19, 0]];
  placeBanner(c, bx + 1, by, bz, BANNERS.red, layers);
  assert.equal(bannerColor(W.getBlock(bx + 1, by, bz)), RED);
  assert.deepEqual(h.gs.sys.banners.layersAt(bx + 1, by, bz), layers);
  assert.deepEqual(c.conn.take('banner').at(-1), { t: 'banner', x: bx + 1, y: by, z: bz, l: layers });
  // Uno liso no guarda nada; unas capas inválidas tampoco.
  placeBanner(c, bx + 2, by, bz, BANNERS.red);
  placeBanner(c, bx + 3, by, bz, BANNERS.red, [[500, 1]] as [number, number][]);
  assert.deepEqual(h.gs.sys.banners.layersAt(bx + 2, by, bz), []);
  assert.deepEqual(h.gs.sys.banners.layersAt(bx + 3, by, bz), []);
  // Se guarda y quien entra lo recibe en la bienvenida.
  h.gs.flush(true);
  const h2 = makeServer(7373, store);
  const c2 = h2.join('Otra');
  assert.deepEqual(c2.welcome.banners, [[bx + 1, by, bz, layers]]);
  // Al romperlo (supervivencia) suelta el estandarte con sus capas y avisa de que ya no está.
  c.send({ t: 'set', x: bx + 1, y: by, z: bz, b: AIR });
  assert.deepEqual(bannerDrops(h), [{ id: BANNERS.red, count: 1, data: { layers } }]);
  assert.deepEqual(h.gs.sys.banners.layersAt(bx + 1, by, bz), []);
  assert.deepEqual(c.conn.take('banner').at(-1)?.l, []);
  // El liso roto suelta un estandarte liso.
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: AIR });
  assert.equal(bannerDrops(h).filter((s) => !s?.data).length, 1);
});

test('servidor: estandarte de pared y sin apoyo (también conserva las capas)', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  W.setBlock(bx + 1, by + 1, bz, STONE);
  // En la cara oeste del bloque: estandarte de pared.
  c.send({ t: 'place', x: bx + 1, y: by + 1, z: bz, n: [-1, 0, 0], p: [bx + 1, by + 1.5, bz + 0.5], item: BANNERS.blue, yaw: 0, l: [[10, RED]] });
  const wall = W.getBlock(bx, by + 1, bz);
  assert.equal(bannerColor(wall), BLUE);
  assert.notEqual(wall, BANNERS.blue, 'va en la pared');
  assert.deepEqual(h.gs.sys.banners.layersAt(bx, by + 1, bz), [[10, RED]]);
  // Se quita la pared: cae con sus capas.
  c.send({ t: 'set', x: bx + 1, y: by + 1, z: bz, b: AIR });
  assert.deepEqual(bannerDrops(h), [{ id: BANNERS.blue, count: 1, data: { layers: [[10, RED]] } }]);
});

test('servidor: en creativo romperlo no suelta nada (ni deja capas esperando)', () => {
  const { h, c, bx, by, bz } = platform(new MemoryStore(), 'c');
  placeBanner(c, bx + 1, by, bz, BANNERS.white, [[5, RED]]);
  c.send({ t: 'set', x: bx + 1, y: by, z: bz, b: AIR });
  h.tick(1);
  assert.deepEqual(bannerDrops(h), []);
  // Otro liso puesto y roto ahí mismo (en otro tick) suelta... nada en creativo, y en el servidor no queda rastro.
  assert.deepEqual(h.gs.sys.banners.all(), []);
});
