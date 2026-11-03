// Fase 4.5: semilla escrita, teclas configurables, objeto de cada bloque (clic central) y posturas
// del jugador (bucear y gatear).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '../src/shared/seed';
import { assignKey, defaultKeybinds, keyLabel, sanitizeKeybinds } from '../src/client/game/keybinds';
import { itemForBlock, WHEAT_SEEDS, CARROT, PUMPKIN_SEEDS } from '../src/shared/items';
import {
  STONE, WATER, FURNACE, FURNACE_LIT, CHEST, CHEST_DOUBLE, WHEAT_CROP, CARROTS, PUMPKIN_STEM, SIGNS, WALL_SIGNS, stateOf,
} from '../src/shared/blocks';
import { Player, type BlockSource } from '../src/client/game/Player';

test('semilla escrita', () => {
  assert.equal(parseSeed(''), null);
  assert.equal(parseSeed('  '), null);
  assert.equal(parseSeed('12345'), 12345);
  assert.equal(parseSeed('-777'), -777);
  // Texto: el hash de Java ("hola".hashCode() = 3208380).
  assert.equal(parseSeed('hola'), 3208380);
  assert.equal(parseSeed('hola'), parseSeed(' hola '));
});

test('teclas configurables', () => {
  const k = defaultKeybinds();
  assert.equal(k.forward, 'KeyW');
  // Al asignar una tecla usada, la otra acción se queda con la anterior (se intercambian).
  assert.ok(assignKey(k, 'swapHands', 'KeyQ'));
  assert.equal(k.swapHands, 'KeyQ');
  assert.equal(k.drop, 'KeyF');
  assert.ok(!assignKey(k, 'jump', 'Digit3'), 'las ranuras no se pueden asignar');
  assert.ok(!assignKey(k, 'jump', 'Escape'));
  // Lo guardado se limpia y lo que falta vuelve a su tecla.
  const s = sanitizeKeybinds({ forward: 'ArrowUp', jump: 'Escape', basura: 'KeyZ' });
  assert.equal(s.forward, 'ArrowUp');
  assert.equal(s.jump, 'Space');
  assert.equal(s.sneak, 'ShiftLeft');
  assert.equal(keyLabel('ShiftLeft'), 'Mayús izq.');
  assert.equal(keyLabel('KeyG'), 'G');
});

test('clic central: objeto de cada bloque', () => {
  assert.equal(itemForBlock(STONE), STONE);
  assert.equal(itemForBlock(FURNACE_LIT + 2), FURNACE, 'horno encendido → horno');
  assert.equal(itemForBlock(CHEST + 3), CHEST);
  assert.equal(itemForBlock(stateOf(CHEST_DOUBLE, { facing: 1, side: 1 })), CHEST, 'cofre doble → cofre');
  assert.equal(itemForBlock(stateOf(WALL_SIGNS.oak, { facing: 2 })), SIGNS.oak, 'cartel de pared → cartel');
  assert.equal(itemForBlock(WHEAT_CROP + 3), WHEAT_SEEDS, 'trigo → semillas');
  assert.equal(itemForBlock(CARROTS + 7), CARROT);
  assert.equal(itemForBlock(PUMPKIN_STEM + 2), PUMPKIN_SEEDS);
  assert.equal(itemForBlock(WATER), 0, 'los fluidos no');
  assert.equal(itemForBlock(0), 0);
});

/** Mundo de prueba: suelo de piedra en y = 9 y lo que se añada. */
function world(extra: Record<string, number> = {}): BlockSource {
  return {
    getBlock: (x, y, z) => extra[`${x},${y},${z}`] ?? (y <= 9 ? STONE : 0),
  };
}
const idle = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };

test('posturas: gatear bajo un techo bajo y bucear corriendo', () => {
  // Techo a y = 11 sobre la celda (0, 10, 0): sólo cabe tumbado.
  const low = world({ '0,11,0': STONE });
  const p = new Player();
  p.x = 0.5; p.y = 10; p.z = 0.5;
  p.update(0.05, idle, low);
  assert.equal(p.pose, 'crawl');
  assert.ok(p.height < 1, 'gateando mide menos de un bloque');
  assert.ok(p.eyeY - p.y < 1);
  // Sin techo se levanta.
  p.update(0.05, idle, world());
  assert.equal(p.pose, 'stand');
  // Agua de 3 de hondo: corriendo con la cabeza dentro se bucea.
  const water: Record<string, number> = {};
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 10; y <= 13; y++) water[`${x},${y},${z}`] = WATER;
  const sea = world(water);
  const q = new Player();
  q.x = 0.5; q.y = 10.2; q.z = 0.5;
  for (let i = 0; i < 5; i++) q.update(0.05, { ...idle, forward: true, sprint: true }, sea);
  assert.equal(q.pose, 'swim');
  // Al dejar de correr, de pie otra vez.
  for (let i = 0; i < 3; i++) q.update(0.05, idle, sea);
  assert.equal(q.pose, 'stand');
});
