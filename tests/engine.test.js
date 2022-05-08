import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueNoise, fbm } from '../src/noise.js';
import { World, Chunk, BLOCK, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL, isSolid } from '../src/world.js';
import { meshChunk } from '../src/mesher.js';
import { raycast } from '../src/raycast.js';
import { createPlayer, stepPlayer, collides, PLAYER } from '../src/physics.js';
import { perspective, multiply, identity, viewMatrix, lookDirection } from '../src/math.js';

// --- noise -----------------------------------------------------------------

test('noise is deterministic and in range', () => {
  for (let i = 0; i < 200; i++) {
    const v = valueNoise(i * 0.37, i * 0.11, 5);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, valueNoise(i * 0.37, i * 0.11, 5));
  }
  assert.notEqual(valueNoise(1.5, 2.5, 1), valueNoise(1.5, 2.5, 2), 'seed changes output');
  const f = fbm(10.3, 20.7, { octaves: 4, scale: 16 });
  assert.ok(f >= 0 && f < 1);
});

test('noise is continuous (neighbouring samples are close)', () => {
  const a = fbm(100, 100, { scale: 32 });
  const b = fbm(100.01, 100, { scale: 32 });
  assert.ok(Math.abs(a - b) < 0.01);
});

// --- world -----------------------------------------------------------------

test('chunk get/set with bounds', () => {
  const c = new Chunk(0, 0);
  c.set(3, 10, 5, BLOCK.STONE);
  assert.equal(c.get(3, 10, 5), BLOCK.STONE);
  assert.equal(c.get(-1, 10, 5), BLOCK.AIR);
  assert.equal(c.get(3, CHUNK_HEIGHT, 5), BLOCK.AIR);
  c.set(99, 0, 0, BLOCK.STONE); // ignored
  assert.equal(c.blocks.reduce((n, b) => n + (b !== 0), 0), 1);
});

test('world generates terrain with grass on top and stone below', () => {
  const w = new World(7);
  const h = w.heightAt(5, 5);
  assert.ok(h > 0 && h < CHUNK_HEIGHT);
  const top = w.chunkAt(0, 0).get(5, h, 5);
  assert.ok(top === BLOCK.GRASS || top === BLOCK.SAND);
  assert.equal(w.getBlock(5, h + 1, 5) === BLOCK.AIR || w.getBlock(5, h + 1, 5) === BLOCK.WATER || w.getBlock(5, h + 1, 5) === BLOCK.WOOD, true);
  assert.equal(w.getBlock(5, 1, 5), BLOCK.STONE);
  assert.equal(w.getBlock(5, -1, 5), BLOCK.AIR);
});

test('water fills up to sea level', () => {
  const w = new World(3);
  let found = false;
  for (let x = -64; x < 64 && !found; x++) {
    for (let z = -64; z < 64 && !found; z++) {
      if (w.heightAt(x, z) < SEA_LEVEL) {
        w.chunkAt(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)); // generate it
        assert.equal(w.getBlock(x, SEA_LEVEL, z), BLOCK.WATER);
        assert.equal(w.getBlock(x, w.heightAt(x, z), z), BLOCK.SAND, 'sand under water');
        found = true;
      }
    }
  }
  assert.ok(found, 'world has some water');
});

test('setBlock across chunk borders marks neighbours dirty', () => {
  const w = new World(1);
  const a = w.chunkAt(0, 0);
  const b = w.chunkAt(1, 0);
  a.dirty = false;
  b.dirty = false;
  w.setBlock(CHUNK_SIZE - 1, 40, 3, BLOCK.BRICK);
  assert.equal(w.getBlock(CHUNK_SIZE - 1, 40, 3), BLOCK.BRICK);
  assert.equal(a.dirty, true);
  assert.equal(b.dirty, true, 'neighbour sharing the edge is dirty');
  assert.equal(w.setBlock(0, CHUNK_HEIGHT + 1, 0, BLOCK.BRICK), false);
});

test('same seed produces the same world', () => {
  const a = new World(42).chunkAt(2, -3).blocks;
  const b = new World(42).chunkAt(2, -3).blocks;
  assert.deepEqual(Array.from(a), Array.from(b));
  const c = new World(43).chunkAt(2, -3).blocks;
  assert.notDeepEqual(Array.from(a), Array.from(c));
});

// --- mesher ----------------------------------------------------------------

function meshOf(blocks) {
  const get = (x, y, z) => blocks.find((b) => b.x === x && b.y === y && b.z === z)?.id ?? BLOCK.AIR;
  return meshChunk(get, 0, 0);
}

test('a single block produces six quads', () => {
  const m = meshOf([{ x: 3, y: 3, z: 3, id: BLOCK.STONE }]);
  assert.equal(m.quadCount, 6);
  assert.equal(m.positions.length, 6 * 4 * 3);
  assert.equal(m.indices.length, 6 * 6);
  assert.equal(m.colors.length, m.positions.length);
  assert.equal(m.normals.length, m.positions.length);
});

test('faces between two adjacent blocks are culled and coplanar faces merge', () => {
  const m = meshOf([{ x: 3, y: 3, z: 3, id: BLOCK.STONE }, { x: 4, y: 3, z: 3, id: BLOCK.STONE }]);
  // two blocks in a row: 6 faces (top, bottom, front, back, left, right) after merging
  assert.equal(m.quadCount, 6);
});

test('different block types are not merged', () => {
  const m = meshOf([{ x: 3, y: 3, z: 3, id: BLOCK.STONE }, { x: 4, y: 3, z: 3, id: BLOCK.DIRT }]);
  // shared face culled: 10 faces, none merge across types
  assert.equal(m.quadCount, 10);
});

test('a flat 16x16 slab meshes into 6 quads', () => {
  const get = (x, y, z) => (y === 5 && x >= 0 && x < 16 && z >= 0 && z < 16 ? BLOCK.GRASS : BLOCK.AIR);
  const m = meshChunk(get, 0, 0);
  assert.equal(m.quadCount, 6);
});

test('mesh vertices lie on the block boundaries and normals are unit axis vectors', () => {
  const m = meshOf([{ x: 1, y: 2, z: 3, id: BLOCK.BRICK }]);
  for (let i = 0; i < m.positions.length; i += 3) {
    assert.ok(m.positions[i] === 1 || m.positions[i] === 2);
    assert.ok(m.positions[i + 1] === 2 || m.positions[i + 1] === 3);
    assert.ok(m.positions[i + 2] === 3 || m.positions[i + 2] === 4);
    const n = [m.normals[i], m.normals[i + 1], m.normals[i + 2]];
    assert.equal(Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]), 1);
  }
});

test('water surface is meshed against air but not against water', () => {
  const m = meshOf([{ x: 3, y: 3, z: 3, id: BLOCK.WATER }, { x: 4, y: 3, z: 3, id: BLOCK.WATER }]);
  assert.equal(m.quadCount, 6);
});

test('a real generated chunk meshes without errors and with far fewer quads than faces', () => {
  const w = new World(9);
  const chunk = w.chunkAt(0, 0);
  const m = meshChunk((x, y, z) => w.getBlock(x, y, z), 0, 0);
  const solid = chunk.blocks.reduce((n, b) => n + (b !== 0), 0);
  assert.ok(m.quadCount > 0);
  assert.ok(m.quadCount < solid, `greedy meshing: ${m.quadCount} quads for ${solid} blocks`);
  assert.equal(m.indices.length, m.quadCount * 6);
});

// --- raycast ---------------------------------------------------------------

test('raycast hits the first solid block and reports the entry face', () => {
  const get = (x, y, z) => (x === 5 && y === 0 && z === 0 ? BLOCK.STONE : BLOCK.AIR);
  const hit = raycast(get, [0.5, 0.5, 0.5], [1, 0, 0], 10);
  assert.deepEqual([hit.x, hit.y, hit.z], [5, 0, 0]);
  assert.deepEqual(hit.normal, [-1, 0, 0]);
  assert.ok(Math.abs(hit.distance - 4.5) < 1e-9);
  assert.equal(hit.block, BLOCK.STONE);
});

test('raycast respects max distance and diagonal directions', () => {
  const get = (x, y, z) => (x === 5 && y === 0 && z === 0 ? BLOCK.STONE : BLOCK.AIR);
  assert.equal(raycast(get, [0.5, 0.5, 0.5], [1, 0, 0], 3), null);
  const floor = (x, y) => (y === 0 ? BLOCK.STONE : BLOCK.AIR);
  const hit = raycast(floor, [0.5, 3.5, 0.5], [Math.SQRT1_2, -Math.SQRT1_2, 0], 10);
  assert.equal(hit.y, 0);
  assert.deepEqual(hit.normal, [0, 1, 0]);
});

test('raycast through water reaches the solid block below', () => {
  const get = (x, y) => (y === 0 ? BLOCK.SAND : y < 4 ? BLOCK.WATER : BLOCK.AIR);
  const hit = raycast(get, [0.5, 6, 0.5], [0, -1, 0], 10);
  assert.equal(hit.block, BLOCK.SAND);
});

// --- physics ---------------------------------------------------------------

test('player falls onto the ground and can jump', () => {
  const get = (x, y) => (y < 0 ? BLOCK.STONE : BLOCK.AIR); // floor at y = 0
  const p = createPlayer(0.5, 3, 0.5);
  for (let i = 0; i < 120; i++) stepPlayer(get, p, { forward: 0, right: 0, up: 0 }, 1 / 60);
  assert.ok(Math.abs(p.pos[1]) < 1e-6, `landed at ${p.pos[1]}`);
  assert.equal(p.onGround, true);
  stepPlayer(get, p, { forward: 0, right: 0, up: 1 }, 1 / 60);
  assert.ok(p.vel[1] > 0 || p.pos[1] > 0, 'jumped');
});

test('player is stopped by walls', () => {
  const get = (x, y) => (y < 0 ? BLOCK.STONE : x === 3 ? BLOCK.STONE : BLOCK.AIR);
  const p = createPlayer(0.5, 0, 0.5);
  p.yaw = 0;
  for (let i = 0; i < 120; i++) stepPlayer(get, p, { forward: 0, right: 1, up: 0 }, 1 / 60);
  assert.ok(p.pos[0] < 3 - PLAYER.width / 2 + 1e-6, `stopped before the wall at ${p.pos[0]}`);
  assert.ok(p.pos[0] > 2, 'moved towards the wall');
});

test('collides checks the whole player box', () => {
  const get = (x, y, z) => (x === 0 && y === 1 && z === 0 ? BLOCK.STONE : BLOCK.AIR);
  assert.equal(collides(get, [0.5, 0, 0.5]), true, 'block at head height');
  assert.equal(collides(get, [0.5, 2, 0.5]), false);
  assert.equal(isSolid(BLOCK.WATER), false);
});

test('flying ignores gravity', () => {
  const get = () => BLOCK.AIR;
  const p = createPlayer(0, 10, 0);
  p.flying = true;
  for (let i = 0; i < 60; i++) stepPlayer(get, p, { forward: 0, right: 0, up: 0 }, 1 / 60);
  assert.equal(p.pos[1], 10);
});

// --- math ------------------------------------------------------------------

test('matrix helpers', () => {
  const m = multiply(identity(), perspective(Math.PI / 2, 1, 0.1, 100));
  assert.ok(Math.abs(m[0] - 1) < 1e-6);
  const v = viewMatrix([1, 2, 3], 0, 0);
  assert.deepEqual([v[12], v[13], v[14]], [-1, -2, -3]);
  const d = lookDirection(0, 0);
  assert.deepEqual(d, [-0, 0, -1]);
  const d2 = lookDirection(Math.PI / 2, 0);
  assert.ok(Math.abs(d2[0] + 1) < 1e-9);
});
