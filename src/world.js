// Block storage: the world is an infinite grid of chunks, each a flat
// Uint8Array of CHUNK_SIZE x CHUNK_HEIGHT x CHUNK_SIZE block ids.
import { fbm, valueNoise } from './noise.js';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const SEA_LEVEL = 24;

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  BRICK: 8,
  GEM: 9,
};

/** RGB colour per block id, per face group (top, side, bottom). */
export const BLOCK_COLORS = {
  [BLOCK.GRASS]: { top: [0.36, 0.68, 0.28], side: [0.48, 0.36, 0.22], bottom: [0.42, 0.3, 0.18] },
  [BLOCK.DIRT]: { top: [0.48, 0.36, 0.22], side: [0.48, 0.36, 0.22], bottom: [0.42, 0.3, 0.18] },
  [BLOCK.STONE]: { top: [0.55, 0.55, 0.57], side: [0.5, 0.5, 0.52], bottom: [0.45, 0.45, 0.47] },
  [BLOCK.SAND]: { top: [0.87, 0.82, 0.6], side: [0.82, 0.77, 0.55], bottom: [0.78, 0.73, 0.5] },
  [BLOCK.WATER]: { top: [0.2, 0.45, 0.85], side: [0.18, 0.4, 0.8], bottom: [0.15, 0.35, 0.75] },
  [BLOCK.WOOD]: { top: [0.6, 0.45, 0.25], side: [0.42, 0.3, 0.15], bottom: [0.6, 0.45, 0.25] },
  [BLOCK.LEAVES]: { top: [0.2, 0.55, 0.2], side: [0.18, 0.5, 0.18], bottom: [0.15, 0.42, 0.15] },
  [BLOCK.BRICK]: { top: [0.7, 0.3, 0.25], side: [0.72, 0.32, 0.27], bottom: [0.65, 0.28, 0.23] },
  [BLOCK.GEM]: { top: [0.35, 1.0, 0.95], side: [0.2, 0.9, 0.85], bottom: [0.15, 0.7, 0.65] },
};

export function isSolid(id) {
  return id !== BLOCK.AIR && id !== BLOCK.WATER;
}

export function isOpaque(id) {
  return id !== BLOCK.AIR && id !== BLOCK.WATER;
}

export function blockIndex(x, y, z) {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.dirty = true;
  }

  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    return this.blocks[blockIndex(x, y, z)];
  }

  set(x, y, z, id) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return;
    this.blocks[blockIndex(x, y, z)] = id;
    this.dirty = true;
  }
}

export class World {
  constructor(seed = 1337) {
    this.seed = seed;
    this.chunks = new Map();
  }

  static key(cx, cz) {
    return `${cx},${cz}`;
  }

  chunkAt(cx, cz, generate = true) {
    const key = World.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && generate) {
      chunk = new Chunk(cx, cz);
      this.generate(chunk);
      this.chunks.set(key, chunk);
      // neighbours must re-mesh because face culling looks across chunk borders
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.chunks.get(World.key(cx + dx, cz + dz));
        if (n) n.dirty = true;
      }
    }
    return chunk ?? null;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunkAt(cx, cz, false);
    if (!chunk) return BLOCK.AIR;
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunkAt(cx, cz, true);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.set(lx, y, lz, id);
    // a block on a chunk edge changes the neighbour's visible faces too
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  markDirty(cx, cz) {
    const chunk = this.chunks.get(World.key(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  /** Terrain height (top solid block y) at world x, z. */
  heightAt(x, z) {
    const base = fbm(x, z, { octaves: 5, scale: 48, seed: this.seed });
    const ridges = fbm(x + 1000, z - 1000, { octaves: 3, scale: 120, seed: this.seed + 7 });
    const h = SEA_LEVEL - 18 + base * 36 + ridges * ridges * 26;
    return Math.max(1, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));
  }

  /** Fills a chunk with terrain: stone, dirt, grass/sand, water and trees. */
  generate(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const h = this.heightAt(ox + x, oz + z);
        heights[z * CHUNK_SIZE + x] = h;
        for (let y = 0; y <= h; y++) {
          let id = BLOCK.STONE;
          if (y === h) id = h <= SEA_LEVEL + 1 ? BLOCK.SAND : BLOCK.GRASS;
          else if (y > h - 4) id = h <= SEA_LEVEL + 1 ? BLOCK.SAND : BLOCK.DIRT;
          chunk.blocks[blockIndex(x, y, z)] = id;
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          chunk.blocks[blockIndex(x, y, z)] = BLOCK.WATER;
        }
      }
    }
    // trees: placed on grass where a hash says so, kept 2 blocks from chunk edges
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      for (let x = 2; x < CHUNK_SIZE - 2; x++) {
        const h = heights[z * CHUNK_SIZE + x];
        if (h <= SEA_LEVEL + 1 || h + 7 >= CHUNK_HEIGHT) continue;
        const r = valueNoise((ox + x) * 7.13, (oz + z) * 3.71, this.seed + 99);
        if (r < 0.965) continue;
        const trunk = 4 + Math.floor(r * 100) % 3;
        for (let y = 1; y <= trunk; y++) chunk.blocks[blockIndex(x, h + y, z)] = BLOCK.WOOD;
        for (let dy = -2; dy <= 1; dy++) {
          const radius = dy === 1 ? 1 : 2;
          for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx === 0 && dz === 0 && dy <= 0) continue;
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy !== 0) continue;
              const idx = blockIndex(x + dx, h + trunk + dy, z + dz);
              if (chunk.blocks[idx] === BLOCK.AIR) chunk.blocks[idx] = BLOCK.LEAVES;
            }
          }
        }
        chunk.blocks[blockIndex(x, h + trunk + 1, z)] = BLOCK.LEAVES;
      }
    }
    chunk.dirty = true;
  }
}
