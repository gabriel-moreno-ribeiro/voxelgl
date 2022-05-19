import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, BLOCK, isSolid } from '../src/world.js';
import { GemHunt, rng } from '../src/game.js';

test('seeded rng is deterministic and uniform-ish', () => {
  const a = rng(7);
  const b = rng(7);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean}`);
});

test('gems are placed on the surface, on solid ground, and are distinct', () => {
  const world = new World(99);
  const hunt = new GemHunt(world, { count: 12, radius: 30, seed: 3 });
  const placed = hunt.start(8, 8);
  assert.equal(placed, 12);
  assert.equal(hunt.state, 'playing');
  const keys = new Set();
  for (const g of hunt.gems) {
    keys.add(`${g.x},${g.z}`);
    assert.equal(world.getBlock(g.x, g.y, g.z), BLOCK.GEM);
    assert.ok(isSolid(world.getBlock(g.x, g.y - 1, g.z)), 'something solid under the gem');
    assert.notEqual(world.getBlock(g.x, g.y - 1, g.z), BLOCK.WATER);
    assert.equal(world.getBlock(g.x, g.y + 1, g.z), BLOCK.AIR, 'nothing on top of it');
    assert.ok(Math.hypot(g.x - 8, g.z - 8) <= 31);
  }
  assert.equal(keys.size, 12);
  // same seed, same hunt
  const again = new GemHunt(new World(99), { count: 12, radius: 30, seed: 3 });
  again.start(8, 8);
  assert.deepEqual(again.gems, hunt.gems);
});

test('breaking gems scores, breaking other blocks does not, and finding all wins', () => {
  const world = new World(5);
  const hunt = new GemHunt(world, { count: 3, radius: 20, seed: 1, duration: 60 });
  hunt.start(0, 0);
  assert.equal(hunt.onBlockBroken(1, 1, 1, BLOCK.STONE), false);
  const [g0, g1, g2] = hunt.gems.slice();
  hunt.tick(10);
  assert.equal(hunt.onBlockBroken(g0.x, g0.y, g0.z, BLOCK.GEM), true);
  assert.equal(hunt.found, 1);
  assert.match(hunt.status(), /gems 1\/3 · 00:50/);
  assert.equal(hunt.onBlockBroken(g0.x, g0.y, g0.z, BLOCK.GEM), false, 'the same gem twice does not count');
  hunt.onBlockBroken(g1.x, g1.y, g1.z, BLOCK.GEM);
  hunt.onBlockBroken(g2.x, g2.y, g2.z, BLOCK.GEM);
  assert.equal(hunt.state, 'won');
  assert.equal(hunt.bestTime, 10);
  assert.match(hunt.status(), /found all 3 gems in 10s/);
  hunt.tick(100);
  assert.equal(hunt.state, 'won', 'the clock stops after winning');
});

test('the clock runs out', () => {
  const hunt = new GemHunt(new World(5), { count: 2, radius: 20, seed: 2, duration: 5 });
  hunt.start(0, 0);
  hunt.tick(4.5);
  assert.equal(hunt.state, 'playing');
  hunt.tick(1);
  assert.equal(hunt.state, 'lost');
  assert.match(hunt.status(), /time is up/);
  // restarting clears the leftover gems from the world
  const leftovers = hunt.gems.slice();
  hunt.start(0, 0);
  for (const g of leftovers) {
    const still = hunt.gems.some((n) => n.x === g.x && n.y === g.y && n.z === g.z);
    if (!still) assert.equal(hunt.world.getBlock(g.x, g.y, g.z), BLOCK.AIR);
  }
});

test('compass points at the nearest gem', () => {
  const world = new World(1);
  const hunt = new GemHunt(world, { count: 0 });
  hunt.state = 'playing';
  hunt.gems = [{ x: 0, y: 30, z: -20 }, { x: 50, y: 30, z: 50 }];
  const pos = [0.5, 30, 0.5];
  // yaw 0 looks down -z, and the near gem is straight ahead at -z
  assert.match(hunt.compass(pos, 0), /^↑ 20m$/);
  // turned around, the gem is behind
  assert.match(hunt.compass(pos, Math.PI), /^↓ 20m$/);
  // looking down -x (yaw +pi/2 turns left), the gem is to the right
  assert.match(hunt.compass(pos, Math.PI / 2), /^→ 20m$/);
  assert.equal(hunt.nearest(pos).gem.z, -20);
  hunt.gems = [];
  assert.equal(hunt.compass(pos, 0), '');
});
