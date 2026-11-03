// Fase 6, primer lote: zorro, cabra, oso polar, conejo y lobo (definiciones, modelo, atlas y textura).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOBS, MOB_TYPES, MOB_FOX, MOB_GOAT, MOB_POLAR_BEAR, MOB_RABBIT, MOB_WOLF, boxFaces } from '../src/shared/mobs';
import { generateMobTexture } from '../src/client/textures/mobTextures';

const NEW: [number, number, string, string][] = [
  [MOB_FOX, 13, 'fox', 'Zorro'],
  [MOB_GOAT, 14, 'goat', 'Cabra'],
  [MOB_POLAR_BEAR, 15, 'polar_bear', 'Oso polar'],
  [MOB_RABBIT, 16, 'rabbit', 'Conejo'],
  [MOB_WOLF, 17, 'wolf', 'Lobo'],
];

test('los animales nuevos tienen ids fijos, nombre en español y están registrados', () => {
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d, key);
    assert.equal(d.id, id);
    assert.equal(d.key, key);
    assert.equal(d.name, name);
    assert.equal(d.hostile, false);
    assert.ok(MOB_TYPES.includes(id));
  }
  assert.equal(MOBS[MOB_WOLF].neutral, true);
  assert.equal(MOBS[MOB_POLAR_BEAR].neutral, true);
  assert.ok(MOBS[MOB_WOLF].damage > 0 && MOBS[MOB_POLAR_BEAR].damage > 0);
});

test('modelos: padres válidos y cajas dentro del atlas sin solaparse', () => {
  for (const [id, , key] of NEW) {
    const d = MOBS[id];
    const [W, H] = d.atlas;
    const names = new Set<string>();
    const rects = new Map<string, [number, number, number, number]>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${key}: padre ${p.parent} antes que ${p.name}`);
      names.add(p.name);
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) {
        assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${key}.${p.name} fuera del atlas`);
      }
      rects.set(`${p.uv},${p.size}`, [p.uv[0], p.uv[1], 2 * (dd + w), dd + h]);
    }
    const list = [...rects.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
        assert.ok(!overlap, `${key}: UV solapadas ${a} / ${b}`);
      }
    }
  }
});

test('texturas: se generan, cubren todas las caras y no usan el color de relleno', () => {
  for (const [id, , key] of NEW) {
    const d = MOBS[id];
    const tex = generateMobTexture(id);
    assert.equal(tex.width, d.atlas[0]);
    assert.equal(tex.height, d.atlas[1]);
    assert.equal(tex.rgba.length, tex.width * tex.height * 4);
    for (const p of d.parts) {
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) {
        for (let y = v; y < v + Math.ceil(fh); y++) {
          for (let x = u; x < u + Math.ceil(fw); x++) {
            const o = (Math.floor(y) * tex.width + Math.floor(x)) * 4;
            if (Math.floor(x) >= tex.width || Math.floor(y) >= tex.height) continue;
            assert.equal(tex.rgba[o + 3], 255, `${key}.${p.name}: téxel sin pintar en ${x},${y}`);
            const [r, g, b] = [tex.rgba[o], tex.rgba[o + 1], tex.rgba[o + 2]];
            assert.ok(!(r === 200 && g === 0 && b === 200) && !(r === 255 && g === 0 && b === 255), `${key}: marcador magenta`);
          }
        }
      }
    }
  }
});
