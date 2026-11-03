// Fase 6.5 (libros y estandartes): libro y pluma, libro escrito, copias y atril (registro, recetas,
// datos de la pila de ida y vuelta, servidor y persistencia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, LECTERN, LECTERN_BOOK, CHISELED_BOOKSHELF, BLOCKS, stateOf, isLectern } from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, itemSpriteIndex, sameKind, BOOK, INK_SAC, FEATHER, WRITABLE_BOOK, WRITTEN_BOOK, BUNDLE, STICK,
  type ItemStack,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { sanitizeStack, cloneStack, containerToWire, containerFromWire, newContainer } from '../src/shared/containers';
import { bundleInsert } from '../src/shared/bundles';
import { BOOK_MAX_PAGES, BOOK_PAGE_CHARS, BOOK_TITLE_CHARS } from '../src/shared/itemData';
import { signBook, bookCopy, writeBook, isLecternBook, bookPages } from '../src/shared/books';
import { professionForBlock, PROF_LIBRARIAN } from '../src/shared/villagers';
import { blockDrops } from '../src/shared/sim/drops';
import { ENT_ITEM } from '../src/shared/mobs';
import { MemoryStore } from '../src/shared/sim/store';
import { BOOK_SPRITES } from '../src/client/textures/bookSprites';
import { BOOK_GENERATORS } from '../src/client/textures/genBooks';
import { makeServer, type Client, type Harness } from './harness';

const written = (title = 'Diario', pages = ['Hola', 'mundo']): ItemStack =>
  ({ id: WRITTEN_BOOK, count: 1, data: { pages, title, author: 'Ana', gen: 0 } });

test('registro: objetos, atril con libro, sprites y textura', () => {
  assert.equal(ITEMS[WRITABLE_BOOK].stack, 1);
  assert.equal(ITEMS[WRITTEN_BOOK].stack, 16);
  assert.ok(CREATIVE_ITEMS.includes(WRITABLE_BOOK));
  assert.ok(!CREATIVE_ITEMS.includes(WRITTEN_BOOK), 'el libro escrito no sale vacío en el creativo');
  for (const id of [WRITABLE_BOOK, WRITTEN_BOOK]) assert.ok(itemSpriteIndex(id) >= 0 && BOOK_SPRITES[ITEMS[id].key], `sprite: ${ITEMS[id].key}`);
  assert.ok(BOOK_GENERATORS.lectern_book, 'textura del libro del atril');
  // El atril con libro no es un objeto: se rompe como un atril y sigue dando trabajo al bibliotecario.
  assert.ok(isLectern(LECTERN_BOOK) && isLectern(LECTERN));
  assert.equal(ITEMS[LECTERN_BOOK], undefined);
  assert.deepEqual(blockDrops(LECTERN_BOOK, 0), [{ id: LECTERN, count: 1 }]);
  assert.equal(professionForBlock(LECTERN_BOOK), PROF_LIBRARIAN);
  assert.equal(BLOCKS[LECTERN_BOOK].name, 'Atril');
  assert.ok(isLecternBook(WRITABLE_BOOK) && isLecternBook(WRITTEN_BOOK) && !isLecternBook(BOOK));
});

test('recetas: libro y pluma, y copias de libros escritos', () => {
  assert.equal(matchRecipe([BOOK, INK_SAC, FEATHER, 0], 2)?.out.id, WRITABLE_BOOK);
  const orig = written();
  const blank: ItemStack = { id: WRITABLE_BOOK, count: 1 };
  const copy = bookCopy([orig, blank, null, blank]);
  assert.ok(copy);
  assert.equal(copy.original, 0);
  assert.equal(copy.out.count, 2);
  assert.deepEqual(copy.out.data, { pages: ['Hola', 'mundo'], title: 'Diario', author: 'Ana', gen: 1 });
  // Copia de la copia: sí; de una copia de una copia: no. Sin libros y pluma o con algo más: no.
  const copy2 = bookCopy([{ ...copy.out, count: 1 }, blank]);
  assert.equal(copy2?.out.data?.gen, 2);
  assert.equal(bookCopy([{ ...copy2!.out, count: 1 }, blank]), null);
  assert.equal(bookCopy([orig]), null);
  assert.equal(bookCopy([orig, blank, { id: STICK, count: 1 }]), null);
  assert.equal(bookCopy([orig, orig, blank]), null);
});

test('escribir y firmar', () => {
  const blank: ItemStack = { id: WRITABLE_BOOK, count: 1 };
  assert.deepEqual(bookPages(blank), ['']);
  const w = writeBook(blank, ['Primera', '', 'Tercera', '', '']);
  assert.deepEqual(w.data, { pages: ['Primera', '', 'Tercera'] }, 'sin las páginas vacías del final');
  assert.equal(writeBook(blank, ['', '  ']).data, undefined);
  assert.equal(signBook(w, '   ', 'Ana'), null, 'hace falta título');
  const s = signBook(w, 'Mi libro', 'Ana')!;
  assert.deepEqual(s, { id: WRITTEN_BOOK, count: 1, data: { pages: ['Primera', '', 'Tercera'], title: 'Mi libro', author: 'Ana', gen: 0 } });
});

test('datos de la pila: ida y vuelta, límites y apilado', () => {
  const book = written();
  // Por la red y al guardar (JSON): el libro vuelve igual.
  const back = sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(book)))));
  assert.deepEqual(back, book);
  assert.deepEqual(cloneStack(book), book);
  assert.notEqual(cloneStack(book)!.data!.pages, book.data!.pages, 'la copia no comparte las páginas');
  // Pilas de antes (sin quinto campo) siguen valiendo; las de siempre no cambian de forma.
  assert.deepEqual(stackToWire({ id: STICK, count: 3 }), [STICK, 3]);
  assert.deepEqual(stackFromWire([STICK, 3]), { id: STICK, count: 3 });
  // Límites: 50 páginas de 256 caracteres, título de 32, sin caracteres de control ni datos ajenos.
  const huge = sanitizeStack({
    id: WRITTEN_BOOK, count: 1,
    data: { pages: new Array(80).fill('x'.repeat(400) + '\u0007'), title: 'T'.repeat(60) + '\u0000', author: 'Autor muy muy muy largo', gen: 9, layers: [[0, 1]] },
  })!;
  assert.equal(huge.data!.pages!.length, BOOK_MAX_PAGES);
  assert.equal(huge.data!.pages![0].length, BOOK_PAGE_CHARS);
  assert.equal(huge.data!.title!.length, BOOK_TITLE_CHARS);
  assert.equal(huge.data!.author!.length, 16);
  assert.equal(huge.data!.gen, 3);
  assert.equal(huge.data!.layers, undefined);
  // Un palo no lleva datos; un libro y pluma, sólo páginas.
  assert.equal(sanitizeStack({ id: STICK, count: 1, data: { pages: ['a'] } })!.data, undefined);
  assert.deepEqual(sanitizeStack({ id: WRITABLE_BOOK, count: 1, data: { pages: ['a\nb'], title: 'x' } })!.data, { pages: ['a\nb'] });
  // Se apilan los libros escritos iguales, no los distintos.
  assert.ok(sameKind(book, written()));
  assert.ok(!sameKind(book, written('Otro')));
  assert.ok(!sameKind(book, { id: WRITTEN_BOOK, count: 1 }));
  // Dentro de un saco y de un cofre, el libro conserva su texto.
  const bag: ItemStack = { id: BUNDLE, count: 1 };
  bundleInsert(bag, book);
  bundleInsert(bag, written('Otro'));
  assert.equal(bag.bag!.length, 2, 'dos libros distintos no se juntan');
  const bagBack = sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(bag)))));
  assert.deepEqual(bagBack, bag);
  const chest = newContainer('chest');
  chest.slots[3] = book;
  assert.deepEqual(containerFromWire(JSON.parse(JSON.stringify(containerToWire(chest))))!.slots[3], book);
});

// ------------------------------------------------------------------ servidor

function platform(store = new MemoryStore()): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6262, store);
  const c = h.join('Lectora');
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

const itemEnts = (h: Harness, id: number) => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id);

test('servidor: atril (poner, leer, sacar, romper y guardar)', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  const W = h.gs.world;
  const x = bx + 1, y = by, z = bz;
  W.setBlock(x, y, z, LECTERN);
  const book = written('Crónica', ['Érase una vez…']);
  // Un palo no se pone; el libro escrito sí (se gasta de la mano).
  c.send({ t: 'lectern', x, y, z, a: 'put', q: 1, book: { id: STICK, count: 1 } });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.ok, false);
  c.send({ t: 'lectern', x, y, z, a: 'put', q: 2, book });
  assert.equal(c.conn.take('ires').find((m) => m.q === 2)?.take, 1);
  assert.equal(W.getBlock(x, y, z), LECTERN_BOOK);
  // Otro jugador lo lee pero no lo saca.
  const other = h.join('Visitante');
  other.pos(bx + 0.5, by, bz + 1.5);
  other.send({ t: 'lectern', x, y, z, a: 'read', q: 3 });
  const read = other.conn.take('lbook')[0];
  assert.deepEqual(read.b, book);
  assert.equal(read.own, false);
  other.send({ t: 'lectern', x, y, z, a: 'take', q: 4 });
  assert.equal(other.conn.take('ires').find((m) => m.q === 4)?.ok, false);
  assert.equal(W.getBlock(x, y, z), LECTERN_BOOK);
  // Quien lo puso lo lee como suyo y lo saca (con su texto).
  c.send({ t: 'lectern', x, y, z, a: 'read', q: 5 });
  assert.equal(c.conn.take('lbook')[0].own, true);
  c.send({ t: 'lectern', x, y, z, a: 'take', q: 6 });
  assert.deepEqual(c.conn.take('ires').find((m) => m.q === 6)?.give, book);
  assert.equal(W.getBlock(x, y, z), LECTERN);
  assert.equal(itemEnts(h, WRITTEN_BOOK).length, 0, 'sacarlo no suelta nada');
  // Un libro y pluma también vale; se guarda con el mundo.
  const quill: ItemStack = { id: WRITABLE_BOOK, count: 1, data: { pages: ['borrador'] } };
  c.send({ t: 'lectern', x, y, z, a: 'put', q: 7, book: quill });
  h.gs.flush(true);
  const h2 = makeServer(6262, store);
  assert.deepEqual(h2.gs.sys.lecterns.bookAt(x, y, z), quill, 'el libro del atril se guarda');
  // Al romper el atril caen el atril y el libro.
  c.send({ t: 'set', x, y, z, b: AIR });
  assert.equal(W.getBlock(x, y, z), AIR);
  assert.deepEqual(itemEnts(h, WRITABLE_BOOK).map((e) => e.stack), [quill]);
  assert.equal(itemEnts(h, LECTERN).length, 1);
});

test('servidor: estantería cincelada con libros escritos (conservan el texto)', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  const W = h.gs.world;
  W.setBlock(bx + 1, by, bz, stateOf(CHISELED_BOOKSHELF, { facing: 2, books: 0 }));
  const book = written('Estante');
  c.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 2, item: WRITTEN_BOOK, q: 1, st: book });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.take, 1);
  h.gs.flush(true);
  const h2 = makeServer(6262, store);
  const c2 = h2.join('Lectora');
  c2.pos(bx + 0.5, by, bz + 0.5);
  h2.tick(40);
  c2.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 2, item: 0, q: 2 });
  assert.deepEqual(c2.conn.take('ires').find((m) => m.q === 2)?.give, book, 'sale con su texto tras guardar');
});
