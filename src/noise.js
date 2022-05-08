// Deterministic 2D value noise with fractal (fBm) layering.
// Used for terrain heightmaps; seeded so worlds are reproducible.

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0, 1)
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Value noise in [0, 1) at continuous coordinates. */
export function valueNoise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

/** Fractal Brownian motion: sum of octaves with decreasing amplitude. Returns [0, 1). */
export function fbm(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0, scale = 1 } = {}) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x / scale;
  let fy = y / scale;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy, seed + i * 101) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}
