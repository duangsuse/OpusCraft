// Teñir el cuero y la armadura para lobo (DyedItemColor, DyeRecipe y CauldronInteraction.DYED_ITEM de Java 26.3):
// la mezcla de colores, la receta, el lavado en el caldero, los datos de la pila, el peletero y el color que viaja con
// la armadura puesta en los soportes, los caballos y los lobos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, DYE_COLORS, cauldronOf, cauldronFill, CAULDRON_WATER } from '../src/shared/blocks';
import { ARMOR, DYES, HORSE_ARMOR, WOLF_ARMOR, LEATHER, SHEARS, type ItemStack } from '../src/shared/items';
import { applyDyes, dyeArmorCraft, dyedColor, washDye, isDyeable, shownColor, LEATHER_COLOR, DYE_DIFFUSE } from '../src/shared/dyedColor';
import { cauldronUse } from '../src/shared/cauldronUse';
import { sanitizeItemData } from '../src/shared/itemData';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { offersFor, PROFESSIONS, professionPool } from '../src/shared/villagers';
import { ENT_ARMOR_STAND } from '../src/shared/armorStands';
import { MOB_HORSE, MOB_WOLF } from '../src/shared/mobs';
import { makeServer } from './harness';

const RED = 0xb02e26, YELLOW = 0xfed83d;

test('la mezcla de Java: media de canales escalada a la intensidad media', () => {
  assert.equal(DYE_DIFFUSE.red, RED);
  assert.equal(DYE_DIFFUSE.yellow, YELLOW);
  const leather: ItemStack = { id: ARMOR.leather.chestplate, count: 1 };
  // Un tinte sobre el cuero sin teñir: su color tal cual (el marrón de siempre no entra en la media).
  assert.equal(dyedColor(applyDyes(leather, ['red'])), RED);
  // Rojo y amarillo: (176+254)/2, (46+216)/2, (38+61)/2 = 215, 131, 49; intensidad media 215 = el canal más fuerte.
  assert.equal(dyedColor(applyDyes(leather, ['red', 'yellow'])), (215 << 16) | (131 << 8) | 49);
  // Sobre uno ya teñido entra su color: rojo y luego azul (60, 68, 170) → media (118, 57, 104), intensidad (176+170)/2.
  const blue = DYE_DIFFUSE.blue;
  const again = applyDyes(applyDyes(leather, ['red']), ['blue']);
  const r = Math.trunc((176 + ((blue >> 16) & 255)) / 2), g = Math.trunc((46 + ((blue >> 8) & 255)) / 2), b = Math.trunc((38 + (blue & 255)) / 2);
  const avg = Math.fround((176 + Math.max((blue >> 16) & 255, (blue >> 8) & 255, blue & 255)) / 2);
  const top = Math.max(r, g, b);
  const k = (c: number) => Math.trunc(Math.fround(Math.fround(c * avg) / top));
  assert.equal(dyedColor(again), (k(r) << 16) | (k(g) << 8) | k(b));
  // Sin teñir, el cuero se ve de su marrón (−6265536) y la armadura para lobo, sin color.
  assert.equal(LEATHER_COLOR, -6265536 & 0xffffff);
  assert.equal(shownColor(ARMOR.leather.boots, undefined), LEATHER_COLOR);
  assert.equal(shownColor(WOLF_ARMOR, undefined), undefined);
});

test('receta: un objeto teñible y uno o más tintes, nada más', () => {
  const grid = (...s: (ItemStack | null)[]) => [...s, ...Array(9 - s.length).fill(null)];
  const helmet: ItemStack = { id: ARMOR.leather.helmet, count: 1, dmg: 12 };
  const out = dyeArmorCraft(grid(helmet, { id: DYES.red, count: 1 }));
  assert.equal(out?.id, ARMOR.leather.helmet);
  assert.equal(out?.dmg, 12, 'conserva el desgaste');
  assert.equal(dyedColor(out), RED);
  for (const id of [ARMOR.leather.boots, ARMOR.leather.leggings, ARMOR.leather.chestplate, HORSE_ARMOR.leather, WOLF_ARMOR]) {
    assert.ok(isDyeable(id));
    assert.ok(dyeArmorCraft(grid({ id, count: 1 }, null, { id: DYES.lime, count: 1 }, { id: DYES.blue, count: 1 })), `${id}: se tiñe`);
  }
  assert.equal(dyeArmorCraft(grid(helmet)), null, 'sin tinte, nada');
  assert.equal(dyeArmorCraft(grid({ id: DYES.red, count: 1 })), null, 'sin objeto, nada');
  assert.equal(dyeArmorCraft(grid(helmet, helmet, { id: DYES.red, count: 1 })), null, 'dos objetos, nada');
  assert.equal(dyeArmorCraft(grid({ id: ARMOR.iron.helmet, count: 1 }, { id: DYES.red, count: 1 })), null, 'el hierro no se tiñe');
  assert.equal(dyeArmorCraft(grid(helmet, { id: DYES.red, count: 1 }, { id: LEATHER, count: 1 })), null, 'con algo más, nada');
  assert.equal(DYE_COLORS.length, 16);
});

test('caldero: lava el color y baja un nivel; los datos viajan y se validan', () => {
  const dyed = applyDyes({ id: ARMOR.leather.boots, count: 1 }, ['green']);
  const r = cauldronUse(cauldronOf(CAULDRON_WATER, 3), dyed);
  assert.equal(cauldronFill(r!.block)?.level, 2);
  assert.equal(r!.held && dyedColor(r!.held), undefined);
  assert.equal(r!.sound, 'wash');
  assert.equal(cauldronUse(cauldronOf(CAULDRON_WATER, 3), { id: ARMOR.leather.boots, count: 1 }), null, 'sin teñir no hace nada');
  assert.equal(washDye({ id: ARMOR.leather.boots, count: 1 }), null);
  // Datos: el color sólo en lo teñible, dentro de 24 bits.
  assert.deepEqual(sanitizeItemData(ARMOR.leather.boots, { dc: 0x123456 }), { dc: 0x123456 });
  assert.equal(sanitizeItemData(ARMOR.iron.boots, { dc: 0x123456 }), undefined);
  assert.equal(sanitizeItemData(WOLF_ARMOR, { dc: 0x1000000 }), undefined);
  assert.equal(dyedColor(stackFromWire(stackToWire(dyed))), dyedColor(dyed));
});

test('peletero: sus ofertas de 26.3, con la armadura teñida al azar', () => {
  const prof = PROFESSIONS.find((p) => p.key === 'leatherworker')!;
  let dyedSeen = 0;
  for (let seed = 1; seed < 40; seed++) {
    for (const o of offersFor(prof.id, 5, seed)) {
      if (isDyeable(o.result[0])) {
        assert.ok(o.data?.dc !== undefined, 'la pieza sale teñida');
        dyedSeen++;
      }
    }
  }
  assert.ok(dyedSeen > 20);
  const all = [1, 2, 3, 4, 5].flatMap((l) => professionPool(prof.id, l)).map((o) => o.result[0] === ARMOR.leather.chestplate ? 'peto' : o.result[0]);
  assert.ok(all.includes(HORSE_ARMOR.leather), 'la armadura de cuero para caballo (oficial experto)');
});

test('servidor: el soporte guarda la pieza entera (color) y el caballo y el lobo, el color de su armadura', () => {
  const h = makeServer(5151);
  const c = h.join('Tintorera', 's');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.send({ t: 'stand', x: bx + 2, y: by - 1, z: bz, yaw: 0, q: 1 });
  const stand = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND)!;
  const tunic = applyDyes({ id: ARMOR.leather.chestplate, count: 1 }, ['cyan']);
  c.send({ t: 'interact', e: stand.id, item: tunic.id, q: 2, st: tunic });
  const s2 = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND)!;
  assert.deepEqual(s2.standDye, [-1, DYE_DIFFUSE.cyan, -1, -1]);
  c.send({ t: 'interact', e: s2.id, item: 0, q: 3 });
  const back = c.conn.take('ires').find((m) => m.q === 3)?.give as ItemStack | undefined;
  assert.equal(dyedColor(back), DYE_DIFFUSE.cyan, 'se devuelve con su color');

  // Caballo domado con la armadura de cuero teñida: el color va con él, se guarda y vuelve al quitársela.
  const gear = h.gs.entities.gear;
  const horse = h.gs.entities.spawnMob(MOB_HORSE, bx + 4, by, bz + 4)!;
  horse.tamed = true;
  const res = gear.interact(horse, HORSE_ARMOR.leather, 'Tintorera', 0, false, DYE_DIFFUSE.pink);
  assert.ok(res?.ok);
  assert.equal(horse.gearDye, DYE_DIFFUSE.pink);
  const saved = gear.save(horse)!;
  assert.equal(saved.gc, DYE_DIFFUSE.pink);
  const off = gear.interact(horse, 0, 'Tintorera', 0, true);
  assert.equal(off?.give && dyedColor(off.give), DYE_DIFFUSE.pink);
  assert.equal(horse.gearDye, undefined);
  // Lobo: la armadura teñida se quita con tijeras con su color y su desgaste.
  const wolf = h.gs.entities.spawnMob(MOB_WOLF, bx - 4, by, bz - 4)!;
  wolf.tamedBy = 'tintorera';
  assert.ok(gear.interact(wolf, WOLF_ARMOR, 'Tintorera', 7, false, DYE_DIFFUSE.purple)?.ok);
  const cut = gear.interact(wolf, SHEARS, 'Tintorera');
  assert.equal(cut?.give?.dmg, 7);
  assert.equal(cut?.give && dyedColor(cut.give), DYE_DIFFUSE.purple);
});
