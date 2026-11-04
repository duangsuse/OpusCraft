// rgl/vars.js 冒烟：node tools/test-vars.mjs
import { vars, glslTypeOf } from '../rgl/vars.js';
import assert from 'node:assert/strict';
const c = vars({ pbr: true, exposure: 1, ao: { strength: 0.6, radius: 2 }, sun: [1, 0.9, 0.8] }, { 'ao.strength': { min: 0, max: 1 } });
const ao = c.ao.it;
assert.equal(ao.strength(), 0.6);
assert.equal(ao.strength, c.ao.it.strength);                       // 同一 Ref
const seen = []; c.hooks.push((r, v) => seen.push([r.path, v]));
ao.strength.set(0.3); assert.equal(c.ao.strength, 0.3); assert.equal(ao.strength(), 0.3); assert.deepEqual(seen, [['ao.strength', 0.3]]);
assert.equal(ao.strength.owner, c.ao); assert.equal(ao.strength.key, 'strength');
assert.equal(c.it.exposure.glslType, 'float'); assert.equal(c.it.pbr.glslType, 'bool'); assert.equal(c.it.sun.glslType, 'vec3');
assert.equal(glslTypeOf(new Float32Array(16)), 'mat4');
assert.equal(glslTypeOf(new Int32Array(2)), 'ivec2'); assert.equal(glslTypeOf(new Uint32Array(3)), 'uvec3');   // 整数数组推 ivec / uvec
assert.equal(glslTypeOf(3, { glsl: 'uint' }), 'uint'); assert.equal(glslTypeOf(3, { glsl: 'int' }), 'int'); assert.equal(glslTypeOf(3), 'float');
assert.equal(glslTypeOf([1, 2], { glsl: 'ivec2' }), 'ivec2'); assert.equal(glslTypeOf(new Float32Array(9), { glsl: 'mat3' }), 'mat3'); assert.equal(glslTypeOf(new Float32Array(4), { glsl: 'mat2' }), 'mat2');
assert.throws(() => c.ao.it.strenght, /没有参数/);                  // 拼错抛错
assert.throws(() => c.it.ao, /没有参数/);                           // 表不是参数
assert.ok(!Object.keys(c).includes('it'));
const ps = c.panelSpec; assert.deepEqual(ps.map(x => x.path).sort(), ['ao.radius', 'ao.strength', 'exposure', 'pbr', 'sun']);
assert.equal(ps.find(x => x.path === 'ao.strength').max, 1); assert.equal(ps.find(x => x.path === 'ao.radius').folder, 'ao');
console.log('vars OK');
