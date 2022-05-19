// Gem hunt: a small game on top of the engine. Gems are scattered on the
// surface around the player; break them all before the clock runs out.
// Pure logic, no DOM, so it is tested in Node like the rest of the engine.
import { BLOCK, CHUNK_HEIGHT } from './world.js';

/** Small seeded PRNG (mulberry32) so a seed always produces the same hunt. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GemHunt {
  constructor(world, { count = 10, radius = 40, duration = 120, seed = 1 } = {}) {
    this.world = world;
    this.count = count;
    this.radius = radius;
    this.duration = duration;
    this.seed = seed;
    this.state = 'idle'; // idle | playing | won | lost
    this.gems = [];
    this.found = 0;
    this.timeLeft = duration;
    this.bestTime = null;
  }

  /** Places the gems on the terrain around (x, z) and starts the clock. */
  start(x, z) {
    this.clear();
    const random = rng(this.seed);
    const taken = new Set();
    let guard = 0;
    while (this.gems.length < this.count && guard++ < 1000) {
      const angle = random() * Math.PI * 2;
      const dist = 6 + random() * (this.radius - 6);
      const gx = Math.floor(x + Math.cos(angle) * dist);
      const gz = Math.floor(z + Math.sin(angle) * dist);
      const key = `${gx},${gz}`;
      if (taken.has(key)) continue;
      this.world.chunkAt(Math.floor(gx / 16), Math.floor(gz / 16)); // make sure the terrain exists there
      const gy = this.world.heightAt(gx, gz) + 1;
      if (gy <= 0 || gy >= CHUNK_HEIGHT - 1) continue;
      const below = this.world.getBlock(gx, gy - 1, gz);
      if (below === BLOCK.WATER || below === BLOCK.AIR) continue;
      // skip spots taken by a tree trunk or leaves, and underwater beaches
      if (this.world.getBlock(gx, gy, gz) !== BLOCK.AIR || this.world.getBlock(gx, gy + 1, gz) !== BLOCK.AIR) continue;
      taken.add(key);
      this.world.setBlock(gx, gy, gz, BLOCK.GEM);
      this.gems.push({ x: gx, y: gy, z: gz });
    }
    this.found = 0;
    this.timeLeft = this.duration;
    this.state = this.gems.length ? 'playing' : 'idle';
    return this.gems.length;
  }

  /** Removes any gems still in the world (used on restart). */
  clear() {
    for (const g of this.gems) {
      if (this.world.getBlock(g.x, g.y, g.z) === BLOCK.GEM) this.world.setBlock(g.x, g.y, g.z, BLOCK.AIR);
    }
    this.gems = [];
  }

  /** Call whenever the player breaks a block; returns true if it was a gem. */
  onBlockBroken(x, y, z, id) {
    if (this.state !== 'playing' || id !== BLOCK.GEM) return false;
    const idx = this.gems.findIndex((g) => g.x === x && g.y === y && g.z === z);
    if (idx < 0) return false;
    this.gems.splice(idx, 1);
    this.found++;
    if (this.gems.length === 0) {
      this.state = 'won';
      const used = this.duration - this.timeLeft;
      if (this.bestTime === null || used < this.bestTime) this.bestTime = used;
    }
    return true;
  }

  tick(dt) {
    if (this.state !== 'playing') return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft === 0) this.state = 'lost';
  }

  /** Nearest remaining gem relative to a position: distance and bearing. */
  nearest(pos) {
    let best = null;
    for (const g of this.gems) {
      const dx = g.x + 0.5 - pos[0];
      const dz = g.z + 0.5 - pos[2];
      const dist = Math.hypot(dx, dz);
      if (!best || dist < best.dist) best = { gem: g, dx, dz, dist };
    }
    return best;
  }

  /**
   * An arrow pointing towards the nearest gem, relative to where the player
   * looks. Yaw follows the camera convention in math.js: yaw 0 looks down -z.
   */
  compass(pos, yaw) {
    const n = this.nearest(pos);
    if (!n) return '';
    const toGem = Math.atan2(-n.dx, -n.dz); // angle of the gem in the same convention as yaw
    let rel = toGem - yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // wrap to [-pi, pi]
    const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
    const idx = Math.round(rel / (Math.PI / 4));
    return `${arrows[((idx % 8) + 8) % 8]} ${Math.round(n.dist)}m`;
  }

  status() {
    const t = Math.ceil(this.timeLeft);
    const clock = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    switch (this.state) {
      case 'idle': return 'press G to start a gem hunt';
      case 'playing': return `gems ${this.found}/${this.count} · ${clock}`;
      case 'won': return `you found all ${this.count} gems in ${Math.round(this.duration - this.timeLeft)}s! (G for another)`;
      case 'lost': return `time is up, ${this.found}/${this.count} gems (G to retry)`;
    }
    return '';
  }
}
